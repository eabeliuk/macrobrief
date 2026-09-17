"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that says what it is doing. Adding a topic takes ~30 s
 * (the model proposes feeds, each is fetched to prove it works, then a
 * first poll); a silent button for that long reads as broken and invites
 * a second click.
 */
export function SubmitButton({ children, pending, className = "btn", disabled = false }: { children: React.ReactNode; pending: string; className?: string; disabled?: boolean }) {
  const status = useFormStatus();
  return (
    <button type="submit" className={className} disabled={disabled || status.pending} aria-busy={status.pending}>
      {status.pending ? pending : children}
    </button>
  );
}
