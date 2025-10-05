"use strict";
// ============================================================================
// PRODUCTION AI CODE ASSISTANT - Enhanced for Take-Home
// Features: Streaming, Diffs, Multi-turn conversations, Complete generation
// ============================================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const axios_1 = __importDefault(require("axios"));
const chromadb_1 = require("chromadb");
const mongodb_1 = require("mongodb");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const diff_1 = require("diff");
const CONFIG = {
    PORT: parseInt(process.env.PORT || '3000'),
    EURON_API_KEY: "euri-9b898b860443d8ad49b2305502e749d1658fbc05e8fef4cb56dd80ae888f60f3",
    EURON_BASE_URL: 'https://api.euron.one/api/v1/euri',
    PLANNING_MODEL: 'gpt-4.1-mini',
    CODE_MODEL: 'gpt-5-mini-2025-08-07',
    EMBEDDING_MODEL: 'text-embedding-3-small',
    MONGO_URI: "mongodb+srv://ujjwalPasahan:Pusu48171@cluster0.yt1gprk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
    DB_NAME: 'ai_code_assistant',
    CHROMA_API_KEY: 'ck-6Vj3AEc2Ju9mSxw3MHQWBZyRUGU48DPjWN22KaiVPG2M',
    CHROMA_TENANT: 'af49e641-4574-472f-a3fb-e5c493750373',
    CHROMA_DATABASE: 'testing',
    CHUNK_SIZE: 600,
    CHUNK_OVERLAP: 100,
    MAX_CONTEXT_TOKENS: 6000,
    BATCH_SIZE: 50,
    CACHE_TTL: 7 * 24 * 60 * 60 * 1000,
    MAX_CONVERSATION_HISTORY: 10,
};
// ============================================================================
// MONGO SERVICE (Enhanced with Sessions)
// ============================================================================
class MongoService {
    constructor() {
        this.client = new mongodb_1.MongoClient(CONFIG.MONGO_URI);
    }
    async connect() {
        await this.client.connect();
        this.db = this.client.db(CONFIG.DB_NAME);
        await this.db.collection('queries').createIndex({ queryHash: 1, projectPath: 1 });
        await this.db.collection('file_hashes').createIndex({ projectPath: 1, filePath: 1 }, { unique: true });
        await this.db.collection('sessions').createIndex({ sessionId: 1 }, { unique: true });
        await this.db.collection('sessions').createIndex({ lastActiveAt: 1 }, { expireAfterSeconds: 86400 }); // 24h TTL
        console.log('✅ MongoDB connected');
    }
    async getFileHash(projectPath, filePath) {
        const result = await this.db.collection('file_hashes').findOne({ projectPath, filePath });
        return result?.hash || null;
    }
    async updateFileHash(projectPath, filePath, hash) {
        await this.db.collection('file_hashes').updateOne({ projectPath, filePath }, { $set: { hash, updatedAt: new Date() } }, { upsert: true });
    }
    async getCachedQuery(query, projectPath) {
        const queryHash = crypto_1.default.createHash('md5').update(query + projectPath).digest('hex');
        const result = await this.db.collection('queries').findOne({
            queryHash,
            createdAt: { $gt: new Date(Date.now() - CONFIG.CACHE_TTL) }
        });
        return result;
    }
    async cacheQuery(query, projectPath, response, context) {
        const queryHash = crypto_1.default.createHash('md5').update(query + projectPath).digest('hex');
        await this.db.collection('queries').updateOne({ queryHash, projectPath }, { $set: { response, context, createdAt: new Date() } }, { upsert: true });
    }
    async keywordSearch(query, projectPath, limit = 5) {
        const keywords = query.toLowerCase().split(' ').filter(w => w.length > 3);
        const results = await this.db.collection('chunks')
            .find({
            projectPath,
            $or: keywords.map(kw => ({ contentLower: { $regex: kw } }))
        })
            .limit(limit)
            .toArray();
        return results;
    }
    // Session management
    async createSession(projectPath) {
        const sessionId = crypto_1.default.randomUUID();
        await this.db.collection('sessions').insertOne({
            sessionId,
            projectPath,
            messages: [],
            createdAt: new Date(),
            lastActiveAt: new Date()
        });
        return sessionId;
    }
    async getSession(sessionId) {
        return await this.db.collection('sessions').findOne({ sessionId });
    }
    async addMessage(sessionId, message) {
        await this.db.collection('sessions').updateOne({ sessionId }, {
            $push: {
                messages: {
                    $each: [message],
                    $slice: -CONFIG.MAX_CONVERSATION_HISTORY
                }
            },
            $set: { lastActiveAt: new Date() }
        });
    }
    async getConversationHistory(sessionId) {
        const session = await this.getSession(sessionId);
        return session?.messages || [];
    }
}
// ============================================================================
// CHROMA SERVICE
// ============================================================================
class ChromaService {
    constructor() {
        this.collection = null;
        this.client = new chromadb_1.CloudClient({
            apiKey: CONFIG.CHROMA_API_KEY,
            tenant: CONFIG.CHROMA_TENANT,
            database: CONFIG.CHROMA_DATABASE
        });
    }
    async initialize() {
        this.collection = await this.client.getOrCreateCollection({
            name: 'code_chunks',
            metadata: { 'hnsw:space': 'cosine' },
            embeddingFunction: undefined
        });
        console.log('✅ ChromaDB Cloud connected');
    }
    async addChunksBatch(chunks) {
        if (chunks.length === 0)
            return;
        await this.collection.add({
            ids: chunks.map(c => c.id),
            embeddings: chunks.map(c => c.embedding),
            documents: chunks.map(c => c.content),
            metadatas: chunks.map(c => c.metadata)
        });
    }
    async searchSimilar(queryEmbedding, limit = 12) {
        return await this.collection.query({
            queryEmbeddings: [queryEmbedding],
            nResults: limit
        });
    }
}
// ============================================================================
// EURON SERVICE (Enhanced with streaming)
// ============================================================================
class EuronService {
    constructor() {
        this.axios = axios_1.default.create({
            baseURL: CONFIG.EURON_BASE_URL,
            headers: { Authorization: `Bearer ${CONFIG.EURON_API_KEY}` }
        });
    }
    async generateEmbeddingsBatch(texts) {
        if (texts.length === 0)
            return [];
        try {
            const response = await this.axios.post('/embeddings', {
                input: texts,
                model: CONFIG.EMBEDDING_MODEL
            });
            return response.data.data.map((d) => d.embedding);
        }
        catch (error) {
            console.error('Batch embedding error:', error.message);
            throw error;
        }
    }
    async generateEmbedding(text) {
        const embeddings = await this.generateEmbeddingsBatch([text]);
        return embeddings[0];
    }
    async planTask(query, context, conversationHistory = []) {
        try {
            const historyContext = conversationHistory.length > 0
                ? `\n\nConversation History:\n${conversationHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}`
                : '';
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
            const response = await this.axios.post('/chat/completions', {
                model: CONFIG.PLANNING_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: query }
                ],
                max_tokens: 1500,
                temperature: 0.3,
                response_format: { type: 'json_object' }
            });
            const content = response.data.choices[0].message.content;
            const parsed = JSON.parse(content);
            let steps = [];
            if (Array.isArray(parsed)) {
                steps = parsed;
            }
            else if (parsed.steps && Array.isArray(parsed.steps)) {
                steps = parsed.steps;
            }
            else if (parsed.tasks && Array.isArray(parsed.tasks)) {
                steps = parsed.tasks;
            }
            else {
                steps = [{
                        step: 1,
                        title: "Complete task",
                        description: query,
                        files: [],
                        dependencies: []
                    }];
            }
            return steps.map((step, index) => ({
                step: step.step || index + 1,
                title: step.title || `Step ${index + 1}`,
                description: step.description || step.desc || query,
                files: Array.isArray(step.files) ? step.files : [],
                dependencies: Array.isArray(step.dependencies) ? step.dependencies : []
            }));
        }
        catch (error) {
            console.error('Planning error:', error.message);
            return [{
                    step: 1,
                    title: "Complete task",
                    description: query,
                    files: [],
                    dependencies: []
                }];
        }
    }
    async generateCodeForStep(step, projectContext, existingFiles) {
        try {
            // Include existing file content for context
            const fileContext = step.files
                .map(f => {
                const content = existingFiles.get(f);
                return content ? `\n// Existing ${f}:\n${content.slice(0, 500)}` : '';
            })
                .join('\n');
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
Files: ${step.files.join(', ')}`;
            const response = await this.axios.post('/chat/completions', {
                model: CONFIG.CODE_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: 2500,
                temperature: 0.4,
                response_format: { type: 'json_object' }
            });
            const content = response.data.choices[0].message.content;
            const tokensUsed = response.data.usage?.total_tokens || 0;
            let parsed;
            try {
                parsed = JSON.parse(content);
            }
            catch (parseError) {
                console.warn('JSON parse failed for step', step.step);
                parsed = { code: {}, explanation: step.description };
            }
            const code = parsed.code || parsed.files || {};
            const explanation = parsed.explanation || parsed.summary || step.description;
            return {
                step: step.step,
                title: step.title,
                code: typeof code === 'object' ? code : {},
                explanation: typeof explanation === 'string' ? explanation : step.description,
                tokensUsed
            };
        }
        catch (error) {
            console.error('Code generation error:', error.message);
            return {
                step: step.step,
                title: step.title,
                code: {},
                explanation: `Error: ${error.message}`,
                tokensUsed: 0
            };
        }
    }
    // Streaming for real-time responses
    async *streamCodeGeneration(step, projectContext, existingFiles) {
        try {
            const fileContext = step.files
                .map(f => {
                const content = existingFiles.get(f);
                return content ? `\n// ${f}:\n${content.slice(0, 300)}` : '';
            })
                .join('\n');
            const response = await this.axios.post('/chat/completions', {
                model: CONFIG.CODE_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: `Generate code for: ${step.title}\n${projectContext}${fileContext}`
                    },
                    { role: 'user', content: step.description }
                ],
                max_tokens: 2000,
                temperature: 0.4,
                stream: true
            }, { responseType: 'stream' });
            for await (const chunk of response.data) {
                const lines = chunk.toString().split('\n').filter((line) => line.trim());
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]')
                            return;
                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices[0]?.delta?.content;
                            if (content)
                                yield content;
                        }
                        catch { }
                    }
                }
            }
        }
        catch (error) {
            console.error('Streaming error:', error.message);
            yield `Error: ${error.message}`;
        }
    }
}
// ============================================================================
// FILE SYSTEM SERVICE (Enhanced with diff generation)
// ============================================================================
class FileSystemService {
    constructor() {
        this.ignoreDirs = [
            'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
            '.cache', 'tmp', 'temp', '.vscode', '.idea'
        ];
        this.ignoreFiles = [
            '.DS_Store', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
            '.env', '.env.local'
        ];
    }
    calculateHash(content) {
        return crypto_1.default.createHash('md5').update(content).digest('hex');
    }
    async analyzeProject(projectPath) {
        const absolutePath = path.isAbsolute(projectPath) ? projectPath : path.resolve(process.cwd(), projectPath);
        try {
            await fs.access(absolutePath);
        }
        catch {
            throw new Error(`Project path does not exist: ${absolutePath}`);
        }
        const structure = await this.buildDirectoryTree(absolutePath);
        const files = await this.extractFiles(absolutePath);
        console.log(`📁 Found ${files.length} code files`);
        return { structure, files };
    }
    generateHunks(changes, oldContent, newContent) {
        const hunks = [];
        let oldLineNum = 1;
        let newLineNum = 1;
        let currentHunk = [];
        let hunkOldStart = 1;
        let hunkNewStart = 1;
        let contextBuffer = [];
        const CONTEXT_LINES = 3;
        for (const change of changes) {
            const lines = change.value.split('\n').filter((line, idx, arr) => {
                // Keep empty lines except the last one if it's empty
                return idx < arr.length - 1 || line !== '';
            });
            if (change.added) {
                // Flush context buffer
                currentHunk.push(...contextBuffer);
                contextBuffer = [];
                for (const line of lines) {
                    currentHunk.push({
                        type: 'add',
                        content: line,
                        newLineNumber: newLineNum++
                    });
                }
            }
            else if (change.removed) {
                // Flush context buffer
                currentHunk.push(...contextBuffer);
                contextBuffer = [];
                for (const line of lines) {
                    currentHunk.push({
                        type: 'remove',
                        content: line,
                        oldLineNumber: oldLineNum++
                    });
                }
            }
            else {
                // Context lines
                for (const line of lines) {
                    const contextLine = {
                        type: 'context',
                        content: line,
                        oldLineNumber: oldLineNum++,
                        newLineNumber: newLineNum++
                    };
                    contextBuffer.push(contextLine);
                    // Keep only last N context lines
                    if (contextBuffer.length > CONTEXT_LINES) {
                        // If we have accumulated changes, create a hunk
                        if (currentHunk.length > 0) {
                            hunks.push(this.createHunk(currentHunk, hunkOldStart, hunkNewStart));
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
    createHunk(lines, oldStart, newStart) {
        const oldLines = lines.filter(l => l.type !== 'add').length;
        const newLines = lines.filter(l => l.type !== 'remove').length;
        return {
            oldStart,
            oldLines,
            newStart,
            newLines,
            lines
        };
    }
    generateDiffPreview(hunks, maxLines = 50) {
        let preview = '';
        let lineCount = 0;
        for (const hunk of hunks) {
            if (lineCount >= maxLines) {
                preview += '\n... (truncated)';
                break;
            }
            preview += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
            for (const line of hunk.lines) {
                if (lineCount >= maxLines)
                    break;
                const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
                preview += `${prefix} ${line.content}\n`;
                lineCount++;
            }
        }
        return preview;
    }
    async buildDirectoryTree(dir, prefix = '', depth = 0) {
        if (depth > 4)
            return '';
        let tree = '';
        try {
            const items = await fs.readdir(dir, { withFileTypes: true });
            for (const item of items) {
                if (this.shouldIgnore(item.name))
                    continue;
                tree += `${prefix}${item.isDirectory() ? '📁' : '📄'} ${item.name}\n`;
                if (item.isDirectory() && depth < 3) {
                    tree += await this.buildDirectoryTree(path.join(dir, item.name), prefix + '  ', depth + 1);
                }
            }
        }
        catch (err) {
            console.warn(`Cannot read directory ${dir}`);
        }
        return tree;
    }
    async extractFiles(dir, depth = 0) {
        if (depth > 5)
            return [];
        const files = [];
        try {
            const items = await fs.readdir(dir, { withFileTypes: true });
            for (const item of items) {
                if (this.shouldIgnore(item.name))
                    continue;
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    files.push(...await this.extractFiles(fullPath, depth + 1));
                }
                else if (this.isCodeFile(item.name)) {
                    try {
                        const stats = await fs.stat(fullPath);
                        if (stats.size > 500000)
                            continue;
                        const content = await fs.readFile(fullPath, 'utf-8');
                        const hash = this.calculateHash(content);
                        const chunks = this.chunkContent(content);
                        files.push({
                            path: fullPath,
                            content,
                            language: this.detectLanguage(item.name),
                            hash,
                            chunks
                        });
                    }
                    catch (err) {
                        console.warn(`Skipping ${fullPath}`);
                    }
                }
            }
        }
        catch (err) {
            console.warn(`Cannot read directory ${dir}`);
        }
        return files;
    }
    chunkContent(content) {
        const lines = content.split('\n');
        const chunks = [];
        let currentChunk = [];
        let tokenCount = 0;
        let chunkStart = 0;
        for (let i = 0; i < lines.length; i++) {
            const lineTokens = Math.ceil(lines[i].length / 4);
            if (tokenCount + lineTokens > CONFIG.CHUNK_SIZE && currentChunk.length > 0) {
                chunks.push({
                    id: crypto_1.default.randomUUID(),
                    content: currentChunk.join('\n'),
                    start: chunkStart,
                    end: i - 1
                });
                const overlapLines = Math.floor(CONFIG.CHUNK_OVERLAP / (CONFIG.CHUNK_SIZE / currentChunk.length));
                currentChunk = currentChunk.slice(-overlapLines);
                chunkStart = i - overlapLines;
                tokenCount = currentChunk.reduce((acc, line) => acc + Math.ceil(line.length / 4), 0);
            }
            currentChunk.push(lines[i]);
            tokenCount += lineTokens;
        }
        if (currentChunk.length > 0) {
            chunks.push({
                id: crypto_1.default.randomUUID(),
                content: currentChunk.join('\n'),
                start: chunkStart,
                end: lines.length - 1
            });
        }
        return chunks;
    }
    isCodeFile(filename) {
        const ext = path.extname(filename).toLowerCase();
        return ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs',
            '.css', '.html', '.json', '.md', '.yaml', '.yml'].includes(ext);
    }
    detectLanguage(filename) {
        const ext = path.extname(filename).toLowerCase();
        const langMap = {
            '.js': 'javascript', '.ts': 'typescript', '.jsx': 'javascript', '.tsx': 'typescript',
            '.py': 'python', '.java': 'java', '.go': 'go', '.rs': 'rust',
            '.css': 'css', '.html': 'html', '.json': 'json', '.md': 'markdown'
        };
        return langMap[ext] || 'plaintext';
    }
    shouldIgnore(name) {
        return this.ignoreDirs.includes(name) || this.ignoreFiles.includes(name) || name.startsWith('.');
    }
    async getOrCreateReadme(projectPath) {
        const absolutePath = path.isAbsolute(projectPath) ? projectPath : path.resolve(process.cwd(), projectPath);
        const readmePath = path.join(absolutePath, 'README.md');
        try {
            const content = await fs.readFile(readmePath, 'utf-8');
            return content.slice(0, 2000);
        }
        catch {
            return '# Project\n\nNo README available.';
        }
    }
    async readFile(filePath) {
        try {
            return await fs.readFile(filePath, 'utf-8');
        }
        catch {
            return '';
        }
    }
    // Generate diffs instead of replacing entire files
    async generateDiffs(projectPath, codeChanges) {
        const diffs = [];
        for (const [relativePath, newContent] of Object.entries(codeChanges)) {
            const fullPath = path.join(projectPath, relativePath);
            const oldContent = await this.readFile(fullPath);
            const changes = (0, diff_1.diffLines)(oldContent || '', newContent);
            const added = changes.filter(c => c.added).reduce((sum, c) => sum + (c.count || 0), 0);
            const removed = changes.filter(c => c.removed).reduce((sum, c) => sum + (c.count || 0), 0);
            // Generate hunks (groups of changes with context)
            const hunks = this.generateHunks(changes, oldContent || '', newContent);
            // Generate formatted preview
            const preview = this.generateDiffPreview(hunks);
            diffs.push({
                file: relativePath,
                language: this.detectLanguage(relativePath),
                oldContent: oldContent || '',
                newContent,
                changes,
                added,
                removed,
                preview,
                hunks
            });
        }
        return diffs;
    }
    async applyCode(projectPath, codeFiles) {
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
    constructor(mongo, chroma, euron, fs) {
        this.mongo = mongo;
        this.chroma = chroma;
        this.euron = euron;
        this.fs = fs;
    }
    async processQuery(query, projectPath, sessionId, generateAll = true) {
        const startTime = Date.now();
        let totalTokens = 0;
        // Session management
        if (!sessionId) {
            sessionId = await this.mongo.createSession(projectPath);
        }
        const conversationHistory = await this.mongo.getConversationHistory(sessionId);
        // Analyze project
        const { structure, files } = await this.fs.analyzeProject(projectPath);
        const readme = await this.fs.getOrCreateReadme(projectPath);
        // Incremental indexing
        const indexStats = await this.indexProjectIncremental(projectPath, files);
        console.log(`📊 Indexed: ${indexStats.added} new, ${indexStats.skipped} skipped`);
        // Get context
        const context = await this.getRelevantContext(query, files, structure, readme);
        // STAGE 1: Plan tasks
        console.log('🧠 Planning...');
        const contextSummary = `Structure:\n${context.structure.slice(0, 500)}
README:\n${context.readme.slice(0, 500)}
Relevant files: ${context.relevantFiles.join(', ')}`;
        const taskSteps = await this.euron.planTask(query, contextSummary, conversationHistory);
        const stepsArray = Array.isArray(taskSteps) ? taskSteps : [taskSteps];
        console.log(`✅ Generated ${stepsArray.length} steps`);
        // STAGE 2: Generate code for ALL steps (not just 3)
        console.log(`⚡ Generating code for ${stepsArray.length} steps...`);
        const codeResults = [];
        // Build file content map
        const existingFiles = new Map();
        for (const file of files) {
            const relativePath = path.relative(projectPath, file.path);
            existingFiles.set(relativePath, file.content);
        }
        const stepsToGenerate = generateAll ? stepsArray.length : Math.min(3, stepsArray.length);
        for (let i = 0; i < stepsToGenerate; i++) {
            const step = stepsArray[i];
            console.log(`  → Step ${step.step}: ${step.title}`);
            const projectContextBrief = context.relevantChunks.slice(0, 5)
                .map(c => `${c.file}:\n${c.content.slice(0, 300)}`)
                .join('\n\n');
            const codeResult = await this.euron.generateCodeForStep(step, projectContextBrief, existingFiles);
            codeResults.push(codeResult);
            totalTokens += codeResult.tokensUsed;
            // Update existing files map with generated code
            for (const [file, code] of Object.entries(codeResult.code)) {
                existingFiles.set(file, code);
            }
        }
        // Generate diffs
        console.log('📝 Generating diffs...');
        const allCode = {};
        codeResults.forEach(r => Object.assign(allCode, r.code));
        const diffs = await this.fs.generateDiffs(projectPath, allCode);
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
                netChange: totalAdded - totalRemoved
            },
            remainingSteps: stepsArray.slice(stepsToGenerate),
            timestamp: new Date(),
            relevantFiles: context.relevantFiles,
            tokensUsed: totalTokens,
            executionTime: Date.now() - startTime,
            filesModified: Object.keys(allCode).length
        };
        // Save to conversation history
        await this.mongo.addMessage(sessionId, {
            role: 'user',
            content: query,
            timestamp: new Date()
        });
        await this.mongo.addMessage(sessionId, {
            role: 'assistant',
            content: `Generated ${codeResults.length} steps, modified ${Object.keys(allCode).length} files`,
            timestamp: new Date(),
            tokensUsed: totalTokens
        });
        return { ...response, indexStats };
    }
    async *streamQuery(query, projectPath, sessionId) {
        yield { type: 'status', message: 'Analyzing project...' };
        const { structure, files } = await this.fs.analyzeProject(projectPath);
        const readme = await this.fs.getOrCreateReadme(projectPath);
        yield { type: 'status', message: 'Indexing files...' };
        const indexStats = await this.indexProjectIncremental(projectPath, files);
        yield { type: 'status', message: 'Planning tasks...' };
        const context = await this.getRelevantContext(query, files, structure, readme);
        const conversationHistory = await this.mongo.getConversationHistory(sessionId);
        const contextSummary = `Structure:\n${context.structure.slice(0, 500)}`;
        const taskSteps = await this.euron.planTask(query, contextSummary, conversationHistory);
        const stepsArray = Array.isArray(taskSteps) ? taskSteps : [taskSteps];
        yield { type: 'plan', steps: stepsArray };
        // Stream code generation
        const existingFiles = new Map();
        for (const file of files) {
            const relativePath = path.relative(projectPath, file.path);
            existingFiles.set(relativePath, file.content);
        }
        for (let i = 0; i < stepsArray.length; i++) {
            const step = stepsArray[i];
            yield { type: 'step_start', step: step.step, title: step.title };
            const projectContextBrief = context.relevantChunks.slice(0, 5)
                .map(c => `${c.file}:\n${c.content.slice(0, 300)}`)
                .join('\n\n');
            let generatedCode = '';
            for await (const chunk of this.euron.streamCodeGeneration(step, projectContextBrief, existingFiles)) {
                generatedCode += chunk;
                yield { type: 'code_chunk', step: step.step, content: chunk };
            }
            yield { type: 'step_complete', step: step.step };
        }
        yield { type: 'complete' };
    }
    async indexProjectIncremental(projectPath, files) {
        const stats = { added: 0, skipped: 0 };
        const chunksToIndex = [];
        const textsToEmbed = [];
        const chunkMapping = [];
        for (const file of files) {
            const existingHash = await this.mongo.getFileHash(projectPath, file.path);
            if (existingHash === file.hash) {
                stats.skipped++;
                continue;
            }
            stats.added++;
            for (let i = 0; i < file.chunks.length; i++) {
                const chunk = file.chunks[i];
                const fileHash = crypto_1.default.createHash('md5').update(file.path).digest('hex').slice(0, 8);
                const chunkId = `${fileHash}:${i}:${Date.now().toString(36)}`;
                chunksToIndex.push({
                    id: chunkId,
                    content: chunk.content,
                    metadata: {
                        file: file.path,
                        language: file.language,
                        projectPath,
                        chunkIndex: i
                    }
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
            await this.chroma.addChunksBatch(chunksToIndex);
        }
        return stats;
    }
    async getRelevantContext(query, files, structure, readme) {
        const queryEmbedding = await this.euron.generateEmbedding(query);
        const vectorResults = await this.chroma.searchSimilar(queryEmbedding, 12);
        const keywordResults = await this.mongo.keywordSearch(query, files[0]?.path.split(path.sep)[0] || '', 5);
        const relevantChunks = [
            ...(vectorResults.documents?.[0] || []).map((doc, i) => ({
                content: doc,
                file: vectorResults.metadatas?.[0]?.[i]?.file || 'unknown',
                score: vectorResults.distances?.[0]?.[i] || 0
            })),
            ...keywordResults.map((r) => ({ content: r.content, file: r.metadata?.file, score: 0.5 }))
        ].slice(0, 12);
        const relevantFiles = Array.from(new Set(relevantChunks.map((chunk) => chunk.file)));
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
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
let assistant;
// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date(),
        features: ['streaming', 'diffs', 'sessions', 'complete-generation']
    });
});
// Create session
app.post('/api/session', async (req, res) => {
    try {
        const { projectPath } = req.body;
        if (!projectPath) {
            return res.status(400).json({ error: 'projectPath required' });
        }
        const mongo = new MongoService();
        await mongo.connect();
        const sessionId = await mongo.createSession(projectPath);
        res.json({ sessionId, projectPath });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/apply-diff', async (req, res) => {
    try {
        const { projectPath, file, newContent } = req.body;
        if (!projectPath || !file || !newContent) {
            return res.status(400).json({ error: 'projectPath, file, and newContent required' });
        }
        const fsService = new FileSystemService();
        const fullPath = path.join(projectPath, file);
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, newContent);
        console.log(`✅ Applied changes to ${file}`);
        res.json({
            success: true,
            file,
            message: 'Changes applied successfully'
        });
    }
    catch (error) {
        console.error('Apply diff error:', error);
        res.status(500).json({ error: error.message });
    }
});
// Add endpoint to get diff for a specific file:
app.post('/api/diff-file', async (req, res) => {
    try {
        const { projectPath, file, newContent } = req.body;
        if (!projectPath || !file || !newContent) {
            return res.status(400).json({ error: 'projectPath, file, and newContent required' });
        }
        const fsService = new FileSystemService();
        const diffs = await fsService.generateDiffs(projectPath, { [file]: newContent });
        res.json({ diff: diffs[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Standard query (non-streaming)
app.post('/api/query', async (req, res) => {
    try {
        const { query, projectPath, sessionId, generateAll = true } = req.body;
        if (!query || !projectPath) {
            return res.status(400).json({ error: 'Query and projectPath required' });
        }
        let absolutePath = projectPath;
        if (!path.isAbsolute(projectPath)) {
            const cwdPath = path.resolve(process.cwd(), projectPath);
            const parentPath = path.resolve(process.cwd(), '..', projectPath);
            const desktopPath = path.join(require('os').homedir(), 'Desktop', projectPath);
            try {
                await fs.access(cwdPath);
                absolutePath = cwdPath;
            }
            catch {
                try {
                    await fs.access(parentPath);
                    absolutePath = parentPath;
                }
                catch {
                    try {
                        await fs.access(desktopPath);
                        absolutePath = desktopPath;
                    }
                    catch {
                        absolutePath = cwdPath;
                    }
                }
            }
        }
        console.log(`📥 Query: "${query}" | Session: ${sessionId || 'new'}`);
        const result = await assistant.processQuery(query, absolutePath, sessionId, generateAll);
        res.json(result);
    }
    catch (error) {
        console.error('Query error:', error);
        res.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});
// Streaming query (SSE)
app.post('/api/query/stream', async (req, res) => {
    try {
        const { query, projectPath, sessionId } = req.body;
        if (!query || !projectPath || !sessionId) {
            return res.status(400).json({ error: 'Query, projectPath, and sessionId required' });
        }
        // Set up SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        let absolutePath = projectPath;
        if (!path.isAbsolute(projectPath)) {
            absolutePath = path.resolve(process.cwd(), projectPath);
        }
        console.log(`🌊 Streaming query: "${query}"`);
        for await (const event of assistant.streamQuery(query, absolutePath, sessionId)) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
    }
    catch (error) {
        console.error('Streaming error:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        res.end();
    }
});
// Get conversation history
app.get('/api/session/:sessionId/history', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const mongo = new MongoService();
        await mongo.connect();
        const history = await mongo.getConversationHistory(sessionId);
        res.json({ sessionId, history });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Apply code changes
app.post('/api/apply-code', async (req, res) => {
    try {
        const { projectPath, code } = req.body;
        if (!projectPath || !code) {
            return res.status(400).json({ error: 'projectPath and code required' });
        }
        const fsService = new FileSystemService();
        await fsService.applyCode(projectPath, code);
        console.log(`✅ Applied ${Object.keys(code).length} files to ${projectPath}`);
        res.json({
            success: true,
            filesModified: Object.keys(code).length
        });
    }
    catch (error) {
        console.error('Apply code error:', error);
        res.status(500).json({ error: error.message });
    }
});
// Get diffs without applying
app.post('/api/preview-changes', async (req, res) => {
    try {
        const { projectPath, code } = req.body;
        if (!projectPath || !code) {
            return res.status(400).json({ error: 'projectPath and code required' });
        }
        const fsService = new FileSystemService();
        const diffs = await fsService.generateDiffs(projectPath, code);
        res.json({ diffs });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Generate specific step
app.post('/api/generate-step', async (req, res) => {
    try {
        const { step, projectPath, projectContext } = req.body;
        if (!step || !projectPath) {
            return res.status(400).json({ error: 'step and projectPath required' });
        }
        const euron = new EuronService();
        const fsService = new FileSystemService();
        const { files } = await fsService.analyzeProject(projectPath);
        const existingFiles = new Map();
        for (const file of files) {
            const relativePath = path.relative(projectPath, file.path);
            existingFiles.set(relativePath, file.content);
        }
        const result = await euron.generateCodeForStep(step, projectContext || 'Generate code for this step', existingFiles);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Analytics endpoint
app.get('/api/stats', async (req, res) => {
    try {
        const mongo = new MongoService();
        await mongo.connect();
        const db = mongo['db'];
        const totalSessions = await db.collection('sessions').countDocuments();
        const totalQueries = await db.collection('queries').countDocuments();
        const recentSessions = await db.collection('sessions')
            .find()
            .sort({ lastActiveAt: -1 })
            .limit(10)
            .toArray();
        res.json({
            totalSessions,
            totalQueries,
            recentSessions: recentSessions.map(s => ({
                sessionId: s.sessionId,
                projectPath: s.projectPath,
                messageCount: s.messages.length,
                lastActive: s.lastActiveAt
            }))
        });
    }
    catch (error) {
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
