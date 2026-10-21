import { ExternalLink, Newspaper } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { listAiNews, type AiNewsCategory, type AiNewsItem, type AiNewsListOut } from "../../api/organisations";
import { cn } from "../../lib/cn";

/* Dashboard "Latest News" - news about the top 50 global AI companies (GET
 * /organisations/{org}/ai-news). The feed is global: the same for every
 * organisation, rebuilt every 72h by the backend news scheduler (you.com
 * search -> LLM picks the companies and files each item under a category). */

const NEWS_DAYS = 30;
// The card shows NEWS_INITIAL items; "View all" shows NEWS_PAGE_SIZE per page,
// with any further news on later pages.
const NEWS_PAGE_SIZE = 10;
const NEWS_INITIAL = 5;

type TabKey = "all" | AiNewsCategory;

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "product_launch", label: "Product Launches" },
  { key: "funding", label: "Funding" },
  { key: "press_briefing", label: "Press Briefings" },
  { key: "buying_signal", label: "Buying Signals & Deals" },
];

const CATEGORY_CHIPS: Record<AiNewsCategory, { label: string; tone: string }> = {
  product_launch: { label: "Product launch", tone: "bg-[#e2edff] text-[#005bff]" },
  funding: { label: "Funding", tone: "bg-[#e7f8ef] text-[#16a34a]" },
  press_briefing: { label: "Press briefing", tone: "bg-[#f3e8ff] text-[#7c3aed]" },
  buying_signal: { label: "Deal / buying signal", tone: "bg-[#ffedd5] text-[#f97316]" },
};

/* Same company-color-hash approach as SignalFeedPage's LOGO_COLORS/hashString
 * - same company always gets the same color across pages. */
