import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MemStore } from "./mem-store";
import { Summarizer } from "./summarizer";
import { renderMarkdown, expandVars } from "./renderer";
import type { AppConfig, SummarizedItem } from "./types";

/**
 * Builder: periodically checks if enough items have accumulated
 * and generates the daily digest. Mirrors quaily-journalist's NewsletterBuilder.
 */
export class Builder {
    private store: MemStore;
    private config: AppConfig;
    private intervalMs: number;
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(config: AppConfig, store: MemStore) {
        this.config = config;
        this.store = store;
        this.intervalMs = (config.generate as any).buildIntervalMin
            ? (config.generate as any).buildIntervalMin * 60 * 1000
            : 30 * 60 * 1000; // default 30 minutes
    }

    async start(signal: AbortSignal): Promise<void> {
        console.log(`📰 Builder started (interval: ${this.intervalMs / 60000}min, top-N: ${this.config.generate.topN})`);

        return new Promise((resolve) => {
            this.timer = setInterval(async () => {
                if (signal.aborted) {
                    this.stop();
                    resolve();
                    return;
                }
                await this.runOnce();
            }, this.intervalMs);

            signal.addEventListener("abort", () => {
                this.stop();
                resolve();
            });
        });
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    async runOnce(): Promise<string | null> {
        const period = new Date().toISOString().slice(0, 10);
        const channel = "v2ex-digest";

        // Already published today?
        if (this.store.isPublished(channel, period)) {
            console.log(`   📰 [${new Date().toLocaleTimeString()}] Already published for ${period}, skipping`);
            return null;
        }

        // Fetch top items from store
        const fetchN = this.config.generate.topN * 5;
        let candidates = this.store.topItems(period, fetchN);

        // Filter excluded nodes
        const excludeSet = new Set(
            this.config.generate.excludeNodes.map((n) => n.toLowerCase())
        );
        candidates = candidates.filter(
            (c) => !excludeSet.has(c.item.nodeName.toLowerCase())
        );

        // Filter skipped items
        candidates = candidates.filter(
            (c) => !this.store.isSkipped(channel, c.item.id)
        );

        // Filter zero-reply items
        candidates = candidates.filter((c) => c.item.replies > 0 && c.score > 0);

        // Check minimum items threshold
        const minItems = 5;
        if (candidates.length < minItems) {
            console.log(`   📰 [${new Date().toLocaleTimeString()}] Only ${candidates.length} items (need ${minItems}), waiting...`);
            return null;
        }

        // Take top N
        const topItems = candidates.slice(0, this.config.generate.topN);
        console.log(`\n📰 Building daily digest: ${topItems.length} items for ${period}`);

        // AI summaries
        const summarized: SummarizedItem[] = [];
        let postSummary = "";

        if (this.config.ai.apiKey) {
            const summarizer = new Summarizer({
                provider: this.config.ai.provider,
                apiKey: this.config.ai.apiKey,
                model: this.config.ai.model,
                baseUrl: this.config.ai.baseUrl || undefined,
            });

            for (const { item, score } of topItems) {
                process.stdout.write(`   Summarizing: ${item.title.slice(0, 50)}...`);
                const desc = await summarizer.summarizeItem(
                    item.title,
                    item.content,
                    "Chinese"
                );
                summarized.push({ item, score, description: desc });
                console.log(" ✓");
            }

            process.stdout.write("   Generating overall summary...");
            postSummary = await summarizer.summarizePost(
                topItems.map((r) => r.item),
                "Chinese"
            );
            console.log(" ✓");
        } else {
            for (const { item, score } of topItems) {
                summarized.push({ item, score, description: "" });
            }
        }

        // Render
        const title = expandVars(this.config.template.title || "V2EX 日报 {date}", period);
        const md = renderMarkdown({
            title,
            date: period,
            summary: postSummary,
            items: summarized,
        });

        // Write file
        mkdirSync("./out", { recursive: true });
        const outPath = join("./out", `daily-${period}.md`);
        writeFileSync(outPath, md, "utf-8");
        console.log(`✅ Daily digest written to: ${outPath}`);

        // Mark published & skip
        this.store.markPublished(channel, period);
        const skipMs = this.config.generate.skipHours * 60 * 60 * 1000;
        for (const { item } of topItems) {
            this.store.markSkipped(channel, item.id, skipMs);
        }

        // GC and persist
        this.store.gc();
        this.store.persist();

        return outPath;
    }
}
