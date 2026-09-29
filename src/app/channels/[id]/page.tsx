import ChannelView from "@/components/ChannelView";

export default async function Page({ params }: PageProps<"/channels/[id]">) {
  const { id } = await params;
  return <ChannelView channelId={id} />;
}
