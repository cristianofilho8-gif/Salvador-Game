/*
  Controle de Van - versão local/PWA simples
  ------------------------------------------------------------
  Esta versão dificulta fraudes registrando horário, GPS, distância,
  logs e status suspeito, mas NÃO impede 100% GPS falso, adulteração
  avançada do navegador/localStorage ou edição manual por pessoas com
  conhecimento técnico. Para segurança real, use servidor, autenticação,
  assinatura digital e validação remota.
*/

const STORAGE = {
  config: 'controleVan.config.v1',
  currentTrip: 'controleVan.currentTrip.v1',
  history: 'controleVan.history.v1'
};

const DEFAULT_CONFIG = {
  fareFullCents: 500,
  fareLusoCents: 250,
  adminPin: '1234',
  routeDurationMinutes: 60,
  googleMapsApiKey: '',
  drivers: [],
  photoPoints: [],
  lusoPoint: {
    name: 'Luso',
    lat: '',
    lng: '',
    radius: 120
  }
};

const state = {
  config: loadJson(STORAGE.config, DEFAULT_CONFIG),
  currentTrip: loadJson(STORAGE.currentTrip, null),
  history: loadJson(STORAGE.history, []),
  currentScreen: 'homeScreen',
  reportTrip: null,
  adminAuthenticated: false,
  lastLocation: null,
  geoWatchId: null,
  activePhotoPointId: null,
  activePhotoAlertId: null,
  toastTimer: null,
  mapPicker: null,
  mapPickerMarker: null,
  mapPickerTarget: null,
  mapPickerSelected: null,
  fleetMap: null,
  fleetMarkers: [],
  googleMapsPromise: null,
  googleFleetMap: null,
  googleFleetMarkers: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const screens = {
  homeScreen: { title: 'Controle de Van', subtitle: 'Controle rápido de passageiros, pagamentos e fotos', back: false },
  newTripScreen: { title: 'Nova Viagem', subtitle: 'Escolha o sentido do trajeto', back: true },
  tripScreen: { title: 'Viagem em andamento', subtitle: 'Use os botões grandes para registrar rápido', back: false },
  historyScreen: { title: 'Histórico', subtitle: 'Viagens encerradas e relatórios', back: true },
  reportScreen: { title: 'Relatório da viagem', subtitle: 'Resumo final e exportação', back: true },
  adminLoginScreen: { title: 'Administrador', subtitle: 'Acesso protegido por PIN', back: true },
  adminScreen: { title: 'Administrador', subtitle: 'Configurações, pontos e relatórios', back: true }
};

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : structuredCloneSafe(fallback);
  } catch (error) {
    console.warn('Falha ao carregar', key, error);
    return structuredCloneSafe(fallback);
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('Falha ao salvar localStorage', error);
    showToast('Não foi possível salvar tudo. O armazenamento local pode estar cheio.');
    return false;
  }
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeConfig() {
  state.config = { ...structuredCloneSafe(DEFAULT_CONFIG), ...(state.config || {}) };
  state.config.photoPoints = Array.isArray(state.config.photoPoints) ? state.config.photoPoints : [];
  state.config.drivers = Array.isArray(state.config.drivers) ? state.config.drivers : [];
  state.config.lusoPoint = { ...structuredCloneSafe(DEFAULT_CONFIG.lusoPoint), ...(state.config.lusoPoint || {}) };
  state.config.routeDurationMinutes = Math.max(5, Number(state.config.routeDurationMinutes || 60));
  state.config.googleMapsApiKey = state.config.googleMapsApiKey || '';
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function formatDateTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function money(cents) {
  const value = Number(cents || 0) / 100;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function centsFromInput(value, fallbackCents) {
  const parsed = Number(String(value).replace(',', '.'));
  if (Number.isNaN(parsed) || parsed < 0) return fallbackCents;
  return Math.round(parsed * 100);
}

function numberInputValue(id) {
  const value = Number($(id).value);
  return Number.isFinite(value) ? value : 0;
}

function intInputValue(id) {
  return Math.max(0, Math.floor(numberInputValue(id)));
}

function directionLabel(value) {
  if (value === 'ida') return 'Ida';
  if (value === 'volta') return 'Volta';
  return 'Ambos';
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showScreen(screenId) {
  $$('.screen').forEach((screen) => screen.classList.remove('active'));
  $(`#${screenId}`).classList.add('active');
  state.currentScreen = screenId;

  const meta = screens[screenId] || screens.homeScreen;
  $('#screenTitle').textContent = meta.title;
  $('#screenSubtitle').textContent = meta.subtitle;
  $('#btnBack').classList.toggle('hidden', !meta.back);

  if (screenId === 'homeScreen') renderHome();
  if (screenId === 'newTripScreen') renderTripDriverSelect();
  if (screenId === 'tripScreen') renderTrip();
  if (screenId === 'historyScreen') renderHistory();
  if (screenId === 'reportScreen') renderReport(state.reportTrip);
  if (screenId === 'adminScreen') renderAdmin();

  window.scrollTo({ top: 0, behavior: 'instant' });
}

function goBack() {
  if (state.currentScreen === 'reportScreen') {
    if (state.adminAuthenticated) return showScreen('adminScreen');
    return showScreen('historyScreen');
  }
  if (state.currentScreen === 'adminScreen') return showScreen('homeScreen');
  return showScreen('homeScreen');
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.add('hidden'), 3600);
}

function openModal(id) {
  $(`#${id}`).classList.remove('hidden');
}

function closeModal(id) {
  $(`#${id}`).classList.add('hidden');
  if (id === 'photoModal') {
    $('#photoInput').value = '';
    state.activePhotoPointId = null;
    state.activePhotoAlertId = null;
  }
}

function logTrip(type, message, data = {}) {
  if (!state.currentTrip) return;
  state.currentTrip.logs.push({ id: uid('log'), at: nowIso(), type, message, data });
  saveCurrentTrip();
}

function saveConfig() {
  saveJson(STORAGE.config, state.config);
}

function saveCurrentTrip() {
  if (state.currentTrip) saveJson(STORAGE.currentTrip, state.currentTrip);
  else localStorage.removeItem(STORAGE.currentTrip);
}

function saveHistory() {
  saveJson(STORAGE.history, state.history);
}

function getTripTotals(trip = state.currentTrip) {
  if (!trip) {
    return {
      totalPassengers: 0,
      expectedCents: 0,
      cashCents: 0,
      pixCents: 0,
      receivedCents: 0,
      diffCents: 0,
      photosTaken: 0,
      photosPending: 0,
      photosSuspicious: 0,
      requiredPhotoAlerts: 0
    };
  }

  const paymentCounts = trip.paymentCounts || createEmptyPaymentCounts();
  const fareFull = trip.fareFullCents;
  const fareLuso = trip.fareLusoCents;

  const totalPassengers = (trip.fullPassengers || 0) + (trip.lusoPassengers || 0);
  const expectedCents = (trip.fullPassengers || 0) * fareFull + (trip.lusoPassengers || 0) * fareLuso;
  const cashCents = (paymentCounts.cashFull || 0) * fareFull + (paymentCounts.cashLuso || 0) * fareLuso;
  const pixCents = (paymentCounts.pixFull || 0) * fareFull + (paymentCounts.pixLuso || 0) * fareLuso;
  const receivedCents = cashCents + pixCents;
  const diffCents = receivedCents - expectedCents;
  const photosTaken = (trip.photos || []).length;
  const photosPending = (trip.photoAlerts || []).filter((item) => item.status === 'pending').length;
  const photosSuspicious = (trip.photos || []).filter((item) => item.suspicious).length;
  const requiredPhotoAlerts = (trip.photoAlerts || []).length;

  return {
    totalPassengers,
    expectedCents,
    cashCents,
    pixCents,
    receivedCents,
    diffCents,
    photosTaken,
    photosPending,
    photosSuspicious,
    requiredPhotoAlerts
  };
}

function createEmptyPaymentCounts() {
  return { cashFull: 0, pixFull: 0, cashLuso: 0, pixLuso: 0 };
}

function createTrip(direction) {
  if (state.currentTrip) {
    const proceed = confirm('Já existe uma viagem em andamento. Deseja encerrar/descartar a viagem atual e iniciar outra?');
    if (!proceed) return;
  }

  const driverId = $('#tripDriverSelect')?.value || '';
  const driver = state.config.drivers.find((item) => item.id === driverId);
  if (!driver) {
    showToast('Cadastre e selecione o cobrador/van antes de iniciar a viagem.');
    showScreen('newTripScreen');
    return;
  }

  state.currentTrip = {
    id: uid('viagem'),
    version: 2,
    direction,
    startedAt: nowIso(),
    endedAt: null,
    savedAt: null,
    driverId: driver.id,
    driverName: driver.name,
    vanNumber: driver.vanNumber,
    driverNote: driver.note || '',
    fareFullCents: state.config.fareFullCents,
    fareLusoCents: state.config.fareLusoCents,
    routeDurationMinutes: state.config.routeDurationMinutes || 60,
    fullPassengers: 0,
    lusoPassengers: 0,
    paymentCounts: createEmptyPaymentCounts(),
    lusoEvents: [],
    photoAlerts: [],
    photos: [],
    logs: [],
    lastKnownLocation: null,
    lusoSuggestedAt: null
  };

  logTrip('inicio_viagem', `Viagem iniciada no sentido ${directionLabel(direction)} pela ${driver.vanNumber}.`, { direction, driver });
  saveCurrentTrip();
  startGeolocation();
  showScreen('tripScreen');
  showToast('Viagem iniciada. GPS será solicitado pelo navegador.');
}

function renderHome() {
  const activeCard = $('#activeTripCard');
  if (!state.currentTrip) {
    activeCard.classList.add('hidden');
    return;
  }

  const totals = getTripTotals(state.currentTrip);
  activeCard.classList.remove('hidden');
  activeCard.innerHTML = `
    <div class="section-title-row">
      <h2>${state.currentTrip.endedAt ? 'Viagem encerrada sem salvar' : 'Viagem em andamento'}</h2>
      <span class="badge">${directionLabel(state.currentTrip.direction)}</span>
    </div>
    <p>${escapeHtml(state.currentTrip.vanNumber || 'Van sem cadastro')} • ${escapeHtml(state.currentTrip.driverName || 'Sem cobrador')}<br>Início: ${formatDateTime(state.currentTrip.startedAt)}</p>
    <div class="stats-grid">
      <div class="stat"><strong>${totals.totalPassengers}</strong><span>passageiros</span></div>
      <div class="stat"><strong>${money(totals.expectedCents)}</strong><span>esperado</span></div>
      <div class="stat"><strong>${money(totals.receivedCents)}</strong><span>recebido</span></div>
      <div class="stat"><strong>${totals.photosPending}</strong><span>pendências</span></div>
    </div>
    <button class="btn primary big" id="btnResumeTrip" type="button">${state.currentTrip.endedAt ? 'Conferir relatório e salvar' : 'Continuar viagem'}</button>
  `;
  $('#btnResumeTrip').addEventListener('click', () => {
    if (state.currentTrip.endedAt) {
      state.reportTrip = state.currentTrip;
      showScreen('reportScreen');
      return;
    }
    startGeolocation();
    showScreen('tripScreen');
  });
}

function renderTrip() {
  if (!state.currentTrip) {
    showScreen('homeScreen');
    return;
  }

  const trip = state.currentTrip;
  const totals = getTripTotals(trip);
  $('#tripStatus').textContent = `${trip.vanNumber || 'Van sem cadastro'} • ${trip.driverName || 'Cobrador não informado'} • Início: ${formatDateTime(trip.startedAt)} • Tarifa inteira ${money(trip.fareFullCents)} • Luso ${money(trip.fareLusoCents)}`;
  $('#tripDirectionBadge').textContent = directionLabel(trip.direction);

  $('#passengerStats').innerHTML = `
    <div class="stat big-number"><strong>${totals.totalPassengers}</strong><span>Total de passageiros</span></div>
    <div class="stat"><strong>${trip.fullPassengers}</strong><span>Passagens inteiras</span></div>
    <div class="stat"><strong>${trip.lusoPassengers}</strong><span>Passagens Luso</span></div>
    <div class="stat"><strong>${money(totals.expectedCents)}</strong><span>Valor esperado</span></div>
  `;

  $('#paymentStats').innerHTML = `
    <div class="stat"><strong>${money(totals.cashCents)}</strong><span>Recebido dinheiro</span></div>
    <div class="stat"><strong>${money(totals.pixCents)}</strong><span>Recebido Pix</span></div>
    <div class="stat"><strong>${money(totals.receivedCents)}</strong><span>Total recebido</span></div>
    <div class="stat"><strong>${formatDiff(totals.diffCents)}</strong><span>Diferença / falta receber</span></div>
  `;

  const diffBadge = $('#paymentDiffBadge');
  if (totals.diffCents === 0) {
    diffBadge.textContent = 'Fechado';
    diffBadge.className = 'badge ok';
  } else if (totals.diffCents < 0) {
    diffBadge.textContent = `Falta ${money(Math.abs(totals.diffCents))}`;
    diffBadge.className = 'badge danger';
  } else {
    diffBadge.textContent = `Sobra ${money(totals.diffCents)}`;
    diffBadge.className = 'badge warn';
  }

  renderGpsStatus();
  renderPendingPhotos();
  renderPhotoSummary();
}

function formatDiff(diffCents) {
  if (diffCents < 0) return `Falta ${money(Math.abs(diffCents))}`;
  if (diffCents > 0) return `Sobra ${money(diffCents)}`;
  return money(0);
}

function buildQuickButtons() {
  const add = $('#addPassengerButtons');
  const remove = $('#removePassengerButtons');
  add.innerHTML = '';
  remove.innerHTML = '';

  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.type = 'button';
    btn.textContent = `+${i}`;
    btn.dataset.passengerDelta = String(i);
    add.appendChild(btn);
  }

  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.type = 'button';
    btn.textContent = `-${i}`;
    btn.dataset.passengerDelta = String(-i);
    remove.appendChild(btn);
  }
}

