/**
 * Code Analyzer
 *
 * Analyzes code files to extract entities, dependencies, and metadata
 */
import { logger } from '../../utils/logger.js';
/**
 * Code Analyzer Class
 */
export class CodeAnalyzer {
    /**
     * Analyze a code file
     *
     * @param filePath - Path to the file
     * @param content - File content
     * @returns File analysis result
     */
    static async analyze(filePath, content) {
        const fileType = this.detectFileType(filePath);
        const lines = content.split('\n');
        const size = content.length;
        logger.debug(`[CodeAnalyzer] Analyzing ${filePath} (${fileType})`);
        let entities = [];
        let imports = [];
        let exports = [];
        let dependencies = [];
        // Analyze based on file type
        switch (fileType) {
            case 'typescript':
            case 'javascript':
                ({ entities, imports, exports } = this.analyzeTypeScript(content, lines));
                break;
            case 'json':
                dependencies = this.analyzeJson(content, filePath);
                break;
            case 'markdown':
                entities = this.analyzeMarkdown(content, lines);
                break;
            default:
                // Basic analysis for other types
                entities = [];
        }
        // Generate summary
        const summary = this.generateSummary(filePath, fileType, entities, lines.length);
        return {
            path: filePath,
            type: fileType,
            lines: lines.length,
            size,
            entities,
            imports,
            exports,
            dependencies,
            summary,
            lastModified: Date.now(),
        };
    }
    /**
     * Detect file type from path
     */
    static detectFileType(filePath) {
        const ext = filePath.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'ts':
                return 'typescript';
            case 'js':
            case 'mjs':
            case 'cjs':
                return 'javascript';
            case 'json':
            case 'jsonc':
            case 'json5':
                return 'json';
            case 'md':
            case 'markdown':
                return 'markdown';
            case 'xml':
            case 'html':
                return 'xml';
            case 'txt':
            case 'log':
                return 'text';
            case 'toml':
            case 'yaml':
            case 'yml':
            case 'ini':
            case 'conf':
            case 'config':
                return 'config';
            default:
                return 'unknown';
        }
    }
    /**
     * Analyze TypeScript/JavaScript file
     */
    static analyzeTypeScript(content, lines) {
        const entities = [];
        const imports = [];
        const exports = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineNumber = i + 1;
            // Skip empty lines and comments
            if (!line || line.startsWith('//'))
                continue;
            // Extract imports
            if (line.startsWith('import ')) {
                const match = line.match(/from ['"](.+)['"]/);
                if (match) {
                    imports.push(match[1]);
                }
            }
            // Extract exports
            if (line.startsWith('export ')) {
                exports.push(line);
            }
            // Extract classes
            const classMatch = line.match(/^(export\s+)?(abstract\s+)?class\s+(\w+)/);
            if (classMatch) {
                entities.push({
                    type: 'class',
                    name: classMatch[3],
                    line: lineNumber,
                    modifiers: classMatch[1] ? ['export'] : [],
                    signature: line,
                });
                continue;
            }
            // Extract interfaces
            const interfaceMatch = line.match(/^(export\s+)?interface\s+(\w+)/);
            if (interfaceMatch) {
                entities.push({
                    type: 'interface',
                    name: interfaceMatch[2],
                    line: lineNumber,
                    modifiers: interfaceMatch[1] ? ['export'] : [],
                    signature: line,
                });
                continue;
            }
            // Extract functions
            const functionMatch = line.match(/^(export\s+)?(async\s+)?function\s+(\w+)\s*\(/);
            if (functionMatch) {
                entities.push({
                    type: 'function',
                    name: functionMatch[3],
                    line: lineNumber,
                    modifiers: [
                        ...(functionMatch[1] ? ['export'] : []),
                        ...(functionMatch[2] ? ['async'] : []),
                    ],
                    signature: line,
                });
                continue;
            }
            // Extract const/let/var declarations
            const varMatch = line.match(/^(export\s+)?(const|let|var)\s+(\w+)/);
            if (varMatch) {
                entities.push({
                    type: varMatch[2] === 'const' ? 'constant' : 'variable',
                    name: varMatch[3],
                    line: lineNumber,
                    modifiers: varMatch[1] ? ['export'] : [],
                    signature: line,
                });
                continue;
            }
            // Extract type aliases
            const typeMatch = line.match(/^(export\s+)?type\s+(\w+)/);
            if (typeMatch) {
                entities.push({
                    type: 'type',
                    name: typeMatch[2],
                    line: lineNumber,
                    modifiers: typeMatch[1] ? ['export'] : [],
                    signature: line,
                });
                continue;
            }
            // Extract enums
            const enumMatch = line.match(/^(export\s+)?enum\s+(\w+)/);
            if (enumMatch) {
                entities.push({
                    type: 'enum',
                    name: enumMatch[2],
                    line: lineNumber,
                    modifiers: enumMatch[1] ? ['export'] : [],
                    signature: line,
                });
            }
        }
        return { entities, imports, exports };
    }
    /**
     * Analyze JSON file (extract dependencies from package.json)
     */
    static analyzeJson(content, filePath) {
        if (!filePath.endsWith('package.json')) {
            return [];
        }
        try {
            const pkg = JSON.parse(content);
            const deps = [];
            if (pkg.dependencies) {
                deps.push(...Object.keys(pkg.dependencies));
            }
            if (pkg.devDependencies) {
                deps.push(...Object.keys(pkg.devDependencies));
            }
            if (pkg.peerDependencies) {
                deps.push(...Object.keys(pkg.peerDependencies));
            }
            return deps;
        }
        catch (error) {
            logger.warn(`[CodeAnalyzer] Failed to parse JSON: ${filePath}`);
            return [];
        }
    }
    /**
     * Analyze Markdown file (extract headings)
     */
    static analyzeMarkdown(content, lines) {
        const entities = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineNumber = i + 1;
            // Extract headings
            if (line.startsWith('#')) {
                const match = line.match(/^#+/);
                const level = match ? match[0].length : 1;
                const heading = line.replace(/^#+\s*/, '').trim();
                entities.push({
                    type: 'function', // Reuse function type for headings
                    name: heading,
                    line: lineNumber,
                    signature: `H${level}: ${heading}`,
                });
            }
        }
        return entities;
    }
    /**
     * Generate file summary
     */
    static generateSummary(filePath, fileType, entities, lineCount) {
        const fileName = filePath.split('/').pop() || filePath;
        if (entities.length === 0) {
            return `${fileName} (${fileType}): ${lineCount} lines`;
        }
        const entityCounts = {};
        for (const entity of entities) {
            entityCounts[entity.type] = (entityCounts[entity.type] || 0) + 1;
        }
        const parts = Object.entries(entityCounts).map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`);
        return `${fileName} (${fileType}): ${parts.join(', ')}, ${lineCount} lines`;
    }
}
