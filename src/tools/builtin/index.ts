/**
 * Built-in Tools Index
 *
 * Exports all built-in tools for easy registration
 */

import type { Tool } from '../types.js';

// Import all tool collections
import { fileTools } from './FileTools.js';
import { androidTools } from './AndroidTools.js';
import { networkTools } from './NetworkTools.js';
import { deviceTools } from './DeviceTools.js';
import { appTools } from './AppTools.js';
import { mediaTools } from './MediaTools.js';
import { imageTools } from './ImageTools.js';
import { storageTools } from './StorageTools.js';
import { notificationTools } from './NotificationTools.js';
import { notificationListenerTools } from './NotificationListenerTools.js';
import { memoryTools, setMemorySystem } from './MemoryTools.js';
import { subAgentTools, setSubAgentCoordinator } from './SubAgentTools.js';

/**
 * All built-in tools
 */
export const builtinTools: Tool[] = [
  ...fileTools,
  ...androidTools,
  ...networkTools,
  ...deviceTools,
  ...appTools,
  ...mediaTools,
  ...imageTools,
  ...storageTools,
  ...notificationTools,
  ...notificationListenerTools,
  ...memoryTools,
  ...subAgentTools,
];

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string): Tool[] {
  return builtinTools.filter((tool) => tool.category === category);
}

/**
 * Get tool by name
 */
export function getToolByName(name: string): Tool | undefined {
  return builtinTools.find((tool) => tool.name === name);
}

/**
 * Get all tool names
 */
export function getToolNames(): string[] {
  return builtinTools.map((tool) => tool.name);
}

/**
 * Export individual tool collections
 */
export {
  fileTools,
  androidTools,
  networkTools,
  deviceTools,
  appTools,
  mediaTools,
  imageTools,
  storageTools,
  notificationTools,
  notificationListenerTools,
  memoryTools,
  setMemorySystem,
  subAgentTools,
  setSubAgentCoordinator,
};
