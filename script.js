/* ── MOBILE MENU ──────────────────────────────────── */
const burger = document.getElementById('burger');
const mobileMenu = document.getElementById('mobile-menu');

burger.addEventListener('click', () => {
  const open = burger.classList.toggle('is-open');
  mobileMenu.classList.toggle('is-open', open);
  burger.setAttribute('aria-expanded', open);
  mobileMenu.setAttribute('aria-hidden', !open);
  document.body.style.overflow = open ? 'hidden' : '';
});

mobileMenu.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    burger.classList.remove('is-open');
    mobileMenu.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    mobileMenu.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  });
});

/* ── SCROLL REVEAL ────────────────────────────────── */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('is-visible');
      revealObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

/* ── ACTIVE NAV ───────────────────────────────────── */
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-desktop a[href^="#"]');

const navObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      const id = e.target.id;
      navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${id}`));
    }
  });
}, { threshold: 0.35 });

sections.forEach(s => navObserver.observe(s));

/* ── HEADER HIDE ON SCROLL ────────────────────────── */
const header = document.getElementById('site-header');
let lastY = 0;

window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (y < 80) {
    header.classList.remove('header-hidden');
  } else if (y > lastY + 6) {
    header.classList.add('header-hidden');
  } else if (y < lastY - 6) {
    header.classList.remove('header-hidden');
  }
  lastY = y;
}, { passive: true });

/* ── SMOOTH SCROLL OFFSET (sticky header) ─────────── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});

/* ── BOTTOM NAV ACTIVE STATE ──────────────────────────── */
const bnItems = document.querySelectorAll('.bn-item');

const bnObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      const id = e.target.id;
      bnItems.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${id}`));
    }
  });
}, { threshold: 0.4 });

sections.forEach(s => bnObserver.observe(s));

/* ── TAP HAPTIC-LIKE FEEDBACK ─────────────────────────── */
bnItems.forEach(item => {
  item.addEventListener('touchstart', () => {
    item.style.transform = 'scale(0.9)';
  }, { passive: true });
  item.addEventListener('touchend', () => {
    setTimeout(() => { item.style.transform = ''; }, 150);
  }, { passive: true });
});

/* ── CALCULATOR ───────────────────────────────────────── */
(() => {
  const form = document.getElementById('calc');
  if (!form) return;
  const PRICE_T = 108000, BAG = 25, KG_PER_M2_MM = 2.2;
  const area = document.getElementById('calc-area');
  const th = document.getElementById('calc-th');
  const thOut = document.getElementById('calc-th-out');
  const fmt = n => n.toLocaleString('ru-RU').replace(/,/g, ' ');
  const out = { t: document.getElementById('calc-t'), bags: document.getElementById('calc-bags'), sum: document.getElementById('calc-sum') };
  function calc() {
    const a = Math.max(0, parseFloat(area.value) || 0);
    const mm = parseFloat(th.value);
    const reb = parseFloat((form.querySelector('input[name="calc-reb"]:checked') || {}).value || 0);
    thOut.textContent = mm;
    const kg = a * mm * KG_PER_M2_MM * (1 + reb / 100);
    const bags = Math.ceil(kg / BAG);
    const tons = bags * BAG / 1000;
    out.t.textContent = tons.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' т';
    out.bags.textContent = fmt(bags);
    out.sum.textContent = fmt(Math.round(bags * PRICE_T * BAG / 1000)) + ' ₸';
  }
  form.addEventListener('input', calc);
  calc();
})();

/* ── REDUCED MOTION: остановить SVG-анимации шахты на финальном кадре ── */
if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.querySelectorAll('.mine-svg').forEach(svg => {
    try { svg.setCurrentTime(parseFloat(svg.dataset.still || 0)); svg.pauseAnimations(); } catch (e) {}
  });
}
