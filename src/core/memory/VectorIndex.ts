/**
 * Vector Index - Lightweight TF-IDF based semantic search
 *
 * Provides vector similarity search for memory entries without external dependencies.
 * Uses TF-IDF (Term Frequency - Inverse Document Frequency) with n-gram tokenization
 * to support both Chinese and English text.
 *
 * Designed for mobile (Android) with minimal memory footprint.
 */

import { logger } from '../../utils/logger.js';

/**
 * Document in the index
 */
interface IndexedDocument {
  id: string;
  termFreqs: Map<string, number>;
  magnitude: number;
}

/**
 * TF-IDF Vector Index
 *
 * Maintains an inverted index of documents for fast cosine similarity search.
 */
export class VectorIndex {
  /** Indexed documents by ID */
  private documents: Map<string, IndexedDocument> = new Map();

  /** Inverted index: term → set of document IDs */
  private invertedIndex: Map<string, Set<string>> = new Map();

  /** Total document count (for IDF calculation) */
  private get docCount(): number {
    return this.documents.size;
  }

  /**
   * Add or update a document in the index
   *
   * @param id - Unique document identifier
   * @param text - Text content to index
   */
  add(id: string, text: string): void {
    // Remove old version if updating
    if (this.documents.has(id)) {
      this.remove(id);
    }

    const tokens = this.tokenize(text);
    const termFreqs = this.computeTermFrequency(tokens);

    // Compute magnitude (for cosine similarity normalization)
    let magnitude = 0;
    for (const freq of termFreqs.values()) {
      magnitude += freq * freq;
    }
    magnitude = Math.sqrt(magnitude);

    const doc: IndexedDocument = { id, termFreqs, magnitude };
    this.documents.set(id, doc);

    // Update inverted index
    for (const term of termFreqs.keys()) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Set());
      }
      this.invertedIndex.get(term)!.add(id);
    }
  }

  /**
   * Remove a document from the index
   */
  remove(id: string): boolean {
    const doc = this.documents.get(id);
    if (!doc) return false;

    // Remove from inverted index
    for (const term of doc.termFreqs.keys()) {
      const docSet = this.invertedIndex.get(term);
      if (docSet) {
        docSet.delete(id);
        if (docSet.size === 0) {
          this.invertedIndex.delete(term);
        }
      }
    }

    this.documents.delete(id);
    return true;
  }

  /**
   * Search for documents similar to the query text
   *
   * @param queryText - Search query
   * @param limit - Maximum results to return (default 10)
   * @param minScore - Minimum similarity score threshold (default 0.01)
   * @returns Array of { id, score } sorted by descending score
   */
  search(queryText: string, limit: number = 10, minScore: number = 0.01): Array<{ id: string; score: number }> {
    if (this.docCount === 0) return [];

    const queryTokens = this.tokenize(queryText);
    const queryTermFreqs = this.computeTermFrequency(queryTokens);

    // Compute TF-IDF weighted query vector magnitude
    let queryMagnitude = 0;
    const queryTfIdf = new Map<string, number>();

    for (const [term, tf] of queryTermFreqs) {
      const idf = this.computeIDF(term);
      const tfidf = tf * idf;
      queryTfIdf.set(term, tfidf);
      queryMagnitude += tfidf * tfidf;
    }
    queryMagnitude = Math.sqrt(queryMagnitude);

    if (queryMagnitude === 0) return [];

    // Find candidate documents (only those sharing at least one term with query)
    const candidates = new Set<string>();
    for (const term of queryTermFreqs.keys()) {
      const docSet = this.invertedIndex.get(term);
      if (docSet) {
        for (const docId of docSet) {
          candidates.add(docId);
        }
      }
    }

    // Compute cosine similarity for each candidate
    const results: Array<{ id: string; score: number }> = [];

    for (const docId of candidates) {
      const doc = this.documents.get(docId)!;
      let dotProduct = 0;

      // Compute document TF-IDF magnitude on-the-fly
      let docTfIdfMagnitude = 0;

      for (const [term, tf] of doc.termFreqs) {
        const idf = this.computeIDF(term);
        const docTfIdf = tf * idf;
        docTfIdfMagnitude += docTfIdf * docTfIdf;

        const queryVal = queryTfIdf.get(term);
        if (queryVal) {
          dotProduct += docTfIdf * queryVal;
        }
      }

      docTfIdfMagnitude = Math.sqrt(docTfIdfMagnitude);

      if (docTfIdfMagnitude === 0) continue;

      const score = dotProduct / (docTfIdfMagnitude * queryMagnitude);

      if (score >= minScore) {
        results.push({ id: docId, score });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * Get the number of indexed documents
   */
  get size(): number {
    return this.documents.size;
  }

  /**
   * Clear the entire index
   */
  clear(): void {
    this.documents.clear();
    this.invertedIndex.clear();
  }

  /**
   * Tokenize text into terms
   *
   * Supports mixed Chinese/English text:
   * - English: lowercase words + bigrams of consecutive words
   * - Chinese: individual characters + character bigrams
   * - Numbers preserved as tokens
   */
  private tokenize(text: string): string[] {
    const tokens: string[] = [];

    // Normalize: lowercase, collapse whitespace
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();

    // Split into segments of CJK and non-CJK
    // CJK range: \u4e00-\u9fff (common), \u3400-\u4dbf (ext A), \uf900-\ufaff (compatibility)
    const segments = normalized.split(/([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+)/);

    for (const segment of segments) {
      if (!segment.trim()) continue;

      // Check if this is a CJK segment
      if (/^[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+$/.test(segment)) {
        // Chinese: character unigrams + bigrams
        for (let i = 0; i < segment.length; i++) {
          tokens.push(segment[i]);
          if (i < segment.length - 1) {
            tokens.push(segment[i] + segment[i + 1]);
          }
        }
      } else {
        // Non-CJK: extract words (alphanumeric sequences)
        const words = segment.match(/[a-z0-9]+/g);
        if (words) {
          for (let i = 0; i < words.length; i++) {
            // Skip very short words (a, I, etc.) unless they're numbers
            if (words[i].length > 1 || /^\d+$/.test(words[i])) {
              tokens.push(words[i]);
            }
            // Word bigrams for context
            if (i < words.length - 1) {
              tokens.push(words[i] + '_' + words[i + 1]);
            }
          }
        }
      }
    }

    return tokens;
  }

  /**
   * Compute term frequency map from tokens
   * Uses sublinear TF: 1 + log(count) to dampen high-frequency terms
   */
  private computeTermFrequency(tokens: string[]): Map<string, number> {
    const counts = new Map<string, number>();

    for (const token of tokens) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }

    // Apply sublinear scaling
    const result = new Map<string, number>();
    for (const [term, count] of counts) {
      result.set(term, 1 + Math.log(count));
    }

    return result;
  }

  /**
   * Compute Inverse Document Frequency for a term
   * IDF = log(N / (1 + df)) where df = number of documents containing the term
   */
  private computeIDF(term: string): number {
    const df = this.invertedIndex.get(term)?.size || 0;
    return Math.log(this.docCount / (1 + df));
  }
}
