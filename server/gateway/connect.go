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

func Connect() (*client.Gateway, error) {
	// Debug prints for connection process
	fmt.Println("Starting Gateway connection...")

	clientConnection := newGrpcConnection()
	fmt.Println("gRPC connection established")

	id, err := newIdentity()
	if err != nil {
		return nil, fmt.Errorf("failed to create identity: %w", err)
	}
	fmt.Println("Identity created")

	sign, err := newSign()
	if err != nil {
		return nil, fmt.Errorf("failed to create signer: %w", err)
	}
	fmt.Println("Signer created")

	// Create a Gateway connection with increased timeouts
	gw, err := client.Connect(
		id,
		client.WithSign(sign),
		client.WithClientConnection(clientConnection),
		client.WithEvaluateTimeout(1000000000),     // Increase from 5 to 1000000000 seconds
		client.WithEndorseTimeout(1000000000),      // Increase from 15 to 1000000000 seconds
		client.WithSubmitTimeout(1000000000),       // Increase from 5 to 1000000000 seconds
		client.WithCommitStatusTimeout(1000000000), // Increase from 1 to 1000000000 seconds
	)
	if err != nil {
		return nil, err
	}
	fmt.Println("Gateway connection established successfully")

	return gw, nil
}

func newGrpcConnection() *grpc.ClientConn {
	fmt.Println("Setting up gRPC connection...")

	tlsCertPath := filepath.Join(
		getFabricSamplesDir(),
		"test-network",
		"organizations",
		"peerOrganizations",
		"org1.example.com",
		"peers",
		"peer0.org1.example.com",
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

	// Try with and without hostname override
	transportCredentials := credentials.NewClientTLSFromCert(certPool, "")

	fmt.Println("Attempting to establish gRPC connection...")
	connection, err := grpc.Dial(
		"localhost:7051",
		grpc.WithTransportCredentials(transportCredentials),
		grpc.WithBlock(), // Make the dial blocking
		grpc.WithDefaultCallOptions( // Increase timeouts
			grpc.WaitForReady(true),
			grpc.MaxCallRecvMsgSize(20*1024*1024), // 20MB
			grpc.MaxCallSendMsgSize(20*1024*1024), // 20MB
		),
	)
	if err != nil {
		panic(fmt.Errorf("failed to create gRPC connection: %w", err))
	}
	fmt.Println("gRPC connection established successfully")

	return connection
}

func newIdentity() (*identity.X509Identity, error) {
	certPath := filepath.Join(
		getFabricSamplesDir(),
		"test-network",
		"organizations",
		"peerOrganizations",
		"org1.example.com",
		"users",
		"Admin@org1.example.com",
		"msp",
		"signcerts",
		"cert.pem", // Changed from Admin@org1.example.com-cert.pem to cert.pem
	)

	// Debug print
	fmt.Printf("Looking for certificate at: %s\n", certPath)

	certificatePEM, err := ioutil.ReadFile(certPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read certificate file: %w", err)
	}

	certificate, err := identity.CertificateFromPEM(certificatePEM)
	if err != nil {
		return nil, fmt.Errorf("failed to create certificate from PEM: %w", err)
	}

	id, err := identity.NewX509Identity("Org1MSP", certificate)
	if err != nil {
		return nil, fmt.Errorf("failed to create identity: %w", err)
	}

	return id, nil
}

func newSign() (identity.Sign, error) {
	keyPath := filepath.Join(
		getFabricSamplesDir(),
		"test-network",
		"organizations",
		"peerOrganizations",
		"org1.example.com",
		"users",
		"Admin@org1.example.com",
		"msp",
		"keystore",
		// The actual key file will be named something random. We need to read the directory
		// and find the first file, as it will be the private key
	)

	// Read the keystore directory
	files, err := ioutil.ReadDir(keyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read keystore directory: %w", err)
	}

	// Find the first file (should be the private key)
	if len(files) == 0 {
		return nil, fmt.Errorf("no private key found in keystore directory")
	}

	privateKeyPath := filepath.Join(keyPath, files[0].Name())
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
