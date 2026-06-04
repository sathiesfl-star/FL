"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import type { AgencyProfile } from "@/lib/agency-profile";

export function AgencyProfileEditor({ profile, aiStatus }: { profile: AgencyProfile; aiStatus: string }) {
  const router = useRouter();
  const [oneLiner, setOneLiner] = useState(profile.oneLiner);
  const [site, setSite] = useState(profile.site);
  const [strengths, setStrengths] = useState(profile.strengths.join("\n"));
  const [tone, setTone] = useState(profile.tone);
  const [rules, setRules] = useState(profile.rules.join("\n"));
  const [winning, setWinning] = useState(profile.winningProposals.join("\n\n"));
  const [pastProjects, setPastProjects] = useState(profile.pastProjects);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/agency-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oneLiner, site, strengths, tone, rules, winningProposals: winning, pastProjects }),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  const dirty = () => setSaved(false);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings · Agency Profile</h1>
        <p className="text-sm text-slate-500">
          This is what the AI uses to write proposals as you. The <b>winning proposals</b> matter most —
          paste the ones that actually got replies, and the AI will match their style.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-sm">
        <Sparkles className="h-4 w-4 text-brand" />
        AI provider: <span className={aiStatus === "mock" ? "font-semibold text-amber-600" : "font-semibold text-emerald-600"}>{aiStatus}</span>
        {aiStatus === "mock" && <span className="text-slate-400">— add an OpenAI or Anthropic API key in .env.local for real proposals</span>}
      </div>

      <section className="space-y-4 rounded-xl border bg-white p-5">
        <Field label="One-liner (what your agency does)" value={oneLiner} onChange={(v) => { setOneLiner(v); dirty(); }} />
        <Field label="Website" value={site} onChange={(v) => { setSite(v); dirty(); }} />
        <Area label="Strengths (one per line)" value={strengths} onChange={(v) => { setStrengths(v); dirty(); }} rows={6} />
        <Area label="Tone" value={tone} onChange={(v) => { setTone(v); dirty(); }} rows={2} />
        <Area label="Rules the AI must follow (one per line)" value={rules} onChange={(v) => { setRules(v); dirty(); }} rows={7} />
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold text-slate-900">📁 Past projects / Portfolio</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Paste your past projects from your doc (descriptions, what you built, tech used, links).
          When a new project matches, the AI will reference a relevant one as proof. It only mentions
          projects genuinely related to the client&apos;s need.
        </p>
        <textarea
          value={pastProjects}
          onChange={(e) => { setPastProjects(e.target.value); dirty(); }}
          rows={12}
          placeholder={"Shopify store for ABC Fashion — custom theme, 200+ products, payment integration. https://...\n\nWooCommerce site for XYZ Store — Elementor, subscription products.\n\nReact Native fitness app for...\n\n(paste as much as you like — one project per block)"}
          className="mt-3 w-full rounded-lg border px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand"
        />
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold text-slate-900">⭐ Winning proposals</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Paste 2–3 proposals that won you projects. <b>Separate each with a blank line.</b> The AI studies these to match your winning style.
        </p>
        <textarea
          value={winning}
          onChange={(e) => { setWinning(e.target.value); dirty(); }}
          rows={12}
          placeholder={"Hi [Name], I noticed you need a Shopify store...\n\n(blank line between each proposal)\n\nHello, I read your requirement for a WordPress site..."}
          className="mt-3 w-full rounded-lg border px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand"
        />
      </section>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
          {saving ? "Saving…" : "Save profile"}
        </button>
        {saved && <span className="flex items-center gap-1 text-sm text-emerald-600"><Check className="h-4 w-4" /> Saved</span>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-slate-500">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand" />
    </label>
  );
}

function Area({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-slate-500">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand" />
    </label>
  );
}
