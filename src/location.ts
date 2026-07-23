import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export interface LivePosition {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
}

const NATIVE: boolean = Capacitor.isNativePlatform();

// Départ default / one-shot lookup: prefer a fast, coarse, recently-cached fix so
// it doesn't time out on desktops without GPS.
const CURRENT_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 20000,
  maximumAge: 60000,
};

// Live tracking (idle dot + navigation): high accuracy, tolerant timeout.
const WATCH_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 5000,
};

interface RawCoords {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
}

function toLive(coords: RawCoords): LivePosition {
  return {
    lat: coords.latitude,
    lng: coords.longitude,
    heading: coords.heading ?? null,
    speed: coords.speed ?? null,
  };
}

function locationErrorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code: number = (err as GeolocationPositionError).code;
    if (code === 1)
      return "Accès à la position refusé. Autorisez la localisation ou entrez une adresse.";
    if (code === 2) return "Position indisponible pour le moment.";
    return "La localisation a expiré. Réessayez.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Localisation indisponible.";
}

export async function requestLocationPermission(): Promise<boolean> {
  if (!NATIVE) return true;
  try {
    const status = await Geolocation.requestPermissions();
    return status.location === "granted" || status.coarseLocation === "granted";
  } catch {
    return false;
  }
}

export async function getCurrentPosition(): Promise<LivePosition> {
  if (NATIVE) {
    const granted: boolean = await requestLocationPermission();
    if (!granted) {
      throw new Error(
        "Accès à la position refusé. Autorisez la localisation ou entrez une adresse."
      );
    }
    const pos = await Geolocation.getCurrentPosition(CURRENT_OPTIONS);
    return toLive(pos.coords);
  }

  return new Promise<LivePosition>((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("La géolocalisation n'est pas supportée par ce navigateur."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toLive(pos.coords)),
      (err) => reject(new Error(locationErrorMessage(err))),
      CURRENT_OPTIONS
    );
  });
}

export function watchPosition(
  onOk: (position: LivePosition) => void,
  onError: (err: unknown) => void
): () => void {
  if (NATIVE) {
    let watchId: string | null = null;
    let cancelled = false;

    requestLocationPermission().then((granted) => {
      if (cancelled) return;
      if (!granted) {
        onError(new Error("Localisation refusée."));
        return;
      }
      Geolocation.watchPosition(WATCH_OPTIONS, (pos, err) => {
        if (err) {
          onError(new Error(locationErrorMessage(err)));
          return;
        }
        if (pos) onOk(toLive(pos.coords));
      }).then((id) => {
        if (cancelled) {
          Geolocation.clearWatch({ id });
          return;
        }
        watchId = id;
      });
    });

    return () => {
      cancelled = true;
      if (watchId) Geolocation.clearWatch({ id: watchId });
    };
  }

  if (!("geolocation" in navigator)) {
    onError(new Error("La géolocalisation n'est pas supportée par ce navigateur."));
    return () => undefined;
  }
  const id: number = navigator.geolocation.watchPosition(
    (pos) => onOk(toLive(pos.coords)),
    (err) => onError(new Error(locationErrorMessage(err))),
    WATCH_OPTIONS
  );
  return () => navigator.geolocation.clearWatch(id);
}
