/**
 * Model API - Handles communication with AI providers (Claude, OpenAI, Gemini)
 *
 * Features:
 * - Provider abstraction
 * - Error handling and retries
 * - Tool use support (Phase 2)
 * - Response parsing
 * - Streaming support (following OpenClaw pattern)
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
/**
 * Model API error types
 */
export class ModelAPIError extends Error {
    constructor(message, code, statusCode) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = 'ModelAPIError';
    }
}
/**
 * Model API class
 *
 * Supports Anthropic Claude, OpenAI, and Gemini (via OpenAI-compatible API)
 */
export class ModelAPI {
    constructor(provider, apiKey, baseURL) {
        // Temporary storage for stream final response
        this.streamFinalResponse = null;
        this.streamAccumulator = {
            content: '',
            toolCalls: [],
            inputTokens: 0,
            outputTokens: 0,
            stopReason: undefined,
            reasoningContent: '',
        };
        this.provider = provider;
        if (provider === 'anthropic') {
            this.anthropic = new Anthropic({
                apiKey,
                baseURL,
            });
            logger.info('ModelAPI initialized with Anthropic provider');
        }
        else if (provider === 'openai') {
            this.openai = new OpenAI({
                apiKey,
                baseURL: baseURL || 'https://api.openai.com/v1',
            });
            logger.info('ModelAPI initialized with OpenAI provider', { baseURL: baseURL || 'default' });
        }
        else if (provider === 'gemini') {
            // Gemini via OpenAI-compatible API
            this.openai = new OpenAI({
                apiKey,
                baseURL: baseURL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
            });
            logger.info('ModelAPI initialized with Gemini provider (OpenAI-compatible)', { baseURL });
        }
        else {
            throw new Error(`Unknown provider: ${provider}`);
        }
    }
    /**
     * Create a message (send request to AI model)
     *
     * @param params - Request parameters
     * @returns Model response
     * @throws ModelAPIError on API errors
     */
    async createMessage(params) {
        if (this.provider === 'anthropic') {
            return this.createAnthropicMessage(params);
        }
        else if (this.provider === 'openai' || this.provider === 'gemini') {
            return this.createOpenAIMessage(params);
        }
        throw new Error(`Provider not implemented: ${this.provider}`);
    }
    /**
     * Create a streaming message (generator function)
     *
     * @param params - Request parameters
     * @param streamingHandler - Optional streaming handler for event emission
     * @returns AsyncGenerator yielding partial responses
     */
    async *createMessageStream(params, streamingHandler) {
        if (this.provider === 'anthropic') {
            yield* this.createAnthropicMessageStream(params, streamingHandler);
            return this.getStreamFinalResponse();
        }
        else if (this.provider === 'openai' || this.provider === 'gemini') {
            yield* this.createOpenAIMessageStream(params, streamingHandler);
            return this.getStreamFinalResponse();
        }
        throw new Error(`Streaming not implemented for provider: ${this.provider}`);
    }
    resetStreamAccumulator() {
        this.streamAccumulator = {
            content: '',
            toolCalls: [],
            inputTokens: 0,
            outputTokens: 0,
            stopReason: undefined,
            reasoningContent: '',
        };
        this.streamFinalResponse = null;
    }
    getStreamFinalResponse() {
        if (this.streamFinalResponse) {
            return this.streamFinalResponse;
        }
        const acc = this.streamAccumulator;
        this.streamFinalResponse = {
            type: acc.toolCalls.length > 0 ? 'tool_calls' : 'text',
            content: acc.content,
            toolCalls: acc.toolCalls.length > 0 ? acc.toolCalls : undefined,
            reasoningContent: acc.reasoningContent || undefined,
            usage: {
                inputTokens: acc.inputTokens,
                outputTokens: acc.outputTokens,
            },
            stopReason: acc.stopReason,
        };
        return this.streamFinalResponse;
    }
    /**
     * Create message using Anthropic API
     */
    async createAnthropicMessage(params) {
        if (!this.anthropic) {
            throw new Error('Anthropic client not initialized');
        }
        try {
            logger.debug(`Sending request to Anthropic (model: ${params.model})`);
            // Convert messages to Anthropic format
            const messages = this.convertMessagesToAnthropicFormat(params.messages);
            // Make API request
            const response = await this.anthropic.messages.create({
                model: params.model,
                max_tokens: params.maxTokens,
                temperature: params.temperature,
                system: params.systemPrompt,
                messages,
                tools: params.tools,
            });
            logger.info(`Received response from Anthropic (tokens: ${response.usage.input_tokens}/${response.usage.output_tokens})`);
            // Parse and return response
            return this.parseAnthropicResponse(response);
        }
        catch (error) {
            throw this.handleAnthropicError(error);
        }
    }
    /**
     * Convert internal message format to Anthropic format
     */
    convertMessagesToAnthropicFormat(messages) {
        const result = [];
        for (const m of messages) {
            if (m.role === 'system')
                continue;
            if (m.role === 'assistant' && m.metadata?.toolCalls) {
                // Assistant message with tool use
                const content = [];
                if (typeof m.content === 'string' && m.content) {
                    content.push({ type: 'text', text: m.content });
                }
                for (const tc of m.metadata.toolCalls) {
                    content.push({
                        type: 'tool_use',
                        id: tc.id,
                        name: tc.name,
                        input: tc.input,
                    });
                }
                result.push({ role: 'assistant', content });
            }
            else if (m.role === 'tool') {
                // Tool result — Anthropic uses user role with tool_result content blocks
                // Merge consecutive tool results into one user message
                const lastMsg = result[result.length - 1];
                const toolResultBlock = {
                    type: 'tool_result',
                    tool_use_id: m.metadata?.tool_call_id || '',
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                    is_error: m.metadata?.is_error || false,
                };
                if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content) &&
                    lastMsg.content[0]?.type === 'tool_result') {
                    // Append to existing tool result user message
                    lastMsg.content.push(toolResultBlock);
                }
                else {
                    result.push({ role: 'user', content: [toolResultBlock] });
                }
            }
            else {
                result.push({
                    role: m.role,
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                });
            }
        }
        return result;
    }
    /**
     * Parse Anthropic API response
     */
    parseAnthropicResponse(response) {
        // Extract text content
        const textContent = response.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('');
        // Check for tool use (Phase 2)
        const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');
        if (toolUseBlocks.length > 0 && response.stop_reason === 'tool_use') {
            logger.debug('Tool use detected in response');
            return {
                type: 'tool_calls',
                content: textContent,
                toolCalls: this.extractToolCalls(toolUseBlocks),
                usage: {
                    inputTokens: response.usage.input_tokens,
                    outputTokens: response.usage.output_tokens,
                },
                stopReason: response.stop_reason,
            };
        }
        return {
            type: 'text',
            content: textContent,
            usage: {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
            },
            stopReason: response.stop_reason,
        };
    }
    /**
     * Extract tool calls from response (Phase 2)
     */
    extractToolCalls(toolUseBlocks) {
        return toolUseBlocks.map((block) => ({
            id: block.id,
            name: block.name,
            input: block.input,
        }));
    }
    /**
     * Create message using OpenAI API (also works for Gemini via OpenAI-compatible API)
     */
    async createOpenAIMessage(params) {
        if (!this.openai) {
            throw new Error('OpenAI client not initialized');
        }
        try {
            logger.debug(`Sending request to ${this.provider} (model: ${params.model})`);
            // Convert messages to OpenAI format
            const messages = this.convertMessagesToOpenAIFormat(params.messages, params.systemPrompt);
            // Convert tools to OpenAI function calling format
            const toolsParam = params.tools?.length
                ? params.tools.map((t) => ({
                    type: 'function',
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.input_schema || t.parameters || {},
                    },
                }))
                : undefined;
            // Make API request
            const response = await this.openai.chat.completions.create({
                model: params.model,
                messages: messages,
                max_tokens: params.maxTokens,
                temperature: params.temperature,
                tools: toolsParam,
            });
            logger.info(`Received response from ${this.provider} (tokens: ${response.usage?.prompt_tokens}/${response.usage?.completion_tokens})`);
            // Parse and return response
            return this.parseOpenAIResponse(response);
        }
        catch (error) {
            throw this.handleOpenAIError(error);
        }
    }
    /**
     * Convert internal message format to OpenAI format
     */
    convertMessagesToOpenAIFormat(messages, systemPrompt) {
        const result = [];
        // Add system prompt as first message
        if (systemPrompt) {
            result.push({
                role: 'system',
                content: systemPrompt,
            });
        }
        // Add conversation messages
        for (let i = 0; i < messages.length; i++) {
            const m = messages[i];
            if (m.role === 'system')
                continue;
            if (m.role === 'assistant' && m.metadata?.toolCalls) {
                // Assistant message with tool calls
                // Include reasoning_content for DeepSeek reasoner within the same tool-call turn
                // But clear it if this is from a previous user turn (next message is 'user')
                const nextNonTool = messages.slice(i + 1).find(nm => nm.role !== 'tool');
                const isCurrentTurn = !nextNonTool || nextNonTool.role !== 'user';
                const msg = {
                    role: 'assistant',
                    content: (typeof m.content === 'string' ? m.content : '') || null,
                    tool_calls: m.metadata.toolCalls.map((tc) => ({
                        id: tc.id,
                        type: 'function',
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify(tc.input),
                        },
                    })),
                };
                // Only include reasoning_content for the current tool-call turn
                if (isCurrentTurn && m.metadata.reasoning_content) {
                    msg.reasoning_content = m.metadata.reasoning_content;
                }
                result.push(msg);
            }
            else if (m.role === 'tool') {
                // Tool result message
                result.push({
                    role: 'tool',
                    tool_call_id: m.metadata?.tool_call_id || '',
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                });
            }
            else {
                // Regular user/assistant message
                result.push({
                    role: m.role,
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                });
            }
        }
        return result;
    }
    /**
     * Parse OpenAI API response
     */
    parseOpenAIResponse(response) {
        const choice = response.choices[0];
        const message = choice.message;
        // Extract text content
        const textContent = message.content || '';
        // Extract reasoning_content (DeepSeek reasoner)
        const reasoningContent = message.reasoning_content || undefined;
        // Check for tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
            logger.debug('Tool calls detected in response');
            return {
                type: 'tool_calls',
                content: textContent,
                reasoningContent,
                toolCalls: this.extractOpenAIToolCalls(message.tool_calls),
                usage: {
                    inputTokens: response.usage?.prompt_tokens || 0,
                    outputTokens: response.usage?.completion_tokens || 0,
                },
                stopReason: choice.finish_reason,
            };
        }
        return {
            type: 'text',
            content: textContent,
            reasoningContent,
            usage: {
                inputTokens: response.usage?.prompt_tokens || 0,
                outputTokens: response.usage?.completion_tokens || 0,
            },
            stopReason: choice.finish_reason,
        };
    }
    /**
     * Extract tool calls from OpenAI response (Phase 2)
     */
    extractOpenAIToolCalls(toolCalls) {
        return toolCalls.map((call) => ({
            id: call.id,
            name: call.function.name,
            input: JSON.parse(call.function.arguments),
        }));
    }
    /**
     * Handle OpenAI API errors
     */
    handleOpenAIError(error) {
        // OpenAI SDK errors
        if (error.status) {
            const statusCode = error.status;
            // Rate limit
            if (statusCode === 429) {
                logger.error('Rate limit exceeded');
                return new ModelAPIError('Rate limit exceeded. Please try again later.', 'RATE_LIMIT', 429);
            }
            // Authentication
            if (statusCode === 401) {
                logger.error('Invalid API key');
                return new ModelAPIError('Invalid API key. Please check your configuration.', 'INVALID_API_KEY', 401);
            }
            // Invalid request
            if (statusCode === 400) {
                logger.error(`Invalid request: ${error.message}`);
                return new ModelAPIError(`Invalid request: ${error.message}`, 'INVALID_REQUEST', 400);
            }
            // Server error
            if (statusCode >= 500) {
                logger.error(`Server error: ${error.message}`);
                return new ModelAPIError(`Server error: ${error.message}`, 'SERVER_ERROR', statusCode);
            }
            // Other API errors
            logger.error(`API error: ${error.message}`);
            return new ModelAPIError(`API error: ${error.message}`, 'API_ERROR', statusCode);
        }
        // Network or other errors
        if (error instanceof Error) {
            logger.error(`Network error: ${error.message}`);
            return new ModelAPIError(`Network error: ${error.message}`, 'NETWORK_ERROR');
        }
        // Unknown error
        logger.error('Unknown error occurred');
        return new ModelAPIError('An unknown error occurred', 'UNKNOWN_ERROR');
    }
    /**
     * Handle Anthropic API errors
     */
    handleAnthropicError(error) {
        if (error instanceof Anthropic.APIError) {
            const statusCode = error.status;
            // Rate limit
            if (statusCode === 429) {
                logger.error('Rate limit exceeded');
                return new ModelAPIError('Rate limit exceeded. Please try again later.', 'RATE_LIMIT', 429);
            }
            // Authentication
            if (statusCode === 401) {
                logger.error('Invalid API key');
                return new ModelAPIError('Invalid API key. Please check your configuration.', 'INVALID_API_KEY', 401);
            }
            // Invalid request
            if (statusCode === 400) {
                logger.error(`Invalid request: ${error.message}`);
                return new ModelAPIError(`Invalid request: ${error.message}`, 'INVALID_REQUEST', 400);
            }
            // Server error
            if (statusCode && statusCode >= 500) {
                logger.error(`Server error: ${error.message}`);
                return new ModelAPIError(`Server error: ${error.message}`, 'SERVER_ERROR', statusCode);
            }
            // Other API errors
            logger.error(`API error: ${error.message}`);
            return new ModelAPIError(`API error: ${error.message}`, 'API_ERROR', statusCode);
        }
        // Network or other errors
        if (error instanceof Error) {
            logger.error(`Network error: ${error.message}`);
            return new ModelAPIError(`Network error: ${error.message}`, 'NETWORK_ERROR');
        }
        // Unknown error
        logger.error('Unknown error occurred');
        return new ModelAPIError('An unknown error occurred', 'UNKNOWN_ERROR');
    }
    /**
     * Test API connection
     */
    async testConnection() {
        try {
            await this.createMessage({
                model: 'claude-3-haiku-20240307',
                messages: [
                    {
                        id: 'test',
                        role: 'user',
                        content: 'Hi',
                        timestamp: Date.now(),
                        parentId: null,
                        children: [],
                    },
                ],
                maxTokens: 10,
                systemPrompt: 'You are a test assistant.',
            });
            logger.info('API connection test successful');
            return true;
        }
        catch (error) {
            logger.error('API connection test failed:', error);
            return false;
        }
    }
    // ===== Streaming Implementation =====
    /**
     * Create streaming message using Anthropic API
     */
    async *createAnthropicMessageStream(params, streamingHandler) {
        if (!this.anthropic) {
            throw new Error('Anthropic client not initialized');
        }
        this.resetStreamAccumulator();
        const messageId = `msg_${Date.now()}`;
        try {
            logger.debug(`Sending streaming request to Anthropic (model: ${params.model})`);
            const messages = this.convertMessagesToAnthropicFormat(params.messages);
            // Create streaming request
            const stream = await this.anthropic.messages.stream({
                model: params.model,
                max_tokens: params.maxTokens,
                temperature: params.temperature,
                system: params.systemPrompt,
                messages,
                tools: params.tools,
            });
            // Emit message start
            streamingHandler?.emitMessageStart(messageId);
            yield { type: 'message_start', messageId };
            // Track current tool use block
            let currentToolId = null;
            let currentToolName = null;
            let currentToolInput = '';
            // Process stream events
            for await (const event of stream) {
                switch (event.type) {
                    case 'content_block_start':
                        if (event.content_block?.type === 'text') {
                            yield { type: 'text_start' };
                        }
                        else if (event.content_block?.type === 'tool_use') {
                            currentToolId = event.content_block.id;
                            currentToolName = event.content_block.name;
                            currentToolInput = '';
                            streamingHandler?.emitToolStart(currentToolId, currentToolName, {});
                            yield {
                                type: 'tool_use_start',
                                toolCall: { id: currentToolId, name: currentToolName },
                            };
                        }
                        break;
                    case 'content_block_delta':
                        if (event.delta?.type === 'text_delta') {
                            const delta = event.delta.text || '';
                            this.streamAccumulator.content += delta;
                            streamingHandler?.emitMessageUpdate(messageId, delta, 'text_delta');
                            yield { type: 'text_delta', delta };
                        }
                        else if (event.delta?.type === 'input_json_delta') {
                            currentToolInput += event.delta.partial_json || '';
                            yield {
                                type: 'tool_use_delta',
                                toolCall: { id: currentToolId ?? undefined },
                                delta: event.delta.partial_json,
                            };
                        }
                        break;
                    case 'content_block_stop':
                        if (currentToolId && currentToolName) {
                            // Parse tool input and add to accumulator
                            try {
                                const input = currentToolInput ? JSON.parse(currentToolInput) : {};
                                this.streamAccumulator.toolCalls.push({
                                    id: currentToolId,
                                    name: currentToolName,
                                    input,
                                });
                            }
                            catch {
                                this.streamAccumulator.toolCalls.push({
                                    id: currentToolId,
                                    name: currentToolName,
                                    input: {},
                                });
                            }
                            yield { type: 'tool_use_end', toolCall: { id: currentToolId, name: currentToolName } };
                            currentToolId = null;
                            currentToolName = null;
                            currentToolInput = '';
                        }
                        else {
                            yield { type: 'text_end' };
                        }
                        break;
                    case 'message_delta':
                        if (event.delta?.stop_reason) {
                            this.streamAccumulator.stopReason = event.delta.stop_reason;
                        }
                        if (event.usage) {
                            this.streamAccumulator.outputTokens = event.usage.output_tokens || 0;
                            yield {
                                type: 'usage',
                                usage: { outputTokens: event.usage.output_tokens },
                            };
                        }
                        break;
                    case 'message_stop':
                        // Final usage from the stream
                        const finalMessage = await stream.finalMessage();
                        this.streamAccumulator.inputTokens = finalMessage.usage?.input_tokens || 0;
                        this.streamAccumulator.outputTokens = finalMessage.usage?.output_tokens || 0;
                        streamingHandler?.emitMessageEnd(messageId, this.streamAccumulator.content, this.streamAccumulator.stopReason || 'end_turn', {
                            inputTokens: this.streamAccumulator.inputTokens,
                            outputTokens: this.streamAccumulator.outputTokens,
                        });
                        yield {
                            type: 'message_end',
                            stopReason: this.streamAccumulator.stopReason,
                            usage: {
                                inputTokens: this.streamAccumulator.inputTokens,
                                outputTokens: this.streamAccumulator.outputTokens,
                            },
                        };
                        break;
                }
            }
            logger.info(`Streaming completed (tokens: ${this.streamAccumulator.inputTokens}/${this.streamAccumulator.outputTokens})`);
        }
        catch (error) {
            streamingHandler?.emitError('STREAM_ERROR', error instanceof Error ? error.message : 'Unknown streaming error');
            throw this.handleAnthropicError(error);
        }
    }
    /**
     * Create streaming message using OpenAI API
     */
    async *createOpenAIMessageStream(params, streamingHandler) {
        if (!this.openai) {
            throw new Error('OpenAI client not initialized');
        }
        this.resetStreamAccumulator();
        const messageId = `msg_${Date.now()}`;
        try {
            logger.debug(`Sending streaming request to ${this.provider} (model: ${params.model})`);
            const messages = this.convertMessagesToOpenAIFormat(params.messages, params.systemPrompt);
            const toolsParam = params.tools?.length
                ? params.tools.map((t) => ({
                    type: 'function',
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.input_schema || t.parameters || {},
                    },
                }))
                : undefined;
            // Create streaming request
            const stream = await this.openai.chat.completions.create({
                model: params.model,
                messages: messages,
                max_tokens: params.maxTokens,
                temperature: params.temperature,
                tools: toolsParam,
                stream: true,
                stream_options: { include_usage: true },
            });
            // Emit message start
            streamingHandler?.emitMessageStart(messageId);
            yield { type: 'message_start', messageId };
            // Track tool calls being built
            const toolCallBuilders = new Map();
            for await (const chunk of stream) {
                const choice = chunk.choices?.[0];
                const delta = choice?.delta;
                if (delta?.content) {
                    const text = delta.content;
                    this.streamAccumulator.content += text;
                    streamingHandler?.emitMessageUpdate(messageId, text, 'text_delta');
                    yield { type: 'text_delta', delta: text };
                }
                // Handle reasoning_content for DeepSeek
                if (delta?.reasoning_content) {
                    const reasoning = delta.reasoning_content;
                    this.streamAccumulator.reasoningContent += reasoning;
                    streamingHandler?.emitMessageUpdate(messageId, reasoning, 'thinking_delta');
                    yield { type: 'thinking_delta', delta: reasoning };
                }
                // Handle tool calls
                if (delta?.tool_calls) {
                    for (const toolCall of delta.tool_calls) {
                        const index = toolCall.index;
                        if (!toolCallBuilders.has(index)) {
                            // New tool call
                            toolCallBuilders.set(index, {
                                id: toolCall.id || '',
                                name: toolCall.function?.name || '',
                                arguments: '',
                            });
                            if (toolCall.id && toolCall.function?.name) {
                                streamingHandler?.emitToolStart(toolCall.id, toolCall.function.name, {});
                                yield {
                                    type: 'tool_use_start',
                                    toolCall: { id: toolCall.id, name: toolCall.function.name },
                                };
                            }
                        }
                        const builder = toolCallBuilders.get(index);
                        // Update ID if provided
                        if (toolCall.id) {
                            builder.id = toolCall.id;
                        }
                        // Update name if provided
                        if (toolCall.function?.name) {
                            builder.name = toolCall.function.name;
                        }
                        // Append arguments delta
                        if (toolCall.function?.arguments) {
                            builder.arguments += toolCall.function.arguments;
                            yield {
                                type: 'tool_use_delta',
                                toolCall: { id: builder.id },
                                delta: toolCall.function.arguments,
                            };
                        }
                    }
                }
                // Handle finish reason
                if (choice?.finish_reason) {
                    this.streamAccumulator.stopReason = choice.finish_reason;
                    // Finalize tool calls
                    for (const builder of toolCallBuilders.values()) {
                        try {
                            const input = builder.arguments ? JSON.parse(builder.arguments) : {};
                            this.streamAccumulator.toolCalls.push({
                                id: builder.id,
                                name: builder.name,
                                input,
                            });
                            yield { type: 'tool_use_end', toolCall: { id: builder.id, name: builder.name } };
                        }
                        catch {
                            this.streamAccumulator.toolCalls.push({
                                id: builder.id,
                                name: builder.name,
                                input: {},
                            });
                        }
                    }
                }
                // Handle usage in stream (with stream_options.include_usage)
                if (chunk.usage) {
                    this.streamAccumulator.inputTokens = chunk.usage.prompt_tokens || 0;
                    this.streamAccumulator.outputTokens = chunk.usage.completion_tokens || 0;
                    yield {
                        type: 'usage',
                        usage: {
                            inputTokens: chunk.usage.prompt_tokens,
                            outputTokens: chunk.usage.completion_tokens,
                        },
                    };
                }
            }
            // Emit message end
            streamingHandler?.emitMessageEnd(messageId, this.streamAccumulator.content, this.streamAccumulator.stopReason || 'end_turn', {
                inputTokens: this.streamAccumulator.inputTokens,
                outputTokens: this.streamAccumulator.outputTokens,
            });
            yield {
                type: 'message_end',
                stopReason: this.streamAccumulator.stopReason,
                usage: {
                    inputTokens: this.streamAccumulator.inputTokens,
                    outputTokens: this.streamAccumulator.outputTokens,
                },
            };
            logger.info(`Streaming completed (tokens: ${this.streamAccumulator.inputTokens}/${this.streamAccumulator.outputTokens})`);
        }
        catch (error) {
            streamingHandler?.emitError('STREAM_ERROR', error instanceof Error ? error.message : 'Unknown streaming error');
            throw this.handleOpenAIError(error);
        }
    }
}
