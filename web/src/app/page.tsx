'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Upload, User } from 'lucide-react';
import axios from 'axios';
import type { File as BlockchainFile } from '@/types/file';
import FilePreview from '@/components/FilePreview';
import FileTable from '@/components/FileTable';
import VersionHistoryModal from '@/components/VersionHistoryModal';

export default function Home() {
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

  useEffect(() => {
    loadFiles();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Cleanup preview URL when component unmounts or file changes
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const checkConnection = async () => {
    try {
      await axios.get('http://localhost:8080/api/files');
      setIsConnected(true);
    } catch (err) {
      setIsConnected(false);
    }
  };

  const loadFiles = async () => {
    try {
      setLoading(true);
      const response = await axios.get<BlockchainFile[]>('http://localhost:8080/api/files');
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
        owner: 'user1',
        metadata: JSON.stringify(metadata)
      };

      await axios.post('http://localhost:8080/api/files', payload);
      
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 shadow-lg">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <div className="text-white font-bold text-4xl tracking-tight">
                DLTFM
                <span className="text-blue-200 text-sm ml-2 font-normal">
                  Distributed Ledger Technology File Manager
                </span>
              </div>
            </div>
            
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2 text-blue-100 bg-blue-700/40 px-4 py-2 rounded-full">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                <span className="text-sm">
                  {isConnected ? 'Connected to test-network' : 'Disconnected'}
                </span>
              </div>
              
              <div className="flex items-center space-x-2 text-white bg-blue-700/40 px-4 py-2 rounded-full">
                <User size={18} />
                <span className="text-sm font-medium">user1</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-md">
            {error}
          </div>
        )}

        <div 
          className={`border-2 border-dashed rounded-lg p-8 text-center mb-8 transition-colors relative
            ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
            ${uploading ? 'opacity-50' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
          />
          
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">
            Drag and drop files here, or{' '}
            <button 
              className="text-blue-500 hover:text-blue-600"
              onClick={handleBrowseClick}
            >
              browse
            </button>
          </p>
          
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
              <div className="text-blue-500">Uploading...</div>
            </div>
          )}
        </div>

        {selectedFile && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Preview:</h4>
            <FilePreview file={selectedFile} previewUrl={previewUrl} />
            <div className="mt-4 flex justify-end space-x-3">
              <button
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-700"
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded-md"
                onClick={() => selectedFile && handleFileUpload(selectedFile)}
                disabled={uploading}
              >
                Upload File
              </button>
            </div>
          </div>
        )}

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Files</h3>
          </div>
          
          {loading ? (
            <div className="p-4 text-center text-gray-500">Loading files...</div>
          ) : (
            <FileTable 
              files={files} 
              onViewHistory={handleViewHistory}
            />
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
  );
}