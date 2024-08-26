package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	// Define and parse command-line flags
	nameFlag := flag.String("name", "", "Name to greet")
	queryFlag := flag.String("query", "", "Search term to look for in files")
	directoryFlag := flag.String("directory", ".", "Directory to search for files")
	helpFlag := flag.Bool("help", false, "Show help message")
	flag.Parse()

	// Show help message if requested
	if *helpFlag {
		showHelp()
		return
	}

	// Handle the query functionality
	if *queryFlag != "" {
		if err := searchFiles(*queryFlag, *directoryFlag); err != nil {
			fmt.Printf("Error: %v\n", err)
		}
		return
	}

	// Handle the greeting functionality
	var name string
	if *nameFlag != "" {
		name = *nameFlag
	} else if len(flag.Args()) > 0 {
		name = flag.Arg(0)
	} else {
		// Prompt for user input if no arguments or flags are provided
		fmt.Print("Please enter your name: ")
		var input string
		fmt.Scanln(&input)
		name = strings.TrimSpace(input)
	}

	// Output greeting
	if name != "" {
		fmt.Printf("Hello, %s!\n", name)
	} else {
		fmt.Println("Hello, World!")
	}
}

// showHelp displays usage information for the program
func showHelp() {
	fmt.Println("Usage: go run main.go [flags] [name]")
	fmt.Println()
	fmt.Println("Flags:")
	fmt.Println("  -name string")
	fmt.Println("        Name to greet")
	fmt.Println("  -query string")
	fmt.Println("        Search term to look for in files")
	fmt.Println("  -directory string")
	fmt.Println("        Directory to search for files")
	fmt.Println("  -help")
	fmt.Println("        Show help message")
	fmt.Println()
	fmt.Println("If no name is provided, the program will prompt you to enter your name.")
}

// searchFiles searches for the query term in all files within the specified directory
func searchFiles(query, directory string) error {
	// Walk through the directory
	return filepath.Walk(directory, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			// Open the file and search for the query term
			file, err := os.Open(path)
			if err != nil {
				return err
			}
			defer file.Close()

			scanner := bufio.NewScanner(file)
			for scanner.Scan() {
				line := scanner.Text()
				if strings.Contains(line, query) {
					fmt.Printf("File: %s\n", path)
					break
				}
			}
			if err := scanner.Err(); err != nil {
				return err
			}
		}
		return nil
	})
}
