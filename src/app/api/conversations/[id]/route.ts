import { conversationMessages } from "@/server/repo";

// Full history of one conversation (the live snapshot only carries recent messages).
export async function GET(_req: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;
  return Response.json({ messages: conversationMessages(id, 1000) });
}
