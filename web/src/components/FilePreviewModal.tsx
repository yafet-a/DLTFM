import React from 'react';
import { X, FileIcon, AlertCircle } from 'lucide-react';
import type { File as BlockchainFile } from '@/types/file';
import Image from 'next/image';

interface FilePreviewModalProps {
  file: BlockchainFile;
  onClose: () => void;
}

const FilePreviewModal = ({ file, onClose }: FilePreviewModalProps) => {
  const metadata = JSON.parse(file.metadata);
  const isImage = metadata.type.startsWith('image/');
  const isText = metadata.type.includes('text') || metadata.type.includes('json');
  const isPDF = metadata.type === 'application/pdf';

  const getContent = () => {
    try {
      if (!file.content) {
        return (
          <div className="flex flex-col items-center justify-center text-gray-500">
            <AlertCircle size={48} className="mb-2" />
            <p>Content not available for preview</p>
          </div>
        );
      }

      if (isImage) {
        return (
          <div className="flex items-center justify-center">
            <Image 
              src={`data:${metadata.type};base64,${file.content}`}
              alt={file.name}
              width={900}
              height={800}
              className="max-w-full max-h-[70vh] object-contain"
            />
          </div>
        );
      }

      if (isText) {
        const text = atob(file.content);
        return (
          <pre className="whitespace-pre-wrap font-mono text-sm bg-gray-50 p-4 rounded-md overflow-auto max-h-[70vh]">
            {text}
          </pre>
        );
      }

      if (isPDF) {
        return (
          <iframe
            src={`data:application/pdf;base64,${file.content}`}
            className="w-full h-[70vh]"
            title={file.name}
          />
        );
      }

      return (
        <div className="flex flex-col items-center justify-center text-gray-500">
          <FileIcon size={48} className="mb-2" />
          <p>Preview not available for this file type</p>
          <p className="text-sm mt-2">{metadata.type}</p>
        </div>
      );
    } catch (error) {
      return (
        <div className="flex flex-col items-center justify-center text-red-500">
          <AlertCircle size={48} className="mb-2" />
          <p>Error loading preview: {error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      );
    }
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
              <dd className="text-sm font-mono text-gray-900">{file.hash}</dd>
              
              <dt className="text-sm font-medium text-gray-500">Owner</dt>
              <dd className="text-sm text-gray-900">{file.owner}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilePreviewModal;