# V2EX Digest

V2EX 日报生成器 — 抓取 V2EX 话题，HN-like 评分排序，AI 生成摘要，输出 Markdown。

## Quick Start

```bash
bun install
cp config.example.yaml config.yaml  # 编辑填入 AI API key
```

### 一次性生成

```bash
# 无 AI，仅抓取 + 评分
bun run generate --no-ai

# 带 AI 总结
bun run generate

# 指定节点 + 数量
bun run generate --nodes programmer create ideas --top-n 10
```

### 持续运行（serve 模式）

每 10 分钟轮询节点、积累评分，每 30 分钟检查并自动生成日报：

```bash
# 后台运行
bun run serve

# 启动后立即生成一次，然后进入循环
bun run serve -- --now
```

## Configuration

`config.yaml` 支持的配置项：

```yaml
v2ex:
  token: ""              # V2EX API token (optional)

ai:
  provider: "openai"     # "openai" or "anthropic"
  api_key: ""
  model: "gpt-4o-mini"
  base_url: ""           # for compatible endpoints

generate:
  nodes: ["hot"]         # hot / latest / node names
  exclude_nodes: ["promotions"]
  top_n: 20
  skip_hours: 72
  fetch_interval_min: 10 # serve mode: collector interval
  build_interval_min: 30 # serve mode: builder interval
```

CLI 参数会覆盖配置文件，详见 `bun run generate --help`。

## Output

| 路径 | 说明 |
|------|------|
| `out/daily-YYYY-MM-DD.md` | 生成的日报 |
| `data/` | 存储缓存（评分、去重标记） |

## Scoring Algorithm

使用 Hacker News 风格的时间衰减评分：

```
Score = (replies - 1) / (hours + 2) ^ 1.8
```

- 新帖 + 多回复 → 高分
- 老帖自然衰减
- 零回复帖子自动过滤

## Architecture

```
generate 模式:  fetch → score → [AI summarize] → render → out/
serve 模式:     collector (loop) → mem-store → builder (loop) → render → out/
```

| 模块 | 说明 |
|------|------|
| `v2ex-client.ts` | V2EX API 封装 |
| `scorer.ts` | HN-like 评分 + 节点过滤 |
| `summarizer.ts` | AI 总结（OpenAI / Anthropic 双协议） |
| `renderer.ts` | Markdown 渲染 |
| `mem-store.ts` | 内存存储（替代 Redis） |
| `collector.ts` | 定时采集 |
| `builder.ts` | 定时构建日报 |
