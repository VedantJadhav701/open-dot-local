"use client";

import { useSyncExternalStore } from "react";

// Tiny UI state shared across the layout: whether the sidebar drawer is open (phones / narrow windows).
let open = false;
const listeners = new Set<() => void>();

export function setSidebarOpen(value: boolean) {
  if (open === value) return;
  open = value;
  for (const l of listeners) l();
}

export function useSidebarOpen(): boolean {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => open,
    () => false,
  );
}

/** True while the media query matches. Server render assumes a wide screen. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (l) => {
      const m = matchMedia(query);
      m.addEventListener("change", l);
      return () => m.removeEventListener("change", l);
    },
    () => matchMedia(query).matches,
    () => true,
  );
}
