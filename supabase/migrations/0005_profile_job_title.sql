-- Rótulo de função/permissão exibido na equipe (não é controle de acesso granular — fase 2).
alter table profiles add column if not exists job_title text;

-- Trigger passa a gravar job_title vindo do metadata (create-user).
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

  insert into public.profiles (id, clinic_id, role, full_name, job_title)
  values (
    new.id, v_clinic, v_role,
    nullif(new.raw_user_meta_data->>'full_name',''),
    nullif(new.raw_user_meta_data->>'job_title','')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
