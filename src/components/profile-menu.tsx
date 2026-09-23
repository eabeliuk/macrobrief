"use client";

import { useEffect, useRef } from "react";

/**
 * The profile menu, as a native disclosure that closes when the reader
 * clicks away or presses Escape — the behaviour `<details>` lacks.
 */
export function ProfileMenu({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (event: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") el.open = false;
        return;
      }
      if (event.target instanceof Node && !el.contains(event.target)) el.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-rule bg-card py-1 pr-3 pl-1 text-sm text-ink-2 hover:bg-page [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-64 rounded-lg border border-rule bg-card p-2 text-sm shadow-lg">{children}</div>
    </details>
  );
}
