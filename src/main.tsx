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
  occupancy_rate?: number;
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
  property_id: number;
  property_name?: string;
  room_id?: number;
  room_number?: string;
  bed_id?: number;
  bed_number?: string;
  monthly_rent: number;
  due_date: number;
  deposit_amount?: number;
  move_in_date?: string;
  move_out_date?: string;
  status: string;
}

interface Payment {
  id: number;
  tenant_id: number;
  tenant_name?: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  payment_month: string;
  notes?: string;
  property_name?: string;
  room_number?: string;
}

interface Invoice {
  id: number;
  invoice_number: string;
  tenant_id: number;
  tenant_name?: string;
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

const currentMonthName = () =>
  new Date().toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

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
    currentMonthName(),
  );
  const [paymentDate, setPaymentDate] = useState(today());

  const [invoiceTenantId, setInvoiceTenantId] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceMonth, setInvoiceMonth] = useState(
    currentMonthName(),
  );
  const [invoiceDueDate, setInvoiceDueDate] = useState(today());

  const apiRequest = async <T,>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<T> => {
    const response = await fetch(`${API}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.error || `Request failed: ${response.status}`,
      );
    }

    return data as T;
  };

  /*
   * Load every data source independently.
   *
   * Previously Promise.all() meant that if even one endpoint
   * failed, all data stayed empty. Promise.allSettled() lets
   * Peacely display everything that successfully loaded.
   */
  const loadAllData = async () => {
    setLoading(true);
    setError('');

    const results = await Promise.allSettled([
      apiRequest<Property[]>('/properties'),
      apiRequest<Room[]>('/rooms'),
      apiRequest<Bed[]>('/beds'),
      apiRequest<Tenant[]>('/tenants'),
      apiRequest<Payment[]>('/payments'),
      apiRequest<Invoice[]>('/invoices'),
    ]);

    const [
      propertyResult,
      roomResult,
      bedResult,
      tenantResult,
      paymentResult,
      invoiceResult,
    ] = results;

    const errors: string[] = [];

    if (propertyResult.status === 'fulfilled') {
      setProperties(propertyResult.value || []);
    } else {
      setProperties([]);

      errors.push(
        propertyResult.reason instanceof Error
          ? `Properties: ${propertyResult.reason.message}`
          : 'Properties failed to load.',
      );
    }

    if (roomResult.status === 'fulfilled') {
      setRooms(roomResult.value || []);
    } else {
      setRooms([]);

      errors.push(
        roomResult.reason instanceof Error
          ? `Rooms: ${roomResult.reason.message}`
          : 'Rooms failed to load.',
      );
    }

    if (bedResult.status === 'fulfilled') {
      setBeds(bedResult.value || []);
    } else {
      setBeds([]);

      errors.push(
        bedResult.reason instanceof Error
          ? `Beds: ${bedResult.reason.message}`
          : 'Beds failed to load.',
      );
    }

    if (tenantResult.status === 'fulfilled') {
      setTenants(tenantResult.value || []);
    } else {
      setTenants([]);

      errors.push(
        tenantResult.reason instanceof Error
          ? `Tenants: ${tenantResult.reason.message}`
          : 'Tenants failed to load.',
      );
    }

    if (paymentResult.status === 'fulfilled') {
      setPayments(paymentResult.value || []);
    } else {
      setPayments([]);

      errors.push(
        paymentResult.reason instanceof Error
          ? `Payments: ${paymentResult.reason.message}`
          : 'Payments failed to load.',
      );
    }

    if (invoiceResult.status === 'fulfilled') {
      setInvoices(invoiceResult.value || []);
    } else {
      setInvoices([]);

      errors.push(
        invoiceResult.reason instanceof Error
          ? `Invoices: ${invoiceResult.reason.message}`
          : 'Invoices failed to load.',
      );
    }

    if (errors.length > 0) {
      console.error('Peacely loading errors:', errors);
      setError(errors.join(' • '));
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAllData();
  }, []);

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
    setPaymentMonth(currentMonthName());
    setPaymentDate(today());

    setInvoiceTenantId('');
    setInvoiceAmount('');
    setInvoiceMonth(currentMonthName());
    setInvoiceDueDate(today());
  };

  const closeModal = () => {
    if (!saving) {
      setActiveModal('none');
      setError('');
    }
  };

  const handleCreateProperty = async (
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (!propName.trim()) {
      setError('Property name is required.');
      return;
    }

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
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (!roomPropertyId || !roomNumber.trim()) {
      setError(
        'Select a property and enter a room number.',
      );
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
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (!bedRoomId || !bedNumber.trim()) {
      setError(
        'Select a room and enter a bed number.',
      );
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
    event: React.FormEvent,
  ) => {
    event.preventDefault();

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
          move_in_date: tenantMoveInDate || null,
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
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (
      !paymentTenantId ||
      !paymentAmount ||
      Number(paymentAmount) <= 0
    ) {
      setError(
        'Select a tenant and enter a valid amount.',
      );
      return;
    }

    setSaving(true);
    setError('');

    try {
      await apiRequest('/payments', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: Number(paymentTenantId),
          amount: Number(paymentAmount),
          payment_date: paymentDate,
          payment_method: paymentMethod,
          payment_month: paymentMonth,
        }),
      });

      resetForms();
      setActiveModal('none');
      await loadAllData();
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
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (
      !invoiceTenantId ||
      !invoiceAmount ||
      Number(invoiceAmount) <= 0
    ) {
      setError(
        'Select a tenant and enter a valid amount.',
      );
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

  const getTenantPaymentStatus = (
    tenant: Tenant,
  ): 'Paid' | 'Pending' | 'Overdue' => {
    const monthPayments = payments
      .filter(
        (payment) =>
          payment.tenant_id === tenant.id &&
          String(payment.payment_month || '')
            .trim()
            .toLowerCase() ===
            currentMonthName().trim().toLowerCase(),
      )
      .reduce(
        (sum, payment) =>
          sum + Number(payment.amount || 0),
        0,
      );

    const monthlyRent = Number(
      tenant.monthly_rent || 0,
    );

    if (
      monthlyRent > 0 &&
      monthPayments >= monthlyRent
    ) {
      return 'Paid';
    }

    const currentDay = new Date().getDate();

    if (
      currentDay >
      Number(tenant.due_date || 5)
    ) {
      return 'Overdue';
    }

    return 'Pending';
  };

  const sendWhatsAppReminder = (
    tenant: Tenant,
  ) => {
    let cleanPhone = tenant.phone.replace(
      /[^0-9]/g,
      '',
    );

    if (
      cleanPhone.length === 10
    ) {
      cleanPhone = `91${cleanPhone}`;
    }

    const message = encodeURIComponent(
      `Hello ${tenant.name},\n\nThis is a gentle reminder regarding your monthly rent payment of ${money(
        tenant.monthly_rent,
      )} for Room ${tenant.room_number || 'N/A'} at ${
        tenant.property_name || 'your property'
      }.\n\nYour rent is due on the ${tenant.due_date}th.\n\nThank you.`,
    );

    window.open(
      `https://wa.me/${cleanPhone}?text=${message}`,
      '_blank',
    );
  };

  const printReceipt = (
    payment: Payment,
  ) => {
    const tenant = tenants.find(
      (item) => item.id === payment.tenant_id,
    );

    const win = window.open('', '_blank');

    if (!win) {
      return;
    }

    win.document.write(`
      <html>
        <head>
          <title>Peacely Payment Receipt</title>

          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 40px;
              background: #f5f5f5;
              color: #111;
            }

            .card {
              max-width: 440px;
              margin: auto;
              background: white;
              padding: 32px;
              border-radius: 18px;
              border: 1px solid #ddd;
            }

            .brand {
              font-size: 28px;
              font-weight: 800;
              color: #10b981;
            }

            .subtitle {
              color: #777;
              font-size: 12px;
              margin-bottom: 24px;
            }

            .row {
              display: flex;
              justify-content: space-between;
              gap: 20px;
              padding: 10px 0;
              border-bottom: 1px solid #eee;
            }

            .label {
              color: #777;
            }

            .value {
              font-weight: 600;
              text-align: right;
            }

            .amount {
              margin-top: 24px;
              padding: 20px;
              background: #ecfdf5;
              border-radius: 14px;
              text-align: center;
            }

            .amount-label {
              color: #047857;
              font-size: 12px;
            }

            .amount-value {
              color: #065f46;
              font-size: 30px;
              font-weight: 800;
              margin-top: 6px;
            }

            .footer {
              text-align: center;
              margin-top: 25px;
              color: #888;
              font-size: 11px;
            }
          </style>
        </head>

        <body>
          <div class="card">
            <div class="brand">Peacely</div>

            <div class="subtitle">
              OFFICIAL RENT PAYMENT RECEIPT
            </div>

            <div class="row">
              <span class="label">Receipt ID</span>

              <span class="value">
                #REC-${payment.id}
              </span>
            </div>

            <div class="row">
              <span class="label">Tenant</span>

              <span class="value">
                ${
                  tenant?.name ||
                  payment.tenant_name ||
                  'Tenant'
                }
              </span>
            </div>

            <div class="row">
              <span class="label">Date</span>

              <span class="value">
                ${payment.payment_date}
              </span>
            </div>

            <div class="row">
              <span class="label">Month</span>

              <span class="value">
                ${payment.payment_month}
              </span>
            </div>

            <div class="row">
              <span class="label">Method</span>

              <span class="value">
                ${payment.payment_method}
              </span>
            </div>

            <div class="amount">
              <div class="amount-label">
                AMOUNT RECEIVED
              </div>

              <div class="amount-value">
                ${money(payment.amount)}
              </div>
            </div>

            <div class="footer">
              Thank you for your payment.<br />
              Generated by Peacely.
            </div>
          </div>

          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `);

    win.document.close();
  };

  /*
   * Active tenants are now detected case-insensitively.
   *
   * This fixes the dropdown problem when PostgreSQL returns
   * "active", "ACTIVE", "Active", etc.
   */
  const activeTenants = useMemo(
    () =>
      tenants.filter(
        (tenant) =>
          String(tenant.status || '')
            .trim()
            .toLowerCase() === 'active',
      ),
    [tenants],
  );

  const totalTenants =
    activeTenants.length;

  /*
   * Dashboard revenue is calculated directly from active
   * tenants instead of relying on the property SQL joins.
   * This prevents duplicated revenue caused by joins between
   * properties, rooms, beds and tenants.
   */
  const expectedRent = useMemo(
    () =>
      activeTenants.reduce(
        (sum, tenant) =>
          sum +
          Number(
            tenant.monthly_rent || 0,
          ),
        0,
      ),
    [activeTenants],
  );

  const totalRevenue = expectedRent;

  const totalBeds = useMemo(
    () => beds.length,
    [beds],
  );

  const occupiedBeds = useMemo(
    () =>
      beds.filter(
        (bed) =>
          Boolean(bed.is_occupied),
      ).length,
    [beds],
  );

  const totalOccupancy =
    totalBeds > 0
      ? Math.round(
          (occupiedBeds / totalBeds) *
            100,
        )
      : 0;

  const currentMonth =
    currentMonthName();

  const collectedThisMonth = useMemo(
    () =>
      payments
        .filter(
          (payment) =>
            String(
              payment.payment_month || '',
            )
              .trim()
              .toLowerCase() ===
            currentMonth
              .trim()
              .toLowerCase(),
        )
        .reduce(
          (sum, payment) =>
            sum +
            Number(
              payment.amount || 0,
            ),
          0,
        ),
    [payments, currentMonth],
  );

  const pendingDues = Math.max(
    expectedRent -
      collectedThisMonth,
    0,
  );

  const collectionRate =
    expectedRent > 0
      ? Math.min(
          Math.round(
            (collectedThisMonth /
              expectedRent) *
              100,
          ),
          100,
        )
      : 0;

  const filteredTenants =
    tenants.filter((tenant) => {
      const query =
        searchQuery
          .trim()
          .toLowerCase();

      const matchesSearch =
        tenant.name
          .toLowerCase()
          .includes(query) ||
        String(
          tenant.room_number || '',
        )
          .toLowerCase()
          .includes(query) ||
        String(
          tenant.property_name || '',
        )
          .toLowerCase()
          .includes(query);

      const paymentStatus =
        getTenantPaymentStatus(
          tenant,
        );

      const matchesStatus =
        statusFilter === 'All' ||
        paymentStatus ===
          statusFilter;

      return (
        matchesSearch &&
        matchesStatus
      );
    });

  const tenantRooms =
    rooms.filter(
      (room) =>
        !tenantPropertyId ||
        Number(room.property_id) ===
          Number(tenantPropertyId),
    );

  const tenantBeds =
    beds.filter(
      (bed) =>
        !tenantRoomId ||
        Number(bed.room_id) ===
          Number(tenantRoomId),
    );

  const availableBeds =
    tenantBeds.filter(
      (bed) =>
        !bed.is_occupied,
    );

  const selectedPaymentTenant =
    tenants.find(
      (tenant) =>
        tenant.id ===
        Number(paymentTenantId),
    );

  const selectedInvoiceTenant =
    tenants.find(
      (tenant) =>
        tenant.id ===
        Number(invoiceTenantId),
    );

  useEffect(() => {
    if (
      selectedPaymentTenant &&
      !paymentAmount
    ) {
      setPaymentAmount(
        String(
          selectedPaymentTenant.monthly_rent ||
            '',
        ),
      );
    }
  }, [
    selectedPaymentTenant,
    paymentAmount,
  ]);

  useEffect(() => {
    if (
      selectedInvoiceTenant &&
      !invoiceAmount
    ) {
      setInvoiceAmount(
        String(
          selectedInvoiceTenant.monthly_rent ||
            '',
        ),
      );
    }
  }, [
    selectedInvoiceTenant,
    invoiceAmount,
  ]);

  if (loading) {
    return (
      <div className="mobile-shell">
        <header className="app-header">
          <div className="brand-wrap">
            <div className="brand-logo">
              P
            </div>

            <div>
              <h1 className="brand-title">
                Peacely
              </h1>

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

            <div className="hero-value">
              Loading...
            </div>

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
          <div className="brand-logo">
            P
          </div>

          <div>
            <h1 className="brand-title">
              Peacely
            </h1>

            <p className="brand-subtitle">
              Asset Intelligence Platform
            </p>
          </div>
        </div>

        <button
          className="avatar-btn"
          onClick={() => {
            setError('');

            if (
              activeTenants.length ===
              0
            ) {
              setActiveTab(
                'tenants',
              );
              return;
            }

            setActiveModal(
              'recordPayment',
            );
          }}
        >
          <span className="plus-icon">
            +
          </span>

          Record
        </button>
      </header>

      {error && (
        <div
          style={{
            background:
              'rgba(244,63,94,0.12)',
            border:
              '1px solid rgba(244,63,94,0.3)',
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
        {activeTab ===
          'dashboard' && (
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
                <span>
                  {totalOccupancy}%
                  Occupancy
                </span>

                <span className="divider">
                  •
                </span>

                <span>
                  {totalTenants} Active
                  Tenants
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
                />
              </div>
            </div>

            <div className="metrics-grid">
              <div className="metric-tile">
                <div className="tile-icon">
                  📊
                </div>

                <div className="tile-value">
                  {collectionRate}%
                </div>

                <div className="tile-label">
                  Rent Collection
                </div>
              </div>

              <div className="metric-tile">
                <div className="tile-icon">
                  ⏳
                </div>

                <div className="tile-value">
                  {money(
                    pendingDues,
                  )}
                </div>

                <div className="tile-label">
                  Pending Dues
                </div>
              </div>

              <div className="metric-tile">
                <div className="tile-icon">
                  🏠
                </div>

                <div className="tile-value">
                  {properties.length}
                </div>

                <div className="tile-label">
                  Properties
                </div>
              </div>

              <div className="metric-tile">
                <div className="tile-icon">
                  👥
                </div>

                <div className="tile-value">
                  {totalTenants}
                </div>

                <div className="tile-label">
                  Active Tenants
                </div>
              </div>
            </div>

            <div className="section-heading">
              <div>
                <h2>
                  Quick Actions
                </h2>

                <p>
                  Manage your rental business
                </p>
              </div>
            </div>

            <div className="metrics-grid">
              <button
                className="metric-tile"
                onClick={() =>
                  setActiveModal(
                    'addProperty',
                  )
                }
              >
                <div className="tile-icon">
                  🏠
                </div>

                <div className="tile-label">
                  Add Property
                </div>
              </button>

              <button
                className="metric-tile"
                onClick={() =>
                  setActiveModal(
                    'addRoom',
                  )
                }
              >
                <div className="tile-icon">
                  🚪
                </div>

                <div className="tile-label">
                  Add Room
                </div>
              </button>

              <button
                className="metric-tile"
                onClick={() =>
                  setActiveModal(
                    'addTenant',
                  )
                }
              >
                <div className="tile-icon">
                  👤
                </div>

                <div className="tile-label">
                  Add Tenant
                </div>
              </button>

              <button
                className="metric-tile"
                onClick={() => {
                  setError('');

                  if (
                    activeTenants.length ===
                    0
                  ) {
                    setActiveTab(
                      'tenants',
                    );
                    return;
                  }

                  setActiveModal(
                    'recordPayment',
                  );
                }}
              >
                <div className="tile-icon">
                  ₹
                </div>

                <div className="tile-label">
                  Record Payment
                </div>
              </button>

              <button
                className="metric-tile"
                onClick={() => {
                  setError('');

                  if (
                    activeTenants.length ===
                    0
                  ) {
                    setActiveTab(
                      'tenants',
                    );
                    return;
                  }

                  setActiveModal(
                    'addInvoice',
                  );
                }}
              >
                <div className="tile-icon">
                  🧾
                </div>

                <div className="tile-label">
                  Create Invoice
                </div>
              </button>
            </div>

            <div className="section-heading">
              <div>
                <h2>
                  Properties
                </h2>

                <p>
                  Your rental portfolio
                </p>
              </div>

              <button
                className="text-button"
                onClick={() =>
                  setActiveTab(
                    'properties',
                  )
                }
              >
                View All
              </button>
            </div>

            {properties.length ===
            0 ? (
              <div className="glass-card">
                <div className="empty-state">
                  <div className="empty-icon">
                    🏠
                  </div>

                  <h3>
                    No properties yet
                  </h3>

                  <p>
                    Add your first property
                    to start using Peacely.
                  </p>

                  <button
                    className="btn-primary"
                    onClick={() =>
                      setActiveModal(
                        'addProperty',
                      )
                    }
                  >
                    Add Property
                  </button>
                </div>
              </div>
            ) : (
              properties
                .slice(0, 5)
                .map(
                  (property) => (
                    <div
                      className="glass-card"
                      key={property.id}
                    >
                      <div className="glass-header">
                        <div>
                          <h3>
                            {
                              property.name
                            }
                          </h3>

                          <p>
                            {property.address ||
                              'No address added'}
                          </p>
                        </div>

                        <span className="badge">
                          {Number(
                            property.bed_count ||
                              0,
                          )}{' '}
                          Beds
                        </span>
                      </div>

                      <div className="metrics-row">
                        <div>
                          <span>
                            Occupancy
                          </span>

                          <strong>
                            {Number(
                              property.bed_count ||
                                0,
                            ) > 0
                              ? Math.round(
                                  (Number(
                                    property.occupied_bed_count ||
                                      0,
                                  ) /
                                    Number(
                                      property.bed_count ||
                                        0,
                                    )) *
                                    100,
                                )
                              : 0}
                            %
                          </strong>
                        </div>

                        <div>
                          <span>
                            Monthly
                          </span>

                          <strong>
                            {money(
                              property.monthly_revenue ||
                                0,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Tenants
                          </span>

                          <strong>
                            {
                              property.tenant_count
                            }
                          </strong>
                        </div>
                      </div>
                    </div>
                  ),
                )
            )}
          </div>
        )}

        {activeTab ===
          'properties' && (
          <div className="view-container">
            <div className="section-heading">
              <div>
                <h2>
                  Properties
                </h2>

                <p>
                  Manage all your properties
                </p>
              </div>

              <button
                className="btn-primary"
                onClick={() =>
                  setActiveModal(
                    'addProperty',
                  )
                }
              >
                + Property
              </button>
            </div>

            <button
              className="btn-secondary"
              style={{
                width: '100%',
                marginBottom: '14px',
              }}
              onClick={() =>
                setActiveTab('rooms')
              }
            >
              🚪 Manage Rooms & Beds
            </button>

            {properties.map(
              (property) => (
                <div
                  className="glass-card"
                  key={property.id}
                >
                  <div className="glass-header">
                    <div>
                      <h3>
                        {property.name}
                      </h3>

                      <p>
                        {property.address}
                      </p>
                    </div>
                  </div>

                  <div className="metrics-row">
                    <div>
                      <span>
                        Rooms
                      </span>

                      <strong>
                        {
                          property.room_count
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Beds
                      </span>

                      <strong>
                        {property.bed_count ||
                          0}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Occupied
                      </span>

                      <strong>
                        {property.occupied_bed_count ||
                          0}
                      </strong>
                    </div>
                  </div>

                  <div className="glass-footer">
                    <span>
                      Monthly Revenue
                    </span>

                    <strong>
                      {money(
                        property.monthly_revenue ||
                          0,
                      )}
                    </strong>
                  </div>
                </div>
              ),
            )}

            {properties.length ===
              0 && (
              <div className="glass-card">
                <div className="empty-state">
                  <h3>
                    No properties
                  </h3>

                  <p>
                    Add your first property.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'rooms' && (
          <div className="view-container">
            <div className="section-heading">
              <div>
                <h2>
                  Rooms & Beds
                </h2>

                <p>
                  Manage rooms and available
                  beds
                </p>
              </div>

              <button
                className="btn-primary"
                onClick={() =>
                  setActiveModal(
                    'addRoom',
                  )
                }
              >
                + Room
              </button>
            </div>

            <button
              className="btn-secondary"
              style={{
                width: '100%',
                marginBottom: '14px',
              }}
              onClick={() =>
                setActiveModal(
                  'addBed',
                )
              }
            >
              + Add Bed
            </button>

            {rooms.map((room) => {
              const roomBeds =
                beds.filter(
                  (bed) =>
                    Number(
                      bed.room_id,
                    ) ===
                    Number(room.id),
                );

              return (
                <div
                  className="glass-card"
                  key={room.id}
                >
                  <div className="glass-header">
                    <div>
                      <h3>
                        Room{' '}
                        {room.room_number}
                      </h3>

                      <p>
                        {room.property_name ||
                          'Property'}
                        {' • '}
                        {room.sharing_type}
                      </p>
                    </div>

                    <span className="badge">
                      {roomBeds.length}{' '}
                      Beds
                    </span>
                  </div>

                  <div className="metrics-row">
                    <div>
                      <span>
                        Rent
                      </span>

                      <strong>
                        {money(
                          room.rent_amount,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Occupied
                      </span>

                      <strong>
                        {
                          roomBeds.filter(
                            (bed) =>
                              Boolean(
                                bed.is_occupied,
                              ),
                          ).length
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Available
                      </span>

                      <strong>
                        {
                          roomBeds.filter(
                            (bed) =>
                              !bed.is_occupied,
                          ).length
                        }
                      </strong>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px',
                      marginTop: '14px',
                    }}
                  >
                    {roomBeds.map(
                      (bed) => (
                        <span
                          key={bed.id}
                          className="badge"
                          style={{
                            opacity:
                              bed.is_occupied
                                ? 0.55
                                : 1,
                          }}
                        >
                          Bed{' '}
                          {
                            bed.bed_number
                          }{' '}
                          {bed.is_occupied
                            ? '• Occupied'
                            : '• Available'}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              );
            })}

            {rooms.length === 0 && (
              <div className="glass-card">
                <div className="empty-state">
                  <h3>
                    No rooms yet
                  </h3>

                  <p>
                    Add a room to start
                    creating beds.
                  </p>

                  <button
                    className="btn-primary"
                    onClick={() =>
                      setActiveModal(
                        'addRoom',
                      )
                    }
                  >
                    Add Room
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'tenants' && (
          <div className="view-container">
            <div className="section-heading">
              <div>
                <h2>
                  Tenants
                </h2>

                <p>
                  Manage residents and rent
                </p>
              </div>

              <button
                className="btn-primary"
                onClick={() =>
                  setActiveModal(
                    'addTenant',
                  )
                }
              >
                + Tenant
              </button>
            </div>

            <div className="filter-block">
              <input
                className="search-input"
                placeholder="Search tenant, room or property..."
                value={searchQuery}
                onChange={(event) =>
                  setSearchQuery(
                    event.target.value,
                  )
                }
              />

              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginTop: '10px',
                  overflowX: 'auto',
                }}
              >
                {[
                  'All',
                  'Paid',
                  'Pending',
                  'Overdue',
                ].map((status) => (
                  <button
                    key={status}
                    className="filter-pill"
                    style={{
                      opacity:
                        statusFilter ===
                        status
                          ? 1
                          : 0.55,
                    }}
                    onClick={() =>
                      setStatusFilter(
                        status as
                          | 'All'
                          | 'Paid'
                          | 'Pending'
                          | 'Overdue',
                      )
                    }
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {filteredTenants.map(
              (tenant) => {
                const paymentStatus =
                  getTenantPaymentStatus(
                    tenant,
                  );

                return (
                  <div
                    className="glass-card"
                    key={tenant.id}
                  >
                    <div className="avatar-title-wrap">
                      <div className="user-avatar">
                        {tenant.name
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div>
                        <h3>
                          {tenant.name}
                        </h3>

                        <p>
                          {tenant.property_name ||
                            'Property'}
                          {' • '}
                          Room{' '}
                          {tenant.room_number ||
                            'N/A'}
                        </p>
                      </div>

                      <span
                        className="badge"
                        style={{
                          marginLeft:
                            'auto',
                        }}
                      >
                        {
                          paymentStatus
                        }
                      </span>
                    </div>

                    <div className="metrics-row">
                      <div>
                        <span>
                          Monthly Rent
                        </span>

                        <strong>
                          {money(
                            tenant.monthly_rent,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Due Day
                        </span>

                        <strong>
                          {tenant.due_date}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Deposit
                        </span>

                        <strong>
                          {money(
                            tenant.deposit_amount ||
                              0,
                          )}
                        </strong>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        marginTop: '14px',
                      }}
                    >
                      <button
                        className="btn-secondary"
                        style={{
                          flex: 1,
                        }}
                        onClick={() =>
                          sendWhatsAppReminder(
                            tenant,
                          )
                        }
                      >
                        WhatsApp
                      </button>

                      <button
                        className="btn-primary"
                        style={{
                          flex: 1,
                        }}
                        onClick={() => {
                          setError('');
                          setPaymentTenantId(
                            String(
                              tenant.id,
                            ),
                          );
                          setPaymentAmount(
                            String(
                              tenant.monthly_rent ||
                                '',
                            ),
                          );
                          setActiveModal(
                            'recordPayment',
                          );
                        }}
                      >
                        Record Rent
                      </button>
                    </div>
                  </div>
                );
              },
            )}

            {filteredTenants.length ===
              0 && (
              <div className="glass-card">
                <div className="empty-state">
                  <h3>
                    No tenants found
                  </h3>

                  <p>
                    Try another search or add
                    a new tenant.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="view-container">
            <div className="section-heading">
              <div>
                <h2>
                  Payments
                </h2>

                <p>
                  Rent collection history
                </p>
              </div>

              <button
                className="btn-primary"
                onClick={() => {
                  setError('');

                  if (
                    activeTenants.length ===
                    0
                  ) {
                    setActiveTab(
                      'tenants',
                    );
                    return;
                  }

                  setActiveModal(
                    'recordPayment',
                  );
                }}
              >
                + Payment
              </button>
            </div>

            <div className="hero-card">
              <div className="hero-header">
                <span className="tag-light">
                  Collected This Month
                </span>
              </div>

              <div className="hero-value">
                {money(
                  collectedThisMonth,
                )}
              </div>

              <div className="hero-meta">
                {
                  payments.filter(
                    (payment) =>
                      String(
                        payment.payment_month ||
                          '',
                      )
                        .trim()
                        .toLowerCase() ===
                      currentMonth
                        .trim()
                        .toLowerCase(),
                  ).length
                }{' '}
                payments
              </div>
            </div>

            {payments.map(
              (payment) => (
                <div
                  className="glass-card"
                  key={payment.id}
                >
                  <div className="avatar-title-wrap">
                    <div className="user-avatar">
                      ₹
                    </div>

                    <div>
                      <h3>
                        {payment.tenant_name ||
                          tenants.find(
                            (tenant) =>
                              tenant.id ===
                              payment.tenant_id,
                          )?.name ||
                          'Tenant'}
                      </h3>

                      <p>
                        {
                          payment.payment_month
                        }{' '}
                        •{' '}
                        {
                          payment.payment_method
                        }
                      </p>
                    </div>

                    <div
                      className="amount-tag"
                      style={{
                        marginLeft:
                          'auto',
                      }}
                    >
                      {money(
                        payment.amount,
                      )}
                    </div>
                  </div>

                  <div className="glass-footer">
                    <span>
                      {payment.payment_date}
                    </span>

                    <button
                      className="text-button"
                      onClick={() =>
                        printReceipt(
                          payment,
                        )
                      }
                    >
                      Print Receipt
                    </button>
                  </div>
                </div>
              ),
            )}

            {payments.length === 0 && (
              <div className="glass-card">
                <div className="empty-state">
                  <h3>
                    No payments yet
                  </h3>

                  <p>
                    Recorded payments will
                    appear here.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'invoices' && (
          <div className="view-container">
            <div className="section-heading">
              <div>
                <h2>
                  Invoices
                </h2>

                <p>
                  Rent billing and dues
                </p>
              </div>

              <button
                className="btn-primary"
                onClick={() => {
                  setError('');

                  if (
                    activeTenants.length ===
                    0
                  ) {
                    setActiveTab(
                      'tenants',
                    );
                    return;
                  }

                  setActiveModal(
                    'addInvoice',
                  );
                }}
              >
                + Invoice
              </button>
            </div>

            {invoices.map(
              (invoice) => (
                <div
                  className="glass-card"
                  key={invoice.id}
                >
                  <div className="glass-header">
                    <div>
                      <h3>
                        {
                          invoice.invoice_number
                        }
                      </h3>

                      <p>
                        {invoice.tenant_name ||
                          tenants.find(
                            (tenant) =>
                              tenant.id ===
                              invoice.tenant_id,
                          )?.name ||
                          'Tenant'}
                      </p>
                    </div>

                    <span className="badge">
                      {invoice.status}
                    </span>
                  </div>

                  <div className="metrics-row">
                    <div>
                      <span>
                        Amount
                      </span>

                      <strong>
                        {money(
                          invoice.amount,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Month
                      </span>

                      <strong>
                        {invoice.month ||
                          '-'}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Due
                      </span>

                      <strong>
                        {invoice.due_date}
                      </strong>
                    </div>
                  </div>
                </div>
              ),
            )}

            {invoices.length === 0 && (
              <div className="glass-card">
                <div className="empty-state">
                  <h3>
                    No invoices yet
                  </h3>

                  <p>
                    Create an invoice for a
                    tenant.
                  </p>

                  <button
                    className="btn-primary"
                    onClick={() => {
                      if (
                        activeTenants.length ===
                        0
                      ) {
                        setActiveTab(
                          'tenants',
                        );
                        return;
                      }

                      setActiveModal(
                        'addInvoice',
                      );
                    }}
                  >
                    Create Invoice
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="view-container">
            <div className="section-heading">
              <div>
                <h2>
                  Analytics
                </h2>

                <p>
                  Your business at a glance
                </p>
              </div>
            </div>

            <div className="metrics-grid">
              <div className="metric-tile">
                <div className="tile-icon">
                  💰
                </div>

                <div className="tile-value">
                  {money(
                    totalRevenue,
                  )}
                </div>

                <div className="tile-label">
                  Monthly Revenue
                </div>
              </div>

              <div className="metric-tile">
                <div className="tile-icon">
                  📈
                </div>

                <div className="tile-value">
                  {collectionRate}%
                </div>

                <div className="tile-label">
                  Collection Rate
                </div>
              </div>

              <div className="metric-tile">
                <div className="tile-icon">
                  🛏️
                </div>

                <div className="tile-value">
                  {totalOccupancy}%
                </div>

                <div className="tile-label">
                  Occupancy
                </div>
              </div>

              <div className="metric-tile">
                <div className="tile-icon">
                  ⏰
                </div>

                <div className="tile-value">
                  {money(
                    pendingDues,
                  )}
                </div>

                <div className="tile-label">
                  Pending Dues
                </div>
              </div>
            </div>

            <div className="glass-card">
              <div className="glass-header">
                <div>
                  <h3>
                    Portfolio Summary
                  </h3>

                  <p>
                    Current database
                    statistics
                  </p>
                </div>
              </div>

              <div className="metrics-row">
                <div>
                  <span>
                    Properties
                  </span>

                  <strong>
                    {properties.length}
                  </strong>
                </div>

                <div>
                  <span>
                    Rooms
                  </span>

                  <strong>
                    {rooms.length}
                  </strong>
                </div>

                <div>
                  <span>
                    Beds
                  </span>

                  <strong>
                    {beds.length}
                  </strong>
                </div>
              </div>

              <div
                className="metrics-row"
                style={{
                  marginTop: '14px',
                }}
              >
                <div>
                  <span>
                    Active Tenants
                  </span>

                  <strong>
                    {totalTenants}
                  </strong>
                </div>

                <div>
                  <span>
                    Collected
                  </span>

                  <strong>
                    {money(
                      collectedThisMonth,
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Pending
                  </span>

                  <strong>
                    {money(
                      pendingDues,
                    )}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="glass-nav">
        <button
          className={`nav-item ${
            activeTab === 'dashboard'
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setActiveTab(
              'dashboard',
            )
          }
        >
          <span>⌂</span>

          <small>
            Home
          </small>
        </button>

        <button
          className={`nav-item ${
            activeTab === 'properties' ||
            activeTab === 'rooms'
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setActiveTab(
              'properties',
            )
          }
        >
          <span>🏠</span>

          <small>
            Assets
          </small>
        </button>

        <button
          className={`nav-item ${
            activeTab === 'tenants'
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setActiveTab(
              'tenants',
            )
          }
        >
          <span>👥</span>

          <small>
            Tenants
          </small>
        </button>

        <button
          className={`nav-item ${
            activeTab === 'payments'
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setActiveTab(
              'payments',
            )
          }
        >
          <span>₹</span>

          <small>
            Payments
          </small>
        </button>

        <button
          className={`nav-item ${
            activeTab === 'invoices'
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setActiveTab(
              'invoices',
            )
          }
        >
          <span>🧾</span>

          <small>
            Invoices
          </small>
        </button>

        <button
          className={`nav-item ${
            activeTab === 'analytics'
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setActiveTab(
              'analytics',
            )
          }
        >
          <span>📊</span>

          <small>
            Analytics
          </small>
        </button>
      </nav>

      {activeModal !== 'none' && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeModal();
            }
          }}
        >
          <div className="modal-card">
            <div className="glass-header">
              <div>
                <h3>
                  {activeModal ===
                    'addProperty' &&
                    'Add Property'}

                  {activeModal ===
                    'addRoom' &&
                    'Add Room'}

                  {activeModal ===
                    'addBed' &&
                    'Add Bed'}

                  {activeModal ===
                    'addTenant' &&
                    'Add Tenant'}

                  {activeModal ===
                    'recordPayment' &&
                    'Record Payment'}

                  {activeModal ===
                    'addInvoice' &&
                    'Create Invoice'}
                </h3>

                <p>
                  Enter the details below
                </p>
              </div>

              <button
                className="btn-secondary"
                onClick={closeModal}
                disabled={saving}
              >
                ✕
              </button>
            </div>

            {activeModal ===
              'addProperty' && (
              <form
                onSubmit={
                  handleCreateProperty
                }
              >
                <input
                  className="modal-input"
                  placeholder="Property name"
                  value={propName}
                  onChange={(event) =>
                    setPropName(
                      event.target.value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  placeholder="Address"
                  value={propAddress}
                  onChange={(event) =>
                    setPropAddress(
                      event.target.value,
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
                      : 'Add Property'}
                  </button>
                </div>
              </form>
            )}

            {activeModal ===
              'addRoom' && (
              <form
                onSubmit={
                  handleCreateRoom
                }
              >
                <select
                  className="modal-input"
                  value={roomPropertyId}
                  onChange={(event) =>
                    setRoomPropertyId(
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    Select property
                  </option>

                  {properties.map(
                    (property) => (
                      <option
                        key={property.id}
                        value={
                          property.id
                        }
                      >
                        {property.name}
                      </option>
                    ),
                  )}
                </select>

                <input
                  className="modal-input"
                  placeholder="Room number"
                  value={roomNumber}
                  onChange={(event) =>
                    setRoomNumber(
                      event.target.value,
                    )
                  }
                />

                <select
                  className="modal-input"
                  value={sharingType}
                  onChange={(event) =>
                    setSharingType(
                      event.target.value,
                    )
                  }
                >
                  <option>
                    Single
                  </option>

                  <option>
                    Double
                  </option>

                  <option>
                    Triple
                  </option>

                  <option>
                    Four Sharing
                  </option>

                  <option>
                    Other
                  </option>
                </select>

                <input
                  className="modal-input"
                  type="number"
                  placeholder="Monthly room rent"
                  value={roomRent}
                  onChange={(event) =>
                    setRoomRent(
                      event.target.value,
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
                      : 'Add Room'}
                  </button>
                </div>
              </form>
            )}

            {activeModal ===
              'addBed' && (
              <form
                onSubmit={
                  handleCreateBed
                }
              >
                <select
                  className="modal-input"
                  value={bedRoomId}
                  onChange={(event) =>
                    setBedRoomId(
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    Select room
                  </option>

                  {rooms.map((room) => (
                    <option
                      key={room.id}
                      value={room.id}
                    >
                      {room.property_name ||
                        'Property'}{' '}
                      • Room{' '}
                      {
                        room.room_number
                      }
                    </option>
                  ))}
                </select>

                <input
                  className="modal-input"
                  placeholder="Bed number / name"
                  value={bedNumber}
                  onChange={(event) =>
                    setBedNumber(
                      event.target.value,
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
                      : 'Add Bed'}
                  </button>
                </div>
              </form>
            )}

            {activeModal ===
              'addTenant' && (
              <form
                onSubmit={
                  handleCreateTenant
                }
              >
                <input
                  className="modal-input"
                  placeholder="Tenant name"
                  value={tenantName}
                  onChange={(event) =>
                    setTenantName(
                      event.target.value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  placeholder="Phone number"
                  type="tel"
                  value={tenantPhone}
                  onChange={(event) =>
                    setTenantPhone(
                      event.target.value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  placeholder="Email (optional)"
                  type="email"
                  value={tenantEmail}
                  onChange={(event) =>
                    setTenantEmail(
                      event.target.value,
                    )
                  }
                />

                <select
                  className="modal-input"
                  value={tenantPropertyId}
                  onChange={(event) => {
                    setTenantPropertyId(
                      event.target.value,
                    );

                    setTenantRoomId(
                      '',
                    );

                    setTenantBedId(
                      '',
                    );
                  }}
                >
                  <option value="">
                    Select property
                  </option>

                  {properties.map(
                    (property) => (
                      <option
                        key={property.id}
                        value={
                          property.id
                        }
                      >
                        {property.name}
                      </option>
                    ),
                  )}
                </select>

                <select
                  className="modal-input"
                  value={tenantRoomId}
                  onChange={(event) => {
                    setTenantRoomId(
                      event.target.value,
                    );

                    setTenantBedId(
                      '',
                    );
                  }}
                  disabled={
                    !tenantPropertyId
                  }
                >
                  <option value="">
                    Select room
                  </option>

                  {tenantRooms.map(
                    (room) => (
                      <option
                        key={room.id}
                        value={room.id}
                      >
                        Room{' '}
                        {
                          room.room_number
                        }{' '}
                        •{' '}
                        {
                          room.sharing_type
                        }
                      </option>
                    ),
                  )}
                </select>

                <select
                  className="modal-input"
                  value={tenantBedId}
                  onChange={(event) =>
                    setTenantBedId(
                      event.target.value,
                    )
                  }
                  disabled={
                    !tenantRoomId
                  }
                >
                  <option value="">
                    Select available bed
                  </option>

                  {availableBeds.map(
                    (bed) => (
                      <option
                        key={bed.id}
                        value={bed.id}
                      >
                        Bed{' '}
                        {
                          bed.bed_number
                        }
                      </option>
                    ),
                  )}
                </select>

                <input
                  className="modal-input"
                  type="number"
                  placeholder="Monthly rent"
                  value={tenantRent}
                  onChange={(event) =>
                    setTenantRent(
                      event.target.value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Rent due day"
                  value={tenantDueDate}
                  onChange={(event) =>
                    setTenantDueDate(
                      event.target.value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  type="number"
                  placeholder="Security deposit"
                  value={tenantDeposit}
                  onChange={(event) =>
                    setTenantDeposit(
                      event.target.value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  type="date"
                  value={
                    tenantMoveInDate
                  }
                  onChange={(event) =>
                    setTenantMoveInDate(
                      event.target.value,
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

            {activeModal ===
              'recordPayment' && (
              <form
                onSubmit={
                  handleRecordPayment
                }
              >
                <select
                  className="modal-input"
                  value={paymentTenantId}
                  onChange={(event) => {
                    const selectedId =
                      event.target.value;

                    setPaymentTenantId(
                      selectedId,
                    );

                    const tenant =
                      activeTenants.find(
                        (item) =>
                          Number(
                            item.id,
                          ) ===
                          Number(
                            selectedId,
                          ),
                      );

                    if (tenant) {
                      setPaymentAmount(
                        String(
                          tenant.monthly_rent ||
                            '',
                        ),
                      );
                    } else {
                      setPaymentAmount(
                        '',
                      );
                    }
                  }}
                >
                  <option value="">
                    {activeTenants.length ===
                    0
                      ? 'No active tenants found'
                      : 'Select tenant'}
                  </option>

                  {activeTenants.map(
                    (tenant) => (
                      <option
                        key={tenant.id}
                        value={tenant.id}
                      >
                        {tenant.name} •{' '}
                        {money(
                          tenant.monthly_rent,
                        )}
                        {tenant.room_number
                          ? ` • Room ${tenant.room_number}`
                          : ''}
                      </option>
                    ),
                  )}
                </select>

                {activeTenants.length ===
                  0 && (
                  <p
                    style={{
                      fontSize: '12px',
                      opacity: 0.7,
                      marginTop: '-4px',
                      marginBottom: '12px',
                    }}
                  >
                    Add an active tenant first
                    from the Tenants section.
                  </p>
                )}

                <input
                  className="modal-input"
                  type="number"
                  min="1"
                  placeholder="Amount"
                  value={paymentAmount}
                  onChange={(event) =>
                    setPaymentAmount(
                      event.target.value,
                    )
                  }
                />

                <select
                  className="modal-input"
                  value={paymentMethod}
                  onChange={(event) =>
                    setPaymentMethod(
                      event.target.value,
                    )
                  }
                >
                  <option>
                    UPI
                  </option>

                  <option>
                    Cash
                  </option>

                  <option>
                    Bank Transfer
                  </option>

                  <option>
                    Card
                  </option>

                  <option>
                    Other
                  </option>
                </select>

                <input
                  className="modal-input"
                  type="date"
                  value={paymentDate}
                  onChange={(event) =>
                    setPaymentDate(
                      event.target.value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  placeholder="Payment month"
                  value={paymentMonth}
                  onChange={(event) =>
                    setPaymentMonth(
                      event.target.value,
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
                    disabled={
                      saving ||
                      activeTenants.length ===
                        0
                    }
                  >
                    {saving
                      ? 'Saving...'
                      : 'Record Payment'}
                  </button>
                </div>
              </form>
            )}

            {activeModal ===
              'addInvoice' && (
              <form
                onSubmit={
                  handleCreateInvoice
                }
              >
                <select
                  className="modal-input"
                  value={invoiceTenantId}
                  onChange={(event) => {
                    const selectedId =
                      event.target.value;

                    setInvoiceTenantId(
                      selectedId,
                    );

                    const tenant =
                      activeTenants.find(
                        (item) =>
                          Number(
                            item.id,
                          ) ===
                          Number(
                            selectedId,
                          ),
                      );

                    if (tenant) {
                      setInvoiceAmount(
                        String(
                          tenant.monthly_rent ||
                            '',
                        ),
                      );
                    } else {
                      setInvoiceAmount(
                        '',
                      );
                    }
                  }}
                >
                  <option value="">
                    {activeTenants.length ===
                    0
                      ? 'No active tenants found'
                      : 'Select tenant'}
                  </option>

                  {activeTenants.map(
                    (tenant) => (
                      <option
                        key={tenant.id}
                        value={tenant.id}
                      >
                        {tenant.name} •{' '}
                        {money(
                          tenant.monthly_rent,
                        )}
                        {tenant.room_number
                          ? ` • Room ${tenant.room_number}`
                          : ''}
                      </option>
                    ),
                  )}
                </select>

                {activeTenants.length ===
                  0 && (
                  <p
                    style={{
                      fontSize: '12px',
                      opacity: 0.7,
                      marginTop: '-4px',
                      marginBottom: '12px',
                    }}
                  >
                    Add an active tenant first
                    from the Tenants section.
                  </p>
                )}

                <input
                  className="modal-input"
                  type="number"
                  min="1"
                  placeholder="Invoice amount"
                  value={invoiceAmount}
                  onChange={(event) =>
                    setInvoiceAmount(
                      event.target.value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  placeholder="Billing month"
                  value={invoiceMonth}
                  onChange={(event) =>
                    setInvoiceMonth(
                      event.target.value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  type="date"
                  value={invoiceDueDate}
                  onChange={(event) =>
                    setInvoiceDueDate(
                      event.target.value,
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
                    disabled={
                      saving ||
                      activeTenants.length ===
                        0
                    }
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
