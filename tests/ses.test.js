const test = require('node:test');
const assert = require('node:assert/strict');
const { formatarContaCorrente } = require('../lib/ses');

test('preserva o dígito verificador X na conta corrente da SES', () => {
  assert.equal(formatarContaCorrente('29604X'), '29.604-X');
  assert.equal(formatarContaCorrente('29.604-X'), '29.604-X');
});

test('mantém a formatação de contas com dígito numérico', () => {
  assert.equal(formatarContaCorrente('341150'), '34.115-0');
});
