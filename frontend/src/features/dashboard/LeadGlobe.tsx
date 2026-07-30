import { useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import countriesUrl from "../../assets/globe/countries-110m.json?url";
import earthNight from "../../assets/globe/earth-night.jpg";
import earthTopology from "../../assets/globe/earth-topology.png";

/* Zone colors + boundaries mirror the Lead Opportunity Map legend and the
 * real sales_status bands (evidence_scorer.sales_status /
 * cfg.SALES_STATUS_BANDS): Sales Ready 65+, High Priority 50-64, Warm 35-49,
 * Monitor 20-34, Low Priority 0-19. Keep zoneForScore below in sync with
 * cfg.SALES_STATUS_BANDS - these were left at the pre-recalibration values
 * (85/70/50/30) once already, which silently mis-coloured every country. */
const ZONE = {
  sales_ready: "#16a34a",
  high_priority: "#22c55e",
  warm: "#f97316",
  monitor: "#eab308",
  low_priority: "#94a3b8",
} as const;
type Zone = keyof typeof ZONE;

type LeadPoint = { lat: number; lng: number; zone: Zone; label: string };
type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
type Feature = { properties: Record<string, string | number>; geometry?: Geometry };
export type CountryLeadScore = {
  country: string;
  avg_lead_score: number;
  company_count: number;
  max_lead_score: number;
};

const dummyPoints: LeadPoint[] = [
  { lat: 37.77, lng: -122.42, zone: "sales_ready", label: "San Francisco" },
  { lat: 40.71, lng: -74.0, zone: "sales_ready", label: "New York" },
  { lat: 12.97, lng: 77.59, zone: "sales_ready", label: "Bengaluru" },
  { lat: 19.08, lng: 72.88, zone: "high_priority", label: "Mumbai" },
  { lat: 51.51, lng: -0.13, zone: "high_priority", label: "London" },
  { lat: 1.35, lng: 103.82, zone: "high_priority", label: "Singapore" },
  { lat: 32.08, lng: 34.78, zone: "warm", label: "Tel Aviv" },
  { lat: 52.52, lng: 13.4, zone: "warm", label: "Berlin" },
  { lat: 43.65, lng: -79.38, zone: "monitor", label: "Toronto" },
  { lat: 35.68, lng: 139.65, zone: "monitor", label: "Tokyo" },
  { lat: -23.55, lng: -46.63, zone: "low_priority", label: "São Paulo" },
  { lat: -33.87, lng: 151.21, zone: "low_priority", label: "Sydney" },
];

/* Countries to shade, keyed by Natural Earth `ADMIN` name. Fallback shown
 * until real per-country signal data loads (see toRealPoints below). */
const dummyHighlight: Record<string, Zone> = {
  "United States of America": "sales_ready",
  India: "sales_ready",
  "United Kingdom": "high_priority",
  Singapore: "high_priority",
  Israel: "warm",
  Germany: "warm",
  Canada: "monitor",
  Japan: "monitor",
  Brazil: "low_priority",
  Australia: "low_priority",
};

/* Real Company.country values are free-text (ZoomInfo/CSV import), while the
 * loaded map's country polygons are keyed by Natural Earth's ADMIN name -
 * these mostly agree case-insensitively ("Germany" == "germany"), but a
 * handful of real-world names genuinely differ from ADMIN's naming.
 * Confirmed against the actual countries-110m.json feature list - only maps
 * names that DON'T already match ADMIN case-insensitively. */
const COUNTRY_NAME_TO_ADMIN: Record<string, string> = {
  "united states": "United States of America",
  usa: "United States of America",
  "u.s.a.": "United States of America",
  "u.s.": "United States of America",
  uk: "United Kingdom",
  "u.k.": "United Kingdom",
  "czech republic": "Czechia",
  "republic of korea": "South Korea",
  "korea, republic of": "South Korea",
  "democratic people's republic of korea": "North Korea",
  burma: "Myanmar",
  "ivory coast": "Ivory Coast",
  "cote d'ivoire": "Ivory Coast",
  "congo (kinshasa)": "Democratic Republic of the Congo",
  "congo (brazzaville)": "Republic of the Congo",
  "dr congo": "Democratic Republic of the Congo",
  tanzania: "United Republic of Tanzania",
  "uae": "United Arab Emirates",
  "u.a.e.": "United Arab Emirates",
  holland: "Netherlands",
};

/* Centroid of one country's geometry - MultiPolygon countries (e.g. islands/
 * exclaves) use the ring with the most points as a proxy for the main
 * landmass, rather than averaging every ring (which would skew toward
 * far-flung small territories). Good enough for placing a single globe
 * marker/label point, not meant to be survey-accurate. */
function ringCentroid(ring: number[][]): { lat: number; lng: number } {
  let sumLng = 0;
  let sumLat = 0;
  for (const [lng, lat] of ring) {
    sumLng += lng;
    sumLat += lat;
  }
  return { lng: sumLng / ring.length, lat: sumLat / ring.length };
}

function featureCentroid(feature: Feature): { lat: number; lng: number } | null {
  const geom = feature.geometry;
  if (!geom) return null;
  if (geom.type === "Polygon") {
    const rings = geom.coordinates as number[][][];
    return ringCentroid(rings[0]);
  }
  const polygons = geom.coordinates as number[][][][];
  if (polygons.length === 0) return null;
  const largest = polygons.reduce((a, b) => (b[0].length > a[0].length ? b : a));
  return ringCentroid(largest[0]);
}

/* Built once the real map geometry loads (see `countries` state) - every
 * country the globe can actually draw becomes available for point
 * placement, instead of a fixed hand-picked subset that silently drops any
 * real Company.country not on the list. */
function buildCentroidLookup(countries: Feature[]): Record<string, { lat: number; lng: number; admin: string }> {
  const byAdmin: Record<string, { lat: number; lng: number; admin: string }> = {};
  for (const f of countries) {
    const admin = String(f.properties.ADMIN);
    const centroid = featureCentroid(f);
    if (centroid) {
      byAdmin[admin.toLowerCase()] = { ...centroid, admin };
    }
  }
  return byAdmin;
}

function lookupCentroid(
  countryName: string,
  byAdmin: Record<string, { lat: number; lng: number; admin: string }>,
): { lat: number; lng: number; admin: string } | undefined {
  const key = countryName.trim().toLowerCase();
  const alias = COUNTRY_NAME_TO_ADMIN[key];
  return byAdmin[alias ? alias.toLowerCase() : key];
}

/* Real avg LeadScore.lead_score per country -> globe points + polygon
 * shading, using the same 5 sales-status thresholds as evidence_scorer.py's
 * sales_status() / cfg.SALES_STATUS_BANDS - not the old 4-zone hot/warm/
 * emerging/monitor split. */
function zoneForScore(score: number): Zone {
  if (score >= 65) return "sales_ready";
  if (score >= 50) return "high_priority";
  if (score >= 35) return "warm";
  if (score >= 20) return "monitor";
  return "low_priority";
}

type CountryInfo = { country: string; companyCount: number; avgScore: number; maxScore: number };

function toRealPoints(
  byCountry: CountryLeadScore[],
  centroidByAdmin: Record<string, { lat: number; lng: number; admin: string }>,
): { points: LeadPoint[]; highlight: Record<string, Zone>; info: Record<string, CountryInfo> } {
  const known = byCountry
    .map((c) => ({ ...c, centroid: lookupCentroid(c.country, centroidByAdmin) }))
    .filter((c): c is CountryLeadScore & { centroid: NonNullable<typeof c.centroid> } => Boolean(c.centroid));

  // Zone comes from the country's BEST lead score, not its average: a
  // country with 475 companies averaging ~38 but holding 124 genuinely
  // Sales Ready / High Priority ones is a real opportunity, and averaging
  // buried exactly that. The average is still surfaced in the tooltip.
  const points = known.map((c) => ({
    lat: c.centroid.lat,
    lng: c.centroid.lng,
    zone: zoneForScore(c.max_lead_score),
    label: `${c.country} - best ${Math.round(c.max_lead_score)}, avg ${Math.round(c.avg_lead_score)} (${c.company_count})`,
  }));
  const highlight: Record<string, Zone> = {};
  const info: Record<string, CountryInfo> = {};
  for (const c of known) {
    highlight[c.centroid.admin] = zoneForScore(c.max_lead_score);
    info[c.centroid.admin] = {
      country: c.country,
      companyCount: c.company_count,
      avgScore: c.avg_lead_score,
      maxScore: c.max_lead_score,
    };
  }
  return { points, highlight, info };
}

/* Vivid outline palette for the glowing country borders (Paths-Layer look). */
const OUTLINE = ["#2563eb", "#3b82f6", "#6366f1", "#7c3aed", "#a855f7", "#ec4899", "#f43f5e", "#ef4444", "#8b5cf6"];

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export default function LeadGlobe({ countryData }: { countryData?: CountryLeadScore[] }) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 480, height: 480 });
  const [countries, setCountries] = useState<Feature[]>([]);

  // Depends on `countries` (the loaded map geometry) - real country data
  // can't be placed until the polygons it's centroid-derived from have
  // loaded, so real points/highlights are unavailable for one render pass
  // on first load (falls back to dummy briefly, then real once ready).
  const centroidByAdmin = useMemo(() => buildCentroidLookup(countries), [countries]);
  const real =
    countryData && countryData.length > 0 && countries.length > 0
      ? toRealPoints(countryData, centroidByAdmin)
      : null;
  const points = real ? real.points : dummyPoints;
  const HIGHLIGHT = real ? real.highlight : dummyHighlight;
  const INFO = real ? real.info : {};

  useEffect(() => {
    let active = true;
    fetch(countriesUrl)
      .then((r) => r.json())
      .then((data: { features: Feature[] }) => {
        if (active) {
          setCountries(data.features);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) {
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const controls = g.controls();
    controls.enableZoom = false;
    controls.enableRotate = true;
    controls.autoRotate = !reduce;
    controls.autoRotateSpeed = 0.55;
    g.pointOfView({ lat: 15, lng: 22, altitude: 2.35 }, 0);
    g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  }, [size.width]);

  return (
    <div
      className="absolute right-[-14%] top-1/2 aspect-square h-[135%] -translate-y-1/2"
      ref={wrapRef}
    >
      <Globe
        atmosphereAltitude={0.16}
        atmosphereColor="#3b82f6"
        backgroundColor="rgba(0,0,0,0)"
        bumpImageUrl={earthTopology}
        globeImageUrl={earthNight}
        height={size.height}
        pointAltitude={0.03}
        pointColor={(d: object) =>ZONE[(d as LeadPoint).zone]}
        pointLabel={(d: object) =>(d as LeadPoint).label}
        pointLat={(d: object) =>(d as LeadPoint).lat}
        pointLng={(d: object) =>(d as LeadPoint).lng}
        pointRadius={0.55}
        pointResolution={6}
        pointsData={points}
        polygonAltitude={(f: object) =>(HIGHLIGHT[String((f as Feature).properties.ADMIN)] ? 0.045 : 0.006)}
        polygonCapColor={(f: object) =>{
          const zone = HIGHLIGHT[String((f as Feature).properties.ADMIN)];
          return zone ? rgba(ZONE[zone], 0.85) : "rgba(255,255,255,0.03)";
        }}
        polygonLabel={(f: object) => {
          const admin = String((f as Feature).properties.ADMIN);
          const info = INFO[admin];
          if (info) {
            const companyWord = info.companyCount === 1 ? "company" : "companies";
            return `${info.country} - ${info.companyCount} ${companyWord} | best score ${Math.round(info.maxScore)}, avg ${Math.round(info.avgScore)}`;
          }
          return HIGHLIGHT[admin] ? admin : "";
        }}
        polygonSideColor={() => "rgba(0,0,0,0)"}
        polygonStrokeColor={(f: object) => {
          const admin = String((f as Feature).properties.ADMIN);
          const zone = HIGHLIGHT[admin];
          if (zone) {
            return ZONE[zone];
          }
          const idx = Number((f as Feature).properties.MAPCOLOR9) || 1;
          return rgba(OUTLINE[(idx - 1) % OUTLINE.length], 0.6);
        }}
        polygonsData={countries}
        ref={globeRef}
        width={size.width}
      />
    </div>
  );
}
