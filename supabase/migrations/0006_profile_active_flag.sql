-- Flag de ativo/inativo do membro da equipe (o bloqueio de login é feito via ban no Auth pela Edge Function manage-user).
alter table profiles add column if not exists active boolean not null default true;
