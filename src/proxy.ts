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
  const isOnboardingRoute = request.nextUrl.pathname.startsWith("/onboarding");
  const isSignupRoute = request.nextUrl.pathname.startsWith("/signup");
  const forceAuthPage = request.nextUrl.searchParams.get("force") === "1";

  // Authenticated user on signup → redirect to onboarding
  if (isSignupRoute && user && !forceAuthPage) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  // Onboarding requires auth
  if (isOnboardingRoute && !user) {
    return NextResponse.redirect(new URL("/signup", request.url));
  }

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

  if (isAdminRoute && user) {
    const accessStatus = await getStudioAccessStatus(user.id);

    // No photographer record → redirect to onboarding
    if (accessStatus === null) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    if (accessStatus !== "active") {
      return NextResponse.redirect(new URL("/login?blocked=1", request.url));
    }
  }

  if (isLoginRoute && user && !forceAuthPage) {
    const accessStatus = await getStudioAccessStatus(user.id);

    // No photographer record → redirect to onboarding
    if (accessStatus === null) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    // Blocked / suspended → show login page with warning
    if (accessStatus !== "active") {
      return supabaseResponse;
    }

    // Active → redirect to admin
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/admin/:path*", "/platform/:path*", "/login", "/onboarding/:path*", "/signup"],
};
  async function getStudioAccessStatus(userId: string) {
    const adminClient = createAdminClient();
    const { data: photographer } = await adminClient
      .from("photographers")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (!photographer?.id) {
      return null;
    }

    const { data: billing } = await adminClient
      .from("tenant_billing_accounts")
      .select("access_status")
      .eq("photographer_id", photographer.id)
      .maybeSingle();

    return billing?.access_status || "active";
  }
