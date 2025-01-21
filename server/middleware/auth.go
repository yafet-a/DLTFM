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

		// Get user's Fabric credentials
		creds, err := supabaseClient.GetUserCredentials(userID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user credentials"})
			return
		}

		// Store user info in context
		c.Set("userID", userID)
		c.Set("userCredentials", creds)

		c.Next()
	}
}
