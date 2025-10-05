import React from 'react';
import { Folder, FileText, ChevronRight } from 'lucide-react';
import type{ FileItem } from '../../types';

interface SidebarProps {
  files: FileItem[];
  onFileSelect: (file: FileItem) => void;
  activeFileId?: string;
  currentFolder?: string | null;
  expandedFolders: Record<string, boolean>;
  onToggleFolder: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  files,
  onFileSelect,
  activeFileId,
  currentFolder,
  expandedFolders,
  onToggleFolder
}) => {
  const renderFileTree = (items: FileItem[], level = 0) => {
    return items.map(item => {
      const isActive = item.id === activeFileId;
      const isExpanded = expandedFolders[item.id];
      
      if (item.type === 'folder') {
        return (
          <div key={item.id}>
            <div 
              className={`flex items-center py-1 px-2 hover:bg-gray-800 cursor-pointer`}
              style={{ paddingLeft: `${(level * 16) + 8}px` }}
              onClick={() => onToggleFolder(item.id)}
            >
              <ChevronRight className={`h-4 w-4 mr-1 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              <Folder className="h-4 w-4 mr-2 text-yellow-500" />
              <span className="truncate text-sm">{item.name}</span>
            </div>
            {isExpanded && item.children && (
              <div>{renderFileTree(item.children, level + 1)}</div>
            )}
          </div>
        );
      }
      
      return (
        <div 
          key={item.id}
          className={`flex items-center py-1 px-2 hover:bg-gray-800 cursor-pointer ${isActive ? 'bg-gray-800' : ''}`}
          style={{ paddingLeft: `${(level * 16) + 8}px` }}
          onClick={() => onFileSelect(item)}
        >
          <FileText className="h-4 w-4 mr-2 text-blue-400" />
          <span className="truncate text-sm">{item.name}</span>
        </div>
      );
    });
  };

  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-3 border-b border-gray-800">
        <div className="text-xs uppercase text-gray-500 px-2 py-1 font-medium">
          Explorer
          {currentFolder && <span className="ml-2 text-blue-400">- {currentFolder}</span>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {files.length > 0 ? renderFileTree(files) : (
          <div className="p-4 text-center text-gray-500">
            <Folder className="h-12 w-12 mx-auto mb-2 text-gray-700" />
            <p className="text-sm">No folder opened</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;