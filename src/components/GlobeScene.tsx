import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Html, OrbitControls, PerspectiveCamera, Text } from "@react-three/drei";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import countriesData from "world-atlas/countries-110m.json";
import landData from "world-atlas/land-110m.json";
import type { DeviceTier } from "../lib/device";

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
  { name: "Tokyo", latitude: 35.6762, longitude: 139.6503, minDistance: 3.8 },
  { name: "Shanghai", latitude: 31.2304, longitude: 121.4737, minDistance: 3.4 },
  { name: "Singapore", latitude: 1.3521, longitude: 103.8198, minDistance: 3.2 },
  { name: "Sydney", latitude: -33.8688, longitude: 151.2093, minDistance: 3.2 },
  { name: "New York", latitude: 40.7128, longitude: -74.006, minDistance: 3.8 },
  { name: "Los Angeles", latitude: 34.0522, longitude: -118.2437, minDistance: 3.3 },
  { name: "Mexico City", latitude: 19.4326, longitude: -99.1332, minDistance: 3.2 },
  { name: "Rio", latitude: -22.9068, longitude: -43.1729, minDistance: 3.2 },
  { name: "London", latitude: 51.5072, longitude: -0.1276, minDistance: 3.8 },
  { name: "Paris", latitude: 48.8566, longitude: 2.3522, minDistance: 3.8 },
  { name: "Rome", latitude: 41.9028, longitude: 12.4964, minDistance: 3.6 },
  { name: "Cairo", latitude: 30.0444, longitude: 31.2357, minDistance: 3.2 },
  { name: "Johannesburg", latitude: -26.2041, longitude: 28.0473, minDistance: 3.2 }
];

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const THUMBNAIL_SIZE = 58;
const THUMBNAIL_MIN_SPACING = THUMBNAIL_SIZE / 2;

function latLngToVector3(latitude: number, longitude: number, radius = 1.03) {
  const phi = (90 - latitude) * (Math.PI / 180);
  const theta = (longitude + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
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

function makeEarthTextures(tier: DeviceTier) {
  const isMobile = tier === "mobile";
  const size = isMobile ? 1024 : 2048;
  const landSource = landData;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#9badb4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = isMobile ? 0.75 : 0.95;
  const gridStep = isMobile ? 80 : 112;
  for (let x = 0; x <= canvas.width; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  const landFeature = feature(landSource as never, (landSource.objects.land as never));
  const bordersFeature = mesh(
    countriesData as never,
    (countriesData.objects.countries as never),
    (a, b) => a !== b
  );
  const projection = geoEquirectangular()
    .scale(canvas.width / (2 * Math.PI))
    .translate([canvas.width / 2, canvas.height / 2]);
  const drawLand = geoPath(projection, ctx);
  const drawBorders = geoPath(projection, ctx);

  ctx.fillStyle = "#d7e0e3";
  ctx.beginPath();
  drawLand(landFeature);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = isMobile ? 0.65 : 0.8;
  ctx.beginPath();
  drawLand(landFeature);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = isMobile ? 0.28 : 0.36;
  ctx.beginPath();
  drawBorders(bordersFeature);
  ctx.stroke();

  ctx.strokeStyle = "rgba(88, 104, 112, 0.38)";
  ctx.lineWidth = isMobile ? 0.22 : 0.3;
  ctx.beginPath();
  drawLand(landFeature);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = isMobile ? 4 : 8;

  const heightCanvas = document.createElement("canvas");
  heightCanvas.width = size;
  heightCanvas.height = size / 2;
  const hctx = heightCanvas.getContext("2d")!;
  hctx.fillStyle = "#1a1a1a";
  hctx.fillRect(0, 0, heightCanvas.width, heightCanvas.height);
  const heightProjection = geoEquirectangular()
    .scale(heightCanvas.width / (2 * Math.PI))
    .translate([heightCanvas.width / 2, heightCanvas.height / 2]);
  const drawHeightLand = geoPath(heightProjection, hctx);
  hctx.fillStyle = "#737373";
  hctx.beginPath();
  drawHeightLand(landFeature);
  hctx.fill();
  const heightMap = new THREE.CanvasTexture(heightCanvas);
  heightMap.anisotropy = isMobile ? 4 : 8;
  return { texture, heightMap };
}

function GlobeShell({
  tier,
  cameraDistance,
  rotationRef,
  focus,
  children
}: {
  tier: DeviceTier;
  cameraDistance: number;
  rotationRef: React.MutableRefObject<number>;
  focus?: { latitude: number | null; longitude: number | null } | null;
  children?: ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { texture, heightMap } = useMemo(() => makeEarthTextures(tier), [tier]);
  const focusRotationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!focus || focus.longitude === null) {
      focusRotationRef.current = null;
      return;
    }
    focusRotationRef.current = THREE.MathUtils.degToRad(-(focus.longitude + 90));
  }, [focus]);

  useFrame((_state, delta) => {
    if (groupRef.current) {
      if (focusRotationRef.current !== null) {
        groupRef.current.rotation.y = dampAngle(groupRef.current.rotation.y, focusRotationRef.current, 4.2, delta);
      } else {
        const minDistance = 1.33;
        const maxDistance = 5.4;
        const zoomProgress = THREE.MathUtils.clamp((maxDistance - cameraDistance) / (maxDistance - minDistance), 0, 1);
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
          displacementMap={heightMap}
          displacementScale={tier === "mobile" ? 0.035 : 0.05}
          roughness={0.98}
          metalness={0.02}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.01, 64, 64]} />
        <meshBasicMaterial color="#1f2d35" side={THREE.BackSide} transparent opacity={0.18} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.018, 40, 40]} />
        <meshBasicMaterial color="#dbe6eb" transparent opacity={0.055} />
      </mesh>
      {children}
    </group>
  );
}

