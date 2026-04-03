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

export function isMissingExportSchemaError(message: string | undefined | null) {
  if (!message) {
    return false;
  }

  return (
    message.includes("order_exports") ||
    message.includes("export_sftp_enabled") ||
    message.includes("export_sftp_host") ||
    message.includes("export_sftp_port") ||
    message.includes("export_sftp_username") ||
    message.includes("export_sftp_remote_path") ||
    message.includes("export_sftp_auth_type") ||
    message.includes("export_sftp_password_encrypted") ||
    message.includes("export_sftp_private_key_encrypted") ||
    message.includes("export_links_expiry_minutes")
  );
}

export function isMissingQuantityPricingSchemaError(message: string | undefined | null) {
  if (!message) {
    return false;
  }

  return message.includes("quantity_price_tiers");
}
