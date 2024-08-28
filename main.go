package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

func main() {
	// Define and parse command-line flags
	queryFlag := flag.String("query", "", "Search term to look for in files")
	directoryFlag := flag.String("directory", ".", "Directory to search for files")

	flag.Parse()

	// Handle the query functionality
	if *queryFlag != "" {
		// Expand the home directory if needed
		dir := *directoryFlag
		if strings.HasPrefix(dir, "~/") {
			homeDir, err := os.UserHomeDir()
			if err != nil {
				fmt.Printf("Error: %v\n", err)
				return
			}
			dir = filepath.Join(homeDir, dir[2:])
		}

		fmt.Printf("Searching in directory: %s\n", dir) // Debug print

		if err := searchFiles(*queryFlag, dir); err != nil {
			fmt.Printf("Error: %v\n", err)
		}
		return
	}
}

// searchFiles searches for the query term in all files within the specified directory
func searchFiles(query, directory string) error {
	var matchingFiles []string

	// Walk through the directory
	err := filepath.Walk(directory, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			// Check if the file contains the query term
			contains, err := fileContainsQuery(query, path)
			if err != nil {
				return err
			}
			if contains {
				matchingFiles = append(matchingFiles, path)
			}
		}
		return nil
	})
	if err != nil {
		return err
	}

	// Display matching files and prompt for selection
	if len(matchingFiles) > 0 {
		fmt.Println("Matching files:")
		for i, file := range matchingFiles {
			fmt.Printf("%d: %s\n", i+1, file)
		}

		selectedFiles, err := selectFiles(matchingFiles)
		if err != nil {
			return err
		}

		for _, file := range selectedFiles {
			if err := displayFile(query, file); err != nil {
				fmt.Printf("Error displaying file: %v\n", err)
			}
		}
	} else {
		fmt.Println("No matching files found.")
	}

	return nil
}

// fileContainsQuery checks if a file contains the query term
func fileContainsQuery(query, path string) (bool, error) {
	file, err := os.Open(path)
	if err != nil {
		return false, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, query) {
			return true, nil
		}
	}
	if err := scanner.Err(); err != nil {
		return false, err
	}
	return false, nil
}

// selectFiles prompts the user to select files from the list
func selectFiles(files []string) ([]string, error) {
	fmt.Print("Enter the numbers of the files you want to view (comma-separated): ")
	var input string
	fmt.Scanln(&input)
	selections := strings.Split(input, ",")

	var selectedFiles []string
	for _, selection := range selections {
		index, err := strconv.Atoi(strings.TrimSpace(selection))
		if err != nil || index < 1 || index > len(files) {
			fmt.Printf("Invalid selection: %s\n", selection)
			continue
		}
		selectedFiles = append(selectedFiles, files[index-1])
	}
	return selectedFiles, nil
}

// displayFile displays the content of the file with the query term highlighted
func displayFile(query, path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	fmt.Printf("Displaying file: %s\n", path)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, query) {
			highlightedLine := strings.ReplaceAll(line, query, "\033[31m"+query+"\033[0m")
			fmt.Println(highlightedLine)
		} else {
			fmt.Println(line)
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}

	// Prompt for editing
	fmt.Print("Do you want to edit this file? (y/n): ")
	var response string
	fmt.Scanln(&response)
	if strings.ToLower(response) == "y" {
		// Open the file in the default editor
		cmd := exec.Command("xdg-open", path)
		cmd.Start()
	}

	return nil
}
