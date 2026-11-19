'use strict';

/* ---------- Утилиты ---------- */

const app = document.getElementById('app');

const store = {
  get(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* хранилище недоступно */ }
  }
};

// crypto.randomUUID есть только в защищённом контексте (https или localhost).
// При открытии с телефона по http://192.168.… его нет, поэтому нужен запасной вариант.
const uid = () => (window.crypto && typeof crypto.randomUUID === 'function')
  ? crypto.randomUUID()
  : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// Вызов функции из onclick с безопасно экранированными аргументами
const call = (fn, ...args) => esc(fn + '(' + args.map(a => JSON.stringify(a)).join(',') + ')');
const btn = (text, action, cls = '') => '<button type="button" class="' + cls + '" onclick="' + action + '">' + esc(text) + '</button>';
const title = t => '<h1>' + esc(t) + '</h1>';
const pad = n => String(n).padStart(2, '0');
const fmtTime = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const toLocalInput = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const isUrl = s => /^https?:\/\//i.test(s || '');

/* ---------- Справочники ---------- */

const ENERGY = ['Мало', 'Средне', 'Много'];
const TIMES = [[2, '2 минуты'], [5, '5 минут'], [15, '15 минут'], [Infinity, '30+ минут']];
const WANTS = ['Не знаю', 'Общение', 'Смена обстановки', 'Видимый результат', 'Отдых', 'Движение'];
const CATS = ['Отдых', 'Движение', 'Общение', 'Смена обстановки', 'Видимый результат'];
const DURATIONS = ['Не знаю', '≈5 минут', '≈15 минут', '≈30 минут', 'Час или больше'];
const REASONS = ['Не то настроение', 'Всё слишком сложно', 'Нет сил ни на что', 'Другое'];
const FEELINGS = ['Лучше', 'Так же', 'Хуже'];
const STATUSES = ['Начала', 'Завершила', 'Не получилось'];

// energy: 0 — мало сил, 1 — средне, 2 — много. simpler — id более простой версии.
const BUILTIN = [
  {id: 'charge-2', name: 'Зарядка 2 минуты', min: 2, energy: 0, cat: 'Движение'},
  {id: 'charge-5', name: 'Зарядка 5 минут', min: 5, energy: 0, cat: 'Движение', simpler: 'charge-2'},
  {id: 'charge-10', name: 'Утренняя зарядка', min: 10, energy: 1, cat: 'Движение', simpler: 'charge-5', map: 'charge'},
  {id: 'window', name: 'Подойти к окну', min: 2, energy: 0, cat: 'Смена обстановки'},
  {id: 'walk', name: 'Прогулка', min: 15, energy: 0, cat: 'Смена обстановки', simpler: 'window', map: 'walk'},
  {id: 'run', name: 'Бег с ходьбой', min: 30, energy: 2, cat: 'Смена обстановки', simpler: 'walk', map: 'run'},
  {id: 'gym', name: 'Зал', min: 45, energy: 2, cat: 'Движение', map: 'gym'},
  {id: 'aqua', name: 'Аквааэробика', min: 45, energy: 1, cat: 'Движение', map: 'aqua'},
  {id: 'voice', name: 'Отправить голосовое', min: 2, energy: 0, cat: 'Общение'},
  {id: 'call', name: 'Позвонить подруге', min: 10, energy: 1, cat: 'Общение', simpler: 'voice'},
  {id: 'post', name: 'Поделиться постом', min: 2, energy: 0, cat: 'Общение'},
  {id: 'vacuum', name: 'Пропылесосить ковёр', min: 5, energy: 1, cat: 'Видимый результат'},
  {id: 'clean', name: 'Уборка', min: 15, energy: 1, cat: 'Видимый результат', simpler: 'vacuum'},
  {id: 'iron', name: 'Погладить одну вещь', min: 5, energy: 0, cat: 'Видимый результат'},
  {id: 'frame-step', name: 'Выбрать участок рамы', min: 2, energy: 0, cat: 'Видимый результат'},
  {id: 'frame', name: 'Покрасить раму', min: 60, energy: 2, cat: 'Видимый результат', simpler: 'frame-step'},
  {id: 'song', name: 'Полежать одну песню', min: 4, energy: 0, cat: 'Отдых'},
  {id: 'album', name: 'Послушать альбом', min: 30, energy: 0, cat: 'Отдых', simpler: 'song'},
  {id: 'article', name: 'Прочитать статью', min: 10, energy: 0, cat: 'Отдых'}
];

