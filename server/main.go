package main

import (
	"dltfm/server/gateway"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func setEnvironmentVariables() error {
	projectRoot := filepath.Join("..") // Go up one directory from server

	envVars := map[string]string{
		"PATH":                        fmt.Sprintf("%s:%s/fabric-samples/bin", os.Getenv("PATH"), projectRoot),
		"FABRIC_CFG_PATH":             filepath.Join(projectRoot, "fabric-samples/config"),
		"CORE_PEER_TLS_ENABLED":       "true",
		"CORE_PEER_LOCALMSPID":        "Org1MSP",
		"CORE_PEER_TLS_ROOTCERT_FILE": filepath.Join(projectRoot, "fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"),
		"CORE_PEER_MSPCONFIGPATH":     filepath.Join(projectRoot, "fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"),
		"CORE_PEER_ADDRESS":           "localhost:7051",
	}

	for key, value := range envVars {
		if err := os.Setenv(key, value); err != nil {
			return fmt.Errorf("failed to set %s: %w", key, err)
		}
	}

	return nil
}

func main() {
	//Set environment variables before connecting to gateway
	if err := setEnvironmentVariables(); err != nil {
		log.Fatalf("Failed to set environment variables: %v", err)
	}
	// Connect to gateway
	gw, err := gateway.Connect()
	if err != nil {
		log.Fatalf("Failed to connect to gateway: %v", err)
	}
	defer gw.Close()

	network := gw.GetNetwork("mychannel")
	contract := network.GetContract("chaincode")

	// Debug output to verify network and contract references
	fmt.Println("DEBUG: Successfully retrieved network and contract references")

	// // Test invocation
	// fmt.Println("\n=== Testing QueryAllFiles invocation ===")
	// result, err := contract.EvaluateTransaction("QueryAllFiles")
	// if err != nil {
	// 	log.Fatalf("Chaincode invocation failed: %v", err)
	// }
	// fmt.Printf("Chaincode output: %s\n", string(result))
	// fmt.Println("=== Test complete ===")

	r := gin.Default()
	r.Use(cors.Default())

	api := r.Group("/api")
	{
		// Query all files - matches QueryAllFiles handler
		api.GET("/files", func(c *gin.Context) {
			// fmt.Printf("\nNew request at: %s\n", time.Now().Format(time.RFC3339))
			// fmt.Printf("Request Headers: %+v\n", c.Request.Header)

			fmt.Println("Evaluating QueryAllFiles transaction...")
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

			fmt.Printf("Successfully retrieved %d files\n", len(files))
			c.JSON(http.StatusOK, files)
		})

		// Register file - matches RegisterFile handler
		api.POST("/files", func(c *gin.Context) {
			var request struct {
				Name     string `json:"name"`
				Content  string `json:"content"`
				Owner    string `json:"owner"`
				Metadata string `json:"metadata"`
			}

			if err := c.BindJSON(&request); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
				return
			}

			// Using same ID generation logic as in RegisterFile handler
			id := fmt.Sprintf("file_%d", time.Now().UnixNano())

			// Debug output matching handler
			fmt.Printf("DEBUG: RegisterFile called with id=%s, name=%s\n", id, request.Name)

			_, err := contract.SubmitTransaction("RegisterFile",
				id,
				request.Name,
				request.Content,
				request.Owner,
				request.Metadata,
			)

			if err != nil {
				log.Printf("ERROR: Failed to register file: %v\n", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to register file: %v", err)})
				return
			}

			// Verify the transaction like in handler
			file, err := contract.EvaluateTransaction("GetFileByID", id)
			if err != nil {
				log.Printf("ERROR: Failed to verify file registration: %v\n", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify file registration"})
				return
			}

			fmt.Printf("DEBUG: Verified saved data: %s\n", string(file))
			c.JSON(http.StatusOK, gin.H{"message": "File successfully registered", "id": id})
		})

	}

	log.Println("Starting server on :8080...")
	if err := r.Run(":8080"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
