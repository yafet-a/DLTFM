#!/bin/bash
echo "Shutting down the Hyperledger Fabric test network..."
cd /home/yafet/cs310/dltfm/fabric-samples/test-network || exit
./network.sh down
echo "Test network has been shut down!"
