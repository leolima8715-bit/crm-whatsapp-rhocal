-- Correção de dados única. Rode DEPOIS dos blocos 1 e 2 de 20261116_internal_phones.sql
-- (a tabela e a função phone_key precisam existir). Os blocos 3-5 de lá (policies) são independentes.
-- Cada bloco é independente. Os blocos com "PRÉVIA" só leem; confira o resultado antes de rodar o seguinte.

-- ============================================================
-- BLOCO 1 — PRÉVIA: contatos que parecem ser dos gestores
-- Confira se aparecem exatamente Gestor Rodrigo e Gestora Gabi (e só eles).
-- ============================================================
select id, org_id, name, push_name, phone, is_internal, owner_id
from public.contacts
where name ilike '%gestor%rodrigo%' or name ilike '%rodrigo%gestor%'
   or name ilike '%gestora%gabi%'   or name ilike '%gabi%gestora%'
   or push_name ilike '%gestor%rodrigo%' or push_name ilike '%gestora%gabi%';

-- ============================================================
-- BLOCO 2 — cadastra os telefones deles na lista interna
-- Ajuste o filtro se a PRÉVIA mostrou algo diferente. Pode rodar de novo sem duplicar.
-- ============================================================
insert into public.internal_phones (org_id, phone, label)
select distinct on (c.org_id, public.phone_key(c.phone)) c.org_id, c.phone, coalesce(c.name, c.push_name)
from public.contacts c
where (c.name ilike '%gestor%rodrigo%' or c.name ilike '%rodrigo%gestor%'
    or c.name ilike '%gestora%gabi%'   or c.name ilike '%gabi%gestora%'
    or c.push_name ilike '%gestor%rodrigo%' or c.push_name ilike '%gestora%gabi%')
  and public.phone_key(c.phone) is not null
on conflict do nothing;

-- ============================================================
-- BLOCO 3 — PRÉVIA: contatos que vão virar internos
-- (telefone igual ao de um chip ou da lista interna, e hoje is_internal = false)
-- ============================================================
select c.id, c.name, c.phone, c.owner_id
from public.contacts c
where c.is_internal is not true
  and public.phone_key(c.phone) in (
    select public.phone_key(phone) from public.whatsapp_instances where phone is not null
    union
    select public.phone_key(phone) from public.internal_phones
  );

-- ============================================================
-- BLOCO 4 — marca como internos e remove o responsável deles
-- Atenção: owner_id vira NULL (contato interno nunca tem responsável). Os triggers de sincronização
-- do banco atualizam conversations.assigned_to. Rode a PRÉVIA do bloco 3 antes.
-- ============================================================
update public.contacts c
set is_internal = true,
    owner_id = null
where c.is_internal is not true
  and public.phone_key(c.phone) in (
    select public.phone_key(phone) from public.whatsapp_instances where phone is not null
    union
    select public.phone_key(phone) from public.internal_phones
  );

-- ============================================================
-- BLOCO 5 — contatos já internos que ainda têm responsável (marcados à mão, p.ex.)
-- PRÉVIA (leitura):
-- ============================================================
select id, name, phone, owner_id from public.contacts where is_internal and owner_id is not null;

-- Para limpar (descomente e rode só se a PRÉVIA estiver certa):
-- update public.contacts set owner_id = null where is_internal and owner_id is not null;
