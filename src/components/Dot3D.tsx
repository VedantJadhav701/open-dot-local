"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import type { DotStatus, Look } from "@/lib/types";

// A dot is a round puffball character: squishy body, stubby arms, big shiny eyes, blush, chunky feet.
// Its pose reflects what it's doing: idle sways and waves, working bounces and steps, waiting hops, paused naps.

type Props = { look: Look; status?: DotStatus; size?: number; stage?: boolean; className?: string };

export default function Dot3D({ look, status = "idle", size = 160, stage = false, className }: Props) {
  return (
    <div className={className} style={{ width: size, height: size }}>
      {/* flat = no filmic tone mapping, so pastel bodies stay bright instead of dusty */}
      <Canvas flat camera={{ position: [0, 0.12, 5.9], fov: 34 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={1.05} />
        <directionalLight position={[2.5, 4, 5]} intensity={1.25} />
        <directionalLight position={[-4, 2, -3]} intensity={0.4} color="#ffe3ee" />
        <Environment resolution={64}>
          <Lightformer form="rect" intensity={1.4} position={[0, 4, 3]} scale={[6, 2, 1]} />
          <Lightformer form="rect" intensity={0.6} position={[-4, 0, 2]} scale={[2, 6, 1]} color="#ffe2cf" />
          <Lightformer form="ring" intensity={0.5} position={[4, 1, 2]} scale={2} color="#d9e8ff" />
        </Environment>
        <Puffball look={look} status={status} />
        {stage && <ContactShadows position={[0, -1.22, 0]} opacity={0.28} scale={5} blur={2.2} far={2} />}
      </Canvas>
    </div>
  );
}

const INK = "#1c1622";
const LINE = 0.04; // outline thickness in world units
const BODY_SCALE: Record<Look["shape"], [number, number, number]> = {
  round: [1, 1, 1],
  chubby: [1.12, 0.93, 1.06],
  tall: [0.93, 1.09, 0.95],
};

/** z of the unit sphere's front surface at (x, y). Face features sit just above it. */
const surface = (x: number, y: number) => Math.sqrt(Math.max(0, 1 - x * x - y * y));

function useColors(look: Look, dim: boolean) {
  return useMemo(() => {
    const tint = (hex: string) => {
      const c = new THREE.Color(hex);
      if (dim) c.lerp(new THREE.Color("#a09da8"), 0.3);
      return c;
    };
    return {
      body: tint(look.color),
      feet: tint(look.accent),
      blush: new THREE.Color(look.color).lerp(new THREE.Color("#ff4f8b"), 0.6),
      eye: new THREE.Color(look.eyeColor),
    };
  }, [look.color, look.accent, look.eyeColor, dim]);
}

function Skin({ color, material, glossy = false }: { color: THREE.Color; material: Look["material"]; glossy?: boolean }) {
  if (glossy) return <meshPhysicalMaterial color={color} roughness={0.25} clearcoat={1} clearcoatRoughness={0.1} />;
  switch (material) {
    case "glossy":
      return <meshPhysicalMaterial color={color} roughness={0.32} clearcoat={0.8} clearcoatRoughness={0.15} />;
    case "velvet":
      return <meshPhysicalMaterial color={color} roughness={0.85} sheen={1} sheenRoughness={0.5} sheenColor="#ffffff" />;
    case "toon":
      return <meshToonMaterial color={color} />;
    default:
      return <meshStandardMaterial color={color} roughness={0.6} />;
  }
}

/** Cartoon outline: a slightly larger black shell rendered from the inside (inverted hull). */
function Hull({ r, segments = 48 }: { r: number; segments?: number }) {
  return (
    <mesh>
      <sphereGeometry args={[r + LINE, segments, segments]} />
      <meshBasicMaterial color={INK} side={THREE.BackSide} />
    </mesh>
  );
}

/** A sphere-based body part with an outline. */
function Part({ r, color, material, glossy, scale, position, rotation }: {
  r: number; color: THREE.Color; material: Look["material"]; glossy?: boolean;
  scale?: [number, number, number]; position?: [number, number, number]; rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh>
        <sphereGeometry args={[r, 48, 36]} />
        <Skin color={color} material={material} glossy={glossy} />
      </mesh>
      <Hull r={r} segments={32} />
    </group>
  );
}

function Puffball({ look, status }: { look: Look; status: DotStatus }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const footL = useRef<THREE.Group>(null);
  const footR = useRef<THREE.Group>(null);
  const extra = useRef<THREE.Group>(null);
  const blinkAt = useRef(3);

  const sleeping = status === "paused";
  const colors = useColors(look, sleeping);
  const [sx, sy, sz] = BODY_SCALE[look.shape];

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const g = root.current;
    const b = body.current;
    if (!g || !b) return;
    const damp = (from: number, to: number, k = 6) => THREE.MathUtils.damp(from, to, k, dt);

    // Whole-body motion.
    let y = Math.sin(t * 1.6) * 0.035;
    if (status === "working") y = Math.abs(Math.sin(t * 5)) * 0.12;
    if (status === "waiting") y = Math.max(0, Math.sin(t * 3.2)) * 0.18;
    if (sleeping) y = Math.sin(t * 0.9) * 0.015;
    g.position.y = 0.05 + y;

    // Face the cursor when idle; look around while working; nod off when paused.
    const px = sleeping ? 0.15 : status === "working" ? Math.sin(t * 1.2) * 0.5 : state.pointer.x;
    const py = sleeping ? -0.5 : status === "working" ? 0.1 : state.pointer.y;
    g.rotation.y = damp(g.rotation.y, px * 0.5);
    g.rotation.x = damp(g.rotation.x, -py * 0.22);
    g.rotation.z = damp(g.rotation.z, sleeping ? 0.12 : status === "idle" ? Math.sin(t * 0.8) * 0.05 : 0);

    // Squash & stretch. The face lives inside this group, so it always stays on the surface.
    const squash = status === "working" ? 1 - Math.max(0, Math.cos(t * 10)) * 0.05 : 1 + Math.sin(t * (sleeping ? 1.2 : 2)) * 0.018;
    b.scale.set(sx * (2 - squash), sy * squash, sz * (2 - squash));

    // Arms: left rests, right waves (idle: now and then; waiting: constantly; working: pumping).
    if (armL.current && armR.current) {
      const wave = status === "waiting" ? 1 : status === "idle" ? Math.max(0, Math.sin(t * 0.7)) ** 6 : 0;
      const pump = status === "working" ? Math.sin(t * 10) * 0.35 : 0;
      armL.current.rotation.z = damp(armL.current.rotation.z, (sleeping ? 0.25 : 0.55) + pump);
      armR.current.rotation.z = damp(armR.current.rotation.z, (sleeping ? -0.25 : -0.55) - pump - wave * (1.5 + Math.sin(t * 9) * 0.35), 10);
    }

    // Feet: step while working, tap while waiting.
    if (footL.current && footR.current) {
      const step = status === "working" ? Math.sin(t * 10) : status === "waiting" ? Math.sin(t * 6) * 0.4 : 0;
      footL.current.position.y = -0.86 + Math.max(0, step) * 0.12;
      footR.current.position.y = -0.86 + Math.max(0, -step) * 0.12;
      footL.current.rotation.x = Math.max(0, step) * -0.4;
      footR.current.rotation.x = Math.max(0, -step) * -0.4;
    }

    // Blink: only the eyes squash; the smile and blush stay put.
    if (eyes.current) {
      if (sleeping) eyes.current.scale.y = 1;
      else {
        if (t > blinkAt.current) blinkAt.current = t + 2.4 + Math.random() * 3.2;
        const d = blinkAt.current - t;
        eyes.current.scale.y = d < 0.12 ? Math.max(0.08, Math.abs(d - 0.06) / 0.06) : 1;
      }
    }

    if (extra.current) {
      if (look.accessory === "halo") extra.current.rotation.y = t * 0.8;
      if (look.accessory === "antenna") extra.current.rotation.z = Math.sin(t * 2.4) * 0.14;
      if (look.accessory === "sprout") extra.current.rotation.z = Math.sin(t * 1.3) * 0.1;
    }
  });

  const eyeStyle: Look["eyes"] | "closed" = sleeping ? "closed" : look.eyes;
  const EYE_Y = 0.2;

  return (
    <group ref={root}>
      {/* Feet stay planted outside the squash group. */}
      <group ref={footL} position={[-0.42, -0.86, 0.16]} rotation={[0, 0.28, 0]}>
        <Part r={0.36} scale={[1.18, 0.62, 1.05]} color={colors.feet} material={look.material} glossy />
      </group>
      <group ref={footR} position={[0.42, -0.86, 0.16]} rotation={[0, -0.28, 0]}>
        <Part r={0.36} scale={[1.18, 0.62, 1.05]} color={colors.feet} material={look.material} glossy />
      </group>

      {/* Arms pivot at the shoulders. */}
      <group ref={armL} position={[-0.78 * sx, 0.02, 0.1]} rotation={[0, 0, 0.55]}>
        <Part r={0.27} position={[-0.2, 0, 0]} scale={[1, 0.72, 0.82]} color={colors.body} material={look.material} />
      </group>
      <group ref={armR} position={[0.78 * sx, 0.02, 0.1]} rotation={[0, 0, -0.55]}>
        <Part r={0.27} position={[0.2, 0, 0]} scale={[1, 0.72, 0.82]} color={colors.body} material={look.material} />
      </group>

      {/* Body + face share one squash/stretch transform. */}
      <group ref={body}>
        <mesh>
          <sphereGeometry args={[1, 96, 96]} />
          <Skin color={colors.body} material={look.material} />
        </mesh>
        <Hull r={1} segments={64} />

        <group ref={eyes} position={[0, EYE_Y, 0]}>
          <Eye x={-0.21} y={EYE_Y} style={eyeStyle === "wink" ? "classic" : eyeStyle} color={colors.eye} />
          <Eye x={0.21} y={EYE_Y} style={eyeStyle === "wink" ? "closed" : eyeStyle} color={colors.eye} />
        </group>

        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.45, -0.03, surface(0.45, -0.03) + 0.004]} rotation={[0.03, s * 0.47, 0]} scale={[1.35, 0.72, 0.18]}>
            <sphereGeometry args={[0.12, 24, 16]} />
            <meshBasicMaterial color={colors.blush} transparent opacity={sleeping ? 0.35 : 0.65} depthWrite={false} />
          </mesh>
        ))}

        {/* Smile: a ∪ arc resting on the surface. */}
        <mesh position={[0, -0.075, surface(0, -0.075) + 0.004]} rotation={[0.075, 0, Math.PI]}>
          <torusGeometry args={[0.07, 0.018, 12, 28, Math.PI]} />
          <meshBasicMaterial color={INK} />
        </mesh>

        {/* Hats and extras live on the head, so they squash and stretch with it (unit-sphere coordinates). */}
        <group ref={extra} position={[0, look.accessory === "cap" ? 0 : look.accessory === "headphones" ? 0.32 : 1, 0]}>
          <Accessory kind={look.accessory} accent={look.accent} />
        </group>
      </group>

    </group>
  );
}

