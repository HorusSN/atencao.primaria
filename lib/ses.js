const ORIGIN = 'https://pagamentoderesolucoes.saude.mg.gov.br';
const ENDPOINT = `${ORIGIN}/pagamentos-orcamentarios`;
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map();

const MUNICIPIOS = {
  '311210': 'CAPARAO',
  '312370': 'ENGENHEIRO CALDAS',
  '312580': 'FERNANDES TOURINHO',
  '315800': 'SANTA MARIA DE ITABIRA',
  '316020': 'SANTO ANTONIO DO ITAMBE',
  '316294': 'SAO JOSE DA BARRA',
  '316870': 'TIMOTEO'
};

function erro(mensagem, status = 502) {
  const error = new Error(mensagem);
  error.status = status;
  return error;
}

function normalizar(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function limparTexto(valor) {
  return decodificarHtml(String(valor ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodificarHtml(valor) {
  const entidades = {
    amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>',
    aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', eacute: 'é', ecirc: 'ê',
    iacute: 'í', oacute: 'ó', ocirc: 'ô', otilde: 'õ', uacute: 'ú', ccedil: 'ç',
    Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Atilde: 'Ã', Eacute: 'É', Ecirc: 'Ê',
    Iacute: 'Í', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Uacute: 'Ú', Ccedil: 'Ç'
  };
  return valor
    .replace(/&#(\d+);?/g, (_, codigo) => String.fromCodePoint(Number(codigo)))
    .replace(/&#x([\da-f]+);?/gi, (_, codigo) => String.fromCodePoint(parseInt(codigo, 16)))
    .replace(/&([a-z]+);/gi, (completo, nome) => entidades[nome] ?? completo);
}

function validarAno(ano) {
  const valor = String(ano ?? '').trim();
  const limite = new Date().getFullYear() + 1;
  if (!/^\d{4}$/.test(valor) || Number(valor) < 2000 || Number(valor) > limite) {
    throw erro('Ano de consulta inválido.', 400);
  }
  return valor;
}

function cookiesDaResposta(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie();
  const cabecalho = response.headers.get('set-cookie');
  return cabecalho ? cabecalho.split(/,(?=[^;,]+=)/g) : [];
}

function atualizarCookies(jar, response) {
  cookiesDaResposta(response).forEach(cookie => {
    const [par] = cookie.split(';');
    const indice = par.indexOf('=');
    if (indice > 0) jar.set(par.slice(0, indice).trim(), par.slice(indice + 1).trim());
  });
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([nome, valor]) => `${nome}=${valor}`).join('; ');
}

async function requisitar(url, options = {}) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(45000) });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw erro('A consulta à SES/MG excedeu o tempo limite.');
    }
    throw erro('Não foi possível consultar a SES/MG neste momento.');
  }
}

