import { useState, useEffect } from "react";
import { fetchStations } from "./api";
import { GasStation } from "./types";
import {
  geocode,
  fetchRoute,
  filterAlongRoute,
  GasType,
  RouteStation,
  RouteResult,
  GeoCoords,
  LatLng,
} from "./geo";
import { watchPosition } from "./location";
import { useNavigation } from "./useNavigation";
import SearchBar from "./SearchBar";
import StationList from "./StationList";
import StationsMap from "./StationsMap";
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
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [stationRoute, setStationRoute] = useState<RouteResult | null>(null);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [livePosition, setLivePosition] = useState<LatLng | null>(null);

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
    const origin = routeEnds?.from;
    if (!origin) return;
    try {
      const line = await fetchRoute(origin, {
        lat: station.lat,
        lng: station.lng,
        displayName: station.name,
      });
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
    ? nav.route?.geometry ?? null
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
  const canNavigate = routeResult !== null && !nav.active;

  return (
    <div className="map-app">
      <div className="map-full">
        <StationsMap
          data={mapData}
          route={mapRoute}
          routeEnds={mapEnds}
          userPosition={nav.active ? nav.userPosition : livePosition}
          follow={nav.active}
          dark={theme === "dark"}
          heading={nav.heading}
          cameraTarget={nav.cameraTarget}
        />
      </div>

      {nav.active ? (
        <div className="nav-overlay">
          <NavPanel nav={nav} onStop={stopNav} />
        </div>
      ) : (
        <>
          <div className="map-top">
            <div className="map-topbar">
              <span className="map-title">Essence Québec</span>
              {themeToggle}
            </div>
            <div className="search-card">
              <SearchBar
                onRoute={handleRoute}
                onClear={resetResults}
                routing={routing}
                showClear={filtered !== null}
              />
              {resultInfo && !filtered && (
                <p className="search-result-info">{resultInfo}</p>
              )}
            </div>
          </div>

          {filtered !== null && (
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
                      ? selectedStation.name
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
                  <StationList
                    data={filtered}
                    gasType={gasType}
                    selectedKey={selectedKey}
                    onSelect={handleSelectStation}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
