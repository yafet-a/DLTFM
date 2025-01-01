package utils

import (
	"crypto/sha256"
	"fmt"
	"os"
)

// ComputeSHA256 computes the SHA-256 hash of a file's content.
func ComputeSHA256(filePath string) (string, error) {
	file, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}

	hash := sha256.Sum256(file)
	return fmt.Sprintf("%x", hash), nil
}

// GetFileMetadata returns the file name and size.
func GetFileMetadata(filePath string) (string, int64, error) {
	info, err := os.Stat(filePath)
	if err != nil {
		return "", 0, err
	}

	return info.Name(), info.Size(), nil
}
