import {
  RouteStation,
  GasType,
  RouteResult,
  formatDistanceKm,
  formatDurationSec,
} from "./geo";
import { DETOUR, MEMBERSHIP_BRANDS, SortMode } from "./constants";
import BrandLogo from "./BrandLogo";

interface StationListProps {
  data: RouteStation[];
  gasType: GasType;
  route: RouteResult | null;
  sortMode: SortMode;
  nearby: boolean;
  selectedKey: string | null;
  onSelect: (station: RouteStation) => void;
}

const keyOf = (s: { lat: number; lng: number }): string => `${s.lat},${s.lng}`;

const formatPrice = (value: number | null) =>
  value !== null ? `${value.toFixed(1)}¢` : "-";

const formatMoney = (value: number): string => `${value.toFixed(2)} $`;

interface Detour {
  extraKm: number;
  extraMin: number;
  detourCost: number;
  effectiveTotal: number;
  effectivePerL: number;
}

const analyzeDetour = (priceCents: number, crossKm: number): Detour => {
  const pricePerL = priceCents / 100;
  const extraKm = DETOUR.roundTripFactor * crossKm;
  const extraMin = (extraKm / DETOUR.detourSpeedKmh) * 60;
  const detourFuelL = (extraKm * DETOUR.consumptionLPer100Km) / 100;
  const detourCost = detourFuelL * pricePerL;
  const fillCost = DETOUR.fillLiters * pricePerL;
  const effectiveTotal = fillCost + detourCost;
  const effectivePerL = (effectiveTotal / DETOUR.fillLiters) * 100;
  return { extraKm, extraMin, detourCost, effectiveTotal, effectivePerL };
};

interface Row {
  station: RouteStation;
  detour: Detour;
}

export default function StationList({
  data,
  gasType,
  route,
  sortMode,
  nearby,
  selectedKey,
  onSelect,
}: StationListProps) {
  if (data.length === 0) {
    return (
      <div className="empty-state">
        <strong>Aucune station sur ce trajet</strong>
        Élargissez la distance au trajet ou essayez un autre carburant.
      </div>
    );
  }

  const rows: Row[] = data.map((station) => ({
    station,
    detour: analyzeDetour(station[gasType] as number, station.distance),
  }));

  const bestPump = Math.min(...rows.map((r) => r.station[gasType] as number));
  const bestReal = rows.reduce((b, r) =>
    r.detour.effectiveTotal < b.detour.effectiveTotal ? r : b
  );

  const sorted = [...rows].sort((a, b) => {
    if (sortMode === "detour")
      return a.detour.effectiveTotal - b.detour.effectiveTotal;
    if (sortMode === "distance") return a.station.alongKm - b.station.alongKm;
    return (a.station[gasType] as number) - (b.station[gasType] as number);
  });

  const totalKm = route ? route.distanceMeters / 1000 : 0;
  const detourView = sortMode === "detour";

  return (
    <ul className="station-list">
      {sorted.map(({ station, detour }, index) => {
        const price = station[gasType] as number;
        const selected = keyOf(station) === selectedKey;
        const eta =
          route && totalKm > 0
            ? formatDurationSec(route.durationSeconds * (station.alongKm / totalKm))
            : null;

        const isBestReal = station === bestReal.station;
        const isTrap =
          detourView &&
          !isBestReal &&
          price <= (bestReal.station[gasType] as number) &&
          detour.effectiveTotal > bestReal.detour.effectiveTotal;
        const diffVsBest = detour.effectiveTotal - bestReal.detour.effectiveTotal;
        const isBestPump = !detourView && price === bestPump;

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
                <span className="station-title">
                  <strong>{station.brand || station.name}</strong>
                  {MEMBERSHIP_BRANDS.includes(
                    (station.brand || "").toLowerCase()
                  ) && <span className="member-badge">Membre</span>}
                </span>
                {station.address && (
                  <span className="station-address">{station.address}</span>
                )}
                <span className="station-eta">
                  {nearby
                    ? `📍 à ${formatDistanceKm(station.distance)} de vous`
                    : `🚗 ${formatDistanceKm(station.alongKm)}${
                        eta ? ` · ${eta}` : ""
                      }`}
                </span>
                {detourView ? (
                  <span className="station-detour">
                    🔀 +{detour.extraKm.toFixed(1)} km · +{Math.round(detour.extraMin)} min
                    {" · "}+{formatMoney(detour.detourCost)}
                  </span>
                ) : (
                  <>
                    {!nearby && (
                      <span className="station-sub">
                        ↪ {formatDistanceKm(station.distance)} de détour
                      </span>
                    )}
                    <span className="station-prices">
                      <span
                        className={
                          gasType === "priceRegulier" ? "pp pp--on" : "pp"
                        }
                      >
                        R {formatPrice(station.priceRegulier)}
                      </span>
                      <span
                        className={gasType === "priceSuper" ? "pp pp--on" : "pp"}
                      >
                        S {formatPrice(station.priceSuper)}
                      </span>
                      <span
                        className={gasType === "priceDiesel" ? "pp pp--on" : "pp"}
                      >
                        D {formatPrice(station.priceDiesel)}
                      </span>
                    </span>
                  </>
                )}
              </div>
              <div className="station-price">
                {detourView ? (
                  <>
                    <span className={isBestReal ? "price price--best" : "price"}>
                      {detour.effectivePerL.toFixed(1)}¢
                    </span>
                    {isBestReal && <span className="best-badge">Meilleur réel</span>}
                    {isTrap && <span className="warn-badge">Détour ✗</span>}
                    {!isBestReal && !isTrap && (
                      <span className="detour-diff">+{formatMoney(diffVsBest)}</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className={isBestPump ? "price price--best" : "price"}>
                      {formatPrice(price)}
                    </span>
                    {isBestPump && <span className="best-badge">Meilleur</span>}
                  </>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
