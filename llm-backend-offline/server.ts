// ============================================================================
// PRODUCTION AI CODE ASSISTANT - Enhanced for Take-Home
// Features: Streaming, Diffs, Multi-turn conversations, Complete generation
// ============================================================================

import express from "express";
import cors from "cors";
import axios from "axios";
import { CloudClient } from "chromadb";
import { MongoClient, Db, ObjectId } from "mongodb";
import * as fs from "fs/promises";
import * as path from "path";
import crypto from "crypto";
import { diffLines, Change } from "diff";

const CONFIG = {
  PORT: parseInt(process.env.PORT || "3000"),
  EURON_API_KEY:
    "euri-9b898b860443d8ad49b2305502e749d1658fbc05e8fef4cb56dd80ae888f60f3",
  EURON_BASE_URL: "https://api.euron.one/api/v1/euri",
  PLANNING_MODEL: "gpt-4.1-mini",
  CODE_MODEL: "gpt-5-mini-2025-08-07",
  EMBEDDING_MODEL: "text-embedding-3-small",
  MONGO_URI:
    "mongodb+srv://ujjwalPasahan:Pusu48171@cluster0.yt1gprk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
  DB_NAME: "ai_code_assistant",
  CHROMA_API_KEY: "ck-6Vj3AEc2Ju9mSxw3MHQWBZyRUGU48DPjWN22KaiVPG2M",
  CHROMA_TENANT: "af49e641-4574-472f-a3fb-e5c493750373",
  CHROMA_DATABASE: "testing",

  CHUNK_SIZE: 600,
  CHUNK_OVERLAP: 100,
  MAX_CONTEXT_TOKENS: 6000,
  BATCH_SIZE: 50,
  CACHE_TTL: 7 * 24 * 60 * 60 * 1000,
  MAX_CONVERSATION_HISTORY: 10,
};

// ============================================================================
// TYPES
// ============================================================================

interface ProcessedFile {
  path: string;
  content: string;
  language: string;
  hash: string;
  chunks: { id: string; content: string; start: number; end: number }[];
}

interface TaskStep {
  step: number;
  title: string;
  description: string;
  files: string[];
  dependencies: number[];
}

interface QueryContext {
  structure: string;
  readme: string;
  relevantChunks: any[];
  relevantFiles: string[];
}

interface CodeGenerationResult {
  step: number;
  title: string;
  code: Record<string, string>;
  explanation: string;
  tokensUsed: number;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  tokensUsed?: number;
}

interface Session {
  _id?: ObjectId;
  sessionId: string;
  projectPath: string;
  messages: ConversationMessage[];
  createdAt: Date;
  lastActiveAt: Date;
}

interface FileDiff {
  file: string;
  language: string;
  changes: Change[];
  added: number;
  removed: number;
  preview: string;
}

interface EnhancedFileDiff {
  file: string;
  language: string;
  oldContent: string;
  newContent: string;
  changes: Change[];
  added: number;
  removed: number;
  preview: string;
  hunks: DiffHunk[];
}

interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

// ============================================================================
// MONGO SERVICE (Enhanced with Sessions)
// ============================================================================

class MongoService {
  private client: MongoClient;
  private db!: Db;

  constructor() {
    this.client = new MongoClient(CONFIG.MONGO_URI);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db(CONFIG.DB_NAME);
    await this.db
      .collection("queries")
      .createIndex({ queryHash: 1, projectPath: 1 });
    await this.db
      .collection("file_hashes")
      .createIndex({ projectPath: 1, filePath: 1 }, { unique: true });
    await this.db
      .collection("sessions")
      .createIndex({ sessionId: 1 }, { unique: true });
    await this.db
      .collection("sessions")
      .createIndex({ lastActiveAt: 1 }, { expireAfterSeconds: 86400 }); // 24h TTL
    console.log("✅ MongoDB connected");
  }

  async getFileHash(
    projectPath: string,
    filePath: string
  ): Promise<string | null> {
    const result = await this.db
      .collection("file_hashes")
      .findOne({ projectPath, filePath });
    return result?.hash || null;
  }

  async updateFileHash(
    projectPath: string,
    filePath: string,
    hash: string
  ): Promise<void> {
    await this.db
      .collection("file_hashes")
      .updateOne(
        { projectPath, filePath },
        { $set: { hash, updatedAt: new Date() } },
        { upsert: true }
      );
  }

  async getCachedQuery(query: string, projectPath: string): Promise<any> {
    const queryHash = crypto
      .createHash("md5")
      .update(query + projectPath)
      .digest("hex");
    const result = await this.db.collection("queries").findOne({
      queryHash,
      createdAt: { $gt: new Date(Date.now() - CONFIG.CACHE_TTL) },
    });
    return result;
  }

  async cacheQuery(
    query: string,
    projectPath: string,
    response: any,
    context: any
  ): Promise<void> {
    const queryHash = crypto
      .createHash("md5")
      .update(query + projectPath)
      .digest("hex");
    await this.db
      .collection("queries")
      .updateOne(
        { queryHash, projectPath },
        { $set: { response, context, createdAt: new Date() } },
        { upsert: true }
      );
  }

