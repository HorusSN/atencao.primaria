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

const fonteSiaps = 'Painéis CONASEMS, dados da Atenção Primária à Saúde. O total de pessoas é a soma dos quantitativos mensais, podendo incluir a mesma pessoa em meses diferentes.';

const municipioUf = {
  '311210': 'MG',
  '312370': 'MG',
  '312580': 'MG',
  '520890': 'GO',
  '315800': 'MG',
  '316020': 'MG',
  '316294': 'MG'
};

const formatarNumero = (valor) => valor == null || !Number.isFinite(valor) ? 'Não disponível' : new Intl.NumberFormat('pt-BR').format(valor);

function formatarPeriodoRelatorio() {
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
  document.querySelector('.print-identification h1').textContent = `Relatório de ${currentTopic === 'Cobertura da APS' ? 'Cobertura' : currentTopic} da Atenção Primária`;
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

function obterOpcoes(tipo) {
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

function renderizarFinanceiro() {
  const tipo = document.querySelector('input[name="periodo-tipo"]:checked').value;
  const ref = selectPeriodo.value;
  let rows;
  let headers;
  if (currentTopic === 'Cofinanciamento') {
    const [q, ano] = ref.split('-');
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
    const quadros = [...grupos.values()]
      .sort((a, b) => nomeEquipe(a.equipe).localeCompare(nomeEquipe(b.equipe), 'pt-BR') || a.componente.localeCompare(b.componente, 'pt-BR'))
      .map(grupo => `
        <article class="indicator-panel cofinance-panel">
          <h3>${escapar(nomeEquipe(grupo.equipe))} - Componente ${escapar(grupo.componente)}</h3>
          <div class="source-table-wrap">
            <table class="source-table cofinance-table">
              <thead><tr>
                <th scope="col">Período</th>
                <th scope="col">Indicador</th>
                <th scope="col" class="result-column">Regular</th>
                <th scope="col" class="result-column">Suficiente</th>
                <th scope="col" class="result-column">Bom</th>
                <th scope="col" class="result-column">Ótimo</th>
              </tr></thead>
              <tbody>${grupo.registros.map(row => `<tr>
                <td>${escapar(row.quadrimestre.replace(/(\d{4})Q([1-3])/, '$2º Quadrimestre/$1'))}</td>
                <td>${escapar(row.indicador)}</td>
                ${['regular','suficiente','bom','otimo'].map(chave => `<td class="result-column">${resultado(row[chave])}</td>`).join('')}
              </tr>`).join('')}</tbody>
            </table>
          </div>
          <p class="indicator-note">Fonte: Painéis CONASEMS. Classificação das equipes no período selecionado.</p>
        </article>`).join('');
    productionIndicators.innerHTML = quadros || '<article class="indicator-panel"><h3>Cofinanciamento</h3><p>Não há equipes com dados para o período selecionado.</p></article>';
    productionDashboard.hidden = false;
    printButton.disabled = registros.length === 0;
    return;
  } else {
    const meses = selectPeriodo.options[selectPeriodo.selectedIndex].dataset.meses.split(',');
    const moeda = valor => valor == null ? 'Não disponível' : valor.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
    rows = dadosFonte.dados.filter(row => meses.includes(row.competencia)).map(row => [row.competencia, row.parcela, moeda(row.desconto), moeda(row.repasse), moeda(row.implantacao)]);
    headers = ['Competência CNES','Parcela','Desconto','Valor efetivo de repasse','Total da implantação'];
  }
  productionIndicators.innerHTML = `<article class="indicator-panel"><h3>${escapar(currentTopic)}</h3><div class="source-table-wrap"><table class="source-table"><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(v => `<td>${escapar(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="indicator-note">Fonte: Painéis CONASEMS. ${currentTopic === 'Cofinanciamento' ? 'Classificação das equipes por indicador e quadrimestre. Os registros quadrimestrais não são convertidos em valores mensais.' : 'Valores apresentados por competência CNES e parcela, conforme o detalhamento da fonte.'}</p></article>`;
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
  emptyState.hidden = true;
  emptyState.dataset.competencias = '';
  productionDashboard.hidden = true;
  printButton.disabled = true;
  productionIndicators.innerHTML = '';
  document.querySelector('#retry-source').hidden = true;
  mostrarStatus('');
  if (!municipioSelecionado) return;
  mostrarStatus('Consultando dados do Painel CONASEMS…');
  const tema = ({'Produção':'producao','Cobertura da APS':'cobertura','Financiamento':'financiamento','Cofinanciamento':'cofinanciamento'})[currentTopic];
  consultaEmCurso = new AbortController();
  try {
    const response = await fetch(`/api/conasems?tema=${tema}&ibge=${encodeURIComponent(selectMunicipio.value)}`, {signal: consultaEmCurso.signal});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Falha ao consultar o CONASEMS.');
    if (versao !== sequenciaConsulta) return;
    if (result.ibge !== selectMunicipio.value || result.tema !== tema) throw new Error('A fonte retornou dados incompatíveis com o município selecionado.');
    dadosFonte = result;
    mostrarStatus(`Fonte: Painéis CONASEMS. Consulta: ${new Date(result.consultadoEm).toLocaleString('pt-BR')}. ${result.aviso || ''}`);
    if (result.aviso) document.querySelector('#retry-source').hidden = false;
    if (tema === 'cobertura') { renderizarCobertura(); return; }
    const rows = tema === 'producao' ? result.dados.producao : result.dados;
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
    document.querySelector('#retry-source').hidden = false;
  }
}

function preencherPeriodos(tipo) {
  if (!selectMunicipio.value || !dadosFonte) return;
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
document.querySelector('#retry-source').addEventListener('click', atualizarMunicipioSelecionado);
periodTypeInputs.forEach((input) => input.addEventListener('change', () => preencherPeriodos(input.value)));

topicButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.externalUrl) {
      window.location.href = button.dataset.externalUrl;
      return;
    }
    topicButtons.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    currentTopic = button.dataset.topic;
    periodTypeInputs.forEach(input => { input.closest('label').hidden = false; });
    const cobertura = currentTopic === 'Cobertura da APS';
    detail.classList.toggle('coverage-mode', cobertura);
    document.querySelector('.period-types').hidden = cobertura;
    document.querySelector('.period-value > label').hidden = cobertura;
    selectPeriodo.closest('.select-wrap').hidden = cobertura;
    periodFilter.setAttribute('aria-label', cobertura ? 'Ações do relatório' : 'Seleção do período');
    productionDashboard.setAttribute('aria-label', cobertura ? 'Indicadores de cobertura' : 'Indicadores de produção');
    document.querySelector('#detail-title').textContent = currentTopic === 'Produção'
      ? 'Produção da Atenção Primária'
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
  window.scrollTo({ top: document.querySelector('.hero').offsetHeight, behavior: 'smooth' });
});
