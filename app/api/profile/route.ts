import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { TargetProfile } from "@/models/TargetProfile";
import { getCurrentAccount } from "@/lib/account";
import { SKILLS } from "@/lib/skills";

export const runtime = "nodejs";

export async function PUT(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { account, profile } = await getCurrentAccount();
  await connectToDatabase();

  const validSkillKeys = new Set(SKILLS.map((s) => s.key));
  const skills: string[] = Array.isArray(body.skills)
    ? body.skills.filter((k: string) => validSkillKeys.has(k))
    : profile.skills;

  const projectTypes = Array.isArray(body.projectTypes)
    ? body.projectTypes.filter((t: string) => t === "fixed" || t === "hourly")
    : profile.projectTypes;

  const excludeCurrencies = Array.isArray(body.excludeCurrencies)
    ? body.excludeCurrencies.map((c: string) => String(c).toUpperCase().trim()).filter(Boolean)
    : profile.excludeCurrencies ?? [];

  // Keywords come as a newline/comma-separated string from the UI.
  const excludeKeywords =
    typeof body.excludeKeywords === "string"
      ? body.excludeKeywords.split(/[\n,]/).map((s: string) => s.trim()).filter(Boolean)
      : Array.isArray(body.excludeKeywords)
        ? body.excludeKeywords
        : profile.excludeKeywords ?? [];

  await TargetProfile.updateOne(
    { _id: profile._id, accountId: account._id },
    {
      $set: {
        name: body.name?.trim() || profile.name,
        skills,
        minBudgetUsd: Number(body.minBudgetUsd) >= 0 ? Number(body.minBudgetUsd) : profile.minBudgetUsd,
        maxBudgetUsd: body.maxBudgetUsd ? Number(body.maxBudgetUsd) : undefined,
        projectTypes: projectTypes.length ? projectTypes : ["fixed", "hourly"],
        avoid: {
          contests: !!body.avoid?.contests,
          sealed: !!body.avoid?.sealed,
          unverifiedClients: !!body.avoid?.unverifiedClients,
          vague: !!body.avoid?.vague,
        },
        excludeCurrencies,
        excludeKeywords,
      },
    }
  );

  return NextResponse.json({ ok: true });
}
