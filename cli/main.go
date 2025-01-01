package main

import (
	"cli/commands"
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: dltfm <command> <filepath>")
		return
	}
	command := os.Args[1]
	filepath := os.Args[2]

	switch command {
	case "register":
		err := commands.RegisterFile(filepath, "user1")
		if err != nil {
			fmt.Printf("Error registering file %v\n", err)
		} else {
			fmt.Println("File successfully registered")
		}
	default:
		fmt.Println("Unknown command")
	}
}
