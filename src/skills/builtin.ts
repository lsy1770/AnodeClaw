/**
 * Built-in Skills
 *
 * Pre-defined automation workflows for common tasks.
 */

import type { Skill, SkillContext } from './types.js';

/**
 * App Launch and Interact Skill
 * Opens an app and optionally performs initial interactions.
 */
export const appLaunchSkill: Skill = {
  id: 'app-launch',
  name: 'Launch App',
  description: 'Launch an Android app by package name and wait for it to load',
  category: 'android',
  tags: ['app', 'launch', 'open'],
  requiredTools: ['get_current_app'],
  parameters: [
    {
      name: 'packageName',
      description: 'Android package name (e.g., com.whatsapp)',
      type: 'string',
      required: true,
    },
    {
      name: 'waitMs',
      description: 'Wait time after launch in milliseconds',
      type: 'number',
      required: false,
      default: 2000,
    },
  ],
  steps: [
    {
      name: 'launch',
      handler: async (ctx: SkillContext) => {
        // Use global app API to launch
        const app = (globalThis as any).app;
        if (app && app.launch) {
          await app.launch(ctx.params.packageName);
        } else {
          throw new Error('App launch API not available');
        }
        return { launched: ctx.params.packageName };
      },
      critical: true,
    },
    {
      name: 'wait',
      handler: async (ctx: SkillContext) => {
        await new Promise(resolve => setTimeout(resolve, ctx.params.waitMs || 2000));
        return { waited: true };
      },
    },
    {
      name: 'verify',
      tool: 'get_current_app',
      params: {},
      critical: false,
    },
  ],
};

/**
 * Screenshot and Analyze Skill
 * Takes a screenshot and returns analysis context.
 */
export const screenshotAnalyzeSkill: Skill = {
  id: 'screenshot-analyze',
  name: 'Screenshot & Analyze',
  description: 'Take a screenshot and gather current UI information',
  category: 'android',
  tags: ['screenshot', 'analyze', 'ui'],
  requiredTools: ['android_screenshot', 'get_current_app'],
  parameters: [
    {
      name: 'savePath',
      description: 'Path to save the screenshot',
      type: 'string',
      required: false,
      default: './anode-screenshot.png',
    },
  ],
  steps: [
    {
      name: 'screenshot',
      tool: 'android_screenshot',
      params: {
        path: '${params.savePath}',
        format: 'png',
      },
      critical: true,
    },
    {
      name: 'appInfo',
      tool: 'get_current_app',
      params: {},
      critical: false,
    },
    {
      name: 'deviceInfo',
      tool: 'get_device_info',
      params: {},
      critical: false,
    },
    {
      name: 'combine',
      handler: async (ctx: SkillContext) => {
        return {
          screenshot: ctx.results['screenshot'],
          currentApp: ctx.results['appInfo'],
          device: ctx.results['deviceInfo'],
        };
      },
    },
  ],
};

/**
 * Find and Click Skill
 * Finds a UI element by text and clicks on it.
 */
export const findAndClickSkill: Skill = {
  id: 'find-and-click',
  name: 'Find & Click',
  description: 'Find a UI element by text and click on it',
  category: 'android',
  tags: ['find', 'click', 'ui', 'automation'],
  requiredTools: ['android_find_text', 'android_click'],
  parameters: [
    {
      name: 'text',
      description: 'Text to find on screen',
      type: 'string',
      required: true,
    },
    {
      name: 'exact',
      description: 'Whether to match text exactly',
      type: 'boolean',
      required: false,
      default: false,
    },
    {
      name: 'index',
      description: 'Which match to click (0-based, if multiple)',
      type: 'number',
      required: false,
      default: 0,
    },
  ],
  steps: [
    {
      name: 'find',
      tool: 'android_find_text',
      params: {
        text: '${params.text}',
        exact: '${params.exact}',
      },
      critical: true,
    },
    {
      name: 'click',
      handler: async (ctx: SkillContext) => {
        const findResult = ctx.results['find'];
        if (!findResult || !findResult.found || !findResult.nodes?.length) {
          throw new Error(`Text "${ctx.params.text}" not found on screen`);
        }

        const index = ctx.params.index || 0;
        const node = findResult.nodes[index];
        if (!node) {
          throw new Error(`Match index ${index} not found (only ${findResult.nodes.length} matches)`);
        }

        // Calculate center of bounds
        const bounds = node.bounds;
        const x = Math.round((bounds.left + bounds.right) / 2);
        const y = Math.round((bounds.top + bounds.bottom) / 2);

        // Use global auto API
        const auto = (globalThis as any).auto;
        if (auto && auto.click) {
          await auto.click(x, y);
        } else {
          throw new Error('AutomatorAPI not available');
        }

        return { clicked: true, x, y, text: node.text };
      },
      critical: true,
    },
  ],
};

