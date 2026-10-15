/* So Creativ’Nails — réservation en ligne : prestations → date et heure → coordonnées → acompte.
   Réglages dans config.js ; données dans data.js ; contrats Make et Stripe : RESERVATION-AGENDA.md et worker/README.md.
   Aucun tarif n'étant publié par l'onglerie, data.js porte des prix INDICATIFS (policy.priceMode = 'indicatif', d'après les onglerie voisines) :
   ils sont affichés comme tels, le total est « indicatif » et seul l'acompte fixe (policy.depositEuros) est encaissé en ligne.
   Avec priceMode = 'confirme' (prix donnés par Sophie), le total devient ferme et la cliente peut aussi régler la totalité. */
(() => {
  'use strict';

  const CFG = window.SCN_CFG || {};
  const D = window.SCN || { groups: [], hours: {}, policy: {} };
  const API = () => window.SCNApi || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const pad = n => String(n).padStart(2, '0');
  const eurC = c => (c % 100 ? (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }));
  const root = $('#reserver');
  if (!root) return;

  /* ---------- données ---------- */
  const ITEMS = {};
  D.groups.forEach(g => g.subs.forEach(s => s.items.forEach(i => { ITEMS[i.id] = Object.assign({ group: g.id, sub: s.title, cents: i.price == null ? null : Math.round(i.price * 100) }, i); })));
  const POL = Object.assign({ depositEuros: 15, lateCancelHours: 24, lateArrivalMin: 15 }, D.policy);
  const DEP_C = Math.round(POL.depositEuros * 100);
  const MAXMIN = CFG.MAX_TOTAL_MIN || 180;
  /* Acompte : montant fixe, jamais supérieur au total quand celui-ci est connu (calcul en centimes). */
  const depositOf = totalC => (totalC == null ? DEP_C : Math.min(totalC, DEP_C));
  const anyPrice = Object.values(ITEMS).some(i => i.cents != null);
  const INDIC = POL.priceMode === 'indicatif';                    // prix estimés : à confirmer par Sophie
  const fmtDur = m => (m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + pad(m % 60) : ''));
  const fmtDelay = h => (h % 24 === 0 && h >= 72 ? h / 24 + ' jours' : h + ' h');
  const priceTxt = i => (i.cents == null ? '' : (i.from ? 'dès ' : '') + eurC(i.cents) + (i.qty ? ' / ongle' : ''));
  const priceHtml = i => (i.from ? '<small>dès</small> ' : '') + eurC(i.cents) + (i.qty ? ' <small>/ ongle</small>' : '');
  const bookable = i => i.bookable !== false;

  /* ---------- dates (chaînes AAAA-MM-JJ, calculs à midi) ---------- */
  const keyOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const monthStart = k => k.slice(0, 8) + '01';
  const addMonths = (k, n) => { const d = parse(k); d.setDate(1); d.setMonth(d.getMonth() + n); return keyOf(d); };
  const fmtLong = k => parse(k).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtShort = k => parse(k).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtHour = t => Math.floor(t / 60) + ' h ' + pad(t % 60);
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  const hhmm = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  const todayKey = keyOf(new Date());
  const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const windowsOf = k => { if ((D.closed || []).includes(k)) return []; const h = D.hours[parse(k).getDay()]; return h ? h.map(w => [toMin(w[0]), toMin(w[1])]) : []; };

  /* ---------- état ---------- */
  const S = { notice: '', group: D.groups[0] ? D.groups[0].id : '', cart: [], qty: {}, date: null, time: null, step: 1, month: monthStart(todayKey), busy: null, sending: false, ref: '', pay: 'deposit', inView: false };
  const qtyOf = id => S.qty[id] || 1;
  const known = () => S.cart.length > 0 && S.cart.every(id => ITEMS[id].cents != null);
  const lineC = id => (ITEMS[id].cents == null ? null : ITEMS[id].cents * qtyOf(id));
  const lineMin = id => ITEMS[id].min * qtyOf(id);
  const totalC = () => (known() ? S.cart.reduce((a, id) => a + lineC(id), 0) : null);
  const totalMin = () => S.cart.reduce((a, id) => a + lineMin(id), 0);
  const isMain = (id, group) => !ITEMS[id].addon && ITEMS[id].group === group;
  const hasMains = () => S.cart.some(id => isMain(id, 'mains'));
  /* une finition (baby boomer, French, nail art…) s'ajoute à une prestation principale des mains */
  const orphan = () => S.cart.find(id => ITEMS[id].addon === 'mains' && !hasMains());
  const needsInspo = () => S.cart.some(id => ITEMS[id].group === 'nailart');
  const canFull = () => known() && !INDIC;                         // la totalité n'est encaissée que sur des prix confirmés
  const dueNow = () => (S.pay === 'full' && canFull() ? totalC() : depositOf(totalC()));
  const PHONE = CFG.PHONE_DISPLAY || '', TEL = CFG.PHONE_TEL || '';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  /* ---------- étape 1 : carte des prestations ---------- */
  const tabs = $('#tabs'), list = $('#menuList');
  function buildMenu() {
    tabs.innerHTML = D.groups.map(g => '<button type="button" class="tab' + (g.id === S.group ? ' is-on' : '') + '" role="tab" data-g="' + g.id + '" aria-selected="' + (g.id === S.group) + '">' + g.title + '<sup data-n="' + g.id + '"></sup></button>').join('');
    list.innerHTML = D.groups.map(g => {
      const bk = g.subs.some(s => s.items.some(bookable));
      const note = !bk ? '' : (INDIC
        ? '<p class="mgroup__note"><b>Tarifs indicatifs</b>, calculés d’après les onglerie de Manosque : Sophie vous confirme le prix exact avant le rendez-vous. La durée indiquée est celle du créneau réservé ; l’acompte de ' + eurC(DEP_C) + ' est déduit du total.</p>'
        : (anyPrice
          ? '<p class="mgroup__note">La durée indiquée est celle du créneau réservé ; l’acompte de ' + eurC(DEP_C) + ' est déduit du total.</p>'
          : '<p class="mgroup__note">La durée indiquée est celle du créneau réservé. <b>Sophie vous confirme le tarif</b> avant le rendez-vous ; l’acompte de ' + eurC(DEP_C) + ' est déduit du total.</p>'));
      return '<section class="mgroup' + (g.id === S.group ? ' is-on' : '') + '" data-g="' + g.id + '" aria-label="' + esc(g.title) + '">' +
        '<div class="mgroup__head"><span class="mgroup__k">' + g.kicker + '</span><h3>' + g.title + '</h3><p>' + g.intro + '</p></div>' + note +
        g.subs.map(s => '<div class="msub" data-sub="' + esc(s.title) + '">' + (g.subs.length > 1 ? '<h4 class="msub__t">' + s.title + '</h4>' : '') + s.items.map(it => row(ITEMS[it.id])).join('') + '</div>').join('') +
        '</section>';
    }).join('');
  }
  function row(i) {
    const tags = (i.addon ? '<span class="tag">Finition</span>' : '') + (i.qty ? '<span class="tag">Au nombre d’ongles</span>' : '') + (!bookable(i) ? '<span class="tag">Sur demande</span>' : '');
    const action = bookable(i)
      ? '<span class="mrow__qty"></span><button type="button" class="mrow__add" aria-pressed="false" aria-label="Ajouter : ' + esc(i.name) + '"><svg aria-hidden="true"><use href="#i-plus"/></svg></button>'
      : '<a class="mrow__call" href="tel:' + TEL + '"><svg aria-hidden="true"><use href="#i-phone"/></svg>Appeler</a>';
    const meta = bookable(i)
      ? '<span title="Durée du créneau réservé">≈ ' + fmtDur(i.min) + (i.qty ? ' / ongle' : '') + '</span>' + (i.cents != null ? '<span class="mrow__price"' + (INDIC ? ' title="Tarif indicatif, confirmé par Sophie"' : '') + '>' + priceHtml(i) + (INDIC ? '<sup class="ind">indicatif</sup>' : '') + '</span>' : '')
      : '<span>' + PHONE + '</span>';
    return '<article class="mrow" data-id="' + i.id + '"><div><h5 class="mrow__name">' + i.name + '</h5>' + (tags ? '<div class="mrow__tags">' + tags + '</div>' : '') + (i.desc ? '<button type="button" class="mrow__more" aria-expanded="false">En savoir plus</button>' : '') + '</div>' +
      '<div class="mrow__right"><div class="mrow__meta">' + meta + '</div>' + action + '</div>' +
      (i.desc ? '<p class="mrow__desc">' + esc(i.desc) + '</p>' : '') + '</article>';
  }
  tabs.addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) setGroup(b.dataset.g); });
  function setGroup(id) {
    S.group = id;
    $$('.tab', tabs).forEach(t => { const on = t.dataset.g === id; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', String(on)); });
    $$('.mgroup', list).forEach(g => g.classList.toggle('is-on', g.dataset.g === id));
  }
  const qtyHtml = id => '<span class="qty" data-q="' + id + '"><button type="button" data-dq="-1" aria-label="Moins"><svg aria-hidden="true"><use href="#i-minus"/></svg></button><output>' + qtyOf(id) + '</output><button type="button" data-dq="1" aria-label="Plus"><svg aria-hidden="true"><use href="#i-plus"/></svg></button></span>';
  list.addEventListener('click', e => {
    const more = e.target.closest('.mrow__more');
    if (more) { const r = more.closest('.mrow'); const open = r.classList.toggle('is-open'); more.setAttribute('aria-expanded', String(open)); more.textContent = open ? 'Réduire' : 'En savoir plus'; return; }
    const dq = e.target.closest('[data-dq]');
    if (dq) { setQty(dq.closest('[data-q]').dataset.q, qtyOf(dq.closest('[data-q]').dataset.q) + Number(dq.dataset.dq)); return; }
    const add = e.target.closest('.mrow__add'); if (!add) return;
    toggle(add.closest('.mrow').dataset.id);
  });
  let warnTimer;
  function toggle(id, force) {
    if (!ITEMS[id] || !bookable(ITEMS[id])) return;
    const i = S.cart.indexOf(id);
    if (i >= 0 && force !== true) { S.cart.splice(i, 1); delete S.qty[id]; }
    else if (i < 0) {
      if (totalMin() + ITEMS[id].min > MAXMIN) { warn('Un rendez-vous ne peut pas dépasser ' + fmtDur(MAXMIN) + ' (une plage d’ouverture). Retirez une prestation ou réservez un second rendez-vous.'); return; }
      S.cart.push(id); if (ITEMS[id].qty) S.qty[id] = 1;
    }
    afterChange();
  }
  function setQty(id, n) {
    const max = ITEMS[id].qty || 1;
    n = Math.max(1, Math.min(max, n));
    if (n > qtyOf(id) && totalMin() + ITEMS[id].min > MAXMIN) { warn('Un rendez-vous ne peut pas dépasser ' + fmtDur(MAXMIN) + '.'); return; }
    S.qty[id] = n; afterChange();
  }
  function afterChange() {
    if (S.date && S.time != null && !slotsFor(S.date).includes(S.time)) S.time = null;   // le créneau choisi n'est peut-être plus valable (durée différente)
    refresh();
  }
  function warn(msg) {
    const el = $('#sumList'); let w = $('#sumWarn');
    if (!w) { w = document.createElement('li'); w.id = 'sumWarn'; w.className = 'sum__empty sum__warn'; el.appendChild(w); }
    w.textContent = msg; clearTimeout(warnTimer); warnTimer = setTimeout(() => w.remove(), 5000);
  }

  /* ---------- récapitulatif et suggestions ---------- */
  function refresh() {
    $$('.mrow', list).forEach(r => {
      const id = r.dataset.id, on = S.cart.includes(id);
      r.classList.toggle('is-sel', on);
      const b = $('.mrow__add', r); if (!b) return;
      b.setAttribute('aria-pressed', String(on));
      b.innerHTML = '<svg aria-hidden="true"><use href="#' + (on ? 'i-check' : 'i-plus') + '"/></svg>';
      const q = $('.mrow__qty', r); q.innerHTML = on && ITEMS[id].qty ? qtyHtml(id) : '';
    });
    D.groups.forEach(g => { const n = S.cart.filter(id => ITEMS[id].group === g.id).length; const s = $('[data-n="' + g.id + '"]', tabs); if (s) s.textContent = n ? n : ''; });
    const ul = $('#sumList');
    const lonely = orphan();
    ul.innerHTML = S.cart.length
      ? S.cart.map(id => {
          const it = ITEMS[id], lc = lineC(id);
          return '<li><span>' + it.name + (it.qty ? ' <small>× ' + qtyOf(id) + '</small>' : '') + '<br><small>≈ ' + fmtDur(lineMin(id)) + '</small></span><span class="sum__r">' + (it.qty ? qtyHtml(id) : '') + (lc != null ? '<b>' + eurC(lc) + '</b>' : '') + '<button type="button" class="rm" data-rm="' + id + '" aria-label="Retirer ' + esc(it.name) + '">×</button></span></li>';
        }).join('') + (lonely ? '<li class="sum__empty sum__warn">« ' + ITEMS[lonely].name + ' » s’ajoute à une prestation : choisissez d’abord une pose, un remplissage ou un vernis.</li>' : '')
      : '<li class="sum__empty">Aucune prestation sélectionnée.</li>';
    $('#sumDur').textContent = S.cart.length ? '≈ ' + fmtDur(totalMin()) : '0 min';
    const tot = $('#sumTotal'), tc = totalC();
    tot.textContent = tc != null ? eurC(tc) : 'À confirmer'; tot.classList.toggle('is-tbc', tc == null);
    $('#sumTotal').closest('div').querySelector('dt').textContent = tc != null ? (INDIC ? 'Total indicatif' : 'Total') : 'Tarif';
    $('#sumDeposit').textContent = eurC(dueNow());
    $('#sumDepLabel').textContent = S.pay === 'full' && canFull() ? 'À régler en ligne' : 'Acompte';
    $$('[data-delay]').forEach(el => { el.textContent = fmtDelay(POL.lateCancelHours); });
    $$('[data-deposit]').forEach(el => { el.textContent = eurC(DEP_C); });
    const when = $('#sumWhenRow');
    if (S.date && S.time != null) { when.hidden = false; $('#sumWhen').textContent = fmtShort(S.date) + ' · ' + fmtHour(S.time); } else when.hidden = true;
    suggestions();
    side();
    nav();
  }
  function suggestions() {
    const box = $('#suggest'), row = $('#suggestRow');
    const picks = [];
    if (hasMains() && S.step === 1 && !S.cart.some(id => ITEMS[id].group === 'nailart')) picks.push('nailart-main', 'french', 'baby-boomer');
    row.innerHTML = picks.filter(id => ITEMS[id]).map(id => '<button type="button" class="chip-add" data-sg="' + id + '"><svg aria-hidden="true"><use href="#i-plus"/></svg>' + ITEMS[id].name.replace(/, par ongle.*/, ', par ongle').replace(/ dessiné à la main/, '') + '</button>').join('');
    box.hidden = !picks.length;
  }
  $('#suggestRow').addEventListener('click', e => { const b = e.target.closest('[data-sg]'); if (b) toggle(b.dataset.sg, true); });
  $('#sumList').addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]'); if (rm) { toggle(rm.dataset.rm); return; }
    const dq = e.target.closest('[data-dq]'); if (dq) setQty(dq.closest('[data-q]').dataset.q, qtyOf(dq.closest('[data-q]').dataset.q) + Number(dq.dataset.dq));
  });
  /* sur téléphone, le récapitulatif est une barre fixe en bas : visible seulement dans la section de réservation */
  const side0 = $('#flowSide');
  new IntersectionObserver(en => { S.inView = en[0].isIntersecting; side(); }, { threshold: 0, rootMargin: '-10% 0px -10% 0px' }).observe($('.flow'));
  function side() { side0.classList.toggle('is-on', S.inView && S.cart.length > 0 && S.step < 5); }

  /* ---------- navigation entre étapes ---------- */
  const btnNext = $('#btnNext'), btnBack = $('#btnBack'), btnLabel = $('#btnNextLabel');
  function nav() {
    const s = S.step;
    btnBack.hidden = s === 1 || s === 5;
    side0.hidden = s === 5;
    btnLabel.textContent = ({ 1: 'Choisir la date', 2: 'Mes informations', 3: 'Passer à l’acompte', 4: '' })[s] || '';
    btnNext.hidden = s === 4 || s === 5;
    btnNext.disabled = (s === 1 && (!S.cart.length || !!orphan())) || (s === 2 && (S.time == null || !S.date));
  }
  function go(step, scroll = true) {
    S.step = step;
    $$('.step').forEach(sec => { const on = +sec.dataset.step === step; sec.hidden = !on; sec.classList.toggle('is-on', on); });
    $$('#stepper li').forEach(li => { const n = +li.dataset.s; li.classList.toggle('is-on', n === step); li.classList.toggle('is-done', n < step); });
    $('#stepper').hidden = step === 5;
    if (step === 2) { buildCal(); buildSlots(); firstFree(); }
    if (step === 3) $('#inspoNote').hidden = !needsInspo();
    if (step === 4) preparePay();
    nav(); refresh();
    if (scroll) API().scrollTo ? API().scrollTo($('#stepper'), { offset: -110, duration: 1 }) : scrollTo({ top: $('#stepper').getBoundingClientRect().top + scrollY - 110, behavior: 'smooth' });
  }
  btnNext.addEventListener('click', () => {
    if (S.step === 1 && S.cart.length && !orphan()) go(2);
    else if (S.step === 2 && S.time != null) go(3);
    else if (S.step === 3 && validateInfos()) go(4);
  });
  btnBack.addEventListener('click', () => go(Math.max(1, S.step - 1)));
  $$('#stepper li').forEach(li => li.addEventListener('click', () => { const n = +li.dataset.s; if (n < S.step) go(n); }));

  /* ---------- étape 2 : calendrier et créneaux ---------- */
  const calDays = $('#calDays'), calTitle = $('#calTitle'), prev = $('#calPrev'), next = $('#calNext');
  const STEP = CFG.SLOT_STEP_MIN || 30;
  const minStartMs = () => Date.now() + (CFG.MIN_NOTICE_HOURS || 12) * 3600e3;
  const maxKey = () => addDays(todayKey, CFG.MAX_DAYS_AHEAD || 90);
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const demoCache = {};
  /* créneaux « déjà pris » d'exemple, reproductibles, à l'intérieur des horaires d'ouverture */
  function demoBusy(k) {
    if (demoCache[k]) return demoCache[k];
    const w = windowsOf(k); if (!w.length) return (demoCache[k] = []);
    const r = mulberry(Number(k.replace(/-/g, ''))); const blocks = [];
    if (r() < .1) w.forEach(x => blocks.push([x[0], x[1]]));
    else { const n = r() < .55 ? 1 : 0; for (let i = 0; i < n; i++) { const win = w[Math.floor(r() * w.length)]; const dur = [60, 90, 120][Math.floor(r() * 3)]; const st = win[0] + Math.floor(r() * Math.max(1, (win[1] - win[0] - dur) / STEP)) * STEP; blocks.push([st, Math.min(win[1], st + dur)]); } }
    return (demoCache[k] = blocks);
  }
  function isBusy(k, start, end) {
    if (S.busy) { const a = parse(k); a.setHours(0, start, 0, 0); const b = parse(k); b.setHours(0, end, 0, 0); return S.busy.some(([x, y]) => a < y && b > x); }
    return demoBusy(k).some(([x, y]) => start < y && end > x);
  }
  function slotsFor(k) {
    if (!S.cart.length || k > maxKey()) return [];
    const dur = totalMin(), out = [];
    windowsOf(k).forEach(([open, close]) => {
      for (let t = open; t + dur <= close; t += STEP) {
        const st = parse(k); st.setHours(0, t, 0, 0);
        if (st.getTime() < minStartMs() || isBusy(k, t, t + dur)) continue;
        out.push(t);
      }
    });
    return out;
  }
  function buildCal() {
    const first = parse(S.month);
    calTitle.textContent = first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    prev.disabled = S.month <= monthStart(todayKey);
    next.disabled = addMonths(S.month, 1) > monthStart(maxKey());
    const lead = (first.getDay() + 6) % 7, dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    let h = '';
    for (let b = 0; b < lead; b++) h += '<span class="cday is-blank"></span>';
    for (let n = 1; n <= dim; n++) {
      const k = first.getFullYear() + '-' + pad(first.getMonth() + 1) + '-' + pad(n);
      const ok = slotsFor(k).length > 0;
      h += '<button type="button" class="cday' + (ok ? ' is-open' : '') + (k === todayKey ? ' is-today' : '') + (k === S.date ? ' is-sel' : '') + '" data-k="' + k + '"' + (ok ? '' : ' disabled') + ' aria-label="' + fmtLong(k) + (ok ? ', créneaux disponibles' : ', indisponible') + '">' + n + '</button>';
    }
    calDays.innerHTML = h;
  }
  prev.addEventListener('click', () => { S.month = addMonths(S.month, -1); buildCal(); });
  next.addEventListener('click', () => { S.month = addMonths(S.month, 1); buildCal(); });
  calDays.addEventListener('click', e => {
    const b = e.target.closest('.cday[data-k]'); if (!b || b.disabled) return;
    S.date = b.dataset.k; S.time = null; buildCal(); buildSlots(); refresh();
    if (innerWidth < 1400) API().scrollTo && API().scrollTo($('#slotsTitle'), { offset: -120, duration: .9 });
  });
  const slotsGrid = $('#slotsGrid');
  function buildSlots() {
    const t = $('#slotsTitle'), sub = $('#slotsSub');
    const notice = S.notice ? S.notice + ' ' : '';
    sub.setAttribute('role', S.notice ? 'alert' : 'status');
    if (!S.date) { t.textContent = 'Choisissez un jour'; sub.textContent = notice + 'Durée du créneau : ≈ ' + fmtDur(totalMin()) + '. Les horaires proposés en tiennent compte.'; slotsGrid.innerHTML = ''; return; }
    t.textContent = cap(fmtShort(S.date));
    sub.textContent = notice + 'Créneau de ≈ ' + fmtDur(totalMin()) + ' · choisissez l’heure d’arrivée.';
    const s = slotsFor(S.date);
    const part = (label, from, to) => { const x = s.filter(m => m >= from && m < to); return x.length ? '<div class="slots__part"><h4>' + label + '</h4><div class="slots__grid">' + x.map(m => '<button type="button" class="slot' + (m === S.time ? ' is-sel' : '') + '" role="option" aria-selected="' + (m === S.time) + '" data-t="' + m + '">' + fmtHour(m) + '</button>').join('') + '</div></div>' : ''; };
    slotsGrid.innerHTML = s.length ? part('Matin', 0, 12 * 60) + part('Après-midi', 12 * 60, 24 * 60) : '<p class="slots__empty">Plus de créneau ce jour-là pour cette durée. Essayez un autre jour.</p>';
  }
  slotsGrid.addEventListener('click', e => { const b = e.target.closest('.slot'); if (!b) return; S.time = +b.dataset.t; S.notice = ''; buildSlots(); refresh(); });
  /* premier créneau libre */
  let firstSlot = null;
  function firstFree() {
    firstSlot = null; const box = $('#firstBox');
    for (let n = 0; n <= (CFG.MAX_DAYS_AHEAD || 90); n++) { const k = addDays(todayKey, n); const s = slotsFor(k); if (s.length) { firstSlot = { k, t: s[0] }; break; } }
    box.hidden = !firstSlot;
    if (firstSlot) $('#firstTxt').textContent = cap(fmtShort(firstSlot.k)) + ' à ' + fmtHour(firstSlot.t);
  }
  $('#firstBtn').addEventListener('click', () => { if (!firstSlot) return; S.date = firstSlot.k; S.time = firstSlot.t; S.month = monthStart(S.date); buildCal(); buildSlots(); refresh(); });

  async function loadAvailability() {
    if (!CFG.AVAILABILITY_URL) return;
    try {
      const u = CFG.AVAILABILITY_URL + (CFG.AVAILABILITY_URL.includes('?') ? '&' : '?') + 'from=' + todayKey + '&to=' + maxKey();
      const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      S.busy = (j.busy || []).map(b => [new Date(Array.isArray(b) ? b[0] : b.start), new Date(Array.isArray(b) ? b[1] : b.end)]).filter(x => !isNaN(x[0]) && !isNaN(x[1]));
    } catch (e) { S.busy = null; }
    if (S.step === 2) { buildCal(); buildSlots(); firstFree(); }
  }

  /* ---------- étape 3 : coordonnées ---------- */
  const F = { first: $('#fFirst'), last: $('#fLast'), email: $('#fEmail'), phone: $('#fPhone'), cgv: $('#fCgv') };
  const rules = {
    first: v => (v.trim().length >= 2 ? '' : 'Indiquez votre prénom.'),
    last: v => (v.trim().length >= 2 ? '' : 'Indiquez votre nom.'),
    email: v => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Adresse e-mail invalide.'),
    phone: v => { const d = v.replace(/\D/g, ''); return d.length >= 9 && d.length <= 15 ? '' : 'Numéro de téléphone invalide.'; },
    cgv: () => (F.cgv.checked ? '' : 'Merci de cocher cette case pour continuer.')
  };
  function check(n) {
    const msg = rules[n](n === 'cgv' ? '' : F[n].value);
    const slot = $('[data-err="' + n + '"]'); if (slot) slot.textContent = msg;
    if (n !== 'cgv') F[n].classList.toggle('is-bad', !!msg);
    return msg;
  }
  ['first', 'last', 'email', 'phone'].forEach(n => { F[n].addEventListener('blur', () => check(n)); F[n].addEventListener('input', () => { if (F[n].classList.contains('is-bad')) check(n); }); });
  function validateInfos() {
    let bad = ''; ['first', 'last', 'email', 'phone', 'cgv'].forEach(n => { if (check(n) && !bad) bad = n; });
    if (bad) { F[bad].focus(); return false; }
    return true;
  }

  /* ---------- étape 4 : acompte ---------- */
  const payBtn = $('#payBtn'), payMsg = $('#payMsg'), modal = $('#payModal');
  function preparePay() {
    const k = canFull(), t = totalC();
    if (!k) S.pay = 'deposit';
    $('#payChoice').hidden = !k;
    $('#optDeposit').textContent = eurC(depositOf(t));
    $('#optFull').textContent = k ? eurC(t) : '';
    $$('.paychoice__opt').forEach(l => l.classList.toggle('is-on', $('input', l).value === S.pay));
    $$('input[name=pay]').forEach(r => { r.checked = r.value === S.pay; });
    updatePay();
  }
  function updatePay() {
    const t = totalC(), due = dueNow(), k = canFull();
    $('#payLabel').textContent = S.pay === 'full' && k ? 'Total à régler maintenant' : 'Acompte à régler maintenant';
    $('#payAmount').textContent = eurC(due);
    $('#payRest').textContent = S.pay === 'full' && k ? 'Votre rendez-vous est entièrement réglé : rien à payer à l’onglerie.' : (t != null && INDIC ? 'Il est déduit du total. Le solde, estimé à ' + eurC(t - due) + ' (tarif indicatif), se règle à l’onglerie une fois le tarif exact confirmé par Sophie.' : (k ? 'Il est déduit du total ; le solde de ' + eurC(t - due) + ' se règle à l’onglerie.' : 'Il est déduit du montant de votre prestation, que Sophie vous confirme ; le solde se règle à l’onglerie.'));
    payMsg.textContent = '';
    payBtn.querySelector('span').textContent = CFG.PAYMENT_MODE === 'none' ? 'Confirmer le rendez-vous' : (S.pay === 'full' && k ? 'Payer ' + eurC(due) : 'Payer l’acompte de ' + eurC(due));
    refresh();
  }
  $$('input[name=pay]').forEach(r => r.addEventListener('change', () => { S.pay = r.value; $$('.paychoice__opt').forEach(l => l.classList.toggle('is-on', $('input', l).checked)); updatePay(); }));
  const makeRef = () => 'SC-' + S.date.replace(/-/g, '').slice(2) + '-' + Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  function booking() {
    const items = S.cart.map(id => ({ id, name: ITEMS[id].name, qty: qtyOf(id), min: lineMin(id), price: lineC(id) == null ? null : lineC(id) / 100 }));
    const t = totalC(), dep = depositOf(t), now = dueNow();
    return { ref: S.ref || (S.ref = makeRef()), date: S.date, start: hhmm(S.time), startMin: S.time, durationMin: totalMin(),
      timezone: 'Europe/Paris', startLocal: S.date + 'T' + hhmm(S.time) + ':00', endLocal: S.date + 'T' + hhmm(S.time + totalMin()) + ':00',
      items, priceKnown: t != null, priceIndicative: INDIC, total: t == null ? null : t / 100, totalCents: t, pay: S.pay === 'full' && canFull() ? 'full' : 'deposit', payCents: now, depositCents: dep, balanceCents: t == null ? null : t - now, cancelHours: POL.lateCancelHours,
      first: F.first.value.trim(), last: F.last.value.trim(), email: F.email.value.trim(), phone: F.phone.value.trim(), visit: ($('input[name=visit]:checked') || {}).value || 'new', message: $('#fMsg').value.trim(), locale: 'fr', page: location.href.split('?')[0].split('#')[0], sentAt: new Date().toISOString() };
  }
  payBtn.addEventListener('click', async () => {
    if (S.sending) return;
    if ($('#fHp').value) { finish(booking(), { demo: true }); return; }          // pot de miel
    const mode = CFG.PAYMENT_MODE || 'demo', b = booking();
    if (mode === 'demo') { $('#payModalAmount').textContent = eurC(b.payCents); openModal(); return; }
    S.sending = true; payBtn.disabled = true; payMsg.textContent = '';
    try {
      if (mode === 'stripe') {
        if (!CFG.CHECKOUT_ENDPOINT) throw new Error('config');
        sessionStorage.setItem('scn-pending', JSON.stringify(b));
        const r = await fetch(CFG.CHECKOUT_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
        const j = await r.json().catch(() => ({}));
        if (r.status === 409 || j.error === 'conflict') throw new Error('conflict');
        if (!r.ok || !j.url) throw new Error(j.error || 'checkout');
        location.href = j.url; return;
      }
      if (mode === 'none') {
        const ok = await sendBooking(b);
        if (!ok.ok) throw new Error(ok.conflict ? 'conflict' : 'send');
        finish(b, { unpaid: true });
      }
    } catch (err) {
      payMsg.textContent = err.message === 'conflict' ? 'Ce créneau vient d’être pris. Merci d’en choisir un autre.' : 'Le paiement n’a pas pu être lancé. Appelez le ' + PHONE + ' ou réessayez dans un instant.';
      if (err.message === 'conflict') { S.time = null; S.notice = 'Ce créneau vient d’être pris par une autre cliente.'; go(2); }
    } finally { S.sending = false; payBtn.disabled = false; }
  });
  async function sendBooking(b) {
    if (!CFG.BOOKING_WEBHOOK) return { ok: true, demo: true };
    try {
      const r = await fetch(CFG.BOOKING_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(b) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) return { ok: false, conflict: !!j.conflict };
      return { ok: true };
    } catch (e) { return { ok: false }; }
  }
  function openModal() { modal.hidden = false; document.body.classList.add('modal-open'); if (API().lenis) API().lenis.stop(); $('#payModalOk').focus(); }
  function closeModal() { modal.hidden = true; document.body.classList.remove('modal-open'); if (API().lenis) API().lenis.start(); }
  $('#payModalCancel').addEventListener('click', closeModal);
  $('#payModalOk').addEventListener('click', () => { closeModal(); finish(booking(), { demo: true }); });
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  /* ---------- confirmation + agenda de la cliente ---------- */
  const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const stamp = (k, min) => k.replace(/-/g, '') + 'T' + pad(Math.floor(min / 60)) + pad(min % 60) + '00';
  function fold(line) { const out = []; while (line.length > 72) { out.push(line.slice(0, 72)); line = ' ' + line.slice(72); } out.push(line); return out.join('\r\n'); }
  function finish(b, opt) {
    opt = opt || {};
    S.step = 5;
    $$('.step').forEach(sec => { const on = +sec.dataset.step === 5; sec.hidden = !on; sec.classList.toggle('is-on', on); });
    $('#stepper').hidden = true; side0.hidden = true; $('.flow').classList.add('is-done'); side();
    $('#doneTitle').textContent = opt.demo ? 'Rendez-vous préparé' : 'Rendez-vous confirmé';
    const when = fmtLong(b.date) + ' à ' + fmtHour(b.startMin);
    const owner = CFG.OWNER || 'Sophie';
    $('#doneText').textContent = opt.demo
      ? 'Merci ' + b.first + ' ! Voici le récapitulatif de votre rendez-vous du ' + when + '. Une fois la page reliée à l’agenda de ' + owner + ' et à Stripe, ce même parcours enregistre le créneau et encaisse l’acompte.'
      : 'Merci ' + b.first + ' ! ' + owner + ' vous attend le ' + when + (opt.unpaid ? '. L’acompte se règle à l’onglerie.' : '. ' + (b.pay === 'full' ? 'Votre règlement est bien reçu.' : 'Votre acompte est bien reçu.')) + ' Un e-mail de confirmation vous a été envoyé.' + (b.priceKnown && !b.priceIndicative ? '' : ' Les prix affichés sont indicatifs : ' + owner + ' vous confirme le tarif exact de votre prestation.');
    $('#doneSum').innerHTML = [['Date', fmtShort(b.date)], ['Heure', fmtHour(b.startMin)], ['Créneau', '≈ ' + fmtDur(b.durationMin)], [b.pay === 'full' ? 'Réglé' : 'Acompte', eurC(b.payCents)], [b.priceIndicative && b.balanceCents != null ? 'Solde indicatif' : 'Solde', b.balanceCents == null ? 'Tarif confirmé par ' + owner : (b.priceIndicative ? '≈ ' : '') + eurC(b.balanceCents)], ['Adresse', CFG.ADDRESS || ''], ['Référence', b.ref]].map(r => '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>').join('');
    $('#doneDemo').hidden = !opt.demo;
    const names = b.items.map(i => i.name + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//So Creativ’Nails//Reservation//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', 'UID:' + b.ref + '@so-creativ-nails', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
      'DTSTART:' + stamp(b.date, b.startMin), 'DTEND:' + stamp(b.date, b.startMin + b.durationMin), 'SUMMARY:' + icsEsc('Rendez-vous So Creativ’Nails'), 'LOCATION:' + icsEsc(CFG.ADDRESS || ''),
      'DESCRIPTION:' + icsEsc(names + ' · Réf. ' + b.ref + ' · ' + PHONE + ' · Annulation ou déplacement gratuits jusqu’à ' + fmtDelay(b.cancelHours || POL.lateCancelHours) + ' avant, sinon l’acompte n’est pas restitué.'), 'END:VEVENT', 'END:VCALENDAR'];
    const a = $('#btnIcs'); if (a.dataset.u) URL.revokeObjectURL(a.dataset.u);
    a.href = URL.createObjectURL(new Blob([lines.map(fold).join('\r\n')], { type: 'text/calendar;charset=utf-8' })); a.dataset.u = a.href; a.download = 'rendez-vous-so-creativ-nails-' + b.date + '.ics';
    $('#btnGcal').href = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('Rendez-vous So Creativ’Nails') + '&dates=' + stamp(b.date, b.startMin) + '/' + stamp(b.date, b.startMin + b.durationMin) + '&location=' + encodeURIComponent(CFG.ADDRESS || '') + '&details=' + encodeURIComponent(names + ' · Réf. ' + b.ref) + '&ctz=Europe/Paris';
    $('#btnRoute').href = 'https://www.google.com/maps/dir/?api=1&destination=' + (CFG.LAT || 43.8306215) + ',' + (CFG.LNG || 5.7977633);
    $('#done').hidden = false;
    API().scrollTo ? API().scrollTo($('#stepper'), { offset: -60, duration: 1 }) : null;
  }
  $('#doneNew').addEventListener('click', () => { $('.flow').classList.remove('is-done'); S.cart = []; S.qty = {}; S.date = null; S.time = null; S.ref = ''; $('#done').hidden = true; side0.hidden = false; go(1, true); });

  /* ---------- API publique + démarrage ---------- */
  function openGroup(id, sub) {
    if (!D.groups.some(g => g.id === id)) return;
    setGroup(id);
    if (S.step !== 1) go(1, false);
    const target = sub ? $('.mgroup.is-on .msub[data-sub="' + CSS.escape(sub) + '"]', list) : null;
    setTimeout(() => {
      const el = target || $('#stepper');
      API().scrollTo ? API().scrollTo(el, { offset: target ? -150 : -110, duration: 1.5 }) : el.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  }
  /* ajoute une prestation à la sélection et amène la cliente à la réservation (depuis la carte des tarifs) */
  function pick(id) {
    const it = ITEMS[id]; if (!it) return;
    if (S.step !== 1) go(1, false);
    setGroup(it.group);
    if (bookable(it) && !S.cart.includes(id)) toggle(id, true);
    setTimeout(() => { const el = $('#stepper'); API().scrollTo ? API().scrollTo(el, { offset: -110, duration: 1.4 }) : el.scrollIntoView({ behavior: 'smooth' }); }, 60);
  }
  window.SCNBooking = { openGroup, pick, toggle: id => toggle(id, true) };

  if (CFG.DEMO_MODE) { const b = $('#demoBanner'); if (b) b.hidden = false; }
  buildMenu(); refresh(); nav(); loadAvailability();

  // retour de Stripe
  const qs = new URLSearchParams(location.search);
  const pending = () => { try { return JSON.parse(sessionStorage.getItem('scn-pending') || 'null'); } catch (e) { return null; } };
  if (qs.get('paiement') === 'ok') {
    const b = pending();
    if (b && b.ref === qs.get('ref')) { sessionStorage.removeItem('scn-pending'); finish(b, {}); }
  } else if (qs.get('paiement') === 'annule') {
    const b = pending();
    if (b) {
      S.cart = b.items.map(i => i.id).filter(id => ITEMS[id]); b.items.forEach(i => { if (ITEMS[i.id] && i.qty > 1) S.qty[i.id] = i.qty; });
      S.date = b.date; S.time = b.startMin; S.pay = b.pay === 'full' ? 'full' : 'deposit';
      F.first.value = b.first; F.last.value = b.last; F.email.value = b.email; F.phone.value = b.phone; F.cgv.checked = true; go(4, false); payMsg.textContent = 'Le paiement a été annulé. Vous pouvez réessayer.';
    }
  }
})();
