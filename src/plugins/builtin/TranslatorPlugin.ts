/**
 * Translator Plugin
 *
 * Provides text translation tools.
 * This is an example plugin demonstrating the plugin system.
 */

import {
  Plugin,
  PluginMetadata,
  PluginContext,
  PluginConfigSchema,
} from '../types.js';
import { Tool, ToolResult } from '../../tools/types.js';
import { z } from 'zod';

/**
 * Translator Plugin implementation
 */
export default class TranslatorPlugin implements Plugin {
  readonly metadata: PluginMetadata = {
    id: 'translator',
    name: 'Translator Plugin',
    version: '1.0.0',
    description: 'Translate text between languages',
    author: 'Anode ClawdBot Team',
    license: 'MIT',
    permissions: ['network:http'],
  };

  private context!: PluginContext;
  private supportedLanguages: Map<string, string>;

  constructor() {
    // Common language codes
    this.supportedLanguages = new Map([
      ['en', 'English'],
      ['zh', 'Chinese'],
      ['es', 'Spanish'],
      ['fr', 'French'],
      ['de', 'German'],
      ['ja', 'Japanese'],
      ['ko', 'Korean'],
      ['ru', 'Russian'],
      ['ar', 'Arabic'],
      ['pt', 'Portuguese'],
      ['it', 'Italian'],
      ['nl', 'Dutch'],
      ['pl', 'Polish'],
      ['tr', 'Turkish'],
      ['vi', 'Vietnamese'],
      ['th', 'Thai'],
    ]);
  }

  async init(context: PluginContext): Promise<void> {
    this.context = context;
    context.log('info', 'Translator plugin initialized');
  }

  async destroy(): Promise<void> {
    this.context.log('info', 'Translator plugin destroyed');
  }

  getTools(): Tool[] {
    return [
      {
        name: 'translate',
        description: 'Translate text from one language to another',
        parameters: [
          {
            name: 'text',
            description: 'Text to translate',
            schema: z.string().min(1),
            required: true,
          },
          {
            name: 'targetLang',
            description:
              'Target language code (e.g., "en", "zh", "es", "fr", "de", "ja", "ko")',
            schema: z.string().length(2),
            required: true,
          },
          {
            name: 'sourceLang',
            description: 'Source language code (auto-detect if not provided)',
            schema: z.string().length(2).optional(),
            required: false,
          },
        ],
        execute: async (params: Record<string, any>): Promise<ToolResult> => {
          try {
            const result = await this.translate(params);
            return {
              success: true,
              output: result,
            };
          } catch (error) {
            return {
              success: false,
              error: {
                code: 'TRANSLATION_ERROR',
                message: error instanceof Error ? error.message : String(error),
              },
            };
          }
        },
      },
      {
        name: 'detect_language',
        description: 'Detect the language of text',
        parameters: [
          {
            name: 'text',
            description: 'Text to analyze',
            schema: z.string().min(1),
            required: true,
          },
        ],
        execute: async (params: Record<string, any>): Promise<ToolResult> => {
          try {
            const result = await this.detectLanguage(params);
            return {
              success: true,
              output: result,
            };
          } catch (error) {
            return {
              success: false,
              error: {
                code: 'DETECTION_ERROR',
                message: error instanceof Error ? error.message : String(error),
              },
            };
          }
        },
      },
      {
        name: 'list_languages',
        description: 'List all supported languages',
        parameters: [],
        execute: async (): Promise<ToolResult> => {
          try {
            const result = await this.listLanguages();
            return {
              success: true,
              output: result,
            };
          } catch (error) {
            return {
              success: false,
              error: {
                code: 'LIST_ERROR',
                message: error instanceof Error ? error.message : String(error),
              },
            };
          }
        },
      },
    ];
  }

