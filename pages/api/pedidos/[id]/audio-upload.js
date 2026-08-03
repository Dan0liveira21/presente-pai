import crypto from 'crypto';
import { supabaseAdmin } from '../../../../lib/supabase';

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const TIPOS = new Map([
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/mp4', 'm4a'],
  ['audio/x-m4a', 'm4a'],
  ['audio/webm', 'webm'],
  ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
]);

function expirado(pedido) {
  if (!pedido.pago || pedido.vitalicio || !pedido.expira_em) return false;
  return new Date(pedido.expira_em).getTime() <= Date.now();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  try {
    const id = String(req.query.id || '');
    const token = String(req.body?.token || '');
    const tipo = String(req.body?.tipo || '').toLowerCase().split(';')[0].trim();
    const tamanho = Number(req.body?.tamanho || 0);

    if (!/^[a-f0-9]{12,32}$/i.test(id) || !/^[a-f0-9]{48}$/i.test(token)) {
      return res.status(400).json({ erro: 'Pedido inválido.' });
    }
    if (!TIPOS.has(tipo)) {
      return res.status(400).json({ erro: 'Use um áudio em MP3, M4A, WAV, OGG ou WEBM.' });
    }
    if (!Number.isFinite(tamanho) || tamanho <= 0 || tamanho > MAX_AUDIO_BYTES) {
      return res.status(400).json({ erro: 'O áudio deve ter no máximo 15 MB.' });
    }

    const { data: pedido, error } = await supabaseAdmin
      .from('pedidos')
      .select('id,pago,status_pagamento,tem_audio,vitalicio,expira_em,token_entrega')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!pedido || pedido.token_entrega !== token) {
      return res.status(403).json({ erro: 'Acesso de edição inválido.' });
    }
    if (!pedido.pago || ['refunded', 'chargedback'].includes(pedido.status_pagamento) || expirado(pedido)) {
      return res.status(403).json({ erro: 'Esta homenagem não está disponível para edição.' });
    }
    if (!pedido.tem_audio) {
      return res.status(403).json({ erro: 'A mensagem de voz não foi adquirida neste pedido.' });
    }

    const extensao = TIPOS.get(tipo);
    const aleatorio = crypto.randomBytes(8).toString('hex');
    const caminho = `${id}/mensagem-${Date.now()}-${aleatorio}.${extensao}`;

    const { data, error: signedError } = await supabaseAdmin
      .storage
      .from('audios')
      .createSignedUploadUrl(caminho, { upsert: false });

    if (signedError) throw signedError;
    if (!data?.signedUrl) throw new Error('URL de upload não foi criada.');

    return res.status(200).json({
      signedUrl: data.signedUrl,
      path: caminho,
    });
  } catch (error) {
    console.error('Erro ao preparar upload de áudio:', error);
    return res.status(500).json({ erro: 'Não foi possível preparar o envio do áudio.' });
  }
}
