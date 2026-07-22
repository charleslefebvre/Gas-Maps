import { useEffect, useState } from "react";
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

  useEffect(() => {
    let cancelled = false;
    geolocate()
      .then(async (coords) => {
        if (cancelled) return;
        setFrom(coords.displayName);
        setFromCoords(coords);
        try {
          const name = hasGooglePlaces
            ? await googleReverseGeocode(coords.lat, coords.lng)
            : await reverseGeocode(coords.lat, coords.lng);
          if (!cancelled) {
            setFrom(name);
            setFromCoords({ ...coords, displayName: name });
          }
        } catch {
          /* keep "Ma position" as the label */
        }
      })
      .catch(() => {
        /* permission denied / unavailable — leave the field empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!from.trim() || !to.trim()) return;
    onRoute(from.trim(), to.trim(), CORRIDOR_KM, DEFAULT_GAS_TYPE, fromCoords, toCoords);
  };

  return (
    <form className="route-search" onSubmit={handleSubmit}>
      <div className="route-fields">
        <AddressAutocomplete
          value={from}
          onChange={setFrom}
          onResolve={setFromCoords}
          placeholder="Départ"
          ariaLabel="Point de départ"
        />
        <AddressAutocomplete
          value={to}
          onChange={setTo}
          onResolve={setToCoords}
          placeholder="Arrivée"
          ariaLabel="Point d'arrivée"
        />
      </div>
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
    </form>
  );
}
