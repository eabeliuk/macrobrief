import Link from "next/link";

import { Wordmark } from "@/components/ui";
import { PLANS, PLAN_ORDER } from "@/lib/domain/plans";
import { currentUser } from "@/lib/session";

export default async function LandingPage() {
  const user = await currentUser();
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Link href={user ? "/app" : "/login"} className="btn-quiet">
          {user ? "Open the app" : "Sign in"}
        </Link>
      </header>

      <section className="mt-20">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight">
          Tell it what you follow.
          <br />
          It reads the news so you don&apos;t have to.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-ink-2">
          Name a few topics. MacroBrief finds the sources, reads everything published, and sends you one brief — by
          email now, as audio and on WhatsApp soon — on the schedule you choose.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/login" className="btn">
            Start free
          </Link>
          <a href="#plans" className="btn-quiet">
            Plans
          </a>
        </div>
      </section>

      <section className="mt-20 grid gap-6 sm:grid-cols-3">
        {[
          ["Any topic", "Not a list of categories. “Chilean lithium policy” or “Rust async runtime” work the same."],
          ["Verified sources", "Publisher feeds are proposed by the model and kept only if they actually fetch and parse."],
          ["One brief", "Duplicates collapsed, wire rewrites merged, every story cites its source."],
        ].map(([title, body]) => (
          <div key={title}>
            <h2 className="font-medium">{title}</h2>
            <p className="mt-1 text-sm text-ink-2">{body}</p>
          </div>
        ))}
      </section>

      <section id="plans" className="mt-20">
        <h2 className="text-2xl font-semibold tracking-tight">Plans</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            return (
              <div key={id} className="card">
                <h3 className="font-medium">{plan.name}</h3>
                <p className="mt-1 text-2xl font-semibold">
                  ${plan.priceUsd}
                  <span className="text-sm font-normal text-ink-3">/mo</span>
                </p>
                <p className="mt-2 text-sm text-ink-2">{plan.blurb}</p>
                <ul className="mt-4 space-y-1 text-sm text-ink-2">
                  <li>{plan.maxTopics} topic{plan.maxTopics === 1 ? "" : "s"}</li>
                  <li>{plan.cadences.map((c) => c.toLowerCase().replace("_", " ")).join(" · ")}</li>
                  <li>{plan.channels.filter((c) => c !== "WEB").map((c) => c.toLowerCase()).join(" · ")}</li>
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="mt-24 text-xs text-ink-3">© {new Date().getFullYear()} MacroBrief</footer>
    </main>
  );
}
