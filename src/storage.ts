import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { NewsItem } from "./types";

interface DailyData {
    date: string;
    fetchedAt: string;
    items: NewsItem[];
}

/**
 * Simple file-based storage using JSON files.
 * Each day's data is stored in `data/YYYY-MM-DD.json`.
 */
export class Storage {
    private dataDir: string;

    constructor(dataDir: string) {
        this.dataDir = dataDir;
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true });
        }
    }

    private filePath(date: string): string {
        return join(this.dataDir, `${date}.json`);
    }

    /** Save items for a given date */
    save(date: string, items: NewsItem[]): void {
        const data: DailyData = {
            date,
            fetchedAt: new Date().toISOString(),
            items,
        };
        writeFileSync(this.filePath(date), JSON.stringify(data, null, 2), "utf-8");
    }

    /** Load items for a given date (returns empty array if not found) */
    load(date: string): NewsItem[] {
        const p = this.filePath(date);
        if (!existsSync(p)) return [];
        const raw = readFileSync(p, "utf-8");
        const data: DailyData = JSON.parse(raw);
        // Restore Date objects
        return data.items.map((it) => ({
            ...it,
            createdAt: new Date(it.createdAt),
        }));
    }

    /**
     * Get IDs of items published in the last `hours` hours.
     * Used for dedup / skip logic.
     */
    getRecentIds(hours: number): Set<string> {
        const ids = new Set<string>();
        const cutoff = Date.now() - hours * 60 * 60 * 1000;

        if (!existsSync(this.dataDir)) return ids;

        const files = readdirSync(this.dataDir).filter((f) => f.endsWith(".json"));
        for (const file of files) {
            try {
                const raw = readFileSync(join(this.dataDir, file), "utf-8");
                const data: DailyData = JSON.parse(raw);
                const fetchedAt = new Date(data.fetchedAt).getTime();
                if (fetchedAt >= cutoff) {
                    for (const item of data.items) {
                        ids.add(item.id);
                    }
                }
            } catch {
                // skip corrupt files
            }
        }
        return ids;
    }
}
