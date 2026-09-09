# Sistema Hórus de Informações da APS

Interface inicial para consulta municipal de indicadores da Atenção Primária à Saúde.

## Municípios disponíveis

- Caparaó
- Engenheiro Caldas
- Fernandes Tourinho
- Goiás
- Santa Maria de Itabira
- Santo Antônio do Itambé
- São José da Barra

## Dados e execução

O frontend consulta `/api/conasems?tema=producao&ibge=312580`. A função Node.js em
`api/conasems.js` consulta a fonte no servidor, com validação dos sete municípios,
timeout e cache de cinco minutos. Não há geração de dados demonstrativos.

Para desenvolvimento com a API, use `vercel dev` em ambiente autenticado e vinculado
ao projeto. Abrir somente o HTML permite ver o layout, mas não fornece a API.
`npm run build` gera os arquivos estáticos. A pasta `api/` é implantada como Vercel
Function, com o módulo de normalização `lib/conasems.js` incluído no pacote.

### Consultas verificadas

Todas usam POST form-urlencoded, `ibge` de seis dígitos e `tipo=cit` em
`https://paineis.conasems.org.br`:

- Produção: `/assets/ajax/producao.php?option=medianovo`.
- Visitas ACS: `/assets/ajax/epidemiologia.php?option=visitaacs`.
- Cobertura: `/assets/ajax/atencao_basica_dados.php`, campo `cobertura`.
- Cofinanciamento: `/assets/ajax/producao.php?option=cofinanciamento`.
- Financiamento: `/atencao_basica.php`, com `ajax_detalhamento=1`,
  `detalhe_page`, `detalhe_limit=100`, `detalhe_comp=`. Todas as páginas são lidas;
  somente linhas agregadas de competência/parcela são normalizadas, sem executar
  nem inserir HTML externo. As colunas são Desconto, Repasse efetivo e Implantação.

### Regras de interpretação

- `MediaProducao` e `MediaPessoas` são os valores mensais publicados no painel.
  Pontos em strings numéricas brasileiras são separadores de milhar.
- Ausência/erro não vira zero. Competências são extraídas da resposta por município.
  Totais parciais são identificados e listam as competências efetivamente incluídas.
- Pessoas: soma dos valores mensais, não pessoas únicas deduplicadas no ano.
- ACS: média mensal = visitas realizadas / soma dos quantitativos de ACS dos meses
  incluídos. Média diária estimada = média mensal / 22, conforme JavaScript do painel.
- Cobertura conserva referência própria por card e a exibição `100%*` da fonte,
  mostrando também o percentual potencial bruto quando superior a 100%.
- Cofinanciamento traz classificações quadrimestrais. Não inventa competências
  mensais nem soma classificações de quadrimestres distintos.
- Financiamento é filtrado pela competência CNES, que pode diferir do mês de pagamento.

Falhas da fonte apresentam mensagem com opção de tentar novamente. Erros não são
cacheados. Mudanças no município cancelam a consulta anterior para evitar mistura
de dados. Nenhuma credencial externa é enviada ao navegador.

## Verificação

Execute `node --test tests/conasems.test.js` e `npm run build`.
As consultas reais foram verificadas para Fernandes Tourinho em 09/09/2026.
