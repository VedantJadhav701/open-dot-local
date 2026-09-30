// Finish .next/standalone for the desktop app: copy the static assets the minimal server serves,
// and the full Playwright packages (tracing only picks up the files it can see being required).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, ".next/standalone");
if (!fs.existsSync(path.join(out, "server.js"))) throw new Error("Run `next build` first (output: standalone).");

fs.cpSync(path.join(root, "public"), path.join(out, "public"), { recursive: true });
fs.cpSync(path.join(root, ".next/static"), path.join(out, ".next/static"), { recursive: true });

const require = createRequire(path.join(root, "package.json"));
const playwrightDir = path.dirname(fs.realpathSync(require.resolve("playwright/package.json")));
const coreDir = path.dirname(createRequire(path.join(playwrightDir, "package.json")).resolve("playwright-core/package.json"));
for (const dir of [playwrightDir, fs.realpathSync(coreDir)]) {
  const dest = path.join(out, path.relative(root, dir));
  fs.cpSync(dir, dest, { recursive: true, dereference: true });
  console.log("copied", path.relative(root, dir));
}

// Tracing also misses Next's own prebuilt server runtimes (e.g. the one API routes load).
const nextDir = fs.realpathSync(path.dirname(require.resolve("next/package.json")));
fs.cpSync(path.join(nextDir, "dist/compiled/next-server"), path.join(out, path.relative(root, nextDir), "dist/compiled/next-server"), {
  recursive: true,
  filter: (src) => fs.statSync(src).isDirectory() || /\.prod\.js$/.test(src), // production builds only
});
console.log("copied next/dist/compiled/next-server (production runtimes)");

// Playwright mentions electron, so tracing drags it in; the app already runs inside Electron.
const pnpmDir = path.join(out, "node_modules/.pnpm");
for (const d of fs.existsSync(pnpmDir) ? fs.readdirSync(pnpmDir) : []) if (/^electron(-builder)?@/.test(d)) fs.rmSync(path.join(pnpmDir, d), { recursive: true, force: true });
fs.rmSync(path.join(out, "node_modules/electron"), { recursive: true, force: true });

// Keep only what the server runs. Tracing also copies stray project files (source .ts, earlier desktop builds,
// local data); none of it is needed, and some of it must never ship.
const KEEP = new Set([".next", "node_modules", "public", "server.js", "package.json"]);
for (const entry of fs.readdirSync(out)) if (!KEEP.has(entry)) fs.rmSync(path.join(out, entry), { recursive: true, force: true });
// The packaged app gets its own copy. pnpm's symlinks stay (Node resolves packages through them), but every one
// must be relative and stay inside the folder, or code signing rejects the app.
const app = path.join(root, ".desktop/server");
fs.rmSync(app, { recursive: true, force: true });
fs.mkdirSync(path.dirname(app), { recursive: true });
execFileSync("cp", ["-RP", out, app]); // -P copies symlinks as they are
const links = execFileSync("find", [app, "-type", "l"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const escaping = links.filter((l) => {
  const target = fs.readlinkSync(l);
  return path.isAbsolute(target) || !path.resolve(path.dirname(l), target).startsWith(app + path.sep) || !fs.existsSync(l);
});
if (escaping.length) throw new Error(`Symlinks that leave the desktop server (or are broken):\n${escaping.join("\n")}`);
console.log("desktop server ready:", path.relative(root, app));
