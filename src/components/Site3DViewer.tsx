import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, Html, Sky } from "@react-three/drei";
import * as THREE from "three";

export type SiteAsset = {
  id: string;
  asset_type: "pit" | "pipe" | "pavement" | "endwall";
  code: string;
  x_m: number;
  y_m: number;
  z_m: number;
  depth_m: number | null;
  diameter_mm: number | null;
  from_code: string | null;
  to_code: string | null;
  status: "not_started" | "in_progress" | "installed";
};

const STATUS_COLOR: Record<SiteAsset["status"], string> = {
  not_started: "#6b7280",
  in_progress: "#f59e0b",
  installed: "#10b981",
};

function Pit({ asset, onClick, selected }: { asset: SiteAsset; onClick: () => void; selected: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const depth = asset.depth_m ?? 1.5;
  const radius = 0.6;
  const color = STATUS_COLOR[asset.status];
  useFrame(() => {
    if (selected && ref.current) ref.current.rotation.y += 0.01;
  });
  return (
    <group position={[asset.x_m, -depth / 2, asset.y_m]}>
      <mesh ref={ref} onClick={(e) => { e.stopPropagation(); onClick(); }} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, depth, 16]} />
        <meshStandardMaterial color={color} metalness={0.2} roughness={0.7} />
      </mesh>
      {/* Cover at top */}
      <mesh position={[0, depth / 2 + 0.02, 0]} castShadow>
        <cylinderGeometry args={[radius + 0.05, radius + 0.05, 0.05, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {selected && (
        <Html position={[0, depth / 2 + 0.6, 0]} center distanceFactor={12}>
          <div className="px-2 py-1 rounded bg-white shadow border border-rule text-xs whitespace-nowrap">
            <div className="font-semibold">{asset.code}</div>
            <div className="text-meta">Depth {depth.toFixed(2)}m · {asset.status.replace("_"," ")}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

function Pipe({ from, to, diameter, status }: { from: SiteAsset; to: SiteAsset; diameter: number; status: SiteAsset["status"] }) {
  const radius = Math.max(0.1, diameter / 2000); // mm → m / 2
  const start = new THREE.Vector3(from.x_m, -((from.depth_m ?? 1.5)) + radius, from.y_m);
  const end = new THREE.Vector3(to.x_m, -((to.depth_m ?? 1.5)) + radius, to.y_m);
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const dir = end.clone().sub(start);
  const length = dir.length();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const euler = new THREE.Euler().setFromQuaternion(quat);
  return (
    <mesh position={mid.toArray()} rotation={euler} castShadow>
      <cylinderGeometry args={[radius, radius, length, 12]} />
      <meshStandardMaterial color={STATUS_COLOR[status]} roughness={0.6} />
    </mesh>
  );
}

function Endwall({ asset }: { asset: SiteAsset }) {
  return (
    <group position={[asset.x_m, 0.2, asset.y_m]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.6, 0.4]} />
        <meshStandardMaterial color={STATUS_COLOR[asset.status]} roughness={0.8} />
      </mesh>
    </group>
  );
}

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#a89878" roughness={1} />
      </mesh>
      <Grid args={[300, 300]} cellSize={5} cellThickness={0.5} cellColor="#7a6b50" sectionSize={25} sectionThickness={1} sectionColor="#574a35" fadeDistance={250} infiniteGrid />
    </>
  );
}

export function Site3DViewer({ assets, onSelect, selectedId }: {
  assets: SiteAsset[];
  onSelect: (id: string | null) => void;
  selectedId: string | null;
}) {
  const byCode = useMemo(() => {
    const m = new Map<string, SiteAsset>();
    for (const a of assets) m.set(a.code, a);
    return m;
  }, [assets]);

  const pits = assets.filter((a) => a.asset_type === "pit");
  const pipes = assets.filter((a) => a.asset_type === "pipe");
  const endwalls = assets.filter((a) => a.asset_type === "endwall");

  // Compute scene center
  const center = useMemo(() => {
    if (assets.length === 0) return [0, 0] as const;
    const xs = assets.map((a) => a.x_m), ys = assets.map((a) => a.y_m);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] as const;
  }, [assets]);

  return (
    <Canvas
      shadows
      camera={{ position: [center[0] + 80, 60, center[1] + 80], fov: 45, near: 0.1, far: 2000 }}
      onPointerMissed={() => onSelect(null)}
      style={{ background: "linear-gradient(180deg,#cfe3f5 0%,#eef4f9 100%)" }}
    >
      <Suspense fallback={null}>
        <Sky sunPosition={[100, 80, 100]} turbidity={4} rayleigh={1.5} />
        <ambientLight intensity={0.45} />
        <directionalLight
          position={[80, 120, 60]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-200}
          shadow-camera-right={200}
          shadow-camera-top={200}
          shadow-camera-bottom={-200}
        />
        <Environment preset="sunset" background={false} />
        <Ground />
        {pits.map((p) => (
          <Pit key={p.id} asset={p} selected={selectedId === p.id} onClick={() => onSelect(p.id)} />
        ))}
        {pipes.map((p) => {
          const from = p.from_code ? byCode.get(p.from_code) : null;
          const to = p.to_code ? byCode.get(p.to_code) : null;
          if (!from || !to) return null;
          return <Pipe key={p.id} from={from} to={to} diameter={p.diameter_mm ?? 300} status={p.status} />;
        })}
        {endwalls.map((e) => <Endwall key={e.id} asset={e} />)}
        <OrbitControls makeDefault target={[center[0], 0, center[1]]} maxPolarAngle={Math.PI / 2.1} />
      </Suspense>
    </Canvas>
  );
}
