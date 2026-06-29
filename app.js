/*
  Controle de Van - protótipo local/PWA.
  Esta versão dificulta fraudes simples, mas não impede GPS falso, manipulação do navegador,
  alteração de localStorage ou edição dos arquivos locais. Para segurança real, use backend,
  autenticação, logs imutáveis, banco remoto e sincronização em nuvem.
*/

const STORAGE_KEY = 'controleVan.v1';
const ACTIVE_KEY = 'controleVan.activeTrips.v1';
const DEFAULT_CENTER = [-12.9777, -38.5016]; // Salvador-BA como centro inicial de fallback.

const state = {
  settings: {},
  currentTrip: null,
  trips: [],
  adminLogs: [],
  people: [],
  vans: [],
  points: [],
  lusoPoint: null,
  adminLogged: false,
  adminTab: 'dashboard',
  maps: {},
  watchId: null,
  pendingPhotoPoint: null,
  lastScreen: 'home',
  reportDraft: null,
  confirmResolve: null,
};

const defaults = {
  settings: {
    fullFare: 5,
    lusoFare: 2.5,
    adminPin: '1234',
    googleMapsKey: '',
    locationIntervalMs: 30000,
    lowAccuracyThreshold: 100,
  },
  people: [],
  vans: [],
  points: [],
  lusoPoint: null,
  trips: [],
  adminLogs: [],
  currentTrip: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const appEl = $('#app');
const toastEl = $('#toast');

function initApp() {
  loadState();
  bindGlobalEvents();
  registerServiceWorker();
  renderHome();
  restoreActiveTrip();
  updateConnectionHint();
}

function bindGlobalEvents() {
  $('#btnHome').addEventListener('click', renderHome);
  $('#btnQuickLocation').addEventListener('click', async () => {
    const loc = await getCurrentLocation({ reason: 'atualização manual pelo botão GPS' });
    if (state.currentTrip && loc) {
      saveTripLocation(loc, 'GPS real');
      persistState();
      upsertActiveTrip(state.currentTrip);
      renderTripScreen();
    }
  });
  $$('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.closeModal)));
  $('#btnSaveLuso').addEventListener('click', saveLusoEvent);
  $('#btnTakePhoto').addEventListener('click', () => $('#photoInput').click());
  $('#btnPhotoLater').addEventListener('click', () => {
    if (state.pendingPhotoPoint && state.currentTrip) {
      markPhotoPending(state.pendingPhotoPoint, 'Alerta ignorado/adiado pelo cobrador');
      registerLog('photo_pending', `Foto pendente: ${state.pendingPhotoPoint.name}`, { pointId: state.pendingPhotoPoint.id });
      persistState();
      upsertActiveTrip(state.currentTrip);
      closeModal('photoModal');
      state.pendingPhotoPoint = null;
      renderTripScreen();
    }
  });
  $('#photoInput').addEventListener('change', capturePhoto);
  $('#confirmYes').addEventListener('click', () => resolveConfirm(true));
  $('#confirmNo').addEventListener('click', () => resolveConfirm(false));
  window.addEventListener('online', updateConnectionHint);
  window.addEventListener('offline', updateConnectionHint);
}

function updateConnectionHint() {
  $('#connectionHint').textContent = navigator.onLine ? 'Online/local' : 'Offline/local';
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      console.warn('Service worker não registrado. Recursos PWA podem ficar indisponíveis.');
    });
  }
}

function defaultData() {
  return JSON.parse(JSON.stringify(defaults));
}

function loadState() {
  const data = defaultData();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(data, JSON.parse(raw));
  } catch (err) {
    console.error('Erro ao carregar localStorage:', err);
  }
  state.settings = { ...defaults.settings, ...(data.settings || {}) };
  state.currentTrip = data.currentTrip || null;
  state.trips = Array.isArray(data.trips) ? data.trips : [];
  state.adminLogs = Array.isArray(data.adminLogs) ? data.adminLogs : [];
  state.people = Array.isArray(data.people) ? data.people : [];
  state.vans = Array.isArray(data.vans) ? data.vans : [];
  state.points = Array.isArray(data.points) ? data.points : [];
  state.lusoPoint = data.lusoPoint || null;
}

function persistState() {
  const data = {
    settings: state.settings,
    currentTrip: state.currentTrip,
    trips: state.trips,
    adminLogs: state.adminLogs,
    people: state.people,
    vans: state.vans,
    points: state.points,
    lusoPoint: state.lusoPoint,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function readActiveTrips() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || '[]'); }
  catch { return []; }
}

function writeActiveTrips(trips) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(trips));
}

function upsertActiveTrip(trip) {
  if (!trip || trip.status !== 'em andamento') return;
  const list = readActiveTrips().filter(item => item.id !== trip.id);
  list.push(stripLargePhotoData(trip));
  writeActiveTrips(list);
}

function removeActiveTrip(tripId) {
  writeActiveTrips(readActiveTrips().filter(item => item.id !== tripId));
}

function restoreActiveTrip() {
  if (state.currentTrip && state.currentTrip.status === 'em andamento') {
    startLocationWatch();
    upsertActiveTrip(state.currentTrip);
  }
}

function stripLargePhotoData(trip) {
  const clone = structuredCloneSafe(trip);
  clone.photos = (clone.photos || []).map(photo => ({ ...photo, previewBase64: photo.previewBase64 ? '[prévia salva no aparelho da viagem]' : '' }));
  return clone;
}

function structuredCloneSafe(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function uuid(prefix = 'id') {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now()}_${rand}`;
}

function nowISO() { return new Date().toISOString(); }
function fmtDateTime(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function fmtDate(value) { return value ? new Date(value).toLocaleDateString('pt-BR') : '-'; }
function fmtTime(value) { return value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'; }
function currency(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function toNumber(value) { return Math.max(0, Number(value || 0)); }
function clampInt(value) { return Math.max(0, Math.floor(Number(value || 0))); }
function activePeople() { return state.people.filter(p => p.status !== 'inativo'); }
function activeVans() { return state.vans.filter(v => v.status !== 'inativa'); }

function showToast(message, ms = 2800) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

function openModal(id) { $(`#${id}`).classList.remove('hidden'); }
function closeModal(id) { $(`#${id}`).classList.add('hidden'); }

function confirmAction(title, text) {
  $('#confirmTitle').textContent = title;
  $('#confirmText').textContent = text;
  openModal('confirmModal');
  return new Promise(resolve => { state.confirmResolve = resolve; });
}
function resolveConfirm(value) {
  closeModal('confirmModal');
  if (state.confirmResolve) state.confirmResolve(value);
  state.confirmResolve = null;
}

function badge(text, kind = 'none') { return `<span class="badge ${kind}">${escapeHTML(text)}</span>`; }
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}

function renderHome() {
  state.lastScreen = 'home';
  cleanupMaps();
  appEl.innerHTML = `
    <section class="hero">
      <h1>Controle de Van</h1>
      <p>Contador de passageiros, pagamentos, fotos obrigatórias, relatórios e localização visual das vans.</p>
    </section>

    ${state.currentTrip && state.currentTrip.status === 'em andamento' ? `
      <section class="card report-warning" style="margin-top:14px">
        <h2>Viagem em andamento</h2>
        <p>Van ${escapeHTML(state.currentTrip.vanNumber)} • ${escapeHTML(state.currentTrip.personName)} • iniciada em ${fmtDateTime(state.currentTrip.startTime)}</p>
        <button class="primary full" id="btnResumeTrip" type="button">Continuar viagem</button>
      </section>` : ''}

    <section class="grid three" style="margin-top:14px">
      <button id="btnNewTrip" class="primary" type="button">Nova Viagem</button>
      <button id="btnHistory" class="secondary" type="button">Histórico</button>
      <button id="btnAdmin" class="ghost" type="button">Área do Administrador</button>
    </section>

    <section class="grid two" style="margin-top:14px">
      <div class="card"><h2>Uso rápido</h2><p class="muted">Botões grandes para contar passageiros, registrar dinheiro, Pix, Luso e encerrar com relatório antes de salvar.</p></div>
      <div class="card"><h2>Segurança local</h2><p class="muted">Fotos com horário, GPS, distância do ponto, pendências e marcação de suspeita quando houver divergência.</p></div>
    </section>
  `;
  $('#btnNewTrip').addEventListener('click', renderNewTrip);
  $('#btnHistory').addEventListener('click', renderHistory);
  $('#btnAdmin').addEventListener('click', renderAdminLogin);
  const resume = $('#btnResumeTrip');
  if (resume) resume.addEventListener('click', renderTripScreen);
}

