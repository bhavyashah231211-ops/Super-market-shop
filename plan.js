/* CBSystem Shop: plan permissions. Loaded automatically by config.js; it only acts on the till page (staff/index.html).
   The server sends each shop's plan on every sync (x-cbs-plan header). This script hides the screens that are not in
   the plan, enforces product / staff limits, sends a device id, and shows expired / device-limit screens.
   The POS code itself is not changed. */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    if (typeof DB === 'undefined' || typeof TEN === 'undefined' || !window.CBS_API) return; // not the till page
    const API = window.CBS_API;
    const DEVK = 'cbs_shop_dev', PLANK = 'cbs_shop_plan';
    const ALL = { stock: 'full', card: true, reports: 'full', customers: true, promotions: true, owner_access: true, max_products: null, max_staff: null, max_devices: null };
    let FEAT = Object.assign({}, ALL), PAID = '', LOCK = null;

    const bizNow = () => (TEN.biz || new URLSearchParams(location.search).get('biz') || localStorage.getItem('cbs_last_biz') || '').toLowerCase();
    try { const s = JSON.parse(localStorage.getItem(PLANK) || 'null'); if (s && s.biz === bizNow()) { FEAT = Object.assign({}, ALL, s.f); PAID = s.p || ''; } } catch (e) {}

    const st = document.createElement('style');
    st.textContent = '.cbs-off{display:none!important}';
    document.head.appendChild(st);

    function devId() {
      try {
        let d = localStorage.getItem(DEVK);
        if (!d) { d = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2); localStorage.setItem(DEVK, d); }
        return d;
      } catch (e) { return ''; }
    }
    function setPlan(f, p) {
      if (f && typeof f === 'object') FEAT = Object.assign({}, ALL, f);
      PAID = p || '';
      try { localStorage.setItem(PLANK, JSON.stringify({ biz: bizNow(), f: FEAT, p: PAID })); } catch (e) {}
      applyFeatures();
    }

    /* ---- read the plan from every server reply; turn "expired" / "device limit" into the existing lock screen ---- */
    const _fetch = window.fetch.bind(window);
    window.fetch = function (u, o) {
      const p = _fetch(u, o);
      if (typeof u !== 'string' || u !== API) return p;
      return p.then(async function (r) {
        try { const h = r.headers.get('x-cbs-plan'); if (h) { const pl = JSON.parse(h); setPlan(pl.f, pl.p); } } catch (e) {}
        if (r.status === 200) { LOCK = null; }
        else if (r.status === 403) {
          try {
            const j = await r.clone().json();
            if (j.error === 'expired' || j.error === 'device_limit') {
              LOCK = j;
              return new Response(JSON.stringify({ error: 'suspended' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }
          } catch (e) {}
        }
        return r;
      });
    };
    const osl = window.showLock;
    window.showLock = function (msg) {
      const t = document.querySelector('#lock-screen .ls-venue-name');
      if (LOCK && LOCK.error === 'expired') { msg = 'Your subscription has expired. Please contact CBSystem to renew.'; if (t) t.textContent = 'SUBSCRIPTION EXPIRED'; }
      else if (LOCK) { msg = (LOCK.message || 'Device limit reached for your plan') + '. Ask CBSystem to free a device.'; if (t) t.textContent = 'DEVICE LIMIT REACHED'; }
      else if (t) t.textContent = 'ACCOUNT PAUSED';
      return osl(msg);
    };

    /* ---- send the device id with every call ---- */
    const oc = DB._call.bind(DB);
    DB._call = function (a, e) { return oc(a, Object.assign({}, e || {}, { device: devId() })); };

    /* ---- a refused save (product / staff limit): put back the server's list, keep everything else (sales, stock) ---- */
    let busy = false, lastToast = 0;
    const of = DB._fail.bind(DB);
    DB._fail = function (status, j) {
      if (status === 403 && j && (j.error === 'staff_limit' || j.error === 'product_limit')) { limitHit(j); return; }
      return of(status, j);
    };
    function limitHit(j) {
      if (Date.now() - lastToast > 8000) { toast(j.message || 'Plan limit reached', '⚠️', 't-o'); lastToast = Date.now(); }
      if (busy) return; busy = true;
      const key = j.error === 'staff_limit' ? 'staff' : 'products';
      setTimeout(async function () {
        try {
          const r = await DB._call('pull', { since: -1 });
          if (r.status === 200 && r.j.ok && r.j.data && Array.isArray(r.j.data[key])) {
            DB.d[key] = r.j.data[key];
            try { localStorage.setItem(LSK, JSON.stringify(DB.d)); } catch (e) {}
            DB._dirty = true;
            if (typeof refreshCurrentView === 'function') refreshCurrentView();
          }
        } catch (e) {}
        busy = false;
      }, 300);
    }

    /* ---- hide what the plan does not include ---- */
    function planNote() {
      let n = document.getElementById('cbs-plan-note'), msg = '';
      if (PAID) {
        const days = Math.ceil((new Date(PAID).getTime() - Date.now()) / 864e5);
        if (days <= 7) msg = days >= 0 ? 'Subscription ends ' + new Date(PAID).toLocaleDateString('en-GB') + ' (' + days + ' day' + (days === 1 ? '' : 's') + ' left)' : 'Subscription overdue. Please renew to avoid interruption';
      }
      if (!msg) { if (n) n.remove(); return; }
      if (!n) {
        n = document.createElement('div'); n.id = 'cbs-plan-note';
        n.style.cssText = 'position:fixed;left:10px;bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:7991;background:#2a1a10;border:1px solid #ff6b35;color:#ffb38f;border-radius:8px;padding:4px 10px;font-size:11px;font-family:system-ui,sans-serif';
        document.body.appendChild(n);
      }
      if (n.textContent !== msg) n.textContent = msg;
    }
    function applyFeatures() {
      if (!document.body) return;
      const off = (sel, on) => document.querySelectorAll(sel).forEach(e => e.classList.toggle('cbs-off', !!on));
      document.querySelectorAll('#t-tabs .tab').forEach(b => {
        const c = b.getAttribute('onclick') || '';
        const hide = (FEAT.stock === 'basic' && /'(v-transfer|v-stocktake|v-locs)'/.test(c))
          || (!FEAT.customers && c.indexOf("'v-customers'") > -1)
          || (!FEAT.promotions && c.indexOf("'v-promotions'") > -1);
        b.classList.toggle('cbs-off', hide);
      });
      off('button[onclick="openLinkCustomer()"]', !FEAT.customers);
      off('button[onclick="openPromoSelector()"]', !FEAT.promotions);
      document.querySelectorAll('#reports-body .tab').forEach(b => {
        const c = b.getAttribute('onclick') || '';
        b.classList.toggle('cbs-off', FEAT.reports === 'basic' && /showReport\('(cost|movements|reconcile)'/.test(c));
      });
      const ex = document.querySelector('#report-content button[onclick^="exportSalesExcel"]');
      if (ex) { const c = ex.closest('.card'); if (c) c.classList.toggle('cbs-off', FEAT.reports === 'basic'); }
      const pp = document.getElementById('cfg-payprov');
      if (pp) { const c = pp.closest('.set-card'); if (c) c.classList.toggle('cbs-off', !FEAT.card); }
      planNote();
    }
    function wrap(name, fn) {
      const o = window[name]; if (typeof o !== 'function') return;
      window[name] = function () { return fn(o, this, arguments); };
    }
    /* limits checked on the till as well, so the person gets a message straight away */
    wrap('saveProduct', function (o, t, a) {
      if (!a[0] && FEAT.max_products && DB.get('products').length >= FEAT.max_products) { toast('Your plan allows ' + FEAT.max_products + ' products', '⚠️', 't-o'); return; }
      return o.apply(t, a);
    });
    wrap('doIntakeNew', function (o, t, a) {
      if (FEAT.max_products && DB.get('products').length >= FEAT.max_products) { toast('Your plan allows ' + FEAT.max_products + ' products', '⚠️', 't-o'); return; }
      return o.apply(t, a);
    });
    wrap('saveUser', function (o, t, a) {
      if (FEAT.max_staff) {
        const staff = DB.get('staff'), id = a[0], cur = id ? staff.find(s => s.id === id) : null;
        const wantActive = (document.getElementById('um-active') || {}).checked !== false;
        const others = staff.filter(s => s.active !== false && (!cur || s.id !== id)).length;
        if (wantActive && others >= FEAT.max_staff) { toast('Your plan allows ' + FEAT.max_staff + ' staff logins', '⚠️', 't-o'); return; }
      }
      return o.apply(t, a);
    });

    try {
      let raf = 0;
      new MutationObserver(function () {
        if (raf) return;
        raf = requestAnimationFrame(function () { raf = 0; try { applyFeatures(); } catch (e) {} });
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
    applyFeatures();
  }
})();
