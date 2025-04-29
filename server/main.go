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

	"context"
	"sync"
	"time"

	"golang.org/x/sync/semaphore"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/hyperledger/fabric-gateway/pkg/client"
)

type GatewayManager struct {
	gateways            map[string]*client.Gateway
	mu                  sync.RWMutex
	connectionSemaphore *semaphore.Weighted
}

type UploadTask struct {
	content    []byte
	resultChan chan string
	errorChan  chan error
}

type ChaincodeTxRequest struct {
	function   string
	args       []string
	resultChan chan string
	errorChan  chan error
}

func NewGatewayManager(maxConcurrentConnections int64) *GatewayManager {
	return &GatewayManager{
		gateways:            make(map[string]*client.Gateway),
		connectionSemaphore: semaphore.NewWeighted(maxConcurrentConnections),
	}
}

func startChaincodeWorkerPool(workerCount int, gatewayManager *GatewayManager) (chan<- ChaincodeTxRequest, func()) {
	taskQueue := make(chan ChaincodeTxRequest)

	var wg sync.WaitGroup
	wg.Add(workerCount)

	for i := 0; i < workerCount; i++ {
		go func(workerId int) {
			defer wg.Done()

			for task := range taskQueue {
				// Get MSP from request context or use a default
				mspID := "Org1MSP"

				// Get gateway connection
				gw, err := gatewayManager.GetGateway(mspID)
				if err != nil {
					task.errorChan <- fmt.Errorf("failed to get gateway: %w", err)
					continue
				}

				// Execute transaction
				network := gw.GetNetwork("mychannel")
				contract := network.GetContract("chaincode")

				result, err := contract.SubmitTransaction(task.function, task.args...)
				if err != nil {
					task.errorChan <- fmt.Errorf("transaction failed: %w", err)
				} else {
					task.resultChan <- string(result)
				}
			}
		}(i)
	}

	cleanup := func() {
		close(taskQueue)
		wg.Wait()
	}

	return taskQueue, cleanup
}

func startIPFSWorkerPool(workerCount int, ipfsClient *ipfs.IPFSClient) (chan<- UploadTask, func()) {
	taskQueue := make(chan UploadTask)

	var wg sync.WaitGroup
	wg.Add(workerCount)

	// Start worker goroutines
	for i := 0; i < workerCount; i++ {
		go func() {
			defer wg.Done()

			for task := range taskQueue {
				var cid string
				var err error

				// Use chunking for files larger than 1MB
				if len(task.content) > 1*1024*1024 { // 1MB threshold
					cid, err = ipfsClient.AddLargeFile(task.content)
				} else {
					cid, err = ipfsClient.AddFile(task.content)
				}

				if err != nil {
					task.errorChan <- err
				} else {
					task.resultChan <- cid
				}
			}
		}()
	}

	// Return cleanup function
	cleanup := func() {
		close(taskQueue)
		wg.Wait()
	}

	return taskQueue, cleanup
}

