"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COUNTRY_LABEL, CountryCode, NewsItem } from "@/lib/news";

interface NewsFeedProps {
  country: CountryCode;
  initialItems: NewsItem[];
  initialHasMore: boolean;
  pageSize?: number;
}

export default function NewsFeed({ country, initialItems, initialHasMore, pageSize = 20 }: NewsFeedProps) {
  const [items, setItems] = useState<NewsItem[]>(initialItems);
  const [cursor, setCursor] = useState<number>(initialItems.length);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [loading, setLoading] = useState<boolean>(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setItems(initialItems);
    setCursor(initialItems.length);
    setHasMore(initialHasMore);
  }, [initialItems, initialHasMore, country]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        country,
        limit: String(pageSize),
        cursor: String(cursor),
      });
      const res = await fetch(`/api/news?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: NewsItem[];
        hasMore: boolean;
      };
      if (Array.isArray(data.items) && data.items.length > 0) {
        setItems((prev) => [...prev, ...data.items]);
        setCursor((prev) => prev + data.items.length);
      }
      setHasMore(Boolean(data.hasMore));
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, country, pageSize, cursor]);

  useEffect(() => {
    const node = loaderRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "220px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  const empty = useMemo(() => items.length === 0, [items.length]);

  if (empty) {
    return <section className="sina-empty">正在抓取 {COUNTRY_LABEL[country]} 新闻，请稍后...</section>;
  }

  return (
    <section className="sina-feed" aria-live="polite">
      <ul className="sina-list">
        {items.map((item) => (
          <li key={`${item.id}-${item.link}`} className="sina-item">
            <span className="sina-source">
              {item.source}
              <span className="sina-date-inline">
                {" "}
                |{" "}
                {item.publishedTs
                  ? new Date(item.publishedTs).toLocaleString("zh-CN", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })
                  : item.pubDate}
              </span>
            </span>
            <a className="sina-link" href={item.link} target="_blank" rel="noreferrer">
              {item.translatedTitle}
            </a>
          </li>
        ))}
      </ul>

      <div ref={loaderRef} className="sina-loader">
        {loading ? "加载中..." : hasMore ? "继续下滑加载更多" : "已显示全部新闻"}
      </div>
    </section>
  );
}
