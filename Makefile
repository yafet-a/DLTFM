# The name of the output binary
BINARY_NAME=main

# Default target: build the binary
all: build

# Build the binary
build:
	@echo "Building the Go project..."
	go build -o $(BINARY_NAME)

# Clean build artifacts
clean:
	@echo "Cleaning up..."
	rm -f $(BINARY_NAME)

# Run the binary
run: build
	@echo "Running the Go project..."
	./$(BINARY_NAME)

# Help message
help:
	@echo "Makefile commands:"
	@echo "  make build  - Build the binary"
	@echo "  make clean  - Remove the binary"
	@echo "  make run    - Build and run the binary"
	@echo "  make help   - Show this help message"
