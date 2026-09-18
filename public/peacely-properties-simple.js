(() => {
  const ROOT_ID = 'peacely-properties-simple-root';

  const state = {
    active: false,
    suspended: false,
    managingId: null,
    properties: [],
    rooms: [],
    beds: [],
    floors: [],
    loading: false,
    error: ''
  };

  const api = async (path, options = {}) => {
    const response = await fetch('/api' + path, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || 'Request failed.');
    }

    return data;
  };

  const money = (value) =>
    '₹' + Number(value || 0).toLocaleString('en-IN');

  const esc = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.style.cssText =
    'position:fixed;inset:0;z-index:1200;background:#f8fafc;overflow:auto;padding:18px 16px 105px;display:none;';

  const style = document.createElement('style');
  style.textContent = `
    #${ROOT_ID} *{box-sizing:border-box}
    #${ROOT_ID} .ps-wrap{max-width:900px;margin:0 auto}
    #${ROOT_ID} .ps-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
    #${ROOT_ID} h1,#${ROOT_ID} h2,#${ROOT_ID} h3{margin:0;color:#0f172a}
    #${ROOT_ID} p{margin:5px 0;color:#64748b}
    #${ROOT_ID} .ps-card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:17px;margin-bottom:14px;box-shadow:0 4px 18px rgba(15,23,42,.05)}
    #${ROOT_ID} .ps-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}
    #${ROOT_ID} .ps-stat{background:#f8fafc;border-radius:12px;padding:11px}
    #${ROOT_ID} .ps-stat small{display:block;color:#64748b;margin-bottom:4px}
    #${ROOT_ID} .ps-stat strong{font-size:17px;color:#0f172a}
    #${ROOT_ID} .ps-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    #${ROOT_ID} .ps-detail{padding:12px;border:1px solid #e2e8f0;border-radius:13px;background:#fff}
    #${ROOT_ID} .ps-detail strong{display:block;color:#0f172a}
    #${ROOT_ID} .ps-detail span{display:block;color:#64748b;font-size:13px;margin-top:4px}
    #${ROOT_ID} button{border:0;border-radius:11px;padding:10px 14px;font-weight:700;cursor:pointer}
    #${ROOT_ID} .ps-primary{background:#0f172a;color:#fff}
    #${ROOT_ID} .ps-secondary{background:#e2e8f0;color:#0f172a}
    #${ROOT_ID} .ps-danger{background:#fee2e2;color:#b91c1c}
    #${ROOT_ID} .ps-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    #${ROOT_ID} .ps-room{border:1px solid #e2e8f0;border-radius:15px;padding:14px;margin-top:10px}
    #${ROOT_ID} .ps-room-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
    #${ROOT_ID} .ps-beds{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
    #${ROOT_ID} .ps-bed{padding:7px 9px;border-radius:9px;background:#dcfce7;color:#166534;font-size:13px}
    #${ROOT_ID} .ps-bed.occupied{background:#fee2e2;color:#991b1b}
    #${ROOT_ID} .ps-empty{padding:22px;text-align:center;color:#64748b}
    #${ROOT_ID} .ps-error{background:#fee2e2;color:#991b1b;border-radius:12px;padding:11px;margin-bottom:12px}
    @media(max-width:650px){
      #${ROOT_ID}{padding:14px 12px 100px}
      #${ROOT_ID} .ps-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
      #${ROOT_ID} .ps-grid{grid-template-columns:1fr}
      #${ROOT_ID} .ps-top{align-items:flex-start}
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(root);

  const isPropertiesTab = () => {
    const buttons = Array.from(document.querySelectorAll('.nav-item'));
    const button = buttons.find((item) =>
      String(item.textContent || '').toLowerCase().includes('properties')
    );
    return !!button && button.classList.contains('active');
  };

  const load = async () => {
    state.loading = true;
    try {
      const [p, r, b, f] = await Promise.all([
        api('/properties'),
        api('/rooms'),
        api('/beds'),
        api('/nivaasi-upgrades/structure')
      ]);
      state.properties = p.properties || p || [];
      state.rooms = r.rooms || r || [];
      state.beds = b.beds || b || [];
      state.floors = f.floors || f || [];
      state.error = '';
    } catch (error) {
      state.error = error.message || 'Unable to load properties.';
    } finally {
      state.loading = false;
    }
  };

  const render = () => {
    if (!state.active || state.suspended) {
      root.style.display = 'none';
      return;
    }

    root.style.display = 'block';

    if (state.loading) {
      root.innerHTML = '<div class="ps-wrap"><div class="ps-card ps-empty">Loading properties...</div></div>';
      return;
    }

    if (state.managingId !== null) {
      renderManage();
    } else {
      renderSummary();
    }
  };

  const renderSummary = () => {
    const error = state.error
      ? '<div class="ps-error">' + esc(state.error) + '</div>'
      : '';

    const cards = state.properties.map((property) => {
      const occupancy = Number(property.occupancy_rate || 0);
      return `
        <div class="ps-card">
          <div class="ps-top">
            <div>
              <h2>${esc(property.name)}</h2>
              <p>${esc(property.address || 'No address')}</p>
            </div>
            <span class="ps-detail" style="padding:8px 10px">${occupancy}% occupied</span>
          </div>

          <div class="ps-grid">
            <div class="ps-detail"><strong>${esc(property.property_type || 'Gents')}</strong><span>Property type</span></div>
            <div class="ps-detail"><strong>${esc(property.rent_cycle || '1st of every month')}</strong><span>Rental cycle</span></div>
          </div>

          <div class="ps-summary">
            <div class="ps-stat"><small>Rooms</small><strong>${Number(property.room_count || 0)}</strong></div>
            <div class="ps-stat"><small>Beds</small><strong>${Number(property.bed_count || 0)}</strong></div>
            <div class="ps-stat"><small>Occupied</small><strong>${Number(property.occupied_bed_count || 0)}</strong></div>
            <div class="ps-stat"><small>Monthly revenue</small><strong>${money(property.monthly_revenue)}</strong></div>
          </div>

          <div class="ps-actions">
            <button class="ps-primary" data-manage="${property.id}">Manage</button>
            <button class="ps-danger" data-delete="${property.id}">Delete Property</button>
          </div>
        </div>
      `;
    }).join('');

    root.innerHTML = `
      <div class="ps-wrap">
        <div class="ps-top">
          <div>
            <h1>Properties</h1>
            <p>Simple property summary</p>
          </div>
          <button class="ps-primary" data-add-property>+ Property</button>
        </div>
        ${error}
        ${cards || '<div class="ps-card ps-empty">No properties yet.</div>'}
      </div>
    `;

    root.querySelector('[data-add-property]')?.addEventListener('click', () => {
      state.suspended = true;
      render();
      const button = Array.from(document.querySelectorAll('button')).find((item) =>
        String(item.textContent || '').trim() === '+ Property'
      );
      button?.click();
    });

    root.querySelectorAll('[data-manage]').forEach((button) => {
      button.addEventListener('click', () => {
        state.managingId = Number(button.dataset.manage);
        state.error = '';
        render();
      });
    });

    root.querySelectorAll('[data-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const property = state.properties.find((item) => item.id === Number(button.dataset.delete));
        if (!property) return;

        const confirmed = window.confirm(
          'Delete ' + property.name + '? This will permanently delete its rooms, beds and tenant records.'
        );
        if (!confirmed) return;

        button.disabled = true;
        try {
          await api('/properties/' + property.id, { method: 'DELETE' });
          state.managingId = null;
          await load();
          render();
        } catch (error) {
          state.error = error.message || 'Unable to delete property.';
          render();
        }
      });
    });
  };

  const renderManage = () => {
    const property = state.properties.find((item) => item.id === state.managingId);

    if (!property) {
      state.managingId = null;
      renderSummary();
      return;
    }

    const propertyRooms = state.rooms.filter((room) => Number(room.property_id) === Number(property.id));
    const propertyFloors = state.floors.filter((floor) => Number(floor.property_id) === Number(property.id));

    root.innerHTML = `
      <div class="ps-wrap">
        <div class="ps-top">
          <div>
            <h1>${esc(property.name)}</h1>
            <p>Property management</p>
          </div>
          <button class="ps-secondary" data-back>← Back</button>
        </div>

        <div class="ps-card">
          <h3>Property Details</h3>
          <div class="ps-grid" style="margin-top:12px">
            <div class="ps-detail"><strong>${esc(property.name)}</strong><span>Property name</span></div>
            <div class="ps-detail"><strong>${esc(property.address || 'No address')}</strong><span>Address</span></div>
            <div class="ps-detail"><strong>${esc(property.property_type || 'Gents')}</strong><span>Property type</span></div>
            <div class="ps-detail"><strong>${esc(property.rent_cycle || '1st of every month')}</strong><span>Rental cycle</span></div>
          </div>

          <div class="ps-summary">
            <div class="ps-stat"><small>Rooms</small><strong>${propertyRooms.length}</strong></div>
            <div class="ps-stat"><small>Beds</small><strong>${Number(property.bed_count || 0)}</strong></div>
            <div class="ps-stat"><small>Occupied</small><strong>${Number(property.occupied_bed_count || 0)}</strong></div>
            <div class="ps-stat"><small>Revenue</small><strong>${money(property.monthly_revenue)}</strong></div>
          </div>
        </div>

        <div class="ps-card">
          <h3>Floors</h3>
          ${propertyFloors.length
            ? propertyFloors.map((floor) => '<div class="ps-detail" style="margin-top:9px"><strong>' + esc(floor.floor_name) + '</strong><span>' + esc(floor.building_name || 'Main Building') + '</span></div>').join('')
            : '<div class="ps-empty">No floors added.</div>'}
        </div>

        <div class="ps-card">
          <h3>Rooms & Beds</h3>
          ${propertyRooms.length
            ? propertyRooms.map((room) => {
                const roomBeds = state.beds.filter((bed) => Number(bed.room_id) === Number(room.id));
                return `
                  <div class="ps-room">
                    <div class="ps-room-head">
                      <div>
                        <h3>Room ${esc(room.room_number)}</h3>
                        <p>${esc(room.floor_name || 'Ground Floor')} · ${esc(room.room_type || 'Non AC')} · ${esc(room.sharing_type || '')}</p>
                      </div>
                      <strong>${money(room.rent_amount || 0)}/month</strong>
                    </div>
                    <p>Per day: ${money(room.per_day_rent || 0)}</p>
                    <div class="ps-beds">
                      ${roomBeds.length
                        ? roomBeds.map((bed) =>
                            '<span class="ps-bed ' + (bed.is_occupied ? 'occupied' : '') + '">Bed ' +
                            esc(bed.bed_number) + ' · ' + (bed.is_occupied ? 'Occupied' : 'Available') +
                            '</span>'
                          ).join('')
                        : '<span class="ps-empty">No beds</span>'}
                    </div>
                  </div>
                `;
              }).join('')
            : '<div class="ps-empty">No rooms added.</div>'}
        </div>

        <div class="ps-card">
          <div class="ps-actions">
            <button class="ps-danger" data-delete-managed>Delete Property</button>
          </div>
        </div>
      </div>
    `;

    root.querySelector('[data-back]')?.addEventListener('click', () => {
      state.managingId = null;
      state.error = '';
      render();
    });

    root.querySelector('[data-delete-managed]')?.addEventListener('click', async () => {
      const confirmed = window.confirm(
        'Delete ' + property.name + '? This will permanently delete its rooms, beds and tenant records.'
      );
      if (!confirmed) return;

      try {
        await api('/properties/' + property.id, { method: 'DELETE' });
        state.managingId = null;
        await load();
        render();
      } catch (error) {
        state.error = error.message || 'Unable to delete property.';
        render();
      }
    });
  };

  let previousActive = false;

  const sync = async () => {
    const active = isPropertiesTab();

    if (active && !previousActive) {
      state.active = true;
      state.suspended = false;
      state.managingId = null;
      render();
      await load();
      render();
    } else if (!active) {
      state.active = false;
      state.suspended = false;
      state.managingId = null;
      root.style.display = 'none';
    }

    previousActive = active;
  };

  setInterval(() => {
    sync().catch(() => {});
  }, 500);

  sync().catch(() => {});
})();