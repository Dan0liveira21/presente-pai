-- Execute este arquivo no SQL Editor do Supabase antes de publicar os arquivos do áudio.

alter table pedidos add column if not exists audio_enviado_em timestamptz;
alter table pedidos add column if not exists token_entrega text;
create unique index if not exists pedidos_token_entrega_idx on pedidos (token_entrega) where token_entrega is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audios',
  'audios',
  true,
  15728640,
  array[
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/x-m4a',
    'audio/webm',
    'audio/ogg',
    'audio/wav',
    'audio/x-wav'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