/* ---------- Карта тела: области, описания и утверждения с источниками ---------- */

const SOURCES = {
  odphp: {
    title: 'Physical Activity Guidelines for Americans, 2nd ed. (2018)',
    url: 'https://odphp.health.gov/sites/default/files/2019-09/Physical_Activity_Guidelines_2nd_edition.pdf'
  }
};

// Утверждение показывается только с источником, страницами, условиями и периодом.
// Номера страниц совпадают с нумерацией PDF. reviewed — когда текст сверяли с источником.
const CLAIMS = {
  calm: {text: 'После занятия тревога может ослабнуть — ты можешь почувствовать себя спокойнее', period: 'после занятия',
    cond: 'Одно занятие умеренной или высокой интенсивности', src: 'odphp', pages: 'с. 20, 39–40', reviewed: '2026-11-19'},
  bp: {text: 'В день занятия давление может снизиться', period: 'после занятия',
    cond: 'Одно занятие умеренной или высокой интенсивности', src: 'odphp', pages: 'с. 20, 36', reviewed: '2026-11-19'},
  heart: {text: 'Снижается риск болезней сердца и сосудов, включая инфаркт и инсульт', period: 'при регулярных занятиях',
    cond: 'Заметно — от 150 минут умеренной активности в неделю; польза начинается и с меньшего, а больше — ещё лучше', src: 'odphp', pages: 'с. 32, 35', reviewed: '2026-11-19'},
  muscle: {text: 'Мышцы, которые работают в упражнении, сохраняют и наращивают силу', period: 'при регулярных занятиях',
    cond: 'Силовые упражнения с постепенным ростом нагрузки; эффект касается только работающих мышц. Рекомендация — 2 и более дня в неделю', src: 'odphp', pages: 'с. 30, 38', reviewed: '2026-11-19'},
  bone: {text: 'Нагрузки с ударом о землю или с весом помогают сохранять плотность костей', period: 'при регулярных занятиях',
    cond: 'Бег, быстрая ходьба, прыжки, упражнения с весами умеренной или высокой интенсивности', src: 'odphp', pages: 'с. 30, 38', reviewed: '2026-11-19'},
  water: {text: 'Аквааэробика относится к аэробной нагрузке умеренной интенсивности', period: 'во время занятия',
    cond: 'Занятие в группе в обычном темпе', src: 'odphp', pages: 'с. 59, табл. 4-1', reviewed: '2026-11-19'}
};

const ZONES = {heart: 'Сердце и лёгкие', legs: 'Ноги', arms: 'Руки', back: 'Спина', core: 'Корпус'};

const MAP_ACTS = [['run', 'run'], ['gym', 'gym'], ['aqua', 'aqua'], ['walk', 'walk'], ['charge', 'charge-10']];
const GYM_VARIANTS = ['ноги', 'спина', 'всё тело'];

