import React, { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import { File as FileIcon, ChevronDown, History, Eye, Share, ChevronRight, Check } from 'lucide-react';
import type { File as BlockchainFile } from '@/types/file';
import FilePreviewModal from './FilePreviewModal';
import { useOrg } from '@/contexts/OrgContext';

interface FileTableProps {
  files: BlockchainFile[];
  onViewHistory: (file: BlockchainFile) => void;
  onApproveFile: (fileId: string) => Promise<void>;
}

const FileTable = memo(({ files, onViewHistory, onApproveFile }: FileTableProps) => {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [previewFile, setPreviewFile] = useState<BlockchainFile | null>(null);
  const [approvingFiles, setApprovingFiles] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'APPROVED' | 'PENDING'>('ALL');
  const { currentOrg } = useOrg();

  // Function to cycle through filter states
  const cycleStatusFilter = () => {
    setStatusFilter(current => {
      switch (current) {
        case 'ALL': return 'PENDING';
        case 'PENDING': return 'APPROVED';
        case 'APPROVED': return 'ALL';
        default: return 'ALL';
      }
    });
  };

  // Memoise the file grouping calculation
  const fileGroups = useMemo(() => {
    console.log("Recalculating file groups...");
    const groups = new Map<string, BlockchainFile[]>();
    const fileMap = new Map(files.map(f => [f.id, f])); // map for faster lookups

    files.forEach(file => {
        let rootID = file.id;
        let currentFile: BlockchainFile | undefined = file;
        const visited = new Set<string>(); // Prevent infinite loops in case of cyclic references

        // Traverse up the chain to find the rootID
        while (currentFile?.previousID && !visited.has(currentFile.id)) {
            visited.add(currentFile.id);
            const previousFile = fileMap.get(currentFile.previousID);
            if (previousFile) {
                rootID = currentFile.previousID;
                currentFile = previousFile;
            } else {
                 rootID = currentFile.id; 
                 break;
            }
        }

        // Group all versions under the determined root file ID
        if (!groups.has(rootID)) {
            groups.set(rootID, []);
        }
        const group = groups.get(rootID)!;
         // safeguard against potential duplicates if logic above has edge cases
         if (!group.some(f => f.id === file.id)) {
             group.push(file);
         }
    });

    // Sort each group by version descending after grouping is complete
    groups.forEach((group, rootID) => {
        groups.set(rootID, group.sort((a, b) => b.version - a.version));
    });


    return groups;
  }, [files]); // Dependency: Only recalculate when 'files' prop changes

  // Memoise the sorting of file groups
  const sortedFileGroups = useMemo(() => {
    return Array.from(fileGroups.entries()).sort((a, b) => {
      // Each group is already sorted by version (newest first)
      // So we can just compare the timestamp of the first file (latest version) in each group
      const latestA = a[1]?.[0];
      const latestB = b[1]?.[0];

      // Handle potential empty groups or missing timestamps gracefully
      if (!latestA || !latestB) return 0;

      // Sort in descending order (newest first)
      return new Date(latestB.timestamp).getTime() - new Date(latestA.timestamp).getTime();
    });
  }, [fileGroups]); // Dependency: Recalculate when fileGroups changes

  // Memoise the filtering of file groups
  const filteredFileGroups = useMemo(() => {
    return sortedFileGroups.filter(([_, groupFiles]) => {
      if (statusFilter === 'ALL') return true;

      // Check the status of the latest file in the group
      const latestFile = groupFiles?.[0];
      if (!latestFile) return false; // Should not happen if groups are well-formed

      return statusFilter === latestFile.status;
    });
  }, [sortedFileGroups, statusFilter]); // Dependencies: Recalculate when sorted groups or filter changes


  // Close dropdown when clicking outside (remains the same)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []); // Empty dependency array means this effect runs once on mount

  // Memoise toggleGroup function
  const toggleGroup = useCallback((rootID: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(rootID)) {
        next.delete(rootID);
      } else {
        next.add(rootID);
      }
      return next;
    });
  }, []); // No dependencies needed as setExpandedGroups is stable


  // Dependencies: currentOrg, approvingFiles, onApproveFile, setApprovingFiles, setOpenDropdown, onViewHistory, setPreviewFile
  const renderDropdown = (file: BlockchainFile, isBottom: boolean) => (
    <div
      className="fixed z-50 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 divide-y divide-gray-100 focus:outline-none"
      style={{
        position: 'absolute',
        bottom: isBottom ? 'unset' : '100%', // Adjust position based on isBottom
        top: isBottom ? '100%' : 'unset',
        right: 0,
        zIndex: 100,
        marginTop: isBottom ? '0.5rem' : '0', // Add some margin if dropdown is below
        marginBottom: isBottom ? '0' : '0.5rem' // Add some margin if dropdown is above
      }}
      ref={dropdownRef}
    >
      <div className="py-1">
        {/* Only show Approve button if file is pending and not already approved by current org */}
        {file.status === "PENDING" && currentOrg && !file.currentApprovals.includes(currentOrg.fabric_msp_id) && (
          <button
            className="group flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full disabled:opacity-50"
            disabled={approvingFiles.has(file.id)}
            onClick={async () => {
              try {
                setApprovingFiles(prev => new Set(prev).add(file.id));
                await onApproveFile(file.id);
                setOpenDropdown(null);
              } catch (error) {
                console.error("Failed to approve file:", error);
                 // Optionally: show an error message to the user
              } finally {
                setApprovingFiles(prev => {
                  const updated = new Set(prev);
                  updated.delete(file.id);
                  return updated;
                });
              }
            }}
          >
            {approvingFiles.has(file.id) ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Approving...
              </>
            ) : (
              <>
                <Check className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
                Approve File
              </>
            )}
          </button>
        )}
        <button
          className="group flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full"
          onClick={() => {
            setOpenDropdown(null); // Close the dropdown first
            onViewHistory(file);    // Then call the parent callback
          }}
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


  // Memoise the renderFileGroup function
  // Dependencies: expandedGroups, toggleGroup, openDropdown, setOpenDropdown, renderDropdown
  const renderFileGroup = (rootID: string, groupFiles: BlockchainFile[]) => {
      const latestFile = groupFiles[0]; // The latest version is always first
      const isExpanded = expandedGroups.has(rootID);
      const showFiles = isExpanded ? groupFiles : [latestFile];

      return (
          <>
              {showFiles.map((file, index) => {

                  const isPotentiallyBottom = index >= showFiles.length - 1; // Or a more fixed number like index > 5

                  return (
                      <tr key={file.id} className={`${index > 0 ? 'bg-gray-50/50' : ''}`}>
                          <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                  {/* Expansion button */}
                                  <span className="w-4 inline-flex justify-center">
                                      {index === 0 && groupFiles.length > 1 ? (
                                          <button
                                              onClick={() => toggleGroup(rootID)}
                                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                                              aria-expanded={isExpanded}
                                              aria-controls={`group-${rootID}`}
                                          >
                                              <ChevronRight
                                                  size={16}
                                                  className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                              />
                                          </button>
                                      ) : index > 0 ? (
                                          <span className="w-4"></span> // Placeholder for alignment in child rows
                                      ) : null}
                                  </span>

                                  {/* Add indentation for child items visually */}
                                  {/* {index > 0 && <div className="w-5 flex-shrink-0"></div>} */}

                                  <FileIcon size={20} className={`text-gray-400 mr-2 flex-shrink-0 ${index > 0 ? 'opacity-60 ml-4' : ''}`} />
                                  <div className="min-w-0 flex-1"> {/* Allow shrinking/truncating */}
                                      <div className={`text-sm font-medium flex items-center truncate ${index > 0 ? 'text-gray-600 opacity-60' : 'text-gray-900'}`}>
                                          <span className="truncate">{file.name}</span>
                                          {index === 0 && groupFiles.length > 1 && (
                                              <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full flex-shrink-0">
                                                  Latest Version
                                              </span>
                                          )}
                                      </div>
                                      <div className={`text-sm text-gray-500 font-mono truncate ${index > 0 ? 'opacity-60' : ''}`}>
                                          {file.ipfsLocation ? (
                                              <>CID: {file.ipfsLocation.substring(0, 16)}...</>
                                          ) : (
                                              <>ID: {file.id.substring(0, 8)}...</>
                                          )}
                                      </div>
                                  </div>
                              </div>
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate ${index > 0 ? 'opacity-60' : ''}`}>{file.owner}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                              <div className={`text-sm text-gray-900 ${index > 0 ? 'opacity-60' : ''}`}>v{file.version}</div>
                              {file.previousID && index > 0 && ( // Show update source only for older versions
                                  <div className="text-xs text-gray-500">Updated from v{file.version - 1}</div>
                              )}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-500 ${index > 0 ? 'opacity-60' : ''}`}>
                              {new Date(file.timestamp).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                              <div className={`flex items-center space-x-2 ${index > 0 ? 'opacity-60' : ''}`}>
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${file.status === 'APPROVED'
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
                          <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-500 relative ${index > 0 ? 'opacity-60' : ''}`}>
                              <div className="relative inline-block text-left">
                                  <button
                                      className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                      onClick={(e) => {
                                          e.stopPropagation(); // Prevent triggering row clicks if any
                                          setOpenDropdown(openDropdown === file.id ? null : file.id)
                                      }}
                                      aria-haspopup="true"
                                      aria-expanded={openDropdown === file.id}
                                  >
                                      Actions
                                      <ChevronDown size={16} className="ml-2" />
                                  </button>

                                  {openDropdown === file.id && renderDropdown(file, isPotentiallyBottom)}
                              </div>
                          </td>
                      </tr>
                  );
              })}
              {/* Render invisible content for accessibility if group is collapsed */}
               {!isExpanded && groupFiles.length > 1 && (
                   <div id={`group-${rootID}`} className="hidden">
                       Collapsed content for {groupFiles[0].name} - {groupFiles.length - 1} older versions.
                   </div>
               )}
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
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              onClick={cycleStatusFilter}
            >
              Status 
              {statusFilter !== 'ALL' && (
                <span className="ml-1 px-2 py-0.5 text-xxs rounded-full inline-block text-xs">
                  {statusFilter === 'PENDING' ? '(Pending Only)' : '(Approved Only)'}
                </span>
              )}
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {filteredFileGroups.map(([versionKey, groupFiles]) => (
            <React.Fragment key={versionKey}>
              {renderFileGroup(versionKey, groupFiles)}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      
      {filteredFileGroups.length === 0 && (
        <div className="text-center py-8 bg-white rounded-lg border mt-4">
          <div className="text-gray-500">
            {statusFilter === 'APPROVED' ? (
              <>No approved files found</>
            ) : statusFilter === 'PENDING' ? (
              <>No files pending approval</>
            ) : (
              <>No files found</>
            )}
          </div>
        </div>
      )}
      
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </>
  );
});

export default FileTable;