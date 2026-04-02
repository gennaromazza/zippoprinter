export function isMissingPaymentSchemaError(message: string | undefined | null) {
  if (!message) {
    return false;
  }

  return (
    message.includes("amount_due_cents") ||
    message.includes("amount_paid_cents") ||
    message.includes("payment_status") ||
    message.includes("payment_mode_snapshot") ||
    message.includes("payment_mode") ||
    message.includes("deposit_type") ||
    message.includes("deposit_value")
  );
}
