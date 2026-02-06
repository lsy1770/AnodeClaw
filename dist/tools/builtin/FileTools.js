/**
 * File Operation Tools
 *
 * Built-in tools for file system operations using Anode file
 * Based on anode-api.d.ts definitions
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
/**
 * Read File Tool
 */
export const readFileTool = {
    name: 'read_file',
    description: 'Read the contents of a file from the filesystem',
    category: 'file',
    permissions: ['file:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'path',
            description: 'Path to the file to read',
            schema: z.string(),
            required: true,
        },
        {
            name: 'encoding',
            description: 'File encoding (default: UTF-8)',
            schema: z.string(),
            required: false,
            default: 'UTF-8',
        },
    ],
    async execute(params, options) {
        try {
            const { path, encoding = 'UTF-8' } = params;
            logger.debug(`Reading file: ${path}`);
            const content = await file.readText(path, encoding);
            return {
                success: true,
                output: {
                    content,
                    path,
                    encoding,
                    size: content.length,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'READ_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to read file',
                    details: error,
                },
            };
        }
    },
};
/**
 * Write File Tool
 */
export const writeFileTool = {
    name: 'write_file',
    description: 'Write content to a file on the filesystem',
    category: 'file',
    permissions: ['file:write'],
    parallelizable: false,
    parameters: [
        {
            name: 'path',
            description: 'Path to the file to write',
            schema: z.string(),
            required: true,
        },
        {
            name: 'content',
            description: 'Content to write to the file',
            schema: z.string(),
            required: true,
        },
        {
            name: 'encoding',
            description: 'File encoding (default: UTF-8)',
            schema: z.string(),
            required: false,
            default: 'UTF-8',
        },
    ],
    async execute(params, options) {
        try {
            const { path, content, encoding = 'UTF-8' } = params;
            logger.debug(`Writing file: ${path}`);
            await file.writeText(path, content, encoding);
            return {
                success: true,
                output: {
                    path,
                    size: content.length,
                    encoding,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'WRITE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to write file',
                    details: error,
                },
            };
        }
    },
};
/**
 * Append File Tool
 */
export const appendFileTool = {
    name: 'append_file',
    description: 'Append content to an existing file',
    category: 'file',
    permissions: ['file:write'],
    parallelizable: false,
    parameters: [
        {
            name: 'path',
            description: 'Path to the file to append to',
            schema: z.string(),
            required: true,
        },
        {
            name: 'content',
            description: 'Content to append to the file',
            schema: z.string(),
            required: true,
        },
        {
            name: 'encoding',
            description: 'File encoding (default: UTF-8)',
            schema: z.string(),
            required: false,
            default: 'UTF-8',
        },
    ],
    async execute(params, options) {
        try {
            const { path, content, encoding = 'UTF-8' } = params;
            logger.debug(`Appending to file: ${path}`);
            await file.appendText(path, content, encoding);
            return {
                success: true,
                output: {
                    path,
                    appendedSize: content.length,
                    encoding,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'APPEND_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to append to file',
                    details: error,
                },
            };
        }
    },
};
/**
 * List Files Tool
 */
export const listFilesTool = {
    name: 'list_files',
    description: 'List files and directories in a directory',
    category: 'file',
    permissions: ['file:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'path',
            description: 'Directory path to list',
            schema: z.string(),
            required: true,
        },
        {
            name: 'recursive',
            description: 'List files recursively (default: false)',
            schema: z.boolean(),
            required: false,
            default: false,
        },
    ],
    async execute(params, options) {
        try {
            const { path, recursive = false } = params;
            logger.debug(`Listing directory: ${path} (recursive: ${recursive})`);
            const fileInfoList = recursive
                ? await file.listFilesRecursively(path)
                : await file.listFiles(path);
            // Extract file names
            const files = fileInfoList.map((f) => f.name);
            return {
                success: true,
                output: {
                    path,
                    files,
                    fileInfoList,
                    count: files.length,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'LIST_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to list directory',
                    details: error,
                },
            };
        }
    },
};
/**
 * Delete File Tool
 */