  async keywordSearch(
    query: string,
    projectPath: string,
    limit: number = 5
  ): Promise<any[]> {
    const keywords = query
      .toLowerCase()
      .split(" ")
      .filter((w) => w.length > 3);
    const results = await this.db
      .collection("chunks")
      .find({
        projectPath,
        $or: keywords.map((kw) => ({ contentLower: { $regex: kw } })),
      })
      .limit(limit)
      .toArray();
    return results;
  }

  // Session management
  async createSession(projectPath: string): Promise<string> {
    const sessionId = crypto.randomUUID();
    await this.db.collection<Session>("sessions").insertOne({
      sessionId,
      projectPath,
      messages: [],
      createdAt: new Date(),
      lastActiveAt: new Date(),
    });
    return sessionId;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return await this.db.collection<Session>("sessions").findOne({ sessionId });
  }

  async addMessage(
    sessionId: string,
    message: ConversationMessage
  ): Promise<void> {
    await this.db.collection<Session>("sessions").updateOne(
      { sessionId },
      {
        $push: {
          messages: {
            $each: [message],
            $slice: -CONFIG.MAX_CONVERSATION_HISTORY,
          },
        },
        $set: { lastActiveAt: new Date() },
      }
    );
  }

  async getConversationHistory(
    sessionId: string
  ): Promise<ConversationMessage[]> {
    const session = await this.getSession(sessionId);
    return session?.messages || [];
  }
}

// ============================================================================
// CHROMA SERVICE
// ============================================================================

class ChromaService {
  private client: CloudClient;
  private collection: any = null;

  constructor() {
    this.client = new CloudClient({
      apiKey: CONFIG.CHROMA_API_KEY,
      tenant: CONFIG.CHROMA_TENANT,
      database: CONFIG.CHROMA_DATABASE,
    });
  }

  async initialize(): Promise<void> {
    this.collection = await this.client.getOrCreateCollection({
      name: "code_chunks",
      metadata: { "hnsw:space": "cosine" },
      embeddingFunction: undefined,
    });
    console.log("✅ ChromaDB Cloud connected");
  }

  async addChunksBatch(
    chunks: Array<{
      id: string;
      content: string;
      metadata: any;
      embedding: number[];
    }>
  ): Promise<void> {
    if (chunks.length === 0) return;

    await this.collection.add({
      ids: chunks.map((c) => c.id),
      embeddings: chunks.map((c) => c.embedding),
      documents: chunks.map((c) => c.content),
      metadatas: chunks.map((c) => c.metadata),
    });
  }

  async searchSimilar(
    queryEmbedding: number[],
    limit: number = 12
  ): Promise<any> {
    return await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
    });
  }
}

// ============================================================================
// EURON SERVICE (Enhanced with streaming)
// ============================================================================

