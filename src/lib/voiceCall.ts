"use client";

import { saveVoiceLine, sendVoiceTask, startVoiceCall } from "@/app/actions";
import { getState, onMessage } from "./store";

// One live voice call at a time, kept outside React so it survives navigation.
// Audio flows browser ⇄ OpenAI Realtime over WebRTC; tool calls and transcripts come over a data channel.
// Every finished line is saved into the chat the call belongs to, so the conversation carries on in text.

export type CallStatus = "connecting" | "listening" | "speaking" | "ended" | "error";
export type CallLine = { id: number; who: "you" | "dot" | "note"; text: string };
export type Call = { dotId: string; conversationId: string; status: CallStatus; muted: boolean; lines: CallLine[]; error?: string; startedAt: number };

let current: Call | null = null;
let teardown: (() => void) | null = null;
let setMic: ((on: boolean) => void) | null = null;
let lineSeq = 0;
const listeners = new Set<() => void>();

const publish = (patch: Partial<Call>) => {
  if (!current) return;
  current = { ...current, ...patch };
  for (const l of listeners) l();
};
const addLine = (who: CallLine["who"], text: string) => {
  if (!current || !text.trim()) return;
  publish({ lines: [...current.lines, { id: ++lineSeq, who, text: text.trim() }].slice(-40) });
  if (who !== "note") void saveVoiceLine(current.dotId, current.conversationId, who, text);
};

export function subscribeCall(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const getCall = () => current;

export function endCall() {
  teardown?.();
  teardown = null;
  setMic = null;
  if (current) publish({ status: current.status === "error" ? "error" : "ended" });
  current = null;
  for (const l of listeners) l();
}

export function setMuted(muted: boolean) {
  setMic?.(!muted);
  publish({ muted });
}

export async function startCall(dotId: string, conversationId: string) {
  endCall();
  current = { dotId, conversationId, status: "connecting", muted: false, lines: [], startedAt: Date.now() };
  for (const l of listeners) l();

  const pc = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;
  pc.ontrack = (e) => (audio.srcObject = e.streams[0]);
  let mic: MediaStream | null = null;
  let unsubscribe: (() => void) | null = null;
  teardown = () => {
    unsubscribe?.();
    mic?.getTracks().forEach((t) => t.stop());
    pc.getSenders().forEach((s) => s.track?.stop());
    pc.close();
    audio.srcObject = null;
  };

  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    const track = mic.getTracks()[0];
    pc.addTrack(track, mic);
    setMic = (on) => (track.enabled = on);

    const dc = pc.createDataChannel("oai-events");
    const send = (obj: unknown) => dc.readyState === "open" && dc.send(JSON.stringify(obj));

    // Work updates can't interrupt a response in progress; queue them until the current one finishes.
    let responding = false;
    const queue: string[] = [];
    const flush = () => {
      if (responding || !queue.length) return;
      const text = queue.shift()!;
      send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
      send({ type: "response.create" });
    };

    dc.onopen = () => {
      publish({ status: "listening" });
      send({ type: "response.create" }); // greet
    };

    dc.onmessage = async (e) => {
      const ev = JSON.parse(e.data as string) as Record<string, unknown> & { type: string };
      switch (ev.type) {
        case "response.created":
          responding = true;
          break;
        case "response.done":
          responding = false;
          flush();
          break;
        case "output_audio_buffer.started":
          publish({ status: "speaking" });
          break;
        case "output_audio_buffer.stopped":
          if (current?.status === "speaking") publish({ status: "listening" });
          break;
        case "response.output_audio_transcript.done":
          addLine("dot", String(ev.transcript ?? ""));
          break;
        case "conversation.item.input_audio_transcription.completed":
          addLine("you", String(ev.transcript ?? ""));
          break;
        case "response.function_call_arguments.done": {
          const name = String(ev.name);
          const callId = String(ev.call_id);
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(String(ev.arguments || "{}"));
          } catch {}
          let output = "";
          if (name === "send_task") {
            const request = String(args.request ?? "");
            await sendVoiceTask(dotId, conversationId, request);
            addLine("note", `Handed off: ${request}`);
            output = "Sent to your working self. The result will arrive later as a work update.";
          } else if (name === "recent_messages") {
            output = getState()
              .messages.filter((m) => m.conversationId === conversationId && (m.role === "user" || m.role === "dot") && m.text)
              .slice(-12)
              .map((m) => `${m.role === "user" ? "User" : "You"}: ${m.text.slice(0, 400)}`)
              .join("\n");
          } else if (name === "end_call") {
            setTimeout(endCall, 1200); // let the goodbye finish playing
            return;
          }
          send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: output || "(nothing)" } });
          send({ type: "response.create" });
          break;
        }
        case "error":
          addLine("note", String((ev.error as { message?: string } | undefined)?.message ?? "Something went wrong."));
          break;
      }
    };

    // When the dot's working self finishes something, tell the call.
    const seen = new Set<string>();
    unsubscribe = onMessage((m) => {
      // Only this chat's work results; the call's own saved lines come back through here too, so skip those.
      if (!current || m.conversationId !== conversationId || m.from === "voice" || m.createdAt < current.startedAt || seen.has(m.id)) return;
      if (m.role === "dot" && m.text.trim()) {
        seen.add(m.id);
        queue.push(`[Work update from your working self, not the user. Tell the user briefly and naturally.]\n${m.text.slice(0, 1500)}`);
        flush();
      } else if (m.role === "card" && m.card?.status === "pending") {
        seen.add(m.id);
        queue.push(`[Work update: your working self needs the user's approval in the app for: ${m.card.title}. Let them know.]`);
        flush();
      }
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const session = await startVoiceCall(dotId, conversationId);
    if (!session.token) throw new Error(session.error ?? "Couldn't start the call.");
    const answer = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(session.model!)}`, {
      method: "POST",
      body: offer.sdp,
      headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/sdp" },
    });
    if (!answer.ok) throw new Error(`Realtime connection failed (${answer.status}).`);
    await pc.setRemoteDescription({ type: "answer", sdp: await answer.text() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    publish({ status: "error", error: /Permission|NotAllowed/i.test(message) ? "Microphone access was blocked." : message });
    teardown?.();
    teardown = null;
  }
}
