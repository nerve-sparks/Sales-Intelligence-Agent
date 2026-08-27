import {
  Activity,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Building2,
  Calculator,
  CircleHelp,
  Contact,
  Gauge,
  Home,
  Info,
  Layers,
  ListTree,
  MinusCircle,
  Radio,
  Rocket,
  Scale,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Target,
  Upload,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/cn";

/* Product guide.
 *
 * One place that explains what every page does and how a company's Lead Score
 * is actually produced. Every number quoted in the "Scoring reference" group
 * mirrors backend/app/core/scoring_config.py, and the derived formulas mirror
 * backend/app/services/evidence_scorer.py - if either changes, change these
 * too, because a guide that silently drifts from the scorer is worse than no
 * guide at all.
 */

type GuideBlock =
  | { kind: "sub"; text: string }
  | { kind: "text"; text: string }
  | { kind: "formula"; text: string }
  | { kind: "steps"; items: string[] }
  | { kind: "list"; items: { term: string; text: string }[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "note"; text: string };

type GuideTopic = {
  id: string;
  label: string;
  group: string;
  icon: ComponentType<{ className?: string }>;
  href?: string;
  summary: string;
  blocks: GuideBlock[];
};

const TOPICS: GuideTopic[] = [
  // ---------------------------------------------------------------- start
  {
    id: "start",
    label: "How the platform works",
    group: "Getting started",
    icon: Rocket,
    summary:
      "The full path from a spreadsheet of companies to a ranked, evidence-backed call list.",
    blocks: [
      {
        kind: "text",
        text:
          "This platform turns a list of companies into a ranked call list where every position is justified by real published evidence, not by a model's opinion. Nothing is invented: every signal links back to the article it came from, and any field that could not be verified is shown as a dash rather than filled with a plausible guess.",
      },
      { kind: "sub", text: "The pipeline, end to end" },
      {
        kind: "steps",
        items: [
          "You upload prospect data on the Settings page. ZoomInfo exports work as they come, and so do ordinary spreadsheets - columns are matched by name, every sheet in the workbook is read rather than just the first, and the header row is found even when the file opens with a title or a blank row. A sheet containing only company names is still usable.",
          "Research runs automatically against the live web. For each company the system searches for buying events: funding rounds, hiring pushes, leadership appointments, acquisitions, expansions, technology mandates, procurement activity, compliance pressure and operational problems.",
          "An extraction step reads the articles found and classifies each one into a specific event type, with its own relevance, confidence, status and source quality. Multiple articles describing the same real-world event are collapsed into one canonical event, so wide press coverage raises confidence instead of inflating the count.",
          "Firmographics are filled in from the same research - industry, headquarters, headcount, revenue, founded year, ownership and funding - but only for fields your file left empty.",
          "Each company is then scored. Events become an event score, the strongest events become a Buying Evidence score, contacts become a Contact Access score, negative findings become a penalty, and the three combine into the 0-100 Lead Score and a Sales Status band.",
          "You work the result: the Dashboard for today's priorities, the Enterprise List to work top-down, the Signal Feed for the newest evidence, and Score Breakdown whenever you need to see why a company sits where it does.",
        ],
      },
      { kind: "sub", text: "Where to go for what" },
      {
        kind: "table",
        head: ["If you want to", "Go to"],
        rows: [
          ["Decide who to call this morning", "Dashboard"],
          ["Work a full list top-down", "Enterprise List"],
          ["See the newest evidence across all companies", "Signal Feed"],
          ["Understand one company's score", "Score Breakdown"],
          ["Find a person to contact", "Buying Committee"],
          ["Judge overall signal quality and geography", "Signal Analytics"],
          ["Load new data or check a running job", "Settings"],
        ],
      },
      {
        kind: "note",
        text:
          "Nothing is ever filtered out. There is no qualification gate: every company you upload is scored and displayed, even at zero. The bands are priorities for working a list, not verdicts on a company.",
      },
    ],
  },
  {
    id: "four-numbers",
    label: "The four numbers",
    group: "Getting started",
    icon: Gauge,
    summary:
      "Lead Score, event score, relevance and confidence are different things. This is the one page to read first.",
    blocks: [
      {
        kind: "text",
        text:
          "Almost every misreading of this product comes from treating these four numbers as the same measurement. They are not, and they answer different questions.",
      },
      {
        kind: "table",
        head: ["Number", "Scale", "Answers"],
        rows: [
          ["Lead Score", "0-100 per company", "How much should I prioritise this company right now?"],
          ["Event score", "0-100 per signal", "How strong is this one piece of evidence?"],
          ["Relevance", "0-1 per signal", "How closely does this event match what we sell?"],
          ["Confidence", "0-1 per company", "How sure are we the evidence is real and correctly read?"],
        ],
      },
      { kind: "sub", text: "Why confidence is not quality" },
      {
        kind: "text",
        text:
          "A company can have a low Lead Score with High confidence: we are certain about what we found, and what we found is genuinely quiet. That is a useful, honest answer. Equally, a strong score with Low confidence means the evidence is promising but thin - worth a call, worth verifying. Because these are independent, a low score never implies we are unsure.",
      },
      {
        kind: "note",
        text:
          "When there are no positive events at all, confidence is not reported as Low. It reads \"Insufficient Evidence\", because there was nothing to be confident or unconfident about.",
      },
      { kind: "sub", text: "Relevance is about you, confidence is about the source" },
      {
        kind: "text",
        text:
          "A funding round reported clearly by three national outlets has high confidence. Whether it is relevant depends entirely on whether that company's spending plans touch what you sell. High confidence and low relevance is a perfectly ordinary combination, and the Signal Analytics page charts the two separately for exactly that reason.",
      },
    ],
  },

  // ------------------------------------------------------------ dashboard
  {
    id: "dashboard",
    label: "Dashboard",
    group: "Daily workflow",
    icon: Home,
    href: "/dashboard",
    summary: "Your morning view: who to call, what changed, and where opportunity sits.",
    blocks: [
      {
        kind: "text",
        text:
          "The Dashboard answers three questions in one screen: who should I call today, what has changed recently, and where is my opportunity concentrated.",
      },
      { kind: "sub", text: "Timeline picker" },
      {
        kind: "text",
        text:
          "The control in the top right defaults to All Time. Choosing a single upload scopes the entire page - tiles, globe, prospects and signals - to the companies that came from that one file. It is the quickest way to judge whether a particular list was worth ingesting.",
      },
      { kind: "sub", text: "Headline tiles" },
      {
        kind: "table",
        head: ["Tile", "What it counts"],
        rows: [
          ["Sales Ready", "Companies scoring 65 or above"],
          ["High Priority", "Companies scoring 50 to 64"],
          ["Total Companies", "Everything in the current scope"],
          ["High Confidence", "Companies whose evidence confidence is High"],
          ["Est. Pipeline Value", "Expected deal values summed across scored companies"],
        ],
      },
      {
        kind: "text",
        text:
          "A second strip underneath carries the remaining bands - Warm, Monitor and Low Priority - so the full distribution is visible without leaving the page. The sparkline on High Confidence is the only live one: it plots daily signal volume over the last fortnight.",
      },
      { kind: "sub", text: "Lead Opportunity Map" },
      {
        kind: "text",
        text:
          "A globe with each country shaded by the highest Lead Score found there, deliberately not the average. An average hides one excellent prospect inside a large mixed market, which is the opposite of useful when you are deciding where to spend a week. The legend maps each colour to its score band.",
      },
      {
        kind: "list",
        items: [
          {
            term: "Industry filter",
            text:
              "Narrows the globe to a single sector, and shows the company count for each sector alongside how many of them are already Sales Ready - so you can see which sectors are worth filtering to before you click.",
          },
          {
            term: "Live Opportunities",
            text: "Total companies in scope, with a small bar chart of signal volume over the last fortnight.",
          },
          {
            term: "Floating card",
            text: "Your single strongest company, its Lead Score and its sales status.",
          },
        ],
      },
      { kind: "sub", text: "Signal Trends" },
      {
        kind: "text",
        text:
          "The vertical axis is the number of signals; the horizontal axis is the date the event was published, not the date we found it. Three lines split the volume into High, Medium and Low relevance. The percentage beside the total compares the first and last day in the window. Underneath, the same three tiers appear as running totals.",
      },
      { kind: "sub", text: "Top Priority Prospects" },
      {
        kind: "table",
        head: ["Column", "Shows"],
        rows: [
          ["Company", "Name, the best-matched offering underneath, and the sales status as a tag"],
          ["Lead Score", "The 0-100 score as a ring, green from 75 upward"],
          ["Trend", "Direction indicator"],
          ["Next Best Action", "The Contact Now button"],
        ],
      },
      {
        kind: "text",
        text:
          "Contact Now opens an email to the strongest reachable contact on file. When no email exists it opens that company's Buying Committee instead, so the button always does something useful rather than failing silently. The company name itself opens the full company record, and View All goes to the Enterprise List.",
      },
      { kind: "sub", text: "Recent Signals" },
      {
        kind: "text",
        text:
          "The newest buying events across every company in scope, each with how long ago it was published, the company, the event type and the event score. Any row opens that signal in full; View All opens the Signal Feed.",
      },
    ],
  },

  // -------------------------------------------------------------- signals
  {
    id: "signal-overview",
    label: "Signal Intelligence",
    group: "Signals",
    icon: Radio,
    href: "/signal-intelligence",
    summary: "Portfolio-level view of every buying signal found across your companies.",
    blocks: [
      {
        kind: "text",
        text:
          "The overview answers whether your market is getting busier or quieter, and which kinds of events are driving it. Four tiles across the top count Total, High-Relevance, Medium-Relevance and Low-Relevance signals, each with a sparkline and a percentage change across the period.",
      },
      { kind: "sub", text: "Signal Trend Over Time" },
      {
        kind: "text",
        text:
          "Signals published per day over the last 90 days. The vertical axis is the number of signals and the horizontal axis is the publication date, with four lines: the overall total plus the High, Medium and Low relevance splits. Once there is more than about a month of history the chart groups by week and says so, because 90 daily labels cannot be read.",
      },
      {
        kind: "note",
        text:
          "If this chart says there is not enough day-over-day history, it means your signals were all extracted in one batch and share a publication window. It fills in as research runs across more uploads and more dates.",
      },
      { kind: "sub", text: "Signals by Category" },
      {
        kind: "text",
        text:
          "A donut with your total in the centre, split by signal category, with each slice labelled by percentage and count. This is where you see whether your pipeline is being driven by budget events, buying-stage activity, pain points or something else. View full analytics leads to the deeper breakdowns.",
      },
      { kind: "sub", text: "Top Signals" },
      {
        kind: "table",
        head: ["Column", "Shows"],
        rows: [
          ["Signal", "Event title with a short extract of the summary"],
          ["Account", "The company it belongs to"],
          ["Source", "How many independent articles corroborate it"],
          ["Relevance Score", "The event score, rounded"],
          ["Detected At", "How long ago it was published"],
          ["Impact", "Very High, High, Medium or Low, derived from relevance"],
        ],
      },
      {
        kind: "text",
        text: "Any row opens the full signal. View All Signals opens the Signal Feed.",
      },
    ],
  },
  {
    id: "signal-feed",
    label: "Signal Feed",
    group: "Signals",
    icon: ListTree,
    href: "/signal-feed",
    summary: "Every buying event, filterable and sorted strongest or newest first.",
    blocks: [
      {
        kind: "text",
        text:
          "The feed is the working list of evidence, with a running count of matching signals in the header. Each row carries the event title, its summary, the company, a relevance badge, the event score and how long ago it was published. Where several articles describe the same event, the row shows a source count rather than appearing more than once.",
      },
      { kind: "sub", text: "Filters" },
      {
        kind: "list",
        items: [
          {
            term: "Category",
            text:
              "Restricts to one signal category: AI Seriousness, AI Pain Points, Buying Stage, Budget & Capital, Urgency & Catalysts or Competitive Context.",
          },
          {
            term: "Industry",
            text:
              "Restricts to one industry sector, using the same sector grouping as the Dashboard globe.",
          },
          {
            term: "Min score",
            text: "Sets a floor on the event score - Any, 10+, 20+, 30+ or 40+ - to hide weak evidence.",
          },
          {
            term: "Sort",
            text:
              "Newest first, Highest score, or Company A-Z. Every ordering puts the most useful end at the top of the list.",
          },
        ],
      },
      {
        kind: "note",
        text:
          "Changing any filter returns you to page one. Staying on page seven of a narrower result set would show an empty table, which reads as a bug rather than as a filter working.",
      },
      { kind: "sub", text: "Relevance badges" },
      {
        kind: "table",
        head: ["Badge", "Relevance"],
        rows: [
          ["High", "0.65 and above"],
          ["Medium", "0.40 to 0.64"],
          ["Low", "Below 0.40"],
        ],
      },
      {
        kind: "text",
        text:
          "Twenty signals are shown per page, with a count of the visible range beneath. Clicking any row opens Signal Detail. The page also accepts a category in its address, so a link can open the feed pre-filtered to one category.",
      },
    ],
  },
  {
    id: "signal-detail",
    label: "Signal Detail",
    group: "Signals",
    icon: Info,
    summary: "The full evidence for one event, including exactly how its score was produced.",
    blocks: [
      {
        kind: "text",
        text:
          "Opened from any signal row. The header gives the event title, a relevance badge, the company (which links through to its record), when it was detected, and tags for its category, whether it is Actionable, and how many sources back it.",
      },
      { kind: "sub", text: "Event Score and Score Breakdown" },
      {
        kind: "formula",
        text:
          "Event Score = Base Strength × Relevance × Freshness × Source Quality × Extraction Confidence × Status",
      },
      {
        kind: "text",
        text:
          "The score is shown out of 100 with a progress bar, and the breakdown card displays each multiplier so a low number can always be traced to the specific factor that caused it. Because every multiplier except base strength sits between 0 and 1, one weak factor caps the whole event - a strong event type reported by an unreliable source, or an important announcement from three years ago, both end up low, and the card shows which.",
      },
      { kind: "sub", text: "Extraction Details" },
      {
        kind: "text",
        text:
          "The classification itself: event type, category, extraction confidence as a percentage, relevance as a percentage, the best-matched offering, whether the event is actionable (active or announced) or merely exploratory, and any explicit public budget attached to it.",
      },
      { kind: "sub", text: "Event Details" },
      {
        kind: "text",
        text:
          "When it was detected, how many sources exist, and the company's location, headcount, revenue and industry, followed by the extracted description.",
      },
      { kind: "sub", text: "Sources" },
      {
        kind: "text",
        text:
          "Every corroborating article rather than only one, each with its domain, publication date, the relevant snippet, and a link to read the original. This is the audit trail: if you doubt a score, this is where you check it.",
      },
      { kind: "sub", text: "Related activity" },
      {
        kind: "list",
        items: [
          {
            term: "Companies with Similar Events",
            text: "Other companies with an event in the same category, each with its score. Useful for spotting a sector-wide pattern rather than a one-off.",
          },
          {
            term: "More Events from this company",
            text: "The company's other signals, so you can judge whether this is an isolated event or part of a run of activity.",
          },
          {
            term: "Event Summary",
            text: "The narrative summary with a Copy Summary button, for dropping into an email or CRM note.",
          },
        ],
      },
    ],
  },
  {
    id: "signal-analytics",
    label: "Signal Analytics",
    group: "Signals",
    icon: BarChart3,
    href: "/signal-analytics",
    summary: "Distribution, quality and geography of signals across the whole portfolio.",
    blocks: [
      {
        kind: "text",
        text:
          "Six tiles head the page: Total Signals, High-Relevance Signals, Companies with Signals, Decision-Makers Reached, average confidence as a percentage, and the share of signals that are actionable.",
      },
      { kind: "sub", text: "Signals Over Time" },
      {
        kind: "text",
        text:
          "Number of signals on the vertical axis against publication date on the horizontal, plotting the total against the high-relevance subset. Dense history is grouped by week so the labels stay readable.",
      },
      { kind: "sub", text: "Signals by Category" },
      {
        kind: "text",
        text:
          "The share of active buying events by category. Negative events are deliberately excluded here - mixing them in would make a category look busy when what is actually happening is a run of bad news.",
      },
      { kind: "sub", text: "Signals by Relevance Level" },
      {
        kind: "text",
        text:
          "High, Medium and Low relevance as a donut, using the same 0.65 and 0.40 thresholds as the feed, with the combined high-and-medium share called out underneath. This is relevance to your offering, not how certain the extraction was.",
      },
      { kind: "sub", text: "Relevance Score Distribution" },
      {
        kind: "text",
        text:
          "A histogram of extraction confidence in five buckets from 0-20 up to 80-100, with counts above each bar. Read this as a data-quality check on the research itself: a distribution weighted to the right means the events we found are clearly reported, regardless of whether they are relevant to you.",
      },
      { kind: "sub", text: "Geographic Distribution" },
      {
        kind: "text",
        text:
          "A world map shaded by signal volume per company country, with an intensity scale and a Top Countries list showing counts and shares. Intensity here is a count of active signals, not Lead Score - a country can be busy with news and still hold no strong leads, and the Dashboard globe is the one to use for score.",
      },
    ],
  },

  // ------------------------------------------------------------ companies
  {
    id: "enterprise-list",
    label: "Enterprise List",
    group: "Companies",
    icon: Contact,
    href: "/enterprise-list",
    summary: "Every scored company, ranked, searchable, exportable and scoped by upload.",
    blocks: [
      {
        kind: "text",
        text:
          "This is the list to work top-down. Six tiles across the top count your whole book by band - Total, Sales Ready, High Priority, Warm, Monitor and Low Priority - and stay organisation-wide even while you filter the table beneath them, so you never lose sight of the denominator.",
      },
      { kind: "sub", text: "Columns" },
      {
        kind: "table",
        head: ["Column", "Shows"],
        rows: [
          ["Company", "Name, with primary industry and location underneath"],
          ["Lead Score", "The 0-100 score with a bar, or a dash if not yet scored"],
          ["Sales Status", "The band, or Unscored"],
          ["Confidence", "High, Medium, Low or Insufficient Evidence"],
          ["Best XSparks Offering", "The offering the strongest signal points to"],
          ["Expected Deal", "The expected deal value"],
        ],
      },
      { kind: "sub", text: "Controls" },
      {
        kind: "list",
        items: [
          { term: "Search", text: "Finds a company by name as you type." },
          {
            term: "Upload filter",
            text:
              "Narrows to one uploaded file, labelled with its date, filename and company count. A file still being scored is marked as such.",
          },
          {
            term: "Export",
            text:
              "Downloads the list as a spreadsheet, respecting the upload filter, so a scored list can be handed to someone who does not use the platform.",
          },
        ],
      },
      {
        kind: "text",
        text: "Twenty-five companies are shown per page. Clicking any row opens that company's full record.",
      },
      {
        kind: "note",
        text:
          "A dash in Lead Score means the company has not been scored yet, which is different from a score of zero. Zero means we researched and found nothing that counts; a dash means we have not finished looking.",
      },
    ],
  },
  {
    id: "enterprise-detail",
    label: "Company Detail",
    group: "Companies",
    icon: Building2,
    summary: "Everything known about one company, in one view.",
    blocks: [
      {
        kind: "text",
        text:
          "The header carries the company name, a verification marker and ownership type where known, plus industry, location, website and social links. Directly beneath it a summary bar shows Lead Score, Sales Status, Confidence and Estimated Deal Value - the whole bar is clickable and opens the full Score Breakdown.",
      },
      { kind: "sub", text: "Firmographics" },
      {
        kind: "text",
        text:
          "Industry, employees, revenue, founded year, ownership, company status and headquarters. Anything your uploaded file did not supply is filled in by research where it can be verified from a real source; anything that could not be verified stays as a dash rather than being guessed.",
      },
      { kind: "sub", text: "Funding" },
      {
        kind: "text",
        text:
          "Total funding, most recent round and its date, where they exist. An empty funding card is frequently correct rather than a gap: established, profitable and public companies legitimately have no venture funding to report.",
      },
      { kind: "sub", text: "Lead Score" },
      {
        kind: "text",
        text:
          "The score with its three components - Buying Evidence, Contact Access and Negative Penalty - alongside sales status and confidence, plus the best-matched offering and the why-now line. Full breakdown opens the detailed audit.",
      },
      { kind: "sub", text: "Buying Committee and Buying Events" },
      {
        kind: "text",
        text:
          "The lower half lists the contacts on file with their titles, personas and direct contact links, and every buying event found for the company with its summary, category and event score. View all opens the full committee; a company with no events says so explicitly rather than showing an empty box.",
      },
      {
        kind: "note",
        text:
          "If a company shows as never researched rather than researched and quiet, the usual cause is a missing website domain in the uploaded row - without one there is nothing reliable to search against.",
      },
    ],
  },
  {
    id: "committee",
    label: "Buying Committee",
    group: "Companies",
    icon: Users,
    summary: "Who to approach at a company, and which of them is actually reachable.",
    blocks: [
      {
        kind: "text",
        text:
          "Four tiles set the context: the account's Lead Score with a qualitative badge, the committee size, the number of reachable contacts as a fraction of the total, and the estimated deal value.",
      },
      { kind: "sub", text: "Committee Members" },
      {
        kind: "table",
        head: ["Column", "Shows"],
        rows: [
          ["Member", "Name and job title"],
          ["Department", "Their function, where known"],
          ["Seniority", "C-Level, VP, Director or Manager, derived from the title"],
          ["Contact", "Email, phone and LinkedIn links, greyed out when not on file"],
        ],
      },
      {
        kind: "text",
        text: "Clicking a row opens that person's full record.",
      },
      { kind: "sub", text: "The right-hand panels" },
      {
        kind: "list",
        items: [
          {
            term: "Committee Insights",
            text: "A short written read of the committee: its size, the C-level names present, the dominant department, and how reachable it is by email.",
          },
          { term: "Seniority Distribution", text: "How the committee splits across the four seniority tiers." },
          { term: "Department Distribution", text: "Which functions are represented and how heavily." },
        ],
      },
      {
        kind: "note",
        text:
          "Only the single strongest reachable contact contributes to Contact Access - it is never summed across a long list. This is why a company with fifty contacts and no verified emails scores below one with a single reachable chief executive.",
      },
    ],
  },
  {
    id: "member",
    label: "Member Detail",
    group: "Companies",
    icon: User,
    summary: "One person's record: how to reach them, their role, and their colleagues.",
    blocks: [
      {
        kind: "text",
        text:
          "The header gives the name, seniority badge, job title and persona, with direct Email, Call and LinkedIn actions where the details exist.",
      },
      {
        kind: "list",
        items: [
          {
            term: "Contact Information",
            text: "Email, direct line, mobile and LinkedIn, with copy buttons on the email and phone numbers so you can move them into a dialler or CRM without retyping.",
          },
          {
            term: "Role & Background",
            text: "Current role, department, persona, derived seniority and years of experience.",
          },
          {
            term: "Company",
            text: "The employer with its Lead Score and headline firmographics, linking through to the full company record.",
          },
          {
            term: "Other Committee Members",
            text: "Colleagues on the same committee, each opening their own record - useful for finding a second route in when your first contact goes quiet.",
          },
        ],
      },
    ],
  },
  {
    id: "score-breakdown",
    label: "Score Breakdown",
    group: "Companies",
    icon: Calculator,
    summary: "Line-by-line proof of how one company's Lead Score was built.",
    blocks: [
      {
        kind: "text",
        text:
          "This is the audit page. A summary strip shows the company, its Lead Score out of 100, its confidence and its expected deal range, and everything below explains how those were reached.",
      },
      { kind: "sub", text: "Lead Score card" },
      {
        kind: "formula",
        text: "Lead Score = clamp(Buying Evidence + Contact Access − Negative Evidence, 0, 100)",
      },
      {
        kind: "text",
        text:
          "The three components are listed with their contributions - Buying Evidence out of 80, Contact Access out of 20, and any negative penalty subtracted - ending in the final clamped score.",
      },
      { kind: "sub", text: "Contact Access card" },
      {
        kind: "text",
        text:
          "Every contact considered, the tier each one falls into, and a badge marking the single contact that was actually counted. The tier table is printed on the card so the arithmetic is checkable rather than asserted.",
      },
      { kind: "sub", text: "Deal Potential card" },
      {
        kind: "text",
        text:
          "The expected range and its midpoint, the basis used to derive it, a deal confidence, the provisional weighted value, and whether the deal clears the commercial-viability threshold.",
      },
      { kind: "sub", text: "Evidence Events card" },
      {
        kind: "text",
        text:
          "Every signal for the company, strongest first. Each carries a rank badge that states plainly whether it counted - your strongest signal, second, third, or explicitly not counting toward the score - along with its summary, factor chips, date, relevance, confidence, best-fit offering and sources. A Show the math control expands the full multiplication for that event.",
      },
      { kind: "sub", text: "Sales Recommendation card" },
      {
        kind: "text",
        text:
          "Why now, the best-matched offering, the recommended action, and any risks or negative evidence found. When negative evidence is what actually determined the outcome, the why-now line reflects that rather than quoting an unrelated growth signal that lost the arithmetic.",
      },
    ],
  },
  {
    id: "score-history",
    label: "Score History",
    group: "Companies",
    icon: Activity,
    summary: "How a company's score has moved over time, and what moved it.",
    blocks: [
      {
        kind: "text",
        text:
          "A summary strip gives the current score, the trend over the last 30 days, the 90-day average and when the score was last updated.",
      },
      {
        kind: "list",
        items: [
          {
            term: "Score Over Time",
            text: "The Lead Score at each re-scoring run, with range controls from a week out to everything, and markers distinguishing positive events, negative events, model updates and manual changes.",
          },
          {
            term: "Score Change Log",
            text: "Every recorded movement with its date, the old and new score, the change and its percentage, the reason, the event type behind it, its impact and its source.",
          },
          {
            term: "Score Summary",
            text: "Highest, lowest, net change, average and volatility over the period, with a consistency read.",
          },
          {
            term: "Score Distribution",
            text: "How the last 90 days of scores were spread across quality bands.",
          },
          {
            term: "Score Change Drivers",
            text: "Which factors pushed the score up or down over the period, as positive and negative contributions.",
          },
        ],
      },
      {
        kind: "note",
        text:
          "A falling score does not always mean something went wrong. Evidence ages out through the freshness bands, so a company with no new activity drifts downward even with no negative event recorded against it. Check the change log before treating a drop as bad news.",
      },
      {
        kind: "note",
        text:
          "This page currently displays a worked sample rather than your own history, while score-history tracking is being connected. The figures shown illustrate the layout; they are not that company's real scores.",
      },
    ],
  },

  // ---------------------------------------------------------------- setup
  {
    id: "icp",
    label: "Ideal Customer Profiles",
    group: "Setup",
    icon: Target,
    href: "/icp",
    summary: "Describe who you sell to - saved definitions of the companies worth targeting.",
    blocks: [
      {
        kind: "text",
        text:
          "An ICP is a saved description of the kind of company worth selling to: industry, size, revenue, location, technologies, and the roles and departments you need to reach. Each one belongs to a workspace, so different teams can target different markets from the same book of companies.",
      },
      { kind: "sub", text: "What an ICP does and does not do" },
      {
        kind: "text",
        text:
          "An ICP describes which companies are worth finding. It has no effect whatsoever on scoring: every company is scored on the evidence found about it, and a company that matches your ICP perfectly can still score low if there is no buying evidence behind it. That separation is deliberate - a fit score dressed up as a buying score is what makes a call list untrustworthy.",
      },
      { kind: "sub", text: "Filling one in" },
      {
        kind: "steps",
        items: [
          "Every field is optional. A field left blank places no constraint - an ICP with only an industry set is perfectly valid.",
          "Industries and personas are picked from the values the platform actually recognises, so a criterion can never silently match nothing.",
          "Departments are read from the contacts you have already uploaded, which is why the list is empty until your first upload.",
        ],
      },
      { kind: "sub", text: "Finding companies from an ICP" },
      {
        kind: "text",
        text:
          "\"Find companies\" on an ICP card discovers new companies rather than filtering the ones you already have. It is the other way into the platform: instead of uploading a list, you describe who you want and the platform goes looking.",
      },
      {
        kind: "steps",
        items: [
          "Candidates are proposed from your ICP and your offering profile.",
          "Every candidate is then checked against live web search, and only companies with a confirmed real website are saved. Anything that cannot be confirmed is discarded rather than stored.",
          "Companies you already have are skipped, so a run never re-adds them.",
          "The survivors are researched and scored exactly like uploaded companies, with the same progress, retry and cancel controls.",
        ],
      },
      {
        kind: "note",
        text:
          "Expect fewer companies than you asked for - that is verification working. A shorter list of companies that genuinely exist is the point, and every candidate costs real research budget.",
      },
      {
        kind: "text",
        text:
          "Companies found this way arrive without contacts, so their Contact Access score is 0 and their Lead Score is capped below an uploaded company's until contacts are added. That is a difference in what is known about them, not in how good a prospect they are - which is why generated batches are labelled as such in Upload History and the Enterprise List filter.",
      },
      {
        kind: "note",
        text:
          "Deleting an ICP never touches your data. Companies, buying events and scores belong to the organisation, and past batches keep their history - they simply stop being linked to that ICP.",
      },
    ],
  },
  {
    id: "uploading",
    label: "Uploading data",
    group: "Setup",
    icon: Upload,
    href: "/settings",
    summary: "How to bring companies in, and how to read a running job.",
    blocks: [
      { kind: "sub", text: "What you can upload" },
      {
        kind: "text",
        text:
          "CSV and XLSX files, several at once. Every sheet in a workbook is read rather than just the first, and the header row is detected even when the file begins with a title or a blank row. Column names are matched by meaning rather than requiring an exact template, so ZoomInfo exports and hand-built sheets both work. A file with nothing but company names is still usable, though a website domain per row substantially improves research.",
      },
      { kind: "sub", text: "What happens after the upload" },
      {
        kind: "steps",
        items: [
          "The file is ingested and companies are created. You immediately see files processed, companies ingested, signals found and the band counts, with the still-running parts marked as researching or scoring.",
          "Research and scoring continue in the background. You can leave the page - progress is kept on the job, not in your browser session.",
          "As scoring completes, the Enterprise List and Dashboard fill in.",
        ],
      },
      { kind: "sub", text: "Upload History" },
      {
        kind: "text",
        text:
          "One row per upload, showing the date, files, rows, companies, how many were researched, how many events were found, the status, and the resulting band counts. Status reads Complete, Processing, Warnings or Failed - and Warnings is worth opening, because it means the job finished but skipped something it can explain.",
      },
      {
        kind: "text",
        text:
          "Deleting an upload removes its companies and their buying events, and tells you exactly how many of each were removed, so the count is never a surprise.",
      },
      { kind: "sub", text: "Job detail" },
      {
        kind: "text",
        text:
          "Expanding a row opens the per-company view: a progress bar with completed and total counts, and a table of every company with its status, retry count and error. You can filter to just the failures, or to companies needing review, download the results, retry only the failed rows, or cancel a job that is still running. While a job is active the panel refreshes itself.",
      },
      {
        kind: "note",
        text:
          "Values from your spreadsheet always win. Research only fills fields that were left empty, so it can never overwrite something you supplied.",
      },
    ],
  },
  {
    id: "offering",
    label: "Offering profile",
    group: "Setup",
    icon: Sparkles,
    href: "/settings",
    summary: "What you sell - the reference point every relevance score is measured against.",
    blocks: [
      {
        kind: "text",
        text:
          "The offering profile describes what your business sells, and it is what every relevance score is judged against. Get this wrong and the scores will be confidently, consistently wrong in the same direction, because relevance is a multiplier on every single event.",
      },
      {
        kind: "list",
        items: [
          { term: "Offering areas", text: "The solutions you take to market." },
          { term: "Problems solved", text: "The pains a prospect would recognise in themselves." },
          { term: "Technologies", text: "What you build with, used to spot technical fit in an event." },
          { term: "Alternative solutions", text: "What you displace, which is what makes competitive events readable." },
        ],
      },
      {
        kind: "text",
        text:
          "The profile is synced from your own website and shows its state - synced, fallback, stale or failed - along with when it last updated and a control to refresh it. A fallback or stale profile still scores, it just scores against a less current picture of your business.",
      },
      {
        kind: "note",
        text:
          "The offering profile never excludes a company. It changes how relevant an event is judged to be, and therefore the score, but it is not a filter and it cannot remove a company from your list.",
      },
    ],
  },
  {
    id: "org",
    label: "Organisation & workspaces",
    group: "Setup",
    icon: SettingsIcon,
    href: "/settings",
    summary: "Your company profile, and separating one book of business from another.",
    blocks: [
      {
        kind: "list",
        items: [
          {
            term: "Organization",
            text:
              "The profile gathered during onboarding - company name, website, legal name, industry, headquarters, your designation, logo and description. Edit puts the fields into an editable state and Save Changes commits them.",
          },
          {
            term: "Workspaces",
            text:
              "Separate books of business inside one organisation, typically one per department. Each has a name and a stated purpose, and you can create more at any time.",
          },
          {
            term: "Switching workspace",
            text:
              "Switch from the Settings panel or from the workspace control in the top bar. Switching reloads the application so that every page re-reads its data for the new workspace rather than showing a mix of the two.",
          },
          {
            term: "Scoring Method",
            text:
              "A read-only statement of the formula and thresholds currently in force, so the model behind your numbers is never a mystery.",
          },
        ],
      },
    ],
  },

  // ------------------------------------------------------------- scoring
  {
    id: "scoring-overview",
    label: "Scoring: the formula",
    group: "Scoring reference",
    icon: Layers,
    summary: "The one equation the whole product rests on, and what is deliberately absent from it.",
    blocks: [
      {
        kind: "formula",
        text: "Lead Score = clamp(Buying Evidence + Contact Access − Negative Evidence, 0, 100)",
      },
      {
        kind: "table",
        head: ["Component", "Range", "Meaning"],
        rows: [
          ["Buying Evidence", "0 to 80", "How strong the published evidence of buying activity is"],
          ["Contact Access", "0 to 20", "Whether you can actually reach someone who decides"],
          ["Negative Evidence", "0 to 100 subtracted", "Findings that argue against pursuing them now"],
        ],
      },
      {
        kind: "note",
        text:
          "Revenue, funding and headcount never move the Lead Score. Company size tells you how large a deal could be, not whether anyone is buying - so those fields only ever set Expected Deal Value. There is no ideal-customer gate anywhere in the model: nothing is excluded for being the wrong size or sector.",
      },
      { kind: "sub", text: "Why the ceiling is 80 plus 20" },
      {
        kind: "text",
        text:
          "Evidence alone cannot reach 100. A company with overwhelming buying signals and nobody reachable tops out at 80, because a lead you cannot contact is not yet workable. Equally, contact access alone is worth at most 20: knowing the chief executive's email address is not a reason to call if nothing is happening.",
      },
      { kind: "sub", text: "What the clamp hides" },
      {
        kind: "text",
        text:
          "Because the result is clamped at zero, a heavily penalised company shows 0 rather than a negative number. When that happens the expected deal value is also zeroed, so a company you have just flagged as one to avoid cannot quietly inflate your pipeline total.",
      },
    ],
  },
  {
    id: "scoring-event",
    label: "Scoring: one event",
    group: "Scoring reference",
    icon: Target,
    summary: "The six multipliers behind every event score, with all their values.",
    blocks: [
      {
        kind: "formula",
        text:
          "Event Score = Base Strength × Relevance × Freshness × Source Quality × Extraction Confidence × Status",
      },
      {
        kind: "text",
        text:
          "Base strength is a number out of 100 for the event type. Every other factor is between 0 and 1, which means each one can only ever reduce the result - so a single weak factor caps the whole event no matter how strong the rest are.",
      },
      { kind: "sub", text: "Base strength by event type" },
      {
        kind: "table",
        head: ["Event type", "Base"],
        rows: [
          ["Published RFP", "80"],
          ["Procurement process", "75"],
          ["Vendor replacement", "75"],
          ["Vendor evaluation", "70"],
          ["Active pilot", "65"],
          ["Explicit AI budget", "65"],
          ["AI transformation programme", "60"],
          ["AI pilot announced", "60"],
          ["Technology budget", "55"],
          ["New technology mandate", "55"],
          ["Explicit AI tool adoption", "50"],
          ["Relevant AI hiring", "50"],
          ["Plant expansion", "50"],
          ["Acquisition or merger", "50"],
          ["Leadership change", "45"],
          ["Funding without buying evidence", "45"],
          ["Operational inefficiency", "45"],
          ["Quality control problem", "45"],
          ["Supply chain disruption", "45"],
          ["Regulatory compliance pressure", "45"],
          ["Labour shortage", "40"],
          ["Generic technology assessment", "25"],
          ["Company identity update", "0"],
          ["Anything unrecognised", "20"],
        ],
      },
      {
        kind: "text",
        text:
          "Active buying signals sit highest because they describe a purchase already in motion. Growth and change events sit in the middle: for a solutions partner, fresh capital, a new senior leader with a mandate, an acquisition to integrate or a hiring push all represent real budget and real scaling pain. A pure identity update - a rebrand, a new address - scores nothing, because it tells you nothing about buying.",
      },
      { kind: "sub", text: "Relevance" },
      {
        kind: "table",
        head: ["Value", "Interpretation"],
        rows: [
          ["1.00", "Direct, explicit match to one of your offerings"],
          ["0.85", "Strong adjacent AI, data or automation need"],
          ["0.65", "Operational pain you can address, or a growth or change trigger"],
          ["0.35", "Weak or indirect relevance"],
          ["0.00", "Genuinely irrelevant"],
        ],
      },
      {
        kind: "text",
        text:
          "This is where an event that looks important but is not useful to you gets discounted. A new chief marketing officer at a manufacturer is a real leadership change, but relevance is what stops it being treated like a new chief technology officer with a modernisation mandate.",
      },
      { kind: "sub", text: "Freshness" },
      {
        kind: "table",
        head: ["Age of event", "Multiplier"],
        rows: [
          ["Up to 30 days", "1.00"],
          ["Up to 90 days", "0.90"],
          ["Up to 180 days", "0.75"],
          ["Up to 1 year", "0.55"],
          ["Up to 18 months", "0.35"],
          ["Older than 18 months", "0.00"],
          ["Publication date unknown", "0.45"],
        ],
      },
      {
        kind: "text",
        text:
          "Anything older than 18 months contributes nothing at all. An undated event is not thrown away but is treated cautiously, at slightly worse than a six-month-old one.",
      },
      { kind: "sub", text: "Source quality" },
      {
        kind: "table",
        head: ["Source type", "Multiplier"],
        rows: [
          ["Official procurement or regulatory source", "0.95"],
          ["Reputable independent publication", "0.90"],
          ["Company press release or own website", "0.82"],
          ["Industry publication", "0.80"],
          ["Aggregator", "0.60"],
          ["Unknown", "0.50"],
        ],
      },
      {
        kind: "text",
        text:
          "A company's own announcement is rated below independent reporting but well above an aggregator, because a press release is reliable about intent while being an interested party about significance.",
      },
      { kind: "sub", text: "Status" },
      {
        kind: "table",
        head: ["Event status", "Multiplier"],
        rows: [
          ["Active, evaluating or in procurement", "1.00"],
          ["Announced or planned", "0.90"],
          ["Exploring", "0.65"],
          ["Speculative", "0.45"],
          ["Completed, with follow-on need", "0.30"],
          ["Completed and irrelevant", "0.00"],
          ["Status unclear", "0.65"],
        ],
      },
      {
        kind: "text",
        text:
          "Status is the difference between a deal you can still influence and one that has already closed. A completed project with genuine follow-on work retains a little weight; a completed and finished one retains none.",
      },
      { kind: "sub", text: "Extraction confidence" },
      {
        kind: "text",
        text:
          "How certain the extraction was that the event is real and correctly understood, taken directly from the classification of the source text. It is the sixth multiplier, which is why a badly reported or ambiguous article cannot produce a high event score however strong its event type.",
      },
    ],
  },
  {
    id: "scoring-company",
    label: "Scoring: evidence & contacts",
    group: "Scoring reference",
    icon: Scale,
    summary: "How individual events become a company score, and how contacts are counted.",
    blocks: [
      { kind: "sub", text: "Buying Evidence" },
      {
        kind: "formula",
        text: "Buying Evidence = min(80, e₁ × 1.00 + e₂ × 0.60 + e₃ × 0.40)",
      },
      {
        kind: "text",
        text:
          "Only the three strongest independent events count, weighted in descending order and capped at 80. A fourth genuine event adds nothing to the score.",
      },
      {
        kind: "text",
        text:
          "Two design choices matter here. First, the second and third events carry real weight, because a company with several genuine independent signals is a better lead than one with a single strong signal - a breadth of activity is itself evidence. Second, the cap and the three-event limit stop a company being ranked highly on volume of press coverage alone.",
      },
      { kind: "sub", text: "What independent means" },
      {
        kind: "text",
        text:
          "Independent means a distinct real-world event, not a distinct article. Before scoring, articles describing the same event are merged into one canonical event, and the extra articles raise confidence rather than counting again. A funding round covered by six outlets is one event with six sources, not six events.",
      },
      {
        kind: "text",
        text:
          "There is also a cross-check for the awkward case where the same fact is read two opposite ways - for instance a distressed asset sale reported once as an expansion opportunity and once as financial distress. When that happens the negative reading is treated as authoritative and the positive duplicate is dropped entirely, rather than allowing a forced sale to count as a growth signal.",
      },
      { kind: "sub", text: "Contact Access" },
      {
        kind: "table",
        head: ["Strongest contact on file", "Points"],
        rows: [
          ["Economic buyer with a verified email", "20"],
          ["Relevant executive with a verified email", "15"],
          ["Relevant contact, phone or LinkedIn only", "8"],
          ["Generic company contact", "3"],
          ["No usable contact found", "0"],
        ],
      },
      {
        kind: "text",
        text:
          "Scored once per company from the single strongest reachable contact, never summed. Economic buyers are chief executives and the operating, technology, information, AI, data and digital chiefs. Relevant executives cover vice presidents, transformation leads, IT and operations directors, procurement, and heads of data, AI or technology.",
      },
      {
        kind: "note",
        text:
          "The gap between 15 and 8 is the value of a verified email. A named, perfectly relevant executive with only a switchboard number scores barely half of the same person with a working address, because that is roughly the difference in your ability to start a conversation this week.",
      },
    ],
  },
  {
    id: "scoring-negative",
    label: "Scoring: negative evidence",
    group: "Scoring reference",
    icon: MinusCircle,
    summary: "The findings that subtract from a score, and what can zero one outright.",
    blocks: [
      {
        kind: "text",
        text:
          "Negative evidence is subtracted from the total. Each unique negative finding counts once, and the combined penalty is capped at 100 - which is enough to zero any score.",
      },
      {
        kind: "table",
        head: ["Negative finding", "Penalty"],
        rows: [
          ["Project cancelled", "100"],
          ["Vendor already selected", "70"],
          ["Relevant project completed", "60"],
          ["Severe financial distress", "50"],
          ["Strong contradictory signal", "20"],
          ["Unclassified negative", "20"],
        ],
      },
      {
        kind: "text",
        text:
          "A cancelled project zeroes the score on its own, and a competitor already selected very nearly does. These are the two findings that make a company genuinely not worth calling this quarter, however good the rest of the evidence looked.",
      },
      { kind: "sub", text: "Distress is checked against the source, not the summary" },
      {
        kind: "text",
        text:
          "Unambiguous distress language - bankruptcy, insolvency, collapse and similar - is matched against the original article text rather than against the generated summary. The wording of a summary is exactly what is least trustworthy in this situation, since a forced sale can easily be paraphrased as a strategic transaction.",
      },
      {
        kind: "note",
        text:
          "When negative evidence is what actually decided the outcome, the why-now line on the company changes to reflect the disqualifying reason. You should never read an encouraging growth narrative on a company that scored zero because it is in administration.",
      },
    ],
  },
  {
    id: "scoring-confidence",
    label: "Scoring: confidence",
    group: "Scoring reference",
    icon: CircleHelp,
    summary: "How sure we are about the evidence - measured separately from the score.",
    blocks: [
      {
        kind: "text",
        text:
          "Confidence is computed independently of the Lead Score, and deliberately so: a low score must never imply that we are unsure. For each event it combines four things.",
      },
      {
        kind: "list",
        items: [
          { term: "Extraction confidence", text: "How certain the classification of the article was." },
          { term: "Source quality", text: "How reliable the publication is." },
          { term: "Date certainty", text: "Whether the event has a known publication date." },
          { term: "Company match", text: "How confidently the article was tied to this specific company rather than a similarly named one." },
        ],
      },
      {
        kind: "text",
        text:
          "Those per-event values are combined across the strongest events using the same descending weighting as Buying Evidence, then normalised. Each additional corroborating article adds 0.03, up to a maximum bonus of 0.10 - so breadth of coverage helps, but cannot manufacture certainty on its own.",
      },
      {
        kind: "table",
        head: ["Confidence", "Value"],
        rows: [
          ["High", "0.80 and above"],
          ["Medium", "0.60 to 0.79"],
          ["Low", "Below 0.60"],
          ["Insufficient Evidence", "No positive events at all"],
        ],
      },
      {
        kind: "note",
        text:
          "Insufficient Evidence is not a bad score. It means we researched the company and found nothing that counts, which is a genuine and actionable answer - and quite different from Low, where we found something but cannot vouch for it strongly.",
      },
    ],
  },
  {
    id: "scoring-deal",
    label: "Scoring: deal value",
    group: "Scoring reference",
    icon: Wallet,
    summary: "How Expected Deal Value is banded, and why it is separate from the score.",
    blocks: [
      {
        kind: "text",
        text:
          "Expected Deal Value answers how large a deal could be, and is kept entirely apart from the Lead Score, which answers whether anyone is buying. Conflating the two is what makes a large, dormant company outrank a small, actively buying one.",
      },
      { kind: "sub", text: "Revenue capacity bands" },
      {
        kind: "table",
        head: ["Company revenue", "Expected deal"],
        rows: [
          ["Under $25M", "$15k - $40k"],
          ["Under $100M", "$25k - $75k"],
          ["Under $250M", "$50k - $150k"],
          ["Under $500M", "$75k - $250k"],
          ["Under $1B", "$100k - $400k"],
          ["$1B and above", "$150k - $750k"],
          ["Revenue unknown", "$15k - $40k"],
        ],
      },
      {
        kind: "text",
        text:
          "Unknown revenue falls to the most conservative band rather than an average one, so a missing field understates rather than inflates your pipeline.",
      },
      { kind: "sub", text: "The two adjustments" },
      {
        kind: "list",
        items: [
          {
            term: "Funding bump",
            text:
              "Recent funding - within about 18 months - that is materially relevant to technology, AI, automation, data or operational transformation can lift the band, by at most one step. Fresh capital raises capacity somewhat; it does not transform a small company into an enterprise buyer.",
          },
          {
            term: "Explicit public budget",
            text:
              "When an event carries a documented public AI or procurement budget, that takes precedence over the revenue band - but only a 10% capturable share of it is assumed. Treating a published budget as though it were all yours is the most obvious way to produce a fictional pipeline.",
          },
        ],
      },
      { kind: "sub", text: "Provisional weighted value" },
      {
        kind: "formula",
        text: "Provisional Weighted Value = (Lead Score ÷ 100) × deal midpoint",
      },
      {
        kind: "text",
        text:
          "A rough way to weight a deal by how live it looks. It is explicitly not a calibrated conversion probability - it is a placeholder until there is real won-and-lost outcome data to calibrate against, and should be read as a ranking aid rather than a forecast.",
      },
      {
        kind: "text",
        text:
          "A deal is flagged commercially viable when its expected value reaches $15,000. This is a label only and never stops a company being scored or shown. Companies whose score was floored to zero by negative evidence have their deal value zeroed too, so they cannot inflate pipeline totals.",
      },
    ],
  },
  {
    id: "scoring-bands",
    label: "Scoring: status bands",
    group: "Scoring reference",
    icon: Layers,
    summary: "What each Sales Status means, and why the thresholds are where they are.",
    blocks: [
      {
        kind: "table",
        head: ["Sales Status", "Score", "How to treat it"],
        rows: [
          ["Sales Ready", "65 - 100", "Call today: strong active or multi-signal evidence and someone reachable"],
          ["High Priority", "50 - 64", "Call this week: several real signals, or one strong one"],
          ["Warm", "35 - 49", "Worth a call: genuine but lighter evidence"],
          ["Monitor", "20 - 34", "Keep an eye on it: minimal evidence"],
          ["Low Priority", "0 - 19", "Little or no current evidence"],
        ],
      },
      { kind: "sub", text: "Why 65 rather than 85" },
      {
        kind: "text",
        text:
          "These are ordinal labels for someone working a scored list top-down, not absolute claims about a company. Against the score distribution this model actually produces, the strongest genuinely active companies - a real acquisition, plus funding, plus a reachable economic buyer - land in the mid-sixties to high-seventies. Thresholds set at round numbers like 85 meant the top label essentially never appeared and your best available leads all read as merely Warm, which is misleading in the other direction.",
      },
      {
        kind: "note",
        text:
          "Only the band thresholds were calibrated to the observed distribution. The underlying evidence arithmetic is untouched, so the scores themselves remain directly comparable between companies.",
      },
    ],
  },

  // ------------------------------------------------------------ reference
  {
    id: "faq",
    label: "Common questions",
    group: "Reference",
    icon: CircleHelp,
    summary: "Why a company scored the way it did, and what to check first.",
    blocks: [
      {
        kind: "list",
        items: [
          {
            term: "Why does this company score 0?",
            text:
              "Either we found no qualifying evidence, or negative evidence floored it. Open Score Breakdown: if the Evidence Events card is empty the company is genuinely quiet, and if there is a penalty listed then something specific disqualified it.",
          },
          {
            term: "Why is the score a dash instead of a number?",
            text:
              "It has not been scored yet, which is different from scoring zero. Check the job in Upload History - it may still be running, or that company may have failed and be available to retry.",
          },
          {
            term: "Why was this company never researched?",
            text:
              "Almost always a missing website domain on the uploaded row. Without one there is nothing dependable to search against, and the company is flagged as not researched rather than being scored as quiet.",
          },
          {
            term: "Why has a score dropped when nothing bad happened?",
            text:
              "Freshness. Evidence decays through the age bands and stops counting entirely after 18 months, so a company with no new activity drifts down on its own. The Score History change log distinguishes ageing from new negative evidence.",
          },
          {
            term: "Why does a big, well-known company score low?",
            text:
              "Size is not in the formula. Revenue and headcount only set Expected Deal Value. A large company with no current buying activity should score below a small one that is actively in procurement, and that is the model working as intended.",
          },
          {
            term: "Why does a strong company have Low confidence?",
            text:
              "The evidence is promising but thin - perhaps a single undated article from a weak source. Worth calling, worth verifying first. Open the Sources on the signal to see what it rests on.",
          },
          {
            term: "Why is the funding card empty?",
            text:
              "Frequently because there is no funding to report. Established, profitable and public companies often have none, and we would rather show nothing than invent a plausible round.",
          },
          {
            term: "Why did a fourth strong signal not raise the score?",
            text:
              "Only the top three independent events count. Beyond that, additional evidence raises confidence rather than the score, which stops a heavily covered company outranking a genuinely active one.",
          },
          {
            term: "Why do the same events appear as one row?",
            text:
              "Multiple articles about one real event are merged into a single canonical event. The source count on the row tells you how many articles corroborate it.",
          },
        ],
      },
    ],
  },
  {
    id: "glossary",
    label: "Glossary",
    group: "Reference",
    icon: BookOpen,
    summary: "Plain definitions for every term used across the product.",
    blocks: [
      {
        kind: "list",
        items: [
          {
            term: "Buying event",
            text:
              "A real, published thing a company did that suggests it may buy: a funding round, a hiring push, a leadership appointment, an acquisition, a technology mandate, a procurement process.",
          },
          {
            term: "Canonical event",
            text:
              "One real-world event after all the articles describing it have been merged together. Scoring counts canonical events, never articles.",
          },
          {
            term: "Event score",
            text: "The strength of one piece of evidence, out of 100, after all six multipliers.",
          },
          {
            term: "Base strength",
            text: "What an event type is intrinsically worth before any decay is applied.",
          },
          {
            term: "Relevance",
            text:
              "How closely an event matches what you sell, from 0 to 1. High is 0.65 and above, Medium is 0.40 to 0.64, Low is below 0.40.",
          },
          {
            term: "Freshness",
            text: "The age decay on an event. Nothing older than 18 months contributes.",
          },
          {
            term: "Source quality",
            text: "How reliable the publication is, from an official record down to an unknown aggregator.",
          },
          {
            term: "Status factor",
            text:
              "Whether the event is still live. Active work scores full; something completed and finished scores nothing.",
          },
          {
            term: "Extraction confidence",
            text:
              "How certain the extraction was that the event is real and correctly understood. Separate from relevance.",
          },
          {
            term: "Buying Evidence",
            text: "The company-level total from its three strongest independent events, capped at 80.",
          },
          {
            term: "Contact Access",
            text: "Up to 20 points from the single strongest reachable contact.",
          },
          {
            term: "Negative evidence",
            text:
              "Findings that count against a company: a competitor selected, a project cancelled or completed, financial distress, or a strong contradictory signal.",
          },
          {
            term: "Lead Score",
            text: "The company-level 0-100 number that ranks your list.",
          },
          {
            term: "Sales Status",
            text: "The band a Lead Score falls into, from Sales Ready down to Low Priority.",
          },
          {
            term: "Confidence",
            text:
              "How sure we are about the evidence, reported as High, Medium, Low or Insufficient Evidence. Independent of the score.",
          },
          {
            term: "Sector",
            text:
              "A grouping of related industries, used by the globe and the industry filters because raw industry labels are too fragmented to filter on directly.",
          },
          {
            term: "Expected deal value",
            text: "A revenue-banded estimate of deal size. Recent relevant funding can lift it by one band at most.",
          },
          {
            term: "Provisional weighted value",
            text: "The deal midpoint scaled by the Lead Score. A ranking aid, not a forecast.",
          },
          {
            term: "Commercially viable",
            text: "A label applied once expected deal value reaches $15,000. It never gates anything.",
          },
          {
            term: "Economic buyer",
            text:
              "Someone who can authorise the spend: a chief executive, or an operating, technology, information, AI, data or digital chief.",
          },
          {
            term: "Actionable",
            text: "An event whose status is active or announced, rather than exploratory or speculative.",
          },
          {
            term: "Stale",
            text: "Evidence old enough that it no longer contributes to the score at all.",
          },
        ],
      },
    ],
  },
];

const GROUP_ORDER = [
  "Getting started",
  "Daily workflow",
  "Signals",
  "Companies",
  "Setup",
  "Scoring reference",
  "Reference",
];

function blockText(block: GuideBlock): string {
  switch (block.kind) {
    case "sub":
    case "text":
    case "formula":
    case "note":
      return block.text;
    case "steps":
      return block.items.join(" ");
    case "list":
      return block.items.map((i) => `${i.term} ${i.text}`).join(" ");
    case "table":
      return [...block.head, ...block.rows.flat()].join(" ");
  }
}

function Block({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case "sub":
      return (
        <h4 className="m-0 mt-[6px] text-[14px] font-bold text-[#0f172a]">{block.text}</h4>
      );

    case "text":
      return <p className="m-0 text-[14px] leading-[23px] text-[#475569]">{block.text}</p>;

    case "formula":
      return (
        <p className="m-0 rounded-[10px] border border-[#e2e8f0] bg-[#f8fafc] px-[14px] py-[12px] text-center font-mono text-[13px] leading-[20px] font-semibold text-[#0f172a]">
          {block.text}
        </p>
      );

    case "note":
      return (
        <div className="flex gap-[10px] rounded-[10px] border border-[#e5edff] bg-[#f5f8ff] p-[14px]">
          <Info className="mt-[1px] size-[16px] shrink-0 text-[#2563eb]" />
          <p className="m-0 text-[13px] leading-[21px] text-[#334155]">{block.text}</p>
        </div>
      );

    case "steps":
      return (
        <ol className="m-0 flex list-none flex-col gap-[12px] p-0">
          {block.items.map((item, i) => (
            <li className="flex gap-[12px]" key={i}>
              <span className="mt-[1px] flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[#0f172a] text-[11px] font-bold text-white">
                {i + 1}
              </span>
              <span className="text-[14px] leading-[22px] text-[#475569]">{item}</span>
            </li>
          ))}
        </ol>
      );

    case "list":
      return (
        <dl className="m-0 flex flex-col gap-[14px]">
          {block.items.map((item) => (
            <div key={item.term}>
              <dt className="text-[13px] font-bold text-[#0f172a]">{item.term}</dt>
              <dd className="m-0 mt-[3px] text-[13px] leading-[21px] text-[#64748b]">{item.text}</dd>
            </div>
          ))}
        </dl>
      );

    case "table":
      return (
        <div className="overflow-hidden rounded-[10px] border border-[#eef1f6]">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#f8fafc]">
                {block.head.map((h, i) => (
                  <th
                    className={cn(
                      "px-[14px] py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.03em] text-[#94a3b8]",
                      i > 0 && "whitespace-nowrap",
                    )}
                    key={h}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr className="border-t border-[#f1f5f9]" key={row.join("|")}>
                  {row.map((cell, c) => (
                    <td
                      className={cn(
                        "px-[14px] py-[9px] align-top",
                        c === 0
                          ? "text-[#475569]"
                          : "font-semibold tabular-nums text-[#0f172a]",
                        c > 0 && block.head.length === 2 && "whitespace-nowrap",
                      )}
                      key={`${r}-${c}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function GuidePanel({ onClose }: { onClose: () => void }) {
  const [activeId, setActiveId] = useState(TOPICS[0].id);
  const [query, setQuery] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOPICS;
    return TOPICS.filter((t) =>
      [t.label, t.summary, ...t.blocks.map(blockText)].join(" ").toLowerCase().includes(q),
    );
  }, [query]);

  // Keep the selection valid while filtering, so an empty content pane can
  // never be shown alongside a non-empty result list.
  const active = matches.find((t) => t.id === activeId) ?? matches[0] ?? null;

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [active?.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const groups = GROUP_ORDER.map((group) => ({
    group,
    topics: matches.filter((t) => t.group === group),
  })).filter((g) => g.topics.length > 0);

  return (
    <div
      aria-labelledby="guide-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/45 p-[16px] backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="flex h-[min(720px,94vh)] w-full max-w-[1080px] flex-col overflow-hidden rounded-[18px] border border-[#e9edf5] bg-white shadow-[0px_24px_60px_rgba(15,23,42,0.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-[14px] border-b border-[#eef1f6] px-[22px] py-[16px]">
          <span className="flex size-[38px] items-center justify-center rounded-[10px] bg-[#0f172a] text-white">
            <BookOpen className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[17px] font-bold text-[#0f172a]" id="guide-title">
              Platform Guide
            </h2>
            <p className="m-0 text-[12px] text-[#64748b]">
              Every page, every metric, and exactly how a Lead Score is produced.
            </p>
          </div>
          <div className="relative hidden sm:block">
            <Search className="pointer-events-none absolute left-[11px] top-1/2 size-[15px] -translate-y-1/2 text-[#94a3b8]" />
            <input
              aria-label="Search the guide"
              className="h-[38px] w-[220px] rounded-[10px] border border-[#e9edf5] bg-[#f8fafc] pl-[34px] pr-[12px] text-[13px] text-[#334155] outline-none placeholder:text-[#94a3b8] focus:border-[#2563eb]"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the guide"
              value={query}
            />
          </div>
          <button
            aria-label="Close guide"
            className="flex size-[36px] shrink-0 items-center justify-center rounded-[10px] border border-[#e9edf5] text-[#64748b] transition hover:bg-[#f6f7fb] hover:text-[#0f172a]"
            onClick={onClose}
            type="button"
          >
            <X className="size-[17px]" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav className="hidden w-[248px] shrink-0 overflow-y-auto border-r border-[#eef1f6] bg-[#fcfdff] px-[12px] py-[14px] [-ms-overflow-style:none] [scrollbar-width:none] md:block [&::-webkit-scrollbar]:hidden">
            {groups.length === 0 ? (
              <p className="m-0 px-[10px] py-[8px] text-[12px] text-[#94a3b8]">No matching topics.</p>
            ) : (
              groups.map(({ group, topics }) => (
                <div className="mb-[14px]" key={group}>
                  <p className="m-0 px-[10px] pb-[6px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94a3b8]">
                    {group}
                  </p>
                  <div className="flex flex-col gap-[2px]">
                    {topics.map((topic) => {
                      const Icon = topic.icon;
                      const isActive = topic.id === active?.id;
                      return (
                        <button
                          className={cn(
                            "flex items-center gap-[10px] rounded-[9px] px-[10px] py-[8px] text-left text-[13px] transition",
                            isActive
                              ? "bg-[#fff1e6] font-semibold text-[#0f172a]"
                              : "font-medium text-[#64748b] hover:bg-[#f2f5fa] hover:text-[#334155]",
                          )}
                          key={topic.id}
                          onClick={() => setActiveId(topic.id)}
                          type="button"
                        >
                          <Icon
                            className={cn("size-[16px] shrink-0", isActive ? "text-[#f97316]" : "text-[#94a3b8]")}
                          />
                          <span className="truncate">{topic.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </nav>

          <div
            className="min-w-0 flex-1 overflow-y-auto px-[24px] py-[22px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            ref={bodyRef}
          >
            {!active ? (
              <p className="m-0 text-[13px] text-[#94a3b8]">
                Nothing in the guide matches “{query}”.
              </p>
            ) : (
              <>
                {/* Mobile topic picker - the sidebar is hidden below md. */}
                <div className="mb-[16px] md:hidden">
                  <select
                    aria-label="Guide topic"
                    className="h-[38px] w-full rounded-[10px] border border-[#e9edf5] bg-white px-[10px] text-[13px] text-[#334155]"
                    onChange={(e) => setActiveId(e.target.value)}
                    value={active.id}
                  >
                    {matches.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.group} · {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94a3b8]">
                  {active.group}
                </p>
                <h3 className="m-0 mt-[6px] text-[22px] font-bold leading-[28px] text-[#0f172a]">
                  {active.label}
                </h3>
                <p className="m-0 mt-[6px] text-[14px] leading-[22px] text-[#64748b]">{active.summary}</p>

                {active.href && (
                  <Link
                    className="mt-[14px] inline-flex items-center gap-[6px] rounded-[9px] bg-[#0f172a] px-[13px] py-[8px] text-[13px] font-semibold text-white no-underline transition hover:bg-[#1e293b]"
                    onClick={onClose}
                    to={active.href}
                  >
                    Open {active.label}
                    <ArrowUpRight className="size-[14px]" />
                  </Link>
                )}

                <div className="mt-[20px] flex flex-col gap-[16px] border-t border-[#f1f5f9] pt-[18px]">
                  {active.blocks.map((block, i) => (
                    <Block block={block} key={i} />
                  ))}
                </div>

                <div className="h-[24px]" />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Top-bar entry point for the product guide. */
export function GuideButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        aria-haspopup="dialog"
        className="flex h-[46px] items-center gap-[8px] rounded-[12px] border border-[#e9edf5] bg-white px-[14px] text-[14px] font-semibold text-[#334155] transition hover:border-[#cbd5e1] hover:text-[#0f172a]"
        onClick={() => setOpen(true)}
        title="Platform guide"
        type="button"
      >
        <BookOpen className="size-[17px] text-[#64748b]" />
        <span className="hidden lg:inline">Guide</span>
      </button>

      {open && <GuidePanel onClose={() => setOpen(false)} />}
    </>
  );
}
