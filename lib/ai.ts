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
  return buildChain().length > 0;
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

/** Name signed at the bottom of every proposal. Override with BID_AUTHOR_NAME. */
const BID_AUTHOR = process.env.BID_AUTHOR_NAME || "Seba";
/** The line above the name. Short — "Best," not "Best regards,". */
const BID_SIGNOFF = process.env.BID_SIGNOFF || "Best,";
/** Hard ceiling: the whole proposal stays under this many words. */
const MAX_WORDS = Number(process.env.BID_MAX_WORDS) || 150;

/**
 * Pull URLs out of the client's post. A named URL is the cheapest proof we read the
 * brief — it anchors the hook on their actual site, and gives the closing technical
 * question something concrete to ask about (theme, platform, export format).
 */
function extractLinks(text: string): string[] {
  const m = text.match(/https?:\/\/[^\s<>()"']+/g) || [];
  return [...new Set(m.map((u) => u.replace(/[.,;]+$/, "")))].slice(0, 4);
}

function systemPrompt(a: AgencyProfile): string {
  // Examples are mined for vocabulary only — their LAYOUT is deliberately overridden,
  // since older winning bids used a different (six-block) shape.
  const examples = a.winningProposals.length
    ? `\n\nPast WINNING proposals from this agency — mine these ONLY for domain vocabulary, which services are worth naming, and the level of technical detail that lands. Do NOT copy their layout, their openings, or their wording. Where they differ from the LAYOUT rules above, the rules win:\n${a.winningProposals.map((p, i) => `--- Winning proposal ${i + 1} ---\n${p}`).join("\n\n")}`
    : "";
  const portfolio = a.pastProjects?.trim()
    ? `\n\nPast projects delivered. When relevant, fold ONE into a bullet as proof — but only if genuinely related to the client's need. Never claim a project that isn't here:\n${a.pastProjects.trim()}`
    : "";
  // Optional extra rules the user adds in /settings, layered on top of the core spec.
  const extraRules = a.rules?.length
    ? `\n\nAdditional agency notes:\n${a.rules.map((r) => `- ${r}`).join("\n")}`
    : "";
  const tone = a.tone?.trim() ? `\n\nAgency tone preference: ${a.tone.trim()}` : "";

  return `You are an expert freelance copywriter writing bid proposals as ${BID_AUTHOR} of "${a.name}". The "proposal" you produce must contain ONLY the proposal text a client would read on Freelancer.com — no preamble, headings, or notes.

Write in the FIRST PERSON SINGULAR — "I", never "we" or "our team".

About ${a.name}: ${a.oneLiner} (${a.site})
Strengths (fold in only the 1–2 that fit the client's need — never list all):
${a.strengths.map((s) => `- ${s}`).join("\n")}

=== PROPOSAL RULES — follow every one ===

Write like a senior developer who has already scoped the job: direct, authoritative,
professional. The client is skimming forty bids. Every line must prove CAPABILITY, not
interest. Nothing may read as auto-generated.

LAYOUT — output EXACTLY these four blocks, in this order, with ONE BLANK LINE between
blocks (except where marked NO BLANK LINE):

[1] [hook line 1]
    [hook line 2]              <- NO BLANK LINE between the two hook lines
[2] • [deliverable]
    • [deliverable]            <- NO BLANK LINE between bullets
    • [deliverable]
[3] [one specific technical question]
[4] ${BID_SIGNOFF}
    ${BID_AUTHOR}              <- NO BLANK LINE between the sign-off and the name

BLOCK 1 — THE HOOK (exactly 2 lines)
- Start on an active first-person verb: "I can …", "I'll handle …", "I'll migrate …", "I'll rebuild …".
- Line 1 states their CORE requirement, named specifically in their own words (platform, page count, product count, file type) — not a generic restatement.
- Line 2 explicitly states that you preserve their BRAND IDENTITY or solve their PRIMARY PAIN POINT. Pick whichever their post actually emphasises; never both, never a vague one.
- BANNED openings — never write these or any variant: "I understand you need…", "I understand you are looking for…", "Here is my proposal", "Hello", "Hi", "Dear…", "Greetings", "I am interested in…", "I came across your post", "I read your requirement". No greeting of any kind, no setup, no throat-clearing. Start on the verb.
- Passive voice is banned throughout: "The catalog will be migrated" -> "I'll migrate the catalog".

BLOCK 2 — EXECUTION PLAN (3–4 bullets — never 2, never 5)
- Group their scattered requirements into named deliverables. Lead each bullet with a short capitalised label, then a colon, then the concrete mechanics.
- Labels come from THEIR job, not from a fixed list. Examples of the right shape: "Design/Theme Customization:", "Data/Catalog Transfer:", "System Setup & Integrations:", "Migration & DNS:", "API & Webhooks:", "Testing & Handover:".
- After the colon, name the real technical steps and tools, in their vocabulary and numbers ("all 23 pages", "product variants and images", "301 redirects", "Stripe and shipping zones").
- Bulleting the mechanics is what proves you know HOW to do the work rather than merely that you want it. One line each, 12–22 words. No sub-bullets.

BLOCK 3 — THE TECHNICAL CTA (exactly one question)
- Close the body with ONE specific, technical discovery question about their CURRENT SETUP or FILE STATUS. It must be answerable in one line of chat, and must be something you genuinely need before starting.
- Right shape: "Is your product data exportable as a CSV from your current admin, or is it only in the live database?" / "Are you on managed hosting with cPanel, or a VPS where I'd need SSH access?" / "Do you have the original layered design files, or am I rebuilding from the live pages?"
- Pull it from what their post leaves AMBIGUOUS. If they already stated the answer ("I have a WooCommerce CSV export"), ask about something else — asking what they already told you reads as not having read the brief.
- BANNED: any generic timeline, budget, or availability question — "When do you need this done?", "What's your budget?", "When can we start?", "Do you have a deadline?", "Let me know if you're interested."
- ONE question only. Two splits the reply and slows the client down.
- Never ask for email, phone, WhatsApp, or off-platform contact — that breaks Freelancer rules.
- The mechanism is deliberate: a technical question the client can answer instantly makes them hit Reply, which opens the chat window where projects are actually awarded.

BLOCK 4 — SIGN-OFF
- Exactly two lines: "${BID_SIGNOFF}" then "${BID_AUTHOR}". No blank line between them. Nothing after the name.

LENGTH
- Under ${MAX_WORDS} words TOTAL — aim 115–140. Dense, not padded. If it runs short, add technical specificity inside the bullets; never add a fifth bullet or a filler sentence.

TONE
- Direct, authoritative, professional. Plain English, no buzzwords.
- No flattery, no "I am excited/passionate", no superlatives, no "100% guarantee", no emoji.
- Reuse the client's own nouns and numbers instead of paraphrasing into generic words.

HONESTY
- Never invent client names, fake numbers, or projects we didn't do.
- Promise only work you would actually do, on realistic timelines.
- If their post shares a URL you may say you looked at it — never claim you already diagnosed, logged into, or fixed anything.${tone}${extraRules}${portfolio}${examples}`;
}

/** The shared JSON contract + reminder of the winning shape, used by every proposal call. */
function jsonSpec(extra = ""): string {
  return `Return STRICT JSON only:
{"score": <1-10 int${extra}>, "reasons": [<short strings>], "redFlags": [<short strings, [] if none>], "proposal": "<the proposal TEXT ONLY — under ${MAX_WORDS} words, following the four-block layout exactly: 2 active-voice hook lines ('I can…' / 'I'll handle…', no greeting) / 3–4 labelled deliverable bullets / ONE specific technical question about their current setup or file status / '${BID_SIGNOFF}' + '${BID_AUTHOR}'>"}`;
}

function userPrompt(p: FreelancerProject): string {
  const links = extractLinks(p.description);
  const linkBlock = links.length
    ? `\nLinks the client shared (name the relevant one in the hook or the closing question — paste it verbatim):\n${links.map((l) => `- ${l}`).join("\n")}`
    : `\nLinks the client shared: none — anchor the hook on the most specific artifact in their post instead.`;

  return `Project on Freelancer.com:
Title: ${p.title}
Budget: ${p.budgetMin ?? "?"}–${p.budgetMax ?? "?"} ${p.currency} (${p.projectType})
Existing bids: ${p.bidCount}
Skills tagged: ${p.skills.join(", ") || "none"}
Description:
"""
${p.description}
"""
${linkBlock}

${jsonSpec()}`;
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function scoreAndPropose(p: FreelancerProject, agency: AgencyProfile): Promise<AiResult> {
  if (!hasAnyKey()) return mockResult(p, agency);
  try {
    const raw = await callWithFailover(systemPrompt(agency), userPrompt(p));
    return await ensureLength(parse(raw, p), agency);
  } catch (err) {
    const m = mockResult(p, agency);
    m.redFlags = [...m.redFlags, `AI error: ${err instanceof Error ? err.message : "failed"}`];
    return m;
  }
}

/** Dispatch a system+user prompt to one provider using a specific API key. */
async function callByProvider(provider: Provider, system: string, user: string, key: string): Promise<string> {
  if (provider === "groq") return callGroq(system, user, key);
  if (provider === "openai") return callOpenAI(system, user, key);
  if (provider === "anthropic") return callAnthropic(system, user, key);
  if (provider === "gemini") return callGemini(system, user, key);
  throw new Error("No live AI provider configured");
}

/**
 * Collect every API key for one provider. Supports a comma-separated list in the
 * main var AND numbered extras (e.g. GEMINI_API_KEY, GEMINI_API_KEY_2, _3) — so you
 * can pool several free accounts.
 */
function keysFor(envName: string): string[] {
  const keys: string[] = [];
  const main = process.env[envName];
  if (main) keys.push(...main.split(",").map((k) => k.trim()));
  for (let i = 2; i <= 6; i++) {
    const k = process.env[`${envName}_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  return [...new Set(keys.filter(Boolean))];
}

/**
 * Build the ordered failover chain of (provider, key) pairs. The preferred provider
 * (AI_PROVIDER) goes first, then the rest in a free-first order. When one key hits a
 * quota/rate limit we move to the next — pooling e.g. one Groq key + three Gemini
 * accounts to multiply free capacity, with no manual switching.
 */
function buildChain(): { provider: Provider; key: string }[] {
  const groups: Record<string, string[]> = {
    groq: keysFor("GROQ_API_KEY"),
    gemini: keysFor("GEMINI_API_KEY"),
    openai: keysFor("OPENAI_API_KEY"),
    anthropic: keysFor("ANTHROPIC_API_KEY"),
  };
  const preferred = process.env.AI_PROVIDER || "";
  const order = [preferred, "groq", "gemini", "openai", "anthropic"].filter(
    (p, i, a) => p && groups[p]?.length && a.indexOf(p) === i
  );
  return order.flatMap((p) => groups[p].map((key) => ({ provider: p as Provider, key })));
}

/** True if any provider key is configured (i.e. not mock mode). */
function hasAnyKey(): boolean {
  return buildChain().length > 0;
}

/**
 * Call the AI with automatic failover: try each key in the chain; on a quota / rate-limit
 * (or any) error, fall through to the next. Throws only if every key fails.
 */
async function callWithFailover(system: string, user: string): Promise<string> {
  const chain = buildChain();
  if (!chain.length) throw new Error("No AI provider key configured");
  let lastErr: unknown;
  for (const { provider, key } of chain) {
    try {
      return await callByProvider(provider, system, user, key);
    } catch (err) {
      lastErr = err; // try the next key/provider (rate limit, quota, bad key, transient…)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All AI providers failed");
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Guard the word budget in ONE extra call, and only when the draft is clearly off:
 * over the MAX_WORDS ceiling (models pad the bullets) or under ~85 words (Groq/Llama
 * write terse). Borderline drafts are left alone — a second pass on every proposal
 * triples token usage and trips free-tier rate limits.
 */
async function ensureLength(result: AiResult, agency: AgencyProfile): Promise<AiResult> {
  const wc = wordCount(result.proposal || "");
  const tooLong = wc > MAX_WORDS;
  if (!result.proposal || (!tooLong && wc >= 85)) return result;

  const fix = tooLong
    ? `The proposal below is ${wc} words — over the ${MAX_WORDS}-word ceiling. Cut it to 115–140 words.

Remove words, never blocks: tighten the two hook lines and trim each bullet to its essential deliverable. Do NOT drop a bullet, drop the closing technical question, or drop the sign-off.`
    : `The proposal below is only ${wc} words — too thin. Rewrite it to 115–140 words.

Add the extra words ONLY by making the bullets more specific — name the actual platform, file type, page count, or integration. Do NOT add a fifth bullet, add flattery, or invent a claim.`;

  const user = `${fix}

KEEP the structure exactly: two active-voice hook lines ("I can…" / "I'll handle…", no greeting), 3–4 labelled deliverable bullets, ONE specific technical question about their current setup or file status, then "${BID_SIGNOFF}" and "${BID_AUTHOR}". Keep the bullets bulleted. Keep one blank line between blocks, but NO blank line between the two hook lines, none between bullets, and none between the sign-off line and the name.

Current proposal:
"""
${result.proposal}
"""

Return STRICT JSON only: {"proposal": "<the rewritten 115–140 word proposal text only>"}`;

  try {
    // Same salvage parser: the proposal contains real line breaks (the bullet list),
    // which would make a raw JSON.parse throw.
    const raw = await callWithFailover(systemPrompt(agency), user);
    const fixed = parse(raw, null).proposal;
    const fwc = wordCount(fixed);
    // Accept only if it actually moved toward the target window.
    if (fixed && fwc <= MAX_WORDS && (tooLong ? fwc < wc : fwc > wc)) result.proposal = fixed.trim();
  } catch {
    /* keep the best proposal we have */
  }
  return result;
}

/**
 * Paste mode: write a proposal directly from a pasted project description.
 * No Freelancer connection — the user copies a project from anywhere and pastes it here.
 */
export async function proposeFromText(description: string, agency: AgencyProfile): Promise<AiResult> {
  const links = extractLinks(description);
  const linkBlock = links.length
    ? `\nLinks the client shared (name the relevant one in the hook or the closing question — paste it verbatim):\n${links.map((l) => `- ${l}`).join("\n")}`
    : `\nLinks the client shared: none — anchor the hook on the most specific artifact in their post instead.`;

  const user = `A potential client posted this project. Write a winning bid proposal for it.

Project description:
"""
${description}
"""
${linkBlock}

${jsonSpec(" how well it fits the agency")}`;

  try {
    if (!hasAnyKey()) return mockFromText(description, agency);
    const raw = await callWithFailover(systemPrompt(agency), user);
    return await ensureLength(parse(raw, null), agency);
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
    if (!hasAnyKey()) return mockDoc(description, agency);
    const raw = await callWithFailover(systemPrompt(agency), user);

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

/** A mock in the four-block shape, so offline output previews the real layout. */
function mockProposal(subject: string, description: string, niche: string): string {
  const link = extractLinks(description)[0];
  // The CTA asks about whatever the post leaves ambiguous — platform if they shared a
  // URL we could look at, file status otherwise.
  const cta = link
    ? `Is ${link} running a stock theme, or has it already been custom-coded on top?`
    : `Is your existing content exportable as a CSV/XML file, or does it only live in the admin panel?`;
  return tidyProposal(
    [
      `I can deliver your ${subject} end to end, on your current stack.`,
      `I'll keep your existing brand identity intact throughout — same look, same voice, nothing rebuilt from scratch.`,
      `- Design/Theme Customization: rebuild your current look — fonts, colours, spacing, layout — responsive across desktop and mobile.`,
      `- Data/Catalog Transfer: migrate content, media, and records with existing URLs preserved via 301 redirects.`,
      `- System Setup & Integrations: wire up payments, forms, email, and analytics, then test each one on the live site.`,
      `- Testing & Handover: clean ${niche} build, documented and fully editable by your own team.`,
      cta,
      BID_SIGNOFF,
      BID_AUTHOR,
    ].join("\n")
  );
}

function mockFromText(description: string, a: AgencyProfile): AiResult {
  // Collapse whitespace: a raw slice can carry newlines, which would split the hook line.
  const short = description.trim().replace(/\s+/g, " ").slice(0, 60);
  return {
    score: 7,
    reasons: ["Matches agency skills"],
    redFlags: /cheap|urgent!!!|low budget/i.test(description) ? ["Low-quality signal in description"] : [],
    proposal: `${mockProposal(`project ("${short}…")`, description, a.strengths[0] ?? "web")}\n\n[MOCK — add a free Gemini key (AI_PROVIDER=gemini) for real AI proposals.]`,
  };
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

async function callOpenAI(system: string, user: string, key: string): Promise<string> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
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

async function callGroq(system: string, user: string, key: string): Promise<string> {
  // Groq is OpenAI-compatible. Llama 3.3 70B. FREE, no card.
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  // NOTE: no response_format:json_object here. Strict JSON mode rejects proposals
  // that contain real line breaks (our bulleted method list), returning 400. We ask
  // for JSON in the prompt and let parse() salvage the proposal — which preserves the
  // multi-line formatting we want.
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
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

async function callGemini(system: string, user: string, key: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
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

async function callAnthropic(system: string, user: string, key: string): Promise<string> {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
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
        proposal: tidyProposal(typeof j.proposal === "string" ? j.proposal : ""),
      };
    } catch {
      /* fall through to salvage */
    }
  }
  // Salvage from truncated/malformed JSON: pull score + the proposal string by regex.
  // Greedy capture to the last closing quote (handles internal quotes), then drop a
  // trailing JSON artifact (closing brace) before tidying.
  const scoreM = text.match(/"score"\s*:\s*(\d+)/);
  const propM =
    text.match(/"proposal"\s*:\s*"([\s\S]*)"\s*\}?\s*$/) ||
    text.match(/"proposal"\s*:\s*"([\s\S]*?)"\s*[},]/) ||
    text.match(/"proposal"\s*:\s*"([\s\S]*)/);
  let proposal = propM ? propM[1] : text.trim();
  // Unescape common JSON sequences in the salvaged string.
  proposal = proposal.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return {
    score: scoreM ? clamp(scoreM[1]) : 6,
    reasons: [],
    redFlags: [],
    proposal: tidyProposal(proposal),
  };
}

const clamp = (n: any) => Math.max(1, Math.min(10, Math.round(Number(n) || 5)));
const arr = (x: any): string[] => (Array.isArray(x) ? x.filter((s) => typeof s === "string") : []);

const LIST_MARKER = /^(?:\d+[.)]|[-*•])\s+/;
/** "Best," / "Best regards," / "Thanks," — the line that sits directly above the name. */
const SIGNOFF_WORDS = "best regards|kind regards|warm regards|regards|best|thanks|thank you|sincerely|cheers";
const SIGNOFF_ONLY = new RegExp(`^(?:${SIGNOFF_WORDS})\\s*,?\\s*$`, "i");
const SIGNOFF_INLINE = new RegExp(`^((?:${SIGNOFF_WORDS}))\\s*,\\s*(\\S.{0,40})$`, "i");

/**
 * Normalise the model's proposal into the exact shape the guide specifies — independent
 * of how tidily the model formatted it. We own the whitespace here so every bid looks
 * the same:
 *   - list items are "• " bullets, never numbers — models emit "1.", "-" and "*" freely
 *   - NO blank line between the two hook lines (they read as one opening block)
 *   - NO blank line between bullets
 *   - NO blank line between the sign-off line and the name
 *   - a blank line between every other block, including before the closing question
 */
function tidyProposal(s: string): string {
  let t = (s || "").trim();
  if (!t) return t;
  // Strip leaked JSON artifacts: a dangling closing brace and/or wrapping quotes.
  t = t.replace(/\s*}\s*$/, "").trim();
  t = t.replace(/^"+/, "").replace(/"+$/, "").trim();

  const raw = t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Split an inline "Best, Seba" onto the two lines the layout uses.
  const split: string[] = [];
  for (const l of raw) {
    const m = !LIST_MARKER.test(l) && l.match(SIGNOFF_INLINE);
    if (m) split.push(`${m[1]},`, m[2]);
    else split.push(l);
  }

  // Normalise every list marker to "• " — the guide's execution plan is bulleted, not numbered.
  const lines = split.map((l) => (LIST_MARKER.test(l) ? `• ${l.replace(LIST_MARKER, "")}` : l));

  const out: string[] = [];
  for (const line of lines) {
    const prev = out.length ? out[out.length - 1] : "";
    if (prev) {
      // The hook is two adjacent lines: glue line 2 to line 1 unless the model wrote a
      // one-line hook and went straight into the bullets.
      const glueHook = out.length === 1 && !LIST_MARKER.test(line) && !SIGNOFF_ONLY.test(prev);
      const glueToList = LIST_MARKER.test(prev) && LIST_MARKER.test(line);
      const glueToSignoff = SIGNOFF_ONLY.test(prev);
      if (!glueHook && !glueToList && !glueToSignoff) out.push("");
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

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
  const proposal = `${mockProposal(`"${p.title}"`, p.description, p.skills[0] ?? "web")}\n\n[MOCK proposal — add an OpenAI or Anthropic API key for real AI-written proposals.]`;
  return { score, reasons, redFlags, proposal };
}
