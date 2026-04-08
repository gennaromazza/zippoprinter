export interface QuantityPriceTier {
  min_quantity: number;
  unit_price_cents: number;
}

export type StorefrontLayoutPreset =
  | "classic"
  | "hero_left"
  | "hero_center"
  | "hero_split";
export type StorefrontBgScope = "header" | "page";
export type StorefrontCtaAlign = "left" | "center" | "right";

export interface Photographer {
  id: string;
  email: string;
  auth_user_id?: string | null;
  name: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  logo_url: string | null;
  logo_position_x?: number | null;
  logo_position_y?: number | null;
  website_url?: string | null;
  instagram_url?: string | null;
  brand_color: string | null;
  custom_welcome_text: string | null;
  storefront_theme_enabled?: boolean | null;
  storefront_layout_preset?: StorefrontLayoutPreset | null;
  storefront_bg_image_url?: string | null;
  storefront_bg_scope?: StorefrontBgScope | null;
  storefront_bg_overlay_opacity?: number | null;
  storefront_color_primary?: string | null;
  storefront_color_secondary?: string | null;
  storefront_color_text?: string | null;
  storefront_cta_align?: StorefrontCtaAlign | null;
  payment_mode?: PaymentMode | null;
  deposit_type?: DepositType | null;
  deposit_value?: number | null;
  export_sftp_enabled?: boolean | null;
  export_sftp_host?: string | null;
  export_sftp_port?: number | null;
  export_sftp_username?: string | null;
  export_sftp_remote_path?: string | null;
  export_sftp_auth_type?: SftpAuthType | null;
  export_sftp_password_encrypted?: string | null;
  export_sftp_private_key_encrypted?: string | null;
  export_links_expiry_minutes?: number | null;
}

export type ConnectStatus =
  | "not_connected"
  | "pending"
  | "connected"
  | "restricted"
  | "disabled";

export type StripeConnectStatusTone = "red" | "orange" | "green";

export interface StripeConnectStatusCard {
  tone: StripeConnectStatusTone;
  title: string;
  message: string;
  actionLabel: string | null;
  requirementsCurrentlyDue: number;
  requirementsDisabledReason: string | null;
}

export type StudioAccessStatus = "active" | "temporarily_blocked" | "suspended";

