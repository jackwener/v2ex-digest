#!/usr/bin/env bun
import { Command } from "commander";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config";
import { V2EXClient } from "./v2ex-client";
import { scoreAndRank } from "./scorer";
import { Storage } from "./storage";
import { Summarizer } from "./summarizer";
import { renderMarkdown, expandVars } from "./renderer";
import { MemStore } from "./mem-store";
import { Collector } from "./collector";
import { Builder } from "./builder";
import type { NewsItem, SummarizedItem, AppConfig } from "./types";

const program = new Command();

program
    .name("v2ex-digest")
    .description("V2EX 日报生成器 — 抓取、评分、AI 总结、输出 Markdown")
    .version("0.1.0");

// ── generate ──────────────────────────────────────────────
program
    .command("generate")
    .description("一次性生成今日日报")
    .option("-c, --config <path>", "配置文件路径")
    .option("-n, --nodes <nodes...>", "要抓取的节点")
    .option("-t, --top-n <number>", "输出的 topic 数量", parseInt)
    .option("-l, --language <lang>", "AI 总结语言")
    .option("--no-ai", "跳过 AI 总结")
    .option("--token <token>", "V2EX API token")
    .option("--ai-provider <provider>", "AI provider: openai 或 anthropic")
    .option("--ai-model <model>", "AI 模型名")
    .option("--ai-base-url <url>", "AI API base URL")
    .option("--ai-api-key <key>", "AI API key")
    .option("--exclude-nodes <nodes...>", "要排除的节点")
    .action(async (opts) => {
        try {
            await runGenerate(opts);
        } catch (err) {
            console.error("❌ Error:", err);
            process.exit(1);
        }
    });

// ── serve ─────────────────────────────────────────────────
program
    .command("serve")
    .description("持续运行：定时采集话题、积累评分、到时间后自动生成日报")
    .option("-c, --config <path>", "配置文件路径")
    .option("--now", "立即构建一次（不等待 build interval）")
    .action(async (opts) => {
        try {
            await runServe(opts);
        } catch (err) {
            console.error("❌ Error:", err);
            process.exit(1);
        }
    });

