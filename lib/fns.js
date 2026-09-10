const XLSX = require('xlsx');

const ORIGIN = 'https://consultafns.saude.gov.br';
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

const MUNICIPIOS = {
  '350840': { cnpj: '13914095000109' },
  '351510': { cnpj: '07636169000181' },
  '311210': { cnpj: '12244189000147' },
  '312370': { cnpj: '97549976000150' },
  '312580': { cnpj: '19230170000190' },
  '520890': { cnpj: '11152150000137' },
  '315800': { cnpj: '14764768000146' },
  '316020': { cnpj: '12057077000187' },
  '316294': { cnpj: '11275904000146' },
  '316870': { cnpj: '10654076000194' }
};

const CABECALHOS = [
  'Bloco', 'Grupo', 'Ação Detalhada', 'Competência/Parcela', 'Nº OB', 'Data OB',
  'Banco OB', 'Agência OB', 'Conta OB', 'Valor Total', 'Desconto', 'Valor Líquido',
  'Observação', 'Processo', 'Tipo Repasse', 'Nº Proposta'
];

function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/º/g, 'o')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function erro(mensagem, status = 502) {
  const error = new Error(mensagem);
  error.status = status;
  return error;
}

async function requisicao(url, options = {}, tentativas = 2) {
  let ultimaFalha;
  for (let tentativa = 0; tentativa < tentativas; tentativa += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(45000),
        headers: { Accept: 'application/json, application/vnd.ms-excel, application/octet-stream', ...(options.headers || {}) }
      });
      if (!response.ok) {
        if (response.status >= 500 && tentativa + 1 < tentativas) continue;
        throw erro(`O FNS retornou HTTP ${response.status}.`);
      }
      return response;
    } catch (error) {
      ultimaFalha = error;
      if (tentativa + 1 === tentativas || error.status) break;
    }
  }
  throw ultimaFalha?.name === 'TimeoutError' || ultimaFalha?.name === 'AbortError'
    ? erro('A consulta ao FNS excedeu o tempo limite.')
    : erro('Não foi possível consultar o FNS neste momento.');
}

async function json(url) {
  const response = await requisicao(url);
  try {
    return await response.json();
  } catch {
    throw erro('O FNS retornou dados fora do formato JSON esperado.');
  }
}

function validarAno(ano) {
  const valor = String(ano || '');
  if (!/^20\d{2}$/.test(valor)) throw erro('Ano de consulta inválido.', 400);
  return valor;
}

async function localizarEntidade(ano, cnpj) {
  const params = new URLSearchParams({ ano, count: '10', cpfCnpjUg: cnpj, page: '1', tipoConsulta: '2' });
  const data = await json(`${ORIGIN}/recursos/consulta-detalhada/entidades?${params}`);
  const entidade = data?.resultado?.dados?.find(row => String(row.cpfCnpj) === cnpj);
  if (!entidade) throw erro('Entidade não localizada no FNS para o ano consultado.', 404);
  if (entidade.entidadeSemRepasse) throw erro('O FNS informa que a entidade não possui repasses para o ano consultado.', 404);
  return entidade;
}

function formatoMoeda(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const texto = String(valor ?? '').trim().replace(/^R\$\s*/, '').replace(/\s/g, '');
  if (!texto) return null;
  const normalizado = texto.includes(',')
    ? texto.replace(/\./g, '').replace(',', '.')
    : texto.replace(/[^\d.-]/g, '');
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

function valorTexto(valor) {
  if (valor == null) return '';
  if (valor instanceof Date && !Number.isNaN(valor)) return valor.toLocaleDateString('pt-BR');
  return String(valor).trim();
}

function competencia(valor) {
  const texto = valorTexto(valor).replace(/\s+/g, ' ');
  const parcela = texto.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*(?:em|de)?\s*(\d{4})$/i);
  if (parcela) return `${parcela[1].padStart(2, '0')}/${parcela[2].padStart(2, '0')} de ${parcela[3]}`;
  const meses = { JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06', JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12' };
  const mensal = texto.toUpperCase().match(/^([A-Z]{3})\s*\/?\s*(\d{4})$/);
  if (mensal && meses[mensal[1]]) return `${meses[mensal[1]]}/${mensal[2]}`;
  const numeroMes = texto.match(/^(\d{1,2})\s*\/\s*(\d{4})$/);
  if (numeroMes) return `${numeroMes[1].padStart(2, '0')}/${numeroMes[2]}`;
  return texto;
}

function competenciaFiltro(valor) {
  const texto = competencia(valor);
  const parcela = texto.match(/^(\d{2})\/\d{2}\s+de\s+(\d{4})$/);
  if (parcela) return `${parcela[1]}/${parcela[2]}`;
  return /^\d{2}\/\d{4}$/.test(texto) ? texto : null;
}

function blocoResumido(valor) {
  return normalizarTexto(valor).includes('manutencao') ? 'Manutenção' : 'Estruturação';
}

function formatarAgencia(valor) {
  const digitos = valorTexto(valor).replace(/\D/g, '').replace(/^0+(?=\d{5,}$)/, '');
  return digitos.length > 1 ? `${digitos.slice(0, -1)}-${digitos.slice(-1)}` : valorTexto(valor);
}

