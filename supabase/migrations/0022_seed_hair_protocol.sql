-- Estrutura mínima de protocolo, SÓ para clínica que ainda não tem nenhum.
--
-- Histórico: a primeira versão desta migration criava um protocolo
-- "Transplante Capilar" com 18 passos em placeholder, guardada por
-- `where name = 'Transplante Capilar'`. A clínica demo já tinha
-- "Transplante Capilar (FUE)" — nome diferente, então o guard não pegou e o
-- seed criou um DUPLICADO, todo em placeholder. Como o `wa-send` se recusa a
-- enviar placeholder, se esse duplicado fosse escolhido o paciente não receberia
-- nada. O duplicado foi removido e o guard agora olha a existência de QUALQUER
-- protocolo da clínica, que é a condição que realmente importa.
--
-- Os textos e prazos são do médico (CLAUDE.md §4.2). Note que o protocolo real
-- da clínica coloca o shock loss em D+30, não no D+60 que o doc supunha — o
-- julgamento clínico do médico vence o palpite da especificação.

do $$
declare
  c   uuid := '00000000-0000-0000-0000-000000000001';
  p   uuid;
  ph  constant text := '[TEXTO A DEFINIR PELO MÉDICO]';
begin
  -- Um procedimento por clínica: se já existe protocolo, não cria nada.
  if exists (select 1 from protocols where clinic_id = c) then
    return;
  end if;

  insert into protocols (clinic_id, name, specialty, duration_days, color)
  values (c, 'Transplante Capilar', 'capilar', 365, '#8B5CF6')
  returning id into p;

  insert into protocol_steps (protocol_id, phase, day_offset, title, instructions) values
    (p, 'preop',  -7, 'D-7 — preparo',               ph),
    (p, 'preop',  -3, 'D-3 — orientações',           ph),
    (p, 'preop',  -1, 'D-1 — véspera e confirmação', ph);

  insert into protocol_steps (protocol_id, phase, day_offset, title, instructions)
  select p, 'postop', d, 'D+' || d || ' — cuidado diário', ph
    from generate_series(1, 10) as d;

  -- Marco do shock loss: a mensagem proativa que explica a queda ANTES do
  -- paciente entrar em pânico (§4.2). O dia exato é do médico — a clínica demo
  -- usa D+30, esta estrutura genérica deixa D+60 como ponto de partida.
  insert into protocol_steps (protocol_id, phase, day_offset, title, instructions) values
    (p, 'followup',  30, 'Mês 1 — foto e retorno',                      ph),
    (p, 'followup',  60, 'D+60 — shock loss (queda esperada dos fios)',  ph),
    (p, 'followup',  90, 'Mês 3 — foto e retorno',                       ph),
    (p, 'followup', 180, 'Mês 6 — foto e retorno',                       ph),
    (p, 'followup', 365, 'Mês 12 — foto e retorno',                      ph);
end $$;
