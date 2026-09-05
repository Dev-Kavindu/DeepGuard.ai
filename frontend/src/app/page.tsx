"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  Camera,
  Radio,
  ShieldAlert,
  Video,
} from "lucide-react";
import CameraGrid from "@/components/CameraGrid";
import { supabase } from "@/lib/supabase";

interface Incident {
  id: number;
  camera_id: number;
  predicted_class: string;
  anomaly_score: number;
  video_clip_url: string;
  created_at: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activeCamCount, setActiveCamCount] = useState<number>(0);
  const [totalCamCount, setTotalCamCount] = useState<number>(0);

  const formatTimeAgo = (dateString: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} mins ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    return new Date(dateString).toLocaleDateString();
  };

  useEffect(() => {
    const fetchCameraStats = async () => {
      const { data } = await supabase.from("cameras").select("id, status, active");
      if (data) {
        setTotalCamCount(data.length);
        const active = data.filter(
          (c) => c.status === "active" || c.active === true || c.status === null
        ).length;
        setActiveCamCount(active);
      }
    };

    const fetchRecentIncidents = async () => {
      const { data } = await supabase
        .from("incidents")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) setIncidents(data);
    };

    fetchCameraStats();
    fetchRecentIncidents();

    // Alerts වලට Realtime Listener
    const incidentChannel = supabase
      .channel("live-dashboard-incidents")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "incidents" },
        (payload) => {
          const newIncident = payload.new as Incident;
          setIncidents((prev) => [newIncident, ...prev.slice(0, 9)]);
        }
      )
      .subscribe();

    // Cameras වලට Realtime Listener (කැමරාවක් Add/Delete කළ විට Count එක හැදීමට)
    const cameraChannel = supabase
      .channel("live-dashboard-cameras")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cameras" },
        () => fetchCameraStats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(incidentChannel);
      supabase.removeChannel(cameraChannel);
    };
  }, []);

  const criticalCount = incidents.filter((i) => i.anomaly_score >= 70).length;

  const stats = [
    {
      title: "Active Cameras",
      value: `${activeCamCount} / ${totalCamCount || 5}`,
      icon: Camera,
      color: "text-sky-400",
      trend: `+${activeCamCount} online`,
    },
    {
      title: "Today's Alerts",
      value: `${incidents.length}`,
      icon: ShieldAlert,
      color: "text-red-400",
      trend: `${criticalCount} critical`,
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
      value: `${(incidents.length * 15).toFixed(0)} MB`,
      icon: Video,
      color: "text-amber-400",
      trend: "of 2 GB",
    },
  ];

  return (
    <div className="space-y-7">
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
              <p className={`mt-1 text-[10px] font-semibold uppercase tracking-wider ${stat.color}`}>
                {stat.trend}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Gap එක හදන්න min-h-[520px] අයින් කරලා h-fit දැම්මා */}
        <div className="glass-panel relative flex h-fit flex-col overflow-hidden p-1.5 xl:col-span-2">
          <CameraGrid />
        </div>

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
            <button
              type="button"
              onClick={() => router.push("/vault")}
              className="text-zinc-500 hover:text-white smooth-transition"
              title="View all in Incident Vault"
            >
              <ArrowUpRight size={17} />
            </button>
          </div>

          <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar">
            {incidents.length === 0 ? (
              <div className="py-16 text-center text-xs text-zinc-500">
                No active threats detected. Monitoring site live.
              </div>
            ) : (
              incidents.map((inc) => {
                const isCritical = inc.anomaly_score >= 70;
                return (
                  <div
                    key={inc.id}
                    onClick={() => router.push(`/vault?play=${inc.id}`)}
                    className={`cursor-pointer rounded-xl border p-4 smooth-transition hover:scale-[1.01] ${
                      isCritical
                        ? "border-red-500/20 bg-red-500/10 glow-alert hover:border-red-500/40"
                        : "border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className={`font-bold text-sm ${isCritical ? "text-red-400" : "text-amber-400"}`}>
                        {isCritical ? "Suspicious Activity" : "Security Alert"}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-md ${isCritical ? "text-zinc-400 bg-zinc-950" : "text-zinc-500 bg-zinc-900"}`}>
                        {formatTimeAgo(inc.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 mt-1">
                      Camera {inc.camera_id} - Monitored Feed
                    </p>
                    <div className={`mt-2 inline-block border text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                      isCritical ? "bg-red-500/20 border-red-500/30 text-red-300" : "bg-amber-500/10 border-amber-500/20 text-amber-400/80"
                    }`}>
                      AI Tag: Possible {inc.predicted_class}
                    </div>
                    {isCritical && (
                      <div className="mt-3 w-full bg-zinc-900 rounded-full h-1.5">
                        <div
                          className="bg-red-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(inc.anomaly_score, 100)}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}