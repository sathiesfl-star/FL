import { NextResponse } from "next/server";
import { getAgencyProfile } from "@/lib/agency-profile";
import { proposeFromText, isAiLive } from "@/lib/ai";

export const runtime = "nodejs";

/**
 * Paste mode: takes a pasted project description and returns an AI proposal.
 * No Freelancer connection at all — the user copies a project from anywhere.
 */
export async function POST(req: Request) {
  let body: { description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const description = (body.description ?? "").trim();
  if (description.length < 15) {
    return NextResponse.json({ error: "Paste a project description first." }, { status: 422 });
  }

  const agency = await getAgencyProfile();
  const result = await proposeFromText(description, agency);

  return NextResponse.json({
    ok: true,
    mode: isAiLive() ? "live" : "mock",
    ...result,
  });
}
