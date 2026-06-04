"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListChecks, SlidersHorizontal, Briefcase, Settings, PenLine, LogOut } from "lucide-react";

const NAV = [
  { href: "/write", label: "Write Proposal", icon: PenLine },
  { href: "/projects", label: "Project Feed", icon: ListChecks },
  { href: "/profile", label: "Target Profile", icon: SlidersHorizontal },
  { href: "/settings", label: "Agency Profile", icon: Settings },
];

export function Sidebar({ accountName, mode }: { accountName: string; mode: string }) {
  const pathname = usePathname();
  return (
    <aside className="flex h-full flex-col border-r bg-white">
      <div className="flex items-center gap-2 px-5 py-4">
        <Briefcase className="h-5 w-5 text-brand" />
        <span className="text-lg font-bold text-brand">BidCopilot</span>
      </div>
      <nav className="mt-2 flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                active ? "bg-brand-light text-brand" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <div className="text-xs text-slate-400">
          <div className="font-medium text-slate-600">{accountName}</div>
          <div className="mt-0.5">
            Freelancer: <span className={mode === "mock" ? "text-amber-600" : "text-emerald-600"}>{mode}</span>
          </div>
        </div>
        <button
          onClick={async () => {
            await fetch("/api/logout", { method: "POST" });
            window.location.href = "/login";
          }}
          className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>
    </aside>
  );
}
