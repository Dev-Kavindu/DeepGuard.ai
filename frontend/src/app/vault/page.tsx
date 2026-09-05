"use client";

import {
  Calendar,
  Download,
  Filter,
  Play,
  Search,
  ShieldAlert,
  ShieldOff,
  Trash2,
  X,
} from "lucide-react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function VaultContent() {
  const searchParams = useSearchParams();
  const playParam = searchParams.get("play");

  const [incidents, setIncidents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const fetchIncidents = useCallback(async () => {
    const { data, error } = await supabase
      .from("incidents")
      .select(`*, cameras ( name )`)
      .order("created_at", { ascending: false });

    if (data) {
      setIncidents(data);
      // Dashboard එකෙන් URL එක හරහා incident ID එකක් ආවොත් ඒකෙ වීඩියෝ player එක auto-open කිරීම
      if (playParam) {
        const target = data.find((i: any) => i.id === Number(playParam));
        if (target && target.video_clip_url) {
          setSelectedVideo(target.video_clip_url);
        }
      }
    }
    if (error) setError(error.message);
    setIsLoading(false);
  }, [playParam]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const handleFalseAlarm = async (id: number) => {
    const { error } = await supabase
      .from("incidents")
      .update({ is_false_alarm: true })
      .eq("id", id);
    if (!error) {
      setIncidents(incidents.map((inc) => (inc.id === id ? { ...inc, is_false_alarm: true } : inc)));
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    const { error } = await supabase.from("incidents").delete().eq("id", deleteConfirmId);
    if (!error) {
      setIncidents(incidents.filter((inc) => inc.id !== deleteConfirmId));
    }
    setDeleteConfirmId(null);
  };

  const filteredIncidents = incidents.filter(
    (inc) =>
      inc.cameras?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.predicted_class?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Evidence / Review queue
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Incident Vault</h1>
          <p className="mt-1 text-sm text-zinc-500">Review and manage AI-detected security events.</p>
        </div>
        <button className="flex w-fit items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-white smooth-transition hover:bg-zinc-700">
          <Calendar size={18} />
          <span>Last 7 Days</span>
        </button>
      </div>

      <div className="glass-panel flex flex-col items-stretch gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input
            type="text"
            placeholder="Search incident by camera or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="focus-ring w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2.5 pl-10 pr-4 text-sm text-white smooth-transition"
          />
        </div>
        <button className="flex items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm hover:border-zinc-600 smooth-transition">
          <Filter size={18} />
          <span>Filter</span>
        </button>
      </div>

      <div className="glass-panel overflow-x-auto">
        {error ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <ShieldAlert className="mb-3 text-red-400" size={28} />
            <p className="text-sm font-medium text-zinc-200">Secure vault unavailable</p>
            <p className="mt-1 max-w-sm text-xs text-zinc-500">{error}</p>
          </div>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-zinc-900/50 text-zinc-400 border-b border-zinc-800/50">
              <tr>
                <th className="px-6 py-4 font-medium">Incident ID</th>
                <th className="px-6 py-4 font-medium">Camera Location</th>
                <th className="px-6 py-4 font-medium">Event Details</th>
                <th className="px-6 py-4 font-medium">Anomaly Score</th>
                <th className="px-6 py-4 font-medium">Date & Time</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-zinc-500">
                    <div className="mb-3 flex justify-center">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/10">
                        <ShieldAlert size={20} className="animate-pulse text-emerald-400" />
                      </span>
                    </div>
                    <span className="text-zinc-300">Loading secure vault...</span>
                  </td>
                </tr>
              ) : filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-zinc-500">
                    No incidents found.
                  </td>
                </tr>
              ) : (
                filteredIncidents.map((incident) => (
                  <tr
                    key={incident.id}
                    className={`hover:bg-zinc-800/20 smooth-transition ${
                      incident.is_false_alarm ? "opacity-50 grayscale" : ""
                    } ${playParam && Number(playParam) === incident.id ? "bg-blue-500/15 border-l-2 border-blue-400" : ""}`}
                  >
                    <td className="px-6 py-4 font-mono text-zinc-300">
                      INC-{incident.id.toString().padStart(4, "0")}
                    </td>
                    <td className="px-6 py-4">{incident.cameras?.name || "Unknown Camera"}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`font-semibold ${incident.is_false_alarm ? "text-zinc-500 line-through" : "text-zinc-200"}`}>
                          {incident.is_false_alarm ? "False Alarm" : "Suspicious Activity"}
                        </span>
                        {!incident.is_false_alarm && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Possible: {incident.predicted_class}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={incident.anomaly_score >= 90 ? "text-red-400 font-bold" : "text-amber-400 font-bold"}>
                        {incident.anomaly_score.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-zinc-400">
                      {new Date(incident.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-3">
                        {!incident.is_false_alarm && (
                          <button onClick={() => handleFalseAlarm(incident.id)} className="text-zinc-400 hover:text-amber-400 smooth-transition" title="Mark as False Alarm">
                            <ShieldOff size={18} />
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedVideo(incident.video_clip_url)}
                          className="text-zinc-400 hover:text-blue-400 smooth-transition"
                          title="Play Video"
                          disabled={!incident.video_clip_url}
                        >
                          <Play size={18} className={!incident.video_clip_url ? "opacity-30" : ""} />
                        </button>
                        <a
                          href={incident.video_clip_url}
                          download
                          target="_blank"
                          className={`text-zinc-400 hover:text-green-400 smooth-transition ${!incident.video_clip_url ? "pointer-events-none opacity-30" : ""}`}
                          title="Download Evidence"
                        >
                          <Download size={18} />
                        </a>
                        <button
                          onClick={() => setDeleteConfirmId(incident.id)}
                          className="text-zinc-400 hover:text-red-400 smooth-transition"
                          title="Delete Record"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Video Player Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="relative max-h-[90vh] w-[92vw] max-w-lg overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 p-4">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Play size={18} className="text-blue-500" /> Evidence Playback
              </h3>
              <button onClick={() => setSelectedVideo(null)} className="text-zinc-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <div className="aspect-video bg-black flex items-center justify-center">
              <video src={selectedVideo} controls autoPlay className="w-full h-full object-contain">
                <track kind="captions" />
              </video>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <ShieldAlert size={24} />
              <h3 className="text-lg font-bold text-white">Delete Incident</h3>
            </div>
            <p className="text-sm text-zinc-400 mb-6">
              Are you sure you want to permanently delete this incident record and its video evidence? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 text-sm font-medium hover:bg-zinc-700 smooth-transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded-lg bg-red-600 text-sm font-medium text-white hover:bg-red-700 smooth-transition"
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VaultPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-zinc-500 text-sm">Loading Vault...</div>}>
      <VaultContent />
    </Suspense>
  );
}