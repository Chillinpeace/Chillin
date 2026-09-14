```tsx
import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';

interface Property {
  id: number;
  name: string;
  address: string;
  room_count: number;
  bed_count?: number;
  occupied_bed_count?: number;
  tenant_count: number;
  occupancy_rate: number;
  monthly_revenue: number;
}

interface Room {
  id: number;
  property_id: number;
  room_number: string;
  sharing_type: string;
  rent_amount: number;
  property_name?: string;
  bed_count?: number;
  occupied_bed_count?: number;
}

interface Bed {
  id: number;
  room_id: number;
  bed_number: string;
  is_occupied: boolean;
  room_number?: string;
  property_id?: number;
  property_name?: string;
  tenant_id?: number;
  tenant_name?: string;
}

interface Tenant {
  id: number;
  name: string;
  phone: string;
  email?: string;
  room_number?: string;
  bed_number?: string;
  monthly_rent: number;
  status: string;
  property_name?: string;
  property_id: number;
  room_id?: number;
  bed_id?: number;
  due_date: number;
  deposit_amount?: number;
  move_in_date?: string;
}

interface Payment {
  id: number;
  tenant_id: number;
  tenant_name: string;
  amount: number;
  payment_method: string;
  payment_month: string;
  payment_date: string;
  notes?: string;
  property_name?: string;
  room_number?: string;
}

interface Invoice {
  id: number;
  invoice_number: string;
  tenant_id: number;
  tenant_name: string;
  amount: number;
  month?: string;
  due_date: string;
  status: string;
}

type Tab =
  | 'dashboard'
  | 'properties'
  | 'rooms'
  | 'tenants'
  | 'payments'
  | 'invoices'
  | 'analytics';

type Modal =
  | 'none'
  | 'addProperty'
  | 'addRoom'
  | 'addBed'
  | 'addTenant'
  | 'recordPayment'
  | 'addInvoice';

const API = '/api';

const money = (value: number) =>
  `₹${Number(value || 0).toLocaleString('en-IN')}`;

const today = () => new Date().toISOString().slice(0, 10);

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'All' | 'Paid' | 'Pending' | 'Overdue'
  >('All');

  const [activeModal, setActiveModal] = useState<Modal>('none');

  const [propName, setPropName] = useState('');
  const [propAddress, setPropAddress] = useState('');

  const [roomPropertyId, setRoomPropertyId] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [sharingType, setSharingType] = useState('Single');
  const [roomRent, setRoomRent] = useState('');

  const [bedRoomId, setBedRoomId] = useState('');
  const [bedNumber, setBedNumber] = useState('');

  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantEmail, setTenantEmail] = useState('');
  const [tenantPropertyId, setTenantPropertyId] = useState('');
  const [tenantRoomId, setTenantRoomId] = useState('');
  const [tenantBedId, setTenantBedId] = useState('');
  const [tenantRent, setTenantRent] = useState('');
  const [tenantDueDate, setTenantDueDate] = useState('5');
  const [tenantDeposit, setTenantDeposit] = useState('');
  const [tenantMoveInDate, setTenantMoveInDate] = useState(today());

  const [paymentTenantId, setPaymentTenantId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [paymentMonth, setPaymentMonth] = useState(
    new Date().toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
    }),
  );
  const [paymentDate, setPaymentDate] = useState(today());

  const [invoiceTenantId, setInvoiceTenantId] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceMonth, setInvoiceMonth] = useState(
    new Date().toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
    }),
  );
  const [invoiceDueDate, setInvoiceDueDate] = useState(today());

  const apiRequest = async <T,>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<T> => {
    const response = await fetch(`${API}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
      ...options,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || `Request failed: ${response.status}`);
    }

    return data as T;
  };

  const loadAllData = async () => {
    setLoading(true);
    setError('');

    try {
      const [
        propertyData,
        roomData,
        bedData,
        tenantData,
        paymentData,
        invoiceData,
      ] = await Promise.all([
        apiRequest<Property[]>('/properties'),
        apiRequest<Room[]>('/rooms'),
        apiRequest<Bed[]>('/beds'),
        apiRequest<Tenant[]>('/tenants'),
        apiRequest<Payment[]>('/payments'),
        apiRequest<Invoice[]>('/invoices'),
      ]);

      setProperties(propertyData || []);
      setRooms(roomData || []);
      setBeds(bedData || []);
      setTenants(tenantData || []);
      setPayments(paymentData || []);
      setInvoices(invoiceData || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load Peacely data.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const closeModal = () => {
    if (!saving) {
      setActiveModal('none');
      setError('');
    }
  };

  const resetForms = () => {
    setPropName('');
    setPropAddress('');

    setRoomPropertyId('');
    setRoomNumber('');
    setSharingType('Single');
    setRoomRent('');

    setBedRoomId('');
    setBedNumber('');

    setTenantName('');
    setTenantPhone('');
    setTenantEmail('');
    setTenantPropertyId('');
    setTenantRoomId('');
    setTenantBedId('');
    setTenantRent('');
    setTenantDueDate('5');
    setTenantDeposit('');
    setTenantMoveInDate(today());

    setPaymentTenantId('');
    setPaymentAmount('');
    setPaymentMethod('UPI');
    setPaymentDate(today());

    setInvoiceTenantId('');
    setInvoiceAmount('');
    setInvoiceDueDate(today());
  };

  const handleCreateProperty = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    if (!propName.trim()) return;

    setSaving(true);
    setError('');

    try {
      await apiRequest('/properties', {
        method: 'POST',
        body: JSON.stringify({
          name: propName.trim(),
          address: propAddress.trim(),
        }),
      });

      resetForms();
      setActiveModal('none');
      await loadAllData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to add property.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRoom = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    if (!roomPropertyId || !roomNumber.trim()) {
      setError('Select a property and enter a room number.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await apiRequest('/rooms', {
        method: 'POST',
        body: JSON.stringify({
          property_id: Number(roomPropertyId),
          room_number: roomNumber.trim(),
          sharing_type: sharingType,
          rent_amount: Number(roomRent) || 0,
        }),
      });

      resetForms();
      setActiveModal('none');
      await loadAllData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to add room.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBed = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    if (!bedRoomId || !bedNumber.trim()) {
      setError('Select a room and enter a bed number.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await apiRequest('/beds', {
        method: 'POST',
        body: JSON.stringify({
          room_id: Number(bedRoomId),
          bed_number: bedNumber.trim(),
        }),
      });

      resetForms();
      setActiveModal('none');
      await loadAllData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to add bed.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTenant = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    if (
      !tenantName.trim() ||
      !tenantPhone.trim() ||
      !tenantPropertyId
    ) {
      setError(
        'Name, phone number and property are required.',
      );
      return;
    }

    setSaving(true);
    setError('');

    try {
      await apiRequest('/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: tenantName.trim(),
          phone: tenantPhone.trim(),
          email: tenantEmail.trim(),
          property_id: Number(tenantPropertyId),
          room_id: tenantRoomId
            ? Number(tenantRoomId)
            : null,
          bed_id: tenantBedId
            ? Number(tenantBedId)
            : null,
          monthly_rent: Number(tenantRent) || 0,
          due_date: Number(tenantDueDate) || 5,
          deposit_amount: Number(tenantDeposit) || 0,
          move_in_date:
            tenantMoveInDate || null,
        }),
      });

      resetForms();
      setActiveModal('none');
      await loadAllData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to add tenant.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRecordPayment = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    if (
      !paymentTenantId ||
      !paymentAmount ||
      Number(paymentAmount) <= 0
    ) {
      setError('Select a tenant and enter a valid amount.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payment = await apiRequest<Payment>(
        '/payments',
        {
          method: 'POST',
          body: JSON.stringify({
            tenant_id: Number(paymentTenantId),
            amount: Number(paymentAmount),
            payment_date: paymentDate,
            payment_method: paymentMethod,
            payment_month: paymentMonth,
          }),
        },
      );

      resetForms();
      setActiveModal('none');
      await loadAllData();
      printReceipt(payment);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to record payment.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateInvoice = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    if (
      !invoiceTenantId ||
      !invoiceAmount ||
      Number(invoiceAmount) <= 0
    ) {
      setError('Select a tenant and enter a valid amount.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await apiRequest('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: Number(invoiceTenantId),
          amount: Number(invoiceAmount),
          month: invoiceMonth,
          due_date: invoiceDueDate,
          status: 'Pending',
        }),
      });

      resetForms();
      setActiveModal('none');
      await loadAllData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to create invoice.',
      );
    } finally {
      setSaving(false);
    }
  };

  const sendWhatsAppReminder = (tenant: Tenant) => {
    const cleanPhone = tenant.phone.replace(/[^0-9]/g, '');

    const message = encodeURIComponent(
      `Hello ${tenant.name},\n\nThis is a gentle reminder regarding your monthly rent payment of ${money(
        tenant.monthly_rent,
      )} for Room ${tenant.room_number || 'N/A'} (${
        tenant.property_name || 'Peacely Property'
      }), which is due on the ${tenant.due_date}th.\n\nPlease let us know once paid.`,
    );

    window.open(
      `https://wa.me/${cleanPhone}?text=${message}`,
      '_blank',
    );
  };

  const printReceipt = (payment: Payment) => {
    const win = window.open('', '_blank');

    if (!win) return;

    win.document.write(`
      <html>
        <head>
          <title>Rent Receipt #${payment.id}</title>
          <style>
            body {
              font-family: -apple-system, sans-serif;
              padding: 40px;
              background: #fafafa;
              color: #111;
            }
            .card {
              max-width: 440px;
              margin: 0 auto;
              background: #fff;
              padding: 32px;
              border-radius: 16px;
              border: 1px solid #eee;
            }
            .brand {
              font-size: 22px;
              font-weight: 800;
              color: #10b981;
              margin-bottom: 4px;
            }
            .subtitle {
              font-size: 12px;
              color: #666;
              margin-bottom: 24px;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .row {
              display: flex;
              justify-content: space-between;
              gap: 20px;
              padding: 10px 0;
              border-bottom: 1px solid #f0f0f0;
              font-size: 14px;
            }
            .label { color: #666; }
            .value {
              font-weight: 600;
              text-align: right;
            }
            .amount-box {
              margin: 20px 0;
              padding: 16px;
              background: #ecfdf5;
              border-radius: 12px;
              text-align: center;
            }
            .amount-title {
              font-size: 12px;
              color: #047857;
              text-transform: uppercase;
            }
            .amount-val {
              font-size: 28px;
              font-weight: 800;
              color: #065f46;
              margin-top: 4px;
            }
            .footer {
              text-align: center;
              margin-top: 24px;
              font-size: 11px;
              color: #888;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="brand">Peacely</div>
            <div class="subtitle">Official Payment Receipt</div>

            <div class="row">
              <span class="label">Receipt ID</span>
              <span class="value">#REC-${payment.id}</span>
            </div>

            <div class="row">
              <span class="label">Date</span>
              <span class="value">${payment.payment_date}</span>
            </div>

            <div class="row">
              <span class="label">Tenant Name</span>
              <span class="value">${payment.tenant_name}</span>
            </div>

            <div class="row">
              <span class="label">Billing Period</span>
              <span class="value">${payment.payment_month}</span>
            </div>

            <div class="row">
              <span class="label">Payment Method</span>
              <span class="value">${payment.payment_method}</span>
            </div>

            <div class="amount-box">
              <div class="amount-title">Amount Received</div>
              <div class="amount-val">
                ${money(payment.amount)}
              </div>
            </div>

            <div class="footer">
              Thank you for your payment!
              Keep this receipt for your records.
            </div>
          </div>

          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `);

    win.document.close();
  };

  const totalRevenue = useMemo(
    () =>
      properties.reduce(
        (sum, property) =>
          sum + Number(property.monthly_revenue || 0),
        0,
      ),
    [properties],
  );

  const totalTenants = tenants.filter(
    (tenant) => tenant.status === 'Active',
  ).length;

  const totalBeds = properties.reduce(
    (sum, property) =>
      sum + Number(property.bed_count || 0),
    0,
  );

  const occupiedBeds = properties.reduce(
    (sum, property) =>
      sum + Number(property.occupied_bed_count || 0),
    0,
  );

  const totalOccupancy =
    totalBeds > 0
      ? Math.round((occupiedBeds / totalBeds) * 100)
      : 0;

  const expectedRent = tenants
    .filter((tenant) => tenant.status === 'Active')
    .reduce(
      (sum, tenant) =>
        sum + Number(tenant.monthly_rent || 0),
      0,
    );

  const currentMonth = new Date().toLocaleString(
    'en-IN',
    {
      month: 'long',
      year: 'numeric',
    },
  );

  const collectedThisMonth = payments
    .filter(
      (payment) =>
        payment.payment_month === currentMonth,
    )
    .reduce(
      (sum, payment) =>
        sum + Number(payment.amount || 0),
      0,
    );

  const pendingDues = Math.max(
    expectedRent - collectedThisMonth,
    0,
  );

  const collectionRate =
    expectedRent > 0
      ? Math.min(
          Math.round(
            (collectedThisMonth / expectedRent) * 100,
          ),
          100,
        )
      : 0;

  const filteredTenants = tenants.filter((tenant) => {
    const query = searchQuery.toLowerCase();

    const matchesSearch =
      tenant.name
        .toLowerCase()
        .includes(query) ||
      String(tenant.room_number || '')
        .toLowerCase()
        .includes(query) ||
      String(tenant.property_name || '')
        .toLowerCase()
        .includes(query);

    const matchesStatus =
      statusFilter === 'All'
        ? true
        : tenant.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const tenantRooms = rooms.filter(
    (room) =>
      !tenantPropertyId ||
      Number(room.property_id) ===
        Number(tenantPropertyId),
  );

  const tenantBeds = beds.filter(
    (bed) =>
      !tenantRoomId ||
      Number(bed.room_id) === Number(tenantRoomId),
  );

  const availableBeds = tenantBeds.filter(
    (bed) => !bed.is_occupied,
  );

  const dashboardProperties = properties.slice(0, 5);

  if (loading) {
    return (
      <div className="mobile-shell">
        <header className="app-header">
          <div className="brand-wrap">
            <div className="brand-logo">P</div>
            <div>
              <h1 className="brand-title">Peacely</h1>
              <p className="brand-subtitle">
                Asset Intelligence Platform
              </p>
            </div>
          </div>
        </header>

        <main className="content-area">
          <div className="hero-card">
            <div className="hero-header">
              <span className="tag-light">
                Connecting to Peacely
              </span>
              <span className="live-indicator">
                <span className="pulse-dot"></span>
                Live
              </span>
            </div>

            <div className="hero-value">Loading...</div>

            <div className="hero-meta">
              Loading your PostgreSQL data
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="mobile-shell">
      <header className="app-header">
        <div className="brand-wrap">
          <div className="brand-logo">P</div>

          <div>
            <h1 className="brand-title">Peacely</h1>
            <p className="brand-subtitle">
              Asset Intelligence Platform
            </p>
          </div>
        </div>

        <button
          className="avatar-btn"
          onClick={() =>
            setActiveModal('recordPayment')
          }
        >
          <span className="plus-icon">+</span> Record
        </button>
      </header>

      {error && (
        <div
          style={{
            background: 'rgba(244,63,94,0.12)',
            border: '1px solid rgba(244,63,94,0.3)',
            color: '#fda4af',
            padding: '12px 14px',
            borderRadius: '12px',
            marginBottom: '12px',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      <main className="content-area">
        {activeTab === 'dashboard' && (
          <div className="view-container">
            <div className="hero-card">
              <div className="hero-header">
                <span className="tag-light">
                  Monthly Revenue Projection
                </span>

                <span className="live-indicator">
                  <span className="pulse-dot"></span>
                  Live
                </span>
              </div>

              <div className="hero-value">
                {money(totalRevenue)}
              </div>

              <div className="hero-meta">
                <span>{totalOccupancy}% Occupancy</span>
                <span className="divider">•</span>
                <span>
                  {totalTenants} Active Lease Agreements
                </span>
              </div>

              <div className="progress-bar-bg">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${Math.min(
                      totalOccupancy,
                      100,
                    )}%`,
                  }}
                ></div>
              </div>
            </div>

            <div className="metrics-grid">
              <div className="metric-tile">
                <div className="tile-icon">📊</div>
                <div className="tile-value">
                  {collectionRate}%
                </div>
                <div className="tile-label">
                  Rent Collection Rate
                </div>
              </div>

              <div className="metric-tile">
                <div className="tile-icon">⏳</div>
                <div className="tile-value">
                  {money(pendingDues)}
                </div>
                <div className="tile-label">
                  Pending Dues
                </div>
              </div>
            </div>

            <div className="section-title-wrap">
              <h2>Quick Actions</h2>
            </div>

            <div className="actions-dock">
              <button
                className="dock-btn"
                onClick={() =>
                  setActiveModal('addTenant')
                }
              >
                <span className="dock-icon">👤</span>
                <span>Add Tenant</span>
              </button>

              <button
                className="dock-btn"
                onClick={() =>
                  setActiveModal('addProperty')
                }
              >
                <span className="dock-icon">🏢</span>
                <span>Add Property</span>
              </button>

              <button
                className="dock-btn"
                onClick={() =>
                  setActiveModal('recordPayment')
                }
              >
                <span className="dock-icon">💳</span>
                <span>Collect Rent</span>
              </button>
            </div>

            <div className="section-title-wrap">
              <h2>
                Property Portfolio ({properties.length})
              </h2>

              <button
                className="text-btn"
                onClick={() =>
                  setActiveTab('properties')
                }
              >
                View all
              </button>
            </div>

            {dashboardProperties.length === 0 && (
              <div className="glass-card">
                <p className="card-subtext">
                  No properties yet. Add your first
                  property to get started.
                </p>
              </div>
            )}

            {dashboardProperties.map((property) => (
              <div
                className="glass-card"
                key={property.id}
              >
                <div className="glass-header">
                  <div>
                    <h3 className="card-heading">
                      {property.name}
                    </h3>

                    <p className="card-subtext">
                      {property.address ||
                        'No address added'}
                    </p>
                  </div>

                  <span className="badge badge-emerald">
                    {property.occupancy_rate}% Full
                  </span>
                </div>

                <div className="glass-footer">
                  <span>
                    {property.room_count} Rooms
                  </span>

                  <span className="accent-text">
                    {money(property.monthly_revenue)} / mo
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'properties' && (
          <div className="view-container">
            <div className="view-header">
              <h2>Properties</h2>

              <button
                className="btn-primary-sm"
                onClick={() =>
                  setActiveModal('addProperty')
                }
              >
                + Property
              </button>
            </div>

            {properties.length === 0 && (
              <div className="glass-card">
                <p className="card-subtext">
                  No properties added yet.
                </p>
              </div>
            )}

            {properties.map((property) => (
              <div
                className="glass-card"
                key={property.id}
              >
                <div className="glass-header">
                  <div>
                    <h3 className="card-heading">
                      {property.name}
                    </h3>

                    <p className="card-subtext">
                      {property.address ||
                        'No address added'}
                    </p>
                  </div>

                  <span className="badge badge-emerald">
                    {property.occupancy_rate}% Full
                  </span>
                </div>

                <div className="metrics-row">
                  <div>
                    <div className="mini-label">
                      Rooms
                    </div>
                    <div className="mini-val">
                      {property.room_count}
                    </div>
                  </div>

                  <div>
                    <div className="mini-label">
                      Tenants
                    </div>
                    <div className="mini-val">
                      {property.tenant_count}
                    </div>
                  </div>

                  <div>
                    <div className="mini-label">
                      Est. Revenue
                    </div>
                    <div className="mini-val">
                      {money(property.monthly_revenue)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'rooms' && (
          <div className="view-container">
            <div className="view-header">
              <h2>Rooms & Beds</h2>

              <button
                className="btn-primary-sm"
                onClick={() =>
                  setActiveModal('addRoom')
                }
              >
                + Room
              </button>
            </div>

            <button
              className="btn-primary-sm"
              style={{ marginBottom: '12px' }}
              onClick={() =>
                setActiveModal('addBed')
              }
            >
              + Bed
            </button>

            {rooms.map((room) => (
              <div
                className="glass-card"
                key={room.id}
              >
                <div className="glass-header">
                  <div>
                    <h3 className="card-heading">
                      Room {room.room_number}
                    </h3>

                    <p className="card-subtext">
                      {room.property_name} •{' '}
                      {room.sharing_type}
                    </p>
                  </div>

                  <span className="badge badge-emerald">
                    {room.occupied_bed_count || 0}/
                    {room.bed_count || 0} Occupied
                  </span>
                </div>

                <div className="glass-footer">
                  <span>
                    Rent {money(room.rent_amount)}
                  </span>

                  <span className="accent-text">
                    {beds.filter(
                      (bed) =>
                        bed.room_id === room.id,
                    ).length}{' '}
                    Beds
                  </span>
                </div>
              </div>
            ))}

            {rooms.length === 0 && (
              <div className="glass-card">
                <p className="card-subtext">
                  No rooms yet. Add a room to begin
                  managing beds.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'tenants' && (
          <div className="view-container">
            <div className="view-header">
              <h2>Tenants Directory</h2>

              <button
                className="btn-primary-sm"
                onClick={() =>
                  setActiveModal('addTenant')
                }
              >
                + Tenant
              </button>
            </div>

            <div className="filter-block">
              <input
                type="text"
                placeholder="Search tenant or room..."
                className="search-input"
                value={searchQuery}
                onChange={(e) =>
                  setSearchQuery(e.target.value)
                }
              />

              <div className="pills-row">
                {(
                  [
                    'All',
                    'Paid',
                    'Pending',
                    'Overdue',
                  ] as const
                ).map((filter) => (
                  <button
                    key={filter}
                    className={`filter-pill ${
                      statusFilter === filter
                        ? 'active'
                        : ''
                    }`}
                    onClick={() =>
                      setStatusFilter(filter)
                    }
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {filteredTenants.map((tenant) => (
              <div
                className="glass-card"
                key={tenant.id}
              >
                <div className="glass-header">
                  <div className="avatar-title-wrap">
                    <div className="user-avatar">
                      {tenant.name.charAt(0)}
                    </div>

                    <div>
                      <h3 className="card-heading">
                        {tenant.name}
                      </h3>

                      <p className="card-subtext">
                        Room{' '}
                        {tenant.room_number ||
                          'Unassigned'}{' '}
                        •{' '}
                        {tenant.property_name ||
                          'No property'}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`badge ${
                      tenant.status === 'Paid'
                        ? 'badge-emerald'
                        : tenant.status === 'Pending'
                          ? 'badge-amber'
                          : 'badge-rose'
                    }`}
                  >
                    {tenant.status}
                  </span>
                </div>

                <div className="glass-footer">
                  <div>
                    <span className="card-subtext">
                      {tenant.phone}
                    </span>

                    <div className="accent-text">
                      {money(
                        tenant.monthly_rent,
                      )}{' '}
                      / mo
                    </div>
                  </div>

                  {tenant.status !== 'Paid' && (
                    <button
                      className="btn-primary-sm"
                      style={{
                        background: '#25D366',
                        color: '#ffffff',
                      }}
                      onClick={() =>
                        sendWhatsAppReminder(tenant)
                      }
                    >
                      💬 Remind
                    </button>
                  )}
                </div>
              </div>
            ))}

            {filteredTenants.length === 0 && (
              <div className="glass-card">
                <p className="card-subtext">
                  No tenants found.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="view-container">
            <div className="view-header">
              <h2>Financial Activity</h2>

              <button
                className="btn-primary-sm"
                onClick={() =>
                  setActiveModal('recordPayment')
                }
              >
                + Record
              </button>
            </div>

            {payments.map((payment) => (
              <div
                className="glass-card"
                key={payment.id}
              >
                <div className="glass-header">
                  <div>
                    <h3 className="card-heading">
                      {payment.tenant_name}
                    </h3>

                    <p className="card-subtext">
                      {payment.payment_method} •{' '}
                      {payment.payment_date}
                    </p>
                  </div>

                  <div className="amount-tag">
                    +{money(payment.amount)}
                  </div>
                </div>

                <div className="glass-footer">
                  <span className="card-subtext">
                    {payment.payment_month}
                  </span>

                  <button
                    className="text-btn"
                    onClick={() =>
                      printReceipt(payment)
                    }
                  >
                    📄 Receipt
                  </button>
                </div>
              </div>
            ))}

            {payments.length === 0 && (
              <div className="glass-card">
                <p className="card-subtext">
                  No payments recorded yet.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'invoices' && (
          <div className="view-container">
            <div className="view-header">
              <h2>Invoices</h2>

              <button
                className="btn-primary-sm"
                onClick={() =>
                  setActiveModal('addInvoice')
                }
              >
                + Invoice
              </button>
            </div>

            {invoices.map((invoice) => (
              <div
                className="glass-card"
                key={invoice.id}
              >
                <div className="glass-header">
                  <div>
                    <h3 className="card-heading">
                      {invoice.invoice_number}
                    </h3>

                    <p className="card-subtext">
                      {invoice.tenant_name} •{' '}
                      {invoice.month || 'Monthly Rent'}
                    </p>
                  </div>

                  <span
                    className={`badge ${
                      invoice.status === 'Paid'
                        ? 'badge-emerald'
                        : 'badge-amber'
                    }`}
                  >
                    {invoice.status}
                  </span>
                </div>

                <div className="glass-footer">
                  <span>
                    Due {invoice.due_date}
                  </span>

                  <span className="accent-text">
                    {money(invoice.amount)}
                  </span>
                </div>
              </div>
            ))}

            {invoices.length === 0 && (
              <div className="glass-card">
                <p className="card-subtext">
                  No invoices created yet.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="view-container">
            <div className="view-header">
              <h2>Portfolio Insights</h2>
            </div>

            <div className="hero-card">
              <div className="hero-header">
                <span className="tag-light">
                  Annual Projected Yield
                </span>
              </div>

              <div className="hero-value">
                {money(totalRevenue * 12)}
              </div>

              <div
                className="card-subtext"
                style={{ marginTop: '8px' }}
              >
                Based on current {totalOccupancy}%
                average occupancy across all beds.
              </div>
            </div>

            <div className="glass-card">
              <h3
                className="card-heading"
                style={{ marginBottom: '12px' }}
              >
                Occupancy Distribution
              </h3>

              <div className="distribution-list">
                {properties.map((property) => (
                  <div
                    key={property.id}
                    className="dist-item"
                  >
                    <div className="dist-meta">
                      <span>{property.name}</span>
                      <span>
                        {property.occupancy_rate}%
                      </span>
                    </div>

                    <div className="progress-bar-bg">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${Math.min(
                            property.occupancy_rate,
                            100,
                          )}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {activeModal !== 'none' && (
        <div
          className="modal-backdrop"
          onClick={closeModal}
        >
          <div
            className="modal-card"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            {error && (
              <div
                style={{
                  color: '#fda4af',
                  fontSize: '13px',
                  marginBottom: '12px',
                }}
              >
                {error}
              </div>
            )}

            {activeModal === 'addProperty' && (
              <form onSubmit={handleCreateProperty}>
                <h3>Add New Property</h3>

                <input
                  type="text"
                  placeholder="Property Name"
                  className="modal-input"
                  value={propName}
                  onChange={(e) =>
                    setPropName(e.target.value)
                  }
                  required
                />

                <input
                  type="text"
                  placeholder="Address / Location"
                  className="modal-input"
                  value={propAddress}
                  onChange={(e) =>
                    setPropAddress(e.target.value)
                  }
                />

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={closeModal}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={saving}
                  >
                    {saving
                      ? 'Saving...'
                      : 'Save Property'}
                  </button>
                </div>
              </form>
            )}

            {activeModal === 'addRoom' && (
              <form onSubmit={handleCreateRoom}>
                <h3>Add New Room</h3>

                <select
                  className="modal-input"
                  value={roomPropertyId}
                  onChange={(e) =>
                    setRoomPropertyId(e.target.value)
                  }
                  required
                >
                  <option value="">
                    Select Property
                  </option>

                  {properties.map((property) => (
                    <option
                      key={property.id}
                      value={property.id}
                    >
                      {property.name}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="Room Number"
                  className="modal-input"
                  value={roomNumber}
                  onChange={(e) =>
                    setRoomNumber(e.target.value)
                  }
                  required
                />

                <select
                  className="modal-input"
                  value={sharingType}
                  onChange={(e) =>
                    setSharingType(e.target.value)
                  }
                >
                  <option value="Single">
                    Single
                  </option>
                  <option value="Double">
                    Double
                  </option>
                  <option value="Triple">
                    Triple
                  </option>
                  <option value="Four Sharing">
                    Four Sharing
                  </option>
                  <option value="Dormitory">
                    Dormitory
                  </option>
                </select>

                <input
                  type="number"
                  placeholder="Monthly Rent (₹)"
                  className="modal-input"
                  value={roomRent}
                  onChange={(e) =>
                    setRoomRent(e.target.value)
                  }
                />

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={closeModal}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={saving}
                  >
                    {saving
                      ? 'Saving...'
                      : 'Save Room'}
                  </button>
                </div>
              </form>
            )}

            {activeModal === 'addBed' && (
              <form onSubmit={handleCreateBed}>
                <h3>Add New Bed</h3>

                <select
                  className="modal-input"
                  value={bedRoomId}
                  onChange={(e) =>
                    setBedRoomId(e.target.value)
                  }
                  required
                >
                  <option value="">
                    Select Room
                  </option>

                  {rooms.map((room) => (
                    <option
                      key={room.id}
                      value={room.id}
                    >
                      Room {room.room_number} —{' '}
                      {room.property_name}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="Bed Number e.g. A1"
                  className="modal-input"
                  value={bedNumber}
                  onChange={(e) =>
                    setBedNumber(e.target.value)
                  }
                  required
                />

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={closeModal}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={saving}
                  >
                    {saving
                      ? 'Saving...'
                      : 'Save Bed'}
                  </button>
                </div>
              </form>
            )}

            {activeModal === 'addTenant' && (
              <form onSubmit={handleCreateTenant}>
                <h3>Onboard New Tenant</h3>

                <input
                  type="text"
                  placeholder="Tenant Full Name"
                  className="modal-input"
                  value={tenantName}
                  onChange={(e) =>
                    setTenantName(e.target.value)
                  }
                  required
                />

                <input
                  type="tel"
                  placeholder="Phone Number"
                  className="modal-input"
                  value={tenantPhone}
                  onChange={(e) =>
                    setTenantPhone(e.target.value)
                  }
                  required
                />

                <input
                  type="email"
                  placeholder="Email (optional)"
                  className="modal-input"
                  value={tenantEmail}
                  onChange={(e) =>
                    setTenantEmail(e.target.value)
                  }
                />

                <select
                  className="modal-input"
                  value={tenantPropertyId}
                  onChange={(e) => {
                    setTenantPropertyId(
                      e.target.value,
                    );
                    setTenantRoomId('');
                    setTenantBedId('');
                  }}
                  required
                >
                  <option value="">
                    Select Property
                  </option>

                  {properties.map((property) => (
                    <option
                      key={property.id}
                      value={property.id}
                    >
                      {property.name}
                    </option>
                  ))}
                </select>

                <select
                  className="modal-input"
                  value={tenantRoomId}
                  onChange={(e) => {
                    setTenantRoomId(
                      e.target.value,
                    );
                    setTenantBedId('');
                  }}
                  disabled={!tenantPropertyId}
                >
                  <option value="">
                    Select Room
                  </option>

                  {tenantRooms.map((room) => (
                    <option
                      key={room.id}
                      value={room.id}
                    >
                      Room {room.room_number}
                    </option>
                  ))}
                </select>

                <select
                  className="modal-input"
                  value={tenantBedId}
                  onChange={(e) =>
                    setTenantBedId(e.target.value)
                  }
                  disabled={!tenantRoomId}
                >
                  <option value="">
                    Select Available Bed
                  </option>

                  {availableBeds.map((bed) => (
                    <option
                      key={bed.id}
                      value={bed.id}
                    >
                      Bed {bed.bed_number}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  placeholder="Monthly Rent (₹)"
                  className="modal-input"
                  value={tenantRent}
                  onChange={(e) =>
                    setTenantRent(e.target.value)
                  }
                  required
                />

                <input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Rent Due Day"
                  className="modal-input"
                  value={tenantDueDate}
                  onChange={(e) =>
                    setTenantDueDate(e.target.value)
                  }
                />

                <input
                  type="number"
                  placeholder="Security Deposit (₹)"
                  className="modal-input"
                  value={tenantDeposit}
                  onChange={(e) =>
                    setTenantDeposit(
                      e.target.value,
                    )
                  }
                />

                <input
                  type="date"
                  className="modal-input"
                  value={tenantMoveInDate}
                  onChange={(e) =>
                    setTenantMoveInDate(
                      e.target.value,
                    )
                  }
                />

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={closeModal}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={saving}
                  >
                    {saving
                      ? 'Saving...'
                      : 'Add Tenant'}
                  </button>
                </div>
              </form>
            )}

            {activeModal === 'recordPayment' && (
              <form onSubmit={handleRecordPayment}>
                <h3>Record Rent Payment</h3>

                <select
                  className="modal-input"
                  value={paymentTenantId}
                  onChange={(e) =>
                    setPaymentTenantId(
                      e.target.value,
                    )
                  }
                  required
                >
                  <option value="">
                    Select Tenant
                  </option>

                  {tenants
                    .filter(
                      (tenant) =>
                        tenant.status ===
                        'Active',
                    )
                    .map((tenant) => (
                      <option
                        key={tenant.id}
                        value={tenant.id}
                      >
                        {tenant.name} —{' '}
                        {money(
                          tenant.monthly_rent,
                        )}
                      </option>
                    ))}
                </select>

                <input
                  type="number"
                  placeholder="Amount Received (₹)"
                  className="modal-input"
                  value={paymentAmount}
                  onChange={(e) =>
                    setPaymentAmount(
                      e.target.value,
                    )
                  }
                  required
                />

                <select
                  className="modal-input"
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(
                      e.target.value,
                    )
                  }
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">
                    Bank Transfer
                  </option>
                  <option value="Other">Other</option>
                </select>

                <input
                  type="text"
                  placeholder="Payment Month"
                  className="modal-input"
                  value={paymentMonth}
                  onChange={(e) =>
                    setPaymentMonth(
                      e.target.value,
                    )
                  }
                  required
                />

                <input
                  type="date"
                  className="modal-input"
                  value={paymentDate}
                  onChange={(e) =>
                    setPaymentDate(
                      e.target.value,
                    )
                  }
                  required
                />

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={closeModal}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={saving}
                  >
                    {saving
                      ? 'Saving...'
                      : 'Record & Print'}
                  </button>
                </div>
              </form>
            )}

            {activeModal === 'addInvoice' && (
              <form onSubmit={handleCreateInvoice}>
                <h3>Create Rent Invoice</h3>

                <select
                  className="modal-input"
                  value={invoiceTenantId}
                  onChange={(e) =>
                    setInvoiceTenantId(
                      e.target.value,
                    )
                  }
                  required
                >
                  <option value="">
                    Select Tenant
                  </option>

                  {tenants
                    .filter(
                      (tenant) =>
                        tenant.status ===
                        'Active',
                    )
                    .map((tenant) => (
                      <option
                        key={tenant.id}
                        value={tenant.id}
                      >
                        {tenant.name}
                      </option>
                    ))}
                </select>

                <input
                  type="number"
                  placeholder="Invoice Amount (₹)"
                  className="modal-input"
                  value={invoiceAmount}
                  onChange={(e) =>
                    setInvoiceAmount(
                      e.target.value,
                    )
                  }
                  required
                />

                <input
                  type="text"
                  placeholder="Billing Month"
                  className="modal-input"
                  value={invoiceMonth}
                  onChange={(e) =>
                    setInvoiceMonth(
                      e.target.value,
                    )
                  }
                  required
                />

                <input
                  type="date"
                  className="modal-input"
                  value={invoiceDueDate}
                  onChange={(e) =>
                    setInvoiceDueDate(
                      e.target.value,
                    )
                  }
                  required
                />

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={closeModal}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={saving}
                  >
                    {saving
                      ? 'Saving...'
                      : 'Create Invoice'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <nav className="glass-nav">
        <button
          className={`nav-item ${
            activeTab === 'dashboard'
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setActiveTab('dashboard')
          }
        >
          <span className="nav-icon">⚡</span>
          <span className="nav-label">Home</span>
        </button>

        <button
          className={`nav-item ${
            activeTab === 'properties' ||
            activeTab === 'rooms'
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setActiveTab('properties')
          }
        >
          <span className="nav-icon">🏢</span>
          <span className="nav-label">Assets</span>
        </button>

        <button
          className={`nav-item ${
            activeTab === 'tenants'
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setActiveTab('tenants')
          }
        >
          <span className="nav-icon">👥</span>
          <span className="nav-label">Tenants</span>
        </button>

        <button
          className={`nav-item ${
            activeTab === 'payments' ||
            activeTab === 'invoices'
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setActiveTab('payments')
          }
        >
          <span className="nav-icon">💳</span>
          <span className="nav-label">Ledger</span>
        </button>

        <button
          className={`nav-item ${
            activeTab === 'analytics'
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setActiveTab('analytics')
          }
        >
          <span className="nav-icon">📈</span>
          <span className="nav-label">Insights</span>
        </button>
      </nav>
    </div>
  );
}

ReactDOM.createRoot(
  document.getElementById('root')!,
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```
