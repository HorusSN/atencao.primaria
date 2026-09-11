const ORIGIN = 'https://portal-antigo.saude.mg.gov.br';
const DOCUMENTOS_PATH = '/resolucoes/documents';
const DOCUMENTOS_URL = `${ORIGIN}${DOCUMENTOS_PATH}`;
const CACHE_TTL_MS = 15 * 60 * 1000;
const META_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_PAGINAS_POR_CONSULTA = 6;
const MAX_DOCUMENTOS = 180;
const cache = new Map();

function erro(mensagem, status = 502) {
  const error = new Error(mensagem);
  error.status = status;
  return error;
}

function decodificarHtml(valor) {
  const entidades = {
    amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>',
    aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', eacute: 'é', ecirc: 'ê',
    iacute: 'í', oacute: 'ó', ocirc: 'ô', otilde: 'õ', uacute: 'ú', ccedil: 'ç',
    Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Atilde: 'Ã', Eacute: 'É', Ecirc: 'Ê',
    Iacute: 'Í', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Uacute: 'Ú', Ccedil: 'Ç'
  };
  return String(valor ?? '')
    .replace(/&#(\d+);?/g, (_, codigo) => String.fromCodePoint(Number(codigo)))
    .replace(/&#x([\da-f]+);?/gi, (_, codigo) => String.fromCodePoint(parseInt(codigo, 16)))
    .replace(/&([a-z]+);/gi, (completo, nome) => entidades[nome] ?? completo);
}

function limparTexto(valor) {
  return decodificarHtml(String(valor ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' '))
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizar(valor) {
  return limparTexto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extrairAtributo(html, nome) {
  const match = String(html || '').match(new RegExp(`\\b${nome}\\s*=\\s*(["'])(.*?)\\1`, 'i'))
    || String(html || '').match(new RegExp(`\\b${nome}\\s*=\\s*([^\\s>]+)`, 'i'));
  return match ? match[2] || match[1] : '';
}

function urlAbsoluta(valor, base = DOCUMENTOS_URL) {
  try { return new URL(decodificarHtml(valor), base).toString(); } catch { return ''; }
}

function validarFiltros(filtros = {}) {
  const ano = String(filtros.ano || '').trim();
  const mes = String(filtros.mes || '').trim();
  const categoria = String(filtros.categoria || '').trim();
  const q = String(filtros.q || '').trim();
  if (ano && !/^\d{4}$/.test(ano)) throw erro('Ano de consulta inválido.', 400);
  if (mes && !/^(?:[1-9]|1[0-2])$/.test(mes)) throw erro('Mês de consulta inválido.', 400);
  if (categoria.length > 120 || q.length > 180) throw erro('Um dos filtros informados é muito extenso.', 400);
  return { ano, mes, categoria, q };
}

function gerarVariantesNumero(valor) {
  const original = String(valor || '').trim();
  const semPontuacao = original.replace(/\D/g, '');
  if (!semPontuacao || !/^\d[\d.\-/\s]*$/.test(original)) return original ? [original] : [''];
  const comPontuacao = semPontuacao.length > 3
    ? `${semPontuacao.slice(0, -3)}.${semPontuacao.slice(-3)}`
    : semPontuacao;
  return [...new Set([original, semPontuacao, comPontuacao])];
}

function montarUrl(filtros, q = filtros.q) {
  const url = new URL(DOCUMENTOS_URL);
  url.searchParams.set('by_year', filtros.ano);
  url.searchParams.set('by_month', filtros.mes);
  url.searchParams.set('by_format', '');
  url.searchParams.set('category_id', filtros.categoria);
  url.searchParams.set('ordering', '');
  url.searchParams.set('q', q || '');
  return url.toString();
}

async function requisitarHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Horus-APS/1.0 (consulta pública de documentos)'
      },
      signal: controller.signal
    });
    if (!response.ok) throw erro(`A fonte oficial retornou o status ${response.status}.`, response.status >= 400 && response.status < 500 ? 502 : response.status);
    const html = await response.text();
    if (!/<html|<body/i.test(html)) throw erro('A fonte oficial retornou um formato de consulta inesperado.');
    return html;
  } catch (error) {
    if (error.name === 'AbortError') throw erro('A consulta à SES/MG excedeu o tempo de espera.');
    throw error.status ? error : erro('Não foi possível consultar os documentos da SES/MG neste momento.');
  } finally {
    clearTimeout(timeout);
  }
}

