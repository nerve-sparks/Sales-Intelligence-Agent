import { useEffect, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import countriesUrl from "../../assets/globe/countries-110m.json?url";
import earthNight from "../../assets/globe/earth-night.jpg";
import earthTopology from "../../assets/globe/earth-topology.png";

/* Zone colors mirror the Lead Opportunity Map legend. */
const ZONE = {
  hot: "#ef4444",
  warm: "#f97316",
  emerging: "#3b82f6",
  monitor: "#94a3b8",
} as const;
type Zone = keyof typeof ZONE;

type LeadPoint = { lat: number; lng: number; zone: Zone; label: string };
type Feature = { properties: Record<string, string | number> };
export type CountryLeadScore = { country: string; avg_lead_score: number; company_count: number };

const dummyPoints: LeadPoint[] = [
  { lat: 37.77, lng: -122.42, zone: "hot", label: "San Francisco" },
  { lat: 40.71, lng: -74.0, zone: "hot", label: "New York" },
  { lat: 12.97, lng: 77.59, zone: "hot", label: "Bengaluru" },
  { lat: 19.08, lng: 72.88, zone: "warm", label: "Mumbai" },
  { lat: 51.51, lng: -0.13, zone: "warm", label: "London" },
  { lat: 1.35, lng: 103.82, zone: "warm", label: "Singapore" },
  { lat: 32.08, lng: 34.78, zone: "warm", label: "Tel Aviv" },
  { lat: 52.52, lng: 13.4, zone: "emerging", label: "Berlin" },
  { lat: 43.65, lng: -79.38, zone: "emerging", label: "Toronto" },
  { lat: 35.68, lng: 139.65, zone: "emerging", label: "Tokyo" },
  { lat: -23.55, lng: -46.63, zone: "monitor", label: "São Paulo" },
  { lat: -33.87, lng: 151.21, zone: "monitor", label: "Sydney" },
];

/* Countries to shade, keyed by Natural Earth `ADMIN` name. Fallback shown
 * until real per-country signal data loads (see toRealPoints below). */
const dummyHighlight: Record<string, Zone> = {
  "United States of America": "hot",
  India: "hot",
  "United Kingdom": "warm",
  Singapore: "warm",
  Israel: "warm",
  Germany: "emerging",
  Canada: "emerging",
  Japan: "emerging",
  Brazil: "monitor",
  Australia: "monitor",
};

/* Approximate geographic centroids for the country names that actually
 * appear in real Company.country data (same lowercase keys as
 * SignalAnalyticsPage's COUNTRY_ISO, which solved the same "real ZoomInfo
 * country name" problem for its 2D map) - country-level, not per-company,
 * since Company has no lat/lng column at all. */
const COUNTRY_CENTROID: Record<string, { lat: number; lng: number; admin: string }> = {
  "united states": { lat: 39.8, lng: -98.6, admin: "United States of America" },
  canada: { lat: 56.13, lng: -106.35, admin: "Canada" },
  "united kingdom": { lat: 55.38, lng: -3.44, admin: "United Kingdom" },
  india: { lat: 20.59, lng: 78.96, admin: "India" },
  australia: { lat: -25.27, lng: 133.78, admin: "Australia" },
  germany: { lat: 51.17, lng: 10.45, admin: "Germany" },
  israel: { lat: 31.05, lng: 34.85, admin: "Israel" },
  russia: { lat: 61.52, lng: 105.32, admin: "Russia" },
  belgium: { lat: 50.5, lng: 4.47, admin: "Belgium" },
  ireland: { lat: 53.41, lng: -8.24, admin: "Ireland" },
  denmark: { lat: 56.26, lng: 9.5, admin: "Denmark" },
  singapore: { lat: 1.35, lng: 103.82, admin: "Singapore" },
  sweden: { lat: 60.13, lng: 18.64, admin: "Sweden" },
  finland: { lat: 61.92, lng: 25.75, admin: "Finland" },
  france: { lat: 46.23, lng: 2.21, admin: "France" },
};

/* Real avg LeadScore.lead_score per country -> globe points + polygon
 * shading. 80/60 are the same real tier boundaries used everywhere else in
 * the app (company_directory.HIGH_SCORE/MEDIUM_SCORE, the Enterprise List
 * row badges) - 40 fills out the 4th zone the legend already has. */
function zoneForScore(score: number): Zone {
  if (score >= 80) return "hot";
  if (score >= 60) return "warm";
  if (score >= 40) return "emerging";
  return "monitor";
}

type CountryInfo = { country: string; companyCount: number; avgScore: number };

function toRealPoints(
  byCountry: CountryLeadScore[],
): { points: LeadPoint[]; highlight: Record<string, Zone>; info: Record<string, CountryInfo> } {
  const known = byCountry
    .map((c) => ({ ...c, centroid: COUNTRY_CENTROID[c.country.toLowerCase()] }))
    .filter((c): c is CountryLeadScore & { centroid: NonNullable<typeof c.centroid> } => Boolean(c.centroid));

  const points = known.map((c) => ({
    lat: c.centroid.lat,
    lng: c.centroid.lng,
    zone: zoneForScore(c.avg_lead_score),
    label: `${c.country} - Lead Score ${Math.round(c.avg_lead_score)} (${c.company_count})`,
  }));
  const highlight: Record<string, Zone> = {};
  const info: Record<string, CountryInfo> = {};
  for (const c of known) {
    highlight[c.centroid.admin] = zoneForScore(c.avg_lead_score);
    info[c.centroid.admin] = { country: c.country, companyCount: c.company_count, avgScore: c.avg_lead_score };
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

  const real = countryData && countryData.length > 0 ? toRealPoints(countryData) : null;
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
            return `${info.country} - ${info.companyCount} ${companyWord} (avg score ${Math.round(info.avgScore)})`;
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
