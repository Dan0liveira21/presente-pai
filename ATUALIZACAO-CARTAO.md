# Atualização — Cartão Digital com QR Code

Esta versão adiciona o order bump **Cartão Digital com QR Code**.

## Funcionamento

- A Wiapy identifica o produto pelo `WIAPY_ID_BUMP_CARTAO`.
- A página de entrega exibe o botão somente para pedidos que compraram o bump.
- O cartão é gerado no navegador, apenas quando o cliente clica para baixar.
- Nenhum arquivo adicional do cartão fica armazenado no Supabase.
- O PNG usa a primeira foto, o nome do pai, uma frase da mensagem e o QR Code da homenagem.

## Banco de dados

A coluna `cartao_premium` já existe no schema atual. Não é necessário executar outro SQL caso o `supabase-schema.sql` completo já tenha sido executado anteriormente.