function changePassengers(delta) {
  const trip = state.currentTrip;
  if (!trip) return;

  if (delta > 0) {
    trip.fullPassengers += delta;
    logTrip('passageiros_adicionados', `${delta} passageiro(s) inteiro(s) adicionado(s).`, { delta, type: 'inteira' });
  } else {
    let amount = Math.abs(delta);
    const fullRemoved = Math.min(trip.fullPassengers, amount);
    trip.fullPassengers -= fullRemoved;
    amount -= fullRemoved;

    const lusoRemoved = Math.min(trip.lusoPassengers, amount);
    trip.lusoPassengers -= lusoRemoved;

    const removed = fullRemoved + lusoRemoved;
    if (removed === 0) {
      showToast('O contador já está zerado.');
      return;
    }
    logTrip('passageiros_removidos', `${removed} passageiro(s) removido(s) para correção.`, { fullRemoved, lusoRemoved });
  }

  saveCurrentTrip();
  renderTrip();
}

function changePayment(key, deltaCount) {
  const trip = state.currentTrip;
  if (!trip) return;
  const counts = trip.paymentCounts;
  const previous = counts[key] || 0;
  const next = Math.max(0, previous + deltaCount);
  const realDelta = next - previous;

  if (realDelta === 0) {
    showToast('Esse pagamento já está zerado.');
    return;
  }

  counts[key] = next;
  const labelMap = {
    cashFull: 'passagem inteira em dinheiro',
    pixFull: 'passagem inteira em Pix',
    cashLuso: 'Luso em dinheiro',
    pixLuso: 'Luso em Pix'
  };
  logTrip('pagamento_registrado', `${realDelta > 0 ? '+' : ''}${realDelta} ${labelMap[key]}.`, { key, delta: realDelta });
  saveCurrentTrip();
  renderTrip();
}

function openLusoModal() {
  if (!state.currentTrip) return;
  const isIda = state.currentTrip.direction === 'ida';
  $('#lusoModalTitle').textContent = isIda ? 'Registrar Luso - Ida' : 'Registrar Luso - Volta';
  $('#lusoHelp').textContent = isIda
    ? 'Na ida, informe quantas pessoas desceram no Luso. O app converterá essas pessoas para tarifa de R$ 2,50.'
    : 'Na volta, informe quantas pessoas entraram no Luso. Elas serão adicionadas como tarifa de R$ 2,50.';
  $('#lusoPeopleLabel').textContent = isIda ? 'Quantas pessoas desceram no Luso?' : 'Quantas pessoas entraram no Luso?';
  $('#lusoPeopleInput').value = '0';
  $('#lusoCashInput').value = '0';
  $('#lusoPixInput').value = '0';
  openModal('lusoModal');
}

function saveLusoEvent() {
  const trip = state.currentTrip;
  if (!trip) return;

  const people = intInputValue('#lusoPeopleInput');
  const cash = intInputValue('#lusoCashInput');
  const pix = intInputValue('#lusoPixInput');

  if (people <= 0) {
    showToast('Informe a quantidade de pessoas do Luso.');
    return;
  }

  if (cash + pix > people) {
    showToast('Pagamentos do Luso não podem ser maiores que a quantidade de pessoas.');
    return;
  }

  let convertedFromFull = 0;
  let extraAdded = 0;

  if (trip.direction === 'ida') {
    convertedFromFull = Math.min(trip.fullPassengers, people);
    extraAdded = Math.max(0, people - convertedFromFull);
    trip.fullPassengers -= convertedFromFull;
    trip.lusoPassengers += people;
  } else {
    trip.lusoPassengers += people;
    extraAdded = people;
  }

  trip.paymentCounts.cashLuso += cash;
  trip.paymentCounts.pixLuso += pix;

  const event = {
    id: uid('luso'),
    at: nowIso(),
    direction: trip.direction,
    people,
    convertedFromFull,
    extraAdded,
    expectedCents: people * trip.fareLusoCents,
    cashCount: cash,
    pixCount: pix,
    cashCents: cash * trip.fareLusoCents,
    pixCents: pix * trip.fareLusoCents
  };

  trip.lusoEvents.push(event);
  logTrip('chegada_luso', `Evento Luso registrado: ${people} pessoa(s), ${cash} dinheiro, ${pix} Pix.`, event);
  saveCurrentTrip();
  closeModal('lusoModal');
  renderTrip();
  showToast('Evento do Luso registrado.');
}

function recordLocation(location, source = 'gps') {
  const cleanLocation = {
    lat: Number(location.lat),
    lng: Number(location.lng),
    accuracy: Number(location.accuracy || 0),
    at: location.at || nowIso(),
    source,
    simulated: Boolean(location.simulated)
  };
  if (!Number.isFinite(cleanLocation.lat) || !Number.isFinite(cleanLocation.lng)) return;
  state.lastLocation = cleanLocation;
  if (state.currentTrip && !state.currentTrip.endedAt) {
    state.currentTrip.lastKnownLocation = cleanLocation;
    saveCurrentTrip();
  }
  if (state.currentScreen === 'adminScreen') renderFleetPanel();
}

