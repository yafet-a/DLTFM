package main

import (
	"cli/commands"
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: dltfm <command> [filepath]")
		return
	}
	command := os.Args[1]

	switch command {
	case "register":
		if len(os.Args) < 3 {
			fmt.Println("Usage: dltfm register <filepath>")
			return
		}
		filepath := os.Args[2]
		err := commands.RegisterFile(filepath, "user1")
		if err != nil {
			fmt.Printf("Error registering file: %v\n", err)
		} else {
			fmt.Println("File successfully registered")
		}
	case "queryall":
		if err := commands.QueryAllFiles(); err != nil {
			fmt.Printf("Error querying files: %v\n", err)
		}
	default:
		fmt.Println("Unknown command")
	}
}
