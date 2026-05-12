"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PERF_NAV = [
  { href: "/performance/global", label: "Global" },
  { href: "/performance/individual", label: "Individual" },
  { href: "/performance/team", label: "Team" },
  { href: "/performance/custom", label: "Custom" },
];
const NAV = [
  { href: "/reps", label: "Monthly Quotas" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const itemClass = (href: string) => {
    const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
    return `block px-2.5 py-1.5 rounded-md text-[13.5px] transition-colors ${
      active
        ? "bg-zinc-100 text-zinc-900 font-medium dark:bg-zinc-800/70 dark:text-zinc-100"
        : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/70 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/40"
    }`;
  };
  return (
    <aside className="w-56 shrink-0 border-r border-zinc-200/70 dark:border-zinc-800/70 bg-white dark:bg-zinc-950">
      <div className="px-4 py-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-gradient-to-br from-zinc-900 to-zinc-700 dark:from-zinc-100 dark:to-zinc-300 text-white dark:text-zinc-900 text-[11px] font-bold">
            ◆
          </span>
          <span className="text-[13.5px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Sales Perf
          </span>
        </Link>
      </div>
      <nav className="px-2 space-y-0.5">
        <Link href="/current-month" className={itemClass("/current-month")}>
          Current Month
        </Link>
        <div className="h-2" />
        <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Historical Performance
        </div>
        {PERF_NAV.map((n) => (
          <Link key={n.href} href={n.href} className={itemClass(n.href)}>
            {n.label}
          </Link>
        ))}
        <div className="h-2" />
        <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Admin
        </div>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={itemClass(n.href)}>
            {n.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
