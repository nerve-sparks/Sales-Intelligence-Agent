# Frontend conventions

React 19 + Vite + Tailwind v4 + `lucide-react`. Dummy data for now.

## Structure
- Pages live in `src/features/<feature>/<Name>Page.tsx` — one page per file, sub-components in the same file.
- Shared, reusable pieces go in `src/components/`. Don't duplicate chrome across pages — reuse or extract.
- `cn()` from `src/lib/cn.ts` for conditional classes.

## Shared components (reuse these)
- `components/layout/Sidebar.tsx` — app sidebar. Props: `active` (top nav label), `activeSub` (sub-tab label). Signal Intelligence expands to its in-use sub-tabs (Signal Feed, Signal Analytics); other items are flat. Nav items with an `href` render as links, others are inert placeholders.
- `components/layout/TopBar.tsx` — search + detection pill + actions. Props: `searchPlaceholder`, `detectionIcon`, `showDetection`.
- `components/layout/TopActions.tsx` — `DetectionPill`, `AIAssistantButton`, `NotificationBell`, `UserMenu` (compose when a page needs a custom header).
- `components/ui/dataviz.tsx` — `Sparkline`, `Donut`, `Delta`, `UpTriangle`, `smoothPath`, `toPoints`. Charts are inline SVG — no chart library. Exception: Signal Analytics' Geographic Distribution map uses `react-svg-worldmap` (data-driven country shading), **lazy-loaded** so its ~170KB geometry stays out of the main bundle.

## Routing
- `App.tsx` routes by `pathname.includes(...)`. Order matters: **most specific first** (e.g. `signal-detail` before `signal-feed`).
- Nav is real `<a href>` (full navigation, no client router yet). Make list rows clickable via `onClick → window.location.href`; `stopPropagation` on nested buttons.

## Design system
- Page bg: `linear-gradient(180deg,#f6f7fb,#f2f4fa)`. Cards: `rounded-[16px] border border-[#eef1f6] bg-white shadow-[0px_1px_2px_rgba(15,23,42,0.04)]`.
- Accent indigo `#5b3df5`/`#4f46e5`; purple `#7c3aed`, orange `#f97316`, green `#16a34a`, blue `#2563eb`, orange CTA `#fa5a1e`.
- Text: `#0f172a` (heading), `#334155`/`#475569` (body), `#64748b`/`#94a3b8` (muted). Borders `#e9edf5`/`#eef1f6`.
- Use exact px via Tailwind arbitrary values (`text-[14px]`, `gap-[16px]`) to match Figma.
- Detail pages: two-column layout — main `minmax(0,1fr)` + `340px` right rail. Keep the active accent consistent across pages.
- Sidebar (`aside`) and `TopBar` are `sticky top-0` — they stay put on scroll. Don't wrap pages in an `overflow` container or sticky breaks.

## Pages & routes (all built, dummy data)
Auth: `/` login, `/forgot-password`, `/mfa-verification` (all in `features/auth/LoginPage.tsx`); `/onboarding`.
Dashboard `/dashboard`. Signal Intelligence: `/signal-intelligence`, `/signal-feed`, `/signal-detail`, `/signal-analytics`. Trigger Intelligence: `/trigger-library`, `/trigger-detail`, `/trigger-editor`. CRM/Enterprise: `/enterprise-list`, `/enterprise-detail`, `/buying-committee`, `/member-detail`. `/score-breakdown`, `/score-history`.
- List rows / cards / page-tabs navigate via `window.location.href`. Trigger Editor persists created triggers to `localStorage` (`src/lib/triggers.ts`) → shown on Trigger Library.

## Globe (dashboard Lead Opportunity Map)
- `features/dashboard/LeadGlobe.tsx` = `react-globe.gl`, **lazy-loaded** (`React.lazy` + `Suspense`, `earth.png` fallback) so three.js stays out of the main bundle. Assets in `src/assets/globe/`. All globe data is dummy at top of the file.

## Gotchas
- `npm install` fails behind the corporate TLS proxy — use `NODE_OPTIONS=--use-system-ca npm install ...`. `dev`/`build` don't need it.
- Verify visually: `npm run dev` then headless screenshot — Edge `--headless=new --disable-gpu --hide-scrollbars --window-size=W,H --screenshot=out.png URL` (add `--enable-unsafe-swiftshader --virtual-time-budget=9000` for the WebGL globe). Always run `npx tsc -b` + `npx eslint <file>` after edits.
- All main pages use the shared `TopBar`. Pages with an in-content title/subtitle header (e.g. Signal Intelligence overview, Trigger Editor) still mount `TopBar` above `main` — keep page-specific controls (date picker, Save/Activate) in the in-content header; the global actions (AI Assistant, bell, user menu) live only in `TopBar`.
