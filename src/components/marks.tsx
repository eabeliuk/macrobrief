/**
 * The mark, from brandbook/. The isotype is the generated SVG served from
 * /brand; the wordmark is live text in Open Sans Bold with the family's
 * division — "Macro" in ink, "Brief" in the signal colour — because an SVG
 * <text> inside an <img> cannot reach the page's fonts.
 */

export function Isotype({ height = 28, dark = false, className = "" }: { height?: number; dark?: boolean; className?: string }) {
  // Family canvas is 1000 × 698.86: wider than tall, never squared.
  const width = Math.round((height * 1000) / 698.86);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={dark ? "/brand/isotype-dark-bg.svg" : "/brand/isotype.svg"} alt="" width={width} height={height} className={className} />
  );
}

export function Logotype({ height = 28, dark = false }: { height?: number; dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Isotype height={height} dark={dark} />
      <span className="font-bold tracking-[-0.02em]" style={{ fontSize: height * 0.95, lineHeight: 1 }}>
        <span className={dark ? "text-white" : "text-ink"}>Macro</span>
        <span className={dark ? "text-white" : "text-accent"}>Brief</span>
      </span>
    </span>
  );
}
