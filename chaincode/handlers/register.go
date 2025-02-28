package handlers

import (
	"encoding/json"
	"fmt"
	"time"

	"dltfm/chaincode/utils"
	"dltfm/pkg/models"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type EndorsementConfig struct {
	RequiredOrgs []string `json:"requiredOrgs"`
	PolicyType   string   `json:"policyType"`
}

func RegisterFile(ctx contractapi.TransactionContextInterface, id string, name string, content string, owner string, metadata string, previousID string, endorsementConfig string) error {
	fmt.Printf("DEBUG: RegisterFile called with id=%s, name=%s\n", id, name)

	// Parse endorsement config
	var config EndorsementConfig
	if err := json.Unmarshal([]byte(endorsementConfig), &config); err != nil {
		return fmt.Errorf("invalid endorsement config: %v", err)
	}

	// Validate policy type
	if config.PolicyType != "ANY_ORG" && config.PolicyType != "ALL_ORGS" && config.PolicyType != "SPECIFIC_ORGS" {
		return fmt.Errorf("invalid policy type: %s", config.PolicyType)
	}

	// Compute hash for integrity verification
	hash := utils.ComputeHash(content)
	fmt.Printf("DEBUG: Computed hash: %s\n", hash)

	var newVersion int
	timestamp := time.Now().Format(time.RFC3339)

	if previousID != "" {
		// Fetch the previous version
		existingFileJSON, err := GetFileByID(ctx, previousID)
		if err != nil {
			return fmt.Errorf("error fetching previous file: %v", err)
		}
		if existingFileJSON == "" {
			return fmt.Errorf("previous file ID %s not found", previousID)
		}

		var previousFile models.File
		err = json.Unmarshal([]byte(existingFileJSON), &previousFile)
		if err != nil {
			return fmt.Errorf("error unmarshaling previous file: %v", err)
		}

		newVersion = previousFile.Version + 1
		fmt.Printf("DEBUG: Creating version %d of file %s\n", newVersion, previousID)
	} else {
		newVersion = 1
		fmt.Printf("DEBUG: Creating new file (not a versioned update)\n")
	}

	// Get submitting org's MSP ID to add to initial approvals for ANY_ORG policy
	mspID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get MSP ID: %v", err)
	}

	// Initialize approvals array
	initialApprovals := []string{}
	if config.PolicyType == "ANY_ORG" {
		// For ANY_ORG, the submitting org's approval is immediate
		initialApprovals = append(initialApprovals, mspID)
	}

	// Store new file entry
	file := models.File{
		ID:               id,
		Name:             name,
		Hash:             hash,
		Timestamp:        timestamp,
		Owner:            owner,
		Metadata:         metadata,
		Version:          newVersion,
		PreviousID:       previousID,
		Content:          content,
		Status:           "PENDING",
		RequiredOrgs:     config.RequiredOrgs,
		CurrentApprovals: initialApprovals,
		EndorsementType:  config.PolicyType,
	}

	// Set status to APPROVED if using ANY_ORG and submitter is in RequiredOrgs
	if config.PolicyType == "ANY_ORG" && contains(config.RequiredOrgs, mspID) {
		file.Status = "APPROVED"
	}

	fmt.Printf("DEBUG: Registering file - ID: %s, PreviousID: %s\n", file.ID, file.PreviousID)

	fileJSON, err := json.Marshal(file)
	if err != nil {
		return fmt.Errorf("error marshalling file: %s", err.Error())
	}

	fmt.Printf("DEBUG: Saving file with JSON: %s\n", string(fileJSON))

	// Save to state
	err = ctx.GetStub().PutState(id, fileJSON)
	if err != nil {
		return fmt.Errorf("failed to save file to world state: %v", err)
	}

	return nil
}

// Helper function to check if a string is in a slice
func contains(slice []string, str string) bool {
	for _, s := range slice {
		if s == str {
			return true
		}
	}
	return false
}
