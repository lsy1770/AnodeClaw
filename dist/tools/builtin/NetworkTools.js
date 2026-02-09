/**
 * Network Tools
 *
 * Built-in tools for HTTP requests and network operations
 * Based on NetworkAPI.kt definitions
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
/**
 * Serialize body to JSON string for Kotlin interop.
 * Kotlin's toJsonString() extension only handles Map/List — a Javet V8ValueObject
 * is neither, so .toString() produces garbage. Always stringify on the JS side.
 */
function serializeBody(body) {
    if (body === undefined || body === null)
        return undefined;
    if (typeof body === 'string')
        return body;
    return JSON.stringify(body);
}
/**
 * HTTP GET Request Tool
 */
export const httpGetTool = {
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
    async execute(params, options) {
        try {
            const { url, headers } = params;
            logger.debug(`HTTP GET request to: ${url}`);
            // Only pass headers when provided — avoids Javet null→Map conversion issues
            const response = headers && Object.keys(headers).length > 0
                ? await http.httpGet(url, headers)
                : await http.httpGet(url);
            return {
                success: true,
                output: {
                    url,
                    data: response,
                },
            };
        }
        catch (error) {
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
export const httpPostTool = {
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
    async execute(params, options) {
        try {
            const { url, body, headers } = params;
            logger.debug(`HTTP POST request to: ${url}`);
            // Serialize body to string — Kotlin's toJsonString() can't handle raw V8 objects
            const bodyStr = serializeBody(body);
            const response = (headers && Object.keys(headers).length > 0)
                ? await http.httpPost(url, bodyStr, headers)
                : bodyStr !== undefined
                    ? await http.httpPost(url, bodyStr)
                    : await http.httpPost(url);
            return {
                success: true,
                output: {
                    url,
                    data: response,
                },
            };
        }
        catch (error) {
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
 * HTTP Request Tool (Generic)
 * Uses native Anode http for GET/POST, fetch fallback for other methods
 */
export const httpRequestTool = {
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
    async execute(params, options) {
        try {
            const { url, method = 'GET', headers, body, timeout = 30000 } = params;
            logger.debug(`HTTP ${method} request to: ${url}`);
            const bodyStr = serializeBody(body);
            const hasHeaders = headers && Object.keys(headers).length > 0;
            // GET — use native Anode http
            if (method === 'GET' && !bodyStr) {
                const response = hasHeaders
                    ? await http.httpGet(url, headers)
                    : await http.httpGet(url);
                return {
                    success: true,
                    output: { url, method, data: response },
                };
            }
            // POST — use native Anode http
            if (method === 'POST') {
                const response = hasHeaders
                    ? await http.httpPost(url, bodyStr, headers)
                    : bodyStr !== undefined
                        ? await http.httpPost(url, bodyStr)
                        : await http.httpPost(url);
                return {
                    success: true,
                    output: { url, method, data: response },
                };
            }
            // Other methods (PUT/DELETE/PATCH/HEAD) — use fetch if available
            if (typeof globalThis.fetch !== 'function') {
                return {
                    success: false,
                    error: {
                        code: 'METHOD_NOT_SUPPORTED',
                        message: `HTTP method ${method} is not supported in this environment. Only GET and POST are available via native API.`,
                    },
                };
            }
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            const response = await fetch(url, {
                method,
                headers: hasHeaders ? headers : undefined,
                body: bodyStr ? bodyStr : undefined,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            const responseText = await response.text();
            let responseData = responseText;
            try {
                responseData = JSON.parse(responseText);
            }
            catch {
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
        }
        catch (error) {
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
export const checkNetworkTool = {
    name: 'check_network',
    description: 'Check network connectivity status',
    category: 'network',
    permissions: ['network:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Checking network status');
            const isConnected = http.getIsConnected();
            const networkType = http.getNetworkType();
            return {
                success: true,
                output: {
                    isConnected,
                    networkType,
                },
            };
        }
        catch (error) {
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
export const checkUrlTool = {
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
    async execute(params, options) {
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
        }
        catch (error) {
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
export const uploadFileTool = {
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
    async execute(params, options) {
        try {
            const { url, filePath, params: formParams, headers } = params;
            logger.debug(`Uploading file: ${filePath} to ${url}`);
            // Build arguments — only pass what's needed to avoid Javet null→Map issues
            let response;
            const hasParams = formParams && Object.keys(formParams).length > 0;
            const hasHeaders = headers && Object.keys(headers).length > 0;
            if (hasHeaders) {
                response = await http.uploadFile(url, filePath, hasParams ? formParams : undefined, headers);
            }
            else if (hasParams) {
                response = await http.uploadFile(url, filePath, formParams);
            }
            else {
                response = await http.uploadFile(url, filePath);
            }
            return {
                success: true,
                output: {
                    url,
                    filePath,
                    response,
                },
            };
        }
        catch (error) {
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
 * Uses native httpGet + file API. Falls back to fetch for binary content.
 */
export const downloadFileTool = {
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
    async execute(params, options) {
        try {
            const { url, path, timeout = 60000 } = params;
            logger.debug(`Downloading file from: ${url}`);
            // Ensure parent directory exists
            const pathParts = path.split('/');
            if (pathParts.length > 1) {
                const dir = pathParts.slice(0, -1).join('/');
                try {
                    await file.createDirectory(dir);
                }
                catch (e) {
                    // Directory might already exist
                }
            }
            // Try fetch first (supports binary), fall back to httpGet (text only)
            if (typeof globalThis.fetch === 'function') {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                await file.writeBytes(path, bytes);
                return {
                    success: true,
                    output: {
                        url,
                        path,
                        size: arrayBuffer.byteLength,
                        message: 'File downloaded successfully',
                    },
                };
            }
            // Fallback: use native httpGet (works for text/JSON content)
            const content = await http.httpGet(url);
            const text = typeof content === 'string' ? content : JSON.stringify(content);
            await file.writeText(path, text);
            return {
                success: true,
                output: {
                    url,
                    path,
                    size: text.length,
                    message: 'File downloaded successfully (text mode)',
                },
            };
        }
        catch (error) {
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
export const networkTools = [
    httpGetTool,
    httpPostTool,
    httpRequestTool,
    checkNetworkTool,
    checkUrlTool,
    uploadFileTool,
    downloadFileTool,
];
