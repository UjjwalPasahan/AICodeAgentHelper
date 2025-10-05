export interface FileItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path?: string;
  content?: string;
  children?: FileItem[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface TaskStep {
  step: number;
  title: string;
  description: string;
  files: string[];
  dependencies: number[];
  agent: 'coder' | 'reviewer' | 'tester' | 'documenter';
  status: 'pending' | 'executing' | 'completed' | 'failed';
  estimatedTokens?: number;
}

export interface CodeResult {
  step: number;
  title: string;
  code: Record<string, string>;
  explanation: string;
  tokensUsed: number;
  agent: string;
}

export interface FileDiff {
  file: string;
  language: string;
  added: number;
  removed: number;
  preview: string;
}

export interface Position {
  x: number;
  y: number;
}