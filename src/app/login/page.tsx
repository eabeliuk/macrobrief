import { redirect } from "next/navigation";

import { enabledProviders, signIn } from "@/auth";
import { Field, Notice, Wordmark } from "@/components/ui";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Sign in — MacroBrief" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  if (await currentUser()) redirect("/app");

  async function withGoogle() {
    "use server";
    await signIn("google", { redirectTo: "/app" });
  }

  async function withEmail(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return;
    await signIn("resend", { email, redirectTo: "/app" });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <Wordmark />
      <h1 className="mt-8 text-3xl font-semibold">Sign in</h1>
      <p className="mt-2 text-ink-2">Your first brief is a couple of minutes away.</p>

      {sent ? <div className="mt-6"><Notice>Check your email for the link.</Notice></div> : null}

      <div className="mt-8 space-y-6">
        {enabledProviders.google ? (
          <form action={withGoogle}>
            <button type="submit" className="btn w-full">Continue with Google</button>
          </form>
        ) : null}
        {enabledProviders.email ? (
          <form action={withEmail} className="space-y-3">
            <Field label="Email" name="email" type="email" required placeholder="you@example.com" />
            <button type="submit" className="btn-quiet w-full">Email me a link</button>
          </form>
        ) : null}
        {!enabledProviders.google && !enabledProviders.email ? (
          <Notice tone="warn">
            No sign-in method is configured on this deployment. Set AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET, or AUTH_RESEND_KEY.
          </Notice>
        ) : null}
      </div>
    </main>
  );
}
