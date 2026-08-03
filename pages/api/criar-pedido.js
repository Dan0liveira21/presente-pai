import { supabaseAdmin } from '../../lib/supabase';
import crypto from 'crypto';

// As fotos chegam em base64, então aumentamos o limite do corpo da requisição.
export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

// O link do checkout da Wiapy (coloque o seu no .env / variáveis da Vercel).
const CHECKOUT_URL = process.env.WIAPY_CHECKOUT_URL || 'https://checkout.wiapy.com/SEU-PRODUTO';

function novoId() {
  return crypto.randomBytes(6).toString('hex'); // 12 caracteres, ex.: 9f3a1c...
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'use POST' });

  try {
    const { nome_pai, mensagem, musica_url, data_referencia, fotos = [] } = req.body || {};

    if (!nome_pai || !fotos.length) {
      return res.status(400).json({ erro: 'faltam nome do pai ou fotos' });
    }

    const id = novoId();

    // 1) Sobe cada foto pro Storage (bucket "fotos") e guarda o link público.
    const links = [];
    for (let i = 0; i < fotos.length; i++) {
      const m = /^data:(.+?);base64,(.*)$/.exec(fotos[i] || '');
      if (!m) continue;
      const contentType = m[1];
      const buffer = Buffer.from(m[2], 'base64');
      const ext = (contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const caminho = `${id}/foto-${i + 1}.${ext}`;

      const { error } = await supabaseAdmin
        .storage.from('fotos')
        .upload(caminho, buffer, { contentType, upsert: true });
      if (error) throw error;

      const { data: pub } = supabaseAdmin.storage.from('fotos').getPublicUrl(caminho);
      links.push(pub.publicUrl);
    }

    // 2) Cria o registro do pedido (ainda NÃO pago — o webhook liga o "pago" depois).
    const { error: errIns } = await supabaseAdmin.from('pedidos').insert({
      id,
      nome_pai,
      mensagem: mensagem || '',
      musica_url: musica_url || '',
      data_referencia: data_referencia || null,
      fotos: links,
      pago: false,
    });
    if (errIns) throw errIns;

    // 3) Devolve o id + o link do checkout já com o rastreamento (utm_content = id).
    //    >> É esse utm_content que volta no webhook e diz QUAL página liberar. <<
    const checkoutUrl = `${CHECKOUT_URL}?utm_content=${id}`;
    return res.status(200).json({ id, checkoutUrl });
  } catch (err) {
    console.error('Erro em criar-pedido:', err);
    return res.status(500).json({ erro: 'falha ao criar pedido' });
  }
}