function mapZones(act, variant) {
  const heartMove = {about: 'При движении сердце доставляет больше крови работающим мышцам.'};
  const heartGym = {about: 'Во время подхода сердце снабжает работающие мышцы кровью.'};
  const pull = 'В тяговых упражнениях работают мышцы спины и рук.';
  switch (act) {
    case 'run': return {
      heart: {...heartMove, claims: ['calm', 'bp', 'heart']},
      legs: {about: 'Мышцы ног поочерёдно сокращаются и поддерживают шаг.', claims: ['bone']}
    };
    case 'walk': return {
      heart: {about: 'При быстром шаге сердце доставляет больше крови работающим мышцам. Утверждения ниже относятся к быстрой ходьбе — медленная прогулка считается лёгкой нагрузкой.', claims: ['calm', 'heart']},
      legs: {about: 'Мышцы ног поддерживают шаг.', claims: []}
    };
    case 'charge': return {
      heart: {about: 'Пульс немного учащается, тело разогревается.', claims: []},
      arms: {about: 'Махи и круги руками разминают плечи.', claims: []},
      legs: {about: 'Приседания и шаги на месте включают мышцы ног.', claims: []}
    };
    case 'aqua': return {
      heart: {...heartMove, claims: ['water', 'calm', 'heart']},
      arms: {about: 'При движении рук вода создаёт сопротивление.', claims: []},
      legs: {about: 'Ноги преодолевают сопротивление воды.', claims: []}
    };
    case 'gym':
      if (variant === 'спина') return {
        heart: {...heartGym, claims: []},
        back: {about: pull, claims: ['muscle']},
        arms: {about: pull, claims: ['muscle']}
      };
      if (variant === 'всё тело') return {
        heart: {...heartGym, claims: []},
        legs: {about: 'В упражнениях на ноги нагрузка зависит от выбранного движения.', claims: ['muscle', 'bone']},
        back: {about: pull, claims: ['muscle']},
        arms: {about: pull, claims: ['muscle']},
        core: {about: 'Мышцы корпуса удерживают положение тела в упражнениях.', claims: ['muscle']}
      };
      return {
        heart: {...heartGym, claims: []},
        legs: {about: 'В упражнениях на ноги нагрузка зависит от выбранного движения.', claims: ['muscle', 'bone']},
        core: {about: 'Мышцы корпуса удерживают положение тела в упражнениях.', claims: ['muscle']}
      };
  }
  return {};
}

function silhouette(zones, selected) {
  const part = (zone, shape) => {
    const on = !!zones[zone];
    const cls = 'part' + (on ? ' on' : '') + (on && zone === 'heart' ? ' heart' : '') + (zone === selected ? ' sel' : '');
    const attrs = on ? ' onclick="' + call('pickZone', zone) + '" role="button" tabindex="0" aria-label="' + ZONES[zone] + '"' : '';
    return '<g class="' + cls + '"' + attrs + '>' + shape + '</g>';
  };
  const figure = (ox, view) =>
    '<circle class="part" cx="' + (ox + 50) + '" cy="28" r="20"/>' +
    '<rect class="part" x="' + (ox + 43) + '" y="46" width="14" height="12" rx="4"/>' +
    part('arms', '<rect x="' + (ox + 4) + '" y="62" width="15" height="98" rx="7.5"/><rect x="' + (ox + 81) + '" y="62" width="15" height="98" rx="7.5"/>') +
    (view === 'front'
      ? part('heart', '<rect x="' + (ox + 23) + '" y="58" width="54" height="56" rx="16"/>') +
        part('core', '<rect x="' + (ox + 25) + '" y="117" width="50" height="50" rx="13"/>')
      : part('back', '<rect x="' + (ox + 23) + '" y="58" width="54" height="109" rx="16"/>')) +
    part('legs', '<rect x="' + (ox + 27) + '" y="171" width="21" height="118" rx="10"/><rect x="' + (ox + 52) + '" y="171" width="21" height="118" rx="10"/>') +
    '<text class="fig-label" x="' + (ox + 50) + '" y="308" text-anchor="middle">' + (view === 'front' ? 'спереди' : 'сзади') + '</text>';
  return '<svg class="body-svg" viewBox="0 0 240 316" role="img" aria-label="Силуэт: подсвечены задействованные области">' +
    figure(14, 'front') + figure(126, 'back') + '</svg>';
}

/* ---------- Данные ---------- */

// Старые идеи хранились массивами [название, минуты, силы, категория, null, шаг]
function loadIdeas() {
  const raw = store.get('ideas', []);
  let migrated = false;
  const list = raw.map(r => {
    if (!Array.isArray(r)) return r;
    migrated = true;
    return {id: 'idea-' + uid(), name: r[0], min: +r[1] || 5, energy: +r[2] || 0, cat: r[3] || 'Отдых', step: r[5] || '', shelf: true};
  });
  if (migrated) store.set('ideas', list);
  return list;
}

let ideas = loadIdeas();
let entries = store.get('journal', []);
let sessions = store.get('sessions', []);
sessions.forEach(s => { if (!s.outcome) s.outcome = 'closed'; });

const all = () => BUILTIN.concat(ideas);
const byId = id => all().find(a => a.id === id);
const saveEntries = () => store.set('journal', entries);
const saveSessions = () => store.set('sessions', sessions);
const saveIdeas = () => store.set('ideas', ideas);

