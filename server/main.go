package main

import (
	"crypto/sha256"
	"dltfm/server/gateway"
	"dltfm/server/middleware"
	"dltfm/server/supabase"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

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

		// Register a new file
		api.POST("/files", func(c *gin.Context) {
			userID := c.GetString("userID")
			mspID := c.GetString("mspID")
			org := c.MustGet("organization").(*supabase.Organization)

			fmt.Printf("Upload request from user: %s, organization: %s (MSP: %s)\n", userID, org.Name, mspID)

			var request struct {
				ID                string `json:"id"`
				Name              string `json:"name"`
				Content           string `json:"content"`
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

			fmt.Printf("DEBUG: RegisterFile called with id=%s, name=%s, org=%s, previousID=%s, endorsementConfig=%s\n",
				request.ID, request.Name, org.Name, request.PreviousID, string(endorsementConfigJSON))

			_, err = contract.SubmitTransaction("RegisterFile",
				request.ID,
				request.Name,
				request.Content,
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
