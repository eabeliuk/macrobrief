"use client";

import { useState } from "react";

/**
 * A heading row whose button reveals a panel beneath it — the add-topic
 * form lives there. The heading is passed in so the button can sit on the
 * same row as the title.
 */
export function Reveal({
  heading,
  label,
  closeLabel = "Close",
  children,
}: {
  heading: React.ReactNode;
  label: string;
  closeLabel?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        {heading}
        <button type="button" className="btn shrink-0" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? closeLabel : label}
        </button>
      </div>
      {open ? <div className="mt-4">{children}</div> : null}
    </>
  );
}
