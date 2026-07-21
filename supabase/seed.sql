-- PostCare Pro — seed de exemplo (clínica demo + protocolos + pacientes)
-- Rodar com: supabase db reset  (aplica migrations/ e depois este arquivo)

-- Clínica demo (id fixo). Já criada em 0002_auth_bootstrap_profiles.sql; idempotente aqui.
insert into clinics (id, name, plan, active_patient_limit)
values ('00000000-0000-0000-0000-000000000001', 'Clínica PostCare Demo', 'pro', 100)
on conflict (id) do nothing;

-- Protocolos
insert into protocols (id, clinic_id, name, specialty, duration_days, color) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'Lipoaspiração', 'Cirurgia plástica', 30, '#2563EB'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001', 'Implante dentário', 'Odontologia',       21, '#16A34A');

-- Orientações por dia (D+n) do protocolo de Lipoaspiração
insert into protocol_steps (protocol_id, day_offset, title, instructions) values
  ('00000000-0000-0000-0000-0000000000a1', 0, 'Dia da cirurgia', 'Repouso absoluto. Use a cinta modeladora conforme orientado. Hidrate-se.'),
  ('00000000-0000-0000-0000-0000000000a1', 1, 'D+1', 'Repouso relativo. Observe curativos. Tome a medicação prescrita nos horários.'),
  ('00000000-0000-0000-0000-0000000000a1', 3, 'D+3', 'Inicie caminhadas leves em casa. Mantenha a cinta 24h. Registre dor e inchaço no check-in.'),
  ('00000000-0000-0000-0000-0000000000a1', 7, 'D+7', 'Retorno para avaliação. Drenagem linfática pode ser liberada pela equipe.'),
  ('00000000-0000-0000-0000-0000000000a1', 15, 'D+15', 'Retomada gradual de atividades leves. Evite esforço e exposição solar na área.'),
  ('00000000-0000-0000-0000-0000000000a1', 30, 'D+30', 'Avaliação de alta do acompanhamento. Liberação conforme evolução.');

-- Pacientes
insert into patients (id, clinic_id, full_name, cpf, phone, email, status) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000001', 'Mariana Costa Oliveira', '123.456.789-00', '(11) 99999-0001', 'mariana@example.com', 'active'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000001', 'João Pedro Almeida',    '987.654.321-00', '(11) 99999-0002', 'joao@example.com',    'active');

-- Cirurgias (base do D+n) — datas relativas a hoje
insert into surgeries (id, clinic_id, patient_id, protocol_id, surgery_type, date, hospital, surgeon, status) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'Lipoaspiração',    (current_date - 12), 'Hospital São Lucas', 'Dr. Ricardo Nunes', 'active'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a2', 'Implante dentário', (current_date - 3),  'Clínica Odonto Vida', 'Dra. Paula Reis',  'active');

-- Um check-in de exemplo com sinais de risco (dispara alerta 'critical' pelo trigger)
-- Inserido via SQL direto (bypassa RLS no seed). day_number e alerta são calculados pelos triggers.
insert into checkins (surgery_id, pain, fever, bleeding, swelling, feeling, notes)
values ('00000000-0000-0000-0000-0000000000c1', 7, true, false, true, 'mal', 'Sinto febre desde ontem e a área está mais inchada.');