  getConfigSchema(): PluginConfigSchema {
    return {
      fields: [
        {
          key: 'provider',
          label: 'Translation Provider',
          type: 'select',
          description: 'Translation service provider',
          defaultValue: 'google',
          options: [
            { label: 'Google Translate (Free)', value: 'google' },
            { label: 'DeepL', value: 'deepl' },
            { label: 'Microsoft Translator', value: 'microsoft' },
          ],
        },
        {
          key: 'apiKey',
          label: 'API Key',
          type: 'password',
          description: 'API key for the selected provider (optional for Google)',
          required: false,
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): boolean | string {
    if (config.provider === 'deepl' || config.provider === 'microsoft') {
      if (!config.apiKey) {
        return `API key is required for ${config.provider}`;
      }
    }

    return true;
  }

  /**
   * Translate text
   */
  private async translate(params: Record<string, any>): Promise<string> {
    // Validate parameters
    const schema = z.object({
      text: z.string().min(1),
      targetLang: z.string().length(2),
      sourceLang: z.string().length(2).optional(),
    });

    const parsed = schema.parse(params);

    // Validate target language
    if (!this.supportedLanguages.has(parsed.targetLang)) {
      return `Unsupported target language: ${parsed.targetLang}. Use list_languages to see supported languages.`;
    }

    // Validate source language if provided
    if (parsed.sourceLang && !this.supportedLanguages.has(parsed.sourceLang)) {
      return `Unsupported source language: ${parsed.sourceLang}. Use list_languages to see supported languages.`;
    }

    try {
      // Mock translation for demonstration
      // In real implementation, call translation API:
      // const provider = this.context.pluginConfig.settings.provider || 'google';
      // const apiKey = this.context.pluginConfig.settings.apiKey;
      // Call appropriate API based on provider

      const sourceLangName =
        (parsed.sourceLang && this.supportedLanguages.get(parsed.sourceLang)) || 'Auto-detected';
      const targetLangName = this.supportedLanguages.get(parsed.targetLang)!;

      this.context.log(
        'info',
        `Translating from ${sourceLangName} to ${targetLangName}`
      );

      // Mock translated text
      const translatedText = `[Translated to ${targetLangName}]: ${parsed.text}`;

      return JSON.stringify(
        {
          originalText: parsed.text,
          translatedText,
          sourceLang: parsed.sourceLang || 'auto',
          targetLang: parsed.targetLang,
          detectedSourceLang: parsed.sourceLang || 'en',
        },
        null,
        2
      );
    } catch (error) {
      this.context.log('error', `Translation failed: ${error}`);
      throw error;
    }
  }

  /**
   * Detect language
   */
  private async detectLanguage(params: Record<string, any>): Promise<string> {
    // Validate parameters
    const schema = z.object({
      text: z.string().min(1),
    });

    const parsed = schema.parse(params);

    try {
      // Mock language detection
      // In real implementation, call language detection API

      // Simple heuristic based on character sets
      let detectedLang = 'en';
      let confidence = 0.85;

      if (/[\u4e00-\u9fa5]/.test(parsed.text)) {
        detectedLang = 'zh';
        confidence = 0.95;
      } else if (/[\u3040-\u309f\u30a0-\u30ff]/.test(parsed.text)) {
        detectedLang = 'ja';
        confidence = 0.95;
      } else if (/[\uac00-\ud7af]/.test(parsed.text)) {
        detectedLang = 'ko';
        confidence = 0.95;
      } else if (/[\u0400-\u04ff]/.test(parsed.text)) {
        detectedLang = 'ru';
        confidence = 0.90;
      } else if (/[\u0600-\u06ff]/.test(parsed.text)) {
        detectedLang = 'ar';
        confidence = 0.90;
      }

      const langName = this.supportedLanguages.get(detectedLang) || 'Unknown';

      this.context.log('info', `Detected language: ${langName} (${detectedLang})`);

      return JSON.stringify(
        {
          text: parsed.text,
          detectedLanguage: detectedLang,
          languageName: langName,
          confidence,
        },
        null,
        2
      );
    } catch (error) {
      this.context.log('error', `Language detection failed: ${error}`);
      throw error;
    }
  }

  /**
   * List supported languages
   */
  private async listLanguages(): Promise<string> {
    const languages = Array.from(this.supportedLanguages.entries()).map(([code, name]) => ({
      code,
      name,
    }));

    return JSON.stringify(
      {
        count: languages.length,
        languages,
      },
      null,
      2
    );
  }
}
