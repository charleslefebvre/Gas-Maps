import { useCallback, useEffect, useState } from "react";
import { GasType, GeoCoords, geolocate, reverseGeocode } from "./geo";
import { hasGooglePlaces, googleReverseGeocode } from "./googlePlaces";
import AddressAutocomplete from "./AddressAutocomplete";

interface SearchBarProps {
  onRoute: (
    from: string,
    to: string,
    corridorKm: number,
    gasType: GasType,
    fromCoords: GeoCoords | null,
    toCoords: GeoCoords | null
  ) => void;
  onClear: () => void;
  routing: boolean;
  showClear: boolean;
}

const CORRIDOR_KM = 2;
const DEFAULT_GAS_TYPE: GasType = "priceRegulier";

export default function SearchBar({
  onRoute,
  onClear,
  routing,
  showClear,
}: SearchBarProps) {
  const [from, setFrom] = useState("");
  const [fromCoords, setFromCoords] = useState<GeoCoords | null>(null);
  const [to, setTo] = useState("");
  const [toCoords, setToCoords] = useState<GeoCoords | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [home, setHome] = useState<GeoCoords | null>(() => {
    try {
      const raw = localStorage.getItem("home");
      return raw ? (JSON.parse(raw) as GeoCoords) : null;
    } catch {
      return null;
    }
  });

  const useHome = () => {
    if (!home) return;
    setTo(home.displayName);
    setToCoords(home);
    setNotice(null);
  };

  const saveHome = () => {
    if (!toCoords) return;
    setHome(toCoords);
    try {
      localStorage.setItem("home", JSON.stringify(toCoords));
    } catch {
      /* storage unavailable */
    }
    setNotice("Maison enregistrée ✓");
  };

  const fillFromCurrentLocation = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      setLocating(true);
      try {
        const coords = await geolocate();
        if (isCancelled()) return;
        setFrom(coords.displayName);
        setFromCoords(coords);
        setNotice(null);
        try {
          const name = hasGooglePlaces
            ? await googleReverseGeocode(coords.lat, coords.lng)
            : await reverseGeocode(coords.lat, coords.lng);
          if (isCancelled()) return;
          setFrom(name);
          setFromCoords({ ...coords, displayName: name });
        } catch {
          /* keep "Ma position" as the label */
        }
      } catch (err: unknown) {
        if (isCancelled()) return;
        setNotice(
          err instanceof Error
            ? err.message
            : "Localisation indisponible. Entrez une adresse de départ."
        );
      } finally {
        if (!isCancelled()) setLocating(false);
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    fillFromCurrentLocation(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fillFromCurrentLocation]);

  const handleFromChange = (value: string) => {
    setFrom(value);
    if (notice) setNotice(null);
  };

  const handleToChange = (value: string) => {
    setTo(value);
    if (notice) setNotice(null);
  };

  const swapEnds = () => {
    setFrom(to);
    setTo(from);
    setFromCoords(toCoords);
    setToCoords(fromCoords);
    if (notice) setNotice(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!from.trim() || !to.trim()) {
      setNotice("Entrez un point de départ et une arrivée.");
      return;
    }
    setNotice(null);
    onRoute(from.trim(), to.trim(), CORRIDOR_KM, DEFAULT_GAS_TYPE, fromCoords, toCoords);
  };

  return (
    <form className="route-search" onSubmit={handleSubmit}>
      <div className="route-fields">
        <div className="route-fields-main">
          <div className="route-field-row">
            <AddressAutocomplete
              value={from}
              onChange={handleFromChange}
              onResolve={setFromCoords}
              placeholder="Départ"
              ariaLabel="Point de départ"
            />
            <button
              type="button"
              className="loc-button"
              onClick={() => fillFromCurrentLocation()}
              disabled={locating}
              aria-label="Utiliser ma position actuelle"
              title="Ma position"
            >
              {locating ? "…" : "📍"}
            </button>
          </div>
          <div className="route-field-row">
            <AddressAutocomplete
              value={to}
              onChange={handleToChange}
              onResolve={setToCoords}
              placeholder="Arrivée"
              ariaLabel="Point d'arrivée"
            />
            {home && (
              <button
                type="button"
                className="loc-button"
                onClick={useHome}
                aria-label="Aller à la maison"
                title="Maison"
              >
                🏠
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          className="swap-button"
          onClick={swapEnds}
          aria-label="Inverser le départ et l'arrivée"
          title="Inverser"
        >
          ⇅
        </button>
      </div>
      {toCoords && (!home || home.displayName !== toCoords.displayName) && (
        <button type="button" className="home-save" onClick={saveHome}>
          🏠 Enregistrer comme maison
        </button>
      )}
      <div className="route-options">
        <button type="submit" className="search-button" disabled={routing}>
          {routing ? "Calcul…" : "Trouver"}
        </button>
        {showClear && (
          <button type="button" className="clear-button" onClick={onClear}>
            Effacer
          </button>
        )}
      </div>
      {notice && <p className="search-result-info">{notice}</p>}
    </form>
  );
}
