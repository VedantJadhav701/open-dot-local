import DotView, { type Tab } from "@/components/DotView";

export default async function Page({ params, searchParams }: PageProps<"/dots/[id]">) {
  const { id } = await params;
  const { tab, c } = await searchParams;
  const current: Tab = tab === "computer" || tab === "setup" ? tab : "chat";
  return <DotView dotId={id} tab={current} conversation={typeof c === "string" ? c : undefined} />;
}