/** Tall oval eye: dark ink with a colored lower half and a bright highlight, tilted to the body's curve. */
function Eye({ x, y, style, color }: { x: number; y: number; style: Look["eyes"] | "closed"; color: THREE.Color }) {
  const z = surface(x, y);
  const tilt: [number, number, number] = [-Math.asin(y), Math.asin(x), 0];
  if (style === "happy" || style === "closed") {
    // happy: ∩ arcs; closed (sleeping / wink): gentle ∪ arcs
    return (
      <group position={[x, 0, z + 0.004]} rotation={tilt}>
        <mesh position={[0, style === "happy" ? -0.02 : -0.03, 0]} rotation={[0, 0, style === "happy" ? 0 : Math.PI]}>
          <torusGeometry args={[0.085, 0.022, 12, 24, Math.PI]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      </group>
    );
  }
  const w = style === "wide" ? 1.18 : 1;
  return (
    <group position={[x, 0, z - 0.004]} rotation={tilt}>
      <mesh scale={[0.72 * w, 1.45, 0.26]}>
        <sphereGeometry args={[0.125, 32, 24]} />
        <meshBasicMaterial color={INK} />
      </mesh>
      <mesh position={[0, -0.07, 0.012]} scale={[0.6 * w, 0.82, 0.24]}>
        <sphereGeometry args={[0.1, 32, 24]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.075, 0.02]} scale={[0.6 * w, 0.95, 0.24]}>
        <sphereGeometry args={[0.052, 20, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

function Accessory({ kind, accent }: { kind: Look["accessory"]; accent: string }) {
  const trim = useMemo(() => new THREE.Color(accent === "#f4f4f4" ? "#d8195f" : accent), [accent]);
  switch (kind) {
    case "bow":
      return (
        <group position={[0.42, -0.12, 0.35]} rotation={[0.2, 0.3, -0.35]}>
          {[-1, 1].map((s) => (
            <Part key={s} r={0.17} position={[s * 0.2, 0, 0]} rotation={[0, 0, s * 0.35]} scale={[1.2, 0.8, 0.5]} color={trim} material="glossy" />
          ))}
          <Part r={0.09} color={trim} material="glossy" />
        </group>
      );
    case "cap":
      return <Cap trim={trim} />;
    case "antenna":
      return (
        <group>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.024, 0.024, 0.42, 12]} />
            <meshBasicMaterial color={INK} />
          </mesh>
          <Part r={0.1} position={[0, 0.46, 0]} color={trim} material="glossy" />
        </group>
      );
    case "halo":
      return (
        <mesh position={[0, 0.28, 0]} rotation={[Math.PI / 2.2, 0, 0]}>
          <torusGeometry args={[0.45, 0.045, 16, 64]} />
          <meshStandardMaterial color="#ffd84a" emissive="#ffd84a" emissiveIntensity={0.8} />
        </mesh>
      );
    case "sprout":
      return (
        <group>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.022, 0.03, 0.26, 10]} />
            <meshStandardMaterial color="#3f8f4a" />
          </mesh>
          {[-1, 1].map((s) => (
            <Part key={s} r={0.16} position={[s * 0.13, 0.28 + (s > 0 ? 0.03 : 0), 0]} rotation={[0, 0, -s * 0.9]} scale={[1, 0.45, 0.25]} color={new THREE.Color("#62c46f")} material="soft" />
          ))}
        </group>
      );
    case "headphones":
      return (
        <group>
          <mesh>
            <torusGeometry args={[0.97, 0.055, 16, 64, Math.PI]} />
            <meshStandardMaterial color="#2a2530" roughness={0.4} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.97, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.22, 0.22, 0.18, 32]} />
              <meshStandardMaterial color={trim} roughness={0.35} />
            </mesh>
          ))}
        </group>
      );
    default:
      return null;
  }
}

