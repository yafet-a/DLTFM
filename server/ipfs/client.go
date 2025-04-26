package ipfs

import (
	"bytes"
	"fmt"
	"io"
	"math"
	"math/rand"
	"os"
	"time"

	shell "github.com/ipfs/go-ipfs-api"
)

// IPFSClient handles interactions with IPFS
type IPFSClient struct {
	shell           *shell.Shell
	developmentMode bool
}

// NewIPFSClient creates a new IPFS client
func NewIPFSClient(apiURL string, developmentMode bool) *IPFSClient {
	return &IPFSClient{
		shell:           shell.NewShell(apiURL),
		developmentMode: developmentMode,
	}
}

// AddFile adds a file to IPFS and returns its CID
func (c *IPFSClient) AddFile(fileContent []byte) (string, error) {
	fmt.Printf("DEBUG: Adding file to IPFS, size: %d bytes\n", len(fileContent))
	cid, err := c.shell.Add(bytes.NewReader(fileContent))
	if err != nil {
		fmt.Printf("DEBUG: Failed to add file to IPFS: %v\n", err)
		return "", fmt.Errorf("failed to add file to IPFS: %w", err)
	}
	fmt.Printf("DEBUG: Successfully added file to IPFS with CID: %s\n", cid)

	// In non-development mode, pin the file to ensure it persists
	if !c.developmentMode {
		fmt.Printf("DEBUG: Attempting to pin CID: %s\n", cid)
		err = c.shell.Pin(cid)
		if err != nil {
			fmt.Printf("WARNING: Failed to pin file: %v\n", err)
		} else {
			fmt.Printf("DEBUG: Successfully pinned CID: %s\n", cid)
		}
	}

	return cid, nil
}

// GetFile retrieves a file from IPFS by its CID with exponential backoff
func (c *IPFSClient) GetFile(cid string) ([]byte, error) {
	fmt.Printf("DEBUG: Retrieving file from IPFS with CID: %s\n", cid)

	var content []byte
	var lastErr error

	// Retry configuration
	maxRetries := 5
	baseDelay := 100 * time.Millisecond

	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			// Calculate backoff with jitter
			delay := baseDelay * time.Duration(math.Pow(2, float64(attempt)))
			jitter := time.Duration(rand.Float64() * 0.4 * float64(delay))
			delay = delay + jitter - (jitter / 2) // ±20% symmetric distribution

			fmt.Printf("DEBUG: Attempt %d failed, retrying after %v\n", attempt, delay)
			time.Sleep(delay)
		}

		// Use Cat method to retrieve the file
		reader, err := c.shell.Cat(cid)
		if err != nil {
			lastErr = fmt.Errorf("IPFS Cat failed on attempt %d: %w", attempt+1, err)
			fmt.Printf("DEBUG: %v\n", lastErr)
			continue
		}

		// Read the content from the reader
		content, err = io.ReadAll(reader)
		reader.Close()

		if err != nil {
			lastErr = fmt.Errorf("failed to read from IPFS stream on attempt %d: %w", attempt+1, err)
			fmt.Printf("DEBUG: %v\n", lastErr)
			continue
		}

		// Success!
		fmt.Printf("DEBUG: Successfully read %d bytes from IPFS for CID: %s after %d attempt(s)\n",
			len(content), cid, attempt+1)
		return content, nil
	}

	return nil, fmt.Errorf("failed to retrieve file after %d attempts: %w", maxRetries, lastErr)
}

// PinFile pins a file in IPFS to ensure it persists
func (c *IPFSClient) PinFile(cid string) error {
	fmt.Printf("DEBUG: Pinning file with CID: %s\n", cid)
	err := c.shell.Pin(cid)
	if err != nil {
		fmt.Printf("DEBUG: Failed to pin file: %v\n", err)
		return fmt.Errorf("failed to pin file: %w", err)
	}
	fmt.Printf("DEBUG: Successfully pinned CID: %s\n", cid)
	return nil
}

// UnpinFile removes a pin for a file in IPFS
func (c *IPFSClient) UnpinFile(cid string) error {
	fmt.Printf("DEBUG: Unpinning file with CID: %s\n", cid)
	err := c.shell.Unpin(cid)
	if err != nil {
		fmt.Printf("DEBUG: Failed to unpin file: %v\n", err)
		return fmt.Errorf("failed to unpin file: %w", err)
	}
	fmt.Printf("DEBUG: Successfully unpinned CID: %s\n", cid)
	return nil
}

// IsConnected checks if the IPFS node is accessible
func (c *IPFSClient) IsConnected() bool {
	_, err := c.shell.ID()
	return err == nil
}

// GetNodeID returns the ID of the connected IPFS node
func (c *IPFSClient) GetNodeID() (string, error) {
	info, err := c.shell.ID()
	if err != nil {
		return "", fmt.Errorf("failed to get node ID: %w", err)
	}
	return info.ID, nil
}

// FileExists checks if a file exists in IPFS
func (c *IPFSClient) FileExists(cid string) bool {
	_, err := c.shell.ObjectStat(cid)
	return err == nil
}

// GetFileSize returns the size of a file in IPFS
func (c *IPFSClient) GetFileSize(cid string) (int64, error) {
	stat, err := c.shell.ObjectStat(cid)
	if err != nil {
		return 0, fmt.Errorf("failed to get object stats: %w", err)
	}
	return int64(stat.CumulativeSize), nil
}

// SaveFileFromIPFS downloads a file from IPFS and saves it to the local filesystem
func (c *IPFSClient) SaveFileFromIPFS(cid string, filePath string) error {
	// Get the file content
	content, err := c.GetFile(cid)
	if err != nil {
		return err
	}

	// Write to file
	err = os.WriteFile(filePath, content, 0644)
	if err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	return nil
}
