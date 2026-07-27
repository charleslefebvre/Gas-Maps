import { useState, useEffect, useRef } from "react";
import { fetchStations } from "./api";
import { GasStation } from "./types";
import {
  geocode,
  fetchRoute,
  filterAlongRoute,
  filterByRadius,
  GasType,
  RouteStation,
  RouteResult,
  GeoCoords,
  LatLng,
} from "./geo";
import { watchPosition, getCurrentPosition } from "./location";
import {
  GAS_TYPES,
  SORT_MODES,
  SortMode,
  NEARBY_RADII_KM,
  DEFAULT_NEARBY_RADIUS_KM,
} from "./constants";
import { useNavigation } from "./useNavigation";
import SearchBar from "./SearchBar";
import StationList from "./StationList";
import StationsMap, { StationsMapHandle } from "./StationsMap";
import NavPanel from "./NavPanel";
import "./App.css";

type Theme = "light" | "dark";

const keyOf = (s: { lat: number; lng: number }): string => `${s.lat},${s.lng}`;

const getInitialTheme = (): Theme => {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

function App() {
  const [stations, setStations] = useState<GasStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routing, setRouting] = useState(false);
  const [filtered, setFiltered] = useState<RouteStation[] | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeEnds, setRouteEnds] = useState<{ from: GeoCoords; to: GeoCoords } | null>(null);
  const [routeCorridor, setRouteCorridor] = useState(2);
  const [resultInfo, setResultInfo] = useState<string | null>(null);
  const [gasType, setGasType] = useState<GasType>("priceRegulier");
  const [sortMode, setSortMode] = useState<SortMode>("price");
  const [mode, setMode] = useState<"route" | "nearby">("route");
  const [nearbyRadiusKm, setNearbyRadiusKm] = useState<number>(
    DEFAULT_NEARBY_RADIUS_KM
  );
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [stationRoute, setStationRoute] = useState<RouteResult | null>(null);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [livePosition, setLivePosition] = useState<LatLng | null>(null);
  const mapHandleRef = useRef<StationsMapHandle | null>(null);

  const selectedStation =
    selectedKey && filtered
      ? filtered.find((s) => keyOf(s) === selectedKey) ?? null
      : null;
  const usingStation = Boolean(selectedStation && stationRoute);
  const navRoute = usingStation ? stationRoute : routeResult;
  const navDestination: GeoCoords | null =
    usingStation && selectedStation
      ? {
          lat: selectedStation.lat,
          lng: selectedStation.lng,
          displayName: selectedStation.name,
        }
      : routeEnds?.to ?? null;

  const { nav, start: startNav, stop: stopNav } = useNavigation({
    route: navRoute,
    stations: filtered ?? [],
    allStations: stations,
    corridorKm: routeCorridor,
    gasType,
    destination: navDestination,
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    fetchStations()
      .then(setStations)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const stop = watchPosition(
      (pos) => setLivePosition([pos.lat, pos.lng]),
      () => {
        /* denied / unavailable — leave the idle map without a location dot */
      }
    );
    return stop;
  }, []);

  const resetResults = () => {
    stopNav();
    setFiltered(null);
    setRouteResult(null);
    setRouteEnds(null);
    setResultInfo(null);
    setSelectedKey(null);
    setStationRoute(null);
  };

  const handleSelectStation = async (station: RouteStation) => {
    const key = keyOf(station);
    if (key === selectedKey) {
      setSelectedKey(null);
      setStationRoute(null);
      return;
    }
    setSelectedKey(key);
    setStationRoute(null);

    let origin: GeoCoords | null = routeEnds?.from ?? null;
    const destination: GeoCoords = {
      lat: station.lat,
      lng: station.lng,
      displayName: station.name,
    };
    if (!origin) {
      // Near-me mode: no route yet — start from the current location.
      origin = livePosition
        ? { lat: livePosition[0], lng: livePosition[1], displayName: "Ma position" }
        : null;
      if (!origin) {
        try {
          const pos = await getCurrentPosition();
          origin = { lat: pos.lat, lng: pos.lng, displayName: "Ma position" };
        } catch {
          setResultInfo("Localisation requise pour y aller.");
          return;
        }
      }
      setRouteEnds({ from: origin, to: destination });
    }

    try {
      const line = await fetchRoute(origin, destination);
      setStationRoute(line);
    } catch {
      setStationRoute(null);
    }
  };

  const handleRoute = async (
    fromQuery: string,
    toQuery: string,
    corridorKm: number,
    type: GasType,
    fromResolved: GeoCoords | null,
    toResolved: GeoCoords | null
  ) => {
    setRouting(true);
    setGasType(type);
    try {
      const [from, to] = await Promise.all([
        fromResolved ?? geocode(fromQuery),
        toResolved ?? geocode(toQuery),
      ]);
      if (!from || !to) {
        setResultInfo(!from ? "Départ introuvable." : "Arrivée introuvable.");
        return;
      }
      const line = await fetchRoute(from, to);
      const results = filterAlongRoute(stations, line.geometry, corridorKm, type);
      setRouteResult(line);
      setRouteEnds({ from, to });
      setRouteCorridor(corridorKm);
      setFiltered(results);
      setSelectedKey(null);
      setStationRoute(null);
      setSheetExpanded(true);
      setResultInfo(
        `${results.length} station(s) à ≤ ${corridorKm} km du trajet`
      );
    } catch (err) {
      setResultInfo((err as Error).message);
    } finally {
      setRouting(false);
    }
  };

  const changeGasType = (type: GasType) => {
    setGasType(type);
    if (mode === "nearby") {
      runNearby(nearbyRadiusKm, type);
      return;
    }
    if (!routeResult) return;
    const results = filterAlongRoute(
      stations,
      routeResult.geometry,
      routeCorridor,
      type
    );
    setFiltered(results);
    setSelectedKey(null);
    setStationRoute(null);
  };

  const runNearby = async (radiusKm: number, type: GasType) => {
    setNearbyRadiusKm(radiusKm);
    let center: GeoCoords | null = livePosition
      ? { lat: livePosition[0], lng: livePosition[1], displayName: "Ma position" }
      : null;
    if (!center) {
      try {
        const pos = await getCurrentPosition();
        center = { lat: pos.lat, lng: pos.lng, displayName: "Ma position" };
      } catch {
        setResultInfo("Localisation requise pour chercher autour de vous.");
        return;
      }
    }
    const results: RouteStation[] = filterByRadius(
      stations,
      center,
      radiusKm,
      type
    ).map((s) => ({ ...s, alongKm: 0 }));
    setRouteResult(null);
    setRouteEnds(null);
    setRouteCorridor(radiusKm);
    setFiltered(results);
    setSelectedKey(null);
    setStationRoute(null);
    setSheetExpanded(true);
    setResultInfo(`${results.length} station(s) à ≤ ${radiusKm} km`);
    requestAnimationFrame(() => mapHandleRef.current?.recenter());
  };

  const enterNearbyMode = () => {
    setMode("nearby");
    runNearby(nearbyRadiusKm, gasType);
  };

  const enterRouteMode = () => {
    setMode("route");
    resetResults();
  };

  const themeToggle = (
    <button
      type="button"
      className="theme-toggle theme-toggle--float"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      aria-label={theme === "dark" ? "Passer au mode clair" : "Passer au mode sombre"}
      title={theme === "dark" ? "Mode clair" : "Mode sombre"}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );

  if (loading) {
    return (
      <div className="splash">
        <div className="splash-mark" aria-hidden="true" />
        <p>Chargement des stations…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="splash">
        <div className="error" role="alert">
          <p>Erreur&nbsp;: {error}</p>
        </div>
      </div>
    );
  }

  const mapData = nav.active ? nav.stations : filtered ?? [];
  const mapRoute = nav.active
    ? nav.remainingRoute ?? nav.route?.geometry ?? null
    : navRoute?.geometry ?? null;
  const mapEnds =
    usingStation && selectedStation && routeEnds
      ? {
          from: routeEnds.from,
          to: {
            lat: selectedStation.lat,
            lng: selectedStation.lng,
            displayName: selectedStation.name,
          },
        }
      : routeEnds;
  const canNavigate = navRoute !== null && !nav.active;

  return (
    <div className="map-app">
      <div className="map-full">
        <StationsMap
          ref={mapHandleRef}
          data={mapData}
          route={mapRoute}
          routeEnds={mapEnds}
          userPosition={nav.active ? nav.userPosition ?? livePosition : livePosition}
          follow={nav.active}
          dark={theme === "dark"}
          heading={nav.heading}
          cameraTarget={nav.cameraTarget}
          gasType={gasType}
        />
      </div>

      <div
        className={
          filtered !== null && !nav.active
            ? sheetExpanded
              ? "map-fabs map-fabs--sheet-open"
              : "map-fabs map-fabs--sheet"
            : "map-fabs"
        }
      >
        {(livePosition || nav.userPosition) && (
          <button
            type="button"
            className="map-fab"
            onClick={() => mapHandleRef.current?.recenter()}
            aria-label="Recentrer sur ma position"
            title="Ma position"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
            </svg>
          </button>
        )}
      </div>

      <div className={nav.active ? "map-top map-top--hidden" : "map-top"}>
            <div className="map-topbar">
              <span className="map-title">Essence Québec</span>
              {themeToggle}
            </div>
            <div className="search-card">
              <div className="seg mode-seg" role="group" aria-label="Mode de recherche">
                <button
                  type="button"
                  className={mode === "route" ? "seg-btn seg-btn--on" : "seg-btn"}
                  onClick={enterRouteMode}
                  aria-pressed={mode === "route"}
                >
                  Trajet
                </button>
                <button
                  type="button"
                  className={mode === "nearby" ? "seg-btn seg-btn--on" : "seg-btn"}
                  onClick={enterNearbyMode}
                  aria-pressed={mode === "nearby"}
                >
                  Autour de moi
                </button>
              </div>
              {mode === "route" ? (
                <SearchBar
                  onRoute={handleRoute}
                  onClear={resetResults}
                  routing={routing}
                  showClear={filtered !== null}
                />
              ) : (
                <div className="nearby-controls">
                  <span className="nearby-label">Rayon</span>
                  <div className="seg">
                    {NEARBY_RADII_KM.map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={
                          nearbyRadiusKm === r ? "seg-btn seg-btn--on" : "seg-btn"
                        }
                        onClick={() => runNearby(r, gasType)}
                        aria-pressed={nearbyRadiusKm === r}
                      >
                        {r} km
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {resultInfo && !filtered && (
                <p className="search-result-info">{resultInfo}</p>
              )}
            </div>
          </div>

          {filtered !== null && !nav.active && (
            <div className={sheetExpanded ? "sheet sheet--open" : "sheet"}>
              <button
                type="button"
                className="sheet-handle"
                onClick={() => setSheetExpanded((v) => !v)}
                aria-label={sheetExpanded ? "Réduire la liste" : "Voir la liste"}
                aria-expanded={sheetExpanded}
              >
                <span className="sheet-grip" />
              </button>
              <div className="sheet-summary">
                <button
                  type="button"
                  className="sheet-summary-text"
                  onClick={() => setSheetExpanded((v) => !v)}
                  aria-expanded={sheetExpanded}
                  aria-label={sheetExpanded ? "Réduire la liste" : "Voir la liste"}
                >
                  <strong>
                    {selectedStation
                      ? selectedStation.brand || selectedStation.name
                      : `${filtered.length} stations`}
                  </strong>
                  <span className="sheet-sub">
                    {selectedStation
                      ? "Touchez une autre station pour changer"
                      : "Touchez une station pour y aller"}
                  </span>
                </button>
                {canNavigate && filtered.length > 0 && (
                  <button type="button" className="start-nav" onClick={startNav}>
                    ▶ {selectedStation ? "Y aller" : "Démarrer"}
                  </button>
                )}
                <button
                  type="button"
                  className="sheet-close"
                  onClick={resetResults}
                  aria-label="Fermer et effacer la recherche"
                >
                  ✕
                </button>
              </div>
              {sheetExpanded && (
                <div className="sheet-body">
                  <div className="list-controls">
                    <div className="seg" role="group" aria-label="Type de carburant">
                      {GAS_TYPES.map((g) => (
                        <button
                          key={g.value}
                          type="button"
                          className={
                            gasType === g.value ? "seg-btn seg-btn--on" : "seg-btn"
                          }
                          onClick={() => changeGasType(g.value)}
                          aria-pressed={gasType === g.value}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                    <div className="seg" role="group" aria-label="Trier">
                      {SORT_MODES.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          className={
                            sortMode === s.value ? "seg-btn seg-btn--on" : "seg-btn"
                          }
                          onClick={() => setSortMode(s.value)}
                          aria-pressed={sortMode === s.value}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <StationList
                    data={filtered}
                    gasType={gasType}
                    route={routeResult}
                    sortMode={sortMode}
                    nearby={mode === "nearby"}
                    selectedKey={selectedKey}
                    onSelect={handleSelectStation}
                  />
                </div>
              )}
            </div>
          )}

      {nav.active && (
        <div className="nav-overlay">
          <NavPanel nav={nav} onStop={stopNav} />
        </div>
      )}

      {nav.active && (
        <div className="speed-badge" aria-label="Vitesse actuelle">
          <span className="speed-value">
            {nav.speedKmh != null ? Math.round(nav.speedKmh) : "--"}
          </span>
          <span className="speed-unit">km/h</span>
        </div>
      )}
    </div>
  );
}

export default App;
