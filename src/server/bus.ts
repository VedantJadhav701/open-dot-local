import "server-only";
import { EventEmitter } from "node:events";
import type { ServerEvent } from "@/lib/types";

const g = globalThis as unknown as { __dotsBus?: EventEmitter };
const bus = (g.__dotsBus ??= new EventEmitter().setMaxListeners(100));

export function emit(event: ServerEvent) {
  bus.emit("event", event);
}

export function onEvent(listener: (event: ServerEvent) => void): () => void {
  bus.on("event", listener);
  return () => bus.off("event", listener);
}
