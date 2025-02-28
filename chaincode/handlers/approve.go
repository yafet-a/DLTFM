package handlers

import (
	"encoding/json"
	"fmt"

	"dltfm/pkg/models"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func ApproveFile(ctx contractapi.TransactionContextInterface, id string) error {
	// Get the file
	fileJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return fmt.Errorf("failed to read file: %v", err)
	}
	if fileJSON == nil {
		return fmt.Errorf("file does not exist: %s", id)
	}

	var file models.File
	if err := json.Unmarshal(fileJSON, &file); err != nil {
		return fmt.Errorf("failed to unmarshal file: %v", err)
	}

	// Get the MSP ID of the approver
	mspID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get MSP ID: %v", err)
	}

	// Check if already approved
	for _, approval := range file.CurrentApprovals {
		if approval == mspID {
			return fmt.Errorf("organization has already approved this file")
		}
	}

	// Add approval
	file.CurrentApprovals = append(file.CurrentApprovals, mspID)

	// Check if we have all required approvals
	if len(file.CurrentApprovals) == len(file.RequiredOrgs) {
		file.Status = "APPROVED"
	}

	// Update state
	updatedFileJSON, err := json.Marshal(file)
	if err != nil {
		return fmt.Errorf("failed to marshal updated file: %v", err)
	}

	return ctx.GetStub().PutState(id, updatedFileJSON)
}
