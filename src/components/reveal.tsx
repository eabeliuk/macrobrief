"use client";

import { useState } from "react";

/** A button that reveals its panel — the add-topic form lives behind it. */
export function Reveal({ label, closeLabel = "Close", children, className = "" }: { label: string; closeLabel?: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn ${className}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? closeLabel : label}
      </button>
      {open ? <div className="mt-4">{children}</div> : null}
    </>
  );
}