function ThumbnailOverlayLayer({
  items,
  hoverEnabled,
  rotationRef,
  onSelect
}: {
  items: PhotoItem[];
  hoverEnabled: boolean;
  rotationRef: React.MutableRefObject<number>;
  onSelect: (id: string) => void;
}) {
  const { camera, size } = useThree();
  const [layout, setLayout] = useState<ThumbnailOverlayItem[]>([]);

  useFrame(() => {
    const rotation = rotationRef.current;
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
    const forward = position.clone().normalize().multiplyScalar(0.034);
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
          <sphereGeometry args={[0.03, 12, 12]} />
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
        const position = latLngToVector3(city.latitude, city.longitude, 1.085);
        return (
          <group key={city.name} position={position}>
            <Billboard follow>
              <Text
                color="#f7f9fb"
                outlineColor="rgba(114,124,132,0.58)"
                outlineWidth={0.0009}
                fontSize={0.019}
                anchorX="center"
                anchorY="bottom"
                position={[0, 0.045, 0]}
              >
                {city.name}
              </Text>
            </Billboard>
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
  onModeChange,
  onSelect
}: {
  tier: DeviceTier;
  mode: "cluster" | "items";
  items: ClusterItem[] | PhotoItem[];
  focus?: { latitude: number | null; longitude: number | null } | null;
  onModeChange: (mode: "cluster" | "items") => void;
  onSelect: (id: string) => void;
}) {
  const hoverEnabled = tier !== "mobile";
  const [cameraDistance, setCameraDistance] = useState(tier === "mobile" ? 3.8 : 3.2);
  const globeRotationRef = useRef(0);
  return (
    <Canvas dpr={tier === "desktop" ? [1, 2] : [1, 1.4]} gl={{ antialias: tier === "desktop", alpha: true }}>
      <ambientLight intensity={1.35} />
      <directionalLight position={[4, 2, 3]} intensity={1.25} />
      <PerspectiveCamera makeDefault position={[0, 0, tier === "mobile" ? 3.8 : 3.2]} fov={45} />
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={1.33}
        maxDistance={5.4}
        minPolarAngle={THREE.MathUtils.degToRad(30)}
        maxPolarAngle={THREE.MathUtils.degToRad(150)}
        target={[0, 0, 0]}
        rotateSpeed={tier === "mobile" ? 0.65 : 0.9}
        zoomSpeed={tier === "mobile" ? 0.8 : 1}
        onChange={(event) => {
          if (!event) {
            return;
          }
          const distance = event.target.object.position.length();
          setCameraDistance(distance);
          const nextMode = distance <= 3.2 ? "items" : "cluster";
          if (nextMode !== mode) {
            onModeChange(nextMode);
          }
        }}
      />
      <fog attach="fog" args={["#8f9398", 3.8, 6.8]} />
      <GlobeShell tier={tier} cameraDistance={cameraDistance} rotationRef={globeRotationRef} focus={focus}>
        <CityLabels cameraDistance={cameraDistance} />
        {mode === "cluster"
          ? (items as ClusterItem[]).map((item) => <ClusterMarker key={item.id} item={item} />)
          : null}
      </GlobeShell>
      {mode === "items" ? (
        <ThumbnailOverlayLayer
          items={items as PhotoItem[]}
          hoverEnabled={hoverEnabled}
          rotationRef={globeRotationRef}
          onSelect={onSelect}
        />
      ) : null}
    </Canvas>
  );
}
