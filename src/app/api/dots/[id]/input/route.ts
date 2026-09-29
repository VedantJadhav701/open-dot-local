import { userInput, type UserInput } from "@/server/computer";

// One mouse / keyboard / navigation event from the Computer tab's live view.
export async function POST(req: Request, ctx: RouteContext<"/api/dots/[id]/input">) {
  const { id } = await ctx.params;
  try {
    await userInput(id, (await req.json()) as UserInput);
    return new Response(null, { status: 204 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
