import { Fragment, useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, ChevronUp, Pencil, Trash2, X } from "lucide-react";
import { Sidebar } from "../../components/layout/Sidebar";
import { TopBar } from "../../components/layout/TopBar";
import { OfferingProfileCard } from "../../components/OfferingProfileCard";
import { cn } from "../../lib/cn";
import { ApiError, BASE_URL } from "../../api/client";
import {
  cancelJob,
  deleteImportBatch,
  getJobItems,
  getJobStatus,
  listImportBatches,
  retryFailedJobItems,
  type CompanyJobStatus,
  type ImportBatchOut,
  type JobItemOut,
  type JobStatus,
  type JobStatusOut,
} from "../../api/icp";
import { exportCompanies } from "../../api/companies";
import { uploadProspects } from "../../api/prospectImports";
import { uploadLogo } from "../../api/uploads";
import {
  createWorkspace,
  listWorkspaces,
  listWorkspaceMembers,
  type MemberOut,
  type WorkspaceOut,
} from "../../api/workspaces";
import { getOrganisation, updateOrganisation, type OrganisationOut } from "../../api/organisations";
import { updateUser } from "../../api/users";
import { auth } from "../../lib/firebase";
import { useRefreshCurrentUser } from "../../lib/CurrentUserContext";
import { getOrganisationId, getWorkspaceId, setWorkspaceId } from "../../lib/session";
import uploadIconAsset from "../../assets/figma/onboarding/icons/upload.svg";
import workspaceIconAsset from "../../assets/figma/onboarding/icons/workspace.svg";
import globeIconAsset from "../../assets/figma/onboarding/icons/globe.svg";

/* Read-only explanation of how scoring works (brief item 2). */
function ScoringMethodCard() {
  return (
    <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[22px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="m-0 font-['Inter'] text-[16px] font-bold text-[#0f172a]">Scoring Method</h2>
      <p className="m-0 mt-[6px] font-['Inter'] text-[14px] font-semibold text-[#334155]">
        Lead Score = Buying Evidence + Contact Access − Negative Evidence (0–100)
      </p>
      <ul className="m-0 mt-[10px] flex flex-col gap-[6px] pl-[18px] font-['Inter'] text-[13px] text-[#64748b]">
        <li>Status thresholds: Sales Ready 65+, High Priority 50–64, Warm 35–49, Monitor 20–34, Low Priority 0–19.</li>
        <li>Evidence is deduplicated - multiple articles about one event count once, with corroborating sources.</li>
        <li>Revenue and funding affect Expected Deal Value only, never the Lead Score.</li>
        <li>Confidence is calculated separately from the score.</li>
        <li>External evidence is gathered live via Tavily web research.</li>
      </ul>
    </div>
  );
}

/* Ongoing counterpart to Onboarding's Offering & Prospect Data step: review
 * the XSparks Offering Profile, upload prospect data at any time, and see
 * every past upload in a persisted history table (IcpImportBatch - a real DB
 * table, not derived from Company/Signal/LeadScore, which only ever hold the
 * *result* of an upload). No ICP is collected or required (brief items 1/2).
 *
 * Deliberately self-contained (does not import from OnboardingPage.tsx) so
 * changes here can never regress the onboarding wizard. */

const pageBackground = "linear-gradient(180deg, rgb(246, 247, 251) 0%, rgb(242, 244, 250) 100%)";

const icons = {
  workspace: workspaceIconAsset,
  upload: uploadIconAsset,
  globe: globeIconAsset,
};

function formatDate(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label className="font-['Inter'] text-[14px] font-semibold leading-[20px] text-[#334155]">
      {children}
    </label>
  );
}

function TextField({
  icon,
  label,
  placeholder,
  value,
  onChange,
}: {
  icon: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-[8px]">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative flex h-[42px] items-center rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc]">
        <img alt="" className="pointer-events-none absolute left-[12px] size-[20px]" src={icon} />
        <input
          className="h-full w-full rounded-[8px] bg-transparent pl-[41px] pr-[17px] font-['Inter'] text-[14px] leading-[20px] text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type="text"
          value={value}
        />
      </div>
    </div>
  );
}

function ExcelUploadButton({
  workspaceId,
  onUploadStart,
  onUploadComplete,
}: {
  workspaceId: string | null;
  onUploadStart: () => void;
  onUploadComplete: (batch: ImportBatchOut) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedLabel, setUploadedLabel] = useState<string | null>(null);
  const ready = Boolean(workspaceId);

  const handleFiles = async (files: File[]) => {
    if (!workspaceId || files.length === 0) {
      return;
    }
    setUploading(true);
    setError(null);
    onUploadStart();
    try {
      // Ingestion finishes by the time this resolves; live Tavily research +
      // evidence scoring run in the background on the server
      // (batch.scoring_status === "pending") - polling refreshes history until
      // it flips to "complete". No ICP (brief section 7).
      const batch = await uploadProspects(workspaceId, files);
      setUploadedLabel(files.length === 1 ? files[0].name : `${files.length} files`);
      onUploadComplete(batch);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Upload failed. Please try again.");
    }
    setUploading(false);
  };

  return (
    <div className="flex flex-col items-end gap-[4px]">
      <div className="flex items-center gap-[8px]">
        <input
          accept=".csv,.xlsx"
          className="hidden"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) {
              handleFiles(files);
            }
            e.target.value = "";
          }}
          ref={fileInputRef}
          type="file"
        />
        <button
          className="flex h-[36px] items-center gap-[7px] rounded-[8px] border border-[#e2e8f0] bg-white px-[16px] font-['Inter'] text-[12px] font-bold text-[#0f1f6f] disabled:opacity-50"
          disabled={!ready || uploading}
          onClick={() => fileInputRef.current?.click()}
          title="Upload one or more prospect CSV/XLSX files"
          type="button"
        >
          <img alt="" className="size-[14px]" src={icons.upload} />
          {uploading ? "Uploading..." : "Upload Prospects"}
        </button>
      </div>
      {error && <p className="m-0 font-['Inter'] text-[11px] font-medium text-[#ef4444]">{error}</p>}
      {!error && uploadedLabel && (
        <p className="m-0 font-['Inter'] text-[11px] font-medium text-[#16a34a]">
          Uploaded {uploadedLabel} — research &amp; scoring in the background
        </p>
      )}
    </div>
  );
}

