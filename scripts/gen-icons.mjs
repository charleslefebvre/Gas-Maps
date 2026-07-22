import sharp from "sharp";
import { mkdirSync } from "fs";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#EA580C"/>
      <stop offset="1" stop-color="#F97316"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <path d="M256 104 C256 104 168 224 168 300 a88 88 0 1 0 176 0 C344 224 256 104 256 104 Z" fill="#ffffff"/>
  <circle cx="256" cy="316" r="34" fill="#2563EB"/>
</svg>`;

const buffer = Buffer.from(svg);

mkdirSync("assets", { recursive: true });

const outputs = [
  ["public/pwa-192.png", 192],
  ["public/pwa-512.png", 512],
  ["public/pwa-maskable-512.png", 512],
  ["public/apple-touch-icon.png", 180],
  ["assets/icon.png", 1024],
];

for (const [file, size] of outputs) {
  await sharp(buffer).resize(size, size).png().toFile(file);
  console.log("wrote", file);
}
