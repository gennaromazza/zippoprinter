export interface QuantityPriceTier {
  min_quantity: number;
  unit_price_cents: number;
}

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
  amount_paid_cents: number;
  amount_due_cents: number;
  stripe_payment_intent_id?: string | null;
  stripe_checkout_session_id?: string | null;
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
