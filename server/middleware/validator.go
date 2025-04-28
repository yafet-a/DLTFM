package middleware

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/hyperledger/fabric-gateway/pkg/client"
)

type GatewayManagerInterface interface {
	GetGateway(string) (*client.Gateway, error)
}

// StructuralValidator validates the basic structure of requests
func StructuralValidator() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Only apply to POST and PUT requests
		if c.Request.Method != "POST" && c.Request.Method != "PUT" {
			c.Next()
			return
		}

		// Check for required headers
		if c.Request.Header.Get("Content-Type") != "application/json" {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error":   "Invalid content type",
				"details": "Content-Type must be application/json",
			})
			return
		}

		// Continue to next middleware
		c.Next()
	}
}

// FieldValidator validates field-level constraints
func FieldValidator() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Only apply to file creation/update endpoints
		if !isFileEndpoint(c.Request.URL.Path) {
			c.Next()
			return
		}

		// For file operations, ensure required fields exist
		bodyBytes, err := c.GetRawData()
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error":   "Failed to read request body",
				"details": err.Error(),
			})
			return
		}

		// Create a new reader with the same bytes to restore the body
		c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

		var req map[string]interface{}
		if err := json.Unmarshal(bodyBytes, &req); err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error":   "Invalid request format",
				"details": err.Error(),
			})
			return
		}

		// Check required fields
		requiredFields := []string{"id", "name"}
		for _, field := range requiredFields {
			if _, exists := req[field]; !exists || req[field] == "" {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
					"error":   "Missing required field",
					"details": "Field '" + field + "' is required",
				})
				return
			}
		}

		// Store parsed request for later middlewares
		c.Set("parsedRequest", req)
		c.Next()
	}
}

// ContentValidator validates the content of the request
func ContentValidator() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Only apply to file upload endpoints
		if !isFileUploadEndpoint(c.Request.URL.Path) {
			c.Next()
			return
		}

		// Read and restore the request body
		bodyBytes, err := c.GetRawData()
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error":   "Failed to read request body",
				"details": err.Error(),
			})
			return
		}

		// Restore the request body for subsequent reads
		c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

		var req map[string]interface{}
		if err := json.Unmarshal(bodyBytes, &req); err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error":   "Invalid request format",
				"details": err.Error(),
			})
			return
		}

		// Check for content field
		if content, exists := req["content"].(string); !exists || content == "" {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error":   "Invalid file content",
				"details": "File content is required",
			})
			return
		}

		// Store parsed request for later middlewares
		c.Set("parsedRequest", req)
		c.Next()
	}
}

