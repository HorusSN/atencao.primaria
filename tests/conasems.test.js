const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('../lib/conasems');
const handler = require('../api/conasems');

test('números brasileiros preservam milhares, zero e ausência', () => {
  assert.equal(f.numero('1.578'), 1578);
  assert.equal(f.numero('98.365,73'), 98365.73);
  assert.equal(f.numero(248.75), 248.75);
  assert.equal(f.numero('0'), 0);
  for (const v of [null, '', 'abc', undefined, '1,2,3']) assert.equal(f.numero(v), null);
});

test('datas reconhecidas e tipo médico normalizado', () => {
  assert.equal(f.competencia('2026-08-01'), '08/2026');
  assert.equal(f.competencia('JUN/2026'), '06/2026');
  assert.equal(f.competencia('2026-13-01'), null);
  const row = {Tipo:'Medico', MediaProducao:'1.344', MediaPessoas:'902', Data:'2026-08-01'};
  assert.deepEqual(f.producao([row])[0], {tipo:'Medico', competencia:'08/2026', atendimentos:1344, pessoas:902});
  assert.throws(() => f.producao([row,row]), /duplicada/);
});

test('visitas não misturam municípios; ausências não viram zero', () => {
  const row = {Ibge:312580, Data:'2026-07-01',VisitaRealizada:'2.095', VisitaRecusada:'1',Ausente:null,QtdAcs:'7'};
  assert.equal(f.visitas([row],'312580')[0].ausentes, null);
  assert.throws(() => f.visitas([row],'311210'), /Município/);
});

test('financiamento interpreta apenas a linha agregada e mantém valores', () => {
  const html = '<tr class="parent-row" data-competencia="JUN/2026" data-parcela="8/12" data-ibge="312580"><td></td><td>JUN/2026</td><td>8/12</td><td>R$ 0,00</td><td>R$ 98.365,73<br>+2,1%</td><td>R$ 0,00</td></tr><tr class="program-parent-row"><td>R$ 52.000,00</td></tr>';
  assert.deepEqual(f.pagamentosHtml(html,'312580'),[{competencia:'06/2026',parcela:'8/12',desconto:0,repasse:98365.73,implantacao:0}]);
});

test('API rejeita município e tema fora da lista', async () => {
  const res = {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;}};
  await handler({method:'GET',query:{ibge:'https://example.com',tema:'producao'}},res);
  assert.equal(res.code,400);
  assert.equal(res.headers['Cache-Control'],'no-store');
});
