-- Bug tracker per fase test interno (v2.5.2)

create type public.bug_severity as enum ('low', 'medium', 'high', 'critical');
create type public.bug_status as enum ('open', 'in_progress', 'resolved', 'wont_fix', 'duplicate');

create table public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  route text,
  title text not null,
  description text,
  severity public.bug_severity not null default 'medium',
  status public.bug_status not null default 'open',
  screenshot_url text,
  user_agent text,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bug_reports_status_idx on public.bug_reports(status);
create index bug_reports_user_id_idx on public.bug_reports(user_id);
create index bug_reports_created_at_idx on public.bug_reports(created_at desc);

create trigger bug_reports_set_updated_at
  before update on public.bug_reports
  for each row execute function public.update_updated_at_column();

alter table public.bug_reports enable row level security;

create policy "users can create own bug reports"
  on public.bug_reports for insert to authenticated
  with check (user_id = auth.uid());

create policy "users can view own bug reports"
  on public.bug_reports for select to authenticated
  using (user_id = auth.uid());

create policy "admins can view all bug reports"
  on public.bug_reports for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "admins can update bug reports"
  on public.bug_reports for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "admins can delete bug reports"
  on public.bug_reports for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));
