import OpenAI from "openai";
import type { NewsItem } from "./types";

export interface SummarizerConfig {
    provider: "openai" | "anthropic";
    apiKey: string;
    model: string;
    baseUrl?: string;
}

/**
 * AI summarizer supporting both OpenAI and Anthropic protocols.
 */
export class Summarizer {
    private config: SummarizerConfig;
    private openaiClient?: OpenAI;

    constructor(config: SummarizerConfig) {
        this.config = config;

        // Only create OpenAI client for openai provider
        if (config.provider !== "anthropic") {
            this.openaiClient = new OpenAI({
                apiKey: config.apiKey,
                baseURL: config.baseUrl || "https://api.openai.com/v1",
            });
        }
    }

    /**
     * Summarize a single topic — retaining author's voice and deep meaning.
     */
    async summarizeItem(
        title: string,
        content: string,
        language: string
    ): Promise<string> {
        const trimmedContent = content.trim() || title;
        const truncated =
            [...trimmedContent].length > 1500
                ? [...trimmedContent].slice(0, 1500).join("")
                : trimmedContent;

        const systemPrompt = `Try your best to rewrite the text into a summary, write in ${language}, return 1–3 sentences (30–180 words), summarizing the topic.
The summary should retain the deep meaning or deep wisdom of the text.
You must summarize in the author's writing style.
You must be creative, be fun.`;

        const userPrompt = `Title: ${title}\nContent: ${truncated}`;

        return this.chat(systemPrompt, userPrompt);
    }

    /**
     * Generate a detailed overall summary for the day's top items (3-5 sentences).
     */
    async summarizePost(
        items: NewsItem[],
        language: string
    ): Promise<string> {
        if (items.length === 0) return "";

        const topItems = items.slice(0, 10);
        const listing = topItems
            .map((it) => `- ${it.title} (${it.nodeTitle || it.nodeName})`)
            .join("\n");

        const systemPrompt = `Try your best to rewrite the text into a summary, write in ${language}, return 3–5 sentences (90–270 words), summarizing the topic.
The summary should retain the deep meaning or deep wisdom of the text.
You must summarize in the author's writing style.
You must be creative, be fun.`;

        const userPrompt = `Top items (title and node):\n${listing}\nTask: Write some sentences for summarizing today's highlights. Output the summarization only, plain text, two or three or more paragraphs, no links.`;

        return this.chat(systemPrompt, userPrompt);
    }

    /**
     * Generate a zen-master-style short summary — concise, insightful, poetic.
     * Used for frontmatter summary / social preview.
     */
    async summarizeZen(
        items: NewsItem[],
        language: string
    ): Promise<string> {
        if (items.length === 0) return "";

        const topItems = items.slice(0, 10);
        const listing = topItems
            .map((it) => `- ${it.title} (${it.nodeTitle || it.nodeName})`)
            .join("\n");

        const systemPrompt = `Try your best to rewrite the text into a summary, write in ${language}, return 1–2 sentences (20–90 words), summarizing the topic.
The summary should retain the deep meaning or deep wisdom of the text.
You must summarize in the author's writing style.
You must be creative, be fun.
The summary should be as short as possible.
You must try your best to get the deep principal idea of the text, may be in ZEN way.`;

        const userPrompt = `Today's information streams (title and source):\n${listing}\nTask: Reflect upon these happenings with zen-like insight. Illuminate the hidden threads that connect these events. Share your contemplation in plain text, flowing like a gentle river across one paragraph, with no external links to disturb the meditation.`;

        return this.chat(systemPrompt, userPrompt);
    }

    private async chat(systemPrompt: string, userPrompt: string): Promise<string> {
        try {
            if (this.config.provider === "anthropic") {
                return await this.chatAnthropic(systemPrompt, userPrompt);
            } else {
                return await this.chatOpenAI(systemPrompt, userPrompt);
            }
        } catch (err) {
            console.error("[AI] Chat failed:", err);
            return "";
        }
    }

    /** OpenAI-compatible chat completions */
    private async chatOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
        const resp = await this.openaiClient!.chat.completions.create({
            model: this.config.model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature: 0.4,
        });
        return resp.choices[0]?.message?.content?.trim() ?? "";
    }

    /** Anthropic Messages API */
    private async chatAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
        const baseUrl = (this.config.baseUrl || "https://api.anthropic.com").replace(/\/+$/, "");
        const url = `${baseUrl}/v1/messages`;

        const body = {
            model: this.config.model,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [
                { role: "user", content: userPrompt },
            ],
        };

        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": this.config.apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Anthropic API error ${resp.status}: ${text}`);
        }

        const data = await resp.json() as any;
        // Anthropic response: { content: [{ type: "text", text: "..." }] }
        const textBlock = data.content?.find((c: any) => c.type === "text");
        return textBlock?.text?.trim() ?? "";
    }
}
