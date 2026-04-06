"use client";

import { useMemo } from "react";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function RecoveryHashRedirect() {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hash = window.location.hash;
    if (!hash) {
      return;
    }

    const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
    const errorCode = hashParams.get("error_code");
    const errorDescription = hashParams.get("error_description");
    const flowType = hashParams.get("type");
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (errorCode) {
      const next = new URLSearchParams();
      next.set("authError", errorCode);
      if (errorDescription) {
        next.set("authErrorDescription", errorDescription);
      }
      window.location.replace(`/login?${next.toString()}`);
      return;
    }

    if (!accessToken || !refreshToken) {
      return;
    }

    // Recovery links must always land on login reset UI.
    if (flowType === "recovery" && window.location.pathname !== "/login") {
      window.location.replace(`/login?recovery=1${hash}`);
      return;
    }

    void supabase.auth
      .setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      .then(({ error }) => {
        if (error) {
          window.location.replace(`/login${hash}`);
          return;
        }

        const cleanUrl = `${window.location.pathname}${window.location.search}`;
        window.location.replace(cleanUrl || "/");
      });
  }, [supabase]);

  return null;
}
