/**
 * Tools Module Index
 *
 * Main export for the tool system
 */

// Export types
export type {
  Tool,
  ToolParameter,
  ToolContext,
  ToolResult,
  ToolExecutionOptions,
  ToolRegistration,
  ToolCall,
  ToolCallResult,
} from './types.js';

// Export utilities
export { toolToAnthropicFormat } from './types.js';

// Export core classes
export { ToolRegistry, toolRegistry } from './ToolRegistry.js';
export { ToolExecutor, ToolExecutionError } from './ToolExecutor.js';
export { ToolUsageStrategy } from './ToolUsageStrategy.js';
export type { ToolStrategyMode, ToolUsageDecision } from './ToolUsageStrategy.js';

// Export built-in tools
export {
  builtinTools,
  fileTools,
  androidTools,
  networkTools,
  deviceTools,
  getToolsByCategory,
  getToolByName,
  getToolNames,
  setMemorySystem,
  setSubAgentCoordinator,
} from './builtin/index.js';
