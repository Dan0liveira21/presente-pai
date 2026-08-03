import { supabaseAdmin } from '../../../../lib/supabase';

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

function expirado(pedido) {
  if (!pedido.pago || pedido.vitalicio || !pedido.expira_em) return false;
  return new Date(pedido.expira_em).getTime() <= Date.now();
}

function caminhoAnterior(url, id) {
  if (!url) return '';
  try {
    const marcador = '/storage/v1/object/public/audios/';
    const indice = url.indexOf(marcador);
    if (indice < 0) return '';
    const caminho = decodeURIComponent(url.slice(indice + marcador.length).split('?')[0]);
    return caminho.startsWith(`${id}/`) ? caminho : '';
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  try {
    const id = String(req.query.id || '');
    const token = String(req.body?.token || '');
    const caminho = String(req.body?.path || '');

    if (!/^[a-f0-9]{12,32}$/i.test(id) || !/^[a-f0-9]{48}$/i.test(token)) {
      return res.status(400).json({ erro: 'Pedido inválido.' });
    }
    if (!new RegExp(`^${id}/mensagem-[0-9]+-[a-f0-9]{16}\\.(mp3|m4a|webm|ogg|wav)$`, 'i').test(caminho)) {
      return res.status(400).json({ erro: 'Arquivo de áudio inválido.' });
    }

    const { data: pedido, error } = await supabaseAdmin
      .from('pedidos')
      .select('id,pago,status_pagamento,tem_audio,audio_url,vitalicio,expira_em,token_entrega')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!pedido || pedido.token_entrega !== token) {
      return res.status(403).json({ erro: 'Acesso de edição inválido.' });
    }
    if (!pedido.pago || !pedido.tem_audio || ['refunded', 'chargedback'].includes(pedido.status_pagamento) || expirado(pedido)) {
      return res.status(403).json({ erro: 'Esta homenagem não está disponível para edição.' });
    }

    const nomeArquivo = caminho.slice(id.length + 1);
    const { data: arquivos, error: listError } = await supabaseAdmin
      .storage
      .from('audios')
      .list(id, { limit: 20, search: nomeArquivo });

    if (listError) throw listError;
    const arquivo = (arquivos || []).find((item) => item.name === nomeArquivo);
    if (!arquivo) return res.status(400).json({ erro: 'O áudio enviado não foi encontrado.' });

    const tamanho = Number(arquivo.metadata?.size || 0);
    if (tamanho > MAX_AUDIO_BYTES) {
      await supabaseAdmin.storage.from('audios').remove([caminho]);
      return res.status(400).json({ erro: 'O áudio ultrapassou o limite de 15 MB.' });
    }

    const { data: publica } = supabaseAdmin.storage.from('audios').getPublicUrl(caminho);
    const audioUrl = publica?.publicUrl;
    if (!audioUrl) throw new Error('URL pública do áudio não foi criada.');

    const { error: updateError } = await supabaseAdmin
      .from('pedidos')
      .update({ audio_url: audioUrl, audio_enviado_em: new Date().toISOString() })
      .eq('id', id);

    if (updateError) throw updateError;

    const anterior = caminhoAnterior(pedido.audio_url, id);
    if (anterior && anterior !== caminho) {
      await supabaseAdmin.storage.from('audios').remove([anterior]).catch(() => undefined);
    }

    return res.status(200).json({ ok: true, audioUrl });
  } catch (error) {
    console.error('Erro ao confirmar áudio:', error);
    return res.status(500).json({ erro: 'Não foi possível concluir o envio do áudio.' });
  }
}
