import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Public routes that don't require auth
  const publicRoutes = ["/login", "/forgot-password"];
  const isPublicRoute = publicRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isPublicRoute) {
    // Fetch user role to redirect appropriately
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    const url = request.nextUrl.clone();
    if (profile?.role === "admin") {
      url.pathname = "/admin/dashboard";
    } else if (profile?.role === "driver") {
      url.pathname = "/driver";
    } else {
      url.pathname = "/dashboard";
    }
    return NextResponse.redirect(url);
  }

  // Role-based route protection
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    const pathname = request.nextUrl.pathname;

    if (pathname.startsWith("/admin") && profile?.role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = profile?.role === "driver" ? "/driver" : "/dashboard";
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/driver") && profile?.role !== "driver" && profile?.role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = profile?.role === "admin" ? "/admin/dashboard" : "/dashboard";
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/dashboard") && profile?.role === "driver") {
      const url = request.nextUrl.clone();
      url.pathname = "/driver";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
