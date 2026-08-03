import QRCode from 'qrcode';
import { supabaseAdmin } from '../../../lib/supabase';

const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');
const WIAPY_TOKEN = process.env.WIAPY_WEBHOOK_TOKEN || '';
const ID_PRINCIPAL = process.env.WIAPY_ID_PRINCIPAL || '';

const BUMPS = Object.fromEntries(
  [
    [process.env.WIAPY_ID_BUMP_AUDIO, 'tem_audio'],
    [process.env.WIAPY_ID_BUMP_VITAL, 'vitalicio'],
    [process.env.WIAPY_ID_BUMP_VIDEO, 'tem_video'],
    [process.env.WIAPY_ID_BUMP_CARTAO, 'cartao_premium'],
  ].filter(([id]) => Boolean(id))
);

function tokenRecebido(req) {
  const valor = String(req.headers.authorization || req.headers['x-webhook-token'] || '').trim();
  return valor.toLowerCase().startsWith('bearer ') ? valor.slice(7).trim() : valor;
}

function dataIso(valor) {
  const data = valor ? new Date(valor) : new Date();
  return Number.isNaN(data.getTime()) ? new Date().toISOString() : data.toISOString();
}

function somarUmAno(dataIsoString) {
  const data = new Date(dataIsoString);
  data.setUTCFullYear(data.getUTCFullYear() + 1);
  return data.toISOString();
}


function caminhoAudio(url, pedidoId) {
  if (!url) return '';
  try {
    const marcador = '/storage/v1/object/public/audios/';
    const indice = String(url).indexOf(marcador);
    if (indice < 0) return '';
    const caminho = decodeURIComponent(String(url).slice(indice + marcador.length).split('?')[0]);
    return caminho.startsWith(`${pedidoId}/`) ? caminho : '';
  } catch {
    return '';
  }
}

async function jaProcessado(txId) {
  const { data, error } = await supabaseAdmin
    .from('webhooks_processados')
    .select('tx_id')
    .eq('tx_id', txId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function marcarProcessado(txId) {
  const { error } = await supabaseAdmin.from('webhooks_processados').insert({ tx_id: txId });
  if (error && error.code !== '23505') throw error;
}

async function localizarPedido(pedidoId, paymentId) {
  if (pedidoId) {
    const { data, error } = await supabaseAdmin
      .from('pedidos')
      .select('id,pago,pago_em,vitalicio,expira_em,audio_url')
      .eq('id', pedidoId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (paymentId) {
    const { data, error } = await supabaseAdmin
      .from('pedidos')
      .select('id,pago,pago_em,vitalicio,expira_em,audio_url')
      .eq('wiapy_payment_id', paymentId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).send('use POST');

  try {
    if (!WIAPY_TOKEN || !ID_PRINCIPAL || !BASE_URL) {
      throw new Error('Variáveis obrigatórias da Wiapy não configuradas.');
    }

    if (tokenRecebido(req) !== WIAPY_TOKEN) {
      return res.status(401).send('token invalido');
    }

    const evento = req.body || {};
    const pagamento = evento.payment || {};
    const status = String(pagamento.status || evento.status || evento.payment_status || '').toLowerCase();
    const paymentId = String(pagamento.id || evento.transaction_id || evento.id || '');
    const pedidoIdRastreado = String(
      evento?.tracking?.utm_content ||
      evento?.tracking?.pedido_id ||
      evento?.metadata?.pedido_id ||
      ''
    ).trim();

    // Eventos que ainda não alteram o acesso.
    if (['unpaid', 'credit_card_declined', 'pending', 'recused', 'recusado'].includes(status)) {
      return res.status(200).send('ok (ignorado)');
    }

    if (!['paid', 'refunded', 'chargedback'].includes(status)) {
      return res.status(200).send('ok (status desconhecido ignorado)');
    }

    const pedido = await localizarPedido(pedidoIdRastreado, paymentId);
    if (!pedido) {
      console.error('Webhook sem pedido correspondente:', { paymentId, pedidoIdRastreado, status });
      return res.status(404).send('pedido nao encontrado');
    }

    // O mesmo pagamento pode gerar eventos paid, refunded e chargedback.
    const txId = `${paymentId || pedido.id}:${status}`;
    if (await jaProcessado(txId)) return res.status(200).send('ok (ja processado)');

    if (status === 'refunded' || status === 'chargedback') {
      const audioAnterior = caminhoAudio(pedido.audio_url, pedido.id);
      if (audioAnterior) {
        const { error: removeError } = await supabaseAdmin.storage.from('audios').remove([audioAnterior]);
        if (removeError) console.error('Não foi possível remover o áudio estornado:', removeError);
      }

      const { error } = await supabaseAdmin
        .from('pedidos')
        .update({
          pago: false,
          status_pagamento: status,
          link: null,
          qr_code: null,
          audio_url: null,
          audio_enviado_em: null,
        })
        .eq('id', pedido.id);
      if (error) throw error;

      await marcarProcessado(txId);
      return res.status(200).send('ok');
    }

    const produtos = Array.isArray(evento.products) ? evento.products : [];
    const idsComprados = produtos
      .map((produto) => String(produto?.id ?? produto?.product_id ?? produto?.codigo ?? ''))
      .filter(Boolean);

    const comprouPrincipal = idsComprados.includes(String(ID_PRINCIPAL));
    const bumpsComprados = idsComprados.filter((id) => BUMPS[id]);

    // Aceita um pagamento separado apenas se for bump/upsell de um pedido já pago.
    if (!comprouPrincipal && !(pedido.pago && bumpsComprados.length)) {
      console.error('Pagamento sem produto principal reconhecido:', { paymentId, idsComprados });
      return res.status(422).send('produto principal nao reconhecido');
    }

    const pagoEm = dataIso(pagamento.dt_update || pagamento.dt_create);
    const atualizacoes = {
      pago: true,
      pago_em: pedido.pago ? undefined : pagoEm,
      status_pagamento: 'paid',
      wiapy_payment_id: paymentId || null,
      cliente_email: evento?.customer?.email || undefined,
    };

    for (const id of bumpsComprados) atualizacoes[BUMPS[id]] = true;

    const vitalicio = pedido.vitalicio || bumpsComprados.some((id) => BUMPS[id] === 'vitalicio');
    atualizacoes.vitalicio = vitalicio;
    atualizacoes.expira_em = vitalicio
      ? null
      : pedido.pago && pedido.expira_em
        ? pedido.expira_em
        : somarUmAno(pedido.pago_em || pagoEm);

    const link = `${BASE_URL}/p/${pedido.id}`;
    atualizacoes.link = link;
    atualizacoes.qr_code = await QRCode.toDataURL(link, {
      margin: 1,
      width: 600,
      errorCorrectionLevel: 'M',
    });

    // Remove propriedades indefinidas para não apagar valores existentes.
    Object.keys(atualizacoes).forEach((chave) => {
      if (atualizacoes[chave] === undefined) delete atualizacoes[chave];
    });

    const { data: atualizado, error: updateError } = await supabaseAdmin
      .from('pedidos')
      .update(atualizacoes)
      .eq('id', pedido.id)
      .select('id')
      .maybeSingle();

    if (updateError) throw updateError;
    if (!atualizado) throw new Error('Pedido não foi atualizado.');

    await marcarProcessado(txId);
    return res.status(200).send('ok');
  } catch (error) {
    console.error('Erro no webhook Wiapy:', error);
    // Não confirma um erro interno como sucesso; permite uma nova tentativa do provedor.
    return res.status(500).send('erro interno');
  }
}
