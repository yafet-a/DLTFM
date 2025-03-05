package main

import (
	"dltfm/chaincode/handlers"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type SmartContract struct {
	contractapi.Contract
}

func (s *SmartContract) RegisterFile(
	ctx contractapi.TransactionContextInterface,
	id string,
	name string,
	content string,
	owner string,
	metadata string,
	previousID string,
	endorsementConfig string,
) error {
	return handlers.RegisterFile(
		ctx,
		id,
		name,
		content,
		owner,
		metadata,
		previousID,
		endorsementConfig,
	)
}

func (s *SmartContract) ApproveFile(ctx contractapi.TransactionContextInterface, id string) error {
	return handlers.ApproveFile(ctx, id)
}

func (s *SmartContract) QueryAllFiles(ctx contractapi.TransactionContextInterface) (string, error) {
	return handlers.QueryAllFiles(ctx)
}

func (s *SmartContract) GetFileByID(ctx contractapi.TransactionContextInterface, id string) (string, error) {
	return handlers.GetFileByID(ctx, id)
}

func (s *SmartContract) GetFileByHash(ctx contractapi.TransactionContextInterface, hash string) (string, error) {
	return handlers.GetFileByHash(ctx, hash)
}

func (s *SmartContract) GetFileAuditLogs(ctx contractapi.TransactionContextInterface, fileID string) (string, error) {
	return handlers.GetFileAuditLogs(ctx, fileID)
}

func main() {
	chaincode, err := contractapi.NewChaincode(new(SmartContract))
	if err != nil {
		fmt.Printf("Error creating chaincode: %s", err.Error())
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting chaincode: %s", err.Error())
	}
}
