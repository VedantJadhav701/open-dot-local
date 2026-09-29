"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Mic, MicOff, PhoneOff, X } from "lucide-react";
import { endCall, getCall, setMuted, subscribeCall } from "@/lib/voiceCall";
import { useStore } from "@/lib/store";
import Dot3DLazy from "./Dot3DLazy";
import type { DotStatus } from "@/lib/types";

const LABEL = { connecting: "Calling…", listening: "Listening", speaking: "Speaking", ended: "Call ended", error: "Call failed" } as const;

/** Floating panel for the live voice call. Lives in the layout so the call survives navigation. */
export default function VoicePanel() {
  const call = useSyncExternalStore(subscribeCall, getCall, () => null);
  const dot = useStore((s) => (call ? s.dots.find((d) => d.id === call.dotId) : undefined));
  if (!call || !dot) return null;

  // Map the call state onto the character's poses.
  const pose: DotStatus = call.status === "speaking" ? "working" : call.status === "connecting" ? "waiting" : "idle";
  // The conversation itself is saved into the chat; the panel only shows hand-offs and problems.
  const lines = call.lines.filter((l) => l.who === "note").slice(-3);

  return (
    <div className="surface fixed right-3 bottom-3 left-3 z-50 overflow-hidden shadow-elevated sm:right-5 sm:bottom-5 sm:left-auto sm:w-[340px]">
      <div className="dot-grid flex items-center gap-3 border-b border-black/[0.06] bg-popover px-4 py-3">
        <Dot3DLazy look={dot.look} status={pose} size={64} />
        <div className="min-w-0 flex-1">
          <Link href={`/dots/${dot.id}?c=${call.conversationId}`} className="block truncate text-[15px] font-medium">
            {dot.name}
          </Link>
          <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase">
            <span
              className={`size-1.5 rounded-full ${call.status === "error" ? "bg-destructive" : call.status === "speaking" ? "live-dot bg-brand text-brand" : call.status === "connecting" ? "bg-warning" : "bg-success"}`}
            />
            <span className="text-foreground/55">{call.muted && call.status !== "error" ? "Muted" : LABEL[call.status]}</span>
          </div>
        </div>
        {call.status === "error" && (
          <button className="btn-quiet size-8 p-0" onClick={endCall} aria-label="Close">
            <X className="size-4" strokeWidth={1.75} />
          </button>
        )}
      </div>

      <div className="max-h-44 min-h-16 space-y-1.5 overflow-y-auto px-4 py-3">
        {call.error && <p className="text-body-sm text-destructive">{call.error}</p>}
        {!call.error && !lines.length && (
          <p className="text-body-sm text-foreground/45">
            Talk naturally. Everything you both say is saved in the{" "}
            <Link href={`/dots/${dot.id}?c=${call.conversationId}`} className="underline underline-offset-2 hover:text-foreground">
              chat
            </Link>
            , and {dot.name} can take on tasks while you talk.
          </p>
        )}
        {lines.map((l) => (
          <p key={l.id} className="font-mono text-[11px] text-brand-readable">
            {"→ "}
            {l.text}
          </p>
        ))}
      </div>

      {call.status !== "error" && (
        <div className="flex gap-2 border-t border-black/[0.06] p-3">
          <button className="btn-secondary h-9 flex-1" onClick={() => setMuted(!call.muted)}>
            {call.muted ? <MicOff className="size-4" strokeWidth={1.75} /> : <Mic className="size-4" strokeWidth={1.75} />}
            {call.muted ? "Unmute" : "Mute"}
          </button>
          <button className="btn h-9 flex-1 bg-destructive text-card hover:opacity-90" onClick={endCall}>
            <PhoneOff className="size-4" strokeWidth={1.75} /> End
          </button>
        </div>
      )}
    </div>
  );
}
