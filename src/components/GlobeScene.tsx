import { Canvas, useFrame } from "@react-three/fiber";
import { Billboard, OrbitControls, PerspectiveCamera, Text } from "@react-three/drei";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import landDataLow from "world-atlas/land-110m.json";
import landData from "world-atlas/land-50m.json";
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

function latLngToVector3(latitude: number, longitude: number, radius = 1.03) {
  const phi = (90 - latitude) * (Math.PI / 180);
  const theta = (longitude + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function makeEarthTextures(tier: DeviceTier) {
  const isMobile = tier === "mobile";
  const size = isMobile ? 1024 : 2048;
  const landSource = isMobile ? landDataLow : landData;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#8eaab6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = isMobile ? 1 : 1.2;
  const gridStep = isMobile ? 64 : 96;
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
  const projection = geoEquirectangular().fitSize([canvas.width, canvas.height], landFeature);
  const drawLand = geoPath(projection, ctx);

  ctx.fillStyle = "#d7e3e8";
  ctx.beginPath();
  drawLand(landFeature);
  ctx.fill();

  ctx.strokeStyle = "#f5fafc";
  ctx.lineWidth = isMobile ? 0.95 : 1.2;
  ctx.beginPath();
  drawLand(landFeature);
  ctx.stroke();

  ctx.strokeStyle = "rgba(112, 128, 136, 0.42)";
  ctx.lineWidth = isMobile ? 0.3 : 0.45;
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
  const heightProjection = geoEquirectangular().fitSize([heightCanvas.width, heightCanvas.height], landFeature);
  const drawHeightLand = geoPath(heightProjection, hctx);
  hctx.fillStyle = "#8e8e8e";
  hctx.beginPath();
  drawHeightLand(landFeature);
  hctx.fill();
  const heightMap = new THREE.CanvasTexture(heightCanvas);
  heightMap.anisotropy = isMobile ? 4 : 8;
  return { texture, heightMap };
}

function GlobeShell({ tier, children }: { tier: DeviceTier; children?: ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  const { texture, heightMap } = useMemo(() => makeEarthTextures(tier), [tier]);
  useFrame((_state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.05;
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
          roughness={0.95}
          metalness={0.02}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.015, 40, 40]} />
        <meshBasicMaterial color="#92d3ff" transparent opacity={0.06} />
      </mesh>
      {children}
    </group>
  );
}

function PhotoSprite({
  item,
  hoverEnabled,
  onSelect
}: {
  item: PhotoItem;
  hoverEnabled: boolean;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const texture = useMemo(() => new THREE.TextureLoader().load(item.thumbnailUrl), [item.thumbnailUrl]);
  const anchor = useMemo(() => latLngToVector3(item.latitude, item.longitude, 1.01), [item.latitude, item.longitude]);
  const position = useMemo(() => latLngToVector3(item.latitude, item.longitude, 1.08), [item.latitude, item.longitude]);
  const linePoints = useMemo(() => [anchor, position], [anchor, position]);
  return (
    <>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array(linePoints.flatMap((point) => point.toArray())), 3]}
            count={linePoints.length}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#dcecf5" transparent opacity={0.68} />
      </line>
      <group position={position}>
        <Billboard follow lockX={false} lockY={false} lockZ={false}>
          <mesh
            scale={hovered && hoverEnabled ? 1.35 : 1}
            onClick={() => onSelect(item.id)}
            onPointerOver={() => hoverEnabled && setHovered(true)}
            onPointerOut={() => hoverEnabled && setHovered(false)}
          >
            <planeGeometry args={[0.09, 0.09]} />
            <meshBasicMaterial map={texture} transparent toneMapped={false} />
          </mesh>
        </Billboard>
      </group>
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
  onModeChange,
  onSelect
}: {
  tier: DeviceTier;
  mode: "cluster" | "items";
  items: ClusterItem[] | PhotoItem[];
  onModeChange: (mode: "cluster" | "items") => void;
  onSelect: (id: string) => void;
}) {
  const hoverEnabled = tier !== "mobile";
  const [cameraDistance, setCameraDistance] = useState(tier === "mobile" ? 3.8 : 3.2);
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
      <GlobeShell tier={tier}>
        <CityLabels cameraDistance={cameraDistance} />
        {mode === "cluster"
          ? (items as ClusterItem[]).map((item) => <ClusterMarker key={item.id} item={item} />)
          : (items as PhotoItem[]).map((item) => (
              <PhotoSprite key={item.id} item={item} hoverEnabled={hoverEnabled} onSelect={onSelect} />
            ))}
      </GlobeShell>
    </Canvas>
  );
}
