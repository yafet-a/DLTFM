package commands

import (
	"dltfm/pkg/models"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func QueryAllFiles() error {
	currentDir, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("failed to get current directory: %v", err)
	}

	// Locate the project root relative to the current directory
	projectRoot := filepath.Join(currentDir, "../")
	ordererCertPath := filepath.Join(projectRoot, "fabric-samples/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem")
	peerCertPath := filepath.Join(projectRoot, "fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt")

	// Ensure paths exist
	if _, err := os.Stat(ordererCertPath); os.IsNotExist(err) {
		return fmt.Errorf("orderer certificate not found at: %s", ordererCertPath)
	}
	if _, err := os.Stat(peerCertPath); os.IsNotExist(err) {
		return fmt.Errorf("peer certificate not found at: %s", peerCertPath)
	}

	// Construct the peer chaincode query command
	command := exec.Command(
		"peer", "chaincode", "query",
		"-o", "localhost:7050",
		"--ordererTLSHostnameOverride", "orderer.example.com",
		"--tls",
		"--cafile", ordererCertPath,
		"-C", "mychannel",
		"-n", "chaincode", // Update this if you renamed it
		"-c", `{"function":"QueryAllFiles","Args":[]}`,
	)

	// Run the command
	output, err := command.CombinedOutput()
	if err != nil {
		return fmt.Errorf("chaincode query failed: %v\nOutput: %s", err, string(output))
	}

	// Parse the JSON output into File structs
	var files []models.File
	if err := json.Unmarshal([]byte(output), &files); err != nil {
		return fmt.Errorf("failed to parse response: %v", err)
	}

	// Use the formatting function
	fmt.Println(models.FormatFileList(files))
	return nil
}

func QueryFileByID(fileID string) error {
	currentDir, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("failed to get current directory: %v", err)
	}

	// Locate the project root relative to the current directory
	projectRoot := filepath.Join(currentDir, "../")
	ordererCertPath := filepath.Join(projectRoot, "fabric-samples/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem")
	peerCertPath := filepath.Join(projectRoot, "fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt")

	// Ensure paths exist
	if _, err := os.Stat(ordererCertPath); os.IsNotExist(err) {
		return fmt.Errorf("orderer certificate not found at: %s", ordererCertPath)
	}
	if _, err := os.Stat(peerCertPath); os.IsNotExist(err) {
		return fmt.Errorf("peer certificate not found at: %s", peerCertPath)
	}

	// Construct the peer chaincode query command
	command := exec.Command(
		"peer", "chaincode", "query",
		"-o", "localhost:7050",
		"--ordererTLSHostnameOverride", "orderer.example.com",
		"--tls",
		"--cafile", ordererCertPath,
		"-C", "mychannel",
		"-n", "chaincode",
		"-c", fmt.Sprintf(`{"function":"GetFileByID","Args":["%s"]}`, fileID),
	)

	// Run the command
	output, err := command.CombinedOutput()
	if err != nil {
		return fmt.Errorf("chaincode query failed: %v\nOutput: %s", err, string(output))
	}

	// Parse the JSON output into a File struct
	var file models.File
	if err := json.Unmarshal([]byte(output), &file); err != nil {
		return fmt.Errorf("failed to parse response: %v", err)
	}

	// Use the formatting function
	fmt.Println(models.FormatFileList([]models.File{file}))
	return nil
}
