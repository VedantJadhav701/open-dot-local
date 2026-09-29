import path from "node:path";
import { listFiles, readFile } from "@/server/computer";
import { guessMime } from "@/server/files";

// The dot's workspace: GET lists files; GET ?path=… downloads one.
export async function GET(req: Request, ctx: RouteContext<"/api/dots/[id]/workspace">) {
  const { id } = await ctx.params;
  const p = new URL(req.url).searchParams.get("path");
  try {
    if (!p) return Response.json({ files: await listFiles(id) });
    const data = await readFile(id, p);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": guessMime(p),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(p))}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return Response.json({ files: [], error: err instanceof Error ? err.message : String(err) }, { status: p ? 404 : 200 });
  }
}
