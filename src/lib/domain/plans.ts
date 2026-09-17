/**
 * The four plans. This file is the only place plan rules live: the UI, the
 * cron and (later) the Stripe webhook all read from here.
 *
 * Cost lines behind the gates: feeds are shared so topics are cheap; one
 * model call per brief; audio is TTS seconds; WhatsApp is per-message
 * Twilio spend; Instagram needs a business account we operate and only works
 * inside Meta's 24-hour reply window. So audio and WhatsApp start at Pro and
 * Instagram at Max.
 */

export type PlanId = "FREE" | "STARTER" | "PRO" | "MAX";
export type CadenceId = "WEEKLY" | "DAILY" | "TWICE_DAILY";
export type ChannelId = "WEB" | "EMAIL" | "TEXT" | "AUDIO" | "WHATSAPP" | "INSTAGRAM";

export type PlanLimits = {
  id: PlanId;
  name: string;
  priceUsd: number;
  maxTopics: number;
  cadences: CadenceId[];
  storiesPerTopic: number;
  channels: ChannelId[];
  premiumSources: boolean;
  blurb: string;
};

export const PLANS: Record<PlanId, PlanLimits> = {
  FREE: {
    id: "FREE",
    name: "Free",
    priceUsd: 0,
    maxTopics: 1,
    cadences: ["WEEKLY"],
    storiesPerTopic: 3,
    channels: ["WEB", "EMAIL"],
    premiumSources: false,
    blurb: "One topic, one email a week.",
  },
  STARTER: {
    id: "STARTER",
    name: "Starter",
    priceUsd: 5,
    maxTopics: 3,
    cadences: ["WEEKLY", "DAILY"],
    storiesPerTopic: 5,
    channels: ["WEB", "EMAIL", "TEXT"],
    premiumSources: false,
    blurb: "Three topics, every morning.",
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    priceUsd: 12,
    maxTopics: 10,
    cadences: ["WEEKLY", "DAILY"],
    storiesPerTopic: 8,
    channels: ["WEB", "EMAIL", "TEXT", "AUDIO", "WHATSAPP"],
    premiumSources: false,
    blurb: "Ten topics. Listen to it, or get it on WhatsApp.",
  },
  MAX: {
    id: "MAX",
    name: "Max",
    priceUsd: 29,
    maxTopics: 30,
    cadences: ["WEEKLY", "DAILY", "TWICE_DAILY"],
    storiesPerTopic: 12,
    channels: ["WEB", "EMAIL", "TEXT", "AUDIO", "WHATSAPP", "INSTAGRAM"],
    premiumSources: true,
    blurb: "Everything, twice a day, on every channel.",
  },
};

export const PLAN_ORDER: PlanId[] = ["FREE", "STARTER", "PRO", "MAX"];

export function canAddTopic(plan: PlanId, currentCount: number): boolean {
  return currentCount < PLANS[plan].maxTopics;
}

export function cadenceAllowed(plan: PlanId, cadence: CadenceId): boolean {
  return PLANS[plan].cadences.includes(cadence);
}

export function channelAllowed(plan: PlanId, channel: ChannelId): boolean {
  return PLANS[plan].channels.includes(channel);
}

/**
 * What a user actually gets, given what they configured. A downgrade must
 * not break the cron: settings the plan no longer covers fall back to the
 * plan's slowest cadence and the channels that remain.
 */
export function effectiveDelivery(
  plan: PlanId,
  configured: { cadence: CadenceId; channels: ChannelId[] },
): { cadence: CadenceId; channels: ChannelId[] } {
  const limits = PLANS[plan];
  // Fastest cadence the plan allows: the nearest thing to what was asked.
  const fallback = limits.cadences[limits.cadences.length - 1];
  return {
    cadence: cadenceAllowed(plan, configured.cadence) ? configured.cadence : fallback,
    channels: configured.channels.filter((c) => channelAllowed(plan, c)),
  };
}