// ── Cap ──────────────────────────────────────────────────────────────────
// A six-panel baseball cap sized for the unit-sphere head: a crown that hugs the top of the head,
// a curved stiff brim that sticks out over the face, a top button, seams, and a small dot logo.

const CAP_OPEN = Math.PI * 0.31; // how far down the head the crown reaches (polar angle)
const CAP_R = 1.012; // hugs the head; its outline (CAP_R + LINE) just covers the head's own
const CAP_EDGE_Y = CAP_R * Math.cos(CAP_OPEN); // ≈ 0.58, above the eyes
const CAP_EDGE_R = CAP_R * Math.sin(CAP_OPEN); // ≈ 0.86

function Cap({ trim }: { trim: THREE.Color }) {
  const seam = useMemo(() => trim.clone().multiplyScalar(0.7), [trim]);
  return (
    // Turned a little to one side so the bill has a readable shape from the front.
    <group rotation={[-0.03, 0.62, 0.06]}>
      {/* Crown + outline */}
      <mesh>
        <sphereGeometry args={[CAP_R, 64, 32, 0, Math.PI * 2, 0, CAP_OPEN]} />
        <meshStandardMaterial color={trim} roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <sphereGeometry args={[CAP_R + LINE, 64, 32, 0, Math.PI * 2, 0, CAP_OPEN]} />
        <meshBasicMaterial color={INK} side={THREE.BackSide} />
      </mesh>

      {/* Band where the crown meets the head */}
      <mesh position={[0, CAP_EDGE_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[CAP_EDGE_R + 0.006, 0.022, 10, 72]} />
        <meshBasicMaterial color={INK} />
      </mesh>

      {/* Panel seams: arcs from one side of the crown, over the top, to the other */}
      {[0, 1, 2].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI) / 3, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2 - CAP_OPEN]}>
            <torusGeometry args={[CAP_R + 0.004, 0.009, 6, 64, CAP_OPEN * 2]} />
            <meshBasicMaterial color={seam} />
          </mesh>
        </group>
      ))}

      {/* Top button */}
      <mesh position={[0, CAP_R + 0.015, 0]}>
        <sphereGeometry args={[0.075, 20, 14]} />
        <meshStandardMaterial color={trim} roughness={0.6} />
      </mesh>
      <mesh position={[0, CAP_R + 0.015, 0]}>
        <sphereGeometry args={[0.075 + LINE * 0.7, 20, 14]} />
        <meshBasicMaterial color={INK} side={THREE.BackSide} />
      </mesh>

      {/* Front logo: a white dot with an ink ring, lying on the front panel */}
      <group position={[0, 0.8, Math.sqrt(CAP_R * CAP_R - 0.64) + 0.003]} rotation={[-Math.asin(0.8 / CAP_R), 0, 0]}>
        <mesh position={[0, 0, 0.004]}>
          <circleGeometry args={[0.095, 32]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh>
          <circleGeometry args={[0.12, 32]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      </group>

      {/* Bill: a thick, rounded, flattened lens growing out of the crown's front edge, dipping slightly
          so its colored top faces the viewer. Its back half sits inside the head, so only the visor shows. */}
      <group position={[0, CAP_EDGE_Y, 0]} rotation={[0.14, 0, 0]}>
        <mesh position={[0, 0, 0.5]} scale={[0.74, 0.075, 0.64]}>
          <sphereGeometry args={[1, 64, 32]} />
          <meshStandardMaterial color={trim} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0, 0.5]} scale={[0.74 + LINE, 0.075 + LINE, 0.64 + LINE]}>
          <sphereGeometry args={[1, 48, 24]} />
          <meshBasicMaterial color={INK} side={THREE.BackSide} />
        </mesh>
      </group>
    </group>
  );
}
