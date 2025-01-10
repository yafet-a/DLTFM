package main

import (
	"dltfm/chaincode/handlers"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type SmartContract struct {
	contractapi.Contract
}

func (s *SmartContract) RegisterFile(ctx contractapi.TransactionContextInterface, id string, name string, content string, owner string, metadata string) error {
	return handlers.RegisterFile(ctx, id, name, content, owner, metadata)
}

func (s *SmartContract) QueryAllFiles(ctx contractapi.TransactionContextInterface) (string, error) {
	return handlers.QueryAllFiles(ctx)
}

func (s *SmartContract) GetFileByID(ctx contractapi.TransactionContextInterface, id string) (string, error) {
	return handlers.GetFileByID(ctx, id)
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
