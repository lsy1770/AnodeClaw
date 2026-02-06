/**
 * Hybrid Search
 *
 * Combines vector similarity search with BM25 keyword matching.
 * Following OpenClaw pattern: 70% vector + 30% BM25 by default.
 *
 * Features:
 * - BM25 algorithm for keyword relevance
 * - Vector similarity for semantic matching
 * - Configurable weight blending
 * - Score normalization
 * - Reciprocal Rank Fusion (RRF) option
 */

import { logger } from '../../utils/logger.js';

/**
 * Document for indexing
 */
export interface HybridDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, any>;
}

/**
 * Search result
 */
export interface HybridSearchResult {
  id: string;
  score: number;
  vectorScore: number;
  bm25Score: number;
  content: string;
  metadata?: Record<string, any>;
}

/**
 * Hybrid search configuration
 */
export interface HybridSearchConfig {
  /** Weight for vector similarity (default: 0.7) */
  vectorWeight: number;
  /** Weight for BM25 (default: 0.3) */
  bm25Weight: number;
  /** BM25 k1 parameter (default: 1.2) */
  bm25K1: number;
  /** BM25 b parameter (default: 0.75) */
  bm25B: number;
  /** Use Reciprocal Rank Fusion instead of score blending */
  useRRF: boolean;
  /** RRF constant (default: 60) */
  rrfK: number;
  /** Minimum score threshold (default: 0.01) */
  minScore: number;
}

const DEFAULT_CONFIG: HybridSearchConfig = {
  vectorWeight: 0.7,
  bm25Weight: 0.3,
  bm25K1: 1.2,
  bm25B: 0.75,
  useRRF: false,
  rrfK: 60,
  minScore: 0.01,
};

/**
 * BM25 Index
 *
 * Implements the Okapi BM25 ranking function for keyword search.
 */
export class BM25Index {
  private documents: Map<string, { tokens: string[]; length: number }> = new Map();
  private termDocFreq: Map<string, Set<string>> = new Map();
  private avgDocLength: number = 0;
  private k1: number;
  private b: number;

  constructor(k1: number = 1.2, b: number = 0.75) {
    this.k1 = k1;
    this.b = b;
  }

  /**
   * Add a document to the index
   */
  add(id: string, content: string): void {
    const tokens = this.tokenize(content);
    this.documents.set(id, { tokens, length: tokens.length });

    // Update term document frequency
    const uniqueTerms = new Set(tokens);
    for (const term of uniqueTerms) {
      if (!this.termDocFreq.has(term)) {
        this.termDocFreq.set(term, new Set());
      }
      this.termDocFreq.get(term)!.add(id);
    }

    // Update average document length
    this.updateAvgDocLength();
  }

  /**
   * Remove a document from the index
   */
  remove(id: string): boolean {
    const doc = this.documents.get(id);
    if (!doc) return false;

    // Update term document frequency
    const uniqueTerms = new Set(doc.tokens);
    for (const term of uniqueTerms) {
      const docSet = this.termDocFreq.get(term);
      if (docSet) {
        docSet.delete(id);
        if (docSet.size === 0) {
          this.termDocFreq.delete(term);
        }
      }
    }

    this.documents.delete(id);
    this.updateAvgDocLength();
    return true;
  }

  /**
   * Search for documents matching the query
   */
  search(query: string, limit: number = 10): Array<{ id: string; score: number }> {
    const queryTokens = this.tokenize(query);
    const scores = new Map<string, number>();
    const N = this.documents.size;

    if (N === 0) return [];

    for (const [docId, doc] of this.documents) {
      let score = 0;
      const termFreq = this.computeTermFreq(doc.tokens);

      for (const term of queryTokens) {
        const tf = termFreq.get(term) || 0;
        if (tf === 0) continue;

        const df = this.termDocFreq.get(term)?.size || 0;
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (doc.length / this.avgDocLength));

        score += idf * (numerator / denominator);
      }

      if (score > 0) {
        scores.set(docId, score);
      }
    }

    // Sort by score descending
    return Array.from(scores.entries())
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Get document count
   */
  get size(): number {
    return this.documents.size;
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.documents.clear();
    this.termDocFreq.clear();
    this.avgDocLength = 0;
  }

  private updateAvgDocLength(): void {
    if (this.documents.size === 0) {
      this.avgDocLength = 0;
      return;
    }

    let total = 0;
    for (const doc of this.documents.values()) {
      total += doc.length;
    }
    this.avgDocLength = total / this.documents.size;
  }

  private computeTermFreq(tokens: string[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const token of tokens) {
      freq.set(token, (freq.get(token) || 0) + 1);
    }
    return freq;
  }

  private tokenize(text: string): string[] {
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
    const tokens: string[] = [];

    // Split into CJK and non-CJK segments
    const segments = normalized.split(/([\u4e00-\u9fff\u3400-\u4dbf]+)/);

    for (const segment of segments) {
      if (!segment.trim()) continue;

      if (/^[\u4e00-\u9fff\u3400-\u4dbf]+$/.test(segment)) {
        // Chinese: character bigrams
        for (let i = 0; i < segment.length; i++) {
          tokens.push(segment[i]);
          if (i < segment.length - 1) {
            tokens.push(segment[i] + segment[i + 1]);
          }
        }
      } else {
        // Non-CJK: words
        const words = segment.match(/[a-z0-9]+/g);
        if (words) {
          tokens.push(...words.filter(w => w.length > 1));
        }
      }
    }

    return tokens;
  }
}

/**
 * Hybrid Search Index
 *
 * Combines BM25 and vector similarity search with configurable weights.
 */
export class HybridSearchIndex {
  private config: HybridSearchConfig;
  private bm25Index: BM25Index;
  private documents: Map<string, HybridDocument> = new Map();
  private embeddings: Map<string, number[]> = new Map();

