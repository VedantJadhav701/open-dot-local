import { liveUrl } from "@/server/computer";

// Live-view URL for a dot's cloud computer (wakes it if it's asleep). `?interactive=1` for take-over.
export async function GET(req: Request, ctx: RouteContext<"/api/dots/[id]/live">) {
  const { id } = await ctx.params;
  const interactive = new URL(req.url).searchParams.get("interactive") === "1";
  try {
    return Response.json({ url: await liveUrl(id, interactive) });
  } catch (err) {
    return Response.json({ url: null, error: err instanceof Error ? err.message : String(err) });
  }
}
