package gateway

import (
	"crypto/x509"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"

	"github.com/hyperledger/fabric-gateway/pkg/client"
	"github.com/hyperledger/fabric-gateway/pkg/identity"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
)

// Get the directory of fabric-samples relative to server directory
func getFabricSamplesDir() string {
	// Assuming we're in the server directory, go up one level and then to fabric-samples
	return filepath.Join("..", "fabric-samples")
}

type OrgConfig struct {
	MSPID      string
	PeerPort   string
	CryptoPath string
}

func getOrgConfig(mspID string) OrgConfig {
	switch mspID {
	case "Org2MSP":
		return OrgConfig{
			MSPID:      "Org2MSP",
			PeerPort:   "9051",
			CryptoPath: "org2.example.com",
		}
	default: // Default to Org1
		return OrgConfig{
			MSPID:      "Org1MSP",
			PeerPort:   "7051",
			CryptoPath: "org1.example.com",
		}
	}
}

func Connect(mspID string) (*client.Gateway, error) {
	fmt.Printf("Starting Gateway connection for MSP: %s\n", mspID)

	orgConfig := getOrgConfig(mspID)

	clientConnection := newGrpcConnection(orgConfig)
	fmt.Println("gRPC connection established")

	id, err := newIdentity(orgConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create identity: %w", err)
	}
	fmt.Println("Identity created")

	sign, err := newSign(orgConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create signer: %w", err)
	}
	fmt.Println("Signer created")

	gw, err := client.Connect(
		id,
		client.WithSign(sign),
		client.WithClientConnection(clientConnection),
	)
	if err != nil {
		return nil, err
	}
	fmt.Println("Gateway connection established successfully")

	return gw, nil
}

func newGrpcConnection(config OrgConfig) *grpc.ClientConn {
	fmt.Println("Setting up gRPC connection...")

	tlsCertPath := filepath.Join(
		getFabricSamplesDir(),
		"test-network",
		"organizations",
		"peerOrganizations",
		config.CryptoPath,
		"peers",
		fmt.Sprintf("peer0.%s", config.CryptoPath),
		"tls",
		"ca.crt",
	)

	fmt.Printf("Using TLS cert from: %s\n", tlsCertPath)

	certificate, err := loadCertificate(tlsCertPath)
	if err != nil {
		panic(fmt.Errorf("failed to load TLS certificate: %w", err))
	}

	certPool := x509.NewCertPool()
	certPool.AddCert(certificate)
	transportCredentials := credentials.NewClientTLSFromCert(certPool, "")

	connection, err := grpc.Dial(
		fmt.Sprintf("localhost:%s", config.PeerPort),
		grpc.WithTransportCredentials(transportCredentials),
		grpc.WithBlock(),
		grpc.WithDefaultCallOptions(
			grpc.WaitForReady(true),
			grpc.MaxCallRecvMsgSize(20*1024*1024),
			grpc.MaxCallSendMsgSize(20*1024*1024),
		),
	)
	if err != nil {
		panic(fmt.Errorf("failed to create gRPC connection: %w", err))
	}

	return connection
}

func newIdentity(config OrgConfig) (*identity.X509Identity, error) {
	// First try the CA path (cert.pem)
	certPath := filepath.Join(
		getFabricSamplesDir(),
		"test-network",
		"organizations",
		"peerOrganizations",
		config.CryptoPath,
		"users",
		fmt.Sprintf("Admin@%s", config.CryptoPath),
		"msp",
		"signcerts",
		"cert.pem",
	)

	// Check if file exists
	if _, err := os.Stat(certPath); os.IsNotExist(err) {
		// Try the BFT path with the longer filename
		certPath = filepath.Join(
			getFabricSamplesDir(),
			"test-network",
			"organizations",
			"peerOrganizations",
			config.CryptoPath,
			"users",
			fmt.Sprintf("Admin@%s", config.CryptoPath),
			"msp",
			"signcerts",
			fmt.Sprintf("Admin@%s-cert.pem", config.CryptoPath),
		)
	}

	certificatePEM, err := ioutil.ReadFile(certPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read certificate file: %w", err)
	}

	certificate, err := identity.CertificateFromPEM(certificatePEM)
	if err != nil {
		return nil, fmt.Errorf("failed to create certificate from PEM: %w", err)
	}

	id, err := identity.NewX509Identity(config.MSPID, certificate)
	if err != nil {
		return nil, fmt.Errorf("failed to create identity: %w", err)
	}

	return id, nil
}

func newSign(config OrgConfig) (identity.Sign, error) {
	keyDir := filepath.Join(
		getFabricSamplesDir(),
		"test-network",
		"organizations",
		"peerOrganizations",
		config.CryptoPath,
		"users",
		fmt.Sprintf("Admin@%s", config.CryptoPath),
		"msp",
		"keystore",
	)

	// Try to find the key file
	files, err := ioutil.ReadDir(keyDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read keystore directory: %w", err)
	}

	if len(files) == 0 {
		return nil, fmt.Errorf("no private key found in keystore directory")
	}

	// Use the first file found (this works for both CA and BFT scenarios)
	privateKeyPath := filepath.Join(keyDir, files[0].Name())
	privateKeyPEM, err := ioutil.ReadFile(privateKeyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read private key file: %w", err)
	}

	privateKey, err := identity.PrivateKeyFromPEM(privateKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("failed to create private key: %w", err)
	}

	sign, err := identity.NewPrivateKeySign(privateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create signer: %w", err)
	}

	return sign, nil
}

func loadCertificate(filename string) (*x509.Certificate, error) {
	certificatePEM, err := os.ReadFile(filename)
	if err != nil {
		return nil, fmt.Errorf("failed to read certificate file: %w", err)
	}
	return identity.CertificateFromPEM(certificatePEM)
}
