'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Upload, User } from 'lucide-react';
import axios from 'axios';
import type { File as BlockchainFile } from '@/types/file';
import FilePreview from '@/components/FilePreview';
import FileTable from '@/components/FileTable';
import VersionHistoryModal from '@/components/VersionHistoryModal';
import { LoginScreen } from '@/components/Auth';
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext';;
import OrganizationSelector from '@/components/OrgSelector';
import { supabase } from '@/lib/supabase';
import OrganizationOnboarding from '@/components/OrganizationOnboarding';

export default function Home() {
  const { session, user } = useAuth();
  const [files, setFiles] = useState<BlockchainFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<globalThis.File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedVersionFile, setSelectedVersionFile] = useState<BlockchainFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentOrg, loading: orgLoading } = useOrg();
  const [showUserMenu, setShowUserMenu] = useState(false);



  useEffect(() => {
    if (session && currentOrg && !orgLoading) {
      // Initial load of files
      loadFiles();
      setIsConnected(true); // Initial connection state
  
      // Set up realtime subscription
      const channel = supabase
        .channel('files-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'files'
          },
          (payload) => {
            console.log('Realtime update received:', payload);
            loadFiles(); // Reload files when any change happens
          }
        )
        .subscribe((status) => {
          console.log('Subscription status:', status);
          
          if (status === 'SUBSCRIBED') {
            setIsConnected(true);
          } else {
            setIsConnected(false);
          }
        });
  
      return () => {
        // Cleanup subscription on unmount
        console.log('Cleaning up subscription');
        supabase.removeChannel(channel);
      };
    } else {
      setIsConnected(false);
    }
  }, [session, currentOrg, orgLoading]);

  useEffect(() => {
    // Cleanup preview URL when component unmounts or file changes
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // const checkConnection = async () => {
  //   try {
  //     await axios.get('http://localhost:8080/api/files', {
  //       headers: {
  //         Authorization: `Bearer ${session?.access_token}`,
  //         'X-Organization-ID': currentOrg?.id,
  //         'X-MSP-ID': currentOrg?.fabric_msp_id

  //       }
  //     });
  //     setIsConnected(true);
  //   } catch (err) {
  //     setIsConnected(false);
  //   }
  // };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      window.location.reload(); // Refresh the page after logout
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const loadFiles = async () => {
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
  };

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

  const handleFileUpload = async (file: globalThis.File) => {
    try {
      setUploading(true);
      setError(null);

      const content = await readFileContent(file);
      
      const metadata = {
        size: file.size,
        type: file.type || 'application/octet-stream',
        createdAt: new Date().toISOString(),
        encoding: 'base64'
      };

      const payload = {
        name: file.name,
        content: content,
        owner: user?.email || 'unknown',  // Use user's email instead of hardcoded 'user1'
        metadata: JSON.stringify(metadata)
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

  const getFileVersions = (file: BlockchainFile) => {
    return files.filter(f => f.hash === file.hash);
  };

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
          <div className="mb-6 bg-white shadow rounded-lg p-6">
            <h4 className="text-lg font-medium text-gray-900 mb-4">Preview:</h4>
            <FilePreview file={selectedFile} previewUrl={previewUrl} />
            <div className="mt-4 flex justify-end space-x-3">
              <button
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-700 focus:outline-none"
                onClick={() => {
                  setSelectedFile(null)
                  setPreviewUrl(null)
                  if (fileInputRef.current) {
                    fileInputRef.current.value = ""
                  }
                }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition duration-150 ease-in-out"
                onClick={() => selectedFile && handleFileUpload(selectedFile)}
                disabled={uploading}
              >
                Upload File
              </button>
            </div>
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
            <FileTable files={files} onViewHistory={handleViewHistory} />
          )}
        </div>
      </main>

      {selectedVersionFile && (
        <VersionHistoryModal
          file={selectedVersionFile}
          versions={getFileVersions(selectedVersionFile)}
          onClose={() => setSelectedVersionFile(null)}
        />
      )}
    </div>
  )
}