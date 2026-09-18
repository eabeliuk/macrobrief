"use client";

import { useFormStatus } from "react-dom";

/** An Active / Disabled switch that is itself the submit button of its form. */
export function Toggle({ on, label }: { on: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={pending}
      className={`inline-flex items-center gap-2 rounded-full border px-1 py-0.5 text-xs font-medium transition ${on ? "border-accent bg-accent text-white" : "border-rule bg-page text-ink-3"} disabled:opacity-50`}
    >
      <span className={`h-4 w-4 rounded-full ${on ? "order-2 bg-white" : "order-1 bg-ink-3"}`} />
      <span className={`${on ? "order-1 pl-1.5" : "order-2 pr-1.5"}`}>{pending ? "…" : on ? "Active" : "Disabled"}</span>
    </button>
  );
}
