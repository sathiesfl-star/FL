"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCcw, AlertTriangle, Clock, Users, DollarSign, Sparkles, Copy, Check as CheckIcon } from "lucide-react";
import type { ScoredProject } from "@/lib/relevance";

interface AiState {
  loading: boolean;
  score?: number;
  reasons?: string[];
  redFlags?: string[];
  proposal?: string;
  mode?: string;
}

function ago(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function scoreColor(s: number): string {
  if (s >= 70) return "bg-emerald-100 text-emerald-800";
  if (s >= 40) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-500";
}

export function ProjectFeed({
  projects,
  mode,
  profileSkillCount,
  keywordCount,
  fetchError,
}: {
  projects: ScoredProject[];
  mode: string;
  profileSkillCount: number;
  keywordCount: number;
  fetchError: string | null;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [ai, setAi] = useState<Record<string, AiState>>({});
  const [copied, setCopied] = useState<string | null>(null);
  // Relative timestamps are computed client-side only, to avoid a server/client
  // hydration mismatch when a minute ticks over between render passes.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function refresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 800);
  }

  async function generate(p: ScoredProject) {
    setAi((s) => ({ ...s, [p.freelancerId]: { loading: true } }));
    try {
      const res = await fetch("/api/projects/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: p }),
      });
      const d = await res.json();
      setAi((s) => ({
        ...s,
        [p.freelancerId]: { loading: false, score: d.score, reasons: d.reasons, redFlags: d.redFlags, proposal: d.proposal, mode: d.mode },
      }));
    } catch {
      setAi((s) => ({ ...s, [p.freelancerId]: { loading: false } }));
    }
  }

  function updateProposal(id: string, text: string) {
    setAi((s) => ({ ...s, [id]: { ...s[id], proposal: text } }));
  }

  async function copyProposal(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Project Feed</h1>
          <p className="text-sm text-slate-500">
            {projects.length} matching projects · {profileSkillCount} skills targeted ·{" "}
            <span className={mode === "live" ? "text-emerald-600" : "text-amber-600"}>{mode} mode</span>
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {mode === "mock" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Showing sample projects. Add your Freelancer API token and set <code>FREELANCER_MODE=live</code> to pull real projects.
        </div>
      )}
      {fetchError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          Fetch error: {fetchError}
        </div>
      )}
      {keywordCount === 0 && (
        <div className="rounded-lg border bg-white px-4 py-2.5 text-sm text-slate-600">
          No skills selected yet. Go to <b>Target Profile</b> and pick the skills you bid on.
        </div>
      )}

      <div className="space-y-3">
        {projects.map((p) => (
          <div key={p.freelancerId} className="rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">{p.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{p.description}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${scoreColor(p.matchScore)}`}>
                {p.matchScore}% fit
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                {p.budgetMin ?? "?"}–{p.budgetMax ?? "?"} {p.currency} · {p.projectType}
              </span>
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {p.bidCount} bids</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {mounted ? ago(p.postedAt) : "…"}</span>
            </div>

            {p.matchedSkills.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {p.matchedSkills.slice(0, 6).map((s) => (
                  <span key={s} className="rounded bg-brand-light px-1.5 py-0.5 text-[11px] font-medium text-brand">{s}</span>
                ))}
              </div>
            )}

            {p.redFlags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {p.redFlags.map((f) => (
                  <span key={f} className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600">
                    <AlertTriangle className="h-3 w-3" /> {f}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center justify-end gap-2">
              {!ai[p.freelancerId]?.proposal && (
                <button
                  onClick={() => generate(p)}
                  disabled={ai[p.freelancerId]?.loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {ai[p.freelancerId]?.loading ? "Writing…" : "Generate proposal"}
                </button>
              )}
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Bid on Freelancer <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            {/* AI result panel */}
            {ai[p.freelancerId]?.proposal && (
              <div className="mt-3 rounded-lg border bg-slate-50 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded bg-brand px-2 py-0.5 font-bold text-white">
                    AI fit {ai[p.freelancerId]?.score}/10
                  </span>
                  {ai[p.freelancerId]?.mode === "mock" && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">mock AI</span>
                  )}
                  {ai[p.freelancerId]?.reasons?.slice(0, 3).map((r) => (
                    <span key={r} className="rounded bg-white px-2 py-0.5 text-slate-500">{r}</span>
                  ))}
                  {ai[p.freelancerId]?.redFlags?.map((r) => (
                    <span key={r} className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-red-600">
                      <AlertTriangle className="h-3 w-3" /> {r}
                    </span>
                  ))}
                </div>
                <textarea
                  value={ai[p.freelancerId]?.proposal}
                  onChange={(e) => updateProposal(p.freelancerId, e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand"
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    onClick={() => copyProposal(p.freelancerId, ai[p.freelancerId]?.proposal ?? "")}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-white"
                  >
                    {copied === p.freelancerId ? <><CheckIcon className="h-3.5 w-3.5 text-emerald-500" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy proposal</>}
                  </button>
                  <button onClick={() => generate(p)} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-white">
                    Regenerate
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">Review &amp; edit, copy it, then place the bid manually on Freelancer.</p>
              </div>
            )}
          </div>
        ))}

        {projects.length === 0 && keywordCount > 0 && !fetchError && (
          <div className="rounded-xl border bg-white p-8 text-center text-slate-500">
            No matching projects right now. Try widening your Target Profile or refresh.
          </div>
        )}
      </div>
    </div>
  );
}
