package handlers

import (
	"encoding/json"
	"fmt"
	"time"

	"dltfm/chaincode/utils"
	"dltfm/pkg/models"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// RegisterFile adds a new file to the ledger
func RegisterFile(ctx contractapi.TransactionContextInterface, id string, name string, content string, owner string, metadata string) error {
	fmt.Printf("DEBUG: RegisterFile called with id=%s, name=%s\n", id, name)

	// Compute hash from content
	hash := utils.ComputeHash(content)

	file := models.File{
		ID:              id,
		Name:            name,
		Hash:            hash,
		StorageLocation: fmt.Sprintf("/tmp/files/%s", id),
		Timestamp:       time.Now().Format(time.RFC3339),
		Owner:           owner,
		Metadata:        metadata,
		Version:         1,
		PreviousHash:    "",
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
