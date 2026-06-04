/**
 * Freelancer.com project reader.
 *
 *   FREELANCER_MODE=mock  (default) -> sample projects, no network.
 *   FREELANCER_MODE=rss             -> reads the PUBLIC RSS feed (no token, no account risk,
 *                                       fully allowed). https://www.freelancer.com/rss.xml
 *   FREELANCER_MODE=live            -> official API (needs FREELANCER_OAUTH_TOKEN).
 *
 * READ-ONLY. Never places bids — bidding stays manual on freelancer.com (ToS-safe design).
 *
 * In rss mode the feed is also enriched with overseas remote job boards
 * (RemoteOK / WeWorkRemotely) via lib/jobboards.ts — see fetchJobBoards().
 */

import { fetchJobBoards } from "./jobboards";

export interface FreelancerProject {
  freelancerId: string;
  title: string;
  description: string;
  url: string;
  skills: string[];
  budgetMin?: number;
  budgetMax?: number;
  currency: string;
  projectType: "fixed" | "hourly";
  bidCount: number;
  sealed: boolean;
  postedAt: string; // ISO
  /** Where this listing came from: "freelancer" (default) or an overseas job board. */
  source?: string;
  /** Optional client/company name + location, when the source provides it (job boards do). */
  company?: string;
  location?: string;
}

export function freelancerMode(): "mock" | "rss" | "live" {
  const m = process.env.FREELANCER_MODE;
  if (m === "rss") return "rss";
  if (m === "live") return "live";
  return "mock";
}

export function isLiveMode(): boolean {
  return freelancerMode() !== "mock";
}

export interface SearchParams {
  query?: string; // keyword search
  limit?: number;
  keywords?: string[]; // for RSS mode: fetch a keyword feed per term, combine + dedupe
}

