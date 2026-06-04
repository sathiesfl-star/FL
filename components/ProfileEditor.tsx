"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { SKILL_GROUPS, type SkillDef } from "@/lib/skills";
import type { PlainProfile } from "@/lib/account";

export function ProfileEditor({ profile, skills }: { profile: PlainProfile; skills: SkillDef[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(profile.skills));
  const [minBudget, setMinBudget] = useState(String(profile.minBudgetUsd));
  const [types, setTypes] = useState<Set<string>>(new Set(profile.projectTypes));
  const [avoid, setAvoid] = useState(profile.avoid);
  const [excludeCurrencies, setExcludeCurrencies] = useState<Set<string>>(new Set(profile.excludeCurrencies));
  const [excludeKeywords, setExcludeKeywords] = useState(profile.excludeKeywords.join("\n"));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleCurrency(c: string) {
    setExcludeCurrencies((s) => {
      const next = new Set(s);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
    setSaved(false);
  }

  function toggleSkill(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setSaved(false);
  }
  function toggleType(t: string) {
    setTypes((s) => {
      const next = new Set(s);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skills: [...selected],
        minBudgetUsd: Number(minBudget) || 0,
        projectTypes: [...types],
        avoid,
        excludeCurrencies: [...excludeCurrencies],
        excludeKeywords,
      }),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Target Profile</h1>
        <p className="text-sm text-slate-500">Pick the skills and rules that define which projects you want to bid on. The feed uses this to find and rank projects.</p>
      </div>

      {/* Skills — selectable */}
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold text-slate-900">Skills to target</h2>
        <p className="text-xs text-slate-500">Select everything your team bids on. {selected.size} selected.</p>
        <div className="mt-4 space-y-4">
          {SKILL_GROUPS.map((group) => {
            const groupSkills = skills.filter((s) => s.group === group);
            if (!groupSkills.length) return null;
            return (
              <div key={group}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{group}</div>
                <div className="flex flex-wrap gap-2">
                  {groupSkills.map((s) => {
                    const on = selected.has(s.key);
                    return (
                      <button
                        key={s.key}
                        onClick={() => toggleSkill(s.key)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                          on ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand"
                        }`}
                      >
                        {on && <Check className="h-3.5 w-3.5" />}
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Rules */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold text-slate-900">Budget & type</h2>
          <label className="mt-3 block text-sm">
            <span className="text-xs font-semibold uppercase text-slate-500">Minimum budget (USD)</span>
            <input
              type="number" min={0} value={minBudget}
              onChange={(e) => { setMinBudget(e.target.value); setSaved(false); }}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <span className="mt-0.5 block text-[11px] text-slate-400">Projects below this are flagged.</span>
          </label>
          <div className="mt-3">
            <span className="text-xs font-semibold uppercase text-slate-500">Project type</span>
            <div className="mt-1.5 flex gap-2">
              {["fixed", "hourly"].map((t) => (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium capitalize ${
                    types.has(t) ? "border-brand bg-brand-light text-brand" : "border-slate-200 text-slate-500"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold text-slate-900">Avoid</h2>
          <p className="text-xs text-slate-500">Skip projects matching these.</p>
          <div className="mt-3 space-y-2">
            {([
              ["sealed", "Sealed / NDA projects"],
              ["vague", "Vague / low-effort posts"],
              ["contests", "Contests"],
              ["unverifiedClients", "Unverified-payment clients"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={(avoid as any)[key]}
                  onChange={(e) => { setAvoid({ ...avoid, [key]: e.target.checked }); setSaved(false); }}
                  className="h-4 w-4 rounded border-slate-300 text-brand"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* Exclude countries / currencies / keywords */}
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold text-slate-900">Exclude projects</h2>
        <p className="text-xs text-slate-500">
          Hide projects you don&apos;t want — by currency (a rough proxy for the client&apos;s country) or by keyword.
        </p>

        <div className="mt-4">
          <span className="text-xs font-semibold uppercase text-slate-500">Exclude currencies (country proxy)</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {[
              ["NGN", "🇳🇬 Nigeria"],
              ["PKR", "🇵🇰 Pakistan"],
              ["BDT", "🇧🇩 Bangladesh"],
              ["INR", "🇮🇳 India"],
              ["IDR", "🇮🇩 Indonesia"],
              ["EGP", "🇪🇬 Egypt"],
              ["KES", "🇰🇪 Kenya"],
              ["PHP", "🇵🇭 Philippines"],
            ].map(([code, label]) => {
              const on = excludeCurrencies.has(code);
              return (
                <button
                  key={code}
                  onClick={() => toggleCurrency(code)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                    on ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-slate-600 hover:border-red-300"
                  }`}
                >
                  {on ? "✕ " : ""}{label} ({code})
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Note: not perfect — some clients post in USD regardless of country.</p>
        </div>

        <div className="mt-4">
          <span className="text-xs font-semibold uppercase text-slate-500">Exclude keywords / phrases (one per line)</span>
          <textarea
            value={excludeKeywords}
            onChange={(e) => { setExcludeKeywords(e.target.value); setSaved(false); }}
            rows={4}
            placeholder={"nigeria\nlagos\nstudents only\nfree work\nlowest price"}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <p className="mt-1 text-[11px] text-slate-400">Any project whose title/description contains one of these is hidden.</p>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
        {saved && <span className="flex items-center gap-1 text-sm text-emerald-600"><Check className="h-4 w-4" /> Saved</span>}
      </div>
    </div>
  );
}
