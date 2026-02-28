import type { V2EXTopic, NewsItem } from "./types";

const V2EX_BASE_URL = "https://www.v2ex.com";

export class V2EXClient {
    private token: string;

    constructor(token: string = "") {
        this.token = token;
    }

    private async request<T>(path: string): Promise<T> {
        const headers: Record<string, string> = {
            "User-Agent": "v2ex-digest/1.0",
        };
        if (this.token) {
            headers["Authorization"] = `Bearer ${this.token}`;
        }

        const url = `${V2EX_BASE_URL}${path}`;
        const resp = await fetch(url, { headers });

        if (!resp.ok) {
            throw new Error(`V2EX API error: ${resp.status} ${resp.statusText} for ${url}`);
        }

        return resp.json() as Promise<T>;
    }

    /** Fetch the top 10 hot topics from the homepage */
    async fetchHot(): Promise<NewsItem[]> {
        const topics = await this.request<V2EXTopic[]>("/api/topics/hot.json");
        return topics.map((t) => this.normalize(t));
    }

    /** Fetch latest topics */
    async fetchLatest(): Promise<NewsItem[]> {
        const topics = await this.request<V2EXTopic[]>("/api/topics/latest.json");
        return topics.map((t) => this.normalize(t));
    }

    /** Fetch topics by node name */
    async fetchByNode(nodeName: string): Promise<NewsItem[]> {
        const topics = await this.request<V2EXTopic[]>(
            `/api/topics/show.json?node_name=${encodeURIComponent(nodeName)}`
        );
        return topics.map((t) => this.normalize(t));
    }

    /**
     * Fetch topics based on source type:
     * - "hot" → hot topics
     * - "latest" → latest topics
     * - anything else → fetch by node name
     */
    async fetchBySource(source: string): Promise<NewsItem[]> {
        switch (source.toLowerCase()) {
            case "hot":
                return this.fetchHot();
            case "latest":
                return this.fetchLatest();
            default:
                return this.fetchByNode(source);
        }
    }

    private normalize(t: V2EXTopic): NewsItem {
        return {
            id: String(t.id),
            title: t.title,
            url: t.url || `${V2EX_BASE_URL}/t/${t.id}`,
            content: t.content || "",
            nodeName: t.node?.name || "",
            nodeTitle: t.node?.title || "",
            author: t.member?.username || "",
            replies: t.replies || 0,
            createdAt: new Date(t.created * 1000),
        };
    }
}
