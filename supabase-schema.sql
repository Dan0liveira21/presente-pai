-- Pode ser executado novamente com segurança no SQL Editor do Supabase.

create table if not exists pedidos (
  id                text primary key,
  nome_pai          text not null,
  mensagem          text not null default '',
  musica_url        text not null default '',
  data_referencia   date,
  fotos             jsonb not null default '[]'::jsonb,

  -- Pagamento e order bumps
  pago              boolean not null default false,
  pago_em           timestamptz,
  status_pagamento  text not null default 'pending',
  wiapy_payment_id  text,
  cliente_email     text,
  tem_audio         boolean not null default false,
  audio_url         text,
  vitalicio         boolean not null default false,
  tem_video         boolean not null default false,
  cartao_premium    boolean not null default false,

  -- Entrega e validade
  link              text,
  qr_code           text,
  expira_em         timestamptz,
  criado_em         timestamptz not null default now()
);

-- Garante as colunas novas em bancos onde a tabela já existia.
alter table pedidos add column if not exists status_pagamento text not null default 'pending';
alter table pedidos add column if not exists wiapy_payment_id text;
alter table pedidos add column if not exists cliente_email text;
alter table pedidos add column if not exists expira_em timestamptz;

create index if not exists pedidos_pagamento_idx on pedidos (wiapy_payment_id);
create index if not exists pedidos_pendentes_idx on pedidos (pago, criado_em);

-- Idempotência: cada mudança de status da transação é processada uma vez.
create table if not exists webhooks_processados (
  tx_id         text primary key,
  processado_em timestamptz not null default now()
);

-- Bucket público por URL secreta. O caminho usa o ID aleatório do pedido.
-- A service_role faz os uploads; o navegador apenas lê as imagens pela URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fotos',
  'fotos',
  true,
  700000,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
