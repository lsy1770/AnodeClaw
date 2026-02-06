/**
 * Sub-Agent System - Types
 *
 * Type definitions for multi-agent collaboration
 */

/**
 * Agent role types
 */
export type AgentRole =
  | 'coordinator' // Main orchestrating agent
  | 'researcher' // Information gathering
  | 'coder' // Code generation and modification
  | 'tester' // Testing and validation
  | 'reviewer' // Code review and quality
  | 'documenter' // Documentation generation
  | 'analyst' // Data analysis
  | 'specialist'; // Domain-specific expert

/**
 * Agent status
 */
export type AgentStatus = 'idle' | 'working' | 'waiting' | 'completed' | 'failed';

/**
 * Sub-agent configuration
 */
export interface SubAgentConfig {
  id: string;
  role: AgentRole;
  name: string;
  description: string;
  capabilities: string[];
  systemPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Agent task
 */
export interface AgentTask {
  id: string;
  agentId: string;
  instruction: string;
  context?: any;
  dependencies?: string[]; // Task IDs this task depends on
  priority?: number;
  timeout?: number;
}

/**
 * Agent task result
 */
export interface AgentTaskResult {
  taskId: string;
  agentId: string;
  success: boolean;
  result?: any;
  error?: string;
  startTime: number;
  endTime: number;
  duration: number;
}

/**
 * Sub-agent state
 */
export interface SubAgentState {
  id: string;
  role: AgentRole;
  name: string;
  status: AgentStatus;
  currentTask?: AgentTask;
  completedTasks: number;
  failedTasks: number;
  totalTokens: number;
  createdAt: number;
  lastActivity: number;
}

/**
 * Agent message (inter-agent communication)
 */
export interface AgentMessage {
  id: string;
  from: string; // Agent ID
  to: string; // Agent ID or 'broadcast'
  type: 'request' | 'response' | 'notification';
  content: any;
  timestamp: number;
  inReplyTo?: string; // Message ID
}

/**
 * Multi-agent workflow
 */
export interface Workflow {
  id: string;
  name: string;
  description: string;
  agents: SubAgentConfig[];
  tasks: AgentTask[];
  dependencies: Map<string, string[]>; // Task dependencies
  parallel?: boolean; // Run tasks in parallel if possible
}

/**
 * Workflow execution result
 */
export interface WorkflowResult {
  workflowId: string;
  success: boolean;
  results: Map<string, AgentTaskResult>;
  startTime: number;
  endTime: number;
  duration: number;
  error?: string;
}
