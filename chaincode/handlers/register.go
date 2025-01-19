package handlers

import (
	"encoding/json"
	"fmt"
	"time"

	"dltfm/chaincode/utils"
	"dltfm/pkg/models"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func RegisterFile(ctx contractapi.TransactionContextInterface, id string, name string, content string, owner string, metadata string) error {
	fmt.Printf("DEBUG: RegisterFile called with id=%s, name=%s\n", id, name)

	// Compute hash from content
	hash := utils.ComputeHash(content)
	fmt.Printf("DEBUG: Computed hash: %s\n", hash)

	// Check if file with this hash already exists
	existingFileJSON, err := GetFileByHash(ctx, hash)
	if err != nil {
		return fmt.Errorf("error checking existing file: %v", err)
	}

	var newVersion int
	// var previousID string
	var previousHash string
	timestamp := time.Now().Format(time.RFC3339)

	if existingFileJSON != "" {
		// File exists - create new version
		var previousFile models.File
		err = json.Unmarshal([]byte(existingFileJSON), &previousFile)
		if err != nil {
			return fmt.Errorf("error unmarshaling existing file: %v", err)
		}
		newVersion = previousFile.Version + 1
		previousHash = previousFile.Hash

		fmt.Printf("DEBUG: Found existing file, creating version %d\n", newVersion)
	} else {
		newVersion = 1
		previousHash = ""
		fmt.Printf("DEBUG: No existing file found, creating version 1\n")
	}

	storageLocation := fmt.Sprintf("/tmp/files/%s", id)

	file := models.File{
		ID:              id,
		Name:            name,
		Hash:            hash,
		StorageLocation: storageLocation,
		Timestamp:       timestamp,
		Owner:           owner,
		Metadata:        metadata,
		Version:         newVersion,
		PreviousHash:    previousHash,
	}

	fileJSON, err := json.Marshal(file)
	if err != nil {
		return fmt.Errorf("error marshalling file: %s", err.Error())
	}

	fmt.Printf("DEBUG: Saving file with JSON: %s\n", string(fileJSON))

	// Save to state
	err = ctx.GetStub().PutState(id, fileJSON)
	if err != nil {
		return fmt.Errorf("failed to put to world state: %v", err)
	}

	// Verify it was saved
	savedJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return fmt.Errorf("failed to read from world state: %v", err)
	}
	fmt.Printf("DEBUG: Verified saved data: %s\n", string(savedJSON))

	return nil
}
