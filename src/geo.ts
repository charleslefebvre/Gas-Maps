import { GasStation } from "./types";

export interface GeoCoords {
  lat: number;
  lng: number;
  displayName: string;
}

export type GasType = "priceRegulier" | "priceSuper" | "priceDiesel";

export interface StationWithDistance extends GasStation {
  distance: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface AddressSuggestion {
  displayName: string;
  lat: number;
  lng: number;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

export async function suggestAddresses(query: string): Promise<AddressSuggestion[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=ca&limit=10&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { "Accept-Language": "fr" },
  });
  const results: NominatimResult[] = await response.json();
  return results.map((r) => ({
    displayName: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
  }));
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=${lat}&lon=${lng}`;
  const response = await fetch(url, { headers: { "Accept-Language": "fr" } });
  const data: { display_name?: string } = await response.json();
  if (!data.display_name) return "Ma position";
  return data.display_name.split(",").slice(0, 3).join(",").trim();
}

export async function geocode(query: string): Promise<GeoCoords | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=ca&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "gas-quebec-app" },
  });
  const results = await response.json();
  if (results.length === 0) return null;
  return {
    lat: parseFloat(results[0].lat),
    lng: parseFloat(results[0].lon),
    displayName: results[0].display_name,
  };
}

export type LatLng = [number, number];

export interface RouteStep {
  instruction: string;
  name: string;
  distanceMeters: number;
  location: LatLng;
}

export interface RouteResult {
  geometry: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
}

export interface RouteStation extends StationWithDistance {
  alongKm: number;
}

interface OsrmManeuver {
  type: string;
  modifier?: string;
  location: [number, number];
  exit?: number;
}

interface OsrmStep {
  maneuver: OsrmManeuver;
  name: string;
  distance: number;
}

interface OsrmRoute {
  geometry: { coordinates: [number, number][] };
  distance: number;
  duration: number;
  legs: { steps: OsrmStep[] }[];
}

function buildInstruction(m: OsrmManeuver, name: string): string {
  const road = name ? ` sur ${name}` : "";
  const modifier = m.modifier ?? "";
  const towards = (base: string) => {
    if (modifier.includes("left")) return `${base} à gauche`;
    if (modifier.includes("right")) return `${base} à droite`;
    return base;
  };
  switch (m.type) {
    case "depart":
      return `Départ${road}`;
    case "arrive":
      return "Vous êtes arrivé à destination";
    case "turn":
      if (modifier === "straight") return `Continuez tout droit${road}`;
      if (modifier === "slight left") return `Légèrement à gauche${road}`;
      if (modifier === "slight right") return `Légèrement à droite${road}`;
      if (modifier === "sharp left") return `Virage serré à gauche${road}`;
      if (modifier === "sharp right") return `Virage serré à droite${road}`;
      return `${towards("Tournez")}${road}`;
    case "new name":
    case "continue":
      return `Continuez${road}`;
    case "merge":
      return `${towards("Rejoignez")}${road}`;
    case "on ramp":
      return `Prenez la bretelle d'accès${road}`;
    case "off ramp":
      return `Prenez la sortie${road}`;
    case "fork":
      return `${towards("Gardez")}${road}`;
    case "end of road":
      return `${towards("Au bout de la route, tournez")}${road}`;
    case "roundabout":
    case "rotary":
      return m.exit
        ? `Au rond-point, prenez la ${m.exit}e sortie${road}`
        : `Prenez le rond-point${road}`;
    default:
      return `Continuez${road}`;
  }
}

export async function fetchRoute(
  from: GeoCoords,
  to: GeoCoords
): Promise<RouteResult> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
  const response = await fetch(url);
  const data: { routes?: OsrmRoute[] } = await response.json();
  if (!data.routes || data.routes.length === 0) {
    throw new Error("Aucun itinéraire trouvé entre ces deux points.");
  }
  const route = data.routes[0];
  const geometry: LatLng[] = route.geometry.coordinates.map(
    ([lng, lat]) => [lat, lng] as LatLng
  );
  const steps: RouteStep[] = (route.legs[0]?.steps ?? []).map((s) => ({
    instruction: buildInstruction(s.maneuver, s.name),
    name: s.name,
    distanceMeters: s.distance,
    location: [s.maneuver.location[1], s.maneuver.location[0]] as LatLng,
  }));
  return {
    geometry,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    steps,
  };
}

