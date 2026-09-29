"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createDot } from "@/app/actions";
import { DEFAULT_LOOK, STARTERS } from "@/lib/look";
import { markRead } from "@/lib/store";
import Dot3DLazy from "./Dot3DLazy";
import DotOrb from "./DotOrb";
import LookEditor from "./LookEditor";
import { useMediaQuery } from "@/lib/ui";
import type { Look } from "@/lib/types";

export default function NewDot() {
  const router = useRouter();
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const placeholder = "Pixel";
  const [pending, start] = useTransition();
  const wide = useMediaQuery("(min-width: 640px)");

  const create = () =>
    start(async () => {
      const id = await createDot({ name: name || placeholder, purpose, look });
      markRead(id);
      router.push(`/dots/${id}`);
    });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="rails mx-auto grid min-h-full grid-cols-[minmax(0,1fr)] max-w-page lg:grid-cols-[1fr_480px]">
        {/* Stage */}
        <div className="dot-grid relative flex flex-col items-center justify-center border-b border-black/[0.06] px-4 py-8 sm:px-8 lg:sticky lg:py-14 lg:top-0 lg:h-full lg:max-h-screen lg:border-r lg:border-b-0">
          <div className="eyebrow absolute top-4 left-4 sm:top-5 sm:left-6">Preview</div>
          <Dot3DLazy look={look} size={wide ? 340 : 220} stage />
          <div className="mt-4 text-center">
            <div className="text-h1">{name || placeholder}</div>
            <p className="mx-auto mt-2 max-w-[380px] text-body-sm text-foreground/55">{purpose || "Works on its own, on its own computer."}</p>
          </div>
        </div>

        {/* Form */}
        <div className="bg-card px-4 sm:px-8 py-10">
          <div className="eyebrow text-brand-readable/80">New dot</div>
          <h1 className="text-h1 mt-2">Meet a new teammate</h1>
          <p className="mt-2 text-body-sm text-foreground/55">Give it a name and a job. It gets its own computer, browser, memory, and rules.</p>

          <div className="mt-8 space-y-4">
            <label className="block">
              <span className="eyebrow mb-1.5 block">Name</span>
              <input className="field" placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block">
              <span className="eyebrow mb-1.5 block">Job</span>
              <textarea
                className="field h-auto min-h-20 resize-none py-2 leading-normal"
                placeholder="What should it help with?"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-6">
            <div className="eyebrow mb-2">Or start from</div>
            <div className="surface divide-y divide-black/[0.06] overflow-hidden">
              {STARTERS.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-popover"
                  onClick={() => (setName(s.name), setPurpose(s.purpose), setLook(s.look))}
                >
                  <DotOrb look={s.look} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px]">{s.name}</span>
                    <span className="block truncate text-[12px] text-foreground/50">{s.purpose}</span>
                  </span>
                  <ArrowRight className="size-3.5 text-foreground/25 transition-colors group-hover:text-foreground" />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <div className="eyebrow mb-3">Appearance</div>
            <LookEditor look={look} onChange={setLook} />
          </div>

          <button className="btn-primary mt-8 h-10 w-full text-[15px]" disabled={pending} onClick={create}>
            {pending ? "Waking up…" : `Create ${name || placeholder}`}
          </button>
        </div>
      </div>
    </div>
  );
}
