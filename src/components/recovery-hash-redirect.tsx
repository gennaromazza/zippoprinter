"use client";

import { useEffect } from "react";

export function RecoveryHashRedirect() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hash = window.location.hash;
    if (!hash) {
      return;
    }

    const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
    const isRecoveryFlow = hashParams.get("type") === "recovery";

    if (!isRecoveryFlow || window.location.pathname === "/login") {
      return;
    }

    window.location.replace(`/login?recovery=1${hash}`);
  }, []);

  return null;
}