function startGeolocation() {
  if (!state.currentTrip) return;
  if (!('geolocation' in navigator)) {
    renderGpsStatus('Este navegador não tem suporte a geolocalização.');
    return;
  }

  if (state.geoWatchId !== null) return;

  state.geoWatchId = navigator.geolocation.watchPosition(
    (position) => {
      recordLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        at: nowIso()
      }, 'gps');
      renderGpsStatus();
      checkRouteTriggers(false);
    },
    (error) => {
      renderGpsStatus(`GPS indisponível: ${error.message}`);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
  );
}

function stopGeolocation() {
  if (state.geoWatchId !== null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(state.geoWatchId);
    state.geoWatchId = null;
  }
}

function refreshGps() {
  if (!('geolocation' in navigator)) {
    showToast('Este navegador não suporta GPS.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      recordLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        at: nowIso()
      }, 'gps');
      renderGpsStatus();
      checkRouteTriggers(false);
      showToast('GPS atualizado.');
    },
    (error) => showToast(`GPS indisponível: ${error.message}`),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
  );
}

function renderGpsStatus(customMessage = '') {
  const box = $('#gpsStatus');
  if (!box) return;

  if (customMessage) {
    box.textContent = customMessage;
    return;
  }

  if (!state.lastLocation) {
    box.innerHTML = 'GPS ainda não capturado. Toque em <strong>Atualizar GPS</strong> ou permita localização.';
    return;
  }

  box.innerHTML = `GPS: ${state.lastLocation.lat.toFixed(6)}, ${state.lastLocation.lng.toFixed(6)} • precisão aprox. ${Math.round(state.lastLocation.accuracy || 0)}m • ${formatDateTime(state.lastLocation.at)}`;
}

function checkRouteTriggers(fromSimulation = false) {
  const trip = state.currentTrip;
  const loc = state.lastLocation;
  if (!trip || !loc) return;

  const points = [...(state.config.photoPoints || [])]
    .filter((point) => point.required)
    .filter((point) => point.direction === 'both' || point.direction === trip.direction)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  for (const point of points) {
    const dist = distanceMeters(loc.lat, loc.lng, Number(point.lat), Number(point.lng));
    const withinRadius = dist <= Number(point.radius || 0);
    const alreadyHandled = trip.photoAlerts.some((alert) => alert.pointId === point.id) || trip.photos.some((photo) => photo.pointId === point.id);

    if (withinRadius && !alreadyHandled) {
      const alert = {
        id: uid('alerta'),
        pointId: point.id,
        pointName: point.name,
        generatedAt: nowIso(),
        lat: loc.lat,
        lng: loc.lng,
        distanceMeters: Math.round(dist),
        radiusMeters: Number(point.radius),
        direction: trip.direction,
        status: 'pending',
        required: true,
        source: fromSimulation ? 'simulacao' : 'gps'
      };
      trip.photoAlerts.push(alert);
      logTrip('alerta_foto', `Você chegou ao ponto ${point.name}. Foto obrigatória pendente.`, alert);
      saveCurrentTrip();
      renderTrip();
      openPhotoAlert(point.id, alert.id);
      break;
    }
  }

  const luso = state.config.lusoPoint;
  const hasLusoCoords = Number.isFinite(Number(luso?.lat)) && Number.isFinite(Number(luso?.lng));
  if (hasLusoCoords && !trip.lusoSuggestedAt) {
    const lusoDist = distanceMeters(loc.lat, loc.lng, Number(luso.lat), Number(luso.lng));
    if (lusoDist <= Number(luso.radius || 0)) {
      trip.lusoSuggestedAt = nowIso();
      logTrip('sugestao_luso', `Chegada próxima ao ${luso.name || 'Luso'} detectada.`, { distanceMeters: Math.round(lusoDist) });
      saveCurrentTrip();
      const open = confirm(`Você chegou ao ${luso.name || 'Luso'}. Deseja registrar movimentação?`);
      if (open) openLusoModal();
    }
  }
}

function openPhotoAlert(pointId, alertId = null) {
  const trip = state.currentTrip;
  const point = state.config.photoPoints.find((item) => item.id === pointId);
  if (!trip || !point) return;

  const alert = alertId
    ? trip.photoAlerts.find((item) => item.id === alertId)
    : trip.photoAlerts.find((item) => item.pointId === pointId && item.status === 'pending');

  if (!alert) return;

  state.activePhotoPointId = pointId;
  state.activePhotoAlertId = alert.id;
  if ('vibrate' in navigator) navigator.vibrate([500, 180, 500, 180, 800]);
  $('#photoModalTitle').textContent = `Foto: ${point.name}`;
  $('#photoModalText').textContent = `Você chegou ao ponto ${point.name}. Tire a foto obrigatória.`;
  $('#photoModalMeta').innerHTML = `
    Ponto: <strong>${escapeHtml(point.name)}</strong><br>
    Raio permitido: <strong>${Number(point.radius)}m</strong><br>
    Distância detectada: <strong>${Math.round(alert.distanceMeters)}m</strong><br>
    Sentido: <strong>${directionLabel(trip.direction)}</strong><br>
    Status atual: <strong>Foto pendente</strong>
  `;
  openModal('photoModal');
}

async function handlePhotoInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const trip = state.currentTrip;
  const point = state.config.photoPoints.find((item) => item.id === state.activePhotoPointId);
  const alert = trip?.photoAlerts.find((item) => item.id === state.activePhotoAlertId);

  if (!trip || !point || !alert) {
    showToast('Não foi possível identificar o ponto da foto.');
    return;
  }

  if (!file.type.startsWith('image/')) {
    showToast('Arquivo inválido. Use uma imagem capturada pela câmera.');
    return;
  }

  if (!state.lastLocation) {
    showToast('GPS ainda não disponível. Atualize o GPS antes de registrar a foto.');
    return;
  }

  try {
    const previewBase64 = await resizeImageToBase64(file, 900, 0.58);
    const dist = distanceMeters(state.lastLocation.lat, state.lastLocation.lng, Number(point.lat), Number(point.lng));
    const suspicious = dist > Number(point.radius || 0);
    const photo = {
      id: uid('foto'),
      pointId: point.id,
      pointName: point.name,
      capturedAt: nowIso(),
      lat: state.lastLocation.lat,
      lng: state.lastLocation.lng,
      distanceMeters: Math.round(dist),
      radiusMeters: Number(point.radius),
      direction: trip.direction,
      status: 'foto registrada',
      suspicious,
      source: 'camera_input_capture_environment',
      fileName: file.name || 'camera.jpg',
      fileType: file.type,
      previewBase64
    };

    trip.photos.push(photo);
    alert.status = 'registered';
    alert.registeredAt = photo.capturedAt;
    alert.photoId = photo.id;
    alert.suspicious = suspicious;

    logTrip('foto_registrada', `Foto registrada no ponto ${point.name}${suspicious ? ' com status suspeito' : ''}.`, {
      pointId: point.id,
      distanceMeters: photo.distanceMeters,
      suspicious
    });

    saveCurrentTrip();
    closeModal('photoModal');
    renderTrip();
    showToast(suspicious ? 'Foto salva, mas marcada como suspeita por estar fora do raio.' : 'Foto registrada com sucesso.');
  } catch (error) {
    console.error(error);
    showToast('Falha ao processar a foto.');
  }
}

function resizeImageToBase64(file, maxSize = 900, quality = 0.58) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  const earth = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(value) {
  return value * Math.PI / 180;
}

function renderPendingPhotos() {
  const trip = state.currentTrip;
  const card = $('#pendingPhotosCard');
  const list = $('#pendingPhotosList');
  const pending = (trip?.photoAlerts || []).filter((item) => item.status === 'pending');

  if (!pending.length) {
    card.classList.add('hidden');
    list.innerHTML = '';
    return;
  }

  card.classList.remove('hidden');
  list.innerHTML = pending.map((alert) => `
    <div class="list-item">
      <header>
        <div>
          <h3>${escapeHtml(alert.pointName)}</h3>
          <p>Alerta: ${formatDateTime(alert.generatedAt)} • distância: ${alert.distanceMeters}m</p>
        </div>
        <span class="badge danger">Pendente</span>
      </header>
      <button class="btn warning" data-open-photo="${alert.pointId}" data-alert-id="${alert.id}" type="button">Tirar foto agora</button>
    </div>
  `).join('');
}

function renderPhotoSummary() {
  const trip = state.currentTrip;
  const totals = getTripTotals(trip);
  $('#photoSummaryCard').innerHTML = `
    <h2>Fotos do trajeto</h2>
    <div class="stats-grid">
      <div class="stat"><strong>${totals.requiredPhotoAlerts}</strong><span>alertas gerados</span></div>
      <div class="stat"><strong>${totals.photosTaken}</strong><span>fotos tiradas</span></div>
      <div class="stat"><strong>${totals.photosPending}</strong><span>pendentes</span></div>
      <div class="stat"><strong>${totals.photosSuspicious}</strong><span>suspeitas</span></div>
    </div>
  `;
}

function endTrip() {
  const trip = state.currentTrip;
  if (!trip) return;

  const totals = getTripTotals(trip);
  const confirmText = totals.photosPending > 0
    ? `Existem ${totals.photosPending} foto(s) pendente(s). Deseja encerrar e conferir o relatório mesmo assim?`
    : 'Deseja encerrar a viagem e conferir o relatório?';

  if (!confirm(confirmText)) return;

  if (!trip.endedAt) {
    trip.endedAt = nowIso();
    logTrip('encerramento_viagem', 'Viagem encerrada. Aguardando conferência e salvamento no histórico.', getTripTotals(trip));
  }

  saveCurrentTrip();
  stopGeolocation();
  state.reportTrip = trip;
  showScreen('reportScreen');
}

