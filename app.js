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

const competenciasDisponiveis = [
  ...Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}/2024`),
  ...Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}/2025`),
  ...Array.from({ length: 8 }, (_, i) => `${String(i + 1).padStart(2, '0')}/2026`)
];

const indicadoresProducao = [
  {
    nome: 'Consultas Médicas',
    baseAtendimentos: 428,
    basePessoas: 351,
    descricao: 'Apresenta o somatório de todas as consultas médicas realizadas na Atenção Primária à Saúde (APS)'
  },
  {
    nome: 'Consultas de Enfermagem',
    baseAtendimentos: 512,
    basePessoas: 406,
    descricao: 'Apresenta o somatório de todas as consultas de enfermagem realizadas na Atenção Primária à Saúde (APS)'
  },
  {
    nome: 'Atendimentos Odontológicos',
    baseAtendimentos: 236,
    basePessoas: 198,
    descricao: 'Apresenta o somatório de todas as consultas odontológicas realizadas na Atenção Primária à Saúde (APS)'
  },
  {
    nome: 'Procedimentos',
    baseAtendimentos: 684,
    basePessoas: 472,
    descricao: 'Apresenta a produção consolidada de procedimentos realizados na Atenção Primária à Saúde (APS)'
  },
  {
    nome: 'Visita Domiciliar (ACS)',
    baseAtendimentos: 1248,
    basePessoas: 903,
    descricao: 'Apresenta as visitas domiciliares de acompanhamento geral realizadas por Agentes Comunitários de Saúde (ACS)'
  }
];

const fonteSiaps = 'Sistema de Informação da Atenção Primária em Saúde (SIAPS), e-Gestor AB, Secretaria de Atenção Primária à Saúde (SAPS), Ministério da Saúde (MS).';

const municipioUf = {
  '311210': 'MG',
  '312370': 'MG',
  '312580': 'MG',
  '520890': 'GO',
  '315800': 'MG',
  '316020': 'MG',
  '316294': 'MG'
};

const formatarNumero = (valor) => new Intl.NumberFormat('pt-BR').format(valor);

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
  const periodo = formatarPeriodoRelatorio();
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

function gerarDadosDemonstrativos(indicador, meses) {
  return meses.map((competencia, indice) => {
    const [mes, ano] = competencia.split('/').map(Number);
    const variacao = ((mes * 17 + ano + indice * 9) % 19) - 9;
    const atendimentos = Math.max(0, Math.round(indicador.baseAtendimentos * (1 + variacao / 100)));
    const pessoas = Math.max(0, Math.round(indicador.basePessoas * (1 + variacao / 120)));
    return { competencia, atendimentos, pessoas };
  });
}

function renderizarDetalhamentoVisitas(mesesResumo, mesesGrafico = mesesResumo) {
  const numeroAcsDemonstrativo = 8;
  const diasUteisPorMes = 20;
  const gerarDadosVisitas = (competencias) => competencias.map((competencia) => {
    const [mes, ano] = competencia.split('/').map(Number);
    const variacao = ((mes * 13 + ano) % 17) - 8;
    return {
      competencia,
      realizadas: Math.round(1050 * (1 + variacao / 100)),
      recusadas: Math.round(28 * (1 + variacao / 55)),
      ausentes: Math.round(96 * (1 + variacao / 75))
    };
  });
  const dadosResumo = gerarDadosVisitas(mesesResumo);
  const dados = gerarDadosVisitas(mesesGrafico);
  const realizadas = dadosResumo.reduce((total, item) => total + item.realizadas, 0);
  const recusadas = dadosResumo.reduce((total, item) => total + item.recusadas, 0);
  const ausentes = dadosResumo.reduce((total, item) => total + item.ausentes, 0);
  const visitasTotais = realizadas + recusadas + ausentes;
  const mediaMes = realizadas / Math.max(1, numeroAcsDemonstrativo * mesesResumo.length);
  const mediaDia = realizadas / Math.max(1, numeroAcsDemonstrativo * mesesResumo.length * diasUteisPorMes);
  const formatarMedia = (valor) => valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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
    const dados = gerarDadosDemonstrativos(indicador, meses);
    const totalAtendimentos = dados.reduce((total, item) => total + item.atendimentos, 0);
    const totalPessoas = dados.reduce((total, item) => total + item.pessoas, 0);
    const maiorValor = Math.max(...dados.flatMap((item) => [item.atendimentos, item.pessoas]), 1);
    const colunas = dados.map((item) => `
      <div class="month-group">
        <div class="grouped-bars">
          <div class="series-column">
            <span class="column-value">${formatarNumero(item.atendimentos)}</span>
            <div class="column-bar attendances" style="height:${Math.max(5, (item.atendimentos / maiorValor) * 110)}px" title="${item.competencia}: ${formatarNumero(item.atendimentos)} atendimentos"></div>
          </div>
          <div class="series-column">
            <span class="column-value">${formatarNumero(item.pessoas)}</span>
            <div class="column-bar people" style="height:${Math.max(5, (item.pessoas / maiorValor) * 110)}px" title="${item.competencia}: ${formatarNumero(item.pessoas)} pessoas atendidas"></div>
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
      const larguraAtendimentos = Math.max(5, (item.atendimentos / maiorValor) * 100);
      const larguraPessoas = Math.max(5, (item.pessoas / maiorValor) * 100);
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
          ${indicador.descricao} durante o período de referência analisado, que compreende: ${periodoRelatorio}.
          <span><strong>Fonte:</strong> ${fonteSiaps}</span>
        </p>
      </article>
    `;
  }).join('');
  let mesesGraficoVisitas = meses;
  if (tipoPeriodo === 'mensal' && meses.length === 1) {
    const [mesConsultado, anoConsultado] = meses[0].split('/').map(Number);
    mesesGraficoVisitas = competenciasDisponiveis.filter((competencia) => {
      const [mes, ano] = competencia.split('/').map(Number);
      return ano === anoConsultado && mes <= mesConsultado;
    });
  }
  productionIndicators.innerHTML = quadrosPrincipais + renderizarDetalhamentoVisitas(meses, mesesGraficoVisitas);
}

function obterOpcoes(tipo) {
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
  })).filter((item) => item.meses.length === 4);
}

function atualizarMunicipioSelecionado() {
  const municipioSelecionado = Boolean(selectMunicipio.value);
  periodTypeInputs.forEach((input) => {
    input.disabled = !municipioSelecionado;
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
}

function preencherPeriodos(tipo) {
  if (!selectMunicipio.value) return;
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
  const periodoSelecionado = selectPeriodo.options[selectPeriodo.selectedIndex];
  const meses = (periodoSelecionado.dataset.meses || '').split(',').filter(Boolean);
  emptyState.dataset.competencias = meses.join(',');
  const referenciaSelecionada = Boolean(selectPeriodo.value);
  emptyState.hidden = !referenciaSelecionada || currentTopic === 'Produção';
  productionDashboard.hidden = !referenciaSelecionada || currentTopic !== 'Produção';
  printButton.disabled = !referenciaSelecionada || currentTopic !== 'Produção';
  if (referenciaSelecionada && currentTopic === 'Produção') renderizarProducao(meses);
});
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
  const periodo = selectPeriodo.options[selectPeriodo.selectedIndex].text;
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
  detail.hidden = true;
  topics.hidden = false;
  topicButtons.forEach((button) => button.classList.remove('active'));
  currentTopic = '';
  window.scrollTo({ top: document.querySelector('.hero').offsetHeight, behavior: 'smooth' });
});
