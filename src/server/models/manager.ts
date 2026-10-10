import "server-only";
import { OllamaProvider } from "../llm/ollama";
import { checkSystemHealth } from "../health";
import { detectCapabilities } from "./detector";
import { pullStatuses } from "./downloader";
import { MODEL_CATALOG, fitFor, isOfficialModel, recommendedModel } from "@/lib/model-catalog";
import { DEFAULT_MODEL, type ModelManagerState } from "./types";

export async function modelManagerState(): Promise<ModelManagerState> {
  const provider = new OllamaProvider();
  const connected = await provider.health();
  const [profile, allInstalled, health] = await Promise.all([
    detectCapabilities(),
    connected ? provider.listModels() : Promise.resolve([]),
    checkSystemHealth(),
  ]);

  const installed = allInstalled.filter((m) => isOfficialModel(m.id));
  const installedIds = new Set(installed.map((m) => m.id));
  const recommended = recommendedModel(profile);

  return {
    connected,
    profile,
    installed,
    hiddenCount: allInstalled.length - installed.length,
    catalog: MODEL_CATALOG.map((m) => ({
      ...m,
      fit: fitFor(m, profile),
      installed: installedIds.has(m.id),
      recommended: m.id === recommended,
    })),
    recommended,
    needsSetup: connected && installed.length === 0,
    defaultModel: DEFAULT_MODEL,
    defaultInstalled: installedIds.has(DEFAULT_MODEL),
    pulls: pullStatuses(),
    browser: health.browser,
  };
}
