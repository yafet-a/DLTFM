package models

type AuditLog struct {
	FileID    string `json:"fileId"`
	Action    string `json:"action"`
	Timestamp string `json:"timestamp"`
	UserID    string `json:"userId"`
	OrgID     string `json:"orgId"`
	Details   string `json:"details,omitempty"`
}
