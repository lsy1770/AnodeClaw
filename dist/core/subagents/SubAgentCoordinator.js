/**
 * Sub-Agent Coordinator
 *
 * Coordinates multiple sub-agents for collaborative tasks
 */
import { SubAgent } from './SubAgent.js';
import { logger } from '../../utils/logger.js';
import { generateId } from '../../utils/id.js';
import { EventEmitter } from 'events';
/**
 * Sub-Agent Coordinator Class
 */
export class SubAgentCoordinator extends EventEmitter {
    constructor(apiKey, baseURL) {
        super();
        this.agents = new Map();
        this.messageQueue = [];
        this.apiKey = apiKey;
        this.baseURL = baseURL;
        logger.info('[SubAgentCoordinator] Initialized');
    }
    /**
     * Create a new sub-agent
     *
     * @param config - Agent configuration
     * @returns Created sub-agent
     */
    createAgent(config) {
        if (this.agents.has(config.id)) {
            throw new Error(`Agent already exists: ${config.id}`);
        }
        const agent = new SubAgent(config, this.apiKey, this.baseURL);
        this.agents.set(config.id, agent);
        // Listen to agent events
        agent.on('taskStart', (data) => this.emit('agentTaskStart', data));
        agent.on('taskComplete', (data) => this.emit('agentTaskComplete', data));
        agent.on('taskFailed', (data) => this.emit('agentTaskFailed', data));
        logger.info(`[SubAgentCoordinator] Created agent: ${config.name} (${config.id})`);
        return agent;
    }
    /**
     * Get an agent by ID
     *
     * @param agentId - Agent ID
     * @returns Sub-agent or undefined
     */
    getAgent(agentId) {
        return this.agents.get(agentId);
    }
    /**
     * Execute a single task with a specific agent
     *
     * @param agentId - Agent ID
     * @param task - Task to execute
     * @returns Task result
     */
    async executeTask(agentId, task) {
        const agent = this.agents.get(agentId);
        if (!agent) {
            throw new Error(`Agent not found: ${agentId}`);
        }
        if (!agent.isAvailable()) {
            throw new Error(`Agent ${agentId} is busy`);
        }
        return await agent.executeTask(task);
    }
    /**
     * Execute a workflow with multiple agents and tasks
     *
     * @param workflow - Workflow to execute
     * @returns Workflow result
     */
    async executeWorkflow(workflow) {
        logger.info(`[SubAgentCoordinator] Executing workflow: ${workflow.name} (${workflow.tasks.length} tasks)`);
        const startTime = Date.now();
        try {
            // Create agents if not exist
            for (const agentConfig of workflow.agents) {
                if (!this.agents.has(agentConfig.id)) {
                    this.createAgent(agentConfig);
                }
            }
            // Build dependency graph
            const taskResults = new Map();
            const completedTasks = new Set();
            const remainingTasks = new Map(workflow.tasks.map((t) => [t.id, t]));
            // Execute tasks respecting dependencies
            while (remainingTasks.size > 0) {
                // Find tasks that can be executed (all dependencies met)
                const readyTasks = [];
                for (const [taskId, task] of remainingTasks.entries()) {
                    const deps = task.dependencies || [];
                    const allDepsMet = deps.every((dep) => completedTasks.has(dep));
                    if (allDepsMet) {
                        readyTasks.push(task);
                    }
                }
                if (readyTasks.length === 0) {
                    throw new Error('Circular dependency or missing agents detected');
                }
                // Execute ready tasks
                if (workflow.parallel) {
                    // Parallel execution
                    const results = await Promise.all(readyTasks.map((task) => this.executeTask(task.agentId, task)));
                    for (const result of results) {
                        taskResults.set(result.taskId, result);
                        completedTasks.add(result.taskId);
                        remainingTasks.delete(result.taskId);
                    }
                }
                else {
                    // Sequential execution
                    for (const task of readyTasks) {
                        const result = await this.executeTask(task.agentId, task);
                        taskResults.set(result.taskId, result);
                        completedTasks.add(result.taskId);
                        remainingTasks.delete(result.taskId);
                    }
                }
            }
            const endTime = Date.now();
            const duration = endTime - startTime;
            // Check if all tasks succeeded
            const allSuccess = Array.from(taskResults.values()).every((r) => r.success);
            const result = {
                workflowId: workflow.id,
                success: allSuccess,
                results: taskResults,
                startTime,
                endTime,
                duration,
            };
            logger.info(`[SubAgentCoordinator] Workflow ${workflow.name} completed in ${duration}ms (success: ${allSuccess})`);
            return result;
        }
        catch (error) {
            const endTime = Date.now();
            const duration = endTime - startTime;
            logger.error(`[SubAgentCoordinator] Workflow ${workflow.name} failed:`, error);
            return {
                workflowId: workflow.id,
                success: false,
                results: new Map(),
                startTime,
                endTime,
                duration,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    /**
     * Send message between agents
     *
     * @param from - Sender agent ID
     * @param to - Recipient agent ID or 'broadcast'
     * @param content - Message content
     * @param type - Message type
     * @returns Message ID
     */
    sendMessage(from, to, content, type = 'notification') {
        const message = {
            id: generateId(),
            from,
            to,
            type,
            content,
            timestamp: Date.now(),
        };
        this.messageQueue.push(message);
        this.emit('message', message);
        logger.debug(`[SubAgentCoordinator] Message ${message.id} from ${from} to ${to}`);
        return message.id;
    }
    /**
     * Get messages for an agent
     *
     * @param agentId - Agent ID
     * @returns Messages for this agent
     */
    getMessages(agentId) {
        return this.messageQueue.filter((m) => m.to === agentId || m.to === 'broadcast');
    }
    /**
     * Clear messages for an agent
     *
     * @param agentId - Agent ID
     */
    clearMessages(agentId) {
        this.messageQueue = this.messageQueue.filter((m) => m.to !== agentId && m.to !== 'broadcast');
    }
    /**
     * Get all agents' states
     */
    getAllAgentStates() {
        return Array.from(this.agents.values()).map((agent) => agent.getState());
    }
    /**
     * Get statistics
     */
    getStats() {
        const agents = Array.from(this.agents.values());
        return {
            totalAgents: agents.length,
            activeAgents: agents.filter((a) => !a.isAvailable()).length,
            totalCompletedTasks: agents.reduce((sum, a) => sum + a.getState().completedTasks, 0),
            totalFailedTasks: agents.reduce((sum, a) => sum + a.getState().failedTasks, 0),
            totalTokens: agents.reduce((sum, a) => sum + a.getState().totalTokens, 0),
            messageQueueSize: this.messageQueue.length,
        };
    }
    /**
     * Destroy an agent
     *
     * @param agentId - Agent ID
     */
    destroyAgent(agentId) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.destroy();
            this.agents.delete(agentId);
            logger.info(`[SubAgentCoordinator] Destroyed agent: ${agentId}`);
            return true;
        }
        return false;
    }
    /**
     * Destroy all agents and cleanup
     */
    destroy() {
        for (const agent of this.agents.values()) {
            agent.destroy();
        }
        this.agents.clear();
        this.messageQueue = [];
        this.removeAllListeners();
        logger.info('[SubAgentCoordinator] Destroyed');
    }
}
