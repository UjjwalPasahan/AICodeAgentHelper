import React from 'react';
import { Minus, Square, X } from 'lucide-react';

interface WindowControlsProps {
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
}

const WindowControls: React.FC<WindowControlsProps> = ({
  onClose,
  onMinimize,
  onMaximize
}) => {
  return (
    <div className="flex space-x-1">
      {onMinimize && (
        <button
          onClick={onMinimize}
          className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
        >
          <Minus className="h-3 w-3" />
        </button>
      )}
      {onMaximize && (
        <button
          onClick={onMaximize}
          className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
        >
          <Square className="h-3 w-3" />
        </button>
      )}
      {onClose && (
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-red-600 text-gray-400 hover:text-white"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

export default WindowControls;