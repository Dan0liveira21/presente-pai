import { supabaseAdmin } from '../../../lib/supabase';

function caminhoDaFoto(url) {
  const marcador = '/storage/v1/object/public/fotos/';
  const indice = String(url || '').indexOf(marcador);
  if (indice === -1) return null;
  return decodeURIComponent(String(url).slice(indice + marcador.length));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido.' });

  const esperado = process.env.CRON_SECRET;
  const recebido = String(req.headers.authorization || '');
  if (!esperado || recebido !== `Bearer ${esperado}`) {
    return res.status(401).json({ erro: 'Não autorizado.' });
  }

  const dias = Math.max(7, Number(process.env.ABANDONED_ORDER_RETENTION_DAYS || 14));
  const limite = new Date(Date.now() - dias * 86400000).toISOString();

  const { data: pedidos, error } = await supabaseAdmin
    .from('pedidos')
    .select('id,fotos')
    .eq('pago', false)
    .eq('status_pagamento', 'pending')
    .lt('criado_em', limite)
    .limit(250);

  if (error) {
    console.error('Erro ao buscar pedidos abandonados:', error);
    return res.status(500).json({ erro: 'Falha na limpeza.' });
  }

  const caminhos = (pedidos || [])
    .flatMap((pedido) => Array.isArray(pedido.fotos) ? pedido.fotos : [])
    .map(caminhoDaFoto)
    .filter(Boolean);

  if (caminhos.length) {
    const { error: storageError } = await supabaseAdmin.storage.from('fotos').remove(caminhos);
    if (storageError) {
      console.error('Erro ao remover fotos abandonadas:', storageError);
      return res.status(500).json({ erro: 'Falha ao remover fotos.' });
    }
  }

  const ids = (pedidos || []).map((pedido) => pedido.id);
  if (ids.length) {
    const { error: deleteError } = await supabaseAdmin.from('pedidos').delete().in('id', ids);
    if (deleteError) {
      console.error('Erro ao remover pedidos abandonados:', deleteError);
      return res.status(500).json({ erro: 'Falha ao remover pedidos.' });
    }
  }

  return res.status(200).json({ removidos: ids.length, fotosRemovidas: caminhos.length });
}
