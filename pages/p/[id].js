import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import { supabaseAdmin } from '../../lib/supabase';

function youtubeId(url) {
  if (!url) return '';
  const match = String(url).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
  return match ? match[1] : '';
}

function diasDesde(dataStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataStr || '')) return null;
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  const hoje = new Date();
  const inicioUtc = Date.UTC(ano, mes - 1, dia);
  const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = Math.floor((hojeUtc - inicioUtc) / 86400000);
  return dias >= 0 ? dias : null;
}

function estaExpirado(pedido) {
  if (!pedido?.pago || pedido.vitalicio || !pedido.expira_em) return false;
  return new Date(pedido.expira_em).getTime() <= Date.now();
}

export async function getServerSideProps({ params, res }) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  const id = String(params.id || '');
  if (!/^[a-f0-9]{12,32}$/i.test(id)) return { notFound: true };

  // Primeiro busca apenas o necessário para decidir se o conteúdo pode ser entregue.
  const { data: base, error: baseError } = await supabaseAdmin
    .from('pedidos')
    .select('id,nome_pai,fotos,pago,vitalicio,expira_em,status_pagamento')
    .eq('id', id)
    .maybeSingle();

  if (baseError) {
    console.error('Erro ao buscar homenagem:', baseError);
    return { notFound: true };
  }
  if (!base) return { notFound: true };

  const expirado = estaExpirado(base);
  const cancelado = ['refunded', 'chargedback'].includes(base.status_pagamento);
  const ativo = base.pago && !expirado && !cancelado;

  if (!ativo) {
    return {
      props: {
        estado: cancelado ? 'cancelado' : expirado ? 'expirado' : 'pendente',
        pedido: {
          id: base.id,
          nome_pai: base.nome_pai,
          fotos: Array.isArray(base.fotos) && base.fotos[0] ? [base.fotos[0]] : [],
        },
      },
    };
  }

  // Só envia carta, música e todas as fotos quando o pedido está liberado.
  const { data: completo, error: completoError } = await supabaseAdmin
    .from('pedidos')
    .select('id,nome_pai,mensagem,musica_url,data_referencia,fotos,pago,tem_audio,audio_url,vitalicio,tem_video,cartao_premium,expira_em')
    .eq('id', id)
    .maybeSingle();

  if (completoError || !completo) {
    console.error('Erro ao buscar homenagem completa:', completoError);
    return { notFound: true };
  }

  return { props: { estado: 'ativo', pedido: completo } };
}

