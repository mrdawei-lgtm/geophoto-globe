import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Billboard, Html, OrbitControls, PerspectiveCamera, Text } from "@react-three/drei";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { mesh } from "topojson-client";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { DeviceTier } from "../lib/device";
import earthMapUrl from "../assets/globe/earth-map.svg?url";
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

type CityLabel = {
  name: string;
  latitude: number;
  longitude: number;
  minDistance: number;
};

type ThumbnailOverlayItem = {
  id: string;
  title: string;
  thumbnailUrl: string;
  anchorX: number;
  anchorY: number;
  thumbX: number;
  thumbY: number;
};

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
const THUMBNAIL_SIZE = 58;
const THUMBNAIL_MIN_SPACING = THUMBNAIL_SIZE / 2;
const MIN_CAMERA_DISTANCE = 1.33;
const MAX_CAMERA_DISTANCE = 9;
const ITEM_MODE_DISTANCE = 3.5;
const INITIAL_CAMERA_DISTANCE = 4.7;
const CENTRAL_THUMBNAIL_RADIUS_RATIO = 0.8;
const FULL_THUMBNAIL_DISTANCE = 1.7;

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

function resolveThumbnailLayout(
  items: Array<{ id: string; title: string; thumbnailUrl: string; anchorX: number; anchorY: number; baseX: number; baseY: number }>,
  spacing: number
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
      return [{ ...item, thumbX: item.baseX, thumbY: item.baseY }];
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

    const offsets = buildRadialOffsets(component.length, spacing);
    return sortedItems.map((item, index) => ({
      ...item,
      thumbX: center.x + offsets[index].x,
      thumbY: center.y + offsets[index].y
    }));
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
  cameraDistance,
  rotationRef,
  focus,
  motionEnabled,
  children
}: {
  tier: DeviceTier;
  cameraDistance: number;
  rotationRef: React.MutableRefObject<number>;
  focus?: { latitude: number | null; longitude: number | null } | null;
  motionEnabled: boolean;
  children?: ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const texture = useLoader(THREE.TextureLoader, earthMapUrl);
  const { gl } = useThree();
  const focusRotationRef = useRef<number | null>(null);
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

  useEffect(() => {
    if (!focus || focus.longitude === null) {
      focusRotationRef.current = null;
      return;
    }
    focusRotationRef.current = THREE.MathUtils.degToRad(-(focus.longitude + 90));
  }, [focus]);

  useFrame((_state, delta) => {
    if (groupRef.current) {
      if (!motionEnabled) {
        rotationRef.current = groupRef.current.rotation.y;
        return;
      }
      if (focusRotationRef.current !== null) {
        groupRef.current.rotation.y = dampAngle(groupRef.current.rotation.y, focusRotationRef.current, 4.2, delta);
      } else {
        const zoomProgress = THREE.MathUtils.clamp(
          (MAX_CAMERA_DISTANCE - cameraDistance) / (MAX_CAMERA_DISTANCE - MIN_CAMERA_DISTANCE),
          0,
          1
        );
        const spinFactor = THREE.MathUtils.lerp(1, 0.08, zoomProgress);
        groupRef.current.rotation.y += delta * 0.05 * spinFactor;
      }
      rotationRef.current = groupRef.current.rotation.y;
    }
  });
  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[1, tier === "mobile" ? 48 : 80, tier === "mobile" ? 48 : 80]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.98}
          metalness={0.02}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      <EarthLineOverlay
        positions={coastlinePositions}
        color="#d7e1e6"
        opacity={0.72}
        lineWidth={isMobile ? 1.3 : 1.65}
        renderOrder={10}
      />
      <EarthLineOverlay
        positions={borderPositions}
        color="#b8c5cc"
        opacity={0.42}
        lineWidth={isMobile ? 0.95 : 1.15}
        renderOrder={11}
      />
      <mesh>
        <sphereGeometry args={[1.01, 64, 64]} />
        <meshBasicMaterial color="#1f2d35" side={THREE.BackSide} transparent opacity={0.18} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.018, 40, 40]} />
        <meshBasicMaterial color="#dbe6eb" transparent opacity={0.055} depthWrite={false} />
      </mesh>
      {children}
    </group>
  );
}

function ThumbnailOverlayLayer({
  items,
  cameraDistance,
  hoverEnabled,
  rotationRef,
  onSelect
}: {
  items: PhotoItem[];
  cameraDistance: number;
  hoverEnabled: boolean;
  rotationRef: React.MutableRefObject<number>;
  onSelect: (id: string) => void;
}) {
  const { camera, size } = useThree();
  const [layout, setLayout] = useState<ThumbnailOverlayItem[]>([]);

  useFrame(() => {
    const rotation = rotationRef.current;
    const earthCircle = projectEarthScreenCircle(camera, size.width, size.height);
    const showAllVisibleThumbnails = cameraDistance <= FULL_THUMBNAIL_DISTANCE;
    const visibleItems = items.flatMap((item) => {
      const anchorWorld = latLngToVector3(item.latitude, item.longitude, 1.01).applyAxisAngle(Y_AXIS, rotation);
      const thumbnailWorld = latLngToVector3(item.latitude, item.longitude, 1.08).applyAxisAngle(Y_AXIS, rotation);
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

    setLayout(resolveThumbnailLayout(visibleItems, THUMBNAIL_MIN_SPACING));
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
              stroke="rgba(220, 236, 245, 0.68)"
              strokeWidth="1"
            />
          ))}
        </svg>
        {layout.map((item) => (
          <button
            key={item.id}
            type="button"
            className="globe-thumbnail-button"
            style={{ left: `${item.thumbX}px`, top: `${item.thumbY}px` }}
            onClick={() => onSelect(item.id)}
            aria-label={item.title}
            data-hover-enabled={hoverEnabled ? "true" : "false"}
          >
            <img src={item.thumbnailUrl} alt={item.title} draggable={false} />
          </button>
        ))}
      </div>
    </Html>
  );
}