export const deleteFileTool = {
    name: 'delete_file',
    description: 'Delete a file or directory from the filesystem',
    category: 'file',
    permissions: ['file:delete'],
    parallelizable: false,
    parameters: [
        {
            name: 'path',
            description: 'Path to the file or directory to delete',
            schema: z.string(),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { path } = params;
            logger.debug(`Deleting: ${path}`);
            await file.delete(path);
            return {
                success: true,
                output: {
                    path,
                    deleted: true,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'DELETE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to delete',
                    details: error,
                },
            };
        }
    },
};
/**
 * Check File Exists Tool
 */
export const fileExistsTool = {
    name: 'file_exists',
    description: 'Check if a file or directory exists',
    category: 'file',
    permissions: ['file:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'path',
            description: 'Path to check',
            schema: z.string(),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { path } = params;
            // exists is synchronous
            const exists = file.exists(path);
            const isFile = exists ? file.isFile(path) : false;
            const isDirectory = exists ? file.isDirectory(path) : false;
            return {
                success: true,
                output: {
                    exists,
                    isFile,
                    isDirectory,
                    path,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'CHECK_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to check existence',
                    details: error,
                },
            };
        }
    },
};
/**
 * Create Directory Tool
 */
export const createDirectoryTool = {
    name: 'create_directory',
    description: 'Create a new directory',
    category: 'file',
    permissions: ['file:write'],
    parallelizable: false,
    parameters: [
        {
            name: 'path',
            description: 'Path of the directory to create',
            schema: z.string(),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { path } = params;
            logger.debug(`Creating directory: ${path}`);
            await file.createDirectory(path);
            return {
                success: true,
                output: {
                    path,
                    created: true,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'CREATE_DIR_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to create directory',
                    details: error,
                },
            };
        }
    },
};
/**
 * Copy File Tool
 */
export const copyFileTool = {
    name: 'copy_file',
    description: 'Copy a file or directory to a new location',
    category: 'file',
    permissions: ['file:read', 'file:write'],
    parallelizable: false,
    parameters: [
        {
            name: 'source',
            description: 'Source path',
            schema: z.string(),
            required: true,
        },
        {
            name: 'target',
            description: 'Target path',
            schema: z.string(),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { source, target } = params;
            logger.debug(`Copying: ${source} → ${target}`);
            await file.copy(source, target);
            return {
                success: true,
                output: {
                    source,
                    target,
                    copied: true,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'COPY_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to copy',
                    details: error,
                },
            };
        }
    },
};
/**
 * Move/Rename File Tool
 */
export const moveFileTool = {
    name: 'move_file',
    description: 'Move or rename a file or directory',
    category: 'file',
    permissions: ['file:read', 'file:write', 'file:delete'],
    parallelizable: false,
    parameters: [
        {
            name: 'source',
            description: 'Source path',
            schema: z.string(),
            required: true,
        },
        {
            name: 'target',
            description: 'Target path',
            schema: z.string(),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { source, target } = params;
            logger.debug(`Moving: ${source} → ${target}`);
            await file.move(source, target);
            return {
                success: true,
                output: {
                    source,
                    target,
                    moved: true,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'MOVE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to move',
                    details: error,
                },
            };
        }
    },
};
/**
 * Get File Info Tool
 */
export const getFileInfoTool = {
    name: 'get_file_info',
    description: 'Get detailed information about a file',
    category: 'file',
    permissions: ['file:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'path',
            description: 'Path to the file',
            schema: z.string(),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { path } = params;
            logger.debug(`Getting file info: ${path}`);
            const info = await file.getFileInfo(path);
            return {
                success: true,
                output: info,
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'INFO_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get file info',
                    details: error,
                },
            };
        }
    },
};
/**
 * All file tools
 */
export const fileTools = [
    readFileTool,
    writeFileTool,
    appendFileTool,
    listFilesTool,
    deleteFileTool,
    fileExistsTool,
    createDirectoryTool,
    copyFileTool,
    moveFileTool,
    getFileInfoTool,
];
