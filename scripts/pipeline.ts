/**
 * Run the whole loop for one topic, locally, without signing in:
 * create (or reuse) a smoke user, add the topic, discover + verify sources,
 * poll them, compose the due brief, attempt delivery, print everything.
 *
 *   npx tsx scripts/pipeline.ts "Chilean lithium policy" es
 *
 * Needs DATABASE_URL; ANTHROPIC_API_KEY for suggestions + composition.
 */
import { composeDueBriefs } from "../src/lib/briefs";
import { deliverPending } from "../src/lib/delivery";
import { normalizeQuery } from "../src/lib/domain/discovery";
import { pollDueSources } from "../src/lib/ingest";
import { prisma } from "../src/lib/prisma";
import { attachSourcesForTopic } from "../src/lib/sources";

const SMOKE_EMAIL = "smoke@macrobrief.local";

async function main() {
  const [name, lang = "en"] = process.argv.slice(2);
  if (!name) throw new Error('usage: npx tsx scripts/pipeline.ts "topic" [lang]');

  const user = await prisma.user.upsert({
    where: { email: SMOKE_EMAIL },
    update: {},
    create: { email: SMOKE_EMAIL, name: "Smoke", plan: "PRO", schedule: { create: { cadence: "DAILY", hour: 7, timezone: "UTC" } } },
  });
  await prisma.deliveryChannel.upsert({
    where: { userId_channel: { userId: user.id, channel: "EMAIL" } },
    update: {},
    create: { userId: user.id, channel: "EMAIL", address: SMOKE_EMAIL, verified: true },
  });
  // A fresh run every time: wipe earlier smoke briefs and topics (sources are global and stay).
  await prisma.brief.deleteMany({ where: { userId: user.id } });
  await prisma.topic.deleteMany({ where: { userId: user.id } });

  const topic = await prisma.topic.create({ data: { userId: user.id, name, query: normalizeQuery(name), lang } });
  console.log(`topic ${topic.id}: ${topic.name}`);

  console.time("attach sources");
  const attached = await attachSourcesForTopic(topic);
  console.timeEnd("attach sources");
  console.log("sources:", attached);

  const sources = await prisma.topicSource.findMany({ where: { topicId: topic.id }, include: { source: true } });
  console.time("poll");
  const polled = await pollDueSources(new Date(), { sourceIds: sources.map((s) => s.sourceId) });
  console.timeEnd("poll");
  console.log("poll:", polled);
  for (const { source } of await prisma.topicSource.findMany({ where: { topicId: topic.id }, include: { source: { include: { _count: { select: { items: true } } } } } })) {
    console.log(`  ${source.kind.padEnd(11)} ${String(source._count.items).padStart(4)} items  ${source.lastError ? "ERR " + source.lastError : "ok"}  ${source.url}`);
  }

  console.time("compose");
  const composed = await composeDueBriefs(new Date(), { userId: user.id });
  console.timeEnd("compose");
  console.log("compose:", composed);

  const delivered = await deliverPending();
  console.log("deliver:", delivered);

  const brief = await prisma.brief.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { deliveries: true } });
  if (brief) {
    console.log(`\nmodel=${brief.model} in=${brief.inputTokens} out=${brief.outputTokens}`);
    console.log("deliveries:", brief.deliveries.map((d) => `${d.channel} ${d.status} ${d.error ?? ""}`));
    console.log("\n" + brief.bodyText);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
