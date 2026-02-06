/**
 * Command Classifier
 *
 * Classifies commands and tool calls based on safety patterns
 */

import type {
  SafetyClassification,
  RiskLevel,
  CommandCategory,
  DangerousPattern,
} from './types.js';
import { DANGEROUS_PATTERNS, getToolBaseRisk } from './SafetyRules.js';
import { logger } from '../../utils/logger.js';

/**
 * Command Classifier Class
 */
export class CommandClassifier {
  /**
   * Classify a tool call for safety
   *
   * @param toolName - Name of the tool
   * @param toolInput - Input parameters for the tool
   * @returns Safety classification
   */
  static classify(toolName: string, toolInput: Record<string, any>): SafetyClassification {
    // Start with base risk level for the tool
    let riskLevel = getToolBaseRisk(toolName);
    let category: CommandCategory = this.determineCategory(toolName);
    const warnings: string[] = [];
    const matchedPatterns: string[] = [];

    // Convert tool input to searchable string
    const inputString = JSON.stringify(toolInput).toLowerCase();

    // Check against dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (this.matchesPattern(inputString, pattern)) {
        // Escalate risk level if pattern is more dangerous
        if (this.isHigherRisk(pattern.riskLevel, riskLevel)) {
          riskLevel = pattern.riskLevel;
        }

        // Add to category if more specific
        if (category === 'unknown') {
          category = pattern.category;
        }

        // Add warning
        warnings.push(pattern.description);
        matchedPatterns.push(
          typeof pattern.pattern === 'string' ? pattern.pattern : pattern.pattern.source
        );
      }
    }

    // Generate reasoning
    const reasoning = this.generateReasoning(toolName, riskLevel, warnings);

    // Determine if approval is required
    const requiresApproval = riskLevel !== 'safe' && riskLevel !== 'low';

    logger.debug(
      `[CommandClassifier] ${toolName}: ${riskLevel} risk, requires approval: ${requiresApproval}`
    );

    return {
      riskLevel,
      category,
      requiresApproval,
      warnings,
      reasoning,
      patterns: matchedPatterns,
    };
  }

  /**
   * Check if input matches a dangerous pattern
   */
  private static matchesPattern(input: string, pattern: DangerousPattern): boolean {
    if (typeof pattern.pattern === 'string') {
      return input.includes(pattern.pattern.toLowerCase());
    } else {
      return pattern.pattern.test(input);
    }
  }

  /**
   * Determine if one risk level is higher than another
   */
  private static isHigherRisk(level1: RiskLevel, level2: RiskLevel): boolean {
    const riskOrder: Record<RiskLevel, number> = {
      safe: 0,
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };

    return riskOrder[level1] > riskOrder[level2];
  }

  /**
   * Determine command category based on tool name
   */
  private static determineCategory(toolName: string): CommandCategory {
    if (toolName.includes('write') || toolName.includes('create')) {
      return 'file_write';
    }
    if (toolName.includes('delete') || toolName.includes('remove')) {
      return 'file_delete';
    }
    if (toolName.includes('http') || toolName.includes('fetch') || toolName.includes('request')) {
      return 'network_request';
    }
    if (toolName.includes('execute') || toolName.includes('run') || toolName.includes('command')) {
      return 'system_command';
    }
    if (toolName.includes('update') || toolName.includes('modify')) {
      return 'data_modification';
    }
    if (toolName.includes('android') || toolName.includes('automation')) {
      return 'automation';
    }
    return 'unknown';
  }

  /**
   * Generate human-readable reasoning
   */
  private static generateReasoning(
    toolName: string,
    riskLevel: RiskLevel,
    warnings: string[]
  ): string {
    if (riskLevel === 'safe' || riskLevel === 'low') {
      return `Tool '${toolName}' is considered ${riskLevel} risk.`;
    }

    if (warnings.length === 0) {
      return `Tool '${toolName}' has ${riskLevel} risk level based on its capabilities.`;
    }

    return (
      `Tool '${toolName}' has ${riskLevel} risk level. ` +
      `Detected: ${warnings.slice(0, 3).join(', ')}.`
    );
  }

  /**
   * Classify multiple tool calls
   *
   * @param toolCalls - Array of tool calls to classify
   * @returns Array of classifications
   */
  static classifyBatch(
    toolCalls: Array<{ name: string; input: Record<string, any> }>
  ): SafetyClassification[] {
    return toolCalls.map((call) => this.classify(call.name, call.input));
  }

  /**
   * Get highest risk level from multiple classifications
   */
  static getHighestRisk(classifications: SafetyClassification[]): RiskLevel {
    let highest: RiskLevel = 'safe';

    for (const classification of classifications) {
      if (this.isHigherRisk(classification.riskLevel, highest)) {
        highest = classification.riskLevel;
      }
    }

    return highest;
  }
}
