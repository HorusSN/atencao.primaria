const cnes = require('../lib/cnes');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  try {
    const resource = String(req.query.resource || '');
    let dados;
    if (resource === 'estabelecimentos') {
      dados = await cnes.listarEstabelecimentos(req.query);
      res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400, max-age=0');
    } else if (resource === 'profissionais-equipe') {
      dados = await cnes.listarProfissionaisEquipe(req.query);
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=21600, max-age=0');
    } else if (resource === 'outros-profissionais') {
      dados = await cnes.listarOutrosProfissionais(req.query);
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=21600, max-age=0');
    } else if (resource === 'equipes') {
      dados = await cnes.listarEquipes(req.query);
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=21600, max-age=0');
    } else {
      return res.status(400).json({ error: 'Recurso CNES inválido.' });
    }
    return res.status(200).json({ tema: 'cnes', resource, ...dados });
  } catch (error) {
    console.error('Consulta CNES:', String(req.query.resource || ''), String(req.query.ibge || req.query.cnes || ''), error.message);
    const status = error.status || 502;
    return res.status(status).json({ error: status < 500 ? error.message : 'Não foi possível consultar dados válidos do CNES neste momento.' });
  }
};
