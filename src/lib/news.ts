export type Sentiment = "bullish" | "cautious" | "neutral";
export type CountryCode = "jp" | "cn" | "us" | "eu";
export type NewsCategory = "economy" | "tech" | "domestic" | "world" | "general";

export interface NewsItem {
  id: string;
  country: CountryCode;
  category: NewsCategory;
  source: string;
  pubDate: string;
  publishedTs: number;
  originalTitle: string;
  translatedTitle: string;
  analysis: string;
  sentiment: Sentiment;
  link: string;
}

interface RssSource {
  name: string;
  url: string;
  defaultCategory: NewsCategory;
}

export interface RssItem {
  country: CountryCode;
  title: string;
  link: string;
  pubDate: string;
  publishedTs: number;
  source: string;
  category: NewsCategory;
}

export const COUNTRY_LABEL: Record<CountryCode, string> = {
  jp: "日本",
  cn: "中国",
  us: "美国",
  eu: "欧洲",
};

export const CATEGORY_LABEL: Record<NewsCategory, string> = {
  economy: "经济",
  tech: "科技IT",
  domestic: "国内",
  world: "国际",
  general: "综合",
};

const RSS_SOURCES: Record<CountryCode, RssSource[]> = {
  jp: [
    { name: "NHK", defaultCategory: "domestic", url: "https://www3.nhk.or.jp/rss/news/cat0.xml" },
    { name: "Yahoo Japan Top", defaultCategory: "general", url: "https://news.yahoo.co.jp/rss/topics/top-picks.xml" },
    { name: "Yahoo Japan Domestic", defaultCategory: "domestic", url: "https://news.yahoo.co.jp/rss/topics/domestic.xml" },
    { name: "Yahoo Japan World", defaultCategory: "world", url: "https://news.yahoo.co.jp/rss/topics/world.xml" },
    { name: "Yahoo Japan Science", defaultCategory: "tech", url: "https://news.yahoo.co.jp/rss/topics/science.xml" },
    { name: "Yahoo Japan Business", defaultCategory: "economy", url: "https://news.yahoo.co.jp/rss/topics/business.xml" },
    { name: "Yahoo Japan IT", defaultCategory: "tech", url: "https://news.yahoo.co.jp/rss/topics/it.xml" },
  ],
  cn: [
    { name: "BBC 中文", defaultCategory: "world", url: "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml" },
    { name: "中国新闻网-滚动", defaultCategory: "general", url: "https://www.chinanews.com.cn/rss/scroll-news.xml" },
    { name: "中国新闻网-财经", defaultCategory: "economy", url: "https://www.chinanews.com.cn/rss/finance.xml" },
  ],
  us: [
    { name: "CNBC", defaultCategory: "economy", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
    { name: "TechCrunch", defaultCategory: "tech", url: "https://techcrunch.com/feed/" },
    { name: "NPR", defaultCategory: "domestic", url: "https://feeds.npr.org/1001/rss.xml" },
  ],
  eu: [
    { name: "Reuters World", defaultCategory: "world", url: "https://feeds.reuters.com/Reuters/worldNews" },
    { name: "The Guardian World", defaultCategory: "world", url: "https://www.theguardian.com/world/rss" },
    { name: "Euronews Business", defaultCategory: "economy", url: "https://www.euronews.com/rss?level=theme&name=business" },
  ],
};

const CATEGORY_RULES: Array<{ category: NewsCategory; words: string[] }> = [
  { category: "economy", words: ["economy", "inflation", "rate", "fed", "gdp", "fiscal", "market", "finance", "tariff"] },
  { category: "tech", words: ["ai", "chip", "semiconductor", "software", "cloud", "internet", "tech", "startup", "it"] },
  { category: "domestic", words: ["parliament", "government", "election", "minister", "policy", "education", "health"] },
  { category: "world", words: ["global", "war", "diplomacy", "eu", "un", "china", "russia", "middle east"] },
];

function xmlDecode(text: string): string {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function cleanRssText(text: string): string {
  return xmlDecode(text)
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return cleanRssText(match?.[1]?.trim() ?? "");
}

function classifyByText(title: string, fallback: NewsCategory): NewsCategory {
  const pool = title.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.words.some((word) => pool.includes(word))) return rule.category;
  }
  return fallback;
}

export async function translateToZhFree(text: string): Promise<string> {
  const source = text.trim();
  if (!source) return source;
  try {
    const url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=" +
      encodeURIComponent(source);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 NewsAgent/1.0" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`translate http ${res.status}`);
    const payload = await res.json();
    const translated = Array.isArray(payload?.[0])
      ? payload[0].map((seg: unknown[]) => String(seg?.[0] ?? "")).join("")
      : source;
    return translated || source;
  } catch {
    return source;
  }
}

async function fetchOneSource(country: CountryCode, source: RssSource): Promise<RssItem[]> {
  const res = await fetch(source.url, {
    headers: { "User-Agent": "Mozilla/5.0 NewsAgent/1.0" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${source.name} http ${res.status}`);

  const xml = await res.text();
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  const out: RssItem[] = [];
  const seen = new Set<string>();

  for (const item of blocks) {
    const title = pickTag(item, "title");
    const link = pickTag(item, "link");
    const pubDate = pickTag(item, "pubDate");
    if (!title || !link || seen.has(link)) continue;
    seen.add(link);
    const ts = Date.parse(pubDate) || 0;
    out.push({
      country,
      title,
      link,
      pubDate,
      publishedTs: ts,
      source: source.name,
      category: classifyByText(title, source.defaultCategory),
    });
    if (out.length >= 30) break;
  }
  return out;
}

export async function fetchCountryRss(country: CountryCode): Promise<RssItem[]> {
  const sources = RSS_SOURCES[country];
  const results = await Promise.allSettled(sources.map((src) => fetchOneSource(country, src)));
  const merged: RssItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") merged.push(...result.value);
  }

  const byLink = new Map<string, RssItem>();
  for (const row of merged) {
    if (!byLink.has(row.link)) byLink.set(row.link, row);
  }
  return Array.from(byLink.values())
    .sort((a, b) => b.publishedTs - a.publishedTs)
    .slice(0, 40);
}

export async function fetchMultiCountryRss(countries: CountryCode[]): Promise<RssItem[]> {
  const groups = await Promise.all(countries.map((country) => fetchCountryRss(country)));
  return groups.flat();
}

export async function analyzeWithDeepSeek(
  title: string,
): Promise<Pick<NewsItem, "translatedTitle" | "analysis" | "sentiment">> {
  const translated = await translateToZhFree(title);
  const category = classifyByText(title, "general");
  let analysis = "事件仍在发展，建议关注官方来源与后续关键数据。";
  if (category === "economy") {
    analysis = "关注通胀、利率与政策信号对市场风险偏好的影响。";
  } else if (category === "tech") {
    analysis = "关注技术迭代与资本开支节奏，短期波动可能放大。";
  } else if (category === "domestic") {
    analysis = "关注政策执行与社会预期变化对消费与投资的影响。";
  } else if (category === "world") {
    analysis = "关注地缘与贸易变量对供应链、汇率与风险资产的冲击。";
  }

  return {
    translatedTitle: translated,
    analysis,
    sentiment: "neutral",
  };
}

export function buildNewsKey(item: Pick<NewsItem, "country" | "publishedTs" | "id">): string {
  const date = item.publishedTs > 0 ? new Date(item.publishedTs).toISOString().slice(0, 10) : "unknown";
  return `news:${item.country}:${date}:${item.id}`;
}
