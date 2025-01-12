package tui

import (
	"cli/commands"
	"dltfm/pkg/models"
	"fmt"
	"os"
	"path/filepath"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// Styles remain the same as before...
var (
	primaryColor   = lipgloss.Color("#4a9eff")
	secondaryColor = lipgloss.Color("#888888")
	bgColor        = lipgloss.Color("#2a2a2a")

	baseStyle = lipgloss.NewStyle().
			BorderStyle(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#333333")).
			Padding(1)

	containerStyle = baseStyle.Copy().
			Background(bgColor).
			Width(60)

	titleStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#ffffff")).
			Bold(true).
			MarginLeft(2)

	selectedItemStyle = lipgloss.NewStyle().
				Foreground(primaryColor).
				PaddingLeft(2).
				SetString("> ")

	unselectedItemStyle = lipgloss.NewStyle().
				Foreground(secondaryColor).
				PaddingLeft(4)

	statusBarStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#666666")).
			Align(lipgloss.Left)
)

type Model struct {
	state          string
	currentUser    string
	menuItems      []string
	selected       int
	width          int
	height         int
	usernameInput  textinput.Model
	files          []models.File
	fileError      error
	errMsg         string
	uploadDir      string
	registerInput  textinput.Model
	fileSelected   int
	showingDetails bool
}

func initialModel() Model {
	// Initialize text input
	ti := textinput.New()
	ti.Placeholder = "Enter username"
	ti.Focus()
	ti.CharLimit = 32
	ti.Width = 20

	ri := textinput.New()
	ri.Placeholder = "Enter file path (e.g., testfiles/sample.txt)"
	ri.Width = 40

	uploadDir := "testfiles"

	return Model{
		state:         "login",
		menuItems:     []string{"Register New File", "View Files", "Search Files", "User Settings", "Help", "Logout"},
		selected:      0,
		usernameInput: ti,
		registerInput: ri,
		uploadDir:     uploadDir,
	}
}

func (m Model) Init() tea.Cmd {
	return textinput.Blink // Start the cursor blinking
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "q":
			if m.state == "files" || m.state == "register" {
				m.state = "menu"
				return m, nil
			}
			return m, tea.Quit
		case "enter":
			switch m.state {
			case "login":
				username := m.usernameInput.Value()
				if username == "" {
					m.errMsg = "Username cannot be empty"
					return m, nil
				}
				// Here you could add actual authentication logic
				m.currentUser = username
				m.state = "menu"
				m.errMsg = ""
				return m, nil
			case "menu":
				// Handle menu selection
				switch m.menuItems[m.selected] {
				case "Logout":
					m.state = "login"
					m.currentUser = ""
					m.usernameInput.Reset()
					m.errMsg = ""
					return m, nil
				case "View Files":
					m.loadFiles()
					m.state = "files"
					return m, nil
				case "Register New File":
					m.state = "register"
					m.registerInput.Reset()
					return m, nil
				}
			case "files":
				if len(m.files) > 0 {
					m.showingDetails = !m.showingDetails
				}
				return m, nil
			case "register":
				// Handle file selection
				entries, err := os.ReadDir(m.uploadDir)
				if err != nil {
					m.errMsg = fmt.Sprintf("Error reading directory: %v", err)
					return m, nil
				}

				var files []string
				for _, entry := range entries {
					if !entry.IsDir() {
						files = append(files, entry.Name())
					}
				}

				if len(files) > 0 {
					selectedFile := filepath.Join(m.uploadDir, files[m.fileSelected])
					err := commands.RegisterFile(selectedFile, m.currentUser)
					if err != nil {
						m.errMsg = fmt.Sprintf("Error registering file: %v", err)
						return m, nil
					}
					m.state = "menu"
					m.errMsg = ""
				}
				return m, nil
			}
		case "up", "k":
			if m.state == "menu" && m.selected > 0 {
				m.selected--
			} else if m.state == "register" && m.fileSelected > 0 {
				m.fileSelected--
			} else if m.state == "files" && m.selected > 0 {
				m.selected--
			}
		case "down", "j":
			if m.state == "menu" && m.selected < len(m.menuItems)-1 {
				m.selected++
			} else if m.state == "register" {
				entries, _ := os.ReadDir(m.uploadDir)
				var fileCount int
				for _, entry := range entries {
					if !entry.IsDir() {
						fileCount++
					}
				}
				if m.fileSelected < fileCount-1 {
					m.fileSelected++
				}
			} else if m.state == "files" && m.selected < len(m.files)-1 {
				m.selected++
			}
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
	}

	// Handle text input updates
	if m.state == "login" {
		m.usernameInput, cmd = m.usernameInput.Update(msg)
		return m, cmd
	} else if m.state == "register" {
		m.registerInput, cmd = m.registerInput.Update(msg)
		return m, cmd
	}

	return m, nil
}

func (m Model) loginView() string {
	container := containerStyle.Copy().Width(40).Render(
		lipgloss.JoinVertical(
			lipgloss.Left,
			titleStyle.Render("DLTFM Login"),
			"\n",
			baseStyle.Copy().
				Background(lipgloss.Color("#333333")).
				Width(30).
				Render(m.usernameInput.View()),
			"\n",
			lipgloss.NewStyle().
				Foreground(secondaryColor).
				Render("[Enter] Login [Ctrl+c] Quit"),
			"\n",
			lipgloss.NewStyle().
				Foreground(lipgloss.Color("#ff0000")).
				Render(m.errMsg),
		),
	)
	return lipgloss.Place(
		m.width,
		m.height,
		lipgloss.Center,
		lipgloss.Center,
		container,
	)
}

func (m Model) menuView() string {
	var menuItems []string
	for i, item := range m.menuItems {
		if i == m.selected {
			menuItems = append(menuItems, selectedItemStyle.Render(item))
		} else {
			menuItems = append(menuItems, unselectedItemStyle.Render(item))
		}
	}

	menu := lipgloss.JoinVertical(
		lipgloss.Left,
		titleStyle.Render("Main Menu"),
		"\n",
		lipgloss.JoinVertical(lipgloss.Left, menuItems...),
		"\n\n",
		statusBarStyle.Render("Connected to: test-network"),
		statusBarStyle.Render(fmt.Sprintf("User: %s", m.currentUser)),
	)

	container := containerStyle.Render(menu)
	return lipgloss.Place(
		m.width,
		m.height,
		lipgloss.Center,
		lipgloss.Center,
		container,
	)
}

func (m Model) fileListView() string {
	if m.fileError != nil {
		return containerStyle.Render(
			lipgloss.JoinVertical(
				lipgloss.Left,
				titleStyle.Render("Files"),
				"\n",
				lipgloss.NewStyle().
					Foreground(lipgloss.Color("#ff0000")).
					Render(m.fileError.Error()),
			),
		)
	}

	if m.showingDetails {
		// Show detailed view of selected file
		content := lipgloss.JoinVertical(
			lipgloss.Left,
			titleStyle.Render("File Details"),
			"\n",
			unselectedItemStyle.Render(models.FormatFileList([]models.File{m.files[m.selected]})),
			"\n",
			lipgloss.NewStyle().
				Foreground(secondaryColor).
				Render("[Enter] Back to list [q] Back to Menu"),
		)
		return containerStyle.Render(content)
	}

	// Show file list view
	var items []string
	for i, file := range m.files {
		item := fmt.Sprintf("%s (Owner: %s)", file.Name, file.Owner)
		if i == m.selected {
			items = append(items, selectedItemStyle.Render(item))
		} else {
			items = append(items, unselectedItemStyle.Render(item))
		}
	}

	if len(items) == 0 {
		items = append(items, unselectedItemStyle.Render("No files found"))
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		titleStyle.Render("Files"),
		"\n",
		lipgloss.JoinVertical(lipgloss.Left, items...),
		"\n",
		lipgloss.NewStyle().
			Foreground(secondaryColor).
			Render("[↑/↓] Navigate [Enter] View Details [q] Back to Menu"),
	)

	return containerStyle.Render(content)
}

func (m Model) registerView() string {
	var items []string

	entries, err := os.ReadDir(m.uploadDir)
	if err != nil {
		items = append(items, unselectedItemStyle.Render(fmt.Sprintf("Error reading directory: %v", err)))
	} else {
		for i, entry := range entries {
			if !entry.IsDir() {
				name := entry.Name()
				if i == m.fileSelected {
					items = append(items, selectedItemStyle.Render(fmt.Sprintf("📄 %s", name)))
				} else {
					items = append(items, unselectedItemStyle.Render(fmt.Sprintf("📄 %s", name)))
				}
			}
		}
		if len(items) == 0 {
			items = append(items, unselectedItemStyle.Render("No files in testfiles directory"))
		}
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		titleStyle.Render("Register New File"),
		titleStyle.Copy().MarginLeft(0).Render(fmt.Sprintf("\nFiles in %s:", m.uploadDir)),
		"\n",
		lipgloss.JoinVertical(lipgloss.Left, items...),
		"\n",
		lipgloss.NewStyle().
			Foreground(secondaryColor).
			Render("[↑/↓] Navigate [Enter] Select [q] Back"),
		"\n",
		lipgloss.NewStyle().
			Foreground(lipgloss.Color("#ff0000")).
			Render(m.errMsg),
	)

	return containerStyle.Render(content)
}

func (m Model) View() string {
	switch m.state {
	case "login":
		return m.loginView()
	case "menu":
		return m.menuView()
	case "files":
		return m.fileListView()
	case "register":
		return m.registerView()
	default:
		return "Unknown state"
	}
}

func (m *Model) loadFiles() {
	files, err := commands.QueryAllFiles()
	if err != nil {
		m.fileError = err
		return
	}
	m.files = files
}

func Start() {
	p := tea.NewProgram(
		initialModel(),
		tea.WithAltScreen(),
		tea.WithMouseCellMotion(),
	)

	if _, err := p.Run(); err != nil {
		fmt.Printf("Error running program: %v", err)
		os.Exit(1)
	}
}
