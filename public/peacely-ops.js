(() => {
  const state = {
    authenticated: false,
    open: false,
    loading: false,
    dashboard: null,
    analytics: null,
    tenants: [],
    properties: [],
    rooms: [],
    beds: [],
    selectedTenant: null,
    moveOutDate: new Date().toISOString().slice(0, 10),
    error: '',
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
  const date = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const normalize = (value) => String(value || '').trim().toLowerCase();

  const api = async (path, options = {}) => {
    const response = await fetch(`/api${path}`, {
      credentials: 'include',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `Request failed: ${response.status}`);
    return data;
  };

  const style = document.createElement('style');
  style.textContent = `
    #peacely-ops-root { position: fixed; inset: 0; z-index: 9998; pointer-events: none; font-family: inherit; }
    #peacely-ops-button { position: fixed; right: 18px; bottom: 86px; pointer-events: auto; border: 0; border-radius: 999px; padding: 12px 16px; background: #0f172a; color: white; box-shadow: 0 12px 30px rgba(15,23,42,.28); font-weight: 700; cursor: pointer; }
    #peacely-ops-panel { position: fixed; top: 0; right: 0; width: min(460px, 100vw); height: 100vh; background: #f8fafc; color: #0f172a; box-shadow: -18px 0 50px rgba(15,23,42,.18); transform: translateX(105%); transition: transform .22s ease; pointer-events: auto; overflow: auto; }
    #peacely-ops-panel.open { transform: translateX(0); }
    .peacely-ops-head { position: sticky; top: 0; z-index: 2; display:flex; align-items:center; justify-content:space-between; padding:18px; background:rgba(248,250,252,.96); backdrop-filter:blur(12px); border-bottom:1px solid #e2e8f0; }
    .peacely-ops-head h2 { margin:0; font-size:20px; } .peacely-ops-head p { margin:4px 0 0; font-size:12px; color:#64748b; }
    .peacely-ops-close { border:0; background:#e2e8f0; border-radius:10px; width:36px; height:36px; font-size:20px; cursor:pointer; }
    .peacely-ops-body { padding:16px; }
    .peacely-ops-tabs { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:14px; }
    .peacely-ops-tab { border:1px solid #cbd5e1; background:white; border-radius:10px; padding:10px 6px; font-weight:700; cursor:pointer; font-size:12px; }
    .peacely-ops-tab.active { background:#0f172a; color:white; border-color:#0f172a; }
    .peacely-ops-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
    .peacely-ops-card { background:white; border:1px solid #e2e8f0; border-radius:14px; padding:14px; }
    .peacely-ops-card small { display:block; color:#64748b; margin-bottom:6px; } .peacely-ops-card strong { font-size:20px; }
    .peacely-ops-section { margin-top:14px; } .peacely-ops-section h3 { margin:0 0 10px; font-size:15px; }
    .peacely-ops-row { background:white; border:1px solid #e2e8f0; border-radius:12px; padding:12px; margin-bottom:8px; }
    .peacely-ops-row-top { display:flex; justify-content:space-between; gap:10px; } .peacely-ops-row p { margin:4px 0; color:#64748b; font-size:12px; }
    .peacely-ops-actions { display:flex; gap:7px; flex-wrap:wrap; margin-top:9px; }
    .peacely-ops-actions button { border:0; border-radius:8px; padding:8px 10px; cursor:pointer; font-weight:700; font-size:12px; }
    .peacely-ops-primary { background:#0f172a; color:white; } .peacely-ops-danger { background:#fee2e2; color:#991b1b; }
    .peacely-ops-muted { color:#64748b; font-size:13px; } .peacely-ops-error { background:#fee2e2; color:#991b1b; border-radius:10px; padding:10px; margin-bottom:10px; font-size:13px; }
    .peacely-ops-field { width:100%; box-sizing:border-box; padding:10px; border:1px solid #cbd5e1; border-radius:9px; margin:6px 0; background:white; }
    .peacely-ops-bar { height:8px; background:#e2e8f0; border-radius:99px; overflow:hidden; margin-top:8px; } .peacely-ops-bar > div { height:100%; background:#0f172a; }
    @media (max-width: 520px) { #peacely-ops-button { right:12px; bottom:78px; } }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'peacely-ops-root';
  root.innerHTML = `
    <button id="peacely-ops-button" hidden>⚙ Operations</button>
    <aside id="peacely-ops-panel" aria-hidden="true">
      <div class="peacely-ops-head"><div><h2>Operations Center</h2><p>Live dashboard, analytics and tenant lifecycle</p></div><button class="peacely-ops-close" id="peacely-ops-close">×</button></div>
      <div class="peacely-ops-body"><div id="peacely-ops-content"></div></div>
    </aside>`;
  document.body.appendChild(root);

  const button = document.getElementById('peacely-ops-button');
  const panel = document.getElementById('peacely-ops-panel');
  const content = document.getElementById('peacely-ops-content');
  let activeTab = 'dashboard';

  const render = () => {
    if (!state.authenticated) { button.hidden = true; return; }
    button.hidden = false;
    panel.classList.toggle('open', state.open);
    panel.setAttribute('aria-hidden', String(!state.open));

    const d = state.dashboard || {};
    const p = d.portfolio || {};
    const f = d.finance || {};

    if (state.error) content.innerHTML = `<div class="peacely-ops-error">${escapeHtml(state.error)}</div>`;
    else content.innerHTML = '';

    content.innerHTML += `
      <div class="peacely-ops-tabs">
        <button class="peacely-ops-tab ${activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">Dashboard</button>
        <button class="peacely-ops-tab ${activeTab === 'analytics' ? 'active' : ''}" data-tab="analytics">Analytics</button>
        <button class="peacely-ops-tab ${activeTab === 'tenants' ? 'active' : ''}" data-tab="tenants">Lifecycle</button>
      </div>
      <div id="peacely-ops-view"></div>`;

    const view = document.getElementById('peacely-ops-view');
    if (activeTab === 'dashboard') renderDashboard(view, p, f, d);
    if (activeTab === 'analytics') renderAnalytics(view);
    if (activeTab === 'tenants') renderTenants(view);

    content.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => {
      activeTab = el.dataset.tab;
      state.error = '';
      render();
    }));
  };

  const renderDashboard = (view, p, f, d) => {
    const recentPayments = Array.isArray(d.recent_payments) ? d.recent_payments : [];
    const upcoming = Array.isArray(d.upcoming_move_outs) ? d.upcoming_move_outs : [];
    const occupancy = Number(p.occupancy_rate || 0);
    const collection = Number(f.collection_rate || 0);
    view.innerHTML = `
      <div class="peacely-ops-grid">
        <div class="peacely-ops-card"><small>Properties</small><strong>${p.properties || 0}</strong></div>
        <div class="peacely-ops-card"><small>Active tenants</small><strong>${p.active_tenants || 0}</strong></div>
        <div class="peacely-ops-card"><small>Occupancy</small><strong>${occupancy}%</strong><div class="peacely-ops-bar"><div style="width:${Math.min(100, Math.max(0, occupancy))}%"></div></div></div>
        <div class="peacely-ops-card"><small>Available beds</small><strong>${p.available_beds || 0}</strong></div>
        <div class="peacely-ops-card"><small>Expected</small><strong>${money(f.expected)}</strong></div>
        <div class="peacely-ops-card"><small>Collected</small><strong>${money(f.collected)}</strong></div>
        <div class="peacely-ops-card"><small>Outstanding</small><strong>${money(f.outstanding)}</strong></div>
        <div class="peacely-ops-card"><small>Overdue</small><strong>${money(f.overdue)}</strong></div>
      </div>
      <div class="peacely-ops-section"><h3>Collection</h3><div class="peacely-ops-card"><strong>${collection}%</strong><div class="peacely-ops-bar"><div style="width:${Math.min(100, Math.max(0, collection))}%"></div></div></div></div>
      <div class="peacely-ops-section"><h3>Recent payments</h3>${recentPayments.length ? recentPayments.map(x => `<div class="peacely-ops-row"><div class="peacely-ops-row-top"><strong>${escapeHtml(x.tenant_name || 'Tenant')}</strong><strong>${money(x.amount)}</strong></div><p>${escapeHtml(x.property_name || '')} · ${date(x.payment_date)}</p></div>`).join('') : '<div class="peacely-ops-muted">No payments yet.</div>'}</div>
      <div class="peacely-ops-section"><h3>Upcoming move-outs</h3>${upcoming.length ? upcoming.map(x => `<div class="peacely-ops-row"><strong>${escapeHtml(x.name)}</strong><p>${escapeHtml(x.property_name || '')} · ${date(x.move_out_date)}</p></div>`).join('') : '<div class="peacely-ops-muted">No upcoming move-outs.</div>'}</div>`;
  };

  const renderAnalytics = (view) => {
    const a = state.analytics || {};
    const monthly = Array.isArray(a.monthly) ? a.monthly : [];
    const properties = Array.isArray(a.properties) ? a.properties : [];
    const methods = Array.isArray(a.payment_methods) ? a.payment_methods : [];
    const trend = Array.isArray(a.occupancy_trend) ? a.occupancy_trend : [];
    const maxRevenue = Math.max(...monthly.map(x => Number(x.expected || 0)), 1);
    view.innerHTML = `
      <div class="peacely-ops-section"><h3>Monthly finance</h3>${monthly.length ? monthly.map(x => `<div class="peacely-ops-row"><div class="peacely-ops-row-top"><strong>${escapeHtml(x.month)}</strong><span>${money(x.collected)} / ${money(x.expected)}</span></div><div class="peacely-ops-bar"><div style="width:${Math.min(100, Math.max(0, Number(x.expected || 0) / maxRevenue * 100))}%"></div></div><p>Outstanding ${money(x.outstanding)}</p></div>`).join('') : '<div class="peacely-ops-muted">No monthly data yet.</div>'}</div>
      <div class="peacely-ops-section"><h3>Property performance</h3>${properties.length ? properties.map(x => `<div class="peacely-ops-row"><div class="peacely-ops-row-top"><strong>${escapeHtml(x.name)}</strong><strong>${Number(x.occupancy_rate || 0)}%</strong></div><p>${x.rooms || 0} rooms · ${x.beds || 0} beds · ${x.active_tenants || 0} active tenants · ${money(x.monthly_revenue)}</p></div>`).join('') : '<div class="peacely-ops-muted">No property analytics yet.</div>'}</div>
      <div class="peacely-ops-section"><h3>Payment methods</h3>${methods.length ? methods.map(x => `<div class="peacely-ops-row"><div class="peacely-ops-row-top"><strong>${escapeHtml(x.method || 'Other')}</strong><span>${x.count || 0} payments</span></div><p>${money(x.amount)}</p></div>`).join('') : '<div class="peacely-ops-muted">No payment method data yet.</div>'}</div>
      <div class="peacely-ops-section"><h3>30-day occupancy trend</h3>${trend.slice(-7).map(x => `<div class="peacely-ops-row"><div class="peacely-ops-row-top"><span>${date(x.date)}</span><strong>${x.total_beds ? Math.round(Number(x.active_tenants || 0) / Number(x.total_beds) * 100) : 0}%</strong></div></div>`).join('')}</div>`;
  };

  const renderTenants = (view) => {
    const active = state.tenants.filter(t => normalize(t.status) === 'active');
    view.innerHTML = `
      <div class="peacely-ops-section"><h3>Active tenants (${active.length})</h3>${active.length ? active.map(t => `<div class="peacely-ops-row"><div class="peacely-ops-row-top"><strong>${escapeHtml(t.name)}</strong><span>${money(t.monthly_rent)}</span></div><p>${escapeHtml(t.property_name || '')} · Room ${escapeHtml(t.room_number || '-')} · Bed ${escapeHtml(t.bed_number || '-')}</p><p>Move-in ${date(t.move_in_date)} · Due day ${escapeHtml(t.due_date)}</p><div class="peacely-ops-actions"><button class="peacely-ops-primary" data-select-tenant="${t.id}">Lifecycle</button><button class="peacely-ops-danger" data-moveout="${t.id}">Move out</button></div></div>`).join('') : '<div class="peacely-ops-muted">No active tenants.</div>'}</div>`;

    view.querySelectorAll('[data-moveout]').forEach((el) => el.addEventListener('click', async () => {
      const tenant = state.tenants.find(t => t.id === Number(el.dataset.moveout));
      if (!tenant) return;
      const selectedDate = window.prompt(`Move-out date for ${tenant.name}`, state.moveOutDate);
      if (!selectedDate) return;
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(selectedDate)) { state.error = 'Use move-out date format YYYY-MM-DD.'; render(); return; }
      if (!window.confirm(`Move ${tenant.name} out on ${selectedDate}? This will release the assigned bed.`)) return;
      await moveOut(tenant, selectedDate);
    }));

    view.querySelectorAll('[data-select-tenant]').forEach((el) => el.addEventListener('click', () => {
      state.selectedTenant = state.tenants.find(t => t.id === Number(el.dataset.selectTenant)) || null;
      renderLifecycleEditor(view);
    }));
  };

  const renderLifecycleEditor = (view) => {
    const t = state.selectedTenant;
    if (!t) return;
    const rooms = state.rooms.filter(r => Number(r.property_id) === Number(t.property_id));
    const beds = state.beds.filter(b => rooms.some(r => r.id === Number(b.room_id)) && !b.is_occupied || Number(b.id) === Number(t.bed_id));
    view.innerHTML = `
      <div class="peacely-ops-section"><h3>${escapeHtml(t.name)} lifecycle</h3>
        <div class="peacely-ops-card">
          <p class="peacely-ops-muted">Reassigning safely releases the previous bed and marks the new bed occupied.</p>
          <label>Property</label><select id="ops-property" class="peacely-ops-field">${state.properties.map(p => `<option value="${p.id}" ${Number(p.id) === Number(t.property_id) ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select>
          <label>Room</label><select id="ops-room" class="peacely-ops-field">${rooms.map(r => `<option value="${r.id}" ${Number(r.id) === Number(t.room_id) ? 'selected' : ''}>Room ${escapeHtml(r.room_number)}</option>`).join('')}</select>
          <label>Bed</label><select id="ops-bed" class="peacely-ops-field"><option value="">No bed</option>${beds.map(b => `<option value="${b.id}" ${Number(b.id) === Number(t.bed_id) ? 'selected' : ''}>Bed ${escapeHtml(b.bed_number)}</option>`).join('')}</select>
          <div class="peacely-ops-actions"><button class="peacely-ops-primary" id="ops-reassign">Save assignment</button><button class="peacely-ops-danger" id="ops-moveout">Move out</button></div>
        </div>
      </div>`;
    document.getElementById('ops-reassign').onclick = async () => {
      try {
        state.error = '';
        await api(`/tenants/${t.id}/reassign`, { method: 'PATCH', body: JSON.stringify({ property_id: Number(document.getElementById('ops-property').value), room_id: Number(document.getElementById('ops-room').value), bed_id: document.getElementById('ops-bed').value ? Number(document.getElementById('ops-bed').value) : null }) });
        await refresh();
        state.selectedTenant = null;
        render();
      } catch (e) { state.error = e.message; render(); }
    };
    document.getElementById('ops-moveout').onclick = async () => {
      const selectedDate = window.prompt(`Move-out date for ${t.name}`, state.moveOutDate);
      if (!selectedDate) return;
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(selectedDate)) { state.error = 'Use move-out date format YYYY-MM-DD.'; render(); return; }
      if (!window.confirm(`Move ${t.name} out on ${selectedDate}? This will release the assigned bed.`)) return;
      await moveOut(t, selectedDate);
    };
  };

  const moveOut = async (tenant, moveOutDate) => {
    try {
      state.error = '';
      await api(`/tenants/${tenant.id}/move-out`, { method: 'PATCH', body: JSON.stringify({ move_out_date: moveOutDate }) });
      await refresh();
      state.selectedTenant = null;
      activeTab = 'tenants';
      render();
    } catch (e) { state.error = e.message; render(); }
  };

  const refresh = async () => {
    state.loading = true;
    const [dashboard, analytics, tenants, properties, rooms, beds] = await Promise.all([
      api('/dashboard'), api('/analytics'), api('/tenants'), api('/properties'), api('/rooms'), api('/beds')
    ]);
    state.dashboard = dashboard;
    state.analytics = analytics;
    state.tenants = Array.isArray(tenants) ? tenants : (tenants.tenants || []);
    state.properties = Array.isArray(properties) ? properties : (properties.properties || []);
    state.rooms = Array.isArray(rooms) ? rooms : (rooms.rooms || []);
    state.beds = Array.isArray(beds) ? beds : (beds.beds || []);
    state.loading = false;
  };

  const open = async () => {
    state.open = true;
    state.error = '';
    render();
    try { await refresh(); render(); } catch (e) { state.error = e.message || 'Unable to load operations data.'; render(); }
  };

  button.addEventListener('click', open);
  document.getElementById('peacely-ops-close').addEventListener('click', () => { state.open = false; render(); });

  const checkAuth = async () => {
    try {
      const data = await api('/auth/me');
      state.authenticated = Boolean(data?.authenticated && data?.owner);
    } catch { state.authenticated = false; }
    render();
  };

  setInterval(checkAuth, 4000);
  checkAuth();
})();