function renderNewTrip() {
  state.lastScreen = 'newTrip';
  cleanupMaps();
  const people = activePeople();
  const peopleOptions = people.map(p => `<option value="${p.id}">${escapeHTML(p.name)} — Van ${escapeHTML(p.vanNumber || '')}</option>`).join('');
  appEl.innerHTML = `
    <section class="section-title"><h2>Nova Viagem</h2></section>
    ${state.currentTrip && state.currentTrip.status === 'em andamento' ? `
      <div class="card report-danger"><strong>Existe uma viagem em andamento.</strong><p>Salve ou continue a viagem atual antes de iniciar outra.</p><button id="goCurrent" class="primary full" type="button">Abrir viagem atual</button></div>
    ` : `
      <div class="card">
        <label>Sentido da viagem
          <select id="tripDirection">
            <option value="ida">Ida</option>
            <option value="volta">Volta</option>
          </select>
        </label>
        <label>Responsável / cobrador / motorista
          <select id="tripPerson">
            ${peopleOptions || '<option value="">Nenhuma pessoa cadastrada</option>'}
          </select>
        </label>
        ${peopleOptions ? '' : `<div class="report-warning card compact"><strong>Cadastre uma pessoa para começar.</strong></div>`}
        <div class="row-actions">
          <button id="btnStartTrip" class="primary" ${peopleOptions ? '' : 'disabled'} type="button">Iniciar viagem</button>
          <button id="btnOpenQuickPerson" class="secondary" type="button">Cadastrar pessoa</button>
        </div>
      </div>
      <div id="quickPersonCard" class="card hidden" style="margin-top:12px">
        <h3>Cadastro rápido</h3>
        <label>Nome
          <input id="quickPersonName" placeholder="Ex.: João Silva" />
        </label>
        <label>Número da van
          <input id="quickPersonVan" placeholder="Ex.: 12" />
        </label>
        <label>Observação opcional
          <textarea id="quickPersonNotes" rows="2"></textarea>
        </label>
        <button id="btnSaveQuickPerson" class="primary full" type="button">Salvar pessoa</button>
      </div>`}
  `;
  const goCurrent = $('#goCurrent');
  if (goCurrent) goCurrent.addEventListener('click', renderTripScreen);
  const startBtn = $('#btnStartTrip');
  if (startBtn) startBtn.addEventListener('click', startTrip);
  const quickBtn = $('#btnOpenQuickPerson');
  if (quickBtn) quickBtn.addEventListener('click', () => $('#quickPersonCard').classList.toggle('hidden'));
  const saveQuick = $('#btnSaveQuickPerson');
  if (saveQuick) saveQuick.addEventListener('click', () => {
    const name = $('#quickPersonName').value.trim();
    const vanNumber = $('#quickPersonVan').value.trim();
    if (!name || !vanNumber) return showToast('Informe nome e número da van.');
    const person = { id: uuid('person'), name, vanNumber, phone: '', notes: $('#quickPersonNotes').value.trim(), status: 'ativo' };
    state.people.push(person);
    if (!state.vans.some(v => String(v.number) === String(vanNumber))) {
      state.vans.push({ id: uuid('van'), number: vanNumber, plate: '', linkedPersonId: person.id, status: 'ativa', notes: 'Criada no cadastro rápido.' });
    }
    persistState();
    showToast('Pessoa cadastrada.');
    renderNewTrip();
  });
}

async function startTrip() {
  const personId = $('#tripPerson').value;
  const direction = $('#tripDirection').value;
  const person = state.people.find(p => p.id === personId);
  if (!person) return showToast('Selecione uma pessoa cadastrada.');
  const startTime = nowISO();
  const loc = await getCurrentLocation({ reason: 'início da viagem', silent: true });
  const locationOrigin = loc ? 'GPS real' : 'indisponível';
  state.currentTrip = {
    id: uuid('trip'),
    status: 'em andamento',
    date: startTime.slice(0, 10),
    startTime,
    endTime: null,
    direction,
    personId,
    personName: person.name,
    vanNumber: person.vanNumber,
    passengers: { full: 0, luso: 0, total: 0 },
    payments: { cash: 0, pix: 0, total: 0, cashFullQty: 0, pixFullQty: 0, cashLusoQty: 0, pixLusoQty: 0 },
    expectedTotal: 0,
    difference: 0,
    lusoEvents: [],
    photos: [],
    pendingPhotos: [],
    suspiciousPhotos: [],
    logs: [],
    locations: [],
    lastLocation: null,
    estimatedLocation: null,
    locationOrigin,
    saved: false,
    settingsSnapshot: { fullFare: Number(state.settings.fullFare), lusoFare: Number(state.settings.lusoFare) },
  };
  if (loc) saveTripLocation(loc, 'GPS real');
  registerLog('trip_start', `Início da viagem: ${direction.toUpperCase()} • Van ${person.vanNumber} • ${person.name}`, { direction, vanNumber: person.vanNumber, personName: person.name });
  persistState();
  upsertActiveTrip(state.currentTrip);
  startLocationWatch();
  renderTripScreen();
}

function recalcTrip() {
  const trip = state.currentTrip;
  if (!trip) return;
  trip.passengers.total = Math.max(0, (trip.passengers.full || 0) + (trip.passengers.luso || 0));
  trip.payments.total = Math.max(0, (trip.payments.cash || 0) + (trip.payments.pix || 0));
  trip.expectedTotal = (trip.passengers.full || 0) * Number(state.settings.fullFare) + (trip.passengers.luso || 0) * Number(state.settings.lusoFare);
  trip.difference = Number((trip.payments.total - trip.expectedTotal).toFixed(2));
  trip.pendingPhotos = dedupePending(trip.pendingPhotos || []);
  trip.suspiciousPhotos = (trip.photos || []).filter(p => p.suspicious);
}

function dedupePending(items) {
  const map = new Map();
  (items || []).forEach(item => map.set(item.pointId || item.id, item));
  return Array.from(map.values());
}

function renderTripScreen() {
  if (!state.currentTrip) return renderHome();
  state.lastScreen = 'trip';
  cleanupMaps();
  recalcTrip();
  const t = state.currentTrip;
  const diffKind = t.difference < 0 ? 'danger' : (t.difference > 0 ? 'warning' : 'ok');
  const diffText = t.difference < 0 ? `Falta receber ${currency(Math.abs(t.difference))}` : (t.difference > 0 ? `Sobra ${currency(t.difference)}` : 'Fechado');
  appEl.innerHTML = `
    <section class="card">
      <div class="meta">${badge(t.direction.toUpperCase(), 'real')} ${badge(`Van ${t.vanNumber}`, 'none')} ${locationBadge(t.lastLocation, t.estimatedLocation)}</div>
      <h2>${escapeHTML(t.personName)}</h2>
      <p class="muted">Início: ${fmtDateTime(t.startTime)}</p>
      <div class="grid four">
        <div class="kpi"><span>Passageiros</span><strong>${t.passengers.total}</strong></div>
        <div class="kpi"><span>Esperado</span><strong>${currency(t.expectedTotal)}</strong></div>
        <div class="kpi"><span>Recebido</span><strong>${currency(t.payments.total)}</strong></div>
        <div class="kpi"><span>Diferença</span><strong class="${diffKind}">${currency(t.difference)}</strong></div>
      </div>
      <p>${badge(diffText, diffKind)} ${badge(`${t.pendingPhotos.length} pendentes`, t.pendingPhotos.length ? 'danger' : 'ok')} ${badge(`${t.suspiciousPhotos.length} suspeitas`, t.suspiciousPhotos.length ? 'warning' : 'ok')}</p>
    </section>

    <section class="section-title"><h2>Passageiros</h2><span class="big-number">${t.passengers.total}</span></section>
    <section class="grid three">
      <div class="card kpi"><span>Inteiras</span><strong>${t.passengers.full}</strong><span>${currency(t.passengers.full * state.settings.fullFare)}</span></div>
      <div class="card kpi"><span>Luso</span><strong>${t.passengers.luso}</strong><span>${currency(t.passengers.luso * state.settings.lusoFare)}</span></div>
      <div class="card kpi"><span>Valor esperado</span><strong>${currency(t.expectedTotal)}</strong></div>
    </section>
    <div class="card" style="margin-top:12px">
      <h3>Adicionar passageiros inteiros</h3>
      <div class="counter-grid">${Array.from({length:10}, (_,i)=>`<button class="plus" data-add-passengers="${i+1}" type="button">+${i+1}</button>`).join('')}</div>
      <h3 style="margin-top:14px">Corrigir / remover</h3>
      <div class="counter-grid">${Array.from({length:10}, (_,i)=>`<button class="minus" data-remove-passengers="${i+1}" type="button">-${i+1}</button>`).join('')}</div>
    </div>

    <section class="section-title"><h2>Pagamentos</h2></section>
    <section class="grid four">
      <div class="card kpi"><span>Dinheiro</span><strong class="money">${currency(t.payments.cash)}</strong></div>
      <div class="card kpi"><span>Pix</span><strong class="pix">${currency(t.payments.pix)}</strong></div>
      <div class="card kpi"><span>Total recebido</span><strong>${currency(t.payments.total)}</strong></div>
      <div class="card kpi"><span>${diffText}</span><strong class="${diffKind}">${currency(t.difference)}</strong></div>
    </section>
    <div class="card" style="margin-top:12px">
      <h3>Passagem inteira (${currency(state.settings.fullFare)})</h3>
      <div class="payment-grid">
        <button class="money-btn" data-add-payment="cash:full" type="button">+1 dinheiro</button>
        <button class="pix-btn" data-add-payment="pix:full" type="button">+1 Pix</button>
        <button class="secondary" data-remove-payment="cash:full" type="button">-1 dinheiro</button>
        <button class="secondary" data-remove-payment="pix:full" type="button">-1 Pix</button>
      </div>
      <h3 style="margin-top:14px">Luso (${currency(state.settings.lusoFare)})</h3>
      <div class="payment-grid">
        <button class="money-btn" data-add-payment="cash:luso" type="button">+1 Luso dinheiro</button>
        <button class="pix-btn" data-add-payment="pix:luso" type="button">+1 Luso Pix</button>
        <button class="secondary" data-remove-payment="cash:luso" type="button">-1 Luso dinheiro</button>
        <button class="secondary" data-remove-payment="pix:luso" type="button">-1 Luso Pix</button>
      </div>
    </div>

    <section class="grid two" style="margin-top:12px">
      <button id="btnOpenLuso" class="warning" type="button">Registrar Luso</button>
      <button id="btnManualPhotoCheck" class="secondary" type="button">Verificar fotos/GPS</button>
    </section>

    <section class="grid two" style="margin-top:12px">
      <div class="card"><h3>Fotos pendentes</h3>${renderPendingList(t)}</div>
      <div class="card"><h3>Eventos do Luso</h3>${renderLusoEvents(t)}</div>
    </section>

    <section class="card" style="margin-top:12px">
      <h3>Últimos logs</h3>
      ${renderLogs(t.logs.slice(-8).reverse())}
    </section>

    <div class="footer-actions no-print">
      <button id="btnEndTrip" class="danger" type="button">Encerrar viagem</button>
      <button id="btnUpdateLocation" class="secondary" type="button">Atualizar GPS</button>
    </div>
  `;
  bindTripButtons();
}

function locationBadge(lastLocation, estimated) {
  if (lastLocation) return badge('GPS real', 'real');
  if (estimated) return badge('Localização estimada', 'estimated');
  return badge('Sem localização', 'none');
}

