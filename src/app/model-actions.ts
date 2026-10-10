"use server";

import type { ModelManagerState, PullStatus } from "@/server/models/types";

/** Full first-run / settings state: hardware, catalog with fit, installed models, active downloads. */
export async function getModelSetup(): Promise<ModelManagerState> {
  const { modelManagerState } = await import("@/server/models/manager");
  return modelManagerState();
}

/** Start downloading an original Ollama model in the background. Returns an error message or null. */
export async function startModelPull(model: string): Promise<string | null> {
  try {
    const { startPull } = await import("@/server/models/downloader");
    startPull(String(model));
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function getPullProgress(): Promise<PullStatus[]> {
  const { pullStatuses } = await import("@/server/models/downloader");
  return pullStatuses();
}

/** Light call for the model dropdown: the models the app may use right now. */
export async function getModelOptions(): Promise<{ models: string[]; defaultModel: string; connected: boolean; needsSetup: boolean }> {
  const { resolveModels, isOllamaConnected } = await import("@/server/llm");
  const { isOfficialModel } = await import("@/lib/model-catalog");
  const [resolved, connected] = await Promise.all([resolveModels(), isOllamaConnected().catch(() => false)]);
  const local = resolved.available.filter((m) => isOfficialModel(m));
  return { models: resolved.available, defaultModel: resolved.main, connected, needsSetup: connected && local.length === 0 };
}
