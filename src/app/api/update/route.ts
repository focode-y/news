import { revalidatePath } from "next/cache";
import { analyzeWithDeepSeek, CountryCode, fetchMultiCountryRss, NewsItem } from "@/lib/news";
import { purgeOldNews, putNewsItem, readNewsItems, setLastUpdated } from "@/lib/store";

export const runtime = "edge";

const ALL_COUNTRIES: CountryCode[] = ["jp", "cn", "us", "eu"];

function parseCountries(input: string | null): CountryCode[] {
  if (!input || input === "all") return ALL_COUNTRIES;
  const list = input.split(",").map((v) => v.trim().toLowerCase());
  return list.filter((v): v is CountryCode => v === "jp" || v === "cn" || v === "us" || v === "eu");
}

export async function GET(request: Request) {
  try {
    const now = Date.now();
    const cutoffTs = now - 24 * 60 * 60 * 1000;
    const url = new URL(request.url);
    const countries = parseCountries(url.searchParams.get("country"));
    const rssItems = await fetchMultiCountryRss(countries);
    const recent = await readNewsItems({ sinceTs: cutoffTs, limit: 2000 });
    const existingByLink = new Map(recent.map((item) => [item.link, item]));
    const output: NewsItem[] = [];
    let analyzedCount = 0;
    let reusedCount = 0;

    for (const [idx, item] of rssItems.entries()) {
      if (item.publishedTs > 0 && item.publishedTs < cutoffTs) continue;
      const existing = existingByLink.get(item.link);
      if (existing) {
        output.push(existing);
        reusedCount += 1;
        continue;
      }

      const ai = await analyzeWithDeepSeek(item.title);
      const row: NewsItem = {
        id: `${item.country}-${item.publishedTs || 0}-${idx}`,
        country: item.country,
        category: item.category,
        source: item.source,
        pubDate: item.pubDate,
        publishedTs: item.publishedTs,
        originalTitle: item.title,
        translatedTitle: ai.translatedTitle,
        analysis: ai.analysis,
        sentiment: ai.sentiment,
        link: item.link,
      };
      await putNewsItem(row);
      existingByLink.set(item.link, row);
      output.push(row);
      analyzedCount += 1;
    }

    const removedCount = await purgeOldNews(cutoffTs);
    const updatedAt = new Date().toISOString();
    await setLastUpdated(updatedAt);
    revalidatePath("/");

    return Response.json({
      success: true,
      count: output.length,
      analyzedCount,
      reusedCount,
      removedCount,
      countries,
      updatedAt,
      storage: process.env.DB ? "cloudflare-kv(DB)" : "no-kv(local-preview-mode)",
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

