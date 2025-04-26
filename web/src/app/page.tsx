'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Check, ChevronDown, ChevronsUpDown, Upload, User } from 'lucide-react';
import axios from 'axios';
import type { File as BlockchainFile } from '@/types/file';
import FilePreview from '@/components/FilePreview';
import FileTable from '@/components/FileTable';
import VersionHistorySheet from '@/components/VersionHistorySheet';
import { LoginScreen } from '@/components/Auth';
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext';;
import OrganizationSelector from '@/components/OrgSelector';
import { supabase } from '@/lib/supabase';
import OrganizationOnboarding from '@/components/OrganizationOnboarding';
import { v4 as uuidv4 } from 'uuid';
import { EndorsementWizard } from '@/components/EndorsementWizard';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";


export default function Home() {
  const { session, user } = useAuth();
  const [files, setFiles] = useState<BlockchainFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<globalThis.File | null>(null);
  const [selectedPreviousFile, setSelectedPreviousFile] = useState<string | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedVersionFile, setSelectedVersionFile] = useState<BlockchainFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentOrg, loading: orgLoading } = useOrg();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [openVersionCombo, setOpenVersionCombo] = useState(false);
//   const [endorsementConfig, setEndorsementConfig] = useState({
//     policyType: "ALL_ORGS",
//     requiredOrgs: [] as string[]
// });

  const loadFiles = useCallback(async () => {
    if (!session || !currentOrg) return;
    
    try {
      setLoading(true);
      const response = await axios.get<BlockchainFile[]>('http://localhost:8080/api/files', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'X-Organization-ID': currentOrg?.id,
          'X-MSP-ID': currentOrg?.fabric_msp_id
        }
      });
      setFiles(response.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [session, currentOrg]);

  useEffect(() => {
    if (session && currentOrg && !orgLoading) {
      loadFiles();
      setIsConnected(true);
    } else {
      setIsConnected(false);
    }
  }, [session, currentOrg, orgLoading, loadFiles]);

  useEffect(() => {
    if (!session || !currentOrg) return;

    const channel = supabase
      .channel('files-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'files'
        },
        () => {
          loadFiles();
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, currentOrg, loadFiles]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };
  
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      const file = droppedFiles[0];
      setSelectedFile(file);
      
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      } else {
        setPreviewUrl(null);
      }
    }
  };
  
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      window.location.reload(); // Refresh the page after logout
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      } else {
        setPreviewUrl(null);
      }
    }
  };

  const readFileContent = (file: globalThis.File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          const arrayBuffer = e.target.result as ArrayBuffer;
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = window.btoa(binary);
          resolve(base64);
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  };

  const handleViewHistory = (file: BlockchainFile) => {
    setSelectedVersionFile(file);
  };

  const handleApproveFile = async (fileId: string) => {
    try {
      await axios.post(`http://localhost:8080/api/files/${fileId}/approve`, {}, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'X-Organization-ID': currentOrg?.id,
          'X-MSP-ID': currentOrg?.fabric_msp_id
        }
      });
      
      // Refresh files list after approval
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve file');
    }
  };

  const getFileVersions = (file: BlockchainFile) => {
    // Start with the selected file
    const versions = [file];
    const processedIds = new Set<string>([file.id]);
    
    // Build a map of previous relationships for faster lookup
    const previousIdMap = new Map<string, BlockchainFile>();
    files.forEach(f => {
      if (f.previousID) {
        previousIdMap.set(f.previousID, f);
      }
    });
  
    // Find previous versions by following previousID chain
    let currentFile = file;
    while (currentFile.previousID) {
      const previousFile = files.find(f => f.id === currentFile.previousID);
      if (previousFile && !processedIds.has(previousFile.id)) {
        versions.push(previousFile);
        processedIds.add(previousFile.id);
        currentFile = previousFile;
      } else {
        break;
      }
    }
  
    // Find next versions by checking what files reference these as previousID
    // This helps find forward-branching versions
    let foundNew = true;
    while (foundNew) {
      foundNew = false;
      
      for (const id of processedIds) {
        const nextVersions = files.filter(f => 
          f.previousID === id && !processedIds.has(f.id)
        );
        
        if (nextVersions.length > 0) {
          for (const nextVersion of nextVersions) {
            versions.push(nextVersion);
            processedIds.add(nextVersion.id);
            foundNew = true;
          }
        }
      }
    }
  
    // Sort by version number in descending order
    return versions.sort((a, b) => b.version - a.version);
  };

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
  }, [files]);
  
  // Get only the latest version from each group
  const getLatestVersionsOnly = useCallback(() => {
    const groups = groupFilesByPreviousID(files);
    const latestVersions: BlockchainFile[] = [];
    
    groups.forEach(group => {
      // The first file in each group is the latest version (already sorted)
      latestVersions.push(group[0]);
    });
    
    return latestVersions;
  }, [files, groupFilesByPreviousID]);

  if (!session) {
    return <LoginScreen />;
  }

  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading organization settings...</p>
        </div>
      </div>
    );
  }

  if (!currentOrg) {
    return <OrganizationOnboarding />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="text-2xl font-bold text-gray-800 tracking-tight">
                DLTFM
                <span className="text-sm ml-2 font-normal text-gray-500">
                  Distributed Ledger Technology File Manager
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <OrganizationSelector />
              <div
                className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${isConnected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
              >
                <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
                <span>{isConnected ? "Connected to test-network" : "Disconnected"}</span>
              </div>

              <div className="relative">
                <button 
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 focus:outline-none"
                >
                  <User size={20} />
                  <span className="font-medium">{user?.email}</span>
                  <ChevronDown size={16} />
                </button>
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10">
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-md">{error}</div>}

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center mb-8 transition-all duration-300 ease-in-out relative
            ${dragActive ? "border-indigo-500 bg-indigo-50" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"}
            ${uploading ? "opacity-50" : ""}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">
            Drag and drop files here, or{" "}
            <button
              className="text-indigo-600 hover:text-indigo-700 font-medium focus:outline-none focus:underline transition duration-150 ease-in-out"
              onClick={handleBrowseClick}
            >
              browse
            </button>
          </p>

          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
              <div className="text-indigo-600 font-medium">Uploading...</div>
            </div>
          )}
        </div>

        {selectedFile && (
          <div className="mb-6 space-y-6">
            {/* File Preview Card */}
            <div className="bg-white shadow rounded-lg p-6">
              <h4 className="text-lg font-medium text-gray-900 mb-4">Preview:</h4>
              <FilePreview file={selectedFile} previewUrl={previewUrl} />
              
              <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Versioning:
              </label>
              <Popover open={openVersionCombo} onOpenChange={setOpenVersionCombo}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openVersionCombo}
                    className="w-full justify-between"
                  >
                    {selectedPreviousFile
                      ? `Update ${files.find((f) => f.id === selectedPreviousFile)?.name} (v${files.find((f) => f.id === selectedPreviousFile)?.version})`
                      : "New File"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Search file..." />
                    <CommandList>
                      <CommandEmpty>No matching file.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => {
                            setSelectedPreviousFile("");
                            setOpenVersionCombo(false);
                          }}
                          className="cursor-pointer"
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${
                              selectedPreviousFile === "" ? "opacity-100" : "opacity-0"
                            }`}
                          />
                          New File
                        </CommandItem>
                        {getLatestVersionsOnly().map((file) => (
                          <CommandItem
                            key={file.id}
                            onSelect={() => {
                              setSelectedPreviousFile(file.id);
                              setOpenVersionCombo(false);
                            }}
                            className="cursor-pointer"
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                selectedPreviousFile === file.id ? "opacity-100" : "opacity-0"
                              }`}
                            />
                            Update {file.name} (v{file.version})
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
            
            {/* Endorsement Wizard */}
            <EndorsementWizard
              onSubmit={async (endorsementConfig) => {
                try {
                  setUploading(true);
                  const content = await readFileContent(selectedFile);
                  
                  const metadata = {
                    size: selectedFile.size,
                    type: selectedFile.type || 'application/octet-stream',
                    createdAt: new Date().toISOString(),
                    encoding: 'base64'
                  };

                  const payload = {
                    id: uuidv4(),
                    name: selectedFile.name,
                    content: content,
                    owner: user?.email || "unknown",
                    metadata: JSON.stringify(metadata),
                    previousID: selectedPreviousFile || "",
                    endorsementConfig: endorsementConfig
                  };

                  await axios.post('http://localhost:8080/api/files', payload, {
                    headers: {
                      Authorization: `Bearer ${session?.access_token}`,
                      'X-Organization-ID': currentOrg?.id,
                      'X-MSP-ID': currentOrg?.fabric_msp_id
                    }
                  });
                  
                  await loadFiles();
                  
                  // Clear selection and preview
                  setSelectedFile(null);
                  setPreviewUrl(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                  
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to upload file');
                } finally {
                  setUploading(false);
                }
              }}
              onCancel={() => {
                setSelectedFile(null);
                setPreviewUrl(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
            />
          </div>
        )}

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Files</h3>
          </div>

          {loading ? (
            <div className="p-4 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
              <p className="mt-2">Loading files...</p>
            </div>
          ) : (
            <FileTable files={files} onViewHistory={handleViewHistory} onApproveFile={handleApproveFile} />
          )}
        </div>
      </main>

      {selectedVersionFile && (
        <VersionHistorySheet
          file={selectedVersionFile}
          versions={getFileVersions(selectedVersionFile)}
          open={true}
          onClose={() => setSelectedVersionFile(null)}
          onRefresh={loadFiles} // Add this line to allow refreshing after restore
        />
      )}
    </div>
  );
}