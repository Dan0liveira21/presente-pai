# Atualização — Mensagem de Voz

Implementação adicionada:

- reconhecimento do order bump por `WIAPY_ID_BUMP_AUDIO`;
- token secreto de gerenciamento para cada nova página de entrega;
- gravação pelo microfone no navegador, com limite de 3 minutos;
- seleção de arquivo MP3, M4A, WAV, OGG ou WEBM, com limite de 15 MB;
- upload direto e assinado para o Supabase Storage;
- confirmação do arquivo antes de vinculá-lo ao pedido;
- reprodução da mensagem de voz dentro da homenagem;
- pausa da música do YouTube quando a mensagem de voz começa;
- possibilidade de substituir o áudio pela página de entrega;
- remoção do áudio em estorno ou chargeback.

## Publicação

1. Execute `audio-schema.sql` no Supabase.
2. Substitua os arquivos do projeto.
3. Envie ao GitHub e aguarde o deploy da Vercel.
4. Faça o teste usando uma homenagem nova.

## Verificação técnica

Todos os arquivos JavaScript/JSX passaram por verificação de sintaxe. O build completo não pôde ser executado neste ambiente porque o registro interno de pacotes não disponibilizou `@supabase/supabase-js`.
