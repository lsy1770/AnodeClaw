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
import type { Message, ToolCall, MessageContent, ImageContentBlock, FileContentBlock } from './types.js';
import { logger } from '../utils/logger.js';
import type { StreamingHandler } from './streaming/index.js';

/**
 * Model-specific token limits
 * Maps model names (or name patterns) to their actual input token limits
 */
export const MODEL_TOKEN_LIMITS: Record<string, number> = {
  // Claude models
  'claude-3-5-sonnet': 200000,
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  'claude-sonnet-4': 200000,
  'claude-opus-4': 200000,

  // OpenAI models
  'gpt-4': 128000,
  'gpt-4-turbo': 128000,
  'gpt-3.5-turbo': 16000,
  'gpt-4o': 128000,

  // DeepSeek models
  'deepseek-chat': 170000,
  'deepseek-reasoner': 170000,
  'deepseek-v3': 170000,

  // Gemini models
  'gemini-1.5-pro': 2000000,
  'gemini-1.5-flash': 1000000,
  'gemini-pro': 32000,
};

/**
 * Detect model token limit based on model name
 * @param modelName - The model identifier
 * @returns The estimated token limit, or default 128000 if unknown
 */
export function detectModelTokenLimit(modelName: string): number {
  const lowerModel = modelName.toLowerCase();

  // Exact match
  if (MODEL_TOKEN_LIMITS[lowerModel]) {
    return MODEL_TOKEN_LIMITS[lowerModel];
  }

  // Pattern matching
  for (const [pattern, limit] of Object.entries(MODEL_TOKEN_LIMITS)) {
    if (lowerModel.includes(pattern.toLowerCase())) {
      return limit;
    }
  }

  // Default to 128k for safety
  logger.warn(`[ModelAPI] Unknown model "${modelName}", using default token limit 128000`);
  return 128000;
}

/**
 * Model response types
 */
export type ModelResponseType = 'text' | 'tool_calls';

/**
 * Model response structure
 */
export interface ModelResponse {
  type: ModelResponseType;
  content: string;
  toolCalls?: ToolCall[];
  /** DeepSeek reasoner thinking content â€?must be passed back during tool call loops */
  reasoningContent?: string;
  /** Provider-specific content snapshot for reconstructing native history */
  providerContent?: any;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  stopReason?: string;
}

/**
 * Model API request parameters
 */
export interface ModelRequest {
  model: string;
  messages: Message[];
  maxTokens: number;
  temperature?: number;
  tools?: any[];
  systemPrompt?: string;
}

export type OpenAIAPIMode = 'auto' | 'responses' | 'chat.completions';

/**
 * Streaming chunk types
 */
export type ModelStreamChunkType =
  | 'text_delta'
  | 'text_start'
  | 'text_end'
  | 'tool_use_start'
  | 'tool_use_delta'
  | 'tool_use_end'
  | 'thinking_delta'
  | 'message_start'
  | 'message_end'
  | 'usage';

/**
 * Streaming chunk
 */
export interface ModelStreamChunk {
  type: ModelStreamChunkType;
  /** Delta content for text chunks */
  delta?: string;
  /** Tool call info for tool_use chunks */
  toolCall?: Partial<ToolCall>;
  /** Usage info for usage chunks */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  /** Stop reason for message_end */
  stopReason?: string;
  /** Message ID */
  messageId?: string;
  /** Provider-specific content snapshot for reconstructing native history */
  providerContent?: any;
}

/**
 * Stream accumulator for building final response
 */
interface StreamAccumulator {
  content: string;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
  stopReason?: string;
  reasoningContent: string;
}

/**
 * Model API error types
 */
export class ModelAPIError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'ModelAPIError';
  }
}

/**
 * Model API class
 *
 * Supports Anthropic Claude, OpenAI, and Gemini (via OpenAI-compatible API)
 */
export class ModelAPI {
  private anthropic?: Anthropic;
  private openai?: OpenAI;
  private provider: 'anthropic' | 'openai' | 'gemini';
  private configuredBaseURL?: string;
  private apiKey: string;
  private openaiAPIMode: OpenAIAPIMode;
  private useNativeHttp: boolean = false; // Use native HTTP instead of SDK
  private useNativeGemini: boolean = false;

