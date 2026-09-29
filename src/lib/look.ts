import { ACCESSORIES, COLORS, EYE_COLORS, EYES, FEET_COLORS, MATERIALS, SHAPES, type Look } from "./types";

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Feet color that goes with a body color (same index in the paired palettes). */
export function feetFor(body: string): string {
  const i = (COLORS as readonly string[]).indexOf(body);
  return i >= 0 ? FEET_COLORS[i] : "#d8195f";
}

export const DEFAULT_LOOK: Look = {
  shape: "round",
  color: "#ffa7c4",
  accent: "#d8195f",
  eyeColor: "#2b5fd9",
  material: "soft",
  eyes: "classic",
  accessory: "none",
};

export function randomLook(): Look {
  const color = pick(COLORS);
  return {
    shape: pick(SHAPES),
    color,
    accent: feetFor(color),
    eyeColor: pick(EYE_COLORS),
    material: pick(MATERIALS.filter((m) => m !== "toon")),
    eyes: pick(EYES.filter((e) => e !== "wink")),
    accessory: pick(ACCESSORIES),
  };
}

const oneOf = <T extends string>(xs: readonly T[], v: unknown, fallback: T): T => ((xs as readonly unknown[]).includes(v) ? (v as T) : fallback);

/** Accept looks saved by older versions (cube/gem shapes, metal finish, etc.). */
export function normalizeLook(raw: Partial<Record<keyof Look, unknown>> | null | undefined): Look {
  const r = raw ?? {};
  const legacyMaterial: Record<string, Look["material"]> = { matte: "soft", glass: "glossy", metal: "glossy" };
  const legacyEyes: Record<string, Look["eyes"]> = { dots: "classic", ovals: "classic", sleepy: "classic" };
  const legacyShape: Record<string, Look["shape"]> = { blob: "chubby", capsule: "tall", cube: "chubby" };
  const color = typeof r.color === "string" ? r.color : DEFAULT_LOOK.color;
  return {
    shape: oneOf(SHAPES, r.shape, legacyShape[String(r.shape)] ?? "round"),
    color,
    accent: typeof r.accent === "string" && (FEET_COLORS as readonly string[]).includes(r.accent) ? r.accent : feetFor(color),
    eyeColor: typeof r.eyeColor === "string" ? r.eyeColor : DEFAULT_LOOK.eyeColor,
    material: oneOf(MATERIALS, r.material, legacyMaterial[String(r.material)] ?? "soft"),
    eyes: oneOf(EYES, r.eyes, legacyEyes[String(r.eyes)] ?? "classic"),
    accessory: oneOf(ACCESSORIES, r.accessory, "none"),
  };
}

export const NAME_IDEAS = ["Pixel", "Mochi", "Juniper", "Atlas", "Nova", "Pebble", "Scout", "Echo", "Clove", "Orbit", "Sprout", "Bix"];

export const STARTERS: { name: string; purpose: string; look: Look }[] = [
  { name: "Scout", purpose: "Research anything I ask and deliver clear, sourced briefs", look: { ...DEFAULT_LOOK, color: "#9fcbff", accent: "#2a6fdb", accessory: "antenna" } },
  { name: "Juniper", purpose: "Keep an eye on my inbox and draft replies in my voice", look: { ...DEFAULT_LOOK, color: "#97e0b8", accent: "#1f8f5f", eyeColor: "#1f8f5f", accessory: "sprout", shape: "chubby" } },
  { name: "Atlas", purpose: "Plan trips and track prices for flights and hotels", look: { ...DEFAULT_LOOK, color: "#ffd98a", accent: "#e0492d", eyeColor: "#c2410c", accessory: "cap", eyes: "wide" } },
  { name: "Bix", purpose: "Write and run code and scripts on its computer", look: { ...DEFAULT_LOOK, color: "#b9b3ff", accent: "#5b46d6", eyeColor: "#8a4bd6", accessory: "headphones", material: "glossy" } },
];
