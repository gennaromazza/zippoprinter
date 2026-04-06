import "server-only";

export interface StepUpCheckResult {
  ok: boolean;
  reason?: "missing_config" | "missing_token" | "invalid_token";
}

export function requireOwnerStepUp(request: Request): StepUpCheckResult {
  const expected = (process.env.OWNER_STEP_UP_TOKEN || "").trim();
  if (!expected) {
    return { ok: false, reason: "missing_config" };
  }

  const provided = (request.headers.get("x-owner-step-up-token") || "").trim();
  if (!provided) {
    return { ok: false, reason: "missing_token" };
  }

  if (provided !== expected) {
    return { ok: false, reason: "invalid_token" };
  }

  return { ok: true };
}

export function getStepUpErrorMessage(reason?: StepUpCheckResult["reason"]) {
  switch (reason) {
    case "missing_config":
      return "Step-up auth non configurata (OWNER_STEP_UP_TOKEN mancante).";
    case "missing_token":
      return "Step-up auth richiesta: invia x-owner-step-up-token.";
    case "invalid_token":
      return "Step-up token non valido.";
    default:
      return "Step-up auth richiesta.";
  }
}
