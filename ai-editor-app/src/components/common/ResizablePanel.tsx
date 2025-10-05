import React, { useState, useRef, useEffect } from 'react';

interface ResizablePanelProps {
  title: string;
  children: React.ReactNode;
  width?: string;
  height?: string;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  direction?: 'horizontal' | 'vertical' | 'both';
  className?: string;
}

const ResizablePanel: React.FC<ResizablePanelProps> = ({
  title,
  children,
  width = '300px',
  height = '400px',
  minWidth = 200,
  minHeight = 150,
  maxWidth = 800,
  maxHeight = 800,
  direction = 'both',
  className = ''
}) => {
  const [dimensions, setDimensions] = useState({ width, height });
  const [isResizing, setIsResizing] = useState(false);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const startResize = (e: React.MouseEvent, resizeDirection: string) => {
    e.preventDefault();
    setIsResizing(true);
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = panelRef.current?.offsetWidth || parseInt(width);
    const startHeight = panelRef.current?.offsetHeight || parseInt(height);

    const doResize = (moveEvent: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = startWidth + (moveEvent.clientX - startX);
      const newHeight = startHeight + (moveEvent.clientY - startY);
      
      if (resizeDirection.includes('horizontal')) {
        setDimensions(prev => ({
          ...prev,
          width: `${Math.min(Math.max(newWidth, minWidth), maxWidth)}px`
        }));
      }
      
      if (resizeDirection.includes('vertical')) {
        setDimensions(prev => ({
          ...prev,
          height: `${Math.min(Math.max(newHeight, minHeight), maxHeight)}px`
        }));
      }
    };

    const stopResize = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', doResize);
      document.removeEventListener('mouseup', stopResize);
    };

    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
  };

  useEffect(() => {
    setDimensions({ width, height });
  }, [width, height]);

  return (
    <div
      ref={panelRef}
      className={`bg-gray-900 border border-gray-700 rounded-lg shadow-lg overflow-hidden flex flex-col ${className}`}
      style={{
        width: dimensions.width,
        height: dimensions.height,
        zIndex: isResizing ? 1000 : 'auto'
      }}
    >
      <div className="flex items-center justify-between p-2 bg-gray-800">
        <div className="text-sm font-medium text-gray-200">{title}</div>
      </div>
      
      <div className="flex-1 overflow-auto">
        {children}
      </div>
      
      {/* Resize handles */}
      {(direction === 'horizontal' || direction === 'both') && (
        <div
          ref={resizeHandleRef}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
          onMouseDown={(e) => startResize(e, 'both')}
        >
          <div className="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-gray-500"></div>
        </div>
      )}
      
      {(direction === 'vertical' || direction === 'both') && (
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize"
          onMouseDown={(e) => startResize(e, 'vertical')}
        ></div>
      )}
      
      {(direction === 'horizontal' || direction === 'both') && (
        <div
          className="absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize"
          onMouseDown={(e) => startResize(e, 'horizontal')}
        ></div>
      )}
    </div>
  );
};

export default ResizablePanel;