#!/bin/bash

# Navigate to the test network directory
echo "Navigating to the test network directory..."
cd /home/yafet/cs310/dltfm/fabric-samples/test-network || exit

# Bring up the test network, create the channel, and enable CA
echo "Bringing up the Hyperledger Fabric test network..."
./network.sh up createChannel -c mychannel -ca

# Set environment variables for Org1
echo "Setting up environment variables for Org1..."
export PATH=/home/yafet/cs310/dltfm/fabric-samples/bin:$PATH
export FABRIC_CFG_PATH=/home/yafet/cs310/dltfm/fabric-samples/config
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_MSPCONFIGPATH=/home/yafet/cs310/dltfm/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_TLS_ROOTCERT_FILE=/home/yafet/cs310/dltfm/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_ADDRESS=localhost:7051
export CORE_PEER_TLS_ENABLED=true

# Provide feedback to the user
echo "Test network is up, channel 'mychannel' created, and environment variables set!"
