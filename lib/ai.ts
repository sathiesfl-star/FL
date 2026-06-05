/**
 * AI layer — provider-flexible (OpenAI or Anthropic), with a mock fallback.
 *
 * Provider chosen by env:
 *   AI_PROVIDER=groq       + GROQ_API_KEY       -> Groq (Llama 3.3 70B) — FREE, no card, generous
 *   AI_PROVIDER=gemini     + GEMINI_API_KEY     -> Google Gemini (gemini-2.5-flash) — FREE, low daily cap
 *   AI_PROVIDER=openai     + OPENAI_API_KEY     -> ChatGPT (gpt-4o-mini by default) — paid
 *   AI_PROVIDER=anthropic  + ANTHROPIC_API_KEY  -> Claude  (sonnet by default) — paid
 *   (auto-detect: if AI_PROVIDER unset, uses whichever key is present)
 *   no key                 -> "mock" mode: deterministic sample output, zero cost.
 *
 * The agency profile (bio, tone, rules, winning proposals) is passed in — it lives in the DB
 * and is editable from /settings, so proposals always use the latest.
 */
import type { FreelancerProject } from "./freelancer";
import type { AgencyProfile } from "./agency-profile";

type Provider = "openai" | "anthropic" | "gemini" | "groq" | "mock";