function renderPendingList(trip) {
  if (!trip.pendingPhotos.length) return '<p class="muted">Nenhuma pendência.</p>';
  return `<div class="list">${trip.pendingPhotos.map(p => `
    <div class="list-row report-danger"><strong>${escapeHTML(p.pointName)}</strong><span class="muted">${fmtDateTime(p.timestamp)} • ${escapeHTML(p.reason || 'Foto não registrada')}</span></div>`).join('')}</div>`;
}

function renderLusoEvents(trip) {
  if (!trip.lusoEvents.length) return '<p class="muted">Nenhum evento registrado.</p>';
  return `<div class="list">${trip.lusoEvents.slice(-5).reverse().map(e => `
    <div class="list-row"><strong>${e.qty} pessoa(s) • ${currency(e.expectedValue)}</strong><span class="muted">${fmtDateTime(e.timestamp)} • dinheiro ${currency(e.cashValue)} • Pix ${currency(e.pixValue)}</span></div>`).join('')}</div>`;
}

function renderLogs(logs) {
  if (!logs || !logs.length) return '<p class="muted">Sem logs.</p>';
  return `<div class="list">${logs.map(log => `<div class="list-row"><strong>${escapeHTML(log.message)}</strong><span class="muted">${fmtDateTime(log.timestamp)} • ${escapeHTML(log.type)}</span></div>`).join('')}</div>`;
}

function bindTripButtons() {
  $$('[data-add-passengers]').forEach(btn => btn.addEventListener('click', () => addPassengers(Number(btn.dataset.addPassengers))));
  $$('[data-remove-passengers]').forEach(btn => btn.addEventListener('click', () => removePassengers(Number(btn.dataset.removePassengers))));
  $$('[data-add-payment]').forEach(btn => btn.addEventListener('click', () => {
    const [method, fareType] = btn.dataset.addPayment.split(':'); addPayment(method, fareType);
  }));
  $$('[data-remove-payment]').forEach(btn => btn.addEventListener('click', () => {
    const [method, fareType] = btn.dataset.removePayment.split(':'); removePayment(method, fareType);
  }));
  $('#btnOpenLuso').addEventListener('click', openLusoModal);
  $('#btnManualPhotoCheck').addEventListener('click', async () => {
    const loc = await getCurrentLocation({ reason: 'verificação manual de pontos' });
    if (loc) saveTripLocation(loc, 'GPS real');
    checkPhotoPoints(loc);
    checkLusoProximity(loc);
    persistState();
    upsertActiveTrip(state.currentTrip);
    renderTripScreen();
  });
  $('#btnUpdateLocation').addEventListener('click', async () => {
    const loc = await getCurrentLocation({ reason: 'atualização manual de localização' });
    if (loc) {
      saveTripLocation(loc, 'GPS real');
      checkPhotoPoints(loc);
      checkLusoProximity(loc);
      persistState();
      upsertActiveTrip(state.currentTrip);
      renderTripScreen();
    }
  });
  $('#btnEndTrip').addEventListener('click', endTrip);
}

function addPassengers(qty) {
  const t = state.currentTrip;
  t.passengers.full += qty;
  registerLog('passenger_add', `Adicionados ${qty} passageiros inteiros`, { qty });
  recalcTrip(); persistState(); upsertActiveTrip(t); renderTripScreen();
}

function removePassengers(qty) {
  const t = state.currentTrip;
  const removed = Math.min(qty, t.passengers.full);
  if (removed <= 0) return showToast('Não há passageiros inteiros para remover.');
  t.passengers.full -= removed;
  registerLog('passenger_remove', `Removidos ${removed} passageiros inteiros`, { qty: removed });
  recalcTrip(); persistState(); upsertActiveTrip(t); renderTripScreen();
}

function addPayment(method, fareType) {
  const t = state.currentTrip;
  const value = fareType === 'luso' ? Number(state.settings.lusoFare) : Number(state.settings.fullFare);
  t.payments[method] = Number(((t.payments[method] || 0) + value).toFixed(2));
  const key = `${method}${fareType === 'luso' ? 'Luso' : 'Full'}Qty`;
  t.payments[key] = (t.payments[key] || 0) + 1;
  registerLog('payment_add', `Pagamento adicionado: 1 ${fareType === 'luso' ? 'Luso' : 'passagem inteira'} em ${method === 'cash' ? 'dinheiro' : 'Pix'}`, { method, fareType, value });
  recalcTrip(); persistState(); upsertActiveTrip(t); renderTripScreen();
}

function removePayment(method, fareType) {
  const t = state.currentTrip;
  const value = fareType === 'luso' ? Number(state.settings.lusoFare) : Number(state.settings.fullFare);
  const key = `${method}${fareType === 'luso' ? 'Luso' : 'Full'}Qty`;
  if ((t.payments[key] || 0) <= 0 || (t.payments[method] || 0) < value) return showToast('Não há pagamento desse tipo para remover.');
  t.payments[key] -= 1;
  t.payments[method] = Number(Math.max(0, t.payments[method] - value).toFixed(2));
  registerLog('payment_remove', `Pagamento removido: 1 ${fareType === 'luso' ? 'Luso' : 'passagem inteira'} em ${method === 'cash' ? 'dinheiro' : 'Pix'}`, { method, fareType, value });
  recalcTrip(); persistState(); upsertActiveTrip(t); renderTripScreen();
}

function openLusoModal() {
  const t = state.currentTrip;
  $('#lusoTitle').textContent = 'Registrar Luso';
  $('#lusoHelp').textContent = t.direction === 'ida'
    ? 'IDA: informe quantas pessoas desceram no Luso. O app converterá passagem inteira em Luso quando houver saldo suficiente.'
    : 'VOLTA: informe quantas pessoas entraram no Luso. Elas entram diretamente como tarifa Luso.';
  $('#lusoQty').value = 0; $('#lusoCashQty').value = 0; $('#lusoPixQty').value = 0; $('#lusoNotes').value = '';
  openModal('lusoModal');
}

async function saveLusoEvent() {
  const t = state.currentTrip;
  if (!t) return;
  const qty = clampInt($('#lusoQty').value);
  const cashQty = clampInt($('#lusoCashQty').value);
  const pixQty = clampInt($('#lusoPixQty').value);
  const notes = $('#lusoNotes').value.trim();
  if (qty <= 0) return showToast('Informe a quantidade de pessoas.');
  if (cashQty + pixQty > qty) return showToast('Pagamentos do Luso não podem passar da quantidade de pessoas.');
  if (t.direction === 'ida') {
    if (t.passengers.full < qty) return showToast('Não há passageiros inteiros suficientes para converter em Luso.');
    t.passengers.full -= qty;
    t.passengers.luso += qty;
  } else {
    t.passengers.luso += qty;
  }
  const loc = await getCurrentLocation({ reason: 'registro do Luso', silent: true });
  if (loc) saveTripLocation(loc, 'GPS real');
  const expectedValue = Number((qty * Number(state.settings.lusoFare)).toFixed(2));
  const cashValue = Number((cashQty * Number(state.settings.lusoFare)).toFixed(2));
  const pixValue = Number((pixQty * Number(state.settings.lusoFare)).toFixed(2));
  t.payments.cash = Number((t.payments.cash + cashValue).toFixed(2));
  t.payments.pix = Number((t.payments.pix + pixValue).toFixed(2));
  t.payments.cashLusoQty = (t.payments.cashLusoQty || 0) + cashQty;
  t.payments.pixLusoQty = (t.payments.pixLusoQty || 0) + pixQty;
  const event = {
    id: uuid('luso'), timestamp: nowISO(), date: new Date().toISOString().slice(0,10), direction: t.direction,
    qty, expectedValue, cashQty, cashValue, pixQty, pixValue,
    lat: loc?.lat ?? null, lng: loc?.lng ?? null, accuracy: loc?.accuracy ?? null,
    locationOrigin: loc ? 'GPS real' : 'indisponível', notes,
  };
  t.lusoEvents.push(event);
  registerLog('luso_event', `Evento Luso registrado: ${qty} pessoa(s), ${currency(expectedValue)}`, event);
  recalcTrip(); persistState(); upsertActiveTrip(t); closeModal('lusoModal'); renderTripScreen();
}

async function getCurrentLocation(options = {}) {
  const { reason = 'localização', silent = false } = options;
  if (!navigator.geolocation) {
    if (!silent) showToast('Este navegador não tem suporte a GPS.');
    return null;
  }
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: nowISO(),
          origin: 'GPS real',
          reason,
        };
        if (!silent) showToast(`GPS atualizado: precisão ~${Math.round(loc.accuracy || 0)}m.`);
        resolve(loc);
      },
      err => {
        const msg = err.code === err.PERMISSION_DENIED ? 'GPS negado pelo usuário.' : err.code === err.TIMEOUT ? 'GPS demorou demais para responder.' : 'GPS indisponível.';
        if (!silent) showToast(msg);
        if (state.currentTrip) registerLog('location_error', `${msg} Motivo: ${reason}`, { code: err.code, message: err.message });
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  });
}

function startLocationWatch() {
  if (!navigator.geolocation || state.watchId !== null) return;
  try {
    state.watchId = navigator.geolocation.watchPosition(pos => {
      if (!state.currentTrip || state.currentTrip.status !== 'em andamento') return;
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, timestamp: nowISO(), origin: 'GPS real', reason: 'watchPosition' };
      saveTripLocation(loc, 'GPS real');
      checkPhotoPoints(loc);
      checkLusoProximity(loc);
      persistState(); upsertActiveTrip(state.currentTrip);
      if (state.lastScreen === 'trip') renderTripScreen();
    }, err => {
      if (state.currentTrip) registerLog('location_error', `Falha no acompanhamento GPS: ${err.message}`, { code: err.code });
    }, { enableHighAccuracy: true, maximumAge: 20000, timeout: 15000 });
  } catch (err) { console.warn(err); }
}