const AVATAR_COLORS = ["#16a34a", "#2563eb", "#7c3aed", "#0d9488", "#ef4444", "#6366f1", "#10b981", "#3b82f6", "#334155", "#f97316"];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function initialsOf(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// Only goes to "Nd ago" - fine, the card never shows anything older than 30 days.
function relativeTime(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/* "Updated 5h ago · next update in ~43h" from the scheduler's last run. */
function schedulerLabel(news: AiNewsListOut | null): string | null {
  if (!news?.refreshed_at) return null;
  const hoursSince = (Date.now() - new Date(news.refreshed_at).getTime()) / 3_600_000;
  const hoursLeft = Math.round(news.refresh_interval_hours - hoursSince);
  const next = hoursLeft > 0 ? `next update in ~${hoursLeft}h` : "next update soon";
  return `Updated ${relativeTime(news.refreshed_at)} · ${next}`;
}

function NewsRow({ item }: { item: AiNewsItem }) {
  const chip = CATEGORY_CHIPS[item.category];
  const dateLabel = item.published_at ? relativeTime(item.published_at) : `found ${relativeTime(item.discovered_at)}`;
  return (
    <article className="flex gap-[12px] py-[14px]">
      <span
        className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold text-white"
        style={{ backgroundColor: AVATAR_COLORS[hashString(item.company_name) % AVATAR_COLORS.length] }}
      >
        {initialsOf(item.company_name) || "?"}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[4px]">
          <span className="truncate text-[14px] font-bold text-[#0f172a]">{item.company_name}</span>
          {chip && (
            <span
              className={cn(
                "inline-flex items-center whitespace-nowrap rounded-[6px] px-[9px] py-[3px] text-[11px] font-semibold leading-[16px]",
                chip.tone,
              )}
            >
              {chip.label}
            </span>
          )}
          <span className="ml-auto whitespace-nowrap text-[11px] text-[#94a3b8]">{dateLabel}</span>
        </div>

        <p className="m-0 mt-[6px] text-[14px] font-semibold leading-[20px] text-[#1e293b]">{item.title}</p>
        {item.summary && (
          <p className="m-0 mt-[2px] line-clamp-2 text-[13px] leading-[19px] text-[#64748b]">{item.summary}</p>
        )}

        <div className="mt-[8px] text-[12px]">
          <a
            className="inline-flex min-w-0 items-center gap-[4px] text-[#64748b] no-underline hover:text-[#2563eb]"
            href={item.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <ExternalLink className="size-[12px] shrink-0" />
            <span className="truncate">{item.source_domain || domainOf(item.url)}</span>
          </a>
        </div>
      </div>
    </article>
  );
}

function CardMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center px-[16px] text-center text-[13px] text-[#94a3b8]">
      {children}
    </div>
  );
}

export function LatestNewsCard({ organisationId }: { organisationId: string | null }) {
  const [tab, setTab] = useState<TabKey>("all");
  const [news, setNews] = useState<AiNewsListOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);

  // Each tab starts collapsed, on its first page.
  useEffect(() => {
    setExpanded(false);
    setPage(1);
  }, [tab]);

  useEffect(() => {
    if (!organisationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    listAiNews(organisationId, {
      days: NEWS_DAYS,
      page,
      page_size: NEWS_PAGE_SIZE,
      category: tab === "all" ? undefined : tab,
    })
      .then((res) => {
        if (!cancelled) setNews(res);
      })
      .catch(() => {
        if (!cancelled) {
          setNews(null);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organisationId, tab, page]);

  const items = news?.items ?? [];
  const total = news?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / NEWS_PAGE_SIZE));
  const visibleItems = expanded ? items : items.slice(0, NEWS_INITIAL);
  const canToggle = total > NEWS_INITIAL;

  const collapse = () => {
    setExpanded(false);
    setPage(1);
  };
  const scheduler = schedulerLabel(news);

  return (
    <section className="rounded-[18px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-[8px]">
        <div>
          <h2 className="m-0 flex items-center gap-[8px] text-[17px] font-bold text-[#0f172a]">
            <Newspaper className="size-[18px] text-[#2563eb]" />
            Latest News
          </h2>
          <p className="m-0 mt-[2px] text-[12px] text-[#64748b]">
            {news && news.company_count > 0
              ? `Top ${news.company_count} global AI companies · last ${NEWS_DAYS} days`
              : `Top global AI companies · last ${NEWS_DAYS} days`}
          </p>
        </div>
        {scheduler && <span className="text-[12px] text-[#94a3b8]">{scheduler}</span>}
      </div>

      <div
        aria-label="News categories"
        className="mt-[14px] flex gap-[6px] overflow-x-auto border-b border-[#eef1f6] pb-[10px]"
        role="tablist"
      >
        {TABS.map((t) => (
          <button
            aria-controls="latest-news-panel"
            aria-selected={t.key === tab}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-[8px] px-[12px] py-[6px] text-[13px] font-semibold transition",
              t.key === tab ? "bg-[#e2edff] text-[#005bff]" : "text-[#64748b] hover:bg-[#f8fafc]",
            )}
            id={`latest-news-tab-${t.key}`}
            key={t.key}
            onClick={() => setTab(t.key)}
            role="tab"
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      <div aria-labelledby={`latest-news-tab-${tab}`} id="latest-news-panel" role="tabpanel">
        {loading ? (
          <CardMessage>Loading news…</CardMessage>
        ) : failed ? (
          <CardMessage>Couldn't load news right now. Please try again shortly.</CardMessage>
        ) : items.length === 0 ? (
          <CardMessage>
            {news && news.company_count === 0
              ? "AI industry news is being collected. The first update runs shortly after the backend starts."
              : `No news in this category in the last ${NEWS_DAYS} days.`}
          </CardMessage>
        ) : (
          <div className="mt-[4px] divide-y divide-[#f1f5f9]">
            {visibleItems.map((item) => (
              <NewsRow item={item} key={item.ai_market_news_id} />
            ))}
          </div>
        )}

        {!failed && canToggle && (
          <div className="mt-[8px] flex flex-wrap items-center justify-between gap-[10px] border-t border-[#eef1f6] pt-[12px]">
            {expanded && pageCount > 1 ? (
              <nav aria-label="News pages" className="flex items-center gap-[8px] text-[13px]">
                <button
                  className="rounded-[8px] border border-[#e2e8f0] px-[10px] py-[4px] font-semibold text-[#334155] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={loading || page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  type="button"
                >
                  Previous
                </button>
                <span className="whitespace-nowrap text-[#64748b]" aria-live="polite">
                  Page {page} of {pageCount}
                </span>
                <button
                  className="rounded-[8px] border border-[#e2e8f0] px-[10px] py-[4px] font-semibold text-[#334155] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={loading || page >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  type="button"
                >
                  Next
                </button>
              </nav>
            ) : (
              <span className="text-[12px] text-[#94a3b8]">
                {expanded ? `${total} stories` : `Showing ${Math.min(NEWS_INITIAL, total)} of ${total}`}
              </span>
            )}
            <button
              aria-controls="latest-news-panel"
              aria-expanded={expanded}
              className="ml-auto text-[13px] font-semibold text-[#2563eb] hover:underline"
              onClick={() => (expanded ? collapse() : setExpanded(true))}
              type="button"
            >
              {expanded ? "Show less" : "View all"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
