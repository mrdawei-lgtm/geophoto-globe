import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Billboard, Html, OrbitControls, PerspectiveCamera, Text } from "@react-three/drei";
import type { CSSProperties, MutableRefObject, ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { mesh } from "topojson-client";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { DeviceTier } from "../lib/device";
import type { PublicTheme } from "../lib/publicTheme";
import earthMapSvg from "../assets/globe/earth-map.svg?raw";
import countriesData from "world-atlas/countries-50m.json";
import landData from "world-atlas/land-50m.json";

type ClusterItem = {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  coverThumbnailUrl: string;
};

type PhotoItem = {
  id: string;
  latitude: number;
  longitude: number;
  thumbnailUrl: string;
  title: string;
};

export type GlobeSelectionSource = {
  thumbnailUrl: string;
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

type CityLabel = {
  name: string;
  latitude: number;
  longitude: number;
  minDistance: number;
};

type ThumbnailOverlayItem = {
  id: string;
  kind: "photo" | "overflow";
  anchorX: number;
  anchorY: number;
  thumbX: number;
  thumbY: number;
} & (
  | {
      kind: "photo";
      title: string;
      photoId: string;
      thumbnailUrl: string;
    }
  | {
      kind: "overflow";
      hiddenCount: number;
      representativeId: string;
    }
);

const CITY_LABELS: CityLabel[] = [
  { name: "Beijing", latitude: 39.9042, longitude: 116.4074, minDistance: 3.8 },
  { name: "Hong Kong", latitude: 22.3193, longitude: 114.1694, minDistance: 3.5 },
  { name: "Chengdu", latitude: 30.5728, longitude: 104.0668, minDistance: 3.5 },
  { name: "Lhasa", latitude: 29.652, longitude: 91.1721, minDistance: 3.3 },
  { name: "Kunming", latitude: 25.0389, longitude: 102.7183, minDistance: 3.3 },
  { name: "Tokyo", latitude: 35.6762, longitude: 139.6503, minDistance: 3.8 },
  { name: "Shanghai", latitude: 31.2304, longitude: 121.4737, minDistance: 3.4 },
  { name: "Singapore", latitude: 1.3521, longitude: 103.8198, minDistance: 3.2 },
  { name: "Kuala Lumpur", latitude: 3.139, longitude: 101.6869, minDistance: 3.2 },
  { name: "Sydney", latitude: -33.8688, longitude: 151.2093, minDistance: 3.2 },
  { name: "Melbourne", latitude: -37.8136, longitude: 144.9631, minDistance: 3.2 },
  { name: "Perth", latitude: -31.9523, longitude: 115.8613, minDistance: 3.15 },
  { name: "New York", latitude: 40.7128, longitude: -74.006, minDistance: 3.8 },
  { name: "Toronto", latitude: 43.6532, longitude: -79.3832, minDistance: 3.65 },
  { name: "San Francisco", latitude: 37.7749, longitude: -122.4194, minDistance: 3.5 },
  { name: "Los Angeles", latitude: 34.0522, longitude: -118.2437, minDistance: 3.3 },
  { name: "Mexico City", latitude: 19.4326, longitude: -99.1332, minDistance: 3.2 },
  { name: "Bogota", latitude: 4.711, longitude: -74.0721, minDistance: 3.2 },
  { name: "Lima", latitude: -12.0464, longitude: -77.0428, minDistance: 3.2 },
  { name: "Sao Paulo", latitude: -23.5505, longitude: -46.6333, minDistance: 3.35 },
  { name: "Buenos Aires", latitude: -34.6037, longitude: -58.3816, minDistance: 3.35 },
  { name: "Santiago", latitude: -33.4489, longitude: -70.6693, minDistance: 3.3 },
  { name: "Rio", latitude: -22.9068, longitude: -43.1729, minDistance: 3.2 },
  { name: "London", latitude: 51.5072, longitude: -0.1276, minDistance: 3.8 },
  { name: "Paris", latitude: 48.8566, longitude: 2.3522, minDistance: 3.8 },
  { name: "Marseille", latitude: 43.2965, longitude: 5.3698, minDistance: 3.5 },
  { name: "Frankfurt", latitude: 50.1109, longitude: 8.6821, minDistance: 3.5 },
  { name: "Stockholm", latitude: 59.3293, longitude: 18.0686, minDistance: 3.6 },
  { name: "Warsaw", latitude: 52.2297, longitude: 21.0122, minDistance: 3.45 },
  { name: "Moscow", latitude: 55.7558, longitude: 37.6173, minDistance: 3.6 },
  { name: "Rome", latitude: 41.9028, longitude: 12.4964, minDistance: 3.6 },
  { name: "Florence", latitude: 43.7696, longitude: 11.2558, minDistance: 3.55 },
  { name: "Lisbon", latitude: 38.7223, longitude: -9.1393, minDistance: 3.45 },
  { name: "Barcelona", latitude: 41.3874, longitude: 2.1686, minDistance: 3.5 },
  { name: "Cairo", latitude: 30.0444, longitude: 31.2357, minDistance: 3.2 },
  { name: "Istanbul", latitude: 41.0082, longitude: 28.9784, minDistance: 3.45 },
  { name: "Dubai", latitude: 25.2048, longitude: 55.2708, minDistance: 3.3 },
  { name: "Riyadh", latitude: 24.7136, longitude: 46.6753, minDistance: 3.25 },
  { name: "Lagos", latitude: 6.5244, longitude: 3.3792, minDistance: 3.2 },
  { name: "Nairobi", latitude: -1.2921, longitude: 36.8219, minDistance: 3.2 },
  { name: "Addis Ababa", latitude: 8.9806, longitude: 38.7578, minDistance: 3.2 },
  { name: "Casablanca", latitude: 33.5731, longitude: -7.5898, minDistance: 3.25 },
  { name: "Johannesburg", latitude: -26.2041, longitude: 28.0473, minDistance: 3.2 }
];

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const THUMBNAIL_SIZE = 54;
const THUMBNAIL_MIN_SPACING = THUMBNAIL_SIZE * 0.8;
const MAX_VISIBLE_THUMBNAILS_PER_COMPONENT = 12;
const FULL_THUMBNAIL_EXPANSION_DISTANCE = 1.48;
const MIN_CAMERA_DISTANCE = 1.33;
const MAX_CAMERA_DISTANCE = 9;
const ITEM_MODE_DISTANCE = 3.5;
const INITIAL_CAMERA_DISTANCE = 4.7;
const INITIAL_CENTER_LONGITUDE = 120;
const INITIAL_AZIMUTH = THREE.MathUtils.degToRad(INITIAL_CENTER_LONGITUDE + 90);
const CENTRAL_THUMBNAIL_RADIUS_RATIO = 0.8;
const FULL_THUMBNAIL_DISTANCE = 1.7;
const SOLAR_LIGHT_DISTANCE = 4.5;
const IDLE_PREVIEW_DELAY_MS = 5000;
const IDLE_PREVIEW_DURATION_MS = 5000;
const MAX_RECENT_IDLE_PREVIEW_IDS = 4;
const IDLE_PREVIEW_REGION_ORDER = [
  "north-america",
  "south-america",
  "europe",
  "africa",
  "west-asia",
  "east-asia",
  "oceania"
] as const;

type IdlePreviewRegion = typeof IDLE_PREVIEW_REGION_ORDER[number];

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function computeJulianDay(date: Date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function computeSolarDirection(date: Date) {
  const julianDay = computeJulianDay(date);
  const julianCenturies = (julianDay - 2451545.0) / 36525;
  const meanLongitude = normalizeDegrees(
    280.46646 + julianCenturies * (36000.76983 + julianCenturies * 0.0003032)
  );
  const meanAnomaly = normalizeDegrees(
    357.52911 + julianCenturies * (35999.05029 - 0.0001537 * julianCenturies)
  );
  const meanAnomalyRadians = THREE.MathUtils.degToRad(meanAnomaly);
  const equationOfCenter =
    Math.sin(meanAnomalyRadians) * (1.914602 - julianCenturies * (0.004817 + 0.000014 * julianCenturies)) +
    Math.sin(2 * meanAnomalyRadians) * (0.019993 - 0.000101 * julianCenturies) +
    Math.sin(3 * meanAnomalyRadians) * 0.000289;
  const apparentLongitude = meanLongitude + equationOfCenter - 0.00569;
  const omegaRadians = THREE.MathUtils.degToRad(125.04 - 1934.136 * julianCenturies);
  const lambdaRadians = THREE.MathUtils.degToRad(apparentLongitude - 0.00478 * Math.sin(omegaRadians));
  const obliquityRadians = THREE.MathUtils.degToRad(
    23.439291 - 0.0130042 * julianCenturies + 0.00256 * Math.cos(omegaRadians)
  );
  const rightAscensionRadians = Math.atan2(
    Math.cos(obliquityRadians) * Math.sin(lambdaRadians),
    Math.cos(lambdaRadians)
  );
  const declinationRadians = Math.asin(Math.sin(obliquityRadians) * Math.sin(lambdaRadians));
  const julianDayOffset = julianDay - 2451545.0;
  const greenwichMeanSiderealDegrees = normalizeDegrees(
    280.46061837 +
      360.98564736629 * julianDayOffset +
      0.000387933 * julianCenturies * julianCenturies -
      (julianCenturies * julianCenturies * julianCenturies) / 38710000
  );
  const subsolarLongitude = normalizeDegrees(
    THREE.MathUtils.radToDeg(rightAscensionRadians) - greenwichMeanSiderealDegrees + 180
  ) - 180;
  const subsolarLatitude = THREE.MathUtils.radToDeg(declinationRadians);

  return latLngToVector3(subsolarLatitude, subsolarLongitude, 1).normalize();
}

function buildEarthTextureUrl(theme: PublicTheme["globe"]) {
  const svg = earthMapSvg
    .replace('fill="#93a7af"', `fill="${theme.oceanColor}"`)
    .replace(/stroke="rgba\(255,255,255,0\.08\)"/g, `stroke="${theme.gridLineColor}"`)
    .replace('fill="#e1e8eb"', `fill="${theme.landColor}"`);

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function latLngToVector3(latitude: number, longitude: number, radius = 1.03) {
  const phi = (90 - latitude) * (Math.PI / 180);
  const theta = (longitude + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function tangentQuaternionAtPosition(position: THREE.Vector3) {
  const normal = position.clone().normalize();
  const tangentX = new THREE.Vector3().crossVectors(Y_AXIS, normal);
  if (tangentX.lengthSq() < 1e-6) {
    tangentX.crossVectors(X_AXIS, normal);
  }
  tangentX.normalize();
  const tangentY = new THREE.Vector3().crossVectors(normal, tangentX).normalize();
  const basis = new THREE.Matrix4().makeBasis(tangentX, tangentY, normal);
  return new THREE.Quaternion().setFromRotationMatrix(basis);
}

function buildLineSegmentPositions(lines: GeoJSON.MultiLineString, radius: number) {
  const positions: number[] = [];

  for (const line of lines.coordinates) {
    for (let index = 1; index < line.length; index += 1) {
      const [previousLongitude, previousLatitude] = line[index - 1];
      const [longitude, latitude] = line[index];
      const previousPoint = latLngToVector3(previousLatitude, previousLongitude, radius);
      const point = latLngToVector3(latitude, longitude, radius);
      positions.push(
        previousPoint.x,
        previousPoint.y,
        previousPoint.z,
        point.x,
        point.y,
        point.z
      );
    }
  }

  return positions;
}

function useEarthLineGeometries() {
  return useMemo(() => {
    const coastlineLines = mesh(landData as never, (landData.objects.land as never)) as GeoJSON.MultiLineString;
    const borderLines = mesh(
      countriesData as never,
      (countriesData.objects.countries as never),
      (left, right) => left !== right
    ) as GeoJSON.MultiLineString;

    return {
      coastlinePositions: buildLineSegmentPositions(coastlineLines, 1.0007),
      borderPositions: buildLineSegmentPositions(borderLines, 1.001)
    };
  }, []);
}

function EarthLineOverlay({
  positions,
  color,
  opacity,
  lineWidth,
  renderOrder
}: {
  positions: number[];
  color: string;
  opacity: number;
  lineWidth: number;
  renderOrder: number;
}) {
  const { size } = useThree();
  const line = useMemo(() => {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    const material = new LineMaterial({
      color,
      transparent: true,
      opacity,
      linewidth: lineWidth,
      depthTest: true,
      depthWrite: false,
      worldUnits: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4
    });
    const segments = new LineSegments2(geometry, material);
    segments.renderOrder = renderOrder;
    segments.frustumCulled = false;
    return segments;
  }, [color, lineWidth, opacity, positions, renderOrder]);

  useEffect(() => {
    const material = line.material as LineMaterial;
    material.resolution.set(size.width, size.height);
    material.needsUpdate = true;
  }, [line, size.height, size.width]);

  useEffect(
    () => () => {
      (line.geometry as LineSegmentsGeometry).dispose();
      (line.material as LineMaterial).dispose();
    },
    [line]
  );

  return <primitive object={line} />;
}

function dampAngle(current: number, target: number, lambda: number, delta: number) {
  const difference = THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return current + difference * (1 - Math.exp(-lambda * delta));
}

function projectToScreen(point: THREE.Vector3, camera: THREE.Camera, width: number, height: number) {
  const projected = point.clone().project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * width,
    y: (-projected.y * 0.5 + 0.5) * height,
    z: projected.z
  };
}

function projectEarthScreenCircle(camera: THREE.Camera, width: number, height: number) {
  const center = projectToScreen(new THREE.Vector3(0, 0, 0), camera, width, height);
  if (camera instanceof THREE.PerspectiveCamera) {
    const distance = camera.position.length();
    const focalLength = (height / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const radius = focalLength / Math.sqrt(Math.max(distance * distance - 1, 0.0001));
    return {
      centerX: center.x,
      centerY: center.y,
      radius
    };
  }

  const edge = projectToScreen(new THREE.Vector3(1, 0, 0), camera, width, height);
  return {
    centerX: center.x,
    centerY: center.y,
    radius: Math.abs(edge.x - center.x)
  };
}

function projectionRingScaleForCamera(camera: THREE.Camera) {
  if (camera instanceof THREE.PerspectiveCamera) {
    const distance = camera.position.length();
    return distance / Math.sqrt(Math.max(distance * distance - 1, 0.0001));
  }

  return 1;
}

function ProjectionRing({ theme, tier }: { theme: PublicTheme; tier: DeviceTier }) {
  const { camera } = useThree();
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const ring = ringRef.current;
    if (!ring) {
      return;
    }

    const scale = projectionRingScaleForCamera(camera);
    ring.scale.setScalar(scale);
  });

  if (theme.globe.projectionRingOpacity <= 0) {
    return null;
  }

  return (
    <Billboard follow>
      <mesh ref={ringRef} renderOrder={2}>
        <ringGeometry args={[0.996, tier === "mobile" ? 1.03 : 1.026, tier === "mobile" ? 96 : 144]} />
        <meshBasicMaterial
          color={theme.globe.projectionRingColor}
          transparent
          opacity={theme.globe.projectionRingOpacity}
          depthWrite={false}
          depthTest
        />
      </mesh>
    </Billboard>
  );
}

function isInsideCentralThumbnailArea(
  point: { x: number; y: number },
  earthCircle: { centerX: number; centerY: number; radius: number }
) {
  const centralRadius = earthCircle.radius * CENTRAL_THUMBNAIL_RADIUS_RATIO;
  return distance2d(point, { x: earthCircle.centerX, y: earthCircle.centerY }) <= centralRadius;
}

function clusterPhotoItems(items: PhotoItem[], tier: DeviceTier): ClusterItem[] {
  const step = tier === "mobile" ? 18 : tier === "low" ? 14 : 10;
  const groups = new Map<string, ClusterItem>();

  for (const item of items) {
    const key = `${Math.round(item.latitude / step)}:${Math.round(item.longitude / step)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.latitude = (existing.latitude + item.latitude) / 2;
      existing.longitude = (existing.longitude + item.longitude) / 2;
      continue;
    }

    groups.set(key, {
      id: key,
      latitude: item.latitude,
      longitude: item.longitude,
      count: 1,
      coverThumbnailUrl: item.thumbnailUrl
    });
  }

  return Array.from(groups.values());
}

function getIdlePreviewRegion(latitude: number, longitude: number): IdlePreviewRegion {
  if (longitude >= -170 && longitude < -20) {
    return latitude >= 12 ? "north-america" : "south-america";
  }
  if (longitude >= -20 && longitude < 30) {
    return latitude >= 18 ? "europe" : "africa";
  }
  if (longitude >= 30 && longitude < 85) {
    return latitude >= 10 ? "west-asia" : "africa";
  }
  if (longitude >= 85 && longitude < 150) {
    return latitude >= -5 ? "east-asia" : "oceania";
  }
  return "oceania";
}

function chooseIdlePreviewItem(
  visibleItems: ClusterItem[],
  recentIds: string[],
  regionCursor: number
) {
  const recentIdSet = new Set(recentIds);
  const itemsByRegion = new Map<IdlePreviewRegion, ClusterItem[]>();

  for (const item of visibleItems) {
    const region = getIdlePreviewRegion(item.latitude, item.longitude);
    const existing = itemsByRegion.get(region) ?? [];
    existing.push(item);
    itemsByRegion.set(region, existing);
  }

  for (let offset = 0; offset < IDLE_PREVIEW_REGION_ORDER.length; offset += 1) {
    const nextRegionIndex = (regionCursor + offset) % IDLE_PREVIEW_REGION_ORDER.length;
    const region = IDLE_PREVIEW_REGION_ORDER[nextRegionIndex];
    const regionItems = itemsByRegion.get(region) ?? [];
    if (!regionItems.length) {
      continue;
    }

    const freshItems = regionItems.filter((item) => !recentIdSet.has(item.id));
    const candidateItems = freshItems.length ? freshItems : regionItems;
    const nextItem = candidateItems[Math.floor(Math.random() * candidateItems.length)] ?? null;
    if (nextItem) {
      return {
        item: nextItem,
        nextRegionCursor: (nextRegionIndex + 1) % IDLE_PREVIEW_REGION_ORDER.length
      };
    }
  }

  const fallbackItems = visibleItems.filter((item) => !recentIdSet.has(item.id));
  const candidateItems = fallbackItems.length ? fallbackItems : visibleItems;
  const nextItem = candidateItems[Math.floor(Math.random() * candidateItems.length)] ?? null;
  return {
    item: nextItem,
    nextRegionCursor: regionCursor
  };
}

function buildRadialOffsets(count: number, spacing: number) {
  const offsets: Array<{ x: number; y: number }> = [];
  let ring = 0;
  while (offsets.length < count) {
    if (ring === 0) {
      offsets.push({ x: 0, y: 0 });
      ring += 1;
      continue;
    }
    const radius = ring * spacing;
    const slots = ring * 6;
    for (let index = 0; index < slots && offsets.length < count; index += 1) {
      const angle = (index / slots) * Math.PI * 2 - Math.PI / 2;
      offsets.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      });
    }
    ring += 1;
  }
  return offsets;
}

function distance2d(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function thumbnailExpansionProgress(cameraDistance: number) {
  return THREE.MathUtils.clamp(
    (FULL_THUMBNAIL_DISTANCE - cameraDistance) / (FULL_THUMBNAIL_DISTANCE - FULL_THUMBNAIL_EXPANSION_DISTANCE),
    0,
    1
  );
}

function resolveThumbnailLayout(
  items: Array<{ id: string; title: string; thumbnailUrl: string; anchorX: number; anchorY: number; baseX: number; baseY: number }>,
  spacing: number,
  maxVisibleThumbnails: number
) {
  const visited = new Set<number>();
  const components: number[][] = [];

  for (let index = 0; index < items.length; index += 1) {
    if (visited.has(index)) {
      continue;
    }
    const queue = [index];
    const component: number[] = [];
    visited.add(index);
    while (queue.length) {
      const current = queue.shift()!;
      component.push(current);
      for (let other = 0; other < items.length; other += 1) {
        if (visited.has(other)) {
          continue;
        }
        if (distance2d({ x: items[current].baseX, y: items[current].baseY }, { x: items[other].baseX, y: items[other].baseY }) < spacing) {
          visited.add(other);
          queue.push(other);
        }
      }
    }
    components.push(component);
  }

  return components.flatMap((component) => {
    if (component.length === 1) {
      const item = items[component[0]];
      return [
        {
          id: item.id,
          kind: "photo" as const,
          title: item.title,
          photoId: item.id,
          thumbnailUrl: item.thumbnailUrl,
          anchorX: item.anchorX,
          anchorY: item.anchorY,
          thumbX: item.baseX,
          thumbY: item.baseY
        }
      ];
    }

    const componentItems = component.map((index) => items[index]);
    const center = componentItems.reduce(
      (accumulator, item) => ({
        x: accumulator.x + item.baseX / componentItems.length,
        y: accumulator.y + item.baseY / componentItems.length
      }),
      { x: 0, y: 0 }
    );

    const sortedItems = componentItems
      .map((item) => ({
        item,
        angle: Math.atan2(item.baseY - center.y, item.baseX - center.x)
      }))
      .sort((left, right) => left.angle - right.angle)
      .map((entry) => entry.item);

    const visibleCount = Number.isFinite(maxVisibleThumbnails)
      ? Math.min(sortedItems.length, Math.max(1, Math.floor(maxVisibleThumbnails)))
      : sortedItems.length;
    const visibleItems = sortedItems.slice(0, visibleCount);
    const hiddenItems = sortedItems.slice(visibleCount);
    const layoutCount = visibleItems.length + (hiddenItems.length ? 1 : 0);
    const offsets = buildRadialOffsets(layoutCount, spacing);

    const positionedItems: ThumbnailOverlayItem[] = visibleItems.map((item, index) => ({
      id: item.id,
      kind: "photo",
      title: item.title,
      photoId: item.id,
      thumbnailUrl: item.thumbnailUrl,
      anchorX: item.anchorX,
      anchorY: item.anchorY,
      thumbX: center.x + offsets[index].x,
      thumbY: center.y + offsets[index].y
    }));

    if (hiddenItems.length) {
      const overflowOffset = offsets[visibleItems.length];
      positionedItems.push({
        id: `overflow-${component[0]}`,
        kind: "overflow",
        hiddenCount: hiddenItems.length,
        representativeId: hiddenItems[0].id,
        anchorX: center.x,
        anchorY: center.y,
        thumbX: center.x + overflowOffset.x,
        thumbY: center.y + overflowOffset.y
      });
    }

    return positionedItems;
  });
}

function GlobeMetricsReporter({
  onEarthPixelDiameterChange,
  onFramesPerSecondChange
}: {
  onEarthPixelDiameterChange?: (diameter: number) => void;
  onFramesPerSecondChange?: (fps: number) => void;
}) {
  const { camera, size } = useThree();
  const fpsAccumulatorRef = useRef({ frames: 0, elapsed: 0 });

  useFrame((_state, delta) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }
    const distance = camera.position.length();
    const focalLength = (size.height / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const diameter = (2 * focalLength) / distance;
    onEarthPixelDiameterChange?.(diameter);

    fpsAccumulatorRef.current.frames += 1;
    fpsAccumulatorRef.current.elapsed += delta;
    if (fpsAccumulatorRef.current.elapsed >= 0.5) {
      onFramesPerSecondChange?.(fpsAccumulatorRef.current.frames / fpsAccumulatorRef.current.elapsed);
      fpsAccumulatorRef.current.frames = 0;
      fpsAccumulatorRef.current.elapsed = 0;
    }
  });

  return null;
}

function GlobeShell({
  tier,
  theme,
  children
}: {
  tier: DeviceTier;
  theme: PublicTheme;
  children?: ReactNode;
}) {
  const textureUrl = useMemo(() => buildEarthTextureUrl(theme.globe), [theme.globe]);
  const texture = useLoader(THREE.TextureLoader, textureUrl);
  const { gl } = useThree();
  const { coastlinePositions, borderPositions } = useEarthLineGeometries();
  const isMobile = tier === "mobile";

  useEffect(() => {
    const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.max(1, Math.min(isMobile ? 8 : maxAnisotropy, maxAnisotropy));
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }, [gl, isMobile, texture]);

  return (
    <group>
      <mesh>
        <sphereGeometry args={[1, tier === "mobile" ? 48 : 80, tier === "mobile" ? 48 : 80]} />
        {theme.globe.useUnlitMaterial ? (
          <meshBasicMaterial
            map={texture}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        ) : (
          <meshStandardMaterial
            map={texture}
            roughness={0.98}
            metalness={0.02}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        )}
      </mesh>
      <EarthLineOverlay
        positions={coastlinePositions}
        color={theme.globe.coastlineColor}
        opacity={0.72}
        lineWidth={isMobile ? 1.3 : 1.65}
        renderOrder={10}
      />
      <EarthLineOverlay
        positions={borderPositions}
        color={theme.globe.borderColor}
        opacity={0.42}
        lineWidth={isMobile ? 0.95 : 1.15}
        renderOrder={11}
      />
      <mesh>
        <sphereGeometry args={[1.01, 64, 64]} />
        <meshBasicMaterial
          color={theme.globe.innerShellColor}
          side={THREE.BackSide}
          transparent
          opacity={theme.globe.innerShellOpacity}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.018, 40, 40]} />
        <meshBasicMaterial
          color={theme.globe.outerShellColor}
          transparent
          opacity={theme.globe.outerShellOpacity}
          depthWrite={false}
        />
      </mesh>
      {children}
    </group>
  );
}

function OrbitMotionController({
  controlsRef,
  cameraDistance,
  focus,
  motionEnabled,
  interactionActiveRef,
  resumeMotionAtRef
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>;
  cameraDistance: number;
  focus?: { latitude: number | null; longitude: number | null } | null;
  motionEnabled: boolean;
  interactionActiveRef: RefObject<boolean>;
  resumeMotionAtRef: RefObject<number>;
}) {
  const focusAzimuthRef = useRef<number | null>(null);

  useEffect(() => {
    if (!focus || focus.longitude === null) {
      focusAzimuthRef.current = null;
      return;
    }
    focusAzimuthRef.current = THREE.MathUtils.degToRad(focus.longitude + 90);
  }, [focus]);

  useFrame((_state, delta) => {
    const controls = controlsRef.current;
    if (!controls || !motionEnabled) {
      return;
    }
    if (interactionActiveRef.current) {
      return;
    }
    if (performance.now() < (resumeMotionAtRef.current ?? 0)) {
      return;
    }

    if (focusAzimuthRef.current !== null) {
      controls.setAzimuthalAngle(dampAngle(controls.getAzimuthalAngle(), focusAzimuthRef.current, 4.2, delta));
      return;
    }

    const zoomProgress = THREE.MathUtils.clamp(
      (MAX_CAMERA_DISTANCE - cameraDistance) / (MAX_CAMERA_DISTANCE - MIN_CAMERA_DISTANCE),
      0,
      1
    );
    const spinFactor = THREE.MathUtils.lerp(1.2, 0.08, zoomProgress);
    controls.setAzimuthalAngle(controls.getAzimuthalAngle() - delta * 0.08 * spinFactor);
  }, -2);

  return null;
}

function IdleClusterPreviewLayer({
  items,
  activeItemId,
  visibleItemIdsRef
}: {
  items: ClusterItem[];
  activeItemId: string | null;
  visibleItemIdsRef: MutableRefObject<string[]>;
}) {
  const { camera, size } = useThree();
  const [previewLayout, setPreviewLayout] = useState<{
    left: number;
    top: number;
    thumbnailUrl: string;
    visible: boolean;
  } | null>(null);

  useFrame(() => {
    const cameraDirection = camera.position.clone().normalize();
    const visibleItemIds = items.flatMap((item) => {
      const anchorWorld = latLngToVector3(item.latitude, item.longitude, 1.06);
      const isVisible = anchorWorld.clone().normalize().dot(cameraDirection) > 0.12;
      if (!isVisible) {
        return [];
      }

      const anchorScreen = projectToScreen(anchorWorld, camera, size.width, size.height);
      if (anchorScreen.z < -1 || anchorScreen.z > 1) {
        return [];
      }

      return [item.id];
    });

    visibleItemIdsRef.current = visibleItemIds;

    if (!activeItemId) {
      setPreviewLayout((current) => (current ? null : current));
      return;
    }

    const activeItem = items.find((item) => item.id === activeItemId);
    if (!activeItem) {
      setPreviewLayout((current) => (current ? null : current));
      return;
    }

    const anchorWorld = latLngToVector3(activeItem.latitude, activeItem.longitude, 1.08);
    const isVisible = anchorWorld.clone().normalize().dot(cameraDirection) > 0.12;
    if (!isVisible) {
      setPreviewLayout((current) => (current?.visible === false ? current : {
        left: current?.left ?? 0,
        top: current?.top ?? 0,
        thumbnailUrl: activeItem.coverThumbnailUrl,
        visible: false
      }));
      return;
    }

    const anchorScreen = projectToScreen(anchorWorld, camera, size.width, size.height);
    if (anchorScreen.z < -1 || anchorScreen.z > 1) {
      setPreviewLayout((current) => (current?.visible === false ? current : {
        left: current?.left ?? 0,
        top: current?.top ?? 0,
        thumbnailUrl: activeItem.coverThumbnailUrl,
        visible: false
      }));
      return;
    }

    setPreviewLayout((current) => {
      const nextLayout = {
        left: anchorScreen.x,
        top: anchorScreen.y,
        thumbnailUrl: activeItem.coverThumbnailUrl,
        visible: true
      };
      if (
        current &&
        current.visible &&
        current.thumbnailUrl === nextLayout.thumbnailUrl &&
        Math.abs(current.left - nextLayout.left) < 0.5 &&
        Math.abs(current.top - nextLayout.top) < 0.5
      ) {
        return current;
      }
      return nextLayout;
    });
  });

  if (!previewLayout || !activeItemId) {
    return null;
  }

  return (
    <Html fullscreen>
      <div className="globe-thumbnail-overlay globe-idle-preview-overlay" aria-hidden="true">
        <div
          className={`globe-idle-preview ${previewLayout.visible ? "visible" : "hidden"}`}
          style={{
            left: `${previewLayout.left}px`,
            top: `${previewLayout.top}px`
          }}
        >
          <img src={previewLayout.thumbnailUrl} alt="" draggable={false} />
        </div>
      </div>
    </Html>
  );
}

function ThumbnailOverlayLayer({
  items,
  cameraDistance,
  hoverEnabled,
  onSelect
}: {
  items: PhotoItem[];
  cameraDistance: number;
  hoverEnabled: boolean;
  onSelect: (id: string, source?: GlobeSelectionSource) => void;
}) {
  const { camera, size } = useThree();
  const [layout, setLayout] = useState<ThumbnailOverlayItem[]>([]);
  const expansionProgress = thumbnailExpansionProgress(cameraDistance);
  const thumbnailSize = THUMBNAIL_SIZE;
  const thumbnailSpacing = THREE.MathUtils.lerp(THUMBNAIL_MIN_SPACING, THUMBNAIL_SIZE + 18, expansionProgress);
  const maxVisibleThumbnails = cameraDistance <= FULL_THUMBNAIL_EXPANSION_DISTANCE
    ? Number.POSITIVE_INFINITY
    : MAX_VISIBLE_THUMBNAILS_PER_COMPONENT;

  useFrame(() => {
    const earthCircle = projectEarthScreenCircle(camera, size.width, size.height);
    const showAllVisibleThumbnails = cameraDistance <= FULL_THUMBNAIL_DISTANCE;
    const visibleItems = items.flatMap((item) => {
      const anchorWorld = latLngToVector3(item.latitude, item.longitude, 1.01);
      const thumbnailWorld = latLngToVector3(item.latitude, item.longitude, 1.08);
      const cameraDirection = camera.position.clone().normalize();
      const isVisible = anchorWorld.clone().normalize().dot(cameraDirection) > 0.12;
      if (!isVisible) {
        return [];
      }

      const anchorScreen = projectToScreen(anchorWorld, camera, size.width, size.height);
      const thumbnailScreen = projectToScreen(thumbnailWorld, camera, size.width, size.height);
      if (anchorScreen.z < -1 || anchorScreen.z > 1 || thumbnailScreen.z < -1 || thumbnailScreen.z > 1) {
        return [];
      }
      if (!showAllVisibleThumbnails && !isInsideCentralThumbnailArea(anchorScreen, earthCircle)) {
        return [];
      }

      return [
        {
          id: item.id,
          title: item.title,
          thumbnailUrl: item.thumbnailUrl,
          anchorX: anchorScreen.x,
          anchorY: anchorScreen.y,
          baseX: thumbnailScreen.x,
          baseY: thumbnailScreen.y
        }
      ];
    });

    setLayout(resolveThumbnailLayout(visibleItems, thumbnailSpacing, maxVisibleThumbnails));
  });

  return (
    <Html fullscreen>
      <div className="globe-thumbnail-overlay">
        <svg className="globe-thumbnail-lines" width="100%" height="100%" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
          {layout.map((item) => (
            <line
              key={`line-${item.id}`}
              x1={item.anchorX}
              y1={item.anchorY}
              x2={item.thumbX}
              y2={item.thumbY}
              stroke="var(--theme-thumbnail-line)"
              strokeWidth="1"
            />
          ))}
        </svg>
        {layout.map((item) => (
          item.kind === "photo" ? (
            <button
              key={item.id}
              type="button"
              className="globe-thumbnail-button"
              style={
                {
                  left: `${item.thumbX}px`,
                  top: `${item.thumbY}px`,
                  width: `${thumbnailSize}px`,
                  height: `${thumbnailSize}px`,
                  "--thumbnail-size": `${thumbnailSize}px`
                } as CSSProperties
              }
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onSelect(item.photoId, {
                  thumbnailUrl: item.thumbnailUrl,
                  rect: {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height
                  }
                });
              }}
              aria-label={item.title}
              data-hover-enabled={hoverEnabled ? "true" : "false"}
            >
              <img src={item.thumbnailUrl} alt={item.title} draggable={false} />
            </button>
          ) : (
            <button
              key={item.id}
              type="button"
              className="globe-thumbnail-button globe-thumbnail-overflow-button"
              style={
                {
                  left: `${item.thumbX}px`,
                  top: `${item.thumbY}px`,
                  width: `${thumbnailSize}px`,
                  height: `${thumbnailSize}px`,
                  "--thumbnail-size": `${thumbnailSize}px`
                } as CSSProperties
              }
              onClick={() => onSelect(item.representativeId)}
              aria-label={`Open one of ${item.hiddenCount} additional nearby photos`}
              data-hover-enabled={hoverEnabled ? "true" : "false"}
            >
              {`+${item.hiddenCount}`}
            </button>
          )
        ))}
      </div>
    </Html>
  );
}

function PeripheralClusterMarkers({
  items,
  cameraDistance,
  tier,
  theme
}: {
  items: PhotoItem[];
  cameraDistance: number;
  tier: DeviceTier;
  theme: PublicTheme;
}) {
  const { camera, size } = useThree();
  const [clusters, setClusters] = useState<ClusterItem[]>([]);

  useFrame(() => {
    if (cameraDistance <= FULL_THUMBNAIL_DISTANCE) {
      setClusters([]);
      return;
    }

    const earthCircle = projectEarthScreenCircle(camera, size.width, size.height);
    const peripheralItems = items.flatMap((item) => {
      const anchorWorld = latLngToVector3(item.latitude, item.longitude, 1.01);
      const cameraDirection = camera.position.clone().normalize();
      const isVisible = anchorWorld.clone().normalize().dot(cameraDirection) > 0.12;
      if (!isVisible) {
        return [];
      }

      const anchorScreen = projectToScreen(anchorWorld, camera, size.width, size.height);
      if (anchorScreen.z < -1 || anchorScreen.z > 1) {
        return [];
      }
      if (isInsideCentralThumbnailArea(anchorScreen, earthCircle)) {
        return [];
      }
      return [item];
    });

    setClusters(clusterPhotoItems(peripheralItems, tier));
  });

  return (
    <>
      {clusters.map((item) => (
        <ClusterMarker key={item.id} item={item} theme={theme} />
      ))}
    </>
  );
}

function ClusterCount({
  count,
  color,
  position
}: {
  count: number;
  color: string;
  position: [number, number, number];
}) {
  const safeCount = Number.isFinite(count) ? count : 0;

  return (
    <Billboard follow position={position}>
      <Text color={color} fontSize={0.0275} anchorX="center" anchorY="middle">
        {String(safeCount)}
      </Text>
    </Billboard>
  );
}

function lineGeometry(points: THREE.Vector3[]) {
  return new Float32Array(points.flatMap((point) => point.toArray()));
}

function ClusterMarker({ item, theme }: { item: ClusterItem; theme: PublicTheme }) {
  const anchor = useMemo(() => latLngToVector3(item.latitude, item.longitude, 1.01), [item.latitude, item.longitude]);
  const position = useMemo(() => latLngToVector3(item.latitude, item.longitude, 1.06), [item.latitude, item.longitude]);
  const countPosition = useMemo<[number, number, number]>(() => {
    const forward = position.clone().normalize().multiplyScalar(0.031);
    return [forward.x, forward.y, forward.z];
  }, [position]);
  const linePositions = useMemo(() => lineGeometry([anchor, position]), [anchor, position]);
  return (
    <>
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} count={2} />
        </bufferGeometry>
        <lineBasicMaterial color={theme.globe.borderColor} transparent opacity={0.75} />
      </line>
      <group position={position}>
        <mesh>
          <sphereGeometry args={[0.024, 12, 12]} />
          <meshStandardMaterial
            color={theme.globe.clusterColor}
            emissive={theme.globe.clusterEmissive}
            emissiveIntensity={0.35}
          />
        </mesh>
        <ClusterCount count={item.count} color={theme.globe.clusterTextColor} position={countPosition} />
      </group>
    </>
  );
}

function CityLabels({ cameraDistance, theme }: { cameraDistance: number; theme: PublicTheme }) {
  return (
    <>
      {CITY_LABELS.filter((city) => cameraDistance <= city.minDistance).map((city) => {
        const position = latLngToVector3(city.latitude, city.longitude, 1.018);
        const quaternion = tangentQuaternionAtPosition(position);
        return (
          <group key={city.name} position={position} quaternion={quaternion}>
            <Text
              color={theme.globe.cityLabelColor}
              outlineColor={theme.globe.cityLabelOutline}
              outlineWidth={0.0007}
              fontSize={0.012}
              anchorX="center"
              anchorY="middle"
              frustumCulled={false}
            >
              {city.name}
            </Text>
          </group>
        );
      })}
    </>
  );
}

export function GlobeScene({
  tier,
  theme,
  mode,
  items,
  focus,
  motionEnabled = true,
  onModeChange,
  onCameraDistanceChange,
  onEarthPixelDiameterChange,
  onFramesPerSecondChange,
  onSelect
}: {
  tier: DeviceTier;
  theme: PublicTheme;
  mode: "cluster" | "items";
  items: ClusterItem[] | PhotoItem[];
  focus?: { latitude: number | null; longitude: number | null } | null;
  motionEnabled?: boolean;
  onModeChange: (mode: "cluster" | "items") => void;
  onCameraDistanceChange?: (distance: number) => void;
  onEarthPixelDiameterChange?: (diameter: number) => void;
  onFramesPerSecondChange?: (fps: number) => void;
  onSelect: (id: string, source?: GlobeSelectionSource) => void;
}) {
  const hoverEnabled = tier !== "mobile";
  const initialDistance = INITIAL_CAMERA_DISTANCE;
  const initialCameraPosition = useMemo<[number, number, number]>(
    () => [
      Math.sin(INITIAL_AZIMUTH) * initialDistance,
      0,
      Math.cos(INITIAL_AZIMUTH) * initialDistance
    ],
    [initialDistance]
  );
  const [solarLightDirection] = useState(() => computeSolarDirection(new Date()));
  const [cameraDistance, setCameraDistance] = useState(initialDistance);
  const [interactionState, setInteractionState] = useState<"active" | "idle">("idle");
  const [nextIdlePreviewAt, setNextIdlePreviewAt] = useState(() => Date.now() + IDLE_PREVIEW_DELAY_MS);
  const [activeIdlePreviewId, setActiveIdlePreviewId] = useState<string | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const interactionActiveRef = useRef(false);
  const resumeMotionAtRef = useRef(0);
  const visibleClusterItemIdsRef = useRef<string[]>([]);
  const idlePreviewRecentIdsRef = useRef<string[]>([]);
  const idlePreviewRegionCursorRef = useRef(0);
  const ambientLightIntensity = theme.globe.useUnlitMaterial ? 1.35 : 0.58;
  const directionalLightIntensity = theme.globe.useUnlitMaterial ? 1.25 : 1.42;
  const directionalLightPosition = useMemo(
    () => solarLightDirection.clone().multiplyScalar(SOLAR_LIGHT_DISTANCE),
    [solarLightDirection]
  );
  const clusterItems = mode === "cluster" ? (items as ClusterItem[]) : [];
  const idlePreviewEnabled = mode === "cluster" && motionEnabled && clusterItems.length > 0;

  useEffect(() => {
    setCameraDistance(initialDistance);
  }, [initialDistance]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }
    controls.setAzimuthalAngle(INITIAL_AZIMUTH);
    controls.update();
  }, []);

  useEffect(() => {
    if (!idlePreviewEnabled) {
      setActiveIdlePreviewId(null);
      return;
    }

    if (interactionState === "active") {
      setActiveIdlePreviewId(null);
      return;
    }

    if (activeIdlePreviewId) {
      const hideTimer = window.setTimeout(() => {
        setActiveIdlePreviewId(null);
        setNextIdlePreviewAt(Date.now() + IDLE_PREVIEW_DELAY_MS);
      }, IDLE_PREVIEW_DURATION_MS);
      return () => window.clearTimeout(hideTimer);
    }

    const delay = Math.max(nextIdlePreviewAt - Date.now(), 0);
    const showTimer = window.setTimeout(() => {
      const visibleIds = visibleClusterItemIdsRef.current;
      if (!visibleIds.length) {
        setNextIdlePreviewAt(Date.now() + 1200);
        return;
      }
      const visibleIdSet = new Set(visibleIds);
      const visibleItems = clusterItems.filter((item) => visibleIdSet.has(item.id));
      const nextSelection = chooseIdlePreviewItem(
        visibleItems,
        idlePreviewRecentIdsRef.current,
        idlePreviewRegionCursorRef.current
      );
      if (nextSelection.item) {
        idlePreviewRegionCursorRef.current = nextSelection.nextRegionCursor;
        idlePreviewRecentIdsRef.current = [
          nextSelection.item.id,
          ...idlePreviewRecentIdsRef.current.filter((id) => id !== nextSelection.item.id)
        ].slice(0, MAX_RECENT_IDLE_PREVIEW_IDS);
        setActiveIdlePreviewId(nextSelection.item.id);
      }
    }, delay);
    return () => window.clearTimeout(showTimer);
  }, [activeIdlePreviewId, clusterItems, idlePreviewEnabled, interactionState, nextIdlePreviewAt]);

  function syncDistance(distance: number) {
    setCameraDistance(distance);
    const nextMode = distance <= ITEM_MODE_DISTANCE ? "items" : "cluster";
    if (nextMode !== mode) {
      onModeChange(nextMode);
    }
  }

  useEffect(() => {
    onCameraDistanceChange?.(cameraDistance);
  }, [cameraDistance, onCameraDistanceChange]);

  return (
    <Canvas dpr={tier === "desktop" ? [1, 2] : [1, 1.4]} gl={{ antialias: tier === "desktop", alpha: true }}>
      <ambientLight intensity={ambientLightIntensity} />
      <directionalLight
        position={directionalLightPosition.toArray()}
        intensity={directionalLightIntensity}
      />
      <PerspectiveCamera makeDefault position={initialCameraPosition} fov={45} />
      <GlobeMetricsReporter
        onEarthPixelDiameterChange={onEarthPixelDiameterChange}
        onFramesPerSecondChange={onFramesPerSecondChange}
      />
      <OrbitMotionController
        controlsRef={controlsRef}
        cameraDistance={cameraDistance}
        focus={focus}
        motionEnabled={motionEnabled}
        interactionActiveRef={interactionActiveRef}
        resumeMotionAtRef={resumeMotionAtRef}
      />
      <OrbitControls
        ref={controlsRef}
        key={`orbit-controls-${mode}`}
        enablePan={false}
        enableDamping
        dampingFactor={0.14}
        minDistance={MIN_CAMERA_DISTANCE}
        maxDistance={MAX_CAMERA_DISTANCE}
        minPolarAngle={THREE.MathUtils.degToRad(30)}
        maxPolarAngle={THREE.MathUtils.degToRad(150)}
        target={[0, 0, 0]}
        rotateSpeed={tier === "mobile" ? 0.65 : 0.9}
        zoomSpeed={tier === "mobile" ? 0.65 : 0.8}
        onStart={() => {
          interactionActiveRef.current = true;
          setInteractionState("active");
          setActiveIdlePreviewId(null);
        }}
        onEnd={() => {
          interactionActiveRef.current = false;
          resumeMotionAtRef.current = performance.now() + 420;
          setInteractionState("idle");
          setNextIdlePreviewAt(Date.now() + IDLE_PREVIEW_DELAY_MS);
        }}
        onChange={(event) => {
          if (!event) {
            return;
          }
          syncDistance(event.target.object.position.length());
        }}
      />
      {theme.globe.fogEnabled ? <fog attach="fog" args={[theme.globe.fogColor, 6.5, 11]} /> : null}
      <ProjectionRing theme={theme} tier={tier} />
      <GlobeShell
        tier={tier}
        theme={theme}
      >
        {mode === "cluster" ? (
          <IdleClusterPreviewLayer
            items={clusterItems}
            activeItemId={activeIdlePreviewId}
            visibleItemIdsRef={visibleClusterItemIdsRef}
          />
        ) : null}
        <CityLabels cameraDistance={cameraDistance} theme={theme} />
        {mode === "cluster"
          ? (items as ClusterItem[]).map((item) => <ClusterMarker key={item.id} item={item} theme={theme} />)
          : null}
        {mode === "items" ? (
          <PeripheralClusterMarkers
            items={items as PhotoItem[]}
            cameraDistance={cameraDistance}
            tier={tier}
            theme={theme}
          />
        ) : null}
      </GlobeShell>
      {mode === "items" ? (
        <ThumbnailOverlayLayer
          items={items as PhotoItem[]}
          cameraDistance={cameraDistance}
          hoverEnabled={hoverEnabled}
          onSelect={onSelect}
        />
      ) : null}
    </Canvas>
  );
}
