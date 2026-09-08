const select = document.querySelector('#municipio');
const topicButtons = [...document.querySelectorAll('[data-topic]')];
const selector = document.querySelector('.selector');
const topics = document.querySelector('.topics');
const detail = document.querySelector('#detalhe');

select.addEventListener('change', () => {
  topicButtons.forEach((button) => {
    button.disabled = !select.value;
    button.classList.remove('active');
  });
});

topicButtons.forEach((button) => {
  button.addEventListener('click', () => {
    button.classList.add('active');
    document.querySelector('#detail-city').textContent = select.options[select.selectedIndex].text;
    document.querySelector('#detail-title').textContent = button.dataset.topic;
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
