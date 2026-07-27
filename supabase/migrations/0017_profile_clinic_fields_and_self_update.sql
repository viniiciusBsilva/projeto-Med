-- "Meu perfil" + "Dados da clínica": colunas de contato + RPCs seguras de auto-edição.

-- 1) Colunas de contato
alter table profiles add column if not exists phone text;
alter table clinics  add column if not exists cnpj    text;
alter table clinics  add column if not exists phone   text;
alter table clinics  add column if not exists email   text;
alter table clinics  add column if not exists address text;

-- 2) Atualiza o PRÓPRIO perfil (só nome/telefone — nunca role/clinic_id/is_superadmin).
--    security definer + escopo em auth.uid() evita escalonamento de privilégio.
create or replace function update_my_profile(p_full_name text, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles
     set full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
         phone     = p_phone
   where id = auth.uid();
end $$;

-- 3) Atualiza a clínica do PRÓPRIO usuário (só dados de negócio; nunca plan/limite/id).
--    Só staff da clínica; paciente não pode.
create or replace function update_my_clinic(
  p_name text, p_cnpj text, p_phone text, p_email text, p_address text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid;
  v_role   user_role;
begin
  select clinic_id, role into v_clinic, v_role from profiles where id = auth.uid();
  if v_clinic is null or v_role <> 'staff' then
    raise exception 'Sem permissão para editar a clínica.';
  end if;
  update clinics
     set name    = coalesce(nullif(btrim(p_name), ''), name),
         cnpj    = p_cnpj,
         phone   = p_phone,
         email   = p_email,
         address = p_address
   where id = v_clinic;
end $$;

grant execute on function update_my_profile(text, text) to authenticated;
grant execute on function update_my_clinic(text, text, text, text, text) to authenticated;
