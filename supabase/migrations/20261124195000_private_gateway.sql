begin;
create table if not exists rp_financeira.gateway_config (
  singleton boolean primary key check (singleton),
  secret_hash bytea not null
);
alter table rp_financeira.gateway_config enable row level security;
revoke all on rp_financeira.gateway_config from public, anon, authenticated;

create or replace function public.rp_financeira_gateway(action text, payload jsonb, backend_secret text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  result jsonb;
  affected integer;
begin
  if backend_secret is null or length(backend_secret) <> 64 or not exists (
    select 1 from rp_financeira.gateway_config where singleton
      and secret_hash = sha256(convert_to(backend_secret, 'UTF8'))
  ) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  case action
    when 'health' then
      perform 1 from rp_financeira.panel_users limit 1;
      perform 1 from rp_financeira.contracts limit 1;
      perform 1 from rp_financeira.visits limit 1;
      return 'true'::jsonb;
    when 'user_id' then
      select record into result from rp_financeira.panel_users where id = payload->>'id';
    when 'user_name' then
      select record into result from rp_financeira.panel_users where username = payload->>'username';
    when 'agent' then
      select record into result from rp_financeira.panel_users
      where agent_code = payload->>'code' and record->>'active' = 'true';
    when 'users' then
      select coalesce(jsonb_agg(record order by record->>'createdAt' desc), '[]'::jsonb)
        into result from rp_financeira.panel_users;
    when 'user_add' then
      insert into rp_financeira.panel_users (id, username, agent_code, record)
      values (payload->>'id', payload->>'username', payload->>'agentCode', payload)
      on conflict do nothing;
      get diagnostics affected = row_count;
      return to_jsonb(affected = 1);
    when 'user_update' then
      update rp_financeira.panel_users set record = record || (payload->'changes')
      where id = payload->>'id' returning record into result;
    when 'user_delete' then
      delete from rp_financeira.panel_users where id = payload->>'id' and record->>'role' = 'employee';
    when 'visit_add' then
      insert into rp_financeira.visits (id, agent_id, visited_at, record)
      values (payload->>'id', payload->>'agentId', (payload->>'visitedAt')::timestamptz, payload);
    when 'contract_add' then
      insert into rp_financeira.contracts (protocol, agent_id, signed_at, record)
      values (payload->>'protocol', payload->>'agentId', (payload->>'signedAt')::timestamptz, payload);
    when 'contract' then
      select record into result from rp_financeira.contracts where protocol = payload->>'protocol';
    when 'activity' then
      select jsonb_build_object(
        'visits', (select coalesce(jsonb_agg(record), '[]'::jsonb) from rp_financeira.visits
          where visited_at between (payload->>'begin')::timestamptz and (payload->>'end')::timestamptz
            and (payload->>'agent' is null or agent_id = payload->>'agent')),
        'contracts', (select coalesce(jsonb_agg(record), '[]'::jsonb) from rp_financeira.contracts
          where signed_at between (payload->>'begin')::timestamptz and (payload->>'end')::timestamptz
            and (payload->>'agent' is null or agent_id = payload->>'agent'))
      ) into result;
    else
      raise exception 'Unknown operation' using errcode = '22023';
  end case;
  return result;
end
$$;
revoke all on function public.rp_financeira_gateway(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.rp_financeira_gateway(text, jsonb, text) to anon;
notify pgrst, 'reload schema';
commit;
