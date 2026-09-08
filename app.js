const selectMunicipio = document.querySelector('#municipio');
const periodTypeInputs = [...document.querySelectorAll('input[name="periodo-tipo"]')];
const selectPeriodo = document.querySelector('#periodo-valor');
const topicButtons = [...document.querySelectorAll('[data-topic]')];
const selector = document.querySelector('.selector');
const periodFilter = document.querySelector('.period-filter');
const topics = document.querySelector('.topics');
const detail = document.querySelector('#detalhe');
const emptyState = document.querySelector('.empty-state');
const productionDashboard = document.querySelector('#production-dashboard');
const productionIndicators = document.querySelector('#production-indicators');
let currentTopic = '';

const competenciasDisponiveis = [
  ...Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}/2024`),
  ...Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}/2025`),
  ...Array.from({ length: 8 }, (_, i) => `${String(i + 1).padStart(2, '0')}/2026`)
];

const indicadoresProducao = [
  { nome: 'Consultas Médicas', baseAtendimentos: 428, basePessoas: 351 },
  { nome: 'Consultas de Enfermagem', baseAtendimentos: 512, basePessoas: 406 },
  { nome: 'Atendimentos Odontológicos', baseAtendimentos: 236, basePessoas: 198 },
  { nome: 'Procedimentos', baseAtendimentos: 684, basePessoas: 472 },
  { nome: 'Visita Domiciliar (ACS)', baseAtendimentos: 1248, basePessoas: 903 }
];

const formatarNumero = (valor) => new Intl.NumberFormat('pt-BR').format(valor);

function gerarDadosDemonstrativos(indicador, meses) {
  return meses.map((competencia, indice) => {
    const [mes, ano] = competencia.split('/').map(Number);
    const variacao = ((mes * 17 + ano + indice * 9) % 19) - 9;
    const atendimentos = Math.max(0, Math.round(indicador.baseAtendimentos * (1 + variacao / 100)));
    const pessoas = Math.max(0, Math.round(indicador.basePessoas * (1 + variacao / 120)));
    return { competencia, atendimentos, pessoas };
  });
}

function renderizarProducao(meses) {
  productionIndicators.innerHTML = indicadoresProducao.map((indicador) => {
    const dados = gerarDadosDemonstrativos(indicador, meses);
    const totalAtendimentos = dados.reduce((total, item) => total + item.atendimentos, 0);
    const totalPessoas = dados.reduce((total, item) => total + item.pessoas, 0);
    const maiorValor = Math.max(...dados.flatMap((item) => [item.atendimentos, item.pessoas]), 1);
    const colunas = dados.map((item) => `
      <div class="month-group">
        <div class="grouped-bars">
          <div class="series-column">
            <span class="column-value">${formatarNumero(item.atendimentos)}</span>
            <div class="column-bar attendances" style="height:${Math.max(5, (item.atendimentos / maiorValor) * 140)}px" title="${item.competencia}: ${formatarNumero(item.atendimentos)} atendimentos"></div>
          </div>
          <div class="series-column">
            <span class="column-value">${formatarNumero(item.pessoas)}</span>
            <div class="column-bar people" style="height:${Math.max(5, (item.pessoas / maiorValor) * 140)}px" title="${item.competencia}: ${formatarNumero(item.pessoas)} pessoas atendidas"></div>
          </div>
        </div>
        <span class="column-label">${item.competencia}</span>
      </div>
    `).join('');

    return `
      <article class="indicator-panel">
        <h3>${indicador.nome}</h3>
        <div class="indicator-content">
          <div class="total-card">
            <div class="total-metric"><span>Número de Atendimentos</span><strong>${formatarNumero(totalAtendimentos)}</strong></div>
            <div class="total-metric"><span>Número de Pessoas Atendidas</span><strong>${formatarNumero(totalPessoas)}</strong></div>
          </div>
          <div class="chart-card">
            <div class="chart-heading">
              <p class="chart-title">Produção por competência</p>
              <div class="chart-legend" aria-label="Legenda do gráfico">
                <span><i class="legend-blue"></i>Atendimentos</span>
                <span><i class="legend-green"></i>Pessoas atendidas</span>
              </div>
            </div>
            <div class="column-chart" role="img" aria-label="Gráfico mensal de atendimentos e pessoas atendidas de ${indicador.nome}">${colunas}</div>
          </div>
        </div>
      </article>
    `;
  }).join('');
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

function atualizarModulos() {
  const habilitar = Boolean(selectMunicipio.value);
  topicButtons.forEach((button) => {
    button.disabled = !habilitar;
    button.classList.remove('active');
  });
}

function preencherPeriodos(tipo) {
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
}

selectMunicipio.addEventListener('change', atualizarModulos);
selectPeriodo.addEventListener('change', () => {
  const periodoSelecionado = selectPeriodo.options[selectPeriodo.selectedIndex];
  const meses = (periodoSelecionado.dataset.meses || '').split(',').filter(Boolean);
  emptyState.dataset.competencias = meses.join(',');
  const referenciaSelecionada = Boolean(selectPeriodo.value);
  emptyState.hidden = !referenciaSelecionada || currentTopic === 'Produção';
  productionDashboard.hidden = !referenciaSelecionada || currentTopic !== 'Produção';
  if (referenciaSelecionada && currentTopic === 'Produção') renderizarProducao(meses);
});
periodTypeInputs.forEach((input) => input.addEventListener('change', () => preencherPeriodos(input.value)));

topicButtons.forEach((button) => {
  button.addEventListener('click', () => {
    topicButtons.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    currentTopic = button.dataset.topic;
    document.querySelector('#detail-city').textContent = selectMunicipio.options[selectMunicipio.selectedIndex].text;
    document.querySelector('#detail-title').textContent = button.dataset.topic;
    periodTypeInputs.forEach((input) => { input.checked = false; });
    selectPeriodo.innerHTML = '<option value="">Selecione primeiro o período</option>';
    selectPeriodo.disabled = true;
    emptyState.hidden = true;
    emptyState.dataset.competencias = '';
    productionDashboard.hidden = true;
    productionIndicators.innerHTML = '';
    selector.hidden = true;
    topics.hidden = true;
    detail.hidden = false;
    window.scrollTo({ top: document.querySelector('.hero').offsetHeight, behavior: 'smooth' });
  });
});

document.querySelector('#voltar').addEventListener('click', () => {
  detail.hidden = true;
  selector.hidden = false;
  topics.hidden = false;
  topicButtons.forEach((button) => button.classList.remove('active'));
  currentTopic = '';
  window.scrollTo({ top: document.querySelector('.hero').offsetHeight, behavior: 'smooth' });
});
