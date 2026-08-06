/**
 * POST /api/analyze-message
 * Semantic intent read of a pasted WhatsApp / SMS / DM message: what is this
 * message actually trying to make the reader do?
 */

import type { Config } from "@netlify/functions";
import { askJson, bad, clampScore, clean, DATA_ONLY, json } from "../lib/ai.mts";

const SYSTEM = `You are a scam-intent analyst for an awareness tool called No Cap.
${DATA_ONLY}
A visitor has pasted a message they received. Work out what the sender wants.

Read for:
- manufactured urgency: deadlines, "within 24 hours", account closure, legal threat
- authority impersonation: bank, courier, tax office, police, employer, a family member
- money movement: transfers, gift cards, crypto, UPI, "small fee to release"
- pricing that cannot be real: flagship goods at a fraction of retail
- credential and code harvesting: passwords, OTPs, "confirm your identity"
- links, especially shortened ones or addresses that do not match the claimed sender
- job, investment and lottery bait: guaranteed returns, easy part-time work, a prize
- relationship openers: a wrong number that becomes a conversation, "hi mum, new phone"
- pressure to move the conversation to another app
- reused scam-script wording and awkward machine-translated phrasing
- requests for secrecy

Judge intent, not grammar. Real businesses do send urgent messages, and a
badly-written message from a friend is just a badly-written message. Be clear
when a message looks ordinary.

Reply with JSON only:
{
  "riskScore": number 0-100,
  "intent": string (a short phrase naming what the sender is after, e.g.
            "harvest a one-time code", "collect an advance fee", "nothing suspicious"),
  "category": "phishing" | "advance-fee" | "investment" | "job-offer" | "impersonation" |
              "romance" | "prize" | "delivery" | "extortion" | "benign" | "unclear",
  "signals": [
    { "name": string, "state": "clear" | "flag" | "unclear",
      "quote": string (the exact words that triggered it, or ""),
      "note": string (one sentence) }
  ],
  "summary": string (2-3 sentences to a non-technical reader),
  "advice": string (what to do, in the imperative, one or two sentences)
}`;

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return bad("Use POST", 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Expected a JSON body");
  }

  const text = clean(body?.text, 6000);
  if (text.length < 10) return bad("Paste the message you want checked");

  const context = clean(body?.context, 200);
  const prefix = context ? `Context supplied by the visitor: ${context}\n\n` : "";

  const result = await askJson(SYSTEM, `<content>\n${prefix}${text}\n</content>`, 1000);
  if (!result) return json({ available: false, reason: "The analysis model is unavailable right now." });

  const signals = Array.isArray(result.signals) ? result.signals : [];
  const categories = [
    "phishing", "advance-fee", "investment", "job-offer", "impersonation",
    "romance", "prize", "delivery", "extortion", "benign", "unclear",
  ];

  return json({
    available: true,
    riskScore: clampScore(result.riskScore, 50),
    intent: clean(result.intent, 120),
    category: categories.includes(result.category) ? result.category : "unclear",
    signals: signals.slice(0, 12).map((s: any) => ({
      name: clean(s?.name, 60),
      state: ["clear", "flag", "unclear"].includes(s?.state) ? s.state : "unclear",
      quote: clean(s?.quote, 200),
      note: clean(s?.note, 300),
    })),
    summary: clean(result.summary, 800),
    advice: clean(result.advice, 400),
  });
};

export const config: Config = { path: "/api/analyze-message" };
