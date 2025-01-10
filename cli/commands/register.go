package commands

import (
	"cli/utils"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func RegisterFile(filePath, owner string) error {
	// Dynamically compute the absolute paths for certificates
	currentDir, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("failed to get current directory: %v", err)
	}

	// Locate the project root relative to the current directory
	projectRoot := filepath.Join(currentDir, "../")
	fmt.Println("DEBUG: Project Root -", projectRoot)
	ordererCertPath := filepath.Join(projectRoot, "fabric-samples/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem")
	org1CertPath := filepath.Join(projectRoot, "fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt")
	org2CertPath := filepath.Join(projectRoot, "fabric-samples/test-network/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt")
	peerCertPath := filepath.Join(projectRoot, "fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt")
	fmt.Println("DEBUG: Orderer Cert Path -", ordererCertPath)
	fmt.Println("DEBUG: Org1 Cert Path -", org1CertPath)
	fmt.Println("DEBUG: Org2 Cert Path -", org2CertPath)
	fmt.Println("DEBUG: Peer Cert Path -", peerCertPath)

	// Ensure paths exist
	if _, err := os.Stat(ordererCertPath); os.IsNotExist(err) {
		return fmt.Errorf("orderer certificate not found at: %s", ordererCertPath)
	}
	if _, err := os.Stat(org1CertPath); os.IsNotExist(err) {
		return fmt.Errorf("org1 certificate not found at: %s", org1CertPath)
	}
	if _, err := os.Stat(org2CertPath); os.IsNotExist(err) {
		return fmt.Errorf("org2 certificate not found at: %s", org2CertPath)
	}
	if _, err := os.Stat(peerCertPath); os.IsNotExist(err) {
		return fmt.Errorf("peer certificate not found at: %s", peerCertPath)
	}

	// Read file content
	content, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read file: %v", err)
	}

	// Generate unique ID and get metadata
	id := fmt.Sprintf("file_%d", time.Now().UnixNano())
	name := filepath.Base(filePath)
	_, size, err := utils.GetFileMetadata(filePath)
	if err != nil {
		return fmt.Errorf("failed to get file metadata: %v", err)
	}

	// Create metadata struct and marshal to JSON
	metadata := struct {
		Size      int64  `json:"size"`
		Type      string `json:"type"`
		CreatedAt string `json:"createdAt"`
	}{
		Size:      size,
		Type:      "text/plain",
		CreatedAt: time.Now().Format(time.RFC3339),
	}

	metadataBytes, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %v", err)
	}

	// Create chaincode args struct
	type ChaincodeArgs struct {
		Function string   `json:"function"`
		Args     []string `json:"Args"`
	}

	// Clean content string - remove carriage returns and escape newlines
	cleanContent := strings.ReplaceAll(string(content), "\r\n", "\n")
	cleanContent = strings.ReplaceAll(cleanContent, "\n", "\\n")

	args := ChaincodeArgs{
		Function: "RegisterFile",
		Args: []string{
			id,
			name,
			cleanContent,
			owner,
			string(metadataBytes),
		},
	}

	// Marshal the entire command to JSON
	ccArgsBytes, err := json.Marshal(args)
	if err != nil {
		return fmt.Errorf("failed to marshal chaincode args: %v", err)
	}

	fmt.Printf("DEBUG: Registering file with parameters:\n")
	fmt.Printf("ID: %s\n", id)
	fmt.Printf("Name: %s\n", name)
	fmt.Printf("Content Length: %d\n", len(content))
	fmt.Printf("Owner: %s\n", owner)
	fmt.Printf("Metadata: %s\n", string(metadataBytes))
	fmt.Printf("Final ccArgs: %s\n", string(ccArgsBytes))

	// Build command
	command := exec.Command(
		"peer", "chaincode", "invoke",
		"-o", "localhost:7050",
		"--ordererTLSHostnameOverride", "orderer.example.com",
		"--tls",
		"--cafile", ordererCertPath,
		"-C", "mychannel",
		"-n", "chaincode",
		"--peerAddresses", "localhost:7051",
		"--tlsRootCertFiles", org1CertPath,
		"--peerAddresses", "localhost:9051",
		"--tlsRootCertFiles", org2CertPath,
		"-c", string(ccArgsBytes),
	)

	// Run the command
	output, err := command.CombinedOutput()
	if err != nil {
		return fmt.Errorf("chaincode invoke failed: %v\nOutput: %s", err, string(output))
	}

	fmt.Println("Invoke Response:", string(output))
	return nil
}
