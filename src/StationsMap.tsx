import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { GasStation } from "./types";
import { GeoCoords, LatLng } from "./geo";
import { loadGoogleMaps, hasGooglePlaces } from "./googlePlaces";

const COLORS = {
  route: "#2563EB",
  cheapest: "#16A34A",
  station: "#EA580C",
  user: "#2563EB",
};

// Top-down car silhouette (points "up" at rotation 0), used for the driver marker.
const CAR_PATH =
  "M0,-12 L4,-8 L4,-5 L7,-4 L7,-1.5 L4,-2.5 L4,8 Q4,12 0,12 Q-4,12 -4,8 L-4,-2.5 L-7,-1.5 L-7,-4 L-4,-5 L-4,-8 Z";

const MAP_ID: string | undefined = import.meta.env.VITE_GOOGLE_MAP_ID;
const VECTOR = Boolean(MAP_ID);
const NAV_ZOOM = 18;
const NAV_TILT = 55;

const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1f2937" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#374151" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#2b333f" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

const formatPrice = (value: number | null) =>
  value !== null ? `${value.toFixed(1)}¢` : "-";

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)
  );

function circleIcon(
  color: string,
  scale: number,
  strokeWeight: number
): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight,
  };
}

interface StationsMapProps {
  data: GasStation[];
  route?: LatLng[] | null;
  routeEnds?: { from: GeoCoords; to: GeoCoords } | null;
  userPosition?: LatLng | null;
  follow?: boolean;
  dark?: boolean;
  heading?: number;
  cameraTarget?: LatLng | null;
}

export interface StationsMapHandle {
  recenter: () => void;
}

