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

## Módulo CNES

O módulo **CNES — Estabelecimentos e Profissionais** mantém a navegação em três
níveis: município, unidade e equipe. A primeira lista mostra apenas o número CNES e
o nome de cada unidade elegível. O detalhe da unidade apresenta os dados básicos e
as equipes ativas; os profissionais de uma equipe só são consultados quando ela é
selecionada.

As Vercel Functions expõem somente contratos normalizados no mesmo domínio:

- `/api/cnes?resource=estabelecimentos&ibge=312580&cursor=0&pageSize=20`;
- `/api/cnes?resource=equipes&ibge=312580&cnes=7459629`;
- `/api/cnes?resource=profissionais-equipe&ibge=312580&cnes=7459629&area=0001&equipe=243701&cursor=0&pageSize=20`;
- `/api/cnes?resource=outros-profissionais&ibge=312580&cnes=7459629&cursor=0&pageSize=20`.

### Elegibilidade das unidades

A listagem parte da API oficial de Dados Abertos do Ministério da Saúde, solicita
somente estabelecimentos ativos e aplica simultaneamente:

1. `estabelecimento_faz_atendimento_ambulatorial_sus = SIM`; e
2. natureza jurídica pública (grupo CONCLA `1xxx` ou esfera administrativa
   federal, estadual, municipal ou distrital) **ou** um dos códigos sem fins
   lucrativos `3069`, `3077`, `3220`, `3239`, `3301`, `3999`.

Não há filtro por palavras no nome. A fonte aberta não informa certificação CEBAS;
por isso a interface descreve o segundo grupo como “entidade sem fins lucrativos”,
sem afirmar certificação filantrópica. Pessoas físicas e empresas com fins
lucrativos ficam fora.

### Equipes, profissionais e privacidade

Equipes e seus membros vêm dos serviços usados pela ficha pública oficial do Portal
CNES. A associação é feita por unidade de 13 dígitos, município, área e sequência
oficial da equipe; o INE é preservado para exibição. Esses endpoints são públicos,
mas internos ao portal e não têm contrato formal de estabilidade, portanto o proxy
usa timeout, uma repetição conservadora, cache de uma hora e erros sanitizados.

“Outros profissionais da unidade” é calculado no backend comparando os vínculos
gerais ativos da unidade com os membros de todas as suas equipes. CNS/CNS master é
usado transitoriamente como chave de deduplicação e descartado antes da resposta.
Se qualquer registro não trouxer identificador técnico confiável, a resposta marca
`precise: false` e a interface troca o rótulo para “Demais vínculos na unidade”.
CPF, CNS, email e endereço pessoal nunca integram a resposta pública nem os logs.

Respostas bem-sucedidas usam cache compartilhado da Vercel (`s-maxage` e
`stale-while-revalidate`) além de um cache curto em memória por instância. Falhas
não são armazenadas. A API DEMAS aceita no máximo 20 registros por chamada; o
cursor representa o deslocamento real da fonte e a interface informa claramente
quando ainda há resultados a carregar.

## Verificação

Execute `npm test` e `npm run build`.
As consultas reais foram verificadas para Fernandes Tourinho em 09/09/2026.
