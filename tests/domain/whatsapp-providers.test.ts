import { afterEach, describe, expect, it } from "vitest";

import { sendWhatsApp, sendWhatsAppCode, telnyxAuthPayload, telnyxPayload, whatsappCodeTemplated, whatsappProvider, whatsappSenderNumber } from "@/lib/whatsapp";

const msg = { title: "MacroBrief — Thu", body: "*Lithium*\n• Story", link: "https://macrobrief.com/app/briefs/1", text: "full text" };

describe("telnyxPayload", () => {
  it("sends the approved template with the three variables in order, from/to as bare E.164", () => {
    const p = telnyxPayload("whatsapp:+14155550100", "+56912345678", msg, { name: "macrobrief_daily", language: "en" });
    expect(p.from).toBe("+14155550100");
    expect(p.to).toBe("+56912345678");
    expect(p.whatsapp_message.type).toBe("template");
    const t = (p.whatsapp_message as { template: { name: string; language: { code: string }; components: { parameters: { text: string }[] }[] } }).template;
    expect(t.name).toBe("macrobrief_daily");
    expect(t.language.code).toBe("en");
    expect(t.components[0].parameters.map((x) => x.text)).toEqual([msg.title, "*Lithium* • Story", msg.link]);
  });
  it("flattens newlines, tabs and space runs out of template parameters and caps them at Meta's 1024 chars", () => {
    const long = "x".repeat(2000);
    const p = telnyxPayload("+1", "+2", { ...msg, title: "A\tB", body: `l1\n\nl2\r\n     l3 ${long}` }, { name: "t", language: "en" });
    const params = (p.whatsapp_message as { template: { components: { parameters: { text: string }[] }[] } }).template.components[0].parameters.map((x) => x.text);
    expect(params[0]).toBe("A B");
    expect(params[1].startsWith("l1 l2 l3 x")).toBe(true);
    expect(params[1]).not.toMatch(/[\n\r\t]| {2,}/);
    expect(params[1].length).toBe(1024);
  });
  it("falls back to free-form text when no template is configured", () => {
    const p = telnyxPayload("+1", "+2", msg, null);
    expect(p.whatsapp_message.type).toBe("text");
    expect((p.whatsapp_message as { text: { body: string } }).text.body).toBe("full text");
  });
});

describe("whatsappProvider", () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of ["WHATSAPP_PROVIDER", "TELNYX_API_KEY", "TELNYX_WHATSAPP_FROM", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  it("picks Telnyx when its credentials exist, Twilio otherwise, nothing when neither", () => {
    for (const k of ["WHATSAPP_PROVIDER", "TELNYX_API_KEY", "TELNYX_WHATSAPP_FROM", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM"]) delete process.env[k];
    expect(whatsappProvider()).toBeNull();
    process.env.TWILIO_ACCOUNT_SID = "AC"; process.env.TWILIO_AUTH_TOKEN = "t"; process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+1";
    expect(whatsappProvider()).toBe("twilio");
    process.env.TELNYX_API_KEY = "KEY"; process.env.TELNYX_WHATSAPP_FROM = "+1";
    expect(whatsappProvider()).toBe("telnyx");
    process.env.WHATSAPP_PROVIDER = "twilio";
    expect(whatsappProvider()).toBe("twilio");
  });
});

describe("sendWhatsApp free-form override", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  afterEach(() => {
    for (const k of ["WHATSAPP_PROVIDER", "TELNYX_API_KEY", "TELNYX_WHATSAPP_FROM", "TELNYX_WA_TEMPLATE"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    globalThis.fetch = realFetch;
  });
  it("sends plain text when freeForm is asked for, even with a template configured (verification codes)", async () => {
    process.env.WHATSAPP_PROVIDER = "telnyx";
    process.env.TELNYX_API_KEY = "KEY";
    process.env.TELNYX_WHATSAPP_FROM = "+13863598281";
    process.env.TELNYX_WA_TEMPLATE = "daily_brief";
    const bodies: string[] = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await sendWhatsApp("+16505550100", msg, { freeForm: true });
    await sendWhatsApp("+16505550100", msg);
    expect(JSON.parse(bodies[0]).whatsapp_message.type).toBe("text");
    expect(JSON.parse(bodies[1]).whatsapp_message.type).toBe("template");
  });
  it("exposes the sender number for the click-to-chat link, without a whatsapp: prefix", () => {
    process.env.WHATSAPP_PROVIDER = "telnyx";
    process.env.TELNYX_WHATSAPP_FROM = "+13863598281";
    expect(whatsappSenderNumber()).toBe("+13863598281");
    process.env.WHATSAPP_PROVIDER = "twilio";
    process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
    expect(whatsappSenderNumber()).toBe("+14155238886");
  });
});

describe("verification codes through Meta's Authentication template", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  afterEach(() => {
    for (const k of ["WHATSAPP_PROVIDER", "TELNYX_API_KEY", "TELNYX_WHATSAPP_FROM", "TELNYX_WA_TEMPLATE", "TELNYX_WA_AUTH_TEMPLATE"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    globalThis.fetch = realFetch;
  });
  it("builds the auth payload: the code as body variable AND as the copy-code button's parameter", () => {
    const p = telnyxAuthPayload("+13863598281", "+16505550100", "483920", { name: "verification_code", language: "en" });
    const t = (p.whatsapp_message as { template: { name: string; components: { type: string; sub_type?: string; index?: string; parameters: { type: string; text: string }[] }[] } }).template;
    expect(t.name).toBe("verification_code");
    expect(t.components[0]).toEqual({ type: "body", parameters: [{ type: "text", text: "483920" }] });
    expect(t.components[1]).toEqual({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "483920" }] });
  });
  it("sends the auth template when configured, else falls back to free-form text", async () => {
    process.env.WHATSAPP_PROVIDER = "telnyx";
    process.env.TELNYX_API_KEY = "KEY";
    process.env.TELNYX_WHATSAPP_FROM = "+13863598281";
    process.env.TELNYX_WA_TEMPLATE = "daily_brief";
    const bodies: string[] = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    process.env.TELNYX_WA_AUTH_TEMPLATE = "verification_code";
    expect(whatsappCodeTemplated()).toBe(true);
    await sendWhatsAppCode("+16505550100", "483920", "Your code is 483920");
    delete process.env.TELNYX_WA_AUTH_TEMPLATE;
    expect(whatsappCodeTemplated()).toBe(false);
    await sendWhatsAppCode("+16505550100", "483920", "Your code is 483920");
    const first = JSON.parse(bodies[0]).whatsapp_message;
    expect(first.type).toBe("template");
    expect(first.template.name).toBe("verification_code");
    const second = JSON.parse(bodies[1]).whatsapp_message;
    expect(second.type).toBe("text");
    expect(second.text.body).toBe("Your code is 483920");
  });
});
