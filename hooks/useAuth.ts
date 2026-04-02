"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@/types/database";
import type { User as AuthUser, Session, AuthChangeEvent } from "@supabase/supabase-js"; // eslint-disable-line @typescript-eslint/no-unused-vars

async function fetchProfile(_userId: string): Promise<User | null> {
  try {
    const res = await fetch(`/api/auth/me`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.user ?? null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let resolved = false;

    const finish = () => {
      resolved = true;
      setLoading(false);
    };

    const timeout = setTimeout(() => {
      if (!resolved) finish();
    }, 5000);

    supabase.auth.getSession().then(async ({ data }: { data: { session: Session | null } }) => {
      const session = data.session;
      if (resolved) return;
      setAuthUser(session?.user ?? null);
      if (session?.user) {
        const p = await fetchProfile(session.user.id);
        setProfile(p);
      }
      clearTimeout(timeout);
      finish();
    }).catch(() => {
      clearTimeout(timeout);
      finish();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, session: Session | null) => {
        setAuthUser(session?.user ?? null);
        if (session?.user) {
          const p = await fetchProfile(session.user.id);
          setProfile(p);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  return { authUser, profile, loading };
}
