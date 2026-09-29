import { useId } from "react";
import type { DotStatus, Look } from "@/lib/types";

// Flat SVG rendition of a dot for lists and chips (one WebGL canvas per row would be wasteful).
// Mirrors the 3D puffball: outlined body, stubby arms, oval eyes, blush, smile, chunky feet.

const INK = "#1c1622";
const BODY: Record<Look["shape"], { rx: number; ry: number }> = {
  round: { rx: 36, ry: 36 },
  chubby: { rx: 39.5, ry: 33.5 },
  tall: { rx: 33.5, ry: 39 },
};

function mix(hex: string, other: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [p(hex), p(other)];
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return hex;
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
}

export default function DotOrb({ look, status = "idle", size = 36 }: { look: Look; status?: DotStatus; size?: number }) {
  const id = useId().replace(/:/g, "");
  const sleeping = status === "paused";
  const { rx, ry } = BODY[look.shape] ?? BODY.round;
  const cy = 52;
  const top = cy - ry;
  const eyeY = cy - 9;
  const trim = look.accent === "#f4f4f4" ? "#d8195f" : look.accent;
  const eyeStyle = sleeping ? "closed" : look.eyes;
  const sw = 3.4;

  const eye = (x: number, style: string) => {
    if (style === "happy") return <path key={x} d={`M${x - 4.5} ${eyeY + 2} Q${x} ${eyeY - 6} ${x + 4.5} ${eyeY + 2}`} fill="none" stroke={INK} strokeWidth={2.8} strokeLinecap="round" />;
    if (style === "closed") return <path key={x} d={`M${x - 4.5} ${eyeY} Q${x} ${eyeY + 4.5} ${x + 4.5} ${eyeY}`} fill="none" stroke={INK} strokeWidth={2.8} strokeLinecap="round" />;
    const w = style === "wide" ? 1.2 : 1;
    return (
      <g key={x}>
        <ellipse cx={x} cy={eyeY} rx={4.8 * w} ry={8.6} fill={INK} />
        <ellipse cx={x} cy={eyeY + 3.4} rx={3.7 * w} ry={4.6} fill={look.eyeColor} />
        <ellipse cx={x} cy={eyeY - 3.6} rx={2.7 * w} ry={3.4} fill="#fff" />
      </g>
    );
  };

  return (
    <span
      className={`relative inline-block shrink-0 ${status === "working" ? "animate-[dot-bob_0.5s_ease-in-out_infinite]" : status === "waiting" ? "animate-[dot-bob_1.2s_ease-in-out_infinite]" : ""}`}
      style={{ width: size, height: size, filter: sleeping ? "grayscale(0.45) brightness(0.97)" : undefined }}
    >
      <svg viewBox="-2 -5 104 104" width={size} height={size} aria-hidden>
        <defs>
          <radialGradient id={`b${id}`} cx="0.36" cy="0.3" r="0.8">
            <stop offset="0" stopColor={mix(look.color, "#ffffff", 0.45)} />
            <stop offset="0.55" stopColor={look.color} />
            <stop offset="1" stopColor={mix(look.color, "#000000", 0.12)} />
          </radialGradient>
        </defs>

        {look.accessory === "halo" && <ellipse cx={50} cy={top - 8} rx={20} ry={5} fill="none" stroke="#f5c518" strokeWidth={3.5} />}

        {/* feet */}
        <ellipse cx={33} cy={cy + ry - 3} rx={17} ry={10} transform={`rotate(-10 33 ${cy + ry - 3})`} fill={look.accent} stroke={INK} strokeWidth={sw} />
        <ellipse cx={67} cy={cy + ry - 3} rx={17} ry={10} transform={`rotate(10 67 ${cy + ry - 3})`} fill={look.accent} stroke={INK} strokeWidth={sw} />

        {/* arms */}
        <ellipse cx={50 - rx + 1} cy={cy + 4} rx={9.5} ry={7.5} transform={`rotate(-25 ${50 - rx + 1} ${cy + 4})`} fill={look.color} stroke={INK} strokeWidth={sw} />
        <ellipse
          cx={50 + rx - 1}
          cy={status === "waiting" ? cy - 16 : cy - 5}
          rx={9.5}
          ry={7.5}
          transform={`rotate(${status === "waiting" ? 45 : 35} ${50 + rx - 1} ${status === "waiting" ? cy - 16 : cy - 5})`}
          fill={look.color}
          stroke={INK}
          strokeWidth={sw}
        />

        {/* body */}
        <ellipse cx={50} cy={cy} rx={rx} ry={ry} fill={`url(#b${id})`} stroke={INK} strokeWidth={sw} />

        {/* face */}
        {eye(42.5, eyeStyle === "wink" ? "classic" : eyeStyle)}
        {eye(57.5, eyeStyle === "wink" ? "closed" : eyeStyle)}
        <ellipse cx={32} cy={cy + 3} rx={6} ry={3.2} fill={mix(look.color, "#ff4f8b", 0.55)} opacity={0.6} />
        <ellipse cx={68} cy={cy + 3} rx={6} ry={3.2} fill={mix(look.color, "#ff4f8b", 0.55)} opacity={0.6} />
        <path d={`M46.5 ${cy + 2.5} Q50 ${cy + 6.5} 53.5 ${cy + 2.5}`} fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />

        {/* accessories */}
        {look.accessory === "bow" && (
          <g transform={`translate(66 ${top + 8}) rotate(-20)`}>
            <ellipse cx={-7} cy={0} rx={8} ry={5.5} fill={trim} stroke={INK} strokeWidth={2.6} />
            <ellipse cx={7} cy={0} rx={8} ry={5.5} fill={trim} stroke={INK} strokeWidth={2.6} />
            <circle r={3.6} fill={trim} stroke={INK} strokeWidth={2.4} />
          </g>
        )}
        {look.accessory === "cap" && (() => {
          // Crown hugs the top of the head down to capY; the brim sits just above the eyes.
          const capY = cy - ry * 0.58;
          const half = rx * Math.sqrt(1 - ((capY - cy) / ry) ** 2) + 1.5;
          return (
            <g>
              <path d={`M${50 - half} ${capY} A ${half} ${capY - top + 3} 0 0 1 ${50 + half} ${capY} Z`} fill={trim} stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
              <path d={`M50 ${top - 2.5} Q 60 ${top + 4} ${62} ${capY}`} fill="none" stroke={INK} strokeOpacity={0.25} strokeWidth={1.4} />
              <circle cx={50} cy={top - 3} r={2.8} fill={trim} stroke={INK} strokeWidth={2} />
              <circle cx={56} cy={capY - 6} r={2.8} fill="#fff" stroke={INK} strokeWidth={1.5} />
              {/* Bill turned to the side, sticking out past the head */}
              <path
                d={`M${50 + half * 0.35} ${capY + 1} Q ${50 + half + 14} ${capY - 3} ${50 + half + 20} ${capY + 3} Q ${50 + half + 8} ${capY + 7.5} ${50 + half * 0.35} ${capY + 5} Z`}
                fill={mix(trim, "#000000", 0.18)}
                stroke={INK}
                strokeWidth={sw}
                strokeLinejoin="round"
              />
            </g>
          );
        })()}
        {look.accessory === "antenna" && (
          <g>
            <line x1={50} y1={top} x2={50} y2={top - 11} stroke={INK} strokeWidth={2.6} />
            <circle cx={50} cy={top - 13} r={4.6} fill={trim} stroke={INK} strokeWidth={2.4} />
          </g>
        )}
        {look.accessory === "sprout" && (
          <g>
            <line x1={50} y1={top} x2={50} y2={top - 7} stroke="#3f8f4a" strokeWidth={2.6} />
            <ellipse cx={44} cy={top - 9} rx={6.5} ry={3.4} transform={`rotate(25 44 ${top - 9})`} fill="#62c46f" stroke={INK} strokeWidth={2.2} />
            <ellipse cx={56} cy={top - 10} rx={6.5} ry={3.4} transform={`rotate(-25 56 ${top - 10})`} fill="#62c46f" stroke={INK} strokeWidth={2.2} />
          </g>
        )}
        {look.accessory === "headphones" && (
          <g>
            <path d={`M${50 - rx + 2} ${cy - 10} A ${rx - 2} ${ry + 2} 0 0 1 ${50 + rx - 2} ${cy - 10}`} fill="none" stroke="#2a2530" strokeWidth={4.5} />
            <rect x={50 - rx - 4} y={cy - 18} width={10} height={16} rx={4} fill={trim} stroke={INK} strokeWidth={2.6} />
            <rect x={50 + rx - 6} y={cy - 18} width={10} height={16} rx={4} fill={trim} stroke={INK} strokeWidth={2.6} />
          </g>
        )}
      </svg>
      {status === "waiting" && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-warning ring-2 ring-card" />}
    </span>
  );
}
