package handlers

import (
	"encoding/json"
	"fmt"
	"time"

	"dltfm/pkg/models"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type EndorsementConfig struct {
	RequiredOrgs []string `json:"requiredOrgs"`
	PolicyType   string   `json:"policyType"`
}

func RegisterFile(ctx contractapi.TransactionContextInterface, id string, name string, ipfsCID string, owner string, metadata string, previousID string, endorsementConfig string) error {
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

	// Architectural Note: We no longer compute the hash of the content here as it's not available.
	// Instead, we'll store the IPFS CID which already serves as a content hash.
	hash := ipfsCID // IPFS CID is already a content-addressed hash
	fmt.Printf("DEBUG: Using IPFS CID as hash: %s\n", hash)

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

	// Get submitting org's MSP ID
	mspID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get MSP ID: %v", err)
	}

	// Initialize approvals array
	initialApprovals := []string{mspID}

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
		IPFSLocation:     ipfsCID,
		Status:           "PENDING",
		RequiredOrgs:     config.RequiredOrgs,
		CurrentApprovals: initialApprovals,
		EndorsementType:  config.PolicyType,
	}

	// Set status to APPROVED if using ANY_ORG
	if config.PolicyType == "ANY_ORG" {
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

	// Audit the transaction
	details := fmt.Sprintf("File %s registered by %s with endorsement type %s", name, owner, config.PolicyType)
	if err := CreateAuditLog(ctx, id, "REGISTER", details); err != nil {
		// Log the error but don't fail the transaction
		fmt.Printf("WARNING: Failed to create audit log: %v\n", err)
	}

	return nil
}
