export interface File {
    id: string;
    name: string;
    hash: string;
    storageLocation: string;
    timestamp: string;
    owner: string;
    metadata: string;
    version: number;
    previousID?: string;
    content: string;
  }