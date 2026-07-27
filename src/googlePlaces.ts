import { AddressSuggestion } from "./geo";

const API_KEY: string | undefined = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export const hasGooglePlaces: boolean = Boolean(API_KEY);

let loaderPromise: Promise<void> | null = null;
let sessionToken: google.maps.places.AutocompleteSessionToken | null = null;
let legacyAutocomplete: google.maps.places.AutocompleteService | null = null;
let legacyPlaces: google.maps.places.PlacesService | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<void>((resolve, reject) => {
    if (!API_KEY) {
      reject(new Error("Clé Google Maps absente."));
      return;
    }
    if (window.google?.maps?.places) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places,visualization&language=fr&region=CA`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Échec du chargement de Google Maps."));
    document.head.appendChild(script);
  });

  return loaderPromise;
}

export interface GoogleSuggestion extends AddressSuggestion {
  placeId: string;
}

function token(): google.maps.places.AutocompleteSessionToken {
  if (!sessionToken) {
    sessionToken = new google.maps.places.AutocompleteSessionToken();
  }
  return sessionToken;
}

// --- Places API (New): AutocompleteSuggestion ---

async function suggestNew(query: string): Promise<GoogleSuggestion[]> {
  const { suggestions } =
    await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
      sessionToken: token(),
      includedRegionCodes: ["ca"],
      language: "fr",
    });

  const out: GoogleSuggestion[] = [];
  for (const suggestion of suggestions) {
    const prediction = suggestion.placePrediction;
    if (prediction) {
      out.push({
        displayName: prediction.text.text,
        placeId: prediction.placeId,
        lat: 0,
        lng: 0,
      });
    }
  }
  return out;
}

// --- Legacy Places: AutocompleteService (fallback) ---

function suggestLegacy(query: string): Promise<GoogleSuggestion[]> {
  if (!legacyAutocomplete) {
    legacyAutocomplete = new google.maps.places.AutocompleteService();
  }
  return new Promise<GoogleSuggestion[]>((resolve) => {
    legacyAutocomplete!.getPlacePredictions(
      {
        input: query,
        sessionToken: token(),
        componentRestrictions: { country: "ca" },
      },
      (predictions, status) => {
        if (
          status !== google.maps.places.PlacesServiceStatus.OK ||
          !predictions
        ) {
          resolve([]);
          return;
        }
        resolve(
          predictions.map((p) => ({
            displayName: p.description,
            placeId: p.place_id,
            lat: 0,
            lng: 0,
          }))
        );
      }
    );
  });
}

export async function googleSuggest(query: string): Promise<GoogleSuggestion[]> {
  await loadGoogleMaps();
  try {
    const results = await suggestNew(query);
    if (results.length > 0) return results;
  } catch {
    /* Places API (New) not enabled — fall back to the legacy service */
  }
  return suggestLegacy(query);
}

// --- Resolve a prediction to coordinates ---

async function resolveNew(placeId: string): Promise<AddressSuggestion | null> {
  const place = new google.maps.places.Place({ id: placeId });
  await place.fetchFields({ fields: ["location", "formattedAddress"] });
  sessionToken = null;
  if (!place.location) return null;
  return {
    displayName: place.formattedAddress ?? "",
    lat: place.location.lat(),
    lng: place.location.lng(),
  };
}

function resolveLegacy(placeId: string): Promise<AddressSuggestion | null> {
  if (!legacyPlaces) {
    legacyPlaces = new google.maps.places.PlacesService(
      document.createElement("div")
    );
  }
  const activeToken = sessionToken ?? undefined;
  return new Promise<AddressSuggestion | null>((resolve) => {
    legacyPlaces!.getDetails(
      { placeId, fields: ["geometry", "formatted_address"], sessionToken: activeToken },
      (place, status) => {
        sessionToken = null;
        if (
          status !== google.maps.places.PlacesServiceStatus.OK ||
          !place?.geometry?.location
        ) {
          resolve(null);
          return;
        }
        resolve({
          displayName: place.formatted_address ?? "",
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });
      }
    );
  });
}

export async function googleResolvePlace(
  placeId: string
): Promise<AddressSuggestion | null> {
  await loadGoogleMaps();
  try {
    const resolved = await resolveNew(placeId);
    if (resolved) return resolved;
  } catch {
    /* fall back to legacy place details */
  }
  return resolveLegacy(placeId);
}

export async function googleReverseGeocode(
  lat: number,
  lng: number
): Promise<string> {
  await loadGoogleMaps();
  const geocoder = new google.maps.Geocoder();
  return new Promise<string>((resolve) => {
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
        resolve(results[0].formatted_address);
      } else {
        resolve("Ma position");
      }
    });
  });
}