const StationsMap = forwardRef<StationsMapHandle, StationsMapProps>(
  function StationsMap(
    {
      data,
      route,
      routeEnds,
      userPosition,
      follow = false,
      dark = false,
      heading = 0,
      cameraTarget = null,
    },
    ref
  ) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const endMarkersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const trafficRef = useRef<google.maps.TrafficLayer | null>(null);
  // While true the camera tracks the user; a user drag sets it false (paused),
  // and the recenter FAB sets it true again.
  const centeredRef = useRef(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      recenter() {
        const map = mapRef.current;
        if (!map || !userPosition) return;
        centeredRef.current = true;
        const target = follow ? cameraTarget ?? userPosition : userPosition;
        const center = { lat: target[0], lng: target[1] };
        if (VECTOR && follow) {
          map.moveCamera({ center, zoom: NAV_ZOOM, tilt: NAV_TILT, heading });
        } else {
          map.panTo(center);
          const minZoom = follow ? 16 : 15;
          const toZoom = follow ? 17 : 16;
          if ((map.getZoom() ?? 0) < minZoom) map.setZoom(toZoom);
        }
      },
    }),
    [userPosition, follow, cameraTarget, heading]
  );

  useEffect(() => {
    if (follow) centeredRef.current = true;
  }, [follow]);

  useEffect(() => {
    if (!hasGooglePlaces) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !divRef.current || mapRef.current) return;
        mapRef.current = new google.maps.Map(divRef.current, {
          center: { lat: 46.8, lng: -71.2 },
          zoom: 7,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          clickableIcons: false,
          ...(MAP_ID ? { mapId: MAP_ID } : {}),
        });
        infoRef.current = new google.maps.InfoWindow();
        // Always-on live traffic overlay (colored roads).
        trafficRef.current = new google.maps.TrafficLayer();
        trafficRef.current.setMap(mapRef.current);
        // A user drag pauses camera-follow so they can look around freely.
        mapRef.current.addListener("dragstart", () => {
          centeredRef.current = false;
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || VECTOR) return;
    mapRef.current.setOptions({ styles: dark ? DARK_STYLE : [] });
  }, [ready, dark]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const hasRoute = Boolean(route && route.length > 1);

    data.forEach((station, index) => {
      const cheapest = index === 0 && hasRoute;
      const marker = new google.maps.Marker({
        position: { lat: station.lat, lng: station.lng },
        map,
        icon: circleIcon(cheapest ? COLORS.cheapest : COLORS.station, cheapest ? 8 : 6, 1.5),
        zIndex: cheapest ? 100 : 10,
      });
      marker.addListener("click", () => {
        infoRef.current?.setContent(
          `<div style="font-family:'Fira Sans',sans-serif;font-size:13px;min-width:150px;color:#0f172a">
             <strong style="font-size:14px">${escapeHtml(station.name)}</strong><br/>
             ${escapeHtml(station.brand)} — ${escapeHtml(station.region)}<br/>
             ${escapeHtml(station.address)}<br/><br/>
             Régulier: ${formatPrice(station.priceRegulier)}<br/>
             Super: ${formatPrice(station.priceSuper)}<br/>
             Diesel: ${formatPrice(station.priceDiesel)}
           </div>`
        );
        infoRef.current?.open({ map, anchor: marker });
      });
      markersRef.current.push(marker);
    });
  }, [ready, data, route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
    if (route && route.length > 1) {
      const path = route.map(([lat, lng]) => ({ lat, lng }));
      polylineRef.current = new google.maps.Polyline({
        path,
        map,
        strokeColor: COLORS.route,
        strokeOpacity: 0.85,
        strokeWeight: 5,
      });
      if (!follow) {
        const bounds = new google.maps.LatLngBounds();
        path.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds, 48);
      }
    }
  }, [ready, route, follow]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    endMarkersRef.current.forEach((m) => m.setMap(null));
    endMarkersRef.current = [];
    if (routeEnds) {
      endMarkersRef.current.push(
        new google.maps.Marker({
          position: { lat: routeEnds.from.lat, lng: routeEnds.from.lng },
          map,
          icon: circleIcon(COLORS.cheapest, 7, 3),
          title: "Départ",
        }),
        new google.maps.Marker({
          position: { lat: routeEnds.to.lat, lng: routeEnds.to.lng },
          map,
          icon: circleIcon(COLORS.station, 7, 3),
          title: "Arrivée",
        })
      );
    }
  }, [ready, routeEnds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    if (userPosition) {
      const pos = { lat: userPosition[0], lng: userPosition[1] };
      const icon: google.maps.Symbol = follow
        ? {
            path: CAR_PATH,
            scale: 1.4,
            fillColor: COLORS.user,
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 1.5,
            rotation: VECTOR ? 0 : heading,
          }
        : circleIcon(COLORS.user, 9, 4);
      if (!userMarkerRef.current) {
        userMarkerRef.current = new google.maps.Marker({
          map,
          position: pos,
          icon,
          zIndex: 200,
        });
      } else {
        userMarkerRef.current.setPosition(pos);
        userMarkerRef.current.setIcon(icon);
      }
    } else if (userMarkerRef.current) {
      userMarkerRef.current.setMap(null);
      userMarkerRef.current = null;
    }

    if (follow && userPosition && centeredRef.current) {
      const t = cameraTarget ?? userPosition;
      const center = { lat: t[0], lng: t[1] };
      if (VECTOR) {
        map.moveCamera({ center, zoom: NAV_ZOOM, tilt: NAV_TILT, heading });
      } else {
        map.setCenter(center);
        if ((map.getZoom() ?? 0) < 16) map.setZoom(17);
      }
    }
  }, [ready, userPosition, follow, heading, cameraTarget]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || follow) return;
    if (VECTOR) {
      map.setTilt(0);
      map.setHeading(0);
    }
  }, [ready, follow]);

  if (failed) {
    return (
      <div className="map-fallback">
        Carte indisponible — une clé Google Maps est requise
        (<code>VITE_GOOGLE_MAPS_API_KEY</code>).
      </div>
    );
  }

  return <div ref={divRef} className="google-map" />;
  }
);

export default StationsMap;