function isReportCurrentUnsavedTrip() {
  return Boolean(state.reportTrip && state.currentTrip && state.reportTrip.id === state.currentTrip.id && state.currentTrip.endedAt && !state.currentTrip.savedAt);
}

function saveTripFromReport() {
  if (!isReportCurrentUnsavedTrip()) {
    showToast('Essa viagem já está salva ou não é a viagem atual.');
    renderReport(state.reportTrip);
    return;
  }

  const trip = state.currentTrip;
  trip.savedAt = nowIso();
  trip.logs.push({
    id: uid('log'),
    at: nowIso(),
    type: 'viagem_salva',
    message: 'Viagem salva no histórico local depois da conferência do relatório.',
    data: getTripTotals(trip)
  });

  state.history.unshift(structuredCloneSafe(trip));
  state.reportTrip = state.history[0];
  state.currentTrip = null;
  saveHistory();
  saveCurrentTrip();
  renderReport(state.reportTrip);
  renderHome();
  showToast('Viagem salva no histórico.');
}

function renderHistory() {
  const list = $('#historyList');
  if (!state.history.length) {
    list.innerHTML = '<p class="muted">Nenhuma viagem encerrada ainda.</p>';
    return;
  }

  list.innerHTML = state.history.map((trip) => historyItemHtml(trip)).join('');
}

function historyItemHtml(trip) {
  const totals = getTripTotals(trip);
  return `
    <div class="list-item">
      <header>
        <div>
          <h3>${formatDate(trip.startedAt)} • ${directionLabel(trip.direction)}</h3>
          <p>Início ${formatDateTime(trip.startedAt)} • Fim ${formatDateTime(trip.endedAt)}</p>
        </div>
        <span class="badge ${totals.photosPending ? 'danger' : 'ok'}">${totals.photosPending} pend.</span>
      </header>
      <div class="stats-grid">
        <div class="stat"><strong>${totals.totalPassengers}</strong><span>passageiros</span></div>
        <div class="stat"><strong>${money(totals.expectedCents)}</strong><span>esperado</span></div>
        <div class="stat"><strong>${money(totals.receivedCents)}</strong><span>recebido</span></div>
        <div class="stat"><strong>${formatDiff(totals.diffCents)}</strong><span>diferença</span></div>
      </div>
      <button class="btn secondary" data-open-report="${trip.id}" type="button">Abrir relatório</button>
    </div>
  `;
}

function openReportById(id) {
  const trip = state.history.find((item) => item.id === id) || (state.currentTrip?.id === id ? state.currentTrip : null);
  if (!trip) {
    showToast('Relatório não encontrado.');
    return;
  }
  state.reportTrip = trip;
  showScreen('reportScreen');
}

function renderReport(trip) {
  const box = $('#reportContent');
  $('#exportText').classList.add('hidden');
  $('#btnCopyReport').classList.add('hidden');

  if (!trip) {
    box.innerHTML = '<div class="card"><p class="muted">Nenhum relatório selecionado.</p></div>';
    $('#btnSaveTripReport')?.classList.add('hidden');
    $('#reportSaveStatus').textContent = 'Sem relatório';
    $('#reportSaveStatus').className = 'badge';
    return;
  }

  const unsaved = isReportCurrentUnsavedTrip();
  $('#btnSaveTripReport')?.classList.toggle('hidden', !unsaved);
  $('#reportSaveStatus').textContent = unsaved ? 'Não salva' : 'Salva';
  $('#reportSaveStatus').className = unsaved ? 'badge warn' : 'badge ok';

  const totals = getTripTotals(trip);
  const pending = (trip.photoAlerts || []).filter((item) => item.status === 'pending');
  const justified = (trip.photoAlerts || []).filter((item) => item.status === 'justified');

  box.innerHTML = `
    <section class="report-section">
      <div class="section-title-row">
        <h2>Resumo</h2>
        <span class="badge ${totals.diffCents === 0 ? 'ok' : totals.diffCents < 0 ? 'danger' : 'warn'}">${formatDiff(totals.diffCents)}</span>
      </div>
      <table class="report-table">
        <tr><th>Data</th><td>${formatDate(trip.startedAt)}</td></tr>
        <tr><th>Horário de início</th><td>${formatDateTime(trip.startedAt)}</td></tr>
        <tr><th>Horário de encerramento</th><td>${formatDateTime(trip.endedAt)}</td></tr>
        <tr><th>Sentido</th><td>${directionLabel(trip.direction)}</td></tr>
        <tr><th>Van</th><td>${escapeHtml(trip.vanNumber || 'Não informada')}</td></tr>
        <tr><th>Cobrador</th><td>${escapeHtml(trip.driverName || 'Não informado')}</td></tr>
        <tr><th>Total de passageiros</th><td>${totals.totalPassengers}</td></tr>
        <tr><th>Passageiros tarifa inteira</th><td>${trip.fullPassengers}</td></tr>
        <tr><th>Passageiros Luso</th><td>${trip.lusoPassengers}</td></tr>
        <tr><th>Valor esperado</th><td>${money(totals.expectedCents)}</td></tr>
        <tr><th>Recebido em dinheiro</th><td>${money(totals.cashCents)}</td></tr>
        <tr><th>Recebido em Pix</th><td>${money(totals.pixCents)}</td></tr>
        <tr><th>Total recebido</th><td>${money(totals.receivedCents)}</td></tr>
        <tr><th>Diferença</th><td>${formatDiff(totals.diffCents)}</td></tr>
      </table>
    </section>

    <section class="report-section">
      <h2>Fotos</h2>
      <table class="report-table">
        <tr><th>Fotos obrigatórias / alertas</th><td>${totals.requiredPhotoAlerts}</td></tr>
        <tr><th>Fotos tiradas</th><td>${totals.photosTaken}</td></tr>
        <tr><th>Fotos pendentes</th><td>${totals.photosPending}</td></tr>
        <tr><th>Fotos suspeitas</th><td>${totals.photosSuspicious}</td></tr>
        <tr><th>Pendências justificadas</th><td>${justified.length}</td></tr>
      </table>
      ${photoAlertsHtml(trip)}
      ${photosHtml(trip)}
      ${state.adminAuthenticated && pending.length ? `<button class="btn warning" data-admin-justify-trip="${trip.id}" type="button">Justificar pendências desta viagem</button>` : ''}
    </section>

    <section class="report-section">
      <h2>Eventos do Luso</h2>
      ${lusoEventsHtml(trip)}
    </section>

    <section class="report-section">
      <h2>Log da viagem</h2>
      ${logsHtml(trip)}
    </section>
  `;
}

function photoAlertsHtml(trip) {
  if (!trip.photoAlerts?.length) return '<p class="muted">Nenhum alerta de foto registrado.</p>';
  return `
    <div class="list">
      ${trip.photoAlerts.map((alert) => `
        <div class="list-item">
          <header>
            <div>
              <h3>${escapeHtml(alert.pointName)}</h3>
              <p>${formatDateTime(alert.generatedAt)} • ${alert.distanceMeters}m do ponto • ${directionLabel(alert.direction)}</p>
              ${alert.justification ? `<p>Justificativa: ${escapeHtml(alert.justification)}</p>` : ''}
            </div>
            <span class="badge ${alert.status === 'pending' ? 'danger' : alert.status === 'justified' ? 'warn' : alert.suspicious ? 'warn' : 'ok'}">${statusLabel(alert.status)}</span>
          </header>
        </div>
      `).join('')}
    </div>
  `;
}

