"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Cpu } from "lucide-react";
import { useStore } from "@/lib/store";
import { getModelOptions } from "@/app/model-actions";
import { DEFAULT_MODEL, catalogEntry, isOfficialModel } from "@/lib/model-catalog";
import ModelSetup from "./ModelSetup";

type Options = Awaited<ReturnType<typeof getModelOptions>>;

// The first-run chooser opens by itself; once the user closes it, it stays closed for this browser session.
const DISMISS_KEY = "odl-model-setup-dismissed";
const wasDismissed = () => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};
const markDismissed = () => {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* storage can be unavailable; the chooser then just opens again next time */
  }
};

function hint(id: string): string | null {
  if (!isOfficialModel(id)) return "Cloud · optional · sends data to your provider";
  if (id === DEFAULT_MODEL) return "Recommended · fast, reliable";
  const entry = catalogEntry(id);
  return entry ? `${entry.params} · ${entry.sizeGB} GB` : null;
}

/**
 * Model dropdown. `value === null` means "use the default"; pass `allowDefault={false}` for the
 * place where the default itself is chosen. The list is read from Ollama each time it is needed, and
 * only original models are shown. If none is installed, a first-run chooser opens with a recommended model.
 */
export default function ModelPicker({
  value,
  onChange,
  allowDefault = true,
  compact = false,
}: {
  value: string | null;
  onChange: (model: string | null) => void;
  allowDefault?: boolean;
  compact?: boolean;
}) {
  const storeModels = useStore((s) => s.computer.models);
  const fallback = useStore((s) => s.computer.model);
  const [open, setOpen] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [opts, setOpts] = useState<Options | null>(null);
  const autoOpened = useRef(false);

  const refresh = useCallback(() => {
    getModelOptions().then(setOpts).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // First run: no usable model installed, so open the chooser straight away.
  useEffect(() => {
    if (opts?.needsSetup && !autoOpened.current && !wasDismissed()) {
      autoOpened.current = true;
      setOpen(true);
      setShowSetup(true);
    }
  }, [opts]);

  const needsSetup = Boolean(opts?.needsSetup);
  const list = opts ? opts.models : storeModels.length ? storeModels : fallback ? [fallback] : [];
  const current = value ?? opts?.defaultModel ?? fallback;
  const local = list.filter((id) => isOfficialModel(id));
  const cloud = list.filter((id) => !isOfficialModel(id));

  const close = () => {
    setOpen(false);
    setShowSetup(false);
    markDismissed();
  };

  const option = (id: string | null, label: string, sub: string | null) => {
    const selected = id === value;
    return (
      <button
        key={id ?? "__default"}
        type="button"
        role="option"
        aria-selected={selected}
        onClick={() => {
          onChange(id);
          close();
        }}
        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${selected ? "bg-black/[0.05]" : "hover:bg-black/[0.03]"}`}
      >
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] ${id ? "font-mono" : ""}`}>{label}</span>
          {sub && <span className="block truncate font-mono text-[10px] tracking-wide text-foreground/45 uppercase">{sub}</span>}
        </span>
        {selected && <Check className="size-3.5 shrink-0 text-foreground" strokeWidth={2} />}
      </button>
    );
  };

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          setShowSetup(false);
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-md border bg-card font-mono tracking-wide transition-colors hover:text-foreground ${needsSetup ? "border-warning/60 text-warning" : "border-black/10 text-foreground/75 hover:border-black/20"} ${compact ? "h-8 px-2.5 text-[11px]" : "h-9 px-3 text-[12px]"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Model this dot thinks with"
      >
        <Cpu className="size-3.5 text-foreground/45" strokeWidth={1.75} />
        {needsSetup ? (
          <span>Choose a model</span>
        ) : (
          <>
            {value === null && allowDefault ? <span className="text-foreground/45">Default ·</span> : null}
            <span className="max-w-40 truncate">{current || "Loading…"}</span>
          </>
        )}
        <ChevronDown className={`size-3.5 text-foreground/40 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />
      </button>

      {open && (
        <div
          role="listbox"
          tabIndex={-1}
          className={`surface absolute top-full right-0 z-40 mt-1.5 max-h-[70vh] overflow-y-auto p-1 shadow-elevated outline-none ${showSetup ? "w-[26rem] max-w-[90vw]" : "w-72"}`}
        >
          {showSetup ? (
            <>
              <div className="flex items-center justify-between px-2.5 pt-1.5 pb-1">
                <span className="eyebrow">{needsSetup ? "Choose your model" : "Get more models"}</span>
                {!needsSetup && (
                  <button type="button" className="btn-quiet h-7 px-2 text-[12px]" onClick={() => setShowSetup(false)}>
                    Back
                  </button>
                )}
              </div>
              <ModelSetup
                onChanged={() => {
                  refresh();
                }}
              />
            </>
          ) : (
            <>
              <div className="eyebrow px-2.5 pt-1.5 pb-1">Model</div>
              {allowDefault && option(null, "Default", opts?.defaultModel ?? (fallback || null))}
              {local.length > 0 && (
                <>
                  <div className="eyebrow px-2.5 pt-2.5 pb-1">On this computer</div>
                  {local.map((id) => option(id, id, hint(id)))}
                </>
              )}
              {cloud.length > 0 && (
                <>
                  <div className="eyebrow px-2.5 pt-2.5 pb-1">Cloud (optional)</div>
                  {cloud.map((id) => option(id, id, hint(id)))}
                </>
              )}
              {opts && !opts.connected && <div className="px-2.5 py-2 text-caption text-warning">Ollama is not running.</div>}
              {opts && opts.connected && local.length === 0 && <div className="px-2.5 py-2 text-caption text-foreground/50">No original model installed yet.</div>}
              {!opts && !list.length && <div className="px-2.5 py-2 text-caption text-foreground/45">Loading models…</div>}
              <button
                type="button"
                onClick={() => setShowSetup(true)}
                className="mt-1 flex w-full items-center rounded-md border-t border-black/[0.06] px-2.5 py-2 text-left text-[13px] text-brand-readable hover:bg-black/[0.03]"
              >
                Get more models…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