class EuronService {
  private axios = axios.create({
    baseURL: CONFIG.EURON_BASE_URL,
    headers: { Authorization: `Bearer ${CONFIG.EURON_API_KEY}` },
  });

  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      const response = await this.axios.post("/embeddings", {
        input: texts,
        model: CONFIG.EMBEDDING_MODEL,
      });
      return response.data.data.map((d: any) => d.embedding);
    } catch (error: any) {
      console.error("Batch embedding error:", error.message);
      throw error;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddingsBatch([text]);
    return embeddings[0];
  }

  async planTask(
    query: string,
    context: string,
    conversationHistory: ConversationMessage[] = []
  ): Promise<TaskStep[]> {
    try {
      const historyContext =
        conversationHistory.length > 0
          ? `\n\nConversation History:\n${conversationHistory
              .slice(-3)
              .map((m) => `${m.role}: ${m.content}`)
              .join("\n")}`
          : "";

      const systemPrompt = `You are a task planning expert. Break down the user's request into clear, actionable steps.

Context about the project:
${context}${historyContext}

Return a JSON object with a "steps" array in this exact format:
{
  "steps": [
    {
      "step": 1,
      "title": "Step title",
      "description": "What needs to be done",
      "files": ["file1.ts", "file2.ts"],
      "dependencies": []
    }
  ]
}

Keep steps atomic, specific, and ordered by dependencies.`;

      const response = await this.axios.post("/chat/completions", {
        model: CONFIG.PLANNING_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query },
        ],
        max_tokens: 1500,
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const content = response.data.choices[0].message.content;
      const parsed = JSON.parse(content);

      let steps: TaskStep[] = [];

      if (Array.isArray(parsed)) {
        steps = parsed;
      } else if (parsed.steps && Array.isArray(parsed.steps)) {
        steps = parsed.steps;
      } else if (parsed.tasks && Array.isArray(parsed.tasks)) {
        steps = parsed.tasks;
      } else {
        steps = [
          {
            step: 1,
            title: "Complete task",
            description: query,
            files: [],
            dependencies: [],
          },
        ];
      }

      return steps.map((step: any, index: number) => ({
        step: step.step || index + 1,
        title: step.title || `Step ${index + 1}`,
        description: step.description || step.desc || query,
        files: Array.isArray(step.files) ? step.files : [],
        dependencies: Array.isArray(step.dependencies) ? step.dependencies : [],
      }));
    } catch (error: any) {
      console.error("Planning error:", error.message);
      return [
        {
          step: 1,
          title: "Complete task",
          description: query,
          files: [],
          dependencies: [],
        },
      ];
    }
  }

  async generateCodeForStep(
    step: TaskStep,
    projectContext: string,
    existingFiles: Map<string, string>
  ): Promise<CodeGenerationResult> {
    try {
      // Include existing file content for context
      const fileContext = step.files
        .map((f) => {
          const content = existingFiles.get(f);
          return content ? `\n// Existing ${f}:\n${content.slice(0, 500)}` : "";
        })
        .join("\n");

      const systemPrompt = `You are a code generation assistant. Generate complete, working code for the given step.

Project Context:
${projectContext}
${fileContext}

Return JSON in this format:
{
  "code": {
    "filepath": "complete file content here"
  },
  "explanation": "What was implemented and why"
}

Generate COMPLETE files, not snippets. Include all necessary imports, types, and logic.`;

      const userPrompt = `Step ${step.step}: ${step.title}
Description: ${step.description}
Files: ${step.files.join(", ")}`;

      const response = await this.axios.post("/chat/completions", {
        model: CONFIG.CODE_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 2500,
        temperature: 0.4,
        response_format: { type: "json_object" },
      });

      const content = response.data.choices[0].message.content;
      const tokensUsed = response.data.usage?.total_tokens || 0;

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        console.warn("JSON parse failed for step", step.step);
        parsed = { code: {}, explanation: step.description };
      }

      const code = parsed.code || parsed.files || {};
      const explanation =
        parsed.explanation || parsed.summary || step.description;

      return {
        step: step.step,
        title: step.title,
        code: typeof code === "object" ? code : {},
        explanation:
          typeof explanation === "string" ? explanation : step.description,
        tokensUsed,
      };
    } catch (error: any) {
      console.error("Code generation error:", error.message);
      return {
        step: step.step,
        title: step.title,
        code: {},
        explanation: `Error: ${error.message}`,
        tokensUsed: 0,
      };
    }
  }

  // Streaming for real-time responses
  async *streamCodeGeneration(
    step: TaskStep,
    projectContext: string,
    existingFiles: Map<string, string>
  ): AsyncGenerator<string, void, unknown> {
    try {
      const fileContext = step.files
        .map((f) => {
          const content = existingFiles.get(f);
          return content ? `\n// ${f}:\n${content.slice(0, 300)}` : "";
        })
        .join("\n");

      const response = await this.axios.post(
        "/chat/completions",
        {
          model: CONFIG.CODE_MODEL,
          messages: [
            {
              role: "system",
              content: `Generate code for: ${step.title}\n${projectContext}${fileContext}`,
            },
            { role: "user", content: step.description },
          ],
          max_tokens: 2000,
          temperature: 0.4,
          stream: true,
        },
        { responseType: "stream" }
      );

      for await (const chunk of response.data) {
        const lines = chunk
          .toString()
          .split("\n")
          .filter((line: string) => line.trim());
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") return;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              if (content) yield content;
            } catch {}
          }
        }
      }
    } catch (error: any) {
      console.error("Streaming error:", error.message);
      yield `Error: ${error.message}`;
    }
  }
}

// ============================================================================
// FILE SYSTEM SERVICE (Enhanced with diff generation)
// ============================================================================

class FileSystemService {
  private ignoreDirs = [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "coverage",
    ".cache",
    "tmp",
    "temp",
    ".vscode",
    ".idea",
  ];

  private ignoreFiles = [
    ".DS_Store",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    ".env",
    ".env.local",
  ];

  private calculateHash(content: string): string {
    return crypto.createHash("md5").update(content).digest("hex");
  }

  async analyzeProject(
    projectPath: string
  ): Promise<{ structure: string; files: ProcessedFile[] }> {
    const absolutePath = path.isAbsolute(projectPath)
      ? projectPath
      : path.resolve(process.cwd(), projectPath);

    try {
      await fs.access(absolutePath);
    } catch {
      throw new Error(`Project path does not exist: ${absolutePath}`);
    }

    const structure = await this.buildDirectoryTree(absolutePath);
    const files = await this.extractFiles(absolutePath);
    console.log(`📁 Found ${files.length} code files`);
    return { structure, files };
  }

  private generateHunks(
    changes: Change[],
    oldContent: string,
    newContent: string
  ): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    let oldLineNum = 1;
    let newLineNum = 1;
    let currentHunk: DiffLine[] = [];
    let hunkOldStart = 1;
    let hunkNewStart = 1;
    let contextBuffer: DiffLine[] = [];
    const CONTEXT_LINES = 3;

    for (const change of changes) {
      const lines = change.value.split("\n").filter((line, idx, arr) => {
        // Keep empty lines except the last one if it's empty
        return idx < arr.length - 1 || line !== "";
      });

      if (change.added) {
        // Flush context buffer
        currentHunk.push(...contextBuffer);
        contextBuffer = [];

        for (const line of lines) {
          currentHunk.push({
            type: "add",
            content: line,
            newLineNumber: newLineNum++,
          });
        }
      } else if (change.removed) {
        // Flush context buffer
        currentHunk.push(...contextBuffer);
        contextBuffer = [];

        for (const line of lines) {
          currentHunk.push({
            type: "remove",
            content: line,
            oldLineNumber: oldLineNum++,
          });
        }
      } else {
        // Context lines
        for (const line of lines) {
          const contextLine: DiffLine = {
            type: "context",
            content: line,
            oldLineNumber: oldLineNum++,
            newLineNumber: newLineNum++,
          };

          contextBuffer.push(contextLine);

          // Keep only last N context lines
          if (contextBuffer.length > CONTEXT_LINES) {
            // If we have accumulated changes, create a hunk
            if (currentHunk.length > 0) {
              hunks.push(
                this.createHunk(currentHunk, hunkOldStart, hunkNewStart)
              );
              currentHunk = [];
              hunkOldStart = oldLineNum - CONTEXT_LINES;
              hunkNewStart = newLineNum - CONTEXT_LINES;
            }
            contextBuffer.shift();
          }
        }
      }
    }
    // Add remaining context and create final hunk
    if (currentHunk.length > 0 || contextBuffer.length > 0) {
      currentHunk.push(...contextBuffer.slice(0, CONTEXT_LINES));
      hunks.push(this.createHunk(currentHunk, hunkOldStart, hunkNewStart));
    }

