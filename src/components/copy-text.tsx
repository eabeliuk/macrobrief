"use client";

import { useState } from "react";

export function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-quiet"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // Clipboard blocked (http, permissions) — the <pre> below is selectable.
        }
      }}
    >
      {done ? "Copied" : "Copy as text"}
    </button>
  );
}
