alter table public.agent_accounts
add column if not exists must_change_password boolean not null default false;

alter table public.agent_accounts
add column if not exists password_reset_at timestamptz null;

create index if not exists agent_accounts_must_change_password_idx
on public.agent_accounts using btree (must_change_password);
