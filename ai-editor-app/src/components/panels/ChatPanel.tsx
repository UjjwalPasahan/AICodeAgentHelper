import React, { useEffect, useRef, useState } from 'react';
import { Send, AlertCircle, Loader2 } from 'lucide-react';
import type { Message } from '../../types';
import { createSession, sendQuery } from '../../utils/api';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !currentFolder || isProcessing) return;

    let currentSessionId = sessionId;
    if (!currentSessionId) {
      currentSessionId = await createSession(currentFolder);
      if (!currentSessionId) return;
      onSessionCreate(currentSessionId);
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
      const data = await sendQuery(input, currentFolder, currentSessionId);
      
      if (data) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Plan generated with ${data.steps?.length || 0} steps. Review and approve to execute.`,
          timestamp: new Date()
        }]);

        if (data.steps) {
          onPlanGenerated(data.steps);
        }
      } else {
        throw new Error('No response from server');
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Error: Failed to process request.',
        timestamp: new Date()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-80 border-l border-gray-800 flex flex-col bg-gray-900">
      <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
        <span className="font-medium text-sm">Planning Assistant</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-full px-3 py-2 rounded-lg ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-200'
            }`}>
              <div className="text-sm">{msg.content}</div>
              <div className="text-xs mt-1 opacity-70">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-3 border-t border-gray-800">
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
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
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