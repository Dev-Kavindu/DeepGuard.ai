"use client";

import { Activity, AlertTriangle, Video, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CameraGrid() {
  const [cameras, setCameras] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchCameras = async () => {
    const { data, error } = await supabase
      .from("cameras")
      .select("*")
      .order("id", { ascending: true });
    if (data) {
      const formattedCameras = data.map((cam) => ({
        ...cam,
        isActive: cam.status === "active" || cam.active === true || cam.status === undefined,
        videoUrl: cam.stream_url || cam.url || "",
        isAlert: false,
      }));
      setCameras(formattedCameras);
    } else if (error) {
      setError("Camera network is unavailable. Check your connection and try again.");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchCameras();

    const incidentChannel = supabase
      .channel("live-incidents")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "incidents" },
        (payload) => {
          const newIncident = payload.new;
          setCameras((prevCameras) =>
            prevCameras.map((cam) =>
              cam.id === newIncident.camera_id ? { ...cam, isAlert: true } : cam
            )
          );
          try {
            const audio = new Audio("/alarm-beep.mp3");
            audio.play().catch((e) => console.log("Audio play blocked by browser:", e));
          } catch (err) {
            console.log("Audio error:", err);
          }
          setTimeout(() => {
            setCameras((prevCameras) =>
              prevCameras.map((cam) =>
                cam.id === newIncident.camera_id ? { ...cam, isAlert: false } : cam
              )
            );
          }, 15000);
        }
      )
      .subscribe();

    // අලුත් කැමරා Real-time අඳුනා ගැනීම
    const cameraChannel = supabase
      .channel("live-cameras-grid")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cameras" },
        () => fetchCameras()
      )
      .subscribe();

    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(`${now.toLocaleTimeString("en-US", { hour12: false })} ${now.toLocaleDateString()}`);
    }, 1000);

    return () => {
      clearInterval(timer);
      supabase.removeChannel(incidentChannel);
      supabase.removeChannel(cameraChannel);
    };
  }, []);

  return (
    // මෙහි h-full ඉවත් කර content-start එකතු කර ඇත
    <div className="relative z-20 grid w-full content-start grid-cols-1 gap-4 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
      {isLoading ? (
        <div className="col-span-full flex min-h-[360px] flex-col items-center justify-center text-zinc-500">
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10">
            <Activity className="animate-spin text-emerald-400" size={20} />
          </span>
          <span className="text-sm font-medium text-zinc-300">Connecting to camera network</span>
          <span className="mt-1 text-xs text-zinc-600">Establishing secure live channels...</span>
        </div>
      ) : error ? (
        <div className="col-span-full flex min-h-[360px] flex-col items-center justify-center text-center">
          <WifiOff className="mb-3 text-red-400" size={30} />
          <p className="text-sm font-medium text-zinc-200">Unable to load camera feeds</p>
          <p className="mt-1 max-w-xs text-xs text-zinc-500">{error}</p>
        </div>
      ) : cameras.length === 0 ? (
        <div className="col-span-full flex min-h-[360px] flex-col items-center justify-center text-zinc-500">
          <Video className="mb-3 text-zinc-600" size={32} />
          <span className="text-sm font-medium text-zinc-300">No cameras configured</span>
          <span className="mt-1 text-xs text-zinc-600">Add a camera in Settings to begin monitoring.</span>
        </div>
      ) : (
        cameras.map((cam) => (
          <div
            key={cam.id}
            className={`group relative flex aspect-video flex-col justify-between overflow-hidden rounded-xl border bg-zinc-950 smooth-transition
              ${cam.isAlert ? "border-red-500 glow-alert" : "border-zinc-800/80 hover:border-zinc-600"}
              ${!cam.isActive ? "opacity-60 grayscale" : ""}
            `}
          >
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black">
              {cam.isActive ? (
                cam.videoUrl && (cam.videoUrl.startsWith("http://") || cam.videoUrl.startsWith("https://")) ? (
                  <video
                    src={cam.videoUrl}
                    autoPlay
                    muted
                    loop
                    playsInline
                    crossOrigin="anonymous"
                    className="h-full w-full object-cover opacity-90"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-zinc-600">
                    <Video size={48} className="mb-2 opacity-50" />
                    <span className="rounded bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-400">
                      RTSP ACTIVE (MODAL BACKEND)
                    </span>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center text-zinc-700">
                  <WifiOff size={48} className="mb-2" />
                  <span className="text-xs font-bold tracking-wider">OFFLINE</span>
                </div>
              )}
            </div>

            <div className="absolute top-0 z-10 flex w-full items-center justify-between bg-gradient-to-b from-black/90 via-black/50 to-transparent p-3">
              <div className="flex items-center gap-2">
                <span className="rounded border border-white/10 bg-black/60 px-2 py-1 font-mono text-[10px] font-bold text-white backdrop-blur-md">
                  CAM {cam.id}
                </span>
                <span className="max-w-[10rem] truncate text-sm font-medium text-zinc-200 shadow-black drop-shadow-lg">
                  {cam.name}
                </span>
              </div>

              {cam.isAlert ? (
                <div className="flex items-center gap-1 rounded border border-red-400 bg-red-600 px-2 py-1 text-xs font-bold text-white shadow-[0_0_15px_rgba(239,68,68,0.9)]">
                  <AlertTriangle size={14} /> ALARM
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  {cam.isActive ? (
                    <div className="flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-1 backdrop-blur-sm">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-green-400">
                        {cam.videoUrl && (cam.videoUrl.startsWith("http://") || cam.videoUrl.startsWith("https://")) ? "TEST MP4" : "LIVE RTSP"}
                      </span>
                    </div>
                  ) : (
                    <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-400">
                      Offline
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="absolute bottom-0 z-10 flex w-full items-end justify-between bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3">
              <span className="text-xs font-mono text-white/90 drop-shadow-md">
                {currentTime || "Loading..."}
              </span>
              <span className="text-xs font-bold tracking-widest text-blue-500/70 drop-shadow-md">
                DeepGuard.ai
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}