"use client";

import {
  Camera,
  Check,
  Plus,
  Save,
  Settings2,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SettingsPage() {
  const [cameras, setCameras] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCam, setNewCam] = useState({ name: "", url: "", threshold: 50 });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [saved, setSaved] = useState(false);

  const fetchCameras = useCallback(async () => {
    const { data, error } = await supabase
      .from("cameras")
      .select("*")
      .order("id", { ascending: true });
    if (data) setCameras(data);
    if (error) setError(error.message);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus("Uploading to Supabase...");
    const fileExt = file.name.split(".").pop();
    const fileName = `test-cam-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("incident_vault")
      .upload(fileName, file);

    if (uploadError) {
      alert(`Upload Failed: ${uploadError.message}`);
      setUploadStatus("Upload failed");
      setIsUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("incident_vault")
      .getPublicUrl(fileName);

    if (publicUrlData?.publicUrl) {
      setNewCam((prev) => ({ ...prev, url: publicUrlData.publicUrl }));
      setUploadStatus("Uploaded successfully!");
    }
    setIsUploading(false);
  };

  const handleAddCamera = async () => {
    if (!newCam.name || !newCam.url) return;
    setIsSaving(true);

    // Supabase table columns වලට ගැලපෙන පරිදි mapping සකස් කිරීම
    const { data, error } = await supabase
      .from("cameras")
      .insert([
        {
          name: newCam.name,
          stream_url: newCam.url,
          sensitivity: newCam.threshold,
          status: "active",
        },
      ])
      .select();

    if (data) {
      setCameras([...cameras, data[0]]);
      setIsModalOpen(false);
      setNewCam({ name: "", url: "", threshold: 50 });
      setUploadStatus("");
    } else {
      alert(`Error adding camera: ${error?.message || "Unknown database error"}`);
      console.error(error);
    }
    setIsSaving(false);
  };

  const handleDelete = async (id: number) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this camera?",
    );
    if (!confirmDelete) return;

    const { error } = await supabase.from("cameras").delete().eq("id", id);
    if (!error) {
      setCameras(cameras.filter((cam) => cam.id !== id));
    }
  };

  const handleThresholdChange = async (id: number, newThreshold: number) => {
    setCameras(
      cameras.map((c) => (c.id === id ? { ...c, sensitivity: newThreshold } : c)),
    );
    await supabase
      .from("cameras")
      .update({ sensitivity: newThreshold })
      .eq("id", id);
  };

  return (
    <div className="relative space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Control plane / Sources
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Camera Configuration
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage live RTSP streams or test MP4 videos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex w-fit items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-500/15 smooth-transition hover:bg-emerald-300"
        >
          <Plus size={20} />
          <span>Add New Camera</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {error ? (
            <div className="glass-panel flex min-h-56 flex-col items-center justify-center border-dashed p-10 text-center">
              <Camera size={28} className="mb-3 text-red-400" />
              <p className="text-sm font-medium text-zinc-200">
                Camera configuration unavailable
              </p>
              <p className="mt-1 max-w-sm text-xs text-zinc-500">{error}</p>
            </div>
          ) : isLoading ? (
            <div className="glass-panel flex min-h-56 flex-col items-center justify-center border-dashed p-10 text-zinc-500">
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/10">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400"></span>
              </span>
              <p className="text-sm text-zinc-300">Loading camera registry</p>
              <span className="mt-1 text-xs text-zinc-600">
                Syncing secure source configuration
              </span>
            </div>
          ) : cameras.length === 0 ? (
            <div className="glass-panel p-10 flex flex-col items-center justify-center text-zinc-500 border-dashed">
              <Video size={48} className="mb-4 opacity-50" />
              <p>
                No cameras configured yet. Add an RTSP stream or Test Video URL.
              </p>
            </div>
          ) : (
            cameras.map((cam) => (
              <div
                key={cam.id}
                className="glass-panel group flex flex-col gap-4 p-5 smooth-transition hover:border-zinc-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-zinc-800 p-2 group-hover:bg-emerald-400/10 group-hover:text-emerald-400 smooth-transition">
                      <Camera
                        size={20}
                        className="text-zinc-300 group-hover:text-emerald-400"
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{cam.name}</h3>
                      <p
                        className="text-xs text-zinc-500 font-mono mt-1 w-64 truncate"
                        title={cam.stream_url}
                      >
                        {cam.stream_url}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${cam.status === "active" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-zinc-700 bg-zinc-800 text-zinc-400"}`}
                    >
                      {cam.status || "Active"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(cam.id)}
                      className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg smooth-transition"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="bg-zinc-950/50 p-4 rounded-xl border border-zinc-800/50">
                  <div className="flex justify-between items-center mb-2">
                    <label
                      htmlFor={`threshold-${cam.id}`}
                      className="text-sm font-medium flex items-center gap-2 text-zinc-300"
                    >
                      <Settings2 size={16} className="text-blue-400" />
                      AI Anomaly Threshold (Sensitivity)
                    </label>
                    <span className="text-sm font-bold text-blue-400">
                      {cam.sensitivity}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    id={`threshold-${cam.id}`}
                    value={cam.sensitivity || 50}
                    onChange={(e) =>
                      handleThresholdChange(
                        cam.id,
                        parseInt(e.target.value, 10),
                      )
                    }
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-emerald-400"
                  />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-6">
          <div className="glass-panel p-5">
            <h3 className="mb-4 border-b border-zinc-800 pb-3 text-lg font-semibold">
              Global Preferences
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">
                  Auto-Delete Old Videos (7 Days)
                </span>
                <input
                  type="checkbox"
                  defaultChecked
                  className="accent-blue-500 w-4 h-4 cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">
                  Send Email Alerts for Criticals
                </span>
                <input
                  type="checkbox"
                  defaultChecked
                  className="accent-blue-500 w-4 h-4 cursor-pointer"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSaved(true)}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 py-2 text-sm text-white smooth-transition hover:bg-zinc-700"
            >
              {saved ? (
                <Check size={18} className="text-emerald-400" />
              ) : (
                <Save size={18} />
              )}
              {saved ? "Preferences Saved" : "Save Preferences"}
            </button>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white smooth-transition"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Camera className="text-blue-500" /> Add New Camera
            </h2>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="camera-name"
                  className="block text-sm font-medium text-zinc-400 mb-1"
                >
                  Camera Name / Location
                </label>
                <input
                  id="camera-name"
                  type="text"
                  placeholder="e.g. Storage Room"
                  value={newCam.name}
                  onChange={(e) =>
                    setNewCam({ ...newCam, name: e.target.value })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-blue-500 smooth-transition"
                />
              </div>

              <div>
                <label
                  htmlFor="stream-url"
                  className="block text-sm font-medium text-zinc-400 mb-1"
                >
                  Stream URL (RTSP or MP4 Link)
                </label>
                <input
                  id="stream-url"
                  type="text"
                  placeholder="rtsp://... OR https://.../test-video.mp4"
                  value={newCam.url}
                  onChange={(e) =>
                    setNewCam({ ...newCam, url: e.target.value })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-2 px-3 text-sm font-mono text-white focus:outline-none focus:border-blue-500 smooth-transition mb-2"
                />

                <div className="flex items-center gap-3 p-3 bg-zinc-950/50 border border-zinc-800/50 rounded-lg border-dashed">
                  <input
                    type="file"
                    accept="video/mp4"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="video-upload"
                  />
                  <label
                    htmlFor="video-upload"
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium rounded-md cursor-pointer smooth-transition flex items-center gap-2"
                  >
                    {isUploading ? (
                      <span className="animate-spin h-3 w-3 border-b-2 border-white rounded-full"></span>
                    ) : (
                      <Video size={14} />
                    )}
                    {isUploading ? "Uploading..." : "Upload Test MP4"}
                  </label>
                  <span className="text-xs text-zinc-400">
                    {uploadStatus || "Auto-generates the URL after upload."}
                  </span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label
                    htmlFor="new-camera-threshold"
                    className="block text-sm font-medium text-zinc-400"
                  >
                    Default AI Threshold
                  </label>
                  <span className="text-sm font-bold text-blue-400">
                    {newCam.threshold}%
                  </span>
                </div>
                <input
                  id="new-camera-threshold"
                  type="range"
                  min="10"
                  max="90"
                  value={newCam.threshold}
                  onChange={(e) =>
                    setNewCam({
                      ...newCam,
                      threshold: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium smooth-transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddCamera}
                  disabled={
                    !newCam.name || !newCam.url || isSaving || isUploading
                  }
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium smooth-transition flex justify-center items-center"
                >
                  {isSaving ? (
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                  ) : (
                    "Add Camera"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}