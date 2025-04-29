package supabase

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/joho/godotenv"
)

type Client struct {
	projectURL string
	serviceKey string
	httpClient *http.Client
}

type UserCredentials struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	OrgName        string    `json:"org_name"`
	EnrollmentID   string    `json:"enrollment_id"`
	CertPath       string    `json:"certificate_path"`
	PrivateKeyPath string    `json:"private_key_path"`
	MSPID          string    `json:"msp_id"`
	CreatedAt      time.Time `json:"created_at"`
}

type Organization struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	FabricMSPID string    `json:"fabric_msp_id"`
	CAURL       string    `json:"ca_url"`
	CreatedAt   time.Time `json:"created_at"`
}

type UserOrganization struct {
	UserID string       `json:"user_id"`
	OrgID  string       `json:"org_id"`
	Role   string       `json:"role"`
	Org    Organization `json:"organizations"`
}

func (c *Client) GetUserOrganizations(userID string) ([]Organization, error) {
	req, err := http.NewRequest("GET",
		fmt.Sprintf("%s/rest/v1/user_organizations?user_id=eq.%s&select=organizations(*)", c.projectURL, userID),
		nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.serviceKey))
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get user organizations: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to get user organizations (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var userOrgs []UserOrganization
	if err := json.NewDecoder(resp.Body).Decode(&userOrgs); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	organizations := make([]Organization, len(userOrgs))
	for i, userOrg := range userOrgs {
		organizations[i] = userOrg.Org
	}

	return organizations, nil
}

// NewClient creates a new Supabase client
func NewClient() (*Client, error) {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		return nil, fmt.Errorf("error loading .env file: %w", err)
	}

	projectURL := os.Getenv("SUPABASE_URL")
	if projectURL == "" {
		return nil, fmt.Errorf("SUPABASE_URL environment variable is not set")
	}

	serviceKey := os.Getenv("SUPABASE_SERVICE_KEY")
	if serviceKey == "" {
		return nil, fmt.Errorf("SUPABASE_SERVICE_KEY environment variable is not set")
	}

	return &Client{
		projectURL: projectURL,
		serviceKey: serviceKey,
		httpClient: &http.Client{
			Timeout: time.Second * 10,
		},
	}, nil
}

// VerifyToken verifies a JWT token from the client
func (c *Client) VerifyToken(token string) (string, error) {
	req, err := http.NewRequest("GET", fmt.Sprintf("%s/auth/v1/user", c.projectURL), nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to verify token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("invalid token (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var result struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	return result.ID, nil
}

// GetUserCredentials gets a user's Fabric credentials from the database
func (c *Client) GetUserCredentials(userID string) (*UserCredentials, error) {
	req, err := http.NewRequest("GET",
		fmt.Sprintf("%s/rest/v1/user_credentials?user_id=eq.%s&select=*", c.projectURL, userID),
		nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.serviceKey))
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get user credentials: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to get user credentials (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var credentials []UserCredentials
	if err := json.NewDecoder(resp.Body).Decode(&credentials); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(credentials) == 0 {
		return nil, nil
	}

	return &credentials[0], nil
}

// SaveUserCredentials saves a user's Fabric credentials to the database
func (c *Client) SaveUserCredentials(creds *UserCredentials) error {
	body, err := json.Marshal(creds)
	if err != nil {
		return fmt.Errorf("failed to marshal credentials: %w", err)
	}

	req, err := http.NewRequest("POST",
		fmt.Sprintf("%s/rest/v1/user_credentials", c.projectURL),
		bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.serviceKey))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "return=minimal")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to save user credentials: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to save user credentials (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}
