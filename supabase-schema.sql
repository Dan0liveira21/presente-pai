-- Rode isto UMA vez no Supabase (SQL Editor).

-- Um registro por presente criado.
create table if not exists pedidos (
  id              text primary key,             -- o pedidoId que vai no QR (/p/<id>)
  nome_pai        text,
  mensagem        text,
  musica_url      text,                          -- link do YouTube
  data_referencia date,                          -- alimenta o contador "há X dias"
  fotos           jsonb   default '[]'::jsonb,    -- URLs das fotos no Storage
  -- interruptores (o webhook liga estes):
  pago            boolean default false,
  pago_em         timestamptz,
  tem_audio       boolean default false,
  audio_url       text,
  vitalicio       boolean default false,
  tem_video       boolean default false,
  cartao_premium  boolean default false,
  -- entrega:
  link            text,
  qr_code         text,                          -- QR em base64 (ou URL do arquivo)
  criado_em       timestamptz default now()
);

-- Idempotência: transações que o webhook já processou.
create table if not exists webhooks_processados (
  tx_id         text primary key,
  processado_em timestamptz default now()
);
