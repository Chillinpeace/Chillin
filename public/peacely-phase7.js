(() => {
  'use strict';
  if (window.__peacelyPhase7Booted) return;
  window.__peacelyPhase7Booted = true;

  const API = '/api';
  const esc = (v) => String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
  const date = (v) => v ? new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '-';
  const api = async (path, options = {}) => {
    const r = await fetch(API + path, {credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || `Request failed (${r.status})`);
    return d;
  };

  const style = `<style id="p7-style">
    #p7-wrap{font-size:13px}.p7-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:14px 0}.p7-form label{display:flex;flex-direction:column;gap:6px;color:#8e99aa;font-size:11px;font-weight:700}.p7-form input,.p7-form select{border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:12px;background:#0e1723;color:#f8fafc;outline:none;font:inherit}.p7-card{background:#0e1723;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:16px;margin-bottom:14px}.p7-btn{border:0;border-radius:11px;padding:11px 15px;background:#10b981;color:#04130d;font-weight:800;cursor:pointer}.p7-btn:disabled{opacity:.6}.p7-btn.alt{background:#172131;color:#dce3ec}.p7-note{padding:12px;border-radius:12px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.15);color:#9de8ca;margin-bottom:14px}.p7-error{padding:12px;border-radius:12px;background:#35151a;color:#fecaca;margin-bottom:12px}.p7-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}.p7-stat{background:#0e1723;border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:14px}.p7-stat small{display:block;color:#8e99aa;font-size:10px;margin-bottom:5px}.p7-big{font-size:21px;font-weight:850}.p7-table-wrap{overflow:auto;border:1px solid rgba(255,255,255,.07);border-radius:14px}.p7-table{width:100%;border-collapse:collapse;min-width:620px}.p7-table th,.p7-table td{padding:10px;border-bottom:1px solid rgba(255,255,255,.06);text-align:left;font-size:11px}.p7-table th{color:#8e99aa;background:#101a27}.p7-empty{padding:20px;text-align:center;color:#8e99aa}.p7-cost{font-weight:800}.p7-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}@media(max-width:700px){.p7-form{grid-template-columns:1fr}.p7-grid{grid-template-columns:1fr}}
  </style>`;

  let root, content, properties=[], rooms=[], beds=[], history=[];
  function getRoot(){root=document.getElementById('peacely-phase4-root');return root;}
  function addTab(){if(!root)return;const nav=root.querySelector('.p4-nav');if(!nav||nav.querySelector('[data-p7-tab]'))return;const b=document.createElement('button');b.textContent='Operations';b.dataset.p7Tab='1';b.className='p7-tab';b.onclick=render;nav.appendChild(b);}

  async function loadReferenceData(){
    const results=await Promise.allSettled([api('/properties'),api('/rooms'),api('/beds')]);
    properties=results[0].status==='fulfilled'?(results[0].value?.properties||results[0].value||[]):[];
    rooms=results[1].status==='fulfilled'?(results[1].value?.rooms||results[1].value||[]):[];
    beds=results[2].status==='fulfilled'?(results[2].value?.beds||results[2].value||[]):[];
  }
  function options(items,empty,labelFn){return `<option value="">${esc(empty)}</option>`+items.map(x=>`<option value="${esc(x.id)}">${esc(labelFn(x))}</option>`).join('');}
  function propertyOptions(){return options(properties,'Select property',x=>x.name||`Property ${x.id}`);}
  function roomOptions(pid=''){const list=pid?rooms.filter(r=>Number(r.property_id)===Number(pid)):rooms;return options(list,'Select room',x=>`Room ${x.room_number??x.number??x.id}`);}
  function bedOptions(rid=''){const list=rid?beds.filter(b=>Number(b.room_id)===Number(rid)):beds;return options(list,'Select bed',x=>`Bed ${x.bed_number??x.number??x.id}`);}
  async function loadHistory(){const d=await api('/maintenance');history=Array.isArray(d)?d:(d?.tickets||[]);}

  async function render(){
    if(!getRoot())return;content=root.querySelector('.p4-content');if(!content)return;
    if(!document.getElementById('p7-style'))document.head.insertAdjacentHTML('beforeend',style);addTab();
    content.innerHTML='<h1>Property Operations</h1><div class="p7-note">Loading…</div>';
    try{await Promise.all([loadReferenceData(),loadHistory()]);draw();}catch(e){content.innerHTML=`<h1>Property Operations</h1><div class="p7-error">${esc(e.message)}</div>`;}
  }

  function draw(){
    const totalCost=history.reduce((s,x)=>s+Number(x.actual_cost||0),0);
    const vacant=beds.filter(b=>!(b.is_occupied===true||String(b.is_occupied).toLowerCase()==='true')).length;
    content.innerHTML=`<div id="p7-wrap"><h1>Property Operations</h1>
      <div class="p7-note">Select the property, room and bed. When the work is finished, enter the cost and save. The cost is saved here and automatically added to Expenses.</div>
      <div class="p7-grid"><div class="p7-stat"><small>Maintenance Entries</small><div class="p7-big">${history.length}</div></div><div class="p7-stat"><small>Total Maintenance Cost</small><div class="p7-big">${money(totalCost)}</div></div><div class="p7-stat"><small>Vacant Beds</small><div class="p7-big">${vacant}</div></div></div>
      <div class="p7-card"><h3 style="margin:0 0 4px">Add Maintenance Cost</h3><div style="color:#8e99aa;font-size:11px">Only the location, work note and completed-work cost are needed.</div>
        <div class="p7-form"><label>Property<select id="p7-property">${propertyOptions()}</select></label><label>Room<select id="p7-room">${roomOptions()}</select></label><label>Bed<select id="p7-bed">${bedOptions()}</select></label><label>Work / Note<input id="p7-note" placeholder="e.g. Fan repair"></label><label>Cost (₹)<input id="p7-cost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0"></label><label>Date<input id="p7-date" type="date" value="${new Date().toISOString().slice(0,10)}"></label></div>
        <div class="p7-actions"><button class="p7-btn" id="p7-save">Save Maintenance Cost</button><button class="p7-btn alt" id="p7-refresh">Refresh</button></div>
      </div>
      <h3>Saved Maintenance Costs</h3><div class="p7-table-wrap"><table class="p7-table"><thead><tr><th>Date</th><th>Property</th><th>Room</th><th>Bed</th><th>Work / Note</th><th>Cost</th></tr></thead><tbody>${history.map(x=>`<tr><td>${date(x.due_date||x.created_at)}</td><td>${esc(x.property_name||'-')}</td><td>${esc(x.room_number||'-')}</td><td>${esc(x.bed_number||'-')}</td><td>${esc(x.title||x.description||'-')}</td><td class="p7-cost">${money(x.actual_cost)}</td></tr>`).join('')||'<tr><td colspan="6"><div class="p7-empty">No maintenance costs saved yet.</div></td></tr>'}</tbody></table></div>
    </div>`;
    const property=document.getElementById('p7-property'),room=document.getElementById('p7-room'),bed=document.getElementById('p7-bed');
    property.onchange=()=>{room.innerHTML=roomOptions(property.value);bed.innerHTML=bedOptions('');};
    room.onchange=()=>{bed.innerHTML=bedOptions(room.value);};
    document.getElementById('p7-refresh').onclick=render;document.getElementById('p7-save').onclick=saveCost;
  }

  async function saveCost(){
    const propertyId=Number(document.getElementById('p7-property').value)||0,roomId=Number(document.getElementById('p7-room').value)||0,bedId=Number(document.getElementById('p7-bed').value)||0,cost=Number(document.getElementById('p7-cost').value)||0,note=document.getElementById('p7-note').value.trim(),workDate=document.getElementById('p7-date').value;
    if(!propertyId)return alert('Please select a property.');if(!roomId)return alert('Please select a room.');if(!bedId)return alert('Please select a bed.');if(!(cost>0))return alert('Please enter the maintenance cost.');if(!workDate)return alert('Please select the date.');
    const button=document.getElementById('p7-save');button.disabled=true;button.textContent='Saving…';
    try{await api('/maintenance',{method:'POST',body:JSON.stringify({property_id:propertyId,room_id:roomId,bed_id:bedId,title:note||'Maintenance work',description:note,category:'Maintenance',priority:'Medium',status:'Resolved',actual_cost:cost,due_date:workDate})});alert('Maintenance cost saved and added to Expenses.');await render();}
    catch(e){button.disabled=false;button.textContent='Save Maintenance Cost';alert(e.message);}
  }

  const observer=new MutationObserver(()=>{if(getRoot())addTab();});observer.observe(document.documentElement,{childList:true,subtree:true});
  setInterval(()=>{if(getRoot())addTab();},1000);window.addEventListener('peacely-management-open',()=>setTimeout(()=>{if(getRoot())addTab();},50));setTimeout(()=>{if(getRoot())addTab();},100);
})();
