import { Building2, ChevronRight, Clock, Rocket, Tag } from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { Donut } from "../../components/ui/dataviz";
import { cn } from "../../lib/cn";
import { getTriggerEvents, type TriggerEventOut, type TriggerEventsOut } from "../../api/triggers";
import { getWorkspaceId } from "../../lib/session";
import { CATEGORY_COLORS, categoryLabel, categoryStyle } from "../../lib/signalCategories";

const pageBackground =
  "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

type IconType = ComponentType<{ className?: string }>;

function getTriggerIdFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("id");
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function titleCase(s: string): string {
  return s
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function LogoSquare({
  icon: Icon,
  text,
  bg,
  color,
  size = 40,
  radius = 10,
}: {
  icon?: IconType;
  text?: string;
  bg: string;
  color: string;
  size?: number;
  radius?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center text-[12px] font-bold"
      style={{ backgroundColor: bg, color, width: size, height: size, borderRadius: radius }}
    >
      {Icon ? <Icon className="size-[19px]" /> : text}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Header + tabs                                                       */
/* ------------------------------------------------------------------ */

function DetailHeader({ trigger, eventCount }: { trigger: TriggerEventsOut["trigger"]; eventCount: number }) {
  const category = trigger.signal_categories?.[0];
  const style = category ? categoryStyle(category) : categoryStyle("");

  return (
    <div className="flex items-start gap-[18px]">
      <LogoSquare bg={style.bg} color={style.color} icon={Rocket} radius={14} size={60} />
      <div>
        <div className="flex flex-wrap items-center gap-[12px]">
          <h1 className="m-0 text-[24px] font-bold text-[#0f172a]">
            {trigger.name || "Untitled Trigger"}
          </h1>
          {category && (
            <span
              className="rounded-[7px] px-[10px] py-[4px] text-[12px] font-semibold"
              style={{ backgroundColor: style.bg, color: style.color }}
            >
              {categoryLabel(category)}
            </span>
          )}
        </div>
        <p className="m-0 mt-[6px] text-[14px] text-[#64748b]">
          {eventCount} signal{eventCount === 1 ? "" : "s"} matched so far.
        </p>
        <p className="m-0 mt-[8px] flex flex-wrap items-center gap-x-[8px] gap-y-[4px] text-[13px] text-[#94a3b8]">
          <span>Created: {formatDate(trigger.created_at)}</span>
          <span>•</span>
          <span>Last Modified: {formatDate(trigger.updated_at)}</span>
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview + category distribution                                    */
/* ------------------------------------------------------------------ */

function OverviewItem({
  icon: Icon,
  color,
  label,
  children,
}: {
  icon: IconType;
  color: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-[12px]">
      <span className="flex size-[32px] shrink-0 items-center justify-center rounded-[8px] bg-[#f1f5f9]" style={{ color }}>
        <Icon className="size-[16px]" />
      </span>
      <div className="min-w-0">
        <p className="m-0 text-[11px] text-[#94a3b8]">{label}</p>
        <div className="mt-[3px] text-[13px] font-semibold text-[#334155]">{children}</div>
      </div>
    </div>
  );
}

function categoryDistribution(events: TriggerEventOut[]) {
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.signal_category] = (counts[e.signal_category] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([category, value], i) => ({
      label: categoryLabel(category),
      value,
      pct: events.length ? `${((value / events.length) * 100).toFixed(1)}%` : "0%",
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);
}

function OverviewCard({ trigger, events }: { trigger: TriggerEventsOut["trigger"]; events: TriggerEventOut[] }) {
  const dist = categoryDistribution(events);
  const companyCount = new Set(events.map((e) => e.company_id)).size;

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="grid grid-cols-1 gap-[28px] lg:grid-cols-[1.25fr_1fr]">
        <div>
          <h2 className="m-0 text-[17px] font-bold text-[#0f172a]">Trigger Overview</h2>
          <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">
            Key information about this trigger and its configuration.
          </p>

          <div className="mt-[18px] flex flex-col gap-[18px]">
            <OverviewItem color="#7c3aed" icon={Tag} label="Matches On">
              <div className="flex flex-wrap gap-[6px]">
                {[...(trigger.signal_types ?? []), ...(trigger.signal_categories ?? [])].map((v) => (
                  <span className="rounded-[6px] bg-[#f3e9ff] px-[8px] py-[3px] text-[12px] font-medium text-[#7c3aed]" key={v}>
                    {titleCase(v)}
                  </span>
                ))}
                {!trigger.signal_types?.length && !trigger.signal_categories?.length && (
                  <span className="text-[12px] font-normal text-[#94a3b8]">Not configured</span>
                )}
              </div>
            </OverviewItem>
            <OverviewItem color="#2563eb" icon={Building2} label="Companies Matched">
              {companyCount.toLocaleString()}
            </OverviewItem>
            <OverviewItem color="#64748b" icon={Clock} label="Created / Last Modified">
              <span className="font-normal text-[#475569]">
                {formatDate(trigger.created_at)} · {formatDate(trigger.updated_at)}
              </span>
            </OverviewItem>
          </div>
        </div>

        <div>
          <h2 className="m-0 text-[17px] font-bold text-[#0f172a]">Signal Category Distribution</h2>
          {dist.length === 0 ? (
            <p className="mt-[16px] text-[13px] text-[#94a3b8]">No signals matched yet.</p>
          ) : (
            <div className="mt-[16px] flex flex-col items-center gap-[22px] sm:flex-row">
              <div className="relative size-[150px] shrink-0">
                <Donut segments={dist.map((s) => ({ value: s.value, color: s.color }))} size={150} thickness={22} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[22px] font-bold leading-none text-[#0f172a]">{events.length}</span>
                  <span className="mt-[3px] text-[11px] text-[#64748b]">Total Signals</span>
                </div>
              </div>
              <div className="flex w-full flex-1 flex-col gap-[12px]">
                {dist.map((s) => (
                  <div className="flex items-center justify-between gap-[10px]" key={s.label}>
                    <span className="flex items-center gap-[8px]">
                      <span className="size-[9px] rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-[12px] font-medium text-[#334155]">{s.label}</span>
                    </span>
                    <span className="whitespace-nowrap text-[12px] text-[#94a3b8]">
                      <span className="font-semibold text-[#0f172a]">{s.value}</span> ({s.pct})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Recent signals                                                      */
/* ------------------------------------------------------------------ */

const signalColumns = "grid-cols-[minmax(0,1.1fr)_minmax(0,2.2fr)_1fr_0.8fr_0.7fr]";

function RecentSignalsCard({ events }: { events: TriggerEventOut[] }) {
  const rows = [...events]
    .sort((a, b) => new Date(b.detected_at ?? 0).getTime() - new Date(a.detected_at ?? 0).getTime())
    .slice(0, 10);

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[24px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[17px] font-bold text-[#0f172a]">Recent Signals</h2>
      <p className="m-0 mt-[3px] text-[13px] text-[#64748b]">
        Latest signals generated by this trigger
      </p>

      {rows.length === 0 ? (
        <p className="mt-[16px] text-[13px] text-[#94a3b8]">No signals matched yet.</p>
      ) : (
        <div className="mt-[16px] overflow-x-auto">
          <div className="min-w-[820px]">
            <div className={cn("grid gap-[16px] border-b border-[#eef1f6] pb-[10px] text-[12px] font-medium text-[#94a3b8]", signalColumns)}>
              <span>Company</span>
              <span>Fact</span>
              <span>Category</span>
              <span>Detected</span>
              <span>Notified</span>
            </div>

            <div className="divide-y divide-[#f1f5f9]">
              {rows.map((e) => {
                const style = categoryStyle(e.signal_category);
                return (
                  <div className={cn("grid items-center gap-[16px] py-[14px]", signalColumns)} key={e.trigger_event_id}>
                    <div className="flex min-w-0 items-center gap-[10px]">
                      <LogoSquare bg={style.bg} color={style.color} icon={Building2} radius={9} size={36} />
                      <p className="m-0 truncate text-[13px] font-bold text-[#0f172a]">{e.company_name}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[13px] font-medium text-[#334155]">
                        {e.core_fact || titleCase(e.signal_type)}
                      </p>
                    </div>
                    <span
                      className="w-fit rounded-[6px] px-[8px] py-[2px] text-[11px] font-semibold"
                      style={{ backgroundColor: style.bg, color: style.color }}
                    >
                      {categoryLabel(e.signal_category)}
                    </span>
                    <span className="text-[13px] text-[#64748b]">{relativeTime(e.detected_at)}</span>
                    <span
                      className={cn(
                        "w-fit rounded-[6px] px-[8px] py-[2px] text-[11px] font-semibold",
                        e.notified ? "bg-[#dcfce7] text-[#16a34a]" : "bg-[#f1f5f9] text-[#64748b]",
                      )}
                    >
                      {e.notified ? "Yes" : "No"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Right rail                                                          */
/* ------------------------------------------------------------------ */

function PerfStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="m-0 text-[12px] text-[#94a3b8]">{label}</p>
      <p className="m-0 mt-[3px] text-[18px] font-bold leading-none text-[#0f172a]">{value}</p>
    </div>
  );
}

function TriggerPerformanceCard({ events }: { events: TriggerEventOut[] }) {
  const companyCount = new Set(events.map((e) => e.company_id)).size;
  const mostRecent = events.reduce<string | null>((latest, e) => {
    if (!e.detected_at) return latest;
    if (!latest || new Date(e.detected_at) > new Date(latest)) return e.detected_at;
    return latest;
  }, null);

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">Trigger Performance</h2>
      <div className="mt-[16px] grid grid-cols-3 gap-[12px]">
        <PerfStat label="Signals Matched" value={String(events.length)} />
        <PerfStat label="Companies Matched" value={String(companyCount)} />
        <PerfStat label="Most Recent" value={relativeTime(mostRecent)} />
      </div>
    </section>
  );
}

function TopMatchedCard({ events }: { events: TriggerEventOut[] }) {
  const byCompany = new Map<string, { name: string; count: number; latestFact: string | null }>();
  for (const e of events) {
    const existing = byCompany.get(e.company_id);
    if (existing) {
      existing.count += 1;
    } else {
      byCompany.set(e.company_id, { name: e.company_name, count: 1, latestFact: e.core_fact });
    }
  }
  const rows = [...byCompany.values()].sort((a, b) => b.count - a.count).slice(0, 6);

  return (
    <section className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 text-[15px] font-bold text-[#0f172a]">Top Matched Companies</h2>
      {rows.length === 0 ? (
        <p className="mt-[14px] text-[13px] text-[#94a3b8]">No companies matched yet.</p>
      ) : (
        <div className="mt-[14px] flex flex-col gap-[14px]">
          {rows.map((c) => (
            <div className="flex items-center gap-[12px]" key={c.name}>
              <LogoSquare bg="#eef1ff" color="#4f46e5" text={c.name.slice(0, 2).toUpperCase()} radius={9} size={38} />
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[13px] font-bold text-[#0f172a]">{c.name}</p>
                <p className="m-0 truncate text-[12px] text-[#94a3b8]">{c.latestFact || "—"}</p>
              </div>
              <span className="inline-flex items-center justify-center rounded-[8px] bg-[#efeafe] px-[10px] py-[4px] text-[13px] font-bold text-[#6d28d9]">
                {c.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function TriggerDetailPage() {
  const [data, setData] = useState<TriggerEventsOut | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const triggerId = getTriggerIdFromUrl();
    const workspaceId = getWorkspaceId();
    if (!triggerId || !workspaceId) {
      setLoadError("No trigger selected.");
      return;
    }
    getTriggerEvents(workspaceId, triggerId)
      .then(setData)
      .catch(() => setLoadError("Could not load this trigger."));
  }, []);

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Trigger Intelligence" />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          searchPlaceholder="Search companies, triggers, executives..."
          showDetection={false}
          showNotificationBell={false}
        />

        <main className="flex-1 overflow-x-hidden px-[28px] py-[22px]">
          <nav className="flex items-center gap-[8px] text-[13px]">
            <a className="text-[#64748b] no-underline hover:text-[#334155]" href="/trigger-library">
              Trigger Library
            </a>
            <ChevronRight className="size-[14px] text-[#cbd5e1]" />
            <span className="font-semibold text-[#0f172a]">Trigger Details</span>
          </nav>

          {loadError && !data ? (
            <p className="mt-[24px] text-[14px] font-medium text-[#64748b]">{loadError}</p>
          ) : !data ? (
            <p className="mt-[24px] text-[14px] font-medium text-[#64748b]">Loading trigger...</p>
          ) : (
            <>
              <div className="mt-[16px]">
                <DetailHeader eventCount={data.event_count} trigger={data.trigger} />
              </div>

              <div className="mt-[24px] grid grid-cols-1 gap-[24px] xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="flex flex-col gap-[24px]">
                  <OverviewCard events={data.events} trigger={data.trigger} />
                  <RecentSignalsCard events={data.events} />
                </div>

                <div className="flex flex-col gap-[24px]">
                  <TriggerPerformanceCard events={data.events} />
                  <TopMatchedCard events={data.events} />
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
