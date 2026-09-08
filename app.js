const selectMunicipio = document.querySelector('#municipio');
const periodTypeInputs = [...document.querySelectorAll('input[name="periodo-tipo"]')];
const selectPeriodo = document.querySelector('#periodo-valor');
const topicButtons = [...document.querySelectorAll('[data-topic]')];
const selector = document.querySelector('.selector');
const periodFilter = document.querySelector('.period-filter');
const topics = document.querySelector('.topics');
const detail = document.querySelector('#detalhe');
const emptyState = document.querySelector('.empty-state');

const competenciasDisponiveis = [
  ...Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}/2024`),
  ...Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}/2025`),
  ...Array.from({ length: 8 }, (_, i) => `${String(i + 1).padStart(2, '0')}/2026`)
];

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
}

selectMunicipio.addEventListener('change', atualizarModulos);
selectPeriodo.addEventListener('change', () => {
  const periodoSelecionado = selectPeriodo.options[selectPeriodo.selectedIndex];
  emptyState.dataset.competencias = periodoSelecionado.dataset.meses || '';
  emptyState.hidden = !selectPeriodo.value;
});
periodTypeInputs.forEach((input) => input.addEventListener('change', () => preencherPeriodos(input.value)));

topicButtons.forEach((button) => {
  button.addEventListener('click', () => {
    topicButtons.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    document.querySelector('#detail-city').textContent = selectMunicipio.options[selectMunicipio.selectedIndex].text;
    document.querySelector('#detail-title').textContent = button.dataset.topic;
    periodTypeInputs.forEach((input) => { input.checked = false; });
    selectPeriodo.innerHTML = '<option value="">Selecione primeiro o período</option>';
    selectPeriodo.disabled = true;
    emptyState.hidden = true;
    emptyState.dataset.competencias = '';
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
  window.scrollTo({ top: document.querySelector('.hero').offsetHeight, behavior: 'smooth' });
});
