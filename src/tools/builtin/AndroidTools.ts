/**
 * Android Automation Tools
 *
 * Built-in tools for Android UI automation using Anode AutomatorAPI and ImageAPI
 * Based on anode-api.d.ts definitions
 */

import { z } from 'zod';
import type { Tool, ToolResult, ToolExecutionOptions } from '../types.js';
import { logger } from '../../utils/logger.js';

// Anode AutomatorAPI global (based on AutomatorAPI.kt @V8Function annotations)
declare const auto: {
  // Status check
  isEnabled(): Promise<boolean>;

  // Basic gestures - Kotlin: click(x: Int, y: Int)
  click(x: number, y: number): Promise<boolean>;
  longClick(x: number, y: number): Promise<boolean>;
  // Kotlin: press(x: Int, y: Int, duration: Long)
  press(x: number, y: number, duration: number): Promise<boolean>;
  // Kotlin: swipe(x1: Int, y1: Int, x2: Int, y2: Int, duration: Int)
  swipe(x1: number, y1: number, x2: number, y2: number, duration: number): Promise<boolean>;

  // Advanced gestures - Kotlin: gesture(duration: Long, points: Any)
  gesture(duration: number, points: Array<{ x: number, y: number }> | Array<[number, number]>): Promise<boolean>;
  // Kotlin: gestures(strokes: Any)
  gestures(strokes: Array<{ duration: number, points: Array<{ x: number, y: number }> }>): Promise<boolean>;
  // Kotlin: multiTouch(touches: Any)
  multiTouch(touches: Array<{ duration: number, points: Array<{ x: number, y: number }> }>): Promise<boolean>;

  // Selector & Node finding - Kotlin: selector(): AccessibilitySelector
  selector(): any;  // Returns AccessibilitySelector with chainable methods
  // Kotlin: findOne(selector: AccessibilitySelector)
  findOne(selector: any): Promise<any>;  // Returns AccessibilityNode or null
  // Kotlin: asyncFindOne(selector: AccessibilitySelector, timeout: Long = 10000)
  asyncFindOne(selector: any, timeout?: number): Promise<any>;
  // Kotlin: findAll(selector: AccessibilitySelector)
  findAll(selector: any): Promise<any[]>;  // Returns List<AccessibilityNode>
  // Kotlin: exists(selector: AccessibilitySelector)
  exists(selector: any): Promise<boolean>;
  // Kotlin: waitFor(selector: AccessibilitySelector, timeout: Long = 10000)
  waitFor(selector: any, timeout?: number): Promise<any>;

  // Global actions
  back(): Promise<boolean>;
  home(): Promise<boolean>;
  recents(): Promise<boolean>;
  notifications(): Promise<boolean>;
  quickSettings(): Promise<boolean>;

  // Text operations - Kotlin: setText(text: String)
  setText(text: string): Promise<boolean>;
  appendText(text: string): Promise<boolean>;
  clearText(): Promise<boolean>;

  // Scroll operations
  scrollForward(): Promise<boolean>;
  scrollBackward(): Promise<boolean>;
  // Kotlin: scrollTo(direction: Int, percent: Float)
  scrollTo(direction: number, percent: number): Promise<boolean>;

  // State queries
  getCurrentPackage(): Promise<string | null>;
  getCurrentActivity(): Promise<string | null>;
  isScreenOn(): Promise<boolean>;
  isScreenLocked(): Promise<boolean>;

  // Search strategy - Kotlin: setSearchStrategy(strategy: Int), getSearchStrategy()
  setSearchStrategy(strategy: number): Promise<boolean>;
  getSearchStrategy(): Promise<number>;

  // Window filtering
  setWindowFilter(filter: (window: any) => boolean): Promise<boolean>;
  filterWindowByPackage(packageName: string): Promise<boolean>;
  filterWindowByTitle(title: string): Promise<boolean>;
  filterWindowByType(type: number): Promise<boolean>;
  clearWindowFilter(): Promise<boolean>;
  getWindows(): Promise<Array<{
    title: string | null;
    packageName: string | null;
    type: number;
    isActive: boolean;
    isAccessibilityFocused: boolean;
    isFocused: boolean;
  }>>;

  // Constants (from companion object @V8Property)
  SEARCH_STRATEGY_BFS: number;
  SEARCH_STRATEGY_DFS: number;
  SEARCH_STRATEGY_HEURISTIC: number;
  SEARCH_STRATEGY_PRIORITY: number;
  SCROLL_UP: number;
  SCROLL_DOWN: number;
  SCROLL_LEFT: number;
  SCROLL_RIGHT: number;
};

