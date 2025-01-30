import React from 'react';
import { File as FileIcon, Image as ImageIcon, FileText, FileCode, FileArchive } from 'lucide-react';
import Image from 'next/image';

interface FilePreviewProps {
  file: File;
  previewUrl: string | null;
}

const FilePreview = ({ file, previewUrl }: FilePreviewProps) => {
  const getIcon = () => {
    switch (true) {
      case file.type.startsWith('image/'):
        return <ImageIcon className="text-blue-500" size={24} />;
      case file.type === 'application/pdf':
        return <FileText className="text-red-500" size={24} />;
      case file.type.includes('text') || file.type.includes('code'):
        return <FileCode className="text-green-500" size={24} />;
      case file.type.includes('zip') || file.type.includes('compressed'):
        return <FileArchive className="text-yellow-500" size={24} />;
      default:
        return <FileIcon className="text-gray-500" size={24} />;
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          {file.type.startsWith('image/') && previewUrl ? (
            <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
            <Image
              src={previewUrl}
              alt={file.name}
              width={80}
              height={80}
              className="w-full h-full object-cover"
            />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center">
              {getIcon()}
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {file.name}
          </p>
          <p className="text-sm text-gray-500">
            {(file.size / 1024 / 1024).toFixed(2)} MB
          </p>
          <p className="text-sm text-gray-500">
            {file.type || 'Unknown type'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default FilePreview;