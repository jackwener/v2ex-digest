import type { NewsItem, ScoredItem } from "./types";

/**
 * Hacker-News-like time-decay scoring.
 *
 * Score = (replies - 1) / (hours_since_post + 2) ^ 1.8
 *
 * New posts with many replies score high; old posts decay naturally.
 */
export function computeScore(item: NewsItem): number {
    if (item.replies <= 0) return 0;

    const hoursSincePost =
        (Date.now() - item.createdAt.getTime()) / (1000 * 60 * 60);
    const hours = Math.max(hoursSincePost, 0);

    const score = (item.replies - 1) / Math.pow(hours + 2, 1.8);
    return isNaN(score) || score < 0 ? 0 : score;
}

/**
 * Score, filter, deduplicate and sort items. Returns top N.
 * Supports node exclusion (e.g. filter out "promotions").
 */
export function scoreAndRank(
    items: NewsItem[],
    topN: number,
    skipIds: Set<string> = new Set(),
    excludeNodes: string[] = []
): ScoredItem[] {
    const excludeSet = new Set(excludeNodes.map((n) => n.toLowerCase()));

    // Deduplicate by ID and filter excluded nodes
    const seen = new Set<string>();
    const unique: NewsItem[] = [];
    for (const item of items) {
        if (seen.has(item.id) || skipIds.has(item.id)) continue;
        if (excludeSet.has(item.nodeName.toLowerCase())) continue;
        seen.add(item.id);
        unique.push(item);
    }

    // Score and filter out zero-score items
    const scored: ScoredItem[] = unique
        .map((item) => ({ item, score: computeScore(item) }))
        .filter((s) => s.score > 0);

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topN);
}
