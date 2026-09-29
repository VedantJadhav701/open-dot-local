"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Crown, Hash, Trash2 } from "lucide-react";
import { deleteChannel, sendChannelMessage } from "@/app/actions";
import { useStore } from "@/lib/store";
import DotOrb from "./DotOrb";
import { MessageRow } from "./Chat";
import type { Dot } from "@/lib/types";

export default function ChannelView({ channelId }: { channelId: string }) {
  const router = useRouter();
  const channel = useStore((s) => s.channels.find((c) => c.id === channelId));
  const loaded = useStore((s) => s.loaded);
  const dots = useStore((s) => s.dots);
  const all = useStore((s) => s.messages);
  const messages = useMemo(() => all.filter((m) => m.channelId === channelId), [all, channelId]);
  const [text, setText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  if (!channel) {
    return <div className="flex flex-1 items-center justify-center text-body-sm text-foreground/45">{loaded ? "This channel doesn't exist." : "Loading…"}</div>;
  }

  const byId = new Map(dots.map((d) => [d.id, d]));
  const members = channel.memberIds.map((id) => byId.get(id)).filter((d): d is Dot => Boolean(d));
  const working = members.filter((d) => d.status === "working");

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    start(() => sendChannelMessage(channelId, value));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/[0.06] bg-card px-5">
        <Hash className="size-4 text-foreground/45" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] leading-5 font-medium">{channel.name}</div>
          <div className="text-[12px] text-foreground/50">
            {members.length} dots · led by {byId.get(channel.leadId)?.name ?? "—"}
          </div>
        </div>
        <div className="flex -space-x-1.5">
          {members.map((d) => (
            <span key={d.id} className="relative rounded-full bg-card" title={`${d.name}${d.id === channel.leadId ? " (lead)" : ""}`}>
              <DotOrb look={d.look} status={d.status} size={30} />
              {d.id === channel.leadId && <Crown className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 fill-highlight text-foreground" strokeWidth={1.5} />}
            </span>
          ))}
        </div>
        {confirmDelete ? (
          <span className="flex items-center gap-1.5">
            <button className="btn h-8 bg-destructive px-3 text-[13px] text-card" onClick={() => start(async () => (await deleteChannel(channelId), router.push("/")))}>
              Delete
            </button>
            <button className="btn-quiet" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button className="btn-quiet size-8 p-0" onClick={() => setConfirmDelete(true)} aria-label="Delete channel">
            <Trash2 className="size-3.5" strokeWidth={1.75} />
          </button>
        )}
      </header>

      <div className="flex flex-1 flex-col-reverse overflow-y-auto">
        <div className="rails mx-auto flex min-h-full w-full max-w-[800px] shrink-0 flex-col px-6 md:px-10">
          <div className="flex-1" />
          <div className="space-y-4 py-8">
            {messages.map((m) => {
              const author = byId.get(m.dotId);
              return author ? <MessageRow key={m.id} m={m} dot={author} showName /> : null;
            })}
            {working.map((d) => (
              <div key={d.id} className="flex items-center gap-3">
                <DotOrb look={d.look} status="working" size={24} />
                <span className="shimmer-text text-body-sm">
                  {d.name} · {d.activity ?? "Working"}…
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rails mx-auto w-full max-w-[800px] px-6 pb-5 md:px-10">
        <div className="flex items-end gap-2 rounded-2xl border border-black/10 bg-card/95 p-2.5 pl-4 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.15)] transition-shadow focus-within:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.2)]">
          <textarea
            rows={1}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={`Message #${channel.name} · @${members[1]?.name ?? "Name"} to ask someone directly`}
            className="max-h-52 min-h-10 flex-1 resize-none bg-transparent py-2 text-[16px] leading-[1.45] tracking-default outline-none [field-sizing:content] placeholder:text-foreground/35"
          />
          <button
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-card transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-25"
            disabled={pending || !text.trim()}
            onClick={submit}
            aria-label="Send"
          >
            <ArrowUp className="size-4" strokeWidth={2.25} />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 px-1">
          {members.map((d) => (
            <button key={d.id} className="font-mono text-[10px] tracking-wider text-foreground/40 uppercase hover:text-foreground" onClick={() => setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@${d.name} `)}>
              @{d.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
