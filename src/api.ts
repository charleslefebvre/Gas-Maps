import { GasStation } from "./types";

interface GeoJsonFeature {
  properties: {
    Name: string;
    brand: string;
    Status: string;
    Address: string;
    PostalCode: string;
    Region: string;
    Prices: Array<{
      GasType: string;
      Price: string | null;
      IsAvailable: boolean;
    }>;
  };
  geometry: {
    coordinates: [number, number];
  };
}

interface GeoJsonResponse {
  features: GeoJsonFeature[];
}

function parsePrice(priceStr: string | null): number | null {
  if (!priceStr) return null;
  const match = priceStr.match(/^([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

function findPrice(
  prices: GeoJsonFeature["properties"]["Prices"],
  gasType: string
): number | null {
  const entry = prices.find((p) => p.GasType === gasType);
  if (!entry || !entry.IsAvailable) return null;
  return parsePrice(entry.Price);
}

export async function fetchStations(): Promise<GasStation[]> {
  const response = await fetch(
    "https://regieessencequebec.ca/stations.geojson.gz"
  );
  const data: GeoJsonResponse = await response.json();

  return data.features.map((feature) => {
    const props = feature.properties;
    const [lng, lat] = feature.geometry.coordinates;
    return {
      name: props.Name,
      brand: props.brand,
      status: props.Status,
      address: props.Address,
      postalCode: props.PostalCode,
      region: props.Region,
      lat,
      lng,
      priceRegulier: findPrice(props.Prices, "Régulier"),
      priceSuper: findPrice(props.Prices, "Super"),
      priceDiesel: findPrice(props.Prices, "Diesel"),
    };
  });
}
