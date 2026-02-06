/**
 * Network Tools
 *
 * Built-in tools for HTTP requests and network operations
 * Based on anode-api.d.ts definitions
 */

import { z } from 'zod';
import type { Tool, ToolResult, ToolExecutionOptions } from '../types.js';
import { logger } from '../../utils/logger.js';

// Anode http global (based on anode-api.d.ts)
declare const http: {
  getIsConnected(): boolean;  // Synchronous!
  getNetworkType(): string;  // Synchronous!
  httpGet(urlString: string, headers?: Record<string, string> | null): Promise<any>;
  httpPost(urlString: string, body?: any | null, headers?: Record<string, string> | null): Promise<any>;
  checkUrlAccessible(urlString: string): Promise<boolean>;
  uploadFile(urlString: string, filePath: string, params?: Record<string, any> | null, headers?: Record<string, string> | null): Promise<any>;
  uploadFiles(urlString: string, filePaths: string[], params?: Record<string, any> | null, headers?: Record<string, string> | null): Promise<any>;
};

// Anode FileAPI global (based on anode-api.d.ts)
declare const fileAPI: {
  writeText(path: string, content: string, charset?: string | null): Promise<boolean>;
  writeBytes(path: string, bytes: Uint8Array): Promise<boolean>;
  createDirectory(path: string): Promise<any>;
  decodeBase64(base64: string, outputPath: string): Promise<boolean>;
};

/**
 * HTTP GET Request Tool
 */
export const httpGetTool: Tool = {
  name: 'http_get',
  description: 'Make an HTTP GET request to a URL',
  category: 'network',
  permissions: ['network:http'],
  parallelizable: true,

  parameters: [
    {
      name: 'url',
      description: 'URL to request',
      schema: z.string().url(),
      required: true,
    },
    {
      name: 'headers',
      description: 'HTTP headers as key-value object',
      schema: z.record(z.string()),
      required: false,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { url, headers } = params;

      logger.debug(`HTTP GET request to: ${url}`);

      const response = await http.httpGet(url, headers || null);

      return {
        success: true,
        output: {
          url,
          data: response,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'REQUEST_FAILED',
          message: error instanceof Error ? error.message : 'HTTP GET request failed',
          details: error,
        },
      };
    }
  },
};

/**
 * HTTP POST Request Tool
 */
export const httpPostTool: Tool = {
  name: 'http_post',
  description: 'Make an HTTP POST request to a URL',
  category: 'network',
  permissions: ['network:http'],
  parallelizable: true,

  parameters: [
    {
      name: 'url',
      description: 'URL to request',
      schema: z.string().url(),
      required: true,
    },
    {
      name: 'body',
      description: 'Request body (string or JSON object)',
      schema: z.any(),
      required: false,
    },
    {
      name: 'headers',
      description: 'HTTP headers as key-value object',
      schema: z.record(z.string()),
      required: false,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { url, body, headers } = params;

      logger.debug(`HTTP POST request to: ${url}`);

      const response = await http.httpPost(url, body || null, headers || null);

      return {
        success: true,
        output: {
          url,
          data: response,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'REQUEST_FAILED',
          message: error instanceof Error ? error.message : 'HTTP POST request failed',
          details: error,
        },
      };
    }
  },
};

/**
 * HTTP Request Tool (Generic - uses fetch for flexibility)
 */
export const httpRequestTool: Tool = {
  name: 'http_request',
  description: 'Make an HTTP request to a URL with any method',
  category: 'network',
  permissions: ['network:http'],
  parallelizable: true,

  parameters: [
    {
      name: 'url',
      description: 'URL to request',
      schema: z.string().url(),
      required: true,
    },
    {
      name: 'method',
      description: 'HTTP method (default: GET)',
      schema: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']),
      required: false,
      default: 'GET',
    },
    {
      name: 'headers',
      description: 'HTTP headers as key-value object',
      schema: z.record(z.string()).optional().nullable(),
      required: false,
    },
    {
      name: 'body',
      description: 'Request body (for POST/PUT/PATCH)',
      schema: z.union([z.string(), z.record(z.any())]).optional().nullable(),
      required: false,
    },
    {
      name: 'timeout',
      description: 'Request timeout in milliseconds (default: 30000)',
      schema: z.number().int().min(0).max(120000),
      required: false,
      default: 30000,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { url, method = 'GET', headers = {}, body, timeout = 30000 } = params;

      logger.debug(`HTTP ${method} request to: ${url}`);

      // Serialize body if it's an object
      let bodyStr: string | undefined;
      if (body !== undefined && body !== null) {
        bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      }

      // For GET/POST, prefer Anode's native http
      if (method === 'GET' && !bodyStr) {
        const response = await http.httpGet(url, headers || null);
        return {
          success: true,
          output: {
            url,
            method,
            data: response,
          },
        };
      }

      if (method === 'POST') {
        const response = await http.httpPost(url, bodyStr || null, headers || null);
        return {
          success: true,
          output: {
            url,
            method,
            data: response,
          },
        };
      }

      // For other methods, use fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers,
        body: bodyStr ? bodyStr : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      let responseData: any = responseText;

      // Try to parse as JSON
      try {
        responseData = JSON.parse(responseText);
      } catch {
        // Keep as text if not JSON
      }

      return {
        success: true,
        output: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          data: responseData,
          url: response.url,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'REQUEST_FAILED',
          message: error instanceof Error ? error.message : 'HTTP request failed',
          details: error,
        },
      };
    }
  },
};