export interface TenantBillingAccount {
  id: string;
  photographer_id: string;
  stripe_connect_account_id?: string | null;
  stripe_customer_id?: string | null;
  connect_status: ConnectStatus;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  onboarding_completed_at?: string | null;
  legacy_checkout_enabled: boolean;
  access_status: StudioAccessStatus;
  access_status_reason?: string | null;
  access_status_updated_at: string;
  access_status_updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type SubscriptionBillingMode = "monthly" | "yearly" | "lifetime";

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  billing_mode: SubscriptionBillingMode;
  price_cents: number;
  currency: string;
  is_active: boolean;
  feature_caps?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type TenantSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "suspended"
  | "lifetime";

export interface TenantSubscription {
  id: string;
  photographer_id: string;
  plan_id?: string | null;
  status: TenantSubscriptionStatus;
  provider: "stripe" | "manual";
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  trial_end?: string | null;
  cancel_at_period_end: boolean;
  canceled_at?: string | null;
  is_lifetime: boolean;
  latest_invoice_id?: string | null;
  grace_period_ends_at?: string | null;
  last_payment_failed_at?: string | null;
  collection_state?: "current" | "grace" | "delinquent" | "recovered";
  created_at: string;
  updated_at: string;
}

export interface TenantEntitlement {
  photographer_id: string;
  can_accept_online_payments: boolean;
  can_use_custom_domain: boolean;
  max_monthly_orders?: number | null;
  max_storage_gb?: number | null;
  features?: Record<string, unknown>;
  updated_at: string;
}

export type DomainVerificationStatus = "pending" | "verified" | "failed";
export type DomainSslStatus = "pending" | "ready" | "failed";

export interface TenantDomain {
  id: string;
  photographer_id: string;
  domain: string;
  verification_status: DomainVerificationStatus;
  ssl_status: DomainSslStatus;
  is_active: boolean;
  dns_target?: string | null;
  provider_record?: Record<string, unknown>;
  last_error?: string | null;
  verified_at?: string | null;
  activated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrintFormat {
  id: string;
  photographer_id?: string | null;
  name: string;
  width_cm: number;
  height_cm: number;
  price_cents: number;
  quantity_price_tiers?: QuantityPriceTier[] | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  print_format_id: string | null;
  format_name: string;
  format_price_cents: number;
  quantity: number;
  storage_path: string;
  original_filename: string | null;
  created_at?: string;
}

export interface Order {
  id: string;
  photographer_id: string | null;
  customer_id?: string | null;
  customer_email: string;
  customer_name: string | null;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  customer_phone: string | null;
  status: OrderStatus;
  total_cents: number;
  payment_status: OrderPaymentStatus;
  payment_mode_snapshot?: PaymentMode | null;
  coupon_id?: string | null;
  coupon_code?: string | null;
  coupon_discount_cents?: number;
  total_before_discount_cents?: number | null;
  amount_paid_cents: number;
  amount_due_cents: number;
  stripe_payment_intent_id?: string | null;
  stripe_checkout_session_id?: string | null;
  stripe_connected_account_id?: string | null;
  notes?: string | null;
  created_at: string;
  paid_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  order_items?: OrderItem[];
}

export type PaymentMode = "online_full" | "deposit_plus_studio" | "pay_in_store";

export type DepositType = "percentage" | "fixed";
export type SftpAuthType = "password" | "private_key";

export type OrderPaymentStatus =
  | "unpaid"
  | "partial"
  | "paid"
  | "not_required"
  | "cancelled";

export type OrderStatus =
  | "pending"
  | "paid"
  | "printing"
  | "ready"
  | "completed"
  | "cancelled";

export type OrderExportStatus = "pending" | "running" | "completed" | "failed";

export interface OrderExportJob {
  id: string;
  order_id: string;
  photographer_id: string;
  triggered_by?: string | null;
  status: OrderExportStatus;
  progress: number;
  total_files: number;
  processed_files: number;
  attempt_count: number;
  error?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at: string;
}

export type PlatformAdminRole = "owner_admin" | "owner_support" | "owner_readonly";

export interface PlatformAdmin {
  id: string;
  auth_user_id: string;
  email: string;
  is_active: boolean;
  role: PlatformAdminRole;
  created_at: string;
  updated_at: string;
}

export interface PlatformKPI {
  generated_at: string;
  tenants_total: number;
  tenants_active: number;
  tenants_trialing: number;
  tenants_past_due: number;
  tenants_suspended: number;
  connect_connected: number;
  connect_pending: number;
  connect_restricted: number;
  domains_active: number;
  domains_pending: number;
  domains_failed: number;
  webhook_events_last_24h: number;
  webhook_unprocessed_over_10m: number;
}

export interface PlatformTenantRow {
  photographer_id: string;
  name: string | null;
  email: string;
  created_at: string;
  subscription_status: TenantSubscriptionStatus;
  subscription_plan_code: string | null;
  subscription_period_end: string | null;
  connect_status: ConnectStatus | null;
  connect_ready: boolean;
  access_status: StudioAccessStatus;
  primary_domain: string | null;
  domain_verification_status: DomainVerificationStatus | null;
  domain_ssl_status: DomainSslStatus | null;
  domain_active: boolean | null;
  last_event_type: string | null;
  last_event_at: string | null;
}

export type PlatformAlertSeverity = "critical" | "warning" | "info";
export type PlatformAlertStatus = "open" | "acknowledged";

export interface PlatformAlert {
  alert_key: string;
  photographer_id: string | null;
  severity: PlatformAlertSeverity;
  alert_type: string;
  message: string;
  created_at: string;
  runbook_path: string;
  status: PlatformAlertStatus;
}

export interface PlatformEvent {
  event_id: string;
  source: "stripe_order" | "stripe_platform" | "domain" | "manual";
  event_type: string;
  photographer_id: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface PlatformSupportAction {
  id: string;
  photographer_id: string;
  actor_user_id: string | null;
  action_type: "password_reset_email" | "access_status_update";
  outcome: "success" | "rate_limited" | "invalid_state" | "failed";
  reason: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProcessAuditEvent {
  event_id: string;
  occurred_at: string;
  actor_type: "tenant" | "owner" | "system" | "stripe_webhook";
  actor_id: string | null;
  tenant_id: string | null;
  process_area:
    | "subscription"
    | "invoice"
    | "entitlement"
    | "access"
    | "webhook"
    | "reconcile"
    | "override";
  action: string;
  status: "started" | "succeeded" | "failed" | "rolled_back";
  correlation_id: string;
  idempotency_key: string | null;
  source: string;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}
