import { useEffect } from 'react';
import { supabaseAdmin } from '../../lib/supabase';

// pega o código do vídeo dentro de um link do YouTube
function ytId(url) {
  if (!url) return '';
  const m = String(url).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : '';
}

export async function getServerSideProps({ params }) {
  const { data } = await supabaseAdmin
    .from('pedidos').select('*').eq('id', params.id).maybeSingle();

  if (!data) return { notFound: true };
  return { props: { pedido: data } };
}

export default function Pagina({ pedido }) {
  const fotos = pedido.fotos || [];
  const vid = ytId(pedido.musica_url);

  useEffect(() => {
    // contador de dias
    const el = document.getElementById('count');
    if (el && pedido.data_referencia) {
      const d = new Date(pedido.data_referencia);
      if (!isNaN(d)) {
        el.textContent = Math.floor((Date.now() - d.getTime()) / 86400000).toLocaleString('pt-BR');
      }
    }
    // botão "começar": toca a música e revela
    const start = document.getElementById('start');
    if (start) {
      start.addEventListener('click', () => {
        if (vid) {
          document.getElementById('player').src =
            `https://www.youtube.com/embed/${vid}?autoplay=1&loop=1&playlist=${vid}`;
        }
        document.getElementById('intro').classList.add('hide');
      });
    }
  }, [pedido, vid]);

  // ----- ainda não pago: mostra prévia travada -----
  if (!pedido.pago) {
    return (
      <div className="wrap">
        <div className="aviso">
          <div className="eyebrow">Feliz Dia dos Pais</div>
          <h1>Para <em>{pedido.nome_pai}</em></h1>
          {fotos[0] && <div className="ph"><img src={fotos[0]} alt="" /></div>}
          <div className="lock">🔒 Este presente ainda está sendo finalizado.<br />Assim que o pagamento for confirmado, a homenagem completa aparece aqui.</div>
        </div>
        <Estilo />
      </div>
    );
  }

  // ----- pago: homenagem completa -----
  return (
    <div className="wrap">
      <div id="intro" className="intro">
        <div className="eyebrow">Uma surpresa para você</div>
        <h1>Feliz Dia dos Pais,<br /><em>{pedido.nome_pai}</em></h1>
        <button id="start" className="startbtn">♪ Toque para começar</button>
        <div className="hint">com som — deixe o volume ligado</div>
      </div>

      <section className="hero">
        <div className="eyebrow">Feliz Dia dos Pais</div>
        <h1>Para você,<br /><em>{pedido.nome_pai}</em></h1>
        {fotos[0] && <div className="ph tilt"><img src={fotos[0]} alt="" /></div>}
        <div className="music"><span className="eq"><i></i><i></i><i></i></span> tocando a nossa música</div>
      </section>

      <section className="counter">
        <div className="eyebrow">nossa história</div>
        <div className="num" id="count">—</div>
        <div className="lbl">dias sendo o meu herói</div>
      </section>

      {fotos.length > 1 && (
        <section className="gallery">
          <div className="eyebrow">momentos</div>
          <h2>De lá pra cá</h2>
          <div className="strip">
            {fotos.slice(1).map((f, i) => (
              <div className="ph" key={i}><img src={f} alt="" /></div>
            ))}
          </div>
        </section>
      )}

      {pedido.mensagem && (
        <section className="letter">
          <div className="eyebrow">a carta</div>
          <p>{pedido.mensagem}</p>
        </section>
      )}

      {/* bump de áudio (só aparece se foi comprado e enviado) */}
      {pedido.tem_audio && pedido.audio_url && (
        <section className="audio">
          <div className="eyebrow">um recado de voz</div>
          <audio controls src={pedido.audio_url}></audio>
        </section>
      )}

      <section className="closing">
        <h2>Te amo, <em>pai</em>.</h2>
      </section>

      <iframe id="player" title="musica" allow="autoplay"
        style={{ position: 'fixed', width: 1, height: 1, left: -9999, top: -9999, border: 0 }} src=""></iframe>

      <Estilo />
    </div>
  );
}