/**
 * Check Network Status Tool
 */
export const checkNetworkTool: Tool = {
  name: 'check_network',
  description: 'Check network connectivity status',
  category: 'network',
  permissions: ['network:read'],
  parallelizable: true,

  parameters: [],

  async execute(params, options): Promise<ToolResult> {
    try {
      logger.debug('Checking network status');

      // These are synchronous
      const isConnected = http.getIsConnected();
      const networkType = http.getNetworkType();

      return {
        success: true,
        output: {
          isConnected,
          networkType,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_CHECK_FAILED',
          message: error instanceof Error ? error.message : 'Failed to check network status',
          details: error,
        },
      };
    }
  },
};

/**
 * Check URL Accessible Tool
 */
export const checkUrlTool: Tool = {
  name: 'check_url',
  description: 'Check if a URL is accessible',
  category: 'network',
  permissions: ['network:http'],
  parallelizable: true,

  parameters: [
    {
      name: 'url',
      description: 'URL to check',
      schema: z.string().url(),
      required: true,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { url } = params;

      logger.debug(`Checking URL accessibility: ${url}`);

      const isAccessible = await http.checkUrlAccessible(url);

      return {
        success: true,
        output: {
          url,
          isAccessible,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'URL_CHECK_FAILED',
          message: error instanceof Error ? error.message : 'Failed to check URL',
          details: error,
        },
      };
    }
  },
};

/**
 * Upload File Tool
 */
export const uploadFileTool: Tool = {
  name: 'upload_file',
  description: 'Upload a file to a URL',
  category: 'network',
  permissions: ['network:http', 'file:read'],
  parallelizable: true,

  parameters: [
    {
      name: 'url',
      description: 'URL to upload to',
      schema: z.string().url(),
      required: true,
    },
    {
      name: 'filePath',
      description: 'Path to the file to upload',
      schema: z.string(),
      required: true,
    },
    {
      name: 'params',
      description: 'Additional form parameters',
      schema: z.record(z.any()),
      required: false,
    },
    {
      name: 'headers',
      description: 'HTTP headers',
      schema: z.record(z.string()),
      required: false,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { url, filePath, params: formParams, headers } = params;

      logger.debug(`Uploading file: ${filePath} to ${url}`);

      const response = await http.uploadFile(
        url,
        filePath,
        formParams || null,
        headers || null
      );

      return {
        success: true,
        output: {
          url,
          filePath,
          response,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'UPLOAD_FAILED',
          message: error instanceof Error ? error.message : 'File upload failed',
          details: error,
        },
      };
    }
  },
};

/**
 * Download File Tool
 */
export const downloadFileTool: Tool = {
  name: 'download_file',
  description: 'Download a file from a URL and save to disk',
  category: 'network',
  permissions: ['network:http', 'file:write'],
  parallelizable: true,

  parameters: [
    {
      name: 'url',
      description: 'URL to download from',
      schema: z.string().url(),
      required: true,
    },
    {
      name: 'path',
      description: 'Local path to save the file',
      schema: z.string(),
      required: true,
    },
    {
      name: 'timeout',
      description: 'Download timeout in milliseconds (default: 60000)',
      schema: z.number().int().min(0),
      required: false,
      default: 60000,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { url, path, timeout = 60000 } = params;

      logger.debug(`Downloading file from: ${url}`);

      // Use fetch to download
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get file content as ArrayBuffer
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      // Ensure parent directory exists
      const pathParts = path.split('/');
      if (pathParts.length > 1) {
        const dir = pathParts.slice(0, -1).join('/');
        try {
          await fileAPI.createDirectory(dir);
        } catch (e) {
          // Directory might already exist, ignore error
        }
      }

      // Write file using Anode FileAPI
      await fileAPI.writeBytes(path, bytes);

      return {
        success: true,
        output: {
          url,
          path,
          size: arrayBuffer.byteLength,
          message: 'File downloaded successfully',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'DOWNLOAD_FAILED',
          message: error instanceof Error ? error.message : 'Download failed',
          details: error,
        },
      };
    }
  },
};

/**
 * All network tools
 */
export const networkTools: Tool[] = [
  httpGetTool,
  httpPostTool,
  httpRequestTool,
  checkNetworkTool,
  checkUrlTool,
  uploadFileTool,
  downloadFileTool,
];
