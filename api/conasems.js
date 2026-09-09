const fonte = require('../lib/conasems');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Método não permitido.' }); }
  const { ibge, tema } = req.query;
  if (!fonte.MUNICIPIOS.has(ibge) || !['producao', 'cobertura', 'financiamento', 'cofinanciamento'].includes(tema)) return res.status(400).json({ error: 'Município ou tema inválido.' });
  try {
    let dados;
    let aviso = null;
    if (tema === 'producao') {
      const [principal, acs] = await Promise.allSettled([
        fonte.consultar('/assets/ajax/producao.php?option=medianovo', ibge).then(fonte.producao),
        fonte.consultar('/assets/ajax/epidemiologia.php?option=visitaacs', ibge).then(data => fonte.visitas(data, ibge))
      ]);
      if (principal.status !== 'fulfilled') throw principal.reason;
      dados = { producao: principal.value, visitas: acs.status === 'fulfilled' ? acs.value : [] };
      if (acs.status !== 'fulfilled') aviso = 'A consulta de visitas ACS falhou. Os demais indicadores foram carregados.';
    } else if (tema === 'cobertura') dados = fonte.cobertura(await fonte.consultar('/assets/ajax/atencao_basica_dados.php', ibge));
    else if (tema === 'cofinanciamento') dados = fonte.cofinanciamento(await fonte.consultar('/assets/ajax/producao.php?option=cofinanciamento', ibge));
    else dados = await fonte.financiamento(ibge);
    if (!aviso) res.setHeader('Cache-Control', 'public, s-maxage=300, max-age=0');
    return res.status(200).json({ ibge, tema, fonte: 'Painéis CONASEMS', consultadoEm: new Date().toISOString(), aviso, dados });
  } catch (error) {
    console.error('Consulta CONASEMS:', tema, ibge, error.message);
    return res.status(502).json({ error: 'Não foi possível obter dados válidos do CONASEMS. Tente novamente em instantes.' });
  }
};
