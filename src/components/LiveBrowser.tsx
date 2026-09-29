"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, RotateCw } from "lucide-react";
import { useStore } from "@/lib/store";

type Input =
  | { t: "down" | "up"; x: number; y: number; button: "left" | "right" | "middle"; clicks: number }
  | { t: "move"; x: number; y: number }
  | { t: "wheel"; x: number; y: number; dx: number; dy: number }
  | { t: "keydown" | "keyup"; key: string }
  | { t: "type" | "paste"; text: string }
  | { t: "nav"; url: string }
  | { t: "back" | "forward" | "reload" };

// The dot's browser viewport (server/computer/browser.ts); clicks are scaled to it.
const SCREEN = { width: 1280, height: 800 };

// Events go out one at a time, in order. Mouse moves and wheel ticks that pile up while a request is in
// flight are merged into one, so a fast mouse doesn't build a backlog.
let chain: Promise<void> = Promise.resolve();
let queuedMove: Input | null = null;
let queuedWheel: { x: number; y: number; dx: number; dy: number } | null = null;

const post = (dotId: string, e: Input) =>
  fetch(`/api/dots/${dotId}/input`, { method: "POST", body: JSON.stringify(e) }).then(
    () => {},
    () => {},
  );

function send(dotId: string, e: Input) {
  chain = chain.then(() => post(dotId, e));
}

function sendMove(dotId: string, e: Input) {
  const first = !queuedMove;
  queuedMove = e;
  if (!first) return;
  chain = chain.then(() => {
    const m = queuedMove!;
    queuedMove = null;
    return post(dotId, m);
  });
}

function sendWheel(dotId: string, x: number, y: number, dx: number, dy: number) {
  if (queuedWheel) {
    queuedWheel = { x, y, dx: queuedWheel.dx + dx, dy: queuedWheel.dy + dy };
    return;
  }
  queuedWheel = { x, y, dx, dy };
  chain = chain.then(() => {
    const w = queuedWheel!;
    queuedWheel = null;
    return post(dotId, { t: "wheel", ...w });
  });
}

const BUTTONS = ["left", "middle", "right"] as const;
const IGNORED_KEYS = new Set(["Dead", "Unidentified", "Process", "Compose"]);

/** The dot's browser, live. When `interactive`, your mouse and keyboard drive it. */
export default function LiveBrowser({ dotId, interactive, nonce }: { dotId: string; interactive: boolean; nonce: number }) {
  const url = useStore((s) => s.urls[dotId]) ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const [held] = useState(() => new Set<string>()); // keys sent as keydown, so keyup goes out for the same ones

  const at = (el: HTMLElement, clientX: number, clientY: number) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(((clientX - r.left) / r.width) * SCREEN.width), y: Math.round(((clientY - r.top) / r.height) * SCREEN.height) };
  };

  // Wheel needs a non-passive listener so scrolling the remote page doesn't also scroll this one.
  const wheelRef = (el: HTMLDivElement | null) => {
    if (!el || !interactive) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = at(el, e.clientX, e.clientY);
      const scale = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
      sendWheel(dotId, p.x, p.y, e.deltaX * scale, e.deltaY * scale);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  };

  return (
    <div>
      {interactive && (
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-black/[0.06] bg-card px-2">
          <button className="btn-quiet size-7 p-0" aria-label="Back" onClick={() => send(dotId, { t: "back" })}>
            <ArrowLeft className="size-3.5" strokeWidth={1.75} />
          </button>
          <button className="btn-quiet size-7 p-0" aria-label="Forward" onClick={() => send(dotId, { t: "forward" })}>
            <ArrowRight className="size-3.5" strokeWidth={1.75} />
          </button>
          <button className="btn-quiet size-7 p-0" aria-label="Reload" onClick={() => send(dotId, { t: "reload" })}>
            <RotateCw className="size-3.5" strokeWidth={1.75} />
          </button>
          <form
            className="min-w-0 flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft?.trim()) send(dotId, { t: "nav", url: draft.trim() });
              setDraft(null);
              (document.activeElement as HTMLElement | null)?.blur();
            }}
          >
            <input
              className="h-7 w-full rounded-full border border-black/[0.08] bg-background px-3 font-mono text-[12px] text-foreground/75 outline-none focus:border-brand/50 focus:bg-card"
              value={draft ?? url}
              onFocus={(e) => (setDraft(url), e.target.select())}
              onBlur={() => setDraft(null)}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search or enter address"
              spellCheck={false}
            />
          </form>
        </div>
      )}
      <div
        ref={wheelRef}
        tabIndex={interactive ? 0 : -1}
        className={`dot-grid relative aspect-[1280/800] bg-popover outline-none ${interactive ? "cursor-default focus-visible:ring-2 focus-visible:ring-brand/40" : "pointer-events-none"}`}
        onContextMenu={(e) => interactive && e.preventDefault()}
        onPointerDown={(e) => {
          if (!interactive) return;
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          send(dotId, { t: "down", ...at(e.currentTarget, e.clientX, e.clientY), button: BUTTONS[e.button] ?? "left", clicks: Math.max(1, e.detail) });
        }}
        onPointerUp={(e) => {
          if (!interactive) return;
          send(dotId, { t: "up", ...at(e.currentTarget, e.clientX, e.clientY), button: BUTTONS[e.button] ?? "left", clicks: Math.max(1, e.detail) });
        }}
        onPointerMove={(e) => interactive && sendMove(dotId, { t: "move", ...at(e.currentTarget, e.clientX, e.clientY) })}
        onKeyDown={(e) => {
          if (!interactive || IGNORED_KEYS.has(e.key)) return;
          // Let ⌘V / Ctrl+V through so the paste event fires with your clipboard.
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") return;
          e.preventDefault();
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) send(dotId, { t: "type", text: e.key });
          else {
            held.add(e.key);
            send(dotId, { t: "keydown", key: e.key });
          }
        }}
        onKeyUp={(e) => {
          if (!interactive || !held.delete(e.key)) return;
          e.preventDefault();
          send(dotId, { t: "keyup", key: e.key });
        }}
        onBlur={() => {
          for (const key of held) send(dotId, { t: "keyup", key });
          held.clear();
        }}
        onPaste={(e) => {
          if (!interactive) return;
          e.preventDefault();
          const text = e.clipboardData.getData("text");
          if (text) send(dotId, { t: "paste", text });
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/dots/${dotId}/stream?n=${nonce}`} alt="" draggable={false} className="h-full w-full select-none" />
      </div>
    </div>
  );
}
