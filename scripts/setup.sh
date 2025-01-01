#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
INFO="ℹ️ "
SUCCESS="✅"
ERROR="❌"
WARN="⚠️ "

# Function to display menu
show_setup_menu() {
    echo "╔════════════════════════════════════╗"
    echo "║        Setup Options Menu          ║"
    echo "╠════════════════════════════════════╣"
    echo "║ 1. Deploy/Update Chaincode         ║"
    echo "║ 2. Setup Network + Deploy          ║"
    echo "║ 3. Exit                           ║"
    echo "╚════════════════════════════════════╝"
    echo "Enter your choice (1-3): "
}

# Get the directory of the current script
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FABRIC_SAMPLES_DIR=$(cd "$SCRIPT_DIR/../fabric-samples" && pwd)

# Function to log messages
log() {
    local level=$1
    local message=$2
    case $level in
        "info")    echo -e "${INFO} ${message}" ;;
        "success") echo -e "${SUCCESS} ${message}" ;;
        "error")   echo -e "${ERROR} ${message}" ;;
        "warn")    echo -e "${WARN} ${message}" ;;
        *)         echo -e "${message}" ;;
    esac
}

# Function to show progress
show_progress() {
    echo "→ $1"
}

# Function to check command status
check_status() {
    local status=$?
    local operation=$1
    if [ $status -eq 0 ]; then
        log "success" "$operation successful"
        return 0
    else
        log "error" "$operation failed with exit code: $status"
        if [ ! -z "$LAST_COMMAND_OUTPUT" ]; then
            echo "Last command output:"
            echo "$LAST_COMMAND_OUTPUT"
        fi
        return 1
    fi
}

# Function to verify Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        log "error" "Docker is not running. Please start Docker and try again."
        return 1
    fi
    return 0
}

# Function to set up network
setup_network() {
    log "info" "Setting up Hyperledger Fabric network..."
    
    cd "$FABRIC_SAMPLES_DIR/test-network" || exit
    
    # Check if network is already up
    if docker ps | grep -q "orderer.example.com"; then
        log "warn" "Network appears to be already running"
        read -p "Do you want to tear it down and restart? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            ./network.sh down
        else
            return 0
        fi
    fi
    
    ./network.sh up createChannel -c mychannel -ca
    check_status "Network setup" || return 1
}

