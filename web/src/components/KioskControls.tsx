"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { KioskControlsCopy } from "@/copy/types";

/**
 * Kiosk chrome: re-renders the server components on an interval via
 * router.refresh() (same-origin RSC fetch — the browser still never
 * connects anywhere near the honeypot), plus a fullscreen toggle for
 * wall displays. Ticks are skipped while the tab is hidden and one
 * fires immediately when the display wakes back up.
 */
export function KioskControls({
  updatedLabel,
  copy,
}: {
  updatedLabel: string;
  copy: KioskControlsCopy;
}) {
  const router = useRouter();
  const [canFullscreen, setCanFullscreen] = useState(false);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 5 * 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  useEffect(() => {
    setCanFullscreen(document.fullscreenEnabled);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  return (
    <span className="kiosk-controls">
      <span className="label">
        <span className="live-dot" aria-hidden />
        {copy.updated} {updatedLabel}
      </span>
      {canFullscreen && (
        <button type="button" className="kiosk-fullscreen label" onClick={toggleFullscreen}>
          {copy.fullscreen}
        </button>
      )}
    </span>
  );
}
