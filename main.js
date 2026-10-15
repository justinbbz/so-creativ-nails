/* So Creativ’Nails — animations, héros vidéo piloté par le défilement, nuancier, avis, liste des prestations.
   GSAP + ScrollTrigger + Lenis sont hébergés dans assets/vendor. La réservation est dans booking.js. */
(() => {
  'use strict';

  const D = window.SCN || { groups: [], hours: {}, gallery: [], reviews: [], know: [] };
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
  const isMobile = () => innerWidth <= 820;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const api = { lenis: null, ready: false };
  window.SCNApi = api;
  const PRISM = ['#38d3d8', '#ff4d94', '#ff9a45', '#8a8cff', '#ffffff'];

  /* ------------------------------------------------------------------ contenu généré à partir des données */
  const INDIC = (D.policy || {}).priceMode === 'indicatif';
  const ITEM = {};
  D.groups.forEach(g => g.subs.forEach(s => s.items.forEach(i => { ITEM[i.id] = Object.assign({ group: g.id, sub: s.title }, i); })));
  const eurP = n => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const priceHtml = i => i.price == null ? 'Sur devis' : (i.from ? '<small>dès</small> ' : '') + eurP(i.price) + (i.qty ? ' <small>/ ongle</small>' : '');
  const priceTxt = i => i.price == null ? 'Sur devis' : (i.from ? 'dès ' : '') + eurP(i.price) + (i.qty ? ' / ongle' : '');
  $$('[data-indicatif]').forEach(el => { el.hidden = !INDIC; });
  const photo = id => D.gallery.find(g => g.id === id) || (D.illustrations || []).find(g => g.id === id);
  const firstFile = g => g.files[0].f;
  const lastFile = g => g.files[g.files.length - 1].f;

  /* bandeau défilant */
  (() => {
    const words = ['Gel', 'Résine', 'Acrygel', 'Ongles sculptés', 'Nail art', 'Baby boomer', 'French', 'Œil-de-chat', 'Vernis', 'Beauté des mains', 'Beauté des pieds'];
    const one = words.map(w => '<span>' + w + '</span><i><svg aria-hidden="true"><use href="#i-sparkle"/></svg></i>').join('');
    const row = $('#marquee'); if (row) row.innerHTML = one + one;
  })();

  /* liste « prestations » */
  (() => {
    const list = $('#knowList'); if (!list) return;
    list.innerHTML = D.know.map((r, i) => {
      const g = r.photo && photo(r.photo);
      const src = g ? '' + firstFile(g) : '';
      const plain = r.t.replace(/<[^>]+>/g, '').replace(/&amp;/g, 'et');
      const its = (r.ids || []).map(id => ITEM[id]).filter(Boolean), priced = its.filter(x => x.price != null);
      const low = priced.length ? priced.reduce((a, b) => (b.price < a.price ? b : a)) : null;
      const rowPrice = low ? Object.assign({}, low, { from: true }) : { price: null };
      return '<li class="know__row" data-g="' + r.group + '" data-sub="' + esc(r.sub || '') + '" data-img="' + src + '"><a href="#reserver" aria-label="' + esc(plain) + ', réserver">' +
        '<span class="know__n">' + String(i + 1).padStart(2, '0') + '</span><span class="know__t">' + r.t + '<small class="know__pm">' + priceTxt(rowPrice) + '</small></span>' +
        '<span class="know__p"><i>' + r.cap + '</i><b>' + priceHtml(rowPrice) + '</b></span><span class="know__go"><svg aria-hidden="true"><use href="#i-arrow"/></svg></span>' +
        '<span class="know__thumb' + (g ? '' : ' no-img') + '">' + (g ? '<img src="' + src + '" alt="" loading="lazy" width="54" height="68" style="object-position:' + g.focus[0] + '% ' + g.focus[1] + '%">' : '') + '</span></a></li>';
    }).join('');
    list.addEventListener('click', e => {
      const a = e.target.closest('.know__row a'); if (!a) return;
      e.preventDefault();
      const row = a.closest('.know__row');
      if (window.SCNBooking) window.SCNBooking.openGroup(row.dataset.g, row.dataset.sub || null);
    });
    /* image flottante qui suit le curseur */
    const fl = $('#knowFloat'); if (!fl || !fine) return;
    const fi = $('img', fl); let tx = 0, ty = 0, cx = 0, cy = 0;
    list.addEventListener('pointerover', e => {
      const r = e.target.closest('.know__row'); if (!r) return;
      const s = r.dataset.img; fl.classList.toggle('no-img', !s);
      if (s) fi.src = s;                                    // la petite version suffit pour la bulle
      fl.classList.add('is-on');
    });
    list.addEventListener('pointerleave', () => { fl.classList.remove('is-on'); });
    addEventListener('pointermove', e => { tx = e.clientX + 40; ty = e.clientY; });
    (function loop() { cx += (tx - cx) * .14; cy += (ty - cy) * .14; fl.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0) translate(-50%,-50%) rotate(' + ((tx - cx) * .04) + 'deg)'; requestAnimationFrame(loop); })();
  })();

  /* carte des tarifs : générée à partir des données (jamais retapée) */
  (() => {
    const grid = $('#tarifGrid'); if (!grid) return;
    const cards = [
      { k: 'Poses, vernis et soins', t: 'Ongles des <em>mains</em>', groups: ['mains'] },
      { k: 'Baby boomer · French · dessins', t: 'Nail art &amp; <em>finitions</em>', groups: ['nailart'] },
      { k: 'Soin des pieds · événements', t: 'Pieds &amp; <em>maquillage</em>', groups: ['pieds', 'maquillage'] }
    ];
    const dur = m => (m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''));
    grid.innerHTML = cards.map(c => {
      const items = D.groups.filter(g => c.groups.includes(g.id)).flatMap(g => g.subs.flatMap(s => s.items));
      return '<article class="tcard" data-reveal><p class="tcard__k">' + c.k + '</p><h3>' + c.t + '</h3><ul>' + items.map(i => {
        const call = i.bookable === false;
        const inner = '<span class="trow__n">' + i.name + '</span><span class="trow__d">' + (call ? 'Appelez Sophie' : (i.addon ? 'Finition' : '≈ ' + dur(i.min)) + (i.qty ? ' par ongle' : '')) + '</span><span class="trow__p">' + priceHtml(i) + '</span>';
        return '<li>' + (call ? '<a class="trow" href="tel:+33492730866">' + inner + '</a>' : '<button type="button" class="trow" data-id="' + i.id + '">' + inner + '</button>') + '</li>';
      }).join('') + '</ul></article>';
    }).join('');
    grid.addEventListener('click', e => { const b = e.target.closest('.trow[data-id]'); if (b && window.SCNBooking) window.SCNBooking.pick(b.dataset.id); });
  })();

  /* horaires (Google) + fermetures */
  (() => {
    const box = $('#hours'); if (!box) return;
    const days = [[1, 'Lundi'], [2, 'Mardi'], [3, 'Mercredi'], [4, 'Jeudi'], [5, 'Vendredi'], [6, 'Samedi'], [0, 'Dimanche']];
    const fmt = t => parseInt(t.slice(0, 2), 10) + ' h' + (t.slice(3) === '00' ? '' : ' ' + t.slice(3));
    const today = new Date().getDay();
    box.outerHTML = '<dl class="hours" id="hours">' + days.map(([d, n]) => {
      const h = D.hours[d];
      return '<dt' + (d === today ? ' class="is-today"' : '') + '>' + n + '</dt><dd' + (d === today ? ' class="is-today"' : '') + '>' + (h ? h.map(w => fmt(w[0]) + ' – ' + fmt(w[1])).join(' · ') : 'Fermé') + '</dd>';
    }).join('') + '</dl>' + closedNote();
    function closedNote() {
      const now = new Date().toISOString().slice(0, 10), fut = (D.closed || []).filter(d => d >= now); if (!fut.length) return '';
      const f = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
      return '<p class="hours__note">Fermé aussi : ' + fut.map(f).join(', ') + '.</p>';
    }
  })();

  /* la FAQ s'adapte dès que des prix sont renseignés */
  (() => {
    const known = D.groups.some(g => g.subs.some(s => s.items.some(i => i.price != null)));
    const p = $('[data-faq="prix"]'); if (p && known) p.innerHTML = (INDIC ? 'Les tarifs affichés sont <b>indicatifs</b> : Sophie n’a pas encore publié sa carte, ils sont calculés d’après les onglerie de Manosque. ' : 'Les tarifs sont indiqués dans la carte et dans la réservation. ') + 'Pour un nail art sur mesure, Sophie vous confirme le prix exact avant de commencer : appelez-la au <a href="tel:+33492730866">04 92 73 08 66</a>.';
    const sh = $('#statShades'); if (sh && D.gallery.length) { sh.textContent = D.gallery.length; sh.dataset.count = D.gallery.length; }
    const yr = $('#year'); if (yr) yr.textContent = new Date().getFullYear();
  })();

  /* ------------------------------------------------------------------ défilement : Lenis + ScrollTrigger */
  const head = $('#head'), hero = $('#accueil');
  function setupScroll() {
    if (!hasGsap) return;
    gsap.registerPlugin(ScrollTrigger);
    if (typeof Lenis !== 'undefined' && !reduce) {
      const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
      api.lenis = lenis;
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
      lenis.stop();
    }
  }
  api.scrollTo = (target, opt = {}) => {
    const y = typeof target === 'number' ? target : target.getBoundingClientRect().top + scrollY + (opt.offset || 0);
    if (api.lenis) api.lenis.scrollTo(y, { duration: opt.duration || 1.4, easing: t => 1 - Math.pow(1 - t, 4), immediate: reduce });
    else scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  };
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]'); if (!a) return;
    const id = a.getAttribute('href'); if (id.length < 2) return;
    const el = document.getElementById(id.slice(1)); if (!el) return;
    e.preventDefault();
    closeMenu();
    api.scrollTo(el, { offset: id === '#reserver' ? -8 : 0 });
    history.replaceState(null, '', id);
  });

  /* menu mobile */
  const burger = $('#burger'), menu = $('#menu');
  function closeMenu() { document.body.classList.remove('menu-open'); if (burger) { burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Ouvrir le menu'); } if (menu) menu.setAttribute('aria-hidden', 'true'); if (api.lenis && api.ready) api.lenis.start(); }
  if (burger) burger.addEventListener('click', () => {
    const open = !document.body.classList.contains('menu-open');
    document.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open)); burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu'); menu.setAttribute('aria-hidden', String(!open));
    if (api.lenis) open ? api.lenis.stop() : api.lenis.start();
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  /* ------------------------------------------------------------------ héros : séquence d'images pilotée par le défilement */
  const SEQ = window.SCN_SEQ || { frames: 100, focus: [[0, .5]] };      // généré par outils/fabriquer-sequence.py
  const FRAMES = SEQ.frames;
  const canvas = $('#heroCanvas'), ctx = canvas ? canvas.getContext('2d', { alpha: false }) : null;
  const seq = [];                                           // images chargées, indexées de 0 à FRAMES-1
  let cw = 0, ch = 0, cur = 0, target = 0, heroP = 0, drawnKey = '';
  const frameUrl = i => 'h-' + String(i + 1).padStart(3, '0') + '.webp';
  const focusX = i => {                                     // cadrage horizontal d'un plan à l'autre (écran vertical), interpolé
    const f = SEQ.focus; if (i <= f[0][0]) return f[0][1];
    for (let k = 1; k < f.length; k++) if (i <= f[k][0]) { const a = f[k - 1], b = f[k], t = (i - a[0]) / Math.max(1, b[0] - a[0]); return a[1] + (b[1] - a[1]) * t * t * (3 - 2 * t); }
    return f[f.length - 1][1];
  };
  const FOCUS_Y = .5;

  function sizeCanvas() {
    if (!canvas) return;
    const dpr = Math.min(devicePixelRatio || 1, 1.6);
    cw = Math.round(canvas.clientWidth * dpr); ch = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; drawnKey = ''; }
  }
  function nearest(i) { for (let k = i; k >= 0; k--) if (seq[k]) return k; for (let k = i + 1; k < FRAMES; k++) if (seq[k]) return k; return -1; }
  function paint(idx, alpha, zoom) {
    const im = seq[idx], iw = im.naturalWidth, ih = im.naturalHeight;
    const sc = Math.max(cw / iw, ch / ih) * zoom, w = iw * sc, h = ih * sc;
    const fx = focusX(idx), fy = FOCUS_Y;
    const x = Math.min(0, Math.max(cw - w, cw * .5 - fx * w)), y = Math.min(0, Math.max(ch - h, ch * .5 - fy * h));
    ctx.globalAlpha = alpha; ctx.drawImage(im, x, y, w, h);
  }
  function draw() {                                        // image courante + fondu vers la suivante : défilement fluide
    if (!ctx || !cw) return;
    const i0 = nearest(Math.min(FRAMES - 1, Math.floor(cur))); if (i0 < 0) return;
    const i1 = nearest(Math.min(FRAMES - 1, i0 + 1)), f = Math.round((cur - Math.floor(cur)) * 16) / 16;
    const zoom = 1 + heroP * .22;
    const key = i0 + ':' + i1 + ':' + f + ':' + zoom.toFixed(3) + ':' + cw + 'x' + ch;
    if (key === drawnKey) return; drawnKey = key;
    paint(i0, 1, zoom);
    if (i1 > i0 && f > 0) paint(i1, f, zoom);
    ctx.globalAlpha = 1;
  }
  function loadFrame(i) {
    return new Promise(res => {
      if (seq[i]) return res(seq[i]);
      const im = new Image(); im.decoding = 'async';
      im.onload = () => { seq[i] = im; res(im); }; im.onerror = () => res(null);
      im.src = frameUrl(i);
    });
  }
  async function preloadHero(onProgress) {
    if (!canvas) return;
    const step = isMobile() ? 2 : 1;
    const order = [0]; for (let i = step; i < FRAMES; i += step) order.push(i); if (order[order.length - 1] !== FRAMES - 1) order.push(FRAMES - 1);
    const first = order.slice(0, Math.min(14, order.length)), rest = order.slice(first.length);
    let done = 0;
    await Promise.all(first.map(i => loadFrame(i).then(() => { done++; onProgress && onProgress(done / first.length); })));
    (async () => { for (let k = 0; k < rest.length; k += 4) await Promise.all(rest.slice(k, k + 4).map(loadFrame)); })();   // le reste, en arrière-plan
  }

  /* paillettes « prisme » au-dessus de la vidéo */
  function glints() {
    const c = $('#glints'); if (!c || reduce) return;
    const g = c.getContext('2d'); let W = 0, H = 0; const P = []; let vis = true, last = 0, vel = 0;
    const size = () => { const d = Math.min(devicePixelRatio || 1, 1.5); W = c.width = Math.round(c.clientWidth * d); H = c.height = Math.round(c.clientHeight * d); };
    size(); addEventListener('resize', size);
    new IntersectionObserver(en => { vis = en[0].isIntersecting; }, { threshold: 0 }).observe(c);
    if (api.lenis) api.lenis.on('scroll', e => { vel = Math.min(1, Math.abs(e.velocity || 0) / 40); });
    const spawn = () => { P.push({ x: Math.random() * W, y: H * (.35 + Math.random() * .7), r: (.5 + Math.random() * 1.9) * (W / 1400 + .6), vy: .12 + Math.random() * .4, vx: (Math.random() - .5) * .25, a: 0, life: 0, max: 240 + Math.random() * 300, tw: Math.random() * 6, col: PRISM[Math.floor(Math.random() * PRISM.length)] }); };
    (function loop(t) {
      requestAnimationFrame(loop);
      if (!vis) return;
      const dt = Math.min(40, t - last || 16); last = t;
      if (P.length < 60 && Math.random() < .35 + vel * .6) spawn();
      g.clearRect(0, 0, W, H);
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i]; p.life += dt / 16; p.y -= p.vy * (1 + vel * 6) * dt / 16; p.x += p.vx * dt / 16;
        const k = p.life / p.max; if (k >= 1) { P.splice(i, 1); continue; }
        p.a = Math.sin(Math.PI * k) * (.55 + .45 * Math.sin(p.life * .09 + p.tw));
        g.globalAlpha = Math.max(0, p.a);
        g.fillStyle = p.col;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill();
        if (p.r > 1.7) { g.strokeStyle = '#fff'; g.lineWidth = .6; g.beginPath(); g.moveTo(p.x - p.r * 3.4, p.y); g.lineTo(p.x + p.r * 3.4, p.y); g.moveTo(p.x, p.y - p.r * 3.4); g.lineTo(p.x, p.y + p.r * 3.4); g.stroke(); }
      }
      vel *= .94;
    })(0);
  }

  function heroScroll() {
    if (!hero) return;
    sizeCanvas(); addEventListener('resize', () => { sizeCanvas(); ScrollTrigger.refresh(); });
    const scenes = [$('#scene1'), $('#scene2'), $('#scene3')];
    const foot = $('.hero__foot'), bar = $('#heroBar'), vig = $('.hero__vignette');
    hero.classList.add('has-canvas');
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom bottom', scrub: .45,
        onUpdate: self => { heroP = self.progress; target = heroP * (FRAMES - 1); if (bar) bar.style.transform = 'scaleX(' + heroP + ')'; } }
    });
    /* scène 1 -> 2 -> 3 : durées exprimées en fraction du défilement du héros (total = 1) */
    tl.to(scenes[0], { y: -80, autoAlpha: 0, duration: .13, ease: 'power1.in' }, .08)
      .to(foot, { autoAlpha: 0, duration: .08 }, .05)
      .fromTo(scenes[1], { y: 70, autoAlpha: 0, scale: .96 }, { y: 0, autoAlpha: 1, scale: 1, duration: .12, ease: 'power2.out' }, .27)
      .to(scenes[1], { y: -70, autoAlpha: 0, scale: 1.04, duration: .1, ease: 'power1.in' }, .51)
      .fromTo(scenes[2], { y: 70, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .12, ease: 'power2.out' }, .66)
      .to(vig, { '--vig': 1, duration: .6 }, .3);
    gsap.ticker.add((time, dt) => {
      cur += (target - cur) * (1 - Math.exp(-Math.min(80, dt || 16) / 1000 * 11));
      if (Math.abs(target - cur) < .002) cur = target;
      draw();
    });
  }

  /* entrée du héros après le préchargement */
  function heroIntro() {
    const t1 = $('.hero__t1'), t2 = $('.hero__t2');
    [t1, t2].forEach(el => { if (el && !el.querySelector('.inner')) el.innerHTML = '<span class="inner">' + el.innerHTML + '</span>'; });
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    gsap.set(['.hero__kicker', '.hero__title', '.hero__lead', '.hero__cta', '.hero__foot', '.hero__ring'], { opacity: 1 });
    tl.from('.hero__kicker', { y: 26, opacity: 0, duration: 1.1 })
      .from('.hero__t1 .inner', { yPercent: 115, duration: 1.4, ease: 'power4.out' }, '<.12')
      .from('.hero__t2 .inner', { yPercent: 115, duration: 1.4, ease: 'power4.out' }, '<.14')
      .from('.hero__lead', { y: 34, opacity: 0, duration: 1.2 }, '<.35')
      .from('.hero__cta > *', { y: 30, opacity: 0, duration: 1, stagger: .1 }, '<.2')
      .from('.hero__ring', { scale: .6, opacity: 0, rotate: -40, duration: 1.4, ease: 'power3.out' }, '<.1')
      .from('.hero__foot', { opacity: 0, y: 16, duration: 1 }, '<.2');
  }

  /* ------------------------------------------------------------------ révélations, compteurs, parallaxe */
  function reveals() {
    const io = new IntersectionObserver(en => en.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: .12 });
    $$('[data-reveal]').forEach(el => { el.style.setProperty('--d', (el.dataset.delay || 0) + 's'); io.observe(el); });
    $$('[data-split]').forEach(el => {
      const walk = node => Array.from(node.childNodes).map(n => {
        if (n.nodeType === 3) return n.textContent.split(/(\s+)/).map(w => (/^\s+$/.test(w) || !w) ? w : '<span class="w"><span>' + w + '</span></span>').join('');
        if (n.nodeType === 1) return '<' + n.tagName.toLowerCase() + '>' + walk(n) + '</' + n.tagName.toLowerCase() + '>';
        return '';
      }).join('');
      el.setAttribute('aria-label', el.textContent.trim());
      el.innerHTML = walk(el);
      $$('.w > span', el).forEach((s, i) => s.style.setProperty('--i', i));
      $$('.w', el).forEach(w => w.setAttribute('aria-hidden', 'true'));
      io.observe(el);
    });
    /* texte du manifeste : les mots s'allument avec le défilement */
    const m = $('#manifesto');
    if (m) {
      const html = Array.from(m.childNodes).map(n => {
        if (n.nodeType === 3) return n.textContent.split(/(\s+)/).map(w => (/^\s+$/.test(w) || !w) ? w : '<span class="mw">' + w + '</span>').join('');
        return n.nodeType === 1 ? '<em>' + n.textContent.split(/(\s+)/).map(w => (/^\s+$/.test(w) || !w) ? w : '<span class="mw">' + w + '</span>').join('') + '</em>' : '';
      }).join('');
      m.innerHTML = html;
      const words = $$('.mw', m);
      if (reduce) words.forEach(w => w.classList.add('on'));
      else ScrollTrigger.create({ trigger: m, start: 'top 82%', end: 'bottom 52%', onUpdate: s => { const n = Math.round(s.progress * words.length); words.forEach((w, i) => w.classList.toggle('on', i < n)); } });
    }
    /* compteurs */
    $$('[data-count]').forEach(el => {
      const to = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0), o = { v: 0 };
      const fmt = v => v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (reduce) { el.textContent = fmt(to); return; }
      el.textContent = fmt(0);
      ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => gsap.to(o, { v: to, duration: 1.8, ease: 'power2.out', onUpdate: () => { el.textContent = fmt(o.v); } }) });
    });
    /* parallaxe douce des images */
    if (!reduce) $$('[data-parallax]').forEach(img => gsap.fromTo(img, { yPercent: -4 }, { yPercent: 4, ease: 'none', scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } }));
  }

  /* ------------------------------------------------------------------ en-tête, navigation, barre mobile, progression */
  function chrome() {
    let lastY = 0;
    const stick = $('#stickybar'), book = $('#reserver'), foot = $('.foot'), pbar = $('#pageBar');
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: self => {
      const y = self.scroll(); head.classList.toggle('is-solid', y > 40);
      const pastHero = y > hero.offsetHeight;
      head.classList.toggle('is-hidden', pastHero && y > lastY && y > 300 && !document.body.classList.contains('menu-open'));
      lastY = y;
      if (pbar) pbar.style.transform = 'scaleX(' + self.progress + ')';
    } });
    const hide = el => { const r = el.getBoundingClientRect(); return r.top < innerHeight * .7 && r.bottom > innerHeight * .2; };
    if (stick) ScrollTrigger.create({ start: 0, end: 'max', onUpdate: self => { const y = self.scroll(); const off = hide(book) || hide(foot) || y < innerHeight * .9; stick.classList.toggle('is-on', !off); } });
    const links = $$('.nav a');
    links.forEach(a => { const t = document.querySelector(a.getAttribute('href')); if (t) ScrollTrigger.create({ trigger: t, start: 'top 55%', end: 'bottom 55%', onToggle: s => a.classList.toggle('is-cur', s.isActive) }); });
  }

  /* ------------------------------------------------------------------ visionneuse partagée */
  const LB = (() => {
    const box = $('#lb'), img = $('#lbImg'), cap = $('#lbCap'); let idx = 0; const n = D.gallery.length;
    if (!box || !n) return { open() {} };
    const show = i => { idx = (i + n) % n; const g = D.gallery[idx]; img.src = '' + lastFile(g); img.alt = g.alt; cap.textContent = g.nom + ' · ' + g.alt + ' · ' + (idx + 1) + ' / ' + n; };
    const open = i => { show(i); box.hidden = false; document.body.classList.add('lb-open'); if (api.lenis) api.lenis.stop(); $('#lbClose').focus(); };
    const close = () => { box.hidden = true; document.body.classList.remove('lb-open'); if (api.lenis && api.ready) api.lenis.start(); };
    $('#lbClose').addEventListener('click', close);
    $('#lbPrev').addEventListener('click', () => show(idx - 1));
    $('#lbNext').addEventListener('click', () => show(idx + 1));
    box.addEventListener('click', e => { if (e.target === box) close(); });
    addEventListener('keydown', e => { if (box.hidden) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') show(idx - 1); if (e.key === 'ArrowRight') show(idx + 1); });
    let sx = 0; box.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1)); });
    return { open };
  })();

  /* ------------------------------------------------------------------ le nuancier : chaque réalisation recolore la page */
  function shades() {
    const G = D.gallery, sec = $('#realisations'); if (!sec || !G.length) return;
    const imgs = $('#shImgs'), sw = $('#shSw'), nameEl = $('#shName'), altEl = $('#shAlt'), idxEl = $('#shIdx'), tag = $('#shTag'), prog = $('#shProg'), playBtn = $('#shPlay'), stage = $('#shStage');
    const n = G.length, pad = k => String(k).padStart(2, '0');
    imgs.innerHTML = G.map((g, i) => '<img data-src="' + lastFile(g) + '" alt="' + esc(g.alt) + '" decoding="async" style="object-position:' + g.focus[0] + '% ' + g.focus[1] + '%" ' + (i === 0 ? 'src="' + lastFile(g) + '"' : '') + '>').join('');
    sw.innerHTML = G.map((g, i) => '<button type="button" class="sw" role="tab" aria-selected="false" aria-label="' + esc(g.nom) + '" data-i="' + i + '" style="--c:' + g.couleur + '"><i></i></button>').join('');
    const els = $$('img', imgs), btns = $$('.sw', sw);
    let cur = -1, playing = !reduce, tween = null, inView = false, hover = false;
    const ensure = i => { const e = els[i]; if (e && !e.getAttribute('src')) e.src = e.dataset.src; };
    const ASPECT = 5.2;                                              // durée d'une nuance en secondes

    function runProgress() {
      if (!hasGsap) return;
      if (tween) tween.kill();
      gsap.set(prog, { scaleX: 0 });
      if (!playing) return;
      tween = gsap.to(prog, { scaleX: 1, duration: ASPECT, ease: 'none', paused: !(inView && !hover), onComplete: () => go(cur + 1) });
    }
    function go(i, instant) {
      i = (i + n) % n; if (i === cur) return;
      const g = G[i], prev = els[cur], next = els[i], first = cur < 0;
      ensure(i); ensure((i + 1) % n);
      cur = i;
      sec.style.setProperty('--tone', g.couleur);
      btns.forEach((b, k) => { const on = k === i; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
      idxEl.textContent = 'Nuance ' + pad(i + 1);
      tag.textContent = pad(i + 1) + ' / ' + pad(n);
      altEl.textContent = g.alt;
      nameEl.setAttribute('aria-label', g.nom);
      nameEl.innerHTML = g.nom.split(' ').map(w => '<span class="wd" aria-hidden="true">' + Array.from(w).map(c => '<span class="ch">' + (c === '&' ? '&amp;' : c) + '</span>').join('') + '</span>').join(' ');
      if (hasGsap && !reduce && !instant && !first) {
        els.forEach(e => e.classList.remove('is-out'));
        if (prev) { prev.classList.remove('is-on'); prev.classList.add('is-out'); }
        next.classList.add('is-on');
        gsap.fromTo(next, { clipPath: 'inset(0 0 100% 0)', scale: 1.14 }, { clipPath: 'inset(0 0 0% 0)', scale: 1, duration: 1.15, ease: 'power3.inOut', clearProps: 'clipPath,scale', onComplete: () => { if (prev) prev.classList.remove('is-out'); } });
        gsap.from($$('.ch', nameEl), { yPercent: 70, opacity: 0, duration: .9, ease: 'power3.out', stagger: .022 });
        gsap.from(altEl, { y: 12, opacity: 0, duration: .8, ease: 'power2.out', delay: .15 });
      } else { els.forEach(e => e.classList.toggle('is-on', e === next)); }
      runProgress();
    }
    go(0, true);
    sw.addEventListener('click', e => { const b = e.target.closest('.sw'); if (b) go(+b.dataset.i); });
    sw.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); go(cur + (e.key === 'ArrowRight' ? 1 : -1)); btns[cur].focus(); }
    });
    $('#shPrev').addEventListener('click', () => go(cur - 1));
    $('#shNext').addEventListener('click', () => go(cur + 1));
    $('#shZoom').addEventListener('click', () => LB.open(cur));
    stage.addEventListener('click', e => { if (!e.target.closest('.shades__zoom')) LB.open(cur); });
    const setPlay = on => { playing = on; playBtn.setAttribute('aria-pressed', String(on)); playBtn.setAttribute('aria-label', on ? 'Mettre en pause le défilement automatique' : 'Reprendre le défilement automatique'); playBtn.innerHTML = '<svg aria-hidden="true"><use href="#' + (on ? 'i-pause' : 'i-play') + '"/></svg>'; runProgress(); };
    playBtn.addEventListener('click', () => setPlay(!playing));
    setPlay(playing);
    new IntersectionObserver(en => { inView = en[0].isIntersecting; if (tween) tween.paused(!(inView && !hover)); if (inView) els.forEach((e, k) => { if (k <= 2) ensure(k); }); }, { threshold: .25, rootMargin: '300px 0px' }).observe(sec);
    if (fine) { $('.shades__grid', sec).addEventListener('pointerenter', () => { hover = true; if (tween) tween.pause(); }); $('.shades__grid', sec).addEventListener('pointerleave', () => { hover = false; if (tween && inView) tween.play(); }); }
    let sx = 0; stage.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) go(cur + (dx < 0 ? 1 : -1)); });
  }

  /* ------------------------------------------------------------------ avis : un grand extrait à la fois */
  function reviews() {
    const R = D.reviews, who = $('#revWho'), stage = $('#revStage'), bar = $('#revProg'); if (!who || !stage || !R.length) return;
    who.innerHTML = R.map((r, i) => '<li role="presentation"><button type="button" role="tab" aria-selected="' + (i === 0) + '" data-i="' + i + '"><b>' + esc(r.nom) + '</b><span>Visité en ' + esc(r.visite) + '</span></button></li>').join('');
    const btns = $$('button', who); let cur = -1, tween = null, inView = false, hover = false;
    const card = r => '<figure class="rev' + (r.texte.length > 230 ? ' rev--l' : r.texte.length > 130 ? ' rev--m' : '') + '"><blockquote>' + esc(r.texte) + '</blockquote>' +
      '<figcaption class="rev__who"><b>' + esc(r.nom) + '</b><span class="stars stars--dark" style="width:100px" aria-label="' + r.etoiles + ' étoiles sur 5"></span><span>Visité en ' + esc(r.visite) + '</span>' + (r.services ? '<span class="rev__tag">' + esc(r.services) + '</span>' : '') + '</figcaption>' +
      (r.reponse ? '<div class="rev__reply"><small>Réponse de Sophie</small><p>' + esc(r.reponse) + '</p></div>' : '') + '</figure>';
    function timer() {
      if (!hasGsap) return;
      if (tween) tween.kill();
      gsap.set(bar, { scaleX: 0 });
      if (reduce) return;
      const dur = Math.min(17, 6 + R[cur].texte.length / 22);
      tween = gsap.to(bar, { scaleX: 1, duration: dur, ease: 'none', paused: !(inView && !hover), onComplete: () => go(cur + 1) });
    }
    function go(i, instant) {
      i = (i + R.length) % R.length; if (i === cur) return; cur = i;
      btns.forEach((b, k) => { b.setAttribute('aria-selected', String(k === i)); b.tabIndex = k === i ? 0 : -1; });
      stage.innerHTML = card(R[i]);
      if (hasGsap && !reduce && !instant) gsap.from(stage.children[0].children, { y: 34, opacity: 0, duration: 1, ease: 'power3.out', stagger: .12 });
      timer();
    }
    go(0, true);
    who.addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(+b.dataset.i); });
    who.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); btns[cur].focus(); } if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); btns[cur].focus(); } });
    new IntersectionObserver(en => { inView = en[0].isIntersecting; if (tween) tween.paused(!(inView && !hover)); }, { threshold: .3 }).observe($('#avis'));
    if (fine) { const g = $('.reviews__grid'); g.addEventListener('pointerenter', () => { hover = true; if (tween) tween.pause(); }); g.addEventListener('pointerleave', () => { hover = false; if (tween && inView) tween.play(); }); }
    let sx = 0; stage.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) go(cur + (dx < 0 ? 1 : -1)); });
  }

  /* ------------------------------------------------------------------ curseur, boutons magnétiques, carte */
  function pointerFx() {
    const cur = $('#cursor'); if (!cur || !fine || reduce) return;
    let x = 0, y = 0, tx = 0, ty = 0; cur.classList.add('is-on');
    addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; });
    (function loop() { x += (tx - x) * .22; y += (ty - y) * .22; cur.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)'; requestAnimationFrame(loop); })();
    document.addEventListener('pointerover', e => {
      const t = e.target, view = !!t.closest('.shades__stage') && !t.closest('.shades__zoom');
      cur.classList.toggle('is-view', view);
      cur.classList.toggle('is-link', !view && !!t.closest('a,button,summary,label,.mrow__add'));
    });
    /* traînée de paillettes prisme */
    const c = document.createElement('canvas'); c.style.cssText = 'position:fixed;inset:0;z-index:119;pointer-events:none;width:100%;height:100%'; document.body.appendChild(c);
    const g = c.getContext('2d'); let W, H; const S = []; let lx = -9, ly = -9, n = 0;
    const size = () => { W = c.width = innerWidth; H = c.height = innerHeight; }; size(); addEventListener('resize', size);
    addEventListener('pointermove', e => { const d = Math.hypot(e.clientX - lx, e.clientY - ly); if (d > 26 && S.length < 40) { lx = e.clientX; ly = e.clientY; S.push({ x: lx + (Math.random() - .5) * 10, y: ly + (Math.random() - .5) * 10, r: 1 + Math.random() * 2.2, vy: .2 + Math.random() * .5, a: 1, col: PRISM[n++ % PRISM.length] }); } });
    (function loop() { requestAnimationFrame(loop); g.clearRect(0, 0, W, H); for (let i = S.length - 1; i >= 0; i--) { const p = S[i]; p.a -= .022; p.y += p.vy; if (p.a <= 0) { S.splice(i, 1); continue; } g.globalAlpha = p.a * .85; g.fillStyle = p.col; g.beginPath(); g.moveTo(p.x, p.y - p.r * 2.2); g.lineTo(p.x + p.r * .5, p.y - p.r * .5); g.lineTo(p.x + p.r * 2.2, p.y); g.lineTo(p.x + p.r * .5, p.y + p.r * .5); g.lineTo(p.x, p.y + p.r * 2.2); g.lineTo(p.x - p.r * .5, p.y + p.r * .5); g.lineTo(p.x - p.r * 2.2, p.y); g.lineTo(p.x - p.r * .5, p.y - p.r * .5); g.closePath(); g.fill(); } })();
    /* boutons magnétiques */
    $$('[data-magnetic]').forEach(b => {
      b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); const mx = (e.clientX - r.left - r.width / 2) * .22, my = (e.clientY - r.top - r.height / 2) * .32; b.style.transform = 'translate(' + mx + 'px,' + my + 'px)'; });
      b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
  }
  (() => {
    const btn = $('#mapBtn'); if (!btn) return;
    btn.addEventListener('click', () => {
      const cfg = window.SCN_CFG || {}, lat = cfg.LAT || 43.8306215, lng = cfg.LNG || 5.7977633, d = .006;
      const f = document.createElement('iframe');
      f.title = 'Carte : So Creativ’Nails, 260 avenue Régis Ryckebusch, Manosque'; f.loading = 'lazy'; f.referrerPolicy = 'no-referrer';
      f.src = 'https://www.openstreetmap.org/export/embed.html?bbox=' + [lng - d, lat - d * .7, lng + d, lat + d * .7].join('%2C') + '&layer=mapnik&marker=' + lat + '%2C' + lng;
      btn.replaceWith(f);
    });
  })();

  /* ------------------------------------------------------------------ préchargement et démarrage */
  function boot() {
    const loader = $('#loader'), fill = $('#loaderFill'), pct = $('#loaderPct');
    const setP = p => { const v = Math.round(Math.min(1, p) * 100); if (fill) fill.style.transform = 'scaleX(' + Math.min(1, p) + ')'; if (pct) pct.textContent = v; };
    const finish = () => {
      document.documentElement.classList.remove('is-loading');
      loader.classList.add('is-done');
      setTimeout(() => loader.remove(), 1500);
      api.ready = true; if (api.lenis) api.lenis.start();
      if (hasGsap && !reduce) heroIntro();
      else { gsap && gsap.set && gsap.set('.hero__kicker,.hero__title,.hero__lead,.hero__cta,.hero__foot,.hero__ring', { opacity: 1 }); }
      document.documentElement.classList.add('is-ready');
      if (hasGsap) setTimeout(() => ScrollTrigger.refresh(), 400);
    };
    if (!hasGsap) { loader.remove(); document.documentElement.classList.remove('is-loading', 'js'); return; }
    setupScroll();
    if (!reduce) heroScroll();
    reveals(); chrome(); shades(); reviews(); pointerFx(); glints();
    /* la hauteur de la réservation change (onglets, panier, étapes) : on recalcule les positions des animations situées plus bas */
    (() => { const b = $('#reserver'); if (!b || typeof ResizeObserver === 'undefined') return; let tm, last = b.offsetHeight; new ResizeObserver(() => { if (Math.abs(b.offsetHeight - last) < 4) return; last = b.offsetHeight; clearTimeout(tm); tm = setTimeout(() => ScrollTrigger.refresh(), 220); }).observe(b); })();
    if (reduce) { $$('.hero__scene--1 > *, .hero__foot').forEach(e => { e.style.opacity = 1; }); }
    let p = 0, shown = 0; const t0 = performance.now();
    const fontsReady = (document.fonts && document.fonts.ready) || Promise.resolve();
    let loaded = false;
    preloadHero(r => { p = r; }).then(() => fontsReady).then(() => { loaded = true; });
    (function tick() {                                  // minuterie (et non rAF) : le chargement ne dépend pas de l'affichage
      const t = performance.now() - t0;
      const goal = loaded ? 1 : Math.min(.9, p * .9);
      shown += (goal - shown) * .2;
      setP(shown);
      if (loaded && shown > .985 && t > 1500) { setP(1); setTimeout(finish, 250); return; }
      if (t > 8000 && !loaded) { loaded = true; }
      setTimeout(tick, 40);
    })();
    draw();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
