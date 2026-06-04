/**
 * Phase-1 rule-based relevance + red-flag detection (no AI yet — that's Phase 2).
 * Gives each project a quick 0-100 match score against the active TargetProfile so the
 * team sees the best-fit projects first. AI scoring will layer on top later.
 */
import type { FreelancerProject } from "./freelancer";
import { matchKeywordsFor } from "./skills";

export type FreshnessTier = "prime" | "good" | "ok" | "late";

export interface ScoredProject extends FreelancerProject {
  matchScore: number; // 0-100
  matchedSkills: string[];
  redFlags: string[];
  belowBudget: boolean;
  ageMinutes: number;
  freshness: FreshnessTier;
}

/**
 * Bid-timing tiers. Bidding while a project is fresh is the most controllable way to
 * rank higher (fewer competing bids, and recent bids surface near the top).
 *   prime: < 30 min  — bid NOW, you can be in the first wave
 *   good : < 2 hours — still early, worth bidding promptly
 *   ok   : < 6 hours — bidding window open but filling up
 *   late : older     — likely buried; only bid if a strong fit
 */
export function freshnessOf(ageMinutes: number): FreshnessTier {
  if (ageMinutes < 30) return "prime";
  if (ageMinutes < 120) return "good";
  if (ageMinutes < 360) return "ok";
  return "late";
}

export interface ProfileFilter {
  skills: string[];
  minBudgetUsd: number;
  maxBudgetUsd?: number;
  projectTypes: ("fixed" | "hourly")[];
  avoid: { contests: boolean; sealed: boolean; unverifiedClients: boolean; vague: boolean };
  excludeCurrencies?: string[];
  excludeKeywords?: string[];
}

export function scoreProject(p: FreelancerProject, profile: ProfileFilter): ScoredProject {
  const haystack = `${p.title} ${p.description} ${p.skills.join(" ")}`.toLowerCase();
  const keywords = matchKeywordsFor(profile.skills);

  const matched = new Set<string>();
  for (const kw of keywords) {
    if (haystack.includes(kw)) matched.add(kw);
  }

  const redFlags: string[] = [];
  const budgetTop = p.budgetMax ?? p.budgetMin ?? 0;
  const belowBudget = budgetTop > 0 && budgetTop < profile.minBudgetUsd;
  if (belowBudget) redFlags.push(`Budget below $${profile.minBudgetUsd}`);
  if (profile.avoid.sealed && p.sealed) redFlags.push("Sealed/NDA project");
  if (profile.avoid.vague && p.description.trim().length < 80) redFlags.push("Vague / low-effort post");
  if (p.bidCount > 40) redFlags.push(`High competition (${p.bidCount} bids)`);
  if (/cheap|urgent!!!|low budget|lowest price/i.test(haystack)) redFlags.push("Low-quality signal");

  // Score: skill match is the core; penalise red flags; reward fresh + low-competition + healthy budget.
  let score = 0;
  if (keywords.length) score += Math.min(60, (matched.size / Math.max(1, keywords.length)) * 120);
  if (matched.size > 0) score += 15; // any relevant match
  if (budgetTop >= profile.minBudgetUsd) score += 10;
  if (p.bidCount <= 15) score += 10;
  const ageMin = (Date.now() - new Date(p.postedAt).getTime()) / 60000;
  if (ageMin <= 30) score += 5; // fresh
  score -= redFlags.length * 12;

  const ageMinutes = Math.max(0, Math.round(ageMin));
  return {
    ...p,
    matchScore: Math.max(0, Math.min(100, Math.round(score))),
    matchedSkills: [...matched],
    redFlags,
    belowBudget,
    ageMinutes,
    freshness: freshnessOf(ageMinutes),
  };
}

export function passesProfile(p: FreelancerProject, profile: ProfileFilter): boolean {
  if (!profile.projectTypes.includes(p.projectType)) return false;
  if (profile.avoid.sealed && p.sealed) return false;

  const haystack = `${p.title} ${p.description} ${p.skills.join(" ")}`.toLowerCase();

  // Exclude by currency (proxy for country — e.g. NGN, PKR).
  if (profile.excludeCurrencies?.length) {
    const cur = (p.currency || "").toUpperCase();
    if (profile.excludeCurrencies.map((c) => c.toUpperCase()).includes(cur)) return false;
  }

  // Exclude by keyword/phrase in the title/description (e.g. country names, scam signals).
  if (profile.excludeKeywords?.length) {
    if (profile.excludeKeywords.some((kw) => kw.trim() && haystack.includes(kw.toLowerCase().trim()))) return false;
  }

  // Must match at least one selected skill keyword (relevance gate).
  const keywords = matchKeywordsFor(profile.skills);
  if (keywords.length && !keywords.some((kw) => haystack.includes(kw))) return false;
  return true;
}
