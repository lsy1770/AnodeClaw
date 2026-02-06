/**
 * Security Utilities
 *
 * Provides security functions for path validation, input sanitization, and data protection.
 */

import * as path from 'path';
import { logger } from './logger.js';

/**
 * Path validation result
 */
export interface PathValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
}

/**
 * Security utilities class
 */
export class SecurityUtils {
  /**
   * Validate and normalize a file path
   * Prevents path traversal attacks
   */
  static validatePath(filePath: string, baseDir?: string): PathValidationResult {
    try {
      // Normalize the path
      const normalized = path.normalize(filePath);

      // Check for path traversal attempts
      if (normalized.includes('..')) {
        return {
          valid: false,
          error: 'Path traversal detected',
        };
      }

      // If base directory is specified, ensure path is within it
      if (baseDir) {
        const normalizedBase = path.normalize(baseDir);
        const absolute = path.isAbsolute(normalized)
          ? normalized
          : path.join(normalizedBase, normalized);

        if (!absolute.startsWith(normalizedBase)) {
          return {
            valid: false,
            error: 'Path outside base directory',
          };
        }
      }

      // Check for null bytes (security vulnerability)
      if (normalized.includes('\0')) {
        return {
          valid: false,
          error: 'Null byte in path',
        };
      }

      return {
        valid: true,
        normalized,
      };
    } catch (error) {
      logger.error('[Security] Path validation error:', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Sanitize user input to prevent injection attacks
   */
  static sanitizeInput(input: string, maxLength: number = 10000): string {
    if (typeof input !== 'string') {
      throw new TypeError('Input must be a string');
    }

    // Limit length
    let sanitized = input.substring(0, maxLength);

    // Remove control characters except newline and tab
    sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

    return sanitized;
  }

  /**
   * Validate API key format
   */
  static validateApiKey(apiKey: string): boolean {
    if (typeof apiKey !== 'string') {
      return false;
    }

    // Check minimum length
    if (apiKey.length < 10) {
      return false;
    }

    // Check for suspicious patterns
    if (apiKey.includes(' ') || apiKey.includes('\n') || apiKey.includes('\t')) {
      return false;
    }

    return true;
  }

  /**
   * Mask sensitive data for logging
   */
  static maskSensitiveData(data: string, visibleChars: number = 4): string {
    if (typeof data !== 'string') {
      return '[INVALID]';
    }

    if (data.length <= visibleChars) {
      return '*'.repeat(data.length);
    }

    const visible = data.substring(0, visibleChars);
    const masked = '*'.repeat(data.length - visibleChars);
    return `${visible}${masked}`;
  }

  /**
   * Validate JSON input
   */
  static validateJSON(input: string): { valid: boolean; data?: any; error?: string } {
    try {
      const data = JSON.parse(input);
      return { valid: true, data };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid JSON',
      };
    }
  }

  /**
   * Check if a string contains potential code injection
   */
  static containsCodeInjection(input: string): boolean {
    const dangerousPatterns = [
      /require\s*\(/gi,
      /import\s*\(/gi,
      /eval\s*\(/gi,
      /Function\s*\(/gi,
      /<script[\s>]/gi,
      /javascript:/gi,
      /on\w+\s*=/gi, // Event handlers like onclick=
      /\$\{.*\}/g, // Template literals
    ];

    return dangerousPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * Generate a secure random ID
   */
  static generateSecureId(length: number = 16): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';

    // Use Math.random (sufficient for non-cryptographic purposes)
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }

    return result;
  }

  /**
   * Rate limit checker
   */
  private static requestCounts: Map<string, { count: number; resetTime: number }> = new Map();

  static checkRateLimit(
    identifier: string,
    maxRequests: number,
    windowMs: number
  ): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const record = this.requestCounts.get(identifier);

    if (!record || now > record.resetTime) {
      // New window or expired
      this.requestCounts.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
      });

      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetTime: now + windowMs,
      };
    }

    if (record.count >= maxRequests) {
      // Rate limit exceeded
      return {
        allowed: false,
        remaining: 0,
        resetTime: record.resetTime,
      };
    }

    // Increment count
    record.count++;

    return {
      allowed: true,
      remaining: maxRequests - record.count,
      resetTime: record.resetTime,
    };
  }

  /**
   * Clean up old rate limit records
   */
  static cleanupRateLimits(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, value] of this.requestCounts.entries()) {
      if (now > value.resetTime) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.requestCounts.delete(key);
    }
  }
}