  constructor(
    provider: 'anthropic' | 'openai' | 'gemini',
    apiKey: string,
    baseURL?: string,
    openaiAPIMode: OpenAIAPIMode = 'auto'
  ) {
    this.provider = provider;
    this.configuredBaseURL = baseURL;
    this.apiKey = apiKey;
    this.openaiAPIMode = openaiAPIMode;

    // Use native HTTP for custom baseURL to avoid SDK path issues
    if (provider === 'anthropic' && baseURL) {
      this.useNativeHttp = true;
      const initInfo = {
        provider,
        baseURL,
        apiKeyPrefix: apiKey ? `${apiKey.substring(0, 8)}...` : '(missing)',
        mode: 'native HTTP (bypassing SDK)',
      };
      console.log('[ModelAPI] Initializing Anthropic with native HTTP:', JSON.stringify(initInfo, null, 2));
      logger.info('[ModelAPI] Initializing Anthropic with native HTTP', initInfo);
    } else if (provider === 'anthropic') {
      const initInfo = {
        provider,
        baseURL: '(default: https://api.anthropic.com)',
        apiKeyPrefix: apiKey ? `${apiKey.substring(0, 8)}...` : '(missing)',
        mode: 'SDK',
      };
      console.log('[ModelAPI] Initializing Anthropic client:', JSON.stringify(initInfo, null, 2));
      logger.info('[ModelAPI] Initializing Anthropic client', initInfo);

      this.anthropic = new Anthropic({
        apiKey,
        baseURL,
      });
      logger.info('[ModelAPI] Anthropic client created successfully');
    } else if (provider === 'openai') {
      this.openai = new OpenAI({
        apiKey,
        baseURL: baseURL || 'https://api.openai.com/v1',
      });
      logger.info('ModelAPI initialized with OpenAI provider', {
        baseURL: baseURL || 'default',
        apiMode: this.openaiAPIMode,
      });
    } else if (provider === 'gemini') {
      const normalizedBaseURL = (baseURL || '').toLowerCase();
      this.useNativeGemini = !normalizedBaseURL || !normalizedBaseURL.includes('/openai');

      if (this.useNativeGemini) {
        logger.info('ModelAPI initialized with Gemini provider (native API)', {
          baseURL: baseURL || 'https://generativelanguage.googleapis.com/v1beta',
        });
      } else {
        this.openai = new OpenAI({
          apiKey,
          baseURL: this.normalizeGeminiCompatibleBaseURL(),
        });
        logger.info('ModelAPI initialized with Gemini provider (OpenAI-compatible)', {
          baseURL: this.normalizeGeminiCompatibleBaseURL(),
          apiMode: this.openaiAPIMode,
        });
      }
    } else {
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
  async createMessage(params: ModelRequest): Promise<ModelResponse> {
    if (this.provider === 'anthropic') {
      if (this.useNativeHttp) {
        return this.createAnthropicMessageNative(params);
      }
      return this.createAnthropicMessage(params);
    } else if (this.provider === 'gemini' && this.useNativeGemini) {
      return this.createGeminiMessage(params);
    } else if (this.provider === 'openai' || this.provider === 'gemini') {
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
  async *createMessageStream(
    params: ModelRequest,
    streamingHandler?: StreamingHandler
  ): AsyncGenerator<ModelStreamChunk, ModelResponse, undefined> {
    if (this.provider === 'anthropic') {
      if (this.useNativeHttp) {
        yield* this.createAnthropicMessageStreamNative(params, streamingHandler);
      } else {
        yield* this.createAnthropicMessageStream(params, streamingHandler);
      }
      return this.getStreamFinalResponse();
    } else if (this.provider === 'gemini' && this.useNativeGemini) {
      yield* this.createGeminiMessageStream(params, streamingHandler);
      return this.getStreamFinalResponse();
    } else if (this.provider === 'openai' || this.provider === 'gemini') {
      yield* this.createOpenAIMessageStream(params, streamingHandler);
      return this.getStreamFinalResponse();
    }

    throw new Error(`Streaming not implemented for provider: ${this.provider}`);
  }

  // Temporary storage for stream final response
  private streamFinalResponse: ModelResponse | null = null;
  private streamAccumulator: StreamAccumulator = {
    content: '',
    toolCalls: [],
    inputTokens: 0,
    outputTokens: 0,
    stopReason: undefined,
    reasoningContent: '',
  };

  private resetStreamAccumulator(): void {
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

  private getStreamFinalResponse(): ModelResponse {
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

  private normalizeTextContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => this.normalizeTextContent(part))
        .filter(Boolean)
        .join('');
    }

    if (!content || typeof content !== 'object') {
      return '';
    }

    if (typeof content.text === 'string') {
      return content.text;
    }

    if (typeof content.output_text === 'string') {
      return content.output_text;
    }

    if (typeof content.input_text === 'string') {
      return content.input_text;
    }

    if (typeof content.refusal === 'string') {
      return content.refusal;
    }

    if (Array.isArray(content.content)) {
      return this.normalizeTextContent(content.content);
    }

    if (Array.isArray(content.summary)) {
      return this.normalizeTextContent(content.summary);
    }

    return '';
  }

  /**
   * Create message using Anthropic API
   */
  private async createAnthropicMessage(params: ModelRequest): Promise<ModelResponse> {
    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized');
    }

    try {
      // Convert messages to Anthropic format
      const messages = this.convertMessagesToAnthropicFormat(params.messages);

      // Log full request details
      const requestPayload = {
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        system: params.systemPrompt ? `${params.systemPrompt.substring(0, 100)}...` : undefined,
        messages: messages.map((m: any) => ({
          role: m.role,
          contentPreview: typeof m.content === 'string'
            ? m.content.substring(0, 100)
            : JSON.stringify(m.content).substring(0, 100),
        })),
        toolsCount: params.tools?.length || 0,
      };

      logger.info('[ModelAPI] Sending request to Anthropic API', requestPayload);
      logger.debug('[ModelAPI] Full messages payload:', JSON.stringify(messages, null, 2));

      // Make API request
      const response = await (this.anthropic as any).messages.create({
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        system: params.systemPrompt,
        messages,
        tools: params.tools,
      });

      logger.info('[ModelAPI] Received response from Anthropic', {
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        stopReason: response.stop_reason,
        contentBlocks: response.content?.length,
      });

      // Parse and return response
      return this.parseAnthropicResponse(response);
    } catch (error: any) {
      // Enhanced error logging
      logger.error('[ModelAPI] Anthropic API error occurred', {
        errorName: error?.name,
        errorMessage: error?.message,
        errorStatus: error?.status,
        errorType: error?.type,
        errorCode: error?.error?.type || error?.code,
        errorDetails: error?.error?.message || error?.error,
        stack: error?.stack?.substring(0, 500),
        rawError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2).substring(0, 1000),
      });
      throw this.handleAnthropicError(error);
    }
  }

  /**
   * Trim converted Anthropic messages so the full request body stays below maxBytes.
   * Removes oldest messages first (index 0+), always keeping at least 2 messages.
   * Also drops base64 image data from stripped messages to save more space.
   */
  private trimMessagesToBodyLimit(
    messages: Array<Record<string, any>>,
    systemPrompt: string | undefined,
    tools: any[] | undefined,
    maxBytes = 5 * 1024 * 1024   // 5 MB â€?well under the 6 MB hard limit
  ): Array<Record<string, any>> {
    const estimate = () =>
      JSON.stringify({ system: systemPrompt, messages, tools }).length;

    if (estimate() <= maxBytes) return messages;

    logger.warn(`[ModelAPI] Request body too large (${estimate()} bytes), trimming old messagesâ€¦`);

    // Strip base64 payloads from content blocks first (images in old messages are the usual culprit)
    let trimmed = messages.map(msg => {
      if (!Array.isArray(msg.content)) return msg;
      const stripped = msg.content.map((block: any) => {
        if (block?.type === 'image' && block?.source?.type === 'base64') {
          return { type: 'text', text: '[image removed to fit context]' };
        }
        return block;
      });
      return { ...msg, content: stripped };
    });

    // Then drop oldest messages until we fit
    while (trimmed.length > 2) {
      trimmed = trimmed.slice(1);
      if (estimate() <= maxBytes) break;
    }

    logger.warn(`[ModelAPI] Trimmed to ${trimmed.length} messages (${estimate()} bytes)`);
    return trimmed;
  }

  /**
   * Convert internal message format to Anthropic format
   */
  private convertMessagesToAnthropicFormat(
    messages: Message[]
  ): Array<Record<string, any>> {
    const result: Array<Record<string, any>> = [];

    for (const m of messages) {
      if (m.role === 'system') continue;

      if (m.role === 'assistant' && m.metadata?.toolCalls) {
        // Assistant message with tool use
        const content: any[] = [];
        if (typeof m.content === 'string' && m.content) {
          content.push({ type: 'text', text: m.content });
        }
        for (const tc of m.metadata.toolCalls as any[]) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.input,
          });
        }
        result.push({ role: 'assistant', content });
      } else if (m.role === 'tool') {
        // Tool result â€?Anthropic uses user role with tool_result content blocks
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
        } else {
          result.push({ role: 'user', content: [toolResultBlock] });
        }
      } else {
        result.push({
          role: m.role as 'user' | 'assistant',
          content: this.buildAnthropicContent(m.content),
        });
      }
    }

    return result;
  }

  /**
   * Parse Anthropic API response
   */
  private parseAnthropicResponse(response: any): ModelResponse {
    // Extract text content
    const textContent = response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('');

    // Check for tool use (Phase 2)
    const toolUseBlocks = response.content.filter((block: any) => block.type === 'tool_use');

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
  private extractToolCalls(toolUseBlocks: any[]): ToolCall[] {
    return toolUseBlocks.map((block) => ({
      id: block.id,
      name: block.name,
      input: block.input,
    }));
  }

  private normalizeGeminiBaseURL(): string {
    const baseURL = (this.configuredBaseURL || 'https://generativelanguage.googleapis.com/v1beta')
      .replace(/\/+$/, '');

    if (baseURL.endsWith('/models')) {
      return baseURL;
    }

    const modelsIndex = baseURL.indexOf('/models/');
    if (modelsIndex >= 0) {
      return `${baseURL.slice(0, modelsIndex)}/models`;
    }

    return `${baseURL}/models`;
  }

  private normalizeGeminiCompatibleBaseURL(): string {
    return (this.configuredBaseURL || 'https://generativelanguage.googleapis.com/v1beta/openai/')
      .replace(/\/+$/, '');
  }

  private normalizeGeminiModel(model: string): string {
    return model.startsWith('models/') ? model.slice('models/'.length) : model;
  }

  private buildGeminiFunctionDeclarations(tools?: any[]): Array<Record<string, any>> | undefined {
    return tools?.length
      ? tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema || tool.parameters || { type: 'object', properties: {} },
        }))
      : undefined;
  }

  private async buildGeminiParts(content: MessageContent): Promise<Array<Record<string, any>>> {
    if (typeof content === 'string') {
      return content ? [{ text: content }] : [];
    }

    if (!Array.isArray(content)) {
      return [{ text: JSON.stringify(content) }];
    }

    const parts: Array<Record<string, any>> = [];

    for (const block of content as any[]) {
      if (typeof block === 'string') {
        parts.push({ text: block });
        continue;
      }

      if (block.type === 'text' || block.type === 'input_text' || block.type === 'output_text') {
        if (block.text) {
          parts.push({ text: block.text });
        }
        continue;
      }

      if (block.type === 'tool_use') {
        parts.push({
          functionCall: {
            id: block.id,
            name: block.name,
            args: block.input || {},
          },
        });
        continue;
      }

      if (block.type === 'image') {
        parts.push({ text: '[Image omitted: Gemini native format currently degrades image history to text]' });
        continue;
      }

      if (block.type === 'file') {
        const fname = block.source?.filename || block.source?.url || 'unknown';
        parts.push({ text: `[File: ${fname}]` });
        continue;
      }

      if (block.type === 'refusal' && block.refusal) {
        parts.push({ text: block.refusal });
        continue;
      }

      const normalized = this.normalizeTextContent(block);
      if (normalized) {
        parts.push({ text: normalized });
      }
    }

    return parts;
  }

  private buildGeminiToolResponsePayload(message: Message): Record<string, any> {
    let parsed: any = message.content;

    if (typeof message.content === 'string') {
      try {
        parsed = JSON.parse(message.content);
      } catch {
        parsed = message.content;
      }
    }

    if (message.metadata?.is_error) {
      return { error: parsed };
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }

    return { result: parsed };
  }

  private async convertMessagesToGeminiFormat(messages: Message[]): Promise<Array<Record<string, any>>> {
    const result: Array<Record<string, any>> = [];

    for (const message of messages) {
      if (message.role === 'system') {
        continue;
      }

      if (message.role === 'tool') {
        const part = {
          functionResponse: {
            id: message.metadata?.tool_call_id || undefined,
            name: message.metadata?.tool_name || 'tool',
            response: this.buildGeminiToolResponsePayload(message),
          },
        };

        const lastMessage = result[result.length - 1];
        if (lastMessage?.role === 'user' && Array.isArray(lastMessage.parts) && lastMessage.parts.every((item: any) => item.functionResponse)) {
          lastMessage.parts.push(part);
        } else {
          result.push({ role: 'user', parts: [part] });
        }
        continue;
      }

      if (message.role === 'assistant') {
        const providerContent = message.metadata?.providerContent;
        if (providerContent?.parts && Array.isArray(providerContent.parts)) {
          result.push({
            role: providerContent.role || 'model',
            parts: providerContent.parts,
          });
          continue;
        }
      }

      const parts = await this.buildGeminiParts(message.content);

      if (message.role === 'assistant' && message.metadata?.toolCalls) {
        for (const toolCall of message.metadata.toolCalls as any[]) {
          parts.push({
            functionCall: {
              id: toolCall.id,
              name: toolCall.name,
              args: toolCall.input || {},
            },
          });
        }
      }

      result.push({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: parts.length > 0 ? parts : [{ text: '' }],
      });
    }

    return result;
  }

  private async buildGeminiRequestBody(params: ModelRequest): Promise<Record<string, any>> {
    const body: Record<string, any> = {
      contents: await this.convertMessagesToGeminiFormat(params.messages),
      generationConfig: {
        temperature: params.temperature,
        maxOutputTokens: params.maxTokens,
      },
    };

    if (params.systemPrompt) {
      body.system_instruction = {
        parts: [{ text: params.systemPrompt }],
      };
    }

    const functionDeclarations = this.buildGeminiFunctionDeclarations(params.tools);
    if (functionDeclarations?.length) {
      body.tools = [{ functionDeclarations }];
    }

    return body;
  }

  private parseGeminiResponse(response: any): ModelResponse {
    const candidate = response?.candidates?.[0] || {};
    const content = candidate?.content || { role: 'model', parts: [] };
    const parts = Array.isArray(content.parts) ? content.parts : [];

    const reasoningContent = parts
      .filter((part: any) => part?.thought && typeof part?.text === 'string')
      .map((part: any) => part.text)
      .join('');

    const textContent = parts
      .filter((part: any) => !part?.thought && typeof part?.text === 'string')
      .map((part: any) => part.text)
      .join('');

    const toolCalls = parts
      .filter((part: any) => part?.functionCall)
      .map((part: any, index: number) => ({
        id: part.functionCall.id || `gemini_call_${index + 1}`,
        name: part.functionCall.name,
        input: this.parseToolCallArguments(part.functionCall.args),
      }));

    return {
      type: toolCalls.length > 0 ? 'tool_calls' : 'text',
      content: textContent,
      reasoningContent: reasoningContent || undefined,
      providerContent: content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: response?.usageMetadata?.promptTokenCount || 0,
        outputTokens: response?.usageMetadata?.candidatesTokenCount || 0,
      },
      stopReason: candidate?.finishReason || response?.promptFeedback?.blockReason,
    };
  }

  private async createGeminiMessage(params: ModelRequest): Promise<ModelResponse> {
    try {
      const modelName = this.normalizeGeminiModel(params.model);
      const url = `${this.normalizeGeminiBaseURL()}/${modelName}:generateContent`;
      const requestBody = await this.buildGeminiRequestBody(params);

      logger.debug(`Sending native Gemini request (model: ${params.model})`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ModelAPIError(`HTTP ${response.status}: ${errorText}`, 'HTTP_ERROR', response.status);
      }

      const data = await response.json() as any;
      logger.info('Received response from Gemini native API', {
        inputTokens: data?.usageMetadata?.promptTokenCount || 0,
        outputTokens: data?.usageMetadata?.candidatesTokenCount || 0,
        finishReason: data?.candidates?.[0]?.finishReason,
      });

      return this.parseGeminiResponse(data);
    } catch (error) {
      throw this.handleGeminiError(error);
    }
  }

  private async *createGeminiMessageStream(
    params: ModelRequest,
    streamingHandler?: StreamingHandler
  ): AsyncGenerator<ModelStreamChunk, void, undefined> {
    this.resetStreamAccumulator();
    const messageId = `msg_${Date.now()}`;

    const response = await this.createGeminiMessage(params);
    this.streamFinalResponse = response;
    this.streamAccumulator.content = response.content;
    this.streamAccumulator.reasoningContent = response.reasoningContent || '';
    this.streamAccumulator.toolCalls = response.toolCalls || [];
    this.streamAccumulator.inputTokens = response.usage?.inputTokens || 0;
    this.streamAccumulator.outputTokens = response.usage?.outputTokens || 0;
    this.streamAccumulator.stopReason = response.stopReason;

    streamingHandler?.emitMessageStart(messageId);
    yield { type: 'message_start', messageId };

    if (response.content) {
      streamingHandler?.emitMessageUpdate(messageId, response.content, 'text_delta');
      yield { type: 'text_delta', delta: response.content };
    }

    if (response.reasoningContent) {
      streamingHandler?.emitMessageUpdate(messageId, response.reasoningContent, 'thinking_delta');
      yield { type: 'thinking_delta', delta: response.reasoningContent };
    }

    for (const toolCall of response.toolCalls || []) {
      streamingHandler?.emitToolStart(toolCall.id, toolCall.name, {});
      yield { type: 'tool_use_start', toolCall: { id: toolCall.id, name: toolCall.name } };

      const serializedInput = JSON.stringify(toolCall.input || {});
      if (serializedInput && serializedInput !== '{}') {
        yield {
          type: 'tool_use_delta',
          toolCall: { id: toolCall.id, name: toolCall.name },
          delta: serializedInput,
        };
      }

      yield { type: 'tool_use_end', toolCall: { id: toolCall.id, name: toolCall.name } };
    }

    yield {
      type: 'usage',
      usage: {
        inputTokens: response.usage?.inputTokens || 0,
        outputTokens: response.usage?.outputTokens || 0,
      },
    };

    streamingHandler?.emitMessageEnd(
      messageId,
      response.content,
      (response.stopReason as any) || 'stop',
      {
        inputTokens: response.usage?.inputTokens || 0,
        outputTokens: response.usage?.outputTokens || 0,
      }
    );

    yield {
      type: 'message_end',
      stopReason: response.stopReason,
      usage: {
        inputTokens: response.usage?.inputTokens || 0,
        outputTokens: response.usage?.outputTokens || 0,
      },
      providerContent: response.providerContent,
    };
  }

  private handleGeminiError(error: any): ModelAPIError {
    if (error instanceof ModelAPIError) {
      return error;
    }

    const statusCode = error?.status || error?.statusCode;
    const message = error?.message || error?.error?.message || 'Gemini API request failed';

    if (statusCode === 429) {
      return new ModelAPIError('Gemini rate limit exceeded. Please try again later.', 'RATE_LIMIT', 429);
    }

    if (statusCode === 401 || statusCode === 403) {
      return new ModelAPIError('Gemini authentication failed. Please check your API key.', 'AUTH_ERROR', statusCode);
    }

    if (statusCode === 400) {
      return new ModelAPIError(`Invalid Gemini request: ${message}`, 'INVALID_REQUEST', 400);
    }

    return new ModelAPIError(message, statusCode ? 'API_ERROR' : 'NETWORK_ERROR', statusCode);
  }

  /**
   * Create message using OpenAI API (also works for Gemini via OpenAI-compatible API)
   */
  private async createOpenAIMessage(params: ModelRequest): Promise<ModelResponse> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      logger.debug(`Sending request to ${this.provider} (model: ${params.model})`);

      if (this.openaiAPIMode === 'responses') {
        return await this.createOpenAIResponseAPINonStream(params);
      }

      if (this.openaiAPIMode === 'chat.completions') {
        return await this.createOpenAIChatCompletionMessage(params);
      }

      if (this.shouldPreferOpenAIResponsesAPI(params.model)) {
        try {
          return await this.createOpenAIResponseAPINonStream(params);
        } catch (error) {
          if (!this.shouldFallbackOpenAIEndpoint(error)) {
            throw error;
          }
          logger.warn('[ModelAPI] Responses API unavailable, falling back to chat.completions', {
            provider: this.provider,
            model: params.model,
            error: error instanceof Error ? error.message : String(error),
          });
          return await this.createOpenAIChatCompletionMessage(params);
        }
      }

      try {
        return await this.createOpenAIChatCompletionMessage(params);
      } catch (error) {
        if (!this.shouldFallbackOpenAIEndpoint(error)) {
          throw error;
        }
        logger.warn('[ModelAPI] chat.completions unavailable, falling back to Responses API', {
          provider: this.provider,
          model: params.model,
          error: error instanceof Error ? error.message : String(error),
        });
        return await this.createOpenAIResponseAPINonStream(params);
      }
    } catch (error) {
      throw this.handleOpenAIError(error);
    }
  }

  private async createOpenAIChatCompletionMessage(params: ModelRequest): Promise<ModelResponse> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const messages = this.convertMessagesToOpenAIFormat(params.messages, params.systemPrompt);
    const toolsParam = this.buildOpenAIChatTools(params.tools);

    const response = await this.openai.chat.completions.create({
      model: params.model,
      messages: messages as any,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      tools: toolsParam,
    });

    logger.info(
      `Received chat.completions response from ${this.provider} (tokens: ${response.usage?.prompt_tokens}/${response.usage?.completion_tokens})`
    );

    return this.parseOpenAIResponse(response);
  }

  private async createOpenAIResponseAPINonStream(params: ModelRequest): Promise<ModelResponse> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const responseInput = this.convertMessagesToOpenAIResponseInput(params.messages);
    const toolsParam = this.buildOpenAIResponsesTools(params.tools);
    const response = await this.openai.responses.create({
      model: params.model as any,
      input: responseInput as any,
      instructions: params.systemPrompt || undefined,
      max_output_tokens: params.maxTokens,
      temperature: params.temperature,
      tools: toolsParam as any,
      parallel_tool_calls: toolsParam?.length ? true : undefined,
    });

    logger.info(
      `Received Responses API response from ${this.provider} (tokens: ${response.usage?.input_tokens}/${response.usage?.output_tokens})`
    );

    return this.parseOpenAIResponsesAPIResponse(response);
  }

  private buildOpenAIChatTools(tools?: any[]): any[] | undefined {
    return tools?.length
      ? tools.map((t: any) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema || t.parameters || {},
          },
        }))
      : undefined;
  }

  private buildOpenAIResponsesTools(tools?: any[]): any[] | undefined {
    return tools?.length
      ? tools.map((t: any) => ({
          type: 'function' as const,
          name: t.name,
          description: t.description,
          parameters: t.input_schema || t.parameters || {},
          strict: false,
        }))
      : undefined;
  }

  /**
   * Convert internal message format to OpenAI format
   */
  private convertMessagesToOpenAIFormat(
    messages: Message[],
    systemPrompt?: string
  ): Array<Record<string, any>> {
    const result: Array<Record<string, any>> = [];

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
      if (m.role === 'system') continue;

      if (m.role === 'assistant' && m.metadata?.toolCalls) {
        // Assistant message with tool calls
        // Include reasoning_content for DeepSeek reasoner within the same tool-call turn
        // But clear it if this is from a previous user turn (next message is 'user')
        const nextNonTool = messages.slice(i + 1).find(nm => nm.role !== 'tool');
        const isCurrentTurn = !nextNonTool || nextNonTool.role !== 'user';
        const msg: Record<string, any> = {
          role: 'assistant',
          content: (typeof m.content === 'string' ? m.content : '') || null,
          tool_calls: (m.metadata.toolCalls as any[]).map((tc: any) => ({
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
      } else if (m.role === 'tool') {
        // Tool result message
        result.push({
          role: 'tool',
          tool_call_id: m.metadata?.tool_call_id || '',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        });
      } else {
        // Regular user/assistant message
        result.push({
          role: m.role as 'user' | 'assistant',
          content: this.buildOpenAIContent(m.content),
        });
      }
    }

    return result;
  }

  /**
   * Convert internal message format to OpenAI Responses API input items.
   * Keeps tool calls and tool results as explicit function_call items so
   * response-only compatible backends can continue multi-turn tool loops.
   */
  private convertMessagesToOpenAIResponseInput(messages: Message[]): Array<Record<string, any>> {
    const result: Array<Record<string, any>> = [];
    const seenFunctionCallIds = new Set<string>();

    for (const m of messages) {
      if (m.role === 'system') continue;

      if (m.role === 'assistant' && m.metadata?.toolCalls) {
        if (typeof m.content === 'string' && m.content) {
          result.push({
            type: 'message',
            role: 'assistant',
            content: m.content,
          });
        }

        for (const tc of m.metadata.toolCalls as any[]) {
          if (!tc.id) {
            continue;
          }
          seenFunctionCallIds.add(tc.id);
          result.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.input || {}),
          });
        }
        continue;
      }

      if (m.role === 'tool') {
        const callId = m.metadata?.tool_call_id || '';
        if (!callId || !seenFunctionCallIds.has(callId)) {
          logger.warn(
            `[ModelAPI] Skipping orphan function_call_output with unknown call_id=${callId || '(missing)'}`
          );
          continue;
        }
        result.push({
          type: 'function_call_output',
          call_id: callId,
          output: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        });
        continue;
      }

      if (Array.isArray(m.content)) {
        const messageContent: Array<Record<string, any>> = [];
        const assistantToolCalls: Array<Record<string, any>> = [];
        const toolOutputs: Array<Record<string, any>> = [];

        for (const block of m.content as any[]) {
          if (block.type === 'tool_use' && m.role === 'assistant') {
            if (!block.id) {
              continue;
            }
            seenFunctionCallIds.add(block.id);
            assistantToolCalls.push({
              type: 'function_call',
              call_id: block.id,
              name: block.name,
              arguments: JSON.stringify(block.input || {}),
            });
            continue;
          }

          if (block.type === 'tool_result') {
            if (!block.tool_use_id || !seenFunctionCallIds.has(block.tool_use_id)) {
              logger.warn(
                `[ModelAPI] Skipping orphan tool_result block with unknown call_id=${block.tool_use_id || '(missing)'}`
              );
              continue;
            }
            toolOutputs.push({
              type: 'function_call_output',
              call_id: block.tool_use_id,
              output: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
            });
            continue;
          }

          const responseBlock = this.buildOpenAIResponseInputBlock(block);
          if (responseBlock) {
            messageContent.push(responseBlock);
          }
        }

        if (messageContent.length > 0) {
          result.push({
            type: 'message',
            role: m.role,
            content: messageContent,
          });
        }

        if (assistantToolCalls.length > 0) {
          result.push(...assistantToolCalls);
        }

        if (toolOutputs.length > 0) {
          result.push(...toolOutputs);
        }
        continue;
      }

      result.push({
        type: 'message',
        role: m.role,
        content: this.buildOpenAIResponseInputContent(m.content),
      });
    }

    return result;
  }

  private parseOpenAIResponse(response: any): ModelResponse {
    const choice = response.choices[0];
    const message = choice.message;

    // Some OpenAI-compatible backends return structured content arrays instead of a plain string.
    const textContent = this.normalizeTextContent(message.content);

    // Extract reasoning_content (DeepSeek reasoner)
    const reasoningContent = this.normalizeTextContent(message.reasoning_content) || undefined;

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

  private parseOpenAIResponsesAPIResponse(response: any): ModelResponse {
    const toolCalls = this.extractOpenAIResponseAPIToolCalls(response.output || []);
    const reasoningContent = this.extractOpenAIResponsesReasoning(response.output || []);
    const stopReason = this.normalizeOpenAIResponsesStopReason(response);

    return {
      type: toolCalls.length > 0 ? 'tool_calls' : 'text',
      content: response.output_text || this.extractOpenAIResponsesText(response.output || []),
      reasoningContent: reasoningContent || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
      },
      stopReason,
    };
  }

  /**
   * Extract tool calls from OpenAI response (Phase 2)
   */
  private extractOpenAIToolCalls(toolCalls: any[]): ToolCall[] {
    return toolCalls.map((call) => ({
      id: call.id,
      name: call.function.name,
      input: this.parseToolCallArguments(call.function.arguments),
    }));
  }

  private extractOpenAIResponseAPIToolCalls(output: any[]): ToolCall[] {
    return output
      .filter((item: any) => item?.type === 'function_call')
      .map((item: any) => ({
        id: item.call_id || item.id,
        name: item.name,
        input: this.parseToolCallArguments(item.arguments),
      }));
  }

  private extractOpenAIResponsesText(output: any[]): string {
    return output
      .filter((item: any) => item?.type === 'message')
      .map((item: any) => this.normalizeTextContent(item.content || []))
      .filter(Boolean)
      .join('');
  }

  private extractOpenAIResponsesReasoning(output: any[]): string {
    return output
      .filter((item: any) => item?.type === 'reasoning')
      .map((item: any) => this.normalizeTextContent(item.summary || item.content || []))
      .filter(Boolean)
      .join('');
  }

  private normalizeOpenAIResponsesStopReason(response: any): string | undefined {
    const reason = response?.incomplete_details?.reason;
    if (reason === 'max_output_tokens') {
      return 'max_tokens';
    }
    if (reason) {
      return reason;
    }
    return response?.status || undefined;
  }

  private parseToolCallArguments(raw: string | Record<string, any> | undefined): Record<string, any> {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      logger.warn('[ModelAPI] Failed to parse tool call arguments as JSON', { raw });
      return {};
    }
  }

  private buildOpenAIResponseInputContent(content: MessageContent): string | any[] {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return JSON.stringify(content);

    const blocks = content
      .map((block: any) => this.buildOpenAIResponseInputBlock(block))
      .filter(Boolean);

    return blocks.length > 0 ? blocks : JSON.stringify(content);
  }

  private buildOpenAIResponseInputBlock(block: any): Record<string, any> | null {
    if (!block) return null;

    if (typeof block === 'string') {
      return { type: 'input_text', text: block };
    }

    if (block.type === 'text' || block.type === 'input_text' || block.type === 'output_text') {
      return { type: 'input_text', text: block.text || '' };
    }

    if (block.type === 'refusal') {
      return { type: 'input_text', text: block.refusal || '' };
    }

    if (block.type === 'image') {
      if (block.source?.type === 'url') {
        return {
          type: 'input_image',
          image_url: block.source.data,
          detail: 'auto',
        };
      }

      if (block.source?.type === 'base64') {
        const mediaType = block.source.media_type || 'image/jpeg';
        return {
          type: 'input_image',
          image_url: `data:${mediaType};base64,${block.source.data}`,
          detail: 'auto',
        };
      }
    }

    if (block.type === 'file') {
      const fname = block.source?.filename || block.source?.url || 'unknown';
      return { type: 'input_text', text: `[File: ${fname}]` };
    }

    return null;
  }

  private shouldPreferOpenAIResponsesAPI(model: string): boolean {
    if (this.provider !== 'openai') {
      return false;
    }

    const baseURL = (this.configuredBaseURL || 'https://api.openai.com/v1').toLowerCase();
    if (baseURL.includes('api.openai.com')) {
      return true;
    }

    const lowerModel = model.toLowerCase();
    return /^o[134]/.test(lowerModel) || lowerModel.startsWith('gpt-5');
  }

  private shouldFallbackOpenAIEndpoint(error: any): boolean {
    const statusCode = error?.status || error?.statusCode;
    const message = String(error?.message || '').toLowerCase();

    if ([404, 405, 501].includes(statusCode)) {
      return true;
    }

    if (statusCode === 400) {
      return [
        'not found',
        'unknown url',
        'invalid endpoint',
        'unsupported',
        'not supported',
        'unsupported parameter',
      ].some((keyword) => message.includes(keyword));
    }

    return false;
  }

  /**
   * Handle OpenAI API errors
   */
  private handleOpenAIError(error: any): ModelAPIError {
    // OpenAI SDK errors
    if (error.status) {
      const statusCode = error.status;

      // Rate limit
      if (statusCode === 429) {
        logger.error('Rate limit exceeded');
        return new ModelAPIError(
          'Rate limit exceeded. Please try again later.',
          'RATE_LIMIT',
          429
        );
      }

      // Authentication
      if (statusCode === 401) {
        logger.error('Invalid API key');
        return new ModelAPIError(
          'Invalid API key. Please check your configuration.',
          'INVALID_API_KEY',
          401
        );
      }

      // Invalid request
      if (statusCode === 400) {
        logger.error(`Invalid request: ${error.message}`);
        return new ModelAPIError(
          `Invalid request: ${error.message}`,
          'INVALID_REQUEST',
          400
        );
      }

      // Server error
      if (statusCode >= 500) {
        logger.error(`Server error: ${error.message}`);
        return new ModelAPIError(
          `Server error: ${error.message}`,
          'SERVER_ERROR',
          statusCode
        );
      }

      // Other API errors
      logger.error(`API error: ${error.message}`);
      return new ModelAPIError(
        `API error: ${error.message}`,
        'API_ERROR',
        statusCode
      );
    }

    // Network or other errors
    if (error instanceof Error) {
      logger.error(`Network error: ${error.message}`);
      return new ModelAPIError(
        `Network error: ${error.message}`,
        'NETWORK_ERROR'
      );
    }

    // Unknown error
    logger.error('Unknown error occurred');
    return new ModelAPIError(
      'An unknown error occurred',
      'UNKNOWN_ERROR'
    );
  }

  /**
   * Handle Anthropic API errors
   */
  private handleAnthropicError(error: any): ModelAPIError {
    // Log the full error object for debugging
    logger.error('[ModelAPI] Handling Anthropic error:', {
      isAPIError: error instanceof Anthropic.APIError,
      errorConstructor: error?.constructor?.name,
      status: error?.status,
      message: error?.message,
      headers: error?.headers,
      error: error?.error,
    });

    if (error instanceof Anthropic.APIError) {
      const statusCode = error.status;

      // Rate limit
      if (statusCode === 429) {
        logger.error('[ModelAPI] Rate limit exceeded (429)');
        return new ModelAPIError(
          'Rate limit exceeded. Please try again later.',
          'RATE_LIMIT',
          429
        );
      }

      // Authentication
      if (statusCode === 401) {
        logger.error('[ModelAPI] Invalid API key (401)');
        return new ModelAPIError(
          'Invalid API key. Please check your configuration.',
          'INVALID_API_KEY',
          401
        );
      }

      // Not Found - likely baseURL issue
      if (statusCode === 404) {
        logger.error('[ModelAPI] Not Found (404) - Check baseURL configuration', {
          message: error.message,
          hint: 'The baseURL might be incorrect. SDK appends /v1/messages to baseURL.',
        });
        return new ModelAPIError(
          `Not Found (404): ${error.message}. Check if baseURL is correct - SDK appends /v1/messages to it.`,
          'NOT_FOUND',
          404
        );
      }

      // Invalid request
      if (statusCode === 400) {
        logger.error(`[ModelAPI] Invalid request (400): ${error.message}`);
        return new ModelAPIError(
          `Invalid request: ${error.message}`,
          'INVALID_REQUEST',
          400
        );
      }

      // Server error
      if (statusCode && statusCode >= 500) {
        logger.error(`[ModelAPI] Server error (${statusCode}): ${error.message}`);
        return new ModelAPIError(
          `Server error: ${error.message}`,
          'SERVER_ERROR',
          statusCode
        );
      }

      // Other API errors
      logger.error(`[ModelAPI] API error (${statusCode}): ${error.message}`);
      return new ModelAPIError(
        `API error: ${error.message}`,
        'API_ERROR',
        statusCode
      );
    }

    // Network or other errors
    if (error instanceof Error) {
      logger.error(`[ModelAPI] Network/Unknown error: ${error.message}`, {
        name: error.name,
        stack: error.stack?.substring(0, 300),
      });
      return new ModelAPIError(
        `Network error: ${error.message}`,
        'NETWORK_ERROR'
      );
    }

    // Unknown error
    logger.error('[ModelAPI] Unknown error occurred', { error });
    return new ModelAPIError(
      'An unknown error occurred',
      'UNKNOWN_ERROR'
    );
  }

  // ===== Multimodal Content Helpers =====

  /**
   * Build Anthropic-format content from MessageContent.
   * Handles string, image blocks, file blocks, and fallback.
   */
  private buildAnthropicContent(content: MessageContent): string | any[] {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return JSON.stringify(content);

    // Check if the array contains multimodal blocks
    const hasMultimodal = content.some(
      (b: any) => b.type === 'image' || b.type === 'file'
    );
    if (!hasMultimodal) return JSON.stringify(content);

    const blocks: any[] = [];
    for (const block of content as any[]) {
      if (block.type === 'text') {
        blocks.push({ type: 'text', text: block.text });
      } else if (block.type === 'image') {
        if (block.source?.type === 'base64') {
          blocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: block.source.media_type || 'image/jpeg',
              data: block.source.data,
            },
          });
        } else if (block.source?.type === 'url') {
          // Anthropic doesn't support URL images in most cases.
          // Images should have been pre-downloaded to base64 in buildUserContent().
          // If we still get a URL here, degrade to text description.
          logger.warn(`[ModelAPI] Image URL passed to Anthropic converter without pre-download, degrading to text: ${block.source.data}`);
          blocks.push({ type: 'text', text: `[Image: ${block.source.data}]` });
        }
      } else if (block.type === 'file') {
        // Anthropic doesn't support file uploads â€?degrade to text description
        const fname = block.source?.filename || block.source?.url || 'unknown';
        blocks.push({ type: 'text', text: `[File: ${fname}]` });
      } else {
        // Pass through (e.g. tool_use)
        blocks.push(block);
      }
    }
    return blocks.length > 0 ? blocks : JSON.stringify(content);
  }

  /**
   * Build OpenAI-format content from MessageContent.
   * Handles string, image blocks (as image_url), file blocks (as text).
   */
  private buildOpenAIContent(content: MessageContent): string | any[] {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return JSON.stringify(content);

    const blocks: any[] = [];
    let hasNonTextBlock = false;

    for (const block of content as any[]) {
      if (typeof block === 'string') {
        blocks.push({ type: 'text', text: block });
        continue;
      }

      if (block.type === 'text' || block.type === 'input_text' || block.type === 'output_text') {
        blocks.push({ type: 'text', text: block.text || '' });
      } else if (block.type === 'image') {
        hasNonTextBlock = true;
        if (block.source?.type === 'url') {
          blocks.push({
            type: 'image_url',
            image_url: { url: block.source.data },
          });
        } else if (block.source?.type === 'base64') {
          const mediaType = block.source.media_type || 'image/jpeg';
          blocks.push({
            type: 'image_url',
            image_url: { url: `data:${mediaType};base64,${block.source.data}` },
          });
        }
      } else if (block.type === 'file') {
        hasNonTextBlock = true;
        const fname = block.source?.filename || block.source?.url || 'unknown';
        blocks.push({ type: 'text', text: `[File: ${fname}]` });
      } else if (block.type === 'refusal') {
        blocks.push({ type: 'text', text: block.refusal || '' });
      } else {
        const normalized = this.normalizeTextContent(block);
        if (normalized) {
          blocks.push({ type: 'text', text: normalized });
        } else {
          blocks.push({ type: 'text', text: JSON.stringify(block) });
        }
      }
    }

    if (!blocks.length) {
      return JSON.stringify(content);
    }

    if (!hasNonTextBlock) {
      return blocks.map((block) => block.text || '').join('');
    }

    return blocks;
  }

  /**
   * Download a remote image URL to base64.
   * Returns null on failure (caller should degrade to text).
   */
  async downloadToBase64(url: string): Promise<{ media_type: string; data: string } | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        logger.warn(`[ModelAPI] Failed to download image: HTTP ${response.status}`);
        return null;
      }

      // Check content length (limit 5MB)
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
        logger.warn(`[ModelAPI] Image too large (${contentLength} bytes), skipping download`);
        return null;
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > 5 * 1024 * 1024) {
        logger.warn(`[ModelAPI] Image too large (${buffer.byteLength} bytes), skipping`);
        return null;
      }

      const base64 = Buffer.from(buffer).toString('base64');
      const media_type = response.headers.get('content-type') || 'image/jpeg';

      return { media_type, data: base64 };
    } catch (error) {
      logger.warn(`[ModelAPI] Failed to download image from ${url}:`, error);
      return null;
    }
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
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
    } catch (error) {
      logger.error('API connection test failed:', error);
      return false;
    }
  }

  // ===== Streaming Implementation =====

  /**
   * Create streaming message using Anthropic API
   */
  private async *createAnthropicMessageStream(
    params: ModelRequest,
    streamingHandler?: StreamingHandler
  ): AsyncGenerator<ModelStreamChunk, void, undefined> {
    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized');
    }

    this.resetStreamAccumulator();
    const messageId = `msg_${Date.now()}`;

    try {
      const messages = this.convertMessagesToAnthropicFormat(params.messages);

      // Log streaming request details
      logger.info('[ModelAPI] Sending streaming request to Anthropic', {
        model: params.model,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        messageCount: messages.length,
        toolsCount: params.tools?.length || 0,
      });

      // Create streaming request
      const stream = await (this.anthropic as any).messages.stream({
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
      let currentToolId: string | null = null;
      let currentToolName: string | null = null;
      let currentToolInput = '';

      // Process stream events
      for await (const event of stream) {
        switch (event.type) {
          case 'content_block_start':
            if (event.content_block?.type === 'text') {
              yield { type: 'text_start' };
            } else if (event.content_block?.type === 'tool_use') {
              currentToolId = event.content_block.id;
              currentToolName = event.content_block.name;
              currentToolInput = '';
              streamingHandler?.emitToolStart(currentToolId!, currentToolName!, {});
              yield {
                type: 'tool_use_start',
                toolCall: { id: currentToolId!, name: currentToolName! },
              };
            }
            break;

          case 'content_block_delta':
            if (event.delta?.type === 'text_delta') {
              const delta = event.delta.text || '';
              this.streamAccumulator.content += delta;
              streamingHandler?.emitMessageUpdate(messageId, delta, 'text_delta');
              yield { type: 'text_delta', delta };
            } else if (event.delta?.type === 'input_json_delta') {
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
              } catch {
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
            } else {
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

            streamingHandler?.emitMessageEnd(
              messageId,
              this.streamAccumulator.content,
              (this.streamAccumulator.stopReason as any) || 'end_turn',
              {
                inputTokens: this.streamAccumulator.inputTokens,
                outputTokens: this.streamAccumulator.outputTokens,
              }
            );

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

      logger.info(
        `[ModelAPI] Streaming completed (tokens: ${this.streamAccumulator.inputTokens}/${this.streamAccumulator.outputTokens})`
      );
    } catch (error: any) {
      // Enhanced error logging for streaming - use console.log for guaranteed visibility
      const errorDetails = {
        errorName: error?.name,
        errorMessage: error?.message,
        errorStatus: error?.status,
        errorType: error?.type,
        errorCode: error?.error?.type || error?.code,
        errorDetails: error?.error?.message || error?.error,
        configuredBaseURL: this.configuredBaseURL || '(default)',
        expectedRequestURL: this.configuredBaseURL
          ? `${this.configuredBaseURL}/v1/messages`
          : 'https://api.anthropic.com/v1/messages',
      };

      console.log('[ModelAPI] ========== ANTHROPIC STREAMING ERROR ==========');
      console.log('[ModelAPI] Error details:', JSON.stringify(errorDetails, null, 2));
      console.log('[ModelAPI] Raw error:', error);
      console.log('[ModelAPI] ================================================');

      logger.error('[ModelAPI] Anthropic streaming error occurred', errorDetails);

      streamingHandler?.emitError(
        'STREAM_ERROR',
        error instanceof Error ? error.message : 'Unknown streaming error'
      );
      throw this.handleAnthropicError(error);
    }
  }

  /**
   * Create streaming message using OpenAI API
   */
  private async *createOpenAIMessageStream(
    params: ModelRequest,
    streamingHandler?: StreamingHandler
  ): AsyncGenerator<ModelStreamChunk, void, undefined> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      if (this.openaiAPIMode === 'responses') {
        yield* this.createOpenAIResponsesMessageStream(params, streamingHandler);
        return;
      }

      if (this.openaiAPIMode === 'chat.completions') {
        yield* this.createOpenAIChatCompletionMessageStream(params, streamingHandler);
        return;
      }

      if (this.shouldPreferOpenAIResponsesAPI(params.model)) {
        try {
          yield* this.createOpenAIResponsesMessageStream(params, streamingHandler);
          return;
        } catch (error) {
          if (!this.shouldFallbackOpenAIEndpoint(error)) {
            throw error;
          }
          logger.warn('[ModelAPI] Responses API stream unavailable, falling back to chat.completions stream', {
            provider: this.provider,
            model: params.model,
            error: error instanceof Error ? error.message : String(error),
          });
          yield* this.createOpenAIChatCompletionMessageStream(params, streamingHandler);
          return;
        }
      }

      try {
        yield* this.createOpenAIChatCompletionMessageStream(params, streamingHandler);
      } catch (error) {
        if (!this.shouldFallbackOpenAIEndpoint(error)) {
          throw error;
        }
        logger.warn('[ModelAPI] chat.completions stream unavailable, falling back to Responses API stream', {
          provider: this.provider,
          model: params.model,
          error: error instanceof Error ? error.message : String(error),
        });
        yield* this.createOpenAIResponsesMessageStream(params, streamingHandler);
      }
    } catch (error) {
      streamingHandler?.emitError(
        'STREAM_ERROR',
        error instanceof Error ? error.message : 'Unknown streaming error'
      );
      throw this.handleOpenAIError(error);
    }
  }

  private async *createOpenAIChatCompletionMessageStream(
    params: ModelRequest,
    streamingHandler?: StreamingHandler
  ): AsyncGenerator<ModelStreamChunk, void, undefined> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    this.resetStreamAccumulator();
    const messageId = `msg_${Date.now()}`;

    logger.debug(`Sending chat.completions stream to ${this.provider} (model: ${params.model})`);

    const messages = this.convertMessagesToOpenAIFormat(params.messages, params.systemPrompt);
    const toolsParam = this.buildOpenAIChatTools(params.tools);
    const stream = await this.openai.chat.completions.create({
      model: params.model,
      messages: messages as any,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      tools: toolsParam,
      stream: true,
      stream_options: { include_usage: true },
    });

    streamingHandler?.emitMessageStart(messageId);
    yield { type: 'message_start', messageId };

    const toolCallBuilders: Map<number, { id: string; name: string; arguments: string }> = new Map();

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      const delta = choice?.delta;

      if (delta?.content) {
        const text = delta.content;
        this.streamAccumulator.content += text;
        streamingHandler?.emitMessageUpdate(messageId, text, 'text_delta');
        yield { type: 'text_delta', delta: text };
      }

      if ((delta as any)?.reasoning_content) {
        const reasoning = (delta as any).reasoning_content;
        this.streamAccumulator.reasoningContent += reasoning;
        streamingHandler?.emitMessageUpdate(messageId, reasoning, 'thinking_delta');
        yield { type: 'thinking_delta', delta: reasoning };
      }

      if (delta?.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          const index = toolCall.index;

          if (!toolCallBuilders.has(index)) {
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

          const builder = toolCallBuilders.get(index)!;

          if (toolCall.id) {
            builder.id = toolCall.id;
          }

          if (toolCall.function?.name) {
            builder.name = toolCall.function.name;
          }

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

      if (choice?.finish_reason) {
        this.streamAccumulator.stopReason = choice.finish_reason;

        for (const builder of toolCallBuilders.values()) {
          this.streamAccumulator.toolCalls.push({
            id: builder.id,
            name: builder.name,
            input: this.parseToolCallArguments(builder.arguments),
          });
          yield { type: 'tool_use_end', toolCall: { id: builder.id, name: builder.name } };
        }
      }

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

    streamingHandler?.emitMessageEnd(
      messageId,
      this.streamAccumulator.content,
      (this.streamAccumulator.stopReason as any) || 'end_turn',
      {
        inputTokens: this.streamAccumulator.inputTokens,
        outputTokens: this.streamAccumulator.outputTokens,
      }
    );

    yield {
      type: 'message_end',
      stopReason: this.streamAccumulator.stopReason,
      usage: {
        inputTokens: this.streamAccumulator.inputTokens,
        outputTokens: this.streamAccumulator.outputTokens,
      },
    };

    logger.info(
      `Chat completion stream completed (tokens: ${this.streamAccumulator.inputTokens}/${this.streamAccumulator.outputTokens})`
    );
  }

  private async *createOpenAIResponsesMessageStream(
    params: ModelRequest,
    streamingHandler?: StreamingHandler
  ): AsyncGenerator<ModelStreamChunk, void, undefined> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    this.resetStreamAccumulator();
    const messageId = `msg_${Date.now()}`;

    logger.debug(`Sending Responses API stream to ${this.provider} (model: ${params.model})`);

    const responseInput = this.convertMessagesToOpenAIResponseInput(params.messages);
    const toolsParam = this.buildOpenAIResponsesTools(params.tools);
    const stream = await this.openai.responses.create({
      model: params.model as any,
      input: responseInput as any,
      instructions: params.systemPrompt || undefined,
      max_output_tokens: params.maxTokens,
      temperature: params.temperature,
      tools: toolsParam as any,
      parallel_tool_calls: toolsParam?.length ? true : undefined,
      stream: true,
    });

    streamingHandler?.emitMessageStart(messageId);
    yield { type: 'message_start', messageId };

    const toolCallBuilders = new Map<
      string,
      { id: string; name: string; arguments: string; finalized: boolean }
    >();

    const finalizeToolCall = async function* (
      self: ModelAPI,
      builderKey: string
    ): AsyncGenerator<ModelStreamChunk, void, undefined> {
      const builder = toolCallBuilders.get(builderKey);
      if (!builder || builder.finalized) {
        return;
      }

      builder.finalized = true;
      self.streamAccumulator.toolCalls.push({
        id: builder.id,
        name: builder.name,
        input: self.parseToolCallArguments(builder.arguments),
      });
      yield { type: 'tool_use_end', toolCall: { id: builder.id, name: builder.name } };
    };

    for await (const event of stream as any) {
      switch (event.type) {
        case 'response.output_text.delta': {
          this.streamAccumulator.content += event.delta;
          streamingHandler?.emitMessageUpdate(messageId, event.delta, 'text_delta');
          yield { type: 'text_delta', delta: event.delta };
          break;
        }

        case 'response.reasoning.delta':
        case 'response.reasoning_summary.delta':
        case 'response.reasoning_summary_text.delta': {
          this.streamAccumulator.reasoningContent += event.delta;
          streamingHandler?.emitMessageUpdate(messageId, event.delta, 'thinking_delta');
          yield { type: 'thinking_delta', delta: event.delta };
          break;
        }

        case 'response.output_item.added': {
          if (event.item?.type !== 'function_call') {
            break;
          }

          const builderKey = event.item.id || event.item.call_id || String(event.output_index);
          if (!toolCallBuilders.has(builderKey)) {
            toolCallBuilders.set(builderKey, {
              id: event.item.call_id || event.item.id,
              name: event.item.name || '',
              arguments: event.item.arguments || '',
              finalized: false,
            });

            if (event.item.call_id && event.item.name) {
              streamingHandler?.emitToolStart(event.item.call_id, event.item.name, {});
              yield {
                type: 'tool_use_start',
                toolCall: { id: event.item.call_id, name: event.item.name },
              };
            }
          }
          break;
        }

        case 'response.function_call_arguments.delta': {
          const builder = toolCallBuilders.get(event.item_id);
          if (builder) {
            builder.arguments += event.delta;
            yield {
              type: 'tool_use_delta',
              toolCall: { id: builder.id, name: builder.name },
              delta: event.delta,
            };
          }
          break;
        }

        case 'response.function_call_arguments.done': {
          const builder = toolCallBuilders.get(event.item_id);
          if (builder) {
            builder.arguments = event.arguments || builder.arguments;
          }
          break;
        }

        case 'response.output_item.done': {
          if (event.item?.type === 'function_call') {
            const builderKey = event.item.id || event.item.call_id || String(event.output_index);
            const builder = toolCallBuilders.get(builderKey);
            if (builder) {
              builder.id = event.item.call_id || builder.id;
              builder.name = event.item.name || builder.name;
              builder.arguments = event.item.arguments || builder.arguments;
            } else {
              toolCallBuilders.set(builderKey, {
                id: event.item.call_id || event.item.id,
                name: event.item.name || '',
                arguments: event.item.arguments || '',
                finalized: false,
              });
            }

            yield* finalizeToolCall(this, builderKey);
          }
          break;
        }

        case 'response.completed': {
          this.streamAccumulator.stopReason = this.normalizeOpenAIResponsesStopReason(event.response);
          this.streamAccumulator.content =
            event.response.output_text || this.streamAccumulator.content;

          const reasoningText = this.extractOpenAIResponsesReasoning(event.response.output || []);
          if (reasoningText && !this.streamAccumulator.reasoningContent) {
            this.streamAccumulator.reasoningContent = reasoningText;
          }

          this.streamAccumulator.inputTokens = event.response.usage?.input_tokens || 0;
          this.streamAccumulator.outputTokens = event.response.usage?.output_tokens || 0;

          for (const builderKey of toolCallBuilders.keys()) {
            yield* finalizeToolCall(this, builderKey);
          }

          yield {
            type: 'usage',
            usage: {
              inputTokens: this.streamAccumulator.inputTokens,
              outputTokens: this.streamAccumulator.outputTokens,
            },
          };
          break;
        }

        case 'error':
          throw new Error(event.message || 'Unknown Responses API stream error');
      }
    }

    streamingHandler?.emitMessageEnd(
      messageId,
      this.streamAccumulator.content,
      (this.streamAccumulator.stopReason as any) || 'end_turn',
      {
        inputTokens: this.streamAccumulator.inputTokens,
        outputTokens: this.streamAccumulator.outputTokens,
      }
    );

    yield {
      type: 'message_end',
      stopReason: this.streamAccumulator.stopReason,
      usage: {
        inputTokens: this.streamAccumulator.inputTokens,
        outputTokens: this.streamAccumulator.outputTokens,
      },
    };

    logger.info(
      `Responses API stream completed (tokens: ${this.streamAccumulator.inputTokens}/${this.streamAccumulator.outputTokens})`
    );
  }

  // ===== Native HTTP Implementation (bypassing SDK) =====

  /**
   * Create message using native HTTP request (non-streaming)
   */
  private async createAnthropicMessageNative(params: ModelRequest): Promise<ModelResponse> {
    // Append /v1/messages if not already present (same behavior as SDK)
    let url = this.configuredBaseURL!;
    if (!url.endsWith('/v1/messages')) {
      url = url.replace(/\/$/, '') + '/v1/messages';
    }
    const messages = this.trimMessagesToBodyLimit(
      this.convertMessagesToAnthropicFormat(params.messages),
      params.systemPrompt,
      params.tools
    );

    const requestBody = {
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      system: params.systemPrompt,
      messages,
      tools: params.tools,
    };

    logger.info('[ModelAPI] Native HTTP request to:', url, `(body ~${JSON.stringify(requestBody).length} bytes)`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[ModelAPI] Native HTTP error:', { status: response.status, body: errorText });
        throw new ModelAPIError(
          `HTTP ${response.status}: ${errorText}`,
          'HTTP_ERROR',
          response.status
        );
      }

      const data = await response.json() as any;
      logger.info('[ModelAPI] Native HTTP response received', {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      });

      return this.parseAnthropicResponse(data);
    } catch (error: any) {
      if (error instanceof ModelAPIError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('[ModelAPI] Native HTTP error:', msg);
      throw new ModelAPIError(msg || 'Network error', 'NETWORK_ERROR');
    }
  }

  /**
   * Create streaming message using native HTTP request (SSE)
   */
  private async *createAnthropicMessageStreamNative(
    params: ModelRequest,
    streamingHandler?: StreamingHandler
  ): AsyncGenerator<ModelStreamChunk, void, undefined> {
    this.resetStreamAccumulator();
    const messageId = `msg_${Date.now()}`;

    // Append /v1/messages if not already present (same behavior as SDK)
    let url = this.configuredBaseURL!;
    if (!url.endsWith('/v1/messages')) {
      url = url.replace(/\/$/, '') + '/v1/messages';
    }

    const messages = this.trimMessagesToBodyLimit(
      this.convertMessagesToAnthropicFormat(params.messages),
      params.systemPrompt,
      params.tools
    );

    const requestBody = {
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      system: params.systemPrompt,
      messages,
      tools: params.tools,
      stream: true,
    };

    logger.info('[ModelAPI] Native HTTP streaming request to:', url, `(body ~${JSON.stringify(requestBody).length} bytes)`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[ModelAPI] Native HTTP streaming error:', { status: response.status, body: errorText });
        throw new ModelAPIError(
          `HTTP ${response.status}: ${errorText}`,
          'HTTP_ERROR',
          response.status
        );
      }

      if (!response.body) {
        throw new ModelAPIError('No response body for streaming', 'STREAM_ERROR');
      }

      // Emit message start
      streamingHandler?.emitMessageStart(messageId);
      yield { type: 'message_start', messageId };

      // Track current tool use block
      let currentToolId: string | null = null;
      let currentToolName: string | null = null;
      let currentToolInput = '';

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;

            try {
              const event = JSON.parse(jsonStr);

              switch (event.type) {
                case 'message_start':
                  // Already emitted
                  break;

                case 'content_block_start':
                  if (event.content_block?.type === 'text') {
                    yield { type: 'text_start' };
                  } else if (event.content_block?.type === 'tool_use') {
                    currentToolId = event.content_block.id;
                    currentToolName = event.content_block.name;
                    currentToolInput = '';
                    streamingHandler?.emitToolStart(currentToolId!, currentToolName!, {});
                    yield {
                      type: 'tool_use_start',
                      toolCall: { id: currentToolId!, name: currentToolName! },
                    };
                  }
                  break;

                case 'content_block_delta':
                  if (event.delta?.type === 'text_delta') {
                    const delta = event.delta.text || '';
                    this.streamAccumulator.content += delta;
                    streamingHandler?.emitMessageUpdate(messageId, delta, 'text_delta');
                    yield { type: 'text_delta', delta };
                  } else if (event.delta?.type === 'input_json_delta') {
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
                    try {
                      const input = currentToolInput ? JSON.parse(currentToolInput) : {};
                      this.streamAccumulator.toolCalls.push({
                        id: currentToolId,
                        name: currentToolName,
                        input,
                      });
                    } catch {
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
                  } else {
                    yield { type: 'text_end' };
                  }
                  break;

                case 'message_delta':
                  if (event.delta?.stop_reason) {
                    this.streamAccumulator.stopReason = event.delta.stop_reason;
                  }
                  if (event.usage) {
                    this.streamAccumulator.inputTokens = event.usage.input_tokens || 0;
                    this.streamAccumulator.outputTokens = event.usage.output_tokens || 0;
                    yield {
                      type: 'usage',
                      usage: {
                        inputTokens: event.usage.input_tokens,
                        outputTokens: event.usage.output_tokens,
                      },
                    };
                  }
                  break;

                case 'message_stop':
                  streamingHandler?.emitMessageEnd(
                    messageId,
                    this.streamAccumulator.content,
                    (this.streamAccumulator.stopReason as any) || 'end_turn',
                    {
                      inputTokens: this.streamAccumulator.inputTokens,
                      outputTokens: this.streamAccumulator.outputTokens,
                    }
                  );

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
            } catch (e) {
              logger.warn('[ModelAPI] Failed to parse SSE event:', jsonStr);
            }
          }
        }
      }

      logger.info(
        `[ModelAPI] Native streaming completed (tokens: ${this.streamAccumulator.inputTokens}/${this.streamAccumulator.outputTokens})`
      );
    } catch (error: any) {
      const errorDetails = {
        errorName: error?.name,
        errorMessage: error?.message,
        configuredBaseURL: this.configuredBaseURL,
      };

      console.log('[ModelAPI] ========== NATIVE HTTP STREAMING ERROR ==========');
      console.log('[ModelAPI] Error details:', JSON.stringify(errorDetails, null, 2));
      console.log('[ModelAPI] ================================================');

      logger.error('[ModelAPI] Native HTTP streaming error:', errorDetails);

      streamingHandler?.emitError(
        'STREAM_ERROR',
        error instanceof Error ? error.message : 'Unknown streaming error'
      );

      if (error instanceof ModelAPIError) throw error;
      throw new ModelAPIError(
        error.message || 'Network error',
        'NETWORK_ERROR'
      );
    }
  }
}
