package middleware

import (
	"dltfm/server/supabase"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func AuthRequired(supabaseClient *supabase.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get the Authorization header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "No authorization header"})
			return
		}

		// Extract the token
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header"})
			return
		}
		token := parts[1]

		// Verify the token
		userID, err := supabaseClient.VerifyToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			return
		}

		// Get user's organizations
		organizations, err := supabaseClient.GetUserOrganizations(userID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user organizations"})
			return
		}

		// Get the organization context from headers
		requestedMSPID := c.GetHeader("X-MSP-ID")
		if requestedMSPID == "" {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "No organization specified"})
			return
		}

		// Verify user has access to the requested organization
		var validOrg *supabase.Organization
		for _, org := range organizations {
			if org.FabricMSPID == requestedMSPID {
				validOrg = &org
				break
			}
		}

		if validOrg == nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "User does not have access to this organization"})
			return
		}

		// Store user and organization info in context
		c.Set("userID", userID)
		c.Set("organization", validOrg)
		c.Set("orgName", validOrg.Name)
		c.Set("mspID", validOrg.FabricMSPID)

		c.Next()
	}
}
