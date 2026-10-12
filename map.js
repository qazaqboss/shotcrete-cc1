/* ── DELIVERY MAP ─────────────────────────────────── */
(() => {
  const root = document.getElementById('delivery');
  if (!root) return;

  // Ориентир срока доставки: грузовик идёт медленнее легкового профиля OSRM,
  // и за сутки водитель проезжает ограниченное число часов.
  const TRUCK_FACTOR = 1.25;
  const DRIVE_HOURS_PER_DAY = 9;
  const MIN_GAP = 18;          // px между маркерами при раздвигании
  const LABEL_ZOOM = 6;        // с какого масштаба видны подписи
  const STORE_KEY = 'dm-hidden';

  const LABEL_DIR = {
    don: 'bottom', prior: 'top', oct: 'right', aral: 'right', kund: 'right', yub: 'left',
    art: 'left', nof: 'right', irt: 'right', miz: 'left',
    zhol: 'left', aksu: 'left', best: 'right', pust: 'right', akb: 'right',
  };
  const LABEL_OFFSET = { right: [10, 0], left: [-10, 0], top: [0, -10], bottom: [0, 10] };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString('ru-RU');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function haversine(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const deliveryDays = (h) => Math.max(1, Math.ceil((h * TRUCK_FACTOR) / DRIVE_HOURS_PER_DAY));
  const daysLabel = (d) => `${d} ${d === 1 ? 'сутки' : 'суток'}`;
  const hoursLabel = (h) => (h < 1 ? '< 1 ч' : `${Math.round(h)} ч`);

  function loadHidden() {
    try { return new Set(JSON.parse(localStorage.getItem(STORE_KEY) || '[]')); } catch { return new Set(); }
  }
  function saveHidden(set) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify([...set])); } catch { /* приватный режим */ }
  }

  let plant, sites, companies, coById;
  let hidden = loadHidden();
  let selectedId = null;
  let map = null;
  const mk = {};           // id → { marker, route, leader, latlng }

  Promise.all([
    fetch('data/sites.json').then((r) => r.json()),
    fetch('data/companies.json').then((r) => r.json()),
  ]).then(([s, c]) => {
    plant = s.plant;
    companies = c;
    coById = Object.fromEntries(c.map((x) => [x.id, x]));
    sites = s.sites.map((x) => ({ ...x, km: haversine(plant, x), days: deliveryDays(x.road_h) }))
      .sort((a, b) => a.road_km - b.road_km);
    sites.forEach((x, i) => { x.rank = i; });
    hidden = new Set([...hidden].filter((id) => coById[id]));

    renderChips();
    renderStats();
    renderCompanies();
    renderSources();
    refresh();
    observeEntrance();
  }).catch(() => {
    $('dm-card').innerHTML = '<p>Не удалось загрузить данные карты.</p>';
  });

  const visibleSites = () => sites.filter((x) => !hidden.has(x.co));

  /* ── chips ── */
  function renderChips() {
    $('dm-chips').innerHTML = companies.map((c) => {
      const n = sites.filter((x) => x.co === c.id).length;
      return `<button type="button" class="dm-chip" style="--c:${c.color}" data-co="${c.id}" aria-pressed="${!hidden.has(c.id)}">
        <span class="dm-dot"></span>${esc(c.short || c.name)}<span class="dm-chip-n">${n}</span></button>`;
    }).join('');
    $('dm-chips').addEventListener('click', (e) => {
      const btn = e.target.closest('.dm-chip');
      if (!btn) return;
      const co = btn.dataset.co;
      hidden.has(co) ? hidden.delete(co) : hidden.add(co);
      btn.setAttribute('aria-pressed', !hidden.has(co));
      saveHidden(hidden);
      if (selectedId && hidden.has(sites.find((x) => x.id === selectedId).co)) selectedId = null;
      refresh();
    });

    $('dm-legend').innerHTML = `<span><span class="dm-legend-star">★</span>Завод EasyMix</span>` +
      companies.map((c) => `<span><span class="dm-dot" style="--c:${c.color}"></span>${esc(c.short || c.name)}</span>`).join('');
  }

  /* ── stats ── */
  function renderStats() {
    const near = sites.filter((x) => x.road_km <= 300).length;
    const nums = root.querySelectorAll('.dm-stat-num');
    nums[0].dataset.count = sites.length;
    nums[1].dataset.count = companies.length;
    nums[2].dataset.count = sites[0].road_km;
    nums[3].dataset.count = near;
    nums[3].dataset.suffix = ` из ${sites.length}`;
    nums.forEach((el) => { el.textContent = (reduceMotion ? fmt(+el.dataset.count) : '0') + (el.dataset.suffix || ''); });
  }

  function countUp() {
    root.querySelectorAll('.dm-stat-num').forEach((el) => countTo(el, +el.dataset.count, el.dataset.suffix || '', 1200));
  }
  function countTo(el, to, suffix, dur) {
    if (reduceMotion) { el.textContent = fmt(to) + suffix; return; }
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = fmt(to * (1 - Math.pow(1 - p, 3))) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ── panel / list / table ── */
  function refresh() {
    renderCard();
    renderList();
    renderTable();
    if (map) syncMap();
  }

  function renderCard() {
    const card = $('dm-card');
    const vis = visibleSites();
    const s = selectedId && sites.find((x) => x.id === selectedId);
    if (!s) {
      const near = vis[0];
      card.style.setProperty('--c', 'var(--c-plant)');
      card.innerHTML = `
        <div class="dm-tag"><span class="dm-dot"></span>Точка отгрузки</div>
        <h3>${esc(plant.name)}</h3>
        <dl class="dm-dl">
          <dt>Адрес</dt><dd>${esc(plant.addr)}</dd>
          <dt>Продукция</dt><dd>${esc(plant.product)}</dd>
          <dt>На карте</dt><dd><span class="dm-mono">${vis.length}</span> объектов</dd>
          ${near ? `<dt>Ближайший</dt><dd>${esc(near.name)}, <span class="dm-mono">${fmt(near.road_km)} км</span></dd>` : ''}
        </dl>
        <p>Выберите объект на карте или в списке, чтобы увидеть маршрут, расстояние и ориентировочный срок доставки.</p>`;
    } else {
      const c = coById[s.co];
      card.style.setProperty('--c', c.color);
      card.innerHTML = `
        <div class="dm-tag"><span class="dm-dot"></span>${esc(c.name)}</div>
        <h3>${esc(s.name)}</h3>
        <div class="dm-km"><span class="dm-km-num" id="dm-km-num">0</span><span class="dm-km-unit">км по дороге</span></div>
        <div class="dm-km-sub">${fmt(s.km)} км по прямой от завода</div>
        <div class="dm-eta">
          <div><b>≈ ${hoursLabel(s.road_h)}</b><span>в пути</span></div>
          <div><b>≈ ${daysLabel(s.days)}</b><span>срок доставки</span></div>
        </div>
        <dl class="dm-dl">
          <dt>Регион</dt><dd>${esc(s.region)}</dd>
          <dt>Тип</dt><dd>${esc(s.type)}</dd>
          <dt>Сырьё</dt><dd>${esc(c.raw)}</dd>
          <dt>Координаты</dt><dd class="dm-mono">${s.approx ? '≈ ' : ''}${s.lat}, ${s.lon} · ${s.approx ? 'ориентировочно' : 'по документу'}</dd>
        </dl>
        <p>${esc(s.about)}</p>
        <a class="dm-src" href="${esc(s.src)}" target="_blank" rel="noopener">Источник</a>
        <button type="button" class="dm-back" id="dm-back">← к заводу</button>`;
      countTo($('dm-km-num'), s.road_km, '', 700);
      $('dm-back').addEventListener('click', () => select(null));
    }
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';
  }

  function renderList() {
    $('dm-list').innerHTML = visibleSites().map((s) => `
      <li><button type="button" data-id="${s.id}" class="${s.id === selectedId ? 'is-active' : ''}" style="--c:${coById[s.co].color}">
        <span class="dm-dot"></span><span>${esc(s.name)}</span><span class="dm-list-km">${fmt(s.road_km)} км</span>
      </button></li>`).join('');
  }
  $('dm-list').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    select(b.dataset.id);
    if (window.innerWidth <= 980) scrollToMap();
  });

  let barsShown = false;
  function renderTable() {
    const vis = visibleSites();
    const max = Math.max(...sites.map((x) => x.road_km));
    $('dm-table').tBodies[0].innerHTML = vis.map((s) => {
      const c = coById[s.co];
      return `<tr data-id="${s.id}" tabindex="0" class="${s.id === selectedId ? 'is-active' : ''}" style="--c:${c.color}">
        <td>${esc(s.name)}${s.approx ? '&nbsp;<span title="Положение ориентировочное">≈</span>' : ''}</td>
        <td><span class="dm-co"><span class="dm-dot"></span>${esc(c.short || c.name)}</span></td>
        <td>${esc(s.region)}</td>
        <td>${esc(c.raw)}</td>
        <td class="num">${fmt(s.road_km)} км</td>
        <td class="num">${fmt(s.km)} км</td>
        <td class="num">≈ ${daysLabel(s.days)}</td>
        <td><div class="dm-bar"><i data-w="${(s.road_km / max) * 100}"></i></div></td>
      </tr>`;
    }).join('');
    if (barsShown) showBars();
  }
  function showBars() {
    barsShown = true;
    requestAnimationFrame(() => $('dm-table').querySelectorAll('.dm-bar i').forEach((i) => { i.style.width = i.dataset.w + '%'; }));
  }
  $('dm-table').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) { select(tr.dataset.id); scrollToMap(); }
  });
  $('dm-table').addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr && e.key === 'Enter') { select(tr.dataset.id); scrollToMap(); }
  });
  function scrollToMap() {
    const top = $('dm-map').getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function renderCompanies() {
    $('dm-companies').innerHTML = companies.map((c) => {
      const own = sites.filter((x) => x.co === c.id);
      return `<article class="dm-comp" style="--c:${c.color}">
        <h4>${esc(c.name)}</h4>
        <div class="dm-comp-meta">${esc(c.owner)} · ${esc(c.raw)}</div>
        <p>${esc(c.about)}</p>
        <div class="dm-comp-foot"><span>Объектов: <b>${own.length}</b></span><span>Ближайший: <b>${fmt(own[0].road_km)} км</b></span></div>
      </article>`;
    }).join('');
  }

  function renderSources() {
    const urls = [...new Set(sites.map((x) => x.src))];
    $('dm-sources').innerHTML = urls.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, ''))}</a></li>`).join('') +
      '<li>Картографическая основа: © Esri, © OpenStreetMap contributors · маршруты: OSRM</li>';
  }

  /* ── selection ── */
  function select(id, opts = {}) {
    selectedId = id;
    refresh();
    if (!map) return;
    if (!id) { fitAll(); return; }
    const s = sites.find((x) => x.id === id);
    const b = L.latLngBounds([[plant.lat, plant.lon], [s.lat, s.lon]]);
    // Справа больше места под подписи, сверху под кнопку и подпись завода.
    const pad = window.innerWidth < 680
      ? { paddingTopLeft: [60, 80], paddingBottomRight: [110, 50], maxZoom: 9 }
      : { paddingTopLeft: [90, 90], paddingBottomRight: [160, 70], maxZoom: 9 };
    if (opts.fly === false) return;
    reduceMotion ? map.fitBounds(b, pad) : map.flyToBounds(b, { ...pad, duration: 1.1 });
  }

  /* ── entrance ── */
  function observeEntrance() {
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      initMap();
      countUp();
    }, { rootMargin: '200px 0px' });
    io.observe($('dm-map'));

    const tio = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      tio.disconnect();
      showBars();
    }, { threshold: 0.2 });
    tio.observe($('dm-table'));
  }

  /* ── map ── */
  function initMap() {
    if (!window.L) {
      // Leaflet подгружается с defer; ждём его.
      if (!initMap.tries) initMap.tries = 0;
      if (++initMap.tries < 40) setTimeout(initMap, 150);
      return;
    }
    map = L.map('dm-map', {
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      scrollWheelZoom: false,
      minZoom: 3,
      maxZoom: 12,
      attributionControl: true,
    });
    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());
    map.getContainer().addEventListener('click', () => map.scrollWheelZoom.enable(), { once: true });

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16,
      attribution: 'Подложка © Esri, HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

    map.createPane('routes').style.zIndex = 420;
    map.createPane('plant').style.zIndex = 650;

    fetch('data/kz-border.geojson').then((r) => r.json()).then(drawBorder).catch(() => {});

    // завод
    const plantIcon = L.divIcon({
      className: 'dm-plant',
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      html: `<div class="dm-plant-in"><svg viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r="16" fill="#0B0D0B" stroke="#7EC64A" stroke-width="2"/>
        <path d="M17 7.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" fill="#7EC64A"/></svg></div>`,
    });
    L.marker([plant.lat, plant.lon], { icon: plantIcon, pane: 'plant', zIndexOffset: 1000, title: plant.name, keyboard: true })
      .bindTooltip('EasyMix', { permanent: true, direction: 'top', offset: [0, -18], className: 'dm-lbl dm-lbl-plant' })
      .on('click', () => select(null))
      .addTo(map);

    // объекты
    sites.forEach((s) => {
      const c = coById[s.co];
      const latlng = L.latLng(s.lat, s.lon);
      const dir = LABEL_DIR[s.id] || 'right';
      const marker = L.marker(latlng, {
        icon: L.divIcon({
          className: 'dm-mk',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
          html: `<div class="dm-mk-in" style="--c:${c.color};--d:${(0.25 + s.rank * 0.07).toFixed(2)}s"></div>`,
        }),
        title: `${s.name} — ${c.short || c.name}, ${fmt(s.road_km)} км`,
        keyboard: true,
        riseOnHover: true,
      })
        .bindTooltip(esc(s.name), { permanent: true, direction: dir, offset: LABEL_OFFSET[dir], className: 'dm-lbl dm-lbl-site' })
        .on('click', () => select(s.id));
      marker.on('add', () => {
        const el = marker.getElement();
        el.setAttribute('role', 'button');
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(s.id); }
        });
      });

      const route = L.polyline(arc(plant, s), {
        pane: 'routes', color: c.color, weight: 1.5, className: 'dm-route', interactive: false,
      });
      const leader = L.polyline([latlng, latlng], { pane: 'routes', className: 'dm-leader', interactive: false });
      mk[s.id] = { marker, route, leader, latlng };
    });

    hi.layer = L.polyline([], { pane: 'routes', weight: 2.5, className: 'dm-route dm-route-hi', interactive: false });
    hi.truck = L.circleMarker([plant.lat, plant.lon], { pane: 'routes', radius: 5, weight: 2, color: '#fff', fillOpacity: 1, className: 'dm-truck', interactive: false });
    hi.km = L.marker([plant.lat, plant.lon], { icon: L.divIcon({ className: '', iconSize: [0, 0] }), interactive: false, keyboard: false });

    $('dm-reset').addEventListener('click', () => select(null));
    map.on('zoomend', () => { declutter(); toggleLabels(); });
    map.on('resize', declutter);

    fitAll(false);
    syncMap();
    requestAnimationFrame(() => root.classList.add('is-live'));
  }

  function drawBorder(gj) {
    const geom = gj.features[0].geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    const toLL = (ring) => ring.map(([lon, lat]) => [lat, lon]);
    const holes = polys.map((p) => toLL(p[0]));
    const world = [[-89, -179.9], [-89, 179.9], [89, 179.9], [89, -179.9]];
    L.polygon([world, ...holes], {
      stroke: false, fillColor: '#050705', fillOpacity: 0.55, interactive: false, className: 'dm-mask',
    }).addTo(map);
    L.polygon(holes, {
      color: '#7EC64A', weight: 1.5, opacity: 0.7, fill: true, fillColor: '#7EC64A', fillOpacity: 0.03, interactive: false,
    }).addTo(map);
  }

  // Плавная дуга от завода к объекту (квадратичная кривая Безье, изгиб к северу).
  function arc(a, b) {
    const dx = b.lon - a.lon, dy = b.lat - a.lat;
    const len = Math.hypot(dx, dy);
    let nx = -dy / len, ny = dx / len;
    if (ny < 0) { nx = -nx; ny = -ny; }
    const k = Math.min(0.22 * len, 3);
    const cx = a.lon + dx / 2 + nx * k, cy = a.lat + dy / 2 + ny * k;
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48, u = 1 - t;
      pts.push([u * u * a.lat + 2 * u * t * cy + t * t * b.lat, u * u * a.lon + 2 * u * t * cx + t * t * b.lon]);
    }
    return pts;
  }

  function syncMap() {
    sites.forEach((s) => {
      const m = mk[s.id];
      const show = !hidden.has(s.co);
      [m.marker, m.route, m.leader].forEach((l) => (show ? l.addTo(map) : l.remove()));
      const el = m.marker.getElement();
      if (el) el.classList.toggle('is-active', s.id === selectedId);
    });
    highlight();
    declutter();
    toggleLabels();
  }

  function fitAll(animate = true) {
    const pts = [[plant.lat, plant.lon], ...visibleSites().map((s) => [s.lat, s.lon])];
    const b = L.latLngBounds(pts);
    const opts = { padding: [40, 40], animate: animate && !reduceMotion };
    animate && !reduceMotion ? map.flyToBounds(b, { padding: [40, 40], duration: 1 }) : map.fitBounds(b, opts);
  }

  function toggleLabels() {
    map.getContainer().classList.toggle('labels-off', map.getZoom() < LABEL_ZOOM);
  }

  // Раздвигаем близкие маркеры, чтобы ни один не прятался под другим.
  // Настоящее положение соединяется с маркером тонкой линией-выноской.
  function declutter() {
    if (!map) return;
    const vis = visibleSites();
    const anchor = map.latLngToLayerPoint([plant.lat, plant.lon]);
    const nodes = vis.map((s) => {
      const p = map.latLngToLayerPoint(mk[s.id].latlng);
      return { s, ox: p.x, oy: p.y, x: p.x, y: p.y };
    });
    for (let it = 0; it < 80; it++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        // от завода
        let dx = a.x - anchor.x, dy = a.y - anchor.y, d = Math.hypot(dx, dy);
        if (d < MIN_GAP + 8) {
          if (d < 0.01) { dx = 1; dy = 0; d = 1; }
          const push = (MIN_GAP + 8 - d);
          a.x += (dx / d) * push; a.y += (dy / d) * push; moved = true;
        }
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          dx = b.x - a.x; dy = b.y - a.y; d = Math.hypot(dx, dy);
          if (d < MIN_GAP) {
            if (d < 0.01) { dx = (j % 2 ? 1 : -1); dy = 0.5; d = Math.hypot(dx, dy); }
            const push = (MIN_GAP - d) / 2;
            a.x -= (dx / d) * push; a.y -= (dy / d) * push;
            b.x += (dx / d) * push; b.y += (dy / d) * push;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    nodes.forEach((n) => {
      const m = mk[n.s.id];
      const shown = map.layerPointToLatLng([n.x, n.y]);
      m.marker.setLatLng(shown);
      const off = Math.hypot(n.x - n.ox, n.y - n.oy) > 3;
      m.leader.setLatLngs(off ? [m.latlng, shown] : [m.latlng, m.latlng]);
    });
  }

  /* ── highlighted route + moving "truck" ── */
  const hi = { layer: null, truck: null, km: null, raf: 0 };
  function highlight() {
    cancelAnimationFrame(hi.raf);
    const s = selectedId && sites.find((x) => x.id === selectedId);
    if (!s) {
      hi.layer.remove(); hi.truck.remove(); hi.km.remove();
      return;
    }
    const c = coById[s.co];
    const pts = arc(plant, s);
    hi.layer.setLatLngs(pts).setStyle({ color: c.color }).addTo(map);
    hi.truck.setStyle({ fillColor: c.color }).setLatLng(pts[0]).addTo(map);
    hi.km.setLatLng(pts[24]).addTo(map)
      .unbindTooltip()
      .bindTooltip(`${fmt(s.road_km)} км`, { permanent: true, direction: 'top', className: 'dm-lbl dm-lbl-km', offset: [0, -4] })
      .openTooltip();
    if (reduceMotion) { hi.truck.setLatLng(pts[pts.length - 1]); return; }
    const dur = 2600, pause = 600;
    let t0 = performance.now();
    const step = (t) => {
      let p = (t - t0) / dur;
      if (p > 1 + pause / dur) { t0 = t; p = 0; }
      const e = Math.min(1, p);
      const eased = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
      const f = eased * (pts.length - 1), i = Math.floor(f), r = f - i;
      const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
      hi.truck.setLatLng([a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]);
      hi.raf = requestAnimationFrame(step);
    };
    hi.raf = requestAnimationFrame(step);
  }
})();
