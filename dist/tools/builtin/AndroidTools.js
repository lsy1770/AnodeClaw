/**
 * Android Automation Tools
 *
 * Built-in tools for Android UI automation using Anode AutomatorAPI and ImageAPI
 * Based on anode-api.d.ts definitions
 *
 * IMPORTANT: Tool Selection Strategy
 * ====================================
 * There are TWO types of interaction tools:
 *
 * 1. ELEMENT-BASED TOOLS (PREFERRED - More Reliable):
 *    - android_click_element, android_long_click_element, android_input_text_to_element
 *    - android_scroll_element, android_expand_element, android_collapse_element
 *    - These find the element and use its NATIVE methods (node.click(), node.scroll(), etc.)
 *    - More reliable because they respect element properties (isClickable, isScrollable, etc.)
 *    - Automatically check element state before performing actions
 *
 * 2. COORDINATE-BASED TOOLS (Legacy - Use only when element-based tools fail):
 *    - android_click, android_long_click, android_swipe
 *    - These operate on screen coordinates directly
 *    - Should only be used when you cannot find the element or for gesture-based interactions
 *
 * RECOMMENDATION: Always try element-based tools first. Only fall back to coordinate-based
 * tools if the element cannot be found or doesn't respond to element-based operations.
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
/**
 * Android Click Tool
 */
