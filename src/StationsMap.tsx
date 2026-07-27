import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { GasStation } from "./types";
import * as THREE from "three";
import { GeoCoords, GasType, LatLng } from "./geo";
import { loadGoogleMaps, hasGooglePlaces } from "./googlePlaces";

// A rounded price pill used as a station marker (shows ¢/L for the chosen fuel).
function pricePin(priceText: string, color: string): google.maps.Icon {
  const w = 20 + priceText.length * 8;
  const h = 24;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="${(h - 3) / 2}" ` +
    `fill="${color}" stroke="#ffffff" stroke-width="2"/>` +
    `<text x="${w / 2}" y="${h / 2 + 4}" font-family="'Fira Sans',Arial,sans-serif" ` +
    `font-size="12" font-weight="700" fill="#ffffff" text-anchor="middle">${priceText}</text>` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    anchor: new google.maps.Point(w / 2, h / 2),
    scaledSize: new google.maps.Size(w, h),
  };
}

// Low-poly car built from primitives (z-up, meters, pointing +y at heading 0).
function buildCar(): THREE.Group {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x6366f1,
    metalness: 0.4,
    roughness: 0.45,
  });
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    metalness: 0.3,
    roughness: 0.35,
  });
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.85,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 4.6, 1.1), bodyMat);
  body.position.z = 0.9;
  car.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.3, 0.85), cabinMat);
  cabin.position.set(0, -0.2, 1.65);
  car.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.45, 18);
  const wheels: [number, number][] = [
    [1.15, 1.5],
    [-1.15, 1.5],
    [1.15, -1.5],
    [-1.15, -1.5],
  ];
  for (const [x, y] of wheels) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, 0.5);
    car.add(wheel);
  }

  car.scale.set(1.4, 1.4, 1.4);
  return car;
}

const COLORS = {
  route: "#06B6D4",
  cheapest: "#10B981",
  station: "#64748B",
  user: "#6366F1",
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
  gasType?: GasType;
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
      gasType = "priceRegulier",
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
  const overlayRef = useRef<google.maps.WebGLOverlayView | null>(null);
  const threeRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    car: THREE.Group;
  } | null>(null);
  const carPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const carHeadingRef = useRef(0);
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

  // 3D car via WebGLOverlayView (vector map only).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !VECTOR) return;

    const overlay = new google.maps.WebGLOverlayView();
    overlayRef.current = overlay;

    overlay.onAdd = () => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.4));
      const dir = new THREE.DirectionalLight(0xffffff, 1.1);
      dir.position.set(0.4, -1, 1.2);
      scene.add(dir);
      const car = buildCar();
      car.visible = false;
      scene.add(car);
      threeRef.current = { scene, camera, renderer: null as never, car };
    };

    overlay.onContextRestored = ({ gl }) => {
      if (!threeRef.current) return;
      const renderer = new THREE.WebGLRenderer({
        canvas: gl.canvas as HTMLCanvasElement,
        context: gl,
        ...gl.getContextAttributes(),
      });
      renderer.autoClear = false;
      threeRef.current.renderer = renderer;
    };

    overlay.onDraw = ({ transformer }) => {
      const three = threeRef.current;
      const pos = carPosRef.current;
      if (!three || !three.renderer || !pos) return;
      const matrix = transformer.fromLatLngAltitude({
        lat: pos.lat,
        lng: pos.lng,
        altitude: 0,
      });
      three.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
      three.car.rotation.set(0, 0, (-carHeadingRef.current * Math.PI) / 180);
      three.renderer.render(three.scene, three.camera);
      three.renderer.resetState();
    };

    overlay.onContextLost = () => {
      threeRef.current?.renderer?.dispose();
    };

    overlay.setMap(map);

    return () => {
      overlay.setMap(null);
      threeRef.current?.renderer?.dispose();
      threeRef.current = null;
      overlayRef.current = null;
    };
  }, [ready]);

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

    data.forEach((station, index) => {
      const cheapest = index === 0;
      const price = station[gasType];
      const icon =
        price != null
          ? pricePin(
              (price as number).toFixed(1),
              cheapest ? COLORS.cheapest : COLORS.station
            )
          : circleIcon(COLORS.station, 6, 1.5);
      const marker = new google.maps.Marker({
        position: { lat: station.lat, lng: station.lng },
        map,
        icon,
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
  }, [ready, data, gasType]);

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

    // On the vector map while navigating, the 3D car replaces the 2D marker.
    const use3dCar = Boolean(follow && VECTOR && userPosition);
    if (userPosition) {
      carPosRef.current = { lat: userPosition[0], lng: userPosition[1] };
      carHeadingRef.current = heading;
    }
    if (threeRef.current) threeRef.current.car.visible = use3dCar;
    overlayRef.current?.requestRedraw();

    if (userPosition && !use3dCar) {
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
