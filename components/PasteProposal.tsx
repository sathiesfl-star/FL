"use client";

import { useState } from "react";
import { Sparkles, Copy, Check, AlertTriangle, ShieldCheck, FileText } from "lucide-react";

interface Result {
  mode: string;
  score: number;
  reasons: string[];
  redFlags: string[];
  proposal: string;
}

export function PasteProposal({ aiStatus }: { aiStatus: string }) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [docLoading, setDocLoading] = useState(false);

  async function downloadDoc() {
    if (description.trim().length < 15) {
      setError("Paste a project description first.");
      return;
    }
    setDocLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/project-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to generate document");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const name = /filename="(.+?)"/.exec(cd)?.[1] || "Project_Document.docx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error");
    } finally {
      setDocLoading(false);
    }
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Failed to generate");
        return;
      }
      setResult(d);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.proposal);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Write a proposal</h1>
        <p className="text-sm text-slate-500">
          Paste a project description from anywhere, and get a tailored proposal in your style.
          Then copy it and bid manually.
        </p>
      </div>

      {/* Zero-risk reassurance */}
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>This stays on your computer and never connects to Freelancer. You copy &amp; paste — nothing is automated.</span>
      </div>

      <section className="rounded-xl border bg-white p-4">
        <label className="text-xs font-semibold uppercase text-slate-500">Project description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={9}
          placeholder="Paste the client's project description here…"
          className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            AI: <span className={aiStatus === "mock" ? "text-amber-600" : "text-emerald-600"}>{aiStatus}</span>
            {aiStatus === "mock" && " — add a free Gemini key for real proposals"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={downloadDoc}
              disabled={docLoading || description.trim().length < 15}
              title="Detailed Word document — for high-value / NDA projects"
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand-light disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              {docLoading ? "Building…" : "Full project doc (.docx)"}
            </button>
            <button
              onClick={generate}
              disabled={loading || description.trim().length < 15}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? "Writing…" : "Generate proposal"}
            </button>
          </div>
        </div>
      </section>

      {error && <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

      {result && (
        <section className="rounded-xl border bg-white p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded bg-brand px-2 py-0.5 font-bold text-white">
              AI fit {result.score}/10
            </span>
            {result.mode === "mock" && <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">mock AI</span>}
            {result.reasons?.slice(0, 3).map((r) => (
              <span key={r} className="rounded bg-slate-100 px-2 py-0.5 text-slate-500">{r}</span>
            ))}
            {result.redFlags?.map((r) => (
              <span key={r} className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-red-600">
                <AlertTriangle className="h-3 w-3" /> {r}
              </span>
            ))}
          </div>
          <textarea
            value={result.proposal}
            onChange={(e) => setResult({ ...result, proposal: e.target.value })}
            rows={9}
            className="w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button onClick={generate} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50">
              Regenerate
            </button>
            <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">
              {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy proposal</>}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
