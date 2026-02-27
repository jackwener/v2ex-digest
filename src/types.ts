// V2EX API response types

export interface V2EXTopic {
  id: number;
  title: string;
  url: string;
  content: string;
  content_rendered: string;
  replies: number;
  node: {
    name: string;
    title: string;
  };
  member: {
    username: string;
  };
  created: number;
  last_modified: number;
  last_touched: number;
}

// Internal normalized item

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  content: string;
  nodeName: string;
  nodeTitle: string;
  author: string;
  replies: number;
  createdAt: Date;
}

export interface ScoredItem {
  item: NewsItem;
  score: number;
}

// AI summary result

export interface SummarizedItem {
  item: NewsItem;
  score: number;
  description: string;
}

// Config

export interface AppConfig {
  v2ex: {
    token: string;
  };
  ai: {
    provider: "openai" | "anthropic";
    apiKey: string;
    model: string;
    baseUrl: string;
  };
  generate: {
    nodes: string[];
    excludeNodes: string[];
    topN: number;
    skipHours: number;
    fetchIntervalMin: number;
    buildIntervalMin: number;
  };
  template: {
    title: string;
  };
}
