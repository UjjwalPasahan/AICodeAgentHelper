import React, { useState } from 'react';
import { Check, X, FileText } from 'lucide-react';

interface EnhancedFileDiff {
  file: string;
  language: string;
  oldContent: string;
  newContent: string;
  added: number;
  removed: number;
  preview: string;
  hunks?: any[];
  changes?: any[];
}

interface DiffViewerProps {
  diffs: EnhancedFileDiff[];
  onApplyDiff: (file: string, newContent: string) => void;
  onRejectDiff: (file: string) => void;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ diffs, onApplyDiff, onRejectDiff }) => {
  const [appliedFiles, setAppliedFiles] = useState<Record<string, boolean>>({});

  const handleApply = (diff: EnhancedFileDiff) => {
    console.log('🔧 Applying diff for:', diff.file);
    onApplyDiff(diff.file, diff.newContent);
    setAppliedFiles(prev => ({ ...prev, [diff.file]: true }));
  };

  const handleReject = (file: string) => {
    console.log('❌ Rejecting diff for:', file);
    onRejectDiff(file);
  };

  console.log('🎨 DiffViewer: Rendering', diffs.length, 'diffs');

  return (
    <div className="space-y-2">
      {diffs.map((diff, idx) => (
        <div key={idx} className="bg-gray-800 rounded border border-gray-700 p-3">
          {/* File Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-medium text-white">{diff.file}</span>
              <span className="text-xs text-green-400">+{diff.added}</span>
              <span className="text-xs text-red-400">-{diff.removed}</span>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              {appliedFiles[diff.file] ? (
                <span className="text-xs text-green-400 flex items-center gap-1 px-2 py-1 bg-green-900/30 rounded">
                  <Check className="h-3 w-3" /> Applied
                </span>
              ) : (
                <>
                  <button
                    onClick={() => handleApply(diff)}
                    className="text-xs px-3 py-1 bg-green-600 hover:bg-green-700 rounded flex items-center gap-1 text-white font-medium"
                  >
                    <Check className="h-3 w-3" />
                    Apply
                  </button>
                  <button
                    onClick={() => handleReject(diff.file)}
                    className="text-xs px-3 py-1 bg-red-600 hover:bg-red-700 rounded flex items-center gap-1 text-white font-medium"
                  >
                    <X className="h-3 w-3" />
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Preview */}
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-300 select-none">
              Show diff preview
            </summary>
            <div className="mt-2 p-2 bg-gray-900 rounded font-mono text-xs overflow-x-auto">
              <pre className="text-gray-300 whitespace-pre-wrap">{diff.preview}</pre>
            </div>
          </details>
        </div>
      ))}
    </div>
  );
};

export default DiffViewer;