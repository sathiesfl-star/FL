import { NextResponse } from "next/server";
import { getAgencyProfile } from "@/lib/agency-profile";
import { generateProjectDoc } from "@/lib/ai";
import { buildProjectDocx } from "@/lib/docx-builder";

export const runtime = "nodejs";

/**
 * Paste mode — full project document. Takes a pasted description, generates a detailed
 * project doc with AI, and returns it as a downloadable Word (.docx) file.
 * No Freelancer connection.
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
  const doc = await generateProjectDoc(description, agency);
  const buffer = await buildProjectDocx(doc, agency);

  const safeTitle = doc.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 40) || "Project_Document";
  // Wrap the Node Buffer in a Uint8Array so it's a valid web BodyInit.
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeTitle}.docx"`,
    },
  });
}
