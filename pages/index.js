import { useState } from 'react';

// lê um arquivo de imagem e devolve em base64 (pra mandar pro servidor)
function lerBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// conta os dias desde a data escolhida
function diasDesde(dataStr) {
  const d = new Date(dataStr);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000).toLocaleString('pt-BR');
}

export default function Home() {
  const [nome, setNome] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [musica, setMusica] = useState('');
  const [data, setData] = useState('');
  const [fotos, setFotos] = useState([]);      // base64
  const [enviando, setEnviando] = useState(false);

  async function onFotos(e) {
    const arquivos = Array.from(e.target.files).slice(0, 3); // até 3 fotos
    const b64 = await Promise.all(arquivos.map(lerBase64));
    setFotos(b64);
  }

  async function pagar() {
    if (!nome || fotos.length === 0) {
      alert('Preencha ao menos o nome do pai e uma foto.');
      return;
    }
    setEnviando(true);
    try {
      const resp = await fetch('/api/criar-pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_pai: nome,
          mensagem,
          musica_url: musica,
          data_referencia: data,
          fotos,
        }),
      });
      const dados = await resp.json();
      if (dados.checkoutUrl) {
        window.location.href = dados.checkoutUrl; // vai pro checkout da Wiapy
      } else {
        alert('Algo deu errado. Tente de novo.');
        setEnviando(false);
      }
    } catch (err) {
      alert('Erro de conexão. Tente de novo.');
      setEnviando(false);
    }
  }

  const dias = diasDesde(data);

  return (
    <div className="page">
      {/* ---------- FORMULÁRIO ---------- */}
      <div className="form">
        <h1>Monte a homenagem do seu pai</h1>
        <p className="sub">Preencha, veja a prévia ao lado e finalize. Leva 3 minutos.</p>

        <label>Nome do pai
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Seu João" />
        </label>

        <label>Fotos (até 3)
          <input type="file" accept="image/*" multiple onChange={onFotos} />
        </label>

        <label>Uma data especial de vocês
          <input type="date" value={data} onChange={e => setData(e.target.value)} />
          <small>Alimenta o contador "há X dias você é meu herói".</small>
        </label>

        <label>Link da música no YouTube
          <input value={musica} onChange={e => setMusica(e.target.value)} placeholder="Cole o link do YouTube" />
        </label>

        <label>A mensagem pro seu pai
          <textarea rows={5} value={mensagem} onChange={e => setMensagem(e.target.value)}
            placeholder="Escreva com o coração..." />
        </label>

        <button className="cta" onClick={pagar} disabled={enviando}>
          {enviando ? 'Preparando...' : 'Finalizar e receber meu QR Code'}
        </button>
        <div className="preco">pagamento único · R$ 9,90</div>
      </div>

      {/* ---------- PRÉVIA PARCIAL ---------- */}
      <div className="stage">
        <div className="phone">
          <div className="ribbon">prévia · antes do pagamento</div>

          <div className="hero">
            <div className="eyebrow">Feliz Dia dos Pais</div>
            <h2>Para você,<br /><em>{nome || 'seu pai'}</em></h2>
            {fotos[0]
              ? <div className="ph"><img src={fotos[0]} alt="" /></div>
              : <div className="ph vazio">a foto aparece aqui</div>}
            <div className="music"><span className="eq"><i></i><i></i><i></i></span> tocando a nossa música</div>
          </div>

          <div className="counter">
            <div className="num">{dias || '—'}</div>
            <div className="lbl">dias sendo o meu herói</div>
          </div>

          {/* trava: o resto só depois de pagar */}
          <div className="lock">
            🔒 A carta, a retrospectiva completa e o seu QR Code<br />são liberados após o pagamento.
          </div>
        </div>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Nunito Sans', system-ui, sans-serif; color: #35302B; background: #F4EDE1; }
      `}</style>
      <style jsx>{`
        .page { display: flex; flex-wrap: wrap; gap: 32px; max-width: 980px; margin: 0 auto; padding: 40px 20px; align-items: flex-start; }
        .form { flex: 1 1 340px; }
        .form h1 { font-family: 'Fraunces', serif; font-weight: 500; font-size: 28px; }
        .sub { color: #948A7C; margin: 8px 0 24px; }
        label { display: block; font-weight: 700; font-size: 14px; margin-bottom: 16px; }
        input, textarea { display: block; width: 100%; margin-top: 6px; padding: 12px 14px; border: 1px solid #ddd3c4;
          border-radius: 10px; font: inherit; background: #fff; }
        small { display: block; color: #948A7C; font-weight: 400; margin-top: 5px; }
        .cta { width: 100%; border: 0; cursor: pointer; margin-top: 8px; padding: 15px;
          background: linear-gradient(180deg,#EEC98F,#D99B54); color: #4a3212; font-weight: 800; font-size: 16px;
          border-radius: 12px; }
        .cta:disabled { opacity: .6; cursor: default; }
        .preco { text-align: center; color: #948A7C; font-size: 13px; margin-top: 10px; }

        .stage { flex: 1 1 300px; display: flex; justify-content: center; }
        .phone { width: 320px; background: #FBF8F2; border-radius: 20px; overflow: hidden;
          box-shadow: 0 20px 50px rgba(53,48,43,.18); }
        .ribbon { background: #fff; border-bottom: 1px solid #eee2d2; color: #948A7C; font-size: 11px;
          text-transform: uppercase; letter-spacing: .05em; font-weight: 700; text-align: center; padding: 9px; }
        .hero { text-align: center; padding: 34px 22px 26px; }
        .eyebrow { color: #D99B54; font-size: 11px; letter-spacing: .28em; text-transform: uppercase; font-weight: 800; }
        .hero h2 { font-family: 'Fraunces', serif; font-weight: 400; font-size: 26px; margin: 14px 0 20px; }
        .hero h2 em { color: #D99B54; font-style: italic; }
        .ph { background: #fff; padding: 8px 8px 26px; border-radius: 5px; display: inline-block;
          box-shadow: 0 12px 28px rgba(53,48,43,.12); transform: rotate(-2deg); }
        .ph img { width: 150px; height: 150px; object-fit: cover; border-radius: 3px; display: block; }
        .ph.vazio { width: 166px; height: 176px; display: flex; align-items: center; justify-content: center;
          color: #b9ac9a; font-size: 12px; transform: none; }
        .music { margin-top: 20px; display: inline-flex; align-items: center; gap: 9px; background: #fff;
          border: 1px solid #eee2d2; padding: 8px 14px; border-radius: 100px; font-size: 12px; color: #948A7C; }
        .eq { display: flex; align-items: flex-end; gap: 2px; height: 12px; }
        .eq i { width: 3px; background: #D99B54; border-radius: 2px; height: 6px; animation: b 1s infinite ease-in-out; }
        .eq i:nth-child(2){ animation-delay:.2s } .eq i:nth-child(3){ animation-delay:.4s }
        @keyframes b { 0%,100%{height:3px} 50%{height:12px} }
        .counter { text-align: center; background: #F4EDE1; padding: 30px 20px; }
        .counter .num { font-family: 'Fraunces', serif; color: #D99B54; font-size: 46px; font-weight: 500; line-height: 1; }
        .counter .lbl { margin-top: 8px; font-weight: 600; font-size: 14px; }
        .lock { text-align: center; padding: 26px 22px 34px; color: #948A7C; font-size: 13px; line-height: 1.5;
          background: repeating-linear-gradient(#FBF8F2,#FBF8F2 6px,#f6efe4 6px,#f6efe4 12px); }
      `}</style>
    </div>
  );
}