function photosHtml(trip) {
  if (!trip.photos?.length) return '<p class="muted">Nenhuma foto registrada.</p>';
  return `
    <div class="list">
      ${trip.photos.map((photo) => `
        <div class="list-item">
          <header>
            <div>
              <h3>${escapeHtml(photo.pointName)}</h3>
              <p>${formatDateTime(photo.capturedAt)} • GPS ${Number(photo.lat).toFixed(6)}, ${Number(photo.lng).toFixed(6)} • distância ${photo.distanceMeters}m</p>
            </div>
            <span class="badge ${photo.suspicious ? 'warn' : 'ok'}">${photo.suspicious ? 'Suspeita' : 'OK'}</span>
          </header>
          ${photo.previewBase64 ? `<img class="photo-thumb" src="${photo.previewBase64}" alt="Prévia da foto ${escapeHtml(photo.pointName)}" />` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function statusLabel(status) {
  if (status === 'registered') return 'Registrada';
  if (status === 'justified') return 'Justificada';
  if (status === 'pending') return 'Pendente';
  return status || '-';
}

function lusoEventsHtml(trip) {
  if (!trip.lusoEvents?.length) return '<p class="muted">Nenhum evento do Luso registrado.</p>';
  return `
    <div class="list">
      ${trip.lusoEvents.map((event) => `
        <div class="list-item">
          <header>
            <div>
              <h3>${formatDateTime(event.at)} • ${directionLabel(event.direction)}</h3>
              <p>${event.people} pessoa(s) • Esperado ${money(event.expectedCents)} • Dinheiro ${money(event.cashCents)} • Pix ${money(event.pixCents)}</p>
            </div>
          </header>
        </div>
      `).join('')}
    </div>
  `;
}

function logsHtml(trip) {
  if (!trip.logs?.length) return '<p class="muted">Nenhum log registrado.</p>';
  return `
    <div class="list">
      ${trip.logs.map((log) => `
        <div class="list-item">
          <p><strong>${formatDateTime(log.at)}</strong> • ${escapeHtml(log.type)}</p>
          <p>${escapeHtml(log.message)}</p>
        </div>
      `).join('')}
    </div>
  `;
}

function exportReport() {
  if (!state.reportTrip) return;
  const exportData = {
    generatedAt: nowIso(),
    app: 'Controle de Van',
    trip: state.reportTrip,
    totals: getTripTotals(state.reportTrip),
    securityNote: 'Versão local: dificulta fraudes com GPS, horário, distância e logs, mas não impede adulteração avançada sem servidor.'
  };
  const textArea = $('#exportText');
  textArea.value = JSON.stringify(exportData, null, 2);
  textArea.classList.remove('hidden');
  $('#btnCopyReport').classList.remove('hidden');
}

async function copyReport() {
  const text = $('#exportText').value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Relatório copiado.');
  } catch {
    $('#exportText').select();
    document.execCommand('copy');
    showToast('Relatório selecionado para cópia.');
  }
}

function exportReportPdf() {
  if (!state.reportTrip) return;
  const trip = state.reportTrip;
  const totals = getTripTotals(trip);
  const html = `<!doctype html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Relatório Controle de Van</title>
    <style>
      body{font-family:Arial,sans-serif;margin:24px;color:#111827}h1,h2{margin:0 0 10px}section{border:1px solid #ddd;border-radius:12px;padding:14px;margin:12px 0;break-inside:avoid}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #eee;padding:8px;vertical-align:top}th{width:42%;color:#555}.small{font-size:12px;color:#555}.badge{display:inline-block;padding:4px 8px;border-radius:999px;background:#eee}.danger{background:#fee2e2}.ok{background:#dcfce7}.warn{background:#fef3c7}@media print{button{display:none}}
    </style>
  </head>
  <body>
    <button onclick="window.print()">Salvar como PDF</button>
    <h1>Controle de Van</h1>
    <p class="small">Relatório gerado em ${formatDateTime(nowIso())}. Use a opção “Salvar como PDF” da janela de impressão.</p>
    <section>
      <h2>Resumo</h2>
      <table>
        <tr><th>Data</th><td>${formatDate(trip.startedAt)}</td></tr>
        <tr><th>Início</th><td>${formatDateTime(trip.startedAt)}</td></tr>
        <tr><th>Encerramento</th><td>${formatDateTime(trip.endedAt)}</td></tr>
        <tr><th>Sentido</th><td>${directionLabel(trip.direction)}</td></tr>
        <tr><th>Van</th><td>${escapeHtml(trip.vanNumber || 'Não informada')}</td></tr>
        <tr><th>Cobrador</th><td>${escapeHtml(trip.driverName || 'Não informado')}</td></tr>
        <tr><th>Total passageiros</th><td>${totals.totalPassengers}</td></tr>
        <tr><th>Inteiras</th><td>${trip.fullPassengers}</td></tr>
        <tr><th>Luso</th><td>${trip.lusoPassengers}</td></tr>
        <tr><th>Esperado</th><td>${money(totals.expectedCents)}</td></tr>
        <tr><th>Dinheiro</th><td>${money(totals.cashCents)}</td></tr>
        <tr><th>Pix</th><td>${money(totals.pixCents)}</td></tr>
        <tr><th>Total recebido</th><td>${money(totals.receivedCents)}</td></tr>
        <tr><th>Diferença</th><td>${formatDiff(totals.diffCents)}</td></tr>
      </table>
    </section>
    <section>
      <h2>Fotos</h2>
      <table>
        <tr><th>Alertas/fotos obrigatórias</th><td>${totals.requiredPhotoAlerts}</td></tr>
        <tr><th>Fotos tiradas</th><td>${totals.photosTaken}</td></tr>
        <tr><th>Pendentes</th><td>${totals.photosPending}</td></tr>
        <tr><th>Suspeitas</th><td>${totals.photosSuspicious}</td></tr>
      </table>
    </section>
    <section><h2>Eventos do Luso</h2>${lusoEventsHtml(trip)}</section>
    <section><h2>Log</h2>${logsHtml(trip)}</section>
    <p class="small">Observação de segurança: versão local dificulta fraudes, mas não impede adulteração avançada sem servidor.</p>
    <script>setTimeout(()=>window.print(), 400);<\/script>
  </body></html>`;

  const win = window.open('', '_blank');
  if (!win) {
    showToast('O navegador bloqueou a janela do PDF. Permita pop-ups para exportar.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function renderTripDriverSelect() {
  const select = $('#tripDriverSelect');
  if (!select) return;
  const drivers = state.config.drivers || [];
  if (!drivers.length) {
    select.innerHTML = '<option value="">Nenhum cadastro encontrado</option>';
    return;
  }
  select.innerHTML = drivers.map((driver) => `<option value="${driver.id}">${escapeHtml(driver.vanNumber)} • ${escapeHtml(driver.name)}</option>`).join('');
}

function saveDriver() {
  const id = $('#driverIdInput').value;
  const name = $('#driverNameInput').value.trim();
  const vanNumber = $('#driverVanInput').value.trim();
  const note = $('#driverNoteInput').value.trim();

  if (!name || !vanNumber) {
    showToast('Preencha o nome da pessoa e o número da van.');
    return;
  }

  const driver = { id: id || uid('cadastro'), name, vanNumber, note, updatedAt: nowIso() };
  const index = state.config.drivers.findIndex((item) => item.id === id);
  if (index >= 0) state.config.drivers[index] = driver;
  else state.config.drivers.push(driver);

  state.config.drivers.sort((a, b) => String(a.vanNumber).localeCompare(String(b.vanNumber), 'pt-BR', { numeric: true }));
  saveConfig();
  clearDriverForm();
  renderDriversList();
  renderTripDriverSelect();
  renderFleetPanel();
  showToast(index >= 0 ? 'Cadastro atualizado.' : 'Cadastro salvo.');
}

function clearDriverForm() {
  $('#driverIdInput').value = '';
  $('#driverNameInput').value = '';
  $('#driverVanInput').value = '';
  $('#driverNoteInput').value = '';
  $('#btnCancelDriverEdit').classList.add('hidden');
  $('#btnSaveDriver').textContent = 'Salvar cadastro';
}

function editDriver(id) {
  const driver = state.config.drivers.find((item) => item.id === id);
  if (!driver) return;
  $('#driverIdInput').value = driver.id;
  $('#driverNameInput').value = driver.name;
  $('#driverVanInput').value = driver.vanNumber;
  $('#driverNoteInput').value = driver.note || '';
  $('#btnCancelDriverEdit').classList.remove('hidden');
  $('#btnSaveDriver').textContent = 'Atualizar cadastro';
  showToast('Editando cadastro.');
}

function removeDriver(id) {
  const driver = state.config.drivers.find((item) => item.id === id);
  if (!driver) return;
  if (state.currentTrip?.driverId === id) {
    showToast('Não é possível remover o cadastro usado na viagem em andamento.');
    return;
  }
  if (!confirm(`Remover o cadastro ${driver.vanNumber} • ${driver.name}?`)) return;
  state.config.drivers = state.config.drivers.filter((item) => item.id !== id);
  saveConfig();
  renderDriversList();
  renderTripDriverSelect();
  renderFleetPanel();
  showToast('Cadastro removido.');
}

function renderDriversList() {
  const list = $('#driversList');
  if (!list) return;
  const drivers = state.config.drivers || [];
  if (!drivers.length) {
    list.innerHTML = '<p class="muted">Nenhum cobrador/van cadastrado. Cadastre pelo menos um para iniciar viagens.</p>';
    return;
  }
  list.innerHTML = drivers.map((driver) => `
    <div class="list-item">
      <header>
        <div>
          <h3>${escapeHtml(driver.vanNumber)} • ${escapeHtml(driver.name)}</h3>
          <p>${escapeHtml(driver.note || 'Sem observação')}</p>
        </div>
      </header>
      <div class="item-actions">
        <button class="btn small secondary" data-edit-driver="${driver.id}" type="button">Editar</button>
        <button class="btn small danger-outline" data-remove-driver="${driver.id}" type="button">Remover</button>
      </div>
    </div>
  `).join('');
}

function useCurrentLocationFor(target) {
  if (!state.lastLocation) {
    refreshGps();
    showToast('GPS solicitado. Depois toque novamente para preencher.');
    return;
  }
  if (target === 'point') {
    $('#pointLatInput').value = state.lastLocation.lat.toFixed(7);
    $('#pointLngInput').value = state.lastLocation.lng.toFixed(7);
  } else if (target === 'luso') {
    $('#lusoLatInput').value = state.lastLocation.lat.toFixed(7);
    $('#lusoLngInput').value = state.lastLocation.lng.toFixed(7);
  }
  showToast('Coordenadas preenchidas com o GPS atual.');
}

function openMapPicker(target) {
  state.mapPickerTarget = target;
  state.mapPickerSelected = null;
  $('#mapModalTitle').textContent = target === 'luso' ? 'Escolher Luso no mapa' : 'Escolher ponto no mapa';
  $('#mapPickerStatus').textContent = 'Toque no mapa para posicionar o alfinete.';
  openModal('mapModal');
  setTimeout(() => initMapPicker(target), 120);
}

function initMapPicker(target) {
  const hasLeaflet = typeof L !== 'undefined';
  if (!hasLeaflet) {
    $('#mapPickerStatus').innerHTML = 'Mapa visual indisponível porque o Leaflet não carregou. Use o GPS atual ou preencha latitude/longitude manualmente.';
    return;
  }
  const currentLat = target === 'luso' ? Number($('#lusoLatInput').value) : Number($('#pointLatInput').value);
  const currentLng = target === 'luso' ? Number($('#lusoLngInput').value) : Number($('#pointLngInput').value);
  const center = Number.isFinite(currentLat) && Number.isFinite(currentLng)
    ? [currentLat, currentLng]
    : state.lastLocation
      ? [state.lastLocation.lat, state.lastLocation.lng]
      : [-12.9777, -38.5016];

  if (!state.mapPicker) {
    state.mapPicker = L.map('mapPicker').setView(center, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(state.mapPicker);
    state.mapPicker.on('click', (event) => setMapPickerMarker(event.latlng.lat, event.latlng.lng));
  } else {
    state.mapPicker.setView(center, 14);
    setTimeout(() => state.mapPicker.invalidateSize(), 80);
  }

  if (Number.isFinite(currentLat) && Number.isFinite(currentLng)) setMapPickerMarker(currentLat, currentLng);
  setTimeout(() => state.mapPicker.invalidateSize(), 160);
}

function setMapPickerMarker(lat, lng) {
  state.mapPickerSelected = { lat, lng };
  if (!state.mapPicker) return;
  if (!state.mapPickerMarker) state.mapPickerMarker = L.marker([lat, lng], { draggable: true }).addTo(state.mapPicker);
  else state.mapPickerMarker.setLatLng([lat, lng]);
  state.mapPickerMarker.on('dragend', (event) => {
    const pos = event.target.getLatLng();
    state.mapPickerSelected = { lat: pos.lat, lng: pos.lng };
    $('#mapPickerStatus').textContent = `Alfinete: ${pos.lat.toFixed(7)}, ${pos.lng.toFixed(7)}`;
  });
  $('#mapPickerStatus').textContent = `Alfinete: ${lat.toFixed(7)}, ${lng.toFixed(7)}`;
}

function confirmMapPoint() {
  if (!state.mapPickerSelected) {
    showToast('Toque no mapa para colocar o alfinete.');
    return;
  }
  const { lat, lng } = state.mapPickerSelected;
  if (state.mapPickerTarget === 'luso') {
    $('#lusoLatInput').value = lat.toFixed(7);
    $('#lusoLngInput').value = lng.toFixed(7);
  } else {
    $('#pointLatInput').value = lat.toFixed(7);
    $('#pointLngInput').value = lng.toFixed(7);
  }
  closeModal('mapModal');
  showToast('Coordenadas preenchidas pelo mapa.');
}

function buildRoutePoints(direction) {
  const points = [...(state.config.photoPoints || [])]
    .filter((point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)))
    .filter((point) => point.direction === 'both' || point.direction === direction)
    .map((point) => ({
      name: point.name,
      lat: Number(point.lat),
      lng: Number(point.lng),
      order: Number(point.order || 0),
      kind: 'foto'
    }));

  const luso = state.config.lusoPoint;
  if (Number.isFinite(Number(luso?.lat)) && Number.isFinite(Number(luso?.lng))) {
    points.push({ name: luso.name || 'Luso', lat: Number(luso.lat), lng: Number(luso.lng), order: 999, kind: 'luso' });
  }
  points.sort((a, b) => a.order - b.order);
  return direction === 'volta' ? points.reverse() : points;
}

function latestLocationFromTrip(trip) {
  const candidates = [];
  if (trip.lastKnownLocation) candidates.push({ ...trip.lastKnownLocation, label: 'GPS real da viagem' });
  for (const photo of trip.photos || []) candidates.push({ lat: Number(photo.lat), lng: Number(photo.lng), at: photo.capturedAt, accuracy: 0, label: 'última foto' });
  for (const alert of trip.photoAlerts || []) candidates.push({ lat: Number(alert.lat), lng: Number(alert.lng), at: alert.generatedAt, accuracy: Number(alert.distanceMeters || 0), label: 'último alerta' });
  return candidates
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))[0] || null;
}

function estimatePositionOnRoute(trip) {
  const route = buildRoutePoints(trip.direction);
  const latest = latestLocationFromTrip(trip);
  const now = Date.now();
  const routeMinutes = Math.max(5, Number(trip.routeDurationMinutes || state.config.routeDurationMinutes || 60));

  if (latest && (!trip.endedAt || new Date(latest.at).getTime() >= new Date(trip.startedAt).getTime())) {
    return {
      lat: latest.lat,
      lng: latest.lng,
      source: trip.lastKnownLocation && latest.at === trip.lastKnownLocation.at ? 'real' : 'aproximada',
      confidence: trip.lastKnownLocation && latest.at === trip.lastKnownLocation.at ? 'alta' : 'média',
      details: `${latest.label || 'registro'} em ${formatDateTime(latest.at)}`,
      updatedAt: latest.at
    };
  }

  if (route.length >= 2) {
    const elapsed = Math.max(0, now - new Date(trip.startedAt).getTime());
    const progress = Math.min(0.98, elapsed / (routeMinutes * 60 * 1000));
    const segmentFloat = progress * (route.length - 1);
    const segmentIndex = Math.min(route.length - 2, Math.floor(segmentFloat));
    const localProgress = segmentFloat - segmentIndex;
    const a = route[segmentIndex];
    const b = route[segmentIndex + 1];
    return {
      lat: a.lat + (b.lat - a.lat) * localProgress,
      lng: a.lng + (b.lng - a.lng) * localProgress,
      source: 'estimada',
      confidence: 'baixa',
      details: `estimada pela rota entre ${a.name} e ${b.name}, usando ${Math.round(progress * 100)}% do tempo médio`,
      updatedAt: nowIso()
    };
  }

  if (route.length === 1) {
    return {
      lat: route[0].lat,
      lng: route[0].lng,
      source: 'estimada',
      confidence: 'baixa',
      details: `estimada no único ponto cadastrado: ${route[0].name}`,
      updatedAt: nowIso()
    };
  }

  return { source: 'sem-posicao', confidence: 'nenhuma', details: 'sem GPS e sem rota suficiente cadastrada' };
}

function getFleetRows() {
  const drivers = state.config.drivers || [];
  const rows = [];
  for (const driver of drivers) {
    const trips = [];
    if (state.currentTrip?.driverId === driver.id) trips.push(state.currentTrip);
    trips.push(...state.history.filter((trip) => trip.driverId === driver.id));
    trips.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));
    const trip = trips[0];
    if (!trip) {
      rows.push({ driver, trip: null, position: { source: 'sem-posicao', confidence: 'nenhuma', details: 'nenhuma viagem encontrada para esta van' } });
      continue;
    }
    rows.push({ driver, trip, position: estimatePositionOnRoute(trip) });
  }
  return rows;
}

