-- Conteúdo inicial de checklist e dicas para a clínica demo.
-- Pós-operatório = lista de transplante capilar fornecida; pré-operatório = genérico (ajustável).
-- Idempotente: limpa o conteúdo da clínica demo antes de reinserir.

do $$
declare
  c uuid := '00000000-0000-0000-0000-000000000001';
begin
  delete from checklist_items where clinic_id = c;
  delete from care_tips        where clinic_id = c;

  -- Checklist PÓS-OP (marcável a cada dia)
  insert into checklist_items (clinic_id, phase, sort_order, text) values
    (c, 'postop', 1, 'Dormi com a cabeça elevada (travesseiro fornecido)'),
    (c, 'postop', 2, 'Usei as medicações prescritas pela equipe'),
    (c, 'postop', 3, 'Evitei abaixar a cabeça e esforços físicos'),
    (c, 'postop', 4, 'Mantive o couro cabeludo limpo e protegido do sol'),
    (c, 'postop', 5, 'Evitei sol, praia, piscina, rio e sauna'),
    (c, 'postop', 6, 'Evitei alimentos que causam inflamação'),
    (c, 'postop', 7, 'Não molhei a cabeça no chuveiro (primeiros 7 dias)');

  -- Checklist PRÉ-OP (genérico)
  insert into checklist_items (clinic_id, phase, sort_order, text) values
    (c, 'preop', 1, 'Segui o jejum conforme orientação (véspera)'),
    (c, 'preop', 2, 'Exames pré-operatórios em dia'),
    (c, 'preop', 3, 'Suspendi medicações conforme orientação médica'),
    (c, 'preop', 4, 'Evitei álcool e cigarro'),
    (c, 'preop', 5, 'Lavei o cabelo conforme orientação (véspera)'),
    (c, 'preop', 6, 'Organizei transporte e acompanhante'),
    (c, 'preop', 7, 'Confirmei horário e local do procedimento');

  -- Dicas diárias PÓS-OP (rotacionadas pelo job)
  insert into care_tips (clinic_id, phase, sort_order, body) values
    (c, 'postop', 1,  'A primeira lavagem é feita no Instituto, pela enfermeira.'),
    (c, 'postop', 2,  'Durma com a cabeça elevada, usando o travesseiro fornecido.'),
    (c, 'postop', 3,  'Evite alimentos que causem inflamação nos primeiros 15 dias.'),
    (c, 'postop', 4,  'Não abaixe a cabeça e evite esforços físicos.'),
    (c, 'postop', 5,  'Nada de molhar a cabeça no chuveiro nos primeiros 7 dias (banho de corpo liberado).'),
    (c, 'postop', 6,  'As crostas serão removidas conforme orientação da equipe.'),
    (c, 'postop', 7,  'Atividade física leve é liberada após o 7º dia; esportes de contato só após 30 dias.'),
    (c, 'postop', 8,  'Evite excesso de sol, mar, piscina, rio e sauna por 30 dias.'),
    (c, 'postop', 9,  'A pomada é aplicada em toda a área implantada, conforme orientação.'),
    (c, 'postop', 10, 'Com 15 dias você já pode começar a usar o shampoo indicado (ex.: Dercos).'),
    (c, 'postop', 11, 'A partir de 1 mês os fios transplantados começam a cair — é normal (fase de renovação).'),
    (c, 'postop', 12, 'Use as medicações prescritas e mantenha o couro cabeludo limpo e protegido do sol.'),
    (c, 'postop', 13, 'Os resultados finais aparecem entre 6 e 12 meses.');

  -- Dicas diárias PRÉ-OP (genéricas)
  insert into care_tips (clinic_id, phase, sort_order, body) values
    (c, 'preop', 1, 'Siga o jejum conforme orientação da equipe.'),
    (c, 'preop', 2, 'Leve seus exames pré-operatórios no dia.'),
    (c, 'preop', 3, 'Suspenda medicações apenas conforme orientação médica.'),
    (c, 'preop', 4, 'Evite álcool e cigarro nos dias que antecedem o procedimento.'),
    (c, 'preop', 5, 'Lave o cabelo na véspera, conforme orientação.'),
    (c, 'preop', 6, 'Organize transporte e um acompanhante para o dia.'),
    (c, 'preop', 7, 'Confirme horário e local do procedimento.');
end $$;
