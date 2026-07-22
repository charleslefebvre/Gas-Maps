import { RouteStation, GasType, formatDistanceKm } from "./geo";
import BrandLogo from "./BrandLogo";

interface StationListProps {
  data: RouteStation[];
  gasType: GasType;
  selectedKey: string | null;
  onSelect: (station: RouteStation) => void;
}

const keyOf = (s: { lat: number; lng: number }): string => `${s.lat},${s.lng}`;

const formatPrice = (value: number | null) =>
  value !== null ? `${value.toFixed(1)}¢` : "-";

export default function StationList({
  data,
  gasType,
  selectedKey,
  onSelect,
}: StationListProps) {
  const best = data.length ? (data[0][gasType] as number) : null;

  if (data.length === 0) {
    return (
      <div className="empty-state">
        <strong>Aucune station sur ce trajet</strong>
        Élargissez la distance au trajet ou essayez un autre carburant.
      </div>
    );
  }

  return (
    <ul className="station-list">
      {data.map((station, index) => {
        const price = station[gasType];
        const isBest = price !== null && price === best;
        const selected = keyOf(station) === selectedKey;
        return (
          <li
            key={index}
            className={selected ? "station-card selected" : "station-card"}
          >
            <button
              type="button"
              className="station-card-btn"
              onClick={() => onSelect(station)}
              aria-pressed={selected}
            >
              <BrandLogo brand={station.brand} size={40} />
              <div className="station-info">
                <strong>{station.name}</strong>
                <span className="station-sub">
                  {station.brand} · à {formatDistanceKm(station.distance)} du trajet
                </span>
              </div>
              <div className="station-price">
                <span className={isBest ? "price price--best" : "price"}>
                  {formatPrice(price)}
                </span>
                {isBest && <span className="best-badge">Meilleur</span>}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