let link = null;      // id эпизода «Я залипла», к которому привяжется следующее занятие
let session = null;   // текущая попытка выбора (для замеров H1 и H2)
let queue = [], cards = [];
let pick = {energy: 0, time: 1, want: 'Не знаю'};
let mapState = {act: 'run', variant: 'ноги', zone: null, from: 'home'};

/* ---------- Попытки выбора ---------- */

function openSession(entry) {
  closeSession();
  session = {id: uid(), entry, openedAt: Date.now(), filters: null, shown: [], chosenId: null, chosenAt: null, outcome: null, reason: null, helped: null, mapOpened: entry === 'map'};
  sessions.push(session);
  saveSessions();
}

function closeSession() {
  if (session && !session.outcome) { session.outcome = 'closed'; saveSessions(); }
  session = null;
}

window.addEventListener('pagehide', () => { if (session && !session.outcome) { session.outcome = 'closed'; saveSessions(); } });

/* ---------- Главная ---------- */

function home(notice) {
  closeSession();
  link = null;
  app.innerHTML = title('Что поможет мне сейчас?') +
    (notice ? '<p class="notice">' + esc(notice) + '</p>' : '') +
    activeBanner() +
    '<section class="hero"><div><h2>Что даст мне тренировка?</h2><p>Выбери занятие и коснись области на карте тела.</p>' +
    btn('Открыть карту', 'openMap()', 'primary') + '</div><img src="body.webp" alt=""></section>' +
    '<section><h2>Не знаю, чем заняться</h2><p>Сколько сейчас сил и свободного времени?</p>' +
    btn('Подобрать занятие', 'startPicker()', 'primary') + btn('Я залипла', 'scrollPage()') + '</section>';
}

function activeBanner() {
  const live = entries.filter(e => e.status === 'Начала' && Date.now() - e.time < 12 * 3600000);
  return live.map(e => '<p class="notice">Идёт: <b>' + esc(e.name) + '</b> с ' + fmtTime(e.time) + ' ' +
    btn('Продолжить', call('resume', e.id), 'primary') + '</p>').join('');
}

/* ---------- Подбор ---------- */

function startPicker() {
  openSession('pick');
  picker();
}

function chipRow(label, key, options) {
  return '<div class="field"><span class="lbl">' + label + '</span><div class="chips">' +
    options.map(([value, text]) => btn(text, call('setPick', key, value), 'chip' + (pick[key] === value ? ' on' : ''))).join('') +
    '</div></div>';
}

function setPick(key, value) { pick[key] = value; picker(); }

function picker() {
  app.innerHTML = title('Подобрать занятие') + '<section>' +
    chipRow('Силы', 'energy', ENERGY.map((t, i) => [i, t])) +
    chipRow('Время', 'time', TIMES.map((t, i) => [i, t[1]])) +
    chipRow('Чего хочется?', 'want', WANTS.map(w => [w, w])) +
    btn('Показать варианты', 'choose()', 'primary') + '</section>';
}

function choose() {
  const mins = TIMES[pick.time][0];
  let cand = all().filter(a => a.min <= mins && a.energy <= pick.energy);
  // Простую версию не показываем рядом с полной — она доступна через «Ещё проще»
  const hidden = new Set(cand.map(a => a.simpler).filter(Boolean));
  cand = cand.filter(a => !hidden.has(a.id));
  queue = cand
    .map(a => ({id: a.id, score: Math.random() * (a.shelf ? 2 : 1) + (a.cat === pick.want ? 4 : 0)}))
    .sort((x, y) => y.score - x.score)
    .map(x => x.id);
  cards = [];
  while (cards.length < 3 && queue.length) {
    const idx = queue.findIndex(id => !cards.some(c => byId(c).cat === byId(id).cat));
    cards.push(queue.splice(Math.max(0, idx), 1)[0]);
  }
  if (session) { session.filters = {...pick, time: TIMES[pick.time][1]}; session.shown.push(...cards); saveSessions(); }
  results();
}