// Anode ImageAPI global (based on anode-api.d.ts)
declare const image: {
  captureScreen(): Promise<any>;  // Returns Bitmap
  captureScreenWithAccessibility(displayId?: number, timeoutMs?: number): Promise<any>;
  isAccessibilityScreenshotSupported(): Promise<boolean>;
  saveImage(bitmap: any, path: string, format?: string, quality?: number): Promise<boolean>;
  toBase64(bitmap: any, format?: string, quality?: number): Promise<string>;
  loadImage(path: string): Promise<any>;
  findImage(source: any, template: any, threshold?: number, region?: any, method?: string): Promise<any>;
  findColor(bitmap: any, color: string, threshold?: number, region?: any, method?: string): Promise<any>;
  requestScreenCapturePermission(): Promise<any>;
};

// Anode FileAPI global
declare const file: {
  createDirectory(path: string): Promise<any>;
};

/**
 * Android Click Tool
 */
export const androidClickTool: Tool = {
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

  async execute(params, options): Promise<ToolResult> {
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
    } catch (error) {
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
export const androidLongClickTool: Tool = {
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

  async execute(params, options): Promise<ToolResult> {
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
    } catch (error) {
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
export const androidSwipeTool: Tool = {
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

  async execute(params, options): Promise<ToolResult> {
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
    } catch (error) {
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
export const androidFindTextTool: Tool = {
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

  async execute(params, options): Promise<ToolResult> {
    try {
      const { text, exact = false, timeout = 0 } = params;

      logger.debug(`Android find text: "${text}" (exact: ${exact})`);

      // Create selector with text matching
      const selector = auto.selector();
      if (exact) {
        selector.text(text);
      } else {
        selector.textContains(text);
      }

      // If timeout, use waitFor, otherwise use findAll
      let nodes: any[];
      if (timeout > 0) {
        const node = await auto.waitFor(selector, timeout);
        nodes = node ? [node] : [];
      } else {
        nodes = await auto.findAll(selector);
      }

      return {
        success: true,
        output: {
          found: nodes.length > 0,
          count: nodes.length,
          nodes: nodes.map((node: any) => ({
            text: node.text?.() || text,
            bounds: node.bounds?.(),
            clickable: node.clickable?.(),
            id: node.id?.(),
            className: node.className?.(),
          })),
        },
      };
    } catch (error) {
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
export const androidInputTextTool: Tool = {
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

  async execute(params, options): Promise<ToolResult> {
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
    } catch (error) {
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
export const androidRequestScreenCaptureTool: Tool = {
  name: 'android_request_screen_capture',
  description: 'Request screen capture permission. MUST be called BEFORE android_screenshot (unless using useAccessibility=true). This shows a system dialog asking user to grant permission.',
  category: 'android',
  permissions: ['android:permission'],
  parallelizable: false,

  parameters: [],

  async execute(params, options): Promise<ToolResult> {
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
    } catch (error) {
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
export const androidScreenshotTool: Tool = {
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

  async execute(params, options): Promise<ToolResult> {
    try {
      const { path, format = 'png', quality = 90, useAccessibility = false } = params;

      logger.debug(`Android screenshot (format: ${format}, path: ${path || 'base64'})`);

      // Capture screenshot
      let bitmap: any;
      if (useAccessibility) {
        // Accessibility mode doesn't need permission
        bitmap = await image.captureScreenWithAccessibility();
      } else {
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
          } catch (e) {
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
        };
      } else {
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
    } catch (error) {
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
export const androidFindByIdTool: Tool = {
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

  async execute(params, options): Promise<ToolResult> {
    try {
      const { id, timeout = 0 } = params;

      logger.debug(`Android find by ID: ${id}`);

      // Create selector with ID
      const selector = auto.selector();
      selector.id(id);

      // If timeout, use waitFor, otherwise use findAll
      let nodes: any[];
      if (timeout > 0) {
        const node = await auto.waitFor(selector, timeout);
        nodes = node ? [node] : [];
      } else {
        nodes = await auto.findAll(selector);
      }

      return {
        success: true,
        output: {
          found: nodes.length > 0,
          count: nodes.length,
          nodes: nodes.map((node: any) => ({
            id: node.id?.() || id,
            text: node.text?.(),
            bounds: node.bounds?.(),
            clickable: node.clickable?.(),
            className: node.className?.(),
          })),
        },
      };
    } catch (error) {
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
export const androidBackTool: Tool = {
  name: 'android_back',
  description: 'Press the Android back button',
  category: 'android',
  permissions: ['android:interact'],
  parallelizable: false,

  parameters: [],

  async execute(params, options): Promise<ToolResult> {
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
    } catch (error) {
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
export const androidHomeTool: Tool = {
  name: 'android_home',
  description: 'Press the Android home button',
  category: 'android',
  permissions: ['android:interact'],
  parallelizable: false,

  parameters: [],

  async execute(params, options): Promise<ToolResult> {
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
    } catch (error) {
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
export const androidRecentsTool: Tool = {
  name: 'android_recents',
  description: 'Press the Android recents/multitask button',
  category: 'android',
  permissions: ['android:interact'],
  parallelizable: false,

  parameters: [],

  async execute(params, options): Promise<ToolResult> {
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
    } catch (error) {
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
export const androidNotificationsTool: Tool = {
  name: 'android_notifications',
  description: 'Open the Android notification panel',
  category: 'android',
  permissions: ['android:interact'],
  parallelizable: false,

  parameters: [],

  async execute(params, options): Promise<ToolResult> {
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
    } catch (error) {
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
export const androidScrollTool: Tool = {
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

  async execute(params, options): Promise<ToolResult> {
    try {
      const { direction = 'forward' } = params;

      logger.debug(`Android scroll ${direction}`);

      if (direction === 'forward') {
        await auto.scrollForward();
      } else {
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
    } catch (error) {
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
export const androidWaitForTool: Tool = {
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

  async execute(params, options): Promise<ToolResult> {
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
    } catch (error) {
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
export const androidCheckAccessibilityTool: Tool = {
  name: 'android_check_accessibility',
  description: 'Check if accessibility service is enabled',
  category: 'android',
  permissions: ['android:read'],
  parallelizable: true,

  parameters: [],

  async execute(params, options): Promise<ToolResult> {
    try {
      logger.debug('Checking accessibility service');

      const isEnabled = await auto.isEnabled();

      return {
        success: true,
        output: {
          accessibilityEnabled: isEnabled,
        },
      };
    } catch (error) {
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
 * All Android tools
 */
export const androidTools: Tool[] = [
  androidClickTool,
  androidLongClickTool,
  androidSwipeTool,
  androidFindTextTool,
  androidInputTextTool,
  androidRequestScreenCaptureTool,
  androidScreenshotTool,
  androidFindByIdTool,
  androidBackTool,
  androidHomeTool,
  androidRecentsTool,
  androidNotificationsTool,
  androidScrollTool,
  androidWaitForTool,
  androidCheckAccessibilityTool,
];