    return hunks;
  }

  private createHunk(
    lines: DiffLine[],
    oldStart: number,
    newStart: number
  ): DiffHunk {
    const oldLines = lines.filter((l) => l.type !== "add").length;
    const newLines = lines.filter((l) => l.type !== "remove").length;

    return {
      oldStart,
      oldLines,
      newStart,
      newLines,
      lines,
    };
  }

  private generateDiffPreview(
    hunks: DiffHunk[],
    maxLines: number = 50
  ): string {
    let preview = "";
    let lineCount = 0;

    for (const hunk of hunks) {
      if (lineCount >= maxLines) {
        preview += "\n... (truncated)";
        break;
      }

      preview += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;

      for (const line of hunk.lines) {
        if (lineCount >= maxLines) break;

        const prefix =
          line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
        preview += `${prefix} ${line.content}\n`;
        lineCount++;
      }
    }

    return preview;
  }

  private async buildDirectoryTree(
    dir: string,
    prefix = "",
    depth = 0
  ): Promise<string> {
    if (depth > 4) return "";

    let tree = "";
    try {
      const items = await fs.readdir(dir, { withFileTypes: true });

      for (const item of items) {
        if (this.shouldIgnore(item.name)) continue;
        tree += `${prefix}${item.isDirectory() ? "📁" : "📄"} ${item.name}\n`;

        if (item.isDirectory() && depth < 3) {
          tree += await this.buildDirectoryTree(
            path.join(dir, item.name),
            prefix + "  ",
            depth + 1
          );
        }
      }
    } catch (err) {
      console.warn(`Cannot read directory ${dir}`);
    }
    return tree;
  }

  private async extractFiles(dir: string, depth = 0): Promise<ProcessedFile[]> {
    if (depth > 5) return [];

    const files: ProcessedFile[] = [];

    try {
      const items = await fs.readdir(dir, { withFileTypes: true });

      for (const item of items) {
        if (this.shouldIgnore(item.name)) continue;
        const fullPath = path.join(dir, item.name);

        if (item.isDirectory()) {
          files.push(...(await this.extractFiles(fullPath, depth + 1)));
        } else if (this.isCodeFile(item.name)) {
          try {
            const stats = await fs.stat(fullPath);
            if (stats.size > 500000) continue;

            const content = await fs.readFile(fullPath, "utf-8");
            const hash = this.calculateHash(content);
            const chunks = this.chunkContent(content);

            files.push({
              path: fullPath,
              content,
              language: this.detectLanguage(item.name),
              hash,
              chunks,
            });
          } catch (err) {
            console.warn(`Skipping ${fullPath}`);
          }
        }
      }
    } catch (err) {
      console.warn(`Cannot read directory ${dir}`);
    }

    return files;
  }

  private chunkContent(
    content: string
  ): Array<{ id: string; content: string; start: number; end: number }> {
    const lines = content.split("\n");
    const chunks: Array<{
      id: string;
      content: string;
      start: number;
      end: number;
    }> = [];
    let currentChunk: string[] = [];
    let tokenCount = 0;
    let chunkStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineTokens = Math.ceil(lines[i].length / 4);

      if (
        tokenCount + lineTokens > CONFIG.CHUNK_SIZE &&
        currentChunk.length > 0
      ) {
        chunks.push({
          id: crypto.randomUUID(),
          content: currentChunk.join("\n"),
          start: chunkStart,
          end: i - 1,
        });

        const overlapLines = Math.floor(
          CONFIG.CHUNK_OVERLAP / (CONFIG.CHUNK_SIZE / currentChunk.length)
        );
        currentChunk = currentChunk.slice(-overlapLines);
        chunkStart = i - overlapLines;
        tokenCount = currentChunk.reduce(
          (acc, line) => acc + Math.ceil(line.length / 4),
          0
        );
      }

      currentChunk.push(lines[i]);
      tokenCount += lineTokens;
    }

    if (currentChunk.length > 0) {
      chunks.push({
        id: crypto.randomUUID(),
        content: currentChunk.join("\n"),
        start: chunkStart,
        end: lines.length - 1,
      });
    }

    return chunks;
  }

  private isCodeFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return [
      ".js",
      ".ts",
      ".jsx",
      ".tsx",
      ".py",
      ".java",
      ".go",
      ".rs",
      ".css",
      ".html",
      ".json",
      ".md",
      ".yaml",
      ".yml",
    ].includes(ext);
  }

  private detectLanguage(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const langMap: Record<string, string> = {
      ".js": "javascript",
      ".ts": "typescript",
      ".jsx": "javascript",
      ".tsx": "typescript",
      ".py": "python",
      ".java": "java",
      ".go": "go",
      ".rs": "rust",
      ".css": "css",
      ".html": "html",
      ".json": "json",
      ".md": "markdown",
    };
    return langMap[ext] || "plaintext";
  }

  private shouldIgnore(name: string): boolean {
    return (
      this.ignoreDirs.includes(name) ||
      this.ignoreFiles.includes(name) ||
      name.startsWith(".")
    );
  }

  async getOrCreateReadme(projectPath: string): Promise<string> {
    const absolutePath = path.isAbsolute(projectPath)
      ? projectPath
      : path.resolve(process.cwd(), projectPath);
    const readmePath = path.join(absolutePath, "README.md");

    try {
      const content = await fs.readFile(readmePath, "utf-8");
      return content.slice(0, 2000);
    } catch {
      return "# Project\n\nNo README available.";
    }
  }

  async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch {
      return "";
    }
  }

  // Generate diffs instead of replacing entire files
  async generateDiffs(
    projectPath: string,
    codeChanges: Record<string, string>
  ): Promise<EnhancedFileDiff[]> {
    const diffs: EnhancedFileDiff[] = [];

    // Ensure projectPath is absolute
    let absoluteProjectPath = projectPath;
    if (!path.isAbsolute(projectPath)) {
      absoluteProjectPath = path.resolve(process.cwd(), projectPath);
    }

    for (const [filePath, newContent] of Object.entries(codeChanges)) {
      // Ensure filePath is relative
      let relativeFilePath = filePath;
      if (path.isAbsolute(filePath)) {
        relativeFilePath = path.relative(absoluteProjectPath, filePath);
      }

      const fullPath = path.join(absoluteProjectPath, relativeFilePath);
      const oldContent = await this.readFile(fullPath);

      const changes = diffLines(oldContent || "", newContent);
      const added = changes
        .filter((c) => c.added)
        .reduce((sum, c) => sum + (c.count || 0), 0);
      const removed = changes
        .filter((c) => c.removed)
        .reduce((sum, c) => sum + (c.count || 0), 0);

      // Generate hunks (groups of changes with context)
      const hunks = this.generateHunks(changes, oldContent || "", newContent);

      // Generate formatted preview
      const preview = this.generateDiffPreview(hunks);

      diffs.push({
        file: relativeFilePath, // Use relative path consistently
        language: this.detectLanguage(relativeFilePath),
        oldContent: oldContent || "",
        newContent,
        changes,
        added,
        removed,
        preview,
        hunks,
      });
    }

    return diffs;
  }

  async applyCode(
    projectPath: string,
    codeFiles: Record<string, string>
  ): Promise<void> {
    for (const [filePath, code] of Object.entries(codeFiles)) {
      const fullPath = path.join(projectPath, filePath);
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, code);
    }
  }
}

