import Head from 'next/head';
import { useEffect, useState } from 'react';

const MAX_FOTOS = 6;
const MAX_LADO = 1280;
const ALVO_BYTES = 450_000;

function bytesBase64(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  return Math.ceil((base64.length * 3) / 4);
}

function carregarImagem(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler uma das fotos.'));
    };
    img.src = url;
  });
}

async function comprimirFoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Use fotos em JPG, PNG ou WEBP.');
  }

  const img = await carregarImagem(file);
  const escala = Math.min(1, MAX_LADO / Math.max(img.naturalWidth, img.naturalHeight));
  let largura = Math.max(1, Math.round(img.naturalWidth * escala));
  let altura = Math.max(1, Math.round(img.naturalHeight * escala));
  let qualidade = 0.82;
  let resultado = '';

  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(img, 0, 0, largura, altura);
    resultado = canvas.toDataURL('image/jpeg', qualidade);

    if (bytesBase64(resultado) <= ALVO_BYTES) break;
    largura = Math.max(1, Math.round(largura * 0.86));
    altura = Math.max(1, Math.round(altura * 0.86));
    qualidade = Math.max(0.58, qualidade - 0.07);
  }

  if (!resultado || bytesBase64(resultado) > 700_000) {
    throw new Error('Uma das fotos ficou muito pesada. Escolha outra imagem.');
  }

  return resultado;
}

function diasDesde(dataStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataStr || '')) return null;
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  const hoje = new Date();
  const inicioUtc = Date.UTC(ano, mes - 1, dia);
  const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = Math.floor((hojeUtc - inicioUtc) / 86400000);
  return dias >= 0 ? dias.toLocaleString('pt-BR') : null;
}

function youtubeValido(url) {
  return /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)[\w-]{11}/i.test(url || '');
}

