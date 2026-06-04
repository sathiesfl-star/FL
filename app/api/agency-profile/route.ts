import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Account } from "@/models/Account";
import { getCurrentAccount } from "@/lib/account";

export const runtime = "nodejs";

/** Save the editable agency profile (bio/tone/rules/winning proposals) for the account. */
export async function PUT(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { account } = await getCurrentAccount();
  await connectToDatabase();

  const lines = (v: unknown): string[] =>
    typeof v === "string" ? v.split("\n").map((s) => s.trim()).filter(Boolean) : Array.isArray(v) ? v : [];

  // Winning proposals are separated by a blank line (so each can be multi-line).
  const proposals = typeof body.winningProposals === "string"
    ? body.winningProposals.split(/\n\s*\n/).map((s: string) => s.trim()).filter(Boolean)
    : Array.isArray(body.winningProposals) ? body.winningProposals : [];

  await Account.updateOne(
    { _id: account._id },
    {
      $set: {
        agencyProfile: {
          oneLiner: String(body.oneLiner ?? "").trim(),
          site: String(body.site ?? "").trim(),
          strengths: lines(body.strengths),
          tone: String(body.tone ?? "").trim(),
          rules: lines(body.rules),
          winningProposals: proposals,
          pastProjects: String(body.pastProjects ?? "").trim(),
        },
      },
    }
  );

  return NextResponse.json({ ok: true, winningCount: proposals.length });
}
