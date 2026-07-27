-- Admin geral (super-admin) do SaaS: enxerga e gerencia TODAS as clínicas.
-- Abordagem: flag em profiles + função is_superadmin() + policies ADITIVAS (permissivas)
-- por tabela — não altera o isolamento por clínica do médico (role='staff').

alter table profiles add column if not exists is_superadmin boolean not null default false;

create or replace function is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_superadmin from profiles where id = auth.uid()), false)
$$;

-- Policy aditiva de super-admin em cada tabela-tenant (idempotente).
do $$
declare
  t text;
  tables text[] := array[
    'clinics','profiles','patients','surgeries','checkins','alerts','messages',
    'protocols','protocol_steps','appointments','notifications','canned_responses',
    'doctors','surgery_intake','checklist_items','care_tips','checklist_completions'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I', t || '_superadmin', t);
    execute format(
      'create policy %I on public.%I for all using (is_superadmin()) with check (is_superadmin())',
      t || '_superadmin', t
    );
  end loop;
end $$;

-- Storage: super-admin acessa fotos e anexos de qualquer clínica.
drop policy if exists storage_objects_superadmin on storage.objects;
create policy storage_objects_superadmin on storage.objects for all to authenticated
  using (is_superadmin() and bucket_id in ('patient-photos','chat-attachments'))
  with check (is_superadmin() and bucket_id in ('patient-photos','chat-attachments'));

-- Marca as contas operadoras atuais como admin geral.
update profiles set is_superadmin = true
where id in (select id from auth.users where email in ('admin@postcarepro.com','teste@teste.com'));
