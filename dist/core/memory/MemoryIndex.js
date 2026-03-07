/**
 * MemoryIndex — Simple inverted keyword index
 *
 * Replaces TF-IDF VectorIndex. Sufficient for tens-to-hundreds of entries
 * on an Android device. Persisted as index.json.
 *
 * Scoring:
 *   title token match  : +10 per token
 *   tag match          : +15 per tag
 *   content token match: +3 per token
 *   importance high    : ×1.3
 *   importance low     : ×0.8
 */
import { logger } from '../../utils/logger.js';
const IMPORTANCE_WEIGHT = { high: 1.3, medium: 1.0, low: 0.8 };
function tokenize(text) {
    return text
        .toLowerCase()
        .split(/[\s\p{P}]+/u)
        .filter(t => t.length >= 2);
}
export class MemoryIndex {
    constructor() {
        this.tokens = new Map();
        this.tags = new Map();
        this.meta = new Map();
    }
    /** Add or update an entry in the index */
    add(entry) {
        this.remove(entry.id);
        const titleTokens = tokenize(entry.title);
        const contentTokens = tokenize(entry.content);
        for (const t of [...titleTokens, ...contentTokens]) {
            if (!this.tokens.has(t))
                this.tokens.set(t, new Set());
            this.tokens.get(t).add(entry.id);
        }
        for (const tag of entry.tags) {
            const norm = tag.toLowerCase();
            if (!this.tags.has(norm))
                this.tags.set(norm, new Set());
            this.tags.get(norm).add(entry.id);
        }
        this.meta.set(entry.id, { title: entry.title, importance: entry.importance });
    }
    /** Remove an entry from the index */
    remove(id) {
        if (!this.meta.has(id))
            return;
        for (const ids of this.tokens.values())
            ids.delete(id);
        for (const ids of this.tags.values())
            ids.delete(id);
        this.meta.delete(id);
    }
    /**
     * Search the index. Returns entry ids with scores.
     * Caller is responsible for loading full entries.
     */
    search(queryText, queryTags = [], limit = 10) {
        const queryTokens = tokenize(queryText);
        const scores = new Map();
        const matched = new Map();
        const bump = (id, pts, field) => {
            scores.set(id, (scores.get(id) ?? 0) + pts);
            if (!matched.has(id))
                matched.set(id, new Set());
            matched.get(id).add(field);
        };
        // Title tokens: check which entries have this token and their title contains the token
        for (const token of queryTokens) {
            const ids = this.tokens.get(token);
            if (!ids)
                continue;
            for (const id of ids) {
                const m = this.meta.get(id);
                if (tokenize(m.title).includes(token)) {
                    bump(id, 10, 'title');
                }
                else {
                    bump(id, 3, 'content');
                }
            }
        }
        // Tag matches
        for (const tag of queryTags) {
            const ids = this.tags.get(tag.toLowerCase());
            if (!ids)
                continue;
            for (const id of ids)
                bump(id, 15, 'tags');
        }
        // Apply importance weight
        const results = Array.from(scores.entries()).map(([id, score]) => {
            const m = this.meta.get(id);
            return {
                id,
                score: score * (IMPORTANCE_WEIGHT[m.importance] ?? 1.0),
                matchedFields: Array.from(matched.get(id) ?? []),
            };
        });
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
    /** Rebuild index from a list of entries */
    rebuild(entries) {
        this.tokens.clear();
        this.tags.clear();
        this.meta.clear();
        for (const e of entries)
            this.add(e);
        logger.debug(`[MemoryIndex] Rebuilt index with ${entries.length} entries`);
    }
    /** Serialize to plain object for persistence */
    serialize() {
        const tokens = {};
        for (const [k, v] of this.tokens)
            tokens[k] = Array.from(v);
        const tags = {};
        for (const [k, v] of this.tags)
            tags[k] = Array.from(v);
        const meta = {};
        for (const [k, v] of this.meta)
            meta[k] = v;
        return { version: 1, tokens, tags, meta };
    }
    /** Load from serialized object */
    deserialize(data) {
        this.tokens.clear();
        this.tags.clear();
        this.meta.clear();
        for (const [k, ids] of Object.entries(data.tokens ?? {})) {
            this.tokens.set(k, new Set(ids));
        }
        for (const [k, ids] of Object.entries(data.tags ?? {})) {
            this.tags.set(k, new Set(ids));
        }
        for (const [k, v] of Object.entries(data.meta ?? {})) {
            this.meta.set(k, v);
        }
    }
    get size() { return this.meta.size; }
}
