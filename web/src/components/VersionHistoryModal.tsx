import React from 'react';
import { X } from 'lucide-react';
import type { File as BlockchainFile } from '@/types/file';

interface VersionHistoryModalProps {
  file: BlockchainFile;
  versions: BlockchainFile[];
  onClose: () => void;
}

const VersionHistoryModal = ({ file, versions, onClose }: VersionHistoryModalProps) => {
  const sortedVersions = [...versions].sort((a, b) => b.version - a.version);

  return (
    <div className="fixed inset-0 overflow-y-auto z-50">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
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

          <div className="sm:flex sm:items-start">
            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Version History for {file.name}
              </h3>
              
              <div className="mt-4">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                </div>

                <ul className="mt-6 space-y-6">
                  {sortedVersions.map((version) => (
                    <li key={version.id} className="relative flex gap-x-4">
                      <div className="absolute left-0 top-0 flex w-6 justify-center -bottom-6">
                        <div className="w-px bg-gray-200"></div>
                      </div>
                      <div className="relative flex h-6 w-6 flex-none items-center justify-center bg-white">
                        <div className="h-1.5 w-1.5 rounded-full bg-gray-100 ring-1 ring-gray-300"></div>
                      </div>
                      <div className="flex-auto">
                        <div className="flex items-baseline justify-between gap-x-4">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              Version {version.version}
                            </p>
                            <p className="mt-1 text-sm text-gray-500">
                              Updated by {version.owner}
                            </p>
                          </div>
                          <time className="flex-none text-xs text-gray-500">
                            {new Date(version.timestamp).toLocaleString()}
                          </time>
                        </div>
                        <p className="mt-3 text-sm text-gray-500 break-all">
                          Hash: {version.hash}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VersionHistoryModal;