// ============================================================================
// MAIN SERVICE (Enhanced with sessions and streaming)
// ============================================================================

class CodeAssistantService {
  constructor(
    private mongo: MongoService,
    private chroma: ChromaService,
    private euron: EuronService,
    private fs: FileSystemService
  ) {}

  async processQuery(
    query: string,
    projectPath: string,
    sessionId?: string,
    generateAll: boolean = true
  ): Promise<any> {
    const startTime = Date.now();
    let totalTokens = 0;

    // Session management
    if (!sessionId) {
      sessionId = await this.mongo.createSession(projectPath);
    }

    const conversationHistory = await this.mongo.getConversationHistory(
      sessionId
    );

    // Analyze project
    const { structure, files } = await this.fs.analyzeProject(projectPath);
    const readme = await this.fs.getOrCreateReadme(projectPath);

    // Incremental indexing
    const indexStats = await this.indexProjectIncremental(projectPath, files);
    console.log(
      `📊 Indexed: ${indexStats.added} new, ${indexStats.skipped} skipped`
    );

    // Get context
    const context = await this.getRelevantContext(
      query,
      files,
      structure,
      readme
    );

    // STAGE 1: Plan tasks
    console.log("🧠 Planning...");
    const contextSummary = `Structure:\n${context.structure.slice(0, 500)}
README:\n${context.readme.slice(0, 500)}
Relevant files: ${context.relevantFiles.join(", ")}`;

    const taskSteps = await this.euron.planTask(
      query,
      contextSummary,
      conversationHistory
    );
    const stepsArray = Array.isArray(taskSteps) ? taskSteps : [taskSteps];
    console.log(`✅ Generated ${stepsArray.length} steps`);

    // STAGE 2: Generate code for ALL steps
    console.log(`⚡ Generating code for ${stepsArray.length} steps...`);
    const codeResults: CodeGenerationResult[] = [];

    // Build file content map
    const existingFiles = new Map<string, string>();
    for (const file of files) {
      const relativePath = path.relative(projectPath, file.path);
      existingFiles.set(relativePath, file.content);
    }

    const stepsToGenerate = generateAll
      ? stepsArray.length
      : Math.min(3, stepsArray.length);

    for (let i = 0; i < stepsToGenerate; i++) {
      const step = stepsArray[i];
      console.log(`  → Step ${step.step}: ${step.title}`);

      const projectContextBrief = context.relevantChunks
        .slice(0, 5)
        .map((c) => `${c.file}:\n${c.content.slice(0, 300)}`)
        .join("\n\n");

      const codeResult = await this.euron.generateCodeForStep(
        step,
        projectContextBrief,
        existingFiles
      );
      codeResults.push(codeResult);
      totalTokens += codeResult.tokensUsed;

      // Update existing files map with generated code
      for (const [file, code] of Object.entries(codeResult.code)) {
        existingFiles.set(file, code);
      }
    }

    // Generate diffs
    console.log("📝 Generating diffs...");
    const allCode: Record<string, string> = {};
    codeResults.forEach((r) => Object.assign(allCode, r.code));
    const diffs = await this.fs.generateDiffs(projectPath, allCode);

    // Log diff generation
    console.log(
      `✅ Generated diffs: ${diffs.length} files, +${diffs.reduce(
        (sum, d) => sum + d.added,
        0
      )}/-${diffs.reduce((sum, d) => sum + d.removed, 0)} lines`
    );
    diffs.forEach((d) => {
      console.log(`  ✓ Diff for ${d.file}: +${d.added}/-${d.removed}`);
    });

    // Calculate total changes
    const totalAdded = diffs.reduce((sum, d) => sum + d.added, 0);
    const totalRemoved = diffs.reduce((sum, d) => sum + d.removed, 0);

    const response = {
      sessionId,
      query,
      steps: stepsArray,
      generatedCode: codeResults,
      diffs,
      diffSummary: {
        filesModified: diffs.length,
        linesAdded: totalAdded,
        linesRemoved: totalRemoved,
        netChange: totalAdded - totalRemoved,
      },
      remainingSteps: stepsArray.slice(stepsToGenerate),
      timestamp: new Date(),
      relevantFiles: context.relevantFiles,
      tokensUsed: totalTokens,
      executionTime: Date.now() - startTime,
      filesModified: Object.keys(allCode).length,
    };

    // Save to conversation history
    await this.mongo.addMessage(sessionId, {
      role: "user",
      content: query,
      timestamp: new Date(),
    });

    await this.mongo.addMessage(sessionId, {
      role: "assistant",
      content: `Generated ${codeResults.length} steps, will modify ${
        Object.keys(allCode).length
      } files`,
      timestamp: new Date(),
      tokensUsed: totalTokens,
    });

    // ⚠️ IMPORTANT: DO NOT AUTO-APPLY - Let frontend user decide
    // REMOVED: await this.fs.applyCode(projectPath, allCode);

    return { ...response, indexStats };
  }

