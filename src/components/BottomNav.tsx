"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Home, SlidersHorizontal, Users, ArrowLeftRight } from "lucide-react";

const ITEMS = [
  { href: "/hub", label: "Home", icon: Home },
  { href: "/squad", label: "Squad", icon: Users },
  { href: "/tactics", label: "Tactics", icon: SlidersHorizontal },
  { href: "/transfers", label: "Transfers", icon: ArrowLeftRight },
  { href: "/standings", label: "Table", icon: BarChart3 },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-panel/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${
                active ? "text-gold" : "text-white/50 hover:text-white/80"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
