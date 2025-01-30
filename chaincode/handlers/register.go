package handlers

import (
	"encoding/json"
	"fmt"
	"time"

	"dltfm/chaincode/utils"
	"dltfm/pkg/models"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func RegisterFile(ctx contractapi.TransactionContextInterface, id string, name string, content string, owner string, metadata string, previousID string) error {
	fmt.Printf("DEBUG: RegisterFile called with id=%s, name=%s\n", id, name)

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

	// Store new file entry
	file := models.File{
		ID:         id,
		Name:       name,
		Hash:       hash,
		Timestamp:  timestamp,
		Owner:      owner,
		Metadata:   metadata,
		Version:    newVersion,
		PreviousID: previousID,
		Content:    content,
	}
	fmt.Printf("DEBUG: Registering file - ID: %s, PreviousID: %s\n", file.ID, file.PreviousID) // Debugging line

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
