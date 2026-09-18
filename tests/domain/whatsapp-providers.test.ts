import { afterEach, describe, expect, it } from "vitest";

import { telnyxPayload, whatsappProvider } from "@/lib/whatsapp";

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
    expect(t.components[0].parameters.map((x) => x.text)).toEqual([msg.title, msg.body, msg.link]);
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