export const androidClickTool = {
    name: 'android_click',
    description: 'Click at specific coordinates on the Android screen',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'x',
            description: 'X coordinate (pixels)',
            schema: z.number().int().min(0),
            required: true,
        },
        {
            name: 'y',
            description: 'Y coordinate (pixels)',
            schema: z.number().int().min(0),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { x, y } = params;
            logger.debug(`Android click at (${x}, ${y})`);
            await auto.click(x, y);
            return {
                success: true,
                output: {
                    action: 'click',
                    x,
                    y,
                    message: 'Click executed successfully',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'CLICK_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to click',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Long Click Tool
 */
export const androidLongClickTool = {
    name: 'android_long_click',
    description: 'Long click at specific coordinates on the Android screen',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'x',
            description: 'X coordinate (pixels)',
            schema: z.number().int().min(0),
            required: true,
        },
        {
            name: 'y',
            description: 'Y coordinate (pixels)',
            schema: z.number().int().min(0),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { x, y } = params;
            logger.debug(`Android long click at (${x}, ${y})`);
            await auto.longClick(x, y);
            return {
                success: true,
                output: {
                    action: 'long_click',
                    x,
                    y,
                    message: 'Long click executed successfully',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'LONG_CLICK_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to long click',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Swipe Tool
 */
export const androidSwipeTool = {
    name: 'android_swipe',
    description: 'Perform a swipe gesture on the Android screen',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'startX',
            description: 'Starting X coordinate',
            schema: z.number().int().min(0),
            required: true,
        },
        {
            name: 'startY',
            description: 'Starting Y coordinate',
            schema: z.number().int().min(0),
            required: true,
        },
        {
            name: 'endX',
            description: 'Ending X coordinate',
            schema: z.number().int().min(0),
            required: true,
        },
        {
            name: 'endY',
            description: 'Ending Y coordinate',
            schema: z.number().int().min(0),
            required: true,
        },
        {
            name: 'duration',
            description: 'Swipe duration in milliseconds (default: 300)',
            schema: z.number().int().min(0).max(5000),
            required: false,
            default: 300,
        },
    ],
    async execute(params, options) {
        try {
            const { startX, startY, endX, endY, duration = 300 } = params;
            logger.debug(`Android swipe from (${startX},${startY}) to (${endX},${endY})`);
            await auto.swipe(startX, startY, endX, endY, duration);
            return {
                success: true,
                output: {
                    action: 'swipe',
                    from: { x: startX, y: startY },
                    to: { x: endX, y: endY },
                    duration,
                    message: 'Swipe executed successfully',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'SWIPE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to swipe',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Find Text Tool
 * Uses auto.selector() to create selector and findAll to search
 *
 * PERFORMANCE NOTE: This tool can be slow on complex UIs due to accessibility service overhead.
 * Prefer using element-based tools (android_click_element, etc.) when possible.
 */
export const androidFindTextTool = {
    name: 'android_find_text',
    description: 'Find UI elements containing specific text on the screen. WARNING: Can be slow on complex UIs (may take 30-60s). Consider using android_click_element instead if you just need to interact.',
    category: 'android',
    permissions: ['android:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'text',
            description: 'Text to search for',
            schema: z.string(),
            required: true,
        },
        {
            name: 'exact',
            description: 'Match exact text (default: false for partial match)',
            schema: z.boolean(),
            required: false,
            default: false,
        },
        {
            name: 'timeout',
            description: 'Wait timeout in milliseconds (default: 0 = no wait)',
            schema: z.number().int().min(0),
            required: false,
            default: 0,
        },
        {
            name: 'maxResults',
            description: 'Maximum number of results to return (default: 20, reduces processing time)',
            schema: z.number().int().min(1).max(100),
            required: false,
            default: 20,
        },
    ],
    async execute(params, options) {
        try {
            const { text, exact = false, timeout = 0, maxResults = 20 } = params;
            logger.debug(`Android find text: "${text}" (exact: ${exact}, maxResults: ${maxResults})`);
            // Override timeout if not set - give this tool more time
            const effectiveOptions = {
                ...options,
                timeout: options?.timeout || 90000, // 90 seconds for slow accessibility service
            };
            // Create selector with text matching
            const selector = auto.selector();
            if (exact) {
                selector.text(text);
            }
            else {
                selector.textContains(text);
            }
            // If timeout, use waitFor, otherwise use findAll
            let nodes;
            if (timeout > 0) {
                const node = await auto.waitFor(selector, timeout);
                nodes = node ? [node] : [];
            }
            else {
                const startTime = Date.now();
                logger.debug('Calling auto.findAll() - this may take 30-60s on complex UIs...');
                nodes = await auto.findAll(selector);
                logger.debug(`auto.findAll() completed in ${Date.now() - startTime}ms, found ${nodes.length} nodes`);
            }
            // Limit results to avoid excessive processing
            const limitedNodes = nodes.slice(0, maxResults);
            if (nodes.length > maxResults) {
                logger.info(`Found ${nodes.length} nodes, limiting to ${maxResults} for performance`);
            }
            // Extract node info - access properties directly (NOT methods)
            const nodeInfos = limitedNodes.map((node) => {
                try {
                    return {
                        text: node.text || text,
                        bounds: node.bounds,
                        clickable: node.clickable,
                        id: node.id,
                        className: node.className,
                    };
                }
                catch (e) {
                    logger.warn('Failed to extract node properties:', e);
                    return { text, error: 'Failed to read node properties' };
                }
            });
            return {
                success: true,
                output: {
                    found: nodes.length > 0,
                    count: nodes.length,
                    returnedCount: limitedNodes.length,
                    truncated: nodes.length > maxResults,
                    nodes: nodeInfos,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'FIND_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to find text',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Input Text Tool
 */
export const androidInputTextTool = {
    name: 'android_input_text',
    description: 'Input text into the currently focused field',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'text',
            description: 'Text to input',
            schema: z.string(),
            required: true,
        },
        {
            name: 'clearFirst',
            description: 'Clear existing text before input (default: false)',
            schema: z.boolean(),
            required: false,
            default: false,
        },
    ],
    async execute(params, options) {
        try {
            const { text, clearFirst = false } = params;
            logger.debug(`Android input text: "${text}"`);
            if (clearFirst) {
                await auto.clearText();
            }
            await auto.setText(text);
            return {
                success: true,
                output: {
                    action: 'input_text',
                    text,
                    clearFirst,
                    message: 'Text input successfully',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'INPUT_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to input text',
                    details: error,
                },
            };
        }
    },
};
/**
 * Request Screen Capture Permission Tool
 */
export const androidRequestScreenCaptureTool = {
    name: 'android_request_screen_capture',
    description: 'Request screen capture permission. MUST be called BEFORE android_screenshot (unless using useAccessibility=true). This shows a system dialog asking user to grant permission.',
    category: 'android',
    permissions: ['android:permission'],
    parallelizable: false,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Requesting screen capture permission');
            await image.requestScreenCapturePermission();
            return {
                success: true,
                output: {
                    action: 'request_screen_capture',
                    message: 'Screen capture permission requested successfully',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'PERMISSION_REQUEST_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to request screen capture permission',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Screenshot Tool
 * Uses image.captureScreen() or captureScreenWithAccessibility()
 * Note: Call android_request_screen_capture first if not using accessibility mode
 */
export const androidScreenshotTool = {
    name: 'android_screenshot',
    description: 'Capture a screenshot. PREREQUISITES: 1) You MUST call android_request_screen_capture FIRST to get permission (unless using useAccessibility=true). 2) Provide "path" parameter to save file (e.g., "./screenshots/screen.png"), otherwise only base64 data is returned.',
    category: 'android',
    permissions: ['android:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'path',
            description: 'File path to save screenshot (e.g., "./screenshots/screen.png"). If omitted or empty, returns base64 data instead of saving to file.',
            schema: z.string().optional(),
            required: false,
        },
        {
            name: 'format',
            description: 'Image format: png or jpg (default: png)',
            schema: z.enum(['png', 'jpg']),
            required: false,
            default: 'png',
        },
        {
            name: 'quality',
            description: 'Image quality 1-100 (default: 90)',
            schema: z.number().int().min(1).max(100),
            required: false,
            default: 90,
        },
        {
            name: 'useAccessibility',
            description: 'Use accessibility service for screenshot (default: false, no permission needed)',
            schema: z.boolean(),
            required: false,
            default: false,
        },
    ],
    async execute(params, options) {
        try {
            const { path, format = 'png', quality = 90, useAccessibility = false } = params;
            logger.debug(`Android screenshot (format: ${format}, path: ${path || 'base64'})`);
            // Capture screenshot
            let bitmap;
            if (useAccessibility) {
                // Accessibility mode doesn't need permission
                bitmap = await image.captureScreenWithAccessibility();
            }
            else {
                // MediaProjection mode - permission should have been requested first
                bitmap = await image.captureScreen();
            }
            if (!bitmap) {
                throw new Error('Failed to capture screen - null bitmap returned');
            }
            // Save to file or return base64
            if (path) {
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
                await image.saveImage(bitmap, path, format, quality);
                return {
                    success: true,
                    output: {
                        action: 'screenshot',
                        path,
                        format,
                        quality,
                        message: 'Screenshot saved successfully',
                    },
                    attachments: [{
                            type: 'image',
                            localPath: path,
                            mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
                        }],
                };
            }
            else {
                // Return base64
                const base64 = await image.toBase64(bitmap, format, quality);
                return {
                    success: true,
                    output: {
                        action: 'screenshot',
                        format,
                        base64,
                        message: 'Screenshot captured as base64 data (no path specified - provide "path" parameter to save to file)',
                    },
                };
            }
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'SCREENSHOT_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to capture screenshot',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Find by ID Tool
 */
export const androidFindByIdTool = {
    name: 'android_find_id',
    description: 'Find UI element by resource ID',
    category: 'android',
    permissions: ['android:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'id',
            description: 'Resource ID to search for (e.g., "com.app:id/button")',
            schema: z.string(),
            required: true,
        },
        {
            name: 'timeout',
            description: 'Wait timeout in milliseconds (default: 0 = no wait)',
            schema: z.number().int().min(0),
            required: false,
            default: 0,
        },
    ],
    async execute(params, options) {
        try {
            const { id, timeout = 0 } = params;
            logger.debug(`Android find by ID: ${id}`);
            // Create selector with ID
            const selector = auto.selector();
            selector.id(id);
            // If timeout, use waitFor, otherwise use findAll
            let nodes;
            if (timeout > 0) {
                const node = await auto.waitFor(selector, timeout);
                nodes = node ? [node] : [];
            }
            else {
                nodes = await auto.findAll(selector);
            }
            return {
                success: true,
                output: {
                    found: nodes.length > 0,
                    count: nodes.length,
                    nodes: nodes.map((node) => ({
                        id: node.id || id,
                        text: node.text,
                        bounds: node.bounds,
                        clickable: node.clickable,
                        className: node.className,
                    })),
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'FIND_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to find by ID',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Back Button Tool
 */
export const androidBackTool = {
    name: 'android_back',
    description: 'Press the Android back button',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Android back button');
            await auto.back();
            return {
                success: true,
                output: {
                    action: 'back',
                    message: 'Back button pressed successfully',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'BACK_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to press back',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Home Button Tool
 */
export const androidHomeTool = {
    name: 'android_home',
    description: 'Press the Android home button',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Android home button');
            await auto.home();
            return {
                success: true,
                output: {
                    action: 'home',
                    message: 'Home button pressed successfully',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'HOME_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to press home',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Recents Button Tool
 */
export const androidRecentsTool = {
    name: 'android_recents',
    description: 'Press the Android recents/multitask button',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Android recents button');
            await auto.recents();
            return {
                success: true,
                output: {
                    action: 'recents',
                    message: 'Recents button pressed successfully',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'RECENTS_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to press recents',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Open Notifications Tool
 */
export const androidNotificationsTool = {
    name: 'android_notifications',
    description: 'Open the Android notification panel',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Opening notifications');
            await auto.notifications();
            return {
                success: true,
                output: {
                    action: 'notifications',
                    message: 'Notification panel opened successfully',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'NOTIFICATIONS_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to open notifications',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Scroll Tool
 */
export const androidScrollTool = {
    name: 'android_scroll',
    description: 'Scroll the screen forward or backward',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'direction',
            description: 'Scroll direction: forward or backward',
            schema: z.enum(['forward', 'backward']),
            required: false,
            default: 'forward',
        },
    ],
    async execute(params, options) {
        try {
            const { direction = 'forward' } = params;
            logger.debug(`Android scroll ${direction}`);
            if (direction === 'forward') {
                await auto.scrollForward();
            }
            else {
                await auto.scrollBackward();
            }
            return {
                success: true,
                output: {
                    action: 'scroll',
                    direction,
                    message: `Scrolled ${direction} successfully`,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'SCROLL_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to scroll',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Wait For Element Tool
 */
export const androidWaitForTool = {
    name: 'android_wait_for',
    description: 'Wait for a UI element to appear on screen',
    category: 'android',
    permissions: ['android:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'text',
            description: 'Text to wait for (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'id',
            description: 'Resource ID to wait for (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'timeout',
            description: 'Wait timeout in milliseconds (default: 5000)',
            schema: z.number().int().min(0),
            required: false,
            default: 5000,
        },
    ],
    async execute(params, options) {
        try {
            const { text, id, timeout = 5000 } = params;
            if (!text && !id) {
                return {
                    success: false,
                    error: {
                        code: 'INVALID_PARAMS',
                        message: 'Either text or id must be provided',
                    },
                };
            }
            logger.debug(`Android wait for: text="${text}" id="${id}" timeout=${timeout}`);
            // Create selector
            const selector = auto.selector();
            if (text) {
                selector.textContains(text);
            }
            if (id) {
                selector.id(id);
            }
            const node = await auto.waitFor(selector, timeout);
            return {
                success: true,
                output: {
                    found: !!node,
                    node: node ? {
                        text: node.text,
                        id: node.id,
                        bounds: node.bounds,
                        clickable: node.clickable,
                        className: node.className,
                    } : null,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'WAIT_FAILED',
                    message: error instanceof Error ? error.message : 'Wait for element failed',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Check Accessibility Tool
 */
export const androidCheckAccessibilityTool = {
    name: 'android_check_accessibility',
    description: 'Check if accessibility service is enabled',
    category: 'android',
    permissions: ['android:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Checking accessibility service');
            const isEnabled = await auto.isEnabled();
            return {
                success: true,
                output: {
                    accessibilityEnabled: isEnabled,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'CHECK_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to check accessibility',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Press Tool
 * Long press with custom duration at specific coordinates
 */
export const androidPressTool = {
    name: 'android_press',
    description: 'Press and hold at specific coordinates for a given duration (ms)',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'x',
            description: 'X coordinate (pixels)',
            schema: z.number().int().min(0),
            required: true,
        },
        {
            name: 'y',
            description: 'Y coordinate (pixels)',
            schema: z.number().int().min(0),
            required: true,
        },
        {
            name: 'duration',
            description: 'Press duration in milliseconds',
            schema: z.number().int().min(1),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { x, y, duration } = params;
            logger.debug(`Android press at (${x}, ${y}) for ${duration}ms`);
            await auto.press(x, y, duration);
            return {
                success: true,
                output: { action: 'press', x, y, duration, message: 'Press executed successfully' },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'PRESS_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to press',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Gesture Tool
 * Perform a gesture along a path of points
 */
export const androidGestureTool = {
    name: 'android_gesture',
    description: 'Perform a gesture along a path of points over a given duration. Points format: [{x, y}, ...] or [[x, y], ...]',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'duration',
            description: 'Gesture duration in milliseconds',
            schema: z.number().int().min(1),
            required: true,
        },
        {
            name: 'points',
            description: 'Array of points: [{x, y}, ...] or [[x, y], ...]',
            schema: z.array(z.any()).min(2),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { duration, points } = params;
            logger.debug(`Android gesture: ${points.length} points, ${duration}ms`);
            await auto.gesture(duration, points);
            return {
                success: true,
                output: { action: 'gesture', duration, pointCount: points.length, message: 'Gesture executed successfully' },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'GESTURE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to perform gesture',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Multi-Stroke Gestures Tool
 */
export const androidGesturesTool = {
    name: 'android_gestures',
    description: 'Perform multi-stroke gestures simultaneously. Each stroke: {duration, points: [{x, y}, ...]}',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'strokes',
            description: 'Array of stroke objects: [{duration: number, points: [{x, y}, ...]}, ...]',
            schema: z.array(z.object({
                duration: z.number().int().min(1),
                points: z.array(z.any()).min(1),
            })).min(1),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { strokes } = params;
            logger.debug(`Android gestures: ${strokes.length} strokes`);
            await auto.gestures(strokes);
            return {
                success: true,
                output: { action: 'gestures', strokeCount: strokes.length, message: 'Gestures executed successfully' },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'GESTURES_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to perform gestures',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Quick Settings Tool
 */
export const androidQuickSettingsTool = {
    name: 'android_quick_settings',
    description: 'Open the Android quick settings panel',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Opening quick settings');
            await auto.quickSettings();
            return {
                success: true,
                output: { action: 'quick_settings', message: 'Quick settings opened successfully' },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'QUICK_SETTINGS_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to open quick settings',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Append Text Tool
 */
export const androidAppendTextTool = {
    name: 'android_append_text',
    description: 'Append text to the currently focused input field without clearing existing content',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'text',
            description: 'Text to append',
            schema: z.string(),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { text } = params;
            logger.debug(`Android append text: "${text}"`);
            await auto.appendText(text);
            return {
                success: true,
                output: { action: 'append_text', text, message: 'Text appended successfully' },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'APPEND_TEXT_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to append text',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Scroll To Tool
 * Directional scroll by percentage
 */
export const androidScrollToTool = {
    name: 'android_scroll_to',
    description: 'Scroll in a specific direction by a percentage. Direction: 0=up, 1=down, 2=left, 3=right. Percent: 0.0-1.0',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'direction',
            description: 'Scroll direction: 0=up, 1=down, 2=left, 3=right',
            schema: z.number().int().min(0).max(3),
            required: true,
        },
        {
            name: 'percent',
            description: 'Scroll percentage (0.0-1.0)',
            schema: z.number().min(0).max(1),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { direction, percent } = params;
            const dirNames = ['up', 'down', 'left', 'right'];
            logger.debug(`Android scroll ${dirNames[direction]} ${percent * 100}%`);
            await auto.scrollTo(direction, percent);
            return {
                success: true,
                output: { action: 'scroll_to', direction: dirNames[direction], percent, message: 'Scroll executed successfully' },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'SCROLL_TO_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to scroll',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Get Current Package Tool
 */
export const androidGetCurrentPackageTool = {
    name: 'android_get_current_package',
    description: 'Get the package name of the current foreground app',
    category: 'android',
    permissions: ['android:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Getting current package');
            const packageName = await auto.getCurrentPackage();
            return {
                success: true,
                output: { packageName },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'GET_PACKAGE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get current package',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Get Current Activity Tool
 */
export const androidGetCurrentActivityTool = {
    name: 'android_get_current_activity',
    description: 'Get the current activity name of the foreground app',
    category: 'android',
    permissions: ['android:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Getting current activity');
            const activity = await auto.getCurrentActivity();
            return {
                success: true,
                output: { activity },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'GET_ACTIVITY_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get current activity',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Screen State Tool
 */
export const androidScreenStateTool = {
    name: 'android_screen_state',
    description: 'Get the screen state: whether the screen is on and whether it is locked',
    category: 'android',
    permissions: ['android:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Checking screen state');
            const [isOn, isLocked] = await Promise.all([
                auto.isScreenOn(),
                auto.isScreenLocked(),
            ]);
            return {
                success: true,
                output: { screenOn: isOn, screenLocked: isLocked },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'SCREEN_STATE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get screen state',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Exists Tool
 * Check if a UI element exists without waiting
 */
export const androidExistsTool = {
    name: 'android_exists',
    description: 'Check if a UI element matching the given text or id exists on screen (no waiting)',
    category: 'android',
    permissions: ['android:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'text',
            description: 'Text to search for (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'id',
            description: 'Resource ID to search for (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'exact',
            description: 'Match exact text (default: false)',
            schema: z.boolean(),
            required: false,
            default: false,
        },
    ],
    async execute(params, options) {
        try {
            const { text, id, exact = false } = params;
            if (!text && !id) {
                return { success: false, error: { code: 'INVALID_PARAMS', message: 'Either text or id must be provided' } };
            }
            logger.debug(`Android exists: text="${text}" id="${id}"`);
            const selector = auto.selector();
            if (text) {
                if (exact) {
                    selector.text(text);
                }
                else {
                    selector.textContains(text);
                }
            }
            if (id) {
                selector.id(id);
            }
            const exists = await auto.exists(selector);
            return {
                success: true,
                output: { exists },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'EXISTS_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to check existence',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Find One Tool
 * Find a single UI element using selector
 */
export const androidFindOneTool = {
    name: 'android_find_one',
    description: 'Find a single UI element matching the given criteria. Returns the first match or null.',
    category: 'android',
    permissions: ['android:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'text',
            description: 'Text to search for (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'id',
            description: 'Resource ID (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'className',
            description: 'Class name to match (optional, e.g. "android.widget.Button")',
            schema: z.string(),
            required: false,
        },
        {
            name: 'exact',
            description: 'Match exact text (default: false)',
            schema: z.boolean(),
            required: false,
            default: false,
        },
    ],
    async execute(params, options) {
        try {
            const { text, id, className, exact = false } = params;
            if (!text && !id && !className) {
                return { success: false, error: { code: 'INVALID_PARAMS', message: 'At least one of text, id, or className must be provided' } };
            }
            logger.debug(`Android findOne: text="${text}" id="${id}" className="${className}"`);
            const selector = auto.selector();
            if (text) {
                if (exact) {
                    selector.text(text);
                }
                else {
                    selector.textContains(text);
                }
            }
            if (id) {
                selector.id(id);
            }
            if (className) {
                selector.className(className);
            }
            const node = await auto.findOne(selector);
            return {
                success: true,
                output: {
                    found: !!node,
                    node: node ? {
                        text: node.text,
                        id: node.id,
                        bounds: node.bounds,
                        clickable: node.clickable,
                        className: node.className,
                        description: node.contentDescription,
                    } : null,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'FIND_ONE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to find element',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Wait For Gone Tool
 * Wait for a UI element to disappear
 */
export const androidWaitForGoneTool = {
    name: 'android_wait_for_gone',
    description: 'Wait for a UI element to disappear from screen',
    category: 'android',
    permissions: ['android:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'text',
            description: 'Text to wait for disappearance (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'id',
            description: 'Resource ID to wait for disappearance (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'timeout',
            description: 'Wait timeout in milliseconds (default: 10000)',
            schema: z.number().int().min(0),
            required: false,
            default: 10000,
        },
    ],
    async execute(params, options) {
        try {
            const { text, id, timeout = 10000 } = params;
            if (!text && !id) {
                return { success: false, error: { code: 'INVALID_PARAMS', message: 'Either text or id must be provided' } };
            }
            logger.debug(`Android wait for gone: text="${text}" id="${id}" timeout=${timeout}`);
            const selector = auto.selector();
            if (text) {
                selector.textContains(text);
            }
            if (id) {
                selector.id(id);
            }
            const gone = await auto.waitForGoneWithTimeout(selector, timeout);
            return {
                success: true,
                output: { gone },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'WAIT_GONE_FAILED',
                    message: error instanceof Error ? error.message : 'Wait for gone failed',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Get Windows Tool
 */
export const androidGetWindowsTool = {
    name: 'android_get_windows',
    description: 'Get information about all accessibility windows currently on screen',
    category: 'android',
    permissions: ['android:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Getting windows');
            const windows = await auto.getWindows();
            return {
                success: true,
                output: { windows, count: windows.length },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'GET_WINDOWS_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get windows',
                    details: error,
                },
            };
        }
    },
};
/**
 * Helper function to traverse node tree and collect information
 */
function traverseNode(node, options = {}) {
    const { visibleOnly = false, interactiveOnly = false, maxDepth = 50, currentDepth = 0, includeChildren = true, } = options;
    // Extract node properties (direct property access, not method calls)
    const text = node.text ?? null;
    const id = node.id ?? null;
    const className = node.className ?? null;
    const contentDescription = node.contentDescription ?? null;
    const bounds = node.bounds ?? null;
    const isClickable = node.clickable ?? false;
    const isLongClickable = node.longClickable ?? false;
    const isScrollable = node.scrollable ?? false;
    const isEditable = node.editable ?? false;
    const isEnabled = node.enabled ?? false;
    const isVisible = node.visible ?? false;
    const childCount = node.children?.length ?? 0;
    // Apply filters
    if (visibleOnly && !isVisible) {
        return null;
    }
    if (interactiveOnly && !isClickable && !isScrollable && !isEditable) {
        return null;
    }
    // Build node info
    const nodeInfo = {
        text,
        id,
        className,
        contentDescription,
        bounds,
        isClickable,
        isLongClickable,
        isScrollable,
        isEditable,
        isEnabled,
        isVisible,
        depth: currentDepth,
    };
    // Recursively process children
    if (includeChildren && childCount > 0 && currentDepth < maxDepth) {
        const children = [];
        // node.children is already an array in auto.d.ts Node interface
        const nodeChildren = node.children || [];
        for (let i = 0; i < Math.min(nodeChildren.length, childCount); i++) {
            const child = nodeChildren[i];
            if (child) {
                const childInfo = traverseNode(child, {
                    ...options,
                    currentDepth: currentDepth + 1,
                });
                if (childInfo) {
                    children.push(childInfo);
                }
            }
        }
        if (children.length > 0) {
            nodeInfo.children = children;
        }
    }
    return nodeInfo;
}
/**
 * Helper function to flatten node tree into a list
 */
function flattenNodeTree(node, result = []) {
    if (node) {
        result.push(node);
        if (node.children) {
            for (const child of node.children) {
                flattenNodeTree(child, result);
            }
        }
    }
    return result;
}
/**
 * Android Get Layout Tree Tool
 * Gets the complete UI hierarchy tree of the current screen
 */
export const androidGetLayoutTool = {
    name: 'android_get_layout',
    description: 'Get the UI layout tree of the current screen. Returns hierarchical structure of all UI elements with their properties (text, id, className, bounds, clickable, etc.). Essential for understanding screen structure before performing actions.',
    category: 'android',
    permissions: ['android:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'visibleOnly',
            description: 'Only include visible elements (default: true)',
            schema: z.boolean(),
            required: false,
            default: true,
        },
        {
            name: 'interactiveOnly',
            description: 'Only include interactive elements (clickable/scrollable/editable) (default: false)',
            schema: z.boolean(),
            required: false,
            default: false,
        },
        {
            name: 'maxDepth',
            description: 'Maximum tree depth to traverse (default: 50)',
            schema: z.number().int().min(1).max(100),
            required: false,
            default: 50,
        },
        {
            name: 'format',
            description: 'Output format: tree (hierarchical) or flat (list) (default: tree)',
            schema: z.enum(['tree', 'flat']),
            required: false,
            default: 'tree',
        },
    ],
    async execute(params, options) {
        try {
            const { visibleOnly = true, interactiveOnly = false, maxDepth = 50, format = 'tree', } = params;
            logger.debug(`Getting layout tree (visibleOnly: ${visibleOnly}, interactiveOnly: ${interactiveOnly})`);
            // Get all nodes using an empty selector (matches everything)
            const selector = auto.selector();
            const allNodes = await auto.findAll(selector);
            if (!allNodes || allNodes.length === 0) {
                return {
                    success: true,
                    output: {
                        message: 'No UI elements found on screen',
                        tree: null,
                        count: 0,
                    },
                };
            }
            // Build tree from first node (usually the root)
            const rootNode = allNodes[0];
            const tree = traverseNode(rootNode, {
                visibleOnly,
                interactiveOnly,
                maxDepth,
                includeChildren: true,
            });
            if (!tree) {
                return {
                    success: true,
                    output: {
                        message: 'No matching elements found after filtering',
                        tree: null,
                        count: 0,
                    },
                };
            }
            // Convert to flat list if requested
            let output;
            if (format === 'flat') {
                const flatList = flattenNodeTree(tree);
                output = {
                    format: 'flat',
                    elements: flatList,
                    count: flatList.length,
                };
            }
            else {
                const flatList = flattenNodeTree(tree);
                output = {
                    format: 'tree',
                    tree,
                    count: flatList.length,
                };
            }
            return {
                success: true,
                output,
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'GET_LAYOUT_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get layout tree',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Find Interactive Elements Tool
 * Finds all interactive elements (clickable/scrollable/editable) on the current screen
 */
export const androidFindInteractiveElementsTool = {
    name: 'android_find_interactive_elements',
    description: 'Find all interactive UI elements on the screen (elements that are clickable, scrollable, or editable). Returns a simplified list perfect for agent decision-making. Use this to quickly discover what actions are available on the current screen.',
    category: 'android',
    permissions: ['android:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'visibleOnly',
            description: 'Only include visible elements (default: true)',
            schema: z.boolean(),
            required: false,
            default: true,
        },
        {
            name: 'includeText',
            description: 'Include elements with text only (default: false)',
            schema: z.boolean(),
            required: false,
            default: false,
        },
    ],
    async execute(params, options) {
        try {
            const { visibleOnly = true, includeText = false } = params;
            logger.debug('Finding interactive elements');
            // Get all nodes
            const selector = auto.selector();
            const allNodes = await auto.findAll(selector);
            if (!allNodes || allNodes.length === 0) {
                return {
                    success: true,
                    output: {
                        elements: [],
                        count: 0,
                        message: 'No elements found on screen',
                    },
                };
            }
            // Traverse and filter
            const rootNode = allNodes[0];
            const tree = traverseNode(rootNode, {
                visibleOnly,
                interactiveOnly: !includeText,
                maxDepth: 50,
                includeChildren: true,
            });
            if (!tree) {
                return {
                    success: true,
                    output: {
                        elements: [],
                        count: 0,
                        message: 'No interactive elements found',
                    },
                };
            }
            // Flatten and simplify
            const flatList = flattenNodeTree(tree);
            const elements = flatList.map((node, index) => ({
                index,
                text: node.text,
                id: node.id,
                className: node.className,
                contentDescription: node.contentDescription,
                bounds: node.bounds,
                isClickable: node.isClickable,
                isScrollable: node.isScrollable,
                isEditable: node.isEditable,
                depth: node.depth,
            }));
            // Group by type for easier navigation
            const clickable = elements.filter(e => e.isClickable);
            const scrollable = elements.filter(e => e.isScrollable);
            const editable = elements.filter(e => e.isEditable);
            return {
                success: true,
                output: {
                    elements,
                    count: elements.length,
                    summary: {
                        totalElements: elements.length,
                        clickableCount: clickable.length,
                        scrollableCount: scrollable.length,
                        editableCount: editable.length,
                    },
                    groupedByType: {
                        clickable: clickable.slice(0, 20), // Limit to first 20
                        scrollable: scrollable.slice(0, 10),
                        editable: editable.slice(0, 10),
                    },
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'FIND_INTERACTIVE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to find interactive elements',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Describe Screen Tool
 * Provides a high-level description of the current screen
 */
export const androidDescribeScreenTool = {
    name: 'android_describe_screen',
    description: 'Get a high-level description of the current screen including app info, interactive elements, and main content. Perfect for agent context understanding before taking actions.',
    category: 'android',
    permissions: ['android:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Describing current screen');
            // Get app context
            const [packageName, activity, windows] = await Promise.all([
                auto.getCurrentPackage(),
                auto.getCurrentActivity(),
                auto.getWindows(),
            ]);
            // Get interactive elements
            const selector = auto.selector();
            const allNodes = await auto.findAll(selector);
            let interactiveElements = [];
            let textElements = [];
            if (allNodes && allNodes.length > 0) {
                const rootNode = allNodes[0];
                const tree = traverseNode(rootNode, {
                    visibleOnly: true,
                    interactiveOnly: false,
                    maxDepth: 50,
                    includeChildren: true,
                });
                if (tree) {
                    const flatList = flattenNodeTree(tree);
                    interactiveElements = flatList
                        .filter(n => n.isClickable || n.isScrollable || n.isEditable)
                        .map(n => ({
                        text: n.text,
                        id: n.id,
                        className: n.className,
                        description: n.contentDescription,
                        isClickable: n.isClickable,
                        isScrollable: n.isScrollable,
                        isEditable: n.isEditable,
                    }))
                        .slice(0, 30); // Limit to top 30
                    textElements = flatList
                        .filter(n => n.text && n.text.length > 0)
                        .map(n => ({
                        text: n.text,
                        className: n.className,
                    }))
                        .slice(0, 20); // Limit to top 20
                }
            }
            return {
                success: true,
                output: {
                    app: {
                        packageName,
                        activity,
                    },
                    windows: {
                        count: windows.length,
                        active: windows.find((w) => w.isActive),
                    },
                    interactiveElements: {
                        count: interactiveElements.length,
                        elements: interactiveElements,
                    },
                    textContent: {
                        count: textElements.length,
                        elements: textElements,
                    },
                    summary: `Screen in ${packageName} (${activity}) with ${interactiveElements.length} interactive elements`,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'DESCRIBE_SCREEN_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to describe screen',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Click Element Tool
 * Find element and click it directly using node.click()
 */
export const androidClickElementTool = {
    name: 'android_click_element',
    description: 'Find a UI element and click it using the element\'s native click method. More reliable than coordinate-based clicking.',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'text',
            description: 'Text to search for (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'id',
            description: 'Resource ID (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'className',
            description: 'Class name (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'exact',
            description: 'Match exact text (default: false)',
            schema: z.boolean(),
            required: false,
            default: false,
        },
        {
            name: 'timeout',
            description: 'Wait timeout in milliseconds (default: 5000)',
            schema: z.number().int().min(0),
            required: false,
            default: 5000,
        },
    ],
    async execute(params, options) {
        try {
            const { text, id, className, exact = false, timeout = 5000 } = params;
            if (!text && !id && !className) {
                return { success: false, error: { code: 'INVALID_PARAMS', message: 'At least one of text, id, or className must be provided' } };
            }
            logger.debug(`Android click element: text="${text}" id="${id}" className="${className}"`);
            // Create selector
            const selector = auto.selector();
            if (text) {
                if (exact) {
                    selector.text(text);
                }
                else {
                    selector.textContains(text);
                }
            }
            if (id) {
                selector.id(id);
            }
            if (className) {
                selector.className(className);
            }
            // Find element with timeout
            const node = timeout > 0 ? await auto.waitFor(selector, timeout) : await auto.findOne(selector);
            if (!node) {
                return {
                    success: false,
                    error: {
                        code: 'ELEMENT_NOT_FOUND',
                        message: `Element not found: text="${text}" id="${id}" className="${className}"`,
                    },
                };
            }
            // Check if clickable
            const isClickable = node.clickable ?? false;
            if (!isClickable) {
                logger.warn(`Element is not clickable, attempting click anyway`);
            }
            // Click using node's method
            const clicked = await node.click();
            return {
                success: clicked,
                output: {
                    action: 'click_element',
                    clicked,
                    element: {
                        text: node.text,
                        id: node.id,
                        className: node.className,
                        clickable: isClickable,
                    },
                    message: clicked ? 'Element clicked successfully' : 'Click failed',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'CLICK_ELEMENT_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to click element',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Long Click Element Tool
 */
export const androidLongClickElementTool = {
    name: 'android_long_click_element',
    description: 'Find a UI element and long click it using the element\'s native longClick method',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'text',
            description: 'Text to search for (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'id',
            description: 'Resource ID (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'className',
            description: 'Class name (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'exact',
            description: 'Match exact text (default: false)',
            schema: z.boolean(),
            required: false,
            default: false,
        },
        {
            name: 'timeout',
            description: 'Wait timeout in milliseconds (default: 5000)',
            schema: z.number().int().min(0),
            required: false,
            default: 5000,
        },
    ],
    async execute(params, options) {
        try {
            const { text, id, className, exact = false, timeout = 5000 } = params;
            if (!text && !id && !className) {
                return { success: false, error: { code: 'INVALID_PARAMS', message: 'At least one of text, id, or className must be provided' } };
            }
            logger.debug(`Android long click element: text="${text}" id="${id}" className="${className}"`);
            const selector = auto.selector();
            if (text) {
                if (exact) {
                    selector.text(text);
                }
                else {
                    selector.textContains(text);
                }
            }
            if (id) {
                selector.id(id);
            }
            if (className) {
                selector.className(className);
            }
            const node = timeout > 0 ? await auto.waitFor(selector, timeout) : await auto.findOne(selector);
            if (!node) {
                return {
                    success: false,
                    error: { code: 'ELEMENT_NOT_FOUND', message: `Element not found` },
                };
            }
            const isLongClickable = node.longClickable ?? false;
            const clicked = await node.longClick();
            return {
                success: clicked,
                output: {
                    action: 'long_click_element',
                    clicked,
                    element: {
                        text: node.text,
                        id: node.id,
                        longClickable: isLongClickable,
                    },
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'LONG_CLICK_ELEMENT_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to long click element',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Input Text to Element Tool
 */
export const androidInputTextToElementTool = {
    name: 'android_input_text_to_element',
    description: 'Find a UI element and input text to it using the element\'s native setText method',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'text',
            description: 'Text to search for the element (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'id',
            description: 'Resource ID (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'className',
            description: 'Class name (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'inputText',
            description: 'Text to input into the element',
            schema: z.string(),
            required: true,
        },
        {
            name: 'clearFirst',
            description: 'Clear existing text before input (default: true)',
            schema: z.boolean(),
            required: false,
            default: true,
        },
        {
            name: 'timeout',
            description: 'Wait timeout in milliseconds (default: 5000)',
            schema: z.number().int().min(0),
            required: false,
            default: 5000,
        },
    ],
    async execute(params, options) {
        try {
            const { text, id, className, inputText, clearFirst = true, timeout = 5000 } = params;
            if (!text && !id && !className) {
                return { success: false, error: { code: 'INVALID_PARAMS', message: 'At least one of text, id, or className must be provided' } };
            }
            logger.debug(`Android input text to element: "${inputText}"`);
            const selector = auto.selector();
            if (text) {
                selector.textContains(text);
            }
            if (id) {
                selector.id(id);
            }
            if (className) {
                selector.className(className);
            }
            const node = timeout > 0 ? await auto.waitFor(selector, timeout) : await auto.findOne(selector);
            if (!node) {
                return {
                    success: false,
                    error: { code: 'ELEMENT_NOT_FOUND', message: `Element not found` },
                };
            }
            const isEditable = node.editable ?? false;
            if (!isEditable) {
                return {
                    success: false,
                    error: { code: 'NOT_EDITABLE', message: 'Element is not editable' },
                };
            }
            let success;
            if (clearFirst) {
                success = await node.setText(inputText);
            }
            else {
                success = await node.appendText(inputText);
            }
            return {
                success,
                output: {
                    action: 'input_text_to_element',
                    success,
                    inputText,
                    clearFirst,
                    element: {
                        text: node.text,
                        id: node.id,
                        editable: isEditable,
                    },
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'INPUT_TEXT_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to input text to element',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Scroll Element Tool
 */
export const androidScrollElementTool = {
    name: 'android_scroll_element',
    description: 'Find a scrollable UI element and scroll it using the element\'s native scroll methods',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'text',
            description: 'Text to search for (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'id',
            description: 'Resource ID (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'className',
            description: 'Class name (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'direction',
            description: 'Scroll direction: forward or backward',
            schema: z.enum(['forward', 'backward']),
            required: false,
            default: 'forward',
        },
        {
            name: 'timeout',
            description: 'Wait timeout in milliseconds (default: 5000)',
            schema: z.number().int().min(0),
            required: false,
            default: 5000,
        },
    ],
    async execute(params, options) {
        try {
            const { text, id, className, direction = 'forward', timeout = 5000 } = params;
            if (!text && !id && !className) {
                return { success: false, error: { code: 'INVALID_PARAMS', message: 'At least one of text, id, or className must be provided' } };
            }
            logger.debug(`Android scroll element ${direction}`);
            const selector = auto.selector();
            if (text) {
                selector.textContains(text);
            }
            if (id) {
                selector.id(id);
            }
            if (className) {
                selector.className(className);
            }
            const node = timeout > 0 ? await auto.waitFor(selector, timeout) : await auto.findOne(selector);
            if (!node) {
                return {
                    success: false,
                    error: { code: 'ELEMENT_NOT_FOUND', message: `Element not found` },
                };
            }
            const isScrollable = node.scrollable ?? false;
            if (!isScrollable) {
                logger.warn('Element is not scrollable, attempting scroll anyway');
            }
            const scrolled = direction === 'forward'
                ? await node.scrollForward()
                : await node.scrollBackward();
            return {
                success: scrolled,
                output: {
                    action: 'scroll_element',
                    scrolled,
                    direction,
                    element: {
                        text: node.text,
                        id: node.id,
                        scrollable: isScrollable,
                    },
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'SCROLL_ELEMENT_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to scroll element',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Expand Element Tool
 */
export const androidExpandElementTool = {
    name: 'android_expand_element',
    description: 'Find a UI element and expand it (e.g., expand a collapsible section)',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'text',
            description: 'Text to search for (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'id',
            description: 'Resource ID (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'className',
            description: 'Class name (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'timeout',
            description: 'Wait timeout in milliseconds (default: 5000)',
            schema: z.number().int().min(0),
            required: false,
            default: 5000,
        },
    ],
    async execute(params, options) {
        try {
            const { text, id, className, timeout = 5000 } = params;
            if (!text && !id && !className) {
                return { success: false, error: { code: 'INVALID_PARAMS', message: 'At least one of text, id, or className must be provided' } };
            }
            logger.debug(`Android expand element`);
            const selector = auto.selector();
            if (text) {
                selector.textContains(text);
            }
            if (id) {
                selector.id(id);
            }
            if (className) {
                selector.className(className);
            }
            const node = timeout > 0 ? await auto.waitFor(selector, timeout) : await auto.findOne(selector);
            if (!node) {
                return {
                    success: false,
                    error: { code: 'ELEMENT_NOT_FOUND', message: `Element not found` },
                };
            }
            const expanded = await node.expand();
            return {
                success: expanded,
                output: {
                    action: 'expand_element',
                    expanded,
                    element: {
                        text: node.text,
                        id: node.id,
                    },
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'EXPAND_ELEMENT_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to expand element',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Collapse Element Tool
 */
export const androidCollapseElementTool = {
    name: 'android_collapse_element',
    description: 'Find a UI element and collapse it (e.g., collapse an expanded section)',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'text',
            description: 'Text to search for (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'id',
            description: 'Resource ID (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'className',
            description: 'Class name (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'timeout',
            description: 'Wait timeout in milliseconds (default: 5000)',
            schema: z.number().int().min(0),
            required: false,
            default: 5000,
        },
    ],
    async execute(params, options) {
        try {
            const { text, id, className, timeout = 5000 } = params;
            if (!text && !id && !className) {
                return { success: false, error: { code: 'INVALID_PARAMS', message: 'At least one of text, id, or className must be provided' } };
            }
            logger.debug(`Android collapse element`);
            const selector = auto.selector();
            if (text) {
                selector.textContains(text);
            }
            if (id) {
                selector.id(id);
            }
            if (className) {
                selector.className(className);
            }
            const node = timeout > 0 ? await auto.waitFor(selector, timeout) : await auto.findOne(selector);
            if (!node) {
                return {
                    success: false,
                    error: { code: 'ELEMENT_NOT_FOUND', message: `Element not found` },
                };
            }
            const collapsed = await node.collapse();
            return {
                success: collapsed,
                output: {
                    action: 'collapse_element',
                    collapsed,
                    element: {
                        text: node.text,
                        id: node.id,
                    },
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'COLLAPSE_ELEMENT_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to collapse element',
                    details: error,
                },
            };
        }
    },
};
/**
 * Android Focus Element Tool
 */
export const androidFocusElementTool = {
    name: 'android_focus_element',
    description: 'Find a UI element and set focus on it',
    category: 'android',
    permissions: ['android:interact'],
    parallelizable: false,
    parameters: [
        {
            name: 'text',
            description: 'Text to search for (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'id',
            description: 'Resource ID (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'className',
            description: 'Class name (optional)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'timeout',
            description: 'Wait timeout in milliseconds (default: 5000)',
            schema: z.number().int().min(0),
            required: false,
            default: 5000,
        },
    ],
    async execute(params, options) {
        try {
            const { text, id, className, timeout = 5000 } = params;
            if (!text && !id && !className) {
                return { success: false, error: { code: 'INVALID_PARAMS', message: 'At least one of text, id, or className must be provided' } };
            }
            logger.debug(`Android focus element`);
            const selector = auto.selector();
            if (text) {
                selector.textContains(text);
            }
            if (id) {
                selector.id(id);
            }
            if (className) {
                selector.className(className);
            }
            const node = timeout > 0 ? await auto.waitFor(selector, timeout) : await auto.findOne(selector);
            if (!node) {
                return {
                    success: false,
                    error: { code: 'ELEMENT_NOT_FOUND', message: `Element not found` },
                };
            }
            const focused = await node.focus();
            return {
                success: focused,
                output: {
                    action: 'focus_element',
                    focused,
                    element: {
                        text: node.text,
                        id: node.id,
                    },
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'FOCUS_ELEMENT_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to focus element',
                    details: error,
                },
            };
        }
    },
};
/**
 * All Android tools
 */
export const androidTools = [
    // ========== LAYOUT ANALYSIS & DISCOVERY ==========
    // Use these first to understand what's on the screen
    androidDescribeScreenTool, // High-level screen description
    androidGetLayoutTool, // Full UI hierarchy tree
    androidFindInteractiveElementsTool, // All clickable/scrollable/editable elements
    // ========== ELEMENT-BASED OPERATIONS (PREFERRED) ==========
    // These find elements and use their native methods - more reliable
    androidClickElementTool,
    androidLongClickElementTool,
    androidInputTextToElementTool,
    androidScrollElementTool,
    androidExpandElementTool,
    androidCollapseElementTool,
    androidFocusElementTool,
    // ========== ELEMENT FINDING & QUERYING ==========
    androidFindTextTool,
    androidFindByIdTool,
    androidFindOneTool,
    androidExistsTool,
    androidWaitForTool,
    androidWaitForGoneTool,
    // ========== COORDINATE-BASED GESTURES (LEGACY) ==========
    // Use only when element-based tools fail or for custom gestures
    androidClickTool,
    androidLongClickTool,
    androidPressTool,
    androidSwipeTool,
    androidGestureTool,
    androidGesturesTool,
    // ========== GLOBAL TEXT INPUT ==========
    // Works on currently focused element
    androidInputTextTool,
    androidAppendTextTool,
    // ========== SCREENSHOT ==========
    androidRequestScreenCaptureTool,
    androidScreenshotTool,
    // ========== NAVIGATION BUTTONS ==========
    androidBackTool,
    androidHomeTool,
    androidRecentsTool,
    androidNotificationsTool,
    androidQuickSettingsTool,
    // ========== GLOBAL SCROLLING ==========
    // Use androidScrollElementTool when you have a specific scrollable element
    androidScrollTool,
    androidScrollToTool,
    // ========== SYSTEM STATE ==========
    androidCheckAccessibilityTool,
    androidGetCurrentPackageTool,
    androidGetCurrentActivityTool,
    androidScreenStateTool,
    androidGetWindowsTool,
];
