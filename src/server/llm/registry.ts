import "server-only";
import { OllamaProvider } from "./ollama";
import type { LLMProvider, ModelInfo } from "./types";
import { getSetting, setSetting } from "../db";
import { DEFAULT_MODEL } from "../models/types";
import { MODEL_CATALOG, isOfficialModel } from "@/lib/model-catalog";

let activeProvider: LLMProvider = new OllamaProvider();

export function getProvider(model?: string): LLMProvider {
  const { hasCloudBoostKey, getCloudBoostKey } = require("../vault");
  let cloudModel = getSetting("cloud_boost_model") || "moonshotai/kimi-k3";
  if (cloudModel.includes("llama-3.1-70b")) {
    cloudModel = "moonshotai/kimi-k3";
  }
  const cloudUrl = getSetting("cloud_boost_url") || "https://api.openai.com/v1";

  const isCloudTarget =
    model &&
    (model === cloudModel ||
      model.includes("moonshotai") ||
      model.includes("kimi") ||
      model.includes("muse-glimmer") ||
      model.includes("meta/") ||
      model.includes("cloud"));

  if (hasCloudBoostKey() && isCloudTarget) {
    const { OpenAICompatProvider } = require("./openai-compat");
    return new OpenAICompatProvider({
      baseUrl: cloudUrl,
      apiKey: getCloudBoostKey() || undefined,
      model: model || cloudModel,
    });
  }

  return activeProvider;
}

export function setProvider(provider: LLMProvider) {
  activeProvider = provider;
}

export async function isOllamaConnected(): Promise<boolean> {
  return activeProvider.health();
}

// ---------- which models the app is allowed to use ----------

/** Cloud Boost model ids, only while the user has saved a key. */
function cloudModelIds(): string[] {
  const { hasCloudBoostKey } = require("../vault");
  if (!hasCloudBoostKey()) return [];
  const cloudModel = getSetting("cloud_boost_model") || "moonshotai/kimi-k3";
  return [cloudModel, "meta/muse-glimmer-30b"];
}

/** Original (not fine-tuned, not custom) model from the official Ollama library. */
export function isOriginalStandardModel(modelId: string): boolean {
  return isOfficialModel(modelId);
}

/** An original local model, or a Cloud Boost model the user switched on. */
export function isAllowedModel(modelId: string): boolean {
  return isOfficialModel(modelId) || cloudModelIds().includes(modelId);
}

export async function listAvailableModels(): Promise<ModelInfo[]> {
  const isHealthy = await isOllamaConnected();
  const rawModels = isHealthy ? await activeProvider.listModels() : [];
  const models = rawModels.filter((m) => isOfficialModel(m.id));

  for (const cm of cloudModelIds()) {
    if (!models.some((m) => m.id === cm)) {
      models.push({ id: cm, name: `${cm} (Cloud)` });
    }
  }

  return models;
}

/**
 * Pick the model to use. Only original local models (and Cloud Boost models the user turned on) are
 * considered. A fine-tuned or custom model, even a saved one, is never used. Without a good match this
 * falls back to the best installed original model, never to a cloud model, and never to a custom one.
 */
export function pickBestAvailableModel(available: string[], preferredTarget?: string): string {
  const cloud = cloudModelIds();
  const pool = (available ?? []).filter((m) => isAllowedModel(m));

  if (pool.length === 0) {
    return preferredTarget && isAllowedModel(preferredTarget) ? preferredTarget : DEFAULT_MODEL;
  }

  if (preferredTarget && pool.includes(preferredTarget)) return preferredTarget;

  const defaultSaved = getSetting("default_model");
  if (defaultSaved && pool.includes(defaultSaved)) return defaultSaved;

  const local = pool.filter((m) => !cloud.includes(m));
  const order = [DEFAULT_MODEL, ...MODEL_CATALOG.map((m) => m.id)];
  for (const id of order) {
    if (local.includes(id)) return id;
  }
  return local[0] ?? preferredTarget ?? DEFAULT_MODEL;
}

// ---------- cached model list (the UI reads this synchronously) ----------

let lastResolved: { main: string; review: string; available: string[] } = {
  main: DEFAULT_MODEL,
  review: DEFAULT_MODEL,
  available: [],
};

let lastRefreshAt = 0;
let refreshing = false;

/** Re-read Ollama in the background when the cached list is stale, so the first snapshot is not empty forever. */
function refreshIfStale(maxAgeMs = 4000) {
  if (refreshing || Date.now() - lastRefreshAt < maxAgeMs) return;
  refreshing = true;
  void resolveModels()
    .catch(() => {})
    .finally(() => {
      refreshing = false;
    });
}

export function getResolvedSync(): { main: string; review: string; available: string[] } {
  refreshIfStale();
  const available = [...lastResolved.available];
  for (const cm of cloudModelIds()) {
    if (!available.includes(cm)) available.push(cm);
  }
  return { ...lastResolved, available };
}

function usableSaved(key: string): string | null {
  const saved = getSetting(key);
  return saved && isAllowedModel(saved) ? saved : null;
}

export async function resolveModels(): Promise<{ main: string; review: string; available: string[] }> {
  const models = await listAvailableModels();
  const modelIds = models.map((m) => m.id);

  const envMain = process.env.DOTS_MODEL;
  const envReview = process.env.DOTS_REVIEW_MODEL;

  const savedMain = usableSaved("default_model");
  const main = envMain || pickBestAvailableModel(modelIds, savedMain ?? DEFAULT_MODEL);

  const savedReview = usableSaved("review_model");
  const review = envReview || (savedReview ? pickBestAvailableModel(modelIds, savedReview) : main);

  lastResolved = { main, review, available: modelIds };
  lastRefreshAt = Date.now();

  return lastResolved;
}

export async function activeModel(override?: string | null): Promise<string> {
  const res = await resolveModels();
  const target = override || getSetting("default_model") || DEFAULT_MODEL;

  return pickBestAvailableModel(res.available, target);
}

export async function activeReviewModel(): Promise<string> {
  const res = await resolveModels();
  const target = getSetting("review_model") || res.main || DEFAULT_MODEL;

  return pickBestAvailableModel(res.available, target);
}

export function setDefaultModel(modelId: string) {
  setSetting("default_model", modelId);
}

export function setReviewModel(modelId: string) {
  setSetting("review_model", modelId);
}
