import type { ModelInfo } from "../llm/types";
import { DEFAULT_MODEL, type CatalogModel, type Fit } from "@/lib/model-catalog";

export { DEFAULT_MODEL };
export const FAST_MODEL = DEFAULT_MODEL;
export const FAST_MODEL_ALIASES = [DEFAULT_MODEL] as const;
export const QUALITY_MODELS = ["qwen3:8b", "qwen3:14b", "qwen3:32b"] as const;

export type CapabilityProfile = {
  os: NodeJS.Platform;
  arch?: string;
  cpu: string;
  ramGB: number;
  gpu: string | null;
  vramGB: number | null;
  unifiedMemory?: boolean; // Apple Silicon: GPU shares system RAM
  ollama: boolean;
  docker: boolean;
  diskFreeGB: number | null;
};

export type ModelTier = "fast" | "default" | "quality";
export type TaskComplexity = "easy" | "normal" | "hard";

export type ModelDecision = {
  complexity: TaskComplexity;
  score: number;
  preferred: string;
  selected: string;
  installed: boolean;
  usedAlias?: boolean;
  reason: string;
};

export type CatalogEntryState = CatalogModel & {
  fit: Fit;
  installed: boolean;
  recommended: boolean;
};

export type PullStatus = {
  id: string;
  state: "pulling" | "done" | "error";
  completed: number;
  total: number;
  error?: string;
  startedAt: number;
  finishedAt?: number;
};

export type ModelManagerState = {
  connected: boolean;
  profile: CapabilityProfile;
  /** Installed models that are original Ollama-library models (what the app will use). */
  installed: ModelInfo[];
  /** Installed models that were hidden because they are fine-tuned or custom. */
  hiddenCount: number;
  catalog: CatalogEntryState[];
  recommended: string;
  /** Ollama is running but no usable original model is installed yet: show the first-run chooser. */
  needsSetup: boolean;
  defaultModel: string;
  defaultInstalled: boolean;
  pulls: PullStatus[];
  browser: {
    ok: boolean;
    channel: string;
    executablePath?: string;
    error?: string;
  };
};
