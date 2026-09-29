import { redirect } from "next/navigation";
import { emit } from "@/server/bus";
import { finishSignIn } from "@/server/composio";
import { computerInfo } from "@/server/snapshot";

// Composio For You sends the user back here after they sign in.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  let error = params.get("error_description") ?? params.get("error");
  if (code && !error) {
    try {
      await finishSignIn(code);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
  emit({ type: "computer", data: computerInfo() });
  redirect(error ? `/settings?composio_error=${encodeURIComponent(error)}#apps` : "/settings#apps");
}
