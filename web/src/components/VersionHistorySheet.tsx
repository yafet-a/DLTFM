"use client"

import type React from "react"
import { Hash, User, FileText, ArrowLeftRight, RotateCcw } from "lucide-react"
import type { File as BlockchainFile } from "@/types/file";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
// import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Copy } from "lucide-react"
import { format } from "date-fns"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";

interface VersionHistorySheetProps {
  file: BlockchainFile
  versions: BlockchainFile[]
  open: boolean
  onClose: () => void
}


const VersionHistorySheet: React.FC<VersionHistorySheetProps> = ({ file, versions, open, onClose }) => {
  const sortedVersions = [...versions].sort((a, b) => b.version - a.version);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const { session } = useAuth();
  const { currentOrg } = useOrg();

  useEffect(() => {
    const fetchAuditLogs = async () => {
      if (!file || !open) return;
      
      try {
        setLoadingLogs(true);
        const response = await axios.get(`http://localhost:8080/api/files/${file.id}/audit`, {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            'X-Organization-ID': currentOrg?.id,
            'X-MSP-ID': currentOrg?.fabric_msp_id
          }
        });
        setAuditLogs(response.data);
      } catch (error) {
        console.error("Failed to fetch audit logs:", error);
      } finally {
        setLoadingLogs(false);
      }
    };
    
    fetchAuditLogs();
  }, [file?.id, open, session, currentOrg]);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[90vh] sm:h-[80vh] sm:max-w-4xl sm:mx-auto rounded-t-xl">
        <SheetHeader className="border-b pb-4 mb-4">
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <span className="font-semibold">File Details</span>
            <Badge variant="outline" className="ml-2">
              {file.name}
            </Badge>
          </SheetTitle>
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
                    key={version.id}
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
                                <Button variant="ghost" size="icon" onClick={() => navigator.clipboard.writeText(version.hash)}>
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
                        <TooltipProvider>
                          <Tooltip delayDuration={0}>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="icon">
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Restore this version</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip delayDuration={0}>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="icon">
                                <ArrowLeftRight className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Compare with current version</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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
                          <Badge className={log.action === "APPROVE" ? "bg-green-100 text-green-800" : ""}>
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
  );
}
export default VersionHistorySheet
