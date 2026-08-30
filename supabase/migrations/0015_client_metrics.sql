-- supabase/migrations/0015_client_metrics.sql

create table if not exists public.client_metric_catalog (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  metric_key text not null,
  label text not null,
  unit text not null default '',
  sort_order integer not null default 0,
  unique (channel, metric_key)
);

alter table public.client_metric_catalog enable row level security;

drop policy if exists "client_metric_catalog_select_authenticated" on public.client_metric_catalog;
create policy "client_metric_catalog_select_authenticated" on public.client_metric_catalog
  for select to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active));

insert into public.client_metric_catalog (channel, metric_key, label, unit, sort_order) values
  ('SEO', 'organic_traffic', 'Organic traffic', 'sessions', 1),
  ('SEO', 'avg_keyword_position', 'Average keyword position', 'position', 2),
  ('SEO', 'keywords_top_10', 'Keywords ranking in top 10', 'keywords', 3),
  ('SEO', 'backlinks', 'Backlinks', 'links', 4),
  ('SEO', 'domain_authority', 'Domain authority', 'score', 5),
  ('SEO', 'organic_conversions', 'Organic conversions', 'conversions', 6),

  ('Google Ads', 'spend', 'Spend', '$', 1),
  ('Google Ads', 'impressions', 'Impressions', 'impressions', 2),
  ('Google Ads', 'clicks', 'Clicks', 'clicks', 3),
  ('Google Ads', 'ctr', 'CTR', '%', 4),
  ('Google Ads', 'cpc', 'CPC', '$', 5),
  ('Google Ads', 'cpl', 'CPL', '$', 6),
  ('Google Ads', 'conversions', 'Conversions', 'conversions', 7),
  ('Google Ads', 'conversion_rate', 'Conversion rate', '%', 8),
  ('Google Ads', 'roas', 'ROAS', 'x', 9),

  ('Meta Ads', 'spend', 'Spend', '$', 1),
  ('Meta Ads', 'impressions', 'Impressions', 'impressions', 2),
  ('Meta Ads', 'reach', 'Reach', 'people', 3),
  ('Meta Ads', 'clicks', 'Clicks', 'clicks', 4),
  ('Meta Ads', 'ctr', 'CTR', '%', 5),
  ('Meta Ads', 'cpc', 'CPC', '$', 6),
  ('Meta Ads', 'cpl', 'CPL', '$', 7),
  ('Meta Ads', 'conversions', 'Conversions', 'conversions', 8),
  ('Meta Ads', 'conversion_rate', 'Conversion rate', '%', 9),
  ('Meta Ads', 'roas', 'ROAS', 'x', 10),

  ('LinkedIn Ads', 'spend', 'Spend', '$', 1),
  ('LinkedIn Ads', 'impressions', 'Impressions', 'impressions', 2),
  ('LinkedIn Ads', 'clicks', 'Clicks', 'clicks', 3),
  ('LinkedIn Ads', 'ctr', 'CTR', '%', 4),
  ('LinkedIn Ads', 'cpc', 'CPC', '$', 5),
  ('LinkedIn Ads', 'cpl', 'CPL', '$', 6),
  ('LinkedIn Ads', 'leads', 'Leads', 'leads', 7),

  ('Email', 'emails_sent', 'Emails sent', 'emails', 1),
  ('Email', 'open_rate', 'Open rate', '%', 2),
  ('Email', 'click_rate', 'Click rate', '%', 3),
  ('Email', 'unsubscribe_rate', 'Unsubscribe rate', '%', 4),
  ('Email', 'conversions', 'Conversions', 'conversions', 5),

  ('Social', 'followers', 'Followers', 'followers', 1),
  ('Social', 'follower_growth', 'Follower growth', 'followers', 2),
  ('Social', 'engagement_rate', 'Engagement rate', '%', 3),
  ('Social', 'impressions', 'Impressions', 'impressions', 4),
  ('Social', 'posts_published', 'Posts published', 'posts', 5),

  ('Content', 'posts_published', 'Posts published', 'posts', 1),
  ('Content', 'page_views', 'Page views', 'views', 2),
  ('Content', 'avg_time_on_page', 'Average time on page', 'seconds', 3),
  ('Content', 'conversions', 'Conversions', 'conversions', 4),

  ('Web/CRO', 'sessions', 'Sessions', 'sessions', 1),
  ('Web/CRO', 'bounce_rate', 'Bounce rate', '%', 2),
  ('Web/CRO', 'conversion_rate', 'Conversion rate', '%', 3),
  ('Web/CRO', 'leads', 'Leads', 'leads', 4),
  ('Web/CRO', 'avg_session_duration', 'Average session duration', 'seconds', 5);

create table if not exists public.client_metrics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  period date not null,
  channel text not null,
  metric_key text not null default 'custom',
  metric_label text not null,
  value numeric not null,
  unit text not null default '',
  notes text not null default '',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, period, channel, metric_label)
);

alter table public.client_metrics enable row level security;

drop policy if exists "client_metrics_all_employees" on public.client_metrics;
create policy "client_metrics_all_employees" on public.client_metrics
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active));
