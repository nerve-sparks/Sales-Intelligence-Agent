# Frontend conventions

React 19 + Vite + Tailwind v4 + `lucide-react`. Dummy data for now.

## Structure
- Pages live in `src/features/<feature>/<Name>Page.tsx` — one page per file, sub-components in the same file.
- Shared, reusable pieces go in `src/components/`. Don't duplicate chrome across pages — reuse or extract.
- `cn()` from `src/lib/cn.ts` for conditional classes.

## Shared components (reuse these)
- `components/layout/Sidebar.tsx` — app sidebar. Props: `active` (top nav label), `activeSub` (sub-tab label). Expandable sub-nav; nav items with an `href` render as links, others are inert placeholders.
- `components/layout/TopBar.tsx` — search + detection pill + actions. Props: `searchPlaceholder`, `detectionIcon`, `showDetection`.
- `components/layout/TopActions.tsx` — `DetectionPill`, `AIAssistantButton`, `NotificationBell`, `UserMenu` (compose when a page needs a custom header).
- `components/ui/dataviz.tsx` — `Sparkline`, `Donut`, `Delta`, `UpTriangle`, `smoothPath`, `toPoints`. All charts are inline SVG — no chart library.

## Routing
- `App.tsx` routes by `pathname.includes(...)`. Order matters: **most specific first** (e.g. `signal-detail` before `signal-feed`).
- Nav is real `<a href>` (full navigation, no client router yet). Make list rows clickable via `onClick → window.location.href`; `stopPropagation` on nested buttons.

## Design system
- Page bg: `linear-gradient(180deg,#f6f7fb,#f2f4fa)`. Cards: `rounded-[16px] border border-[#eef1f6] bg-white shadow-[0px_1px_2px_rgba(15,23,42,0.04)]`.
- Accent indigo `#5b3df5`/`#4f46e5`; purple `#7c3aed`, orange `#f97316`, green `#16a34a`, blue `#2563eb`, orange CTA `#fa5a1e`.
- Text: `#0f172a` (heading), `#334155`/`#475569` (body), `#64748b`/`#94a3b8` (muted). Borders `#e9edf5`/`#eef1f6`.
- Use exact px via Tailwind arbitrary values (`text-[14px]`, `gap-[16px]`) to match Figma.
- Detail pages: two-column layout — main `minmax(0,1fr)` + `340px` right rail. Keep the active accent consistent across pages.
