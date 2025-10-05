import React, { useState } from 'react';
import { GitBranch, CheckCircle, Clock, Edit, Trash2, Plus, ArrowRight, Play, Loader2 } from 'lucide-react';
import type { TaskStep } from '../../types';

interface PlanningPanelProps {
  steps: TaskStep[];
  onStepsUpdate: (steps: TaskStep[]) => void;
  onExecuteStep: (step: number) => void;
  onApprovePlan: () => void;
  isEditing: boolean;
}

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

const PlanningPanel: React.FC<PlanningPanelProps> = ({
  steps,
  onStepsUpdate,
  onExecuteStep,
  onApprovePlan,
  isEditing
}) => {
  const [editingStep, setEditingStep] = useState<number | null>(null);

  const handleEditStep = (step: TaskStep, updates: Partial<TaskStep>) => {
    const updated = steps.map(s => s.step === step.step ? { ...s, ...updates } : s);
    onStepsUpdate(updated);
    setEditingStep(null);
  };

  const handleDeleteStep = (stepNum: number) => {
    const updated = steps.filter(s => s.step !== stepNum)
      .map((s, idx) => ({ ...s, step: idx + 1 }));
    onStepsUpdate(updated);
  };

  const handleAddStep = () => {
    const newStep: TaskStep = {
      step: steps.length + 1,
      title: 'New Step',
      description: 'Describe what needs to be done',
      files: [],
      dependencies: [],
      agent: 'coder',
      status: 'pending'
    };
    onStepsUpdate([...steps, newStep]);
    setEditingStep(newStep.step);
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-blue-400" />
          <span className="font-medium text-sm">Execution Plan</span>
        </div>
        {isEditing && (
          <div className="flex gap-2">
            <button
              onClick={handleAddStep}
              className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              Add Step
            </button>
            <button
              onClick={onApprovePlan}
              className="text-xs px-3 py-1 bg-green-600 hover:bg-green-700 rounded flex items-center gap-1"
            >
              <CheckCircle className="h-3 w-3" />
              Approve & Execute
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {steps.map((step, idx) => (
          <div key={step.step} className="relative">
            {/* Dependency line */}
            {idx > 0 && (
              <div className="absolute left-6 -top-3 w-0.5 h-3 bg-gray-700" />
            )}
            
            <div className={`bg-gray-800 rounded-lg p-3 border-2 ${
              step.status === 'completed' ? 'border-green-600' :
              step.status === 'executing' ? 'border-blue-500 animate-pulse' :
              step.status === 'failed' ? 'border-red-600' :
              'border-gray-700'
            }`}>
              {editingStep === step.step ? (
                <div className="space-y-2">
                  <input
                    className="w-full bg-gray-700 px-2 py-1 rounded text-sm"
                    value={step.title}
                    onChange={(e) => handleEditStep(step, { title: e.target.value })}
                    placeholder="Step title"
                  />
                  <textarea
                    className="w-full bg-gray-700 px-2 py-1 rounded text-xs resize-none"
                    rows={2}
                    value={step.description}
                    onChange={(e) => handleEditStep(step, { description: e.target.value })}
                    placeholder="Description"
                  />
                  <select
                    className="w-full bg-gray-700 px-2 py-1 rounded text-xs"
                    value={step.agent}
                    onChange={(e) => handleEditStep(step, { agent: e.target.value as any })}
                  >
                    <option value="coder">Code Writer</option>
                    <option value="reviewer">Code Reviewer</option>
                    <option value="tester">Test Generator</option>
                    <option value="documenter">Documentation</option>
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingStep(null)}
                      className="text-xs px-2 py-1 bg-green-600 rounded"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingStep(null)}
                      className="text-xs px-2 py-1 bg-gray-600 rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1">
                      <div className={`w-6 h-6 rounded-full ${AGENT_COLORS[step.agent]} flex items-center justify-center text-xs font-bold`}>
                        {step.step}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{step.title}</div>
                        <div className="text-xs text-gray-400">{AGENT_NAMES[step.agent]}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {step.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {step.status === 'executing' && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
                      {step.status === 'pending' && <Clock className="h-4 w-4 text-gray-500" />}
                      
                      {isEditing && (
                        <>
                          <button
                            onClick={() => setEditingStep(step.step)}
                            className="p-1 hover:bg-gray-700 rounded"
                          >
                            <Edit className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteStep(step.step)}
                            className="p-1 hover:bg-gray-700 rounded text-red-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-gray-400 mb-2">{step.description}</div>
                  
                  {step.files.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {step.files.map((file, i) => (
                        <span key={i} className="text-xs bg-gray-700 px-2 py-1 rounded">
                          {file}
                        </span>
                      ))}
                    </div>
                  )}

                  {!isEditing && step.status === 'pending' && (
                    <button
                      onClick={() => onExecuteStep(step.step)}
                      className="text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded flex items-center gap-1 mt-2"
                    >
                      <Play className="h-3 w-3" />
                      Execute Step
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Show arrow to next step */}
            {idx < steps.length - 1 && (
              <div className="flex justify-center my-1">
                <ArrowRight className="h-4 w-4 text-gray-600" />
              </div>
            )}
          </div>
        ))}

        {steps.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <GitBranch className="h-12 w-12 mx-auto mb-2 text-gray-700" />
            <p className="text-sm">No plan generated yet</p>
            <p className="text-xs mt-1">Ask the AI to create a task plan</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanningPanel;