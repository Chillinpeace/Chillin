import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';

interface Property {
  id: number;
  name: string;
  address: string;
  room_count: number;
  tenant_count: number;
  occupancy_rate: number;
  monthly_revenue: number;
}

interface Tenant {
  id: number;
  name: string;
  phone: string;
  room_number: string;
  monthly_rent: number;
  status: 'Paid' | 'Pending' | 'Overdue';
  property_name?: string;
  due_date: string;
}

interface Payment {
  id: number;
  tenant_name: string;
  amount: number;
  payment_method: string;
  payment_month: string;
  date: string;
  status: 'Completed' | 'Processing';
}

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'properties' | 'tenants' | 'payments' | 'analytics'>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Paid' | 'Pending' | 'Overdue'>('All');
  
  const [activeModal, setActiveModal] = useState<'none' | 'addProperty' | 'addTenant' | 'recordPayment'>('none');

  const [propName, setPropName] = useState('');
  const [propAddress, setPropAddress] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantRent, setTenantRent] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');

  const [properties, setProperties] = useState<Property[]>([
    { id: 1, name: 'Apex Luxury Suites', address: '102 Indiranagar, Bengaluru', room_count: 12, tenant_count: 11, occupancy_rate: 92, monthly_revenue: 185000 },
    { id: 2, name: 'Sereno Heights PG', address: '45 Electronic City, Bengaluru', room_count: 20, tenant_count: 18, occupancy_rate: 90, monthly_revenue: 216000 },
    { id: 3, name: 'Urban Living Co-Stay', address: '88 Koramangala, Bengaluru', room_count: 8, tenant_count: 8, occupancy_rate: 100, monthly_revenue: 120000 }
  ]);

  const [tenants, setTenants] = useState<Tenant[]>([
    { id: 1, name: 'Aarav Sharma', phone: '+919876543210', room_number: '301', monthly_rent: 18000, status: 'Paid', property_name: 'Apex Luxury Suites', due_date: '05 Sep' },
    { id: 2, name: 'Rhea Sen', phone: '+919812345678', room_number: '104', monthly_rent: 15000, status: 'Pending', property_name: 'Sereno Heights PG', due_date: '10 Sep' },
    { id: 3, name: 'Vikram Malhotra', phone: '+919988776655', room_number: '202', monthly_rent: 22000, status: 'Overdue', property_name: 'Urban Living Co-Stay', due_date: '01 Sep' },
    { id: 4, name: 'Ananya Gupta', phone: '+919765432109', room_number: '108', monthly_rent: 16500, status: 'Paid', property_name: 'Sereno Heights PG', due_date: '05 Sep' }
  ]);

  const [payments, setPayments] = useState<Payment[]>([
    { id: 101, tenant_name: 'Aarav Sharma', amount: 18000, payment_method: 'UPI (GPay)', payment_month: 'September 2026', date: '04 Sep, 2026', status: 'Completed' },
    { id: 102, tenant_name: 'Ananya Gupta', amount: 16500, payment_method: 'Bank Transfer', payment_month: 'September 2026', date: '05 Sep, 2026', status: 'Completed' }
  ]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [pRes, tRes, payRes] = await Promise.all([
          fetch('/api/properties'),
          fetch('/api/tenants'),
          fetch('/api/payments')
        ]);
        if (pRes.ok) setProperties(await pRes.json());
        if (tRes.ok) setTenants(await tRes.json());
        if (payRes.ok) setPayments(await payRes.json());
      } catch (e) {
        // Fallback to local memory if server offline
      }
    }
    fetchData();
  }, []);

  const sendWhatsAppReminder = (tenant: Tenant) => {
    const cleanPhone = tenant.phone.replace(/[^0-9]/g, '');
    const message = encodeURIComponent(
      `Hello ${tenant.name},\n\nThis is a gentle reminder regarding your monthly rent payment of ₹${tenant.monthly_rent.toLocaleString()} for Room ${tenant.room_number} (${tenant.property_name}), which was due on ${tenant.due_date}.\n\nPlease let us know once paid.`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const handleCreateProperty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!propName) return;
    const newProp: Property = {
      id: Date.now(),
      name: propName,
      address: propAddress || 'Bengaluru, KA',
      room_count: 5,
      tenant_count: 0,
      occupancy_rate: 0,
      monthly_revenue: 0
    };
    setProperties([newProp, ...properties]);
    setPropName('');
    setPropAddress('');
    setActiveModal('none');
  };

  const handleCreateTenant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantName) return;
    const newT: Tenant = {
      id: Date.now(),
      name: tenantName,
      phone: tenantPhone || '+919000000000',
      room_number: '101',
      monthly_rent: Number(tenantRent) || 15000,
      status: 'Pending',
      property_name: properties[0]?.name || 'Apex Suites',
      due_date: '05th Monthly'
    };
    setTenants([newT, ...tenants]);
    setTenantName('');
    setTenantPhone('');
    setTenantRent('');
    setActiveModal('none');
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentAmount) return;
    const newPay: Payment = {
      id: Date.now(),
      tenant_name: tenants[0]?.name || 'Tenant',
      amount: Number(paymentAmount),
      payment_method: 'UPI Instant',
      payment_month: 'Current Month',
      date: 'Today',
      status: 'Completed'
    };
    setPayments([newPay, ...payments]);
    setPaymentAmount('');
    setActiveModal('none');
  };

  const totalRevenue = properties.reduce((acc, p) => acc + p.monthly_revenue, 0);
  const totalTenants = tenants.length;
  const totalOccupancy = Math.round(
    properties.reduce((acc, p) => acc + p.occupancy_rate, 0) / (properties.length || 1)
  );

  const filteredTenants = tenants.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.room_number.includes(searchQuery);
    const matchesStatus = statusFilter === 'All' ? true : t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="mobile-shell">
      <header className="app-header">
        <div className="brand-wrap">
          <div className="brand-logo">P</div>
          <div>
            <h1 className="brand-title">Peacely</h1>
            <p className="brand-subtitle">Asset Intelligence Platform</p>
          </div>
        </div>
        <button className="avatar-btn" onClick={() => setActiveModal('recordPayment')}>
          <span className="plus-icon">+</span> Record
        </button>
      </header>

      <main className="content-area">
        {activeTab === 'dashboard' && (
          <div className="view-container">
            <div className="hero-card">
              <div className="hero-header">
                <span className="tag-light">Monthly Revenue Projection</span>
                <span className="live-indicator"><span className="pulse-dot"></span> Live</span>
              </div>
              <div className="hero-value">₹{totalRevenue.toLocaleString()}</div>
              <div className="hero-meta">
                <span>{totalOccupancy}% Occupancy</span>
                <span className="divider">•</span>
                <span>{totalTenants} Active Lease Agreements</span>
              </div>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ width: `${totalOccupancy}%` }}></div>
              </div>
            </div>

            <div className="metrics-grid">
              <div className="metric-tile">
                <div className="tile-icon">📊</div>
                <div className="tile-value">94.2%</div>
                <div className="tile-label">Rent Collection Rate</div>
              </div>
              <div className="metric-tile">
                <div className="tile-icon">⏳</div>
                <div className="tile-value">₹37,000</div>
                <div className="tile-label">Pending Dues</div>
              </div>
            </div>

            <div className="section-title-wrap">
              <h2>Quick Actions</h2>
            </div>
            <div className="actions-dock">
              <button className="dock-btn" onClick={() => setActiveModal('addTenant')}>
                <span className="dock-icon">👤</span>
                <span>Add Tenant</span>
              </button>
              <button className="dock-btn" onClick={() => setActiveModal('addProperty')}>
                <span className="dock-icon">🏢</span>
                <span>Add Property</span>
              </button>
              <button className="dock-btn" onClick={() => setActiveModal('recordPayment')}>
                <span className="dock-icon">💳</span>
                <span>Collect Rent</span>
              </button>
            </div>

            <div className="section-title-wrap">
              <h2>Property Portfolio ({properties.length})</h2>
              <button className="text-btn" onClick={() => setActiveTab('properties')}>View all</button>
            </div>
            {properties.map(p => (
              <div className="glass-card" key={p.id}>
                <div className="glass-header">
                  <div>
                    <h3 className="card-heading">{p.name}</h3>
                    <p className="card-subtext">{p.address}</p>
                  </div>
                  <span className="badge badge-emerald">{p.occupancy_rate}% Full</span>
                </div>
                <div className="glass-footer">
                  <span>{p.room_count} Units</span>
                  <span className="accent-text">₹{(p.monthly_revenue / 1000).toFixed(0)}k / mo</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'properties' && (
          <div className="view-container">
            <div className="view-header">
              <h2>Properties</h2>
              <button className="btn-primary-sm" onClick={() => setActiveModal('addProperty')}>+ Property</button>
            </div>
            {properties.map(p => (
              <div className="glass-card" key={p.id}>
                <div className="glass-header">
                  <div>
                    <h3 className="card-heading">{p.name}</h3>
                    <p className="card-subtext">{p.address}</p>
                  </div>
                </div>
                <div className="metrics-row">
                  <div>
                    <div className="mini-label">Occupancy</div>
                    <div className="mini-val">{p.occupancy_rate}%</div>
                  </div>
                  <div>
                    <div className="mini-label">Tenants</div>
                    <div className="mini-val">{p.tenant_count}</div>
                  </div>
                  <div>
                    <div className="mini-label">Est. Revenue</div>
                    <div className="mini-val">₹{p.monthly_revenue.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'tenants' && (
          <div className="view-container">
            <div className="view-header">
              <h2>Tenants Directory</h2>
              <button className="btn-primary-sm" onClick={() => setActiveModal('addTenant')}>+ Tenant</button>
            </div>

            <div className="filter-block">
              <input 
                type="text" 
                placeholder="Search tenant or room..." 
                className="search-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <div className="pills-row">
                {(['All', 'Paid', 'Pending', 'Overdue'] as const).map(f => (
                  <button 
                    key={f} 
                    className={`filter-pill ${statusFilter === f ? 'active' : ''}`}
                    onClick={() => setStatusFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {filteredTenants.map(t => (
              <div className="glass-card" key={t.id}>
                <div className="glass-header">
                  <div className="avatar-title-wrap">
                    <div className="user-avatar">{t.name.charAt(0)}</div>
                    <div>
                      <h3 className="card-heading">{t.name}</h3>
                      <p className="card-subtext">Room {t.room_number} • {t.property_name}</p>
                    </div>
                  </div>
                  <span className={`badge ${t.status === 'Paid' ? 'badge-emerald' : t.status === 'Pending' ? 'badge-amber' : 'badge-rose'}`}>
                    {t.status}
                  </span>
                </div>
                <div className="glass-footer">
                  <div>
                    <span className="card-subtext">{t.phone}</span>
                    <div className="accent-text">₹{t.monthly_rent.toLocaleString()} / mo</div>
                  </div>
                  {t.status !== 'Paid' && (
                    <button className="btn-primary-sm" style={{ background: '#25D366', color: '#ffffff' }} onClick={() => sendWhatsAppReminder(t)}>
                      💬 Remind
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="view-container">
            <div className="view-header">
              <h2>Financial Activity</h2>
              <button className="btn-primary-sm" onClick={() => setActiveModal('recordPayment')}>+ Record</button>
            </div>
            {payments.map(p => (
              <div className="glass-card" key={p.id}>
                <div className="glass-header">
                  <div>
                    <h3 className="card-heading">{p.tenant_name}</h3>
                    <p className="card-subtext">{p.payment_method} • {p.date}</p>
                  </div>
                  <div className="amount-tag">+₹{p.amount.toLocaleString()}</div>
                </div>
                <div className="glass-footer">
                  <span className="card-subtext">{p.payment_month}</span>
                  <span className="badge badge-emerald">{p.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="view-container">
            <div className="view-header">
              <h2>Portfolio Insights</h2>
            </div>
            <div className="hero-card">
              <div className="hero-header">
                <span className="tag-light">Annual Projected Yield</span>
              </div>
              <div className="hero-value">₹{(totalRevenue * 12).toLocaleString()}</div>
              <div className="card-subtext" style={{ marginTop: '8px' }}>Based on current {totalOccupancy}% average property occupancy across all units.</div>
            </div>

            <div className="glass-card">
              <h3 className="card-heading" style={{ marginBottom: '12px' }}>Occupancy Distribution</h3>
              <div className="distribution-list">
                {properties.map(p => (
                  <div key={p.id} className="dist-item">
                    <div className="dist-meta">
                      <span>{p.name}</span>
                      <span>{p.occupancy_rate}%</span>
                    </div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${p.occupancy_rate}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {activeModal !== 'none' && (
        <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            {activeModal === 'addProperty' && (
              <form onSubmit={handleCreateProperty}>
                <h3>Add New Property</h3>
                <input type="text" placeholder="Property Name" className="modal-input" value={propName} onChange={e => setPropName(e.target.value)} required />
                <input type="text" placeholder="Address / Location" className="modal-input" value={propAddress} onChange={e => setPropAddress(e.target.value)} />
                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setActiveModal('none')}>Cancel</button>
                  <button type="submit" className="btn-primary">Save Property</button>
                </div>
              </form>
            )}

            {activeModal === 'addTenant' && (
              <form onSubmit={handleCreateTenant}>
                <h3>Onboard New Tenant</h3>
                <input type="text" placeholder="Tenant Full Name" className="modal-input" value={tenantName} onChange={e => setTenantName(e.target.value)} required />
                <input type="tel" placeholder="Phone Number" className="modal-input" value={tenantPhone} onChange={e => setTenantPhone(e.target.value)} />
                <input type="number" placeholder="Monthly Rent (₹)" className="modal-input" value={tenantRent} onChange={e => setTenantRent(e.target.value)} />
                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setActiveModal('none')}>Cancel</button>
                  <button type="submit" className="btn-primary">Add Tenant</button>
                </div>
              </form>
            )}

            {activeModal === 'recordPayment' && (
              <form onSubmit={handleRecordPayment}>
                <h3>Record Rent Payment</h3>
                <input type="number" placeholder="Amount Received (₹)" className="modal-input" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} required />
                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setActiveModal('none')}>Cancel</button>
                  <button type="submit" className="btn-primary">Record Payment</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <nav className="glass-nav">
        <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <span className="nav-icon">⚡</span>
          <span className="nav-label">Home</span>
        </button>
        <button className={`nav-item ${activeTab === 'properties' ? 'active' : ''}`} onClick={() => setActiveTab('properties')}>
          <span className="nav-icon">🏢</span>
          <span className="nav-label">Assets</span>
        </button>
        <button className={`nav-item ${activeTab === 'tenants' ? 'active' : ''}`} onClick={() => setActiveTab('tenants')}>
          <span className="nav-icon">👥</span>
          <span className="nav-label">Tenants</span>
        </button>
        <button className={`nav-item ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>
          <span className="nav-icon">💳</span>
          <span className="nav-label">Ledger</span>
        </button>
        <button className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
          <span className="nav-icon">📈</span>
          <span className="nav-label">Insights</span>
        </button>
      </nav>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
