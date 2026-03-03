import { CountryCode, fetchCountryRss, NewsItem, translateToZhFree } from "@/lib/news";
import { countNewsItems, readLastUpdated, readNewsItems } from "@/lib/store";

export const runtime = "edge";

function parseCountry(input: string | null): CountryCode | undefined {
  if (!input) return undefined;
  const value = input.toLowerCase();
  if (value === "jp" || value === "cn" || value === "us" || value === "eu") return value;
  return undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const country = parseCountry(url.searchParams.get("country"));
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 24), 1), 60);
  const cursor = Math.max(Number(url.searchParams.get("cursor") || 0), 0);
  const hasKv = Boolean(process.env.DB);

  if (!hasKv && country) {
    const rss = await fetchCountryRss(country);
    const total = rss.length;
    const paged = rss.slice(cursor, cursor + limit);
    const items: NewsItem[] = await Promise.all(
      paged.map(async (item, idx) => ({
        id: `${item.country}-${item.publishedTs || 0}-${cursor + idx}`,
        country: item.country,
        category: item.category,
        source: item.source,
        pubDate: item.pubDate,
        publishedTs: item.publishedTs,
        originalTitle: item.title,
        translatedTitle: await translateToZhFree(item.title),
        analysis: "",
        sentiment: "neutral",
        link: item.link,
      })),
    );

    return Response.json({
      success: true,
      country,
      category: "all",
      total,
      hasMore: cursor + items.length < total,
      nextCursor: cursor + items.length < total ? cursor + items.length : null,
      lastUpdated: new Date().toISOString(),
      windowHours: null,
      items,
    });
  }

  const items = await readNewsItems({ country, limit, cursor });
  const total = await countNewsItems({ country });
  const lastUpdated = await readLastUpdated();

  return Response.json({
    success: true,
    country: country ?? "all",
    category: "all",
    total,
    hasMore: cursor + items.length < total,
    nextCursor: cursor + items.length < total ? cursor + items.length : null,
    lastUpdated,
    windowHours: null,
    items,
  });
}