/**
 * File Read & Process Skill
 * Reads a file and processes its content.
 */
export const fileProcessSkill: Skill = {
  id: 'file-process',
  name: 'Read & Process File',
  description: 'Read a file and return its contents with metadata',
  category: 'file',
  tags: ['file', 'read', 'process'],
  requiredTools: ['file_exists', 'read_file'],
  parameters: [
    {
      name: 'path',
      description: 'Path to the file',
      type: 'string',
      required: true,
    },
  ],
  steps: [
    {
      name: 'check',
      tool: 'file_exists',
      params: { path: '${params.path}' },
      critical: true,
    },
    {
      name: 'validateExists',
      handler: async (ctx: SkillContext) => {
        const checkResult = ctx.results['check'];
        if (!checkResult?.exists) {
          throw new Error(`File not found: ${ctx.params.path}`);
        }
        return { exists: true };
      },
      critical: true,
    },
    {
      name: 'read',
      tool: 'read_file',
      params: {
        path: '${params.path}',
        encoding: 'utf-8',
      },
      critical: true,
    },
    {
      name: 'analyze',
      handler: async (ctx: SkillContext) => {
        const content = ctx.results['read']?.content || '';
        const lines = content.split('\n');
        return {
          content,
          path: ctx.params.path,
          size: content.length,
          lines: lines.length,
          isEmpty: content.trim().length === 0,
        };
      },
    },
  ],
};

/**
 * HTTP Fetch & Save Skill
 * Fetches data from a URL and optionally saves to a file.
 */
export const httpFetchSaveSkill: Skill = {
  id: 'http-fetch-save',
  name: 'HTTP Fetch & Save',
  description: 'Fetch data from a URL via HTTP and optionally save to a file',
  category: 'network',
  tags: ['http', 'fetch', 'download', 'save'],
  requiredTools: ['http_request'],
  parameters: [
    {
      name: 'url',
      description: 'URL to fetch',
      type: 'string',
      required: true,
    },
    {
      name: 'method',
      description: 'HTTP method',
      type: 'string',
      required: false,
      default: 'GET',
      enum: ['GET', 'POST', 'PUT', 'DELETE'],
    },
    {
      name: 'savePath',
      description: 'Path to save response body (optional)',
      type: 'string',
      required: false,
    },
  ],
  steps: [
    {
      name: 'fetch',
      tool: 'http_request',
      params: {
        url: '${params.url}',
        method: '${params.method}',
      },
      critical: true,
    },
    {
      name: 'save',
      condition: (ctx: SkillContext) => !!ctx.params.savePath,
      tool: 'write_file',
      params: {
        path: '${params.savePath}',
        content: '${fetch.data}',
      },
      critical: false,
    },
  ],
};

/**
 * Swipe Navigation Skill
 * Perform common navigation gestures.
 */
