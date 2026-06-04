/**
 * Overseas remote job-board readers — extra, ToS-safe project sources for an
 * India-based agency that wants international (US / UK / EU) contract work.
 *
 * All sources are PUBLIC RSS feeds (no token, no scraping, no account risk),
 * the same safe approach as the Freelancer RSS reader. Listings are mapped into
 * the shared FreelancerProject shape so they flow through the same relevance
 * scoring, filtering and feed UI.
 *
 *   RemoteOK         https://remoteok.com/remote-<tag>-jobs.rss
 *   WeWorkRemotely   https://weworkremotely.com/categories/<category>.rss
 *
 * Toggle with JOB_BOARDS env (comma list): "remoteok,weworkremotely" (default both).
 * Set JOB_BOARDS=off to disable entirely.
 */

import type { FreelancerProject } from "./freelancer";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
  Accept: "application/rss+xml, application/xml, text/xml",
};

/** Which boards are enabled. Default: all. JOB_BOARDS=off disables all.
 *  remotive + arbeitnow are JSON APIs that work from cloud servers (Vercel);
 *  remoteok's RSS is Cloudflare-protected and often blocked there. */
export function enabledBoards(): string[] {
  const raw = (process.env.JOB_BOARDS ?? "remoteok,weworkremotely,remotive,arbeitnow,wpjobs").toLowerCase().trim();
  if (!raw || raw === "off" || raw === "none") return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Fetch overseas remote listings across the enabled boards, optionally narrowed
 * by the agency's skill keywords (used to build RemoteOK tag feeds). Returns a
 * deduped list in the shared project shape. Never throws — a dead feed yields [].
 */
export async function fetchJobBoards(keywords: string[] = []): Promise<FreelancerProject[]> {
  const boards = enabledBoards();
  if (!boards.length) return [];

  const jobs: Promise<FreelancerProject[]>[] = [];
  if (boards.includes("remoteok")) jobs.push(fetchRemoteOK(keywords));
  if (boards.includes("weworkremotely")) jobs.push(fetchWeWorkRemotely());
  if (boards.includes("remotive")) jobs.push(fetchRemotive());
  if (boards.includes("arbeitnow")) jobs.push(fetchArbeitnow());
  if (boards.includes("wpjobs")) jobs.push(fetchWordPressJobs());

  const results = await Promise.all(jobs);

  // Combine + dedupe by id, keep the newest.
  const byId = new Map<string, FreelancerProject>();
  for (const list of results) {
    for (const p of list) {
      const existing = byId.get(p.freelancerId);
      if (!existing || new Date(p.postedAt) > new Date(existing.postedAt)) byId.set(p.freelancerId, p);
    }
  }
  return [...byId.values()];
}

async function fetchFeed(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// RemoteOK — https://remoteok.com/remote-<tag>-jobs.rss
// Item shape: <title> <company> <description> <tags> <location> <pubDate> <guid> <link>
// ---------------------------------------------------------------------------

const REMOTEOK_BASE = "https://remoteok.com";

/** Turn an agency keyword into a RemoteOK tag slug, e.g. "WordPress" -> "wordpress". */
function remoteOkSlug(kw: string): string {
  return kw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function fetchRemoteOK(keywords: string[]): Promise<FreelancerProject[]> {
  // Always include the broad dev feed; add a per-keyword tag feed for each skill
  // (capped) so we surface more relevant overseas roles.
  const slugs = new Set<string>(["dev"]);
  for (const kw of keywords.slice(0, 8)) {
    const s = remoteOkSlug(kw);
    if (s) slugs.add(s);
  }
  const urls = [...slugs].map((s) => `${REMOTEOK_BASE}/remote-${s}-jobs.rss`);
  const xmls = await Promise.all(urls.map(fetchFeed));
  return xmls.flatMap(parseRemoteOK);
}

function parseRemoteOK(xml: string): FreelancerProject[] {
  const out: FreelancerProject[] = [];
  for (const body of itemBlocks(xml)) {
    const title = decodeXml(pick(body, "title"));
    const link = pick(body, "link").trim();
    if (!title || !link) continue;
    const company = decodeXml(pick(body, "company")).trim();
    const description = stripHtml(decodeXml(pick(body, "description")));
    const location = decodeXml(pick(body, "location")).trim();
    const pub = pick(body, "pubDate").trim();
    const guid = pick(body, "guid").trim();
    const tags = decodeXml(pick(body, "tags"))
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const id = guid.match(/(\d+)/)?.[1] || link.match(/(\d+)(?:$|\?)/)?.[1] || link;
    out.push({
      freelancerId: `remoteok-${id}`,
      title: company ? `${title} — ${company}` : title,
      description: description.slice(0, 1500),
      url: link,
      skills: tags,
      currency: "USD",
      projectType: "fixed",
      bidCount: 0,
      sealed: false,
      postedAt: pub ? safeDate(pub) : new Date().toISOString(),
      source: "remoteok",
      company: company || undefined,
      location: location || undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// WeWorkRemotely — https://weworkremotely.com/categories/<category>.rss
// Item shape: <title> <region> <category> <description> <pubDate> <guid> <link>
// Title is usually "Company: Role".
// ---------------------------------------------------------------------------

const WWR_BASE = "https://weworkremotely.com/categories";
const WWR_CATEGORIES = ["remote-programming-jobs", "remote-design-jobs", "remote-devops-sysadmin-jobs"];

async function fetchWeWorkRemotely(): Promise<FreelancerProject[]> {
  const urls = WWR_CATEGORIES.map((c) => `${WWR_BASE}/${c}.rss`);
  const xmls = await Promise.all(urls.map(fetchFeed));
  return xmls.flatMap(parseWWR);
}

function parseWWR(xml: string): FreelancerProject[] {
  const out: FreelancerProject[] = [];
  for (const body of itemBlocks(xml)) {
    const rawTitle = decodeXml(pick(body, "title")).trim();
    const link = pick(body, "link").trim();
    if (!rawTitle || !link) continue;
    const region = decodeXml(pick(body, "region")).trim();
    const category = decodeXml(pick(body, "category")).trim();
    const description = stripHtml(decodeXml(pick(body, "description")));
    const pub = pick(body, "pubDate").trim();
    const guid = pick(body, "guid").trim() || link;

    // "Company: Role" -> company + clean title.
    let company = "";
    let title = rawTitle;
    const colon = rawTitle.indexOf(":");
    if (colon > 0 && colon < 50) {
      company = rawTitle.slice(0, colon).trim();
      title = rawTitle.slice(colon + 1).trim();
    }

    const id = guid.split("/").filter(Boolean).pop() || guid;
    out.push({
      freelancerId: `wwr-${id}`,
      title: company ? `${title} — ${company}` : title,
      description: description.slice(0, 1500),
      url: link,
      skills: category ? [category.replace(/^Remote\s+/i, "").replace(/\s+Jobs$/i, "")] : [],
      currency: "USD",
      projectType: "fixed",
      bidCount: 0,
      sealed: false,
      postedAt: pub ? safeDate(pub) : new Date().toISOString(),
      source: "weworkremotely",
      company: company || undefined,
      location: region || undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Remotive — JSON API. Cloud-friendly (works on Vercel, unlike RemoteOK).
// https://remotive.com/api/remote-jobs?category=<cat>
// We link back to the original posting (Remotive's API terms ask for this).
// ---------------------------------------------------------------------------

const REMOTIVE_CATEGORIES = ["software-dev", "design", "devops"];

async function fetchRemotive(): Promise<FreelancerProject[]> {
  const lists = await Promise.all(
    REMOTIVE_CATEGORIES.map((c) => jsonFetch(`https://remotive.com/api/remote-jobs?category=${c}`))
  );
  const out: FreelancerProject[] = [];
  for (const data of lists) {
    for (const j of (data?.jobs ?? []) as any[]) {
      if (!j?.title || !j?.url) continue;
      const company = String(j.company_name ?? "").trim();
      out.push({
        freelancerId: `remotive-${j.id}`,
        title: company ? `${j.title} — ${company}` : j.title,
        description: stripHtml(String(j.description ?? "")).slice(0, 1500),
        url: String(j.url),
        skills: Array.isArray(j.tags) ? j.tags.map(String) : [],
        currency: "USD",
        projectType: "fixed",
        bidCount: 0,
        sealed: false,
        postedAt: j.publication_date ? safeDate(String(j.publication_date)) : new Date().toISOString(),
        source: "remotive",
        company: company || undefined,
        location: j.candidate_required_location ? String(j.candidate_required_location) : undefined,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Arbeitnow — JSON API, EU-friendly, open. Cloud-friendly.
// https://www.arbeitnow.com/api/job-board-api  (one page; mixed roles)
// Mostly EU/Germany full-time — the skill gate filters it down to dev/web.
// ---------------------------------------------------------------------------

async function fetchArbeitnow(): Promise<FreelancerProject[]> {
  const data = await jsonFetch("https://www.arbeitnow.com/api/job-board-api");
  const out: FreelancerProject[] = [];
  for (const j of (data?.data ?? []) as any[]) {
    if (!j?.title || !j?.url) continue;
    const company = String(j.company_name ?? "").trim();
    const tags = Array.isArray(j.tags) ? j.tags.map(String) : [];
    const types = Array.isArray(j.job_types) ? j.job_types.map(String) : [];
    out.push({
      freelancerId: `arbeitnow-${j.slug}`,
      title: company ? `${j.title} — ${company}` : j.title,
      description: stripHtml(String(j.description ?? "")).slice(0, 1500),
      url: String(j.url),
      skills: [...tags, ...types],
      currency: "EUR",
      projectType: "fixed",
      bidCount: 0,
      sealed: false,
      postedAt: j.created_at ? new Date(Number(j.created_at) * 1000).toISOString() : new Date().toISOString(),
      source: "arbeitnow",
      company: company || undefined,
      location: j.location ? String(j.location) : (j.remote ? "Remote" : undefined),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// WordPress.net jobs — https://jobs.wordpress.net/feed/  (standard RSS)
// Real WordPress/WooCommerce PROJECTS posted by clients — a strong fit for an
// agency whose core skills are WordPress/Woo. Item: title/link/description/pubDate.
// ---------------------------------------------------------------------------

async function fetchWordPressJobs(): Promise<FreelancerProject[]> {
  const xml = await fetchFeed("https://jobs.wordpress.net/feed/");
  const out: FreelancerProject[] = [];
  for (const body of itemBlocks(xml)) {
    const title = decodeXml(pick(body, "title")).trim();
    const link = pick(body, "link").trim();
    if (!title || !link) continue;
    const description = stripHtml(decodeXml(pick(body, "description")));
    const pub = pick(body, "pubDate").trim();
    const cats = [...body.matchAll(/<category[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/gi)]
      .map((m) => decodeXml(m[1]).trim())
      .filter(Boolean);
    const id = link.match(/(\d+)\/?$/)?.[1] || link;
    out.push({
      freelancerId: `wpjobs-${id}`,
      title,
      description: description.slice(0, 1500),
      url: link,
      // It's a WordPress board — always tag WordPress so it matches the skill gate,
      // plus any post categories.
      skills: ["WordPress", ...cats],
      currency: "USD", // board is English/Western; treat as USD for the US-focus filter
      projectType: "fixed",
      bidCount: 0,
      sealed: false,
      postedAt: pub ? safeDate(pub) : new Date().toISOString(),
      source: "wpjobs",
    });
  }
  return out;
}

async function jsonFetch(url: string): Promise<any> {
  try {
    const res = await fetch(url, { headers: { ...HEADERS, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shared tiny helpers (kept local so this module is self-contained).
// ---------------------------------------------------------------------------

function* itemBlocks(xml: string): Generator<string> {
  const parts = xml.split(/<item>/i).slice(1);
  for (const part of parts) yield part.split(/<\/item>/i)[0];
}

function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  return m[1].replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "");
}

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>(\s*)/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDate(s: string): string {
  const t = Date.parse(s);
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&hellip;/g, "…")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/Â /g, " ").replace(/Â(?=\s)/g, "").replace(/ /g, " ")
    .replace(/Ã±/g, "ñ").replace(/Ã©/g, "é").replace(/Ã³/g, "ó").replace(/Ã¡/g, "á").replace(/Ã­/g, "í")
    .replace(/Ã¼/g, "ü").replace(/Ã¶/g, "ö").replace(/Ã¤/g, "ä")
    .trim();
}
