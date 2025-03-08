export interface File {
    id: string;
    name: string;
    hash: string;
    timestamp: string;
    owner: string;
    metadata: string;
    version: number;
    previousID?: string;
    ipfsLocation: string;
    status: string;               // "PENDING" or "APPROVED"
    requiredOrgs: string[];      // List of required MSP IDs
    currentApprovals: string[];  // List of MSP IDs that have approved
    endorsementType: string;     // "ANY_ORG", "ALL_ORGS", "SPECIFIC_ORGS"
  }