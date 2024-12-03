package utils

import (
	"crypto/sha256"
	"fmt"
)

// ComputeHash calculates the SHA-256 hash of the input string
func ComputeHash(input string) string {
	hash := sha256.Sum256([]byte(input))
	return fmt.Sprintf("%x", hash)
}
