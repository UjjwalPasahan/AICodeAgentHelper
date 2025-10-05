import React from 'react';
import { Folder } from 'lucide-react';

interface AppLayoutProps {
  children: React.ReactNode;
  onOpenFolder: () => void;
  currentFolder: string | null;
  taskSteps: any[];
}

const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  onOpenFolder,
  currentFolder,
  taskSteps
}) => {
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-300">
      <div className="flex items-center px-4 py-2 bg-gray-900 border-b border-gray-800">
        <button
          onClick={onOpenFolder}
          className="flex items-center gap-2 text-sm px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded"
        >
          <Folder className="h-4 w-4" />
          Open Folder
        </button>
        <div className="ml-4 text-xs text-gray-500">
          Traycer-Inspired Planning Layer
        </div>
      </div>
      
      <div className="flex-1 relative overflow-hidden">
        {children}
      </div>
      
      <div className="flex items-center px-4 py-1 bg-gray-900 text-gray-400 text-xs border-t border-gray-800">
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <Folder className="h-3 w-3 mr-1 text-blue-500" />
            {currentFolder || 'No folder opened'}
          </div>
          {taskSteps.length > 0 && (
            <div className="flex items-center gap-1">
              <span>{taskSteps.filter(s => s.status === 'completed').length}/{taskSteps.length} steps completed</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppLayout;