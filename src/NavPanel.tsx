import { formatDistanceKm, formatDurationSec } from "./geo";
import { NavState } from "./useNavigation";
import BrandLogo from "./BrandLogo";

const arrivalClock = (remainingSec: number): string => {
  const arrival = new Date(Date.now() + remainingSec * 1000);
  const hh = arrival.getHours().toString().padStart(2, "0");
  const mm = arrival.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
};

function ManeuverIcon({ instruction }: { instruction: string }) {
  const text = instruction.toLowerCase();
  let path = "M12 4v16M12 4l-5 5M12 4l5 5"; // straight ahead
  if (text.includes("arriv")) path = "M6 3v18M6 4h11l-2 3 2 3H6";
  else if (text.includes("rond-point")) path = "M12 3v5m0 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z";
  else if (text.includes("gauche")) path = "M20 18v-4a4 4 0 0 0-4-4H6M6 10l4-4M6 10l4 4";
  else if (text.includes("droite")) path = "M4 18v-4a4 4 0 0 1 4-4h10M18 10l-4-4M18 10l-4 4";
  else if (text.includes("sortie") || text.includes("bretelle"))
    path = "M6 3v8c0 4 3 6 7 6h5M18 17l-4-3M18 17l-4 3";
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface NavPanelProps {
  nav: NavState;
  onStop: () => void;
}

export default function NavPanel({ nav, onStop }: NavPanelProps) {
  const steps = nav.route?.steps ?? [];
  const upcoming = steps[nav.upcomingIndex];

  return (
    <div className="nav-panel">
      <div className="nav-maneuver">
        <span className="nav-icon">
          <ManeuverIcon instruction={upcoming?.instruction ?? ""} />
        </span>
        <div className="nav-maneuver-text">
          <div className="nav-distance">
            {formatDistanceKm(nav.distanceToManeuverKm)}
          </div>
          <div className="nav-instruction">
            {upcoming?.instruction ?? "Calcul de l'itinéraire…"}
          </div>
        </div>
        <button type="button" className="nav-stop" onClick={onStop}>
          Arrêter
        </button>
      </div>

      {nav.error && <div className="nav-alert nav-alert--warn">{nav.error}</div>}
      {nav.rerouting && (
        <div className="nav-alert">
          <span className="autocomplete-spinner" aria-hidden="true" />
          Recalcul de l'itinéraire…
        </div>
      )}
      {nav.offRoute && !nav.rerouting && (
        <div className="nav-alert nav-alert--warn">Hors trajet</div>
      )}

      {nav.bestAhead ? (
        <div className="nav-best">
          <BrandLogo brand={nav.bestAhead.station.brand} size={34} />
          <div className="nav-best-info">
            <strong>
              {nav.bestAhead.station.brand || nav.bestAhead.station.name}
            </strong>
            <span className="nav-best-sub">
              dans {formatDistanceKm(nav.bestAhead.distanceAheadKm)}
            </span>
          </div>
          <span className="nav-best-price">
            {nav.bestAhead.price.toFixed(1)}¢
          </span>
        </div>
      ) : (
        <div className="nav-best nav-best--empty">
          Aucune station devant sur le trajet
        </div>
      )}

      <div className="nav-footer">
        <span className="nav-footer-metric">
          {formatDistanceKm(nav.remainingKm)}
        </span>
        <span className="nav-footer-sep">·</span>
        <span className="nav-footer-metric">
          {formatDurationSec(nav.remainingSec)}
        </span>
        <span className="nav-footer-sep">·</span>
        <span className="nav-footer-metric">
          Arrivée {arrivalClock(nav.remainingSec)}
        </span>
      </div>
    </div>
  );
}
