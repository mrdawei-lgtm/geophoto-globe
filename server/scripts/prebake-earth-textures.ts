import fs from "node:fs/promises";
import path from "node:path";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import countriesData from "world-atlas/countries-50m.json" with { type: "json" };
import landData from "world-atlas/land-50m.json" with { type: "json" };
import { appRoot } from "../config.js";

const WIDTH = 2048;
const HEIGHT = 1024;
const ASSET_DIR = path.join(appRoot, "src", "assets", "globe");

function buildGridLines(step: number) {
  const lines: string[] = [];
  for (let x = 0; x <= WIDTH; x += step) {
    lines.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${HEIGHT}" stroke="rgba(255,255,255,0.08)" stroke-width="0.8" />`
    );
  }
  for (let y = 0; y <= HEIGHT; y += step) {
    lines.push(
      `<line x1="0" y1="${y}" x2="${WIDTH}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-width="0.8" />`
    );
  }
  return lines.join("\n");
}

function buildTextureSvg() {
  const projection = geoEquirectangular()
    .scale(WIDTH / (2 * Math.PI))
    .translate([WIDTH / 2, HEIGHT / 2]);
  const pathBuilder = geoPath(projection);
  const landFeature = feature(landData as never, (landData.objects.land as never));
  const landPath = pathBuilder(landFeature) ?? "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="none">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#93a7af" />
  ${buildGridLines(112)}
  <path d="${landPath}" fill="#e1e8eb" />
</svg>
`;
}

function buildLineSvg() {
  const projection = geoEquirectangular()
    .scale(WIDTH / (2 * Math.PI))
    .translate([WIDTH / 2, HEIGHT / 2]);
  const pathBuilder = geoPath(projection);
  const coastlineFeature = mesh(landData as never, (landData.objects.land as never));
  const bordersFeature = mesh(
    countriesData as never,
    (countriesData.objects.countries as never),
    (left, right) => left !== right
  );
  const coastlinePath = pathBuilder(coastlineFeature) ?? "";
  const borderPath = pathBuilder(bordersFeature) ?? "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="none">
  <path d="${coastlinePath}" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
  <path d="${borderPath}" stroke="#d6e0e6" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" />
</svg>
`;
}

await fs.mkdir(ASSET_DIR, { recursive: true });
await fs.writeFile(path.join(ASSET_DIR, "earth-map.svg"), buildTextureSvg(), "utf8");
await fs.writeFile(path.join(ASSET_DIR, "earth-lines.svg"), buildLineSvg(), "utf8");

console.log("Earth textures prebaked");
console.log(`Output directory: ${ASSET_DIR}`);
