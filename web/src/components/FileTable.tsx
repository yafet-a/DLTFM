import React, { useState, useCallback, useRef, useEffect } from 'react';
import { File as FileIcon, ChevronDown, History, Eye, Share, ChevronRight, Check } from 'lucide-react';
import type { File as BlockchainFile } from '@/types/file';
import FilePreviewModal from './FilePreviewModal';
import { useOrg } from '@/contexts/OrgContext';
interface FileTableProps {
  files: BlockchainFile[];
  onViewHistory: (file: BlockchainFile) => void;
  onApproveFile: (fileId: string) => Promise<void>;
}

const FileTable = ({ files, onViewHistory, onApproveFile }: FileTableProps) => {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [previewFile, setPreviewFile] = useState<BlockchainFile | null>(null);
  const { currentOrg } = useOrg();

  //Group files by previousID for proper version tracking
  const groupFilesByPreviousID = useCallback((files: BlockchainFile[]) => {
    const groups = new Map<string, BlockchainFile[]>();
  
    files.forEach(file => {
      // Determine the root file by following the previousID chain
      let rootID = file.id;
      let currentFile = file;
      while (currentFile.previousID) {
        rootID = currentFile.previousID;
        currentFile = files.find(f => f.id === currentFile.previousID) || file;
      }
  
      // Group all versions under the root file
      if (!groups.has(rootID)) {
        groups.set(rootID, []);
      }
      const group = groups.get(rootID)!;
      group.push(file);
      groups.set(rootID, group.sort((a, b) => b.version - a.version)); // Sort by version descending
    });
  
    return groups;
  }, []);
  
  
  const fileGroups = groupFilesByPreviousID(files);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleGroup = (rootID: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(rootID)) {
        next.delete(rootID);
      } else {
        next.add(rootID);
      }
      return next;
    });
  };
  

  const renderDropdown = (file: BlockchainFile, isBottom: boolean) => (
    <div
      className="fixed z-50 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 divide-y divide-gray-100 focus:outline-none"
      style={{
        position: 'absolute',
        [isBottom ? 'bottom' : 'top']: '100%',
        right: 0,
      }}
      ref={dropdownRef}
    >
      <div className="py-1">
        {/* Only show Approve button if file is pending and not already approved by current org */}
        {file.status === "PENDING" && currentOrg && !file.currentApprovals.includes(currentOrg.fabric_msp_id) && (
          <button
            className="group flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full"  // Add this className to match others
            onClick={async () => {
              try {
                await onApproveFile(file.id);
                setOpenDropdown(null);
              } catch (error) {
                console.error("Failed to approve file:", error);
              }
            }}
          >
            <Check className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
            Approve File
          </button>
        )}
        <button
          className="group flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full"
          onClick={() => onViewHistory(file)}
        >
          <History className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
          View History
        </button>
        <button
          className="group flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full"
          onClick={() => {
            setPreviewFile(file);
            setOpenDropdown(null);
          }}
        >
          <Eye className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
          View File
        </button>
        <button className="group flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full">
          <Share className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
          Share
        </button>
      </div>
    </div>
  );

  const renderFileGroup = (rootID: string, groupFiles: BlockchainFile[]) => {
    const latestFile = groupFiles[0]; // The latest version is always first
    const isExpanded = expandedGroups.has(rootID);
    const showFiles = isExpanded ? groupFiles : [latestFile];
  
    return (
      <>
        {showFiles.map((file, index) => (
          <tr key={file.id} className={`${index > 0 ? 'bg-gray-50/50' : ''}`}>
            <td className={`whitespace-nowrap ${index === 0 ? 'px-6' : 'px-12'} py-4 ${index === 0 ? '' : 'opacity-60'}`}>
              <div className="flex items-center">
                {index === 0 && groupFiles.length > 1 && (
                  <button
                    onClick={() => toggleGroup(rootID)}
                    className="mr-2 p-1 hover:bg-gray-100 rounded transition-colors"
                  >
                    <ChevronRight
                      size={16}
                      className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  </button>
                )}
                <FileIcon size={20} className="text-gray-400 mr-2" />
                <div>
                  <div className="text-sm font-medium text-gray-900 flex items-center">
                    {file.name}
                    {index === 0 && groupFiles.length > 1 && (
                      <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                        Latest Version
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">ID: {file.id}</div>
                </div>
              </div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{file.owner}</td>
            <td className="px-6 py-4 whitespace-nowrap">
              <div className="text-sm text-gray-900">v{file.version}</div>
              {file.previousID && (
                <div className="text-xs text-gray-500">Updated from v{file.version - 1}</div>
              )}
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {new Date(file.timestamp).toLocaleString()}
            </td>
            {/* <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
              <div className={`${index === 0 ? '' : 'opacity-60'}`}>
                {file.hash.substring(0, 8)}...
              </div>
            </td> */}
            <td className="px-6 py-4 whitespace-nowrap">
              <div className="flex items-center space-x-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  file.status === 'APPROVED' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {file.status}
                </span>
                {file.status === 'PENDING' && (
                  <span className="text-xs text-gray-500">
                    {file.currentApprovals.length}/{file.requiredOrgs.length} approvals
                  </span>
                )}
              </div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 relative">
              <div className="relative inline-block text-left">
                <button
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  onClick={() => setOpenDropdown(openDropdown === file.id ? null : file.id)}
                >
                  Actions
                  <ChevronDown size={16} className="ml-2" />
                </button>
  
                {openDropdown === file.id && renderDropdown(file, index >= groupFiles.length - 2)}
              </div>
            </td>
          </tr>
        ))}
      </>
    );
  };
  

  return (
    <>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Version</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
            {/* <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hash</th> */}
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {Array.from(fileGroups.entries()).map(([versionKey, groupFiles]) => (
            <React.Fragment key={versionKey}>
              {renderFileGroup(versionKey, groupFiles)}
            </React.Fragment>
          ))}
        </tbody>

      </table>
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </>
  );
}

export default FileTable;
