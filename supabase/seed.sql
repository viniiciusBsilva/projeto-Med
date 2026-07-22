-- PostCare Pro — seed de exemplo. Vertical de foco: TRANSPLANTE CAPILAR (FUE).
-- Rodar com: supabase db reset (aplica migrations/ e depois este arquivo).

-- Clínica demo (também criada em 0002_auth_bootstrap_profiles.sql; idempotente aqui).
insert into clinics (id, name, plan, active_patient_limit)
values ('00000000-0000-0000-0000-000000000001', 'Clínica PostCare Demo', 'pro', 100)
on conflict (id) do nothing;

-- Médicos
insert into doctors (id, clinic_id, full_name, specialty, crm, phone, email) values
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000001','Dr. André Vasconcelos','Cirurgia capilar','CRM-SP 123456','(11) 3000-1001','andre@postcarepro.com'),
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-000000000001','Dra. Marina Teixeira','Tricologia','CRM-SP 654321','(11) 3000-1002','marina@postcarepro.com')
on conflict (id) do nothing;

-- Protocolo de transplante capilar
insert into protocols (id, clinic_id, name, specialty, duration_days, color) values
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000001','Transplante Capilar (FUE)','Transplante capilar',180,'#8B5CF6')
on conflict (id) do nothing;

insert into protocol_steps (protocol_id, day_offset, title, instructions) values
 ('00000000-0000-0000-0000-0000000000f1',0,'Dia do procedimento','Repouso com a cabeça elevada. Não toque na área receptora. Compressa fria na testa para reduzir o edema.'),
 ('00000000-0000-0000-0000-0000000000f1',1,'D+1','Pode surgir edema (inchaço) na testa. Durma com a cabeça elevada. Não coce o couro cabeludo.'),
 ('00000000-0000-0000-0000-0000000000f1',3,'D+3','Pico de edema frontal é normal. A área doadora pode repuxar. Não remova crostas.'),
 ('00000000-0000-0000-0000-0000000000f1',5,'D+5 — primeira lavagem','Lavagem delicada: shampoo neutro, sem esfregar, enxágue com água morna.'),
 ('00000000-0000-0000-0000-0000000000f1',10,'D+10 — queda das crostas','As crostas caem naturalmente com as lavagens. Não force a remoção.'),
 ('00000000-0000-0000-0000-0000000000f1',15,'D+15','Maioria das crostas caiu; o couro pode ficar rosado. Atividades leves liberadas gradualmente.'),
 ('00000000-0000-0000-0000-0000000000f1',30,'D+30 — shock loss','Queda temporária dos fios transplantados (shock loss). Esperado e reversível.'),
 ('00000000-0000-0000-0000-0000000000f1',90,'D+90','Fase de repouso folicular. Novos fios começam a nascer.'),
 ('00000000-0000-0000-0000-0000000000f1',180,'D+180','Crescimento visível. Avaliação de evolução e comparação de fotos.')
on conflict (protocol_id, day_offset) do nothing;

-- Pacientes
insert into patients (id, clinic_id, full_name, cpf, birth_date, phone, email, status, notes) values
 ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000001','Rafael Nunes Andrade','111.222.333-44','1986-02-10','(11) 98888-1001','rafael.andrade@email.com','active','FUE 3200 folículos. Área frontal e coroa.'),
 ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-000000000001','Bruno Carvalho Dias','222.333.444-55','1990-08-21','(11) 98888-1002','bruno.dias@email.com','active','FUE 2500 folículos. Entradas frontais.'),
 ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-000000000001','Thiago Moreira Pinto','333.444.555-66','1983-12-03','(11) 98888-1003','thiago.pinto@email.com','active','FUE 4000 folículos. Coroa e meia-cabeça.'),
 ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-000000000001','Marcelo Rocha Lima','444.555.666-77','1979-05-17','(11) 98888-1004','marcelo.lima@email.com','active','FUE 1800 folículos. Retoque de linha frontal.'),
 ('00000000-0000-0000-0000-0000000000e5','00000000-0000-0000-0000-000000000001','Diego Santos Barbosa','555.666.777-88','1994-09-29','(11) 98888-1005','diego.barbosa@email.com','active','FUE 3000 folículos. Fase de shock loss.')
on conflict (id) do nothing;

-- Cirurgias (todas transplante capilar FUE), datas relativas a hoje
insert into surgeries (id, clinic_id, patient_id, protocol_id, surgery_type, date, hospital, surgeon, status) values
 ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000f1','Transplante capilar FUE',current_date-3,'Clínica Capilar Prime','Dr. André Vasconcelos','active'),
 ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000f1','Transplante capilar FUE',current_date-12,'Clínica Capilar Prime','Dra. Marina Teixeira','active'),
 ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000f1','Transplante capilar FUE',current_date-7,'HairMed Clínica','Dr. André Vasconcelos','active'),
 ('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000f1','Transplante capilar FUE',current_date-1,'HairMed Clínica','Dra. Marina Teixeira','active'),
 ('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e5','00000000-0000-0000-0000-0000000000f1','Transplante capilar FUE',current_date-35,'Clínica Capilar Prime','Dr. André Vasconcelos','active')
on conflict (id) do nothing;

-- Check-ins com sinais do couro (o trigger calcula D+n e gera alertas).
-- Inseridos via SQL direto (bypassa RLS no seed). Rafael (vermelhidão+dor) e Marcelo (sangramento) => critical.
insert into checkins (surgery_id, pain, fever, bleeding, swelling, redness, itching, crusts, feeling, notes) values
 ('00000000-0000-0000-0000-0000000000d1', 6, false, false, true,  true,  false, false, 'regular','Testa inchada e área receptora avermelhada.'),
 ('00000000-0000-0000-0000-0000000000d2', 3, false, false, false, false, true,  true,  'bem',    'Bastante coceira e crostas caindo.'),
 ('00000000-0000-0000-0000-0000000000d3', 2, false, false, true,  false, false, false, 'bem',    'Apenas leve edema, evoluindo bem.'),
 ('00000000-0000-0000-0000-0000000000d4', 4, false, true,  false, false, false, false, 'regular','Pequeno sangramento na área doadora.'),
 ('00000000-0000-0000-0000-0000000000d5', 1, false, false, false, false, true,  false, 'regular','Notando queda de fios (shock loss), coceira leve.');

-- Liga as cirurgias aos médicos cadastrados.
update surgeries set doctor_id = '00000000-0000-0000-0000-0000000000c1' where surgeon = 'Dr. André Vasconcelos';
update surgeries set doctor_id = '00000000-0000-0000-0000-0000000000c2' where surgeon = 'Dra. Marina Teixeira';

-- Respostas prontas (contexto capilar)
insert into canned_responses (clinic_id, title, body) values
 ('00000000-0000-0000-0000-000000000001','Edema frontal','O inchaço na testa nos primeiros dias é comum e some sozinho. Mantenha a cabeça elevada e use compressa fria na testa (nunca na área transplantada).'),
 ('00000000-0000-0000-0000-000000000001','Queda de crostas','As crostas caem sozinhas com as lavagens delicadas a partir do 10º dia. Não force nem coce para não deslocar os folículos.'),
 ('00000000-0000-0000-0000-000000000001','Shock loss','A queda dos fios transplantados por volta do 1º mês é esperada e temporária. Os folículos voltam a crescer nos meses seguintes.'),
 ('00000000-0000-0000-0000-000000000001','Sinais de alerta','Vermelhidão intensa com dor, pus, febre ou sangramento persistente: entre em contato imediatamente.');
