package main

import (
	"file-management-chaincode/handlers"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type SmartContract struct {
	contractapi.Contract
}

func (s *SmartContract) RegisterFile(ctx contractapi.TransactionContextInterface, id string, name string, content string, owner string, metadata string) error {
	return handlers.RegisterFile(ctx, id, name, content, owner, metadata)
}

func main() {
	chaincode, err := contractapi.NewChaincode(new(SmartContract))
	if err != nil {
		fmt.Printf("Error creating file-management-chaincode: %s", err.Error())
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting file-management-chaincode: %s", err.Error())
	}
}
