package models

type File struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Hash      string `json:"hash"`
	Timestamp string `json:"timestamp"`
	Owner     string `json:"owner"`
	Metadata  string `json:"metadata"`
	// AccessList []string `json:"accessList"`
}

// type Access struct {
// 	UserID      string `json:"userID"`
// 	AccessLevel string `json:"accessLevel"`
// }