function stopLocationWatch() {
  if (navigator.geolocation && state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;
}

function saveTripLocation(loc, origin = 'GPS real') {
  const t = state.currentTrip;
  if (!t || !loc) return;
  const item = { ...loc, origin, vanNumber: t.vanNumber, tripId: t.id, personName: t.personName };
  t.locations.push(item);
  if (t.locations.length > 400) t.locations = t.locations.slice(-400);
  t.lastLocation = item;
  t.locationOrigin = origin;
  registerLog('location_update', `Localização atualizada (${origin})`, { lat: item.lat, lng: item.lng, accuracy: item.accuracy });
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function directionMatches(pointDirection, tripDirection) {
  return pointDirection === 'ambos' || pointDirection === tripDirection;
}

function checkPhotoPoints(loc) {
  const t = state.currentTrip;
  if (!t || !loc) return;
  const points = state.points.filter(p => p.active !== false && p.required !== false && directionMatches(p.direction, t.direction));
  points.forEach(point => {
    if (!validCoord(point.lat, point.lng)) return;
    const distance = calculateDistance(loc.lat, loc.lng, Number(point.lat), Number(point.lng));
    const alreadyPhoto = t.photos.some(photo => photo.pointId === point.id);
    const alreadyPending = t.pendingPhotos.some(p => p.pointId === point.id);
    if (distance <= Number(point.radiusMeters || 80) && !alreadyPhoto && !alreadyPending) {
      triggerPhotoAlert(point, distance, loc);
    }
  });
}

function triggerPhotoAlert(point, distance, loc) {
  state.pendingPhotoPoint = { ...point, currentDistance: distance, currentLocation: loc };
  $('#photoAlertText').textContent = `Você chegou ao ponto ${point.name}. Tire a foto obrigatória.`;
  $('#photoDistance').textContent = `Distância aproximada: ${Math.round(distance)}m. Raio permitido: ${point.radiusMeters || 80}m.`;
  vibratePhotoAlert();
  registerLog('photo_alert', `Alerta de foto gerado: ${point.name}`, { pointId: point.id, distance, location: loc });
  openModal('photoModal');
}

function vibratePhotoAlert() {
  if ('vibrate' in navigator) {
    try { navigator.vibrate([300, 150, 300, 150, 500]); } catch {}
  }
}

function markPhotoPending(point, reason = 'Foto obrigatória não registrada') {
  const t = state.currentTrip;
  if (!t) return;
  const pending = {
    id: uuid('pending'), pointId: point.id, pointName: point.name,
    timestamp: nowISO(), direction: t.direction, vanNumber: t.vanNumber, personName: t.personName,
    reason, justified: false, justification: '', justifiedBy: '', justifiedAt: null,
  };
  t.pendingPhotos = dedupePending([...(t.pendingPhotos || []), pending]);
}

async function capturePhoto(event) {
  const file = event.target.files?.[0];
  if (!file || !state.currentTrip || !state.pendingPhotoPoint) return;
  const point = state.pendingPhotoPoint;
  const loc = await getCurrentLocation({ reason: 'captura de foto', silent: true });
  if (loc) saveTripLocation(loc, 'GPS real');
  const previewBase64 = await resizeImageToBase64(file, 900, 0.74);
  let distance = null;
  let suspicious = false;
  let reason = '';
  if (!loc) {
    suspicious = true; reason = 'GPS indisponível no momento da foto.';
  } else if (!validCoord(point.lat, point.lng)) {
    suspicious = true; reason = 'Ponto sem coordenadas válidas.';
  } else {
    distance = calculateDistance(loc.lat, loc.lng, Number(point.lat), Number(point.lng));
    if (distance > Number(point.radiusMeters || 80)) { suspicious = true; reason = `Foto fora do raio permitido (${Math.round(distance)}m).`; }
    else if (Number(loc.accuracy || 0) > Number(state.settings.lowAccuracyThreshold || 100)) { suspicious = true; reason = `Precisão baixa do GPS (${Math.round(loc.accuracy)}m).`; }
  }
  const photo = {
    id: uuid('photo'), pointId: point.id, pointName: point.name,
    timestamp: nowISO(), lat: loc?.lat ?? null, lng: loc?.lng ?? null, accuracy: loc?.accuracy ?? null,
    distanceMeters: distance, direction: state.currentTrip.direction, vanNumber: state.currentTrip.vanNumber,
    personName: state.currentTrip.personName, status: suspicious ? 'foto suspeita' : 'foto registrada', suspicious, reason, previewBase64,
  };
  state.currentTrip.photos.push(photo);
  state.currentTrip.pendingPhotos = (state.currentTrip.pendingPhotos || []).filter(p => p.pointId !== point.id);
  if (suspicious) state.currentTrip.suspiciousPhotos.push(photo);
  registerLog(suspicious ? 'photo_suspicious' : 'photo_saved', suspicious ? `Foto suspeita registrada: ${point.name}` : `Foto registrada: ${point.name}`, photo);
  event.target.value = '';
  state.pendingPhotoPoint = null;
  recalcTrip(); persistState(); upsertActiveTrip(state.currentTrip); closeModal('photoModal'); renderTripScreen();
}

function resizeImageToBase64(file, maxSide = 900, quality = .75) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(String(reader.result || ''));
      img.src = reader.result;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

function checkLusoProximity(loc) {
  const t = state.currentTrip;
  const p = state.lusoPoint;
  if (!t || !loc || !p || p.active === false || !validCoord(p.lat, p.lng)) return;
  const distance = calculateDistance(loc.lat, loc.lng, Number(p.lat), Number(p.lng));
  if (distance <= Number(p.radiusMeters || 100)) {
    const recent = (t.logs || []).some(log => log.type === 'luso_suggestion' && Date.now() - new Date(log.timestamp).getTime() < 10 * 60 * 1000);
    if (!recent) {
      registerLog('luso_suggestion', `Sugestão de registro do Luso: ${p.name}`, { distance, point: p });
      showToast('Você chegou ao Luso. Use “Registrar Luso” se houver movimentação.', 4500);
    }
  }
}

function endTrip() {
  if (!state.currentTrip) return;
  state.currentTrip.status = 'encerrada';
  state.currentTrip.endTime = nowISO();
  recalcTrip();
  registerLog('trip_end', `Viagem encerrada para conferência: Van ${state.currentTrip.vanNumber}`, { endTime: state.currentTrip.endTime });
  state.reportDraft = structuredCloneSafe(state.currentTrip);
  persistState(); removeActiveTrip(state.currentTrip.id); stopLocationWatch(); renderReport(state.currentTrip, { beforeSave: true });
}

function continueTrip() {
  if (!state.currentTrip) return;
  state.currentTrip.status = 'em andamento';
  state.currentTrip.endTime = null;
  registerLog('trip_continue', 'Viagem reaberta para continuar o trajeto', {});
  persistState(); upsertActiveTrip(state.currentTrip); startLocationWatch(); renderTripScreen();
}

function saveTrip() {
  const t = state.currentTrip;
  if (!t) return;
  t.status = 'salva';
  t.saved = true;
  if (!t.endTime) t.endTime = nowISO();
  registerLog('trip_saved', `Viagem salva: Van ${t.vanNumber} • ${t.personName}`, { savedAt: nowISO() });
  recalcTrip();
  state.trips.unshift(structuredCloneSafe(t));
  state.currentTrip = null;
  state.reportDraft = null;
  persistState(); removeActiveTrip(t.id); stopLocationWatch(); showToast('Viagem salva no histórico.'); renderHistory();
}

function renderReport(trip, options = {}) {
  cleanupMaps();
  const { beforeSave = false } = options;
  recalcTripLike(trip);
  const diffAlert = trip.difference < 0 ? 'Há diferença: falta receber.' : trip.difference > 0 ? 'Há sobra no valor recebido.' : 'Valores conferidos.';
  const diffKind = trip.difference === 0 ? 'report-ok' : 'report-warning';
  appEl.innerHTML = `
    <article class="report-print">
      <section class="card">
        <h1>Controle de Van</h1>
        <p class="muted">Relatório ${beforeSave ? 'antes de salvar' : 'detalhado'} • ID ${escapeHTML(trip.id)}</p>
        <div class="meta">${badge(trip.status, trip.status === 'salva' ? 'ok' : 'warning')} ${badge(`Van ${trip.vanNumber}`, 'none')} ${badge(trip.direction.toUpperCase(), 'real')}</div>
      </section>
      <section class="grid three" style="margin-top:12px">
        <div class="card kpi"><span>Responsável</span><strong>${escapeHTML(trip.personName)}</strong></div>
        <div class="card kpi"><span>Início</span><strong>${fmtTime(trip.startTime)}</strong><span>${fmtDate(trip.startTime)}</span></div>
        <div class="card kpi"><span>Fim</span><strong>${fmtTime(trip.endTime)}</strong><span>${fmtDate(trip.endTime)}</span></div>
      </section>
      <section class="grid four" style="margin-top:12px">
        <div class="card kpi"><span>Passageiros</span><strong>${trip.passengers.total}</strong></div>
        <div class="card kpi"><span>Esperado</span><strong>${currency(trip.expectedTotal)}</strong></div>
        <div class="card kpi"><span>Recebido</span><strong>${currency(trip.payments.total)}</strong></div>
        <div class="card kpi"><span>Diferença</span><strong>${currency(trip.difference)}</strong></div>
      </section>
      <section class="card ${diffKind}" style="margin-top:12px"><strong>${diffAlert}</strong></section>
      ${trip.pendingPhotos?.length ? `<section class="card report-danger" style="margin-top:12px"><strong>Existem fotos pendentes.</strong></section>` : ''}
      ${trip.suspiciousPhotos?.length ? `<section class="card report-warning" style="margin-top:12px"><strong>Existem fotos suspeitas.</strong></section>` : ''}
      <section class="grid two" style="margin-top:12px">
        <div class="card"><h2>Passageiros</h2><p>Inteiras: <strong>${trip.passengers.full}</strong></p><p>Luso: <strong>${trip.passengers.luso}</strong></p></div>
        <div class="card"><h2>Pagamentos</h2><p>Dinheiro: <strong>${currency(trip.payments.cash)}</strong></p><p>Pix: <strong>${currency(trip.payments.pix)}</strong></p></div>
      </section>
      <section class="card" style="margin-top:12px"><h2>Fotos obrigatórias</h2>${renderPhotosReport(trip)}</section>
      <section class="card" style="margin-top:12px"><h2>Eventos do Luso</h2>${renderLusoReport(trip)}</section>
      <section class="card" style="margin-top:12px"><h2>Localização</h2>${renderLocationReport(trip)}</section>
      <section class="card" style="margin-top:12px"><h2>Logs</h2>${renderLogs(trip.logs || [])}</section>
    </article>
    <div class="footer-actions no-print">
      ${beforeSave ? '<button id="btnSaveTrip" class="primary" type="button">Salvar viagem</button><button id="btnContinueTrip" class="secondary" type="button">Voltar/continuar</button>' : '<button id="btnBackHistory" class="secondary" type="button">Voltar</button>'}
      <button id="btnExportJSON" class="secondary" type="button">Exportar JSON</button>
      <button id="btnExportPDF" class="secondary" type="button">Exportar PDF</button>
    </div>
  `;
  const save = $('#btnSaveTrip'); if (save) save.addEventListener('click', saveTrip);
  const cont = $('#btnContinueTrip'); if (cont) cont.addEventListener('click', continueTrip);
  const back = $('#btnBackHistory'); if (back) back.addEventListener('click', renderHistory);
  $('#btnExportJSON').addEventListener('click', () => exportJSON(trip));
  $('#btnExportPDF').addEventListener('click', () => exportPDF(trip));
}

function recalcTripLike(trip) {
  trip.passengers.total = (trip.passengers.full || 0) + (trip.passengers.luso || 0);
  trip.payments.total = (trip.payments.cash || 0) + (trip.payments.pix || 0);
  const fullFare = trip.settingsSnapshot?.fullFare ?? state.settings.fullFare;
  const lusoFare = trip.settingsSnapshot?.lusoFare ?? state.settings.lusoFare;
  trip.expectedTotal = (trip.passengers.full || 0) * fullFare + (trip.passengers.luso || 0) * lusoFare;
  trip.difference = Number((trip.payments.total - trip.expectedTotal).toFixed(2));
  trip.pendingPhotos = dedupePending(trip.pendingPhotos || []);
  trip.suspiciousPhotos = (trip.photos || []).filter(p => p.suspicious);
}

function renderPhotosReport(trip) {
  const photos = trip.photos || [];
  const pending = trip.pendingPhotos || [];
  if (!photos.length && !pending.length) return '<p class="muted">Sem fotos ou pendências registradas.</p>';
  return `<div class="list">
    ${photos.map(p => `<div class="list-row ${p.suspicious ? 'report-warning' : 'report-ok'}"><header><h3>${escapeHTML(p.pointName)}</h3>${badge(p.status, p.suspicious ? 'warning' : 'ok')}</header><p class="muted">${fmtDateTime(p.timestamp)} • distância: ${p.distanceMeters == null ? '-' : Math.round(p.distanceMeters)+'m'} • ${escapeHTML(p.reason || 'Dentro dos critérios')}</p>${p.previewBase64 ? `<img src="${p.previewBase64}" alt="Foto do ponto ${escapeHTML(p.pointName)}" style="max-width:180px;border-radius:12px;border:1px solid var(--border)" />` : ''}</div>`).join('')}
    ${pending.map(p => `<div class="list-row report-danger"><header><h3>${escapeHTML(p.pointName)}</h3>${badge(p.justified ? 'pendência justificada' : 'pendente', p.justified ? 'warning' : 'danger')}</header><p class="muted">${fmtDateTime(p.timestamp)} • ${escapeHTML(p.reason || '')}</p>${p.justified ? `<p><strong>Justificativa:</strong> ${escapeHTML(p.justification)}<br><span class="muted">Por ${escapeHTML(p.justifiedBy)} em ${fmtDateTime(p.justifiedAt)}</span></p>` : ''}</div>`).join('')}
  </div>`;
}

function renderLusoReport(trip) {
  if (!trip.lusoEvents?.length) return '<p class="muted">Nenhum evento do Luso registrado.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Data/hora</th><th>Sentido</th><th>Pessoas</th><th>Esperado</th><th>Dinheiro</th><th>Pix</th><th>Localização</th></tr></thead><tbody>${trip.lusoEvents.map(e => `<tr><td>${fmtDateTime(e.timestamp)}</td><td>${escapeHTML(e.direction)}</td><td>${e.qty}</td><td>${currency(e.expectedValue)}</td><td>${currency(e.cashValue)}</td><td>${currency(e.pixValue)}</td><td>${e.lat ? `${Number(e.lat).toFixed(5)}, ${Number(e.lng).toFixed(5)}` : escapeHTML(e.locationOrigin)}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderLocationReport(trip) {
  const est = estimateVanLocation(trip);
  return `
    <p><strong>Última localização real:</strong> ${trip.lastLocation ? `${Number(trip.lastLocation.lat).toFixed(6)}, ${Number(trip.lastLocation.lng).toFixed(6)} • precisão ${Math.round(trip.lastLocation.accuracy || 0)}m • ${fmtDateTime(trip.lastLocation.timestamp)}` : 'não disponível'}</p>
    <p><strong>Localização estimada:</strong> ${est?.lat ? `${Number(est.lat).toFixed(6)}, ${Number(est.lng).toFixed(6)} • confiança ${escapeHTML(est.confidence)}` : 'não disponível'}</p>
    <p class="small-note">A estimativa é aproximada e não substitui rastreamento em tempo real.</p>
  `;
}

function exportJSON(trip) {
  registerLogSafe(trip, 'export_json', 'Exportação JSON solicitada', {});
  const data = JSON.stringify(trip, null, 2);
  const fileName = `controle-van-viagem-${trip.date || new Date().toISOString().slice(0,10)}-van-${sanitizeFileName(trip.vanNumber)}.json`;
  try {
    const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast('JSON gerado.');
  } catch {
    navigator.clipboard?.writeText(data);
    showToast('Download bloqueado. JSON copiado/mostrado no navegador.');
    appEl.insertAdjacentHTML('beforeend', `<section class="card no-print"><h2>JSON copiável</h2><textarea rows="12">${escapeHTML(data)}</textarea></section>`);
  }
}

function exportPDF(trip) {
  registerLogSafe(trip, 'export_pdf', 'Exportação PDF solicitada', {});
  showToast('Na janela de impressão, escolha “Salvar como PDF”.');
  window.print();
}

function sanitizeFileName(value) { return String(value || 'sem-van').replace(/[^a-z0-9_-]+/gi, '-'); }

function registerLog(type, message, data = {}) {
  if (!state.currentTrip) return;
  state.currentTrip.logs.push({ id: uuid('log'), timestamp: nowISO(), type, message, data });
}

function registerLogSafe(trip, type, message, data = {}) {
  if (!trip) return;
  trip.logs = trip.logs || [];
  trip.logs.push({ id: uuid('log'), timestamp: nowISO(), type, message, data });
  if (state.currentTrip && state.currentTrip.id === trip.id) persistState();
}

function renderHistory() {
  state.lastScreen = 'history';
  cleanupMaps();
  const trips = state.trips || [];
  appEl.innerHTML = `
    <section class="section-title"><h2>Histórico de Viagens</h2><button id="btnExportBackup" class="secondary small" type="button">Backup</button></section>
    <section class="card">
      <label>Filtro rápido
        <input id="historyFilter" placeholder="Data, van, responsável, sentido..." />
      </label>
      <div id="historyList">${renderHistoryList(trips)}</div>
    </section>
  `;
  $('#historyFilter').addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    const filtered = trips.filter(t => JSON.stringify({ date:t.date, van:t.vanNumber, person:t.personName, direction:t.direction, status:t.status }).toLowerCase().includes(q));
    $('#historyList').innerHTML = renderHistoryList(filtered);
    bindHistoryItems();
  });
  $('#btnExportBackup').addEventListener('click', exportBackup);
  bindHistoryItems();
}

