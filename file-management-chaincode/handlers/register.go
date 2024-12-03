package handlers

import (
	"encoding/json"
	"fmt"
	"time"

	"file-management-chaincode/models"
	"file-management-chaincode/utils"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// RegisterFile adds a new file to the ledger
func RegisterFile(ctx contractapi.TransactionContextInterface, id string, name string, content string, owner string, metadata string) error {
	//Compute the SHA-256 hash of the file
	hash := utils.ComputeHash(content)

	//Get current timestamp
	timestamp := time.Now().Format(time.RFC3339)

	//Create a new File object
	file := models.File{
		ID:        id,
		Name:      name,
		Hash:      hash,
		Timestamp: timestamp,
		Owner:     owner,
		Metadata:  metadata,
	}

	fileJSON, err := json.Marshal(file)
	if err != nil {
		return fmt.Errorf("Error marshalling file: %s", err.Error())
	}

	//Save the file to the ledger
	return ctx.GetStub().PutState(id, fileJSON)
}
