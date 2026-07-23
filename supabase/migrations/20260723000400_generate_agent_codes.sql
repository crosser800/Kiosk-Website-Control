create sequence if not exists public.agent_code_seq;

do $$
declare
  latest_numeric_code bigint;
begin
  select coalesce(max(substring(agent_code from '^AGT-(\d{6})$')::bigint), 0)
    into latest_numeric_code
  from public.agent_accounts
  where agent_code ~ '^AGT-\d{6}$';

  if latest_numeric_code > 0 then
    perform setval('public.agent_code_seq', latest_numeric_code, true);
  else
    perform setval('public.agent_code_seq', 1, false);
  end if;
end $$;

create or replace function public.assign_agent_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(new.agent_code, '')), '') is null then
    new.agent_code := 'AGT-' || lpad(nextval('public.agent_code_seq')::text, 6, '0');
  else
    new.agent_code := trim(new.agent_code);
  end if;

  return new;
end;
$$;

drop trigger if exists assign_agent_code on public.agent_accounts;

create trigger assign_agent_code
before insert on public.agent_accounts
for each row
execute function public.assign_agent_code();

create unique index if not exists agent_accounts_agent_code_unique_idx
on public.agent_accounts (agent_code)
where agent_code is not null;