// ── serve implementation ──────────────────────────────────
async function runServe(opts: any) {
    const config = loadConfig(opts.config);

    console.log("🚀 V2EX Digest — Serve Mode");
    console.log(`   Nodes: ${config.generate.nodes.join(", ")}`);
    console.log(`   Exclude: ${config.generate.excludeNodes.join(", ") || "(none)"}`);
    console.log(`   Fetch interval: ${config.generate.fetchIntervalMin}min`);
    console.log(`   Build interval: ${config.generate.buildIntervalMin}min`);
    console.log(`   Top-N: ${config.generate.topN}`);
    console.log(`   AI: ${config.ai.apiKey ? `${config.ai.provider}/${config.ai.model}` : "not configured"}`);
    console.log("");

    const store = new MemStore("./data");
    const collector = new Collector(config, store);
    const builder = new Builder(config, store);

    // AbortController for graceful shutdown
    const ac = new AbortController();
    const shutdown = () => {
        console.log("\n🛑 Shutting down...");
        ac.abort();
        store.persist();
        console.log("💾 Store persisted. Bye!");
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // If --now, run builder once immediately after first collect
    if (opts.now) {
        console.log("⚡ --now: collect once → build immediately\n");
        await collector.runOnce();
        await builder.runOnce();
    }

    // Start collector and builder loops concurrently
    console.log("\n--- Running (Ctrl+C to stop) ---\n");
    await Promise.all([
        collector.start(ac.signal),
        builder.start(ac.signal),
    ]);
}

// ── generate implementation ───────────────────────────────
async function runGenerate(opts: any) {
    const cliOverrides: Partial<AppConfig> = {};

    if (opts.nodes) cliOverrides.generate = { ...cliOverrides.generate, nodes: opts.nodes } as any;
    if (opts.topN) cliOverrides.generate = { ...cliOverrides.generate, topN: opts.topN } as any;
    if (opts.excludeNodes) cliOverrides.generate = { ...cliOverrides.generate, excludeNodes: opts.excludeNodes } as any;
    if (opts.token) cliOverrides.v2ex = { ...cliOverrides.v2ex, token: opts.token } as any;
    if (opts.aiProvider) cliOverrides.ai = { ...cliOverrides.ai, provider: opts.aiProvider } as any;
    if (opts.aiModel) cliOverrides.ai = { ...cliOverrides.ai, model: opts.aiModel } as any;
    if (opts.aiBaseUrl) cliOverrides.ai = { ...cliOverrides.ai, baseUrl: opts.aiBaseUrl } as any;
    if (opts.aiApiKey) cliOverrides.ai = { ...cliOverrides.ai, apiKey: opts.aiApiKey } as any;

    const config = loadConfig(opts.config, cliOverrides);
    const today = new Date().toISOString().slice(0, 10);

    console.log("📋 V2EX Digest Generator");
    console.log(`   Date: ${today}`);
    console.log(`   Nodes: ${config.generate.nodes.join(", ")}`);
    console.log(`   Exclude: ${config.generate.excludeNodes.join(", ") || "(none)"}`);
    console.log(`   Top-N: ${config.generate.topN}`);
    console.log(`   AI: ${opts.ai !== false ? `${config.ai.provider}/${config.ai.model}` : "disabled"}`);
    console.log("");

    const client = new V2EXClient(config.v2ex.token);
    const allItems: NewsItem[] = [];

    for (const source of config.generate.nodes) {
        console.log(`🔍 Fetching: ${source}...`);
        try {
            const items = await client.fetchBySource(source);
            console.log(`   → ${items.length} topics found`);
            allItems.push(...items);
        } catch (err) {
            console.error(`   ⚠️  Failed to fetch ${source}:`, err);
        }
    }

    if (allItems.length === 0) {
        console.error("❌ No topics fetched.");
        process.exit(1);
    }

    const storage = new Storage("./data");
    const skipIds = storage.getRecentIds(config.generate.skipHours);
    const ranked = scoreAndRank(allItems, config.generate.topN, skipIds, config.generate.excludeNodes);

    console.log(`\n📊 Scored ${allItems.length} topics → Top ${ranked.length} selected\n`);

    if (ranked.length === 0) {
        console.error("❌ No topics passed the filter.");
        process.exit(1);
    }

    const summarized: SummarizedItem[] = [];
    let postSummary = "";

    if (opts.ai !== false && config.ai.apiKey) {
        console.log("🤖 Running AI summaries...");
        const summarizer = new Summarizer({
            provider: config.ai.provider,
            apiKey: config.ai.apiKey,
            model: config.ai.model,
            baseUrl: config.ai.baseUrl || undefined,
        });

        for (const { item, score } of ranked) {
            process.stdout.write(`   Summarizing: ${item.title.slice(0, 50)}...`);
            const desc = await summarizer.summarizeItem(item.title, item.content, "Chinese");
            summarized.push({ item, score, description: desc });
            console.log(" ✓");
        }

        process.stdout.write("   Generating overall summary...");
        postSummary = await summarizer.summarizePost(ranked.map((r) => r.item), "Chinese");
        console.log(" ✓");
    } else {
        if (opts.ai !== false && !config.ai.apiKey) console.log("⚠️  No AI API key, skipping summaries");
        for (const { item, score } of ranked) summarized.push({ item, score, description: "" });
    }

    const title = expandVars(config.template.title || "V2EX 日报 {date}", today);
    const md = renderMarkdown({
        title, date: today, summary: postSummary,
        items: summarized,
    });

    mkdirSync("./out", { recursive: true });
    const outPath = join("./out", `daily-${today}.md`);
    writeFileSync(outPath, md, "utf-8");
    console.log(`\n✅ Daily digest written to: ${outPath}`);

    storage.save(today, allItems);
    console.log(`💾 Raw data saved to: ./data/${today}.json`);
}

program.parse();