function hojeLocalIso() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export default function Home() {
  const [nome, setNome] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [musica, setMusica] = useState('');
  const [data, setData] = useState('');
  const [fotos, setFotos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [processandoFotos, setProcessandoFotos] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const entregaPendente = sessionStorage.getItem('entregaUrl');
    if (entregaPendente) {
      sessionStorage.removeItem('entregaUrl');
      window.location.replace(entregaPendente);
    }
  }, []);

  async function onFotos(evento) {
    const arquivos = Array.from(evento.target.files || []);
    evento.target.value = '';
    setErro('');

    if (!arquivos.length) return;
    if (arquivos.length > MAX_FOTOS) {
      setErro(`Escolha no máximo ${MAX_FOTOS} fotos.`);
      return;
    }

    setProcessandoFotos(true);
    try {
      const comprimidas = [];
      for (const arquivo of arquivos) comprimidas.push(await comprimirFoto(arquivo));

      const tamanhoJson = new Blob([JSON.stringify(comprimidas)]).size;
      if (tamanhoJson > 3_800_000) {
        throw new Error('As fotos ficaram muito pesadas juntas. Escolha imagens menores.');
      }

      setFotos(comprimidas);
    } catch (error) {
      setFotos([]);
      setErro(error.message || 'Não foi possível preparar as fotos.');
    } finally {
      setProcessandoFotos(false);
    }
  }

  function validar() {
    if (!nome.trim()) return 'Digite o nome do pai.';
    if (!fotos.length) return 'Escolha pelo menos uma foto.';
    if (!data) return 'Escolha uma data especial.';
    if (!youtubeValido(musica)) return 'Cole um link válido do YouTube.';
    if (!mensagem.trim()) return 'Escreva a mensagem para o seu pai.';
    return '';
  }

  async function pagar() {
    const problema = validar();
    if (problema) {
      setErro(problema);
      return;
    }

    setErro('');
    setEnviando(true);

    // Mantém a página de entrega aberta e envia o checkout para outra aba.
    const checkoutTab = window.open('about:blank', '_blank');

    try {
      const resposta = await fetch('/api/criar-pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_pai: nome,
          mensagem,
          musica_url: musica,
          data_referencia: data,
          fotos,
          website: '',
        }),
      });

      const dados = await resposta.json();
      if (!resposta.ok || !dados.checkoutUrl || !dados.entregaUrl) {
        throw new Error(dados.erro || 'Algo deu errado. Tente novamente.');
      }

      if (checkoutTab) {
        checkoutTab.location.href = dados.checkoutUrl;
        window.location.href = dados.entregaUrl;
      } else {
        // Fallback raro para bloqueadores de pop-up.
        sessionStorage.setItem('entregaUrl', dados.entregaUrl);
        window.location.href = dados.checkoutUrl;
      }
    } catch (error) {
      if (checkoutTab) checkoutTab.close();
      setErro(error.message || 'Erro de conexão. Tente novamente.');
      setEnviando(false);
    }
  }

  const dias = diasDesde(data);
  const indisponivel = enviando || processandoFotos;

  return (
    <>
      <Head>
        <title>Monte a homenagem do seu pai</title>
        <meta name="description" content="Crie uma homenagem personalizada de Dia dos Pais com fotos, música, carta e QR Code." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Nunito+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <main className="page">
        <section className="form" aria-label="Personalização da homenagem">
          <div className="brand">Eternize</div>
          <h1>Monte a homenagem do seu pai</h1>
          <p className="sub">Preencha, confira a prévia e finalize. Leva cerca de 3 minutos.</p>

          <label>
            Nome do pai
            <input
              value={nome}
              maxLength={80}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Seu João"
              autoComplete="off"
            />
          </label>

          <label>
            Fotos (até {MAX_FOTOS})
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onFotos} />
            <small>{processandoFotos ? 'Preparando as fotos...' : fotos.length ? `${fotos.length} foto(s) pronta(s).` : 'JPG, PNG ou WEBP.'}</small>
          </label>

          <label>
            Uma data especial de vocês
            <input type="date" value={data} max={hojeLocalIso()} onChange={(e) => setData(e.target.value)} />
            <small>Alimenta o contador “há X dias você é meu herói”.</small>
          </label>

          <label>
            Link da música no YouTube
            <input value={musica} maxLength={500} onChange={(e) => setMusica(e.target.value)} placeholder="Cole o link do YouTube" inputMode="url" />
          </label>

          <label>
            A mensagem para o seu pai
            <textarea
              rows={6}
              value={mensagem}
              maxLength={800}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Escreva com o coração..."
            />
            <small className="contadorTexto">{mensagem.length}/800</small>
          </label>

          <input className="honeypot" tabIndex="-1" autoComplete="off" aria-hidden="true" />

          {erro && <div className="erro" role="alert">{erro}</div>}

          <button className="cta" type="button" onClick={pagar} disabled={indisponivel}>
            {enviando ? 'Preparando seu presente...' : processandoFotos ? 'Preparando as fotos...' : 'Finalizar e receber meu QR Code'}
          </button>
          <div className="preco">pagamento único · <strong>R$ 9,90</strong> · acesso por 1 ano</div>
        </section>

        <section className="stage" aria-label="Prévia da homenagem">
          <div className="phone">
            <div className="ribbon"><span className="dot" /> Modo prévia · antes do pagamento</div>

            <section className="hero">
              <div className="eyebrow reveal d1">Uma surpresa para você</div>
              <h2 className="reveal d2">Feliz Dia dos Pais,<br /><em>{nome || 'seu pai'}</em></h2>

              {fotos[0] ? (
                <div className="photo reveal d3">
                  <img src={fotos[0]} alt="Primeira foto da homenagem" />
                  <div className="cap">o nosso começo</div>
                </div>
              ) : (
                <div className="photo reveal d3">
                  <div className="imgPlaceholder">a foto aparece aqui</div>
                  <div className="cap">o nosso começo</div>
                </div>
              )}

              <div className="music reveal d4">
                <span className="eq"><i /><i /><i /><i /></span>
                tocando <b>a nossa música</b>
              </div>
              <div className="scrollcue reveal d4">deslize<span className="arrow" /></div>
            </section>

            <section className="counter">
              <div className="eyebrow">nossa história</div>
              <div className="num">{dias || '—'}</div>
              <div className="lbl">dias sendo o meu herói</div>
              <div className="counterSub">e cada um deles valeu a pena</div>
            </section>

            <section className="gallery">
              <div className="eyebrow">momentos</div>
              <h3>De lá pra cá</h3>
              <p className="gallerySub">os instantes que ficaram guardados</p>
              <div className="strip">
                {[1, 2].map((indice) => fotos[indice] ? (
                  <div className="photo small" key={indice}><img src={fotos[indice]} alt="Foto da retrospectiva" /></div>
                ) : (
                  <div className="photo small" key={indice}><div className="smallPlaceholder">foto</div></div>
                ))}
              </div>
            </section>

            <div className="lockedWrap">
              <div className="lockcard">
                <div className="seal" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M6 10V8a6 6 0 0 1 12 0v2" stroke="#4a3212" strokeWidth="2" strokeLinecap="round" /><rect x="4.5" y="10" width="15" height="10.5" rx="2.4" fill="#4a3212" /></svg>
                </div>
                <h3>Continue a homenagem</h3>
                <p>Você viu só o começo. O resto está guardado para {nome || 'o seu pai'}.</p>
                <ul className="unlocks">
                  <li>A retrospectiva completa com todas as fotos</li>
                  <li>A carta que você escreveu para ele</li>
                  <li>A música tocando do início ao fim</li>
                  <li>Seu link e seu QR Code para presentear</li>
                </ul>
                <button className="previewCta" type="button" onClick={pagar} disabled={indisponivel}>
                  {enviando ? 'Preparando...' : 'Desbloquear e receber meu QR Code'}
                </button>
                <div className="price">pagamento único · acesso por 1 ano</div>
              </div>

              <div className="locked" aria-hidden="true">
                <section className="letter"><div className="letterLabel">a carta</div><p>“Pai, se hoje eu ando com meus próprios pés é porque um dia você segurou minha mão...”</p></section>
                <section className="gallery"><div className="strip"><div className="photo small"><div className="smallPlaceholder">foto</div></div><div className="photo small"><div className="smallPlaceholder">foto</div></div></div></section>
                <section className="closing"><h3>Te amo, <em>pai</em>.</h3></section>
              </div>
            </div>
          </div>
        </section>
      </main>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { min-height: 100%; background: #ECE4D6; }
        body { font-family: 'Nunito Sans', system-ui, sans-serif; color: #35302B; -webkit-font-smoothing: antialiased; }
        button, input, textarea { font: inherit; }
      `}</style>
      <style jsx>{`
        .page { display: flex; flex-wrap: wrap; gap: 42px; max-width: 1040px; margin: 0 auto; padding: 44px 22px 70px; align-items: flex-start; }
        .form { flex: 1 1 360px; max-width: 470px; position: sticky; top: 28px; padding: 8px 0; }
        .brand { color: #D99B54; font-size: 11.5px; letter-spacing: .3em; text-transform: uppercase; font-weight: 800; margin-bottom: 18px; }
        .form h1 { font-family: 'Fraunces', Georgia, serif; font-weight: 500; font-size: clamp(30px, 4vw, 39px); line-height: 1.08; }
        .sub { color: #948A7C; line-height: 1.55; margin: 10px 0 28px; }
        label { display: block; font-weight: 700; font-size: 14px; margin-bottom: 17px; }
        input, textarea { display: block; width: 100%; margin-top: 7px; padding: 13px 14px; border: 1px solid #ddd3c4; border-radius: 11px; background: #FFF; color: #35302B; outline: none; transition: border-color .2s, box-shadow .2s; }
        input:focus, textarea:focus { border-color: #D99B54; box-shadow: 0 0 0 3px rgba(217,155,84,.14); }
        textarea { resize: vertical; line-height: 1.5; }
        small { display: block; color: #948A7C; font-weight: 400; margin-top: 6px; line-height: 1.35; }
        .contadorTexto { text-align: right; }
        .honeypot { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
        .erro { background: #fff7f2; border: 1px solid #ebc9b1; color: #7a3d23; border-radius: 10px; padding: 11px 13px; font-size: 13px; line-height: 1.4; margin: 2px 0 13px; }
        .cta { width: 100%; border: 0; cursor: pointer; margin-top: 4px; padding: 16px; background: linear-gradient(180deg,#EEC98F,#D99B54); color: #4a3212; font-weight: 800; font-size: 16px; border-radius: 12px; box-shadow: 0 12px 24px rgba(217,155,84,.28); }
        .cta:disabled, .previewCta:disabled { opacity: .6; cursor: default; }
        .preco { text-align: center; color: #948A7C; font-size: 13px; margin-top: 11px; }
        .preco strong { color: #35302B; }

        .stage { flex: 1 1 430px; display: flex; justify-content: center; }
        .phone { width: 100%; max-width: 430px; position: relative; overflow: hidden; background: radial-gradient(120% 55% at 50% 0%, #FFFDF9, transparent 55%), #FBF8F2; box-shadow: 0 0 60px rgba(0,0,0,.14); }
        .ribbon { position: sticky; top: 0; z-index: 40; background: rgba(251,248,242,.9); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(53,48,43,.09); display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 14px; font-size: 12px; letter-spacing: .05em; color: #948A7C; font-weight: 700; text-transform: uppercase; }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: #D99B54; }
        .phone section { padding: 58px 28px; }
        .reveal { opacity: 0; transform: translateY(16px); animation: up .9s ease forwards; }
        .d1 { animation-delay: .15s; } .d2 { animation-delay: .4s; } .d3 { animation-delay: .65s; } .d4 { animation-delay: .9s; }
        @keyframes up { to { opacity: 1; transform: none; } }
        .eyebrow { font-size: 11.5px; letter-spacing: .32em; text-transform: uppercase; color: #D99B54; font-weight: 800; margin-bottom: 20px; }
        .hero { padding-top: 40px !important; text-align: center; min-height: 86vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .hero h2 { font-family: 'Fraunces', Georgia, serif; font-weight: 400; font-size: clamp(33px,9.5vw,44px); line-height: 1.08; letter-spacing: -.01em; }
        .hero h2 em, .closing h3 em { font-style: italic; color: #D99B54; }
        .photo { background: #FFF; border-radius: 6px; padding: 9px 9px 34px; box-shadow: 0 14px 36px rgba(53,48,43,.10); transform: rotate(-2.2deg); }
        .photo img, .imgPlaceholder { width: 206px; height: 206px; border-radius: 3px; display: flex; object-fit: cover; align-items: center; justify-content: center; background: linear-gradient(150deg,#E9DFCF,#CBB9AE); color: rgba(53,48,43,.42); font-weight: 700; font-size: 12px; letter-spacing: .04em; }
        .cap { margin-top: 12px; font-family: 'Fraunces', Georgia, serif; font-style: italic; color: #948A7C; font-size: 13.5px; }
        .hero .photo { margin: 32px 0 28px; }
        .music { display: inline-flex; align-items: center; gap: 11px; background: #FFF; border: 1px solid rgba(53,48,43,.09); padding: 9px 16px 9px 13px; border-radius: 100px; font-size: 13px; color: #948A7C; box-shadow: 0 6px 16px rgba(53,48,43,.06); }
        .music b { color: #35302B; }
        .eq { display: flex; align-items: flex-end; gap: 2.5px; height: 14px; }
        .eq i { width: 3px; background: #D99B54; border-radius: 2px; animation: bounce 1s ease-in-out infinite; }
        .eq i:nth-child(2) { animation-delay: .2s; } .eq i:nth-child(3) { animation-delay: .4s; } .eq i:nth-child(4) { animation-delay: .15s; }
        @keyframes bounce { 0%,100% { height: 4px; } 50% { height: 14px; } }
        .scrollcue { margin-top: 42px; color: #948A7C; font-size: 11px; letter-spacing: .22em; text-transform: uppercase; }
        .arrow { display: block; margin: 10px auto 0; width: 1px; height: 32px; background: linear-gradient(#D99B54,transparent); }
        .counter { text-align: center; background: #F4EDE1; }
        .counter .num { font-family: 'Fraunces', Georgia, serif; font-weight: 500; color: #D99B54; font-size: clamp(54px,16vw,74px); line-height: 1; letter-spacing: -.02em; }
        .counter .lbl { margin-top: 14px; font-size: 17px; font-weight: 600; }
        .counterSub { margin-top: 6px; color: #948A7C; font-size: 13.5px; }
        .gallery { text-align: center; }
        .gallery h3 { font-family: 'Fraunces', Georgia, serif; font-weight: 400; font-size: 27px; margin-bottom: 6px; }
        .gallerySub { color: #948A7C; font-size: 14px; margin-bottom: 32px; }
        .strip { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
        .photo.small { transform: rotate(2deg) scale(.92); }
        .photo.small:first-child { transform: rotate(-3deg) scale(.92); }
        .photo.small img, .smallPlaceholder { width: 118px; height: 118px; object-fit: cover; border-radius: 3px; display: flex; align-items: center; justify-content: center; background: linear-gradient(150deg,#DCE0DE,#B9C3C9); color: rgba(53,48,43,.42); font-size: 12px; }
        .lockedWrap { position: relative; min-height: 530px; }
        .locked { filter: blur(6px); opacity: .55; pointer-events: none; user-select: none; }
        .lockcard { position: absolute; left: 50%; top: 40px; transform: translateX(-50%); width: min(360px,87%); z-index: 20; text-align: center; background: #FFF; border: 1px solid rgba(53,48,43,.09); border-radius: 20px; padding: 32px 26px 28px; box-shadow: 0 24px 54px rgba(53,48,43,.18); }
        .seal { width: 52px; height: 52px; margin: 0 auto 16px; border-radius: 50%; background: radial-gradient(circle at 40% 35%,#EEC98F,#D99B54 62%,#c07f36); display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 18px rgba(217,155,84,.34); }
        .seal svg { width: 23px; height: 23px; }
        .lockcard h3 { font-family: 'Fraunces', Georgia, serif; font-weight: 500; font-size: 22px; line-height: 1.15; margin-bottom: 10px; }
        .lockcard p { color: #948A7C; font-size: 14px; line-height: 1.55; margin-bottom: 8px; }
        .unlocks { list-style: none; margin: 16px 0 22px; text-align: left; display: inline-block; }
        .unlocks li { font-size: 14px; padding: 5px 0 5px 26px; position: relative; }
        .unlocks li::before { content: ''; position: absolute; left: 0; top: 7px; width: 16px; height: 16px; border-radius: 50%; background: rgba(217,155,84,.16); }
        .unlocks li::after { content: ''; position: absolute; left: 5px; top: 10px; width: 5px; height: 8px; border: 2px solid #D99B54; border-top: 0; border-left: 0; transform: rotate(42deg); }
        .previewCta { display: block; width: 100%; border: 0; cursor: pointer; background: linear-gradient(180deg,#EEC98F,#D99B54); color: #4a3212; font-weight: 800; font-size: 16px; padding: 15px; border-radius: 12px; box-shadow: 0 12px 24px rgba(217,155,84,.30); }
        .price { margin-top: 12px; font-size: 13px; color: #948A7C; }
        .letter { text-align: center; max-width: 340px; margin: 0 auto; }
        .letterLabel { color: #D99B54; font-size: 11.5px; letter-spacing: .3em; text-transform: uppercase; margin-bottom: 18px; font-weight: 800; }
        .letter p { font-family: 'Fraunces', Georgia, serif; font-style: italic; font-size: 18px; line-height: 1.6; }
        .closing { text-align: center; padding-bottom: 74px !important; background: #F4EDE1; }
        .closing h3 { font-family: 'Fraunces', Georgia, serif; font-weight: 500; font-size: 30px; }

        @media (max-width: 840px) {
          .page { padding-top: 28px; }
          .form { position: static; max-width: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .reveal { animation: none; opacity: 1; transform: none; }
          .eq i { animation: none; height: 9px; }
        }
      `}</style>
    </>
  );
}