  async *streamQuery(
    query: string,
    projectPath: string,
    sessionId: string
  ): AsyncGenerator<any, void, unknown> {
    yield { type: "status", message: "Analyzing project..." };

    const { structure, files } = await this.fs.analyzeProject(projectPath);
    const readme = await this.fs.getOrCreateReadme(projectPath);

    yield { type: "status", message: "Indexing files..." };
    const indexStats = await this.indexProjectIncremental(projectPath, files);

    yield { type: "status", message: "Planning tasks..." };
    const context = await this.getRelevantContext(
      query,
      files,
      structure,
      readme
    );
    const conversationHistory = await this.mongo.getConversationHistory(
      sessionId
    );

    const contextSummary = `Structure:\n${context.structure.slice(0, 500)}`;
    const taskSteps = await this.euron.planTask(
      query,
      contextSummary,
      conversationHistory
    );
    const stepsArray = Array.isArray(taskSteps) ? taskSteps : [taskSteps];

    yield { type: "plan", steps: stepsArray };

    // Stream code generation
    const existingFiles = new Map<string, string>();
    for (const file of files) {
      const relativePath = path.relative(projectPath, file.path);
      existingFiles.set(relativePath, file.content);
    }

    for (let i = 0; i < stepsArray.length; i++) {
      const step = stepsArray[i];
      yield { type: "step_start", step: step.step, title: step.title };

      const projectContextBrief = context.relevantChunks
        .slice(0, 5)
        .map((c) => `${c.file}:\n${c.content.slice(0, 300)}`)
        .join("\n\n");

      let generatedCode = "";
      for await (const chunk of this.euron.streamCodeGeneration(
        step,
        projectContextBrief,
        existingFiles
      )) {
        generatedCode += chunk;
        yield { type: "code_chunk", step: step.step, content: chunk };
      }

      yield { type: "step_complete", step: step.step };
    }

    yield { type: "complete" };
  }

  private async indexProjectIncremental(
    projectPath: string,
    files: ProcessedFile[]
  ): Promise<{ added: number; skipped: number }> {
    const stats = { added: 0, skipped: 0 };
    const chunksToIndex: Array<{
      id: string;
      content: string;
      metadata: any;
      embedding?: number[];
    }> = [];
    const textsToEmbed: string[] = [];
    const chunkMapping: number[] = [];

    for (const file of files) {
      const existingHash = await this.mongo.getFileHash(projectPath, file.path);

      if (existingHash === file.hash) {
        stats.skipped++;
        continue;
      }

      stats.added++;

      for (let i = 0; i < file.chunks.length; i++) {
        const chunk = file.chunks[i];
        const fileHash = crypto
          .createHash("md5")
          .update(file.path)
          .digest("hex")
          .slice(0, 8);
        const chunkId = `${fileHash}:${i}:${Date.now().toString(36)}`;

        chunksToIndex.push({
          id: chunkId,
          content: chunk.content,
          metadata: {
            file: file.path,
            language: file.language,
            projectPath,
            chunkIndex: i,
          },
        });

        textsToEmbed.push(chunk.content);
        chunkMapping.push(chunksToIndex.length - 1);
      }

      await this.mongo.updateFileHash(projectPath, file.path, file.hash);
    }

    if (textsToEmbed.length > 0) {
      console.log(`🔄 Generating ${textsToEmbed.length} embeddings...`);

      for (let i = 0; i < textsToEmbed.length; i += CONFIG.BATCH_SIZE) {
        const batch = textsToEmbed.slice(i, i + CONFIG.BATCH_SIZE);
        const embeddings = await this.euron.generateEmbeddingsBatch(batch);

        for (let j = 0; j < embeddings.length; j++) {
          const chunkIdx = chunkMapping[i + j];
          chunksToIndex[chunkIdx].embedding = embeddings[j];
        }
      }

      await this.chroma.addChunksBatch(chunksToIndex as any);
    }

    return stats;
  }