function Estilo() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Nunito+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #ECE4D6; }
        body { font-family: 'Nunito Sans', system-ui, sans-serif; color: #35302B; -webkit-font-smoothing: antialiased; }
      `}</style>
      <style jsx>{`
        .wrap { max-width: 430px; margin: 0 auto; position: relative; overflow-x: hidden; min-height: 100vh;
          background: radial-gradient(120% 55% at 50% 0%, #FFFDF9, transparent 55%), #FBF8F2; box-shadow: 0 0 60px rgba(0,0,0,.14); }
        .eyebrow { font-size: 11.5px; letter-spacing: .3em; text-transform: uppercase; color: #D99B54; font-weight: 800; margin-bottom: 16px; }
        h1 { font-family: 'Fraunces', serif; font-weight: 400; font-size: clamp(30px,9vw,42px); line-height: 1.08; }
        h1 em, h2 em { font-style: italic; color: #D99B54; }
        .ph { background: #fff; padding: 9px 9px 32px; border-radius: 5px; display: inline-block; box-shadow: 0 14px 34px rgba(53,48,43,.12); }
        .ph.tilt { transform: rotate(-2.2deg); }
        .ph img { width: 200px; height: 200px; object-fit: cover; border-radius: 3px; display: block; }

        .intro { position: fixed; inset: 0; z-index: 100; display: flex; flex-direction: column; align-items: center;
          justify-content: center; text-align: center; padding: 32px; background: radial-gradient(130% 70% at 50% 20%, #FFFDF9, #F4EDE1);
          transition: opacity .8s ease; }
        .intro.hide { opacity: 0; pointer-events: none; }
        .intro h1 { margin-bottom: 32px; }
        .startbtn { border: 0; cursor: pointer; background: linear-gradient(180deg,#EEC98F,#D99B54); color: #4a3212;
          font-weight: 800; font-size: 16px; padding: 15px 30px; border-radius: 100px; box-shadow: 0 12px 26px rgba(217,155,84,.32); }
        .hint { margin-top: 16px; color: #948A7C; font-size: 12.5px; }

        section { padding: 56px 28px; text-align: center; }
        .hero { min-height: 88vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .hero .ph { margin: 28px 0 24px; }
        .music { display: inline-flex; align-items: center; gap: 9px; background: #fff; border: 1px solid rgba(53,48,43,.09);
          padding: 9px 15px; border-radius: 100px; font-size: 12.5px; color: #948A7C; }
        .eq { display: flex; align-items: flex-end; gap: 2.5px; height: 13px; }
        .eq i { width: 3px; background: #D99B54; border-radius: 2px; height: 5px; animation: b 1s infinite ease-in-out; }
        .eq i:nth-child(2){animation-delay:.2s}.eq i:nth-child(3){animation-delay:.4s}
        @keyframes b { 0%,100%{height:4px} 50%{height:13px} }

        .counter { background: #F4EDE1; }
        .counter .num { font-family: 'Fraunces', serif; color: #D99B54; font-weight: 500; font-size: clamp(52px,15vw,72px); line-height: 1; }
        .counter .lbl { margin-top: 12px; font-weight: 600; font-size: 16px; }

        .gallery h2, .closing h2 { font-family: 'Fraunces', serif; font-weight: 400; font-size: 27px; margin-bottom: 26px; }
        .strip { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
        .strip .ph img { width: 118px; height: 118px; }
        .strip .ph:nth-child(odd){ transform: rotate(-3deg); } .strip .ph:nth-child(even){ transform: rotate(2deg); }

        .letter p { font-family: 'Fraunces', serif; font-style: italic; font-size: 18px; line-height: 1.62; max-width: 340px;
          margin: 0 auto; white-space: pre-line; }
        .audio audio { width: 100%; max-width: 320px; }
        .closing { background: #F4EDE1; padding-bottom: 78px; }
        .closing h2 { font-weight: 500; font-size: 30px; }

        .aviso { text-align: center; padding: 70px 28px; }
        .aviso .ph { margin: 24px 0; }
        .aviso .ph img { width: 180px; height: 180px; }
        .lock { color: #948A7C; font-size: 14px; line-height: 1.55; margin-top: 10px; }
      `}</style>
    </>
  );
}