function formatarConta(valor) {
  const digitos = valorTexto(valor).replace(/\D/g, '');
  if (digitos.length < 2) return valorTexto(valor);
  const base = digitos.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${base}-${digitos.slice(-1)}`;
}

function obterPlanilha(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  } catch {
    throw erro('O FNS não retornou uma planilha XLS válida.');
  }
  const sheet = workbook.SheetNames.map(nome => XLSX.utils.sheet_to_json(workbook.Sheets[nome], { header: 1, defval: null, raw: false }))
    .find(linhas => linhas.length);
  if (!sheet) throw erro('A planilha detalhada do FNS não contém dados.');
  const esperados = CABECALHOS.map(normalizarTexto);
  const indiceCabecalho = sheet.findIndex(linha => {
    const celulas = linha.map(normalizarTexto);
    return esperados.filter(item => celulas.includes(item)).length === CABECALHOS.length;
  });
  if (indiceCabecalho < 0) throw erro('O layout da planilha detalhada do FNS foi alterado.');
  const mapa = new Map(sheet[indiceCabecalho].map((celula, indice) => [normalizarTexto(celula), indice]));
  return sheet.slice(indiceCabecalho + 1)
    .filter(linha => linha.some(celula => valorTexto(celula)))
    .map((linha, linhaOrigem) => {
      const campo = nome => linha[mapa.get(normalizarTexto(nome))];
      const competenciaOriginal = campo('Competência/Parcela');
      return {
        bloco: blocoResumido(campo('Bloco')),
        grupo: valorTexto(campo('Grupo')),
        acaoDetalhada: valorTexto(campo('Ação Detalhada')),
        competencia: competencia(competenciaOriginal),
        competenciaFiltro: competenciaFiltro(competenciaOriginal),
        numeroOb: valorTexto(campo('Nº OB')),
        dataOb: valorTexto(campo('Data OB')),
        bancoOb: valorTexto(campo('Banco OB')),
        agencia: formatarAgencia(campo('Agência OB')),
        conta: formatarConta(campo('Conta OB')),
        valorTotal: formatoMoeda(campo('Valor Total')),
        desconto: formatoMoeda(campo('Desconto')),
        valorLiquido: formatoMoeda(campo('Valor Líquido')),
        observacao: valorTexto(campo('Observação')) || null,
        processo: valorTexto(campo('Processo')),
        tipoRepasse: valorTexto(campo('Tipo Repasse')),
        numeroProposta: valorTexto(campo('Nº Proposta')) || null,
        linhaOrigem: indiceCabecalho + linhaOrigem + 2
      };
    });
}

async function consultar(ibge, ano) {
  const municipio = MUNICIPIOS[String(ibge)];
  if (!municipio) throw erro('Município não habilitado para consulta no FNS.', 400);
  const anoValidado = validarAno(ano);
  const chave = `${ibge}:${anoValidado}`;
  const armazenado = cache.get(chave);
  if (armazenado && armazenado.expiraEm > Date.now()) return { ...armazenado.valor, emCache: true };

  const entidade = await localizarEntidade(anoValidado, municipio.cnpj);
  const payload = {
    ano: anoValidado,
    coMesAno: '', tipoConsulta: 2, coBloco: '', coComponente: '', coGrupoAcao: '', coPlanoOrcamentario: '', coAcao: '',
    sgUf: entidade.uf, coMunicipioIbge: String(entidade.codigoMunicipioIBGE), formaRepasse: '', dtInicioOb: '', dtFinalOb: '',
    nuCpfCnpjUg: municipio.cnpj, nuProposta: '', noRazaoSocial: entidade.razaoSocial, nuCnpj: entidade.cpfCnpjFormatado || municipio.cnpj,
    noMunicipio: entidade.municipio
  };
  const response = await requisicao(`${ORIGIN}/recursos/consulta-detalhada/planilha-detalhada/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=utf-8', Accept: 'application/vnd.ms-excel' },
    body: JSON.stringify(payload)
  });
  const pagamentos = obterPlanilha(Buffer.from(await response.arrayBuffer()));
  const resumo = pagamentos.reduce((total, pagamento) => ({
    valorTotal: total.valorTotal + (pagamento.valorTotal || 0),
    desconto: total.desconto + (pagamento.desconto || 0),
    valorLiquido: total.valorLiquido + (pagamento.valorLiquido || 0),
    quantidadePagamentos: total.quantidadePagamentos + 1
  }), { valorTotal: 0, desconto: 0, valorLiquido: 0, quantidadePagamentos: 0 });
  const valor = {
    ibge: String(ibge),
    ano: anoValidado,
    entidade: {
      razaoSocial: entidade.razaoSocial,
      uf: entidade.uf,
      municipio: entidade.municipio,
      codigoIbge: String(entidade.codigoMunicipioIBGE),
      esferaAdministrativa: entidade.esferaAdministrativa
    },
    resumo,
    pagamentos,
    consultadoEm: new Date().toISOString(),
    emCache: false
  };
  cache.set(chave, { expiraEm: Date.now() + CACHE_TTL_MS, valor });
  return valor;
}

module.exports = { MUNICIPIOS, consultar, competencia, competenciaFiltro, formatarAgencia, formatarConta, blocoResumido };
