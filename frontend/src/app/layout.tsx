import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "DeepGuard AI | Smart CCTV Security",
  description: "AI-powered real-time CCTV anomaly detection system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#09090b] text-white">
        <Sidebar />
        <main className="min-h-screen px-4 pb-24 pt-6 sm:px-6 md:ml-72 md:px-8 md:pb-8 lg:px-10">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </body>
    </html>
  );
}
