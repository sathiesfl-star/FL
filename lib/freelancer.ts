/**
 * Freelancer.com API client.
 *
 *   FREELANCER_MODE=mock  (default) -> returns sample projects, no network. Build/demo with no token.
 *   FREELANCER_MODE=live            -> calls the official API:
 *        GET {base}/projects/0.1/projects/active   (search active projects)
 *      with header  Freelancer-OAuth-V1: <token>
 *
 * READ-ONLY. This client never places bids — bidding stays manual on freelancer.com
 * (prep-only co-pilot, the ToS-safe design).
 */

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
}

export function isLiveMode(): boolean {
  return process.env.FREELANCER_MODE === "live";
}

export interface SearchParams {
  query?: string; // keyword search
  limit?: number;
}

export async function searchActiveProjects(params: SearchParams): Promise<FreelancerProject[]> {
  if (!isLiveMode()) return mockProjects(params);

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
