-- Código de convite por clínica: o profissional compartilha com seus pacientes,
-- que usam no cadastro do app para entrar na clínica certa (em vez da demo).

alter table clinics add column if not exists invite_code text;

-- Novas clínicas ganham um código automaticamente (6 chars, base gen_random_uuid).
alter table clinics alter column invite_code set default upper(substr(md5(gen_random_uuid()::text), 1, 6));

-- Backfill das clínicas existentes.
update clinics set invite_code = upper(substr(md5(gen_random_uuid()::text), 1, 6)) where invite_code is null;

-- Unicidade (permite resolver a clínica pelo código).
create unique index if not exists clinics_invite_code_key on clinics(invite_code);
