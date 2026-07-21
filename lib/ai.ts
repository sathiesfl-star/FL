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
const BID_AUTHOR = process.env.BID_AUTHOR_NAME || "Sathies";
/** The line above the name, e.g. "Best regards," — matches our awarded bids. */
const BID_SIGNOFF = process.env.BID_SIGNOFF || "Best regards,";

/**
 * Pull URLs out of the client's post. Our winning bids open by naming the exact link the
 * client shared ("Hello, I checked <url>") — it proves we actually opened it, which no
 * templated bid does. Surfacing the links to the model makes that line reliable.
 */
function extractLinks(text: string): string[] {
  const m = text.match(/https?:\/\/[^\s<>()"']+/g) || [];
  return [...new Set(m.map((u) => u.replace(/[.,;]+$/, "")))].slice(0, 4);
}

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

This structure is copied from bids this agency has ACTUALLY WON. Do not invent a different
shape. The winning voice is collaborative and evidence-led — "here is what I understood,
correct me, give me access" — NOT salesy. Never pitch, never boast, never use a hook.

LAYOUT — output EXACTLY these six blocks, in this order, with ONE BLANK LINE between
blocks (except where marked NO BLANK LINE):

[1] Hello, I checked [the exact URL the client shared]
[2] [one dense scope sentence]
[3] [one short access question]
[4] Understandings; (correct if needed)
    1. [understanding]        <- NO BLANK LINE between block 4's header and the numbers
    2. [understanding]
    3. [understanding]
[5] ${BID_SIGNOFF}
    ${BID_AUTHOR}             <- NO BLANK LINE between the sign-off and the name
[6] [one private-chat proof line]

BLOCK 1 — EVIDENCE OPENER
- If the client's post contains a URL, write exactly: "Hello, I checked <that full URL>" — paste the URL verbatim, do not shorten or alter it. Use the URL of the site that NEEDS THE WORK, not their live/other site, if you can tell them apart.
- If there is NO URL, instead name the most specific concrete artifact in their post (a file, page count, repo, platform, error) in one short line: e.g. "Hello, I read through your 23-page Elementor build."
- Nothing else on this line. No pitch, no "I'm interested".

BLOCK 2 — SCOPE MIRROR
- ONE dense sentence beginning "Let us …" that plays their WHOLE scope back to them, items joined by commas or dashes, using THEIR OWN vocabulary and numbers.
- This proves comprehension better than any claim. Copy their nouns ("23-page", "broken/dead links", "review/FAQ schema") rather than paraphrasing into generic words.

BLOCK 3 — THE ASK (EARLY, not at the end)
- ONE short question asking for the exact access or input you need to start: editor credentials, repo access, designs, a sample file, admin login.
- If their post already offers it ("message me for credentials"), ask for precisely that.
- Frame it as needed BEFORE committing: "… so we can inspect the build before quoting?"
- Never ask for email, phone, WhatsApp, or off-platform contact — that breaks Freelancer rules.

BLOCK 4 — UNDERSTANDINGS
- Start with the literal header line: "Understandings; (correct if needed)"
- Then EXACTLY 3 numbered lines: "1. ", "2. ", "3. " — NEVER bullets, dashes, or "•".
- Each is a concrete step or assumption in 8–16 words, naming the real action and order of work (audit first, then repair; test desktop and mobile; restore dashboard access).
- Inviting correction is deliberate — it lowers the client's risk and starts a conversation.

BLOCK 5 — SIGN-OFF
- Exactly two lines: "${BID_SIGNOFF}" then "${BID_AUTHOR}". No blank line between them.

BLOCK 6 — PROOF, DEFERRED
- ONE line AFTER the sign-off offering to share directly relevant past work in private chat, naming the specific niche: e.g. "I will share similar WordPress repair/recovery work in a private chat."
- This is why it works: it gives the client a reason to reply, and keeps the bid honest — you show proof instead of claiming numbers.

LENGTH
- 85–115 words total. Dense, not padded. If short, add specificity to the 3 understandings — never add filler sentences or extra blocks.

TONE
- Plain, natural English. Slightly clipped and practical, like a working developer typing fast.
- No buzzwords, no "Dear Sir/Madam", no flattery, no "I am excited/interested", no superlatives.
- Match the client's own tone and reuse their words.

HONESTY
- Never invent client names, fake numbers, or projects we didn't do.
- No "100% guarantee" or unrealistic timelines.
- Claim only that you CHECKED the link they shared — never claim to have already diagnosed, fixed, or logged into anything.${tone}${extraRules}${portfolio}${examples}`;
}

/** The shared JSON contract + reminder of the winning shape, used by every proposal call. */
function jsonSpec(extra = ""): string {
  return `Return STRICT JSON only:
{"score": <1-10 int${extra}>, "reasons": [<short strings>], "redFlags": [<short strings, [] if none>], "proposal": "<the proposal TEXT ONLY — 85–115 words, following the six-block layout exactly: 'Hello, I checked <url>' / 'Let us …' scope sentence / one access question / 'Understandings; (correct if needed)' + 3 NUMBERED lines / '${BID_SIGNOFF}' + '${BID_AUTHOR}' / one private-chat proof line AFTER the sign-off>"}`;
}

function userPrompt(p: FreelancerProject): string {
  const links = extractLinks(p.description);
  const linkBlock = links.length
    ? `\nLinks the client shared (open BLOCK 1 with the one that needs the work — paste it verbatim):\n${links.map((l) => `- ${l}`).join("\n")}`
    : `\nLinks the client shared: none — use the "no URL" form of BLOCK 1.`;

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
 * Some models (notably Groq/Llama) write very concise proposals that fall under the
 * 90-word floor. If so, do ONE expand pass that keeps the same structure but adds
 * concrete detail. Cheap + fast; only runs when the draft is short.
 */
async function ensureLength(result: AiResult, agency: AgencyProfile): Promise<AiResult> {
  // Concise models (Groq/Llama) sometimes write short. Do at most ONE expand pass,
  // and only when the draft is clearly short (< 80 words) — expanding every borderline
  // proposal triples token usage and trips free-tier rate limits.
  for (let attempt = 0; attempt < 1; attempt++) {
    if (!result.proposal || wordCount(result.proposal) >= 80) break;
    const wc = wordCount(result.proposal);
    const user = `The proposal below is only ${wc} words — too short. Rewrite it to 95–115 words.

KEEP all six blocks exactly as they are, in order and unchanged in kind: the "Hello, I checked …" opener (same URL, verbatim), the "Let us …" scope sentence, the access question, the "Understandings; (correct if needed)" header with its 3 NUMBERED lines, the "${BID_SIGNOFF}" / "${BID_AUTHOR}" sign-off, and the private-chat proof line AFTER the sign-off.

Add the extra words ONLY by making the 3 understandings more specific — name the actual step, page count, or tool. Do NOT add a new block, a new sentence, filler, flattery, or any invented claim. Keep the numbered list numbered (never bullets). Keep one blank line between blocks, but NO blank line between the "Understandings" header and the numbers, and none between the sign-off line and the name.

Current proposal:
"""
${result.proposal}
"""

Return STRICT JSON only: {"proposal": "<the expanded 95–115 word proposal text only>"}`;
    try {
      const raw = await callWithFailover(systemPrompt(agency), user);
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
  const links = extractLinks(description);
  const linkBlock = links.length
    ? `\nLinks the client shared (open BLOCK 1 with the one that needs the work — paste it verbatim):\n${links.map((l) => `- ${l}`).join("\n")}`
    : `\nLinks the client shared: none — use the "no URL" form of BLOCK 1.`;

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

/** A mock in the winning six-block shape, so offline output previews the real layout. */
function mockProposal(subject: string, description: string, niche: string): string {
  const link = extractLinks(description)[0];
  const opener = link ? `Hello, I checked ${link}` : `Hello, I read through your ${subject} post.`;
  return tidyProposal(
    [
      opener,
      `Let us complete your ${subject} — confirm the full scope, do the build, verify on desktop and mobile, and hand it back fully editable.`,
      `Send access so we can inspect the current setup before quoting?`,
      `Understandings; (correct if needed)`,
      `1. Audit the current state first, then repair rather than rebuild if salvageable`,
      `2. Confirm every deliverable you listed, tested on both desktop and mobile`,
      `3. Hand back clean, documented, and editable by your own team`,
      BID_SIGNOFF,
      BID_AUTHOR,
      `I will share similar ${niche} work in a private chat.`,
    ].join("\n")
  );
}

function mockFromText(description: string, a: AgencyProfile): AiResult {
  const short = description.trim().slice(0, 60);
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
const UNDERSTANDINGS = /^understandings\b/i;
/** "Best regards," / "Thanks," / "Regards" — the line that sits directly above the name. */
const SIGNOFF_WORDS = "best regards|kind regards|warm regards|regards|thanks|thank you|sincerely|cheers";
const SIGNOFF_ONLY = new RegExp(`^(?:${SIGNOFF_WORDS})\\s*,?\\s*$`, "i");
const SIGNOFF_INLINE = new RegExp(`^((?:${SIGNOFF_WORDS}))\\s*,\\s*(\\S.{0,40})$`, "i");

/**
 * Normalise the model's proposal into the exact shape of our awarded bids — independent
 * of how tidily the model formatted it. We own the whitespace here so every bid looks
 * the same as the ones that won:
 *   - list items are NUMBERED ("1. "), never bullets — models love "•", we renumber them
 *   - NO blank line between "Understandings; (correct if needed)" and the numbers
 *   - NO blank line between the sign-off line and the name
 *   - a blank line between every other block, including before the trailing proof line
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

  // Split an inline "Best regards, Sathies" onto the two lines the winning layout uses.
  const split: string[] = [];
  for (const l of raw) {
    const m = !LIST_MARKER.test(l) && l.match(SIGNOFF_INLINE);
    if (m) split.push(`${m[1]},`, m[2]);
    else split.push(l);
  }

  // Renumber every run of list items sequentially, converting bullets to numbers.
  const lines: string[] = [];
  let n = 0;
  for (const l of split) {
    if (LIST_MARKER.test(l)) lines.push(`${++n}. ${l.replace(LIST_MARKER, "")}`);
    else {
      n = 0;
      lines.push(l);
    }
  }

  const out: string[] = [];
  for (const line of lines) {
    const prev = out.length ? out[out.length - 1] : "";
    if (prev) {
      const glueToHeader = UNDERSTANDINGS.test(prev) && LIST_MARKER.test(line);
      const glueToList = LIST_MARKER.test(prev) && LIST_MARKER.test(line);
      const glueToSignoff = SIGNOFF_ONLY.test(prev);
      if (!glueToHeader && !glueToList && !glueToSignoff) out.push("");
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
