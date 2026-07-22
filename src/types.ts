export interface GasPrice {
  gasType: string;
  price: number | null;
  isAvailable: boolean;
}

export interface GasStation {
  name: string;
  brand: string;
  status: string;
  address: string;
  postalCode: string;
  region: string;
  lat: number;
  lng: number;
  priceRegulier: number | null;
  priceSuper: number | null;
  priceDiesel: number | null;
}
