"use client"

import React, { useState } from "react"
import { Hash, User, FileText, ArrowLeftRight, RotateCcw, AlertTriangle } from "lucide-react"
import type { File as BlockchainFile } from "@/types/file";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Copy } from "lucide-react"
import { format } from "date-fns"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useEffect } from "react";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { FileVersionComparison } from "@/components/FileVersionComparison";
import { v4 as uuidv4 } from 'uuid';

interface AuditLogEntry {
  fileId: string;
  action: string;
  timestamp: string;
  userId: string;
  orgId: string;
  details: string;
}

interface VersionHistorySheetProps {
  file: BlockchainFile
  versions: BlockchainFile[]
  open: boolean
  onClose: () => void
  onRefresh?: () => void
}

const VersionHistorySheet: React.FC<VersionHistorySheetProps> = ({ 
  file, 
  versions, 
  open, 
  onClose,
  onRefresh 
}) => {
  const sortedVersions = [...versions].sort((a, b) => b.version - a.version);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<BlockchainFile | null>(null);
  const [restoringContent, setRestoringContent] = useState<Blob | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [compareVersions, setCompareVersions] = useState<{
    current: BlockchainFile;
    previous: BlockchainFile;
  } | null>(null);
  
  const { session } = useAuth();
  const { currentOrg } = useOrg();

  useEffect(() => {
    const fetchAuditLogs = async () => {
      if (!file || !open) return;
      
      try {
        setLoadingLogs(true);
        const response = await axios.get(
          `http://localhost:8080/api/files/${file.id}/audit`, 
          {
            headers: {
              Authorization: `Bearer ${session?.access_token}`,
              'X-Organization-ID': currentOrg?.id,
              'X-MSP-ID': currentOrg?.fabric_msp_id
            }
          }
        );
        setAuditLogs(response.data);
      } catch (error) {
        console.error("Failed to fetch audit logs:", error);
      } finally {
        setLoadingLogs(false);
      }
    };
    
    fetchAuditLogs();
  }, [file?.id, open, session, currentOrg]);

  // Fetch file content when restoring
  useEffect(() => {
    const fetchRestoringContent = async () => {
      if (!restoringVersion || !session || !currentOrg) return;
      
      try {
        const response = await axios.get(
          `http://localhost:8080/api/files/${restoringVersion.id}/content`,
          {
            headers: {
              Authorization: `Bearer ${session?.access_token}`,
              'X-Organization-ID': currentOrg?.id,
              'X-MSP-ID': currentOrg?.fabric_msp_id
            },
            responseType: 'blob'
          }
        );
        
        setRestoringContent(response.data);
      } catch (error) {
        console.error("Failed to fetch content for restoration:", error);
      }
    };
    
    if (restoringVersion) {
      fetchRestoringContent();
    } else {
      setRestoringContent(null);
    }
  }, [restoringVersion, session, currentOrg]);

  // Function to restore a specific version
  const handleRestoreVersion = async () => {
    if (!restoringVersion || !restoringContent || !session || !currentOrg) return;
    
    try {
      setIsRestoring(true);
      
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(restoringContent);
      reader.onloadend = async () => {
        const base64data = reader.result?.toString();
        
        // Remove the data URL prefix (e.g., "data:application/pdf;base64,")
        const base64Content = base64data ? base64data.split(',')[1] : '';
        
        // We're creating a new file version based on the content of the old version
        const payload = {
          id: uuidv4(),
          name: restoringVersion.name,
          content: base64Content,
          owner: session.user?.email || "unknown",
          metadata: restoringVersion.metadata,
          previousID: file.id, // Set the current version as the previous version
          endorsementConfig: {
            policyType: "ANY_ORG",
            requiredOrgs: [currentOrg.fabric_msp_id]
          }
        };

        await axios.post('http://localhost:8080/api/files', payload, {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            'X-Organization-ID': currentOrg?.id,
            'X-MSP-ID': currentOrg?.fabric_msp_id
          }
        });
        
        // Call the refresh callback if provided
        if (onRefresh) {
          onRefresh();
        }
        
        // Close the restore dialog and sheet
        setRestoringVersion(null);
        onClose();
      };
      
    } catch (error) {
      console.error("Failed to restore version:", error);
    } finally {
      setIsRestoring(false);
    }
  };

  // Function to compare versions
  const handleCompareVersions = (version: BlockchainFile) => {
    // Compare the selected version with the most recent version
    setCompareVersions({
      current: sortedVersions[0], // Latest version
      previous: version
    });
    setCompareDialogOpen(true);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[90vh] sm:h-[80vh] sm:max-w-4xl sm:mx-auto rounded-t-xl">
        <SheetHeader className="border-b pb-4 mb-4">
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <span className="font-semibold">File Details</span>
            {/* Added tooltip for the file name badge */}
            <TooltipProvider>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="ml-2">
                    {file.name}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{file.name}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </SheetTitle>
          <SheetDescription className="text-sm text-gray-500">
            View version history and audit logs for this file
          </SheetDescription>
        </SheetHeader>
          
        <Tabs defaultValue="versions" className="h-[calc(100%-5rem)]">
          <TabsList className="mb-4">
            <TabsTrigger value="versions">Version History</TabsTrigger>
            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          </TabsList>
          
          <TabsContent value="versions" className="h-full">
            <ScrollArea className="h-full">
              <div className="space-y-6 pr-4">
                {sortedVersions.map((version, index) => (
                  <div
                    // Use both id and index to ensure uniqueness
                    key={`${version.id}-${index}`}
                    className="flex items-start gap-4 p-4 border rounded-lg bg-white/70"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">Version {version.version}</span>
                          {index === 0 && (
                            <Badge variant="default" className="rounded-md text-sm px-2 py-1">
                              Latest Version
                            </Badge>
                          )}
                        </div>
                        <time className="text-xs text-gray-500">
                          {format(new Date(version.timestamp), "PPpp")}
                        </time>
                      </div>
                      <div className="rounded-lg border bg-muted/40 p-3">
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{version.owner}</span>
                        </div>
                        <Separator className="my-2" />
                        <div className="flex items-center gap-2 text-sm">
                          <Hash className="h-4 w-4 text-muted-foreground" />
                          <code className="font-mono text-xs">
                            {version.hash.slice(0, 30)}...
                          </code>
                          <TooltipProvider>
                            <Tooltip delayDuration={0}>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => navigator.clipboard.writeText(version.hash)}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Copy full hash</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        {/* Only show restore button on previous versions when viewing from the latest version */}
                        {index !== 0 && sortedVersions[0].id === file.id && (
                          <TooltipProvider>
                            <Tooltip delayDuration={0}>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="outline" 
                                  size="icon"
                                  onClick={() => setRestoringVersion(version)}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Restore this version</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        
                        {/* Don't show compare button for the latest version */}
                        {index !== 0 && (
                          <TooltipProvider>
                            <Tooltip delayDuration={0}>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="outline" 
                                  size="icon"
                                  onClick={() => handleCompareVersions(version)}
                                >
                                  <ArrowLeftRight className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Compare with current version</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          
          <TabsContent value="audit" className="h-full">
            <ScrollArea className="h-full">
              {loadingLogs ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No audit logs available for this file
                </div>
              ) : (
                <div className="space-y-4 pr-4">
                  {auditLogs.map((log, index) => (
                    <div key={index} className="p-4 border rounded-lg bg-white/70">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <Badge className={
                            log.action === "APPROVE" 
                              ? "bg-green-100 text-green-800" 
                              : log.action === "REGISTER" 
                                ? "bg-blue-100 text-blue-800"
                                : ""
                          }>
                            {log.action}
                          </Badge>
                          <span className="text-sm">{log.details}</span>
                        </div>
                        <time className="text-xs text-gray-500">
                          {format(new Date(log.timestamp), "PPpp")}
                        </time>
                      </div>
                      <div className="mt-2 text-xs text-gray-600 flex items-center gap-2">
                        <User className="h-3 w-3" />
                        <span>Organization: {log.orgId}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
    
    {/* Restore Version Confirmation Dialog */}
    <Dialog open={restoringVersion !== null} onOpenChange={(open) => !open && setRestoringVersion(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <span>Compare Versions</span>
            <Badge variant="outline" className="ml-2">
              {compareVersions?.current.name}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            Compare content differences between file versions
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex items-center p-4 bg-amber-50 text-amber-800 rounded-md">
          <AlertTriangle className="h-5 w-5 mr-2 shrink-0" />
          <p className="text-sm">
            This action will create a new version of the file. All endorsements will need to be collected again.
          </p>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setRestoringVersion(null)}>Cancel</Button>
          <Button 
            onClick={handleRestoreVersion} 
            disabled={isRestoring || !restoringContent}
          >
            {isRestoring ? "Restoring..." : "Restore Version"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    
    {/* File Comparison Dialog (rendered conditionally) */}
    {compareVersions && (
      <FileVersionComparison
        currentVersion={compareVersions.current}
        previousVersion={compareVersions.previous}
        open={compareDialogOpen}
        onClose={() => {
          setCompareDialogOpen(false);
          setCompareVersions(null);
          }}
        />
      )}
    </>
  );
}

export default VersionHistorySheet;