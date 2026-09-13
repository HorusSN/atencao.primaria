const DEMAS_ORIGIN = 'https://apidadosabertos.saude.gov.br';
const PORTAL_ORIGIN = 'https://cnes.datasus.gov.br';
const PAGE_SIZE_MAX = 20;
const MAX_DEMAS_REQUESTS = 5;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TEAM_CACHE_TTL_MS = 60 * 60 * 1000;
const MUNICIPIOS = new Set(['311210', '312370', '312580', '350840', '351510', '520890', '315800', '316020', '316294', '316870']);

// Todos os códigos oficiais da TNJ 2021 nos grupos 1 (Administração Pública)
// e 3 (Entidades sem Fins Lucrativos). A fonte não oferece um marcador de
// certificação filantrópica/CEBAS separado.
const NATUREZAS_ELEGIVEIS = new Set([
  '1015', '1023', '1031', '1040', '1058', '1066', '1074', '1082',
  '1104', '1112', '1120', '1139', '1147', '1155', '1163', '1171',
  '1180', '1198', '1210', '1228', '1236', '1244', '1252', '1260',
  '1279', '1287', '1295', '1309', '1317', '1325', '1333', '1341',
  '3034', '3069', '3077', '3085', '3107', '3115', '3131', '3204',
  '3212', '3220', '3239', '3247', '3255', '3263', '3271', '3280',
  '3298', '3301', '3310', '3328', '3999'
]);
const cache = new Map();

function erro(mensagem, status = 502) {
  const error = new Error(mensagem);
  error.status = status;
  return error;
}

function apenasDigitos(valor) { return String(valor ?? '').replace(/\D/g, ''); }

function validarIbge(valor) {
  const ibge = apenasDigitos(valor);
  if (!/^\d{6}$/.test(ibge) || !MUNICIPIOS.has(ibge)) throw erro('Município não habilitado para a consulta CNES.', 400);
  return ibge;
}

function validarCnes(valor) {
  const cnes = apenasDigitos(valor);
  if (!/^\d{7}$/.test(cnes)) throw erro('Código CNES inválido.', 400);
  return cnes;
}

function validarCursor(valor) {
  const numero = Number(valor ?? 0);
  if (!Number.isInteger(numero) || numero < 0 || numero > 1000000) throw erro('Cursor de paginação inválido.', 400);
  return numero;
}

function validarTamanhoPagina(valor) {
  const numero = Number(valor ?? PAGE_SIZE_MAX);
  if (!Number.isInteger(numero) || numero < 1 || numero > PAGE_SIZE_MAX) throw erro(`O tamanho da página deve ficar entre 1 e ${PAGE_SIZE_MAX}.`, 400);
  return numero;
}

function validarParteEquipe(valor, nome, maximo = 10) {
  const resultado = String(valor ?? '').trim();
  if (!new RegExp(`^\\d{1,${maximo}}$`).test(resultado)) throw erro(`${nome} inválido.`, 400);
  return resultado;
}

function normalizarCodigoNatureza(valor) { return apenasDigitos(valor).padStart(4, '0'); }

function atendeSus(registro) {
  return String(registro?.estabelecimento_faz_atendimento_ambulatorial_sus || '').trim().toUpperCase() === 'SIM';
}

function classificarNatureza(registro) {
  const codigo = normalizarCodigoNatureza(registro?.descricao_natureza_juridica_estabelecimento);
  const grupo = codigo.charAt(0);
  return {
    codigo,
    grupo,
    publica: grupo === '1',
    semFinsLucrativos: grupo === '3',
    elegivel: NATUREZAS_ELEGIVEIS.has(codigo)
  };
}

function estabelecimentoElegivel(registro) {
  return classificarNatureza(registro).elegivel;
}

function texto(valor) {
  const resultado = String(valor ?? '').replace(/\s+/g, ' ').trim();
  return resultado || null;
}

function numero(valor) {
  const resultado = Number(valor);
  return Number.isFinite(resultado) && resultado >= 0 ? resultado : 0;
}

