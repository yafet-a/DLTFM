#!/bin/bash

# Function to display menu
show_teardown_menu() {
    echo "╔════════════════════════════════════╗"
    echo "║       Teardown Options Menu        ║"
    echo "╠════════════════════════════════════╣"
    echo "║ 1. Quick Cleanup (Chaincode Only)  ║"
    echo "║ 2. Full Network Teardown           ║"
    echo "║ 3. Exit                           ║"
    echo "╚════════════════════════════════════╝"
    echo "Enter your choice (1-3): "
}

# Get the directory of the current script
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FABRIC_SAMPLES_DIR=$(cd "$SCRIPT_DIR/../fabric-samples" && pwd)

# Function for quick cleanup
quick_cleanup() {
    echo "🧹 Performing quick cleanup (chaincode only)..."
    
    # Remove specific chaincode containers and images
    CHAINCODE_NAME="chaincode"
    echo "Removing chaincode containers..."
    docker rm -f $(docker ps -a | grep $CHAINCODE_NAME | awk '{print $1}') 2>/dev/null || true
    
    echo "Removing chaincode images..."
    docker rmi $(docker images | grep $CHAINCODE_NAME | awk '{print $3}') 2>/dev/null || true
    
    echo "✅ Quick cleanup completed!"
}

# Function for full teardown
full_teardown() {
    echo "🔄 Performing full network teardown..."
    
    cd "$FABRIC_SAMPLES_DIR/test-network" || exit
    ./network.sh down
    
    echo "Cleaning up all Docker containers and images..."
    docker rm -f $(docker ps -aq) 2>/dev/null || true
    docker rmi $(docker images -q --filter reference='dev-peer*') 2>/dev/null || true
    
    echo "✅ Full teardown completed!"
}

# Main menu logic
while true; do
    show_teardown_menu
    read -r choice
    
    case $choice in
        1)
            quick_cleanup
            break
            ;;
        2)
            full_teardown
            break
            ;;
        3)
            echo "Exiting..."
            exit 0
            ;;
        *)
            echo "❌ Invalid option. Please choose 1-3"
            ;;
    esac
done

# Add API call to unpin files from Pinata
curl -X DELETE ... # Unpin API endpoint