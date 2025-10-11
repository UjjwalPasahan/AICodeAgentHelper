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

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface FileDiff {
  file: string;
  language: string;
  added: number;
  removed: number;
  preview: string;
}

export interface QueryResponse {
  sessionId: string;
  query: string;
  steps: TaskStep[];
  generatedCode: [];
  code: Record<string, string>;
  diffs: FileDiff[];
  diffSummary: {
    filesModified: number;
    linesAdded: number;
    linesRemoved: number;
    netChange: number;
  };
  remainingSteps: TaskStep[];
  timestamp: Date;
  relevantFiles: string[];
  tokensUsed: number;
  executionTime: number;
  filesModified: number;
}

export interface Session {
  sessionId: string;
  projectPath: string;
  messages: Message[];
  createdAt: Date;
  lastActiveAt: Date;
}


export interface Position {
  x: number;
  y: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}