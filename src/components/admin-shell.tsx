"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Shield,
  Settings,
  User,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/orders", label: "Ordini", icon: Package, exact: false },
  { href: "/admin/settings", label: "Impostazioni", icon: Settings, exact: false },
];

interface AdminShellProps {
  photographerName: string;
  canAccessPlatformDashboard?: boolean;
  children: React.ReactNode;
}

export function AdminShell({
  photographerName,
  canAccessPlatformDashboard = false,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const isActive = (item: (typeof NAV_ITEMS)[number]) => {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  };

  const navContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 pb-2 pt-6">
        <Image
          src="/logo.png"
          alt="ZippoPrinter"
          width={38}
          height={38}
          className="shrink-0"
        />
        <span className="text-lg font-bold tracking-tight text-foreground">
          ZippoPrinter
        </span>
      </div>

      {/* Nav */}
      <nav className="mt-6 flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
                active
                  ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(217,121,66,0.15)]"
                  : "text-muted-foreground hover:bg-[color:var(--muted)]/50 hover:text-foreground"
              }`}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {item.label}
            </Link>
          );
        })}
        {canAccessPlatformDashboard ? (
          <Link
            href="/platform"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
              pathname.startsWith("/platform")
                ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(217,121,66,0.15)]"
                : "text-muted-foreground hover:bg-[color:var(--muted)]/50 hover:text-foreground"
            }`}
          >
            <Shield className="h-[18px] w-[18px] shrink-0" />
            Piattaforma
          </Link>
        ) : null}
      </nav>

      {/* Bottom: user + sign-out */}
      <div className="border-t border-[color:var(--border)] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {photographerName}
            </p>
            <p className="text-xs text-muted-foreground">Studio</p>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/admin/settings#account-security"
              className="shrink-0 rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-[color:var(--muted)]/50 hover:text-foreground"
              aria-label="Account"
            >
              <User className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="shrink-0 rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-[color:var(--muted)]/50 hover:text-foreground disabled:opacity-50"
              aria-label="Esci"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-[264px] shrink-0 flex-col border-r border-[color:var(--border)] bg-white/80 backdrop-blur-md lg:flex">
        {navContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/25 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="relative flex h-full w-[264px] flex-col bg-white shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-5 rounded-xl p-2 text-muted-foreground hover:bg-[color:var(--muted)]/50"
              aria-label="Chiudi menu"
            >
              <X className="h-5 w-5" />
            </button>
            {navContent}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-[color:var(--border)] bg-white/80 px-4 py-3 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-xl p-2 text-foreground hover:bg-[color:var(--muted)]/50"
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Image src="/logo.png" alt="ZippoPrinter" width={28} height={28} />
          <span className="text-sm font-bold tracking-tight text-foreground">
            ZippoPrinter
          </span>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
