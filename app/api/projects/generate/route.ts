import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Project } from "@/models/Project";
import { getCurrentAccount } from "@/lib/account";
import { getAgencyProfile } from "@/lib/agency-profile";
import { scoreAndPropose, isAiLive } from "@/lib/ai";
import type { FreelancerProject } from "@/lib/freelancer";

export const runtime = "nodejs";

/**
 * Generate an AI score + proposal for a project, and persist it (upsert by freelancerId
 * within this account). The feed sends the project data it already has (mock or live),
 * so this works without re-fetching.
 */
export async function POST(req: Request) {
  let body: { project?: FreelancerProject };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const p = body.project;
  if (!p?.freelancerId) {
    return NextResponse.json({ error: "project is required" }, { status: 422 });
  }

  const { account } = await getCurrentAccount();
  const agency = await getAgencyProfile();
  await connectToDatabase();

  const ai = await scoreAndPropose(p, agency);

  await Project.updateOne(
    { accountId: account._id, freelancerId: p.freelancerId },
    {
      $set: {
        title: p.title,
        description: p.description,
        url: p.url,
        skills: p.skills,
        budgetMin: p.budgetMin,
        budgetMax: p.budgetMax,
        currency: p.currency,
        projectType: p.projectType,
        bidCount: p.bidCount,
        sealed: p.sealed,
        postedAt: new Date(p.postedAt),
        aiScore: ai.score,
        aiReasons: ai.reasons,
        redFlags: ai.redFlags,
        proposal: ai.proposal,
        status: "proposal_ready",
      },
      $setOnInsert: { accountId: account._id, freelancerId: p.freelancerId, fetchedAt: new Date() },
    },
    { upsert: true }
  );

  return NextResponse.json({
    ok: true,
    mode: isAiLive() ? "live" : "mock",
    score: ai.score,
    reasons: ai.reasons,
    redFlags: ai.redFlags,
    proposal: ai.proposal,
  });
}