  constructor(config?: Partial<HybridSearchConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bm25Index = new BM25Index(this.config.bm25K1, this.config.bm25B);
  }

  /**
   * Add a document with optional embedding
   */
  add(doc: HybridDocument): void {
    this.documents.set(doc.id, doc);
    this.bm25Index.add(doc.id, doc.content);

    if (doc.embedding) {
      this.embeddings.set(doc.id, doc.embedding);
    }
  }

  /**
   * Add or update embedding for a document
   */
  setEmbedding(id: string, embedding: number[]): void {
    if (this.documents.has(id)) {
      this.embeddings.set(id, embedding);
    }
  }

  /**
   * Remove a document
   */
  remove(id: string): boolean {
    const removed = this.documents.delete(id);
    if (removed) {
      this.bm25Index.remove(id);
      this.embeddings.delete(id);
    }
    return removed;
  }

  /**
   * Search using hybrid scoring
   */
  search(
    query: string,
    queryEmbedding?: number[],
    limit: number = 10
  ): HybridSearchResult[] {
    // Get BM25 results
    const bm25Results = this.bm25Index.search(query, limit * 2);
    const bm25Scores = new Map(bm25Results.map(r => [r.id, r.score]));

    // Get vector results if embeddings available
    const vectorScores = new Map<string, number>();
    if (queryEmbedding && this.embeddings.size > 0) {
      for (const [id, embedding] of this.embeddings) {
        const score = this.cosineSimilarity(queryEmbedding, embedding);
        if (score > 0) {
          vectorScores.set(id, score);
        }
      }
    }

    // Combine results
    const allDocIds = new Set([...bm25Scores.keys(), ...vectorScores.keys()]);
    const results: HybridSearchResult[] = [];

    if (this.config.useRRF) {
      // Reciprocal Rank Fusion
      results.push(...this.computeRRFScores(allDocIds, bm25Results, vectorScores));
    } else {
      // Weighted score blending
      results.push(...this.computeBlendedScores(allDocIds, bm25Scores, vectorScores));
    }

    // Sort and limit
    results.sort((a, b) => b.score - a.score);
    return results.filter(r => r.score >= this.config.minScore).slice(0, limit);
  }

  /**
   * Compute blended scores using configured weights
   */
  private computeBlendedScores(
    docIds: Set<string>,
    bm25Scores: Map<string, number>,
    vectorScores: Map<string, number>
  ): HybridSearchResult[] {
    const results: HybridSearchResult[] = [];

    // Normalize scores to 0-1 range
    const maxBm25 = Math.max(...bm25Scores.values(), 1);
    const maxVector = Math.max(...vectorScores.values(), 1);

    for (const id of docIds) {
      const doc = this.documents.get(id);
      if (!doc) continue;

      const rawBm25 = bm25Scores.get(id) || 0;
      const rawVector = vectorScores.get(id) || 0;

      // Normalize
      const normBm25 = rawBm25 / maxBm25;
      const normVector = rawVector / maxVector;

      // Blend
      const score = this.config.vectorWeight * normVector + this.config.bm25Weight * normBm25;

      results.push({
        id,
        score,
        vectorScore: normVector,
        bm25Score: normBm25,
        content: doc.content,
        metadata: doc.metadata,
      });
    }

    return results;
  }

  /**
   * Compute Reciprocal Rank Fusion scores
   */
  private computeRRFScores(
    docIds: Set<string>,
    bm25Results: Array<{ id: string; score: number }>,
    vectorScores: Map<string, number>
  ): HybridSearchResult[] {
    const k = this.config.rrfK;
    const results: HybridSearchResult[] = [];

    // Create rank maps
    const bm25Ranks = new Map<string, number>();
    bm25Results.forEach((r, i) => bm25Ranks.set(r.id, i + 1));

    const vectorRanks = new Map<string, number>();
    const sortedVector = Array.from(vectorScores.entries())
      .sort((a, b) => b[1] - a[1]);
    sortedVector.forEach(([id], i) => vectorRanks.set(id, i + 1));

    for (const id of docIds) {
      const doc = this.documents.get(id);
      if (!doc) continue;

      const bm25Rank = bm25Ranks.get(id) || this.documents.size + 1;
      const vectorRank = vectorRanks.get(id) || this.documents.size + 1;

      // RRF formula: 1 / (k + rank)
      const bm25Rrf = 1 / (k + bm25Rank);
      const vectorRrf = 1 / (k + vectorRank);
      const score = bm25Rrf + vectorRrf;

      const normBm25 = bm25Results.find(r => r.id === id)?.score || 0;
      const normVector = vectorScores.get(id) || 0;

      results.push({
        id,
        score,
        vectorScore: normVector,
        bm25Score: normBm25,
        content: doc.content,
        metadata: doc.metadata,
      });
    }

    return results;
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

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

  /**
   * Update configuration
   */
  setConfig(config: Partial<HybridSearchConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug(`[HybridSearch] Config updated: vector=${this.config.vectorWeight}, bm25=${this.config.bm25Weight}`);
  }

  /**
   * Get current configuration
   */
  getConfig(): HybridSearchConfig {
    return { ...this.config };
  }

  /**
   * Get document count
   */
  get size(): number {
    return this.documents.size;
  }

  /**
   * Get embedding count
   */
  get embeddingCount(): number {
    return this.embeddings.size;
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.documents.clear();
    this.embeddings.clear();
    this.bm25Index.clear();
  }
}

/**
 * Create a hybrid search index with configuration
 */
export function createHybridSearch(config?: Partial<HybridSearchConfig>): HybridSearchIndex {
  return new HybridSearchIndex(config);
}
