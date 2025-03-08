import React, { useState, useEffect } from 'react';
import { X, FileIcon, AlertCircle, Download, ExternalLink } from 'lucide-react';
import type { File as BlockchainFile } from '@/types/file';
import Image from 'next/image';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';

interface FilePreviewModalProps {
  file: BlockchainFile;
  onClose: () => void;
}

const FilePreviewModal = ({ file, onClose }: FilePreviewModalProps) => {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth();
  const { currentOrg } = useOrg();
  
  console.log("File details:", {
    id: file.id,
    name: file.name,
    ipfsLocation: file.ipfsLocation,
    hash: file.hash
  });
  
  // Parse file metadata
  let metadata;
  try {
    metadata = JSON.parse(file.metadata);
    console.log("Parsed metadata:", metadata);
  } catch (e) {
    console.error("Error parsing metadata:", e);
    metadata = { type: "application/octet-stream", size: 0 };
  }
  
  const isImage = metadata.type?.startsWith('image/');
  const isText = metadata.type?.includes('text') || metadata.type?.includes('json');
  const isPDF = metadata.type === 'application/pdf';

  // Direct IPFS gateway URL (use this to bypass your server if needed)
  const ipfsGatewayUrl = `http://localhost:8088/ipfs/${file.ipfsLocation}`;
  
  // Server proxy URL
  const serverProxyUrl = `http://localhost:8080/api/files/${file.id}/content`;

  useEffect(() => {
    // Only fetch if we have an IPFS location
    if (file.ipfsLocation) {
      console.log("Fetching content for IPFS CID:", file.ipfsLocation);
      setLoading(true);
      
      // Try the direct IPFS gateway first (for debugging)
      console.log("Trying direct IPFS gateway:", ipfsGatewayUrl);
      
      // Determine the appropriate response type based on file type
      const responseType = isText ? 'text' : 'blob';
      
      // Try our server proxy which should handle the IPFS retrieval
      axios.get(serverProxyUrl, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'X-Organization-ID': currentOrg?.id,
          'X-MSP-ID': currentOrg?.fabric_msp_id
        },
        responseType: responseType,
        timeout: 10000 // 10 second timeout
      })
      .then(response => {
        console.log("Content retrieved successfully", {
          contentType: response.headers['content-type'],
          contentLength: response.headers['content-length'],
          status: response.status
        });
        
        if (isText) {
          // For text files, just set the content directly
          setFileContent(response.data);
        } else {
          // For binary data, create a blob URL
          const blob = new Blob([response.data], { type: metadata.type });
          const url = URL.createObjectURL(blob);
          setFileContent(url);
        }
        setError(null);
      })
      .catch(err => {
        console.error("Failed to fetch content via server proxy:", err);
        
        // If server proxy fails, try direct IPFS gateway as fallback
        if (isImage || isPDF) {
          console.log("Trying direct IPFS gateway as fallback");
          setFileContent(ipfsGatewayUrl);
        } else {
          setError(`Error loading content: ${err.message}`);
        }
      })
      .finally(() => {
        setLoading(false);
      });
    }
  }, [file.id, file.ipfsLocation, isText, isPDF, isImage, ipfsGatewayUrl, serverProxyUrl, metadata?.type, session?.access_token, currentOrg?.id, currentOrg?.fabric_msp_id]);

  // Clean up blob URLs when component unmounts
  useEffect(() => {
    return () => {
      if (fileContent && !isText && fileContent.startsWith('blob:')) {
        URL.revokeObjectURL(fileContent);
      }
    };
  }, [fileContent, isText]);
  
  const getContent = () => {
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
          <p className="text-sm text-gray-500 mb-4">IPFS CID: {file.ipfsLocation}</p>
          
          <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
            <a 
              href={ipfsGatewayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              <ExternalLink size={16} className="mr-2" />
              Open in IPFS Gateway
            </a>
            
            <a 
              href={serverProxyUrl}
              download={file.name}
              className="flex items-center justify-center px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
            >
              <Download size={16} className="mr-2" />
              Download File
            </a>
          </div>
        </div>
      );
    }

    // For content that has been loaded
    if (fileContent) {
      if (isImage) {
        return (
          <div className="flex items-center justify-center">
            <Image 
              src={fileContent}
              alt={file.name}
              width={900}
              height={800}
              className="max-w-full max-h-[70vh] object-contain"
            />
          </div>
        );
      }

      if (isText) {
        // For text content
        return (
          <pre className="whitespace-pre-wrap font-mono text-sm bg-gray-50 p-4 rounded-md overflow-auto max-h-[70vh]">
            {fileContent}
          </pre>
        );
      }

      if (isPDF) {
        return (
          <iframe
            src={fileContent}
            className="w-full h-[70vh]"
            title={file.name}
          />
        );
      }

      // For other file types
      return (
        <div className="flex flex-col items-center justify-center text-gray-500">
          <FileIcon size={48} className="mb-4" />
          <p className="mb-2">Preview not available for this file type</p>
          <p className="text-sm mb-4">{metadata.type}</p>
          <div className="flex space-x-4">
            <a 
              href={fileContent}
              download={file.name}
              className="flex items-center px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              <Download size={16} className="mr-2" />
              Download File
            </a>
            
            <a 
              href={ipfsGatewayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
            >
              <ExternalLink size={16} className="mr-2" />
              View in IPFS Gateway
            </a>
          </div>
        </div>
      );
    }
    
    // No content available
    return (
      <div className="flex flex-col items-center justify-center text-gray-500">
        <AlertCircle size={48} className="mb-4" />
        <p className="mb-2">Content not available for preview</p>
        {file.ipfsLocation ? (
          <>
            <p className="text-sm text-gray-400 mb-4">IPFS CID: {file.ipfsLocation}</p>
            <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
              <a 
                href={serverProxyUrl}
                download={file.name}
                className="flex items-center justify-center px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                <Download size={16} className="mr-2" />
                Download File
              </a>
              
              <a 
                href={ipfsGatewayUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
              >
                <ExternalLink size={16} className="mr-2" />
                Open in IPFS Gateway
              </a>
            </div>
          </>
        ) : (
          <p>This file has no IPFS location associated with it.</p>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 overflow-y-auto z-50">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-4 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full sm:p-6">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              type="button"
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              onClick={onClose}
            >
              <span className="sr-only">Close</span>
              <X size={24} />
            </button>
          </div>

          <div className="sm:flex sm:items-start mb-4">
            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
                {file.name}
                <span className="ml-2 text-sm text-gray-500">
                  (Version {file.version})
                </span>
              </h3>
              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  {new Date(file.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg overflow-hidden">
            {getContent()}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <dt className="text-sm font-medium text-gray-500">Size</dt>
              <dd className="text-sm text-gray-900">{(metadata.size / 1024).toFixed(2)} KB</dd>
              
              <dt className="text-sm font-medium text-gray-500">Type</dt>
              <dd className="text-sm text-gray-900">{metadata.type}</dd>
              
              <dt className="text-sm font-medium text-gray-500">Hash</dt>
              <dd className="text-sm font-mono text-gray-900 truncate">{file.hash}</dd>
              
              <dt className="text-sm font-medium text-gray-500">Owner</dt>
              <dd className="text-sm text-gray-900">{file.owner}</dd>
              
              <dt className="text-sm font-medium text-gray-500">Storage</dt>
              <dd className="text-sm text-gray-900">
                {file.ipfsLocation ? (
                  <span className="flex items-center">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                    IPFS
                  </span>
                ) : (
                  <span className="flex items-center">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                    Blockchain
                  </span>
                )}
              </dd>
              
              {file.ipfsLocation && (
                <>
                  <dt className="text-sm font-medium text-gray-500">IPFS CID</dt>
                  <dd className="text-sm font-mono text-gray-900 truncate">{file.ipfsLocation}</dd>
                </>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilePreviewModal;