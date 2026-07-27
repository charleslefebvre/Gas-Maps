import { GasType } from "./geo";

// Assumptions for the "is the detour worth it?" calculation.
export const DETOUR = {
  fillLiters: 50,
  consumptionLPer100Km: 9,
  // A station off the route costs roughly twice its perpendicular distance
  // (drive out and come back).
  roundTripFactor: 2,
  detourSpeedKmh: 40,
};

export const GAS_TYPES: { value: GasType; label: string }[] = [
  { value: "priceRegulier", label: "Régulier" },
  { value: "priceSuper", label: "Super" },
  { value: "priceDiesel", label: "Diesel" },
];

export type SortMode = "price" | "detour" | "distance";

export const SORT_MODES: { value: SortMode; label: string }[] = [
  { value: "price", label: "Prix" },
  { value: "detour", label: "Rentable" },
  { value: "distance", label: "Distance" },
];
