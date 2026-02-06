/**
 * Safe Command Approval System - Types
 *
 * Type definitions for command safety classification and approval
 */

/**
 * Command risk levels
 */
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Command category types
 */
export type CommandCategory =
  | 'file_write'
  | 'file_delete'
  | 'network_request'
  | 'system_command'
  | 'data_modification'
  | 'automation'
  | 'unknown';

/**
 * Safety classification result
 */
export interface SafetyClassification {
  riskLevel: RiskLevel;
  category: CommandCategory;
  requiresApproval: boolean;
  warnings: string[];
  reasoning: string;
  patterns: string[]; // Matched dangerous patterns
}

/**
 * Approval request
 */
export interface ApprovalRequest {
  id: string;
  toolName: string;
  toolInput: Record<string, any>;
  classification: SafetyClassification;
  timestamp: number;
  sessionId: string;
  context?: string; // Additional context for the user
}

/**
 * Approval response
 */
export interface ApprovalResponse {
  requestId: string;
  approved: boolean;
  timestamp: number;
  reason?: string; // Optional reason for rejection
  rememberChoice?: boolean; // Remember this choice for similar commands
}

/**
 * Approval record (for logging)
 */
export interface ApprovalRecord {
  request: ApprovalRequest;
  response: ApprovalResponse;
  executionResult?: {
    success: boolean;
    output?: any;
    error?: string;
  };
}

/**
 * Safety configuration
 */
export interface SafetyConfig {
  enabled: boolean;
  requireApprovalFor: RiskLevel[]; // Risk levels requiring approval
  autoApprovePatterns?: string[]; // Patterns to auto-approve
  autoDenyPatterns?: string[]; // Patterns to auto-deny
  trustMode?: 'strict' | 'moderate' | 'permissive' | 'yolo'; // Overall trust level ('yolo' = auto-approve all)
  approvalTimeout?: number; // Timeout for approval requests (ms)
  /** Telegram chat ID for sending approval requests (required for non-yolo mode) */
  approvalChatId?: string;
  /** Platform to use for approval requests (default: telegram) */
  approvalPlatform?: string;
}

/**
 * Dangerous pattern definition
 */
export interface DangerousPattern {
  pattern: RegExp | string;
  category: CommandCategory;
  riskLevel: RiskLevel;
  description: string;
  examples: string[];
}