function PeripheralClusterMarkers({
  items,
  cameraDistance,
  tier,
  rotationRef
}: {
  items: PhotoItem[];
  cameraDistance: number;
  tier: DeviceTier;
  rotationRef: React.MutableRefObject<number>;
}) {
  const { camera, size } = useThree();
  const [clusters, setClusters] = useState<ClusterItem[]>([]);

  useFrame(() => {
    if (cameraDistance <= FULL_THUMBNAIL_DISTANCE) {
      setClusters([]);
      return;
    }

    const rotation = rotationRef.current;
    const earthCircle = projectEarthScreenCircle(camera, size.width, size.height);
    const peripheralItems = items.flatMap((item) => {
      const anchorWorld = latLngToVector3(item.latitude, item.longitude, 1.01).applyAxisAngle(Y_AXIS, rotation);
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
        <ClusterMarker key={item.id} item={item} />
      ))}
    </>
  );
}

function ClusterCount({ count, position }: { count: number; position: [number, number, number] }) {
  return (
    <Billboard follow position={position}>
      <Text color="white" fontSize={0.0275} anchorX="center" anchorY="middle">
        {String(count)}
      </Text>
    </Billboard>
  );
}

function lineGeometry(points: THREE.Vector3[]) {
  return new Float32Array(points.flatMap((point) => point.toArray()));
}

function ClusterMarker({ item }: { item: ClusterItem }) {
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
        <lineBasicMaterial color="#ffd8c8" transparent opacity={0.75} />
      </line>
      <group position={position}>
        <mesh>
          <sphereGeometry args={[0.024, 12, 12]} />
          <meshStandardMaterial color="#ff9360" emissive="#ff5f2e" emissiveIntensity={0.35} />
        </mesh>
        <ClusterCount count={item.count} position={countPosition} />
      </group>
    </>
  );
}

function CityLabels({ cameraDistance }: { cameraDistance: number }) {
  return (
    <>
      {CITY_LABELS.filter((city) => cameraDistance <= city.minDistance).map((city) => {
        const position = latLngToVector3(city.latitude, city.longitude, 1.018);
        const quaternion = tangentQuaternionAtPosition(position);
        return (
          <group key={city.name} position={position} quaternion={quaternion}>
            <Text
              color="#f4f8fb"
              outlineColor="rgba(82,92,100,0.52)"
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
  mode: "cluster" | "items";
  items: ClusterItem[] | PhotoItem[];
  focus?: { latitude: number | null; longitude: number | null } | null;
  motionEnabled?: boolean;
  onModeChange: (mode: "cluster" | "items") => void;
  onCameraDistanceChange?: (distance: number) => void;
  onEarthPixelDiameterChange?: (diameter: number) => void;
  onFramesPerSecondChange?: (fps: number) => void;
  onSelect: (id: string) => void;
}) {
  const hoverEnabled = tier !== "mobile";
  const initialDistance = INITIAL_CAMERA_DISTANCE;
  const [cameraDistance, setCameraDistance] = useState(initialDistance);
  const globeRotationRef = useRef(0);

  useEffect(() => {
    setCameraDistance(initialDistance);
  }, [initialDistance]);

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
      <ambientLight intensity={1.35} />
      <directionalLight position={[4, 2, 3]} intensity={1.25} />
      <PerspectiveCamera makeDefault position={[0, 0, initialDistance]} fov={45} />
      <GlobeMetricsReporter
        onEarthPixelDiameterChange={onEarthPixelDiameterChange}
        onFramesPerSecondChange={onFramesPerSecondChange}
      />
      <OrbitControls
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
        onChange={(event) => {
          if (!event) {
            return;
          }
          syncDistance(event.target.object.position.length());
        }}
      />
      <fog attach="fog" args={["#8f9398", 6.5, 11]} />
      <GlobeShell
        tier={tier}
        cameraDistance={cameraDistance}
        rotationRef={globeRotationRef}
        focus={focus}
        motionEnabled={motionEnabled}
      >
        <CityLabels cameraDistance={cameraDistance} />
        {mode === "cluster"
          ? (items as ClusterItem[]).map((item) => <ClusterMarker key={item.id} item={item} />)
          : null}
        {mode === "items" ? (
          <PeripheralClusterMarkers
            items={items as PhotoItem[]}
            cameraDistance={cameraDistance}
            tier={tier}
            rotationRef={globeRotationRef}
          />
        ) : null}
      </GlobeShell>
      {mode === "items" ? (
        <ThumbnailOverlayLayer
          items={items as PhotoItem[]}
          cameraDistance={cameraDistance}
          hoverEnabled={hoverEnabled}
          rotationRef={globeRotationRef}
          onSelect={onSelect}
        />
      ) : null}
    </Canvas>
  );
}
