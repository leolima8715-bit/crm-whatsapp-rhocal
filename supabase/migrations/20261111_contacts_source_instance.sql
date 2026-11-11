-- Chip (número WhatsApp) de origem do contato. Preenchido pela importação da agenda.
alter table public.contacts
  add column if not exists source_instance_id uuid
  references public.whatsapp_instances(id) on delete set null;

create index if not exists contacts_source_instance_idx
  on public.contacts (source_instance_id);

-- Contatos já existentes: usa o chip da conversa mais antiga.
update public.contacts c
set source_instance_id = (
  select v.instance_id
  from public.conversations v
  where v.contact_id = c.id
  order by v.created_at asc
  limit 1
)
where c.source_instance_id is null;