export const swipeNavigationSkill: Skill = {
  id: 'swipe-navigate',
  name: 'Swipe Navigation',
  description: 'Perform common swipe gestures (scroll up/down/left/right)',
  category: 'android',
  tags: ['swipe', 'scroll', 'navigate', 'gesture'],
  requiredTools: ['android_swipe'],
  parameters: [
    {
      name: 'direction',
      description: 'Swipe direction',
      type: 'string',
      required: true,
      enum: ['up', 'down', 'left', 'right'],
    },
    {
      name: 'distance',
      description: 'Swipe distance ratio (0-1, default 0.5)',
      type: 'number',
      required: false,
      default: 0.5,
    },
    {
      name: 'duration',
      description: 'Swipe duration in ms',
      type: 'number',
      required: false,
      default: 300,
    },
  ],
  steps: [
    {
      name: 'getScreen',
      tool: 'get_device_info',
      params: {},
      critical: true,
    },
    {
      name: 'swipe',
      handler: async (ctx: SkillContext) => {
        const screenInfo = ctx.results['getScreen'];
        const width = screenInfo?.screenWidth || 1080;
        const height = screenInfo?.screenHeight || 1920;
        const distance = ctx.params.distance || 0.5;
        const duration = ctx.params.duration || 300;
        const direction = ctx.params.direction;

        const centerX = Math.round(width / 2);
        const centerY = Math.round(height / 2);
        const swipeLength = Math.round(Math.min(width, height) * distance);

        let startX: number, startY: number, endX: number, endY: number;

        switch (direction) {
          case 'up': // scroll content up (finger moves up)
            startX = centerX; startY = centerY + swipeLength / 2;
            endX = centerX; endY = centerY - swipeLength / 2;
            break;
          case 'down': // scroll content down (finger moves down)
            startX = centerX; startY = centerY - swipeLength / 2;
            endX = centerX; endY = centerY + swipeLength / 2;
            break;
          case 'left':
            startX = centerX + swipeLength / 2; startY = centerY;
            endX = centerX - swipeLength / 2; endY = centerY;
            break;
          case 'right':
            startX = centerX - swipeLength / 2; startY = centerY;
            endX = centerX + swipeLength / 2; endY = centerY;
            break;
          default:
            throw new Error(`Invalid direction: ${direction}`);
        }

        const auto = (globalThis as any).auto;
        if (auto && auto.swipe) {
          await auto.swipe(
            Math.round(startX), Math.round(startY),
            Math.round(endX), Math.round(endY),
            duration
          );
        } else {
          throw new Error('AutomatorAPI not available');
        }

        return { direction, startX, startY, endX, endY, duration };
      },
      critical: true,
    },
  ],
};

/**
 * Screen Read Skill
 * Takes a screenshot and performs OCR to read screen content.
 */
export const screenReadSkill: Skill = {
  id: 'screen-read',
  name: 'Screen Read',
  description: 'Take a screenshot and use OCR to read all text on screen. Returns recognized text content.',
  category: 'android',
  tags: ['screenshot', 'ocr', 'read', 'screen'],
  requiredTools: ['android_screenshot', 'ocr_recognize_screen'],
  parameters: [
    {
      name: 'savePath',
      description: 'Path to save the screenshot',
      type: 'string',
      required: false,
      default: './anode-screen-read.png',
    },
  ],
  steps: [
    {
      name: 'screenshot',
      tool: 'android_screenshot',
      params: {
        path: '${params.savePath}',
        format: 'png',
      },
      critical: true,
    },
    {
      name: 'ocr',
      tool: 'ocr_recognize_screen',
      params: {},
      critical: true,
    },
    {
      name: 'combine',
      handler: async (ctx: SkillContext) => {
        const ocrResult = ctx.results['ocr'];
        return {
          screenshotPath: ctx.params.savePath || './anode-screen-read.png',
          text: ocrResult?.text || ocrResult || 'No text recognized',
        };
      },
    },
  ],
};

/**
 * Scroll Find and Click Skill
 * Scrolls the screen to find text and clicks on it.
 */