export function resolveProvider(): Provider {
  const explicit = process.env.AI_PROVIDER as Provider | undefined;
  if (explicit === "groq" && process.env.GROQ_API_KEY) return "groq";
  if (explicit === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (explicit === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (explicit === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  // auto-detect (prefer the generous free option first)
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "mock";
}

export function isAiLive(): boolean {
  return resolveProvider() !== "mock";
}

export interface AiResult {
  score: number; // 1-10
  reasons: string[];
  redFlags: string[];
  proposal: string;
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

/** Name signed at the bottom of every proposal. Configurable, defaults to Seba. */
const BID_AUTHOR = process.env.BID_AUTHOR_NAME || "Seba";

function systemPrompt(a: AgencyProfile): string {
  const examples = a.winningProposals.length
    ? `\n\nPast WINNING proposals from this agency — match their tone and structure (do NOT copy them verbatim):\n${a.winningProposals.map((p, i) => `--- Winning proposal ${i + 1} ---\n${p}`).join("\n\n")}`
    : "";
  const portfolio = a.pastProjects?.trim()
    ? `\n\nPast projects this agency has delivered. When relevant, reference 1–2 of these as proof — but ONLY ones genuinely related to the client's need. Never claim a project that isn't here:\n${a.pastProjects.trim()}`
    : "";
  // Optional extra rules the user adds in /settings, layered on top of the core spec.
  const extraRules = a.rules?.length
    ? `\n\nAdditional agency notes:\n${a.rules.map((r) => `- ${r}`).join("\n")}`
    : "";
  const tone = a.tone?.trim() ? `\n\nAgency tone preference: ${a.tone.trim()}` : "";

  return `You write freelance bid proposals for ${BID_AUTHOR} of "${a.name}", an IT outsourcing agency. The "proposal" you produce must contain ONLY the proposal text a client would read on Freelancer.com — no preamble, headings, or notes.

About ${a.name}: ${a.oneLiner} (${a.site})
Strengths (mention only the 1–2 that fit the client's need — never list all):
${a.strengths.map((s) => `- ${s}`).join("\n")}

=== PROPOSAL RULES — follow every one ===

STRUCTURE
- FIRST LINE: ONE short, punchy sentence — MAXIMUM 12 words — a confident hook about the result you'll deliver. This is paragraph 1 BY ITSELF: do NOT add a second sentence to it. End it, then a line break.
- HARD BAN — the proposal must NOT begin with any of these words/phrases: "You need", "You want", "You're looking", "You require", "You have", "Happy to", "I'm interested", "I can", "I would", "Dear". Never tell the client what they need. Lead with the OUTCOME you'll deliver or a sharp hook tied to their task — phrased FRESH in your own words each time. Never reuse a stock line (e.g. do NOT end the opener with "…that's the goal").
- After the opener, ONE short sentence (not a long run-on) referencing a specific detail from their description to prove you read it.
- LENGTH: the finished proposal MUST be 100–125 words. Count as you write. Models tend to undershoot — if your draft is under 100 words, EXPAND each bullet (more specifics) until it reaches 100+. Never submit under 90. Keep the opener and understanding short; the word count comes from the bullets.
- Required parts, in order: (1) the short one-line opener, (2) ONE short understanding sentence, (3) 2–3 method bullets, (4) ONE sentence of honest relevant proof, (5) the closing question, (6) "Thanks, ${BID_AUTHOR}".
- Each method bullet must be a full, specific phrase (8–14 words) naming the actual step and tool — not 3-word fragments.
- FORMATTING: put each method bullet on its OWN line, each starting with "• " (a bullet dot + space). Separate the bullets with line breaks — NEVER write them inline, join them with commas, or use a dash/asterisk.
- Include ONE sentence of credible proof: a specific relevant experience or result that fits their need (honest — never invented).
- Keep sentences clear and readable; use 2–3 bullets for the method. Avoid one giant block of text.
- Mention only 1–2 relevant skills or past projects that fit their need — never list all services.

TONE
- Plain, natural English. No buzzwords, no "Dear Sir/Madam," no over-formality.
- Sound like a real developer wrote it — confident and human, not a template.
- Match the client's tone and reuse their own words for the task.

HONESTY
- Never invent client names, fake numbers, or projects we didn't do. Keep past-work claims honest.
- No "100% guarantee" or unrealistic timelines.
- If requirements are vague, ask one clarifying question instead of guessing.

ENDING
- End the body with ONE simple question or next step the client can answer directly in Freelancer chat.
- Never ask for email, phone, or off-platform contact (breaks Freelancer rules and adds friction).
- Then sign off on a new line, exactly: "Thanks, ${BID_AUTHOR}"${tone}${extraRules}${portfolio}${examples}`;
}

function userPrompt(p: FreelancerProject): string {
  return `Project on Freelancer.com:
Title: ${p.title}
Budget: ${p.budgetMin ?? "?"}–${p.budgetMax ?? "?"} ${p.currency} (${p.projectType})
Existing bids: ${p.bidCount}
Skills tagged: ${p.skills.join(", ") || "none"}
Description:
"""
${p.description}
"""

Return STRICT JSON only:
{"score": <1-10 int>, "reasons": [<short strings>], "redFlags": [<short strings, [] if none>], "proposal": "<the proposal TEXT ONLY — MUST be 90–130 words (count them; never under 90), with 2–3 method bullets, following every rule, ending on a new line with 'Thanks, ${BID_AUTHOR}'>"}`;
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function scoreAndPropose(p: FreelancerProject, agency: AgencyProfile): Promise<AiResult> {
  const provider = resolveProvider();
  try {
    if (provider === "mock") return mockResult(p, agency);
    const raw = await callByProvider(provider, systemPrompt(agency), userPrompt(p));
    return await ensureLength(parse(raw, p), provider, agency);
  } catch (err) {
    const m = mockResult(p, agency);
    m.redFlags = [...m.redFlags, `AI error: ${err instanceof Error ? err.message : "failed"}`];
    return m;
  }
}

/** Dispatch a system+user prompt to the active provider's chat function. */
async function callByProvider(provider: Provider, system: string, user: string): Promise<string> {
  if (provider === "groq") return callGroq(system, user);
  if (provider === "openai") return callOpenAI(system, user);
  if (provider === "anthropic") return callAnthropic(system, user);
  if (provider === "gemini") return callGemini(system, user);
  throw new Error("No live AI provider configured");
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Some models (notably Groq/Llama) write very concise proposals that fall under the
 * 90-word floor. If so, do ONE expand pass that keeps the same structure but adds
 * concrete detail. Cheap + fast; only runs when the draft is short.
 */
async function ensureLength(result: AiResult, provider: Provider, agency: AgencyProfile): Promise<AiResult> {
  // Concise models (Groq/Llama) undershoot, and the expand pass can undershoot too —
  // so loop up to twice, stopping as soon as we clear the 90-word floor.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!result.proposal || wordCount(result.proposal) >= 90) break;
    const wc = wordCount(result.proposal);
    const user = `The proposal below is only ${wc} words — too short. Rewrite it to 115–130 words, keeping the SAME short one-line opener, the method bullets, the honest proof sentence, the closing question, and the exact final line "Thanks, ${BID_AUTHOR}". Keep the opener and understanding short — add the extra words by making each bullet more specific. Each bullet on its OWN line starting with "• " (a bullet dot; real line breaks between them, never inline or comma-joined). No filler, no invented claims, and never start with "You need/You want/Dear".

Current proposal:
"""
${result.proposal}
"""

Return STRICT JSON only: {"proposal": "<the expanded 115–130 word proposal text only>"}`;
    try {
      const raw = await callByProvider(provider, systemPrompt(agency), user);
      // Use the same salvage parser — the expanded proposal contains real line breaks
      // (the bullet list), which would make a raw JSON.parse throw.
      const expanded = parse(raw, null).proposal;
      if (!expanded || wordCount(expanded) <= wc) break; // no progress — stop
      result.proposal = expanded.trim();
    } catch {
      break; // keep the best proposal so far if the expand call fails
    }
  }
  return result;
}

/**
 * Paste mode: write a proposal directly from a pasted project description.
 * No Freelancer connection — the user copies a project from anywhere and pastes it here.
 */
export async function proposeFromText(description: string, agency: AgencyProfile): Promise<AiResult> {
  const provider = resolveProvider();
  const user = `A potential client posted this project. Write a winning bid proposal for it.

Project description:
"""
${description}
"""

Return STRICT JSON only:
{"score": <1-10 int how well it fits the agency>, "reasons": [<short strings>], "redFlags": [<short risk strings, [] if none>], "proposal": "<the proposal TEXT ONLY — MUST be 90–130 words (count them; never under 90), with 2–3 method bullets, following every rule, ending on a new line with 'Thanks, ${BID_AUTHOR}'>"}`;

  try {
    if (provider === "mock") return mockFromText(description, agency);
    const raw = await callByProvider(provider, systemPrompt(agency), user);
    return await ensureLength(parse(raw, null), provider, agency);
  } catch (err) {
    const m = mockFromText(description, agency);
    m.redFlags = [...m.redFlags, `AI error: ${err instanceof Error ? err.message : "failed"}`];
    return m;
  }
}

// ---------------------------------------------------------------------------
// Full project document (for NDA / high-value bids) — a detailed multi-section doc.
// ---------------------------------------------------------------------------

export interface ProjectDoc {
  title: string;
  understanding: string; // our understanding of the client's need
  solution: string; // proposed approach/solution
  scope: string[]; // deliverables / scope items
  techStack: string[];
  phases: { name: string; detail: string }[]; // timeline phases
  whyUs: string;
  nextSteps: string;
}

export async function generateProjectDoc(description: string, agency: AgencyProfile): Promise<ProjectDoc> {
  const provider = resolveProvider();
  const user = `A potential client posted this project (may be high-value/NDA). Produce a DETAILED, professional project document we can send them.

Project description:
"""
${description}
"""

Return STRICT JSON only with these keys:
{
  "title": "<a clear project title>",
  "understanding": "<2-4 sentences showing we understand their need, referencing specifics>",
  "solution": "<a paragraph describing our proposed approach/solution>",
  "scope": ["<deliverable/scope item>", ...],
  "techStack": ["<technology>", ...],
  "phases": [{"name": "<phase name>", "detail": "<what happens, rough duration>"}, ...],
  "whyUs": "<a paragraph on why this agency is the right choice>",
  "nextSteps": "<1-2 sentences on how to proceed>"
}`;

  try {
    let raw = "";
    if (provider === "groq") raw = await callGroq(systemPrompt(agency), user);
    else if (provider === "openai") raw = await callOpenAI(systemPrompt(agency), user);
    else if (provider === "anthropic") raw = await callAnthropic(systemPrompt(agency), user);
    else if (provider === "gemini") raw = await callGemini(systemPrompt(agency), user);
    else return mockDoc(description, agency);

    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      return {
        title: String(j.title || "Project Proposal"),
        understanding: String(j.understanding || ""),
        solution: String(j.solution || ""),
        scope: arr(j.scope),
        techStack: arr(j.techStack),
        phases: Array.isArray(j.phases) ? j.phases.map((p: any) => ({ name: String(p.name || ""), detail: String(p.detail || "") })) : [],
        whyUs: String(j.whyUs || ""),
        nextSteps: String(j.nextSteps || ""),
      };
    }
    return mockDoc(description, agency);
  } catch {
    return mockDoc(description, agency);
  }
}

function mockDoc(description: string, a: AgencyProfile): ProjectDoc {
  return {
    title: "Project Proposal",
    understanding: `Based on your requirement ("${description.trim().slice(0, 80)}…"), you need a professionally delivered solution. [MOCK — add an AI key for a real detailed document.]`,
    solution: `${a.name} will deliver this end to end, with clean code, clear communication, and on-time milestones.`,
    scope: ["Discovery & scope finalization", "Design", "Development", "Testing & QA", "Deployment & handover"],
    techStack: a.strengths.slice(0, 4),
    phases: [
      { name: "Phase 1 — Discovery", detail: "Finalize scope & designs (~1 week)" },
      { name: "Phase 2 — Build", detail: "Core development (~2-3 weeks)" },
      { name: "Phase 3 — Launch", detail: "Testing, deployment, handover (~1 week)" },
    ],
    whyUs: `${a.name}: ${a.oneLiner}`,
    nextSteps: "Let's schedule a short call to confirm scope and timeline.",
  };
}

function mockFromText(description: string, a: AgencyProfile): AiResult {
  const short = description.trim().slice(0, 60);
  return {
    score: 7,
    reasons: ["Matches agency skills"],
    redFlags: /cheap|urgent!!!|low budget/i.test(description) ? ["Low-quality signal in description"] : [],
    proposal: `Your project ("${short}…") is squarely in our wheelhouse. At ${a.name} we've delivered similar work end to end — clean build, clear updates, on-time. To move fast I'd start by confirming scope and must-have features, then share a short milestone plan. What's your target deadline?\n\nThanks, ${BID_AUTHOR}\n\n[MOCK — add a free Gemini key (AI_PROVIDER=gemini) for real AI proposals.]`,
  };
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

async function callOpenAI(system: string, user: string): Promise<string> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callGroq(system: string, user: string): Promise<string> {
  // Groq is OpenAI-compatible. Llama 3.3 70B supports JSON mode. FREE, no card.
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  // NOTE: no response_format:json_object here. Strict JSON mode rejects proposals
  // that contain real line breaks (our bulleted method list), returning 400. We ask
  // for JSON in the prompt and let parse() salvage the proposal — which preserves the
  // multi-line formatting we want.
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.6,
      max_tokens: 900,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callGemini(system: string, user: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const key = process.env.GEMINI_API_KEY as string;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        // thinkingBudget:0 disables Gemini 2.5's "thinking" phase (which otherwise eats the
        // token budget and truncates the JSON). maxOutputTokens gives headroom for the proposal.
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callAnthropic(system: string, user: string): Promise<string> {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  return data?.content?.[0]?.text ?? "";
}

// ---------------------------------------------------------------------------
// Parse + mock
// ---------------------------------------------------------------------------

function parse(text: string, _p: FreelancerProject | null): AiResult {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const j = JSON.parse(match[0]);
      return {
        score: clamp(j.score),
        reasons: arr(j.reasons),
        redFlags: arr(j.redFlags),
        proposal: typeof j.proposal === "string" ? j.proposal.trim() : "",
      };
    } catch {
      /* fall through to salvage */
    }
  }
  // Salvage from truncated/malformed JSON: pull score + the proposal string by regex.
  const scoreM = text.match(/"score"\s*:\s*(\d+)/);
  const propM = text.match(/"proposal"\s*:\s*"([\s\S]*?)"\s*[},]/) || text.match(/"proposal"\s*:\s*"([\s\S]*)/);
  let proposal = propM ? propM[1] : text.trim();
  // Unescape common JSON sequences in the salvaged string.
  proposal = proposal.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
  return {
    score: scoreM ? clamp(scoreM[1]) : 6,
    reasons: [],
    redFlags: [],
    proposal,
  };
}

const clamp = (n: any) => Math.max(1, Math.min(10, Math.round(Number(n) || 5)));
const arr = (x: any): string[] => (Array.isArray(x) ? x.filter((s) => typeof s === "string") : []);

function mockResult(p: FreelancerProject, a: AgencyProfile): AiResult {
  const budget = p.budgetMax ?? p.budgetMin ?? 0;
  let score = 6;
  if (budget >= 1000) score += 2;
  if (p.bidCount <= 10) score += 1;
  if (/cheap|urgent!!!|low budget/i.test(p.title + p.description)) score -= 3;
  score = Math.max(1, Math.min(10, score));
  const reasons = [
    budget >= 1000 ? "Healthy budget" : "Modest budget",
    p.bidCount <= 10 ? "Low competition" : `${p.bidCount} bids already`,
    "Matches agency skills",
  ];
  const redFlags = /cheap|urgent!!!/i.test(p.title + p.description) ? ["Low-quality signal in description"] : [];
  const proposal = `Your "${p.title}" project is squarely in our wheelhouse. At ${a.name} we've delivered similar ${p.skills[0] ?? "web"} work end to end — clean build, clear updates, on-time. To move fast I'd confirm scope and must-have features first, then share a short milestone plan. What's your target deadline?\n\nThanks, ${BID_AUTHOR}\n\n[MOCK proposal — add an OpenAI or Anthropic API key for real AI-written proposals.]`;
  return { score, reasons, redFlags, proposal };
}
