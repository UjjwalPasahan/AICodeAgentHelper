import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import type { FileItem } from '../../types';

interface EditorProps {
  file: FileItem | null;
  onFileChange: (content: string) => void;
}

const Editor: React.FC<EditorProps> = ({ file, onFileChange }) => {
  const [content, setContent] = useState('');

  useEffect(() => {
    setContent(file?.content || '');
  }, [file]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    onFileChange(e.target.value);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-950">
      {file ? (
        <>
          <div className="bg-gray-900 px-4 py-2 text-sm border-b border-gray-800">
            <span className="font-medium">{file.name}</span>
          </div>
          <textarea
            value={content}
            onChange={handleChange}
            className="flex-1 p-4 bg-gray-950 text-gray-200 font-mono text-sm resize focus:outline-none"
            spellCheck="false"
          />
        </>
      ) : (
        <div className="h-full flex items-center justify-center text-gray-600">
          <div className="text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-gray-700" />
            <p>No file selected</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Editor;