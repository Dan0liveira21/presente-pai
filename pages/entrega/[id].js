import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';

const TERMINAIS = new Set(['paid', 'expired', 'refunded', 'chargedback']);
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MAX_GRAVACAO_SEGUNDOS = 180;
const TIPOS_ACEITOS = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
]);

function tipoPeloNome(nome) {
  const extensao = String(nome || '').toLowerCase().split('.').pop();
  if (extensao === 'mp3') return 'audio/mpeg';
  if (extensao === 'm4a' || extensao === 'mp4') return 'audio/mp4';
  if (extensao === 'webm') return 'audio/webm';
  if (extensao === 'ogg' || extensao === 'oga') return 'audio/ogg';
  if (extensao === 'wav') return 'audio/wav';
  return '';
}

function extensaoPeloTipo(tipo) {
  const limpo = String(tipo || '').split(';')[0].toLowerCase();
  if (limpo === 'audio/mpeg' || limpo === 'audio/mp3') return 'mp3';
  if (limpo === 'audio/mp4' || limpo === 'audio/x-m4a') return 'm4a';
  if (limpo === 'audio/ogg') return 'ogg';
  if (limpo === 'audio/wav' || limpo === 'audio/x-wav') return 'wav';
  return 'webm';
}

function formatarTempo(segundos) {
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

function tipoParaGravacao() {
  if (typeof MediaRecorder === 'undefined') return '';
  const opcoes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return opcoes.find((tipo) => MediaRecorder.isTypeSupported?.(tipo)) || '';
}


function carregarImagem(url) {
  return new Promise(async (resolve, reject) => {
    let urlTemporaria = '';
    try {
      let origem = url;
      if (!String(url || '').startsWith('data:')) {
        const resposta = await fetch(url, { mode: 'cors', cache: 'no-store' });
        if (!resposta.ok) throw new Error('Não foi possível carregar uma das imagens.');
        urlTemporaria = URL.createObjectURL(await resposta.blob());
        origem = urlTemporaria;
      }

      const imagem = new Image();
      imagem.onload = () => {
        if (urlTemporaria) URL.revokeObjectURL(urlTemporaria);
        resolve(imagem);
      };
      imagem.onerror = () => {
        if (urlTemporaria) URL.revokeObjectURL(urlTemporaria);
        reject(new Error('Não foi possível carregar uma das imagens.'));
      };
      imagem.src = origem;
    } catch (error) {
      if (urlTemporaria) URL.revokeObjectURL(urlTemporaria);
      reject(error);
    }
  });
}

function caminhoArredondado(ctx, x, y, largura, altura, raio) {
  const r = Math.min(raio, largura / 2, altura / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + largura, y, x + largura, y + altura, r);
  ctx.arcTo(x + largura, y + altura, x, y + altura, r);
  ctx.arcTo(x, y + altura, x, y, r);
  ctx.arcTo(x, y, x + largura, y, r);
  ctx.closePath();
}

function desenharCover(ctx, imagem, x, y, largura, altura, raio = 0) {
  const escala = Math.max(largura / imagem.width, altura / imagem.height);
  const destinoLargura = imagem.width * escala;
  const destinoAltura = imagem.height * escala;
  const destinoX = x + (largura - destinoLargura) / 2;
  const destinoY = y + (altura - destinoAltura) / 2;

  ctx.save();
  if (raio) {
    caminhoArredondado(ctx, x, y, largura, altura, raio);
    ctx.clip();
  }
  ctx.drawImage(imagem, destinoX, destinoY, destinoLargura, destinoAltura);
  ctx.restore();
}

function linhasDoTexto(ctx, texto, larguraMaxima, maxLinhas = 3) {
  const palavras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';

  for (const palavra of palavras) {
    const teste = atual ? `${atual} ${palavra}` : palavra;
    if (ctx.measureText(teste).width <= larguraMaxima) {
      atual = teste;
    } else {
      if (atual) linhas.push(atual);
      atual = palavra;
      if (linhas.length >= maxLinhas - 1) break;
    }
  }
  if (atual && linhas.length < maxLinhas) linhas.push(atual);

  const usadas = linhas.join(' ').split(/\s+/).length;
  if (usadas < palavras.length && linhas.length) {
    let ultima = linhas[linhas.length - 1];
    while (ultima && ctx.measureText(`${ultima}…`).width > larguraMaxima) {
      ultima = ultima.split(' ').slice(0, -1).join(' ');
    }
    linhas[linhas.length - 1] = `${ultima || ''}…`;
  }
  return linhas;
}

function fraseCurta(mensagem) {
  const limpa = String(mensagem || '').replace(/\s+/g, ' ').trim();
  if (!limpa) return 'Você é meu exemplo de amor, força e carinho.';
  const primeira = limpa.split(/(?<=[.!?])\s+/)[0] || limpa;
  return primeira.length <= 135 ? primeira : `${primeira.slice(0, 132).trim()}…`;
}

function nomeArquivo(nome) {
  const base = String(nome || 'pai')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return base || 'pai';
}

export default function Entrega() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const token = typeof router.query.token === 'string' ? router.query.token : '';
  const [pedido, setPedido] = useState({ status: 'loading' });
  const [copiado, setCopiado] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [audioPendente, setAudioPendente] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [enviandoAudio, setEnviandoAudio] = useState(false);
  const [audioMensagem, setAudioMensagem] = useState('');
  const [audioErro, setAudioErro] = useState('');
  const [gerandoCartao, setGerandoCartao] = useState(false);
  const [cartaoErro, setCartaoErro] = useState('');

  const gravadorRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!id) return undefined;
    let ativo = true;
    let timer;

    async function consultar() {
      try {
        const query = token ? `?token=${encodeURIComponent(token)}` : '';
        const resposta = await fetch(`/api/pedidos/${encodeURIComponent(id)}/status${query}`, { cache: 'no-store' });
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
  }, [id, token]);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

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

  function definirAudio(file) {
    setAudioErro('');
    setAudioMensagem('');

    if (!file) return;
    const tipo = String(file.type || tipoPeloNome(file.name)).toLowerCase().split(';')[0];
    if (!TIPOS_ACEITOS.has(tipo)) {
      setAudioErro('Use um áudio em MP3, M4A, WAV, OGG ou WEBM.');
      return;
    }
    if (!file.size || file.size > MAX_AUDIO_BYTES) {
      setAudioErro('O áudio deve ter no máximo 15 MB.');
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setAudioPendente(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function escolherArquivo(evento) {
    const file = evento.target.files?.[0];
    evento.target.value = '';
    definirAudio(file);
  }

  function limparPendente() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setAudioPendente(null);
    setAudioErro('');
  }

  async function iniciarGravacao() {
    setAudioErro('');
    setAudioMensagem('');

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setAudioErro('Este navegador não permite gravar. Use a opção “Escolher áudio”.');
      return;
    }

    try {
      limparPendente();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const tipo = tipoParaGravacao();
      const gravador = tipo ? new MediaRecorder(stream, { mimeType: tipo }) : new MediaRecorder(stream);
      gravadorRef.current = gravador;

      gravador.ondataavailable = (evento) => {
        if (evento.data?.size) chunksRef.current.push(evento.data);
      };

      gravador.onstop = () => {
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setGravando(false);

        const mimeType = gravador.mimeType || tipo || 'audio/webm';
        const tipoBase = mimeType.split(';')[0];
        const blob = new Blob(chunksRef.current, { type: tipoBase });
        chunksRef.current = [];

        if (!blob.size) {
          setAudioErro('A gravação ficou vazia. Tente novamente.');
          return;
        }

        const extensao = extensaoPeloTipo(tipoBase);
        definirAudio(new File([blob], `mensagem-de-voz.${extensao}`, { type: tipoBase }));
      };

      gravador.start(500);
      setSegundos(0);
      setGravando(true);
      timerRef.current = window.setInterval(() => {
        setSegundos((atual) => {
          const proximo = atual + 1;
          if (proximo >= MAX_GRAVACAO_SEGUNDOS) {
            window.setTimeout(() => pararGravacao(), 0);
          }
          return proximo;
        });
      }, 1000);
    } catch (error) {
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setGravando(false);
      setAudioErro(error?.name === 'NotAllowedError'
        ? 'Permita o uso do microfone para gravar a mensagem.'
        : 'Não foi possível iniciar a gravação. Use a opção “Escolher áudio”.');
    }
  }

  function pararGravacao() {
    const gravador = gravadorRef.current;
    if (gravador && gravador.state !== 'inactive') gravador.stop();
  }

  async function enviarAudio() {
    if (!audioPendente || !id || !token) return;
    setEnviandoAudio(true);
    setAudioErro('');
    setAudioMensagem('Preparando o envio...');

    try {
      const tipo = String(audioPendente.type || tipoPeloNome(audioPendente.name)).toLowerCase().split(';')[0];
      const preparar = await fetch(`/api/pedidos/${encodeURIComponent(id)}/audio-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, tipo, tamanho: audioPendente.size }),
      });
      const dadosPreparar = await preparar.json();
      if (!preparar.ok || !dadosPreparar.signedUrl || !dadosPreparar.path) {
        throw new Error(dadosPreparar.erro || 'Não foi possível preparar o envio.');
      }

      setAudioMensagem('Enviando sua mensagem de voz...');
      const formulario = new FormData();
      formulario.append('cacheControl', '31536000');
      formulario.append('', audioPendente);

      const upload = await fetch(dadosPreparar.signedUrl, {
        method: 'PUT',
        headers: { 'x-upsert': 'false' },
        body: formulario,
      });

      if (!upload.ok) {
        const detalhe = await upload.text().catch(() => '');
        console.error('Falha no upload direto do áudio:', upload.status, detalhe);
        throw new Error('O envio do áudio falhou. Tente novamente.');
      }

      setAudioMensagem('Finalizando...');
      const confirmar = await fetch(`/api/pedidos/${encodeURIComponent(id)}/audio-confirmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, path: dadosPreparar.path }),
      });
      const dadosConfirmar = await confirmar.json();
      if (!confirmar.ok || !dadosConfirmar.audioUrl) {
        throw new Error(dadosConfirmar.erro || 'Não foi possível concluir o envio.');
      }

      setPedido((atual) => ({ ...atual, audioUrl: dadosConfirmar.audioUrl }));
      limparPendente();
      setAudioMensagem('Mensagem de voz adicionada à homenagem!');
    } catch (error) {
      setAudioMensagem('');
      setAudioErro(error.message || 'Não foi possível enviar o áudio.');
    } finally {
      setEnviandoAudio(false);
    }
  }

  async function baixarCartao() {
    if (!pedido.cartaoPremium || !pedido.fotoPrincipal || !pedido.qrCode) return;
    setGerandoCartao(true);
    setCartaoErro('');

    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const [foto, qrCode] = await Promise.all([
        carregarImagem(pedido.fotoPrincipal),
        carregarImagem(pedido.qrCode),
      ]);

      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1450;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Seu navegador não conseguiu gerar o cartão.');

      const fundo = ctx.createLinearGradient(0, 0, 0, canvas.height);
      fundo.addColorStop(0, '#FFFEFB');
      fundo.addColorStop(1, '#F6EFE4');
      ctx.fillStyle = fundo;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Base do cartão.
      ctx.save();
      ctx.shadowColor = 'rgba(53,48,43,.12)';
      ctx.shadowBlur = 34;
      ctx.shadowOffsetY = 14;
      ctx.fillStyle = '#FFFDF9';
      caminhoArredondado(ctx, 48, 48, 984, 1354, 42);
      ctx.fill();
      ctx.restore();

      // Moldura externa e interna.
      ctx.strokeStyle = '#D9A86A';
      ctx.lineWidth = 4;
      caminhoArredondado(ctx, 62, 62, 956, 1326, 34);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(217,168,106,.28)';
      ctx.lineWidth = 2;
      caminhoArredondado(ctx, 76, 76, 928, 1298, 28);
      ctx.stroke();

      // Cantos decorativos.
      ctx.fillStyle = '#D9656A';
      ctx.font = '700 24px "Nunito Sans", Arial, sans-serif';
      ctx.fillText('♡', 100, 102);
      ctx.fillText('♡', 956, 102);
      ctx.fillText('♡', 100, 1366);
      ctx.fillText('♡', 956, 1366);

      // Marca e título.
      ctx.textAlign = 'center';
      ctx.fillStyle = '#D9656A';
      ctx.font = '700 25px "Nunito Sans", Arial, sans-serif';
      ctx.fillText('E T E R N I Z E', 540, 136);
      ctx.fillRect(405, 182, 110, 2);
      ctx.fillText('♥', 540, 192);
      ctx.fillRect(565, 182, 110, 2);

      ctx.fillStyle = '#2E2621';
      ctx.font = '500 78px Fraunces, Georgia, serif';
      ctx.fillText('Feliz Dia dos', 540, 288);
      ctx.fillStyle = '#E16F67';
      ctx.font = '600 108px Fraunces, Georgia, serif';
      ctx.fillText('Pais', 540, 390);

      const nome = String(pedido.nomePai || 'Pai').trim();
      ctx.fillStyle = '#7E6B5E';
      ctx.font = '700 30px "Nunito Sans", Arial, sans-serif';
      ctx.fillText(`Uma homenagem para ${nome}`, 540, 442);

      // Bloco da foto principal.
      ctx.save();
      ctx.shadowColor = 'rgba(53,48,43,.14)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 10;
      ctx.fillStyle = '#FFFFFF';
      caminhoArredondado(ctx, 130, 500, 820, 460, 30);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#E2B27D';
      ctx.lineWidth = 3;
      caminhoArredondado(ctx, 130, 500, 820, 460, 30);
      ctx.stroke();
      desenharCover(ctx, foto, 148, 518, 784, 424, 22);

      // Frase curta.
      ctx.fillStyle = '#D9656A';
      ctx.font = '700 28px "Nunito Sans", Arial, sans-serif';
      ctx.fillRect(320, 1016, 140, 2);
      ctx.fillText('♥', 540, 1026);
      ctx.fillRect(620, 1016, 140, 2);

      ctx.fillStyle = '#4A3E35';
      ctx.font = '500 34px Fraunces, Georgia, serif';
      const linhas = linhasDoTexto(ctx, fraseCurta(pedido.mensagemCartao), 760, 3);
      const inicioY = 1084 - ((linhas.length - 1) * 20);
      linhas.forEach((linha, indice) => ctx.fillText(linha, 540, inicioY + indice * 46));

      // QR Code alinhado e com folga.
      const qrBoxX = 395;
      const qrBoxY = 1132;
      const qrBoxSize = 290;
      ctx.save();
      ctx.shadowColor = 'rgba(53,48,43,.12)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#FFFFFF';
      caminhoArredondado(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 24);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#E5B98D';
      ctx.lineWidth = 2;
      caminhoArredondado(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 24);
      ctx.stroke();
      ctx.drawImage(qrCode, qrBoxX + 25, qrBoxY + 25, 240, 240);

      ctx.fillStyle = '#7B6A5C';
      ctx.font = '700 24px "Nunito Sans", Arial, sans-serif';
      ctx.fillText('Escaneie para abrir a homenagem', 540, 1400);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Não foi possível finalizar o cartão.');

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cartao-dia-dos-pais-${nomeArquivo(pedido.nomePai)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (error) {
      console.error('Erro ao gerar cartão:', error);
      setCartaoErro('Não foi possível gerar o cartão agora. Atualize a página e tente novamente.');
    } finally {
      setGerandoCartao(false);
    }
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
        <meta name="referrer" content="no-referrer" />
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
              <div className="noteBox">Não feche esta página.</div>
            </>
          )}

          {pedido.status === 'paid' && (
            <>
              <div className="check" aria-hidden="true">✓</div>
              <h1>Seu presente está pronto</h1>
              <p>Agora é só finalizar os detalhes e preparar a surpresa.</p>

              {pedido.temAudio && pedido.podeGerenciar && (
                <section className="audioCard">
                  <div className="audioIcon" aria-hidden="true">♪</div>
                  <h2>{pedido.audioUrl ? 'Mensagem de voz adicionada' : 'Adicione sua mensagem de voz'}</h2>
                  <p>{pedido.audioUrl
                    ? 'O áudio já está dentro da homenagem. Você pode ouvi-lo ou substituir a gravação.'
                    : 'Grave agora ou escolha um áudio pronto. Limite de 3 minutos para gravações e 15 MB por arquivo.'}</p>

                  {pedido.audioUrl && !audioPendente && !gravando && (
                    <audio className="audioPlayer" controls src={pedido.audioUrl} preload="metadata">
                      Seu navegador não suporta áudio.
                    </audio>
                  )}

                  {gravando && (
                    <div className="recording">
                      <span className="recordDot" />
                      Gravando {formatarTempo(segundos)}
                      <button type="button" className="stopButton" onClick={pararGravacao}>Parar gravação</button>
                    </div>
                  )}

                  {previewUrl && audioPendente && !gravando && (
                    <div className="preview">
                      <audio className="audioPlayer" controls src={previewUrl} preload="metadata">
                        Seu navegador não suporta áudio.
                      </audio>
                      <div className="previewActions">
                        <button type="button" className="uploadButton" disabled={enviandoAudio} onClick={enviarAudio}>
                          {enviandoAudio ? 'Enviando...' : 'Adicionar à homenagem'}
                        </button>
                        <button type="button" className="discardButton" disabled={enviandoAudio} onClick={limparPendente}>Descartar</button>
                      </div>
                    </div>
                  )}

                  {!gravando && !audioPendente && (
                    <div className="audioActions">
                      <button type="button" className="recordButton" onClick={iniciarGravacao}>Gravar agora</button>
                      <label className="fileButton">
                        Escolher áudio
                        <input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" onChange={escolherArquivo} />
                      </label>
                    </div>
                  )}

                  {audioMensagem && <div className="audioSuccess">{audioMensagem}</div>}
                  {audioErro && <div className="audioError">{audioErro}</div>}
                </section>
              )}

              {pedido.cartaoPremium && pedido.podeGerenciar && (
                <section className="cartaoCard">
                  <div className="cartaoIcon" aria-hidden="true">▣</div>
                  <h2>Seu cartão digital personalizado</h2>
                  <p>Gerado automaticamente com a primeira foto, o nome do pai, uma mensagem e o QR Code da homenagem.</p>
                  <button
                    className="cartaoButton"
                    type="button"
                    disabled={gerandoCartao}
                    onClick={baixarCartao}
                  >
                    {gerandoCartao ? 'Gerando cartão...' : 'Baixar cartão personalizado'}
                  </button>
                  {cartaoErro && <div className="audioError">{cartaoErro}</div>}
                </section>
              )}

              {pedido.qrCode && <img className="qr" src={pedido.qrCode} alt="QR Code da homenagem" />}

              <a className="primary" href={pedido.link} target="_blank" rel="noreferrer" referrerPolicy="no-referrer">Abrir minha homenagem</a>
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
        button, a, input { font: inherit; }
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
        .noteBox, .access { margin-top: 22px; border-radius: 12px; padding: 11px 13px; background: #F4EDE1; color: #766b5f; font-size: 13px; }
        .qr { display: block; width: min(240px,80%); aspect-ratio: 1; object-fit: contain; margin: 28px auto 22px; background: #FFF; border-radius: 16px; padding: 12px; box-shadow: 0 12px 28px rgba(53,48,43,.11); }
        .primary, .secondary { display: block; width: 100%; border-radius: 12px; padding: 15px; font-weight: 800; text-decoration: none; cursor: pointer; }
        .primary { border: 0; background: linear-gradient(180deg,#EEC98F,#D99B54); color: #4a3212; box-shadow: 0 12px 24px rgba(217,155,84,.28); }
        .secondary { margin-top: 11px; background: #FFF; color: #35302B; border: 1px solid #ddd3c4; }
        .textButton { margin: 15px auto 0; border: 0; background: none; color: #8b6a40; font-weight: 700; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }

        .audioCard { margin: 28px 0 0; padding: 24px 18px 20px; background: #F4EDE1; border: 1px solid rgba(217,155,84,.22); border-radius: 18px; }
        .audioIcon { width: 42px; height: 42px; margin: 0 auto 12px; border-radius: 50%; display: grid; place-items: center; background: #FFF8EC; color: #C88437; font-size: 21px; box-shadow: 0 7px 16px rgba(53,48,43,.08); }
        .audioCard h2 { font-family: 'Fraunces', Georgia, serif; font-size: 23px; line-height: 1.15; font-weight: 500; margin-bottom: 8px; }
        .audioCard p { font-size: 13.5px; }
        .audioActions { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 18px; }
        .recordButton, .fileButton, .uploadButton, .discardButton, .stopButton { border-radius: 11px; padding: 12px 10px; font-weight: 800; cursor: pointer; }
        .recordButton { border: 0; background: #35302B; color: #FFF; }
        .fileButton { display: block; border: 1px solid #D8CBB8; background: #FFF; color: #4C443C; }
        .fileButton input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
        .audioPlayer { width: 100%; margin-top: 16px; }
        .recording { margin-top: 18px; padding: 14px; border-radius: 12px; background: #FFF; font-weight: 800; color: #7A2D2D; }
        .recordDot { display: inline-block; width: 9px; height: 9px; margin-right: 7px; border-radius: 50%; background: #C54B4B; animation: piscar 1s infinite; }
        @keyframes piscar { 50% { opacity: .25; } }
        .stopButton { display: block; width: 100%; margin-top: 12px; border: 0; background: #C54B4B; color: #FFF; }
        .preview { margin-top: 8px; }
        .previewActions { display: grid; grid-template-columns: 1.55fr .8fr; gap: 8px; margin-top: 10px; }
        .uploadButton { border: 0; background: linear-gradient(180deg,#EEC98F,#D99B54); color: #4a3212; }
        .discardButton { border: 1px solid #D8CBB8; background: #FFF; color: #6E6255; }
        .uploadButton:disabled, .discardButton:disabled { opacity: .55; cursor: wait; }
        .audioSuccess, .audioError { margin-top: 13px; padding: 10px 11px; border-radius: 10px; font-size: 12.5px; font-weight: 700; line-height: 1.4; }
        .audioSuccess { background: #EAF3E8; color: #3F6B3A; }
        .audioError { background: #F8E4E1; color: #8E3A31; }

        .cartaoCard { margin: 20px 0 0; padding: 24px 18px 20px; background: #FFF9F1; border: 1px solid rgba(217,101,106,.22); border-radius: 18px; }
        .cartaoIcon { width: 42px; height: 42px; margin: 0 auto 12px; border-radius: 50%; display: grid; place-items: center; background: #FBE8E5; color: #D9656A; font-size: 20px; box-shadow: 0 7px 16px rgba(53,48,43,.08); }
        .cartaoCard h2 { font-family: 'Fraunces', Georgia, serif; font-size: 23px; line-height: 1.15; font-weight: 500; margin-bottom: 8px; }
        .cartaoCard p { font-size: 13.5px; }
        .cartaoButton { display: block; width: 100%; margin-top: 17px; border: 0; border-radius: 11px; padding: 13px 10px; background: #D9656A; color: #FFF; font-weight: 800; cursor: pointer; box-shadow: 0 10px 20px rgba(217,101,106,.22); }
        .cartaoButton:disabled { opacity: .62; cursor: wait; }

        @media (prefers-reduced-motion: reduce) { .spinner, .recordDot { animation: none; } }
      `}</style>
    </>
  );
}
