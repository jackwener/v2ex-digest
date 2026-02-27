import type { SummarizedItem } from "./types";

interface RenderData {
    title: string;
    date: string;
    summary: string;
    items: SummarizedItem[];
}

/**
 * Render daily digest to Markdown string.
 */
export function renderMarkdown(data: RenderData): string {
    const lines: string[] = [];

    // YAML frontmatter
    lines.push("---");
    lines.push(`title: "${data.title}"`);
    lines.push(`date: ${data.date}`);
    if (data.summary) {
        const short = [...data.summary].slice(0, 100).join("").split("\n")[0];
        lines.push(`summary: "${short}…"`);
    }
    lines.push("---");
    lines.push("");

    // Overall summary
    if (data.summary) {
        lines.push(data.summary);
        lines.push("");
    }

    // Items
    for (const { item, score, description } of data.items) {
        const nodeDisplay = item.nodeTitle || item.nodeName;
        const nodeUrl = `https://www.v2ex.com/go/${item.nodeName}`;

        lines.push(`## [${item.title}](${item.url})`);
        lines.push("");

        if (description) {
            lines.push(description);
            lines.push("");
        }

        const created = item.createdAt.toISOString().slice(0, 16).replace("T", " ");
        lines.push(
            `*${item.replies} Replies · [@${nodeDisplay}](${nodeUrl}) · ${created} · by ${item.author}*`
        );
        lines.push("");
    }

    return lines.join("\n");
}

/**
 * Expand template variables in title.
 */
export function expandVars(template: string, date: string): string {
    return template.replace(/\{date\}/g, date);
}
