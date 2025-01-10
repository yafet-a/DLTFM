package models

type File struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Hash            string `json:"hash"`
	StorageLocation string `json:"storageLocation"`
	Timestamp       string `json:"timestamp"`
	Owner           string `json:"owner"`
	Metadata        string `json:"metadata"`
	Version         int    `json:"version"`
	PreviousHash    string `json:"previousHash,omitempty"`
}

// type Access struct {
// 	UserID      string `json:"userID"`
// 	AccessLevel string `json:"accessLevel"`
// }
