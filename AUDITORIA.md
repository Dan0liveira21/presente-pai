# Auditoria técnica — Presente de Dia dos Pais

## Regra visual

Os HTMLs aprovados foram preservados em `design-reference/`. A interface continua usando:

- Fraunces para títulos e trechos emocionais;
- Nunito Sans para textos e interface;
- fundos creme `#FBF8F2` e `#F4EDE1`;
- dourado `#D99B54` e `#EEC98F`;
- texto `#35302B` e apoio `#948A7C`;
- composição estreita, fotos estilo polaroide e animações suaves.

## Problemas essenciais encontrados e corrigidos

### 1. Webhook incompatível com o payload oficial

O código anterior procurava status e transação no nível principal do JSON. O payload da Wiapy usa:

- `payment.status`;
- `payment.id`;
- `tracking.utm_content`;
- header `Authorization`;
- array `products`.

O endpoint foi ajustado e agora também verifica erros do Supabase.

### 2. Webhook podia confirmar uma falha como sucesso

Antes, qualquer exceção terminava com HTTP 200, impedindo uma nova tentativa. Agora erros internos retornam HTTP 500 e a transação só é marcada como processada após o pedido ser atualizado.

### 3. Seis fotos poderiam exceder a Vercel

O formulário enviava imagens originais em base64 e aceitava apenas três. Agora:

- aceita até seis;
- comprime no navegador;
- converte para JPEG otimizado;
- valida tipo, tamanho individual e tamanho total no servidor;
- respeita o limite real da Function.

### 4. Não existia uma entrega utilizável

O QR era criado no banco, mas o comprador não tinha uma tela para recebê-lo. Foi criada:

- `/entrega/[id]`;
- consulta automática do status;
- botão para abrir a homenagem;
- cópia do link;
- download do QR em PNG.

O checkout abre em outra aba e a página de entrega permanece na aba original.

### 5. Acesso de um ano não era aplicado

Foi adicionado `expira_em`. O webhook define um ano após o pagamento, exceto quando o bump vitalício estiver ativo. A página bloqueia conteúdo expirado.

### 6. Reembolso e chargeback não revogavam o acesso

Eventos `refunded` e `chargedback` agora desativam a homenagem e removem link e QR da entrega.

### 7. Conteúdo travado poderia aparecer no HTML da página pendente

A página agora faz uma consulta mínima antes do pagamento. Carta, música e fotos restantes só são serializadas quando o pedido está realmente ativo.

### 8. Pedidos abandonados acumulavam fotos para sempre

Foi criado um cron diário que remove pedidos pendentes antigos e suas fotos. O padrão é 14 dias e pode ser alterado por variável de ambiente.

## Melhorias visuais restauradas

A conversão inicial dos HTMLs para Next.js havia simplificado alguns elementos. Foram restaurados:

- cartão central de desbloqueio;
- conteúdo desfocado atrás da trava;
- animações de revelação;
- indicação “deslize”;
- subtítulos do contador e da retrospectiva;
- quatro barras no equalizador;
- proporções e espaçamentos do HTML aprovado.

## Pendências antes de anunciar

1. Rodar o `supabase-schema.sql` atualizado.
2. Preencher as variáveis reais na Vercel.
3. Confirmar que os IDs usados são os mesmos que aparecem no array `products` do webhook.
4. Fazer compra real de teste com produto principal e cada bump.
5. Configurar na página de obrigado da Wiapy uma instrução para o comprador retornar à aba da entrega.
6. Adicionar e-mail de entrega como redundância em uma próxima etapa.
7. Definir e implementar os conteúdos reais dos bumps de áudio, vídeo e cartão, caso continuem no lançamento.

## Testes executados nesta revisão

- parsing/transpilação de todos os arquivos JavaScript e JSX;
- criação de pedido com seis fotos simuladas;
- rejeição de link de YouTube inválido;
- rejeição de mais de seis fotos;
- payload oficial `paid` da Wiapy;
- idempotência do evento repetido;
- ativação do bump vitalício;
- evento `refunded` revogando o acesso;
- rejeição de token de webhook incorreto.

O build completo não foi executado neste ambiente porque o registry interno disponível não continha `@supabase/supabase-js`. A sintaxe e os fluxos críticos foram testados separadamente; o build final deve ser confirmado pela Vercel após o push.
