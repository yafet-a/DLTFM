package main

import (
	"cli/commands"
	"cli/tui"
	"dltfm/pkg/models"
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
	case "tui":
		// Start the TUI
		tui.Start()
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
		files, err := commands.QueryAllFiles()
		if err != nil {
			fmt.Printf("Error querying files: %v\n", err)
		} else {
			fmt.Println(models.FormatFileList(files))
		}
	case "query":
		if len(os.Args) < 3 {
			fmt.Println("Usage: dltfm query <fileID>")
			return
		}
		fileID := os.Args[2]
		file, err := commands.QueryFileByID(fileID)
		if err != nil {
			fmt.Printf("Error querying file: %v\n", err)
		} else {
			fmt.Println(models.FormatFileList([]models.File{*file}))
		}
	default:
		fmt.Println("Unknown command")
	}
}
