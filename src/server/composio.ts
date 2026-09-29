import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Tool as McpTool } from "@modelcontextprotocol/sdk/types.js";
import { emit } from "./bus";
import { getSetting, setSetting } from "./db";
import { seal, unseal } from "./vault";
import type { RuleDecision, ToolkitState } from "@/lib/types";

// Composio For You: Composio's consumer product. The user signs in with their own Composio account
// (OAuth, no developer key) and their dots get the user's apps through Composio's hosted MCP server.
// Every tool call still runs through our loop, so rules and approval cards apply.

export const MCP_URL = "https://connect.composio.dev/mcp";
const APP_URL = process.env.DOTS_PUBLIC_URL ?? "http://localhost:3100";
const REDIRECT_URL = `${APP_URL}/api/composio/oauth`;
export const SUGGESTED = ["gmail", "googlecalendar", "slack", "notion", "github", "googledrive", "linear", "outlook"];
const HIDDEN_TOOLS = /REMOTE_BASH|REMOTE_WORKBENCH|SKILL|SUBMIT_FEEDBACK|WAIT_FOR_CONNECTIONS/;

// ---------- OAuth storage (sealed with the vault key) ----------

type Stored = { client?: OAuthClientInformationMixed; tokens?: OAuthTokens; verifier?: string; discovery?: OAuthDiscoveryState };
const load = (): Stored => {
  const raw = getSetting("composio_oauth");
  try {
    return raw ? (JSON.parse(unseal(raw)) as Stored) : {};
  } catch {
    return {};
  }
};
const save = (patch: Partial<Stored>) => setSetting("composio_oauth", seal(JSON.stringify({ ...load(), ...patch })));

class Provider implements OAuthClientProvider {
  pendingUrl: URL | null = null;
  get redirectUrl() {
    return REDIRECT_URL;
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Open Dot",
      redirect_uris: [REDIRECT_URL],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }
  clientInformation() {
    return load().client;
  }
  saveClientInformation(client: OAuthClientInformationMixed) {
    save({ client });
  }
  tokens() {
    return load().tokens;
  }
  saveTokens(tokens: OAuthTokens) {
    save({ tokens });
  }
  redirectToAuthorization(url: URL) {
    this.pendingUrl = url;
  }
  saveCodeVerifier(verifier: string) {
    save({ verifier });
  }
  codeVerifier() {
    const v = load().verifier;
    if (!v) throw new Error("Missing PKCE verifier; start sign-in again.");
    return v;
  }
  saveDiscoveryState(discovery: OAuthDiscoveryState) {
    save({ discovery });
  }
  discoveryState() {
    return load().discovery;
  }
  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all") setSetting("composio_oauth", null);
    else save({ [scope === "client" ? "client" : scope]: undefined } as Partial<Stored>);
  }
}

// ---------- connection ----------

type State = {
  client: Client | null;
  pending: StreamableHTTPClientTransport | null; // transport waiting for the OAuth code
  tools: McpTool[];
  connected: string[]; // app slugs connected in the user's Composio account
  connecting: Promise<void> | null;
};
const g = globalThis as unknown as { __dotsComposio?: State };
const st = (g.__dotsComposio ??= { client: null, pending: null, tools: [], connected: [], connecting: null });

export const signedIn = () => Boolean(st.client) || Boolean(load().tokens);

/** Connect with saved tokens, or return the sign-in URL if the user needs to (re)authorize. */
async function connect(): Promise<{ url: string } | null> {
  const provider = new Provider();
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: provider });
  const client = new Client({ name: "dots", version: "1.0.0" });
  try {
    await client.connect(transport);
  } catch (err) {
    if (err instanceof UnauthorizedError && provider.pendingUrl) {
      st.pending = transport;
      return { url: provider.pendingUrl.toString() };
    }
    throw err;
  }
  st.client = client;
  st.pending = null;
  await refresh();
  return null;
}

async function ensureClient(): Promise<Client> {
  if (st.client) return st.client;
  if (!load().tokens) throw new Error("Composio isn't connected. Sign in from Settings → Apps.");
  st.connecting ??= connect()
    .then((r) => {
      if (r) throw new Error("Your Composio sign-in expired. Sign in again from Settings → Apps.");
    })
    .finally(() => (st.connecting = null));
  await st.connecting;
  return st.client!;
}

/** Start sign-in. Returns the Composio authorization URL, or null if already signed in. */
export async function signIn(): Promise<string | null> {
  if (st.client) return null;
  const r = await connect();
  return r?.url ?? null;
}

/** OAuth redirect lands here with the code. */
export async function finishSignIn(code: string) {
  if (!st.pending) throw new Error("No sign-in in progress.");
  await st.pending.finishAuth(code);
  st.pending = null;
  const r = await connect();
  if (r) throw new Error("Composio sign-in didn't complete. Try again.");
}

export async function signOut() {
  await st.client?.close().catch(() => {});
  st.client = null;
  st.tools = [];
  st.connected = [];
  setSetting("composio_oauth", null);
  publish();
}

