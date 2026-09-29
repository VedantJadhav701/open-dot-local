"use client";

import Link from "next/link";
import { dismissToast, markRead, useStore } from "@/lib/store";
import DotOrb from "./DotOrb";

export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dots = useStore((s) => s.dots);
  return (
    <div className="pointer-events-none fixed top-3 right-3 left-3 z-50 flex flex-col gap-2 sm:top-5 sm:right-5 sm:left-auto sm:w-[340px]">
      {toasts.map((t) => {
        const dot = dots.find((d) => d.id === t.dotId);
        return (
          <Link
            key={t.id}
            href={`/dots/${t.dotId}`}
            onClick={() => (markRead(t.dotId), dismissToast(t.id))}
            className="surface pointer-events-auto flex gap-3 p-3.5 shadow-elevated transition-colors hover:border-black/15"
          >
            {dot && <DotOrb look={dot.look} status={dot.status} size={30} />}
            <span className="min-w-0">
              <span className="eyebrow block">{dot?.name ?? "Dot"}</span>
              {t.title !== dot?.name && <span className="mt-0.5 block text-[14px] font-medium">{t.title}</span>}
              <span className="line-clamp-2 text-body-sm text-foreground/55">{t.body}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
