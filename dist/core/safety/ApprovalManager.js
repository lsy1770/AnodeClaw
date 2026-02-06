/**
 * Approval Manager
 *
 * Manages approval requests for dangerous commands
 * Supports YOLO mode (auto-approve all) and Telegram approval flow
 */
import { CommandClassifier } from './CommandClassifier.js';
import { requiresApproval } from './SafetyRules.js';
import { logger } from '../../utils/logger.js';
import { generateId } from '../../utils/id.js';
import { EventEmitter } from 'events';
/**
 * Approval Manager Class
 */
export class ApprovalManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.pendingRequests = new Map();
        this.approvalRecords = [];
        this.approvalCallbacks = new Map();
        this.config = {
            enabled: config.enabled !== false, // Default true
            requireApprovalFor: config.requireApprovalFor || ['medium', 'high', 'critical'],
            autoApprovePatterns: config.autoApprovePatterns || [],
            autoDenyPatterns: config.autoDenyPatterns || [],
            trustMode: config.trustMode || 'moderate',
            approvalTimeout: config.approvalTimeout || 60000, // 1 minute default
            approvalChatId: config.approvalChatId,
            approvalPlatform: config.approvalPlatform || 'telegram',
        };
        logger.info('[ApprovalManager] Initialized', {
            trustMode: this.config.trustMode,
            enabled: this.config.enabled,
            approvalChatId: this.config.approvalChatId ? '(configured)' : '(not set)',
        });
    }
    /**
     * Set social adapter manager for sending approval requests
     */
    setSocialAdapter(adapter) {
        this.socialAdapter = adapter;
        logger.info('[ApprovalManager] Social adapter connected');
    }
    /**
     * Check if YOLO mode is enabled
     */
    isYoloMode() {
        return this.config.trustMode === 'yolo';
    }
    /**
     * Request approval for a tool call
     *
     * @param toolName - Tool name
     * @param toolInput - Tool input parameters
     * @param sessionId - Session ID for context
     * @param context - Optional additional context
     * @returns Approval response (resolves when user approves/denies)
     */
    async requestApproval(toolName, toolInput, sessionId, context) {
        // If safety system is disabled, auto-approve
        if (!this.config.enabled) {
            logger.debug('[ApprovalManager] Safety disabled, auto-approving');
            return this.createAutoApprovalResponse('disabled');
        }
        // YOLO mode: auto-approve everything without classification
        if (this.config.trustMode === 'yolo') {
            logger.info(`[ApprovalManager] YOLO mode: auto-approving ${toolName}`);
            return this.createAutoApprovalResponse('yolo-mode');
        }
        // Classify the command
        const classification = CommandClassifier.classify(toolName, toolInput);
        // Check if approval is required
        if (!this.shouldRequireApproval(classification)) {
            logger.debug(`[ApprovalManager] ${toolName} classified as ${classification.riskLevel}, auto-approving`);
            return this.createAutoApprovalResponse('low-risk');
        }
        // Check auto-deny patterns
        if (this.matchesAutoDenyPattern(toolName, toolInput)) {
            logger.warn(`[ApprovalManager] ${toolName} matches auto-deny pattern, rejecting`);
            return this.createAutoDenialResponse('auto-deny-pattern');
        }
        // Check auto-approve patterns
        if (this.matchesAutoApprovePattern(toolName, toolInput)) {
            logger.info(`[ApprovalManager] ${toolName} matches auto-approve pattern, approving`);
            return this.createAutoApprovalResponse('auto-approve-pattern');
        }
        // Create approval request
        const request = {
            id: generateId(),
            toolName,
            toolInput,
            classification,
            timestamp: Date.now(),
            sessionId,
            context,
        };
        logger.info(`[ApprovalManager] Requesting approval for ${toolName} (${classification.riskLevel} risk)`);
        // Store pending request
        this.pendingRequests.set(request.id, request);
        // Emit approval needed event
        this.emit('approvalNeeded', request);
        // Try to send Telegram approval request
        await this.sendTelegramApprovalRequest(request);
        // Wait for approval response (with timeout)
        return new Promise((resolve, reject) => {
            // Store callback
            this.approvalCallbacks.set(request.id, { resolve, reject });
            // Set timeout
            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(request.id)) {
                    this.pendingRequests.delete(request.id);
                    this.approvalCallbacks.delete(request.id);
                    logger.warn(`[ApprovalManager] Approval timeout for request ${request.id}`);
                    this.emit('approvalTimeout', request.id);
                    // Reject on timeout (default to denial for safety)
                    reject(new Error('Approval request timed out'));
                }
            }, this.config.approvalTimeout);
            // Store timeout ID for cleanup
            request.timeoutId = timeoutId;
        });
    }
    /**
     * Send approval request via Telegram
     */
    async sendTelegramApprovalRequest(request) {
        if (!this.socialAdapter) {
            logger.warn('[ApprovalManager] No social adapter connected, cannot send approval request');
            return;
        }
        if (!this.config.approvalChatId) {
            logger.warn('[ApprovalManager] No approvalChatId configured, cannot send approval request');
            return;
        }
        const platform = this.config.approvalPlatform || 'telegram';
        try {
            // Format the approval request message
            const inputPreview = JSON.stringify(request.toolInput, null, 2).slice(0, 500);
            const message = [
                `🔔 **Tool Approval Request** [${request.id.slice(0, 8)}]`,
                ``,
                `**Tool:** \`${request.toolName}\``,
                `**Risk Level:** ${request.classification.riskLevel.toUpperCase()}`,
                `**Category:** ${request.classification.category}`,
                ``,
                `**Input:**`,
                '```',
                inputPreview + (inputPreview.length >= 500 ? '...' : ''),
                '```',
                ``,
                request.classification.warnings.length > 0
                    ? `⚠️ **Warnings:** ${request.classification.warnings.join(', ')}`
                    : '',
                ``,
                `Reply with:`,
                `• \`/approve ${request.id.slice(0, 8)}\` to approve`,
                `• \`/deny ${request.id.slice(0, 8)}\` to deny`,
                ``,
                `⏱️ Request expires in ${Math.floor((this.config.approvalTimeout || 60000) / 1000)}s`,
            ].filter(Boolean).join('\n');
            await this.socialAdapter.sendMessage(platform, {
                chatId: this.config.approvalChatId,
                text: message,
                options: { parse_mode: 'Markdown' },
            });
            logger.info(`[ApprovalManager] Sent approval request to ${platform} chat ${this.config.approvalChatId}`);
        }
        catch (error) {
            logger.error('[ApprovalManager] Failed to send Telegram approval request:', error);
        }
    }
    /**
     * Handle incoming social message for approval commands
     * Call this from AgentManager when a message starts with /approve or /deny
     */
    handleApprovalCommand(message) {
        const text = message.text.trim();
        // Check for /approve command
        if (text.startsWith('/approve ')) {
            const requestIdPrefix = text.slice('/approve '.length).trim();
            const request = this.findRequestByPrefix(requestIdPrefix);
            if (request) {
                this.submitApproval({
                    requestId: request.id,
                    approved: true,
                    timestamp: Date.now(),
                    reason: `Approved by ${message.username} via ${message.platform}`,
                });
                this.sendApprovalConfirmation(message, request, true);
                return true;
            }
            else {
                this.sendApprovalNotFound(message, requestIdPrefix);
                return true;
            }
        }
        // Check for /deny command
        if (text.startsWith('/deny ')) {
            const requestIdPrefix = text.slice('/deny '.length).trim();
            const request = this.findRequestByPrefix(requestIdPrefix);
            if (request) {
                this.submitApproval({
                    requestId: request.id,
                    approved: false,
                    timestamp: Date.now(),
                    reason: `Denied by ${message.username} via ${message.platform}`,
                });
                this.sendApprovalConfirmation(message, request, false);
                return true;
            }
            else {
                this.sendApprovalNotFound(message, requestIdPrefix);
                return true;
            }
        }
        return false;
    }
    /**
     * Find a pending request by ID prefix
     */
    findRequestByPrefix(prefix) {
        for (const request of this.pendingRequests.values()) {
            if (request.id.startsWith(prefix) || request.id.slice(0, 8) === prefix) {
                return request;
            }
        }
        return undefined;
    }
    /**
     * Send confirmation message after approval/denial
     */
    async sendApprovalConfirmation(originalMessage, request, approved) {
        if (!this.socialAdapter)
            return;
        const emoji = approved ? '✅' : '❌';
        const action = approved ? 'APPROVED' : 'DENIED';
        try {
            await this.socialAdapter.sendMessage(originalMessage.platform, {
                chatId: originalMessage.chatId,
                text: `${emoji} Tool \`${request.toolName}\` has been ${action}.`,
                options: { parse_mode: 'Markdown' },
                replyTo: originalMessage.messageId,
            });
        }
        catch (error) {
            logger.error('[ApprovalManager] Failed to send confirmation:', error);
        }
    }
    /**
     * Send not found message for invalid approval command
     */
    async sendApprovalNotFound(message, requestIdPrefix) {
        if (!this.socialAdapter)
            return;
        try {
            await this.socialAdapter.sendMessage(message.platform, {
                chatId: message.chatId,
                text: `❓ No pending approval request found matching \`${requestIdPrefix}\`.`,
                options: { parse_mode: 'Markdown' },
                replyTo: message.messageId,
            });
        }
        catch (error) {
            logger.error('[ApprovalManager] Failed to send not found message:', error);
        }
    }
    /**
     * Submit approval response from user
     *
     * @param response - Approval response
     */
    submitApproval(response) {
        const request = this.pendingRequests.get(response.requestId);
        if (!request) {
            logger.warn(`[ApprovalManager] No pending request found for ${response.requestId}`);
            return;
        }
        // Clear timeout
        if (request.timeoutId) {
            clearTimeout(request.timeoutId);
        }
        // Remove from pending
        this.pendingRequests.delete(response.requestId);
        logger.info(`[ApprovalManager] Approval ${response.approved ? 'granted' : 'denied'} for request ${response.requestId}`);
        // Emit event
        this.emit('approvalReceived', response);
        // Resolve callback
        const callback = this.approvalCallbacks.get(response.requestId);
        if (callback) {
            this.approvalCallbacks.delete(response.requestId);
            callback.resolve(response);
        }
        // Record approval
        this.recordApproval(request, response);
    }
    /**
     * Record approval decision
     */
    recordApproval(request, response) {
        const record = {
            request,
            response,
        };
        this.approvalRecords.push(record);
        // Keep only last 1000 records
        if (this.approvalRecords.length > 1000) {
            this.approvalRecords.shift();
        }
    }
    /**
     * Update approval record with execution result
     */
    updateExecutionResult(requestId, result) {
        const record = this.approvalRecords.find((r) => r.request.id === requestId);
        if (record) {
            record.executionResult = result;
        }
    }
    /**
     * Check if approval is required based on classification
     */
    shouldRequireApproval(classification) {
        return requiresApproval(classification.riskLevel, this.config.trustMode || 'moderate');
    }
    /**
     * Check if tool matches auto-approve pattern
     */
    matchesAutoApprovePattern(toolName, toolInput) {
        if (!this.config.autoApprovePatterns || this.config.autoApprovePatterns.length === 0) {
            return false;
        }
        const inputString = `${toolName} ${JSON.stringify(toolInput)}`.toLowerCase();
        return this.config.autoApprovePatterns.some((pattern) => {
            const regex = new RegExp(pattern, 'i');
            return regex.test(inputString);
        });
    }
    /**
     * Check if tool matches auto-deny pattern
     */
    matchesAutoDenyPattern(toolName, toolInput) {
        if (!this.config.autoDenyPatterns || this.config.autoDenyPatterns.length === 0) {
            return false;
        }
        const inputString = `${toolName} ${JSON.stringify(toolInput)}`.toLowerCase();
        return this.config.autoDenyPatterns.some((pattern) => {
            const regex = new RegExp(pattern, 'i');
            return regex.test(inputString);
        });
    }
    /**
     * Create auto-approval response
     */
    createAutoApprovalResponse(reason) {
        return {
            requestId: 'auto-approved',
            approved: true,
            timestamp: Date.now(),
            reason: `Auto-approved: ${reason}`,
        };
    }
    /**
     * Create auto-denial response
     */
    createAutoDenialResponse(reason) {
        return {
            requestId: 'auto-denied',
            approved: false,
            timestamp: Date.now(),
            reason: `Auto-denied: ${reason}`,
        };
    }
    /**
     * Get all pending approval requests
     */
    getPendingRequests() {
        return Array.from(this.pendingRequests.values());
    }
    /**
     * Get approval history
     */
    getApprovalHistory(limit) {
        if (limit) {
            return this.approvalRecords.slice(-limit);
        }
        return [...this.approvalRecords];
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = {
            ...this.config,
            ...config,
        };
        logger.info('[ApprovalManager] Configuration updated', this.config);
    }
    /**
     * Clear approval history
     */
    clearHistory() {
        this.approvalRecords = [];
        logger.info('[ApprovalManager] History cleared');
    }
}
