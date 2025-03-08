package main

import (
	"crypto/sha256"
	"dltfm/server/gateway"
	"dltfm/server/ipfs"
	"dltfm/server/middleware"
	"dltfm/server/supabase"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	// "os"
	// "path/filepath"
	"sync"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/hyperledger/fabric-gateway/pkg/client"
)

type GatewayManager struct {
	gateways map[string]*client.Gateway
	mu       sync.RWMutex
}

func NewGatewayManager() *GatewayManager {
	return &GatewayManager{
		gateways: make(map[string]*client.Gateway),
	}
}

func (gm *GatewayManager) GetGateway(mspID string) (*client.Gateway, error) {
	gm.mu.RLock()
	gw, exists := gm.gateways[mspID]
	gm.mu.RUnlock()

	if exists {
		return gw, nil
	}

	gm.mu.Lock()
	defer gm.mu.Unlock()

	// Check again in case another goroutine created the gateway
	if gw, exists = gm.gateways[mspID]; exists {
		return gw, nil
	}

	// Create new gateway connection
	gw, err := gateway.Connect(mspID)
	if err != nil {
		return nil, err
	}

	gm.gateways[mspID] = gw
	return gw, nil
}

func (gm *GatewayManager) Close() {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	for _, gw := range gm.gateways {
		gw.Close()
	}
}

// Generate a unique file ID based on name and timestamp
func GenerateFileID(name string, timestamp string) string {
	data := fmt.Sprintf("%s_%s", name, timestamp)
	hash := sha256.Sum256([]byte(data))
	return fmt.Sprintf("%x", hash[:8]) // Take first 8 bytes
}

