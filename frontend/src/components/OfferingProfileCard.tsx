import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  getOrganisation,
  syncOfferingProfile,
  type OfferingProfile,
  type OrganisationOut,
} from "../api/organisations";
import { getOrganisationId } from "../lib/session";
import { cn } from "../lib/cn";

/* XSparks Offering Profile card (brief items 2, 13, 24). Reads the real
 * profile off the organisation (getOrganisation) and refreshes it live
 * (syncOfferingProfile). Shows honest sync status: synced / fallback / stale /
 * sync failed. Used by Settings and Onboarding. */

const STATUS_META: Record<string, { label: string; tone: string }> = {
  synced: { label: "Synced", tone: "bg-[#e7f8ef] text-[#16a34a]" },
  fallback: { label: "Fallback", tone: "bg-[#fff1e3] text-[#f97316]" },
  stale: { label: "Stale", tone: "bg-[#fff1e3] text-[#f97316]" },
  sync_failed: { label: "Sync failed", tone: "bg-[#fee2e2] text-[#ef4444]" },
};

function StatusBadge({ status }: { status: string | null }) {
  const meta = STATUS_META[status ?? ""] ?? { label: status ?? "Not synced", tone: "bg-[#f1f5f9] text-[#64748b]" };
  return <span className={cn("inline-flex items-center rounded-[6px] px-[8px] py-[3px] text-[11px] font-semibold", meta.tone)}>{meta.label}</span>;
}

export function OfferingProfileCard() {
  const [profile, setProfile] = useState<OfferingProfile | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [competitors, setCompetitors] = useState<OrganisationOut["competitors"]>(null);
  const [syncing, setSyncing] = useState(false);

  const load = () => {
    const orgId = getOrganisationId();
    if (!orgId) return;
    getOrganisation(orgId)
      .then((org) => {
        setProfile(org.offering_profile);
        setStatus(org.offering_profile_status);
        setSyncedAt(org.offering_profile_synced_at);
        setSourceUrl(org.offering_profile_source_url);
        setCompetitors(org.competitors);
      })
      .catch(() => {});
  };

  useEffect(load, []);

  // The Organization card (Settings) also has its own "Research" trigger next
  // to the Website field, calling the same syncOfferingProfile endpoint - it
  // broadcasts this event so this card's copy of the profile updates
  // immediately instead of only on next page load.
  useEffect(() => {
    window.addEventListener("offering-profile-synced", load);
    return () => window.removeEventListener("offering-profile-synced", load);
  }, []);

  const handleRefresh = async () => {
    const orgId = getOrganisationId();
    if (!orgId) return;
    setSyncing(true);
    try {
      const result = await syncOfferingProfile(orgId);
      setProfile(result.profile);
      setStatus(result.status);
      // The sync response carries the profile only - competitors are
      // re-identified in the same refresh, so re-read the organisation.
      load();
    } catch {
      /* keep existing view */
    }
    setSyncing(false);
  };

  return (
    <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-[12px]">
        <div>
          <h2 className="m-0 text-[16px] font-bold text-[#0f172a]">Offering Profile</h2>
          <p className="m-0 mt-[4px] text-[13px] text-[#64748b]">
            What your company sells — used to judge how relevant each prospect&apos;s buying signals are. Never excludes a company.
          </p>
          <div className="mt-[8px] flex flex-wrap items-center gap-[10px] text-[12px] text-[#64748b]">
            <StatusBadge status={status} />
            {sourceUrl && (
              <a className="text-[#2563eb] no-underline hover:underline" href={sourceUrl} rel="noreferrer" target="_blank">
                {sourceUrl}
              </a>
            )}
            {syncedAt && <span>Last synced {new Date(syncedAt).toLocaleString()}</span>}
          </div>
        </div>
        <button
          className="flex h-[36px] items-center gap-[7px] rounded-[8px] border border-[#e2e8f0] bg-white px-[14px] text-[12px] font-bold text-[#0f1f6f] disabled:opacity-50"
          disabled={syncing}
          onClick={handleRefresh}
          type="button"
        >
          <RefreshCw className={cn("size-[14px]", syncing && "animate-spin")} />
          {syncing ? "Refreshing..." : "Refresh Offering Profile"}
        </button>
      </div>

      {profile && (
        <div className="mt-[16px] grid grid-cols-1 gap-[16px] md:grid-cols-2">
          <div>
            <p className="m-0 text-[12px] font-semibold text-[#94a3b8]">Offering areas</p>
            <ul className="m-0 mt-[6px] flex flex-col gap-[4px] pl-[16px] text-[13px] text-[#334155]">
              {(profile.offerings ?? []).map((o) => <li key={o.name}>{o.name}</li>)}
            </ul>
          </div>
          <div className="flex flex-col gap-[12px]">
            {profile.problems_solved && profile.problems_solved.length > 0 && (
              <TagList label="Problems solved" items={profile.problems_solved} />
            )}
            {profile.relevant_technologies && profile.relevant_technologies.length > 0 && (
              <TagList label="Technologies" items={profile.relevant_technologies} />
            )}
            {profile.alternative_solutions && profile.alternative_solutions.length > 0 && (
              <TagList label="Alternative solutions" items={profile.alternative_solutions.map((a) => a.category)} />
            )}
          </div>
        </div>
      )}

      {/* Read-only: produced by the AI on refresh, never user-edited. Only
          keeps these companies out of Find companies and drives competitor
          news - it never changes a score. */}
      <div className="mt-[16px] border-t border-[#eef1f6] pt-[14px]">
        <p className="m-0 text-[12px] font-semibold text-[#94a3b8]">Competitors (AI-identified)</p>
        <p className="m-0 mt-[2px] text-[12px] text-[#64748b]">
          Used to keep these companies out of Find companies and to track competitor news. Updated when you refresh the
          Offering Profile.
        </p>
        {competitors && competitors.length > 0 ? (
          <div className="mt-[8px] flex flex-wrap gap-[6px]">
            {competitors.map((c) => (
              <span className="rounded-[6px] bg-[#f1f5f9] px-[8px] py-[3px] text-[12px] text-[#475569]" key={`${c.name}-${c.domain ?? ""}`}>
                {c.name}
                {c.domain && <span className="ml-[4px] text-[#94a3b8]">{c.domain}</span>}
              </span>
            ))}
          </div>
        ) : (
          <p className="m-0 mt-[8px] text-[12px] text-[#94a3b8]">
            No competitors identified yet — refresh the Offering Profile.
          </p>
        )}
      </div>
    </div>
  );
}

function TagList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="m-0 text-[12px] font-semibold text-[#94a3b8]">{label}</p>
      <div className="mt-[6px] flex flex-wrap gap-[6px]">
        {items.slice(0, 12).map((item) => (
          <span className="rounded-[6px] bg-[#f1f5f9] px-[8px] py-[3px] text-[12px] text-[#475569]" key={item}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
