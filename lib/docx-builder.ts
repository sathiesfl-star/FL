/** Builds a professional Word (.docx) project document from a structured ProjectDoc. */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle,
} from "docx";
import type { ProjectDoc } from "./ai";
import type { AgencyProfile } from "./agency-profile";

const BRAND = "6D28D9";

function heading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: BRAND })],
  });
}

function body(text: string): Paragraph {
  return new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, size: 22 })] });
}

function bullet(text: string): Paragraph {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text, size: 22 })] });
}

export async function buildProjectDocx(doc: ProjectDoc, agency: AgencyProfile): Promise<Buffer> {
  const children: Paragraph[] = [];

  // Header — agency name
  children.push(new Paragraph({
    children: [new TextRun({ text: agency.name, bold: true, size: 30, color: BRAND })],
  }));
  if (agency.site) children.push(new Paragraph({ children: [new TextRun({ text: agency.site, size: 18, color: "888888" })] }));

  // Title
  children.push(new Paragraph({
    spacing: { before: 240, after: 120 },
    alignment: AlignmentType.LEFT,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "DDDDDD", space: 6 } },
    children: [new TextRun({ text: doc.title, bold: true, size: 36 })],
  }));

  // Sections
  children.push(heading("1. Project Understanding"));
  children.push(body(doc.understanding));

  children.push(heading("2. Proposed Solution"));
  children.push(body(doc.solution));

  if (doc.scope.length) {
    children.push(heading("3. Scope & Deliverables"));
    doc.scope.forEach((s) => children.push(bullet(s)));
  }

  if (doc.techStack.length) {
    children.push(heading("4. Technology Stack"));
    children.push(body(doc.techStack.join(" · ")));
  }

  if (doc.phases.length) {
    children.push(heading("5. Timeline & Phases"));
    doc.phases.forEach((p) =>
      children.push(new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: `${p.name}: `, bold: true, size: 22 }), new TextRun({ text: p.detail, size: 22 })],
      }))
    );
  }

  children.push(heading("6. Why " + agency.name));
  children.push(body(doc.whyUs));

  children.push(heading("7. Next Steps"));
  children.push(body(doc.nextSteps));

  // Footer note
  children.push(new Paragraph({
    spacing: { before: 360 },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: "DDDDDD", space: 6 } },
    children: [new TextRun({ text: "This document is confidential and prepared for the addressed client.", italics: true, size: 16, color: "999999" })],
  }));

  const document = new Document({
    sections: [{ properties: {}, children }],
  });
  return Packer.toBuffer(document);
}
