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
    echo "║ 3. Exit                            ║"
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

get_current_version() {
    local cc_name=$1
    local version="1.0.0"  # default version
    
    # Try to get current committed version
    local committed_info=$(peer lifecycle chaincode querycommitted -C mychannel -n $cc_name 2>&1)
    if ! echo "$committed_info" | grep -q "not found"; then
        version=$(echo "$committed_info" | grep -o "Version: [0-9.]*" | cut -d' ' -f2)
    fi
    echo $version
}

# Function to increment version
increment_version() {
    local version=$1
    local major minor patch
    
    IFS='.' read -r major minor patch <<< "$version"
    patch=$((patch + 1))
    echo "$major.$minor.$patch"
}

# Function to deploy chaincode
deploy_chaincode() {
    log "info" "Starting chaincode deployment process..."

    # Set environment variables
    export PATH=$FABRIC_SAMPLES_DIR/bin:$PATH
    export FABRIC_CFG_PATH=$FABRIC_SAMPLES_DIR/config
    export CORE_PEER_TLS_ENABLED=true

    # Define chaincode parameters
    CHAINCODE_NAME="chaincode"
    CHAINCODE_VERSION="1.0"
    CHAINCODE_LABEL="${CHAINCODE_NAME}_${CHAINCODE_VERSION}"
    CHAINCODE_PATH="$SCRIPT_DIR/../chaincode/chaincode.tar.gz"

    # Verify chaincode package exists
    if [ ! -f "$CHAINCODE_PATH" ]; then
        log "error" "Chaincode package not found at $CHAINCODE_PATH"
        return 1
    fi

    # Get current sequence number
    COMMITTED_INFO=$(peer lifecycle chaincode querycommitted -C mychannel -n $CHAINCODE_NAME 2>&1)
    echo "Debug - Committed info: $COMMITTED_INFO"  # Add this line

    if echo "$COMMITTED_INFO" | grep -q "Chaincode definition for name.*not found"; then
        # Chaincode not committed yet, start with sequence 1
        SEQUENCE=1
        echo "Debug - Setting initial sequence to 1"  # Add this line
    else
        # Get current sequence and increment
        CURRENT_SEQUENCE=$(echo "$COMMITTED_INFO" | grep -o "Sequence: [0-9]*" | cut -d' ' -f2)
        SEQUENCE=$((CURRENT_SEQUENCE + 1))
        echo "Debug - Incrementing sequence from $CURRENT_SEQUENCE to $SEQUENCE"  # Add this line
    fi

    # Function to set organization context
    # Before setting org context
    set_org_context() {
        local org=$1
        local port=$2
        echo "Debug - Setting context for $org"
        export CORE_PEER_LOCALMSPID="${org}MSP"
        export CORE_PEER_TLS_ROOTCERT_FILE=$FABRIC_SAMPLES_DIR/test-network/organizations/peerOrganizations/${org,,}.example.com/peers/peer0.${org,,}.example.com/tls/ca.crt
        export CORE_PEER_MSPCONFIGPATH=$FABRIC_SAMPLES_DIR/test-network/organizations/peerOrganizations/${org,,}.example.com/users/Admin@${org,,}.example.com/msp
        export CORE_PEER_ADDRESS=localhost:$port
        
        # Verify environment
        echo "Debug - Checking environment for $org:"
        echo "CORE_PEER_LOCALMSPID: $CORE_PEER_LOCALMSPID"
        echo "CORE_PEER_ADDRESS: $CORE_PEER_ADDRESS"
    }

    # Install and approve chaincode for both organizations
    for org in 1 2; do
        # Set org context
        set_org_context "Org$org" $((7051 + (org-1)*2000))

        # Check if chaincode is already installed
        show_progress "Checking if chaincode is already installed for Org$org..."
        INSTALLED_CHAINCODE=$(peer lifecycle chaincode queryinstalled --output json 2>&1)
        PACKAGE_ID=""  # Initialize as empty

        # Only try jq if we have installed chaincodes
        if [ "$(echo "$INSTALLED_CHAINCODE" | jq '.installed_chaincodes | length')" -gt 0 ]; then
            PACKAGE_ID=$(echo "$INSTALLED_CHAINCODE" | jq -r --arg LABEL "$CHAINCODE_LABEL" '.installed_chaincodes[] | select(.label==$LABEL) | .package_id')
        fi

        if [ -z "$PACKAGE_ID" ]; then
            show_progress "Installing chaincode for Org$org..."
            # Install without --output json flag
            INSTALL_OUTPUT=$(peer lifecycle chaincode install "$CHAINCODE_PATH" 2>&1)
            if ! check_status "Chaincode installation for Org$org"; then
                echo "$INSTALL_OUTPUT"
                continue
            fi

            # Query again to get the package ID after installation
            INSTALLED_CHAINCODE=$(peer lifecycle chaincode queryinstalled --output json 2>&1)
            PACKAGE_ID=$(echo "$INSTALLED_CHAINCODE" | jq -r '.installed_chaincodes[0].package_id')
            
            if [ -z "$PACKAGE_ID" ]; then
                log "error" "Unable to extract PACKAGE_ID after installation."
                echo "Installed chaincodes: $INSTALLED_CHAINCODE"
                return 1
            fi
            show_progress "📦 Package ID: $PACKAGE_ID"
        else
            log "success" "Chaincode already installed for Org$org"
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
            --sequence $SEQUENCE \
            --tls \
            --cafile $FABRIC_SAMPLES_DIR/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
            --signature-policy "OR('Org1MSP.member','Org2MSP.member')"

        check_status "Chaincode approval for Org$org" || return 1
    done

    # Commit chaincode definition
    show_progress "Checking approved chaincode definitions..."
    for org in 1 2; do
        set_org_context "Org$org" $((7051 + (org-1)*2000))
        echo "Debug - Approved chaincode definition for Org$org:"
        peer lifecycle chaincode queryapproved -C mychannel -n $CHAINCODE_NAME
    done
    show_progress "Committing chaincode to channel with sequence $SEQUENCE..."
    peer lifecycle chaincode commit \
        -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.example.com \
        --channelID mychannel \
        --name $CHAINCODE_NAME \
        --version $CHAINCODE_VERSION \
        --sequence $SEQUENCE \
        --tls \
        --cafile $FABRIC_SAMPLES_DIR/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
        --peerAddresses localhost:7051 \
        --tlsRootCertFiles $FABRIC_SAMPLES_DIR/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
        --peerAddresses localhost:9051 \
        --tlsRootCertFiles $FABRIC_SAMPLES_DIR/test-network/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt \
        --signature-policy "OR('Org1MSP.member','Org2MSP.member')"

    check_status "Chaincode commitment" || return 1

    # Verify deployment
    show_progress "Verifying chaincode deployment..."
    peer lifecycle chaincode querycommitted --channelID mychannel --name $CHAINCODE_NAME
    check_status "Deployment verification" || return 1

    log "success" "Chaincode deployment completed successfully!"
    return 0
}
package_chaincode() {
    log "info" "Packaging chaincode..."
    
    # Navigate to chaincode directory
    cd "$SCRIPT_DIR/../chaincode" || return 1
    
    # Ensure dependencies are up to date
    go mod tidy
    
    # Package using peer lifecycle command
    peer lifecycle chaincode package chaincode.tar.gz \
        --path . \
        --lang golang \
        --label chaincode_1.0
        
    if [ $? -eq 0 ]; then
        log "success" "Created new chaincode package"
        PACKAGE_SIZE=$(du -h chaincode.tar.gz | cut -f1)
        log "info" "Package size: $PACKAGE_SIZE"
        return 0
    else
        log "error" "Failed to create chaincode package"
        return 1
    fi
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
            read -p "Do you want to repackage the chaincode first? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                package_chaincode || exit 1
            fi
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