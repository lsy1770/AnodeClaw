import { z } from 'zod';
let _coordinator;
export function setSubAgentCoordinator(coordinator) {
    _coordinator = coordinator;
}
export const createSubAgentTool = {
    name: 'create_subagent',
    description: 'Create a specialized sub-agent for a specific domain',
    parameters: [
        {
            name: 'name',
            description: 'Agent name',
            schema: z.string(),
            required: true
        },
        {
            name: 'role',
            description: 'Agent role (researcher, coder, tester, reviewer, etc.)',
            schema: z.string(),
            required: true
        },
        {
            name: 'systemPrompt',
            description: 'System prompt instructions',
            schema: z.string(),
            required: true
        },
        {
            name: 'tools',
            description: 'List of capabilities/tools to enable',
            schema: z.array(z.string()).optional(),
            required: false
        }
    ],
    category: 'system',
    execute: async ({ name, role, systemPrompt, tools }) => {
        if (!_coordinator)
            throw new Error('SubAgentCoordinator not initialized');
        // Generate ID
        const id = `agent-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        // Create agent via coordinator
        const agent = _coordinator.createAgent({
            id,
            name,
            role: role, // Cast to AgentRole
            description: `Dynamic agent: ${role}`,
            capabilities: tools || [],
            systemPrompt,
            model: 'claude-3-haiku-20240307'
        });
        return {
            success: true,
            output: `Created sub-agent '${name}' (${id}) with role '${role}'`,
            data: { agentId: id }
        };
    }
};
export const delegateTaskTool = {
    name: 'delegate_subagent_task',
    description: 'Delegate a task to a specific sub-agent',
    parameters: [
        {
            name: 'agentId',
            description: 'Target agent ID',
            schema: z.string(),
            required: true
        },
        {
            name: 'instruction',
            description: 'Task instruction',
            schema: z.string(),
            required: true
        },
        {
            name: 'context',
            description: 'Additional context (optional)',
            schema: z.string().optional(),
            required: false
        },
        {
            name: 'priority',
            description: 'Priority (optional)',
            schema: z.number().optional(),
            required: false
        }
    ],
    category: 'system',
    execute: async ({ agentId, instruction, context, priority }) => {
        if (!_coordinator)
            throw new Error('SubAgentCoordinator not initialized');
        const taskId = `task-${Date.now()}`;
        const result = await _coordinator.executeTask(agentId, {
            id: taskId,
            agentId,
            instruction,
            context,
            priority,
            dependencies: []
        });
        return {
            success: result.success,
            output: typeof result.result === 'string' ? result.result : JSON.stringify(result.result || result.error || 'Task completed'),
            error: result.error ? { code: 'SUBAGENT_ERROR', message: result.error || 'Unknown error' } : undefined
        };
    }
};
export const listSubAgentsTool = {
    name: 'list_subagents',
    description: 'List all active sub-agents and their status',
    parameters: [],
    category: 'system',
    execute: async () => {
        if (!_coordinator)
            throw new Error('SubAgentCoordinator not initialized');
        const states = _coordinator.getAllAgentStates();
        return {
            success: true,
            output: JSON.stringify(states, null, 2)
        };
    }
};
export const subAgentTools = [
    createSubAgentTool,
    delegateTaskTool,
    listSubAgentsTool
];