  private async getRelevantContext(
    query: string,
    files: ProcessedFile[],
    structure: string,
    readme: string
  ): Promise<QueryContext> {
    const queryEmbedding = await this.euron.generateEmbedding(query);
    const vectorResults = await this.chroma.searchSimilar(queryEmbedding, 12);
    const keywordResults = await this.mongo.keywordSearch(
      query,
      files[0]?.path.split(path.sep)[0] || "",
      5
    );

    const relevantChunks = [
      ...(vectorResults.documents?.[0] || []).map((doc: string, i: number) => ({
        content: doc,
        file: vectorResults.metadatas?.[0]?.[i]?.file || "unknown",
        score: vectorResults.distances?.[0]?.[i] || 0,
      })),
      ...keywordResults.map((r: any) => ({
        content: r.content,
        file: r.metadata?.file,
        score: 0.5,
      })),
    ].slice(0, 12);

    const relevantFiles = Array.from(
      new Set(relevantChunks.map((chunk: { file: string }) => chunk.file))
    ) as string[];

    return {
      structure: structure.slice(0, 800),
      readme: readme.slice(0, 1500),
      relevantChunks,
      relevantFiles,
    };
  }
}

// ============================================================================
// API ROUTES (Enhanced with streaming and sessions)
// ============================================================================

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

let assistant: CodeAssistantService;

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date(),
    features: ["streaming", "diffs", "sessions", "complete-generation"],
  });
});

