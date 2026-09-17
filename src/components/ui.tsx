import Link from "next/link";

export function Wordmark() {
  return (
    <Link href="/" className="text-lg font-semibold tracking-tight">
      Macro<span className="text-accent">Brief</span>
    </Link>
  );
}

export function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="label mb-1">{label}</span>
      <input className="input" name={name} type={type} placeholder={placeholder} required={required} defaultValue={defaultValue} />
    </label>
  );
}

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  const styles = tone === "warn" ? "border-warn/40 text-warn" : "border-accent/40 text-ink-2";
  return <p className={`rounded-md border px-3 py-2 text-sm ${styles}`}>{children}</p>;
}