export async function searchActiveProjects(params: SearchParams): Promise<FreelancerProject[]> {
  const mode = freelancerMode();
  if (mode === "mock") return mockProjects(params);
  if (mode === "rss") return rssProjects(params);
  // mode === "live" -> official API below

  const token = process.env.FREELANCER_OAUTH_TOKEN;
  if (!token) throw new Error("FREELANCER_MODE=live but FREELANCER_OAUTH_TOKEN is not set.");
  const base = process.env.FREELANCER_API_BASE || "https://www.freelancer.com/api";

  const qs = new URLSearchParams({
    limit: String(params.limit ?? 50),
    full_description: "true",
    job_details: "true",
    upgrade_details: "true",
  });
  if (params.query) qs.set("query", params.query);

  const res = await fetch(`${base}/projects/0.1/projects/active?${qs.toString()}`, {
    headers: { "Freelancer-OAuth-V1": token, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Freelancer API error ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return mapApiProjects(data?.result?.projects ?? []);
}

/** Map the official API project shape to ours. Field names per Freelancer projects API. */
function mapApiProjects(raw: any[]): FreelancerProject[] {
  return raw.map((p) => {
    const budget = p.budget ?? {};
    const type = p.type === "hourly" ? "hourly" : "fixed";
    return {
      freelancerId: String(p.id),
      title: p.title ?? "",
      description: p.description ?? p.preview_description ?? "",
      url: p.seo_url ? `https://www.freelancer.com/projects/${p.seo_url}` : `https://www.freelancer.com/projects/${p.id}`,
      skills: (p.jobs ?? []).map((j: any) => j.name).filter(Boolean),
      budgetMin: budget.minimum,
      budgetMax: budget.maximum,
      currency: p.currency?.code ?? "USD",
      projectType: type,
      bidCount: p.bid_stats?.bid_count ?? 0,
      sealed: !!p.upgrades?.sealed,
      postedAt: p.submitdate ? new Date(p.submitdate * 1000).toISOString() : new Date().toISOString(),
    };
  });
}

// ---------------------------------------------------------------------------
// RSS — read the PUBLIC Freelancer feed (no token, no account risk, ToS-safe).
// ---------------------------------------------------------------------------

const RSS_URL = process.env.FREELANCER_RSS_URL || "https://www.freelancer.com/rss.xml";
const RSS_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
  Accept: "application/rss+xml, application/xml, text/xml",
};

async function fetchFeed(url: string): Promise<FreelancerProject[]> {
  try {
    const res = await fetch(url, { headers: RSS_HEADERS, cache: "no-store" });
    if (!res.ok) return [];
    return parseRssItems(await res.text());
  } catch {
    return [];
  }
}

async function rssProjects(params: SearchParams): Promise<FreelancerProject[]> {
  // Build the list of feeds to pull. When the profile has search terms, fetch a
  // per-keyword feed for each (more relevant volume); always include the latest feed too.
  const terms = (params.keywords ?? []).slice(0, 12); // cap the number of parallel feeds
  const urls = new Set<string>([RSS_URL]);
  for (const t of terms) {
    const kw = t.trim();
    if (kw) urls.add(`${RSS_URL}?keyword=${encodeURIComponent(kw)}`);
  }

  // Pull Freelancer feeds AND the overseas job boards (RemoteOK / WeWorkRemotely)
  // in parallel, so an India-based agency sees international contract work too.
  const [freelancerLists, jobBoardList] = await Promise.all([
    Promise.all([...urls].map(fetchFeed)),
    fetchJobBoards(terms),
  ]);

  // Combine + dedupe by freelancerId, keep the newest.
  const byId = new Map<string, FreelancerProject>();
  for (const list of freelancerLists) {
    for (const p of list) {
      const existing = byId.get(p.freelancerId);
      if (!existing || new Date(p.postedAt) > new Date(existing.postedAt)) {
        byId.set(p.freelancerId, { ...p, source: p.source ?? "freelancer" });
      }
    }
  }
  for (const p of jobBoardList) {
    if (!byId.has(p.freelancerId)) byId.set(p.freelancerId, p);
  }
  let items = [...byId.values()].sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());

  const q = params.query?.toLowerCase();
  if (q) items = items.filter((p) => (p.title + p.description + p.skills.join(" ")).toLowerCase().includes(q));
  return items.slice(0, params.limit ?? 80);
}

/** Minimal, dependency-free RSS parser tailored to Freelancer's feed shape. */
function parseRssItems(xml: string): FreelancerProject[] {
  const out: FreelancerProject[] = [];
  const itemBlocks = xml.split(/<item>/i).slice(1);
  for (const block of itemBlocks) {
    const body = block.split(/<\/item>/i)[0];
    const title = decodeXml(pick(body, "title"));
    const link = pick(body, "link").trim();
    const description = decodeXml(pick(body, "description"));
    const pub = pick(body, "pubDate").trim();
    const guid = pick(body, "guid");
    if (!title || !link) continue;

    // Skills come from <category> tags.
    const skills = [...body.matchAll(/<category[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/gi)]
      .map((m) => decodeXml(m[1]).trim())
      .filter(Boolean);

    // Budget + type are embedded in the description, e.g. "(Budget: $2 - $8 USD, Jobs: ...)".
    const { budgetMin, budgetMax, currency, projectType } = parseBudget(description);

    const id = (guid.match(/(\d+)/)?.[1]) || link.match(/(\d+)\.html/)?.[1] || link;

    out.push({
      freelancerId: `rss-${id}`,
      title,
      // Strip the trailing "(Budget: ...)" so the description reads cleanly.
      description: description.replace(/\(Budget:[\s\S]*\)$/i, "").trim(),
      url: link,
      skills,
      budgetMin,
      budgetMax,
      currency,
      projectType,
      bidCount: 0, // RSS doesn't provide bid count
      sealed: false,
      postedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(),
    });
  }
  return out;
}

function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  return m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function parseBudget(desc: string): { budgetMin?: number; budgetMax?: number; currency: string; projectType: "fixed" | "hourly" } {
  // "(Budget: $250 - $750 USD" or "(Budget: ₹600 - ₹1500 INR"  · "/ hr" => hourly
  const m = desc.match(/Budget:\s*[^\d]*([\d,]+)\s*-\s*[^\d]*([\d,]+)\s*([A-Z]{3})/i);
  const hourly = /\/\s*hr|per hour|hourly/i.test(desc);
  const currency = m?.[3]?.toUpperCase() || "USD";
  return {
    budgetMin: m ? Number(m[1].replace(/,/g, "")) : undefined,
    budgetMax: m ? Number(m[2].replace(/,/g, "")) : undefined,
    currency,
    projectType: hourly ? "hourly" : "fixed",
  };
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

// ---------------------------------------------------------------------------
// Mock projects — realistic sample for building/demoing without a token.
// ---------------------------------------------------------------------------

function mockProjects(params: SearchParams): FreelancerProject[] {
  const now = Date.now();
  const m: FreelancerProject[] = [
    {
      freelancerId: "mock-101", title: "Build a Shopify store with custom theme",
      description: "Need an experienced Shopify developer to set up a new store, customize a premium theme, configure products, and integrate payment. Ongoing work likely.",
      url: "https://www.freelancer.com/projects/shopify/mock-101", skills: ["Shopify", "HTML", "CSS", "Liquid"],
      budgetMin: 500, budgetMax: 1500, currency: "USD", projectType: "fixed", bidCount: 12, sealed: false,
      postedAt: new Date(now - 5 * 60000).toISOString(),
    },
    {
      freelancerId: "mock-102", title: "WordPress + WooCommerce website for boutique",
      description: "Looking for a WordPress expert to build a WooCommerce site with Elementor, product catalogue, and basic SEO. Must be responsive.",
      url: "https://www.freelancer.com/projects/wordpress/mock-102", skills: ["WordPress", "WooCommerce", "Elementor", "PHP"],
      budgetMin: 250, budgetMax: 750, currency: "USD", projectType: "fixed", bidCount: 28, sealed: false,
      postedAt: new Date(now - 22 * 60000).toISOString(),
    },
    {
      freelancerId: "mock-103", title: "React Native app — fitness tracker (iOS + Android)",
      description: "Cross-platform fitness app with workout logging, charts, and Firebase backend. Looking for a senior React Native developer.",
      url: "https://www.freelancer.com/projects/mobile/mock-103", skills: ["React Native", "Firebase", "Mobile App"],
      budgetMin: 1500, budgetMax: 4000, currency: "USD", projectType: "fixed", bidCount: 9, sealed: false,
      postedAt: new Date(now - 40 * 60000).toISOString(),
    },
    {
      freelancerId: "mock-104", title: "Fix my website urgent!!! cheap",
      description: "site broken need fix now low budget only serious",
      url: "https://www.freelancer.com/projects/php/mock-104", skills: ["PHP", "HTML"],
      budgetMin: 10, budgetMax: 30, currency: "USD", projectType: "fixed", bidCount: 47, sealed: false,
      postedAt: new Date(now - 8 * 60000).toISOString(),
    },
    {
      freelancerId: "mock-105", title: "SEO for a SaaS website — ongoing",
      description: "Need an SEO specialist for technical SEO, on-page optimization, and content strategy for a B2B SaaS. Monthly retainer.",
      url: "https://www.freelancer.com/projects/seo/mock-105", skills: ["SEO", "On-page", "Content"],
      budgetMin: 750, budgetMax: 2000, currency: "USD", projectType: "hourly", bidCount: 15, sealed: false,
      postedAt: new Date(now - 60 * 60000).toISOString(),
    },
    {
      freelancerId: "mock-106", title: "Laravel REST API for a logistics platform",
      description: "Build a robust REST API in Laravel with JWT auth, role-based access, and Swagger docs. Long-term project with multiple phases.",
      url: "https://www.freelancer.com/projects/php/mock-106", skills: ["Laravel", "PHP", "REST API", "MySQL"],
      budgetMin: 2000, budgetMax: 5000, currency: "USD", projectType: "fixed", bidCount: 6, sealed: false,
      postedAt: new Date(now - 15 * 60000).toISOString(),
    },
    {
      freelancerId: "mock-107", title: "Logo design contest", // should be filtered out (not our skill)
      description: "Design a logo for my new cafe. Contest, multiple entries welcome.",
      url: "https://www.freelancer.com/contest/mock-107", skills: ["Logo Design", "Graphic Design"],
      budgetMin: 50, budgetMax: 100, currency: "USD", projectType: "fixed", bidCount: 80, sealed: false,
      postedAt: new Date(now - 90 * 60000).toISOString(),
    },
    {
      freelancerId: "mock-108", title: "Next.js + MongoDB dashboard for analytics SaaS",
      description: "Senior full-stack dev to build a multi-tenant analytics dashboard in Next.js 14 with MongoDB, charts, and auth. Clean code required.",
      url: "https://www.freelancer.com/projects/nextjs/mock-108", skills: ["Next.js", "React", "MongoDB", "TypeScript"],
      budgetMin: 1200, budgetMax: 3500, currency: "USD", projectType: "fixed", bidCount: 4, sealed: false,
      postedAt: new Date(now - 3 * 60000).toISOString(),
    },
  ];
  const q = params.query?.toLowerCase();
  const filtered = q
    ? m.filter((p) => (p.title + p.description + p.skills.join(" ")).toLowerCase().includes(q))
    : m;
  return filtered.slice(0, params.limit ?? 50);
}
