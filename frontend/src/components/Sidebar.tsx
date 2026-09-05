"use client";

import {
  Camera,
  LayoutDashboard,
  Menu,
  Radio,
  ShieldAlert,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function Sidebar() {
  const pathname = usePathname();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const menuItems = [
    { name: "Live Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Incident Vault", href: "/vault", icon: ShieldAlert },
    { name: "Camera Settings", href: "/settings", icon: Camera },
  ];

  const closeDrawer = () => setIsDrawerOpen(false);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-zinc-800/80 bg-zinc-950/90 px-4 backdrop-blur-2xl md:hidden">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5"
          onClick={closeDrawer}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-500/20">
            <ShieldAlert size={19} strokeWidth={2.5} />
          </span>
          <span className="truncate text-base font-bold tracking-tight">
            DeepGuard<span className="text-emerald-400">.ai</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-300 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Live
          </span>
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 sm:hidden"
            title="System Admin"
          >
            <User size={16} />
          </span>
          <button
            type="button"
            aria-label={isDrawerOpen ? "Close navigation" : "Open navigation"}
            onClick={() => setIsDrawerOpen((open) => !open)}
            className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            {isDrawerOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </header>

      {isDrawerOpen && (
        <>
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={closeDrawer}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          />
          <div className="fixed left-3 right-3 top-[4.5rem] z-50 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-3 shadow-2xl md:hidden">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Security operations
            </p>
            <nav className="space-y-1">
              {menuItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={closeDrawer}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${isActive ? "bg-emerald-400/10 text-emerald-300" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"}`}
                  >
                    <item.icon size={18} />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}

      <aside className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800/80 bg-zinc-950/90 px-3 py-2 backdrop-blur-2xl md:bottom-auto md:right-auto md:top-0 md:flex md:h-screen md:w-72 md:flex-col md:border-b-0 md:border-l-0 md:border-r md:border-t-0 md:bg-zinc-950/70 md:p-5">
        {/* Brand Logo */}
        <div className="mb-10 hidden items-center gap-3 px-2 pt-2 md:flex">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-500/20">
            <ShieldAlert size={21} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">
              DeepGuard<span className="text-emerald-400">.ai</span>
            </h1>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Security operations
            </p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex items-center justify-around gap-1 md:flex-1 md:flex-col md:items-stretch md:justify-start md:gap-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`group flex flex-1 items-center justify-center gap-3 rounded-xl px-3 py-2.5 smooth-transition md:flex-none md:justify-start md:px-4 ${
                  isActive
                    ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 shadow-lg shadow-emerald-950/20"
                    : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100"
                }`}
              >
                <item.icon size={19} className="shrink-0" />
                <span className="hidden text-sm font-medium md:inline">
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Admin Profile Section */}
        <div className="mt-auto hidden items-center gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-3 md:flex">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10">
            <User size={18} className="text-zinc-300" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-zinc-100">
              Dev-Kavindu
            </span>
            <span className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Radio size={10} className="text-emerald-400" /> System Admin
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
