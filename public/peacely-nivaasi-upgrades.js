(() => {
  'use strict';

  // This feature owns a separate sibling root. It never edits #root or React-owned DOM.
  const API = '/api';
  const root = document.createElement('div');
  root.id = 'peacely-nivaasi-upgrades-root';
  document.body.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
    #peacely-nivaasi-upgrades-root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .pn-trigger{position:fixed;right:14px;bottom:78px;z-index:9998;border:0;border-radius:999px;padding:12px 15px;background:#0f172a;color:#fff;font-weight:800;box-shadow:0 10px 28px rgba(15,23,42,.28);cursor:pointer}
    .pn-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.48);display:none;padding:12px;box-sizing:border-box}
    .pn-backdrop.open{display:flex;align-items:flex-end;justify-content:center}
    .pn-panel{width:min(760px,100%);max-height:92vh;overflow:auto;background:#f8fafc;border-radius:22px 22px 14px 14px;box-shadow:0 24px 70px rgba(15,23,42,.3)}
    .pn-head{position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid #e2e8f0;padding:16px 18px;display:flex;align-items:center;justify-content:space-between}
    .pn-head h2{margin:0;font-size:18px;color:#0f172a}.pn-head p{margin:4px 0 0;color:#64748b;font-size:12px}
    .pn-close{border:0;background:#e2e8f0;border-radius:50%;width:34px;height:34px;font-size:20px;cursor:pointer}
    .pn-tabs{display:flex;gap:8px;overflow:auto;padding:12px 14px;background:#fff;border-bottom:1px solid #e2e8f0}.pn-tab{white-space:nowrap;border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:8px 12px;font-weight:700;color:#475569;cursor:pointer}.pn-tab.active{background:#0f172a;color:#fff;border-color:#0f172a}
    .pn-body{padding:14px}.pn-card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:14px;margin-bottom:12px}.pn-card h3{margin:0 0 5px;color:#0f172a;font-size:16px}.pn-card p{color:#64748b;font-size:12px;margin:0 0 12px;line-height:1.45}
    .pn-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.pn-field{display:flex;flex-direction:column;gap:5px}.pn-field.full{grid-column:1/-1}.pn-field label{font-size:11px;font-weight:800;color:#475569}.pn-input,.pn-select,.pn-textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:10px 11px;font-size:14px;color:#0f172a}.pn-textarea{min-height:78px;resize:vertical}
    .pn-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:11px}.pn-btn{border:0;border-radius:10px;padding:10px 13px;font-weight:800;cursor:pointer}.pn-primary{background:#0f172a;color:#fff}.pn-secondary{background:#e2e8f0;color:#0f172a}.pn-success{background:#166534;color:#fff}.pn-danger{background:#991b1b;color:#fff}
    .pn-list{display:grid;gap:8px}.pn-row{border:1px solid #e2e8f0;border-radius:12px;padding:11px;background:#f8fafc}.pn-row strong{color:#0f172a}.pn-row small{display:block;color:#64748b;margin-top:3px}.pn-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:9px}.pn-kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px}.pn-kpi span{display:block;color:#64748b;font-size:11px}.pn-kpi strong{display:block;color:#0f172a;font-size:17px;margin-top:4px}.pn-check{display:flex;align-items:center;gap:8px;font-size:13px;color:#334155;margin:8px 0}.pn-muted{color:#64748b;font-size:12px}.pn-toast{position:fixed;right:14px;bottom:128px;z-index:10001;background:#0f172a;color:#fff;border-radius:10px;padding:10px 13px;font-size:12px;box-shadow:0 10px 25px rgba(0,0,0,.2)}
    @media(max-width:560px){.pn-grid{grid-template-columns:1fr}.pn-kpis{grid-template-columns:1fr 1fr}.pn-trigger{right:10px}.pn-panel{max-height:94vh}}
  `;
  document.head.appendChild(style);

  const state = { tab: 'setup', properties: [], rooms: [], beds: [], tenants: [], payments: [], levels: [], documents: [], selectedProperty: '', selectedTenant: '', selectedRoom: '', settings: null, finance: null };

  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
  const today = () => new Date().toISOString().slice(0,10);
  const month = () => new Date().toISOString().slice(0,7);

  async function api(path, options) {
    const response = await fetch(`${API}${path}`, { credentials:'include', ...options, headers:{'Content-Type':'application/json', ...(options?.headers || {})} });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
    return data;
  }

  function toast(message) {
    const node = document.createElement('div'); node.className='pn-toast'; node.textContent=message; root.appendChild(node); setTimeout(()=>node.remove(),2600);
  }

  async function loadBase() {
    const results = await Promise.all([
      api('/properties'), api('/rooms'), api('/beds'), api('/tenants'), api('/payments'), api('/nivaasi-upgrades/structure')
    ]);
    [state.properties,state.rooms,state.beds,state.tenants,state.payments,state.levels] = results;
    if (!state.selectedProperty && state.properties[0]) state.selectedProperty=String(state.properties[0].id);
    if (!state.selectedTenant && state.tenants[0]) state.selectedTenant=String(state.tenants[0].id);
    await loadSettings();
    await loadDocuments();
  }

  async function loadSettings() { try { state.settings = await api('/nivaasi-upgrades/rent-settings'); } catch { state.settings=null; } }
  async function loadDocuments() { if (!state.selectedTenant) { state.documents=[]; return; } try { state.documents=await api(`/nivaasi-upgrades/documents?tenant_id=${encodeURIComponent(state.selectedTenant)}`); } catch { state.documents=[]; } }
  async function loadFinance() { state.finance=await api(`/nivaasi-upgrades/finance?month=${month()}`); }

  function selectOptions(items, value, label) { return items.map(item=>`<option value="${item.id}" ${String(item.id)===String(value)?'selected':''}>${esc(label(item))}</option>`).join(''); }

  function render() {
    const tabNames = [['setup','Property Setup'],['tenants','Documents'],['rent','Rent Automation'],['finance','Finance'],['receipts','Receipts']];
    root.innerHTML = `
      <button class="pn-trigger" id="pn-open">⚙ More</button>
      <div class="pn-backdrop" id="pn-backdrop">
        <section class="pn-panel">
          <header class="pn-head"><div><h2>Peacely Owner Tools</h2><p>Nivaasi-inspired owner workflows, excluding tenant app, food, staff and compliance.</p></div><button class="pn-close" id="pn-close">×</button></header>
          <nav class="pn-tabs">${tabNames.map(([id,label])=>`<button class="pn-tab ${state.tab===id?'active':''}" data-tab="${id}">${label}</button>`).join('')}</nav>
          <div class="pn-body">${state.tab==='setup'?setupView():state.tab==='tenants'?documentsView():state.tab==='rent'?rentView():state.tab==='finance'?financeView():receiptsView()}</div>
        </section>
      </div>`;
    root.querySelector('#pn-open').onclick=()=>{root.querySelector('#pn-backdrop').classList.add('open');};
    root.querySelector('#pn-close').onclick=()=>root.querySelector('#pn-backdrop').classList.remove('open');
    root.querySelector('#pn-backdrop').onclick=(e)=>{if(e.target.id==='pn-backdrop') e.currentTarget.classList.remove('open');};
    root.querySelectorAll('[data-tab]').forEach(btn=>btn.onclick=async()=>{state.tab=btn.dataset.tab;if(state.tab==='finance') await loadFinance();render();root.querySelector('#pn-backdrop').classList.add('open');});
    bind();
  }

  function setupView() {
    const property = state.properties.find(p=>String(p.id)===String(state.selectedProperty));
    const rooms = state.rooms.filter(r=>String(r.property_id)===String(state.selectedProperty));
    const beds = state.beds.filter(b=>rooms.some(r=>r.id===b.room_id));
    return `<div class="pn-card"><h3>1. Property → Building → Floor → Room → Bed</h3><p>Keep the whole property setup in one continuous owner flow. Existing Peacely rooms and beds remain the source of truth.</p>
      <div class="pn-grid"><div class="pn-field full"><label>Property</label><select class="pn-select" id="pn-property"><option value="">Select property</option>${selectOptions(state.properties,state.selectedProperty,p=>p.name)}</select></div></div>
      <div class="pn-grid" style="margin-top:9px"><div class="pn-field"><label>Building</label><input class="pn-input" id="pn-building" placeholder="Main Building"></div><div class="pn-field"><label>Floor</label><input class="pn-input" id="pn-floor" placeholder="Ground Floor"></div></div>
      <div class="pn-actions"><button class="pn-btn pn-secondary" id="pn-save-level">Save Building/Floor</button></div>
      <div class="pn-list" style="margin-top:10px">${state.levels.filter(x=>String(x.property_id)===String(state.selectedProperty)).map(x=>`<div class="pn-row"><strong>${esc(x.building_name)}</strong><small>${esc(x.floor_name)}</small></div>`).join('') || '<div class="pn-muted">No building/floor labels saved yet.</div>'}</div></div>
      <div class="pn-card"><h3>Add Room</h3><p>After selecting the property, add rooms without leaving this flow.</p><div class="pn-grid"><div class="pn-field"><label>Room number</label><input class="pn-input" id="pn-room" placeholder="101"></div><div class="pn-field"><label>Sharing</label><select class="pn-select" id="pn-sharing"><option>Single</option><option>Double</option><option>Triple</option><option>Four Sharing</option><option>Other</option></select></div><div class="pn-field"><label>Monthly rent</label><input class="pn-input" id="pn-room-rent" type="number" min="0" placeholder="12000"></div></div><div class="pn-actions"><button class="pn-btn pn-primary" id="pn-add-room">Add Room</button></div></div>
      <div class="pn-card"><h3>Add Bed</h3><p>Add beds immediately after the room is created.</p><div class="pn-grid"><div class="pn-field full"><label>Room</label><select class="pn-select" id="pn-bed-room"><option value="">Select room</option>${selectOptions(rooms,state.selectedRoom,r=>`Room ${r.room_number}`)}</select></div><div class="pn-field"><label>Bed number</label><input class="pn-input" id="pn-bed" placeholder="A"></div></div><div class="pn-actions"><button class="pn-btn pn-primary" id="pn-add-bed">Add Bed</button></div></div>
      <div class="pn-card"><h3>${esc(property?.name || 'Property')}</h3><div class="pn-kpis"><div class="pn-kpi"><span>Rooms</span><strong>${rooms.length}</strong></div><div class="pn-kpi"><span>Beds</span><strong>${beds.length}</strong></div><div class="pn-kpi"><span>Occupied</span><strong>${beds.filter(b=>b.is_occupied).length}</strong></div><div class="pn-kpi"><span>Available</span><strong>${beds.filter(b=>!b.is_occupied).length}</strong></div></div></div>`;
  }

  function documentsView() {
    const tenant = state.tenants.find(t=>String(t.id)===String(state.selectedTenant));
    return `<div class="pn-card"><h3>Tenant Documents</h3><p>Store rental agreements, photos and ordinary property documents against a tenant. KYC/compliance workflows are intentionally not included.</p><div class="pn-grid"><div class="pn-field full"><label>Tenant</label><select class="pn-select" id="pn-tenant">${selectOptions(state.tenants,state.selectedTenant,t=>t.name)}</select></div><div class="pn-field"><label>Document type</label><select class="pn-select" id="pn-doc-type"><option>Rental Agreement</option><option>Photo</option><option>Other</option></select></div><div class="pn-field"><label>Title</label><input class="pn-input" id="pn-doc-title" placeholder="Agreement - September 2026"></div><div class="pn-field full"><label>Upload file (optional, max 700 KB)</label><input class="pn-input" id="pn-doc-file" type="file" accept="image/*,.pdf,.doc,.docx"></div><div class="pn-field full"><label>Or document URL</label><input class="pn-input" id="pn-doc-url" placeholder="https://..."></div><div class="pn-field full"><label>Notes</label><textarea class="pn-textarea" id="pn-doc-notes" placeholder="Optional note"></textarea></div></div><div class="pn-actions"><button class="pn-btn pn-primary" id="pn-save-doc">Save Document</button></div></div>
      <div class="pn-card"><h3>${esc(tenant?.name || 'Tenant')} — saved documents</h3><div class="pn-list">${state.documents.map(d=>`<div class="pn-row"><strong>${esc(d.title)}</strong><small>${esc(d.document_type)} · ${new Date(d.created_at).toLocaleDateString('en-IN')}</small>${d.document_url?`<div class="pn-actions"><a class="pn-btn pn-secondary" href="${esc(d.document_url)}" target="_blank" rel="noopener">Open</a></div>`:''}</div>`).join('') || '<div class="pn-muted">No documents saved.</div>'}</div></div>`;
  }

  function rentView() {
    const s=state.settings||{};
    return `<div class="pn-card"><h3>Automated Rent & Invoicing</h3><p>Configure recurring invoices, grace periods, late fees and reminder channels. Existing Peacely automation remains in place.</p>
      <label class="pn-check"><input id="pn-recurring" type="checkbox" ${s.recurring_invoices_enabled!==false?'checked':''}> Recurring invoice generation</label>
      <label class="pn-check"><input id="pn-late-enabled" type="checkbox" ${s.late_fee_enabled!==false?'checked':''}> Late fee calculation</label>
      <div class="pn-grid"><div class="pn-field"><label>Late fee type</label><select class="pn-select" id="pn-late-type"><option value="flat" ${s.late_fee_type==='flat'?'selected':''}>Flat ₹</option><option value="percentage" ${s.late_fee_type==='percentage'?'selected':''}>Percentage %</option></select></div><div class="pn-field"><label>Late fee amount</label><input class="pn-input" id="pn-late-amount" type="number" min="0" step="0.01" value="${esc(s.late_fee_amount||0)}"></div><div class="pn-field"><label>Grace days</label><input class="pn-input" id="pn-grace" type="number" min="0" value="${esc(s.grace_days||0)}"></div><div class="pn-field"><label>Reminder days before due</label><input class="pn-input" id="pn-before" type="number" min="0" value="${esc(s.reminder_days_before??3)}"></div></div>
      <label class="pn-check"><input id="pn-wa" type="checkbox" ${s.whatsapp_enabled!==false?'checked':''}> WhatsApp reminders</label><label class="pn-check"><input id="pn-sms" type="checkbox" ${s.sms_enabled?'checked':''}> SMS reminder option</label><label class="pn-check"><input id="pn-email" type="checkbox" ${s.email_enabled?'checked':''}> Email reminder option</label><label class="pn-check"><input id="pn-overdue" type="checkbox" ${s.overdue_reminders_enabled!==false?'checked':''}> Overdue reminders</label>
      <div class="pn-actions"><button class="pn-btn pn-primary" id="pn-save-settings">Save Automation Settings</button><button class="pn-btn pn-danger" id="pn-apply-fees">Apply Late Fees Now</button></div><div class="pn-muted" style="margin-top:9px">WhatsApp opens the tenant conversation. SMS/email options are saved as channels; a provider integration is not connected.</div></div>`;
  }

  function financeView() {
    const f=state.finance||{};
    return `<div class="pn-card"><h3>Monitor & Grow</h3><p>Monthly collection, outstanding dues, expenses and net cash view, matching the owner-side financial workflow.</p><div class="pn-kpis"><div class="pn-kpi"><span>Expected</span><strong>${money(f.expected)}</strong></div><div class="pn-kpi"><span>Collected</span><strong>${money(f.collected)}</strong></div><div class="pn-kpi"><span>Pending</span><strong>${money(f.pending)}</strong></div><div class="pn-kpi"><span>Expenses</span><strong>${money(f.expenses)}</strong></div><div class="pn-kpi"><span>Net</span><strong>${money(f.net)}</strong></div><div class="pn-kpi"><span>Invoices</span><strong>${f.invoice_count||0}</strong></div></div></div>`;
  }

  function receiptsView() {
    const payments=state.payments.slice().sort((a,b)=>new Date(b.payment_date)-new Date(a.payment_date));
    return `<div class="pn-card"><h3>Digital Receipts</h3><p>Every recorded payment can now be printed/saved as a receipt from the owner tools.</p><div class="pn-list">${payments.slice(0,30).map(p=>`<div class="pn-row"><strong>${esc(p.tenant_name||'Tenant')} — ${money(p.amount)}</strong><small>${esc(p.invoice_number||'General Payment')} · ${esc(p.payment_method)} · ${esc(p.payment_date)}</small><div class="pn-actions"><button class="pn-btn pn-secondary" data-receipt="${p.id}">Print Receipt</button>${p.tenant_id?`<button class="pn-btn pn-primary" data-receipt-wa="${p.id}">WhatsApp Receipt</button>`:''}</div></div>`).join('') || '<div class="pn-muted">No payments recorded yet.</div>'}</div></div>`;
  }

  function printReceipt(payment) {
    const win=window.open('','_blank','width=520,height=720');
    if(!win) return toast('Allow pop-ups to print the receipt.');
    win.document.write(`<!doctype html><html><head><title>Peacely Receipt</title><style>body{font-family:Arial,sans-serif;padding:28px;color:#111827}h1{margin:0 0 6px}p{color:#64748b}.box{border:1px solid #e5e7eb;border-radius:12px;padding:18px;margin-top:18px}.row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f1f5f9}.row:last-child{border:0;font-size:18px;font-weight:800}</style></head><body><h1>Peacely</h1><p>Payment Receipt</p><div class="box"><div class="row"><span>Tenant</span><strong>${esc(payment.tenant_name||'Tenant')}</strong></div><div class="row"><span>Invoice</span><strong>${esc(payment.invoice_number||'General Payment')}</strong></div><div class="row"><span>Month</span><strong>${esc(payment.payment_month||'-')}</strong></div><div class="row"><span>Date</span><strong>${esc(payment.payment_date)}</strong></div><div class="row"><span>Method</span><strong>${esc(payment.payment_method)}</strong></div><div class="row"><span>Amount Paid</span><strong>${money(payment.amount)}</strong></div></div><p>Generated by Peacely.</p><script>window.onload=()=>window.print()<\/script></body></html>`); win.document.close();
  }

  function bind() {
    const q=(id)=>root.querySelector(`#${id}`);
    if(q('pn-property')) q('pn-property').onchange=async e=>{state.selectedProperty=e.target.value;state.selectedRoom='';render();root.querySelector('#pn-backdrop').classList.add('open');};
    if(q('pn-tenant')) q('pn-tenant').onchange=async e=>{state.selectedTenant=e.target.value;await loadDocuments();render();root.querySelector('#pn-backdrop').classList.add('open');};
    if(q('pn-bed-room')) q('pn-bed-room').onchange=e=>state.selectedRoom=e.target.value;
    if(q('pn-save-level')) q('pn-save-level').onclick=async()=>{try{await api('/nivaasi-upgrades/structure',{method:'POST',body:JSON.stringify({property_id:Number(state.selectedProperty),building_name:q('pn-building').value,floor_name:q('pn-floor').value})});await loadBase();toast('Building and floor saved.');render();root.querySelector('#pn-backdrop').classList.add('open');}catch(e){toast(e.message)}};
    if(q('pn-add-room')) q('pn-add-room').onclick=async()=>{try{if(!state.selectedProperty||!q('pn-room').value.trim())throw new Error('Select a property and enter a room number.');await api('/rooms',{method:'POST',body:JSON.stringify({property_id:Number(state.selectedProperty),room_number:q('pn-room').value.trim(),sharing_type:q('pn-sharing').value,rent_amount:Number(q('pn-room-rent').value)||0})});await loadBase();toast('Room added. Now add its bed.');render();root.querySelector('#pn-backdrop').classList.add('open');}catch(e){toast(e.message)}};
    if(q('pn-add-bed')) q('pn-add-bed').onclick=async()=>{try{if(!q('pn-bed-room').value||!q('pn-bed').value.trim())throw new Error('Select a room and enter a bed number.');await api('/beds',{method:'POST',body:JSON.stringify({room_id:Number(q('pn-bed-room').value),bed_number:q('pn-bed').value.trim()})});await loadBase();toast('Bed added.');render();root.querySelector('#pn-backdrop').classList.add('open');}catch(e){toast(e.message)}};
    if(q('pn-save-doc')) q('pn-save-doc').onclick=async()=>{try{let url=q('pn-doc-url').value.trim();const file=q('pn-doc-file').files[0];if(file){if(file.size>700*1024)throw new Error('File is larger than 700 KB.');url=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}if(!q('pn-doc-title').value.trim())throw new Error('Document title is required.');await api('/nivaasi-upgrades/documents',{method:'POST',body:JSON.stringify({tenant_id:Number(state.selectedTenant),document_type:q('pn-doc-type').value,title:q('pn-doc-title').value.trim(),document_url:url,notes:q('pn-doc-notes').value.trim()})});await loadDocuments();toast('Document saved.');render();root.querySelector('#pn-backdrop').classList.add('open');}catch(e){toast(e.message)}};
    if(q('pn-save-settings')) q('pn-save-settings').onclick=async()=>{try{state.settings=await api('/nivaasi-upgrades/rent-settings',{method:'PUT',body:JSON.stringify({recurring_invoices_enabled:q('pn-recurring').checked,late_fee_enabled:q('pn-late-enabled').checked,late_fee_type:q('pn-late-type').value,late_fee_amount:Number(q('pn-late-amount').value)||0,grace_days:Number(q('pn-grace').value)||0,reminder_days_before:Number(q('pn-before').value)||0,whatsapp_enabled:q('pn-wa').checked,sms_enabled:q('pn-sms').checked,email_enabled:q('pn-email').checked,overdue_reminders_enabled:q('pn-overdue').checked})});toast('Automation settings saved.');render();root.querySelector('#pn-backdrop').classList.add('open');}catch(e){toast(e.message)}};
    if(q('pn-apply-fees')) q('pn-apply-fees').onclick=async()=>{try{const r=await api('/nivaasi-upgrades/apply-late-fees',{method:'POST',body:'{}'});toast(`${r.applied||0} late fee(s) applied.`);await loadBase();render();root.querySelector('#pn-backdrop').classList.add('open');}catch(e){toast(e.message)}};
    root.querySelectorAll('[data-receipt]').forEach(b=>b.onclick=()=>{const p=state.payments.find(x=>String(x.id)===String(b.dataset.receipt));if(p)printReceipt(p);});
    root.querySelectorAll('[data-receipt-wa]').forEach(b=>b.onclick=()=>{const p=state.payments.find(x=>String(x.id)===String(b.dataset.receiptWa));const t=state.tenants.find(x=>x.id===p?.tenant_id);if(!p||!t)return;let phone=String(t.phone||'').replace(/[^0-9]/g,'');if(phone.length===10)phone='91'+phone;const text=encodeURIComponent(`Hello ${t.name},\n\nPayment received.\nAmount: ${money(p.amount)}\nInvoice: ${p.invoice_number||'General Payment'}\nDate: ${p.payment_date}\nMethod: ${p.payment_method}\n\nThank you.`);window.open(`https://wa.me/${phone}?text=${text}`,'_blank');});
  }

  const boot = async () => { try { await loadBase(); render(); } catch (error) { console.error('Peacely owner tools boot failed:', error); } };
  boot();
})();