function results() {
  const list = cards.map((id, k) => {
    const a = byId(id);
    return '<article><small>' + esc(a.cat) + ' · ' + a.min + ' мин</small><h3>' + esc(a.name) + '</h3>' +
      (a.step ? '<p>' + (isUrl(a.step) ? '<a target="_blank" rel="noopener" href="' + esc(a.step) + '">Открыть ссылку</a>' : esc(a.step)) + '</p>' : '') +
      btn('Начать', call('start', a.id), 'primary') +
      (a.simpler ? btn('Ещё проще', call('simpler', k)) : '') +
      btn('Заменить', call('swap', k)) +
      (a.map ? btn('Что даст?', call('mapFromCard', a.id)) : '') +
      '</article>';
  }).join('');
  const empty = '<section><p><b>Варианты закончились.</b> Изменить время или силы?</p>' +
    btn('Изменить условия', 'picker()', 'primary') + btn('Добавить идею', 'shelf()') + '</section>';
  app.innerHTML = title('Можно попробовать') + list +
    (cards.length ? '' : empty) +
    (cards.length && !queue.length ? '<p class="muted">Других вариантов с этими условиями пока нет.</p>' : '') +
    (cards.length ? btn('Изменить условия', 'picker()') : '') +
    btn('Ничего не подошло', 'nothingFit()');
}

function simpler(k) {
  const next = byId(cards[k]).simpler;
  if (!next) return;
  cards[k] = next;
  queue = queue.filter(id => id !== next);
  if (session) { session.shown.push(next); session.simplerTaps = (session.simplerTaps || 0) + 1; saveSessions(); }
  results();
}

function swap(k) {
  if (queue.length) {
    const idx = queue.findIndex(id => !cards.some((c, j) => j !== k && byId(c).cat === byId(id).cat));
    cards[k] = queue.splice(Math.max(0, idx), 1)[0];
    if (session) { session.shown.push(cards[k]); saveSessions(); }
  } else {
    cards.splice(k, 1);
  }
  results();
}

function nothingFit() {
  app.innerHTML = title('Ничего не подошло') +
    '<section><p>Можно отметить причину — а можно и нет.</p>' +
    REASONS.map(r => btn(r, call('closeAttempt', r))).join('') +
    '<p>' + btn('Без причины', call('closeAttempt', '')) + '</p></section>';
}

function closeAttempt(reason) {
  if (session) { session.outcome = 'nothing_fit'; session.reason = reason || null; saveSessions(); }
  session = null;
  home('Попытка сохранена.');
}

/* ---------- Занятие ---------- */

function start(id, variant) {
  const a = byId(id);
  if (!a) return;
  if (session && !session.chosenId) {
    session.chosenId = id;
    session.chosenAt = Date.now();
    session.outcome = 'chosen';
    saveSessions();
  }
  session = null;
  const e = {id: uid(), kind: 'activity', activityId: a.id, name: a.name + (variant ? ' — ' + variant : ''), variant: variant || null,
    time: Date.now(), status: 'Начала', min: a.min, link};
  entries.unshift(e);
  saveEntries();
  link = null;
  activePage(e);
}

function resume(id) {
  const e = entries.find(x => x.id === id);
  if (e) activePage(e);
}

function activePage(e) {
  app.innerHTML = title(e.name) + '<section><p>Занятие начато в ' + fmtTime(e.time) + '. План — ' + e.min + ' мин, любой отрезок засчитывается.</p>' +
    btn('Готово', call('finish', e.id), 'primary') + btn('Не получилось', call('stopEntry', e.id)) + btn('К истории', 'historyPage()') + '</section>';
}

function finish(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  if (e.status === 'Завершила') { historyPage(); return; } // повторное нажатие не дублирует запись
  e.status = 'Завершила';
  e.completedAt = Date.now();
  const actual = Math.round((e.completedAt - e.time) / 60000);
  e.actualMin = actual >= 1 ? actual : null;
  saveEntries();
  app.innerHTML = title('Готово') + '<p>' + esc(e.name) + '</p><section><h2>Как ты сейчас — по сравнению с тем, что было до?</h2>' +
    FEELINGS.map(v => btn(v, call('rate', id, v))).join('') + btn('Пропустить', call('rate', id, '')) + '</section>';
}

