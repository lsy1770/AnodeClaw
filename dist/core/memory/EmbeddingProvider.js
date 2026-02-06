/**
 * Embedding Providers
 *
 * Modular embedding system supporting multiple providers:
 * - OpenAI (text-embedding-3-small)
 * - Gemini (text-embedding-004)
 * - Local TF-IDF (fallback)
 *
 * Follows OpenClaw pattern with automatic fallback chain.
 */
import { logger } from '../../utils/logger.js';
/**
 * OpenAI Embedding Provider
 */
export class OpenAIEmbeddingProvider {
    constructor(config) {
        this.name = 'openai';
        this.dimensions = 1536; // text-embedding-3-small default
        this.apiKey = config.apiKey;
        this.model = config.model || 'text-embedding-3-small';
        this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    }
    isAvailable() {
        return !!this.apiKey && typeof networkAPI !== 'undefined';
    }
    async embed(text) {
        const result = await this.embedBatch([text]);
        return {
            embedding: result.embeddings[0],
            model: result.model,
            dimensions: result.dimensions,
            tokensUsed: result.totalTokens,
        };
    }
    async embedBatch(texts) {
        if (!this.isAvailable()) {
            throw new Error('OpenAI embedding provider not available');
        }
        try {
            const response = await networkAPI.request({
                url: `${this.baseUrl}/embeddings`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.model,
                    input: texts,
                }),
                timeout: 30000,
            });
            if (response.statusCode !== 200) {
                throw new Error(`OpenAI API error: ${response.statusCode}`);
            }
            const data = JSON.parse(response.data);
            const embeddings = data.data
                .sort((a, b) => a.index - b.index)
                .map((item) => item.embedding);
            return {
                embeddings,
                model: this.model,
                dimensions: embeddings[0]?.length || this.dimensions,
                totalTokens: data.usage?.total_tokens,
            };
        }
        catch (error) {
            logger.error('[OpenAI Embedding] Request failed:', error);
            throw error;
        }
    }
}
/**
 * Gemini Embedding Provider
 */