function extrairToken(html) {
  const campo = String(html).match(/<input\b(?=[^>]*\bname\s*=\s*["']_token["'])[^>]*>/i)?.[0];
  const token = campo?.match(/\bvalue\s*=\s*["']([^"']*)["']/i)?.[1];
  if (!token) throw erro('A SES/MG não disponibilizou um token de sessão válido.');
  return decodificarHtml(token);
}

async function abrirSessao() {
  const jar = new Map();
  const response = await requisitar(ENDPOINT, { headers: { Accept: 'text/html,application/xhtml+xml' } });
  atualizarCookies(jar, response);
  if (!response.ok) throw erro(`A SES/MG retornou HTTP ${response.status}.`);
  return { jar, token: extrairToken(await response.text()) };
}

async function enviarConsulta(sessao, municipio, ano) {
  const body = new URLSearchParams({
    _token: sessao.token,
    data_pgto: ano,
    dsc_municipio: municipio,
    ref_contrato_saida: '',
    cod_atv: '',
    cod_upg: '',
    id_credor: '',
    credor: '',
    conta: ''
  });
  const response = await requisitar(ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(sessao.jar)
    },
    body: body.toString()
  });
  atualizarCookies(sessao.jar, response);
  return response;
}

function extrairCelulas(linha, tag) {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  return [...linha.matchAll(regex)].map(match => limparTexto(match[1]));
}

function extrairTabela(html) {
  const tabelas = [...String(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(match => match[1]);
  const candidatas = tabelas.map(tabela => {
    const thead = tabela.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i)?.[1] || '';
    let cabecalhos = [...thead.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(match => limparTexto(match[1]));
    const linhasHtml = [...(tabela.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || tabela).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => match[1]);
    if (!cabecalhos.length && linhasHtml.length) {
      cabecalhos = extrairCelulas(linhasHtml.shift(), 'th');
    }
    const linhas = linhasHtml.map(linha => extrairCelulas(linha, 'td')).filter(linha => linha.length);
    const chaves = cabecalhos.map(normalizar);
    const pontuacao = chaves.filter(chave => /data|resolucao|acao|conta|valor/.test(chave)).length;
    return { cabecalhos, linhas, pontuacao };
  }).filter(tabela => tabela.cabecalhos.length && tabela.linhas.length);
  const tabela = candidatas.sort((a, b) => b.pontuacao - a.pontuacao || b.linhas.length - a.linhas.length)[0];
  if (!tabela) return [];
  return tabela.linhas.map(linha => Object.fromEntries(tabela.cabecalhos.map((cabecalho, indice) => [cabecalho || `Coluna ${indice + 1}`, linha[indice] || ''])));
}

function campo(registro, alternativas) {
  const pares = Object.entries(registro);
  for (const alternativa of alternativas.map(normalizar)) {
    const encontrado = pares.find(([cabecalho]) => normalizar(cabecalho) === alternativa);
    if (encontrado) return encontrado[1];
  }
  for (const alternativa of alternativas.map(normalizar)) {
    const encontrado = pares.find(([cabecalho]) => normalizar(cabecalho).includes(alternativa));
    if (encontrado) return encontrado[1];
  }
  return '';
}

function numeroMoeda(valor) {
  const texto = String(valor ?? '').replace(/R\$\s*/i, '').replace(/\s/g, '');
  if (!texto) return null;
  const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto.replace(/[^\d.-]/g, '');
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

function competenciaDaData(valor) {
  const texto = String(valor ?? '').trim();
  const brasileiro = texto.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  if (brasileiro) return `${brasileiro[2].padStart(2, '0')}/${brasileiro[3]}`;
  const iso = texto.match(/\b(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\b/);
  return iso ? `${iso[2].padStart(2, '0')}/${iso[1]}` : null;
}

function normalizarRegistro(registro) {
  const dataPagamento = campo(registro, ['Data do Pagamento', 'Data Pagamento', 'Data Pgto', 'Data']);
  return {
    dataPagamento,
    numeroResolucao: campo(registro, ['Número da Resolução', 'Nº da Resolução', 'Nº Resolução', 'Resolução', 'Numero Resolucao']),
    acoes: campo(registro, ['Ações', 'Ação', 'Ações Orçamentárias', 'Ação Orçamentária']),
    contaCorrente: campo(registro, ['Conta Corrente', 'Conta']),
    valorPago: numeroMoeda(campo(registro, ['Valor Pago', 'Valor do Pagamento', 'Valor'])),
    competenciaFiltro: competenciaDaData(dataPagamento)
  };
}

async function consultar(ibge, ano) {
  const municipio = MUNICIPIOS[String(ibge)];
  if (!municipio) throw erro('Este município não está habilitado para a consulta de Pagamentos SES.', 400);
  const anoValidado = validarAno(ano);
  const chave = `${ibge}:${anoValidado}`;
  const armazenado = cache.get(chave);
  if (armazenado?.expiraEm > Date.now()) return { ...armazenado.valor, emCache: true };

  let resposta;
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    const sessao = await abrirSessao();
    resposta = await enviarConsulta(sessao, municipio, anoValidado);
    if (resposta.status === 419 && tentativa === 0) continue;
    if (!resposta.ok) throw erro(`A SES/MG retornou HTTP ${resposta.status}.`);
    break;
  }
  if (!resposta?.ok) throw erro('A sessão da SES/MG expirou. Tente novamente em instantes.');

  const pagamentos = extrairTabela(await resposta.text()).map(normalizarRegistro);
  const valor = {
    ibge: String(ibge),
    municipio,
    ano: anoValidado,
    pagamentos,
    consultadoEm: new Date().toISOString(),
    emCache: false
  };
  cache.set(chave, { expiraEm: Date.now() + CACHE_TTL_MS, valor });
  return valor;
}

module.exports = { MUNICIPIOS, consultar, competenciaDaData, extrairTabela, normalizarRegistro };