function rate(id, value) {
  const e = entries.find(x => x.id === id);
  if (e) { e.feeling = value; saveEntries(); }
  historyPage();
}

function stopEntry(id) {
  const e = entries.find(x => x.id === id);
  if (e) { e.status = 'Не получилось'; saveEntries(); }
  historyPage();
}

/* ---------- Карта тела ---------- */

function openMap() {
  openSession('map');
  mapState = {act: 'run', variant: 'ноги', zone: null, from: 'home'};
  bodyMap();
}

function mapFromCard(id) {
  if (session) { session.mapOpened = true; saveSessions(); }
  mapState = {act: byId(id).map, variant: 'ноги', zone: null, from: 'results'};
  bodyMap();
}

function setMap(key, value) { mapState[key] = value; mapState.zone = null; bodyMap(); }
function pickZone(zone) { mapState.zone = zone; bodyMap(); }

function bodyMap() {
  const zones = mapZones(mapState.act, mapState.variant);
  const keys = Object.keys(zones);
  if (!zones[mapState.zone]) mapState.zone = keys[0];
  const z = zones[mapState.zone];
  const actName = byId(MAP_ACTS.find(m => m[0] === mapState.act)[1]).name;
  const claims = z.claims.map(id => {
    const c = CLAIMS[id], s = SOURCES[c.src];
    return '<div class="claim"><small class="period">' + esc(c.period) + '</small><p><b>' + esc(c.text) + '</b></p>' +
      '<details><summary>Источник и условия</summary><p class="muted">Условия: ' + esc(c.cond) + '.</p>' +
      '<p><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title) + '</a>, ' + esc(c.pages) + '</p>' +
      '<p class="muted">Сверено с источником ' + new Date(c.reviewed).toLocaleDateString('ru') + '.</p></details></div>';
  }).join('');
  app.innerHTML = title('Моё тело') +
    (mapState.from === 'results' ? '<p>' + btn('← К вариантам', 'results()') + '</p>' : '') +
    '<div class="chips">' + MAP_ACTS.map(([key, id]) => btn(byId(id).name, call('setMap', 'act', key), 'chip' + (mapState.act === key ? ' on' : ''))).join('') + '</div>' +
    (mapState.act === 'gym' ? '<div class="chips">' + GYM_VARIANTS.map(v => btn(v, call('setMap', 'variant', v), 'chip' + (mapState.variant === v ? ' on' : ''))).join('') + '</div>' : '') +
    '<section><div class="map">' + silhouette(zones, mapState.zone) + '</div>' +
    '<div class="chips">' + keys.map(k => btn(ZONES[k], call('pickZone', k), 'chip' + (mapState.zone === k ? ' on' : ''))).join('') + '</div>' +
    '<h3>' + ZONES[mapState.zone] + '</h3><p>' + esc(z.about) + '</p>' + claims + '</section>' +
    btn('Начать: ' + actName + (mapState.act === 'gym' ? ' — ' + mapState.variant : ''), 'helpedPage()', 'primary');
}

function helpedPage() {
  app.innerHTML = title('Помогло ли это мне решиться?') + '<section><p>Ответ необязателен.</p>' +
    [['yes', 'Да'], ['no', 'Нет'], ['unsure', 'Не знаю']].map(([v, t]) => btn(t, call('helped', v))).join('') +
    '<p>' + btn('Пропустить', call('helped', '')) + '</p></section>';
}

function helped(value) {
  if (session && value) { session.helped = value; saveSessions(); }
  const id = MAP_ACTS.find(m => m[0] === mapState.act)[1];
  start(id, mapState.act === 'gym' ? mapState.variant : null);
}

/* ---------- Я залипла ---------- */

function scrollPage() {
  openSession('scroll');
  app.innerHTML = title('Я залипла') + '<section>' +
    '<label>Где? <select id="scroll-src">' + ['Reels', 'X', 'YouTube', 'Другое'].map(x => '<option>' + x + '</option>').join('') + '</select></label>' +
    '<label>Сколько времени? <select id="scroll-dur">' + DURATIONS.map(x => '<option>' + x + '</option>').join('') + '</select></label>' +
    btn('Сохранить и подобрать', 'logScroll(true)', 'primary') + btn('Сохранить и закрыть', 'logScroll(false)') + '</section>';
}

