/**
 * Android Automation Tools
 *
 * Built-in tools for Android UI automation using Anode AutomatorAPI and ImageAPI
 * Based on anode-api.d.ts definitions
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
 */
export const androidFindTextTool = {
    name: 'android_find_text',
    description: 'Find UI elements containing specific text on the screen',
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
    ],
    async execute(params, options) {
        try {
            const { text, exact = false, timeout = 0 } = params;
            logger.debug(`Android find text: "${text}" (exact: ${exact})`);
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
                nodes = await auto.findAll(selector);
            }
            return {
                success: true,
                output: {
                    found: nodes.length > 0,
                    count: nodes.length,
                    nodes: nodes.map((node) => ({
                        text: node.text?.() || text,
                        bounds: node.bounds?.(),
                        clickable: node.clickable?.(),
                        id: node.id?.(),
                        className: node.className?.(),
                    })),
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
                        id: node.id?.() || id,
                        text: node.text?.(),
                        bounds: node.bounds?.(),
                        clickable: node.clickable?.(),
                        className: node.className?.(),
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
                        text: node.text?.(),
                        id: node.id?.(),
                        bounds: node.bounds?.(),
                        clickable: node.clickable?.(),
                        className: node.className?.(),
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
                        text: node.text?.(),
                        id: node.id?.(),
                        bounds: node.bounds?.(),
                        clickable: node.clickable?.(),
                        className: node.className?.(),
                        description: node.contentDescription?.(),
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
 * All Android tools
 */
export const androidTools = [
    androidClickTool,
    androidLongClickTool,
    androidPressTool,
    androidSwipeTool,
    androidGestureTool,
    androidGesturesTool,
    androidFindTextTool,
    androidFindByIdTool,
    androidFindOneTool,
    androidExistsTool,
    androidInputTextTool,
    androidAppendTextTool,
    androidRequestScreenCaptureTool,
    androidScreenshotTool,
    androidBackTool,
    androidHomeTool,
    androidRecentsTool,
    androidNotificationsTool,
    androidQuickSettingsTool,
    androidScrollTool,
    androidScrollToTool,
    androidWaitForTool,
    androidWaitForGoneTool,
    androidCheckAccessibilityTool,
    androidGetCurrentPackageTool,
    androidGetCurrentActivityTool,
    androidScreenStateTool,
    androidGetWindowsTool,
];
