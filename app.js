const selectMunicipio = document.querySelector('#municipio');
const periodTypeInputs = [...document.querySelectorAll('input[name="periodo-tipo"]')];
const selectPeriodo = document.querySelector('#periodo-valor');
const topicButtons = [...document.querySelectorAll('[data-topic]')];
const periodFilter = document.querySelector('.period-filter');
const topics = document.querySelector('.topics');
const detail = document.querySelector('#detalhe');
const emptyState = document.querySelector('.empty-state');
const productionDashboard = document.querySelector('#production-dashboard');
const productionIndicators = document.querySelector('#production-indicators');
const printButton = document.querySelector('#imprimir');
let currentTopic = '';
const temasComReferenciaLivre = new Set(['Financiamento']);

let dadosFonte = null;
let consultaEmCurso = null;
let sequenciaConsulta = 0;
let competenciasDisponiveis = [];
const escapar = (valor) => String(valor ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ordenarCompetencias = (meses) => [...new Set(meses)].sort((a, b) => (a.slice(3) + a.slice(0, 2)).localeCompare(b.slice(3) + b.slice(0, 2)));
let coberturaAtual = null;

function obterCoberturaMaisRecente(municipio) {
  return dadosFonte?.ibge === municipio && dadosFonte.tema === 'cobertura' ? dadosFonte.dados : null;
}

function referenciaCobertura() {
  if (!coberturaAtual) return 'Competência indisponível: aguardando dados de cobertura';
  const refs = [...new Set(coberturaAtual.map(row => row.referencia).filter(Boolean))];
  return refs.length ? `Referência CONASEMS: ${refs.join(' • ')}` : 'Competência não informada pela fonte';
}

function renderizarCobertura() {
  coberturaAtual = obterCoberturaMaisRecente(selectMunicipio.value);
  const indicadores = [
    { chave: 'aps', titulo: 'Cobertura Potencial da APS', classe: 'blue' },
    { chave: 'sb', titulo: 'Cobertura de Saúde Bucal', classe: 'green' },
    { chave: 'acs', titulo: 'Cobertura de ACS', classe: 'amber' }
  ];
  productionIndicators.innerHTML = `
    <article class="indicator-panel coverage-panel">
      <h3>Cobertura Atual</h3>
      <p class="coverage-reference">${referenciaCobertura()}</p>
      <div class="coverage-grid">
        ${indicadores.map(({ chave, titulo, classe }) => {
          const registro = coberturaAtual?.find(row => row.chave === chave);
          const valor = registro?.valor;
          const disponivel = typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;
          return `<section class="coverage-card ${classe}">
            <h4>${titulo}</h4>
            <strong>${disponivel ? escapar(registro.exibicao || valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%') : 'Não disponível'}</strong>
            ${disponivel && valor > 100 ? `<p>*Potencial calculado: ${valor.toLocaleString('pt-BR')}%. Exibição limitada a 100% pelo CONASEMS.</p>` : ''}
            <p>${disponivel ? 'Referência: ' + escapar(registro.referencia) : 'Dado não disponibilizado pelo CONASEMS'}</p>
            ${registro?.potencial != null ? `<p>Potencial de cobertura: ${formatarNumero(registro.potencial)} pessoas</p>` : ''}
            ${registro?.equipes ? `<p>${Object.entries(registro.equipes).map(([k,v]) => `${escapar(({qtdEsf:'eSF',qtdEap20h:'eAP 20h',qtdEap30h:'eAP 30h',qtdEcr:'eCR',qtdEapp:'eAPP',qtdEsfr:'eSFR',qtEsb20h:'eSB 20h',qtEsb30h:'eSB 30h',qtEsb40h:'eSB 40h',qtAcsCobertura:'ACS'})[k])}: ${formatarNumero(v)}`).join(' · ')}</p>` : ''}
          </section>`;
        }).join('')}
      </div>
      <p class="indicator-note"><strong>Cobertura Potencial da Atenção Primária à Saúde (APS):</strong> Refere-se à proporção da população potencialmente coberta pelas Equipes de Saúde da Família e/ou Equipes de Atenção Primária credenciadas no município. Esse indicador estima a capacidade instalada para ofertar ações de atenção primária, considerando o número de equipes ativas e sua população adscrita teórica.</p>
    </article>`;
  productionDashboard.hidden = false;
  printButton.disabled = !coberturaAtual?.some(row => row.valor != null);
}

const indicadoresProducao = [
  {
    nome: 'Consultas Médicas',
    tipo: 'Medico',
    descricao: 'Apresenta o somatório de todas as consultas médicas realizadas na Atenção Primária à Saúde (APS)'
  },
  {
    nome: 'Consultas de Enfermagem',
    tipo: 'Enfermeiro',
    descricao: 'Apresenta o somatório de todas as consultas de enfermagem realizadas na Atenção Primária à Saúde (APS)'
  },
  {
    nome: 'Atendimentos Odontológicos',
    tipo: 'Odontologico',
    descricao: 'Apresenta o somatório de todas as consultas odontológicas realizadas na Atenção Primária à Saúde (APS)'
  },
  {
    nome: 'Procedimentos',
    tipo: 'Procedimento',
    descricao: 'Apresenta a produção consolidada de procedimentos realizados na Atenção Primária à Saúde (APS)'
  },
  {
    nome: 'Visita Domiciliar (ACS)',
    tipo: 'Domiciliar',
    descricao: 'Apresenta as visitas domiciliares de acompanhamento geral realizadas por Agentes Comunitários de Saúde (ACS)'
  }
];

const fonteSiaps = 'SIAPS - Ministério da Saúde';

const catalogoIndicadoresCofinanciamento = {
  eSF: [
    ['C1', 'Mais acesso à APS', ['mais acesso']],
    ['C2', 'Cuidado no desenvolvimento infantil', ['desenvolvimento infantil']],
    ['C3', 'Cuidado na gestação e puerpério', ['gestante', 'gestacao', 'puerpera', 'puerperio']],
    ['C4', 'Cuidado da pessoa com diabetes', ['diabetes']],
    ['C5', 'Cuidado da pessoa com hipertensão', ['hipertensao']],
    ['C6', 'Cuidado da pessoa idosa', ['pessoa idosa']],
    ['C7', 'Cuidado da mulher na prevenção do câncer', ['saude da mulher', 'prevencao do cancer']]
  ],
  eAP: [
    ['C1', 'Mais acesso à APS', ['mais acesso']],
    ['C2', 'Cuidado no desenvolvimento infantil', ['desenvolvimento infantil']],
    ['C3', 'Cuidado na gestação e puerpério', ['gestante', 'gestacao', 'puerpera', 'puerperio']],
    ['C4', 'Cuidado da pessoa com diabetes', ['diabetes']],
    ['C5', 'Cuidado da pessoa com hipertensão', ['hipertensao']],
    ['C6', 'Cuidado da pessoa idosa', ['pessoa idosa']],
    ['C7', 'Cuidado da mulher na prevenção do câncer', ['saude da mulher', 'prevencao do cancer']]
  ],
  eSB: [
    ['B1', 'Primeira consulta programada', ['1a consulta', 'primeira consulta']],
    ['B2', 'Tratamento concluído', ['tratamento odontologico concluido', 'tratamento concluido']],
    ['B3', 'Taxa de exodontia', ['exodontia']],
    ['B4', 'Escovação supervisionada em faixa etária escolar, de 6 a 12 anos', ['escovacao supervisionada']],
    ['B5', 'Procedimentos odontológicos preventivos', ['procedimentos odontologicos preventivos']],
    ['B6', 'Tratamento restaurador atraumático', ['tratamento restaurador atraumatico']]
  ],
  eMulti: [
    ['M1', 'Média de atendimentos por pessoa pela eMulti na APS', ['media de atendimentos']],
    ['M2', 'Ações interprofissionais realizadas pela eMulti na APS', ['acoes interprofissionais']]
  ],
  eAPP: [
    ['P1', 'Mais acesso à Atenção Primária Prisional', ['mais acesso']],
    ['P2', 'Cuidado na gestação', ['gestacao']],
    ['P3', 'Cuidado da pessoa com diabetes e/ou hipertensão', ['diabetes', 'hipertensao']],
    ['P4', 'Rastreio de infecções sexualmente transmissíveis', ['infeccoes sexualmente transmissiveis']],
    ['P5', 'Cuidado da pessoa com tuberculose', ['tuberculose']],
    ['P6', 'Cuidado da mulher na prevenção do câncer', ['saude da mulher', 'prevencao do cancer']]
  ],
  eCR: [
    ['CR1', 'Mais acesso à eCR', ['mais acesso']],
    ['CR2', 'Cuidado na gestação', ['gestacao']],
    ['CR3', 'Rastreio de infecções sexualmente transmissíveis', ['infeccoes sexualmente transmissiveis']],
    ['CR4', 'Cuidado da pessoa com tuberculose', ['tuberculose']]
  ],
  eSFR: [
    ['R1', 'Mais acesso à equipe de Saúde da Família Ribeirinha', ['mais acesso']],
    ['R2', 'Cuidado no desenvolvimento infantil pela eSFR', ['desenvolvimento infantil']],
    ['R3', 'Cuidado na gestação e puerpério realizados pela eSFR', ['gestacao', 'gestante', 'puerperio']],
    ['R4', 'Cuidado da pessoa com diabetes realizado pela eSFR', ['diabetes']],
    ['R5', 'Cuidado da pessoa com hipertensão pela eSFR', ['hipertensao']],
    ['R6', 'Cuidado da mulher na prevenção do câncer pela eSFR', ['saude da mulher', 'prevencao do cancer']]
  ]
};

const normalizarIndicador = texto => String(texto || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/ª/g, 'a')
  .toLowerCase();

function identificarIndicadorCofinanciamento(row) {
  const texto = normalizarIndicador(row.indicador);
  if (normalizarIndicador(row.componente) === 'cvat') {
    const dimensao = texto.includes('cadastro') ? 'Cadastro' : texto.includes('acompanhamento') ? 'Acompanhamento' : row.indicador;
    return { codigo: 'CVAT', nome: `Dimensão ${dimensao}`, ordem: texto.includes('cadastro') ? 1 : texto.includes('acompanhamento') ? 2 : 99 };
  }
  const item = (catalogoIndicadoresCofinanciamento[row.equipe] || []).find(([, , termos]) => termos.some(termo => texto.includes(termo)));
  if (!item) return { codigo: '', nome: row.indicador, ordem: 999 };
  const [codigo, nome] = item;
  return { codigo, nome, ordem: Number(codigo.match(/\d+/)?.[0] || 999) };
}

const municipioUf = {
  '350840': 'SP',
  '351510': 'SP',
  '311210': 'MG',
  '312370': 'MG',
  '312580': 'MG',
  '520890': 'GO',
  '315800': 'MG',
  '316020': 'MG',
  '316294': 'MG',
  '316870': 'MG'
};

function atualizarOpcoesMunicipio() {
  const apenasMinasGerais = currentTopic === 'Pagamentos SES';
  [...selectMunicipio.options].forEach((option) => {
    if (!option.value) return;
    const disponivel = !apenasMinasGerais || municipioUf[option.value] === 'MG';
    option.hidden = !disponivel;
    option.disabled = !disponivel;
  });
}

const formatarNumero = (valor) => valor == null || !Number.isFinite(valor) ? 'Não disponível' : new Intl.NumberFormat('pt-BR').format(valor);

function dataLocalIso(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function definirDatasPadraoSES() {
  const agora = new Date();
  const inicial = document.querySelector('#ses-query-start');
  const final = document.querySelector('#ses-query-end');
  inicial.value = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`;
  final.value = dataLocalIso(agora);
}

function intervaloConsultaSES() {
  return {
    inicial: document.querySelector('#ses-query-start')?.value || '',
    final: document.querySelector('#ses-query-end')?.value || ''
  };
}

function formatarDataIso(valor) {
  const [ano, mes, dia] = String(valor || '').split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : '';
}

function formatarPeriodoRelatorio() {
  if (currentTopic === 'Pagamentos SES') {
    const { inicial, final } = intervaloConsultaSES();
    return inicial && final ? `De ${formatarDataIso(inicial)} a ${formatarDataIso(final)}` : '';
  }
  const tipoPeriodo = document.querySelector('input[name="periodo-tipo"]:checked')?.value;
  const valor = selectPeriodo.value;
  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  if (tipoPeriodo === 'anual') return `Ano de ${valor}`;

  if (tipoPeriodo === 'quadrimestral') {
    const [quadrimestre, ano] = valor.split('-');
    return `${quadrimestre}º Quadrimestre de ${ano}`;
  }

  if (tipoPeriodo === 'mensal') {
    const [mes, ano] = valor.split('/');
    return `${meses[Number(mes) - 1]} de ${ano}`;
  }

  return '';
}

function atualizarCabecalhoRelatorio() {
  const nomeMunicipio = selectMunicipio.options[selectMunicipio.selectedIndex]?.text || '';
  const uf = municipioUf[selectMunicipio.value] || '';
  const periodo = currentTopic === 'Cobertura da APS' ? referenciaCobertura() : formatarPeriodoRelatorio();
  document.querySelector('.print-identification h1').textContent = currentTopic === 'Financiamento'
    ? 'Repasses do Fundo Nacional de Saúde (FNS)'
    : currentTopic === 'Pagamentos SES'
      ? 'Relatório de Pagamentos SES'
    : `Relatório de ${currentTopic === 'Cobertura da APS' ? 'Cobertura' : currentTopic} da Atenção Primária`;
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  document.querySelector('#print-city').textContent = `${nomeMunicipio}/${uf}`;
  document.querySelector('#print-period').textContent = periodo;
  document.querySelector('#print-issued-at').textContent = `Documento emitido em: ${dataHora}`;

  let estiloPagina = document.querySelector('#print-page-style');
  if (!estiloPagina) {
    estiloPagina = document.createElement('style');
    estiloPagina.id = 'print-page-style';
    document.head.appendChild(estiloPagina);
  }
  estiloPagina.textContent = `
    @media print {
      @page {
        @bottom-left {
          content: "Documento gerado eletronicamente a partir do acesso do usuário ao Sistema Hórus de Informações da Atenção Primária.\\A Emitido eletronicamente por HSN em ${dataHora}.";
          white-space: pre-wrap;
          width: 155mm;
        }
      }
    }
  `;
}

function obterDadosProducao(indicador, meses) {
  return meses.map(competencia => dadosFonte.dados.producao.find(row => row.tipo === indicador.tipo && row.competencia === competencia)).filter(Boolean);
}

function renderizarDetalhamentoVisitas(mesesResumo, mesesGrafico = mesesResumo) {
  const obter = meses => meses.map(mes => dadosFonte.dados.visitas.find(row => row.competencia === mes)).filter(row => row && ['realizadas','recusadas','ausentes'].every(k => row[k] != null));
  const dadosResumo = obter(mesesResumo);
  const dados = obter(mesesGrafico);
  if (!dados.length || !dadosResumo.length) return '<article class="acs-detail-panel"><h3>Detalhamento das Visitas ACS</h3><p>Não há dados de visitas ACS disponibilizados para o período selecionado.</p></article>';
  const realizadas = dadosResumo.reduce((total, item) => total + item.realizadas, 0);
  const recusadas = dadosResumo.reduce((total, item) => total + item.recusadas, 0);
  const ausentes = dadosResumo.reduce((total, item) => total + item.ausentes, 0);
  const visitasTotais = realizadas + recusadas + ausentes;
  const acsMeses = dadosResumo.every(row => row.qtdAcs > 0) ? dadosResumo.reduce((s,row) => s + row.qtdAcs, 0) : null;
  const mediaMes = acsMeses ? realizadas / acsMeses : null;
  const mediaDia = mediaMes == null ? null : mediaMes / 22;
  const formatarMedia = (valor) => valor == null ? 'Não disponível' : valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const largura = Math.max(1100, dados.length * 110);
  const altura = 285;
  const margem = { esquerda: 28, direita: 28, topo: 38, inferior: 58 };
  const larguraUtil = largura - margem.esquerda - margem.direita;
  const alturaUtil = altura - margem.topo - margem.inferior;
  const maiorValor = Math.max(...dados.flatMap((item) => [item.realizadas, item.recusadas, item.ausentes]), 1) * 1.16;
  const pontoX = (indice) => margem.esquerda + (dados.length === 1 ? larguraUtil / 2 : (indice * larguraUtil) / (dados.length - 1));
  const pontoY = (valor) => margem.topo + alturaUtil - (valor / maiorValor) * alturaUtil;
  const pontos = (chave) => dados.map((item, indice) => `${pontoX(indice)},${pontoY(item[chave])}`).join(' ');
  const linhasGrade = [0, 1, 2, 3].map((nivel) => {
    const y = margem.topo + (nivel * alturaUtil) / 3;
    return `<line x1="${margem.esquerda}" y1="${y}" x2="${largura - margem.direita}" y2="${y}" class="line-grid" />`;
  }).join('');
  const marcadores = dados.map((item, indice) => {
    const x = pontoX(indice);
    return `
      <circle cx="${x}" cy="${pontoY(item.realizadas)}" r="4" class="acs-point acs-realizadas"><title>${item.competencia}: ${formatarNumero(item.realizadas)} realizadas</title></circle>
      <text x="${x}" y="${pontoY(item.realizadas) - 9}" class="acs-line-value acs-value-realizadas">${formatarNumero(item.realizadas)}</text>
      <circle cx="${x}" cy="${pontoY(item.recusadas)}" r="4" class="acs-point acs-recusadas"><title>${item.competencia}: ${formatarNumero(item.recusadas)} recusadas</title></circle>
      <text x="${x}" y="${pontoY(item.recusadas) + 23}" class="acs-line-value acs-value-recusadas">${formatarNumero(item.recusadas)}</text>
      <circle cx="${x}" cy="${pontoY(item.ausentes)}" r="4" class="acs-point acs-ausentes"><title>${item.competencia}: ${formatarNumero(item.ausentes)} ausentes</title></circle>
      <text x="${x}" y="${pontoY(item.ausentes) - 11}" class="acs-line-value acs-value-ausentes">${formatarNumero(item.ausentes)}</text>
      <text x="${x}" y="${altura - 9}" class="line-label">${item.competencia}</text>
    `;
  }).join('');

  return `
    <article class="acs-detail-panel">
      <h3>Detalhamento das Visitas ACS</h3>
      <p class="indicator-note">Competências incluídas no resumo: ${dadosResumo.map(row => row.competencia).join(', ')}. Média mensal: visitas realizadas divididas pela soma de ACS de cada competência. Média diária estimada: média mensal dividida por 22, conforme critério do Painel CONASEMS. ${dadosResumo.length < mesesResumo.length ? 'Há competências sem dados; o somatório é parcial.' : ''}</p>
      <div class="acs-summary">
        <div class="acs-summary-card green"><span>Visitas Realizadas</span><strong>${formatarNumero(realizadas)}</strong></div>
        <div class="acs-summary-card red"><span>Visitas Recusadas</span><strong>${formatarNumero(recusadas)}</strong></div>
        <div class="acs-summary-card yellow"><span>Pacientes Ausentes</span><strong>${formatarNumero(ausentes)}</strong></div>
        <div class="acs-summary-card blue"><span>Visitas Totais</span><strong>${formatarNumero(visitasTotais)}</strong></div>
        <div class="acs-summary-card navy"><span>Média por ACS/mês</span><strong>${formatarMedia(mediaMes)}</strong></div>
        <div class="acs-summary-card navy"><span>Média por ACS/dia</span><strong>${formatarMedia(mediaDia)}</strong></div>
      </div>
      <div class="acs-chart-card">
        <div class="chart-heading">
          <p class="chart-title">Evolução das visitas por competência</p>
          <div class="chart-legend">
            <span><i class="legend-realizadas"></i>Realizadas</span>
            <span><i class="legend-recusadas"></i>Recusadas</span>
            <span><i class="legend-ausentes"></i>Ausentes</span>
          </div>
        </div>
        <div class="line-chart-wrap">
          <svg class="line-chart acs-line-chart" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Evolução das visitas realizadas, recusadas e ausentes">
            ${linhasGrade}
            <polyline points="${pontos('realizadas')}" class="line-series acs-line-realizadas" />
            <polyline points="${pontos('recusadas')}" class="line-series acs-line-recusadas" />
            <polyline points="${pontos('ausentes')}" class="line-series acs-line-ausentes" />
            ${marcadores}
          </svg>
        </div>
      </div>
    </article>
  `;
}

function renderizarProducao(meses) {
  const tipoPeriodo = document.querySelector('input[name="periodo-tipo"]:checked')?.value;
  const periodoLabel = selectPeriodo.options[selectPeriodo.selectedIndex]?.text || '';
  const periodoRelatorio = formatarPeriodoRelatorio();
  const quadrosPrincipais = indicadoresProducao.map((indicador) => {
    const dados = obterDadosProducao(indicador, meses).filter(row => row.atendimentos != null && row.pessoas != null);
    if (!dados.length) return `<article class="indicator-panel"><h3>${indicador.nome}</h3><p>Não há dados disponíveis para este indicador no período selecionado.</p></article>`;
    const totalAtendimentos = dados.reduce((total, item) => total + item.atendimentos, 0);
    const totalPessoas = dados.reduce((total, item) => total + item.pessoas, 0);
    const maiorValor = Math.max(...dados.flatMap((item) => [item.atendimentos, item.pessoas]), 1);
    const colunas = dados.map((item) => `
      <div class="month-group">
        <div class="grouped-bars">
          <div class="series-column">
            <span class="column-value">${formatarNumero(item.atendimentos)}</span>
            <div class="column-bar attendances" style="height:calc(var(--column-max-height, 95px) * ${item.atendimentos / maiorValor});min-height:0" title="${item.competencia}: ${formatarNumero(item.atendimentos)} atendimentos"></div>
          </div>
          <div class="series-column">
            <span class="column-value">${formatarNumero(item.pessoas)}</span>
            <div class="column-bar people" style="height:calc(var(--column-max-height, 95px) * ${item.pessoas / maiorValor});min-height:0" title="${item.competencia}: ${formatarNumero(item.pessoas)} pessoas atendidas"></div>
          </div>
        </div>
        <span class="column-label">${item.competencia}</span>
      </div>
    `).join('');

    const largura = Math.max(760, dados.length * 68);
    const altura = 230;
    const margem = { esquerda: 42, direita: 22, topo: 32, inferior: 38 };
    const larguraUtil = largura - margem.esquerda - margem.direita;
    const alturaUtil = altura - margem.topo - margem.inferior;
    const escalaMaxima = maiorValor * 1.15;
    const pontoX = (indice) => margem.esquerda + (dados.length === 1 ? larguraUtil / 2 : (indice * larguraUtil) / (dados.length - 1));
    const pontoY = (valor) => margem.topo + alturaUtil - (valor / escalaMaxima) * alturaUtil;
    const pontosAtendimentos = dados.map((item, indice) => `${pontoX(indice)},${pontoY(item.atendimentos)}`).join(' ');
    const pontosPessoas = dados.map((item, indice) => `${pontoX(indice)},${pontoY(item.pessoas)}`).join(' ');
    const linhasGrade = [0, 1, 2, 3].map((nivel) => {
      const y = margem.topo + (nivel * alturaUtil) / 3;
      return `<line x1="${margem.esquerda}" y1="${y}" x2="${largura - margem.direita}" y2="${y}" class="line-grid" />`;
    }).join('');
    const marcadores = dados.map((item, indice) => {
      const x = pontoX(indice);
      const yAtendimentos = pontoY(item.atendimentos);
      const yPessoas = pontoY(item.pessoas);
      return `
        <circle cx="${x}" cy="${yAtendimentos}" r="4" class="point-attendances"><title>${item.competencia}: ${formatarNumero(item.atendimentos)} atendimentos</title></circle>
        <text x="${x}" y="${yAtendimentos - 9}" class="line-value value-attendances">${formatarNumero(item.atendimentos)}</text>
        <circle cx="${x}" cy="${yPessoas}" r="4" class="point-people"><title>${item.competencia}: ${formatarNumero(item.pessoas)} pessoas atendidas</title></circle>
        <text x="${x}" y="${yPessoas + 16}" class="line-value value-people">${formatarNumero(item.pessoas)}</text>
        <text x="${x}" y="${altura - 9}" class="line-label">${item.competencia}</text>
      `;
    }).join('');
    const graficoLinhas = `
      <div class="line-chart-wrap">
        <svg class="line-chart" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Evolução mensal de atendimentos e pessoas atendidas de ${indicador.nome}">
          ${linhasGrade}
          <polyline points="${pontosAtendimentos}" class="line-series line-attendances" />
          <polyline points="${pontosPessoas}" class="line-series line-people" />
          ${marcadores}
        </svg>
      </div>
    `;
    const barrasHorizontais = dados.map((item) => {
      const larguraAtendimentos = (item.atendimentos / maiorValor) * 100;
      const larguraPessoas = (item.pessoas / maiorValor) * 100;
      return `
        <div class="horizontal-chart-group">
          <span class="horizontal-competence">${item.competencia}</span>
          <div class="horizontal-series-row">
            <span>Atendimentos</span>
            <div class="horizontal-track"><div class="horizontal-fill blue" style="width:${larguraAtendimentos}%"></div></div>
            <strong>${formatarNumero(item.atendimentos)}</strong>
          </div>
          <div class="horizontal-series-row">
            <span>Pessoas atendidas</span>
            <div class="horizontal-track"><div class="horizontal-fill green" style="width:${larguraPessoas}%"></div></div>
            <strong>${formatarNumero(item.pessoas)}</strong>
          </div>
        </div>
      `;
    }).join('');
    const graficoHorizontal = `<div class="horizontal-bar-chart" role="img" aria-label="Produção mensal de ${indicador.nome}">${barrasHorizontais}</div>`;
    const grafico = tipoPeriodo === 'anual'
      ? graficoLinhas
      : tipoPeriodo === 'mensal'
        ? graficoHorizontal
        : `<div class="column-chart" role="img" aria-label="Gráfico mensal de atendimentos e pessoas atendidas de ${indicador.nome}">${colunas}</div>`;

    return `
      <article class="indicator-panel">
        <h3>${indicador.nome}</h3>
        <div class="indicator-content">
          <div class="total-card">
            <div class="total-metric"><span>Nº de Atendimentos</span><strong>${formatarNumero(totalAtendimentos)}</strong></div>
            <div class="total-metric"><span>Nº de Pessoas Atendidas</span><strong>${formatarNumero(totalPessoas)}</strong></div>
          </div>
          <div class="chart-card">
            <div class="chart-heading">
              <p class="chart-title">Produção do ${periodoLabel}</p>
              <div class="chart-legend" aria-label="Legenda do gráfico">
                <span><i class="legend-blue"></i>Atendimentos</span>
                <span><i class="legend-green"></i>Pessoas atendidas</span>
              </div>
            </div>
            ${grafico}
          </div>
        </div>
        <p class="indicator-note">
          Competências com dados: ${dados.map(row => row.competencia).join(', ')}. ${dados.length < meses.length ? 'Somatório parcial: há competências sem dados para este indicador.' : ''}
          ${indicador.descricao} durante o período de referência analisado, que compreende: ${periodoRelatorio}.
          <span><strong>Fonte:</strong> ${fonteSiaps}</span>
        </p>
      </article>
    `;
  }).join('');
  let mesesGraficoVisitas = meses;
  if (tipoPeriodo === 'mensal' && meses.length === 1) {
    const [mesConsultado, anoConsultado] = meses[0].split('/').map(Number);
    mesesGraficoVisitas = ordenarCompetencias(dadosFonte.dados.visitas.map(row => row.competencia)).filter((competencia) => {
      const [mes, ano] = competencia.split('/').map(Number);
      return ano === anoConsultado && mes <= mesConsultado;
    });
  }
  const esperado = tipoPeriodo === 'anual' ? 12 : tipoPeriodo === 'quadrimestral' ? 4 : 1;
  const aviso = meses.length < esperado ? `<p class="indicator-note">Período com dados parciais: ${meses.length} de ${esperado} competências disponíveis no CONASEMS. Os totais abrangem somente os meses listados em cada quadro.</p>` : '';
  productionIndicators.innerHTML = aviso + quadrosPrincipais + renderizarDetalhamentoVisitas(meses, mesesGraficoVisitas);
}

const PRIMEIRO_EXERCICIO_FNS = 2016;

function mesesDoExercicio(ano, inicio = 1, fim = 12) {
  return Array.from({ length: fim - inicio + 1 }, (_, indice) => `${String(inicio + indice).padStart(2, '0')}/${ano}`);
}

function obterOpcoesFNS(tipo) {
  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;
  const anos = Array.from({ length: anoAtual - PRIMEIRO_EXERCICIO_FNS + 1 }, (_, indice) => anoAtual - indice);

  if (tipo === 'anual') return anos.map(ano => ({ value: String(ano), label: String(ano), meses: mesesDoExercicio(ano) }));

  if (tipo === 'quadrimestral') {
    return anos.flatMap(ano => {
      const ultimoQuadrimestre = ano === anoAtual ? Math.floor(mesAtual / 4) : 3;
      return Array.from({ length: ultimoQuadrimestre }, (_, indice) => ultimoQuadrimestre - indice).map(quadrimestre => {
        const inicio = (quadrimestre - 1) * 4 + 1;
        return { value: `${quadrimestre}-${ano}`, label: `${quadrimestre}º Quadrimestre/${ano}`, meses: mesesDoExercicio(ano, inicio, inicio + 3) };
      });
    });
  }

  return anos.flatMap(ano => {
    const ultimoMes = ano === anoAtual ? mesAtual : 12;
    return Array.from({ length: ultimoMes }, (_, indice) => ultimoMes - indice).map(mes => {
      const competencia = `${String(mes).padStart(2, '0')}/${ano}`;
      return { value: competencia, label: competencia, meses: [competencia] };
    });
  });
}

function obterOpcoes(tipo) {
  if (temasComReferenciaLivre.has(currentTopic)) return obterOpcoesFNS(tipo);
  if (currentTopic === 'Cofinanciamento') {
    const quadrimestres = [...new Set(dadosFonte.dados.map(row => row.quadrimestre))].sort().reverse();
    if (tipo === 'mensal') return [];
    if (tipo === 'anual') return [...new Set(quadrimestres.map(q => q.slice(0,4)))].map(ano => ({ value: ano, label: ano, meses: [] }));
    return quadrimestres.map(q => ({ value: `${q[5]}-${q.slice(0,4)}`, label: `${q[5]}º Quadrimestre/${q.slice(0,4)}`, meses: [] }));
  }
  if (tipo === 'mensal') {
    return competenciasDisponiveis.map((competencia) => ({
      value: competencia,
      label: competencia,
      meses: [competencia]
    })).reverse();
  }

  const anos = [...new Set(competenciasDisponiveis.map((item) => item.split('/')[1]))].sort().reverse();

  if (tipo === 'anual') {
    return anos.map((ano) => ({
      value: ano,
      label: ano,
      meses: competenciasDisponiveis.filter((item) => item.endsWith(`/${ano}`))
    }));
  }

  return anos.flatMap((ano) => [1, 2, 3].map((numero) => {
    const inicio = (numero - 1) * 4 + 1;
    const meses = competenciasDisponiveis.filter((item) => {
      const [mes, anoItem] = item.split('/');
      return anoItem === ano && Number(mes) >= inicio && Number(mes) <= inicio + 3;
    });
    return { value: `${numero}-${ano}`, label: `${numero}º Quadrimestre/${ano}`, meses };
  })).filter((item) => item.meses.length > 0);
}

function mostrarStatus(texto) {
  const status = document.querySelector('#source-status');
  status.textContent = texto;
  status.hidden = !texto;
}

const faixasAps = ['regular', 'suficiente', 'bom', 'otimo'];
const rotulosAps = ['Regular', 'Suficiente', 'Bom', 'Ótimo'];
const coresAps = ['#FF5C00', '#FFB800', '#18BFA7', '#1648E8'];
const percentualAps = (n, total) => total ? 100 * n / total : 0;
const textoPercentualAps = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const equipeAps = nome => nome === 'eMulti' ? 'e-Multi' : nome;

function consolidarAvaliacoesAps(registros) {
  const qualidade = { avisos: [], erros: [] };
  const consolidados = new Map();
  registros.forEach((row, ordemOriginal) => {
    const indicador = identificarIndicadorCofinanciamento(row);
    // CVAT possui duas dimensões distintas, embora ambas usem a sigla CVAT.
    const codigo = indicador.codigo === 'CVAT' ? `CVAT:${indicador.nome}` : indicador.codigo || row.indicador;
    const chave = JSON.stringify([row.equipe, row.componente, codigo]);
    const valores = faixasAps.map(f => {
      const v = row[f];
      if (v == null || v === '') return 0;
      if (!['string', 'number'].includes(typeof v)) return NaN;
      return Number(v);
    });
    if (valores.some(v => !Number.isSafeInteger(v) || v < 0)) {
      qualidade.erros.push(`Contagem inválida: ${row.equipe}, ${row.indicador}.`);
      return;
    }
    if (!consolidados.has(chave)) consolidados.set(chave, {
      equipe: row.equipe, componente: row.componente, codigo, indicador,
      ordemOriginal, valores: [0, 0, 0, 0]
    });
    const destino = consolidados.get(chave);
    valores.forEach((v, i) => destino.valores[i] += v);
  });
  const linhas = [...consolidados.values()].filter(row => {
    row.total = row.valores.reduce((s, n) => s + n, 0);
    if (!row.total) qualidade.avisos.push(`Sem classificações: ${row.equipe}, ${row.indicador.nome}.`);
    return row.total > 0;
  });
  const totais = [0, 0, 0, 0];
  const componentes = new Map();
  const indicadores = new Map();
  linhas.forEach(row => {
    row.valores.forEach((v, i) => totais[i] += v);
    for (const [mapa, chave] of [[componentes, JSON.stringify([row.equipe, row.componente])], [indicadores, JSON.stringify([row.equipe, row.codigo])]]) {
      if (!mapa.has(chave)) mapa.set(chave, { ...row, valores: [0, 0, 0, 0] });
      row.valores.forEach((v, i) => mapa.get(chave).valores[i] += v);
    }
  });
  const finalizar = row => {
    row.total = row.valores.reduce((s, n) => s + n, 0);
    row.percentuais = row.valores.map(v => percentualAps(v, row.total));
    const ultimo = row.valores.findLastIndex(v => v > 0);
    let acumulado = 0;
    row.exibidos = row.valores.map((v, i) => {
      const pct = !v ? 0 : i === ultimo ? 100 - acumulado : Math.floor(row.percentuais[i]);
      acumulado += pct;
      return pct;
    });
    return row;
  };
  const ordem = row => normalizarIndicador(row.componente) === 'cvat' ? 0 : row.equipe === 'eMulti' ? 1 : 2;
  const grupos = [...componentes.values()].map(finalizar).sort((a, b) => ordem(a) - ordem(b) || equipeAps(a.equipe).localeCompare(equipeAps(b.equipe), 'pt-BR') || a.ordemOriginal - b.ordemOriginal);
  const mapa = [...indicadores.values()].map(finalizar).sort((a, b) => b.percentuais[3] - a.percentuais[3] || b.percentuais[2] - a.percentuais[2] || b.percentuais[1] - a.percentuais[1] || b.percentuais[0] - a.percentuais[0] || a.ordemOriginal - b.ordemOriginal);
  return { totais, total: totais.reduce((s, n) => s + n, 0), grupos, mapa, qualidade };
}

function legendaAps() {
  return `<div class="aps-legend">${rotulosAps.map((nome, i) => `<span><i style="background:${coresAps[i]}"></i>${nome}</span>`).join('')}</div>`;
}

function barraAps(row, mapa = false) {
  const descricao = row.valores.map((v, i) => `${rotulosAps[i]}: ${v} (${textoPercentualAps(row.percentuais[i])})`).join('; ');
  return `<div class="aps-stack" role="img" aria-label="${escapar(descricao)}">${row.valores.map((v, i) => v ? `<span style="width:${row.percentuais[i]}%;background:${coresAps[i]};color:${i === 1 ? '#151515' : '#fff'}" title="${rotulosAps[i]}: ${v} (${textoPercentualAps(row.percentuais[i])})">${row.percentuais[i] >= (mapa ? 12 : 6) ? (mapa ? row.exibidos[i] + '%' : formatarNumero(v)) : ''}</span>` : '').join('')}</div>`;
}

function roscaAps(dados) {
  let acumulado = 0;
  const segmentos = dados.totais.map((n, i) => {
    if (!n) return '';
    const pct = percentualAps(n, dados.total);
    const meio = (acumulado + pct / 2) / 100 * Math.PI * 2 - Math.PI / 2;
    const inicio = acumulado;
    acumulado += pct;
    return `<circle cx="150" cy="150" r="104" pathLength="100" fill="none" stroke="${coresAps[i]}" stroke-width="70" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${-inicio}" transform="rotate(-90 150 150)"><title>${rotulosAps[i]}: ${n}, ${textoPercentualAps(pct)}</title></circle>${pct >= 7 ? `<text x="${150 + 104 * Math.cos(meio)}" y="${150 + 104 * Math.sin(meio)}" fill="${i === 1 ? '#151515' : 'white'}">${textoPercentualAps(pct)}</text>` : ''}`;
  }).join('');
  return `<svg class="aps-donut" viewBox="0 0 300 300" role="img" aria-label="Distribuição geral dos resultados">${segmentos}</svg>`;
}

const nomesCurtosAps = {
  C1: 'Mais acesso à APS', C2: 'Desenv. infantil', C3: 'Gestação e puerpério', C4: 'Diabetes', C5: 'Hipertensão', C6: 'Pessoa idosa', C7: 'Câncer da mulher',
  B1: 'Primeira consulta', B2: 'Tratamento concluído', B3: 'Exodontia', B4: 'Escovação', B5: 'Proc. preventivos', B6: 'Trat. restaurador',
  M1: 'Atendimentos', M2: 'Ações interprofissionais'
};
function renderizarResumoAps(registros) {
  const dados = consolidarAvaliacoesAps(registros);
  const vazio = '<p class="aps-no-data">Sem dados para o município e período selecionados</p>';
  const metade = Math.ceil(dados.mapa.length / 2);
  const percentualRegularSuficiente = percentualAps(dados.totais[0] + dados.totais[1], dados.total);
  const leituraAlerta = percentualRegularSuficiente >= 50.1;
  const percentualLeituraRapida = leituraAlerta ? percentualRegularSuficiente : percentualAps(dados.totais[2] + dados.totais[3], dados.total);
  const textoLeituraRapida = leituraAlerta ? 'estão em Regular ou Suficiente.' : 'estão em Bom ou Ótimo.';
  const classeLeituraRapida = leituraAlerta ? ' aps-quick-alert' : '';
  const linhaMapa = row => {
    const cvat = row.indicador.codigo === 'CVAT';
    const nome = cvat ? `CVAT ${row.indicador.nome.replace('Dimensão ', '')}` : `${row.indicador.codigo} ${nomesCurtosAps[row.indicador.codigo] || row.indicador.nome}`;
    return `<div class="aps-map-row"><div class="aps-map-label" title="${escapar(row.indicador.nome)}"><strong>${escapar(cvat ? 'CVAT' : equipeAps(row.equipe))}</strong><span>${escapar(nome)}</span></div>${barraAps(row, true)}</div>`;
  };
  return `<section class="aps-visual" aria-label="Avaliação dos indicadores de Cofinanciamento">
    <section class="aps-summary-block"><h3>Resumo da avaliação</h3><div class="aps-scorecards">
      <div class="aps-score aps-score-total"><strong>${formatarNumero(dados.total)}</strong><span>Nº de Classificações</span></div>
      ${rotulosAps.map((nome, i) => `<div class="aps-score" style="--score-color:${coresAps[i]}"><span>${nome}</span><strong>${textoPercentualAps(percentualAps(dados.totais[i], dados.total))}</strong></div>`).join('')}
    </div></section>
    ${dados.qualidade.erros.length ? '<p class="aps-no-data" role="alert">Há contagens inválidas na fonte. Os registros inválidos foram excluídos desta avaliação.</p>' : ''}
    <section class="aps-visual-panel"><h3>Distribuição geral dos resultados</h3>${dados.total ? `<div class="aps-distribution">${roscaAps(dados)}<div class="aps-distribution-legend">${rotulosAps.map((nome, i) => `<div><i style="background:${coresAps[i]}"></i><strong>${nome}</strong><b>${formatarNumero(dados.totais[i])}</b><span>${textoPercentualAps(percentualAps(dados.totais[i], dados.total))}</span></div>`).join('')}</div><aside class="aps-quick${classeLeituraRapida}"><h4>Leitura rápida</h4><strong>${textoPercentualAps(percentualLeituraRapida)}</strong><p>das classificações<br>${textoLeituraRapida}</p></aside></div>` : vazio}</section>
    <section class="aps-visual-panel"><div class="aps-panel-heading"><h3>Desempenho por componente</h3>${legendaAps()}</div>${dados.total ? `<div class="aps-components">${dados.grupos.map(row => `<div class="aps-component-row"><strong>${escapar(equipeAps(row.equipe))} · ${escapar(row.componente)}</strong>${barraAps(row)}</div>`).join('')}</div>` : vazio}</section>
    <section class="aps-visual-panel"><div class="aps-panel-heading"><h3>Mapa de desempenho por indicador</h3>${legendaAps()}</div>${dados.total ? `<div class="aps-map"><div>${dados.mapa.slice(0, metade).map(linhaMapa).join('')}</div><div>${dados.mapa.slice(metade).map(linhaMapa).join('')}</div></div>` : vazio}</section>
  </section>`;
}

function formatarMoeda(valor) {
  return Number.isFinite(valor)
    ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'Não informado';
}

function ordemDataPagamento(valor) {
  const texto = String(valor || '').trim();
  const brasileiro = texto.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  if (brasileiro) return Number(`${brasileiro[3]}${brasileiro[2].padStart(2, '0')}${brasileiro[1].padStart(2, '0')}`);
  const iso = texto.match(/\b(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\b/);
  return iso ? Number(`${iso[1]}${iso[2].padStart(2, '0')}${iso[3].padStart(2, '0')}`) : Number.MAX_SAFE_INTEGER;
}

function dataIsoPagamento(valor) {
  const texto = String(valor || '').trim();
  const brasileiro = texto.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  if (brasileiro) return `${brasileiro[3]}-${brasileiro[2].padStart(2, '0')}-${brasileiro[1].padStart(2, '0')}`;
  const iso = texto.match(/\b(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\b/);
  return iso ? `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}` : '';
}

function ordenarResolucaoSES(a, b) {
  const [numeroA, anoA] = String(a).split('/');
  const [numeroB, anoB] = String(b).split('/');
  const diferencaAno = Number(anoA || 0) - Number(anoB || 0);
  return diferencaAno || Number(numeroA.replace(/\D/g, '')) - Number(numeroB.replace(/\D/g, '')) || String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
}

let pagamentosSESPeriodo = [];

function linhasPagamentosSES(pagamentos) {
  return pagamentos.map(registro => {
    const resolucao = `${registro.numeroResolucao || 'Não informada'}${registro.origem === 'restos-a-pagar' ? '*' : ''}`;
    return `<tr>
    <td class="ses-date">${escapar(registro.dataPagamento || 'Não informada')}</td>
    <td class="ses-resolution">${escapar(resolucao)}</td>
    <td>${escapar(registro.projetoAtividade || 'Não informado')}</td>
    <td class="ses-account">${escapar(registro.contaCorrente || 'Não informada')}</td>
    <td class="ses-currency">${formatarMoeda(registro.valorPago)}</td>
  </tr>`;
  }).join('');
}

function atualizarTabelaPagamentosSES() {
  const origem = document.querySelector('#ses-origem')?.value || 'todos';
  const conta = document.querySelector('#ses-conta-corrente')?.value || '';
  const resolucao = document.querySelector('#ses-resolucao')?.value || '';
  const filtrados = pagamentosSESPeriodo.filter(registro => {
    return (origem === 'todos' || registro.origem === origem)
      && (!conta || registro.contaCorrente === conta)
      && (!resolucao || registro.numeroResolucao === resolucao);
  });
  const corpo = document.querySelector('#ses-payment-rows');
  const quantidade = document.querySelector('#ses-payment-count');
  if (corpo) corpo.innerHTML = linhasPagamentosSES(filtrados) || '<tr><td colspan="5" class="ses-empty">Não há pagamentos para os filtros selecionados.</td></tr>';
  if (quantidade) quantidade.textContent = `${filtrados.length} ${filtrados.length === 1 ? 'registro' : 'registros'}`;
  printButton.disabled = filtrados.length === 0;
}

function renderizarPagamentosSES() {
  const { inicial, final } = intervaloConsultaSES();
  const chavesDuplicadas = new Set();
  pagamentosSESPeriodo = (dadosFonte?.dados?.pagamentos || [])
    .filter(registro => {
      const data = dataIsoPagamento(registro.dataPagamento);
      return data && data >= inicial && data <= final;
    })
    .map((registro, ordem) => ({ registro, ordem }))
    .sort((a, b) => ordemDataPagamento(a.registro.dataPagamento) - ordemDataPagamento(b.registro.dataPagamento) || a.ordem - b.ordem)
    .map(({ registro }) => registro)
    .filter(registro => {
      const data = dataIsoPagamento(registro.dataPagamento);
      const valor = Number.isFinite(registro.valorPago) ? registro.valorPago.toFixed(2) : '';
      const empenho = String(registro.numeroEmpenho || '').replace(/\s+/g, '').toUpperCase();
      if (!data || !valor || !empenho) return true;
      const chave = `${data}\u0000${valor}\u0000${empenho}`;
      if (chavesDuplicadas.has(chave)) return false;
      chavesDuplicadas.add(chave);
      return true;
    });
  const municipio = selectMunicipio.options[selectMunicipio.selectedIndex]?.text || '';
  const contas = [...new Set(pagamentosSESPeriodo.map(registro => registro.contaCorrente).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  const resolucoes = [...new Set(pagamentosSESPeriodo.map(registro => registro.numeroResolucao).filter(Boolean))].sort(ordenarResolucaoSES);
  productionIndicators.innerHTML = `<article class="indicator-panel ses-panel">
    <div class="ses-panel-heading"><div><h3>Pagamentos da SES/MG</h3><p>${escapar(municipio)} · ${escapar(formatarPeriodoRelatorio())}</p></div><strong id="ses-payment-count">${pagamentosSESPeriodo.length} ${pagamentosSESPeriodo.length === 1 ? 'registro' : 'registros'}</strong></div>
    <div class="ses-filters" aria-label="Filtros dos pagamentos consultados">
      <label for="ses-origem">Tipo de pagamento<select id="ses-origem"><option value="todos" selected>Todos</option><option value="ordinarios">Ordinários</option><option value="restos-a-pagar">Restos a pagar</option></select></label>
      <label for="ses-conta-corrente">Conta Corrente<select id="ses-conta-corrente"><option value="">Todas as contas</option>${contas.map(conta => `<option value="${escapar(conta)}">${escapar(conta)}</option>`).join('')}</select></label>
      <label for="ses-resolucao">Nº da Resolução<select id="ses-resolucao"><option value="">Todas as resoluções</option>${resolucoes.map(resolucao => `<option value="${escapar(resolucao)}">${escapar(resolucao)}</option>`).join('')}</select></label>
    </div>
    <div class="source-table-wrap"><table class="source-table ses-table">
      <thead><tr><th scope="col">Data do pagamento</th><th scope="col">Nº da resolução</th><th scope="col">Projeto/Atividade</th><th scope="col">Conta corrente</th><th scope="col">Valor pago</th></tr></thead>
      <tbody id="ses-payment-rows">${linhasPagamentosSES(pagamentosSESPeriodo) || '<tr><td colspan="5" class="ses-empty">Não há pagamentos no período selecionado.</td></tr>'}</tbody>
    </table></div>
    <p class="indicator-note"><strong>Fonte:</strong> Secretaria de Estado de Saúde de Minas Gerais (SES/MG). <strong>*</strong> Resolução referente a pagamento de restos a pagar.</p>
  </article>`;
  document.querySelectorAll('#ses-origem, #ses-conta-corrente, #ses-resolucao').forEach(campo => campo.addEventListener('change', atualizarTabelaPagamentosSES));
  productionDashboard.hidden = false;
  printButton.disabled = pagamentosSESPeriodo.length === 0;
}

function renderizarFinanceiro() {
  const tipo = document.querySelector('input[name="periodo-tipo"]:checked').value;
  const ref = selectPeriodo.value;
  if (currentTopic === 'Financiamento') {
    const meses = selectPeriodo.options[selectPeriodo.selectedIndex].dataset.meses.split(',').filter(Boolean);
    const moeda = valor => valor == null ? 'Não disponível' : valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const pagamentos = (dadosFonte.dados.pagamentos || []).filter(row => {
      if (!row.competenciaFiltro) return tipo === 'anual';
      return meses.includes(row.competenciaFiltro);
    });
    const gruposResumo = [
      { titulo: 'Gestão do SUS', corresponde: grupo => grupo.includes('gestao do sus') },
      { titulo: 'Atenção Primária', corresponde: grupo => grupo.includes('atencao primaria') },
      { titulo: 'Assistência Hospitalar e Ambulatorial', corresponde: grupo => grupo.includes('media e alta complexidade') || (grupo.includes('hospitalar') && grupo.includes('ambulatorial')) },
      { titulo: 'Atenção Especializada', corresponde: grupo => grupo.includes('atencao especializada') },
      { titulo: 'Assistência Farmacêutica', corresponde: grupo => grupo.includes('assistencia farmaceutica') },
      { titulo: 'Vigilância em Saúde', corresponde: grupo => grupo.includes('vigilancia em saude') }
    ];
    const valorLiquidoTotal = pagamentos.reduce((total, row) => total + (Number.isFinite(row.valorLiquido) ? row.valorLiquido : 0), 0);
    const resumo = gruposResumo.map(({ titulo, corresponde }) => {
      const valor = pagamentos.reduce((total, row) => corresponde(normalizarIndicador(row.grupo)) ? total + (Number.isFinite(row.valorLiquido) ? row.valorLiquido : 0) : total, 0);
      const percentual = valorLiquidoTotal ? (valor / valorLiquidoTotal) * 100 : 0;
      return `<section class="fns-summary-card"><span>${escapar(titulo)}</span><strong>${moeda(valor)}</strong><small>${percentual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% do valor líquido total</small></section>`;
    }).join('');
    const linhas = pagamentos.map(row => `<tr>
      <td><span class="fns-block fns-${row.bloco === 'Manutenção' ? 'maintenance' : 'structure'}">${escapar(row.bloco)}</span></td>
      <td>${escapar(row.grupo)}</td>
      <td>${escapar(row.acaoDetalhada)}</td>
      <td>${escapar(row.competencia || 'Não informada')}</td>
      <td class="fns-identifier">${escapar(row.agencia || 'Não informada')}</td>
      <td class="fns-identifier">${escapar(row.conta || 'Não informada')}</td>
      <td class="fns-currency">${moeda(row.valorLiquido)}</td>
    </tr>`).join('');
    const entidade = dadosFonte.entidade?.razaoSocial || selectMunicipio.options[selectMunicipio.selectedIndex].text;
    productionIndicators.innerHTML = `<article class="indicator-panel fns-summary-panel">
      <h3>Resumo dos recursos transferidos no período</h3>
      <div class="fns-summary-grid">${resumo}</div>
    </article><article class="indicator-panel fns-panel">
      <div class="fns-panel-heading"><div><h3>Transferências do Fundo Nacional de Saúde</h3><p>${escapar(entidade)}</p></div><strong>${pagamentos.length} registros</strong></div>
      <div class="source-table-wrap"><table class="source-table fns-table">
        <thead><tr><th scope="col">Bloco</th><th scope="col">Grupo</th><th scope="col">Ação Detalhada</th><th scope="col">Competência</th><th scope="col">Agência</th><th scope="col">Conta</th><th scope="col">Valor Líquido</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="7" class="fns-empty">Não há pagamentos para o período selecionado.</td></tr>'}</tbody>
      </table></div>
      <p class="indicator-note"><strong>Fonte:</strong> Fundo Nacional de Saúde (FNS). Dados consultados para o exercício de ${escapar(dadosFonte.ano || ref)}.</p>
    </article>`;
    productionDashboard.hidden = false;
    printButton.disabled = pagamentos.length === 0;
    return;
  }
  let rows;
  let headers;
  if (currentTopic === 'Cofinanciamento') {
    const [q, ano] = ref.split('-');
    const registrosOriginais = dadosFonte.dados.filter(row => tipo === 'anual' ? row.quadrimestre.startsWith(ref) : row.quadrimestre === `${ano}Q${q}`);
    const registros = dadosFonte.dados
      .filter(row => tipo === 'anual' ? row.quadrimestre.startsWith(ref) : row.quadrimestre === `${ano}Q${q}`)
      .sort((a, b) => a.quadrimestre.localeCompare(b.quadrimestre) || a.indicador.localeCompare(b.indicador, 'pt-BR'));
    const grupos = new Map();
    registros.forEach(row => {
      const chave = `${row.equipe}\u0000${row.componente}`;
      if (!grupos.has(chave)) grupos.set(chave, { equipe: row.equipe, componente: row.componente, registros: [] });
      grupos.get(chave).registros.push(row);
    });
    const nomeEquipe = equipe => ({ eMulti: 'e-Multi', eSF: 'eSF', eSB: 'eSB', eAP: 'eAP' })[equipe] || equipe;
    const resultado = valor => valor == null || valor === 0 ? '-' : formatarNumero(valor);
    const ordemGrupo = grupo => normalizarIndicador(grupo.componente) === 'cvat' ? 0 : grupo.equipe === 'eMulti' ? 1 : 2;
    const quadros = [...grupos.values()]
      .sort((a, b) => ordemGrupo(a) - ordemGrupo(b) || nomeEquipe(a.equipe).localeCompare(nomeEquipe(b.equipe), 'pt-BR') || a.componente.localeCompare(b.componente, 'pt-BR'))
      .map(grupo => {
        grupo.registros.sort((a, b) => a.quadrimestre.localeCompare(b.quadrimestre) || identificarIndicadorCofinanciamento(a).ordem - identificarIndicadorCofinanciamento(b).ordem);
        return `
        <article class="indicator-panel cofinance-panel">
          <h3>${escapar(nomeEquipe(grupo.equipe))} - Componente ${escapar(grupo.componente)}</h3>
          <div class="source-table-wrap">
            <table class="source-table cofinance-table">
              <thead><tr>
                <th scope="col">Período</th>
                <th scope="col">Indicador</th>
                <th scope="col" class="result-column result-regular">Regular</th>
                <th scope="col" class="result-column result-suficiente">Suficiente</th>
                <th scope="col" class="result-column result-bom">Bom</th>
                <th scope="col" class="result-column result-otimo">Ótimo</th>
              </tr></thead>
              <tbody>${grupo.registros.map(row => {
                const indicador = identificarIndicadorCofinanciamento(row);
                return `<tr>
                  <td>${escapar(row.quadrimestre.replace(/(\d{4})Q([1-3])/, '$2º Quadrimestre/$1'))}</td>
                  <td><strong class="indicator-code">${escapar(indicador.codigo)}</strong>${indicador.codigo ? ' ' : ''}${escapar(indicador.nome)}</td>
                  ${['regular','suficiente','bom','otimo'].map(chave => `<td class="result-column result-${chave}${row[chave] == null || row[chave] === 0 ? ' result-empty' : ''}">${resultado(row[chave])}</td>`).join('')}
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
          <p class="indicator-note">Fonte: SIAPS - Ministério da Saúde</p>
        </article>`;
      }).join('');
    productionIndicators.innerHTML = renderizarResumoAps(registrosOriginais) + (quadros || '<article class="indicator-panel"><h3>Cofinanciamento</h3><p>Não há equipes com dados para o período selecionado.</p></article>');
    productionDashboard.hidden = false;
    printButton.disabled = registros.length === 0;
    return;
  } else {
    const meses = selectPeriodo.options[selectPeriodo.selectedIndex].dataset.meses.split(',');
    const moeda = valor => valor == null ? 'Não disponível' : valor.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
    rows = dadosFonte.dados.filter(row => meses.includes(row.competencia)).map(row => [row.competencia, row.parcela, moeda(row.desconto), moeda(row.repasse), moeda(row.implantacao)]);
    headers = ['Competência CNES','Parcela','Desconto','Valor efetivo de repasse','Total da implantação'];
  }
  productionIndicators.innerHTML = `<article class="indicator-panel"><h3>${escapar(currentTopic)}</h3><div class="source-table-wrap"><table class="source-table"><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(v => `<td>${escapar(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="indicator-note">Fonte: SIAPS - Ministério da Saúde</p></article>`;
  productionDashboard.hidden = false;
  printButton.disabled = !rows.length;
}

async function atualizarMunicipioSelecionado() {
  const versao = ++sequenciaConsulta;
  consultaEmCurso?.abort();
  dadosFonte = null;
  competenciasDisponiveis = [];
  coberturaAtual = null;
  const municipioSelecionado = Boolean(selectMunicipio.value);
  periodTypeInputs.forEach((input) => {
    input.disabled = true;
    input.checked = false;
  });
  selectPeriodo.innerHTML = municipioSelecionado
    ? '<option value="">Selecione primeiro o período</option>'
    : '<option value="">Selecione primeiro o município</option>';
  selectPeriodo.disabled = true;
  document.querySelectorAll('#ses-query-start, #ses-query-end').forEach(campo => { campo.disabled = true; });
  emptyState.hidden = true;
  emptyState.textContent = 'Área preparada para inclusão dos indicadores.';
  emptyState.dataset.competencias = '';
  productionDashboard.hidden = true;
  printButton.disabled = true;
  productionIndicators.innerHTML = '';
  mostrarStatus('');
  if (!municipioSelecionado) return;
  if (currentTopic === 'Pagamentos SES') {
    document.querySelectorAll('#ses-query-start, #ses-query-end').forEach(campo => { campo.disabled = false; });
    consultarPagamentosSES();
    return;
  }
  if (temasComReferenciaLivre.has(currentTopic)) {
    periodTypeInputs.forEach(input => {
      input.disabled = false;
      input.closest('label').hidden = false;
    });
    return;
  }
  mostrarStatus('Consultando dados do Painel CONASEMS…');
  const tema = ({'Produção':'producao','Cobertura da APS':'cobertura','Financiamento':'financiamento','Cofinanciamento':'cofinanciamento'})[currentTopic];
  consultaEmCurso = new AbortController();
  try {
    const endpoint = `/api/conasems?tema=${tema}&ibge=${encodeURIComponent(selectMunicipio.value)}`;
    const response = await fetch(endpoint, {signal: consultaEmCurso.signal});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Falha ao consultar o CONASEMS.');
    if (versao !== sequenciaConsulta) return;
    if (result.ibge !== selectMunicipio.value || result.tema !== tema) throw new Error('A fonte retornou dados incompatíveis com o município selecionado.');
    dadosFonte = result;
    mostrarStatus(result.aviso || '');
    if (tema === 'cobertura') { renderizarCobertura(); return; }
    const rows = tema === 'producao'
      ? result.dados.producao
      : result.dados;
    if (!rows.length) { mostrarStatus('O CONASEMS não disponibilizou registros para este município e tema.'); return; }
    competenciasDisponiveis = ordenarCompetencias(rows.map(row => row.competencia).filter(Boolean));
    periodTypeInputs.forEach(input => {
      input.disabled = tema === 'cofinanciamento' && input.value === 'mensal';
      input.closest('label').hidden = tema === 'cofinanciamento' && input.value === 'mensal';
    });
  } catch (error) {
    if (versao !== sequenciaConsulta || error.name === 'AbortError') return;
    dadosFonte = null;
    mostrarStatus(error instanceof SyntaxError ? 'Não foi possível carregar a resposta do servidor. Tente novamente.' : error.message);
  }
}

async function consultarFinanciamentoFNS() {
  const referencia = selectPeriodo.value;
  const ano = referencia.match(/(\d{4})$/)?.[1];
  if (!selectMunicipio.value || !ano) return;
  const versao = ++sequenciaConsulta;
  consultaEmCurso?.abort();
  dadosFonte = null;
  productionDashboard.hidden = true;
  printButton.disabled = true;
  mostrarStatus('Consultando dados do Fundo Nacional de Saúde…');
  consultaEmCurso = new AbortController();
  try {
    const response = await fetch(`/api/fns?ibge=${encodeURIComponent(selectMunicipio.value)}&ano=${ano}`, { signal: consultaEmCurso.signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível consultar o FNS.');
    if (versao !== sequenciaConsulta) return;
    if (result.ibge !== selectMunicipio.value || result.tema !== 'financiamento') throw new Error('A fonte retornou dados incompatíveis com o município selecionado.');
    dadosFonte = result;
    mostrarStatus('');
    renderizarFinanceiro();
  } catch (error) {
    if (versao !== sequenciaConsulta || error.name === 'AbortError') return;
    dadosFonte = null;
    mostrarStatus(error instanceof SyntaxError ? 'Não foi possível carregar a resposta do FNS. Tente novamente.' : error.message);
  }
}

async function consultarPagamentosSES() {
  const { inicial, final } = intervaloConsultaSES();
  if (!selectMunicipio.value || !inicial || !final) return;
  if (inicial > final) {
    mostrarStatus('A data inicial não pode ser posterior à data final.');
    return;
  }
  const anoInicial = Number(inicial.slice(0, 4));
  const anoFinal = Number(final.slice(0, 4));
  const anos = Array.from({ length: anoFinal - anoInicial + 1 }, (_, indice) => anoInicial + indice);
  const versao = ++sequenciaConsulta;
  consultaEmCurso?.abort();
  dadosFonte = null;
  productionDashboard.hidden = true;
  printButton.disabled = true;
  mostrarStatus('Consultando pagamentos da SES/MG…');
  consultaEmCurso = new AbortController();
  try {
    const resultados = await Promise.all(anos.map(async ano => {
      const response = await fetch(`/api/ses?ibge=${encodeURIComponent(selectMunicipio.value)}&ano=${ano}`, { signal: consultaEmCurso.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível consultar a SES/MG.');
      return result;
    }));
    if (versao !== sequenciaConsulta) return;
    if (resultados.some(result => result.ibge !== selectMunicipio.value || result.tema !== 'pagamentos-ses')) throw new Error('A fonte retornou dados incompatíveis com o município selecionado.');
    dadosFonte = {
      ...resultados[0],
      anos,
      dados: { pagamentos: resultados.flatMap(result => result.dados?.pagamentos || []) }
    };
    mostrarStatus('');
    renderizarPagamentosSES();
  } catch (error) {
    if (versao !== sequenciaConsulta || error.name === 'AbortError') return;
    dadosFonte = null;
    mostrarStatus(error instanceof SyntaxError ? 'Não foi possível carregar a resposta da SES/MG. Tente novamente.' : error.message);
  }
}

function preencherPeriodos(tipo) {
  if (!selectMunicipio.value || (!temasComReferenciaLivre.has(currentTopic) && !dadosFonte)) return;
  const opcoes = obterOpcoes(tipo);
  selectPeriodo.innerHTML = '<option value="">Selecione a referência</option>';
  opcoes.forEach((opcao) => {
    const element = document.createElement('option');
    element.value = opcao.value;
    element.textContent = opcao.label;
    element.dataset.meses = opcao.meses.join(',');
    selectPeriodo.appendChild(element);
  });
  selectPeriodo.disabled = false;
  emptyState.hidden = true;
  productionDashboard.hidden = true;
  printButton.disabled = true;
}

selectMunicipio.addEventListener('change', atualizarMunicipioSelecionado);
selectPeriodo.addEventListener('change', () => {
  if (currentTopic === 'Financiamento') {
    const referenciaSelecionada = Boolean(selectPeriodo.value);
    emptyState.hidden = true;
    productionDashboard.hidden = true;
    printButton.disabled = true;
    if (referenciaSelecionada) consultarFinanciamentoFNS();
    return;
  }
  if (!dadosFonte) return;
  const periodoSelecionado = selectPeriodo.options[selectPeriodo.selectedIndex];
  const meses = (periodoSelecionado.dataset.meses || '').split(',').filter(Boolean);
  emptyState.dataset.competencias = meses.join(',');
  const referenciaSelecionada = Boolean(selectPeriodo.value);
  emptyState.hidden = !referenciaSelecionada || currentTopic === 'Produção';
  productionDashboard.hidden = !referenciaSelecionada || currentTopic !== 'Produção';
  printButton.disabled = !referenciaSelecionada || currentTopic !== 'Produção';
  if (referenciaSelecionada && currentTopic === 'Produção') renderizarProducao(meses);
  if (referenciaSelecionada && ['Financiamento','Cofinanciamento'].includes(currentTopic)) { emptyState.hidden = true; renderizarFinanceiro(); }
});
periodTypeInputs.forEach((input) => input.addEventListener('change', () => preencherPeriodos(input.value)));
document.querySelectorAll('#ses-query-start, #ses-query-end').forEach(campo => campo.addEventListener('change', () => {
  if (currentTopic === 'Pagamentos SES' && selectMunicipio.value) consultarPagamentosSES();
}));

topicButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.externalUrl) {
      window.location.href = button.dataset.externalUrl;
      return;
    }
    topicButtons.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    currentTopic = button.dataset.topic;
    atualizarOpcoesMunicipio();
    periodTypeInputs.forEach(input => { input.closest('label').hidden = false; });
    const cobertura = currentTopic === 'Cobertura da APS';
    const pagamentosSES = currentTopic === 'Pagamentos SES';
    detail.classList.toggle('coverage-mode', cobertura);
    document.querySelector('.period-types').hidden = cobertura || pagamentosSES;
    document.querySelector('#ses-date-range').hidden = !pagamentosSES;
    document.querySelector('.period-value > label').hidden = cobertura || pagamentosSES;
    selectPeriodo.closest('.select-wrap').hidden = cobertura || pagamentosSES;
    periodFilter.classList.toggle('ses-date-mode', pagamentosSES);
    periodFilter.setAttribute('aria-label', cobertura ? 'Ações do relatório' : pagamentosSES ? 'Intervalo de consulta dos pagamentos SES' : 'Seleção do período');
    if (pagamentosSES) definirDatasPadraoSES();
    productionDashboard.setAttribute('aria-label', cobertura ? 'Indicadores de cobertura' : 'Indicadores de produção');
    document.querySelector('#detail-title').textContent = currentTopic === 'Produção'
      ? 'Produção da Atenção Primária'
      : currentTopic === 'Financiamento'
        ? 'Repasses do Fundo Nacional de Saúde (FNS)'
        : currentTopic === 'Pagamentos SES'
          ? 'Pagamentos SES'
          : button.dataset.topic;
    selectMunicipio.value = '';
    atualizarMunicipioSelecionado();
    topics.hidden = true;
    detail.hidden = false;
    window.scrollTo({ top: document.querySelector('.hero').offsetHeight, behavior: 'smooth' });
  });
});

printButton.addEventListener('click', () => {
  if (printButton.disabled || productionDashboard.hidden) return;
  atualizarCabecalhoRelatorio();
  const tituloAnterior = document.title;
  const municipio = selectMunicipio.options[selectMunicipio.selectedIndex].text;
  const periodo = currentTopic === 'Cobertura da APS' ? referenciaCobertura() : selectPeriodo.options[selectPeriodo.selectedIndex].text;
  document.title = `Relatório APS - ${municipio} - ${periodo}`;
  window.addEventListener('afterprint', () => {
    document.title = tituloAnterior;
  }, { once: true });
  window.print();
});

window.addEventListener('beforeprint', () => {
  if (!productionDashboard.hidden) atualizarCabecalhoRelatorio();
});

document.querySelector('#voltar').addEventListener('click', () => {
  ++sequenciaConsulta;
  consultaEmCurso?.abort();
  dadosFonte = null;
  detail.hidden = true;
  topics.hidden = false;
  topicButtons.forEach((button) => button.classList.remove('active'));
  currentTopic = '';
  atualizarOpcoesMunicipio();
  periodFilter.classList.remove('ses-date-mode');
  window.scrollTo({ top: document.querySelector('.hero').offsetHeight, behavior: 'smooth' });
});