function normalizarEstabelecimento(registro) {
  const natureza = classificarNatureza(registro);
  return {
    cnes: String(registro.codigo_cnes ?? '').padStart(7, '0'),
    nome: texto(registro.nome_fantasia) || texto(registro.nome_razao_social) || 'Estabelecimento sem nome informado',
    razaoSocial: texto(registro.nome_razao_social),
    mantenedora: texto(registro.nome_mantenedora || registro.nome_razao_social),
    tipoUnidade: registro.codigo_tipo_unidade == null ? null : String(registro.codigo_tipo_unidade),
    gestao: texto(registro.tipo_gestao),
    esfera: texto(registro.descricao_esfera_administrativa),
    naturezaJuridica: natureza.codigo || null,
    classificacaoNatureza: natureza.publica ? 'Administração Pública' : 'Entidade sem fins lucrativos',
    atendeSus: atendeSus(registro),
    atendimentoSus: texto(registro.estabelecimento_faz_atendimento_ambulatorial_sus) || 'Não informado',
    endereco: {
      logradouro: texto(registro.endereco_estabelecimento),
      numero: texto(registro.numero_estabelecimento),
      bairro: texto(registro.bairro_estabelecimento),
      cep: texto(registro.codigo_cep_estabelecimento)
    },
    turnoAtendimento: texto(registro.descricao_turno_atendimento),
    atualizadoEm: texto(registro.data_atualizacao)
  };
}

function obterCache(chave) {
  const item = cache.get(chave);
  if (!item || item.expiraEm <= Date.now()) { cache.delete(chave); return null; }
  return item.valor;
}

function guardarCache(chave, valor, ttl) {
  cache.set(chave, { valor, expiraEm: Date.now() + ttl });
  return valor;
}

async function requisitarJson(url, { timeoutMs = 10000, portal = false } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let ultimaFalha;
    for (let tentativa = 0; tentativa < 2; tentativa += 1) {
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: portal ? {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; Horus-APS/1.0; consulta publica CNES)',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: `${PORTAL_ORIGIN}/pages/estabelecimentos/ficha/index.jsp`
          } : { Accept: 'application/json' }
        });
        if (response.ok) return await response.json();
        if (response.status < 500 && response.status !== 429) throw erro(`A fonte CNES retornou HTTP ${response.status}.`);
        ultimaFalha = erro(`A fonte CNES retornou HTTP ${response.status}.`);
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        ultimaFalha = error;
      }
      if (tentativa === 0) await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw ultimaFalha;
  } catch (error) {
    if (error.name === 'AbortError') throw erro('A consulta ao CNES excedeu o tempo de espera.', 504);
    throw error.status ? error : erro('Não foi possível consultar o CNES neste momento.');
  } finally {
    clearTimeout(timeout);
  }
}

async function paginaDemas(ibge, offset, incluirTodos = false) {
  const chave = `demas:${incluirTodos ? 'todos' : 'elegiveis'}:${ibge}:${offset}`;
  const armazenado = obterCache(chave);
  if (armazenado) return armazenado;
  const url = new URL('/cnes/estabelecimentos', DEMAS_ORIGIN);
  url.searchParams.set('codigo_municipio', ibge);
  url.searchParams.set('status', '1');
  url.searchParams.set('limit', String(PAGE_SIZE_MAX));
  url.searchParams.set('offset', String(offset));
  const payload = await requisitarJson(url);
  if (!Array.isArray(payload.estabelecimentos)) throw erro('A fonte de estabelecimentos retornou um formato inesperado.');
  return guardarCache(chave, payload.estabelecimentos, CACHE_TTL_MS);
}

async function listarEstabelecimentos({ ibge: ibgeRecebido, cursor: cursorRecebido, pageSize: pageSizeRecebido, incluirTodos = false }) {
  const ibge = validarIbge(ibgeRecebido);
  const pageSize = validarTamanhoPagina(pageSizeRecebido);
  let offset = validarCursor(cursorRecebido);
  const items = [];
  let hasNext = true;
  let requisicoes = 0;
  while (items.length < pageSize && hasNext && requisicoes < MAX_DEMAS_REQUESTS) {
    const pagina = await paginaDemas(ibge, offset, incluirTodos);
    requisicoes += 1;
    if (!pagina.length) { hasNext = false; break; }
    let consumidos = 0;
    for (const registro of pagina) {
      offset += 1;
      consumidos += 1;
      if (incluirTodos || estabelecimentoElegivel(registro)) items.push(normalizarEstabelecimento(registro));
      if (items.length === pageSize) break;
    }
    if (consumidos < pagina.length) hasNext = true;
    else if (pagina.length < PAGE_SIZE_MAX) hasNext = false;
  }
  return { ibge, items, pageSize, nextCursor: hasNext ? offset : null, hasNext, complete: !hasNext, source: `${DEMAS_ORIGIN}/cnes/estabelecimentos`, consultadoEm: new Date().toISOString() };
}

