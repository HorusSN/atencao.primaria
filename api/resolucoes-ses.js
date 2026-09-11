const resolucoes = require('../lib/resolucoes-ses');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  try {
    if (String(req.query.meta || '') === '1') {
      const dados = await resolucoes.consultarMetadados();
      res.setHeader('Cache-Control', dados.emCache ? 'public, s-maxage=3600, max-age=0' : 'no-store');
      return res.status(200).json({ tema: 'resolucoes-ses', dados });
    }
    const dados = await resolucoes.consultarDocumentos({
      ano: req.query.ano,
      mes: req.query.mes,
      categoria: req.query.categoria,
      q: req.query.q
    });
    res.setHeader('Cache-Control', dados.emCache ? 'public, s-maxage=900, max-age=0' : 'no-store');
    return res.status(200).json({ tema: 'resolucoes-ses', dados });
  } catch (error) {
    console.error('Consulta de resoluções SES/MG:', error.message);
    return res.status(error.status || 502).json({
      error: error.status && error.status < 500 ? error.message : 'Não foi possível consultar os documentos da SES/MG neste momento.'
    });
  }
};
