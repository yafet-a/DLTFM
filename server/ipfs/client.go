package ipfs

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"math/rand"
	"os"
	"sync"
	"time"

	shell "github.com/ipfs/go-ipfs-api"
)

// IPFSClient handles interactions with IPFS
type IPFSClient struct {
	shell           *shell.Shell
	developmentMode bool
	addSemaphore    chan struct{} // Limit concurrent Add operations
	getSemaphore    chan struct{} // Limit concurrent Get operations
	pinMutex        sync.Mutex    // For pin/unpin operations
}

// NewIPFSClient creates a new IPFS client
func NewIPFSClient(apiURL string, developmentMode bool) *IPFSClient {
	const maxConcurrent = 30 // Default to 30 concurrent operations

	shell := shell.NewShell(apiURL)
	shell.SetTimeout(60 * time.Second) // Set a timeout for all operations

	return &IPFSClient{
		shell:           shell,
		developmentMode: developmentMode,
		addSemaphore:    make(chan struct{}, maxConcurrent),
		getSemaphore:    make(chan struct{}, maxConcurrent*2), // Allow more concurrent reads
	}
}

// AddFile adds a file to IPFS and returns its CID
func (c *IPFSClient) AddFile(fileContent []byte) (string, error) {
	// Acquire semaphore
	select {
	case c.addSemaphore <- struct{}{}:
		// Acquired semaphore, proceed
		defer func() { <-c.addSemaphore }() // Release when done
	case <-time.After(10 * time.Second):
		return "", fmt.Errorf("timed out waiting for IPFS add semaphore")
	}

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

		// Use a separate goroutine for pinning to not block the response
		go func(cid string) {
			c.pinMutex.Lock()
			defer c.pinMutex.Unlock()

			err := c.shell.Pin(cid)
			if err != nil {
				fmt.Printf("WARNING: Failed to pin file: %v\n", err)
			} else {
				fmt.Printf("DEBUG: Successfully pinned CID: %s\n", cid)
			}
		}(cid)
	}

	return cid, nil
}

// GetFile retrieves a file from IPFS by its CID with exponential backoff
func (c *IPFSClient) GetFile(cid string) ([]byte, error) {
	// Acquire semaphore (timeout after 5s)
	select {
	case c.getSemaphore <- struct{}{}:
		defer func() { <-c.getSemaphore }()
	case <-time.After(5 * time.Second):
		return nil, fmt.Errorf("timed out waiting for IPFS get semaphore")
	}

	fmt.Printf("DEBUG: Retrieving file from IPFS with CID: %s\n", cid)

	// Overall timeout for all retries
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	const (
		maxRetries = 5
		baseDelay  = 100 * time.Millisecond
	)

	var lastErr error
	for a := 0; a < maxRetries; a++ {
		// Before retrying (not on first try), wait with exponential backoff + jitter
		if a > 0 {
			d := baseDelay << a // Bit-shift for geometric sequence
			j := time.Duration(rand.Float64() * 0.4 * float64(d))
			delay := d + j - (j / 2) // ±20% symmetric
			fmt.Printf("DEBUG: Attempt %d failed, retrying after %v\n", a, delay)

			select {
			case <-time.After(delay):
				// continue to next attempt
			case <-ctx.Done():
				return nil, fmt.Errorf("IPFS get operation timed out after %s: %w", ctx.Err(), lastErr)
			}
		}

		// Try to Cat
		reader, err := c.shell.Cat(cid)
		if err != nil {
			lastErr = fmt.Errorf("IPFS Cat failed on attempt %d: %w", a+1, err)
			fmt.Printf("DEBUG: %v\n", lastErr)
			continue
		}

		// Read all content
		content, err := io.ReadAll(reader)
		reader.Close()
		if err != nil {
			lastErr = fmt.Errorf("failed to read from IPFS stream on attempt %d: %w", a+1, err)
			fmt.Printf("DEBUG: %v\n", lastErr)
			continue
		}

		// Success!
		fmt.Printf("DEBUG: Successfully read %d bytes from IPFS for CID %s on attempt %d\n",
			len(content), cid, a+1)
		return content, nil
	}

	return nil, fmt.Errorf("failed to retrieve file after %d attempts: %w", maxRetries, lastErr)
}

func (c *IPFSClient) AddLargeFile(fileContent []byte) (string, error) {
	// Acquire semaphore
	select {
	case c.addSemaphore <- struct{}{}:
		defer func() { <-c.addSemaphore }()
	case <-time.After(10 * time.Second):
		return "", fmt.Errorf("timed out waiting for IPFS add semaphore")
	}

	fmt.Printf("DEBUG: Adding file to IPFS, size: %d bytes\n", len(fileContent))

	// Build AddOpts: pin if not in dev, and chunk at 256KiB
	addOpts := []shell.AddOpts{
		shell.Pin(!c.developmentMode),
		func(rb *shell.RequestBuilder) error {
			rb.Option("chunker", "size-256k")
			return nil
		},
	}

	// Call the Add method
	cid, err := c.shell.Add(bytes.NewReader(fileContent), addOpts...)
	if err != nil {
		fmt.Printf("DEBUG: Failed to add file to IPFS: %v\n", err)
		return "", fmt.Errorf("failed to add file to IPFS: %w", err)
	}

	fmt.Printf("DEBUG: Successfully added file to IPFS with CID: %s\n", cid)

	if !c.developmentMode {
		go func(cid string) {
			c.pinMutex.Lock()
			defer c.pinMutex.Unlock()

			pins, err := c.shell.Pins()
			if err != nil {
				fmt.Printf("WARNING: failed to list pins: %v\n", err)
			} else if _, ok := pins[cid]; !ok {
				fmt.Printf("WARNING: CID %s not found among pins\n", cid)
			} else {
				fmt.Printf("DEBUG: Successfully confirmed pin for CID: %s\n", cid)
			}
		}(cid)
	}

	return cid, nil
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