async function listarEstabelecimentosGerais(parametros) {
  return listarEstabelecimentos({ ...parametros, incluirTodos: true });
}

function normalizarProfissionalMunicipal(registro) {
  const cnes = texto(registro.coCnes || registro.codigoCnes || registro.cnes || registro.coUnidade);
  const nomeEstabelecimento = texto(registro.noFantasia || registro.nomeFantasia || registro.nomeEstabelecimento || registro.noUnidade);
  const mantenedora = texto(registro.noMantenedora || registro.nomeMantenedora || registro.mantenedora);
  const cargas = { ambulatorial: numero(registro.chAmb), hospitalar: numero(registro.chHosp), outros: numero(registro.chOutros) };
  return { nome: texto(registro.noProfissional || registro.nome), cbo: texto(registro.cbo || registro.coCbo), cargo: texto(registro.dsCbo || registro.descricaoCbo || registro.cargo), cargaHoraria: cargas.ambulatorial + cargas.hospitalar + cargas.outros, cnes, nomeEstabelecimento, mantenedora };
}

async function obterTodosEstabelecimentos(ibge) {
  const items = [];
  let cursor = 0;
  for (let parte = 0; parte < 50; parte += 1) {
    const pagina = await listarEstabelecimentos({ ibge, cursor, pageSize: PAGE_SIZE_MAX, incluirTodos: true });
    items.push(...pagina.items);
    if (!pagina.hasNext || pagina.nextCursor == null) break;
    cursor = pagina.nextCursor;
  }
  return items;
}

async function listarEquipesMunicipio({ ibge: ibgeRecebido }) {
  const ibge = validarIbge(ibgeRecebido);
  const gerais = await obterTodosEstabelecimentos(ibge);
  const equipes = (await emLotes(gerais, 4, async unidade => {
    try { const result = await listarEquipes({ ibge, cnes: unidade.cnes }); return result.items.map(item => ({ ...item, cnes: unidade.cnes, estabelecimento: unidade.nome })); } catch { return []; }
  })).flat();
  return { ibge, items: equipes, total: equipes.length, source: `${PORTAL_ORIGIN}/services/estabelecimentos-equipes`, consultadoEm: new Date().toISOString() };
}

async function listarProfissionaisMunicipio({ ibge: ibgeRecebido, cargo = '', cnes = '', mantenedora = '' }) {
  const ibge = validarIbge(ibgeRecebido);
  const estabelecimentos = await obterTodosEstabelecimentos(ibge);
  const vinculos = (await emLotes(estabelecimentos, 4, async unidade => {
    try { return (await obterProfissionaisBrutosUnidade({ ibge, cnes: unidade.cnes })).map(item => ({ ...item, coCnes: unidade.cnes, noFantasia: unidade.nome, noMantenedora: unidade.mantenedora || unidade.razaoSocial })); } catch { return []; }
  })).flat();
  const norm = vinculos.map(normalizarProfissionalMunicipal).filter(item => item.nome);
  const termo = valor => String(valor || '').toLocaleLowerCase('pt-BR');
  const items = norm.filter(item => (!cargo || termo(item.cargo).includes(termo(cargo))) && (!cnes || item.cnes === apenasDigitos(cnes)) && (!mantenedora || termo(item.mantenedora).includes(termo(mantenedora))));
  return { ibge, items, total: items.length, source: `${PORTAL_ORIGIN}/services/estabelecimentos-profissionais/{municipio}{cnes}`, consultadoEm: new Date().toISOString() };
}

function normalizarEquipe(registro) {
  return {
    ine: String(registro.coEquipe ?? '').padStart(10, '0'),
    sequencia: texto(registro.seqEquipe),
    area: texto(registro.coArea),
    municipio: texto(registro.coMunicipio),
    tipoCodigo: texto(registro.tpEquipe),
    tipo: texto(registro.dsEquipe),
    nome: texto(registro.nomeEquipe) || texto(registro.dsEquipe) || 'Equipe sem nome informado',
    inicio: texto(registro.dtAtivacao),
    fim: texto(registro.dtDesativacao)
  };
}