function renderFleetPanel() {
  renderVanLocationsPanel();
  renderFleetMap();
}

function renderVanLocationsPanel() {
  const list = $('#vanLocationsPanel');
  if (!list) return;
  const rows = getFleetRows();
  if (!rows.length) {
    list.innerHTML = '<p class="muted">Cadastre vans para visualizar o painel.</p>';
    $('#fleetMapStatus').textContent = 'Nenhuma van cadastrada.';
    return;
  }
  list.innerHTML = rows.map(({ driver, trip, position }) => {
    const hasPos = Number.isFinite(position.lat) && Number.isFinite(position.lng);
    const sourceClass = `fleet-source-${String(position.source || 'sem-posicao').replaceAll(' ', '-')}`;
    return `
      <div class="list-item ${sourceClass}">
        <header>
          <div>
            <h3>${escapeHtml(driver.vanNumber)} • ${escapeHtml(driver.name)}</h3>
            <p>${trip ? `${trip.endedAt ? 'Última viagem encerrada' : 'Viagem em andamento'} • ${directionLabel(trip.direction)} • início ${formatDateTime(trip.startedAt)}` : 'Sem viagem registrada'}</p>
            <p>Localização: <strong>${position.source === 'real' ? 'GPS real' : position.source === 'estimada' ? 'estimada' : position.source === 'aproximada' ? 'aproximada' : 'sem posição'}</strong> • confiança ${position.confidence}. ${escapeHtml(position.details || '')}</p>
            ${hasPos ? `<p>${position.lat.toFixed(6)}, ${position.lng.toFixed(6)} • atualizado/recalculado em ${formatDateTime(position.updatedAt || nowIso())}</p>` : ''}
          </div>
          <span class="badge ${position.source === 'real' ? 'ok' : hasPos ? 'warn' : ''}">${position.source === 'real' ? 'Real' : hasPos ? 'Estimado' : 'Sem GPS'}</span>
        </header>
      </div>
    `;
  }).join('');
}

function refreshFleetPanel() {
  const activeTripHasPosition = Boolean(state.currentTrip && !state.currentTrip.endedAt);
  const shouldRequestGps = activeTripHasPosition && 'geolocation' in navigator;

  if (!shouldRequestGps) {
    renderFleetPanel();
    showToast('Alfinetes das vans atualizados pelo último dado disponível.');
    return;
  }

  $('#fleetMapStatus').textContent = 'Atualizando vans: buscando GPS da van ativa e recalculando estimativas...';
  navigator.geolocation.getCurrentPosition(
    (position) => {
      recordLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        at: nowIso()
      }, 'gps_admin_refresh');
      renderFleetPanel();
      showToast('Alfinetes das vans atualizados.');
    },
    (error) => {
      renderFleetPanel();
      showToast(`GPS não atualizado: ${error.message}. Usei a última posição e as estimativas.`);
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
  );
}

