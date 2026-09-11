const test = require('node:test');
const assert = require('node:assert/strict');
const resolucoes = require('../lib/resolucoes-ses');

test('busca numérica consulta as variantes com e sem separador de milhar', () => {
  assert.deepEqual(resolucoes.gerarVariantesNumero('11005'), ['11005', '11.005']);
  assert.deepEqual(resolucoes.gerarVariantesNumero('11.005'), ['11.005', '11005']);
  assert.deepEqual(resolucoes.gerarVariantesNumero('9876'), ['9876', '9.876']);
  assert.deepEqual(resolucoes.gerarVariantesNumero('9.876'), ['9.876', '9876']);
  assert.deepEqual(resolucoes.gerarVariantesNumero('assistência farmacêutica'), ['assistência farmacêutica']);
});

test('parser preserva descrição completa, converte anexo relativo e elimina duplicidades', () => {
  const html = `<article><a href="/resolucoes/11005">RESOLUÇÃO SES/MG Nº 11.005</a><p class="description">Define a política estadual de assistência farmacêutica em todos os seus termos.</p><a href="/files/11005.pdf">Arquivo</a></article>`;
  const documentos = resolucoes._private.extrairDocumentos(html, 'https://portal-antigo.saude.mg.gov.br/resolucoes/documents?q=11005');
  assert.equal(documentos.length, 1);
  assert.equal(documentos[0].attachment, 'https://portal-antigo.saude.mg.gov.br/files/11005.pdf');
  assert.equal(documentos[0].description, 'Define a política estadual de assistência farmacêutica em todos os seus termos.');
  assert.equal(resolucoes._private.deduplicar([...documentos, ...documentos]).length, 1);
});

test('filtros preservam ano, mês, categoria e termo na consulta oficial', () => {
  const url = new URL(resolucoes._private.montarUrl({ ano: '2026', mes: '4', categoria: '13', q: '11005' }));
  assert.equal(url.searchParams.get('by_year'), '2026');
  assert.equal(url.searchParams.get('by_month'), '4');
  assert.equal(url.searchParams.get('category_id'), '13');
  assert.equal(url.searchParams.get('q'), '11005');
});
