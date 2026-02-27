import type { NewsItem, ScoredItem } from "./types";
import { computeScore } from "./scorer";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * In-memory store replacing Redis.
 *
 * - items: Map<id, NewsItem> — all items seen (equivalent to `news:item:*`)
 * - periodScores: Map<period, Map<id, score>> — scored items per period (equivalent to Redis ZSET)
 * - published: Set<"channel:period"> — marks published periods
 * - skipped: Map<"channel:id", expiresAt> — skip markers with TTL
 *
 * Periodically persists to a JSON file so data survives restarts.
 */
export class MemStore {
    private items = new Map<string, NewsItem>();
    private periodScores = new Map<string, Map<string, number>>();
    private published = new Set<string>();
    private skipped = new Map<string, number>(); // key → expiry timestamp
    private persistPath: string;

    constructor(dataDir: string) {
        mkdirSync(dataDir, { recursive: true });
        this.persistPath = join(dataDir, "_store.json");
        this.load();
    }

    /** Add or update an item's score in a period (like Redis ZADD) */
    addItem(period: string, item: NewsItem, score: number): void {
        this.items.set(item.id, item);

        let scores = this.periodScores.get(period);
        if (!scores) {
            scores = new Map();
            this.periodScores.set(period, scores);
        }
        // ZADD semantics: update if new score is higher
        const existing = scores.get(item.id) ?? 0;
        if (score > existing) {
            scores.set(item.id, score);
        }
    }

    /** Get top N items by score for a period (like ZREVRANGE) */
    topItems(period: string, n: number): ScoredItem[] {
        const scores = this.periodScores.get(period);
        if (!scores) return [];

        const entries = [...scores.entries()]
            .map(([id, score]) => ({ id, score }))
            .sort((a, b) => b.score - a.score)
            .slice(0, n);

        const result: ScoredItem[] = [];
        for (const { id, score } of entries) {
            const item = this.items.get(id);
            if (item) {
                result.push({ item, score });
            }
        }
        return result;
    }

    /** Check if a period has been published for a channel */
    isPublished(channel: string, period: string): boolean {
        return this.published.has(`${channel}:${period}`);
    }

    /** Mark a period as published for a channel */
    markPublished(channel: string, period: string): void {
        this.published.add(`${channel}:${period}`);
    }

    /** Check if an item is skipped for a channel (respects TTL) */
    isSkipped(channel: string, id: string): boolean {
        const key = `${channel}:${id}`;
        const expiry = this.skipped.get(key);
        if (expiry === undefined) return false;
        if (Date.now() > expiry) {
            this.skipped.delete(key);
            return false;
        }
        return true;
    }

    /** Mark an item as skipped for a channel with a TTL */
    markSkipped(channel: string, id: string, ttlMs: number): void {
        this.skipped.set(`${channel}:${id}`, Date.now() + ttlMs);
    }

    /** Clean up expired entries */
    gc(): void {
        const now = Date.now();
        for (const [key, expiry] of this.skipped) {
            if (now > expiry) this.skipped.delete(key);
        }
        // Clean up old periods (keep only last 7 days)
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        for (const period of this.periodScores.keys()) {
            if (period < cutoffStr) {
                this.periodScores.delete(period);
            }
        }
    }

    /** Persist state to disk */
    persist(): void {
        const data = {
            items: Object.fromEntries(this.items),
            periodScores: Object.fromEntries(
                [...this.periodScores.entries()].map(([k, v]) => [k, Object.fromEntries(v)])
            ),
            published: [...this.published],
            skipped: Object.fromEntries(this.skipped),
        };
        writeFileSync(this.persistPath, JSON.stringify(data), "utf-8");
    }

    /** Load state from disk */
    private load(): void {
        if (!existsSync(this.persistPath)) return;
        try {
            const raw = JSON.parse(readFileSync(this.persistPath, "utf-8"));
            if (raw.items) {
                for (const [id, item] of Object.entries(raw.items) as any[]) {
                    item.createdAt = new Date(item.createdAt);
                    this.items.set(id, item);
                }
            }
            if (raw.periodScores) {
                for (const [period, scores] of Object.entries(raw.periodScores) as any[]) {
                    this.periodScores.set(period, new Map(Object.entries(scores)));
                }
            }
            if (raw.published) {
                for (const key of raw.published) this.published.add(key);
            }
            if (raw.skipped) {
                for (const [key, expiry] of Object.entries(raw.skipped) as any[]) {
                    this.skipped.set(key, expiry);
                }
            }
            console.log(`💾 Loaded store: ${this.items.size} items, ${this.periodScores.size} periods`);
        } catch {
            console.warn("⚠️  Failed to load store, starting fresh");
        }
    }
}
