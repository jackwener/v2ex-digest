import { V2EXClient } from "./v2ex-client";
import { MemStore } from "./mem-store";
import { computeScore } from "./scorer";
import type { AppConfig } from "./types";

/**
 * Collector: periodically polls V2EX nodes and stores scored items.
 * Mirrors quaily-journalist's V2EXCollector.
 */
export class Collector {
    private client: V2EXClient;
    private store: MemStore;
    private nodes: string[];
    private intervalMs: number;
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(config: AppConfig, store: MemStore) {
        this.client = new V2EXClient(config.v2ex.token);
        this.store = store;
        this.nodes = [...config.generate.nodes];
        this.intervalMs = (config.generate as any).fetchIntervalMin
            ? (config.generate as any).fetchIntervalMin * 60 * 1000
            : 10 * 60 * 1000; // default 10 minutes
    }

    async start(signal: AbortSignal): Promise<void> {
        console.log(`🔄 Collector started (interval: ${this.intervalMs / 60000}min, nodes: ${this.nodes.join(", ")})`);

        // Initial run
        await this.runOnce();

        // Schedule periodic runs
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

    async runOnce(): Promise<void> {
        const period = new Date().toISOString().slice(0, 10);

        for (const node of this.nodes) {
            try {
                const items = await this.client.fetchBySource(node);
                let stored = 0;
                for (const item of items) {
                    const score = computeScore(item);
                    if (score <= 0) continue;
                    this.store.addItem(period, item, score);
                    stored++;
                }
                console.log(`   📡 [${new Date().toLocaleTimeString()}] ${node}: ${items.length} fetched, ${stored} scored`);
            } catch (err) {
                console.error(`   ⚠️  [${node}] fetch error:`, err);
            }
        }

        // Persist after each full cycle
        this.store.persist();
    }
}
