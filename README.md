# DLTFM - Distributed Ledger Technology File Manager

DLTFM is a prototype for a secure, enterprise-grade file management system built on Hyperledger Fabric blockchain technology. It provides a robust solution for organizations that need to manage files with cryptographic verification, multi-party endorsement, and auditable version history.

## Features

- **Blockchain-backed file storage**: Files are securely stored with immutable records on Hyperledger Fabric
- **IPFS integration**: Large binary files are stored on IPFS with only references maintained on the blockchain
- **Multi-organization support**: Built for multi-party scenarios with separate organizational access
- **Endorsement policies**: Configurable file approval workflows (ANY, ALL, or SPECIFIC organizations)
- **Version control**: Full file versioning with detailed history tracking
- **Comprehensive audit logs**: All actions are recorded with timestamps and organizational attribution
- **User-friendly web interface**: Modern React-based UI with responsive design
- **Authentication**: Secure user authentication via Supabase

## Prerequisites

- Go 1.23+
- Node.js 18+
- Docker and Docker Compose
- Hyperledger Fabric 2.x binaries
- IPFS daemon

## Installation

### Clone the repository

```bash
git clone https://github.com/yafet-a/dltfm.git
cd dltfm
```

### Set up Hyperledger Fabric

1. Download Fabric samples and binaries (if you don't have them). You can find the specifics on the Fabric Documentation:

```
https://hyperledger-fabric.readthedocs.io/en/latest/getting_started.html
```

2. Create a symlink to the fabric-samples directory:

```bash
ln -s /path/to/fabric-samples fabric-samples
```

3. Start the network and deploy the chaincode:

```bash
./scripts/setup.sh
```

Follow the on-screen prompts to select option 2 (Setup Network + Deploy).

### Set up IPFS

1. Install IPFS if you don't have it already:

```bash
# For macOS
brew install ipfs

# For Linux
wget https://dist.ipfs.tech/kubo/v0.21.0/kubo_v0.21.0_linux-amd64.tar.gz
tar -xvzf kubo_v0.21.0_linux-amd64.tar.gz
cd kubo
sudo bash install.sh
```

2. Initialize and start the IPFS daemon:

```bash
ipfs init
ipfs daemon
```

### Set up Supabase

1. Create a Supabase account and project at [supabase.com](https://supabase.com)

2. Set up the following tables:
   - organizations
   - user_organizations
   - user_credentials

3. Create a `.env` file in the server directory:

```
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-supabase-service-key
```

### Start the backend server

```bash
cd server
go mod tidy
go run main.go
```

The server will start on http://localhost:8080

### Start the web application

```bash
cd web
npm install
# Create .env.local with your Supabase credentials
echo "NEXT_PUBLIC_SUPABASE_URL=your-supabase-url" > .env.local
echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key" >> .env.local
npm run dev
```

The web application will be available at http://localhost:3000

## Usage

### User Registration and Login

1. Open http://localhost:3000 in your browser
2. Register a new account or log in with existing credentials
3. Join an organization (Org1 or Org2)

### File Management

- **Upload Files**: Drag and drop files or use the file browser
- **Configure Endorsement**: Select a policy for file approvals
- **View Files**: Browse and search your organization's files
- **Approve Files**: Review and approve files based on endorsement policy
- **View History**: Check version history and audit logs for any file

## Development

### Project Structure

```
/
├── chaincode/              # Hyperledger Fabric chaincode
│   ├── handlers/           # Transaction handlers
│   ├── main.go             # Chaincode entry point
│   └── utils/              # Utility functions
├── pkg/
│   └── models/             # Shared data models
├── scripts/                # Setup and utility scripts
├── server/                 # Backend API server
│   ├── gateway/            # Fabric gateway connections
│   ├── ipfs/               # IPFS client
│   ├── middleware/         # API middleware
│   ├── supabase/           # Supabase client
│   └── main.go             # Server entry point
└── web/                    # Frontend application
    ├── public/             # Static assets
    └── src/
        ├── app/            # Next.js pages
        ├── components/     # React components
        ├── contexts/       # React contexts
        ├── lib/            # Utility functions
        └── types/          # TypeScript type definitions
```

### Running Tests

```bash
# Run chaincode tests
cd chaincode
go test ./... -v

# Run server tests
cd server
go test ./... -v

# Run frontend tests
cd web
npm test
```

## Contributing

Contributions are welcome in future! Please feel free to submit a Pull Request if you are interested or find something interesting to contribute

## License
This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Linux Foundation for maintaining the blockchain framework and documentation
- IPFS project for the distributed file storage system
