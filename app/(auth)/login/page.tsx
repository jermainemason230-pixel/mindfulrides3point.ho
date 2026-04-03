"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { UserRole } from "@/types/database";

const ROLE_REDIRECTS: Record<UserRole, string> = {
  admin: "/admin/dashboard",
  driver: "/driver",
  facility_staff: "/dashboard",
};

export default function LoginPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
      console.log("[login] step 1: creating client");
      const supabase = createClient();

      console.log("[login] step 2: signing in");
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        console.log("[login] auth error:", error.message);
        toast(error.message, "error");
        return;
      }

      console.log("[login] step 3: fetching profile");
      const res = await fetch("/api/auth/me");
      console.log("[login] step 4: got response", res.status);
      if (!res.ok) {
        toast("Signed in but could not load your profile. Please refresh.", "error");
        return;
      }

      const { user } = await res.json();
      const redirectPath = ROLE_REDIRECTS[user.role as UserRole];
      if (!redirectPath) {
        toast("Unknown user role. Please contact support.", "error");
        return;
      }

      window.location.href = redirectPath;
    } catch (err) {
      console.error("[login] caught:", err);
      toast(err instanceof Error ? err.message : `Error: ${String(err)}`, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-black">
            Mindful Rides
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Non-Emergency Medical Transportation
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            name="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <Input
            label="Password"
            name="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <Button
            type="submit"
            loading={loading}
            className="w-full"
            size="lg"
          >
            Sign In
          </Button>
        </form>

        <div className="mt-4 space-y-2 text-center">
          <div>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-[#276EF1] hover:underline"
            >
              Forgot Password?
            </Link>
          </div>
          <div>
            <span className="text-sm text-gray-500">Don&apos;t have an account? </span>
            <Link
              href="/signup"
              className="text-sm font-medium text-[#276EF1] hover:underline"
            >
              Create one
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
