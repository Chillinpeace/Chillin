(() => {
  if (window.__peacelyOwnerFlowBooted) return;
  window.__peacelyOwnerFlowBooted = true;
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = v => `₹${Number(v || 0).toLocaleString('en-IN')}`;
  const today = () => new Date().toISOString().slice(0,10);
  async function api(path, options={}) {
    const r = await fetch(`/api${path}`, {credentials:'include', headers:{'Content-Type':'application/json'}, ...options});
    const d = await r.json().catch(()=>null);
    if(!r.ok) throw new Error(d?.error || `Request failed: ${r.status}`);
    return d;
  }
  const arr = d => Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []);

  function findNav(label) {
    return [...document.querySelectorAll('button,a,[role="tab"]')].find(x => (x.textContent||'').trim().toLowerCase() === label.toLowerCase());
  }
  function currentTabText() { return (document.body.innerText||'').slice(0,8000).toLowerCase(); }

  // 1. Keep Rooms as a sub-flow of Properties. The standalone Rooms tab is hidden.
  function hideRoomsTab() {
    const el = findNav('Rooms');
    if (el) el.style.display = 'none';
  }
  let propertyFlow;
  async function ensurePropertyFlow() {
    hideRoomsTab();
    const properties = arr(await api('/properties'));
    const rooms = arr(await api('/rooms'));
    const beds = arr(await api('/beds'));
    if (!propertyFlow) {
      propertyFlow = document.createElement('section');
      propertyFlow.id='owner-property-flow';
      propertyFlow.style.cssText='margin:16px 0;padding:18px;border:1px solid rgba(148,163,184,.2);border-radius:18px;background:rgba(15,23,42,.04);';
      propertyFlow.innerHTML=`
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
          <div><h2 style="margin:0">Rooms & Beds</h2><div style="font-size:13px;opacity:.7">Select a property, then add its rooms and beds continuously.</div></div>
          <button id="opf-refresh" type="button">Refresh</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:14px">
          <select id="opf-property" style="padding:11px;border-radius:10px"><option value="">Select property</option></select>
          <input id="opf-room" placeholder="Room number" style="padding:11px;border-radius:10px">
          <input id="opf-rent" type="number" min="0" placeholder="Room rent" style="padding:11px;border-radius:10px">
          <select id="opf-sharing" style="padding:11px;border-radius:10px"><option>Single</option><option>Double</option><option>Triple</option><option>Shared</option></select>
          <button id="opf-add-room" type="button">Add Room</button>
        </div>
        <div id="opf-rooms" style="margin-top:16px"></div>`;
      const host = document.querySelector('main') || document.querySelector('#root') || document.body;
      host.prepend(propertyFlow);
      propertyFlow.querySelector('#opf-refresh').onclick=()=>ensurePropertyFlow();
      propertyFlow.querySelector('#opf-add-room').onclick=async()=>{
        const property_id=Number(propertyFlow.querySelector('#opf-property').value), room_number=propertyFlow.querySelector('#opf-room').value.trim(), rent_amount=Number(propertyFlow.querySelector('#opf-rent').value||0), sharing_type=propertyFlow.querySelector('#opf-sharing').value;
        if(!property_id||!room_number) return alert('Select a property and enter a room number.');
        try { await api('/rooms',{method:'POST',body:JSON.stringify({property_id,room_number,sharing_type,rent_amount})}); await ensurePropertyFlow(); }
        catch(e){alert(e.message);}
      };
    }
    const ps=propertyFlow.querySelector('#opf-property');
    const old=ps.value;
    ps.innerHTML='<option value="">Select property</option>'+properties.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    if(old) ps.value=old;
    const selected=Number(ps.value);
    if(!selected && properties.length===1){ps.value=String(properties[0].id);}
    const pid=Number(ps.value);
    const list=propertyFlow.querySelector('#opf-rooms');
    const propRooms=rooms.filter(r=>Number(r.property_id)===pid);
    list.innerHTML=pid ? (propRooms.length ? propRooms.map(r=>{
      const rb=beds.filter(b=>Number(b.room_id)===Number(r.id));
      return `<div style="padding:13px 0;border-bottom:1px solid rgba(148,163,184,.18)"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><strong>Room ${esc(r.room_number)}</strong><span>${esc(r.sharing_type||'')} · ${money(r.rent_amount)}</span></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:9px"><input data-bed-room="${r.id}" placeholder="Bed number" style="padding:9px;border-radius:9px"><button data-add-bed="${r.id}" type="button">Add Bed</button></div><div style="font-size:13px;opacity:.75;margin-top:7px">Beds: ${rb.length ? rb.map(b=>esc(b.bed_number)+(b.is_occupied?' (Occupied)':'')).join(' · ') : 'None yet'}</div></div>`;
    }).join('') : '<div style="opacity:.65">No rooms yet. Add the first room above.</div>') : '<div style="opacity:.65">Select a property to manage its rooms and beds.</div>';
    list.querySelectorAll('[data-add-bed]').forEach(btn=>btn.onclick=async()=>{
      const roomId=Number(btn.dataset.addBed), input=list.querySelector(`[data-bed-room="${roomId}"]`), bed_number=input.value.trim();
      if(!bed_number) return alert('Enter a bed number.');
      try { await api('/beds',{method:'POST',body:JSON.stringify({room_id:roomId,bed_number})}); await ensurePropertyFlow(); }
      catch(e){alert(e.message);}
    });
    ps.onchange=()=>ensurePropertyFlow();
  }

  // 2. Payments: one simple Paid action per unpaid tenant/invoice, then open WhatsApp with invoice/payment confirmation.
  let paymentPanel;
  async function ensurePaymentFlow() {
    const nav=findNav('Payments'); if(!nav) return;
    const tenants=arr(await api('/tenants')), invoices=arr(await api('/invoices'));
    if(!paymentPanel){
      paymentPanel=document.createElement('section'); paymentPanel.id='owner-payment-flow';
      paymentPanel.style.cssText='margin:16px 0;padding:18px;border:1px solid rgba(148,163,184,.2);border-radius:18px;background:rgba(15,23,42,.04);';
      const host=document.querySelector('main')||document.querySelector('#root')||document.body; host.prepend(paymentPanel);
    }
    paymentPanel.innerHTML=`<div><h2 style="margin:0">Payments</h2><div style="font-size:13px;opacity:.7">When a tenant pays, tap Paid. The payment is recorded and WhatsApp opens with the invoice confirmation.</div></div><div id="opf-pay-list" style="margin-top:14px"></div>`;
    const list=paymentPanel.querySelector('#opf-pay-list');
    const active=tenants.filter(t=>String(t.status||'').toLowerCase()==='active');
    const rows=[];
    for(const t of active){
      const ti=invoices.filter(i=>Number(i.tenant_id)===Number(t.id)).sort((a,b)=>new Date(b.due_date||0)-new Date(a.due_date||0));
      const inv=ti.find(i=>Number(i.balance_amount ?? (Number(i.amount||0)-Number(i.paid_amount||0)))>0) || ti[0];
      if(!inv) continue;
      const balance=Math.max(0,Number(inv.balance_amount ?? (Number(inv.amount||0)-Number(inv.paid_amount||0))));
      if(balance<=0) continue;
      rows.push(`<div style="padding:14px 0;border-bottom:1px solid rgba(148,163,184,.18);display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><div><strong>${esc(t.name)}</strong><div style="font-size:12px;opacity:.7">${esc(inv.invoice_number||'Invoice')} · Due ${esc(inv.due_date||'-')} · ${money(balance)}</div></div><button data-paid="${t.id}" data-invoice="${inv.id}" data-amount="${balance}" data-phone="${esc(t.phone||'')}">Paid</button></div>`);
    }
    list.innerHTML=rows.length?rows.join(''):'<div style="opacity:.65">No unpaid tenant invoices.</div>';
    list.querySelectorAll('[data-paid]').forEach(btn=>btn.onclick=async()=>{
      const tenant_id=Number(btn.dataset.paid), invoice_id=Number(btn.dataset.invoice), amount=Number(btn.dataset.amount), phone=String(btn.dataset.phone||'').replace(/\D/g,'');
      btn.disabled=true; btn.textContent='Saving…';
      try{
        await api('/payments',{method:'POST',body:JSON.stringify({tenant_id,invoice_id,amount,payment_date:today(),payment_method:'UPI',payment_month:new Date().toLocaleString('en-IN',{month:'long',year:'numeric'}),notes:'Paid by tenant'})});
        const tenant=tenants.find(t=>Number(t.id)===tenant_id), inv=invoices.find(i=>Number(i.id)===invoice_id);
        const msg=`Payment received%0AInvoice: ${encodeURIComponent(inv?.invoice_number||'') }%0AAmount: ${encodeURIComponent(money(amount))}%0AThank you.`;
        if(phone) window.open(`https://wa.me/${phone}?text=${msg}`,'_blank');
        await ensurePaymentFlow();
      }catch(e){btn.disabled=false;btn.textContent='Paid';alert(e.message);}
    });
  }

  function removeExpenseActions(){
    document.querySelectorAll('button').forEach(b=>{const t=(b.textContent||'').trim().toLowerCase(); if(t==='delete'||t==='edit expense'||t==='edit') { const card=b.closest('div'); if(card && /expense/i.test(card.innerText||'')) b.remove(); }});
  }
  function boot(){
    const obs=new MutationObserver(()=>{hideRoomsTab();removeExpenseActions(); const text=currentTabText(); if(text.includes('properties')) ensurePropertyFlow().catch(()=>{}); if(text.includes('payments')) ensurePaymentFlow().catch(()=>{});});
    obs.observe(document.body,{childList:true,subtree:true});
    setTimeout(()=>{hideRoomsTab();removeExpenseActions();},1500);
    document.addEventListener('click',e=>{const el=e.target.closest?.('button,a');if(!el)return; const t=(el.textContent||'').trim().toLowerCase(); if(t==='properties')setTimeout(()=>ensurePropertyFlow().catch(()=>{}),250); if(t==='payments')setTimeout(()=>ensurePaymentFlow().catch(()=>{}),250);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