function extrairOpcoesSelect(html, identificadores) {
  for (const match of String(html || '').matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const atributos = match[1];
    const nome = extrairAtributo(atributos, 'name') || extrairAtributo(atributos, 'id');
    if (!identificadores.includes(nome)) continue;
    const vistos = new Set();
    const opcoes = [];
    for (const opcao of match[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
      const value = decodificarHtml(extrairAtributo(opcao[1], 'value')).trim();
      const label = limparTexto(opcao[2]);
      if (!value || !label || vistos.has(value)) continue;
      vistos.add(value);
      opcoes.push({ value, label });
    }
    return opcoes;
  }
  return [];
}

function extrairMetadados(html) {
  return {
    anos: extrairOpcoesSelect(html, ['by_year', 'year']),
    meses: extrairOpcoesSelect(html, ['by_month', 'month']),
    categorias: extrairOpcoesSelect(html, ['category_id', 'category'])
  };
}

function eTituloDeDocumento(titulo) {
  const texto = normalizar(titulo);
  return /\b(resolucao|deliberacao)\b/.test(texto);
}

function extrairDescricao(contexto) {
  const comClasse = [...String(contexto || '').matchAll(/<(?:p|div|span)\b([^>]*)>([\s\S]*?)<\/(?:p|div|span)>/gi)]
    .find(item => /\b(description|descricao|summary|resumo|excerpt|intro|content|conteudo)\b/i.test(extrairAtributo(item[1], 'class')));
  if (comClasse) return limparTexto(comClasse[2]);
  const paragrafo = String(contexto || '').match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  return paragrafo ? limparTexto(paragrafo[1]) : '';
}

function extrairLinkAnexo(contexto, linkTitulo, sourceUrl) {
  const candidatos = [];
  for (const link of String(contexto || '').matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>/gi)) candidatos.push(link[2]);
  candidatos.push(linkTitulo);
  for (const href of candidatos) {
    const absoluto = urlAbsoluta(href, sourceUrl || DOCUMENTOS_URL);
    if (/\.(?:pdf|docx?|xlsx?)(?:[?#]|$)/i.test(absoluto) || /\/(?:download|attachment|attachments|uploads?)\b/i.test(absoluto)) return absoluto;
  }
  return urlAbsoluta(linkTitulo, sourceUrl || DOCUMENTOS_URL);
}

function extrairDocumentos(html, sourceUrl) {
  const anchors = [...String(html || '').matchAll(/<a\b([^>]*)href\s*=\s*(["'])(.*?)\2[^>]*>([\s\S]*?)<\/a>/gi)];
  const documentos = [];
  anchors.forEach((anchor, indice) => {
    const titulo = limparTexto(anchor[4]);
    if (!eTituloDeDocumento(titulo)) return;
    const inicio = anchor.index + anchor[0].length;
    const proximo = anchors.slice(indice + 1).find(item => eTituloDeDocumento(limparTexto(item[4])))?.index
      ?? Math.min(html.length, inicio + 7000);
    const contexto = html.slice(inicio, Math.min(proximo, inicio + 7000));
    const source = urlAbsoluta(anchor[3], sourceUrl || DOCUMENTOS_URL);
    const attachment = extrairLinkAnexo(contexto, anchor[3], sourceUrl);
    const description = extrairDescricao(contexto);
    if (!titulo || !description || !attachment) return;
    documentos.push({
      id: attachment || source || `${normalizar(titulo)}|${normalizar(description)}`,
      title: titulo,
      description,
      attachment,
      sourceUrl: source
    });
  });
  return documentos;
}

function extrairLinksPaginacao(html, paginaAtual) {
  const links = new Set();
  for (const anchor of String(html || '').matchAll(/<a\b([^>]*)href\s*=\s*(["'])(.*?)\2[^>]*>/gi)) {
    const url = urlAbsoluta(anchor[3], paginaAtual);
    if (!url) continue;
    const parsed = new URL(url);
    if (parsed.origin !== ORIGIN || parsed.pathname !== DOCUMENTOS_PATH) continue;
    if (![...parsed.searchParams.keys()].some(chave => /(?:^|_)(?:page|pagina)(?:$|_)/i.test(chave))) continue;
    links.add(parsed.toString());
  }
  return [...links];
}

async function consultarPaginas(urlInicial) {
  const pendentes = [urlInicial];
  const visitadas = new Set();
  const documentos = [];
  while (pendentes.length && visitadas.size < MAX_PAGINAS_POR_CONSULTA && documentos.length < MAX_DOCUMENTOS) {
    const url = pendentes.shift();
    if (visitadas.has(url)) continue;
    visitadas.add(url);
    const html = await requisitarHtml(url);
    documentos.push(...extrairDocumentos(html, url));
    extrairLinksPaginacao(html, url).forEach(link => {
      if (!visitadas.has(link) && pendentes.length + visitadas.size < MAX_PAGINAS_POR_CONSULTA) pendentes.push(link);
    });
  }
  return documentos.slice(0, MAX_DOCUMENTOS);
}

function deduplicar(documentos) {
  const vistos = new Set();
  return documentos.filter(documento => {
    const chave = documento.attachment || documento.sourceUrl || `${normalizar(documento.title)}|${normalizar(documento.description)}`;
    if (!chave || vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

function obterCache(chave) {
  const registro = cache.get(chave);
  if (!registro || registro.expiraEm < Date.now()) {
    cache.delete(chave);
    return null;
  }
  return registro.valor;
}

function guardarCache(chave, valor, ttl) {
  cache.set(chave, { valor, expiraEm: Date.now() + ttl });
  return valor;
}

async function consultarMetadados() {
  const emCache = obterCache('metadados');
  if (emCache) return { ...emCache, emCache: true };
  const html = await requisitarHtml(montarUrl({ ano: '', mes: '', categoria: '', q: '' }));
  const valor = { ...extrairMetadados(html), consultadoEm: new Date().toISOString() };
  guardarCache('metadados', valor, META_CACHE_TTL_MS);
  return { ...valor, emCache: false };
}

async function consultarDocumentos(filtrosRecebidos) {
  const filtros = validarFiltros(filtrosRecebidos);
  const chave = `documentos:${JSON.stringify(filtros)}`;
  const emCache = obterCache(chave);
  if (emCache) return { ...emCache, emCache: true };
  const variantes = gerarVariantesNumero(filtros.q);
  const documentos = [];
  for (const variante of variantes) documentos.push(...await consultarPaginas(montarUrl(filtros, variante)));
  const valor = { filtros, documentos: deduplicar(documentos), consultadoEm: new Date().toISOString() };
  guardarCache(chave, valor, CACHE_TTL_MS);
  return { ...valor, emCache: false };
}

module.exports = {
  gerarVariantesNumero,
  validarFiltros,
  consultarMetadados,
  consultarDocumentos,
  _private: { extrairMetadados, extrairDocumentos, deduplicar, extrairLinksPaginacao, montarUrl }
};