// BusinessRuleValidator performs more complex validations that may require blockchain queries
func BusinessRuleValidator() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Only apply to file operations with a previous ID
		if !isFileEndpoint(c.Request.URL.Path) {
			c.Next()
			return
		}

		// Get parsed request from previous middleware
		req, exists := c.Get("parsedRequest")
		if !exists {
			c.Next()
			return
		}

		parsedReq := req.(map[string]interface{})
		previousID, hasPrevious := parsedReq["previousID"].(string)

		if !hasPrevious || previousID == "" {
			c.Next() // No previous version to validate
			return
		}

		// Get required context from auth middleware
		mspID := c.GetString("mspID")
		if mspID == "" {
			c.Next() // Skip if no MSP ID
			return
		}

		// Get the gateway manager from context
		gatewayManagerInterface, exists := c.Get("gatewayManager")
		if !exists {
			fmt.Println("Warning: No gateway manager found in context")
			c.Next() // Skip if no gateway manager
			return
		}

		// Convert to the expected type using assertion
		gatewayManager, ok := gatewayManagerInterface.(GatewayManagerInterface)
		if !ok {
			fmt.Printf("Warning: Unexpected gateway manager type: %T\n", gatewayManagerInterface)
			c.Next() // Skip validation but continue
			return
		}

		// Get gateway for this MSP
		gw, err := gatewayManager.GetGateway(mspID)
		if err != nil {
			fmt.Printf("Error getting gateway for MSP %s: %v\n", mspID, err)
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error":   "Failed to connect to blockchain",
				"details": err.Error(),
			})
			return
		}

		// Access blockchain network
		network := gw.GetNetwork("mychannel")
		contract := network.GetContract("chaincode")

		// Pre-emptively query the blockchain to check if previous version exists
		fmt.Printf("Validating previous file ID: %s\n", previousID)
		prevFileBytes, err := contract.EvaluateTransaction("GetFileByID", previousID)
		if err != nil {
			fmt.Printf("Error querying previous file: %v\n", err)
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error":   "Invalid previous version reference",
				"details": "The specified previous version does not exist or is not accessible",
			})
			return
		}

		if len(prevFileBytes) == 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error":   "Invalid previous version reference",
				"details": "No data found for the specified previous version",
			})
			return
		}

		// Parse previous file data
		var prevFile struct {
			ID               string   `json:"id"`
			Name             string   `json:"name"`
			Hash             string   `json:"hash"`
			Version          int      `json:"version"`
			CurrentApprovals []string `json:"currentApprovals"`
			RequiredOrgs     []string `json:"requiredOrgs"`
			Status           string   `json:"status"`
			Owner            string   `json:"owner"`
		}

		if err := json.Unmarshal(prevFileBytes, &prevFile); err != nil {
			fmt.Printf("Error parsing previous file data: %v\n", err)
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error":   "Failed to parse previous version data",
				"details": "The previous version exists but could not be properly validated",
			})
			return
		}

		// Validate organization access rights for prevention of phantom reads
		// This simulates the read set that would be used during endorsement
		if !containsOrg(prevFile.CurrentApprovals, mspID) &&
			!containsOrg(prevFile.RequiredOrgs, mspID) {
			fmt.Printf("Access denied for MSP %s to file %s\n", mspID, prevFile.ID)
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":   "Potential endorsement failure detected",
				"details": "Your organization does not have access rights to the referenced version",
			})
			return
		}

		// Check if file is in an approved state for updates
		if prevFile.Status != "APPROVED" {
			fmt.Printf("Previous file %s is not in APPROVED state: %s\n", prevFile.ID, prevFile.Status)
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error":   "Invalid previous version state",
				"details": "The previous version must be in APPROVED state to create a new version",
			})
			return
		}

		// Check version consistency
		newVersion, hasVersionField := parsedReq["version"].(float64)
		if hasVersionField && int(newVersion) != prevFile.Version+1 {
			fmt.Printf("Version mismatch: expected %d, got %d\n", prevFile.Version+1, int(newVersion))
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error": "Version conflict",
				"details": fmt.Sprintf("The new version must be %d (current version is %d)",
					prevFile.Version+1, prevFile.Version),
			})
			return
		}

		// Preemptively detect conflicts with other transactions
		pendingVersions, err := contract.EvaluateTransaction("GetPendingVersionsForFile", prevFile.ID)
		if err == nil && len(pendingVersions) > 0 {
			var pending []map[string]interface{}
			if json.Unmarshal(pendingVersions, &pending) == nil && len(pending) > 0 {
				fmt.Printf("Detected %d pending versions for file %s\n", len(pending), prevFile.ID)
				c.AbortWithStatusJSON(http.StatusConflict, gin.H{
					"error":   "Version conflict detected",
					"details": "Another user is currently creating a new version of this file",
				})
				return
			}
		}

		// All validations passed, store the previous file info for the handler
		fmt.Printf("Validation passed for previous file %s (version %d)\n",
			prevFile.ID, prevFile.Version)

		// Store full previous file details for the handler
		c.Set("previousVersion", prevFile)
		c.Next()
	}
}

// Helper functions
func isFileEndpoint(path string) bool {
	return path == "/api/files" || path == "/api/files/"
}

func isFileUploadEndpoint(path string) bool {
	return path == "/api/files" || path == "/api/files/"
}

func containsOrg(orgs []string, orgID string) bool {
	for _, org := range orgs {
		if org == orgID {
			return true
		}
	}
	return false
}