export default function PaginaHomenagem({ pedido, estado }) {
  const fotos = Array.isArray(pedido.fotos) ? pedido.fotos : [];
  const videoId = youtubeId(pedido.musica_url);
  const [iniciada, setIniciada] = useState(false);
  const [contador, setContador] = useState('—');
  const [playerSrc, setPlayerSrc] = useState('');
  const observerRef = useRef(null);

  useEffect(() => {
    if (estado !== 'ativo') return undefined;

    const dias = diasDesde(pedido.data_referencia);
    setContador(dias === null ? '—' : dias.toLocaleString('pt-BR'));

    const elementos = Array.from(document.querySelectorAll('.reveal'));
    if ('IntersectionObserver' in window) {
      observerRef.current = new IntersectionObserver((entradas) => {
        entradas.forEach((entrada) => {
          if (entrada.isIntersecting) entrada.target.classList.add('in');
        });
      }, { threshold: 0.15 });
      elementos.forEach((elemento) => observerRef.current.observe(elemento));
    } else {
      elementos.forEach((elemento) => elemento.classList.add('in'));
    }

    document.querySelectorAll('.hero .reveal').forEach((elemento) => elemento.classList.add('in'));

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [estado, pedido.data_referencia]);

  function comecar() {
    if (videoId) {
      const origin = encodeURIComponent(window.location.origin);
      setPlayerSrc(`https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}&playsinline=1&rel=0&enablejsapi=1&controls=1&fs=0&iv_load_policy=3&origin=${origin}`);
    }
    setIniciada(true);
  }

  function pausarMusica() {
    const frame = document.getElementById('player');
    frame?.contentWindow?.postMessage(JSON.stringify({
      event: 'command',
      func: 'pauseVideo',
      args: [],
    }), '*');
  }

  if (estado !== 'ativo') {
    const textos = {
      pendente: {
        titulo: 'Este presente ainda está sendo finalizado',
        corpo: 'Assim que o pagamento for confirmado, a homenagem completa aparecerá aqui.',
      },
      expirado: {
        titulo: 'Esta homenagem chegou ao fim do período de acesso',
        corpo: 'O acesso contratado por 1 ano terminou.',
      },
      cancelado: {
        titulo: 'Esta homenagem não está disponível',
        corpo: 'O acesso foi desativado após o cancelamento do pagamento.',
      },
    };
    const texto = textos[estado] || textos.pendente;

    return (
      <>
        <Cabecalho nome={pedido.nome_pai} />
        <main className="wrap statusWrap">
          <div className="statusCard">
            <div className="eyebrow">Feliz Dia dos Pais</div>
            <h1>Para <em>{pedido.nome_pai}</em></h1>
            {fotos[0] && <div className="photo statusPhoto"><img src={fotos[0]} alt={`Foto de ${pedido.nome_pai}`} /></div>}
            <div className="statusIcon" aria-hidden="true">{estado === 'pendente' ? '⌛' : '🔒'}</div>
            <h2>{texto.titulo}</h2>
            <p>{texto.corpo}</p>
          </div>
        </main>
        <Estilos />
      </>
    );
  }

  return (
    <>
      <Cabecalho nome={pedido.nome_pai} />
      <main className="wrap">
        <div id="intro" className={`intro ${iniciada ? 'hide' : ''}`}>
          <div className="eyebrow">Uma surpresa para você</div>
          <h1>Feliz Dia dos Pais,<br /><em>{pedido.nome_pai}</em></h1>
          <button type="button" className="startbtn" onClick={comecar}>
            <span className="note">♪</span> Toque para começar
          </button>
          <div className="hint">com som — deixe o volume ligado</div>
        </div>

        <section className="hero">
          <div className="eyebrow reveal">Feliz Dia dos Pais</div>
          <h1 className="reveal">Para você,<br /><em>{pedido.nome_pai}</em></h1>
          {fotos[0] && <div className="photo tilt reveal"><img src={fotos[0]} alt={`Foto de ${pedido.nome_pai}`} /></div>}
          {videoId && (
            <>
              <div className="music reveal">
                <span className="eq"><i /><i /><i /><i /></span>
                tocando a nossa música
              </div>
              {iniciada && playerSrc && (
                <div className="youtubeCard">
                  <iframe
                    id="player"
                    title="Música da homenagem"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen={false}
                    src={playerSrc}
                  />
                </div>
              )}
            </>
          )}
          <div className="scrollcue reveal">deslize<span className="arrow" /></div>
        </section>

        <section className="counter">
          <div className="eyebrow reveal">nossa história</div>
          <div className="num reveal">{contador}</div>
          <div className="lbl reveal">dias sendo o meu herói</div>
          <div className="counterSub reveal">e cada um deles valeu a pena</div>
        </section>

        {fotos.length > 1 && (
          <section className="gallery">
            <div className="eyebrow reveal">momentos</div>
            <h2 className="reveal">De lá pra cá</h2>
            <p className="gallerySub reveal">os instantes que ficaram guardados</p>
            <div className="strip">
              {fotos.slice(1).map((foto, indice) => (
                <div className="photo reveal" key={foto}><img src={foto} alt={`Momento ${indice + 2} da homenagem`} /></div>
              ))}
            </div>
          </section>
        )}

        {pedido.mensagem && (
          <section className="letter">
            <div className="inner">
              <div className="letterLabel reveal">a carta</div>
              <p className="reveal">{pedido.mensagem}</p>
            </div>
          </section>
        )}

        {pedido.tem_audio && pedido.audio_url && (
          <section className="audio">
            <div className="voiceCard reveal">
              <div className="voiceIcon" aria-hidden="true">♪</div>
              <div className="eyebrow">uma mensagem para você</div>
              <h2>Ouça com o coração</h2>
              <p>Esta voz também faz parte da nossa história.</p>
              <audio controls src={pedido.audio_url} preload="metadata" onPlay={pausarMusica}>
                Seu navegador não suporta áudio.
              </audio>
            </div>
          </section>
        )}

        <section className="closing">
          <h2 className="reveal">Te amo, <em>pai</em>.</h2>
        </section>
      </main>

      <Estilos />
    </>
  );
}

function Cabecalho({ nome }) {
  return (
    <Head>
      <title>Feliz Dia dos Pais, {nome}</title>
      <meta name="description" content={`Uma homenagem especial de Dia dos Pais para ${nome}.`} />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex,nofollow,noarchive" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Nunito+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
    </Head>
  );
}

function Estilos() {
  return (
    <>
      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #ECE4D6; }
        body { font-family: 'Nunito Sans', system-ui, sans-serif; color: #35302B; -webkit-font-smoothing: antialiased; }
        button { font: inherit; }
      `}</style>
      <style jsx global>{`
        .wrap { max-width: 430px; margin: 0 auto; position: relative; overflow-x: hidden; min-height: 100vh; background: radial-gradient(120% 55% at 50% 0%, #FFFDF9, transparent 55%), #FBF8F2; box-shadow: 0 0 60px rgba(0,0,0,.14); }
        .eyebrow { font-size: 11.5px; letter-spacing: .32em; text-transform: uppercase; color: #D99B54; font-weight: 800; margin-bottom: 20px; }
        h1 { font-family: 'Fraunces', Georgia, serif; font-weight: 400; font-size: clamp(33px,9.5vw,44px); line-height: 1.08; }
        h1 em, h2 em { font-style: italic; color: #D99B54; }
        section { padding: 58px 28px; text-align: center; }
        .reveal { opacity: 0; transform: translateY(16px); transition: opacity .9s ease, transform .9s ease; }
        .reveal.in { opacity: 1; transform: none; }

        .photo { background: #FFF; border-radius: 6px; padding: 9px 9px 34px; box-shadow: 0 14px 36px rgba(53,48,43,.10); display: inline-block; }
        .photo.tilt { transform: rotate(-2.2deg); }
        .photo img { width: 210px; height: 210px; object-fit: cover; border-radius: 3px; display: block; background: #EADFCF; }

        .intro { position: fixed; inset: 0; z-index: 100; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 32px; background: radial-gradient(130% 70% at 50% 20%, #FFFDF9, #F4EDE1); transition: opacity .8s ease; }
        .intro.hide { opacity: 0; pointer-events: none; }
        .intro h1 { font-size: clamp(30px,8.5vw,40px); line-height: 1.1; margin-bottom: 34px; }
        .startbtn { border: 0; cursor: pointer; background: linear-gradient(180deg,#EEC98F,#D99B54); color: #4a3212; font-weight: 800; font-size: 16px; padding: 15px 30px; border-radius: 100px; box-shadow: 0 12px 26px rgba(217,155,84,.32); display: inline-flex; align-items: center; gap: 10px; }
        .note { font-size: 18px; }
        .hint { margin-top: 16px; color: #948A7C; font-size: 12.5px; }

        .hero { padding-top: 46px; min-height: 90vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .hero .photo { margin: 30px 0 26px; }
        .music { display: inline-flex; align-items: center; gap: 11px; background: #FFF; border: 1px solid rgba(53,48,43,.09); padding: 9px 16px 9px 13px; border-radius: 100px; font-size: 13px; color: #948A7C; box-shadow: 0 6px 16px rgba(53,48,43,.06); }
        .eq { display: flex; align-items: flex-end; gap: 2.5px; height: 14px; }
        .eq i { width: 3px; background: #D99B54; border-radius: 2px; animation: bounce 1s ease-in-out infinite; }
        .eq i:nth-child(2) { animation-delay: .2s; } .eq i:nth-child(3) { animation-delay: .4s; } .eq i:nth-child(4) { animation-delay: .15s; }
        @keyframes bounce { 0%,100% { height: 4px; } 50% { height: 14px; } }
        .scrollcue { margin-top: 40px; color: #948A7C; font-size: 11px; letter-spacing: .22em; text-transform: uppercase; }
        .arrow { display: block; margin: 10px auto 0; width: 1px; height: 32px; background: linear-gradient(#D99B54,transparent); }

        .counter { background: #F4EDE1; }
        .counter .num { font-family: 'Fraunces', Georgia, serif; font-weight: 500; color: #D99B54; font-size: clamp(54px,16vw,74px); line-height: 1; letter-spacing: -.02em; }
        .counter .lbl { margin-top: 14px; font-size: 17px; font-weight: 600; }
        .counterSub { margin-top: 6px; color: #948A7C; font-size: 13.5px; }

        .gallery h2 { font-family: 'Fraunces', Georgia, serif; font-weight: 400; font-size: 27px; margin-bottom: 6px; }
        .gallerySub { color: #948A7C; font-size: 14px; margin-bottom: 32px; }
        .strip { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
        .strip .photo { transform: rotate(2deg); }
        .strip .photo:nth-child(odd) { transform: rotate(-3deg); }
        .strip .photo img { width: 120px; height: 120px; }

        .letter .inner { max-width: 340px; margin: 0 auto; }
        .letterLabel { color: #D99B54; font-size: 11.5px; letter-spacing: .3em; text-transform: uppercase; margin-bottom: 18px; font-weight: 800; }
        .letter p { font-family: 'Fraunces', Georgia, serif; font-style: italic; font-size: 18px; line-height: 1.62; white-space: pre-line; overflow-wrap: anywhere; }
        .audio { background: #FBF8F2; }
        .voiceCard { max-width: 340px; margin: 0 auto; padding: 30px 22px 24px; border-radius: 22px; background: #F4EDE1; border: 1px solid rgba(217,155,84,.22); box-shadow: 0 14px 34px rgba(53,48,43,.08); }
        .voiceIcon { width: 48px; height: 48px; margin: 0 auto 17px; border-radius: 50%; display: grid; place-items: center; color: #8B5B25; font-size: 22px; background: radial-gradient(circle at 40% 35%,#F7DFB9,#D99B54 70%); box-shadow: 0 9px 20px rgba(217,155,84,.25); }
        .voiceCard .eyebrow { margin-bottom: 11px; }
        .voiceCard h2 { font-family: 'Fraunces', Georgia, serif; font-size: 27px; font-weight: 500; line-height: 1.15; }
        .voiceCard p { margin: 9px 0 18px; color: #948A7C; font-size: 13.5px; line-height: 1.5; }
        .voiceCard audio { width: 100%; }
        .closing { background: #F4EDE1; padding-bottom: 80px; }
        .closing h2 { font-family: 'Fraunces', Georgia, serif; font-weight: 500; font-size: 30px; }

        .youtubeCard { width: min(100%, 340px); margin: 18px auto 0; padding: 7px; background: rgba(255,255,255,.92); border: 1px solid rgba(53,48,43,.10); border-radius: 18px; box-shadow: 0 14px 32px rgba(53,48,43,.12); overflow: hidden; }
        #player { display: block; width: 100%; aspect-ratio: 16 / 9; min-height: 200px; border: 0; border-radius: 12px; background: #1f1f1f; }

        .statusWrap { display: flex; align-items: center; justify-content: center; padding: 54px 28px; }
        .statusCard { width: 100%; text-align: center; }
        .statusCard h1 { margin-bottom: 26px; }
        .statusPhoto { margin-bottom: 24px; }
        .statusPhoto img { width: 180px; height: 180px; }
        .statusIcon { font-size: 26px; margin-bottom: 12px; }
        .statusCard h2 { font-family: 'Fraunces', Georgia, serif; font-size: 23px; font-weight: 500; line-height: 1.2; margin-bottom: 10px; }
        .statusCard p { color: #948A7C; font-size: 14px; line-height: 1.55; max-width: 320px; margin: 0 auto; }

        @media (prefers-reduced-motion: reduce) {
          .reveal { opacity: 1; transform: none; transition: none; }
          .eq i { animation: none; height: 9px; }
          .intro { transition: none; }
        }
      `}</style>
    </>
  );
}
