import { buildNewsKey, CountryCode, NewsCategory, NewsItem } from "@/lib/news";

type LocalStore = {
  map: Map<string, string>;
};

interface ReadOptions {
  country?: CountryCode;
  category?: NewsCategory;
  limit?: number;
  cursor?: number;
  sinceTs?: number;
}

function getLocalStore(): LocalStore {
  const g = globalThis as typeof globalThis & { __NEWS_LOCAL_STORE__?: LocalStore };
  if (!g.__NEWS_LOCAL_STORE__) {
    g.__NEWS_LOCAL_STORE__ = { map: new Map<string, string>() };
  }
  return g.__NEWS_LOCAL_STORE__;
}

export async function putNewsItem(item: NewsItem): Promise<void> {
  const key = buildNewsKey(item);
  const kv = process.env.DB;
  if (kv) {
    await kv.put(key, JSON.stringify(item));
    return;
  }
  getLocalStore().map.set(key, JSON.stringify(item));
}

export async function setLastUpdated(value: string): Promise<void> {
  const kv = process.env.DB;
  if (kv) {
    await kv.put("meta:last_updated", value);
    return;
  }
  getLocalStore().map.set("meta:last_updated", value);
}

function applyFilters(list: NewsItem[], options: ReadOptions): NewsItem[] {
  const country = options.country;
  const category = options.category;
  const sinceTs = options.sinceTs ?? 0;
  return list
    .filter((item) => (sinceTs > 0 ? item.publishedTs >= sinceTs : true))
    .filter((item) => (country ? item.country === country : true))
    .filter((item) => (category ? item.category === category : true))
    .sort((a, b) => b.publishedTs - a.publishedTs);
}

export async function readNewsItems(options: ReadOptions = {}): Promise<NewsItem[]> {
  const kv = process.env.DB;
  let rows: NewsItem[] = [];

  if (kv) {
    const newsData = await kv.list({ prefix: "news:" });
    const keys = newsData.keys.map((item) => item.name);
    const payload = await Promise.all(keys.map((key) => kv.get(key, "text")));
    rows = payload.filter(Boolean).map((row) => JSON.parse(row as string) as NewsItem);
  } else {
    const local = getLocalStore().map;
    rows = Array.from(local.entries())
      .filter(([key]) => key.startsWith("news:"))
      .map(([, value]) => JSON.parse(value) as NewsItem);
  }

  const filtered = applyFilters(rows, options);
  const cursor = options.cursor ?? 0;
  const limit = options.limit ?? filtered.length;
  return filtered.slice(cursor, cursor + limit);
}

export async function countNewsItems(options: Omit<ReadOptions, "limit" | "cursor"> = {}): Promise<number> {
  const all = await readNewsItems({ ...options, cursor: 0 });
  return all.length;
}

export async function purgeOldNews(cutoffTs: number): Promise<number> {
  const kv = process.env.DB;
  if (kv) {
    const newsData = await kv.list({ prefix: "news:" });
    const keys = newsData.keys.map((item) => item.name);
    const payload = await Promise.all(keys.map((key) => kv.get(key, "text")));
    const toDelete: string[] = [];
    payload.forEach((raw, idx) => {
      if (!raw) return;
      const row = JSON.parse(raw) as NewsItem;
      if ((row.publishedTs || 0) < cutoffTs) toDelete.push(keys[idx]);
    });
    await Promise.all(toDelete.map((key) => kv.delete(key)));
    return toDelete.length;
  }

  const local = getLocalStore().map;
  let removed = 0;
  for (const [key, raw] of Array.from(local.entries())) {
    if (!key.startsWith("news:")) continue;
    const row = JSON.parse(raw) as NewsItem;
    if ((row.publishedTs || 0) < cutoffTs) {
      local.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export async function readLastUpdated(): Promise<string | null> {
  const kv = process.env.DB;
  if (kv) return kv.get("meta:last_updated", "text");
  return getLocalStore().map.get("meta:last_updated") ?? null;
}
