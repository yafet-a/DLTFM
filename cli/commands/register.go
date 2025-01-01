package commands

import (
	"cli/utils"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
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
	peerCertPath := filepath.Join(projectRoot, "fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt")
	fmt.Println("DEBUG: Orderer Cert Path -", ordererCertPath)
	fmt.Println("DEBUG: Peer Cert Path -", peerCertPath)

	// Ensure paths exist
	if _, err := os.Stat(ordererCertPath); os.IsNotExist(err) {
		return fmt.Errorf("orderer certificate not found at: %s", ordererCertPath)
	}
	if _, err := os.Stat(peerCertPath); os.IsNotExist(err) {
		return fmt.Errorf("peer certificate not found at: %s", peerCertPath)
	}

	// Compute hash and metadata
	hash, err := utils.ComputeSHA256(filePath)
	if err != nil {
		return fmt.Errorf("error computing hash: %v", err)
	}

	name, size, err := utils.GetFileMetadata(filePath)
	if err != nil {
		return fmt.Errorf("failed to get file metadata: %v", err)
	}

	// Construct the peer chaincode invoke command
	command := exec.Command(
		"peer", "chaincode", "invoke",
		"-o", "localhost:7050",
		"--ordererTLSHostnameOverride", "orderer.example.com",
		"--tls",
		"--cafile", ordererCertPath,
		"-C", "mychannel",
		"-n", "file-management-chaincode",
		"--peerAddresses", "localhost:7051",
		"--tlsRootCertFiles", peerCertPath,
		"-c", fmt.Sprintf(`{"function":"RegisterFile","Args":["%s","%s","%s","%s","{\"size\":%d,\"type\":\"text/plain\"}"]}`,
			name, name, hash, owner, size),
	)

	// Run the command
	output, err := command.CombinedOutput()
	if err != nil {
		return fmt.Errorf("chaincode invoke failed: %v\nOutput: %s", err, string(output))
	}

	fmt.Println("Invoke Response:", string(output))
	return nil
}
