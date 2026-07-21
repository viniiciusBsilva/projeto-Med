-- Bootstrap de autenticação: clínica demo + criação automática de profile no signup.
-- Sem profile, a RLS não libera dados para o usuário logado (ver 0001_init.sql).

-- Clínica demo (tenant padrão dos primeiros usuários)
insert into public.clinics (id, name, plan, active_patient_limit)
values ('00000000-0000-0000-0000-000000000001', 'Clínica PostCare Demo', 'pro', 100)
on conflict (id) do nothing;

-- Cria o profile assim que um usuário nasce no Auth.
-- role/clinic_id vêm do raw_user_meta_data; fallback = clínica demo + staff.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid;
  v_role   public.user_role;
begin
  v_clinic := coalesce(
    nullif(new.raw_user_meta_data->>'clinic_id','')::uuid,
    '00000000-0000-0000-0000-000000000001'
  );
  v_role := coalesce(
    nullif(new.raw_user_meta_data->>'role','')::public.user_role,
    'staff'
  );

  insert into public.profiles (id, clinic_id, role, full_name)
  values (new.id, v_clinic, v_role, nullif(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: usuários já existentes sem profile ganham um (clínica demo, staff)
insert into public.profiles (id, clinic_id, role, full_name)
select u.id, '00000000-0000-0000-0000-000000000001', 'staff', nullif(u.raw_user_meta_data->>'full_name','')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