function renderHistoryList(trips) {
  if (!trips.length) return '<p class="muted">Nenhuma viagem salva ainda.</p>';
  return `<div class="list">${trips.map(t => {
    recalcTripLike(t);
    return `<button class="list-row" data-open-trip="${t.id}" type="button">
      <header><h3>Van ${escapeHTML(t.vanNumber)} • ${escapeHTML(t.personName)}</h3>${badge(t.direction.toUpperCase(), 'real')}</header>
      <div class="meta"><span>${fmtDate(t.startTime)} ${fmtTime(t.startTime)}–${fmtTime(t.endTime)}</span><span>${t.passengers.total} passageiros</span><span>${currency(t.expectedTotal)} esperado</span><span>${currency(t.payments.total)} recebido</span><span>${t.pendingPhotos.length} pendências</span><span>${t.suspiciousPhotos.length} suspeitas</span></div>
    </button>`;
  }).join('')}</div>`;
}

function bindHistoryItems() {
  $$('[data-open-trip]').forEach(btn => btn.addEventListener('click', () => {
    const trip = state.trips.find(t => t.id === btn.dataset.openTrip);
    if (trip) renderReport(structuredCloneSafe(trip), { beforeSave: false });
  }));
}

function exportBackup() {
  const data = JSON.stringify({ exportedAt: nowISO(), version: 1, data: { settings: state.settings, people: state.people, vans: state.vans, points: state.points, lusoPoint: state.lusoPoint, trips: state.trips, adminLogs: state.adminLogs } }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `controle-van-backup-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function renderAdminLogin() {
  state.lastScreen = 'adminLogin';
  cleanupMaps();
  if (state.adminLogged) return renderAdmin();
  appEl.innerHTML = `
    <section class="section-title"><h2>Área do Administrador</h2></section>
    <section class="card">
      <p class="muted">Acesso local por PIN. Senha padrão: 1234.</p>
      <label>PIN administrativo
        <input id="adminPin" type="password" inputmode="numeric" autocomplete="current-password" />
      </label>
      <button id="btnLoginAdmin" class="primary full" type="button">Entrar</button>
    </section>
  `;
  $('#btnLoginAdmin').addEventListener('click', adminLogin);
  $('#adminPin').addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });
}

function adminLogin() {
  const pin = $('#adminPin').value;
  if (pin === String(state.settings.adminPin)) {
    state.adminLogged = true;
    showToast('Administrador autenticado.');
    renderAdmin();
  } else showToast('PIN incorreto.');
}

function renderAdmin(tab = state.adminTab) {
  state.adminTab = tab;
  state.lastScreen = 'admin';
  cleanupMaps();
  appEl.innerHTML = `
    <section class="section-title"><h2>Administrador</h2><button id="btnAdminLogout" class="ghost small" type="button">Sair</button></section>
    <nav class="tabs no-print">
      ${[
        ['dashboard','Painel'], ['people','Pessoas'], ['vans','Vans'], ['settings','Valores'], ['points','Pontos de Foto'], ['luso','Ponto Luso'], ['fleet','Localização das Vans'], ['reports','Relatórios/Logs']
      ].map(([key,label]) => `<button class="${tab===key?'active':''}" data-admin-tab="${key}" type="button">${label}</button>`).join('')}
    </nav>
    <div id="adminContent"></div>
  `;
  $('#btnAdminLogout').addEventListener('click', () => { state.adminLogged = false; renderHome(); });
  $$('[data-admin-tab]').forEach(btn => btn.addEventListener('click', () => renderAdmin(btn.dataset.adminTab)));
  const renderers = { dashboard: renderAdminDashboard, people: renderAdminPeople, vans: renderAdminVans, settings: renderAdminSettings, points: renderAdminPoints, luso: renderAdminLuso, fleet: renderFleetPanel, reports: renderAdminReports };
  renderers[tab]?.();
}

function adminContent(html) { $('#adminContent').innerHTML = html; }

function renderAdminDashboard() {
  const active = getActiveTripsForPanel();
  const saved = state.trips.length;
  const passengers = state.trips.reduce((sum, t) => sum + (t.passengers?.total || 0), 0);
  const expected = state.trips.reduce((sum, t) => sum + (t.expectedTotal || 0), 0);
  adminContent(`
    <section class="grid four">
      <div class="card kpi"><span>Viagens em andamento</span><strong>${active.length}</strong></div>
      <div class="card kpi"><span>Viagens salvas</span><strong>${saved}</strong></div>
      <div class="card kpi"><span>Passageiros salvos</span><strong>${passengers}</strong></div>
      <div class="card kpi"><span>Esperado salvo</span><strong>${currency(expected)}</strong></div>
    </section>
    <section class="card" style="margin-top:12px"><h2>Avisos</h2><p class="small-note">Este app local não substitui backend. O painel das vans mostra apenas dados disponíveis neste navegador/localStorage. Para celulares diferentes em tempo real, é necessário servidor ou nuvem.</p></section>
  `);
}

function renderAdminPeople() {
  adminContent(`
    <section class="grid two">
      <form id="personForm" class="card">
        <h2>Cadastrar pessoa</h2>
        <input type="hidden" id="personId" />
        <label>Nome<input id="personName" required /></label>
        <label>Número da van<input id="personVan" required /></label>
        <label>Telefone opcional<input id="personPhone" /></label>
        <label>Status<select id="personStatus"><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></label>
        <label>Observação<textarea id="personNotes" rows="2"></textarea></label>
        <button class="primary full" type="submit">Salvar pessoa</button>
      </form>
      <section class="card"><h2>Pessoas cadastradas</h2><div class="list">${state.people.map(renderPersonRow).join('') || '<p class="muted">Nenhuma pessoa cadastrada.</p>'}</div></section>
    </section>
  `);
  $('#personForm').addEventListener('submit', e => { e.preventDefault(); savePerson(); });
  $$('[data-edit-person]').forEach(btn => btn.addEventListener('click', () => fillPersonForm(btn.dataset.editPerson)));
}

function renderPersonRow(p) {
  return `<div class="list-row"><header><h3>${escapeHTML(p.name)}</h3>${badge(p.status || 'ativo', p.status === 'inativo' ? 'none' : 'ok')}</header><div class="meta"><span>Van ${escapeHTML(p.vanNumber)}</span><span>${escapeHTML(p.phone || 'sem telefone')}</span></div><button class="secondary small" data-edit-person="${p.id}" type="button">Editar</button></div>`;
}

function fillPersonForm(id) {
  const p = state.people.find(x => x.id === id); if (!p) return;
  $('#personId').value = p.id; $('#personName').value = p.name; $('#personVan').value = p.vanNumber; $('#personPhone').value = p.phone || ''; $('#personStatus').value = p.status || 'ativo'; $('#personNotes').value = p.notes || '';
}

function savePerson() {
  const id = $('#personId').value || uuid('person');
  const person = { id, name: $('#personName').value.trim(), vanNumber: $('#personVan').value.trim(), phone: $('#personPhone').value.trim(), status: $('#personStatus').value, notes: $('#personNotes').value.trim() };
  if (!person.name || !person.vanNumber) return showToast('Informe nome e van.');
  const i = state.people.findIndex(p => p.id === id);
  if (i >= 0) { state.people[i] = person; adminSystemLog('person_edit', `Pessoa editada: ${person.name}`); }
  else { state.people.push(person); adminSystemLog('person_create', `Pessoa cadastrada: ${person.name}`); }
  if (!state.vans.some(v => String(v.number) === String(person.vanNumber))) state.vans.push({ id: uuid('van'), number: person.vanNumber, plate: '', linkedPersonId: person.id, status: 'ativa', notes: 'Criada automaticamente pelo cadastro de pessoa.' });
  persistState(); renderAdmin('people');
}

function renderAdminVans() {
  adminContent(`
    <section class="grid two">
      <form id="vanForm" class="card">
        <h2>Cadastrar van</h2>
        <input type="hidden" id="vanId" />
        <label>Número da van<input id="vanNumber" required /></label>
        <label>Placa opcional<input id="vanPlate" /></label>
        <label>Responsável vinculado<select id="vanLinked"><option value="">Nenhum</option>${state.people.map(p => `<option value="${p.id}">${escapeHTML(p.name)} — Van ${escapeHTML(p.vanNumber)}</option>`).join('')}</select></label>
        <label>Status<select id="vanStatus"><option value="ativa">Ativa</option><option value="inativa">Inativa</option></select></label>
        <label>Observação<textarea id="vanNotes" rows="2"></textarea></label>
        <button class="primary full" type="submit">Salvar van</button>
      </form>
      <section class="card"><h2>Vans cadastradas</h2><div class="list">${state.vans.map(renderVanRow).join('') || '<p class="muted">Nenhuma van cadastrada.</p>'}</div></section>
    </section>
  `);
  $('#vanForm').addEventListener('submit', e => { e.preventDefault(); saveVan(); });
  $$('[data-edit-van]').forEach(btn => btn.addEventListener('click', () => fillVanForm(btn.dataset.editVan)));
}

function renderVanRow(v) {
  const person = state.people.find(p => p.id === v.linkedPersonId);
  return `<div class="list-row"><header><h3>Van ${escapeHTML(v.number)}</h3>${badge(v.status || 'ativa', v.status === 'inativa' ? 'none' : 'ok')}</header><div class="meta"><span>${escapeHTML(v.plate || 'sem placa')}</span><span>${escapeHTML(person?.name || 'sem responsável fixo')}</span></div><button class="secondary small" data-edit-van="${v.id}" type="button">Editar</button></div>`;
}

function fillVanForm(id) {
  const v = state.vans.find(x => x.id === id); if (!v) return;
  $('#vanId').value = v.id; $('#vanNumber').value = v.number; $('#vanPlate').value = v.plate || ''; $('#vanLinked').value = v.linkedPersonId || ''; $('#vanStatus').value = v.status || 'ativa'; $('#vanNotes').value = v.notes || '';
}

function saveVan() {
  const id = $('#vanId').value || uuid('van');
  const van = { id, number: $('#vanNumber').value.trim(), plate: $('#vanPlate').value.trim(), linkedPersonId: $('#vanLinked').value, status: $('#vanStatus').value, notes: $('#vanNotes').value.trim() };
  if (!van.number) return showToast('Informe o número da van.');
  const i = state.vans.findIndex(v => v.id === id);
  if (i >= 0) { state.vans[i] = van; adminSystemLog('van_edit', `Van editada: ${van.number}`); }
  else { state.vans.push(van); adminSystemLog('van_create', `Van cadastrada: ${van.number}`); }
  persistState(); renderAdmin('vans');
}

function renderAdminSettings() {
  adminContent(`
    <form id="settingsForm" class="card">
      <h2>Valores e segurança</h2>
      <label>Valor da passagem inteira<input id="setFullFare" type="number" step="0.01" min="0" value="${state.settings.fullFare}" /></label>
      <label>Valor da passagem Luso<input id="setLusoFare" type="number" step="0.01" min="0" value="${state.settings.lusoFare}" /></label>
      <label>PIN administrativo<input id="setAdminPin" type="password" value="${escapeHTML(state.settings.adminPin)}" /></label>
      <label>Chave da API Google Maps opcional<input id="setGoogleKey" value="${escapeHTML(state.settings.googleMapsKey || '')}" placeholder="Opcional; Leaflet/OpenStreetMap funciona sem chave" /></label>
      <label>Precisão máxima do GPS antes de marcar foto suspeita (m)<input id="setAccuracy" type="number" min="10" value="${state.settings.lowAccuracyThreshold || 100}" /></label>
      <button class="primary full" type="submit">Salvar configurações</button>
      <p class="small-note">A senha é salva em localStorage nesta versão. Para segurança real, use backend e autenticação.</p>
    </form>
  `);
  $('#settingsForm').addEventListener('submit', e => { e.preventDefault(); saveSettings(); });
}

function saveSettings() {
  state.settings.fullFare = toNumber($('#setFullFare').value);
  state.settings.lusoFare = toNumber($('#setLusoFare').value);
  state.settings.adminPin = $('#setAdminPin').value || '1234';
  state.settings.googleMapsKey = $('#setGoogleKey').value.trim();
  state.settings.lowAccuracyThreshold = Math.max(10, Number($('#setAccuracy').value || 100));
  adminSystemLog('settings_edit', 'Valores/senha administrativa alterados');
  persistState(); showToast('Configurações salvas.'); renderAdmin('settings');
}

function renderAdminPoints() {
  adminContent(`
    <section class="grid two">
      <form id="pointForm" class="card">
        <h2>Ponto de Foto</h2>
        <input type="hidden" id="pointId" />
        <label>Nome do ponto<input id="pointName" required /></label>
        <div class="grid two"><label>Latitude<input id="pointLat" type="number" step="any" /></label><label>Longitude<input id="pointLng" type="number" step="any" /></label></div>
        <div class="row-actions"><button id="btnUseCurrentForPoint" class="secondary" type="button">Usar minha localização atual</button></div>
        <div id="pointMap" class="map" style="margin:12px 0"></div>
        <label>Raio de tolerância (m)<input id="pointRadius" type="number" min="5" value="80" /></label>
        <label>Sentido<select id="pointDirection"><option value="ida">Ida</option><option value="volta">Volta</option><option value="ambos">Ambos</option></select></label>
        <label>Obrigatório<select id="pointRequired"><option value="true">Sim</option><option value="false">Não</option></select></label>
        <label>Ordem no trajeto<input id="pointOrder" type="number" min="0" value="1" /></label>
        <label>Status<select id="pointActive"><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
        <label>Observação<textarea id="pointNotes" rows="2"></textarea></label>
        <button class="primary full" type="submit">Salvar ponto</button>
      </form>
      <section class="card"><h2>Pontos cadastrados</h2><div class="list">${state.points.sort((a,b)=>(a.order||0)-(b.order||0)).map(renderPointRow).join('') || '<p class="muted">Nenhum ponto cadastrado.</p>'}</div></section>
    </section>
  `);
  $('#pointForm').addEventListener('submit', e => { e.preventDefault(); savePoint(); });
  $('#btnUseCurrentForPoint').addEventListener('click', async () => {
    const loc = await getCurrentLocation({ reason: 'configuração de ponto' });
    if (loc) setPointFormCoords(loc.lat, loc.lng);
  });
  $$('[data-edit-point]').forEach(btn => btn.addEventListener('click', () => fillPointForm(btn.dataset.editPoint)));
  $$('[data-delete-point]').forEach(btn => btn.addEventListener('click', async () => deletePoint(btn.dataset.deletePoint)));
  initPointMap('pointMap', 'pointLat', 'pointLng');
}

function renderPointRow(p) {
  return `<div class="list-row"><header><h3>${escapeHTML(p.name)}</h3>${badge(p.active === false ? 'inativo' : 'ativo', p.active === false ? 'none' : 'ok')}</header><div class="meta"><span>${escapeHTML(p.direction)}</span><span>raio ${p.radiusMeters || 80}m</span><span>ordem ${p.order || 0}</span><span>${p.required === false ? 'opcional' : 'obrigatório'}</span></div><div class="row-actions"><button class="secondary small" data-edit-point="${p.id}" type="button">Editar</button><button class="danger small" data-delete-point="${p.id}" type="button">Remover</button></div></div>`;
}

function fillPointForm(id) {
  const p = state.points.find(x => x.id === id); if (!p) return;
  $('#pointId').value = p.id; $('#pointName').value = p.name; $('#pointLat').value = p.lat; $('#pointLng').value = p.lng; $('#pointRadius').value = p.radiusMeters || 80; $('#pointDirection').value = p.direction || 'ambos'; $('#pointRequired').value = String(p.required !== false); $('#pointOrder').value = p.order || 1; $('#pointActive').value = String(p.active !== false); $('#pointNotes').value = p.notes || '';
  setPointMarker(Number(p.lat), Number(p.lng), 'pointMap');
}

function savePoint() {
  const id = $('#pointId').value || uuid('point');
  const point = {
    id, name: $('#pointName').value.trim(), lat: Number($('#pointLat').value), lng: Number($('#pointLng').value), radiusMeters: Number($('#pointRadius').value || 80), direction: $('#pointDirection').value,
    required: $('#pointRequired').value === 'true', order: Number($('#pointOrder').value || 0), active: $('#pointActive').value === 'true', notes: $('#pointNotes').value.trim(),
  };
  if (!point.name || !validCoord(point.lat, point.lng)) return showToast('Informe nome e coordenadas válidas.');
  const i = state.points.findIndex(p => p.id === id);
  if (i >= 0) { state.points[i] = point; adminSystemLog('point_edit', `Ponto editado: ${point.name}`); }
  else { state.points.push(point); adminSystemLog('point_create', `Ponto cadastrado: ${point.name}`); }
  persistState(); renderAdmin('points');
}

async function deletePoint(id) {
  const point = state.points.find(p => p.id === id); if (!point) return;
  const ok = await confirmAction('Remover ponto', `Remover o ponto ${point.name}?`);
  if (!ok) return;
  state.points = state.points.filter(p => p.id !== id);
  adminSystemLog('point_delete', `Ponto removido: ${point.name}`);
  persistState(); renderAdmin('points');
}

function renderAdminLuso() {
  const p = state.lusoPoint || { name: 'Luso', lat: '', lng: '', radiusMeters: 100, active: true, notes: '' };
  adminContent(`
    <form id="lusoPointForm" class="card">
      <h2>Configuração do Ponto Luso</h2>
      <label>Nome<input id="lusoPointName" value="${escapeHTML(p.name || 'Luso')}" /></label>
      <div class="grid two"><label>Latitude<input id="lusoPointLat" type="number" step="any" value="${p.lat ?? ''}" /></label><label>Longitude<input id="lusoPointLng" type="number" step="any" value="${p.lng ?? ''}" /></label></div>
      <div class="row-actions"><button id="btnUseCurrentForLuso" class="secondary" type="button">Usar minha localização atual</button></div>
      <div id="lusoConfigMap" class="map" style="margin:12px 0"></div>
      <label>Raio de tolerância (m)<input id="lusoPointRadius" type="number" min="5" value="${p.radiusMeters || 100}" /></label>
      <label>Status<select id="lusoPointActive"><option value="true" ${p.active !== false ? 'selected' : ''}>Ativo</option><option value="false" ${p.active === false ? 'selected' : ''}>Inativo</option></select></label>
      <label>Observação<textarea id="lusoPointNotes" rows="2">${escapeHTML(p.notes || '')}</textarea></label>
      <button class="primary full" type="submit">Salvar ponto Luso</button>
    </form>
  `);
  $('#lusoPointForm').addEventListener('submit', e => { e.preventDefault(); saveLusoPoint(); });
  $('#btnUseCurrentForLuso').addEventListener('click', async () => {
    const loc = await getCurrentLocation({ reason: 'configuração do Luso' });
    if (loc) { $('#lusoPointLat').value = loc.lat; $('#lusoPointLng').value = loc.lng; setPointMarker(loc.lat, loc.lng, 'lusoConfigMap'); }
  });
  initPointMap('lusoConfigMap', 'lusoPointLat', 'lusoPointLng');
  if (validCoord(p.lat, p.lng)) setPointMarker(Number(p.lat), Number(p.lng), 'lusoConfigMap');
}

function saveLusoPoint() {
  const point = { id: state.lusoPoint?.id || uuid('lusoPoint'), name: $('#lusoPointName').value.trim() || 'Luso', lat: Number($('#lusoPointLat').value), lng: Number($('#lusoPointLng').value), radiusMeters: Number($('#lusoPointRadius').value || 100), active: $('#lusoPointActive').value === 'true', notes: $('#lusoPointNotes').value.trim() };
  if (!validCoord(point.lat, point.lng)) return showToast('Informe coordenadas válidas para o Luso.');
  state.lusoPoint = point;
  adminSystemLog('luso_point_save', `Ponto Luso salvo: ${point.name}`);
  persistState(); showToast('Ponto Luso salvo.'); renderAdmin('luso');
}

function validCoord(lat, lng) { return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180; }

function setPointFormCoords(lat, lng) {
  $('#pointLat').value = lat; $('#pointLng').value = lng; setPointMarker(lat, lng, 'pointMap');
}

function leafletAvailable() { return typeof L !== 'undefined'; }

function initPointMap(mapId, latInputId, lngInputId) {
  const el = $(`#${mapId}`);
  if (!leafletAvailable()) {
    el.innerHTML = '<div class="map-fallback">Mapa indisponível. Verifique a internet/CDN do Leaflet ou preencha latitude e longitude manualmente.</div>';
    return;
  }
  const lat = Number($(`#${latInputId}`).value);
  const lng = Number($(`#${lngInputId}`).value);
  const center = validCoord(lat, lng) ? [lat, lng] : DEFAULT_CENTER;
  const map = L.map(mapId).setView(center, validCoord(lat,lng) ? 15 : 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  const obj = state.maps[mapId] = { map, marker: null, latInputId, lngInputId };
  map.on('click', e => {
    $(`#${latInputId}`).value = e.latlng.lat.toFixed(7);
    $(`#${lngInputId}`).value = e.latlng.lng.toFixed(7);
    setPointMarker(e.latlng.lat, e.latlng.lng, mapId);
  });
  if (validCoord(lat,lng)) setPointMarker(lat, lng, mapId);
  setTimeout(() => map.invalidateSize(), 150);
}

function setPointMarker(lat, lng, mapId) {
  const obj = state.maps[mapId];
  if (!obj || !validCoord(lat,lng)) return;
  if (!obj.marker) {
    obj.marker = L.marker([lat,lng], { draggable: true }).addTo(obj.map);
    obj.marker.on('dragend', () => {
      const pos = obj.marker.getLatLng();
      $(`#${obj.latInputId}`).value = pos.lat.toFixed(7);
      $(`#${obj.lngInputId}`).value = pos.lng.toFixed(7);
    });
  } else obj.marker.setLatLng([lat,lng]);
  obj.map.setView([lat,lng], Math.max(obj.map.getZoom(), 15));
}

function cleanupMaps() {
  Object.values(state.maps || {}).forEach(obj => { try { obj.map?.remove(); } catch {} });
  state.maps = {};
}

function renderFleetPanel() {
  adminContent(`
    <section class="card">
      <h2>Localização das Vans</h2>
      <p class="small-note">O mapa abaixo é embutido no app. O botão Atualizar vans recalcula e reposiciona os alfinetes de todas as vans em viagem neste armazenamento local.</p>
      <div class="row-actions no-print"><button id="btnRefreshFleet" class="primary" type="button">Atualizar vans</button></div>
      <div class="meta" style="margin:10px 0">${badge('azul = GPS real', 'real')} ${badge('laranja = estimada', 'estimated')} ${badge('cinza = sem dados', 'none')}</div>
      <div id="fleetMap" class="map tall"></div>
      <div id="fleetCards" class="grid two" style="margin-top:12px"></div>
    </section>
  `);
  initFleetMap();
  $('#btnRefreshFleet').addEventListener('click', refreshFleetMap);
  refreshFleetMap();
}

function getActiveTripsForPanel() {
  const active = readActiveTrips();
  const map = new Map();
  active.forEach(t => { if (t.status === 'em andamento') map.set(t.id, t); });
  if (state.currentTrip?.status === 'em andamento') map.set(state.currentTrip.id, stripLargePhotoData(state.currentTrip));
  return Array.from(map.values());
}

function initFleetMap() {
  const el = $('#fleetMap');
  if (!leafletAvailable()) {
    el.innerHTML = '<div class="map-fallback">Mapa indisponível. Verifique conexão para carregar Leaflet/OpenStreetMap.</div>';
    return;
  }
  const map = L.map('fleetMap').setView(DEFAULT_CENTER, 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  state.maps.fleetMap = { map, markers: [] };
  setTimeout(() => map.invalidateSize(), 150);
}

function refreshFleetMap() {
  const trips = getActiveTripsForPanel();
  const obj = state.maps.fleetMap;
  if (obj?.markers) obj.markers.forEach(m => m.remove());
  if (obj) obj.markers = [];
  const located = [];
  const cards = trips.map(trip => {
    const loc = trip.lastLocation || estimateVanLocation(trip);
    const type = trip.lastLocation ? 'GPS real' : (loc ? 'estimada' : 'sem dados');
    const confidence = trip.lastLocation ? 'Alta' : (loc?.confidence || 'Indisponível');
    if (obj?.map && loc && validCoord(loc.lat, loc.lng)) {
      const marker = L.marker([loc.lat, loc.lng]).addTo(obj.map);
      marker.bindPopup(`<strong>Van ${escapeHTML(trip.vanNumber)}</strong><br>${escapeHTML(trip.personName)}<br>Sentido: ${escapeHTML(trip.direction)}<br>Status: ${escapeHTML(trip.status)}<br>Localização: ${escapeHTML(type)}<br>Confiança: ${escapeHTML(confidence)}<br>Atualização: ${fmtDateTime(loc.timestamp || trip.startTime)}`);
      obj.markers.push(marker);
      located.push([loc.lat, loc.lng]);
    }
    return `<div class="card"><h3>Van ${escapeHTML(trip.vanNumber)}</h3><p>${escapeHTML(trip.personName)} • ${escapeHTML(trip.direction)}</p><p>${badge(type, type === 'GPS real' ? 'real' : type === 'estimada' ? 'estimated' : 'none')} ${badge(`Confiança: ${confidence}`, type === 'GPS real' ? 'real' : type === 'estimada' ? 'estimated' : 'none')}</p><div class="meta"><span>Status: ${escapeHTML(trip.status)}</span><span>Última atualização: ${fmtDateTime(loc?.timestamp || trip.startTime)}</span><span>Passageiros: ${trip.passengers?.total || 0}</span><span>Esperado: ${currency(trip.expectedTotal || 0)}</span><span>Pendências: ${trip.pendingPhotos?.length || 0}</span></div></div>`;
  }).join('');
  $('#fleetCards').innerHTML = cards || '<div class="card"><p class="muted">Nenhuma van em viagem neste armazenamento local.</p></div>';
  if (obj?.map && located.length) {
    const bounds = L.latLngBounds(located);
    obj.map.fitBounds(bounds.pad(.2));
  }
  showToast('Painel das vans atualizado.');
}

function estimateVanLocation(trip) {
  if (!trip) return null;
  const recentLocation = trip.lastLocation;
  if (recentLocation) return { ...recentLocation, confidence: 'Alta', origin: 'GPS real' };
  const points = state.points.filter(p => p.active !== false && directionMatches(p.direction, trip.direction) && validCoord(p.lat, p.lng)).sort((a,b)=>(a.order||0)-(b.order||0));
  const lusoEvent = (trip.lusoEvents || []).slice(-1)[0];
  if (lusoEvent && validCoord(lusoEvent.lat, lusoEvent.lng)) return { lat: lusoEvent.lat, lng: lusoEvent.lng, timestamp: lusoEvent.timestamp, confidence: 'Média', origin: 'estimada por Luso recente' };
  const photo = (trip.photos || []).slice().reverse().find(p => validCoord(p.lat, p.lng));
  if (photo) return { lat: photo.lat, lng: photo.lng, timestamp: photo.timestamp, confidence: 'Alta', origin: 'estimada por foto recente' };
  const alertLog = (trip.logs || []).slice().reverse().find(log => log.type === 'photo_alert' && log.data?.pointId);
  if (alertLog) {
    const point = points.find(p => p.id === alertLog.data.pointId);
    if (point) return { lat: point.lat, lng: point.lng, timestamp: alertLog.timestamp, confidence: 'Média', origin: 'estimada por último ponto alertado' };
  }
  if (points.length) {
    const elapsedMin = Math.max(0, (Date.now() - new Date(trip.startTime).getTime()) / 60000);
    const assumedTripMin = 80;
    const idx = Math.min(points.length - 1, Math.floor((elapsedMin / assumedTripMin) * points.length));
    const p = points[idx] || points[0];
    return { lat: p.lat, lng: p.lng, timestamp: nowISO(), confidence: 'Baixa', origin: 'estimada por tempo e ordem dos pontos' };
  }
  return null;
}

function renderAdminReports() {
  const active = getActiveTripsForPanel();
  adminContent(`
    <section class="card"><h2>Viagens em andamento</h2>${active.length ? `<div class="list">${active.map(t => `<div class="list-row"><header><h3>Van ${escapeHTML(t.vanNumber)} • ${escapeHTML(t.personName)}</h3>${badge(t.status, 'warning')}</header><div class="meta"><span>${escapeHTML(t.direction)}</span><span>${fmtDateTime(t.startTime)}</span><span>${t.passengers?.total || 0} passageiros</span><span>${currency(t.expectedTotal || 0)}</span></div></div>`).join('')}</div>` : '<p class="muted">Nenhuma em andamento.</p>'}</section>
    <section class="card" style="margin-top:12px"><h2>Pendências salvas</h2>${renderAdminPendencies()}</section>
    <section class="card" style="margin-top:12px"><h2>Logs administrativos</h2>${renderAdminLogs()}</section>
  `);
  $$('[data-justify-pending]').forEach(btn => btn.addEventListener('click', () => justifyPending(btn.dataset.trip, btn.dataset.pending)));
  $$('[data-clear-pending]').forEach(btn => btn.addEventListener('click', () => clearPending(btn.dataset.trip, btn.dataset.pending)));
}

function renderAdminLogs() {
  const logs = state.adminLogs || [];
  if (!logs.length) return '<p class="muted">Sem logs administrativos registrados.</p>';
  return `<div class="list">${logs.slice(-80).reverse().map(log => `<div class="list-row"><strong>${escapeHTML(log.message)}</strong><span class="muted">${fmtDateTime(log.timestamp)} • ${escapeHTML(log.type)}</span></div>`).join('')}</div>`;
}

function renderAdminPendencies() {
  const rows = [];
  state.trips.forEach(trip => (trip.pendingPhotos || []).forEach(p => rows.push({ trip, p })));
  if (!rows.length) return '<p class="muted">Nenhuma pendência em viagens salvas.</p>';
  return `<div class="list">${rows.map(({trip,p}) => `<div class="list-row ${p.justified ? 'report-warning' : 'report-danger'}"><header><h3>${escapeHTML(p.pointName)} • Van ${escapeHTML(trip.vanNumber)}</h3>${badge(p.justified ? 'justificada' : 'pendente', p.justified ? 'warning' : 'danger')}</header><p class="muted">${fmtDateTime(p.timestamp)} • ${escapeHTML(trip.personName)}</p>${p.justified ? `<p>${escapeHTML(p.justification)}</p>` : ''}<div class="row-actions"><button class="secondary small" data-justify-pending="${p.id}" data-trip="${trip.id}" type="button">Justificar</button><button class="danger small" data-clear-pending="${p.id}" data-trip="${trip.id}" type="button">Limpar</button></div></div>`).join('')}</div>`;
}

function justifyPending(tripId, pendingId) {
  const trip = state.trips.find(t => t.id === tripId); if (!trip) return;
  const pending = (trip.pendingPhotos || []).find(p => p.id === pendingId); if (!pending) return;
  const justification = prompt('Justificativa da pendência:');
  if (!justification) return;
  pending.justified = true; pending.justification = justification; pending.justifiedBy = 'Administrador local'; pending.justifiedAt = nowISO();
  registerLogSafe(trip, 'pending_justified', `Pendência justificada: ${pending.pointName}`, { pendingId, justification });
  persistState(); renderAdmin('reports');
}

async function clearPending(tripId, pendingId) {
  const trip = state.trips.find(t => t.id === tripId); if (!trip) return;
  const pending = (trip.pendingPhotos || []).find(p => p.id === pendingId); if (!pending) return;
  const ok = await confirmAction('Limpar pendência', `Limpar pendência do ponto ${pending.pointName}?`);
  if (!ok) return;
  trip.pendingPhotos = trip.pendingPhotos.filter(p => p.id !== pendingId);
  registerLogSafe(trip, 'pending_cleared', `Pendência limpa pelo administrador: ${pending.pointName}`, { pendingId });
  persistState(); renderAdmin('reports');
}

function adminSystemLog(type, message) {
  state.adminLogs = state.adminLogs || [];
  state.adminLogs.push({ id: uuid('adminLog'), timestamp: nowISO(), type, message });
  if (state.adminLogs.length > 500) state.adminLogs = state.adminLogs.slice(-500);
  console.info(`[admin:${type}] ${message}`);
  // Em uma versão com backend, este log deve ir para trilha imutável do servidor.
}

window.addEventListener('DOMContentLoaded', initApp);