async function listarEquipes({ ibge: ibgeRecebido, cnes: cnesRecebido }) {
  const ibge = validarIbge(ibgeRecebido);
  const cnes = validarCnes(cnesRecebido);
  const chave = `equipes:${ibge}:${cnes}`;
  const armazenado = obterCache(chave);
  if (armazenado) return { ...armazenado, emCache: true };
  const url = new URL(`/services/estabelecimentos-equipes/${ibge}${cnes}`, PORTAL_ORIGIN);
  const payload = await requisitarJson(url, { portal: true, timeoutMs: 15000 });
  if (!Array.isArray(payload)) throw erro('A fonte de equipes retornou um formato inesperado.');
  const items = payload.map(normalizarEquipe).filter(equipe => !equipe.fim);
  const valor = { ibge, cnes, available: true, items, source: url.toString(), consultadoEm: new Date().toISOString(), emCache: false };
  guardarCache(chave, valor, TEAM_CACHE_TTL_MS);
  return valor;
}

function chaveProfissional(registro) {
  const chave = apenasDigitos(registro.cnsMaster || registro.cns);
  return /^\d{15}$/.test(chave) ? chave : null;
}

function normalizarOcupacao(registro) {
  const cargas = { ambulatorial: numero(registro.chAmb), hospitalar: numero(registro.chHosp), outros: numero(registro.chOutros) };
  return {
    cbo: texto(registro.cbo),
    descricaoCbo: texto(registro.dsCbo),
    cargas,
    cargaTotal: cargas.ambulatorial + cargas.hospitalar + cargas.outros,
    inicioVinculo: texto(registro.dtEntrada),
    fimVinculo: texto(registro.dtDesligamento)
  };
}

function agruparProfissionais(registros, campoNome = 'noProfissional') {
  const grupos = new Map();
  registros.forEach((registro, indice) => {
    const identificador = chaveProfissional(registro) || `sem-id:${indice}`;
    if (!grupos.has(identificador)) {
      grupos.set(identificador, {
        nome: texto(registro[campoNome]),
        vinculo: [texto(registro.vinculacao), texto(registro.vinculo), texto(registro.subVinculo)].filter(Boolean).join(' · ') || null,
        atualizadoEm: null,
        ocupacoes: []
      });
    }
    const ocupacao = normalizarOcupacao(registro);
    if (ocupacao.cbo && !ocupacao.fimVinculo) grupos.get(identificador).ocupacoes.push(ocupacao);
  });
  return [...grupos.values()].filter(item => item.nome && item.ocupacoes.length);
}

function normalizarProfissionalEquipe(registro) {
  return agruparProfissionais([registro])[0] || null;
}

async function obterProfissionaisBrutosEquipe({ ibge, cnes, area, equipe }) {
  const chave = `equipe-profissionais:${ibge}:${cnes}:${area}:${equipe}`;
  const armazenado = obterCache(chave);
  if (armazenado) return armazenado;
  const url = new URL(`/services/estabelecimentos-equipes/profissionais/${ibge}${cnes}`, PORTAL_ORIGIN);
  url.searchParams.set('coMun', ibge);
  url.searchParams.set('coArea', area);
  url.searchParams.set('coEquipe', equipe);
  const payload = await requisitarJson(url, { portal: true, timeoutMs: 20000 });
  if (!Array.isArray(payload)) throw erro('A fonte de profissionais da equipe retornou um formato inesperado.');
  return guardarCache(chave, payload, TEAM_CACHE_TTL_MS);
}

