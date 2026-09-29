import { lastScreenshot, screenshot } from "@/server/computer";

// Latest frame of the dot's screen. `?fresh=1` captures a new one.
export async function GET(req: Request, ctx: RouteContext<"/api/dots/[id]/screen">) {
  const { id } = await ctx.params;
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const shot = fresh ? await screenshot(id).catch(() => null) : await lastScreenshot(id);
  if (!shot) return new Response(null, { status: 204 });
  return new Response(new Uint8Array(shot), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
}
