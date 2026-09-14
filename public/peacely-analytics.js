(() => {
  'use strict';

  const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));

  const style = document.createElement('style');
  style.textContent = `
    .peacely-analytics-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:14px 0}
    .peacely-analytics-card{background:rgba(22,29,40,.94);border:1px solid rgba(148,163,184,.18);border-radius:22px;padding:18px;box-shadow:0 10px 30px rgba(0,0,0,.14)}
    .peacely-analytics-card h3{margin:0 0 14px;font-size:18px}.peacely-analytics-value{font-size:28px;font-weight:800}.peacely-analytics-muted{color:#94a3b8;font-size:13px;margin-top:5px}
    .peacely-analytics-row{padding:12px 0;border-top:1px solid rgba(148,163,184,.12)}.peacely-analytics-row:first-child{border-top:0;padding-top:0}
    .peacely-analytics-row-top{display:flex;justify-content:space-between;gap:12px;font-weight:700}.peacely-analytics-bar{height:7px;background:rgba(148,163,184,.13);border-radius:99px;overflow:hidden;margin-top:8px}.peacely-analytics-bar>span{display:block;height:100%;background:#10b981;border-radius:99px}
    .peacely-analytics-section{margin-top:16px}.peacely-analytics-section>h3{margin:0 0 10px;font-size:20px}.peacely-analytics-note{padding:12px 14px;border-radius:14px;background:rgba(16,185,129,.08);color:#cbd5e1;font-size:13px;margin-bottom:14px}
    @media(max-width:640px){.peacely-analytics-grid{grid-template-columns:1fr}.peacely-analytics-value{font-size:25px}}
  `;
  document.head.appendChild(style);

  let rendering = false;
  let lastContainer = null;

  async function getJson(path) {
    const response = await fetch(`/api/${path}`, { credentials: 'include' });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `Request failed: ${response.status}`);
    return data;
  }

  function isAnalyticsActive() {
    return [...document.querySelectorAll('.bottom-nav .nav-item.active')]
      .some((button) => /analytics/i.test(button.textContent || ''));
  }

  function findAnalyticsContainer() {
    if (!isAnalyticsActive()) return null;
    const containers = [...document.querySelectorAll('.content-area .view-container')];
    return containers.find((node) => /analytics/i.test(node.textContent || '')) || containers[0] || null;
  }

  function metric(label, value, note = '') {
    return `<div class="peacely-analytics-card"><div class="peacely-analytics-value">${esc(value)}</div><div>${esc(label)}</div>${note ? `<div class="peacely-analytics-muted">${esc(note)}</div>` : ''}</div>`;
  }

  async function renderAnalytics(container) {
    if (!container || rendering) return;
    rendering = true;
    lastContainer = container;
    try {
      const [dashboard, analytics, tenants, payments] = await Promise.all([
        getJson('dashboard'),
        getJson('analytics'),
        getJson('tenants'),
        getJson('payments')
      ]);

      const finance = dashboard?.finance || {};
      const portfolio = dashboard?.portfolio || {};
      const activeTenants = (Array.isArray(tenants) ? tenants : []).filter(t => String(t.status || '').toLowerCase() === 'active');
      const paymentRows = Array.isArray(payments) ? payments : [];
      const methods = {};
      paymentRows.forEach((payment) => {
        const method = payment.payment_method || 'Other';
        methods[method] = (methods[method] || 0) + Number(payment.amount || 0);
      });
      const methodRows = Object.entries(methods).sort((a,b) => b[1] - a[1]);
      const propertyRows = Array.isArray(analytics?.properties) ? analytics.properties : [];
      const monthlyRows = Array.isArray(analytics?.monthly) ? analytics.monthly.slice(-6) : [];
      const maxPropertyRevenue = Math.max(...propertyRows.map(p => Number(p.monthly_revenue || 0)), 1);
      const maxMonthlyExpected = Math.max(...monthlyRows.map(m => Number(m.expected || 0)), 1);

      container.innerHTML = `
        <div class="page-header"><div><h2>Analytics</h2><p>Live performance of your rental business</p></div></div>
        <div class="peacely-analytics-note">Analytics finance cards now use the same live Dashboard totals, so Expected, Collected, Outstanding and Overdue stay consistent.</div>
        <div class="peacely-analytics-grid">
          ${metric('Expected Rent', money(finance.expected ?? 0), `${portfolio.active_tenants ?? activeTenants.length} active tenants`)}
          ${metric('Collected', money(finance.collected ?? 0), `${finance.collection_rate ?? 0}% collection rate`)}
          ${metric('Outstanding', money(finance.outstanding ?? finance.pending ?? 0), 'Current unpaid balance')}
          ${metric('Overdue', money(finance.overdue ?? 0), 'Past-due balance')}
          ${metric('Properties', portfolio.properties ?? propertyRows.length)}
          ${metric('Active Tenants', portfolio.active_tenants ?? activeTenants.length)}
          ${metric('Occupied Beds', portfolio.occupied_beds ?? 0, `${portfolio.available_beds ?? 0} available`)}
          ${metric('Occupancy', `${portfolio.occupancy_rate ?? 0}%`, 'Occupied beds / total beds')}
        </div>

        <div class="peacely-analytics-section"><h3>Property Performance</h3>
          <div class="peacely-analytics-card">
            ${propertyRows.length ? propertyRows.map((p) => `
              <div class="peacely-analytics-row">
                <div class="peacely-analytics-row-top"><span>${esc(p.name || 'Property')}</span><span>${money(p.monthly_revenue)}</span></div>
                <div class="peacely-analytics-muted">${p.rooms || 0} rooms · ${p.beds || 0} beds · ${p.occupied_beds || 0} occupied · ${p.active_tenants || 0} active tenants</div>
                <div class="peacely-analytics-bar"><span style="width:${Math.min(100, Math.max(0, Number(p.monthly_revenue || 0) / maxPropertyRevenue * 100))}%"></span></div>
              </div>`).join('') : '<div class="peacely-analytics-muted">No property data yet.</div>'}
          </div>
        </div>

        <div class="peacely-analytics-section"><h3>Payment Methods</h3>
          <div class="peacely-analytics-card">
            ${methodRows.length ? methodRows.map(([method, amount]) => `<div class="peacely-analytics-row"><div class="peacely-analytics-row-top"><span>${esc(method)}</span><span>${money(amount)}</span></div></div>`).join('') : '<div class="peacely-analytics-muted">No payments recorded yet.</div>'}
          </div>
        </div>

        <div class="peacely-analytics-section"><h3>Monthly Finance</h3>
          <div class="peacely-analytics-card">
            ${monthlyRows.length ? monthlyRows.map((m) => `<div class="peacely-analytics-row"><div class="peacely-analytics-row-top"><span>${esc(m.month || '-')}</span><span>${money(m.collected || 0)} collected</span></div><div class="peacely-analytics-muted">Expected ${money(m.expected || 0)} · Outstanding ${money(m.outstanding || 0)}</div><div class="peacely-analytics-bar"><span style="width:${Math.min(100, Math.max(0, Number(m.expected || 0) / maxMonthlyExpected * 100))}%"></span></div></div>`).join('') : '<div class="peacely-analytics-muted">No monthly invoice data yet.</div>'}
          </div>
        </div>

        <div class="peacely-analytics-section"><h3>Occupancy Trend</h3>
          <div class="peacely-analytics-card">
            ${Array.isArray(analytics?.occupancy_trend) && analytics.occupancy_trend.length ? analytics.occupancy_trend.slice(-7).map((o) => `<div class="peacely-analytics-row"><div class="peacely-analytics-row-top"><span>${esc(o.date || '-')}</span><span>${o.active_tenants || 0} tenants</span></div><div class="peacely-analytics-muted">${o.occupied_beds ?? o.active_tenants ?? 0} occupied of ${o.total_beds || portfolio.beds || 0} beds</div></div>`).join('') : '<div class="peacely-analytics-muted">No occupancy trend data yet.</div>'}
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Peacely analytics failed:', error);
      container.innerHTML = `<div class="page-header"><div><h2>Analytics</h2><p>Unable to load analytics right now.</p></div></div><div class="error-box">${esc(error instanceof Error ? error.message : 'Failed to load analytics.')}</div>`;
    } finally {
      rendering = false;
    }
  }

  function check() {
    const container = findAnalyticsContainer();
    if (container && container !== lastContainer) renderAnalytics(container);
    else if (container && isAnalyticsActive() && !container.dataset.peacelyAnalytics) {
      container.dataset.peacelyAnalytics = '1';
      renderAnalytics(container);
    }
    if (!isAnalyticsActive()) lastContainer = null;
  }

  const observer = new MutationObserver(() => {
    if (!rendering) check();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.setTimeout(check, 500);
  window.setInterval(check, 1200);
})();