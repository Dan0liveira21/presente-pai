# Presente de Dia dos Pais — gerador com QR Code

App em Next.js (Pages Router) + Supabase + Vercel + checkout Wiapy.

## Fluxo

1. A cliente monta a homenagem e vê a prévia parcial.
2. As fotos são comprimidas no navegador para caber nos limites da Vercel.
3. O pedido pendente e as fotos são salvos no Supabase.
4. O checkout abre em outra aba; a aba original acompanha a confirmação.
5. A Wiapy envia o webhook.
6. O sistema libera a página, ativa os bumps, gera o link e o QR Code.
7. A página de entrega exibe o link e permite baixar o QR em PNG.

## Arquivos principais

- `pages/index.js`: formulário e prévia parcial no design aprovado.
- `pages/api/criar-pedido.js`: valida, envia as fotos e cria o pedido.
- `pages/api/webhook/wiapy.js`: processa o payload oficial da Wiapy.
- `pages/entrega/[id].js`: acompanha o pagamento e entrega link + QR.
- `pages/api/pedidos/[id]/status.js`: status seguro da entrega.
- `pages/p/[id].js`: página final da homenagem.
- `pages/api/cron/limpar-abandonados.js`: remove pedidos não pagos antigos.
- `supabase-schema.sql`: tabelas, índices e bucket de fotos.

## Preparação

1. Rode `supabase-schema.sql` no SQL Editor do Supabase, mesmo que a tabela já exista.
2. Cadastre as variáveis de `.env.example` na Vercel.
3. Na Wiapy, configure o webhook para:
   `https://SEU-DOMINIO/api/webhook/wiapy`
4. Cadastre na integração da Wiapy o mesmo token usado em `WIAPY_WEBHOOK_TOKEN`.
5. Use os IDs reais do produto principal e de cada bump.
6. Faça uma compra de teste com PIX e outra com cartão.

## Payload esperado da Wiapy

O webhook usa:

- token: header `Authorization`
- status: `payment.status`
- transação: `payment.id`
- pedido: `tracking.utm_content`
- itens comprados: array `products`

## Testes obrigatórios antes de anunciar

- pagamento `paid` libera a página;
- webhook repetido não duplica processamento;
- `refunded` e `chargedback` desativam o acesso;
- cada bump liga somente seu campo;
- 6 fotos de celular são comprimidas e enviadas;
- o QR abre exatamente a URL da homenagem;
- a entrega funciona no celular com o checkout em outra aba;
- pedido não pago com mais de 14 dias é removido pelo cron.
