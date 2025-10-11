const API_BASE = "http://localhost:3000";

export const createSession = async (projectPath: string) => {
  try {
    const response = await fetch(`${API_BASE}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectPath }),
    });
    const data = await response.json();
    return data.sessionId;
  } catch (error) {
    console.error("Failed to create session:", error);
    return null;
  }
};

export const sendQuery = async (
  query: string,
  projectPath: string,
  sessionId: string
) => {
  try {
    const response = await fetch(`${API_BASE}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        projectPath,
        sessionId,
        generateAll: false,
      }),
    });
    return await response.json();
  } catch (error) {
    console.error("Failed to send query:", error);
    return null;
  }
};

export const generateStep = async (
  step: any,
  projectPath: string,
  sessionId: string
) => {
  try {
    const response = await fetch(`${API_BASE}/api/generate-step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step,
        projectPath,
        sessionId,
      }),
    });
    return await response.json();
  } catch (error) {
    console.error("Failed to generate step:", error);
    return null;
  }
};

export const applyDiff = async (
  projectPath: string,
  file: string,
  newContent: string
) => {
  try {
    const response = await fetch(`${API_BASE}/api/apply-diff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectPath, file, newContent }),
    });
    return await response.json();
  } catch (error) {
    console.error("Failed to apply diff:", error);
    return null;
  }
};

export const previewChanges = async (
  projectPath: string,
  code: Record<string, string>
) => {
  try {
    const response = await fetch(`${API_BASE}/api/preview-changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectPath, code }),
    });
    return await response.json();
  } catch (error) {
    console.error("Failed to preview changes:", error);
    return null;
  }
};
