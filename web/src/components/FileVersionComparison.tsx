import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, AlertCircle, ExternalLink, ArrowLeftRight } from "lucide-react";
import type { File as BlockchainFile } from "@/types/file";
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';
import FilePreviewModal from '@/components/FilePreviewModal';

interface FileComparisonProps {
  currentVersion: BlockchainFile;
  previousVersion: BlockchainFile;
  open: boolean;
  onClose: () => void;
}

export const FileVersionComparison: React.FC<FileComparisonProps> = ({
  currentVersion,
  previousVersion,
  open,
  onClose
}) => {
    const [currentContent, setCurrentContent] = useState<string | undefined>(undefined);
    const [previousContent, setPreviousContent] = useState<string | undefined>(undefined);

    const [contentType, setContentType] = useState<string>("text");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // State for PDF preview modals
    const [showCurrentPDF, setShowCurrentPDF] = useState(false);
    const [showPreviousPDF, setShowPreviousPDF] = useState(false);

    const { session } = useAuth();
    const { currentOrg } = useOrg();

  // Parse metadata to determine content type
  useEffect(() => {
    try {
      const metadata = JSON.parse(currentVersion?.metadata || "{}");
      if (metadata.type) {
        if (metadata.type.includes("text") || 
            metadata.type.includes("javascript") || 
            metadata.type.includes("json") ||
            metadata.type.includes("html") || 
            metadata.type.includes("css") ||
            metadata.type.includes("xml")) {
          setContentType("text");
        } else if (metadata.type.includes("image")) {
          setContentType("image");
        } else if (metadata.type.includes("pdf")) {
          setContentType("pdf");
        } else {
          setContentType("binary");
        }
      }
    } catch (e) {
      setContentType("binary");
    }
  }, [currentVersion]);

  // Fetch content from IPFS
  useEffect(() => {
    if (!open || !session || !currentOrg) return;
    
    const fetchContent = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch current version content
        if (currentVersion?.ipfsLocation && contentType !== 'pdf') {
          const currentResponse = await axios.get(
            `http://localhost:8080/api/files/${currentVersion.id}/content`, 
            {
              headers: {
                Authorization: `Bearer ${session?.access_token}`,
                'X-Organization-ID': currentOrg?.id,
                'X-MSP-ID': currentOrg?.fabric_msp_id
              },
              responseType: contentType === 'text' ? 'text' : 'blob',
            }
          );
          
          if (contentType === 'text') {
            setCurrentContent(currentResponse.data);
          } else if (contentType === 'image') {
            const blobUrl = URL.createObjectURL(currentResponse.data);
            setCurrentContent(blobUrl);
          }
        }
        
        // Fetch previous version content
        if (previousVersion?.ipfsLocation && contentType !== 'pdf') {
          const previousResponse = await axios.get(
            `http://localhost:8080/api/files/${previousVersion.id}/content`, 
            {
              headers: {
                Authorization: `Bearer ${session?.access_token}`,
                'X-Organization-ID': currentOrg?.id,
                'X-MSP-ID': currentOrg?.fabric_msp_id
              },
              responseType: contentType === 'text' ? 'text' : 'blob',
            }
          );
          
          if (contentType === 'text') {
            setPreviousContent(previousResponse.data);
          } else if (contentType === 'image') {
            const blobUrl = URL.createObjectURL(previousResponse.data);
            setPreviousContent(blobUrl);
          }
        }
      } catch (err) {
        console.error("Error fetching file content:", err);
        setError("Failed to fetch file contents for comparison");
      } finally {
        setLoading(false);
      }
    };
    
    fetchContent();
    
    // Clean up blob URLs on unmount
    return () => {
      if (contentType === 'image') {
        if (currentContent && typeof currentContent === 'string' && currentContent.startsWith('blob:')) {
          URL.revokeObjectURL(currentContent);
        }
        if (previousContent && typeof previousContent === 'string' && previousContent.startsWith('blob:')) {
          URL.revokeObjectURL(previousContent);
        }
      }
    };
  }, [open, currentVersion, previousVersion, session, currentOrg, contentType]);

  const renderDiffView = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center p-10">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-600">Loading content from IPFS...</p>
        </div>
      );
    }
  
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center text-red-500 p-10">
          <AlertCircle size={48} className="mb-4" />
          <p className="text-center mb-2">{error}</p>
        </div>
      );
    }
  
    // For PDF files, show a message with buttons to open in the FilePreviewModal
    if (contentType === "pdf") {
      return (
        <div className="p-6 text-center bg-gray-50 rounded-md">
          <div className="mb-6">
            <FileText size={48} className="mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900">PDF comparison is not available</h3>
            <p className="mt-2 text-sm text-gray-500">
              PDF files cannot be displayed side-by-side in this view. You can open each version separately using the buttons below.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 max-w-2xl mx-auto">
            <div className="p-4 border rounded-md bg-white">
              <h4 className="font-medium mb-2">Previous Version (v{previousVersion.version})</h4>
              <Button 
                onClick={() => setShowPreviousPDF(true)}
                className="w-full"
              >
                <FileText className="mr-2 h-4 w-4" />
                View PDF
              </Button>
            </div>
            
            <div className="p-4 border rounded-md bg-white">
              <h4 className="font-medium mb-2">Current Version (v{currentVersion.version})</h4>
              <Button 
                onClick={() => setShowCurrentPDF(true)}
                className="w-full"
              >
                <FileText className="mr-2 h-4 w-4" />
                View PDF
              </Button>
            </div>
          </div>
        </div>
      );
    }
  
    // For binary files, show a fallback message with buttons to view in a new tab
    if (contentType === "binary") {
      return (
        <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-md">
          <p className="mb-4">Binary file comparison not supported directly</p>
          <div className="flex justify-center space-x-4">
            <Button
              onClick={() =>
                window.open(`http://localhost:8080/api/files/${previousVersion.id}/content`, '_blank')
              }
              variant="outline"
            >
              View Previous Version
            </Button>
            <Button
              onClick={() =>
                window.open(`http://localhost:8080/api/files/${currentVersion.id}/content`, '_blank')
              }
            >
              View Current Version
            </Button>
          </div>
        </div>
      );
    }
  
    // For images, render them side-by-side
    if (contentType === "image") {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div className="border rounded-md p-2">
            <p className="text-sm font-medium mb-2">
              Previous Version (v{previousVersion.version})
            </p>
            <div className="flex items-center justify-center bg-gray-50 rounded-md p-4">
              {previousContent ? (
                <img
                  src={previousContent}
                  alt="Previous version"
                  className="max-h-96 object-contain"
                />
              ) : (
                <p className="text-gray-500">No preview available</p>
              )}
            </div>
          </div>
          <div className="border rounded-md p-2">
            <p className="text-sm font-medium mb-2">
              Current Version (v{currentVersion.version})
            </p>
            <div className="flex items-center justify-center bg-gray-50 rounded-md p-4">
              {currentContent ? (
                <img
                  src={currentContent}
                  alt="Current version"
                  className="max-h-96 object-contain"
                />
              ) : (
                <p className="text-gray-500">No preview available</p>
              )}
            </div>
          </div>
        </div>
      );
    }
  
    // For text files, render a side-by-side comparison
    return (
      <div className="grid grid-cols-2 gap-4 h-[500px]">
        <div className="border rounded-md overflow-hidden h-full">
          <div className="bg-gray-100 p-2 border-b">
            <p className="text-sm font-medium">Previous Version (v{previousVersion.version})</p>
          </div>
          <pre className="p-4 text-sm font-mono overflow-auto h-[calc(100%-2.5rem)] whitespace-pre-wrap">
            {previousContent || "No content available"}
          </pre>
        </div>
        <div className="border rounded-md overflow-hidden h-full">
          <div className="bg-gray-100 p-2 border-b">
            <p className="text-sm font-medium">Current Version (v{currentVersion.version})</p>
          </div>
          <pre className="p-4 text-sm font-mono overflow-auto h-[calc(100%-2.5rem)] whitespace-pre-wrap">
            {currentContent || "No content available"}
          </pre>
        </div>
      </div>
    );
  };
  

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl h-[650px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <span>Compare Versions</span>
              <Badge variant="outline" className="ml-2">
                {currentVersion.name}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Compare changes between version {previousVersion.version} and version {currentVersion.version}
            </DialogDescription>
          </DialogHeader>
          
          <div className="h-[500px] overflow-hidden">
            {renderDiffView()}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  
      {/* PDF Preview modals */}
      {showCurrentPDF && (
        <FilePreviewModal 
          file={currentVersion} 
          onClose={() => setShowCurrentPDF(false)} 
        />
      )}
      
      {showPreviousPDF && (
        <FilePreviewModal 
          file={previousVersion}
          onClose={() => setShowPreviousPDF(false)} 
        />
      )}
    </>
  );
  
};