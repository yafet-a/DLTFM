package handlers

import (
	"dltfm/pkg/models"
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func QueryAllFiles(ctx contractapi.TransactionContextInterface) (string, error) {
	fmt.Println("DEBUG: Starting QueryAllFiles")

	// Add debug logging for the stub
	stub := ctx.GetStub()
	fmt.Printf("DEBUG: Stub initialized: %v\n", stub != nil)

	resultsIterator, err := stub.GetStateByRange("", "")
	if err != nil {
		fmt.Printf("ERROR: Failed to get state range: %v\n", err)
		return "", fmt.Errorf("failed to get state range: %v", err)
	}
	defer resultsIterator.Close()

	fmt.Println("DEBUG: Got iterator, checking for results...")

	var files []models.File
	for resultsIterator.HasNext() {
		response, err := resultsIterator.Next()
		if err != nil {
			fmt.Printf("ERROR: Failed to iterate state: %v\n", err)
			return "", fmt.Errorf("failed to iterate state: %v", err)
		}

		fmt.Printf("DEBUG: Found Key: %s, Value: %s\n", response.Key, string(response.Value))

		var file models.File
		err = json.Unmarshal(response.Value, &file)
		if err != nil {
			fmt.Printf("ERROR: Failed to unmarshal file: %v\n", err)
			continue // Skip invalid entries instead of failing
		}

		files = append(files, file)
	}

	if len(files) == 0 {
		fmt.Println("DEBUG: No files found in state")
		return "[]", nil
	}

	filesJSON, err := json.Marshal(files)
	if err != nil {
		return "", fmt.Errorf("failed to marshal files: %v", err)
	}

	return string(filesJSON), nil
}

func GetFileByID(ctx contractapi.TransactionContextInterface, id string) (string, error) {
	fileJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return "", fmt.Errorf("failed to read from world state: %v", err)
	}
	if fileJSON == nil {
		return "", fmt.Errorf("file with ID %s not found", id)
	}
	return string(fileJSON), nil
}
