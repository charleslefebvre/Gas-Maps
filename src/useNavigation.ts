import { useCallback, useEffect, useRef, useState } from "react";
import {
  RouteResult,
  RouteStation,
  LatLng,
  GasType,
  GeoCoords,
  fetchRoute,
  filterAlongRoute,
  cumulativeKm,
  projectOnRoute,
  pointAtDistance,
  bearing,
  resolveHeading,
} from "./geo";
import { watchPosition, getCurrentPosition, LivePosition } from "./location";
import { GasStation } from "./types";

const OFF_ROUTE_KM = 0.08;
const OFF_ROUTE_HITS = 3;

export interface BestAhead {
  station: GasStation;
  distanceAheadKm: number;
  price: number;
}

export interface NavState {
  active: boolean;
  userPosition: LatLng | null;
  remainingKm: number;
  remainingSec: number;
  upcomingIndex: number;
  distanceToManeuverKm: number;
  offRoute: boolean;
  rerouting: boolean;
  bestAhead: BestAhead | null;
  route: RouteResult | null;
  stations: RouteStation[];
  heading: number;
  cameraTarget: LatLng | null;
  error: string | null;
}

interface UseNavigationArgs {
  route: RouteResult | null;
  stations: RouteStation[];
  allStations: GasStation[];
  corridorKm: number;
  gasType: GasType;
  destination: GeoCoords | null;
}

function stepStartKm(route: RouteResult): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (let i = 0; i < route.steps.length; i++) {
    starts[i] = acc;
    acc += route.steps[i].distanceMeters / 1000;
  }
  return starts;
}

export function useNavigation(args: UseNavigationArgs) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const [active, setActive] = useState(false);
  const [navRoute, setNavRoute] = useState<RouteResult | null>(null);
  const [navStations, setNavStations] = useState<RouteStation[]>([]);
  const [userPosition, setUserPosition] = useState<LatLng | null>(null);
  const [remainingKm, setRemainingKm] = useState(0);
  const [remainingSec, setRemainingSec] = useState(0);
  const [upcomingIndex, setUpcomingIndex] = useState(0);
  const [distanceToManeuverKm, setDistanceToManeuverKm] = useState(0);
  const [offRoute, setOffRoute] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [bestAhead, setBestAhead] = useState<BestAhead | null>(null);
  const [heading, setHeading] = useState(0);
  const [cameraTarget, setCameraTarget] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopWatch = useRef<(() => void) | null>(null);
  const navRouteRef = useRef<RouteResult | null>(null);
  const navStationsRef = useRef<RouteStation[]>([]);
  const cumRef = useRef<number[]>([]);
  const startKmRef = useRef<number[]>([]);
  const offHits = useRef(0);
  const reroutingRef = useRef(false);

  const applyRoute = useCallback((r: RouteResult, s: RouteStation[]) => {
    navRouteRef.current = r;
    navStationsRef.current = s;
    cumRef.current = cumulativeKm(r.geometry);
    startKmRef.current = stepStartKm(r);
    setNavRoute(r);
    setNavStations(s);
  }, []);

  const reroute = useCallback(
    async (lat: number, lng: number) => {
      const { destination, allStations, corridorKm, gasType } = argsRef.current;
      if (!destination || reroutingRef.current) return;
      reroutingRef.current = true;
      setRerouting(true);
      try {
        const from: GeoCoords = { lat, lng, displayName: "Ma position" };
        const r = await fetchRoute(from, destination);
        const s = filterAlongRoute(allStations, r.geometry, corridorKm, gasType);
        applyRoute(r, s);
        offHits.current = 0;
        setOffRoute(false);
      } catch {
        /* keep current route; retry on the next off-route reading */
      } finally {
        reroutingRef.current = false;
        setRerouting(false);
      }
    },
    [applyRoute]
  );

  const onPosition = useCallback(
    (pos: LivePosition) => {
      const lat = pos.lat;
      const lng = pos.lng;
      setUserPosition([lat, lng]);

      const route = navRouteRef.current;
      if (!route) return;

      const proj = projectOnRoute(route.geometry, cumRef.current, lat, lng);
      const totalKm = route.distanceMeters / 1000;
      const along = Math.min(proj.alongKm, totalKm);
      const remain = Math.max(0, totalKm - along);
      setRemainingKm(remain);
      setRemainingSec(totalKm > 0 ? route.durationSeconds * (remain / totalKm) : 0);

      const herePoint = pointAtDistance(route.geometry, cumRef.current, along);
      const aheadPoint = pointAtDistance(
        route.geometry,
        cumRef.current,
        Math.min(along + 0.05, totalKm)
      );
      const routeBearing = bearing(herePoint, aheadPoint);
      setHeading(resolveHeading(pos.heading, pos.speed, routeBearing));
      setCameraTarget(aheadPoint);

      const starts = startKmRef.current;
      let idx = 0;
      for (let i = 0; i < starts.length; i++) {
        if (starts[i] <= along) idx = i;
        else break;
      }
      const upcoming = Math.min(idx + 1, route.steps.length - 1);
      setUpcomingIndex(upcoming);
      setDistanceToManeuverKm(Math.max(0, (starts[upcoming] ?? totalKm) - along));

      const { gasType } = argsRef.current;
      const ahead = navStationsRef.current
        .filter((st) => st.alongKm >= along - 0.3 && st[gasType] !== null)
        .sort((a, b) => (a[gasType] as number) - (b[gasType] as number))[0];
      setBestAhead(
        ahead
          ? {
              station: ahead,
              distanceAheadKm: Math.max(0, ahead.alongKm - along),
              price: ahead[gasType] as number,
            }
          : null
      );

      if (proj.crossKm > OFF_ROUTE_KM) {
        offHits.current += 1;
        if (offHits.current >= OFF_ROUTE_HITS) {
          setOffRoute(true);
          reroute(lat, lng);
        }
      } else {
        offHits.current = 0;
        setOffRoute(false);
      }
    },
    [reroute]
  );

  const start = useCallback(() => {
    const { route, stations } = argsRef.current;
    if (!route) return;
    setError(null);
    applyRoute(route, stations);
    offHits.current = 0;
    setActive(true);
    // Snap the camera to the current position immediately (fast cached fix),
    // then let the live watch take over with high-accuracy updates.
    getCurrentPosition()
      .then(onPosition)
      .catch(() => {
        /* the watch below will provide the first fix */
      });
    stopWatch.current = watchPosition(onPosition, (err) =>
      setError(err instanceof Error ? err.message : "Signal GPS perdu…")
    );
  }, [applyRoute, onPosition]);

  const stop = useCallback(() => {
    if (stopWatch.current) {
      stopWatch.current();
      stopWatch.current = null;
    }
    setActive(false);
    setOffRoute(false);
    setRerouting(false);
    setBestAhead(null);
    setUserPosition(null);
    setCameraTarget(null);
  }, []);

  useEffect(
    () => () => {
      if (stopWatch.current) stopWatch.current();
    },
    []
  );

  const nav: NavState = {
    active,
    userPosition,
    remainingKm,
    remainingSec,
    upcomingIndex,
    distanceToManeuverKm,
    offRoute,
    rerouting,
    bestAhead,
    route: navRoute,
    stations: navStations,
    heading,
    cameraTarget,
    error,
  };

  return { nav, start, stop };
}
