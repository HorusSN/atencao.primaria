const ses = require('../lib/ses');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  try {
    const dados = await ses.consultar(req.query.ibge, req.query.ano);
    res.setHeader('Cache-Control', dados.emCache ? 'public, s-maxage=300, max-age=0' : 'no-store');
    return res.status(200).json({
      ibge: dados.ibge,
      tema: 'pagamentos-ses',
      fonte: 'Secretaria de Estado de Saúde de Minas Gerais (SES/MG)',
      municipio: dados.municipio,
      ano: dados.ano,
      consultadoEm: dados.consultadoEm,
      emCache: dados.emCache,
      dados: { pagamentos: dados.pagamentos }
    });
  } catch (error) {
    console.error('Consulta SES/MG:', req.query.ibge, error.message);
    return res.status(error.status || 502).json({
      error: error.status && error.status < 500 ? error.message : 'Não foi possível consultar os pagamentos da SES/MG. Tente novamente em instantes.'
    });
  }
};
