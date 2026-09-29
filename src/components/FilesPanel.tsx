"use client";

import { Suspense, use, useState } from "react";
import { Download, FileText, Folder, FolderOpen, RefreshCw } from "lucide-react";
import type { Dot } from "@/lib/types";

type Entry = { path: string; size: number; isDir: boolean };
const cache = new Map<string, Promise<{ files: Entry[]; error?: string }>>();
function load(dotId: string, nonce: number) {
  const k = `${dotId}:${nonce}`;
  let p = cache.get(k);
  if (!p) {
    p = fetch(`/api/dots/${dotId}/workspace`).then((r) => r.json());
    cache.set(k, p);
  }
  return p;
}

const size = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : n > 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

function List({ dotId, nonce }: { dotId: string; nonce: number }) {
  const { files, error } = use(load(dotId, nonce));
  if (error) return <div className="px-4 py-6 text-center text-body-sm text-destructive">{error}</div>;
  if (!files.length) return <div className="px-4 py-6 text-center text-body-sm text-foreground/45">The workspace is empty.</div>;
  return (
    <div className="max-h-80 divide-y divide-black/[0.06] overflow-y-auto">
      {files.map((f) => (
        <div key={f.path} className="flex items-center gap-2.5 px-4 py-2" style={{ paddingLeft: 16 + (f.path.split("/").length - 1) * 16 }}>
          {f.isDir ? <Folder className="size-3.5 text-foreground/40" strokeWidth={1.75} /> : <FileText className="size-3.5 text-foreground/40" strokeWidth={1.75} />}
          <span className={`min-w-0 flex-1 truncate text-[13px] ${f.isDir ? "text-foreground/60" : ""}`}>{f.path.split("/").pop()}</span>
          {!f.isDir && (
            <>
              <span className="font-mono text-[10px] text-foreground/40">{size(f.size)}</span>
              <a href={`/api/dots/${dotId}/workspace?path=${encodeURIComponent(f.path)}`} className="text-foreground/35 hover:text-foreground" aria-label={`Download ${f.path}`}>
                <Download className="size-3.5" strokeWidth={1.75} />
              </a>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** The dot's workspace files. Loads on demand so opening the tab doesn't wake a sleeping cloud computer. */
export default function FilesPanel({ dot }: { dot: Dot }) {
  const [nonce, setNonce] = useState<number | null>(null);
  return (
    <section className="surface mt-5 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-black/[0.06] px-4 py-2.5">
        <FolderOpen className="size-4 text-foreground/50" strokeWidth={1.5} />
        <h2 className="text-[15px] font-medium">Files</h2>
        <span className="hidden truncate text-caption text-foreground/45 sm:inline">in {dot.name}&apos;s workspace · uploads land in uploads/</span>
        <button className="btn-quiet ml-auto" onClick={() => setNonce(Date.now())}>
          <RefreshCw className="size-3.5" strokeWidth={1.75} /> {nonce ? "Refresh" : "Show files"}
        </button>
      </div>
      {nonce && (
        <Suspense fallback={<div className="px-4 py-6 text-center text-body-sm text-foreground/45">Loading files…</div>}>
          <List dotId={dot.id} nonce={nonce} />
        </Suspense>
      )}
    </section>
  );
}