export const scrollFindClickSkill: Skill = {
  id: 'scroll-find-click',
  name: 'Scroll, Find & Click',
  description: 'Scroll the screen to find text that may not be visible, then click on it. Tries up to 5 scroll attempts.',
  category: 'android',
  tags: ['scroll', 'find', 'click', 'search'],
  requiredTools: ['android_find_text', 'android_click', 'android_scroll'],
  parameters: [
    {
      name: 'text',
      description: 'Text to find on screen',
      type: 'string',
      required: true,
    },
    {
      name: 'direction',
      description: 'Scroll direction if element not found',
      type: 'string',
      required: false,
      default: 'down',
      enum: ['up', 'down'],
    },
    {
      name: 'maxScrolls',
      description: 'Maximum number of scroll attempts',
      type: 'number',
      required: false,
      default: 5,
    },
  ],
  steps: [
    {
      name: 'scrollAndFind',
      handler: async (ctx: SkillContext) => {
        const auto = (globalThis as any).auto;
        if (!auto) throw new Error('AutomatorAPI not available');

        const maxScrolls = ctx.params.maxScrolls || 5;
        const direction = ctx.params.direction || 'down';
        const text = ctx.params.text;

        for (let attempt = 0; attempt <= maxScrolls; attempt++) {
          // Try to find the text
          let found: any = null;
          if (auto.findText) {
            found = await auto.findText(text, false);
          }

          if (found && found.found && found.nodes?.length > 0) {
            const node = found.nodes[0];
            const bounds = node.bounds;
            const x = Math.round((bounds.left + bounds.right) / 2);
            const y = Math.round((bounds.top + bounds.bottom) / 2);

            // Click on the found element
            if (auto.click) {
              await auto.click(x, y);
            }

            return {
              found: true,
              scrollAttempts: attempt,
              clicked: { x, y, text: node.text },
            };
          }

          // Scroll if not the last attempt
          if (attempt < maxScrolls && auto.scroll) {
            await auto.scroll(direction === 'down' ? 'forward' : 'backward');
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        return { found: false, scrollAttempts: maxScrolls, clicked: null };
      },
      critical: true,
    },
  ],
};

/**
 * App Switch Skill
 * Switch to a specified app and wait for it to be ready.
 */
export const appSwitchSkill: Skill = {
  id: 'app-switch',
  name: 'Switch App',
  description: 'Switch to a specified app by package name and wait for it to be ready. Checks current app first to avoid unnecessary switching.',
  category: 'android',
  tags: ['app', 'switch', 'launch', 'open'],
  requiredTools: ['get_current_app'],
  parameters: [
    {
      name: 'packageName',
      description: 'Target app package name (e.g., com.whatsapp)',
      type: 'string',
      required: true,
    },
    {
      name: 'waitMs',
      description: 'Time to wait after switching in ms',
      type: 'number',
      required: false,
      default: 2000,
    },
  ],
  steps: [
    {
      name: 'checkCurrent',
      tool: 'get_current_app',
      params: {},
      critical: false,
    },
    {
      name: 'switchIfNeeded',
      handler: async (ctx: SkillContext) => {
        const current = ctx.results['checkCurrent'];
        const targetPkg = ctx.params.packageName;

        // Check if already in the target app
        if (current?.packageName === targetPkg || current?.package === targetPkg) {
          return { switched: false, alreadyActive: true, packageName: targetPkg };
        }

        // Launch the target app
        const app = (globalThis as any).app;
        if (app && app.launch) {
          await app.launch(targetPkg);
        } else {
          throw new Error('App launch API not available');
        }

        // Wait for app to load
        await new Promise(resolve => setTimeout(resolve, ctx.params.waitMs || 2000));

        return { switched: true, alreadyActive: false, packageName: targetPkg };
      },
      critical: true,
    },
    {
      name: 'verify',
      tool: 'get_current_app',
      params: {},
      critical: false,
    },
  ],
};

/**
 * Device Status Skill
 * Get comprehensive device status in one call.
 */
export const deviceStatusSkill: Skill = {
  id: 'device-status',
  name: 'Device Status',
  description: 'Get comprehensive device status including device info, battery level, and memory usage in a single call.',
  category: 'device',
  tags: ['device', 'status', 'battery', 'memory', 'info'],
  requiredTools: ['get_device_info'],
  parameters: [],
  steps: [
    {
      name: 'deviceInfo',
      tool: 'get_device_info',
      params: {},
      critical: true,
    },
    {
      name: 'batteryInfo',
      tool: 'get_battery_info',
      params: {},
      critical: false,
    },
    {
      name: 'memoryInfo',
      tool: 'get_memory_info',
      params: {},
      critical: false,
    },
    {
      name: 'combine',
      handler: async (ctx: SkillContext) => {
        return {
          device: ctx.results['deviceInfo'] || 'unavailable',
          battery: ctx.results['batteryInfo'] || 'unavailable',
          memory: ctx.results['memoryInfo'] || 'unavailable',
        };
      },
    },
  ],
};

/**
 * All built-in skills
 */
export const builtinSkills: Skill[] = [
  appLaunchSkill,
  screenshotAnalyzeSkill,
  findAndClickSkill,
  fileProcessSkill,
  httpFetchSaveSkill,
  swipeNavigationSkill,
  screenReadSkill,
  scrollFindClickSkill,
  appSwitchSkill,
  deviceStatusSkill,
];