const LOGO_ACCEPT = "image/png,image/jpeg,image/svg+xml";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function OrgLogoUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/svg+xml"].includes(file.type)) {
      setError("Logo must be a PNG, JPG, or SVG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("Logo must be 2MB or smaller.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const { url } = await uploadLogo(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-[8px]">
      <FieldLabel>Company Logo</FieldLabel>
      <input
        accept={LOGO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      <div className="relative flex h-[42px] w-fit items-center gap-[10px] rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] px-[10px]">
        {value ? (
          <img alt="Company logo" className="size-[26px] rounded-full object-cover" src={`${BASE_URL}${value}`} />
        ) : (
          <span className="flex size-[26px] items-center justify-center rounded-full bg-white">
            <img alt="" className="size-[13px]" src={icons.upload} />
          </span>
        )}
        <button
          className="font-['Inter'] text-[12px] font-bold text-[#005bff] disabled:opacity-60"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          {uploading ? "Uploading..." : value ? "Change" : "Upload"}
        </button>
        {value && !uploading && (
          <button
            aria-label="Remove logo"
            className="text-[#94a3b8] hover:text-[#dc2626]"
            onClick={() => {
              onChange("");
              setError(null);
            }}
            type="button"
          >
            <X className="size-[13px]" strokeWidth={2.5} />
          </button>
        )}
      </div>
      {error && <p className="m-0 font-['Inter'] text-[11px] text-[#dc2626]">{error}</p>}
    </div>
  );
}

type OrgFormState = {
  company_name: string;
  website: string;
  legal_business_name: string;
  industry: string;
  headquarters_location: string;
  company_description: string;
  account_logo_url: string;
  designation: string;
};

function orgFormFrom(org: OrganisationOut, me: MemberOut | null): OrgFormState {
  return {
    company_name: org.company_name ?? "",
    website: org.website ?? "",
    legal_business_name: org.legal_business_name ?? "",
    industry: org.industry ?? "",
    headquarters_location: org.headquarters_location ?? "",
    company_description: org.company_description ?? "",
    account_logo_url: org.account_logo_url ?? "",
    designation: me?.designation ?? "",
  };
}

/* Mirrors onboarding's (trimmed) Organization Setup step, so the same real
 * Organisation fields collected once at signup stay editable afterward
 * instead of being locked in forever. Designation lives here in the UI (same
 * placement as onboarding) but is actually a per-person field stored on the
 * caller's own User row - saved separately via updateUser, self-only (see
 * app/controllers/users.py's update). */
function OrganizationPanel({
  organisationId,
  workspaceId,
}: {
  organisationId: string | null;
  workspaceId: string | null;
}) {
  const [org, setOrg] = useState<OrganisationOut | null>(null);
  const [me, setMe] = useState<MemberOut | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<OrgFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshCurrentUser = useRefreshCurrentUser();

  useEffect(() => {
    if (!organisationId) return;
    getOrganisation(organisationId).then(setOrg).catch(() => setOrg(null));
  }, [organisationId]);

  useEffect(() => {
    if (!workspaceId) return;
    const email = auth.currentUser?.email;
    listWorkspaceMembers(workspaceId)
      .then((members) => setMe(members.find((m) => m.email === email) ?? null))
      .catch(() => setMe(null));
  }, [workspaceId]);

  if (!organisationId || !org) {
    return null;
  }

  const startEdit = () => {
    setForm(orgFormFrom(org, me));
    setError(null);
    setEditing(true);
  };

  const handleFieldChange = <K extends keyof OrgFormState>(field: K, value: OrgFormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateOrganisation(organisationId, {
        company_name: form.company_name,
        website: form.website || null,
        legal_business_name: form.legal_business_name || null,
        industry: form.industry || null,
        headquarters_location: form.headquarters_location || null,
        company_description: form.company_description || null,
        account_logo_url: form.account_logo_url || null,
      });
      setOrg(updated);
      if (me && form.designation !== (me.designation ?? "")) {
        const updatedUser = await updateUser(organisationId, me.user_id, {
          designation: form.designation || null,
        });
        setMe({ ...me, designation: updatedUser.designation });
        // TopBar's UserMenu reads the shared CurrentUserContext, which only
        // re-fetches when the workspace changes - without this it would keep
        // showing the old designation until a full page reload.
        refreshCurrentUser();
      }
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not save changes.");
    }
    setSaving(false);
  };

  const rows: [string, string][] = [
    ["Company Name", org.company_name || "—"],
    ["Website", org.website || "—"],
    ["Legal Business Name", org.legal_business_name || "—"],
    ["Industry", org.industry || "—"],
    ["Headquarters Location", org.headquarters_location || "—"],
    ["Your Designation", me?.designation || "—"],
  ];

  return (
    <div className="mb-[20px] rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-[10px]">
          <span className="flex size-[36px] items-center justify-center rounded-[9px] bg-[#eef1ff] text-[#4f46e5]">
            <Building2 className="size-[18px]" />
          </span>
          <div>
            <h2 className="m-0 font-['Inter'] text-[16px] font-bold text-[#0f172a]">Organization</h2>
            <p className="m-0 mt-[2px] font-['Inter'] text-[12px] text-[#64748b]">
              The company profile collected during onboarding.
            </p>
          </div>
        </div>
        {!editing && (
          <button
            className="flex h-[36px] items-center gap-[6px] rounded-[8px] border border-[#e2e8f0] bg-white px-[14px] font-['Inter'] text-[12px] font-bold text-[#334155] hover:bg-[#f1f5f9]"
            onClick={startEdit}
            type="button"
          >
            <Pencil className="size-[13px]" />
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <div className="mt-[14px] grid grid-cols-1 gap-[10px] sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <p className="m-0 font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.4px] text-[#94a3b8]">
                {label}
              </p>
              <p className="m-0 mt-[2px] truncate font-['Inter'] text-[13px] font-medium text-[#0f172a]">{value}</p>
            </div>
          ))}
          {org.company_description && (
            <div className="sm:col-span-2 xl:col-span-3">
              <p className="m-0 font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.4px] text-[#94a3b8]">
                Company Description
              </p>
              <p className="m-0 mt-[2px] font-['Inter'] text-[13px] font-medium leading-[19px] text-[#0f172a]">
                {org.company_description}
              </p>
            </div>
          )}
        </div>
      ) : (
        form && (
          <div className="mt-[16px] flex flex-col gap-[14px]">
            <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2 xl:grid-cols-3">
              <TextField
                icon={icons.workspace}
                label="Company Name"
                onChange={(v) => handleFieldChange("company_name", v)}
                value={form.company_name}
              />
              <TextField
                icon={icons.globe}
                label="Website"
                onChange={(v) => handleFieldChange("website", v)}
                value={form.website}
              />
              <TextField
                icon={icons.workspace}
                label="Legal Business Name"
                onChange={(v) => handleFieldChange("legal_business_name", v)}
                value={form.legal_business_name}
              />
              <TextField
                icon={icons.workspace}
                label="Industry"
                onChange={(v) => handleFieldChange("industry", v)}
                placeholder="e.g. Software"
                value={form.industry}
              />
              <TextField
                icon={icons.globe}
                label="Headquarters Location"
                onChange={(v) => handleFieldChange("headquarters_location", v)}
                value={form.headquarters_location}
              />
              <TextField
                icon={icons.workspace}
                label="Your Designation"
                onChange={(v) => handleFieldChange("designation", v)}
                placeholder="e.g. VP of Sales"
                value={form.designation}
              />
              <OrgLogoUpload onChange={(v) => handleFieldChange("account_logo_url", v)} value={form.account_logo_url} />
            </div>
            <div className="flex flex-col gap-[8px]">
              <FieldLabel>Company Description</FieldLabel>
              <textarea
                className="min-h-[74px] w-full resize-none rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] px-[14px] py-[12px] font-['Inter'] text-[13px] font-normal leading-[20px] text-[#0f172a] outline-none"
                maxLength={500}
                onChange={(e) => handleFieldChange("company_description", e.target.value)}
                value={form.company_description}
              />
            </div>
            {error && <p className="m-0 font-['Inter'] text-[12px] text-[#ef4444]">{error}</p>}
            <div className="flex items-center gap-[8px]">
              <button
                className="h-[36px] rounded-[8px] bg-[#005bff] px-[20px] font-['Inter'] text-[12px] font-bold text-white disabled:opacity-60"
                disabled={saving}
                onClick={save}
                type="button"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                className="h-[36px] rounded-[8px] border border-[#e2e8f0] bg-white px-[16px] font-['Inter'] text-[12px] font-bold text-[#334155]"
                onClick={() => setEditing(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}

/* One Organisation can have many Workspaces (department-level - Sales,
 * Marketing, etc: see Workspace.organisation_id being one-to-many) - the
 * backend and the create/list endpoints already supported this, nothing
 * in the UI ever called them until now. Switching writes the new
 * workspace_id to session (lib/session.ts) and reloads, since every
 * workspace-scoped page on the site (this one included) reads that value
 * fresh on mount rather than through any shared/global state. */
function WorkspacesPanel({ organisationId }: { organisationId: string | null }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceOut[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const currentWorkspaceId = getWorkspaceId();

  const refresh = (orgId: string) => {
    listWorkspaces(orgId)
      .then(setWorkspaces)
      .catch(() => setWorkspaces([]));
  };

  useEffect(() => {
    if (!organisationId) return;
    refresh(organisationId);
  }, [organisationId]);

  if (!organisationId) {
    return null;
  }

  const create = async () => {
    if (!name.trim()) {
      setCreateError("Workspace Name is required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await createWorkspace(organisationId, {
        workspace_name: name.trim(),
        purpose: purpose.trim() || null,
      });
      setName("");
      setPurpose("");
      setShowCreateForm(false);
      refresh(organisationId);
    } catch (err) {
      setCreateError(err instanceof ApiError ? String(err.detail) : "Could not create workspace.");
    }
    setCreating(false);
  };

  const switchTo = (id: string) => {
    if (id === currentWorkspaceId) return;
    setWorkspaceId(id);
    window.location.reload();
  };

  return (
    <div className="mb-[20px] rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-[10px]">
          <span className="flex size-[36px] items-center justify-center rounded-[9px] bg-[#eef1ff] text-[#4f46e5]">
            <Building2 className="size-[18px]" />
          </span>
          <div>
            <h2 className="m-0 font-['Inter'] text-[16px] font-bold text-[#0f172a]">Workspaces</h2>
            <p className="m-0 mt-[2px] font-['Inter'] text-[12px] text-[#64748b]">
              One per department - switch anytime from the Dashboard too.
            </p>
          </div>
        </div>
        <button
          className="h-[36px] rounded-[8px] bg-[#005bff] px-[16px] font-['Inter'] text-[12px] font-bold text-white"
          onClick={() => setShowCreateForm((v) => !v)}
          type="button"
        >
          {showCreateForm ? "Cancel" : "+ New Workspace"}
        </button>
      </div>

      {showCreateForm && (
        <div className="mt-[14px] grid grid-cols-1 gap-[12px] rounded-[10px] border border-[#f1f5f9] bg-[#f8fafc] p-[14px] sm:grid-cols-2">
          <div className="flex flex-col gap-[6px]">
            <label className="font-['Inter'] text-[12px] font-semibold text-[#334155]">Workspace Name</label>
            <input
              className="h-[38px] rounded-[8px] border border-[#e2e8f0] bg-white px-[12px] font-['Inter'] text-[13px] text-[#0f172a] outline-none"
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sales"
              value={name}
            />
          </div>
          <div className="flex flex-col gap-[6px]">
            <label className="font-['Inter'] text-[12px] font-semibold text-[#334155]">
              Department / Purpose
            </label>
            <input
              className="h-[38px] rounded-[8px] border border-[#e2e8f0] bg-white px-[12px] font-['Inter'] text-[13px] text-[#0f172a] outline-none"
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Sales"
              value={purpose}
            />
          </div>
          {createError && (
            <p className="m-0 font-['Inter'] text-[12px] font-medium text-[#ef4444] sm:col-span-2">
              {createError}
            </p>
          )}
          <button
            className="h-[36px] w-fit rounded-[8px] bg-[#005bff] px-[16px] font-['Inter'] text-[12px] font-bold text-white disabled:opacity-60 sm:col-span-2"
            disabled={creating}
            onClick={create}
            type="button"
          >
            {creating ? "Creating..." : "Create Workspace"}
          </button>
        </div>
      )}

      {workspaces.length > 0 && (
        <div className="mt-[14px] flex flex-col gap-[8px]">
          {workspaces.map((w) => (
            <div
              className="flex items-center justify-between rounded-[10px] border border-[#eef1f6] p-[12px]"
              key={w.workspace_id}
            >
              <div>
                <p className="m-0 font-['Inter'] text-[13px] font-bold text-[#0f172a]">{w.workspace_name}</p>
                <p className="m-0 mt-[2px] font-['Inter'] text-[12px] text-[#64748b]">
                  {w.purpose || "No department set"}
                </p>
              </div>
              {w.workspace_id === currentWorkspaceId ? (
                <span className="rounded-[6px] bg-[#e7f8ef] px-[10px] py-[4px] font-['Inter'] text-[11px] font-bold text-[#16a34a]">
                  Active
                </span>
              ) : (
                <button
                  className="h-[32px] rounded-[8px] border border-[#e2e8f0] bg-white px-[12px] font-['Inter'] text-[12px] font-bold text-[#334155]"
                  onClick={() => switchTo(w.workspace_id)}
                  type="button"
                >
                  Switch
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const JOB_STATUS_META: Record<JobStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-[#f1f5f9] text-[#64748b]" },
  processing: { label: "Processing", cls: "bg-[#eff6ff] text-[#2563eb]" },
  partially_completed: { label: "Partially Completed", cls: "bg-[#fef3c7] text-[#b45309]" },
  completed: { label: "Completed", cls: "bg-[#dcfce7] text-[#16a34a]" },
  failed: { label: "Failed", cls: "bg-[#fee2e2] text-[#dc2626]" },
  cancelled: { label: "Cancelled", cls: "bg-[#f1f5f9] text-[#64748b]" },
};

const ITEM_STATUS_META: Record<CompanyJobStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-[#f1f5f9] text-[#64748b]" },
  researching: { label: "Researching", cls: "bg-[#eff6ff] text-[#2563eb]" },
  scoring: { label: "Scoring", cls: "bg-[#eff6ff] text-[#2563eb]" },
  retrying: { label: "Retrying", cls: "bg-[#fef3c7] text-[#b45309]" },
  completed: { label: "Completed", cls: "bg-[#dcfce7] text-[#16a34a]" },
  failed: { label: "Failed", cls: "bg-[#fee2e2] text-[#dc2626]" },
  needs_review: { label: "Needs Review", cls: "bg-[#fef3c7] text-[#b45309]" },
};

const ITEM_STATUS_FILTERS: Array<CompanyJobStatus | "all"> = [
  "all", "queued", "researching", "scoring", "retrying", "completed", "failed", "needs_review",
];

const ITEMS_PAGE_SIZE = 25;

/* Live per-company drill-down for one upload's job - polled while the job is
 * still active (queued/processing), so a user can leave and reopen the page
 * and immediately see current progress without keeping the upload request
 * open. Mirrors backend/app/schemas/job.py's JobStatusOut/JobItemOut shapes. */
function JobDetailPanel({
  organisationId,
  workspaceId,
  importBatchId,
  onStatusChange,
}: {
  organisationId: string | null;
  workspaceId: string;
  importBatchId: string;
  onStatusChange: (status: JobStatusOut) => void;
}) {
  const [status, setStatus] = useState<JobStatusOut | null>(null);
  const [items, setItems] = useState<JobItemOut[]>([]);
  const [itemsTotal, setItemsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<CompanyJobStatus | "all">("all");
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadStatus = () => {
    getJobStatus(workspaceId, importBatchId)
      .then((data) => {
        setStatus(data);
        onStatusChange(data);
      })
      .catch(() => {});
  };

  const loadItems = () => {
    getJobItems(workspaceId, importBatchId, {
      page,
      page_size: ITEMS_PAGE_SIZE,
      status: statusFilter === "all" ? undefined : statusFilter,
    })
      .then((data) => {
        setItems(data.items);
        setItemsTotal(data.total);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  const isActive = status ? status.status === "queued" || status.status === "processing" : false;
  useEffect(() => {
    if (!isActive) {
      return;
    }
    const interval = setInterval(() => {
      loadStatus();
      loadItems();
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, page, statusFilter]);

  const handleRetry = async () => {
    setRetrying(true);
    setActionError(null);
    try {
      const result = await retryFailedJobItems(workspaceId, importBatchId);
      setStatus(result.status);
      onStatusChange(result.status);
      setPage(1);
      loadItems();
    } catch (err) {
      setActionError(err instanceof ApiError ? String(err.detail) : "Retry failed. Please try again.");
    }
    setRetrying(false);
  };

  const handleCancel = async () => {
    setCancelling(true);
    setActionError(null);
    try {
      const result = await cancelJob(workspaceId, importBatchId);
      setStatus(result);
      onStatusChange(result);
    } catch (err) {
      setActionError(err instanceof ApiError ? String(err.detail) : "Cancel failed. Please try again.");
    }
    setCancelling(false);
  };

  const handleDownload = async () => {
    if (!organisationId) {
      return;
    }
    setExporting(true);
    setActionError(null);
    try {
      const blob = await exportCompanies(organisationId, importBatchId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "companies_export.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err instanceof ApiError ? String(err.detail) : "Download failed. Please try again.");
    }
    setExporting(false);
  };

  if (!status) {
    return (
      <div className="border-t border-[#f1f5f9] bg-[#f8fafc] p-[16px] font-['Inter'] text-[13px] text-[#64748b]">
        Loading job details...
      </div>
    );
  }

  const jobMeta = JOB_STATUS_META[status.status];
  const totalPages = Math.max(1, Math.ceil(itemsTotal / ITEMS_PAGE_SIZE));

  return (
    <div className="border-t border-[#f1f5f9] bg-[#f8fafc] p-[16px]">
      <div className="flex flex-wrap items-center justify-between gap-[10px]">
        <div className="flex items-center gap-[10px]">
          <span className={cn("rounded-[6px] px-[10px] py-[4px] font-['Inter'] text-[12px] font-bold", jobMeta.cls)}>
            {jobMeta.label}
          </span>
          <span className="font-['Inter'] text-[12px] text-[#64748b]">
            {status.completed}/{status.total} completed ({status.progress_percentage}%)
          </span>
        </div>
        <div className="flex items-center gap-[8px]">
          <button
            className="h-[30px] rounded-[7px] border border-[#e2e8f0] bg-white px-[12px] font-['Inter'] text-[12px] font-bold text-[#334155] disabled:opacity-50"
            disabled={exporting}
            onClick={handleDownload}
            type="button"
          >
            {exporting ? "Downloading..." : "Download"}
          </button>
          <button
            className="h-[30px] rounded-[7px] border border-[#fde68a] bg-white px-[12px] font-['Inter'] text-[12px] font-bold text-[#b45309] disabled:opacity-50"
            disabled={retrying || status.failed === 0}
            onClick={handleRetry}
            type="button"
          >
            {retrying ? "Retrying..." : `Retry Failed (${status.failed})`}
          </button>
          {isActive && (
            <button
              className="h-[30px] rounded-[7px] border border-[#fecaca] bg-white px-[12px] font-['Inter'] text-[12px] font-bold text-[#dc2626] disabled:opacity-50"
              disabled={cancelling}
              onClick={handleCancel}
              type="button"
            >
              {cancelling ? "Cancelling..." : "Cancel"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-[10px] h-[6px] w-full overflow-hidden rounded-full bg-[#e2e8f0]">
        <div
          className="h-full rounded-full bg-[#16a34a] transition-[width]"
          style={{ width: `${status.progress_percentage}%` }}
        />
      </div>

      {actionError && (
        <p className="m-0 mt-[8px] font-['Inter'] text-[12px] font-medium text-[#ef4444]">{actionError}</p>
      )}

      <div className="mt-[14px] flex flex-wrap gap-[6px]">
        {ITEM_STATUS_FILTERS.map((s) => (
          <button
            className={cn(
              "rounded-[6px] border px-[10px] py-[5px] font-['Inter'] text-[11px] font-semibold",
              statusFilter === s
                ? "border-[#005bff] bg-[#eff6ff] text-[#005bff]"
                : "border-[#e2e8f0] bg-white text-[#64748b]",
            )}
            key={s}
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
            type="button"
          >
            {s === "all" ? "All" : ITEM_STATUS_META[s].label}
          </button>
        ))}
      </div>

      <div className="mt-[10px] overflow-x-auto rounded-[8px] border border-[#eef1f6] bg-white">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="text-left">
              {["Company", "Status", "Retries", "Error"].map((h) => (
                <th className="px-[10px] py-[8px] font-['Inter'] text-[11px] font-bold text-[#64748b]" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-[10px] py-[12px] font-['Inter'] text-[12px] text-[#94a3b8]" colSpan={4}>
                  No companies match this filter.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const meta = ITEM_STATUS_META[item.status];
                return (
                  <tr className="border-t border-[#f1f5f9]" key={item.company_id}>
                    <td className="px-[10px] py-[8px] font-['Inter'] text-[12px] font-medium text-[#0f172a]">
                      {item.company_name}
                    </td>
                    <td className="px-[10px] py-[8px]">
                      <span className={cn("rounded-[6px] px-[8px] py-[3px] font-['Inter'] text-[11px] font-semibold", meta.cls)}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-[10px] py-[8px] font-['Inter'] text-[12px] text-[#334155]">{item.retry_count}</td>
                    <td className="px-[10px] py-[8px] font-['Inter'] text-[12px] text-[#dc2626]" title={item.error_message ?? undefined}>
                      {item.error_message ? (item.error_message.length > 60 ? `${item.error_message.slice(0, 60)}...` : item.error_message) : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-[10px] flex items-center justify-end gap-[8px]">
          <button
            className="h-[28px] rounded-[6px] border border-[#e2e8f0] bg-white px-[10px] font-['Inter'] text-[11px] font-bold text-[#334155] disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            type="button"
          >
            Prev
          </button>
          <span className="font-['Inter'] text-[11px] text-[#64748b]">
            Page {page} of {totalPages}
          </span>
          <button
            className="h-[28px] rounded-[6px] border border-[#e2e8f0] bg-white px-[10px] font-['Inter'] text-[11px] font-bold text-[#334155] disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            type="button"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export function SettingsIcpDataPage() {
  const workspaceId = getWorkspaceId();
  const organisationId = getOrganisationId();
  const [history, setHistory] = useState<ImportBatchOut[]>([]);
  const [uploadResult, setUploadResult] = useState<"idle" | "uploading" | ImportBatchOut>("idle");
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  /* Two-step delete: the trash icon arms it, a second click confirms. The
     action is irreversible and removes companies, their buying events, scores
     and contacts - too destructive for a single stray click, and a native
     confirm() would be blocked in some embedded contexts. */
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  const handleDeleteBatch = async (importBatchId: string) => {
    if (!workspaceId) {
      return;
    }
    setDeletingId(importBatchId);
    try {
      const result = await deleteImportBatch(workspaceId, importBatchId);
      // Reports kept companies explicitly: a company present in another upload
      // survives, so "deleted N" alone would misrepresent what happened.
      setDeleteNotice(
        `Deleted ${result.file_names.join(", ") || "upload"} - removed ${result.companies_deleted} company(ies) ` +
          `and ${result.buying_events_deleted} buying event(s)` +
          (result.companies_kept > 0
            ? `; kept ${result.companies_kept} that also belong to another upload.`
            : "."),
      );
      if (expandedBatchId === importBatchId) {
        setExpandedBatchId(null);
      }
      loadHistory();
    } catch (err) {
      setDeleteNotice(err instanceof ApiError ? `Delete failed: ${err.message}` : "Delete failed.");
    } finally {
      setDeletingId(null);
      setConfirmingDeleteId(null);
    }
  };

  const loadHistory = () => {
    if (!workspaceId) {
      return;
    }
    listImportBatches(workspaceId)
      .then(setHistory)
      .catch(() => {
        // No history yet, or the fetch failed - leave the list empty rather
        // than blocking the rest of the page.
      });
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scoring now runs in the background after upload responds (see
  // icpImports.ts) - poll history while any batch is still "pending" so
  // this page's stats/table pick up the real active/nurture counts on their
  // own once scoring catches up, instead of staying frozen at 0/0 until a
  // manual refresh.
  const hasPendingBatch = history.some((b) => b.scoring_status === "pending");
  useEffect(() => {
    if (!hasPendingBatch) {
      return;
    }
    const interval = setInterval(loadHistory, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPendingBatch]);

  const handleUploadComplete = (batch: ImportBatchOut) => {
    setUploadResult(batch);
    loadHistory(); // adds the new (scoring_status: "pending") row, which the polling effect above then picks up
  };

  return (
    <div className="flex min-h-screen" style={{ backgroundImage: pageBackground }}>
      <Sidebar active="Settings" />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          searchPlaceholder="Search uploads..."
          showDetection={false}
          showNotificationBell={false}
        />
        <main className="flex-1 px-[32px] py-[28px]">
          <div className="mb-[24px]">
            <h1 className="m-0 font-['Inter'] text-[24px] font-bold leading-[32px] text-[#0f172a]">
              Offering &amp; Prospect Data
            </h1>
            <p className="m-0 mt-[4px] font-['Inter'] text-[14px] text-[#64748b]">
              Review the XSparks Offering Profile, upload prospect data, and see every past upload. Research and
              scoring run automatically - no ICP required.
            </p>
          </div>

          <OrganizationPanel organisationId={organisationId} workspaceId={workspaceId} />

          <WorkspacesPanel organisationId={organisationId} />

          <OfferingProfileCard />

          <ScoringMethodCard />

          {!workspaceId ? (
            <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[24px] font-['Inter'] text-[14px] text-[#64748b]">
              No workspace found yet — finish onboarding first.
            </div>
          ) : (
            <div className="flex flex-col gap-[20px]">
              <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="m-0 font-['Inter'] text-[16px] font-bold text-[#0f172a]">Upload Prospect Data</h2>
                    <p className="m-0 mt-[2px] font-['Inter'] text-[13px] text-[#64748b]">
                      Upload a CSV/XLSX of prospect companies. Research &amp; scoring run automatically - no ICP needed.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-[10px]">
                    <ExcelUploadButton
                      onUploadComplete={handleUploadComplete}
                      onUploadStart={() => setUploadResult("uploading")}
                      workspaceId={workspaceId}
                    />
                  </div>
                </div>

                {uploadResult !== "idle" && (
                  <div className="mt-[16px] grid grid-cols-2 gap-[12px] sm:grid-cols-3 xl:grid-cols-6">
                    {uploadResult === "uploading" ? (
                      <p className="col-span-full m-0 font-['Inter'] text-[13px] text-[#64748b]">
                        Processing upload...
                      </p>
                    ) : (
                      (
                        [
                          ["Files Processed", uploadResult.files_processed],
                          ["Companies Ingested", uploadResult.companies_ingested],
                          ["Signals Found", uploadResult.scoring_status === "pending" ? "Researching…" : uploadResult.signals_extracted],
                          ["Sales Ready", uploadResult.scoring_status === "pending" ? "Scoring…" : uploadResult.sales_ready_count],
                          ["High Priority", uploadResult.scoring_status === "pending" ? "Scoring…" : uploadResult.high_priority_count],
                          ["Warm", uploadResult.scoring_status === "pending" ? "Scoring…" : uploadResult.warm_count],
                        ] as const
                      ).map(([label, value]) => (
                        <div className="rounded-[10px] border border-[#f1f5f9] bg-[#f8fafc] p-[12px]" key={label}>
                          <p className="m-0 font-['Inter'] text-[11px] font-semibold text-[#64748b]">{label}</p>
                          <p className="m-0 mt-[2px] font-['Inter'] text-[18px] font-bold text-[#0f172a]">
                            {value}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
                {uploadResult !== "idle" &&
                  uploadResult !== "uploading" &&
                  uploadResult.scoring_status === "pending" && (
                    <p className="m-0 mt-[10px] font-['Inter'] text-[12px] text-[#64748b]">
                      Scoring is running in the background — head to Enterprise List to see companies get scored
                      as it progresses, or wait here and this will update automatically.
                    </p>
                  )}
              </div>

              <div className="rounded-[16px] border border-[#eef1f6] bg-white p-[20px] shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
                <h2 className="m-0 font-['Inter'] text-[16px] font-bold text-[#0f172a]">Upload History</h2>
                {deleteNotice && (
                  <div className="mt-[10px] flex items-start justify-between gap-[10px] rounded-[8px] border border-[#e9edf5] bg-[#f8fafc] px-[12px] py-[8px]">
                    <p className="m-0 font-['Inter'] text-[12px] text-[#334155]">{deleteNotice}</p>
                    <button
                      className="shrink-0 font-['Inter'] text-[11px] font-semibold text-[#64748b]"
                      onClick={() => setDeleteNotice(null)}
                      type="button"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                {history.length === 0 ? (
                  <p className="m-0 mt-[10px] font-['Inter'] text-[13px] text-[#64748b]">No uploads yet.</p>
                ) : (
                  <div className="mt-[14px] overflow-x-auto">
                    <table className="w-full min-w-[860px] border-collapse">
                      <thead>
                        <tr className="text-left">
                          {[
                            "Date",
                            "Source",
                            "Files",
                            "Rows",
                            "Companies",
                            "Researched",
                            "Events",
                            "Status",
                            "Sales Ready",
                            "High Priority",
                            "Warm",
                            "Monitor",
                            "Low",
                            "",
                          ].map((h) => (
                            <th
                              className="px-[8px] py-[8px] font-['Inter'] text-[11px] font-bold text-[#64748b]"
                              key={h || "details"}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((batch) => {
                          const pending = batch.scoring_status === "pending";
                          const statusMeta =
                            batch.research_status === "failed"
                              ? { label: "Failed", cls: "bg-[#fee2e2] text-[#dc2626]" }
                              : batch.research_status === "complete_with_warnings"
                                ? { label: "Warnings", cls: "bg-[#fef3c7] text-[#b45309]" }
                                : pending
                                  ? { label: "Processing…", cls: "bg-[#fef3c7] text-[#b45309]" }
                                  : { label: "Complete", cls: "bg-[#dcfce7] text-[#16a34a]" };
                          const cell = "px-[8px] py-[8px] font-['Inter'] text-[12px] text-[#334155]";
                          const expanded = expandedBatchId === batch.import_batch_id;
                          return (
                            <Fragment key={batch.import_batch_id}>
                              <tr
                                className="cursor-pointer border-t border-[#f1f5f9] hover:bg-[#f8fafc]"
                                onClick={() => setExpandedBatchId(expanded ? null : batch.import_batch_id)}
                              >
                                <td className={cell}>{formatDate(batch.created_at)}</td>
                                <td className="px-[8px] py-[8px] font-['Inter'] text-[12px]">
                                  {batch.source === "generated" ? (
                                    <span
                                      className="rounded-[6px] bg-[#eef1ff] px-[8px] py-[3px] text-[11px] font-semibold text-[#4f46e5]"
                                      title={
                                        "Discovered from an ICP and verified against live web search. " +
                                        "Generated companies arrive without contacts, so their Lead Score " +
                                        "is capped lower than an uploaded company's until contacts are added."
                                      }
                                    >
                                      Generated
                                    </span>
                                  ) : (
                                    <span className="text-[#64748b]">Upload</span>
                                  )}
                                </td>
                                <td className={cell}>{batch.files_processed}</td>
                                <td className={cell}>{batch.total_rows}</td>
                                <td className={cell}>{batch.companies_ingested}</td>
                                <td className={cell}>{pending ? "—" : batch.companies_researched}</td>
                                <td className={cell}>{pending ? "—" : batch.signals_extracted}</td>
                                <td className="px-[8px] py-[8px] font-['Inter'] text-[12px]">
                                  <span className={cn("rounded-[6px] px-[8px] py-[3px] text-[11px] font-semibold", statusMeta.cls)} title={batch.processing_error ?? undefined}>
                                    {statusMeta.label}
                                  </span>
                                </td>
                                <td className="px-[8px] py-[8px] font-['Inter'] text-[12px] text-[#16a34a]">{pending ? "—" : batch.sales_ready_count}</td>
                                <td className="px-[8px] py-[8px] font-['Inter'] text-[12px] text-[#16a34a]">{pending ? "—" : batch.high_priority_count}</td>
                                <td className="px-[8px] py-[8px] font-['Inter'] text-[12px] text-[#f59e0b]">{pending ? "—" : batch.warm_count}</td>
                                <td className={cell}>{pending ? "—" : batch.monitor_count}</td>
                                <td className={cell}>{pending ? "—" : batch.low_priority_count}</td>
                                <td className="px-[8px] py-[8px]">
                                  <div className="flex items-center justify-end gap-[6px]">
                                    {/* stopPropagation throughout: the row itself
                                        toggles the detail panel, and a delete
                                        click must never also expand it. */}
                                    {confirmingDeleteId === batch.import_batch_id ? (
                                      <>
                                        <button
                                          className="rounded-[6px] bg-[#dc2626] px-[8px] py-[3px] font-['Inter'] text-[11px] font-semibold text-white disabled:opacity-60"
                                          disabled={deletingId === batch.import_batch_id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void handleDeleteBatch(batch.import_batch_id);
                                          }}
                                          type="button"
                                        >
                                          {deletingId === batch.import_batch_id ? "Deleting…" : "Confirm"}
                                        </button>
                                        <button
                                          className="rounded-[6px] border border-[#e9edf5] px-[8px] py-[3px] font-['Inter'] text-[11px] font-semibold text-[#64748b]"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setConfirmingDeleteId(null);
                                          }}
                                          type="button"
                                        >
                                          Cancel
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        aria-label="Delete this upload and its data"
                                        className="rounded-[6px] p-[4px] text-[#94a3b8] transition hover:bg-[#fee2e2] hover:text-[#dc2626]"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setConfirmingDeleteId(batch.import_batch_id);
                                        }}
                                        title="Delete this upload and the companies it added"
                                        type="button"
                                      >
                                        <Trash2 className="size-[15px]" />
                                      </button>
                                    )}
                                    {expanded ? (
                                      <ChevronUp className="size-[16px] text-[#64748b]" />
                                    ) : (
                                      <ChevronDown className="size-[16px] text-[#64748b]" />
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {expanded && workspaceId && (
                                <tr>
                                  <td colSpan={14} className="p-0">
                                    <JobDetailPanel
                                      importBatchId={batch.import_batch_id}
                                      onStatusChange={() => loadHistory()}
                                      organisationId={organisationId}
                                      workspaceId={workspaceId}
                                    />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
