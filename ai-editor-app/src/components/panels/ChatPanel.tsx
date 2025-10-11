import React, { useEffect, useRef, useState } from 'react';
import { Send, AlertCircle, Loader2 } from 'lucide-react';
import type { Message } from '../../types';
import { createSession, sendQuery, applyDiff } from '../../utils/api';
import DiffViewer from '../common/DiffViewer';

interface ChatPanelProps {
  currentFolder: string | null;
  sessionId: string | null;
  onSessionCreate: (id: string) => void;
  onPlanGenerated: (steps: any[]) => void;
  onCodeGenerated: (result: any) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  currentFolder,
  sessionId,
  onSessionCreate,
  onPlanGenerated,
  onCodeGenerated
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [diffs, setDiffs] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleApplyDiff = async (file: string, newContent: string) => {
    if (!currentFolder) return;

    try {
      const result = await applyDiff(currentFolder, file, newContent);
      
      if (result && result.success) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `✅ Applied changes to ${file}`,
          timestamp: new Date()
        }]);
        
        setDiffs(prev => prev.filter(d => d.file !== file));
      } else {
        throw new Error('Failed to apply diff');
      }
    } catch (error) {
      console.error('Error applying diff:', error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `❌ Failed to apply changes to ${file}`,
        timestamp: new Date()
      }]);
    }
  };

  const handleRejectDiff = (file: string) => {
    setDiffs(prev => prev.filter(d => d.file !== file));
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      content: `Rejected changes to ${file}`,
      timestamp: new Date()
    }]);
  };

  const handleSend = async () => {
    if (!input.trim() || !currentFolder || isProcessing) return;

    let currentSessionId = sessionId;
    
    // Create session if needed
    if (!currentSessionId) {
      try {
        currentSessionId = await createSession(currentFolder);
        if (!currentSessionId) {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'assistant',
            content: '❌ Failed to create session. Please try reopening the folder.',
            timestamp: new Date()
          }]);
          return;
        }
        onSessionCreate(currentSessionId);
        console.log('✅ Session created:', currentSessionId);
      } catch (err) {
        console.error('Session creation error:', err);
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: '❌ Error creating session. Check console for details.',
          timestamp: new Date()
        }]);
        return;
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      console.log('📤 Sending query:', { query: input, projectPath: currentFolder, sessionId: currentSessionId });
      
      const data = await sendQuery(input, currentFolder, currentSessionId);
      
      console.log('📥 Received response:', data);
      
      if (data) {
        const filesModified = data.diffs?.length || 0;
        
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Plan generated with ${data.steps?.length || 0} steps. ${filesModified} file${filesModified !== 1 ? 's' : ''} will be modified.`,
          timestamp: new Date()
        }]);

        if (data.steps) {
          onPlanGenerated(data.steps);
        }

        if (data.diffs && data.diffs.length > 0) {
          setDiffs(data.diffs);
          
          setMessages(prev => [...prev, {
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: `📝 Review the changes below and click Apply to update your files.`,
            timestamp: new Date()
          }]);
        }
      } else {
        throw new Error('No response from server');
      }
    } catch (error: any) {
      console.error('❌ Query error:', error);
      
      const errorMsg = error.message || 'Unknown error';
      const isPathError = errorMsg.includes('not found') || errorMsg.includes('ENOENT');
      
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: isPathError 
          ? `❌ Error: Could not find project folder "${currentFolder}". Please try reopening the folder.`
          : `❌ Error: ${errorMsg}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <span className="font-medium text-sm">Planning Assistant</span>
      </div>
      
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-lg ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-200'
            }`}>
              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
              <div className="text-xs mt-1 opacity-70">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {/* Diff Viewer - Shown inline with messages */}
        {diffs.length > 0 && (
          <div className="bg-gray-850 rounded-lg p-3 border border-blue-500">
            <div className="text-sm font-medium text-white mb-3">
              📋 Review Changes ({diffs.length} file{diffs.length !== 1 ? 's' : ''})
            </div>
            <DiffViewer
              diffs={diffs}
              onApplyDiff={handleApplyDiff}
              onRejectDiff={handleRejectDiff}
            />
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input Area */}
      <div className="p-3 border-t border-gray-800 flex-shrink-0">
        {!currentFolder && (
          <div className="mb-2 text-xs text-yellow-400 flex items-center">
            <AlertCircle className="h-3 w-3 mr-1" />
            Open a folder first
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-200"
            placeholder={currentFolder ? "Describe your task..." : "Open folder first..."}
            disabled={isProcessing || !currentFolder}
          />
          <button
            onClick={handleSend}
            disabled={isProcessing || !input.trim() || !currentFolder}
            className={`px-3 rounded flex items-center justify-center ${
              isProcessing || !input.trim() || !currentFolder
                ? 'bg-gray-700 text-gray-500'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;