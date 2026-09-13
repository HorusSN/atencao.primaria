(function () {
  const state = {
    municipio: '', estabelecimentos: [], nextCursor: 0, hasNext: false, consultadoEm: null,
    unidade: null, equipes: null, equipe: null, profissionais: null, profissionaisNextCursor: 0, profissionaisHasNext: false,
    outros: null, outrosNextCursor: 0, outrosHasNext: false, outrosPreciso: true, modo: '',
    listaController: null, detalheController: null, equipeController: null
  };
  const escapar = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const $ = seletor => document.querySelector(seletor);

  function renderizarMenu() {
    prepararSaida();
    $('#imprimir').disabled = true;
    $('#production-indicators').innerHTML = `<article class="indicator-panel cnes-panel"><p class="cnes-eyebrow">CNES · Consultas</p><h3>Escolha uma consulta</h3><div class="cnes-menu-grid"><button class="cnes-menu-card" type="button" data-cnes-mode="sus"><strong>1 · Estabelecimentos do SUS</strong><span>Consulta atual de estabelecimentos elegíveis.</span></button><button class="cnes-menu-card" type="button" data-cnes-mode="gerais"><strong>2 · Estabelecimentos Gerais</strong><span>Todos os estabelecimentos cadastrados no município.</span></button><button class="cnes-menu-card" type="button" data-cnes-mode="equipes"><strong>3 · Equipes</strong><span>Todas as equipes cadastradas no município.</span></button><button class="cnes-menu-card" type="button" data-cnes-mode="profissionais"><strong>4 · Profissionais</strong><span>Nome, CBO, cargo, carga horária, CNES e mantenedora.</span></button></div></article>`;
  }

  function mostrarStatus(mensagem, tipo = '') {
    const status = $('#source-status');
    status.textContent = mensagem || '';
    status.hidden = !mensagem;
    status.dataset.type = tipo;
  }
  function prepararSaida() { $('#production-dashboard').hidden = false; $('#imprimir').disabled = false; $('.empty-state').hidden = true; }
  function formatarCep(cep) { const d = String(cep || '').replace(/\D/g, ''); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep || 'Não informado'; }
  function formatarData(valor) {
    if (!valor) return 'Não informada pela fonte';
    const iso = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    return String(valor);
  }
  function enderecoCompleto(unidade) {
    const e = unidade.endereco || {};
    return [[[e.logradouro, e.numero].filter(Boolean).join(', ')], e.bairro, e.cep ? `CEP ${formatarCep(e.cep)}` : null].flat().filter(Boolean).join(' · ') || 'Endereço não informado pela fonte';
  }

  function renderizarLista() {
    prepararSaida();
    const municipio = $('#municipio').options[$('#municipio').selectedIndex]?.text || '';
    const itens = state.estabelecimentos.map(unidade => `<button class="cnes-unit-card cnes-unit-card-simple" type="button" data-cnes-open="${escapar(unidade.cnes)}"><span class="cnes-number">CNES ${escapar(unidade.cnes)}</span><strong>${escapar(unidade.nome)}</strong><span class="cnes-unit-action" aria-hidden="true">Abrir unidade →</span></button>`).join('');
    $('#production-indicators').innerHTML = `<article class="indicator-panel cnes-panel">
      <div class="cnes-panel-heading"><div><p class="cnes-eyebrow">1 · Município</p><h3>Unidades de saúde</h3><p>${escapar(municipio)}</p></div><strong>${state.estabelecimentos.length} carregada${state.estabelecimentos.length === 1 ? '' : 's'}</strong></div>
      <p class="indicator-note cnes-rule-note">Unidades dos grupos oficiais de natureza jurídica CONCLA 1xxx (Administração Pública) ou 3xxx (Entidades sem Fins Lucrativos), independentemente do tipo da unidade, do nome ou do indicador de atendimento SUS. Empresas privadas com fins lucrativos, pessoas físicas e códigos desconhecidos são excluídos.</p>
      <div class="cnes-unit-list">${itens || '<div class="cnes-empty">Nenhuma unidade elegível foi encontrada nesta parte da base.</div>'}</div>
      ${state.hasNext ? '<p class="cnes-completeness">Há mais resultados na fonte oficial.</p><button class="cnes-secondary-button" type="button" data-cnes-more-units>Carregar próxima parte da lista</button>' : '<p class="cnes-completeness cnes-complete">Lista completa para os critérios selecionados.</p>'}
      <p class="indicator-note">Fonte: API de Dados Abertos do Ministério da Saúde — CNES/DATASUS.</p>
    </article>`;
  }

  async function carregarEstabelecimentos({ continuar = false } = {}) {
    const municipio = $('#municipio').value;
    if (!municipio) return mostrarStatus('Selecione um município antes de consultar.', 'error');
    if (!continuar) {
      reset({ preserveMunicipality: true });
      state.municipio = municipio;
      $('#production-dashboard').hidden = true;
      $('#imprimir').disabled = true;
    }
    state.listaController = new AbortController();
    $('#cnes-consultar').disabled = true;
    mostrarStatus(continuar ? 'Carregando a próxima parte da lista oficial…' : 'Consultando unidades elegíveis no CNES…');
    try {
      const params = new URLSearchParams({ resource: state.modo === 'gerais' ? 'estabelecimentos-gerais' : 'estabelecimentos', ibge: municipio, cursor: String(state.nextCursor || 0), pageSize: '20' });
      const response = await fetch(`/api/cnes?${params}`, { signal: state.listaController.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível consultar as unidades do CNES.');
      if (state.municipio !== municipio) return;
      const existentes = new Set(state.estabelecimentos.map(item => item.cnes));
      (result.items || []).forEach(item => { if (!existentes.has(item.cnes)) state.estabelecimentos.push(item); });
      state.nextCursor = result.nextCursor; state.hasNext = Boolean(result.hasNext); state.consultadoEm = result.consultadoEm;
      mostrarStatus(''); renderizarLista();
    } catch (error) {
      if (error.name !== 'AbortError') mostrarStatus(error instanceof SyntaxError ? 'A fonte CNES retornou uma resposta inválida.' : error.message, 'error');
    } finally { $('#cnes-consultar').disabled = !$('#municipio').value; }
  }

  async function carregarConsultaMunicipal(modo) {
    const municipio = $('#municipio').value;
    if (!municipio) return mostrarStatus('Selecione um município antes de consultar.', 'error');
    state.modo = modo; mostrarStatus('Consultando dados oficiais do CNES…'); prepararSaida();
    try {
      const resource = modo === 'equipes' ? 'equipes-municipio' : 'profissionais-municipio';
      const response = await fetch(`/api/cnes?resource=${resource}&ibge=${encodeURIComponent(municipio)}`);
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Não foi possível consultar o CNES.');
      if (modo === 'equipes') {
        $('#production-indicators').innerHTML = `<article class="indicator-panel cnes-panel"><button class="cnes-text-button" type="button" data-cnes-menu>← Voltar às consultas</button><h3>Equipes do município</h3><div class="cnes-team-list">${(result.items || []).map(e => `<article class="cnes-team-card"><span><strong>${escapar(e.nome)}</strong><small>INE ${escapar(e.ine)} · CNES ${escapar(e.cnes)}</small></span><span>${escapar(e.estabelecimento)}</span><span>${escapar(e.tipo || 'Tipo não informado')}</span></article>`).join('') || '<div class="cnes-empty">Nenhuma equipe encontrada.</div>'}</div></article>`;
      } else {
        $('#production-indicators').innerHTML = `<article class="indicator-panel cnes-panel"><button class="cnes-text-button" type="button" data-cnes-menu>← Voltar às consultas</button><h3>Profissionais do município</h3><div class="cnes-professional-filters"><label>Cargo/CBO<input data-prof-filter="cargo" placeholder="Filtrar cargo ou CBO"></label><label>CNES<input data-prof-filter="cnes" placeholder="Filtrar CNES"></label><label>Mantenedora<input data-prof-filter="mantenedora" placeholder="Filtrar mantenedora"></label></div><div class="cnes-professional-list" data-prof-list>${(result.items || []).map(p => `<article class="cnes-professional" data-prof-cargo="${escapar(`${p.cargo || ''} ${p.cbo || ''}`)}" data-prof-cnes="${escapar(p.cnes || '')}" data-prof-mantenedora="${escapar(p.mantenedora || '')}"><h5>${escapar(p.nome)}</h5><p><strong>CBO:</strong> ${escapar(p.cbo || 'Não informado')} · <strong>Cargo:</strong> ${escapar(p.cargo || 'Não informado')} · <strong>Carga:</strong> ${escapar(p.cargaHoraria)}h</p><p><strong>CNES:</strong> ${escapar(p.cnes || 'Não informado')} · <strong>Estabelecimento:</strong> ${escapar(p.nomeEstabelecimento || 'Não informado')} · <strong>Mantenedora:</strong> ${escapar(p.mantenedora || 'Não informada')}</p></article>`).join('') || '<div class="cnes-empty">Nenhum profissional encontrado.</div>'}</div></article>`;
        document.querySelectorAll('[data-prof-filter]').forEach(input => input.addEventListener('input', () => { const filtros = Object.fromEntries([...document.querySelectorAll('[data-prof-filter]')].map(campo => [campo.dataset.profFilter, campo.value.toLocaleLowerCase('pt-BR').trim()])); document.querySelectorAll('[data-prof-list] .cnes-professional').forEach(card => { card.hidden = Object.entries(filtros).some(([campo, valor]) => valor && !(card.dataset[`prof${campo[0].toUpperCase()}${campo.slice(1)}`] || '').toLocaleLowerCase('pt-BR').includes(valor)); }); }));
      }
      mostrarStatus('');
    } catch (error) { mostrarStatus(error.message, 'error'); }
  }

  function renderizarEquipes() {
    if (state.equipes == null) return '<div class="cnes-loading" role="status">Consultando equipes cadastradas…</div>';
    if (!state.equipes.length) return '<div class="cnes-empty">Nenhuma equipe ativa foi encontrada para esta unidade.</div>';
    return `<div class="cnes-team-list">${state.equipes.map(equipe => `<button type="button" class="cnes-team-card${state.equipe?.ine === equipe.ine ? ' active' : ''}" data-cnes-team="${escapar(equipe.ine)}"><span><strong>${escapar(equipe.nome)}</strong><small>INE ${escapar(equipe.ine)}</small></span><span>${escapar(equipe.tipo || 'Tipo não informado')}</span><span>Ativação: ${escapar(formatarData(equipe.inicio))}</span><b aria-hidden="true">Ver profissionais →</b></button>`).join('')}</div>`;
  }

  function renderizarOcupacao(ocupacao) {
    const cargas = [ocupacao.cargas?.ambulatorial ? `Ambulatorial: ${ocupacao.cargas.ambulatorial}h` : null, ocupacao.cargas?.hospitalar ? `Hospitalar: ${ocupacao.cargas.hospitalar}h` : null, ocupacao.cargas?.outros ? `Outros: ${ocupacao.cargas.outros}h` : null].filter(Boolean);
    return `<li class="cnes-occupation"><div><strong>${escapar(ocupacao.cbo || 'CBO não informado')}</strong><span>${escapar(ocupacao.descricaoCbo || 'Descrição não informada')}</span></div><div class="cnes-workload">${cargas.map(c => `<span>${escapar(c)}</span>`).join('') || '<span>Carga horária não informada</span>'}${ocupacao.cargaTotal ? `<strong>Total nesta ocupação: ${escapar(ocupacao.cargaTotal)}h</strong>` : ''}</div><small>Início: ${escapar(formatarData(ocupacao.inicioVinculo))}</small></li>`;
  }
  function cartaoProfissional(profissional) {
    return `<article class="cnes-professional"><div class="cnes-professional-heading"><h5>${escapar(profissional.nome)}</h5><span>Atualização: ${escapar(formatarData(profissional.atualizadoEm))}</span></div>${profissional.vinculo ? `<p class="cnes-link-type">${escapar(profissional.vinculo)}</p>` : ''}<ul>${(profissional.ocupacoes || []).map(renderizarOcupacao).join('')}</ul></article>`;
  }
  function renderizarProfissionaisEquipe() {
    if (!state.equipe) return '';
    const conteudo = state.profissionais == null ? '<div class="cnes-loading" role="status">Consultando membros da equipe…</div>' : state.profissionais.length ? `<div class="cnes-professional-list">${state.profissionais.map(cartaoProfissional).join('')}</div>` : '<div class="cnes-empty">Nenhum profissional ativo foi retornado para esta equipe.</div>';
    return `<section class="cnes-subsection cnes-selected-team"><p class="cnes-eyebrow">3 · Equipe</p><h4>Profissionais — ${escapar(state.equipe.nome)}</h4><p class="indicator-note">Associação comprovada pela chave oficial da equipe. CPF e CNS são usados apenas transitoriamente no backend para deduplicação e nunca são enviados ao navegador.</p>${conteudo}${state.profissionaisHasNext ? '<button class="cnes-secondary-button" type="button" data-cnes-more-prof>Carregar mais profissionais desta equipe</button>' : ''}</section>`;
  }
  function renderizarOutros() {
    const titulo = state.outrosPreciso ? 'Outros profissionais da unidade' : 'Demais vínculos na unidade';
    const conteudo = state.outros == null ? '<div class="cnes-loading" role="status">Comparando vínculos da unidade e membros das equipes…</div>' : state.outros.length ? `<div class="cnes-professional-list">${state.outros.map(cartaoProfissional).join('')}</div>` : '<div class="cnes-empty">Nenhum outro vínculo ativo foi encontrado após a comparação com todas as equipes.</div>';
    return `<section class="cnes-subsection"><h4>${titulo}</h4><p class="indicator-note">A composição compara identificadores técnicos no backend antes de removê-los. Os identificadores pessoais são descartados antes da resposta pública.</p>${conteudo}${state.outrosHasNext ? '<button class="cnes-secondary-button" type="button" data-cnes-more-other>Carregar mais</button>' : ''}</section>`;
  }

  function renderizarDetalhe() {
    if (!state.unidade) return;
    const u = state.unidade; prepararSaida();
    $('#production-indicators').innerHTML = `<article class="indicator-panel cnes-panel cnes-detail-panel">
      <button class="cnes-text-button" type="button" data-cnes-back>← Voltar à lista de unidades</button>
      <header class="cnes-detail-heading"><div><p class="cnes-eyebrow">2 · Unidade</p><h3>${escapar(u.nome)}</h3><p>CNES ${escapar(u.cnes)}</p></div><span class="cnes-sus-badge">${escapar(u.classificacaoNatureza)}</span></header>
      <dl class="cnes-basic-data"><div><dt>Endereço</dt><dd>${escapar(enderecoCompleto(u))}</dd></div><div><dt>Razão social</dt><dd>${escapar(u.razaoSocial || 'Não informada')}</dd></div><div><dt>Natureza</dt><dd>${escapar(u.classificacaoNatureza)} · código ${escapar(u.naturezaJuridica || 'não informado')}</dd></div><div><dt>Gestão / esfera</dt><dd>${escapar(u.gestao || 'Não informada')} / ${escapar(u.esfera || 'Não informada')}</dd></div><div><dt>Atendimento ambulatorial SUS</dt><dd>${escapar(u.atendimentoSus || 'Não informado')}</dd></div><div><dt>Turno</dt><dd>${escapar(u.turnoAtendimento || 'Não informado')}</dd></div><div><dt>Atualização cadastral</dt><dd>${escapar(formatarData(u.atualizadoEm))}</dd></div></dl>
      <section class="cnes-subsection"><h4>Equipes cadastradas</h4><p class="indicator-note">Selecione uma equipe para consultar exclusivamente os profissionais associados a ela.</p>${renderizarEquipes()}</section>
      ${renderizarProfissionaisEquipe()}
      ${renderizarOutros()}
      <p class="indicator-note">Fonte: Portal CNES e API de Dados Abertos do Ministério da Saúde — DATASUS.</p>
    </article>`;
  }

  async function carregarEquipes(cnes, signal) {
    try {
      const response = await fetch(`/api/cnes?resource=equipes&ibge=${encodeURIComponent(state.municipio)}&cnes=${encodeURIComponent(cnes)}`, { signal });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Não foi possível consultar equipes.');
      if (state.unidade?.cnes === cnes) state.equipes = result.items || [];
    } catch (error) { if (error.name !== 'AbortError') { state.equipes = []; mostrarStatus(error.message, 'error'); } }
    renderizarDetalhe();
  }
  async function carregarOutros(cnes, { continuar = false, signal } = {}) {
    try {
      const params = new URLSearchParams({ resource: 'outros-profissionais', ibge: state.municipio, cnes, cursor: String(continuar ? state.outrosNextCursor : 0), pageSize: '20' });
      const response = await fetch(`/api/cnes?${params}`, { signal }); const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível compor os outros profissionais.');
      if (state.unidade?.cnes !== cnes) return;
      state.outros = [...(continuar && Array.isArray(state.outros) ? state.outros : []), ...(result.items || [])];
      state.outrosNextCursor = result.nextCursor; state.outrosHasNext = Boolean(result.hasNext); state.outrosPreciso = result.precise !== false;
    } catch (error) { if (error.name !== 'AbortError') { state.outros = []; mostrarStatus(error.message, 'error'); } }
    renderizarDetalhe();
  }
  async function carregarProfissionaisEquipe({ continuar = false } = {}) {
    if (!state.equipe || !state.unidade) return;
    if (!continuar) { state.equipeController?.abort(); state.equipeController = new AbortController(); state.profissionais = null; state.profissionaisNextCursor = 0; state.profissionaisHasNext = false; renderizarDetalhe(); }
    const equipe = state.equipe;
    try {
      const params = new URLSearchParams({ resource: 'profissionais-equipe', ibge: state.municipio, cnes: state.unidade.cnes, area: equipe.area, equipe: equipe.sequencia, cursor: String(state.profissionaisNextCursor || 0), pageSize: '20' });
      const response = await fetch(`/api/cnes?${params}`, { signal: state.equipeController.signal }); const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível consultar os profissionais da equipe.');
      if (state.equipe?.ine !== equipe.ine) return;
      state.profissionais = [...(continuar && Array.isArray(state.profissionais) ? state.profissionais : []), ...(result.items || [])];
      state.profissionaisNextCursor = result.nextCursor; state.profissionaisHasNext = Boolean(result.hasNext);
    } catch (error) { if (error.name !== 'AbortError') { state.profissionais = []; mostrarStatus(error.message, 'error'); } }
    renderizarDetalhe();
  }
  function abrirUnidade(cnes) {
    const unidade = state.estabelecimentos.find(item => item.cnes === cnes); if (!unidade) return;
    state.detalheController?.abort(); state.equipeController?.abort(); state.detalheController = new AbortController();
    Object.assign(state, { unidade, equipes: null, equipe: null, profissionais: null, outros: null, outrosNextCursor: 0, outrosHasNext: false });
    mostrarStatus(''); renderizarDetalhe();
    carregarEquipes(cnes, state.detalheController.signal); carregarOutros(cnes, { signal: state.detalheController.signal });
  }
  function selecionarEquipe(ine) { state.equipe = state.equipes?.find(item => item.ine === ine) || null; if (state.equipe) carregarProfissionaisEquipe(); }

  function reset({ preserveMunicipality = false } = {}) {
    state.listaController?.abort(); state.detalheController?.abort(); state.equipeController?.abort();
    Object.assign(state, { estabelecimentos: [], nextCursor: 0, hasNext: false, consultadoEm: null, unidade: null, equipes: null, equipe: null, profissionais: null, outros: null, modo: '' });
    if (!preserveMunicipality) state.municipio = '';
    if ($('#cnes-consultar')) $('#cnes-consultar').disabled = !$('#municipio')?.value;
  }
  function prepararMunicipio() { reset({ preserveMunicipality: true }); state.municipio = $('#municipio').value; $('#cnes-consultar').disabled = !state.municipio; }
  function periodoRelatorio() { return state.equipe ? `Equipe ${state.equipe.ine} · CNES ${state.unidade.cnes}` : state.unidade ? `Estabelecimento CNES ${state.unidade.cnes}` : 'Relação municipal de unidades CNES'; }
  function init() {
    renderizarMenu();
    $('#cnes-consultar').addEventListener('click', () => carregarEstabelecimentos());
    $('#production-indicators').addEventListener('click', event => {
      const modo = event.target.closest('[data-cnes-mode]'); if (modo) { if (modo.dataset.cnesMode === 'sus' || modo.dataset.cnesMode === 'gerais') { state.modo = modo.dataset.cnesMode; $('#cnes-consultar').click(); } else carregarConsultaMunicipal(modo.dataset.cnesMode); return; }
      if (event.target.closest('[data-cnes-menu]')) { renderizarMenu(); return; }
      const abrir = event.target.closest('[data-cnes-open]'); if (abrir) return abrirUnidade(abrir.dataset.cnesOpen);
      const equipe = event.target.closest('[data-cnes-team]'); if (equipe) return selecionarEquipe(equipe.dataset.cnesTeam);
      if (event.target.closest('[data-cnes-more-units]')) return carregarEstabelecimentos({ continuar: true });
      if (event.target.closest('[data-cnes-more-prof]')) return carregarProfissionaisEquipe({ continuar: true });
      if (event.target.closest('[data-cnes-more-other]')) return carregarOutros(state.unidade.cnes, { continuar: true, signal: state.detalheController.signal });
      if (event.target.closest('[data-cnes-back]')) { state.detalheController?.abort(); state.equipeController?.abort(); state.unidade = null; renderizarLista(); }
    });
  }
  window.HorusCnes = { init, reset, prepararMunicipio, periodoRelatorio, consultar: carregarEstabelecimentos, menu: renderizarMenu };
})();
