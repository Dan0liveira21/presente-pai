# Presente de Dia dos Pais — gerador de homenagem com QR Code

App em Next.js + Supabase, checkout na Wiapy, hospedado na Vercel.

## O que é cada arquivo
- `pages/index.js` — formulário + prévia parcial (a cliente monta e paga)
- `pages/api/criar-pedido.js` — sobe as fotos, cria o pedido, devolve o checkout
- `pages/p/[id].js` — a página-presente que o pai vê ao escanear o QR
- `pages/api/webhook/wiapy.js` — libera o pedido e ativa os bumps após o pagamento
- `lib/supabase.js` — conexão com o Supabase
- `supabase-schema.sql` — rode uma vez no Supabase (já feito)

## Passo a passo do deploy
1. Subir este projeto num repositório PRIVADO no GitHub.
2. Cadastrar os produtos na Wiapy (principal + bumps); anotar os IDs e o link do checkout.
3. Preencher as variáveis (ver `.env.example`).
4. Importar o repo na Vercel e cadastrar as variáveis lá.
5. Configurar o webhook na Wiapy apontando para: https://SEU-SITE/api/webhook/wiapy
6. Fazer uma compra de teste e conferir os 3 pontos marcados com >> no webhook.

## Variáveis de ambiente
Ver `.env.example`. As secretas (service_role, token) só vivem no `.env.local` e nas
configurações da Vercel — nunca no Git.
