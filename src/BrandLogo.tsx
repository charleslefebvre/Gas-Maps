import { useState } from "react";

const BRAND_COLORS: Record<string, string> = {
  shell: "#FBCE07",
  esso: "#0033A0",
  costco: "#005DAA",
  "petro-canada": "#D8232A",
  "petro-t": "#0072CE",
  ultramar: "#00539B",
  irving: "#0B6B3A",
  "couche-tard": "#E4002B",
  chevron: "#1B4F9C",
  "canadian-tire": "#D6001C",
  harnois: "#E2001A",
  sonic: "#F58220",
  crevier: "#E2001A",
  olco: "#003DA5",
  pipeline: "#0072CE",
};

const DEFAULT_COLOR = "#64748B";

const slugify = (brand: string): string =>
  brand
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

const initials = (brand: string): string => {
  const words = brand.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

const textColorOn = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0f172a" : "#ffffff";
};

interface BrandLogoProps {
  brand: string | null;
  size?: number;
}

export default function BrandLogo({ brand, size = 28 }: BrandLogoProps) {
  const [failed, setFailed] = useState(false);
  const name = brand?.trim() || "Inconnu";
  const slug = slugify(name);
  const color = BRAND_COLORS[slug] ?? DEFAULT_COLOR;

  if (!failed) {
    return (
      <img
        className="brand-logo"
        src={`/logos/${slug}.png`}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="brand-avatar"
      title={name}
      aria-label={name}
      style={{
        width: size,
        height: size,
        background: color,
        color: textColorOn(color),
        fontSize: size * 0.4,
      }}
    >
      {initials(name)}
    </span>
  );
}
