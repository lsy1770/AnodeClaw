/**
 * Snapshot Generator
 *
 * Generates semantic snapshots of codebases.
 * Uses Anode global file API when available, falls back to Node.js fs.
 */
import { CodeAnalyzer } from './CodeAnalyzer.js';
import { logger } from '../../utils/logger.js';
import { generateId } from '../../utils/id.js';
/**
 * Snapshot Generator Class
 */
export class SnapshotGenerator {
    constructor(options = {}) {
        this.options = {
            includePaths: options.includePaths || ['**/*.ts', '**/*.js', '**/*.json', '**/*.md'],
            excludePaths: options.excludePaths || [
                '**/node_modules/**',
                '**/dist/**',
                '**/build/**',
                '**/.git/**',
            ],
            maxDepth: options.maxDepth || 10,
            maxFileSize: options.maxFileSize || 1024 * 1024, // 1MB default
            analyzeContent: options.analyzeContent !== false, // Default true
            generateSummaries: options.generateSummaries !== false, // Default true
        };
    }
    /**
     * Generate snapshot of a codebase
     *
     * @param rootPath - Root directory path
     * @returns Codebase snapshot
     */
    async generateSnapshot(rootPath) {
        logger.info(`[SnapshotGenerator] Generating snapshot for ${rootPath}`);
        const startTime = Date.now();
        // Check if root exists
        const exists = this.fileExists(rootPath);
        if (!exists) {
            throw new Error(`Path does not exist: ${rootPath}`);
        }
        // Build directory structure and analyze files
        const structure = await this.buildStructure(rootPath, 0);
        // Collect all file analyses
        const analyses = new Map();
        let fileCount = 0;
        let totalLines = 0;
        let totalSize = 0;
        const collectAnalyses = (node) => {
            if (node.type === 'file' && node.analysis) {
                analyses.set(node.path, node.analysis);
                fileCount++;
                totalLines += node.analysis.lines;
                totalSize += node.analysis.size;
            }
            if (node.children) {
                for (const child of node.children) {
                    collectAnalyses(child);
                }
            }
        };
        collectAnalyses(structure);
        // Generate overall summary
        const summary = this.generateCodebaseSummary(structure, fileCount, totalLines);
        // Extract metadata
        const metadata = await this.extractMetadata(rootPath, analyses);
        const snapshot = {
            id: generateId(),
            rootPath,
            timestamp: Date.now(),
            structure,
            fileCount,
            totalLines,
            totalSize,
            analyses,
            summary,
            metadata,
        };
        const duration = Date.now() - startTime;
        logger.info(`[SnapshotGenerator] Snapshot complete: ${fileCount} files, ${totalLines} lines in ${duration}ms`);
        return snapshot;
    }
    /**
     * Build directory structure recursively
     */
    async buildStructure(path, depth) {
        // Check depth limit
        if (depth > this.options.maxDepth) {
            logger.debug(`[SnapshotGenerator] Max depth reached: ${path}`);
            return {
                name: path.split('/').pop() || path,
                path,
                type: 'directory',
                children: [],
            };
        }
        // Check if path should be excluded
        if (this.shouldExclude(path)) {
            logger.debug(`[SnapshotGenerator] Excluded: ${path}`);
            return {
                name: path.split('/').pop() || path,
                path,
                type: 'directory',
                children: [],
            };
        }
        // Determine if path is a directory by trying to list it
        const isDir = this.isDirectory(path);
        if (!isDir) {
            // It's a file
            const node = {
                name: path.split('/').pop() || path,
                path,
                type: 'file',
            };
            // Analyze if included
            if (this.shouldInclude(path) && this.options.analyzeContent) {
                try {
                    const content = await this.readFile(path);
                    if (content.length <= this.options.maxFileSize) {
                        node.analysis = await CodeAnalyzer.analyze(path, content);
                    }
                }
                catch (error) {
                    logger.warn(`[SnapshotGenerator] Failed to analyze ${path}:`, error);
                }
            }
            return node;
        }
        else {
            // It's a directory
            const node = {
                name: path.split('/').pop() || path,
                path,
                type: 'directory',
                children: [],
            };
            try {
                const entries = await this.listDir(path);
                for (const entry of entries) {
                    const childPath = `${path}/${entry}`;
                    const childNode = await this.buildStructure(childPath, depth + 1);
                    node.children.push(childNode);
                }
            }
            catch (error) {
                logger.warn(`[SnapshotGenerator] Failed to read directory ${path}:`, error);
            }
            return node;
        }
    }
    /**
     * Check if path should be included
     */
    shouldInclude(path) {
        return this.options.includePaths.some((pattern) => this.matchPattern(path, pattern));
    }
    /**
     * Check if path should be excluded
     */
    shouldExclude(path) {
        return this.options.excludePaths.some((pattern) => this.matchPattern(path, pattern));
    }
    /**
     * Simple glob pattern matching
     */
    matchPattern(path, pattern) {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '.')
            .replace(/\./g, '\\.');
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(path);
    }
    /**
     * Generate codebase summary
     */
    generateCodebaseSummary(structure, fileCount, totalLines) {
        return `Codebase snapshot: ${fileCount} files, ${totalLines} lines of code`;
    }
    /**
     * Extract metadata from package.json and other config files
     */
    async extractMetadata(rootPath, analyses) {
        const metadata = {
            language: 'typescript', // Default assumption
        };
        // Check for package.json
        const packageAnalysis = Array.from(analyses.values()).find((a) => a.path.endsWith('package.json'));
        if (packageAnalysis && packageAnalysis.dependencies) {
            metadata.dependencies = packageAnalysis.dependencies.reduce((acc, dep) => {
                acc[dep] = 'unknown';
                return acc;
            }, {});
            // Detect framework
            if (metadata.dependencies['react']) {
                metadata.framework = 'React';
            }
            else if (metadata.dependencies['vue']) {
                metadata.framework = 'Vue';
            }
            else if (metadata.dependencies['angular']) {
                metadata.framework = 'Angular';
            }
        }
        return metadata;
    }
    /**
     * Search code in a snapshot
     */
    async searchCode(snapshot, query) {
        const results = [];
        for (const [filePath, analysis] of snapshot.analyses.entries()) {
            // Filter by file type
            if (query.fileTypes && !query.fileTypes.includes(analysis.type)) {
                continue;
            }
            // Filter by path
            if (query.paths && !query.paths.some((p) => filePath.includes(p))) {
                continue;
            }
            // Search in entities
            for (const entity of analysis.entities) {
                // Filter by entity type
                if (query.entityTypes && !query.entityTypes.includes(entity.type)) {
                    continue;
                }
                // Match query
                const matchText = `${entity.name} ${entity.signature || ''}`.toLowerCase();
                const queryText = query.caseSensitive ? query.query : query.query.toLowerCase();
                let matches = false;
                if (query.regex) {
                    const regex = new RegExp(query.query, query.caseSensitive ? '' : 'i');
                    matches = regex.test(matchText);
                }
                else {
                    matches = matchText.includes(queryText);
                }
                if (matches) {
                    results.push({
                        file: filePath,
                        entity,
                        line: entity.line,
                        snippet: entity.signature || entity.name,
                        relevance: this.calculateRelevance(entity.name, query.query),
                    });
                }
            }
        }
        // Sort by relevance
        results.sort((a, b) => b.relevance - a.relevance);
        // Apply limit
        if (query.limit && query.limit > 0) {
            return results.slice(0, query.limit);
        }
        return results;
    }
    /**
     * Calculate relevance score
     */
    calculateRelevance(text, query) {
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        // Exact match
        if (lowerText === lowerQuery)
            return 100;
        // Starts with
        if (lowerText.startsWith(lowerQuery))
            return 80;
        // Contains
        if (lowerText.includes(lowerQuery))
            return 60;
        // Partial match
        const words = lowerQuery.split(/\s+/);
        const matchedWords = words.filter((w) => lowerText.includes(w));
        return (matchedWords.length / words.length) * 40;
    }
    // ==========================================
    // File system abstraction layer
    // Uses Anode global file API when available,
    // falls back to Node.js fs/promises
    // ==========================================
    async readFile(path) {
        if (typeof file !== 'undefined' && file.readText) {
            return file.readText(path, 'UTF-8');
        }
        throw new Error('Anode file API not available');
    }
    fileExists(path) {
        if (typeof file !== 'undefined' && file.exists) {
            return file.exists(path);
        }
        return false;
    }
    async listDir(dirPath) {
        if (typeof file !== 'undefined' && file.listFiles) {
            const entries = await file.listFiles(dirPath);
            return entries.map(e => e.name);
        }
        throw new Error('Anode file API not available');
    }
    isDirectory(path) {
        if (typeof file !== 'undefined' && file.isDirectory) {
            return file.isDirectory(path);
        }
        return false;
    }
}
