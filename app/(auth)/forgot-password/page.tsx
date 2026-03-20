"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        toast(error.message, "error");
        return;
      }

      setSubmitted(true);
    } catch {
      toast("An unexpected error occurred. Please try again.", "error");
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
          <p className="mt-2 text-sm text-gray-500">Reset your password</p>
        </div>

        {submitted ? (
          <div className="text-center">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
              <p className="text-sm text-gray-700">
                If an account exists for <strong>{email}</strong>, you will
                receive a password reset link shortly.
              </p>
            </div>
            <Link
              href="/login"
              className="mt-6 inline-block text-sm font-medium text-[#276EF1] hover:underline"
            >
              Back to Sign In
            </Link>
          </div>
        ) : (
          <>
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

              <Button
                type="submit"
                loading={loading}
                className="w-full"
                size="lg"
              >
                Send Reset Link
              </Button>
            </form>

            <div className="mt-4 text-center">
              <Link
                href="/login"
                className="text-sm font-medium text-[#276EF1] hover:underline"
              >
                Back to Sign In
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
