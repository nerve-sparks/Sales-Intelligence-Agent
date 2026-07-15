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

const points: LeadPoint[] = [
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

const hub = { lat: 37.77, lng: -122.42 };
const arcs = points
  .filter((p) => p.label !== "San Francisco")
  .slice(0, 7)
  .map((p) => ({
    startLat: hub.lat,
    startLng: hub.lng,
    endLat: p.lat,
    endLng: p.lng,
    color: ZONE[p.zone],
  }));

/* Countries to shade, keyed by Natural Earth `ADMIN` name. */
const HIGHLIGHT: Record<string, Zone> = {
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

/* Vivid outline palette for the glowing country borders (Paths-Layer look). */
const OUTLINE = ["#2563eb", "#3b82f6", "#6366f1", "#7c3aed", "#a855f7", "#ec4899", "#f43f5e", "#ef4444", "#8b5cf6"];

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export default function LeadGlobe() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 480, height: 480 });
  const [countries, setCountries] = useState<Feature[]>([]);

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
    controls.autoRotate = !reduce;
    controls.autoRotateSpeed = 0.55;
    g.pointOfView({ lat: 15, lng: 22, altitude: 2.35 }, 0);
    g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  }, [size.width]);

  return (
    <div
      className="pointer-events-none absolute right-[-14%] top-1/2 aspect-square h-[135%] -translate-y-1/2"
      ref={wrapRef}
    >
      <Globe
        arcAltitudeAutoScale={0.4}
        arcColor={(d: object) =>(d as { color: string }).color}
        arcDashAnimateTime={2200}
        arcDashGap={0.25}
        arcDashLength={0.4}
        arcStroke={0.5}
        arcsData={arcs}
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
        polygonAltitude={(f: object) =>(HIGHLIGHT[String((f as Feature).properties.ADMIN)] ? 0.02 : 0.006)}
        polygonCapColor={(f: object) =>{
          const zone = HIGHLIGHT[String((f as Feature).properties.ADMIN)];
          return zone ? rgba(ZONE[zone], 0.55) : "rgba(255,255,255,0.03)";
        }}
        polygonSideColor={() => "rgba(0,0,0,0)"}
        polygonStrokeColor={(f: object) => {
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