async function listarProfissionaisEquipe(parametros) {
  const ibge = validarIbge(parametros.ibge);
  const cnes = validarCnes(parametros.cnes);
  const area = validarParteEquipe(parametros.area, 'Área da equipe', 4);
  const equipe = validarParteEquipe(parametros.equipe, 'Sequência da equipe');
  const cursor = validarCursor(parametros.cursor);
  const pageSize = validarTamanhoPagina(parametros.pageSize);
  const brutos = await obterProfissionaisBrutosEquipe({ ibge, cnes, area, equipe });
  const registros = agruparProfissionais(brutos.filter(item => !texto(item.dtDesligamento)));
  const items = registros.slice(cursor, cursor + pageSize);
  const proximo = cursor + items.length;
  const hasNext = proximo < registros.length;
  return { ibge, cnes, equipe, items, total: registros.length, pageSize, nextCursor: hasNext ? proximo : null, hasNext, source: `${PORTAL_ORIGIN}/services/estabelecimentos-equipes/profissionais/${ibge}${cnes}`, consultadoEm: new Date().toISOString() };
}

async function obterProfissionaisBrutosUnidade({ ibge, cnes }) {
  const chave = `unidade-profissionais:${ibge}:${cnes}`;
  const armazenado = obterCache(chave);
  if (armazenado) return armazenado;
  const url = new URL(`/services/estabelecimentos-profissionais/${ibge}${cnes}`, PORTAL_ORIGIN);
  const payload = await requisitarJson(url, { portal: true, timeoutMs: 20000 });
  if (!Array.isArray(payload)) throw erro('A fonte de profissionais da unidade retornou um formato inesperado.');
  return guardarCache(chave, payload, TEAM_CACHE_TTL_MS);
}

async function emLotes(items, tamanho, tarefa) {
  const resultados = [];
  for (let indice = 0; indice < items.length; indice += tamanho) {
    resultados.push(...await Promise.all(items.slice(indice, indice + tamanho).map(tarefa)));
  }
  return resultados;
}

function comporOutrosProfissionais(gerais, membrosPorEquipe) {
  const membrosBrutos = membrosPorEquipe.flat();
  const precise = gerais.every(chaveProfissional) && membrosBrutos.every(chaveProfissional);
  const membros = new Set(membrosBrutos.map(chaveProfissional).filter(Boolean));
  const restantes = gerais.filter(registro => {
    if (String(registro.tpSusNaoSus || '').toUpperCase() !== 'S') return false;
    const identificador = chaveProfissional(registro);
    return !identificador || !membros.has(identificador);
  });
  return { items: agruparProfissionais(restantes, 'nome'), precise };
}

async function listarOutrosProfissionais(parametros) {
  const ibge = validarIbge(parametros.ibge);
  const cnes = validarCnes(parametros.cnes);
  const cursor = validarCursor(parametros.cursor);
  const pageSize = validarTamanhoPagina(parametros.pageSize);
  const [gerais, equipes] = await Promise.all([
    obterProfissionaisBrutosUnidade({ ibge, cnes }),
    listarEquipes({ ibge, cnes })
  ]);
  const membrosPorEquipe = await emLotes(equipes.items, 4, equipe => obterProfissionaisBrutosEquipe({
    ibge,
    cnes,
    area: equipe.area,
    equipe: equipe.sequencia
  }));
  const composicao = comporOutrosProfissionais(gerais, membrosPorEquipe);
  const registros = composicao.items;
  const items = registros.slice(cursor, cursor + pageSize);
  const proximo = cursor + items.length;
  const hasNext = proximo < registros.length;
  return {
    ibge,
    cnes,
    items,
    total: registros.length,
    pageSize,
    nextCursor: hasNext ? proximo : null,
    hasNext,
    precise: composicao.precise,
    source: `${PORTAL_ORIGIN}/services/estabelecimentos-profissionais/${ibge}${cnes}`,
    consultadoEm: new Date().toISOString()
  };
}

module.exports = {
  MUNICIPIOS,
  NATUREZAS_ELEGIVEIS,
  atendeSus,
  classificarNatureza,
  estabelecimentoElegivel,
  normalizarEstabelecimento,
  normalizarEquipe,
  normalizarProfissionalEquipe,
  agruparProfissionais,
  comporOutrosProfissionais,
  listarEstabelecimentos,
  listarEstabelecimentosGerais,
  listarEquipesMunicipio,
  listarProfissionaisMunicipio,
  listarEquipes,
  listarProfissionaisEquipe,
  listarOutrosProfissionais,
  _private: { validarIbge, validarCnes, validarTamanhoPagina, validarParteEquipe, chaveProfissional, normalizarOcupacao, obterProfissionaisBrutosEquipe }
};
