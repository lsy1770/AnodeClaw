/**
 * ID generation utilities
 */

/**
 * Generate a random ID using timestamp and random string
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}_${timestamp}_${randomStr}` : `${timestamp}_${randomStr}`;
}

/**
 * Generate a session ID
 */
export function generateSessionId(): string {
  return generateId('session');
}

/**
 * Generate a message ID
 */
export function generateMessageId(): string {
  return generateId('msg');
}