func (gm *GatewayManager) GetGateway(mspID string) (*client.Gateway, error) {
	// First check if gateway exists without locking for writes
	gm.mu.RLock()
	gw, exists := gm.gateways[mspID]
	gm.mu.RUnlock()

	if exists {
		return gw, nil
	}

	// Acquire semaphore to limit concurrent gateway creation
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	err := gm.connectionSemaphore.Acquire(ctx, 1)
	if err != nil {
		return nil, fmt.Errorf("timed out waiting for gateway connection: %w", err)
	}
	defer gm.connectionSemaphore.Release(1)

	// Lock for potential creation
	gm.mu.Lock()
	defer gm.mu.Unlock()

	// Check again after acquiring lock
	if gw, exists = gm.gateways[mspID]; exists {
		return gw, nil
	}

	// Create new gateway connection
	gw, err = gateway.Connect(mspID)
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

const (
	MAX_CONCURRENT_GATEWAY_CONNECTIONS = 20
	MAX_CONCURRENT_IPFS_OPERATIONS     = 30
	IPFS_WORKER_COUNT                  = 10
	CHAINCODE_TX_WORKERS               = 10
	BLOCKCHAIN_TX_TIMEOUT              = 60 * time.Second
	IPFS_UPLOAD_TIMEOUT                = 60 * time.Second
	IPFS_GET_TIMEOUT                   = 30 * time.Second
)

func main() {
	// Initialize Supabase Client
	supabaseClient, err := supabase.NewClient()
	if err != nil {
		log.Fatalf("Failed to create Supabase client: %v", err)
	}

	// Create gateway manager
	gatewayManager := NewGatewayManager(20) // Allow up to 20 concurrent connections
	defer gatewayManager.Close()

	// Create IPFS client with optimized settings
	ipfsClient := ipfs.NewIPFSClient("localhost:5001", false)

	// Start IPFS worker pool with 10 workers
	const ipfsWorkerCount = 10
	ipfsUploadQueue, cleanupWorkers := startIPFSWorkerPool(ipfsWorkerCount, ipfsClient)
	defer cleanupWorkers()

	// Start chaincode worker pool with 10 workers
	const chaincodeTxWorkers = 10 // Tune this based on performance testing
	chaincodeTxQueue, cleanupChaincodeTx := startChaincodeWorkerPool(chaincodeTxWorkers, gatewayManager)
	defer cleanupChaincodeTx()

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

			// Use the worker pool for IPFS upload
			resultChan := make(chan string, 1)
			errorChan := make(chan error, 1)

			// Submit task to worker pool
			ipfsUploadQueue <- UploadTask{
				content:    contentBytes,
				resultChan: resultChan,
				errorChan:  errorChan,
			}

			// Wait for result with timeout
			var ipfsCID string
			select {
			case ipfsCID = <-resultChan:
				fmt.Printf("Successfully uploaded to IPFS with CID: %s\n", ipfsCID)
			case err := <-errorChan:
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": fmt.Sprintf("failed to store file: %v", err),
				})
				return
			case <-time.After(60 * time.Second): // 1 minute timeout
				c.JSON(http.StatusRequestTimeout, gin.H{
					"error": "IPFS upload timed out",
				})
				return
			}

			// Convert endorsement config to JSON string
			endorsementConfigJSON, err := json.Marshal(request.EndorsementConfig)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": fmt.Sprintf("failed to marshal endorsement config: %v", err),
				})
				return
			}

			// Create channels for the result
			txResultChan := make(chan string, 1)
			txErrorChan := make(chan error, 1)

			// Submit transaction request to worker pool
			chaincodeTxQueue <- ChaincodeTxRequest{
				function: "RegisterFile",
				args: []string{
					request.ID,
					request.Name,
					ipfsCID, // IPFS CID from earlier
					org.Name,
					request.Metadata,
					request.PreviousID,
					string(endorsementConfigJSON),
				},
				resultChan: txResultChan,
				errorChan:  txErrorChan,
			}

			// Wait for result with timeout
			select {
			case result := <-txResultChan:
				// Transaction successful
				c.JSON(http.StatusOK, gin.H{
					"message": "File successfully registered",
					"id":      request.ID,
					"ipfsCID": ipfsCID,
					"result":  result,
				})
			case err := <-txErrorChan:
				log.Printf("ERROR: Failed to register file: %v\n", err)
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": fmt.Sprintf("failed to register file: %v", err),
				})
			case <-time.After(60 * time.Second): // 1 minute timeout for blockchain transaction
				c.JSON(http.StatusRequestTimeout, gin.H{
					"error": "Blockchain transaction timed out",
				})
			}
		})

		api.POST("/files/batch", func(c *gin.Context) {
			// userID := c.GetString("userID")
			mspID := c.GetString("mspID")
			org := c.MustGet("organization").(*supabase.Organization)

			var batchRequest struct {
				Files []struct {
					ID                string `json:"id"`
					Name              string `json:"name"`
					Content           string `json:"content"` // base64 encoded
					Owner             string `json:"owner"`
					Metadata          string `json:"metadata"`
					PreviousID        string `json:"previousID"`
					EndorsementConfig struct {
						PolicyType   string   `json:"policyType"`
						RequiredOrgs []string `json:"requiredOrgs"`
					} `json:"endorsementConfig"`
				} `json:"files"`
			}

			if err := c.BindJSON(&batchRequest); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid batch request format"})
				return
			}

			// Process files in parallel using a worker pool
			var wg sync.WaitGroup
			resultsChan := make(chan map[string]interface{}, len(batchRequest.Files))

			// Limit concurrent IPFS uploads
			semaphore := make(chan struct{}, 10) // Process up to 10 files concurrently

			for i, fileRequest := range batchRequest.Files {
				wg.Add(1)
				go func(idx int, req struct {
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
				}) {
					defer wg.Done()

					// Acquire semaphore
					semaphore <- struct{}{}
					defer func() { <-semaphore }()

					result := map[string]interface{}{
						"id":     req.ID,
						"status": "failed",
					}

					// Decode content
					contentBytes, err := base64.StdEncoding.DecodeString(req.Content)
					if err != nil {
						result["error"] = "Invalid file content encoding"
						resultsChan <- result
						return
					}

					// Upload to IPFS via the worker pool
					ipfsResultChan := make(chan string, 1)
					ipfsErrorChan := make(chan error, 1)

					ipfsUploadQueue <- UploadTask{
						content:    contentBytes,
						resultChan: ipfsResultChan,
						errorChan:  ipfsErrorChan,
					}

					var ipfsCID string
					select {
					case ipfsCID = <-ipfsResultChan:
						// IPFS upload successful
					case err := <-ipfsErrorChan:
						result["error"] = fmt.Sprintf("IPFS upload failed: %v", err)
						resultsChan <- result
						return
					case <-time.After(60 * time.Second):
						result["error"] = "IPFS upload timed out"
						resultsChan <- result
						return
					}

					// Store CID in result
					result["ipfsCID"] = ipfsCID

					// Successfully uploaded to IPFS
					result["status"] = "success"
					resultsChan <- result
				}(i, fileRequest)
			}

			// Close results channel when all goroutines are done
			go func() {
				wg.Wait()
				close(resultsChan)
			}()

			// Collect results
			var results []map[string]interface{}
			for result := range resultsChan {
				results = append(results, result)
			}

			// Now that we have all files uploaded to IPFS -> we can register them to the blockchain
			if len(results) > 0 {
				batchItems := make([]map[string]interface{}, 0)

				for _, result := range results {
					if result["status"] == "success" {
						// Find the original request
						var fileRequest struct {
							ID                string
							Name              string
							Owner             string
							Metadata          string
							PreviousID        string
							EndorsementConfig struct {
								PolicyType   string
								RequiredOrgs []string
							}
						}

						for _, req := range batchRequest.Files {
							if req.ID == result["id"] {
								fileRequest.ID = req.ID
								fileRequest.Name = req.Name
								fileRequest.Owner = req.Owner
								fileRequest.Metadata = req.Metadata
								fileRequest.PreviousID = req.PreviousID

								// Manually copy the fields instead of the entire struct
								fileRequest.EndorsementConfig.PolicyType = req.EndorsementConfig.PolicyType
								fileRequest.EndorsementConfig.RequiredOrgs = req.EndorsementConfig.RequiredOrgs
								break
							}
						}

						// Add to batch items
						endorsementConfigJSON, _ := json.Marshal(fileRequest.EndorsementConfig)

						batchItems = append(batchItems, map[string]interface{}{
							"id":                fileRequest.ID,
							"name":              fileRequest.Name,
							"ipfsCID":           result["ipfsCID"],
							"owner":             org.Name,
							"metadata":          fileRequest.Metadata,
							"previousID":        fileRequest.PreviousID,
							"endorsementConfig": string(endorsementConfigJSON),
						})
					}
				}

				if len(batchItems) > 0 {
					// Convert batch to JSON
					batchJSON, err := json.Marshal(batchItems)
					if err != nil {
						c.JSON(http.StatusInternalServerError, gin.H{
							"error":   "Failed to prepare batch transaction",
							"results": results,
						})
						return
					}

					// Submit batch transaction
					gw, err := gatewayManager.GetGateway(mspID)
					if err != nil {
						c.JSON(http.StatusInternalServerError, gin.H{
							"error":   fmt.Sprintf("Failed to get gateway: %v", err),
							"results": results,
						})
						return
					}

					network := gw.GetNetwork("mychannel")
					contract := network.GetContract("chaincode")

					_, err = contract.SubmitTransaction("BatchRegisterFiles", string(batchJSON))
					if err != nil {
						c.JSON(http.StatusInternalServerError, gin.H{
							"error":   fmt.Sprintf("Batch registration failed: %v", err),
							"results": results,
						})
						return
					}

					// Update results with final status
					for i, result := range results {
						if result["status"] == "success" {
							results[i]["blockchainStatus"] = "registered"
						}
					}
				}
			}

			c.JSON(http.StatusOK, gin.H{
				"message": "Batch processing completed",
				"results": results,
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

	server := &http.Server{
		Addr:         ":8080",
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Println("Starting server on :8080...")
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Failed to start server: %v", err)
	}
}