export function cumulativeKm(route: LatLng[]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < route.length; i++) {
    cum[i] =
      cum[i - 1] +
      haversine(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1]);
  }
  return cum;
}

export function projectOnRoute(
  route: LatLng[],
  cum: number[],
  pLat: number,
  pLng: number
): { crossKm: number; alongKm: number } {
  const kx = 111.32 * Math.cos(toRad(pLat));
  const ky = 110.57;
  let crossKm = Infinity;
  let alongKm = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const ax = (route[i][1] - pLng) * kx;
    const ay = (route[i][0] - pLat) * ky;
    const bx = (route[i + 1][1] - pLng) * kx;
    const by = (route[i + 1][0] - pLat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : (-ax * dx - ay * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const cross = Math.sqrt(cx * cx + cy * cy);
    if (cross < crossKm) {
      crossKm = cross;
      alongKm = cum[i] + t * (cum[i + 1] - cum[i]);
    }
  }
  return { crossKm, alongKm };
}

export function bearing(a: LatLng, b: LatLng): number {
  const phi1 = toRad(a[0]);
  const phi2 = toRad(b[0]);
  const dLambda = toRad(b[1] - a[1]);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function pointAtDistance(
  route: LatLng[],
  cum: number[],
  km: number
): LatLng {
  if (route.length === 0) return [0, 0];
  if (route.length === 1) return route[0];
  const clamped = Math.max(0, Math.min(km, cum[cum.length - 1]));
  let i = 0;
  while (i < cum.length - 1 && cum[i + 1] < clamped) i++;
  const segLen = cum[i + 1] - cum[i] || 1;
  const t = (clamped - cum[i]) / segLen;
  const [aLat, aLng] = route[i];
  const [bLat, bLng] = route[i + 1];
  return [aLat + (bLat - aLat) * t, aLng + (bLng - aLng) * t];
}

export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function formatDurationSec(seconds: number): string {
  const total = Math.round(seconds / 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

export function filterAlongRoute(
  stations: GasStation[],
  route: LatLng[],
  corridorKm: number,
  gasType: GasType
): RouteStation[] {
  if (route.length < 2) return [];

  const cum = cumulativeKm(route);
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of route) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  const latPad = corridorKm / 110.57;
  const lngPad = corridorKm / (111.32 * Math.cos(toRad((minLat + maxLat) / 2)));

  return stations
    .filter(
      (s) =>
        s.lat >= minLat - latPad &&
        s.lat <= maxLat + latPad &&
        s.lng >= minLng - lngPad &&
        s.lng <= maxLng + lngPad &&
        s[gasType] !== null
    )
    .map((s) => {
      const { crossKm, alongKm } = projectOnRoute(route, cum, s.lat, s.lng);
      return { ...s, distance: crossKm, alongKm };
    })
    .filter((s) => s.distance <= corridorKm)
    .sort((a, b) => (a[gasType] as number) - (b[gasType] as number));
}

function geoErrorMessage(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED)
    return "Accès à la position refusé. Autorisez la localisation ou entrez une adresse.";
  if (err.code === err.POSITION_UNAVAILABLE)
    return "Position indisponible pour le moment.";
  return "La localisation a expiré. Réessayez.";
}

export function geolocate(): Promise<GeoCoords> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("La géolocalisation n'est pas supportée par ce navigateur."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          displayName: "Ma position",
        }),
      (err) => reject(new Error(geoErrorMessage(err))),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

export function filterByRadius(
  stations: GasStation[],
  center: GeoCoords,
  radiusKm: number,
  gasType: GasType
): StationWithDistance[] {
  return stations
    .map((station) => ({
      ...station,
      distance: haversine(center.lat, center.lng, station.lat, station.lng),
    }))
    .filter((s) => s.distance <= radiusKm && s[gasType] !== null)
    .sort((a, b) => (a[gasType] as number) - (b[gasType] as number));
}
