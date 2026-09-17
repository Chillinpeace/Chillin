(() => {
  'use strict';
  if (window.__peacelyPhase7Booted) return;
  window.__peacelyPhase7Booted = true;

  const API = '/api';
  const esc = (v) => String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
  const date = (v) => v ? new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '-';
  const api = async (path, options = {}) => {
    const r = await fetch(API + path, { credentials:'include', headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || `Request failed (${r.status})`);
    return d;
  };

  const style = `<style id="p7-style">
    #p7-wrap{font-size:12px}.p7-actions{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}.p7-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}.p7-form label{display:flex;flex-direction:column;gap:5px;color:#8e99aa;font-size:10px}.p7-form input,.p7-form select,.p7-form textarea{border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px;background:#0e1723;color:#f8fafc;outline:none}.p7-form textarea{min-height:80px;resize:vertical}.p7-full{grid-column:1/-1}.p7-btn{border:0;border-radius:10px;padding:9px 12px;background:#10b981;color:#04130d;font-weight:800;cursor:pointer}.p7-btn.alt{background:#172131;color:#dce3ec}.p7-btn.danger{background:#7f1d1d;color:#fff}.p7-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:14px}.p7-card{background:#0e1723;border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:14px}.p7-card h3{margin:0 0 6px;color:#8e99aa;font-size:10px}.p7-big{font-size:21px;font-weight:850}.p7-note{padding:11px;border-radius:12px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.15);color:#9de8ca;margin-bottom:12px}.p7-error{padding:12px;border-radius:12px;background:#35151a;color:#fecaca;margin-bottom:12px}.p7-table-wrap{overflow:auto;border:1px solid rgba(255,255,255,.07);border-radius:14px}.p7-table{width:100%;border-collapse:collapse;min-width:850px}.p7-table th,.p7-table td{padding:9px;border-bottom:1px solid rgba(255,255,255,.06);text-align:left;font-size:11px;vertical-align:top}.p7-table th{color:#8e99aa;background:#101a27}.p7-status{display:inline-block;padding:4px 7px;border-radius:999px;background:#172131}.p7-critical{color:#f87171}.p7-open{color:#fbbf24}.p7-done{color:#34d399}.p7-empty{padding:20px;text-align:center;color:#8e99aa}@media(max-width:850px){.p7-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.p7-form{grid-template-columns:1fr}.p7-full{grid-column:auto}}
  </style>`;

  let root, content, properties = [], tenants = [], rooms = [], beds = [], selectedTicket = null;

  function getRoot() {
    root = document.getElementById('peacely-phase4-root');
    return root;
  }

  function addTab() {
    if (!root) return;
    const nav = root.querySelector('.p4-nav');
    if (!nav || nav.querySelector('[data-p7-tab]')) return;
    const b = document.createElement('button');
    b.textContent = 'Operations';
    b.dataset.p7Tab = '1';
    b.className = 'p7-tab';
    b.onclick = render;
    nav.appendChild(b);
  }

  async function loadReferenceData() {
    const results = await Promise.allSettled([
      api('/properties'), api('/tenants'), api('/rooms'), api('/beds')
    ]);
    properties = results[0].status === 'fulfilled' ? (results[0].value?.properties || results[0].value || []) : [];
    tenants = results[1].status === 'fulfilled' ? (results[1].value?.tenants || results[1].value || []) : [];
    rooms = results[2].status === 'fulfilled' ? (results[2].value?.rooms || results[2].value || []) : [];
    beds = results[3].status === 'fulfilled' ? (results[3].value?.beds || results[3].value || []) : [];
  }

  function selectOptions(items, valueKey='id', labelFn=x=>x.name) {
    return `<option value="">Not linked</option>` + items.map(x=>`<option value="${esc(x[valueKey])}">${esc(labelFn(x))}</option>`).join('');
  }

  function propertyOptions() { return selectOptions(properties,'id',x=>x.name || `Property ${x.id}`); }
  function tenantOptions() { return selectOptions(tenants,'id',x=>`${x.name || 'Tenant'}${x.property_name ? ` — ${x.property_name}` : ''}`); }
  function roomOptions() { return selectOptions(rooms,'id',x=>`Room ${x.room_number ?? x.number ?? x.id}`); }
  function bedOptions() { return selectOptions(beds,'id',x=>`Bed ${x.bed_number ?? x.number ?? x.id}`); }

  async function render() {
    if (!getRoot()) return;
    content = root.querySelector('.p4-content');
    if (!content) return;
    if (!document.getElementById('p7-style')) document.head.insertAdjacentHTML('beforeend', style);
    addTab();
    content.innerHTML = '<h1>Property Operations</h1><div class="p7-note">Loading operational data…</div>';
    try {
      const [summary, tickets] = await Promise.all([api('/operations/summary'), api('/maintenance')]);
      await loadReferenceData();
      draw(summary, Array.isArray(tickets) ? tickets : (tickets?.tickets || []));
    } catch (e) {
      content.innerHTML = `<h1>Property Operations</h1><div class="p7-error">${esc(e.message)}</div>`;
    }
  }

  function draw(summary, tickets) {
    const bedsSummary = summary?.beds || {};
    const tenantsSummary = summary?.tenants || {};
    const ticketSummary = summary?.tickets || {};
    content.innerHTML = `<div id="p7-wrap">
      <h1>Property Operations</h1>
      <div class="p7-note">Track maintenance, property issues, vacant beds and operational tasks from one place.</div>
      <div class="p7-grid">
        <div class="p7-card"><h3>Open Tickets</h3><div class="p7-big">${ticketSummary.open ?? 0}</div></div>
        <div class="p7-card"><h3>Critical / Urgent</h3><div class="p7-big">${ticketSummary.critical ?? 0}</div></div>
        <div class="p7-card"><h3>Maintenance Cost</h3><div class="p7-big">${money(ticketSummary.cost)}</div></div>
        <div class="p7-card"><h3>Occupied Beds</h3><div class="p7-big">${bedsSummary.occupied ?? 0}/${bedsSummary.total ?? 0}</div></div>
        <div class="p7-card"><h3>Active Tenants</h3><div class="p7-big">${tenantsSummary.active ?? 0}</div></div>
      </div>
      <div class="p7-actions"><button class="p7-btn" id="p7-new">+ Maintenance Ticket</button><button class="p7-btn alt" id="p7-refresh">Refresh</button></div>
      <div id="p7-form"></div>
      <h3>Maintenance & Operational Tickets</h3>
      <div class="p7-table-wrap"><table class="p7-table"><thead><tr><th>Issue</th><th>Location</th><th>Tenant</th><th>Priority</th><th>Status</th><th>Cost</th><th>Due</th><th>Action</th></tr></thead><tbody>
      ${tickets.map(x=>`<tr><td><strong>${esc(x.title)}</strong><div>${esc(x.description||'')}</div></td><td>${esc(x.property_name||'-')}<br>Room ${esc(x.room_number||'-')} / Bed ${esc(x.bed_number||'-')}</td><td>${esc(x.tenant_name||'-')}</td><td class="${String(x.priority).toLowerCase()==='urgent'?'p7-critical':''}">${esc(x.priority||'-')}</td><td><span class="p7-status">${esc(x.status||'-')}</span></td><td>${money(x.actual_cost)}</td><td>${date(x.due_date)}</td><td>${String(x.status).toLowerCase() === 'resolved' || String(x.status).toLowerCase() === 'closed' ? '<span class="p7-done">Done</span>' : `<button class="p7-btn alt" data-edit="${x.id}">Update</button>`}</td></tr>`).join('') || '<tr><td colspan="8"><div class="p7-empty">No maintenance tickets yet.</div></td></tr>'}
      </tbody></table></div>
      <h3 style="margin-top:18px">Bed Availability</h3>
      <div class="p7-table-wrap"><table class="p7-table"><thead><tr><th>Bed</th><th>Room</th><th>Property</th><th>Status</th><th>Tenant</th></tr></thead><tbody>${beds.map(b=>{
        const occupied = b.is_occupied === true || String(b.is_occupied).toLowerCase() === 'true';
        const room = rooms.find(r=>Number(r.id)===Number(b.room_id));
        const propertyId = b.property_id || room?.property_id;
        const property = properties.find(p=>Number(p.id)===Number(propertyId));
        const tenant = tenants.find(t=>Number(t.bed_id)===Number(b.id) && String(t.status||'').toLowerCase()==='active');
        return `<tr><td>Bed ${esc(b.bed_number ?? b.number ?? b.id)}</td><td>${esc(room?.room_number ?? room?.number ?? b.room_id ?? '-')}</td><td>${esc(property?.name || b.property_name || '-')}</td><td class="${occupied?'p7-open':'p7-done'}">${occupied?'Occupied':'VACANT'}</td><td>${esc(tenant?.name || '-')}</td></tr>`;
      }).join('') || '<tr><td colspan="5"><div class="p7-empty">No beds found.</div></td></tr>'}</tbody></table></div>
    </div>`;

    document.getElementById('p7-refresh').onclick = render;
    document.getElementById('p7-new').onclick = () => showForm();
    root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => showForm(tickets.find(x=>Number(x.id)===Number(b.dataset.edit))));
  }

  function showForm(ticket = null) {
    selectedTicket = ticket;
    const f = document.getElementById('p7-form');
    if (!f) return;
    f.innerHTML = `<div class="p7-card"><h3>${ticket ? 'Update Maintenance Ticket' : 'New Maintenance Ticket'}</h3><div class="p7-form">
      <label>Issue Title<input id="p7-title" value="${esc(ticket?.title||'')}" placeholder="e.g. Bathroom tap leaking"></label>
      <label>Property<select id="p7-property">${propertyOptions()}</select></label>
      <label>Room<select id="p7-room">${roomOptions()}</select></label>
      <label>Bed<select id="p7-bed">${bedOptions()}</select></label>
      <label>Tenant<select id="p7-tenant">${tenantOptions()}</select></label>
      <label>Category<select id="p7-category"><option>General</option><option>Maintenance</option><option>Repair</option><option>Electrical</option><option>Plumbing</option><option>Cleaning</option><option>Appliance</option></select></label>
      <label>Priority<select id="p7-priority"><option>Low</option><option>Medium</option><option>High</option><option>Urgent</option></select></label>
      <label>Status<select id="p7-status"><option>Open</option><option>In Progress</option><option>Resolved</option><option>Closed</option></select></label>
      <label>Due Date<input id="p7-due" type="date" value="${esc(ticket?.due_date ? String(ticket.due_date).slice(0,10) : '')}"></label>
      <label>Estimated Cost<input id="p7-est" type="number" min="0" step="0.01" value="${Number(ticket?.estimated_cost||0)}"></label>
      <label>Actual Cost<input id="p7-actual" type="number" min="0" step="0.01" value="${Number(ticket?.actual_cost||0)}"></label>
      <label class="p7-full">Description<textarea id="p7-desc" placeholder="Describe the issue and required work">${esc(ticket?.description||'')}</textarea></label>
    </div><div class="p7-actions"><button class="p7-btn" id="p7-save">${ticket?'Save Changes':'Create Ticket'}</button>${ticket?`<button class="p7-btn danger" id="p7-delete">Delete</button>`:''}<button class="p7-btn alt" id="p7-cancel">Cancel</button></div></div>`;
    const set = (id,val) => { const el=document.getElementById(id); if(el && val != null && val !== '') el.value=String(val); };
    set('p7-property',ticket?.property_id); set('p7-room',ticket?.room_id); set('p7-bed',ticket?.bed_id); set('p7-tenant',ticket?.tenant_id); set('p7-category',ticket?.category); set('p7-priority',ticket?.priority); set('p7-status',ticket?.status);
    document.getElementById('p7-save').onclick = saveTicket;
    document.getElementById('p7-cancel').onclick = render;
    if (ticket) document.getElementById('p7-delete').onclick = async()=>{if(!confirm('Delete this maintenance ticket?'))return;await api(`/maintenance/${ticket.id}`,{method:'DELETE'});render();};
  }

  async function saveTicket() {
    const body = {
      title:document.getElementById('p7-title').value.trim(),
      property_id:Number(document.getElementById('p7-property').value)||null,
      room_id:Number(document.getElementById('p7-room').value)||null,
      bed_id:Number(document.getElementById('p7-bed').value)||null,
      tenant_id:Number(document.getElementById('p7-tenant').value)||null,
      category:document.getElementById('p7-category').value,
      priority:document.getElementById('p7-priority').value,
      status:document.getElementById('p7-status').value,
      due_date:document.getElementById('p7-due').value || null,
      estimated_cost:Number(document.getElementById('p7-est').value)||0,
      actual_cost:Number(document.getElementById('p7-actual').value)||0,
      description:document.getElementById('p7-desc').value.trim()
    };
    if (!body.title) return alert('Please enter an issue title.');
    if (selectedTicket) await api(`/maintenance/${selectedTicket.id}`,{method:'PUT',body:JSON.stringify(body)});
    else await api('/maintenance',{method:'POST',body:JSON.stringify(body)});
    render();
  }

  const observer = new MutationObserver(() => { if (!getRoot()) return; addTab(); });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  const timer = setInterval(() => { if (getRoot()) addTab(); },1000);
  window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
  setTimeout(render,900);
})();