/** Re-list Composio's tools (their descriptions also carry which apps the user has connected). */
export async function refresh() {
  const client = st.client ?? (await ensureClient());
  const { tools } = await client.listTools();
  st.tools = tools.filter((t) => !HIDDEN_TOOLS.test(t.name));
  const search = tools.find((t) => t.name === "COMPOSIO_SEARCH_TOOLS")?.description ?? "";
  const listed = search.match(/connected the apps:\s*([^.\n]+)/i)?.[1];
  if (listed) st.connected = listed.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  publish();
}

export function apps(): ToolkitState[] {
  const slugs = [...st.connected, ...SUGGESTED.filter((s) => !st.connected.includes(s))];
  return slugs.map((slug) => ({ slug, name: prettyName(slug), logo: `https://logos.composio.dev/api/${slug}`, connected: st.connected.includes(slug) }));
}

function publish() {
  emit({ type: "composio", data: apps() });
}

const NAMES: Record<string, string> = {
  gmail: "Gmail", googlecalendar: "Google Calendar", googledrive: "Google Drive", googlesheets: "Google Sheets", googledocs: "Google Docs",
  github: "GitHub", linkedin: "LinkedIn", metaads: "Meta Ads", posthog: "PostHog", serpapi: "SerpApi", youtube: "YouTube",
  google_search_console: "Search Console", outlook: "Outlook", notion: "Notion", slack: "Slack", linear: "Linear", figma: "Figma", reddit: "Reddit", ahrefs: "Ahrefs",
};
const prettyName = (slug: string) => NAMES[slug] ?? slug.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// ---------- calling tools ----------

const clip = (s: string, n = 30_000) => (s.length > n ? `${s.slice(0, n)}…[truncated]` : s);

export async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const run = async () => {
    const client = await ensureClient();
    const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 5 * 60_000 });
    const content = (res.content ?? []) as { type: string; text?: string }[];
    const text = content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
    return (res.isError ? "Error: " : "") + clip(text || "(no output)");
  };
  try {
    return await run();
  } catch (err) {
    // Session dropped (e.g. server restarted it): reconnect once with the saved tokens.
    st.client = null;
    if (err instanceof Error && /expired|isn't connected/.test(err.message)) throw err;
    return run();
  }
}

// ---------- read vs write, for approvals ----------

const READ_VERB = /_(GET|LIST|SEARCH|FETCH|FIND|READ|RETRIEVE|QUERY|DESCRIBE|LOOKUP|VIEW|CHECK|COUNT|EXPORT|DOWNLOAD)(_|$)/;
type ExecItem = { tool_slug?: string; arguments?: unknown };

export function executeItems(args: Record<string, unknown>): ExecItem[] {
  return Array.isArray(args.tools) ? (args.tools as ExecItem[]) : [];
}

/** Reads run automatically; anything else (send, post, create, update, delete…) asks first. */
export function executeDecision(args: Record<string, unknown>): RuleDecision {
  const items = executeItems(args);
  return items.length && items.every((i) => READ_VERB.test(String(i.tool_slug ?? "").toUpperCase())) ? "allow" : "ask";
}

export function describeExecute(args: Record<string, unknown>): string {
  const items = executeItems(args);
  const apps = [...new Set(items.map((i) => prettyName(String(i.tool_slug ?? "").split("_")[0].toLowerCase())))];
  const actions = items.map((i) => String(i.tool_slug ?? "").split("_").slice(1).join(" ").toLowerCase()).filter(Boolean);
  const thought = typeof args.thought === "string" && args.thought.trim() ? args.thought.trim().replace(/\.$/, "") : null;
  return thought ? `${thought.replace(/^./, (c) => c.toLowerCase())} (using ${apps.join(", ")})` : `use ${apps.join(", ")} to ${actions.join(", ")}`;
}

export function executeDetail(args: Record<string, unknown>): string {
  return executeItems(args)
    .map((i) => `${i.tool_slug}\n${JSON.stringify(i.arguments ?? {}, null, 1).slice(0, 700)}`)
    .join("\n\n");
}

export function mcpTools(): McpTool[] {
  return st.tools;
}

// ---------- connecting an app ----------

export async function isConnected(toolkit: string): Promise<boolean> {
  if (st.connected.includes(toolkit)) return true;
  const out = await callTool("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [{ name: toolkit, action: "list" }] });
  const active = /"status"\s*:\s*"ACTIVE"/i.test(out);
  if (active && !st.connected.includes(toolkit)) {
    st.connected.push(toolkit);
    publish();
  }
  return active;
}

/** Create a Composio auth link for an app. `wait()` resolves once the connection is active. */
export async function startConnect(toolkit: string) {
  if (await isConnected(toolkit)) return { already: true as const };
  const out = await callTool("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [{ name: toolkit, action: "add" }] });
  const url = out.match(/"redirect_url"\s*:\s*"([^"]+)"/)?.[1] ?? out.match(/https:\/\/[^\s"')\]]+/)?.[0];
  if (!url) throw new Error(`Composio didn't return a sign-in link for ${toolkit}: ${out.slice(0, 300)}`);
  return {
    already: false as const,
    name: prettyName(toolkit),
    url,
    wait: async () => {
      const deadline = Date.now() + 10 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000));
        if (await isConnected(toolkit).catch(() => false)) return;
      }
      throw new Error("Timed out waiting for the connection.");
    },
  };
}
