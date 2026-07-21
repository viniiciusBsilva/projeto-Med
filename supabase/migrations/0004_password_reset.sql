-- Códigos OTP de recuperação de senha. Acesso apenas via service_role (Edge Functions).
create table password_reset_codes (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  user_id    uuid,
  code_hash  text not null,
  expires_at timestamptz not null,
  used       boolean not null default false,
  attempts   int not null default 0,
  created_at timestamptz not null default now()
);

create index on password_reset_codes (lower(email), created_at desc);

-- RLS habilitada SEM policies: bloqueia todo acesso via anon/authenticated.
-- A service_role (usada nas Edge Functions) ignora RLS.
alter table password_reset_codes enable row level security;

-- Descobre o id do usuário pelo e-mail. Usada só pelas Edge Functions (service_role).
create or replace function public.user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;

-- Trava o acesso: o grant padrão é para PUBLIC (inclui anon/authenticated) -> revogar de PUBLIC
-- e conceder apenas à service_role, evitando enumeração de e-mails pela API REST.
revoke execute on function public.user_id_by_email(text) from public;
grant  execute on function public.user_id_by_email(text) to service_role;