func main() {
	// Initialize Supabase Client
	supabaseClient, err := supabase.NewClient()
	if err != nil {
		log.Fatalf("Failed to create Supabase client: %v", err)
	}

	// Create gateway manager
	gatewayManager := NewGatewayManager()
	defer gatewayManager.Close()

	r := gin.Default()

	// Update CORS configuration to allow Organization headers
	config := cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Organization-ID", "X-MSP-ID"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	r.Use(cors.New(config))

	// Public routes
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api")
	api.Use(middleware.AuthRequired(supabaseClient))
	{
		// Fetch all files
		api.GET("/files", func(c *gin.Context) {
			userID := c.GetString("userID")
			mspID := c.GetString("mspID")
			org := c.MustGet("organization").(*supabase.Organization)

			fmt.Printf("Request from user: %s, organization: %s (MSP: %s)\n", userID, org.Name, mspID)

			// Get the appropriate gateway for this organization
			gw, err := gatewayManager.GetGateway(mspID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get gateway: %v", err)})
				return
			}

			network := gw.GetNetwork("mychannel")
			contract := network.GetContract("chaincode")

			result, err := contract.EvaluateTransaction("QueryAllFiles")
			if err != nil {
				fmt.Printf("Error during evaluation: %v\n", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to query files: %v", err)})
				return
			}

			var files []interface{}
			if err := json.Unmarshal(result, &files); err != nil {
				fmt.Printf("Error unmarshaling result: %v\n", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse response"})
				return
			}

			fmt.Printf("Successfully retrieved %d files for org %s\n", len(files), org.Name)
			c.JSON(http.StatusOK, files)
		})

		// Fetch file versions
		api.GET("/files/:id/versions", func(c *gin.Context) {
			userID := c.GetString("userID")
			mspID := c.GetString("mspID")
			org := c.MustGet("organization").(*supabase.Organization)

			fileID := c.Param("id")

			fmt.Printf("Request for file versions: %s, user: %s, org: %s (MSP: %s)\n", fileID, userID, org.Name, mspID)

			// Get the appropriate gateway for this organization
			gw, err := gatewayManager.GetGateway(mspID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get gateway: %v", err)})
				return
			}

			network := gw.GetNetwork("mychannel")
			contract := network.GetContract("chaincode")

			result, err := contract.EvaluateTransaction("GetFileVersions", fileID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to fetch version history: %v", err)})
				return
			}

			c.JSON(http.StatusOK, json.RawMessage(result))
		})

		// Getting audit
		api.GET("/files/:id/audit", func(c *gin.Context) {
			userID := c.GetString("userID")
			mspID := c.GetString("mspID")
			org := c.MustGet("organization").(*supabase.Organization)

			fileID := c.Param("id")

			fmt.Printf("Audit log request for file: %s, user: %s, org: %s\n", fileID, userID, org.Name)

			// Get the appropriate gateway for this organization
			gw, err := gatewayManager.GetGateway(mspID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get gateway: %v", err)})
				return
			}

			network := gw.GetNetwork("mychannel")
			contract := network.GetContract("chaincode")

			result, err := contract.EvaluateTransaction("GetFileAuditLogs", fileID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to fetch audit logs: %v", err)})
				return
			}

			c.JSON(http.StatusOK, json.RawMessage(result))
		})

		// Get file content
		api.GET("/files/:id/content", func(c *gin.Context) {
			userID := c.GetString("userID")
			mspID := c.GetString("mspID")
			org := c.MustGet("organization").(*supabase.Organization)
			fileID := c.Param("id")

			fmt.Printf("Content request for file: %s, user: %s, org: %s\n", fileID, userID, org.Name)
			fmt.Printf("DEBUG: Fetching content for file ID: %s\n", fileID)

			// Get the file metadata from the blockchain
			gw, err := gatewayManager.GetGateway(mspID)
			if err != nil {
				fmt.Printf("DEBUG: Error getting gateway: %v\n", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get gateway: %v", err)})
				return
			}

			network := gw.GetNetwork("mychannel")
			contract := network.GetContract("chaincode")

			fileJSON, err := contract.EvaluateTransaction("GetFileByID", fileID)
			if err != nil {
				fmt.Printf("DEBUG: Error getting file from blockchain: %v\n", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get file: %v", err)})
				return
			}

			fmt.Printf("DEBUG: Got file JSON from blockchain: %s\n", string(fileJSON))

			// Unmarshal into a struct that includes Metadata
			var file struct {
				IPFSLocation string `json:"ipfsLocation"`
				Name         string `json:"name"`
				Metadata     string `json:"metadata"`
			}

			if err := json.Unmarshal(fileJSON, &file); err != nil {
				fmt.Printf("DEBUG: JSON unmarshal error: %v for JSON: %s\n", err, string(fileJSON))
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse file data"})
				return
			}

			fmt.Printf("DEBUG: Parsed file data - IPFS CID: %s, Name: %s\n", file.IPFSLocation, file.Name)

			// Define a struct to parse the metadata JSON
			type FileMetadata struct {
				Size      int64  `json:"size"`
				Type      string `json:"type"`
				CreatedAt string `json:"createdAt"`
				Encoding  string `json:"encoding"`
			}

			// Unmarshal the metadata from the file
			var meta FileMetadata
			if err := json.Unmarshal([]byte(file.Metadata), &meta); err != nil {
				fmt.Printf("DEBUG: Error parsing metadata: %v for metadata: %s\n", err, file.Metadata)
				// Fallback if metadata cannot be parsed
				meta.Type = "application/octet-stream"
			} else {
				fmt.Printf("DEBUG: Parsed metadata - Type: %s, Size: %d\n", meta.Type, meta.Size)
			}

			// Get the content from IPFS
			fmt.Printf("DEBUG: About to retrieve content from IPFS with CID: %s\n", file.IPFSLocation)
			ipfsClient := ipfs.NewIPFSClient("localhost:5001", false)
			content, err := ipfsClient.GetFile(file.IPFSLocation)
			if err != nil {
				fmt.Printf("DEBUG: IPFS retrieval error: %v\n", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to retrieve file content: %v", err)})
				return
			}
			fmt.Printf("DEBUG: Successfully retrieved %d bytes from IPFS\n", len(content))

			// Determine Content-Type from metadata and set disposition accordingly
			contentType := meta.Type
			if contentType == "" {
				contentType = "application/octet-stream"
			}

			// Default to attachment, but render inline for PDFs or images
			disposition := "attachment"
			if contentType == "application/pdf" || strings.HasPrefix(contentType, "image/") {
				disposition = "inline"
			}

			fmt.Printf("DEBUG: Sending response with Content-Type: %s, Disposition: %s\n", contentType, disposition)
			c.Header("Content-Disposition", fmt.Sprintf("%s; filename=\"%s\"", disposition, file.Name))
			c.Header("Content-Type", contentType) // Make sure this is set
			c.Data(http.StatusOK, contentType, content)
		})

		// Register a new file
		api.POST("/files", func(c *gin.Context) {
			userID := c.GetString("userID")
			mspID := c.GetString("mspID")
			org := c.MustGet("organization").(*supabase.Organization)

			fmt.Printf("Upload request from user: %s, organization: %s (MSP: %s)\n", userID, org.Name, mspID)

			var request struct {
				ID                string `json:"id"`
				Name              string `json:"name"`
				Content           string `json:"content"` // This will be base64 content from client
				Owner             string `json:"owner"`
				Metadata          string `json:"metadata"`
				PreviousID        string `json:"previousID"`
				EndorsementConfig struct {
					PolicyType   string   `json:"policyType"`
					RequiredOrgs []string `json:"requiredOrgs"`
				} `json:"endorsementConfig"`
			}

			if err := c.BindJSON(&request); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
				return
			}

			// Decode base64 content
			contentBytes, err := base64.StdEncoding.DecodeString(request.Content)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file content"})
				return
			}

			// Upload to IPFS
			ipfsClient := ipfs.NewIPFSClient("localhost:5001", false)
			ipfsCID, err := ipfsClient.AddFile(contentBytes)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": fmt.Sprintf("failed to store file: %v", err),
				})
				return
			}

			// Get the appropriate gateway for this organization
			gw, err := gatewayManager.GetGateway(mspID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": fmt.Sprintf("failed to get gateway: %v", err),
				})
				return
			}

			network := gw.GetNetwork("mychannel")
			contract := network.GetContract("chaincode")

			// Convert endorsement config to JSON string
			endorsementConfigJSON, err := json.Marshal(request.EndorsementConfig)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": fmt.Sprintf("failed to marshal endorsement config: %v", err),
				})
				return
			}

			// Now pass IPFS CID instead of content
			_, err = contract.SubmitTransaction("RegisterFile",
				request.ID,
				request.Name,
				ipfsCID, // Pass IPFS CID instead of content
				org.Name,
				request.Metadata,
				request.PreviousID,
				string(endorsementConfigJSON),
			)

			if err != nil {
				log.Printf("ERROR: Failed to register file: %v\n", err)
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": fmt.Sprintf("failed to register file: %v", err),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"message": "File successfully registered",
				"id":      request.ID,
				"ipfsCID": ipfsCID, // Return the IPFS CID for client reference
			})
		})

		api.POST("/files/:id/approve", func(c *gin.Context) {
			userID := c.GetString("userID")
			mspID := c.GetString("mspID")
			org := c.MustGet("organization").(*supabase.Organization)
			fileID := c.Param("id")

			fmt.Printf("Approval request for file %s from user: %s, organization: %s (MSP: %s)\n",
				fileID, userID, org.Name, mspID)

			// Get the appropriate gateway for this organization
			gw, err := gatewayManager.GetGateway(mspID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": fmt.Sprintf("failed to get gateway: %v", err),
				})
				return
			}

			network := gw.GetNetwork("mychannel")
			contract := network.GetContract("chaincode")

			_, err = contract.SubmitTransaction("ApproveFile", fileID)
			if err != nil {
				log.Printf("ERROR: Failed to approve file: %v\n", err)
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": fmt.Sprintf("failed to approve file: %v", err),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"message": "File successfully approved",
				"id":      fileID,
			})
		})

	}

	log.Println("Starting server on :8080...")
	if err := r.Run(":8080"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
