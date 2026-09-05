"use client";
import {
  Activity,
  ArrowUpRight,
  Camera,
  Radio,
  ShieldAlert,
  Video,
} from "lucide-react";
import CameraGrid from "@/components/CameraGrid";

export default function Dashboard() {
  const stats = [
    {
      title: "Active Cameras",
      value: "5 / 5",
      icon: Camera,
      color: "text-sky-400",
      trend: "+1 online",
    },
    {
      title: "Today's Alerts",
      value: "12",
      icon: ShieldAlert,
      color: "text-red-400",
      trend: "3 critical",
    },
    {
      title: "System Health",
      value: "99.9%",
      icon: Activity,
      color: "text-emerald-400",
      trend: "Optimal",
    },
    {
      title: "Storage Used",
      value: "450 MB",
      icon: Video,
      color: "text-amber-400",
      trend: "of 2 GB",
    },
  ];

  return (
    <div className="space-y-7">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            <Radio size={13} /> Operations / Live
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Live Command Center
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Real-time situational awareness across your protected site.
          </p>
        </div>
        <div className="flex w-fit items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
          <span className="text-xs font-semibold text-red-300">
            Live AI Processing
          </span>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.title}
            className="glass-panel group flex cursor-default items-center gap-4 p-5 smooth-transition hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900/70"
          >
            <div className={`rounded-xl bg-zinc-800/50 p-3 ${stat.color}`}>
              <stat.icon size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500">{stat.title}</p>
              <p className="mt-0.5 text-2xl font-bold tracking-tight">
                {stat.value}
              </p>
              <p
                className={`mt-1 text-[10px] font-semibold uppercase tracking-wider ${stat.color}`}
              >
                {stat.trend}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content: Camera Grid & Alerts Stream */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Camera Grid Area (Takes 2 Columns) */}
        <div className="glass-panel relative flex min-h-[520px] flex-col overflow-hidden p-1.5 xl:col-span-2">
          <CameraGrid />
        </div>

        {/* Live Alerts Sidebar */}
        <div className="glass-panel flex max-h-[600px] flex-col p-5">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                AI signal stream
              </p>
              <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold">
                <ShieldAlert size={20} className="text-zinc-400" />
                Recent Detections
              </h2>
            </div>
            <ArrowUpRight size={17} className="text-zinc-600" />
          </div>

          <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar">
            {/* Alert Item - Critical */}
            <div className="cursor-pointer rounded-xl border border-red-500/20 bg-red-500/10 p-4 glow-alert">
              <div className="flex justify-between items-start">
                <span className="text-red-400 font-bold text-sm">
                  Suspicious Activity
                </span>
                <span className="text-xs text-zinc-400 bg-zinc-950 px-2 py-1 rounded-md">
                  Just now
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-1">
                Camera 2 - Main Cashier
              </p>
              <div className="mt-2 inline-block bg-red-500/20 border border-red-500/30 text-red-300 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded">
                AI Tag: Possible Robbery
              </div>
              <div className="mt-3 w-full bg-zinc-900 rounded-full h-1.5">
                <div
                  className="bg-red-500 h-1.5 rounded-full"
                  style={{ width: "92%" }}
                ></div>
              </div>
            </div>

            {/* Alert Item - Warning 1 */}
            <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 hover:bg-zinc-800 smooth-transition cursor-pointer">
              <div className="flex justify-between items-start">
                <span className="text-amber-400 font-bold text-sm">
                  Security Alert
                </span>
                <span className="text-xs text-zinc-500">10 mins ago</span>
              </div>
              <p className="text-xs text-zinc-300 mt-1">
                Camera 1 - Front Entrance
              </p>
              <div className="mt-2 inline-block bg-amber-500/10 border border-amber-500/20 text-amber-400/80 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded">
                AI Tag: Possible Fighting
              </div>
            </div>

            {/* Alert Item - Warning 2 */}
            <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 hover:bg-zinc-800 smooth-transition cursor-pointer">
              <div className="flex justify-between items-start">
                <span className="text-amber-400 font-bold text-sm">
                  Security Alert
                </span>
                <span className="text-xs text-zinc-500">1 hour ago</span>
              </div>
              <p className="text-xs text-zinc-300 mt-1">Camera 3 - Aisle 4</p>
              <div className="mt-2 inline-block bg-amber-500/10 border border-amber-500/20 text-amber-400/80 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded">
                AI Tag: Possible Shoplifting
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
