interface AuditLogEntry {
    fileId: string;
    action: string;
    timestamp: string;
    userId: string;
    orgId: string;
    details: string;
  }