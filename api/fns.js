const fns = require('../lib/fns');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  const { ibge, ano = String(new Date().getFullYear()) } = req.query;
  try {
    const dados = await fns.consultar(ibge, ano);
    res.setHeader('Cache-Control', dados.emCache ? 'public, s-maxage=60, max-age=0' : 'no-store');
    return res.status(200).json({
      ibge: dados.ibge,
      tema: 'financiamento',
      fonte: 'Fundo Nacional de Saúde (FNS)',
      consultadoEm: dados.consultadoEm,
      emCache: dados.emCache,
      entidade: dados.entidade,
      resumo: dados.resumo,
      dados: { pagamentos: dados.pagamentos }
    });
  } catch (error) {
    console.error('Consulta FNS:', ibge, error.message);
    return res.status(error.status || 502).json({ error: error.status && error.status < 500 ? error.message : 'Não foi possível obter dados válidos do FNS. Tente novamente em instantes.' });
  }
};