function renderFleetMap() {
  const status = $('#fleetMapStatus');
  const mapBox = $('#fleetMap');
  if (!status || !mapBox) return;
  const rows = getFleetRows().filter((row) => Number.isFinite(row.position.lat) && Number.isFinite(row.position.lng));

  if (state.config.googleMapsApiKey) {
    renderGoogleFleetMap(rows).catch((error) => {
      console.warn('Falha ao carregar Google Maps. Usando mapa livre.', error);
      status.textContent = 'Google Maps não carregou. Usando mapa livre como alternativa.';
      renderLeafletFleetMap(rows);
    });
    return;
  }

  renderLeafletFleetMap(rows);
}

function renderLeafletFleetMap(rows) {
  const status = $('#fleetMapStatus');
  const mapBox = $('#fleetMap');
  if (!status || !mapBox) return;
  if (state.googleFleetMap) {
    state.googleFleetMarkers.forEach((marker) => marker.setMap(null));
    state.googleFleetMarkers = [];
    state.googleFleetMap = null;
    mapBox.innerHTML = '';
  }
  if (typeof L === 'undefined') {
    status.innerHTML = 'Mapa visual indisponível porque o Leaflet não carregou. Atualize novamente quando houver internet ou configure uma chave Google Maps.';
    return;
  }

  if (!state.fleetMap) {
    state.fleetMap = L.map('fleetMap');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(state.fleetMap);
  }
  setTimeout(() => state.fleetMap.invalidateSize(), 60);
  state.fleetMarkers.forEach((marker) => marker.remove());
  state.fleetMarkers = [];

  if (!rows.length) {
    state.fleetMap.setView([-12.9777, -38.5016], 12);
    status.textContent = 'Nenhuma van com coordenada real ou estimada para mostrar no mapa.';
    return;
  }

  const bounds = [];
  rows.forEach(({ driver, trip, position }) => {
    const latLng = [position.lat, position.lng];
    bounds.push(latLng);
    const icon = L.divIcon({
      className: `fleet-marker ${position.source === 'real' ? 'fleet-marker-real' : 'fleet-marker-estimated'}`,
      html: `<span>${escapeHtml(driver.vanNumber || 'Van')}</span>`,
      iconSize: [72, 34],
      iconAnchor: [36, 34]
    });
    const marker = L.marker(latLng, { icon }).addTo(state.fleetMap);
    marker.bindPopup(`
      <div class="van-popup">
        <strong>${escapeHtml(driver.vanNumber)} • ${escapeHtml(driver.name)}</strong>
        <span>${trip ? `${trip.endedAt ? 'Encerrada' : 'Em andamento'} • ${directionLabel(trip.direction)}` : 'Sem viagem'}</span>
        <span>${position.source === 'real' ? 'GPS real' : 'Posição estimada/aproximada'}</span>
        <small>${escapeHtml(position.details || '')}</small>
        <small>Atualizado/recalculado em ${formatDateTime(position.updatedAt || nowIso())}</small>
      </div>
    `);
    state.fleetMarkers.push(marker);
  });
  state.fleetMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
  status.textContent = `${rows.length} alfinete(s) atualizado(s) no mapa. Aperte Atualizar vans para buscar GPS da van ativa e recalcular as estimativas das demais.`;
}

function loadGoogleMapsScript() {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (state.googleMapsPromise) return state.googleMapsPromise;

  state.googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(state.config.googleMapsApiKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error('Google Maps não ficou disponível.'));
    script.onerror = () => reject(new Error('Falha ao baixar Google Maps.'));
    document.head.appendChild(script);
  });

  return state.googleMapsPromise;
}

async function renderGoogleFleetMap(rows) {
  const status = $('#fleetMapStatus');
  const mapBox = $('#fleetMap');
  if (!status || !mapBox) return;
  const maps = await loadGoogleMapsScript();

  if (state.fleetMap) {
    state.fleetMap.remove();
    state.fleetMap = null;
    mapBox.innerHTML = '';
  }
  state.fleetMarkers.forEach((marker) => marker.remove?.());
  state.fleetMarkers = [];
  state.googleFleetMarkers.forEach((marker) => marker.setMap(null));
  state.googleFleetMarkers = [];

  if (!state.googleFleetMap) {
    state.googleFleetMap = new maps.Map(mapBox, {
      center: { lat: -12.9777, lng: -38.5016 },
      zoom: 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true
    });
  }

  if (!rows.length) {
    state.googleFleetMap.setCenter({ lat: -12.9777, lng: -38.5016 });
    state.googleFleetMap.setZoom(12);
    status.textContent = 'Google Maps ativo, mas nenhuma van tem coordenada real ou estimada.';
    return;
  }

  const bounds = new maps.LatLngBounds();
  const info = new maps.InfoWindow();
  rows.forEach(({ driver, trip, position }) => {
    const pos = { lat: position.lat, lng: position.lng };
    bounds.extend(pos);
    const marker = new maps.Marker({
      position: pos,
      map: state.googleFleetMap,
      title: `${driver.vanNumber} • ${driver.name}`,
      label: {
        text: String(driver.vanNumber || 'Van').slice(0, 8),
        fontWeight: '700'
      }
    });
    marker.addListener('click', () => {
      info.setContent(`
        <div class="van-popup">
          <strong>${escapeHtml(driver.vanNumber)} • ${escapeHtml(driver.name)}</strong><br>
          <span>${trip ? `${trip.endedAt ? 'Encerrada' : 'Em andamento'} • ${directionLabel(trip.direction)}` : 'Sem viagem'}</span><br>
          <span>${position.source === 'real' ? 'GPS real' : 'Posição estimada/aproximada'}</span><br>
          <small>${escapeHtml(position.details || '')}</small><br>
          <small>Atualizado/recalculado em ${formatDateTime(position.updatedAt || nowIso())}</small>
        </div>
      `);
      info.open({ anchor: marker, map: state.googleFleetMap });
    });
    state.googleFleetMarkers.push(marker);
  });
  state.googleFleetMap.fitBounds(bounds);
  status.textContent = `${rows.length} alfinete(s) atualizado(s) no Google Maps. Aperte Atualizar vans para buscar GPS da van ativa e recalcular as estimativas das demais.`;
}


function renderAdmin() {
  $('#fareFullInput').value = (state.config.fareFullCents / 100).toFixed(2);
  $('#fareLusoInput').value = (state.config.fareLusoCents / 100).toFixed(2);
  $('#routeDurationInput').value = state.config.routeDurationMinutes || 60;
  $('#googleMapsKeyInput').value = state.config.googleMapsApiKey || '';
  $('#lusoNameInput').value = state.config.lusoPoint?.name || 'Luso';
  $('#lusoLatInput').value = state.config.lusoPoint?.lat || '';
  $('#lusoLngInput').value = state.config.lusoPoint?.lng || '';
  $('#lusoRadiusInput').value = state.config.lusoPoint?.radius || 120;
  renderDriversList();
  renderPointsList();
  renderFleetPanel();
  renderAdminReports();
}

function adminLogin() {
  const pin = $('#adminPinInput').value.trim();
  if (pin !== String(state.config.adminPin)) {
    showToast('PIN incorreto.');
    return;
  }
  state.adminAuthenticated = true;
  $('#adminPinInput').value = '';
  showScreen('adminScreen');
}

function adminLogout() {
  state.adminAuthenticated = false;
  showScreen('homeScreen');
}

function saveFares() {
  state.config.fareFullCents = centsFromInput($('#fareFullInput').value, 500);
  state.config.fareLusoCents = centsFromInput($('#fareLusoInput').value, 250);
  state.config.routeDurationMinutes = Math.max(5, Math.round(Number($('#routeDurationInput').value) || 60));
  state.config.googleMapsApiKey = $('#googleMapsKeyInput').value.trim();
  saveConfig();
  renderFleetPanel();
  showToast('Configurações salvas. Novas viagens usarão esses valores.');
}

function savePoint() {
  const id = $('#pointIdInput').value;
  const name = $('#pointNameInput').value.trim();
  const lat = Number($('#pointLatInput').value);
  const lng = Number($('#pointLngInput').value);
  const radius = Math.max(1, Math.round(Number($('#pointRadiusInput').value) || 80));
  const order = Math.max(1, Math.round(Number($('#pointOrderInput').value) || 1));
  const direction = $('#pointDirectionInput').value;
  const required = $('#pointRequiredInput').checked;

  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    showToast('Preencha nome, latitude e longitude válidos.');
    return;
  }

  const point = { id: id || uid('ponto'), name, lat, lng, radius, order, direction, required };
  const index = state.config.photoPoints.findIndex((item) => item.id === id);
  if (index >= 0) state.config.photoPoints[index] = point;
  else state.config.photoPoints.push(point);

  state.config.photoPoints.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  saveConfig();
  clearPointForm();
  renderPointsList();
  showToast(index >= 0 ? 'Ponto atualizado.' : 'Ponto adicionado.');
}

function clearPointForm() {
  $('#pointIdInput').value = '';
  $('#pointNameInput').value = '';
  $('#pointLatInput').value = '';
  $('#pointLngInput').value = '';
  $('#pointRadiusInput').value = '80';
  $('#pointOrderInput').value = '1';
  $('#pointDirectionInput').value = 'both';
  $('#pointRequiredInput').checked = true;
  $('#btnCancelPointEdit').classList.add('hidden');
  $('#btnSavePoint').textContent = 'Salvar ponto';
}

function editPoint(id) {
  const point = state.config.photoPoints.find((item) => item.id === id);
  if (!point) return;
  $('#pointIdInput').value = point.id;
  $('#pointNameInput').value = point.name;
  $('#pointLatInput').value = point.lat;
  $('#pointLngInput').value = point.lng;
  $('#pointRadiusInput').value = point.radius;
  $('#pointOrderInput').value = point.order;
  $('#pointDirectionInput').value = point.direction;
  $('#pointRequiredInput').checked = Boolean(point.required);
  $('#btnCancelPointEdit').classList.remove('hidden');
  $('#btnSavePoint').textContent = 'Atualizar ponto';
  showToast('Editando ponto.');
}