# Function to deploy chaincode
deploy_chaincode() {
    log "info" "Starting chaincode deployment process..."
    
    # Set environment variables
    export PATH=$FABRIC_SAMPLES_DIR/bin:$PATH
    export FABRIC_CFG_PATH=$FABRIC_SAMPLES_DIR/config
    export CORE_PEER_TLS_ENABLED=true

    # Define chaincode parameters
    CHAINCODE_NAME="file-management-chaincode"
    CHAINCODE_VERSION="1.0"
    CHAINCODE_PATH="$SCRIPT_DIR/../file-management-chaincode/filemanagement.tar.gz"

    # Verify chaincode package exists
    if [ ! -f "$CHAINCODE_PATH" ]; then
        log "error" "Chaincode package not found at $CHAINCODE_PATH"
        return 1
    fi

    # Function to set organization context
    set_org_context() {
        local org=$1
        local port=$2
        export CORE_PEER_LOCALMSPID="${org}MSP"
        export CORE_PEER_TLS_ROOTCERT_FILE=$FABRIC_SAMPLES_DIR/test-network/organizations/peerOrganizations/${org,,}.example.com/peers/peer0.${org,,}.example.com/tls/ca.crt
        export CORE_PEER_MSPCONFIGPATH=$FABRIC_SAMPLES_DIR/test-network/organizations/peerOrganizations/${org,,}.example.com/users/Admin@${org,,}.example.com/msp
        export CORE_PEER_ADDRESS=localhost:$port
    }

    # Install and approve chaincode for both organizations
    for org in 1 2; do
        # Set org context
        set_org_context "Org$org" $((7051 + (org-1)*2000))
        
        # Check if chaincode is already installed
        show_progress "Checking if chaincode is already installed for Org$org..."
        INSTALLED_CHAINCODE=$(peer lifecycle chaincode queryinstalled 2>&1 | grep "${CHAINCODE_NAME}_${CHAINCODE_VERSION}" || true)
        
        if [ -z "$INSTALLED_CHAINCODE" ]; then
            show_progress "Installing chaincode for Org$org..."
            INSTALL_OUTPUT=$(peer lifecycle chaincode install "$CHAINCODE_PATH" 2>&1)
            if ! check_status "Chaincode installation for Org$org"; then
                echo "$INSTALL_OUTPUT"
                continue
            fi

            # Extract package ID - show full output for debugging
            echo "Full install output: $INSTALL_OUTPUT"
            
            # Try both patterns
            PACKAGE_ID=$(echo "$INSTALL_OUTPUT" | grep -o 'filemanagement_1:[a-f0-9]*')
            if [ -z "$PACKAGE_ID" ]; then
                PACKAGE_ID=$(echo "$INSTALL_OUTPUT" | grep -o "${CHAINCODE_NAME}_${CHAINCODE_VERSION}:[a-f0-9]*")
            fi
            
            if [ -z "$PACKAGE_ID" ]; then
                echo "Error: Unable to extract PACKAGE_ID from install output."
                echo "Install Output: $INSTALL_OUTPUT"
                return 1
            fi
            export PACKAGE_ID
            show_progress "📦 Package ID: $PACKAGE_ID"
        else
            log "success" "Chaincode already installed for Org$org"
            PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep -o 'filemanagement_1:[a-f0-9]*')
            if [ -z "$PACKAGE_ID" ]; then
                echo "Error: Unable to extract PACKAGE_ID from query output."
                return 1
            fi
            export PACKAGE_ID
            show_progress "📦 Using existing Package ID: $PACKAGE_ID"
        fi

        # Approve chaincode
        show_progress "Approving chaincode for Org$org..."
        peer lifecycle chaincode approveformyorg \
            --orderer localhost:7050 \
            --ordererTLSHostnameOverride orderer.example.com \
            --channelID mychannel \
            --name $CHAINCODE_NAME \
            --version $CHAINCODE_VERSION \
            --package-id $PACKAGE_ID \
            --sequence 1 \
            --tls \
            --cafile $FABRIC_SAMPLES_DIR/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
            --signature-policy "AND('Org1MSP.member','Org2MSP.member')"
        
        check_status "Chaincode approval for Org$org" || return 1
    done

    # Commit chaincode definition
    show_progress "Checking if chaincode is already committed..."
    COMMITTED_CHECK=$(peer lifecycle chaincode querycommitted --channelID mychannel --name $CHAINCODE_NAME 2>&1 || true)
    
    if [[ $COMMITTED_CHECK == *"404"* ]]; then
        show_progress "Committing chaincode to channel..."
        peer lifecycle chaincode commit \
            -o localhost:7050 \
            --ordererTLSHostnameOverride orderer.example.com \
            --channelID mychannel \
            --name $CHAINCODE_NAME \
            --version $CHAINCODE_VERSION \
            --sequence 1 \
            --tls \
            --cafile $FABRIC_SAMPLES_DIR/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
            --peerAddresses localhost:7051 \
            --tlsRootCertFiles $FABRIC_SAMPLES_DIR/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
            --peerAddresses localhost:9051 \
            --tlsRootCertFiles $FABRIC_SAMPLES_DIR/test-network/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt \
            --signature-policy "AND('Org1MSP.member','Org2MSP.member')"
        
        check_status "Chaincode commitment" || return 1
    else
        log "success" "Chaincode already committed"
    fi

    # Verify deployment
    show_progress "Verifying chaincode deployment..."
    peer lifecycle chaincode querycommitted --channelID mychannel --name $CHAINCODE_NAME
    check_status "Deployment verification" || return 1

    log "success" "Chaincode deployment completed successfully!"
    return 0
}

# Main menu logic
while true; do
    if ! check_docker; then
        exit 1
    fi

    show_setup_menu
    read -r choice
    
    case $choice in
        1)
            deploy_chaincode
            break
            ;;
        2)
            setup_network && deploy_chaincode
            break
            ;;
        3)
            log "info" "Exiting..."
            exit 0
            ;;
        *)
            log "error" "Invalid option. Please choose 1-3"
            ;;
    esac
done