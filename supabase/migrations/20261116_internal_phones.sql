-- Telefones internos (gestores e outros números da equipe que não são chips).
-- Contatos com esses telefones, e com o telefone de qualquer chip, são is_internal e nunca têm responsável.
-- Rode cada bloco separadamente no SQL Editor do Supabase (são independentes e idempotentes).

-- ============================================================
-- BLOCO 1 — função de comparação de telefone
-- Mesma regra de phoneKey() em src/lib/internal-contacts.ts:
-- DDD + 8 últimos dígitos, ignorando o 55 e o 9º dígito de celular.
-- ============================================================
create or replace function public.phone_key(p text)
returns text
language sql
immutable
as $$
  select case when length(n) >= 10 then left(n, 2) || right(n, 8) end
  from (
    select case when d like '55%' and length(d) >= 12 then substr(d, 3) else d end as n
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) a
  ) b
$$;

-- ============================================================
-- BLOCO 2 — lista de telefones internos
-- org_id já faz parte da tabela (not null). O servidor usa service role, que ignora a RLS.
-- ============================================================
create table if not exists public.internal_phones (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,  -- sem FK: o nome da tabela de organizações não está versionado no repo
  phone      text not null,
  label      text,
  created_at timestamptz not null default now()
);

create unique index if not exists internal_phones_org_key_idx
  on public.internal_phones (org_id, public.phone_key(phone));

-- Para cadastrar mais um telefone interno depois (troque os valores):
--   insert into public.internal_phones (org_id, phone, label)
--   values ('<org_id>', '5511999999999', 'Gestor Fulano');
-- e rode os BLOCOS 3 e 4 do arquivo 20261116_internal_contacts_backfill.sql.

-- ============================================================
-- BLOCO 3 — PRÉVIA: as funções usadas nas policies existem?
-- Deve devolver 2 linhas (current_org_id e is_gestor). Se vier vazio ou 1 linha,
-- NÃO rode o bloco 4: o create policy falharia (ou, pior, a regra seria outra).
-- ============================================================
select p.oid::regprocedure as funcao, pg_get_functiondef(p.oid) as definicao
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('current_org_id', 'is_gestor');

-- ============================================================
-- BLOCO 4 — RLS e policies (mesmo modelo de whatsapp_instances)
-- Leitura: qualquer usuário da mesma org. Escrita: só gestor da mesma org.
-- ============================================================
alter table public.internal_phones enable row level security;

drop policy if exists internal_phones_select on public.internal_phones;
create policy internal_phones_select on public.internal_phones
  for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists internal_phones_insert on public.internal_phones;
create policy internal_phones_insert on public.internal_phones
  for insert to authenticated
  with check (public.is_gestor() and org_id = public.current_org_id());

drop policy if exists internal_phones_update on public.internal_phones;
create policy internal_phones_update on public.internal_phones
  for update to authenticated
  using (public.is_gestor() and org_id = public.current_org_id())
  with check (public.is_gestor() and org_id = public.current_org_id());

drop policy if exists internal_phones_delete on public.internal_phones;
create policy internal_phones_delete on public.internal_phones
  for delete to authenticated
  using (public.is_gestor() and org_id = public.current_org_id());

-- ============================================================
-- BLOCO 5 — PRÉVIA: conferir contra whatsapp_instances
-- As policies dela devem usar as mesmas funções e os mesmos papéis.
-- ============================================================
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('whatsapp_instances', 'internal_phones')
order by tablename, cmd;
