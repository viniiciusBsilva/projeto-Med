-- Foco em transplante capilar: sinais do couro cabeludo no check-in.
alter table checkins add column if not exists redness boolean not null default false; -- vermelhidão
alter table checkins add column if not exists itching boolean not null default false; -- coceira
alter table checkins add column if not exists crusts  boolean not null default false; -- crostas

-- Triagem adaptada ao capilar (continua triagem, NÃO diagnóstico).
-- febre/sangramento ou (vermelhidão intensa + dor>=6) => critical (possível infecção/foliculite)
-- dor>=8 => high | dor>=6 ou coceira intensa ou "mal" => medium
create or replace function checkin_triage()
returns trigger language plpgsql set search_path = public as $$
declare
  sev    alert_severity;
  reason text;
begin
  if new.fever or new.bleeding or (new.redness and new.pain is not null and new.pain >= 6) then
    sev := 'critical';
    reason := 'Sinais de risco no check-in: '
      || case when new.fever then 'febre ' else '' end
      || case when new.bleeding then 'sangramento ' else '' end
      || case when new.redness then 'vermelhidão no couro ' else '' end
      || '(possível infecção/foliculite — avaliação da equipe).';
  elsif new.pain is not null and new.pain >= 8 then
    sev := 'high';
    reason := 'Dor intensa relatada (nível ' || new.pain || ').';
  elsif (new.pain is not null and new.pain >= 6) or new.itching or new.feeling = 'mal' then
    sev := 'medium';
    reason := 'Desconforto relatado (dor '
      || coalesce(new.pain::text, 's/ nota')
      || case when new.itching then ', coceira' else '' end
      || ', estado: ' || coalesce(new.feeling, 'n/i') || ').';
  else
    return new;
  end if;

  insert into alerts (clinic_id, patient_id, checkin_id, severity, reason)
  values (new.clinic_id, new.patient_id, new.id, sev, trim(reason));
  return new;
end;
$$;
