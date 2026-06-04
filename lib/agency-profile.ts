/**
 * Agency profile — who the AI writes proposals AS.
 *
 * Now stored PER-ACCOUNT in the database (editable from /settings in the app).
 * The constants below are only DEFAULTS used to seed a new account / fill empty fields.
 * Edit your live values in the app — no code changes needed.
 */
import "server-only";
import { getCurrentAccount } from "./account";

export const DEFAULT_AGENCY_PROFILE = {
  oneLiner: "IT outsourcing company delivering web, app, e-commerce, and mobile solutions to 35+ countries.",
  site: "https://www.stallioni.com",
  strengths: [
    "Full-stack web development (React, Next.js, PHP/Laravel, Node)",
    "E-commerce: Shopify, WooCommerce, Magento, BigCommerce",
    "WordPress & CMS (Elementor, custom themes/plugins)",
    "Mobile apps (Flutter, React Native, native iOS/Android)",
    "API development & third-party integrations",
    "SEO and digital marketing",
  ],
  tone: "Confident but warm, concise, professional. No fluff, no generic flattery. Speak to the client's specific need.",
  rules: [
    "Address the client's specific project — reference concrete details from their description.",
    "Open with a hook that shows you understood the problem, not 'I am interested in your project'.",
    "Mention 1–2 relevant strengths/past work — never list all services.",
    "Keep it short: 90–150 words. Freelancer clients skim.",
    "End with a simple, low-friction call to action (a question or next step).",
    "Never invent fake client names, fake metrics, or fake past projects.",
    "Plain, human English. No buzzword soup.",
  ],
  winningProposals: [] as string[],
};

export interface AgencyProfile {
  name: string;
  oneLiner: string;
  site: string;
  strengths: string[];
  tone: string;
  rules: string[];
  winningProposals: string[];
  pastProjects: string;
}

/** Read the account's saved agency profile, falling back to defaults for empty fields. */
export async function getAgencyProfile(): Promise<AgencyProfile> {
  const { account } = await getCurrentAccount();
  const p = account.agencyProfile;
  return {
    name: account.name,
    oneLiner: p?.oneLiner || DEFAULT_AGENCY_PROFILE.oneLiner,
    site: p?.site || DEFAULT_AGENCY_PROFILE.site,
    strengths: p?.strengths?.length ? p.strengths : DEFAULT_AGENCY_PROFILE.strengths,
    tone: p?.tone || DEFAULT_AGENCY_PROFILE.tone,
    rules: p?.rules?.length ? p.rules : DEFAULT_AGENCY_PROFILE.rules,
    winningProposals: p?.winningProposals ?? [],
    pastProjects: p?.pastProjects ?? "",
  };
}
