import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";

function isPlatformDashboardEnabled() {
  if (process.env.ENABLE_PLATFORM_DASHBOARD === "true") {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");
  const isPlatformRoute = request.nextUrl.pathname.startsWith("/platform");
  const isLoginRoute = request.nextUrl.pathname.startsWith("/login");

  if ((isAdminRoute || isPlatformRoute) && !user && !isLoginRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isPlatformRoute) {
    if (!isPlatformDashboardEnabled()) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const adminClient = createAdminClient();
    const { data: platformAdmin } = await adminClient
      .from("platform_admins")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!platformAdmin?.id) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  if (isLoginRoute && user) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/admin/:path*", "/platform/:path*", "/login"],
};