function logScroll(next) {
  const e = {id: uid(), kind: 'scroll', name: document.getElementById('scroll-src').value, time: Date.now(), status: 'Скроллинг', info: document.getElementById('scroll-dur').value};
  entries.unshift(e);
  saveEntries();
  if (next) { link = e.id; picker(); } // попытка продолжается в подборе
  else home('Эпизод сохранён.');
}

/* ---------- Полка идей ---------- */

function shelf() {
  closeSession();
  link = null;
  app.innerHTML = title('Полка идей') +
    '<form onsubmit="addIdea(event)"><section>' +
    '<label>Идея <input name="name" required maxlength="120"></label>' +
    '<label>Минуты <input name="min" type="number" value="5" min="1" max="999" required></label>' +
    '<label>Силы <select name="energy">' + ENERGY.map(x => '<option>' + x + '</option>').join('') + '</select></label>' +
    '<label>Категория <select name="cat">' + CATS.map(x => '<option>' + x + '</option>').join('') + '</select></label>' +
    '<label>Первый шаг или ссылка <input name="step"></label>' +
    '<button class="primary">Сохранить идею</button></section></form>' +
    ideas.map(a => '<article><small>' + esc(a.cat) + ' · ' + a.min + ' мин · ' + ENERGY[a.energy].toLowerCase() + '</small><h3>' + esc(a.name) + '</h3>' +
      (a.step ? '<p>' + (isUrl(a.step) ? '<a target="_blank" rel="noopener" href="' + esc(a.step) + '">Открыть ссылку</a>' : esc(a.step)) + '</p>' : '') +
      btn('Начать', call('start', a.id)) + btn('Убрать', call('removeIdea', a.id)) + '</article>').join('');
}

function addIdea(ev) {
  ev.preventDefault();
  const f = ev.target.elements;
  const name = f.name.value.trim();
  if (!name) return;
  ideas.push({id: 'idea-' + uid(), name, min: +f.min.value || 5, energy: f.energy.selectedIndex, cat: f.cat.value, step: f.step.value.trim(), shelf: true});
  saveIdeas();
  shelf();
}

function removeIdea(id) {
  if (confirm('Убрать идею с полки?')) { ideas = ideas.filter(a => a.id !== id); saveIdeas(); shelf(); }
}

/* ---------- История ---------- */

function historyPage() {
  closeSession();
  link = null;
  app.innerHTML = title('История') + btn('+ Отметить сделанное', 'manual()', 'primary') +
    (entries.length ? '' : '<p>Здесь появятся твои занятия и заметки о скроллинге.</p>') +
    entries.map(e => {
      const linked = e.link && entries.find(x => x.id === e.link);
      const old = e.status === 'Начала' && Date.now() - e.time >= 12 * 3600000;
      const dur = e.actualMin ? e.actualMin + ' мин' : (e.min && e.status === 'Завершила' ? '≈' + e.min + ' мин' : '');
      const details = [e.info, dur, e.feeling, e.status === 'Завершила' && !e.feeling ? 'без оценки' : '', e.note, linked ? 'после: ' + linked.name : ''].filter(Boolean).join(' · ');
      return '<article><small>' + new Date(e.time).toLocaleString('ru') + ' · ' + esc(e.status) + '</small><h3>' + esc(e.name) + '</h3>' +
        (details ? '<p>' + esc(details) + '</p>' : '') +
        (old ? '<p class="muted">Начато больше 12 часов назад.</p>' : '') +
        (e.status === 'Начала' ? btn('Завершила', call('finish', e.id)) + btn('Не получилось', call('stopEntry', e.id)) : '') +
        btn('Изменить', call('edit', e.id)) + btn('Удалить', call('removeEntry', e.id)) + '</article>';
    }).join('');
}

function removeEntry(id) {
  if (confirm('Удалить запись?')) { entries = entries.filter(e => e.id !== id); saveEntries(); historyPage(); }
}

function manual() { edit(''); }

