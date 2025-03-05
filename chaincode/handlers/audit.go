package handlers

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// Records an action performed on a file
func CreateAuditLog(ctx contractapi.TransactionContextInterface, fileID string, action string, details string) error {
	// Get the MSP ID of the submitter
	mspID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get MSP ID: %v", err)
	}

	// Try to get the submitting client's ID
	id, err := ctx.GetClientIdentity().GetID()
	if err != nil {
		// If we can't get the exact ID, just use a placeholder
		id = "unknown"
	}

	// Create the audit log entry
	log := struct {
		FileID    string `json:"fileId"`
		Action    string `json:"action"`
		Timestamp string `json:"timestamp"`
		UserID    string `json:"userId"`
		OrgID     string `json:"orgId"`
		Details   string `json:"details,omitempty"`
	}{
		FileID:    fileID,
		Action:    action,
		Timestamp: time.Now().Format(time.RFC3339),
		UserID:    id,
		OrgID:     mspID,
		Details:   details,
	}

	logJSON, err := json.Marshal(log)
	if err != nil {
		return fmt.Errorf("failed to marshal audit log: %v", err)
	}

	// Create a composite key for the audit log
	// Format: audit~fileId~timestamp to allow querying logs by file
	timestamp := time.Now().UnixNano()
	logKey, err := ctx.GetStub().CreateCompositeKey("audit", []string{fileID, fmt.Sprintf("%d", timestamp)})
	if err != nil {
		return fmt.Errorf("failed to create composite key: %v", err)
	}

	return ctx.GetStub().PutState(logKey, logJSON)
}
