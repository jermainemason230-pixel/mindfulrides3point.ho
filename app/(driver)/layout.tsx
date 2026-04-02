"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { ToastProvider } from "@/components/ui/Toast";

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !profile) {
      router.push("/login");
    }
  }, [loading, profile, router]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 z-50 bg-black text-white px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Mindful Rides</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-300">{profile.full_name}</span>
            <button onClick={handleLogout} className="p-2 hover:bg-gray-800 rounded-lg">
              <LogOut size={20} />
            </button>
          </div>
        </header>
        <main className="pb-20">{children}</main>
      </div>
    </ToastProvider>
  );
}