function edit(id) {
  const e = entries.find(x => x.id === id) || {status: 'Завершила', time: Date.now()};
  const isScroll = e.status === 'Скроллинг';
  const sel = (name, opts, cur) => '<select name="' + name + '">' + opts.map(([v, t]) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select>';
  app.innerHTML = title(id ? 'Изменить запись' : 'Отметить сделанное') +
    '<form onsubmit="saveEdit(event,' + esc(JSON.stringify(id)) + ')"><section>' +
    '<label>Название <input name="name" required value="' + esc(e.name) + '"></label>' +
    '<label>Когда <input name="time" type="datetime-local" value="' + toLocalInput(e.time) + '"></label>' +
    (isScroll
      ? '<label>Сколько времени ' + sel('info', DURATIONS.map(d => [d, d]), e.info) + '</label>'
      : '<label>Длительность, мин <input name="min" type="number" min="0" value="' + esc(e.actualMin || e.min) + '"></label>' +
        '<label>Статус ' + sel('status', STATUSES.map(s => [s, s]), e.status) + '</label>' +
        '<label>Самочувствие ' + sel('feeling', [['', 'без оценки']].concat(FEELINGS.map(f => [f, f])), e.feeling || '') + '</label>') +
    '<label>Заметка <textarea name="note">' + esc(e.note) + '</textarea></label>' +
    '<button class="primary">Сохранить</button>' + btn('Отмена', 'historyPage()') + '</section></form>';
}

function saveEdit(ev, id) {
  ev.preventDefault();
  const f = ev.target.elements;
  let e = entries.find(x => x.id === id);
  if (!e) { e = {id: uid(), kind: 'activity', status: 'Завершила'}; entries.unshift(e); }
  e.name = f.name.value.trim() || e.name;
  const t = new Date(f.time.value).getTime();
  e.time = isNaN(t) ? (e.time || Date.now()) : t;
  e.note = f.note.value;
  if (f.info) e.info = f.info.value;
  if (f.min) {
    const m = parseInt(f.min.value, 10);
    e.actualMin = m > 0 ? m : null;
    e.status = f.status.value;
    e.feeling = f.feeling.value;
    if (e.status === 'Завершила' && !e.completedAt) e.completedAt = Date.now();
  }
  entries.sort((a, b) => b.time - a.time);
  saveEntries();
  historyPage();
}

/* ---------- Проверка гипотез ---------- */

function report() {
  closeSession();
  link = null;
  const h1 = sessions.filter(s => s.entry === 'pick' || s.entry === 'scroll').slice(-5).reverse();
  const fast = h1.filter(s => s.outcome === 'chosen' && s.chosenAt - s.openedAt < 60000).length;
  const answers = sessions.filter(s => s.helped);
  const count = v => answers.filter(s => s.helped === v).length;
  const mapOpens = sessions.filter(s => s.mapOpened).length;
  const row = s => {
    let result;
    if (s.outcome === 'chosen') {
      const sec = Math.round((s.chosenAt - s.openedAt) / 1000);
      result = sec < 60 ? '<b>' + sec + ' с</b>' : Math.floor(sec / 60) + ' мин ' + (sec % 60) + ' с';
    } else if (s.outcome === 'nothing_fit') {
      result = 'ничего не подошло' + (s.reason ? ' · ' + esc(s.reason.toLowerCase()) : '');
    } else {
      result = 'без выбора';
    }
    return '<tr><td>' + new Date(s.openedAt).toLocaleString('ru', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) +
      ' · ' + (s.entry === 'scroll' ? 'после залипания' : 'подбор') + '</td><td>' + result + '</td></tr>';
  };
  app.innerHTML = title('Проверка') +
    '<section><h2>Выбор меньше чем за минуту</h2><p class="big">' + fast + ' из ' + (h1.length || 5) + '</p><p class="muted">Цель — 4 из 5. Считаются подбор и «Я залипла», время пишется само.</p>' +
    (h1.length ? '<table>' + h1.map(row).join('') + '</table>' : '<p>Попыток пока нет.</p>') + '</section>' +
    '<section><h2>Карта помогла решиться</h2><p class="muted">Карту открывали ' + mapOpens + ' раз. Время на карте не учитывается.</p>' +
    '<p>Да — ' + count('yes') + ' · Нет — ' + count('no') + ' · Не знаю — ' + count('unsure') + '</p></section>';
}

home();
