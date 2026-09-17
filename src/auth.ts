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
  providers.push(Google);
}
if (process.env.AUTH_RESEND_KEY) {
  providers.push(Resend({ from: process.env.EMAIL_FROM || "MacroBrief <brief@macrobrief.com>" }));
}

export const enabledProviders = {
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  email: Boolean(process.env.AUTH_RESEND_KEY),
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Cloud Run terminates TLS and forwards the host header.
  trustHost: true,
  session: { strategy: "database" },
  providers,
  pages: { signIn: "/login" },
  callbacks: {
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
