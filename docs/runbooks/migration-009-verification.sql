-- Verify table existence
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'tenant_billing_accounts',
    'subscription_plans',
    'tenant_subscriptions',
    'tenant_entitlements',
    'billing_events',
    'tenant_domains',
    'audit_logs'
  )
order by table_name;

-- Verify RLS enabled
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'tenant_billing_accounts',
    'subscription_plans',
    'tenant_subscriptions',
    'tenant_entitlements',
    'billing_events',
    'tenant_domains',
    'audit_logs'
  )
order by c.relname;

-- Verify policies created
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'tenant_billing_accounts',
    'subscription_plans',
    'tenant_subscriptions',
    'tenant_entitlements',
    'billing_events',
    'tenant_domains',
    'audit_logs'
  )
order by tablename, policyname;

-- Verify seeded plans
select code, billing_mode, price_cents, currency, is_active
from subscription_plans
where code in ('starter_monthly', 'starter_yearly', 'lifetime_buyout')
order by code;

-- Verify backfill counts
select
  (select count(*) from photographers) as photographers_count,
  (select count(*) from tenant_billing_accounts) as tenant_billing_accounts_count,
  (select count(*) from tenant_entitlements) as tenant_entitlements_count,
  (select count(*) from tenant_subscriptions) as tenant_subscriptions_count;
