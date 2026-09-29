// Builds src/data/apps.json: the Composio app directory (names, logos, categories, tool counts)
// from Composio's public toolkit pages. Re-run occasionally: `node scripts/build-catalog.mjs`.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const OUT = path.join(ROOT, "src/data/apps.json");
const UA = { "user-agent": "dots-catalog/1.0" };

const CATEGORY_LABELS = {
  "developer tools & devops": "Developer Tools",
  "collaboration & communication": "Communication",
  "ai & machine learning": "Artificial Intelligence",
  "document & file management": "Content & Files",
  "productivity & project management": "Productivity & Projects",
  crm: "Sales & CRM",
  "sales & customer support": "Sales & CRM",
  "analytics & data": "Data & Analytics",
  "data & analytics": "Data & Analytics",
  "entertainment & media": "Media",
  "education & lms": "Education",
  "design & creative tools": "Design",
  "marketing & social media": "Marketing",
  "advertising & marketing": "Marketing",
  "social media": "Marketing",
  "scheduling & booking": "Scheduling",
  "e-commerce": "Commerce & Payments",
  "finance & accounting": "Finance",
  "hr & recruiting": "HR & Recruiting",
  "workflow automation": "Automation",
};

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
    } catch {}
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return null;
}

/** Pull the toolkit records out of the page's React Server Component payload. */
function extractRecords(html) {
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map((m) => JSON.parse(m[1]));
  const text = chunks.join("");
  const records = new Map();
  const re = /\{"id":\d+,"documentId":"[^"]+",(?:"name":"(?:[^"\\]|\\.)*",)?"slug":"([^"]+)","short_description"/g;
  for (let m; (m = re.exec(text)); ) {
    // brace-match the object, respecting strings
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = m.index; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end < 0) continue;
    try {
      const rec = JSON.parse(text.slice(m.index, end));
      if (rec.is_live !== false && !records.has(rec.slug)) records.set(rec.slug, rec);
    } catch {}
  }
  // The page also carries a ranked "popular" list: {"slug","name","description","logo","rank"}.
  const ranks = new Map();
  for (const m of text.matchAll(/\{"slug":"([^"]+)","name":"(?:[^"\\]|\\.)*","description":"(?:[^"\\]|\\.)*","logo":"[^"]*","rank":(\d+)\}/g)) {
    if (!ranks.has(m[1])) ranks.set(m[1], Number(m[2]));
  }
  return { records: [...records.values()], ranks };
}

function details(md) {
  const num = (label) => Number(md?.match(new RegExp(`^- ${label}: (\\d+)`, "m"))?.[1] ?? 0);
  return {
    tools: num("Tools"),
    triggers: num("Triggers"),
    managed: /"is_composio_managed":\s*true/.test(md ?? ""),
    name: md?.match(/^# (.+)$/m)?.[1]?.trim(),
  };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
        if (++done % 100 === 0) console.log(`  ${done}/${items.length}`);
      }
    }),
  );
  return out;
}

// Brand casing the public data gets wrong.
const NAME_FIX = {
  serpapi: "SerpApi", elevenlabs: "ElevenLabs", peopledatalabs: "People Data Labs", posthog: "PostHog", tikhub: "TikHub",
  datarobot: "DataRobot", hubspot: "HubSpot", youtube: "YouTube", linkedin: "LinkedIn", github: "GitHub", openai: "OpenAI",
  clickup: "ClickUp", sendgrid: "SendGrid", pagerduty: "PagerDuty", mailchimp: "Mailchimp", googlebigquery: "BigQuery",
  metaads: "Meta Ads", google_search_console: "Search Console",
};
const pretty = (slug) => slug.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const shorten = (s = "") => {
  const t = s.replace(/\s+/g, " ").trim();
  const first = t.split(/(?<=\.)\s/)[0];
  return (first.length <= 160 ? first : `${t.slice(0, 157)}…`).trim();
};

console.log("Fetching directory…");
const html = await get("https://composio.dev/toolkits");
if (!html) throw new Error("Couldn't fetch composio.dev/toolkits");
const { records, ranks } = extractRecords(html);
console.log(`Popularity ranks for ${ranks.size} apps.`);
console.log(`Found ${records.length} apps. Fetching details…`);

const detailList = await pool(records, 12, async (r) => details(await get(`https://composio.dev/toolkits/${r.slug}.md`)));

const MIN_CATEGORY = 5; // fold one-off categories into "Other"
const apps0 = records
  .map((r, i) => {
    const d = detailList[i];
    const categories = [...new Set((r.categories ?? []).map((c) => CATEGORY_LABELS[c.toLowerCase()] ?? pretty(c)))];
    return {
      slug: r.slug,
      name: NAME_FIX[r.slug] ?? r.name ?? d.name ?? pretty(r.slug),
      description: shorten(r.short_description || r.description),
      logo: r.logo_url || `https://logos.composio.dev/api/${r.slug}`,
      categories,
      rank: ranks.get(r.slug) ?? 100000,
      tools: d.tools,
      triggers: d.triggers,
      managed: d.managed,
    };
  })
  .sort((a, b) => a.rank - b.rank || b.tools - a.tools || a.name.localeCompare(b.name));

const counts = {};
for (const a of apps0) for (const c of a.categories) counts[c] = (counts[c] ?? 0) + 1;
const apps = apps0.map((a) => ({ ...a, categories: [...new Set(a.categories.map((c) => (counts[c] >= MIN_CATEGORY ? c : "Other")))] }));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), apps }));
console.log(`Wrote ${apps.length} apps to ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