app.post("/api/debug-query", async (req, res) => {
  try {
    const { query, projectPath } = req.body;

    if (!query || !projectPath) {
      return res.status(400).json({ error: "Query and projectPath required" });
    }

    console.log("🐛 DEBUG MODE - Processing query...");

    const result = await assistant.processQuery(
      query,
      projectPath,
      undefined,
      true
    );

    console.log("🐛 DEBUG - Response structure:", {
      hasCode: !!result.code,
      codeFiles: result.code ? Object.keys(result.code) : [],
      hasDiffs: !!result.diffs,
      diffsCount: result.diffs?.length || 0,
      generatedCodeCount: result.generatedCode?.length || 0,
    });

    res.json(result);
  } catch (error: any) {
    console.error("🐛 DEBUG - Error:", error);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
});

// Create session
app.post("/api/session", async (req, res) => {
  try {
    const { projectPath } = req.body;

    if (!projectPath) {
      return res.status(400).json({ error: "projectPath required" });
    }

    const mongo = new MongoService();
    await mongo.connect();
    const sessionId = await mongo.createSession(projectPath);

    res.json({ sessionId, projectPath });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/apply-diff", async (req, res) => {
  try {
    const { projectPath, file, newContent } = req.body;

    if (!projectPath || !file || !newContent) {
      return res
        .status(400)
        .json({ error: "projectPath, file, and newContent required" });
    }

    // Ensure we're working with absolute paths correctly
    let absoluteProjectPath = projectPath;
    if (!path.isAbsolute(projectPath)) {
      absoluteProjectPath = path.resolve(process.cwd(), projectPath);
    }

    // Make sure file is relative, not absolute
    let relativeFile = file;
    if (path.isAbsolute(file)) {
      relativeFile = path.relative(absoluteProjectPath, file);
    }

    // Join paths correctly
    const fullPath = path.join(absoluteProjectPath, relativeFile);
    const dir = path.dirname(fullPath);

    console.log("Applying diff:", {
      projectPath: absoluteProjectPath,
      file: relativeFile,
      fullPath: fullPath,
    });

    // Create directory if it doesn't exist
    await fs.mkdir(dir, { recursive: true });

    // Write the file
    await fs.writeFile(fullPath, newContent, "utf-8");

    console.log(`✅ Applied changes to ${relativeFile}`);
    res.json({
      success: true,
      file: relativeFile,
      fullPath: fullPath,
      message: "Changes applied successfully",
    });
  } catch (error: any) {
    console.error("Apply diff error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Add endpoint to get diff for a specific file:
app.post("/api/diff-file", async (req, res) => {
  try {
    const { projectPath, file, newContent } = req.body;

    if (!projectPath || !file || !newContent) {
      return res
        .status(400)
        .json({ error: "projectPath, file, and newContent required" });
    }

    const fsService = new FileSystemService();
    const diffs = await fsService.generateDiffs(projectPath, {
      [file]: newContent,
    });

    res.json({ diff: diffs[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Standard query (non-streaming)
app.post("/api/query", async (req, res) => {
  try {
    const { query, projectPath, sessionId, generateAll = true } = req.body;

    if (!query || !projectPath) {
      return res.status(400).json({ error: "Query and projectPath required" });
    }

    let absolutePath = projectPath;

    if (!path.isAbsolute(projectPath)) {
      const cwdPath = path.resolve(process.cwd(), projectPath);
      const parentPath = path.resolve(process.cwd(), "..", projectPath);
      const desktopPath = path.join(
        require("os").homedir(),
        "Desktop",
        projectPath
      );

      try {
        await fs.access(cwdPath);
        absolutePath = cwdPath;
      } catch {
        try {
          await fs.access(parentPath);
          absolutePath = parentPath;
        } catch {
          try {
            await fs.access(desktopPath);
            absolutePath = desktopPath;
          } catch {
            absolutePath = cwdPath;
          }
        }
      }
    }

    console.log(`📥 Query: "${query}" | Session: ${sessionId || "new"}`);

    const result = await assistant.processQuery(
      query,
      absolutePath,
      sessionId,
      generateAll
    );

    // ⚠️ DO NOT AUTO-APPLY CHANGES - Just return diffs
    // REMOVED: any fs.writeFile or applyCode calls here

    res.json(result);
  } catch (error: any) {
    console.error("Query error:", error);
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Streaming query (SSE)
app.post("/api/query/stream", async (req, res) => {
  try {
    const { query, projectPath, sessionId } = req.body;

    if (!query || !projectPath || !sessionId) {
      return res
        .status(400)
        .json({ error: "Query, projectPath, and sessionId required" });
    }

    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let absolutePath = projectPath;
    if (!path.isAbsolute(projectPath)) {
      absolutePath = path.resolve(process.cwd(), projectPath);
    }

    console.log(`🌊 Streaming query: "${query}"`);

    for await (const event of assistant.streamQuery(
      query,
      absolutePath,
      sessionId
    )) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    console.error("Streaming error:", error);
    res.write(
      `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`
    );
    res.end();
  }
});

// Get conversation history
app.get("/api/session/:sessionId/history", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const mongo = new MongoService();
    await mongo.connect();

    const history = await mongo.getConversationHistory(sessionId);
    res.json({ sessionId, history });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Apply code changes
app.post("/api/apply-code", async (req, res) => {
  try {
    const { projectPath, code } = req.body;

    if (!projectPath || !code) {
      return res.status(400).json({ error: "projectPath and code required" });
    }

    const fsService = new FileSystemService();
    await fsService.applyCode(projectPath, code);

    console.log(
      `✅ Applied ${Object.keys(code).length} files to ${projectPath}`
    );
    res.json({
      success: true,
      filesModified: Object.keys(code).length,
    });
  } catch (error: any) {
    console.error("Apply code error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get diffs without applying
app.post("/api/preview-changes", async (req, res) => {
  try {
    const { projectPath, code } = req.body;

    if (!projectPath || !code) {
      return res.status(400).json({ error: "projectPath and code required" });
    }

    const fsService = new FileSystemService();
    const diffs = await fsService.generateDiffs(projectPath, code);

    res.json({ diffs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Generate specific step
app.post("/api/generate-step", async (req, res) => {
  try {
    const { step, projectPath, projectContext } = req.body;

    if (!step || !projectPath) {
      return res.status(400).json({ error: "step and projectPath required" });
    }

    const euron = new EuronService();
    const fsService = new FileSystemService();

    const { files } = await fsService.analyzeProject(projectPath);
    const existingFiles = new Map<string, string>();
    for (const file of files) {
      const relativePath = path.relative(projectPath, file.path);
      existingFiles.set(relativePath, file.content);
    }

    const result = await euron.generateCodeForStep(
      step,
      projectContext || "Generate code for this step",
      existingFiles
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Analytics endpoint
app.get("/api/stats", async (req, res) => {
  try {
    const mongo = new MongoService();
    await mongo.connect();

    const db = mongo["db"];
    const totalSessions = await db.collection("sessions").countDocuments();
    const totalQueries = await db.collection("queries").countDocuments();
    const recentSessions = await db
      .collection("sessions")
      .find()
      .sort({ lastActiveAt: -1 })
      .limit(10)
      .toArray();

    res.json({
      totalSessions,
      totalQueries,
      recentSessions: recentSessions.map((s) => ({
        sessionId: s.sessionId,
        projectPath: s.projectPath,
        messageCount: s.messages.length,
        lastActive: s.lastActiveAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// STARTUP
// ============================================================================

async function start() {
  const mongo = new MongoService();
  const chroma = new ChromaService();
  const euron = new EuronService();
  const fsService = new FileSystemService();

  await mongo.connect();
  await chroma.initialize();

  assistant = new CodeAssistantService(mongo, chroma, euron, fsService);

  app.listen(CONFIG.PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  🚀 Production AI Code Assistant                          ║
║  Port: ${CONFIG.PORT}                                               ║
║  Features:                                                 ║
║    ✓ Streaming responses (SSE)                            ║
║    ✓ Diff generation                                      ║
║    ✓ Multi-turn conversations                             ║
║    ✓ Complete code generation (all steps)                 ║
║    ✓ Session management                                   ║
║    ✓ Token tracking                                       ║
╚════════════════════════════════════════════════════════════╝
    `);
  });
}

start().catch(console.error);
