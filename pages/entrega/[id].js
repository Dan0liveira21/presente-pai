import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

const TERMINAIS = new Set(['paid', 'expired', 'refunded', 'chargedback']);

export default function Entrega() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const [pedido, setPedido] = useState({ status: 'loading' });
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!id) return undefined;
    let ativo = true;
    let timer;

    async function consultar() {
      try {
        const resposta = await fetch(`/api/pedidos/${encodeURIComponent(id)}/status`, { cache: 'no-store' });
        const dados = await resposta.json();
        if (!ativo) return;

        if (!resposta.ok) {
          setPedido({ status: 'error', mensagem: dados.erro || 'Não foi possível consultar o pedido.' });
          return;
        }

        setPedido(dados);
        if (!TERMINAIS.has(dados.status)) timer = window.setTimeout(consultar, 3000);
      } catch {
        if (!ativo) return;
        setPedido((atual) => atual.status === 'paid' ? atual : { status: 'pending' });
        timer = window.setTimeout(consultar, 5000);
      }
    }

    consultar();
    return () => {
      ativo = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [id]);

  async function copiarLink() {
    if (!pedido.link) return;
    try {
      await navigator.clipboard.writeText(pedido.link);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      window.prompt('Copie o link da homenagem:', pedido.link);
    }
  }

  function baixarQr() {
    if (!pedido.qrCode) return;
    const link = document.createElement('a');
    link.href = pedido.qrCode;
    link.download = 'qr-code-homenagem-dia-dos-pais.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const pendente = ['loading', 'pending', 'unpaid'].includes(pedido.status);
  const cancelado = ['refunded', 'chargedback'].includes(pedido.status);

  return (
    <>
      <Head>
        <title>Entrega da sua homenagem</title>
        <meta name="description" content="Acompanhe a confirmação e receba o link e o QR Code da sua homenagem." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex,nofollow,noarchive" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Nunito+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <main className="page">
        <div className="card" aria-live="polite">
          <div className="eyebrow">Eternize</div>

          {pendente && (
            <>
              <div className="spinner" aria-hidden="true" />
              <h1>Sua homenagem está salva</h1>
              <p>Finalize o pagamento na outra aba. Assim que a Wiapy confirmar, seu link e seu QR Code aparecerão aqui automaticamente.</p>
              <div className="note">Não feche esta página.</div>
            </>
          )}

          {pedido.status === 'paid' && (
            <>
              <div className="check" aria-hidden="true">✓</div>
              <h1>Seu presente está pronto</h1>
              <p>Agora é só abrir a homenagem, baixar o QR Code e preparar a surpresa.</p>

              {pedido.qrCode && <img className="qr" src={pedido.qrCode} alt="QR Code da homenagem" />}

              <a className="primary" href={pedido.link} target="_blank" rel="noreferrer">Abrir minha homenagem</a>
              <button className="secondary" type="button" onClick={baixarQr}>Baixar QR Code em PNG</button>
              <button className="textButton" type="button" onClick={copiarLink}>{copiado ? 'Link copiado!' : 'Copiar link da homenagem'}</button>

              <div className="access">
                {pedido.vitalicio
                  ? 'Acesso vitalício ativado.'
                  : pedido.expiraEm
                    ? `Acesso disponível até ${new Date(pedido.expiraEm).toLocaleDateString('pt-BR')}.`
                    : 'Acesso disponível por 1 ano.'}
              </div>
            </>
          )}

          {pedido.status === 'expired' && (
            <><div className="lock">🔒</div><h1>O período de acesso terminou</h1><p>Esta homenagem não está mais disponível.</p></>
          )}

          {cancelado && (
            <><div className="lock">🔒</div><h1>O acesso foi desativado</h1><p>O pagamento desta homenagem foi cancelado ou estornado.</p></>
          )}

          {pedido.status === 'error' && (
            <><div className="lock">!</div><h1>Não conseguimos consultar agora</h1><p>{pedido.mensagem}</p><button className="secondary" type="button" onClick={() => router.reload()}>Tentar novamente</button></>
          )}
        </div>
      </main>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #__next { min-height: 100%; }
        body { font-family: 'Nunito Sans', system-ui, sans-serif; color: #35302B; background: #ECE4D6; -webkit-font-smoothing: antialiased; }
        button, a { font: inherit; }
      `}</style>
      <style jsx>{`
        .page { min-height: 100vh; padding: 32px 18px; display: flex; align-items: center; justify-content: center; background: radial-gradient(80% 55% at 50% 0%, #FFFDF9, transparent 65%), #F4EDE1; }
        .card { width: 100%; max-width: 430px; text-align: center; background: #FBF8F2; border: 1px solid rgba(53,48,43,.08); border-radius: 24px; padding: 42px 28px 34px; box-shadow: 0 24px 60px rgba(53,48,43,.16); }
        .eyebrow { color: #D99B54; font-size: 11.5px; letter-spacing: .3em; text-transform: uppercase; font-weight: 800; margin-bottom: 22px; }
        h1 { font-family: 'Fraunces', Georgia, serif; font-size: clamp(29px,8vw,38px); line-height: 1.08; font-weight: 500; margin: 18px 0 12px; }
        p { color: #948A7C; font-size: 14.5px; line-height: 1.58; max-width: 340px; margin: 0 auto; }
        .spinner { width: 50px; height: 50px; margin: 0 auto; border-radius: 50%; border: 4px solid #F0E5D5; border-top-color: #D99B54; animation: girar .9s linear infinite; }
        @keyframes girar { to { transform: rotate(360deg); } }
        .check, .lock { width: 54px; height: 54px; margin: 0 auto; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at 40% 35%,#EEC98F,#D99B54 65%); color: #4a3212; font-size: 26px; font-weight: 800; box-shadow: 0 9px 20px rgba(217,155,84,.28); }
        .note, .access { margin-top: 22px; border-radius: 12px; padding: 11px 13px; background: #F4EDE1; color: #766b5f; font-size: 13px; }
        .qr { display: block; width: min(240px,80%); aspect-ratio: 1; object-fit: contain; margin: 28px auto 22px; background: #FFF; border-radius: 16px; padding: 12px; box-shadow: 0 12px 28px rgba(53,48,43,.11); }
        .primary, .secondary { display: block; width: 100%; border-radius: 12px; padding: 15px; font-weight: 800; text-decoration: none; cursor: pointer; }
        .primary { border: 0; background: linear-gradient(180deg,#EEC98F,#D99B54); color: #4a3212; box-shadow: 0 12px 24px rgba(217,155,84,.28); }
        .secondary { margin-top: 11px; background: #FFF; color: #35302B; border: 1px solid #ddd3c4; }
        .textButton { margin: 15px auto 0; border: 0; background: none; color: #8b6a40; font-weight: 700; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
        @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
      `}</style>
    </>
  );
}
