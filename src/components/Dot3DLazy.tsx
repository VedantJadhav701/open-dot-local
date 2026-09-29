"use client";

import { Component, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import DotOrb from "./DotOrb";
import type { DotStatus, Look } from "@/lib/types";

type Props = { look: Look; status?: DotStatus; size?: number; stage?: boolean; className?: string };

// WebGL only on the client. The CSS orb stands in when WebGL is unavailable or three.js fails.
const Dot3D = dynamic(() => import("./Dot3D"), { ssr: false, loading: () => null });

let webgl: boolean | null = null;
function detectWebGL(): boolean {
  if (webgl === null) {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      webgl = !!gl;
      (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webgl = false;
    }
  }
  return webgl;
}
const noop = () => () => {};

class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function Dot3DLazy(props: Props) {
  const size = props.size ?? 160;
  const canRender3D = useSyncExternalStore(noop, detectWebGL, () => false);
  const orb = (
    <div className="absolute inset-0 flex items-center justify-center">
      <DotOrb look={props.look} status={props.status} size={size * 0.72} />
    </div>
  );
  return (
    <div className={`relative shrink-0 ${props.className ?? ""}`} style={{ width: size, height: size }}>
      {canRender3D ? (
        <Fallback fallback={orb}>
          <Dot3D {...props} className="absolute inset-0" />
        </Fallback>
      ) : (
        orb
      )}
    </div>
  );
}
