"use client";

/**
 * Inputs that submit their form as soon as they change, so a settings page
 * needs no Save buttons: a select saves on choose, a text field on blur or
 * Enter. Each sits in its own small form with a server action.
 */

export function AutoSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

export function AutoInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      onBlur={(e) => {
        if (e.currentTarget.value !== e.currentTarget.defaultValue) e.currentTarget.form?.requestSubmit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.form?.requestSubmit();
        }
      }}
    />
  );
}
