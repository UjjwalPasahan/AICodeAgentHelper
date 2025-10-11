import React, { useState } from 'react';
import type { FileItem, TaskStep } from './types';
import { createSession, sendQuery, generateStep, previewChanges } from './utils/api';
import { processDirectory } from './utils/fileSystem';
import AppLayout from './components/layout/AppLayout';
import Sidebar from './components/layout/Sidebar';
import Editor from './components/layout/Editor';
import PlanningPanel from './components/panels/PlanningPanel';
import ChatPanel from './components/panels/ChatPanel';
import ResizablePanel from './components/common/ResizablePanel';

const AGENT_COLORS = {
  coder: 'bg-blue-600',
  reviewer: 'bg-purple-600',
  tester: 'bg-green-600',
  documenter: 'bg-yellow-600'
};

const AGENT_NAMES = {
  coder: 'Code Writer',
  reviewer: 'Code Reviewer',
  tester: 'Test Generator',
  documenter: 'Documentation'
};

export default function App() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [activeFile, setActiveFile] = useState<FileItem | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [taskSteps, setTaskSteps] = useState<TaskStep[]>([]);
  const [isPlanApproved, setIsPlanApproved] = useState(false);
  const [showPlanning, setShowPlanning] = useState(true);
  const [showChat, setShowChat] = useState(true);

  const handleOpenFolder = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker();
        setCurrentFolder(dirHandle.name);
        const fileTree = await processDirectory(dirHandle);
        setFiles(fileTree);
        setActiveFile(null);
      } else {
        alert('File System Access API not supported');
      }
    } catch (err) {
      console.error('Error opening folder:', err);
    }
  };

  const handleFileChange = (content: string) => {
    if (activeFile) {
      setActiveFile({ ...activeFile, content });
    }
  };

  const handlePlanGenerated = (steps: TaskStep[]) => {
    const stepsWithStatus = steps.map(s => ({ ...s, status: 'pending' as const }));
    setTaskSteps(stepsWithStatus);
    setIsPlanApproved(false);
    setShowPlanning(true);
  };

  const handleApprovePlan = () => {
    setIsPlanApproved(true);
  };

  const handleExecuteStep = async (stepNum: number) => {
    if (!currentFolder || !sessionId) return;

    const stepIndex = taskSteps.findIndex(s => s.step === stepNum);
    if (stepIndex === -1) return;

    const updatedSteps = [...taskSteps];
    updatedSteps[stepIndex] = { ...updatedSteps[stepIndex], status: 'executing' };
    setTaskSteps(updatedSteps);

    try {
      const result = await generateStep(taskSteps[stepIndex], currentFolder, sessionId);
      
      if (result) {
        updatedSteps[stepIndex] = { ...updatedSteps[stepIndex], status: 'completed' };
        setTaskSteps(updatedSteps);

        // Generate and preview diffs
        if (result.code) {
          const diffData = await previewChanges(currentFolder, result.code);
          
          if (diffData && diffData.diffs) {
            const totalFiles = diffData.diffs.length;
            const totalLines = diffData.diffs.reduce((sum: number, d: any) => sum + d.added + d.removed, 0);
            
            alert(`Step ${stepNum} completed!\n\nFiles to modify: ${totalFiles}\nTotal changes: ${totalLines} lines\n\nReview changes in the Planning Assistant panel.`);
          }
        }
      }
    } catch (error) {
      updatedSteps[stepIndex] = { ...updatedSteps[stepIndex], status: 'failed' };
      setTaskSteps(updatedSteps);
      console.error('Step execution error:', error);
    }
  };

  return (
    <AppLayout
      onOpenFolder={handleOpenFolder}
      currentFolder={currentFolder}
      taskSteps={taskSteps}
    >
      <div className="flex h-full p-4 gap-4">
        {/* Sidebar */}
        <ResizablePanel
          title="File Explorer"
          width="250px"
          height="100%"
          direction="horizontal"
        >
          <Sidebar
            files={files}
            onFileSelect={setActiveFile}
            activeFileId={activeFile?.id}
            currentFolder={currentFolder}
            expandedFolders={expandedFolders}
            onToggleFolder={(id) => setExpandedFolders(prev => ({ ...prev, [id]: !prev[id] }))}
          />
        </ResizablePanel>
        
        {/* Editor */}
        <ResizablePanel
          title="Code Editor"
          width="600px"
          height="100%"
          direction="horizontal"
        >
          <Editor file={activeFile} onFileChange={handleFileChange} />
        </ResizablePanel>
        
        {/* Right Panel */}
        <div className="flex flex-col gap-4">
          {/* Planning Panel */}
          {showPlanning && (
            <ResizablePanel
              title="Planning Panel"
              width="350px"
              height="400px"
              direction="both"
            >
              <PlanningPanel
                steps={taskSteps}
                onStepsUpdate={setTaskSteps}
                onExecuteStep={handleExecuteStep}
                onApprovePlan={handleApprovePlan}
                isEditing={!isPlanApproved}
              />
            </ResizablePanel>
          )}
          
          {/* Chat Panel */}
          {showChat && (
            <ResizablePanel
    title="Planning Assistant"
    width="350px"
    height="500px"  /* Changed from 300px to 500px */
    direction="both"
    minHeight={400}  /* Added minimum height */
  >
    <ChatPanel
      currentFolder={currentFolder}
      sessionId={sessionId}
      onSessionCreate={setSessionId}
      onPlanGenerated={handlePlanGenerated}
      onCodeGenerated={(result) => {}}
    />
  </ResizablePanel>
          )}
        </div>
      </div>
    </AppLayout>
  );
}