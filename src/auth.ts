import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/prisma";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

// Only register providers that are actually configured, so a missing key
// degrades to "that button isn't there" instead of breaking sign-in entirely.
const providers = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  // An invited reader exists as a User row before their first sign-in;
  // linking the Google account to it by email is safe because Google only
  // asserts verified addresses and the beta gate has already vetted it.
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
}
if (process.env.AUTH_RESEND_KEY) {
  providers.push(Resend({ from: process.env.EMAIL_FROM || "MacroBrief <brief@macrobrief.com>" }));
}

export const enabledProviders = {
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  email: Boolean(process.env.AUTH_RESEND_KEY),
};

/**
 * Private beta: while ALLOWED_EMAILS is set, only those addresses — or an
 * email a super-admin has already invited (a User row exists) — can sign in
 * or sign up. Unset it to open the doors — the list is a temporary gate,
 * not the access model, so an empty value means "everyone", not "nobody".
 */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function inviteOnly(): boolean {
  return allowedEmails().length > 0;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Cloud Run terminates TLS and forwards the host header.
  trustHost: true,
  session: { strategy: "database" },
  providers,
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user }) {
      const allowed = allowedEmails();
      if (!allowed.length) return true;
      const email = user.email?.toLowerCase();
      if (!email) return false;
      if (allowed.includes(email)) return true;
      return Boolean(await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } }));
    },
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
  events: {
    // A new account gets its email as the default delivery channel and a
    // weekly schedule, so the first brief needs no settings visit.
    async createUser({ user }) {
      if (!user.id) return;
      await prisma.schedule.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
      if (user.email) {
        await prisma.deliveryChannel.upsert({
          where: { userId_channel: { userId: user.id, channel: "EMAIL" } },
          update: {},
          create: { userId: user.id, channel: "EMAIL", address: user.email, verified: true },
        });
      }
    },
  },
});
