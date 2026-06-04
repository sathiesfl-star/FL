/**
 * Single-tenant helper for now: BidCopilot runs locally for ONE agency (Stallioni).
 * But everything is keyed by accountId so multi-tenant SaaS is a later config flip,
 * not a rewrite. getCurrentAccount() returns (creating if needed) the default account
 * + its active TargetProfile.
 */
import "server-only";
import { connectToDatabase } from "./mongodb";
import { Account } from "@/models/Account";
import { TargetProfile } from "@/models/TargetProfile";

const DEFAULT_ACCOUNT_NAME = process.env.ACCOUNT_NAME || "Stallioni";

export async function getCurrentAccount() {
  await connectToDatabase();
  let account = await Account.findOne({ name: DEFAULT_ACCOUNT_NAME });
  if (!account) {
    account = await Account.create({ name: DEFAULT_ACCOUNT_NAME });
  }
  let profile = await TargetProfile.findOne({ accountId: account._id, active: true });
  if (!profile) {
    profile = await TargetProfile.create({
      accountId: account._id,
      name: "Default profile",
      active: true,
      // Sensible Stallioni defaults; user edits these in the UI.
      skills: ["wordpress", "woocommerce", "shopify", "php", "laravel", "react", "web-development", "seo"],
      minBudgetUsd: 250,
      projectTypes: ["fixed", "hourly"],
    });
  }
  return { account, profile };
}

export interface PlainProfile {
  id: string;
  name: string;
  skills: string[];
  minBudgetUsd: number;
  maxBudgetUsd?: number;
  projectTypes: ("fixed" | "hourly")[];
  avoid: { contests: boolean; sealed: boolean; unverifiedClients: boolean; vague: boolean };
  excludeCurrencies: string[];
  excludeKeywords: string[];
}

export async function getActiveProfile(): Promise<PlainProfile> {
  const { profile } = await getCurrentAccount();
  return {
    id: profile._id.toString(),
    name: profile.name,
    skills: profile.skills,
    minBudgetUsd: profile.minBudgetUsd,
    maxBudgetUsd: profile.maxBudgetUsd,
    projectTypes: profile.projectTypes,
    avoid: profile.avoid,
    excludeCurrencies: profile.excludeCurrencies ?? [],
    excludeKeywords: profile.excludeKeywords ?? [],
  };
}
