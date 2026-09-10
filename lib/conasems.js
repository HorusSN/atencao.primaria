const ORIGIN = 'https://paineis.conasems.org.br';
const MUNICIPIOS = new Set(['311210', '312370', '312580', '350840', '351510', '520890', '315800', '316020', '316294', '316870']);

function numero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) && valor >= 0 ? valor : null;
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const texto = valor.trim().replace(/^R\$\s*/, '').replace(/\s/g, '');
  if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(texto)) return null;
  return Number(texto.replace(/\./g, '').replace(',', '.'));
}

function competencia(valor) {
  if (typeof valor !== 'string') return null;
  const iso = valor.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/);
  if (iso) return `${iso[2]}/${iso[1]}`;
  if (/^(0[1-9]|1[0-2])\/\d{4}$/.test(valor)) return valor;
  const meses = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  const texto = valor.toUpperCase().match(/^([A-Z]{3})\/(\d{4})$/);
  if (texto && meses.includes(texto[1])) return `${String(meses.indexOf(texto[1]) + 1).padStart(2, '0')}/${texto[2]}`;
  return null;
}

async function consultar(path, ibge, extra = {}, signal) {
  const response = await fetch(ORIGIN + path, {
    method: 'POST', redirect: 'error', signal: signal || AbortSignal.timeout(45000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
    body: new URLSearchParams({ ibge, tipo: 'cit', ...extra })
  });
  if (!response.ok) throw new Error(`CONASEMS retornou HTTP ${response.status}.`);
  const text = await response.text();
  if (text.length > 25000000) throw new Error('Resposta da fonte excedeu o limite de leitura.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('CONASEMS retornou conteúdo fora do formato esperado.'); }
  if (!data || data.error) throw new Error('CONASEMS não disponibilizou os dados solicitados.');
  return data;
}

function linhas(data) {
  if (!Array.isArray(data)) throw new Error('Estrutura dos registros CONASEMS não reconhecida.');
  return data;
}

function producao(data) {
  const tipos = new Set(['Medico', 'Enfermeiro', 'Odontologico', 'Procedimento', 'Domiciliar']);
  const seen = new Set();
  return linhas(data).filter(row => tipos.has(row.Tipo)).map(row => {
    const mes = competencia(row.Data);
    const key = `${row.Tipo}:${mes}`;
    if (!mes || seen.has(key)) throw new Error('Competência inválida ou duplicada na produção CONASEMS.');
    seen.add(key);
    return { tipo: row.Tipo, competencia: mes, atendimentos: numero(row.MediaProducao), pessoas: numero(row.MediaPessoas) };
  });
}

function visitas(data, ibge) {
  const seen = new Set();
  return linhas(data).map(row => {
    const mes = competencia(row.Data);
    if (String(row.Ibge) !== ibge || !mes || seen.has(mes)) throw new Error('Município ou competência incompatível nas visitas ACS.');
    seen.add(mes);
    return { competencia: mes, realizadas: numero(row.VisitaRealizada), recusadas: numero(row.VisitaRecusada), ausentes: numero(row.Ausente), qtdAcs: numero(row.QtdAcs) };
  });
}

function cobertura(data) {
  if (!data.cobertura) throw new Error('Dados de cobertura ausentes na resposta CONASEMS.');
  return ['aps', 'sb', 'acs'].map(chave => {
    const row = data.cobertura[chave];
    if (!row || !competencia(row.referencia)) return { chave, valor: null, referencia: null };
    return { chave, valor: numero(row.valor), exibicao: /^[\d.,]+%\*?$/.test(row.valorFormatado) ? row.valorFormatado : null, referencia: competencia(row.referencia), potencial: numero(row.potencial),
      equipes: Object.fromEntries(['qtdEsf','qtdEap20h','qtdEap30h','qtdEcr','qtdEapp','qtdEsfr','qtEsb20h','qtEsb30h','qtEsb40h','qtAcsCobertura'].filter(k => k in row).map(k => [k, numero(row[k])])) };
  });
}

function contagemClassificacao(valor) {
  if (valor == null || (typeof valor === 'string' && !valor.trim())) return 0;
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN;
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Contagem de classificação inválida no cofinanciamento.');
  return n;
}

function cofinanciamento(data) {
  return linhas(data).map(row => {
    if (!/^\d{4}Q[1-3]$/.test(row.quadrimestre)) throw new Error('Quadrimestre de cofinanciamento inválido.');
    return { quadrimestre: row.quadrimestre, equipe: String(row.tipo_equipe || ''), componente: String(row.componente || ''), indicador: String(row.dimensao_indicador || ''), regular: contagemClassificacao(row.regular), suficiente: contagemClassificacao(row.suficiente), bom: contagemClassificacao(row.bom), otimo: contagemClassificacao(row.otimo) };
  });
}

function pagamentosHtml(html, ibge) {
  const rows = [];
  for (const match of html.matchAll(/<tr\s+class="parent-row"([^>]*)>([\s\S]*?)<\/tr>/g)) {
    const attrs = match[1];
    if (!attrs.includes(`data-ibge="${ibge}"`)) throw new Error('Município divergente no financiamento.');
    const mes = competencia(attrs.match(/data-competencia="([^"]+)"/)?.[1]);
    const parcela = attrs.match(/data-parcela="([^"]+)"/)?.[1];
    const cells = [...match[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    const moeda = i => numero(cells[i]?.match(/R\$\s*([\d.,]+)/)?.[1]);
    if (!mes || cells.length !== 6 || !parcela) throw new Error('Estrutura do financiamento alterada na fonte.');
    rows.push({ competencia: mes, parcela, desconto: moeda(3), repasse: moeda(4), implantacao: moeda(5) });
  }
  return rows;
}

async function financiamento(ibge) {
  const signal = AbortSignal.timeout(50000);
  const rows = [];
  let total = null;
  let pages = 1;
  for (let page = 1; page <= pages; page++) {
    const data = await consultar('/atencao_basica.php', ibge, { ajax_detalhamento: '1', detalhe_page: String(page), detalhe_limit: '100', detalhe_comp: '' }, signal);
    if (typeof data.rows_html !== 'string' || !Number.isInteger(Number(data.total_records)) || !Number.isInteger(Number(data.total_pages))) throw new Error('Paginação do financiamento não reconhecida.');
    if (total !== null && total !== Number(data.total_records)) throw new Error('A fonte mudou durante a consulta. Tente novamente.');
    total = Number(data.total_records);
    pages = Number(data.total_pages);
    if (pages > 20 || pages < 0) throw new Error('Consulta de financiamento excedeu o limite de páginas.');
    rows.push(...pagamentosHtml(data.rows_html, ibge));
  }
  if (rows.length !== total) throw new Error('A fonte não retornou todos os registros financeiros.');
  return rows;
}

module.exports = { MUNICIPIOS, consultar, numero, competencia, producao, visitas, cobertura, cofinanciamento, financiamento, pagamentosHtml };
