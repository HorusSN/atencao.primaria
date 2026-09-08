const select = document.querySelector('#municipio');
const topicButtons = [...document.querySelectorAll('[data-topic]')];
const hint = document.querySelector('#hint');
const intro = document.querySelector('#inicio');
const workspace = document.querySelector('.workspace');
const detail = document.querySelector('#detalhe');

function updateTopics() {
  const selected = Boolean(select.value);
  topicButtons.forEach((button) => { button.disabled = !selected; });
  hint.textContent = selected
    ? 'Agora selecione uma área de análise.'
    : 'Selecione primeiro um município para continuar.';
}

select.addEventListener('change', updateTopics);
topicButtons.forEach((button) => {
  button.addEventListener('click', () => {
    topicButtons.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    document.querySelector('#detail-city').textContent = select.options[select.selectedIndex].text;
    document.querySelector('#detail-title').textContent = button.dataset.topic;
    intro.hidden = true;
    workspace.hidden = true;
    detail.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

document.querySelector('#voltar').addEventListener('click', () => {
  detail.hidden = true;
  intro.hidden = false;
  workspace.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

updateTopics();
