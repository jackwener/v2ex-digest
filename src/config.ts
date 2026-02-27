import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import type { AppConfig } from "./types";

const DEFAULTS: AppConfig = {
    v2ex: {
        token: "",
    },
    ai: {
        provider: "openai",
        apiKey: "",
        model: "gpt-4o-mini",
        baseUrl: "",
    },
    generate: {
        nodes: ["hot"],
        excludeNodes: ["promotions", "deals", "cv", "exchange"],
        topN: 20,
        skipHours: 72,
        fetchIntervalMin: 10,
        buildIntervalMin: 30,
    },
    template: {
        title: "V2EX 日报 {date}",
    },
};

/** Convert snake_case keys to camelCase recursively */
function snakeToCamel(obj: any): any {
    if (Array.isArray(obj)) return obj.map(snakeToCamel);
    if (obj && typeof obj === "object") {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            result[camelKey] = snakeToCamel(value);
        }
        return result;
    }
    return obj;
}

/** Deep merge source into target (source wins) */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result = { ...target };
    for (const key of Object.keys(source) as (keyof T)[]) {
        const sv = source[key];
        if (sv && typeof sv === "object" && !Array.isArray(sv) && typeof result[key] === "object") {
            result[key] = deepMerge(result[key] as any, sv as any);
        } else if (sv !== undefined) {
            result[key] = sv as any;
        }
    }
    return result;
}

/**
 * Load config from YAML file, then overlay CLI options.
 */
export function loadConfig(configPath?: string, cliOverrides?: Partial<AppConfig>): AppConfig {
    let fileConfig: Partial<AppConfig> = {};

    // Search order: explicit path → ./config.yaml
    const candidates = configPath
        ? [configPath]
        : [resolve("config.yaml"), resolve("config.yml")];

    for (const p of candidates) {
        if (existsSync(p)) {
            const raw = readFileSync(p, "utf-8");
            const parsed = YAML.parse(raw) ?? {};
            // YAML uses snake_case, TypeScript uses camelCase
            fileConfig = snakeToCamel(parsed);
            break;
        }
    }

    // Merge: defaults ← file ← CLI overrides
    let config = deepMerge(DEFAULTS, fileConfig);
    if (cliOverrides) {
        config = deepMerge(config, cliOverrides);
    }

    // Env fallbacks
    if (!config.ai.apiKey) {
        config.ai.apiKey =
            process.env.OPENAI_API_KEY ??
            process.env.ANTHROPIC_API_KEY ??
            "";
    }

    return config;
}
