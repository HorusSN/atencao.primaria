const test = require('node:test');
const assert = require('node:assert/strict');
const cnes = require('../lib/cnes');
const handler = require('../api/cnes');

const publicoSus = {
  codigo_cnes: 6517234,
  nome_razao_social: 'PREFEITURA MUNICIPAL',
  nome_fantasia: 'UNIDADE BASICA CENTRAL',
  descricao_natureza_juridica_estabelecimento: '1244',
  descricao_esfera_administrativa: 'MUNICIPAL',
  estabelecimento_faz_atendimento_ambulatorial_sus: 'SIM',
  endereco_estabelecimento: 'RUA TESTE',
  numero_estabelecimento: '10',
  bairro_estabelecimento: 'CENTRO',
  codigo_cep_estabelecimento: '35135000',
  data_atualizacao: '2026-08-01'
};

test('elegibilidade usa somente os grupos oficiais de natureza jurídica', () => {
  const caso = (natureza, sus) => ({
    ...publicoSus,
    descricao_natureza_juridica_estabelecimento: natureza,
    estabelecimento_faz_atendimento_ambulatorial_sus: sus,
    descricao_esfera_administrativa: 'MUNICIPAL'
  });
  assert.equal(cnes.estabelecimentoElegivel(caso('1244', 'SIM')), true, 'administração pública com SUS');
  assert.equal(cnes.estabelecimentoElegivel(caso('1244', 'NAO')), true, 'administração pública sem SUS');
  assert.equal(cnes.estabelecimentoElegivel(caso('3999', 'SIM')), true, 'entidade filantrópica/sem fins lucrativos com SUS');
  assert.equal(cnes.estabelecimentoElegivel(caso('3069', 'NAO')), true, 'entidade filantrópica/sem fins lucrativos sem SUS');
  assert.equal(cnes.estabelecimentoElegivel(caso('2062', 'SIM')), false, 'privada com fins lucrativos');
  assert.equal(cnes.estabelecimentoElegivel(caso('4000', 'SIM')), false, 'pessoa física');
  assert.equal(cnes.estabelecimentoElegivel(caso('3998', 'SIM')), false, 'código desconhecido dentro de um prefixo elegível');
  assert.equal(cnes.estabelecimentoElegivel(caso('9999', 'SIM')), false, 'código desconhecido');
  assert.equal(cnes.estabelecimentoElegivel(caso('', 'SIM')), false, 'código ausente');
});

test('normalização do estabelecimento preserva somente dados institucionais úteis', () => {
  const item = cnes.normalizarEstabelecimento({ ...publicoSus, numero_cnpj: '123', endereco_email_estabelecimento: 'x@example.com' });
  assert.equal(item.cnes, '6517234');
  assert.equal(item.classificacaoNatureza, 'Administração Pública');
  assert.equal(item.atendeSus, true);
  assert.equal(item.atendimentoSus, 'SIM');
  assert.deepEqual(item.endereco, { logradouro: 'RUA TESTE', numero: '10', bairro: 'CENTRO', cep: '35135000' });
  assert.equal('numero_cnpj' in item, false);
  assert.equal('endereco_email_estabelecimento' in item, false);
});

test('normaliza equipe preservando INE e chave técnica para consulta de membros', () => {
  const equipe = cnes.normalizarEquipe({ coEquipe: '0000243701', seqEquipe: '243701', coArea: '0001', coMunicipio: '312580', tpEquipe: '70', dsEquipe: 'ESF', nomeEquipe: 'ESF CENTRAL', dtAtivacao: '01/06/2006' });
  assert.deepEqual(equipe, { ine: '0000243701', sequencia: '243701', area: '0001', municipio: '312580', tipoCodigo: '70', tipo: 'ESF', nome: 'ESF CENTRAL', inicio: '01/06/2006', fim: null });
});

test('deduplica por CNS antes de descartá-lo e agrupa múltiplos CBOs', () => {
  const registros = [
    { cns: '700000000000001', noProfissional: 'MARIA', cbo: '223505', dsCbo: 'ENFERMEIRO', chAmb: 30, chHosp: 4, chOutros: 6, dtEntrada: '01/01/2020' },
    { cns: '700000000000001', noProfissional: 'MARIA', cbo: '223565', dsCbo: 'ENFERMEIRO ESF', chAmb: 40, chHosp: 0, chOutros: 0, dtEntrada: '01/02/2020', cpf: '12345678900', email: 'x@example.com' }
  ];
  const resultado = cnes.agruparProfissionais(registros);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].ocupacoes.length, 2);
  assert.equal(resultado[0].ocupacoes[0].cargaTotal, 40);
  const publico = JSON.stringify(resultado);
  for (const segredo of ['700000000000001', '12345678900', 'x@example.com']) assert.equal(publico.includes(segredo), false);
});

test('outros profissionais exclui todos os vínculos de quem pertence a alguma equipe', () => {
  const gerais = [
    { cns: '700000000000001', nome: 'MEMBRO', cbo: '223505', dsCbo: 'ENFERMEIRO', tpSusNaoSus: 'S' },
    { cns: '700000000000001', nome: 'MEMBRO', cbo: '225125', dsCbo: 'MEDICO', tpSusNaoSus: 'S' },
    { cns: '700000000000002', nome: 'SEM EQUIPE', cbo: '251510', dsCbo: 'PSICOLOGO', tpSusNaoSus: 'S' },
    { cns: '700000000000003', nome: 'NAO SUS', cbo: '223505', dsCbo: 'ENFERMEIRO', tpSusNaoSus: 'N' }
  ];
  const equipes = [[{ cns: '700000000000001', noProfissional: 'MEMBRO', cbo: '223505' }]];
  const resultado = cnes.comporOutrosProfissionais(gerais, equipes);
  assert.equal(resultado.precise, true);
  assert.deepEqual(resultado.items.map(item => item.nome), ['SEM EQUIPE']);
  assert.equal(JSON.stringify(resultado).includes('700000000000002'), false);
});

test('quando falta identificador técnico, rótulo deve ser tratado como não preciso', () => {
  const resultado = cnes.comporOutrosProfissionais([{ nome: 'SEM IDENTIFICADOR', cbo: '223505', dsCbo: 'ENFERMEIRO', tpSusNaoSus: 'S' }], []);
  assert.equal(resultado.precise, false);
  assert.equal(resultado.items[0].nome, 'SEM IDENTIFICADOR');
});

test('API rejeita recurso e identificadores inválidos', async () => {
  const resposta = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; } });
  let res = resposta();
  await handler({ method: 'GET', query: { resource: 'desconhecido' } }, res);
  assert.equal(res.code, 400);
  res = resposta();
  await handler({ method: 'GET', query: { resource: 'equipes', cnes: 'abc' } }, res);
  assert.equal(res.code, 400);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('paginação aceita no máximo vinte registros', () => {
  assert.equal(cnes._private.validarTamanhoPagina(20), 20);
  assert.throws(() => cnes._private.validarTamanhoPagina(21), /entre 1 e 20/);
  assert.throws(() => cnes._private.validarTamanhoPagina(0), /entre 1 e 20/);
});