function removePoint(id) {
  const point = state.config.photoPoints.find((item) => item.id === id);
  if (!point) return;
  if (!confirm(`Remover o ponto ${point.name}? Isso não apaga dados de viagens antigas.`)) return;
  state.config.photoPoints = state.config.photoPoints.filter((item) => item.id !== id);
  saveConfig();
  renderPointsList();
  showToast('Ponto removido.');
}

function simulatePoint(id) {
  const point = state.config.photoPoints.find((item) => item.id === id);
  if (!point) return;
  if (!state.currentTrip) {
    showToast('Inicie uma viagem para simular chegada ao ponto.');
    return;
  }
  recordLocation({ lat: Number(point.lat), lng: Number(point.lng), accuracy: 5, at: nowIso(), simulated: true }, 'simulacao_ponto');
  renderGpsStatus();
  checkRouteTriggers(true);
  showToast(`Simulação de chegada em ${point.name}.`);
}

function renderPointsList() {
  const list = $('#pointsList');
  const points = state.config.photoPoints || [];
  if (!points.length) {
    list.innerHTML = '<p class="muted">Nenhum ponto cadastrado. Cadastre pontos obrigatórios para gerar alertas durante a viagem.</p>';
    return;
  }

  list.innerHTML = points.map((point) => `
    <div class="list-item">
      <header>
        <div>
          <h3>${escapeHtml(point.order)}. ${escapeHtml(point.name)}</h3>
          <p>${Number(point.lat).toFixed(6)}, ${Number(point.lng).toFixed(6)} • raio ${point.radius}m • ${directionLabel(point.direction)} • ${point.required ? 'obrigatório' : 'opcional'}</p>
        </div>
      </header>
      <div class="item-actions">
        <button class="btn small secondary" data-edit-point="${point.id}" type="button">Editar</button>
        <button class="btn small danger-outline" data-remove-point="${point.id}" type="button">Remover</button>
        <button class="btn small ghost" data-simulate-point="${point.id}" type="button">Simular chegada</button>
      </div>
    </div>
  `).join('');
}

function saveLusoPoint() {
  const name = $('#lusoNameInput').value.trim() || 'Luso';
  const lat = $('#lusoLatInput').value === '' ? '' : Number($('#lusoLatInput').value);
  const lng = $('#lusoLngInput').value === '' ? '' : Number($('#lusoLngInput').value);
  const radius = Math.max(1, Math.round(Number($('#lusoRadiusInput').value) || 120));

  if ((lat !== '' && !Number.isFinite(lat)) || (lng !== '' && !Number.isFinite(lng))) {
    showToast('Latitude e longitude do Luso precisam ser válidas.');
    return;
  }

  state.config.lusoPoint = { name, lat, lng, radius };
  saveConfig();
  showToast('Ponto Luso salvo.');
}

function renderAdminReports() {
  const list = $('#adminReportsList');
  const allTrips = state.currentTrip ? [state.currentTrip, ...state.history] : [...state.history];
  if (!allTrips.length) {
    list.innerHTML = '<p class="muted">Nenhuma viagem disponível.</p>';
    return;
  }
  list.innerHTML = allTrips.map((trip) => {
    const totals = getTripTotals(trip);
    return `
      <div class="list-item">
        <header>
          <div>
            <h3>${trip.endedAt ? 'Encerrada' : 'Em andamento'} • ${formatDateTime(trip.startedAt)}</h3>
            <p>${directionLabel(trip.direction)} • ${totals.totalPassengers} passageiros • ${money(totals.expectedCents)} esperado • ${totals.photosPending} pendente(s) • ${totals.photosSuspicious} suspeita(s)</p>
          </div>
        </header>
        <button class="btn secondary" data-open-report="${trip.id}" type="button">Ver relatório</button>
      </div>
    `;
  }).join('');
}

function justifyPendingForTrip(id) {
  if (!state.adminAuthenticated) return;
  const trip = state.history.find((item) => item.id === id) || (state.currentTrip?.id === id ? state.currentTrip : null);
  if (!trip) return;

  const pending = trip.photoAlerts.filter((alert) => alert.status === 'pending');
  if (!pending.length) {
    showToast('Não há pendências nessa viagem.');
    return;
  }

  const reason = prompt('Digite a justificativa administrativa para as pendências:');
  if (!reason || !reason.trim()) return;

  pending.forEach((alert) => {
    alert.status = 'justified';
    alert.justifiedAt = nowIso();
    alert.justification = reason.trim();
  });

  const log = { id: uid('log'), at: nowIso(), type: 'pendencia_justificada_admin', message: `${pending.length} pendência(s) justificada(s) pelo administrador.`, data: { reason: reason.trim() } };
  trip.logs.push(log);

  if (state.currentTrip?.id === id) saveCurrentTrip();
  else saveHistory();

  state.reportTrip = trip;
  renderReport(trip);
  renderAdminReports();
  showToast('Pendências justificadas pelo administrador.');
}

function clearHistory() {
  if (!state.history.length) return;
  if (!confirm('Limpar todo o histórico de viagens encerradas? A viagem em andamento não será apagada.')) return;
  state.history = [];
  saveHistory();
  renderHistory();
  showToast('Histórico limpo.');
}

function bindEvents() {
  $('#btnBack').addEventListener('click', goBack);
  $('#btnNewTrip').addEventListener('click', () => showScreen('newTripScreen'));
  $('#btnHistory').addEventListener('click', () => showScreen('historyScreen'));
  $('#btnAdmin').addEventListener('click', () => showScreen(state.adminAuthenticated ? 'adminScreen' : 'adminLoginScreen'));
  $('#btnAdminLogin').addEventListener('click', adminLogin);
  $('#adminPinInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') adminLogin(); });
  $('#btnAdminLogout').addEventListener('click', adminLogout);

  document.body.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;

    if (target.dataset.startDirection) createTrip(target.dataset.startDirection);
    if (target.dataset.passengerDelta) changePassengers(Number(target.dataset.passengerDelta));
    if (target.dataset.payment) changePayment(target.dataset.payment, Number(target.dataset.delta));
    if (target.dataset.closeModal) closeModal(target.dataset.closeModal);
    if (target.dataset.openPhoto) openPhotoAlert(target.dataset.openPhoto, target.dataset.alertId);
    if (target.dataset.openReport) openReportById(target.dataset.openReport);
    if (target.dataset.editPoint) editPoint(target.dataset.editPoint);
    if (target.dataset.removePoint) removePoint(target.dataset.removePoint);
    if (target.dataset.simulatePoint) simulatePoint(target.dataset.simulatePoint);
    if (target.dataset.editDriver) editDriver(target.dataset.editDriver);
    if (target.dataset.removeDriver) removeDriver(target.dataset.removeDriver);
    if (target.dataset.openMap) openMapPicker(target.dataset.openMap);
    if (target.dataset.adminJustifyTrip) justifyPendingForTrip(target.dataset.adminJustifyTrip);
  });

  $('#btnOpenLuso').addEventListener('click', openLusoModal);
  $('#btnSaveLusoEvent').addEventListener('click', saveLusoEvent);
  $('#btnRefreshGps').addEventListener('click', refreshGps);
  $('#photoInput').addEventListener('change', handlePhotoInput);
  $('#btnEndTrip').addEventListener('click', endTrip);
  $('#btnSaveTripReport').addEventListener('click', saveTripFromReport);
  $('#btnExportReport').addEventListener('click', exportReport);
  $('#btnExportPdf').addEventListener('click', exportReportPdf);
  $('#btnCopyReport').addEventListener('click', copyReport);
  $('#btnClearHistory').addEventListener('click', clearHistory);
  $('#btnSaveFares').addEventListener('click', saveFares);
  $('#btnSaveDriver').addEventListener('click', saveDriver);
  $('#btnCancelDriverEdit').addEventListener('click', clearDriverForm);
  $('#btnSavePoint').addEventListener('click', savePoint);
  $('#btnCancelPointEdit').addEventListener('click', clearPointForm);
  $('#btnSaveLusoPoint').addEventListener('click', saveLusoPoint);
  $('#btnUseCurrentForPoint').addEventListener('click', () => useCurrentLocationFor('point'));
  $('#btnUseCurrentForLuso').addEventListener('click', () => useCurrentLocationFor('luso'));
  $('#btnMapUseCurrent').addEventListener('click', () => {
    if (!state.lastLocation) {
      refreshGps();
      showToast('GPS solicitado. Depois toque novamente.');
      return;
    }
    setMapPickerMarker(state.lastLocation.lat, state.lastLocation.lng);
    if (state.mapPicker) state.mapPicker.setView([state.lastLocation.lat, state.lastLocation.lng], 16);
  });
  $('#btnConfirmMapPoint').addEventListener('click', confirmMapPoint);
  $('#btnRefreshFleetPanel').addEventListener('click', refreshFleetPanel);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service worker não registrado:', error);
    });
  }
}

function init() {
  normalizeConfig();
  if (!state.config || !state.config.adminPin) {
    state.config = structuredCloneSafe(DEFAULT_CONFIG);
  }
  saveConfig();

  buildQuickButtons();
  bindEvents();
  renderTripDriverSelect();
  renderHome();
  registerServiceWorker();

  if (state.currentTrip) startGeolocation();
}

document.addEventListener('DOMContentLoaded', init);
