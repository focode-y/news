import Link from "next/link";
import { RefreshCw } from "lucide-react";
import {
  analyzeWithDeepSeek,
  CountryCode,
  fetchCountryRss,
  NewsItem,
  translateToZhFree,
} from "@/lib/news";
import { readLastUpdated, readNewsItems } from "@/lib/store";
import NewsFeed from "@/components/news-feed";

export const runtime = "edge";
export const revalidate = 600;

const COUNTRY_TABS: Array<{ code: CountryCode; label: string }> = [
  { code: "jp", label: "日本" },
  { code: "cn", label: "中国" },
  { code: "us", label: "美国" },
  { code: "eu", label: "欧洲" },
];

function parseCountry(input?: string): CountryCode {
  if (input === "jp" || input === "cn" || input === "us" || input === "eu") return input;
  return "jp";
}
function fallbackAnalysis(category: NewsItem["category"], title: string): string {
  const t = title.toLowerCase();
  if (category === "economy") {
    return /rate|inflation|gdp|market|finance/.test(t)
      ? "通胀与利率预期可能扰动资产定价，关注后续数据。"
      : "宏观与政策信号仍在演化，关注市场风险偏好变化。";
  }
  if (category === "tech") {
    return /ai|chip|semiconductor|cloud|software/.test(t)
      ? "技术迭代与资本开支共振，留意产业链景气传导。"
      : "科技板块受政策与需求双重影响，短期波动或加大。";
  }
  if (category === "domestic") {
    return "国内政策执行与社会预期变化，可能影响消费与投资。";
  }
  if (category === "world") {
    return "地缘与贸易变量仍高，需观察对供应链与汇率的冲击。";
  }
  return "事件仍在发展，建议关注官方信息与后续关键数据。";
}

interface PageProps {
  searchParams: Promise<{
    country?: string;
  }>;
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const country = parseCountry(params.country);
  const hasKv = Boolean(process.env.DB);

  let list: NewsItem[] = [];
  let lastUpdated: string | null = null;
  let initialHasMore = false;

  const buildFallbackList = async (): Promise<NewsItem[]> => {
    const rss = await fetchCountryRss(country);
    const filtered = rss.slice(0, 20);
    return Promise.all(
      filtered.map(async (item, idx) => {
        const translatedTitle = await translateToZhFree(item.title);
        let analysis = fallbackAnalysis(item.category, item.title);
        let sentiment: NewsItem["sentiment"] = "neutral";

        if (process.env.DEEPSEEK_API_KEY) {
          const ai = await analyzeWithDeepSeek(item.title);
          analysis = ai.analysis || analysis;
          sentiment = ai.sentiment || sentiment;
        }

        return {
          id: `${item.country}-${item.publishedTs}-${idx}`,
          country: item.country,
          category: item.category,
          source: item.source,
          pubDate: item.pubDate,
          publishedTs: item.publishedTs,
          originalTitle: item.title,
          translatedTitle,
          analysis,
          sentiment,
          link: item.link,
        };
      }),
    );
  };

  if (hasKv) {
    list = await readNewsItems({ country, limit: 20 });
    const nextProbe = await readNewsItems({ country, limit: 1, cursor: 20 });
    initialHasMore = nextProbe.length > 0;
    lastUpdated = await readLastUpdated();
    if (list.length === 0) {
      list = await buildFallbackList();
      lastUpdated = new Date().toISOString();
      initialHasMore = false;
    }
  } else {
    const rss = await fetchCountryRss(country);
    list = (await buildFallbackList()).slice(0, 20);
    initialHasMore = rss.length > 20;
    lastUpdated = new Date().toISOString();
  }

  return (
    <div className="sina-page min-h-screen">
      <main className="sina-wrap">
        <a href="https://www.yaracodes.com/" className="inline-block transition-transform active:scale-95 hover:opacity-90" target="_blank" rel="noreferrer">
          <img
            src="/yaralogo.png"
            alt="主站Logo"
            className="h-12 w-auto max-w-[200px] object-contain"
          />
        </a>
        <header className="sina-topbar">
          <div>
            <h1 className="sina-title">新闻滚动</h1>
            <p className="sina-subtitle">24小时实时更新，聚合全球要闻</p>
          </div>
          <div className="sina-refresh">
            <RefreshCw className="h-4 w-4" />
            <span>
              更新时间：{lastUpdated ? new Date(lastUpdated).toLocaleString("zh-CN") : "等待首次更新"}
              {!hasKv ? "（本地实时预览）" : ""}
            </span>
          </div>
        </header>

        <nav className="sina-tabs" aria-label="国家筛选">
          {COUNTRY_TABS.map((tab) => (
            <Link
              key={tab.code}
              href={`/?country=${tab.code}`}
              className={`sina-tab ${tab.code === country ? "is-active" : ""}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <NewsFeed country={country} initialItems={list} initialHasMore={initialHasMore} />
      </main>
    </div>
  );
}


