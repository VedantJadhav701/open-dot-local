import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Sky: OpenAI's computer-use runtime that ships with the ChatGPT Mac app. It controls real Mac apps
// through the accessibility tree (plus window screenshots) via a signed helper service.
//
// We drive it exactly the way ChatGPT does: spawn OpenAI's `cua_repl` MCP server with the bundled,
// OpenAI-signed node (the service only trusts that chain) and call its `js` tool, which runs model-
// written JavaScript against a `cua` API. Per-app access arrives as MCP elicitations, which we turn
// into approval cards. These are private OpenAI internals, so everything here fails soft.

const HOME = os.homedir();
const CUA_NODE = "/Applications/ChatGPT.app/Contents/Resources/cua_node";
const PLUGIN_CACHE = path.join(HOME, ".codex/plugins/cache/openai-bundled/unified-computer-use");

type Launch = { command: string; args: string[]; env: Record<string, string> };

/** Prefer the launch recipe ChatGPT itself generates (survives app updates); fall back to the known one. */
function launchRecipe(): Launch | null {
  const base: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME,
    USER: process.env.USER ?? "",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
  };
  try {
    const versions = fs.readdirSync(PLUGIN_CACHE).sort();
    const file = path.join(PLUGIN_CACHE, versions[versions.length - 1], ".mcp.json");
    const cfg = JSON.parse(fs.readFileSync(file, "utf8")) as { mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }> };
    const server = cfg.mcpServers?.cua_repl;
    if (server && fs.existsSync(server.command)) {
      // Dots have their own browser; only enable the native computer surface.
      return { command: server.command, args: server.args, env: { ...base, ...server.env, CUA_REPL_ENABLED_SURFACES: "computer" } };
    }
  } catch {}
  const node = `${CUA_NODE}/bin/node`;
  const repl = `${CUA_NODE}/lib/node_modules/@oai/cua-repl/bin/cua-repl.mjs`;
  if (!fs.existsSync(node) || !fs.existsSync(repl)) return null;
  return {
    command: node,
    args: [repl],
    env: {
      ...base,
      CUA_REPL_NODE_REPL_PATH: `${CUA_NODE}/bin/node_repl`,
      CUA_REPL_ENABLED_SURFACES: "computer",
      NODE_REPL_TRUSTED_SERVICES: JSON.stringify({ sky: "@oai/sky/service" }),
      NODE_REPL_NODE_PATH: node,
      NODE_REPL_NODE_MODULE_DIRS: `${CUA_NODE}/lib/node_modules`,
      NODE_REPL_TRUSTED_CODE_PATHS: `${HOME}/.codex:${CUA_NODE}/lib/node_modules`,
      CODEX_HOME: `${HOME}/.codex`,
      SKY_CUA_SERVICE_PATH: `${HOME}/.codex/computer-use/Codex Computer Use.app`,
      NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS: "1000",
    },
  };
}

export function skyInstalled(): boolean {
  return launchRecipe() !== null;
}

/** What the runtime asks the user when Sky wants to use a new app. */
export type AppApproval = { app: string; message: string; canAlways: boolean };
export type Approver = (req: AppApproval) => Promise<"session" | "always" | "decline">;
export type SkyResult = { text: string; images: string[] };

type Session = { client: Client; description: string; approver: Approver | null };
const g = globalThis as unknown as { __dotsSky?: Map<string, Promise<Session>> };
const sessions = (g.__dotsSky ??= new Map());

async function start(dotId: string): Promise<Session> {
  const recipe = launchRecipe();
  if (!recipe) throw new Error("Sky isn't installed. Install the ChatGPT desktop app and enable Computer Use once.");
  const transport = new StdioClientTransport({ ...recipe, stderr: "ignore" });
  const client = new Client({ name: "dots", version: "1.0.0" }, { capabilities: { elicitation: {} } });
  const session: Session = { client, description: "", approver: null };

  client.setRequestHandler(ElicitRequestSchema, async (req) => {
    const params = req.params as { message: string; _meta?: { persist?: string[]; tool_params_display?: { name: string; value: string }[] } };
    const app = params._meta?.tool_params_display?.find((p) => p.name === "app")?.value ?? "an app";
    const choice = session.approver
      ? await session.approver({ app, message: params.message, canAlways: params._meta?.persist?.includes("always") ?? false })
      : "decline";
    return choice === "decline" ? { action: "decline" } : { action: "accept", content: {}, _meta: { persist: choice } };
  });

  transport.onclose = () => sessions.delete(dotId);
  await client.connect(transport);
  const { tools } = await client.listTools();
  session.description = tools.find((t) => t.name === "js")?.description ?? "Control native Mac apps by writing JavaScript against the `cua` API.";
  return session;
}

function session(dotId: string): Promise<Session> {
  let s = sessions.get(dotId);
  if (!s) {
    s = start(dotId);
    sessions.set(dotId, s);
    s.catch(() => sessions.delete(dotId));
  }
  return s;
}

/** The `js` tool description Sky ships (API docs pointer + usage rules), used verbatim for our tool. */
export async function skyDescription(dotId: string): Promise<string> {
  return (await session(dotId)).description;
}

/** Run model-written JavaScript against Sky's `cua` API on the user's Mac. */
export async function runSky(
  dotId: string,
  code: string,
  opts: { title: string; turnId: string; callId: string; approver: Approver; signal: AbortSignal },
): Promise<SkyResult> {
  const s = await session(dotId);
  s.approver = opts.approver;
  try {
    const res = await s.client.callTool(
      {
        name: "js",
        arguments: { code, title: opts.title.slice(0, 80), timeout_ms: 120_000 },
        _meta: { "x-codex-turn-metadata": { session_id: dotId, turn_id: opts.turnId, call_id: opts.callId } },
      },
      undefined,
      { signal: opts.signal, timeout: 15 * 60_000 }, // allow time for the user to answer an app-approval card
    );
    const content = (res.content ?? []) as ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];
    const text = content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
    const images = content.flatMap((c) => (c.type === "image" ? [`data:${c.mimeType};base64,${c.data}`] : []));
    return { text: (res.isError ? "Error: " : "") + (text || "(no output)"), images };
  } finally {
    s.approver = null;
  }
}

/** Release Sky's hold on apps at the end of an agent turn (idempotent). */
export async function endSkyTurn(dotId: string, turnId: string) {
  const s = sessions.get(dotId);
  if (!s) return;
  try {
    await (await s).client.callTool({ name: "turn_ended", arguments: { hook_event_name: "Stop", session_id: dotId, turn_id: turnId } });
  } catch {}
}

export async function stopSky(dotId: string) {
  const s = sessions.get(dotId);
  sessions.delete(dotId);
  if (s) await (await s).client.close().catch(() => {});
}
