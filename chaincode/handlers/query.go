package handlers

import (
	"dltfm/pkg/models"
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// Query all files in the ledger
func QueryAllFiles(ctx contractapi.TransactionContextInterface) (string, error) {
	fmt.Println("DEBUG: Starting QueryAllFiles")

	resultsIterator, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		fmt.Printf("ERROR: Failed to get state range: %v\n", err)
		return "", fmt.Errorf("failed to get state range: %v", err)
	}
	defer resultsIterator.Close()

	var files []models.File
	for resultsIterator.HasNext() {
		response, err := resultsIterator.Next()
		if err != nil {
			fmt.Printf("ERROR: Failed to iterate state: %v\n", err)
			return "", fmt.Errorf("failed to iterate state: %v", err)
		}

		var file models.File
		err = json.Unmarshal(response.Value, &file)
		if err != nil {
			fmt.Printf("ERROR: Failed to unmarshal file: %v\n", err)
			continue // Skip invalid entries instead of failing
		}

		files = append(files, file)
	}

	if len(files) == 0 {
		return "[]", nil // Return empty JSON array
	}

	filesJSON, err := json.Marshal(files)
	if err != nil {
		return "", fmt.Errorf("failed to marshal files: %v", err)
	}

	return string(filesJSON), nil
}

// Retrieve a file by ID
func GetFileByID(ctx contractapi.TransactionContextInterface, id string) (string, error) {
	fileJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return "", fmt.Errorf("failed to read from world state: %v", err)
	}
	if fileJSON == nil {
		return "", nil // Instead of returning an error, return nil to indicate the file wasn't found
	}
	return string(fileJSON), nil
}

// Retrieve all versions of a file
func GetFileVersions(ctx contractapi.TransactionContextInterface, id string) (string, error) {
	var versions []models.File
	currentID := id

	for currentID != "" {
		fileJSON, err := GetFileByID(ctx, currentID)
		if err != nil {
			return "", fmt.Errorf("failed to fetch version history: %v", err)
		}
		if fileJSON == "" {
			break // Stop if there is no previous version
		}

		var file models.File
		err = json.Unmarshal([]byte(fileJSON), &file)
		if err != nil {
			return "", fmt.Errorf("error unmarshaling file: %v", err)
		}

		versions = append(versions, file)
		currentID = file.PreviousID // Move to the previous version
	}

	filesJSON, err := json.Marshal(versions)
	if err != nil {
		return "", fmt.Errorf("failed to marshal version history: %v", err)
	}

	return string(filesJSON), nil
}

// Retrieve a file by its hash value
func GetFileByHash(ctx contractapi.TransactionContextInterface, hash string) (string, error) {
	resultsIterator, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return "", fmt.Errorf("failed to get state range: %v", err)
	}
	defer resultsIterator.Close()

	for resultsIterator.HasNext() {
		response, err := resultsIterator.Next()
		if err != nil {
			return "", fmt.Errorf("failed to iterate state: %v", err)
		}

		var file models.File
		err = json.Unmarshal(response.Value, &file)
		if err != nil {
			continue // Skip invalid entries instead of failing
		}

		if file.Hash == hash {
			return string(response.Value), nil
		}
	}

	return "", nil
}