export class GeminiEmbeddingProvider {
    constructor(config) {
        this.name = 'gemini';
        this.dimensions = 768; // text-embedding-004 default
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        this.apiKey = config.apiKey;
        this.model = config.model || 'text-embedding-004';
    }
    isAvailable() {
        return !!this.apiKey && typeof networkAPI !== 'undefined';
    }
    async embed(text) {
        const result = await this.embedBatch([text]);
        return {
            embedding: result.embeddings[0],
            model: result.model,
            dimensions: result.dimensions,
        };
    }
    async embedBatch(texts) {
        if (!this.isAvailable()) {
            throw new Error('Gemini embedding provider not available');
        }
        try {
            // Gemini API requires individual requests for each text
            // Use batchEmbedContents endpoint
            const response = await networkAPI.request({
                url: `${this.baseUrl}/models/${this.model}:batchEmbedContents?key=${this.apiKey}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    requests: texts.map(text => ({
                        model: `models/${this.model}`,
                        content: { parts: [{ text }] },
                    })),
                }),
                timeout: 30000,
            });
            if (response.statusCode !== 200) {
                throw new Error(`Gemini API error: ${response.statusCode}`);
            }
            const data = JSON.parse(response.data);
            const embeddings = data.embeddings.map((e) => e.values);
            return {
                embeddings,
                model: this.model,
                dimensions: embeddings[0]?.length || this.dimensions,
            };
        }
        catch (error) {
            logger.error('[Gemini Embedding] Request failed:', error);
            throw error;
        }
    }
}
/**
 * Local TF-IDF Embedding Provider (fallback)
 *
 * Generates sparse embeddings using TF-IDF vectorization.
 * Not true neural embeddings, but provides a reasonable fallback.
 */
export class LocalEmbeddingProvider {
    constructor() {
        this.name = 'local';
        this.model = 'tfidf-v1';
        this.dimensions = 1000; // Fixed vocabulary size
        this.vocabulary = new Map();
        this.idf = new Map();
        this.docCount = 0;
    }
    isAvailable() {
        return true; // Always available
    }
    async embed(text) {
        const embedding = this.computeTfIdfVector(text);
        return {
            embedding,
            model: this.model,
            dimensions: embedding.length,
        };
    }
    async embedBatch(texts) {
        // First, update vocabulary with all texts
        this.updateVocabulary(texts);
        // Then compute embeddings
        const embeddings = texts.map(text => this.computeTfIdfVector(text));
        return {
            embeddings,
            model: this.model,
            dimensions: this.dimensions,
        };
    }
    /**
     * Update vocabulary from new texts
     */
    updateVocabulary(texts) {
        const termDocs = new Map();
        for (let i = 0; i < texts.length; i++) {
            const tokens = this.tokenize(texts[i]);
            for (const token of tokens) {
                if (!termDocs.has(token)) {
                    termDocs.set(token, new Set());
                }
                termDocs.get(token).add(i);
                if (!this.vocabulary.has(token) && this.vocabulary.size < this.dimensions) {
                    this.vocabulary.set(token, this.vocabulary.size);
                }
            }
        }
        // Update IDF values
        this.docCount += texts.length;
        for (const [term, docs] of termDocs) {
            const currentDf = this.idf.has(term)
                ? Math.exp(-this.idf.get(term)) * this.docCount
                : 0;
            const newDf = currentDf + docs.size;
            this.idf.set(term, Math.log(this.docCount / (1 + newDf)));
        }
    }
    /**
     * Compute TF-IDF vector for text
     */
    computeTfIdfVector(text) {
        const vector = new Array(this.dimensions).fill(0);
        const tokens = this.tokenize(text);
        const termFreq = new Map();
        // Compute term frequencies
        for (const token of tokens) {
            termFreq.set(token, (termFreq.get(token) || 0) + 1);
        }
        // Compute TF-IDF for each term
        for (const [term, freq] of termFreq) {
            const idx = this.vocabulary.get(term);
            if (idx !== undefined && idx < this.dimensions) {
                const tf = 1 + Math.log(freq);
                const idf = this.idf.get(term) || Math.log(this.docCount + 1);
                vector[idx] = tf * idf;
            }
        }
        // L2 normalize
        const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
        if (magnitude > 0) {
            for (let i = 0; i < vector.length; i++) {
                vector[i] /= magnitude;
            }
        }
        return vector;
    }
    /**
     * Tokenize text
     */
    tokenize(text) {
        const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
        const tokens = [];
        // Split into segments of CJK and non-CJK
        const segments = normalized.split(/([\u4e00-\u9fff\u3400-\u4dbf]+)/);
        for (const segment of segments) {
            if (!segment.trim())
                continue;
            if (/^[\u4e00-\u9fff\u3400-\u4dbf]+$/.test(segment)) {
                // Chinese: character bigrams
                for (let i = 0; i < segment.length - 1; i++) {
                    tokens.push(segment[i] + segment[i + 1]);
                }
            }
            else {
                // Non-CJK: words
                const words = segment.match(/[a-z0-9]+/g);
                if (words) {
                    tokens.push(...words.filter(w => w.length > 1));
                }
            }
        }
        return tokens;
    }
    /**
     * Clear vocabulary (for reset)
     */
    clear() {
        this.vocabulary.clear();
        this.idf.clear();
        this.docCount = 0;
    }
}
/**
 * Embedding Manager
 *
 * Manages multiple embedding providers with automatic fallback.
 */
export class EmbeddingManager {
    constructor(config) {
        this.providers = [];
        this.activeProvider = null;
        this.localProvider = new LocalEmbeddingProvider();
        if (config?.openai?.apiKey) {
            this.providers.push(new OpenAIEmbeddingProvider(config.openai));
        }
        if (config?.gemini?.apiKey) {
            this.providers.push(new GeminiEmbeddingProvider(config.gemini));
        }
        // Always add local as fallback
        this.providers.push(this.localProvider);
        // Set preferred provider or first available
        if (config?.preferredProvider) {
            this.activeProvider = this.providers.find(p => p.name === config.preferredProvider && p.isAvailable()) || null;
        }
        if (!this.activeProvider) {
            this.activeProvider = this.providers.find(p => p.isAvailable()) || this.localProvider;
        }
        logger.info(`[EmbeddingManager] Active provider: ${this.activeProvider.name}`);
    }
    /**
     * Get the active provider
     */
    getActiveProvider() {
        return this.activeProvider || this.localProvider;
    }
    /**
     * Get all available providers
     */
    getAvailableProviders() {
        return this.providers.filter(p => p.isAvailable());
    }
    /**
     * Switch to a different provider
     */
    setProvider(name) {
        const provider = this.providers.find(p => p.name === name && p.isAvailable());
        if (provider) {
            this.activeProvider = provider;
            logger.info(`[EmbeddingManager] Switched to provider: ${name}`);
            return true;
        }
        return false;
    }
    /**
     * Generate embedding with automatic fallback
     */
    async embed(text) {
        const providers = [this.activeProvider, ...this.providers.filter(p => p !== this.activeProvider)];
        for (const provider of providers) {
            if (!provider?.isAvailable())
                continue;
            try {
                const result = await provider.embed(text);
                return result;
            }
            catch (error) {
                logger.warn(`[EmbeddingManager] Provider ${provider.name} failed, trying next...`);
            }
        }
        // Fallback to local
        return this.localProvider.embed(text);
    }
    /**
     * Generate batch embeddings with automatic fallback
     */
    async embedBatch(texts) {
        const providers = [this.activeProvider, ...this.providers.filter(p => p !== this.activeProvider)];
        for (const provider of providers) {
            if (!provider?.isAvailable())
                continue;
            try {
                const result = await provider.embedBatch(texts);
                return result;
            }
            catch (error) {
                logger.warn(`[EmbeddingManager] Provider ${provider.name} failed, trying next...`);
            }
        }
        // Fallback to local
        return this.localProvider.embedBatch(texts);
    }
    /**
     * Compute cosine similarity between two embeddings
     */
    cosineSimilarity(a, b) {
        if (a.length !== b.length) {
            throw new Error('Embedding dimensions must match');
        }
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
        return magnitude > 0 ? dotProduct / magnitude : 0;
    }
}
/**
 * Create an embedding manager with configuration
 */
export function createEmbeddingManager(config) {
    return new EmbeddingManager(config);
}
