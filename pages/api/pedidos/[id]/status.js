import { supabaseAdmin } from '../../../../lib/supabase';

function expirado(pedido) {
  if (!pedido.pago || pedido.vitalicio || !pedido.expira_em) return false;
  return new Date(pedido.expira_em).getTime() <= Date.now();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido.' });

  const id = String(req.query.id || '');
  const token = String(req.query.token || '');
  if (!/^[a-f0-9]{12,32}$/i.test(id)) return res.status(400).json({ erro: 'Pedido inválido.' });

  const { data: pedido, error } = await supabaseAdmin
    .from('pedidos')
    .select('pago,status_pagamento,link,qr_code,vitalicio,expira_em,tem_audio,audio_url,cartao_premium,nome_pai,mensagem,fotos,token_entrega')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Erro ao consultar pedido:', error);
    return res.status(500).json({ erro: 'Falha ao consultar pedido.' });
  }
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

  if (expirado(pedido)) {
    return res.status(200).json({ status: 'expired' });
  }

  if (!pedido.pago) {
    return res.status(200).json({ status: pedido.status_pagamento || 'pending' });
  }

  const podeGerenciar = Boolean(
    pedido.token_entrega &&
    /^[a-f0-9]{48}$/i.test(token) &&
    token === pedido.token_entrega
  );

  return res.status(200).json({
    status: 'paid',
    link: pedido.link,
    qrCode: pedido.qr_code,
    vitalicio: pedido.vitalicio,
    expiraEm: pedido.expira_em,
    podeGerenciar,
    temAudio: podeGerenciar ? pedido.tem_audio : false,
    audioUrl: podeGerenciar ? pedido.audio_url : null,
    cartaoPremium: podeGerenciar ? pedido.cartao_premium : false,
    nomePai: podeGerenciar ? pedido.nome_pai : null,
    mensagemCartao: podeGerenciar ? pedido.mensagem : null,
    fotoPrincipal: podeGerenciar && Array.isArray(pedido.fotos) ? pedido.fotos[0] || null : null,
  });
}
