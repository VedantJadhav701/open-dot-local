"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Check, Download, RefreshCw } from "lucide-react";
import { getModelSetup, getPullProgress, startModelPull } from "@/app/model-actions";
import { setDefaultModel } from "@/app/actions";
import { useStore } from "@/lib/store";
import { catalogEntry } from "@/lib/model-catalog";
import type { CatalogEntryState, ModelManagerState, PullStatus } from "@/server/models/types";

const FIT_LABEL: Record<CatalogEntryState["fit"], { text: string; cls: string }> = {
  great: { text: "Fits your GPU", cls: "bg-success/12 text-success" },
  slow: { text: "Runs slower", cls: "bg-black/[0.06] text-warning" },
  "too-large": { text: "Too large", cls: "bg-black/[0.06] text-foreground/50" },
};

function hardwareLine(state: ModelManagerState): string {
  const p = state.profile;
  const memory = `${p.ramGB.toFixed(0)} GB RAM`;
  if (p.unifiedMemory) return `${p.gpu ?? "Apple Silicon"} · ${memory} (shared with the GPU)`;
  if (p.gpu && p.vramGB) return `${p.gpu} · ${p.vramGB.toFixed(0)} GB VRAM · ${memory}`;
  if (p.gpu) return `${p.gpu} (GPU memory unknown) · ${memory}`;
  return `No dedicated GPU found · ${memory} (models will run on the CPU)`;
}

/**
 * Pick a model from the original Ollama library. Detects the computer, marks what fits, recommends one,
 * downloads with progress, and sets the default. Used in Settings and in the first-run dropdown.
 */
export default function ModelSetup({ onChanged }: { onChanged?: () => void }) {
  const currentDefault = useStore((s) => s.computer.model);
  const [state, setState] = useState<ModelManagerState | null>(null);
  const [pulls, setPulls] = useState<PullStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const wasPulling = useRef(false);

  const load = useCallback(async () => {
    try {
      setState(await getModelSetup());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    getModelSetup()
      .then((s) => alive && setState(s))
      .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)));
    getPullProgress()
      .then((p) => alive && setPulls(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // When a download finishes, refresh the list and let the parent know.
  useEffect(() => {
    const active = pulls.some((p) => p.state === "pulling");
    if (wasPulling.current && !active) {
      void load();
      onChanged?.();
    }
    wasPulling.current = active;
  }, [pulls, load, onChanged]);

  // Poll progress while downloading, and re-check every few seconds while Ollama is not running.
  useEffect(() => {
    const active = pulls.some((p) => p.state === "pulling");
    const every = active ? 1200 : state && !state.connected ? 4000 : 0;
    if (!every) return;
    const timer = setInterval(() => {
      if (active) getPullProgress().then(setPulls).catch(() => {});
      else void load();
    }, every);
    return () => clearInterval(timer);
  }, [pulls, state, load]);

  const download = (id: string) =>
    start(async () => {
      const err = await startModelPull(id);
      setError(err);
      setPulls(await getPullProgress().catch(() => []));
    });

  const makeDefault = (id: string) =>
    start(async () => {
      await setDefaultModel(id);
      onChanged?.();
    });

  if (!state) return <div className="px-4 py-3 text-body-sm text-foreground/50">{error ?? "Detecting your computer…"}</div>;

  const progressFor = (id: string) => pulls.find((p) => p.id === id);
  const listedIds = new Set(state.catalog.map((m) => m.id));
  const otherInstalled = state.installed.filter((m) => !listedIds.has(m.id));

  return (
    <div>
      <div className="flex items-start gap-3 border-b border-black/[0.06] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Your computer</div>
          <div className="mt-0.5 text-body-sm">{hardwareLine(state)}</div>
        </div>
        <button className="btn-quiet" onClick={() => void load()} title="Detect again">
          <RefreshCw className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>

      {!state.connected ? (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-48 flex-1 text-body-sm text-warning">Ollama is not installed or not running. Install it, open it once, and this page will detect it.</div>
          <a className="btn-primary h-8 px-3 text-[13px]" href="https://ollama.com/download" target="_blank" rel="noreferrer">
            Install Ollama
          </a>
        </div>
      ) : (
        <ul className="divide-y divide-black/[0.06]">
          {state.catalog.map((m) => {
            const p = progressFor(m.id);
            const pulling = p?.state === "pulling";
            const pct = p && p.total ? Math.min(100, Math.round((p.completed / p.total) * 100)) : 0;
            const fit = FIT_LABEL[m.fit];
            const isDefault = currentDefault === m.id;
            return (
              <li key={m.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium">{m.label}</span>
                      {m.recommended && <span className="rounded-xs bg-brand/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-brand-readable uppercase">Recommended</span>}
                      <span className={`rounded-xs px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase ${fit.cls}`}>{fit.text}</span>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-foreground/50">{m.id}</div>
                    <div className="mt-0.5 text-caption text-foreground/55">
                      {m.params} · {m.sizeGB} GB download · {m.note}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {m.installed ? (
                      isDefault ? (
                        <span className="flex items-center gap-1 text-caption text-success">
                          <Check className="size-3.5" strokeWidth={2} /> Default
                        </span>
                      ) : (
                        <button className="btn-secondary h-8 px-3 text-[13px]" disabled={pending} onClick={() => makeDefault(m.id)}>
                          Use this
                        </button>
                      )
                    ) : pulling ? (
                      <span className="font-mono text-caption text-foreground/55">{pct}%</span>
                    ) : (
                      <button
                        className={`${m.recommended ? "btn-primary" : "btn-secondary"} h-8 px-3 text-[13px]`}
                        disabled={pending || m.fit === "too-large"}
                        title={m.fit === "too-large" ? "This computer does not have enough memory for this model" : undefined}
                        onClick={() => download(m.id)}
                      >
                        <Download className="mr-1 inline size-3.5" strokeWidth={1.75} />
                        {p?.state === "error" ? "Retry" : "Download"}
                      </button>
                    )}
                  </div>
                </div>
                {pulling && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
                    <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
                  </div>
                )}
                {p?.state === "error" && <div className="mt-1.5 text-caption text-destructive">{p.error}</div>}
              </li>
            );
          })}
        </ul>
      )}

      {otherInstalled.length > 0 && (
        <div className="border-t border-black/[0.06] px-4 py-3">
          <div className="eyebrow mb-2">Also installed (original models)</div>
          <div className="flex flex-wrap gap-2">
            {otherInstalled.map((m) => (
              <button
                key={m.id}
                className="rounded-md border border-black/10 bg-background px-2.5 py-1 font-mono text-[11px] hover:border-black/25"
                title={catalogEntry(m.id)?.note ?? "Use as default"}
                disabled={pending || currentDefault === m.id}
                onClick={() => makeDefault(m.id)}
              >
                {m.id}
                {currentDefault === m.id ? " ✓" : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-black/[0.06] px-4 py-2.5 text-caption text-foreground/50">
        Only original models from the Ollama library are listed. Fine-tuned or custom models are hidden
        {state.hiddenCount > 0 ? ` (${state.hiddenCount} hidden on this computer)` : ""}.
      </div>
      {error && <div className="border-t border-black/[0.06] px-4 py-2.5 text-caption text-destructive">{error}</div>}
    </div>
  );
}
