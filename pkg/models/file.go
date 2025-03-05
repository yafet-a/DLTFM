package models

import (
	"encoding/json"
	"fmt"
)

type File struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	Hash             string   `json:"hash"`
	StorageLocation  string   `json:"storageLocation"`
	Timestamp        string   `json:"timestamp"`
	Owner            string   `json:"owner"`
	Metadata         string   `json:"metadata"`
	Version          int      `json:"version"`
	PreviousID       string   `json:"previousID,omitempty"`
	Content          string   `json:"content"`
	Status           string   `json:"status"`
	RequiredOrgs     []string `json:"requiredOrgs"`
	CurrentApprovals []string `json:"currentApprovals"`
	EndorsementType  string   `json:"endorsementType"`
}

func (f *File) FormatCLI() string {
	var metadataMap map[string]interface{}
	json.Unmarshal([]byte(f.Metadata), &metadataMap)

	return fmt.Sprintf(`
File Details:
  ID:          %s
  Name:        %s
  Owner:       %s
  Created:     %s
  Version:     %d
  Hash:        %s
  Status:      %s
Metadata:
  Size:        %v bytes
  Type:        %v
  Created:     %v
  Previous ID: %s
Endorsement:
  Type:        %s
  Required:    %v
  Approved By: %v`,
		f.ID,
		f.Name,
		f.Owner,
		f.Timestamp,
		f.Version,
		f.Hash,
		f.Status,
		metadataMap["size"],
		metadataMap["type"],
		metadataMap["createdAt"],
		f.PreviousID,
		f.EndorsementType,
		f.RequiredOrgs,
		f.CurrentApprovals)
}

func FormatFileList(files []File) string {
	if len(files) == 0 {
		return "No files found in the ledger"
	}

	output := fmt.Sprintf("Found %d file(s):\n", len(files))
	for i, file := range files {
		if i > 0 {
			output += "\n---\n"
		}
		output += file.FormatCLI()
	}
	return output
}
