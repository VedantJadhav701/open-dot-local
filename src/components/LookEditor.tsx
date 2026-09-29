"use client";

import { Shuffle } from "lucide-react";
import { ACCESSORIES, COLORS, EYE_COLORS, EYES, FEET_COLORS, MATERIALS, SHAPES, type Look } from "@/lib/types";
import { feetFor, randomLook } from "@/lib/look";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div className="eyebrow pt-2">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function Chips<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`h-8 rounded-md border px-3 text-[13px] capitalize transition-colors ${o === value ? "border-foreground bg-foreground text-card" : "border-black/10 text-foreground/70 hover:border-black/25 hover:text-foreground"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Swatches({ value, onChange, palette = COLORS }: { value: string; onChange: (v: string) => void; palette?: readonly string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      {palette.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`size-7 rounded-full ring-offset-2 ring-offset-card transition ${c === value ? "ring-[1.5px] ring-foreground" : "hover:scale-110"}`}
          style={{ background: c, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)" }}
          aria-label={c}
        />
      ))}
      <label className="relative flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-black/25 text-[13px] text-foreground/50 hover:border-black/50" title="Custom color">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />+
      </label>
    </div>
  );
}

export default function LookEditor({ look, onChange }: { look: Look; onChange: (look: Look) => void }) {
  const set = <K extends keyof Look>(k: K) => (v: Look[K]) => onChange({ ...look, [k]: v });
  return (
    <div className="divide-y divide-black/[0.06]">
      <Row label="Body">
        <Chips value={look.shape} options={SHAPES} onChange={set("shape")} />
      </Row>
      <Row label="Color">
        <Swatches
          value={look.color}
          // Palette colors come with matching feet; a custom color keeps the current feet.
          onChange={(c) => onChange({ ...look, color: c, accent: (COLORS as readonly string[]).includes(c) ? feetFor(c) : look.accent })}
        />
      </Row>
      <Row label="Feet">
        <Swatches value={look.accent} palette={FEET_COLORS} onChange={set("accent")} />
      </Row>
      <Row label="Eyes">
        <Chips value={look.eyes} options={EYES} onChange={set("eyes")} />
      </Row>
      <Row label="Eye color">
        <Swatches value={look.eyeColor} palette={EYE_COLORS} onChange={set("eyeColor")} />
      </Row>
      <Row label="Finish">
        <Chips value={look.material} options={MATERIALS} onChange={set("material")} />
      </Row>
      <Row label="Extra">
        <Chips value={look.accessory} options={ACCESSORIES} onChange={set("accessory")} />
      </Row>
      <div className="pt-3">
        <button type="button" className="btn-quiet -ml-2.5" onClick={() => onChange(randomLook())}>
          <Shuffle className="size-3.5" strokeWidth={1.75} /> Shuffle look
        </button>
      </div>
    </div>
  );
}
