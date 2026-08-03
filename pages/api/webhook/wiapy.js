/**
 * pages/api/webhook/wiapy.js
 * O "telefonema" da Wiapy chega aqui — agora como FUNÇÃO SERVERLESS da Vercel.
 * (sobe, roda e desliga a cada chamada; por isso o estado vive no Supabase, não na memória)
 */

import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';

// Chave SERVICE ROLE: só no servidor, NUNCA exposta no front.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BASE_URL    = process.env.BASE_URL || 'https://seuprojeto.vercel.app';
const WIAPY_TOKEN = process.env.WIAPY_WEBHOOK_TOKEN;
const ID_PRINCIPAL = process.env.WIAPY_ID_PRINCIPAL;

// De ID-do-bump (na Wiapy) -> nome do "interruptor" no registro:
const BUMPS = {
  [process.env.WIAPY_ID_BUMP_AUDIO]:  'tem_audio',
  [process.env.WIAPY_ID_BUMP_VITAL]:  'vitalicio',
  [process.env.WIAPY_ID_BUMP_VIDEO]:  'tem_video',
  [process.env.WIAPY_ID_BUMP_CARTAO]: 'cartao_premium',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('use POST');

  try {
    const evento = req.body || {};

    // 1) É a Wiapy mesmo?
    const token = req.headers['x-webhook-token'] || evento.token;
    if (token !== WIAPY_TOKEN) return res.status(401).send('token invalido');

    // 2) Só reage a pagamento APROVADO.  >> confirme o status exato na Wiapy <<
    const status = String(evento.status || evento.payment_status || '').toLowerCase();
    if (!['approved', 'aprovado', 'paid', 'pago'].includes(status)) {
      return res.status(200).send('ok (ignorado: nao aprovado)');
    }

    // 3) De QUAL página é? O pedidoId foi levado ao checkout e volta aqui.
    //    >> confirme onde a Wiapy devolve isso (tracking/utm_content/metadata) <<
    const pedidoId =
      evento?.tracking?.pedido_id ||
      evento?.tracking?.utm_content ||
      evento?.metadata?.pedido_id;
    if (!pedidoId) {
      console.error('Webhook sem pedidoId:', JSON.stringify(evento));
      return res.status(200).send('ok (sem pedidoId)');
    }

    // 4) Idempotência via tabela (serverless não guarda nada em memória).
    const txId = String(evento.transaction_id || evento.id || `${pedidoId}-${status}`);
    const { data: jaFeito } = await supabase
      .from('webhooks_processados').select('tx_id').eq('tx_id', txId).maybeSingle();
    if (jaFeito) return res.status(200).send('ok (ja processado)');

    // 5) Lista do que foi comprado (principal + bumps).
    const produtos = evento.products || [];
    const ids = produtos.map(p => String(p.id ?? p.product_id ?? p.codigo));

    // 6) Monta os interruptores.
    const upd = {};
    if (ids.includes(String(ID_PRINCIPAL))) {
      upd.pago = true; upd.pago_em = new Date().toISOString();
    }
    for (const id of ids) if (BUMPS[id]) upd[BUMPS[id]] = true;
    if (Object.keys(upd).length && !upd.pago) {
      upd.pago = true; upd.pago_em = new Date().toISOString();
    }

    // 7) Gera link + QR (só agora, após o pagamento).
    const link = `${BASE_URL}/p/${pedidoId}`;
    upd.link = link;
    upd.qr_code = await QRCode.toDataURL(link, { margin: 1, width: 600 });

    // 8) Grava no registro + marca a transação como processada.
    await supabase.from('pedidos').update(upd).eq('id', pedidoId);
    await supabase.from('webhooks_processados').insert({ tx_id: txId });

    // 9) (opcional) disparar aqui o e-mail de entrega com link + QR.

    return res.status(200).send('ok');
  } catch (err) {
    console.error('Erro no webhook Wiapy:', err);
    return res.status(200).send('ok (erro logado)'); // evita reenvio infinito
  }
}
