import crypto from 'crypto';
import { supabaseAdmin } from '../../lib/supabase';

// A Vercel limita o payload total da Function a 4,5 MB.
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

const CHECKOUT_URL = process.env.WIAPY_CHECKOUT_URL;
const MAX_FOTOS = 6;
const MAX_FOTO_BYTES = 700_000;
const MAX_TOTAL_BYTES = 3_000_000;
const TIPOS_PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

function novoId() {
  return crypto.randomBytes(12).toString('hex'); // 96 bits, 24 caracteres.
}

function novoTokenEntrega() {
  return crypto.randomBytes(24).toString('hex'); // 192 bits.
}

function texto(valor, limite) {
  return typeof valor === 'string' ? valor.trim().slice(0, limite) : '';
}

function youtubeValido(url) {
  if (!url) return false;
  return /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)[\w-]{11}/i.test(url);
}

function dataValida(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return false;
  const [ano, mes, dia] = data.split('-').map(Number);
  const validacao = new Date(Date.UTC(ano, mes - 1, dia));
  const dataExiste = validacao.getUTCFullYear() === ano &&
    validacao.getUTCMonth() === mes - 1 &&
    validacao.getUTCDate() === dia;
  const escolhida = validacao.getTime();
  const partesHoje = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const valores = Object.fromEntries(partesHoje.map((parte) => [parte.type, parte.value]));
  const hoje = Date.UTC(Number(valores.year), Number(valores.month) - 1, Number(valores.day));
  return dataExiste && escolhida <= hoje;
}

function extrairFoto(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl || '');
  if (!match) throw new Error('Formato de foto inválido.');

  const contentType = match[1].toLowerCase();
  if (!TIPOS_PERMITIDOS.has(contentType)) throw new Error('Tipo de foto não permitido.');

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_FOTO_BYTES) {
    throw new Error('Uma das fotos ultrapassa o limite permitido.');
  }

  return { contentType, buffer };
}

function montarCheckout(id) {
  if (!CHECKOUT_URL) throw new Error('WIAPY_CHECKOUT_URL não configurada.');
  const url = new URL(CHECKOUT_URL);
  url.searchParams.set('utm_content', id);
  return url.toString();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  const caminhosEnviados = [];

  try {
    const body = req.body || {};

    // Honeypot simples contra bots que preenchem campos invisíveis.
    if (body.website) return res.status(400).json({ erro: 'Requisição inválida.' });

    const nomePai = texto(body.nome_pai, 80);
    const mensagem = texto(body.mensagem, 800);
    const musicaUrl = texto(body.musica_url, 500);
    const dataReferencia = texto(body.data_referencia, 10);
    const fotos = Array.isArray(body.fotos) ? body.fotos : [];

    if (!nomePai || !mensagem || !musicaUrl || !dataReferencia) {
      return res.status(400).json({ erro: 'Preencha todos os campos da homenagem.' });
    }
    if (!youtubeValido(musicaUrl)) {
      return res.status(400).json({ erro: 'Cole um link válido do YouTube.' });
    }
    if (!dataValida(dataReferencia)) {
      return res.status(400).json({ erro: 'Escolha uma data válida que não esteja no futuro.' });
    }
    if (fotos.length < 1 || fotos.length > MAX_FOTOS) {
      return res.status(400).json({ erro: `Envie de 1 a ${MAX_FOTOS} fotos.` });
    }

    const arquivos = fotos.map(extrairFoto);
    const totalBytes = arquivos.reduce((soma, foto) => soma + foto.buffer.length, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return res.status(413).json({ erro: 'As fotos ficaram muito pesadas. Escolha imagens menores.' });
    }

    const id = novoId();
    const tokenEntrega = novoTokenEntrega();
    const links = [];

    for (let i = 0; i < arquivos.length; i += 1) {
      const { contentType, buffer } = arquivos[i];
      const extensao = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
      const caminho = `${id}/foto-${i + 1}.${extensao}`;

      const { error: uploadError } = await supabaseAdmin
        .storage
        .from('fotos')
        .upload(caminho, buffer, { contentType, upsert: false, cacheControl: '31536000' });

      if (uploadError) throw uploadError;
      caminhosEnviados.push(caminho);

      const { data: publica } = supabaseAdmin.storage.from('fotos').getPublicUrl(caminho);
      links.push(publica.publicUrl);
    }

    const { error: insertError } = await supabaseAdmin.from('pedidos').insert({
      id,
      nome_pai: nomePai,
      mensagem,
      musica_url: musicaUrl,
      data_referencia: dataReferencia,
      fotos: links,
      pago: false,
      status_pagamento: 'pending',
      token_entrega: tokenEntrega,
    });

    if (insertError) throw insertError;

    return res.status(200).json({
      id,
      checkoutUrl: montarCheckout(id),
      entregaUrl: `/entrega/${id}?token=${encodeURIComponent(tokenEntrega)}`,
    });
  } catch (error) {
    if (caminhosEnviados.length) {
      await supabaseAdmin.storage.from('fotos').remove(caminhosEnviados).catch(() => undefined);
    }
    console.error('Erro em criar-pedido:', error);
    return res.status(500).json({ erro: 'Não foi possível preparar a homenagem. Tente novamente.' });
  }
}
