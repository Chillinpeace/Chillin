import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';

interface Owner {
  id: number;
  name: string;
  email: string;
  phone?: string;
  created_at?: string;
}

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
  | 'property'
  | 'room'
  | 'bed'
  | 'tenant'
  | 'payment'
  | 'invoice';

const API = '/api';

const money = (value: number) =>
  `₹${Number(value || 0).toLocaleString('en-IN')}`;

const today = () =>
  new Date().toISOString().slice(0, 10);

const currentMonthName = () =>
  new Date().toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error ||
        `Request failed: ${response.status}`,
    );
  }

  return data as T;
}

function App() {
  /*
   * =====================================================
   * AUTHENTICATION
   * =====================================================
   */

  const [authenticated, setAuthenticated] =
    useState<boolean | null>(null);

  const [owner, setOwner] =
    useState<Owner | null>(null);

  const [authMode, setAuthMode] =
    useState<'login' | 'signup'>('login');

  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authPassword, setAuthPassword] =
    useState('');

  const [authError, setAuthError] =
    useState('');

  const [authSaving, setAuthSaving] =
    useState(false);

  /*
   * =====================================================
   * APP DATA
   * =====================================================
   */

  const [activeTab, setActiveTab] =
    useState<Tab>('dashboard');

  const [properties, setProperties] =
    useState<Property[]>([]);

  const [rooms, setRooms] =
    useState<Room[]>([]);

  const [beds, setBeds] =
    useState<Bed[]>([]);

  const [tenants, setTenants] =
    useState<Tenant[]>([]);

  const [payments, setPayments] =
    useState<Payment[]>([]);

  const [invoices, setInvoices] =
    useState<Invoice[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const [activeModal, setActiveModal] =
    useState<Modal>('none');

  const [searchQuery, setSearchQuery] =
    useState('');

  /*
   * =====================================================
   * FORM DATA
   * =====================================================
   */

  const [propName, setPropName] =
    useState('');

  const [propAddress, setPropAddress] =
    useState('');

  const [roomPropertyId, setRoomPropertyId] =
    useState('');

  const [roomNumber, setRoomNumber] =
    useState('');

  const [sharingType, setSharingType] =
    useState('Single');

  const [roomRent, setRoomRent] =
    useState('');

  const [bedRoomId, setBedRoomId] =
    useState('');

  const [bedNumber, setBedNumber] =
    useState('');

  const [tenantName, setTenantName] =
    useState('');

  const [tenantPhone, setTenantPhone] =
    useState('');

  const [tenantEmail, setTenantEmail] =
    useState('');

  const [tenantPropertyId, setTenantPropertyId] =
    useState('');

  const [tenantRoomId, setTenantRoomId] =
    useState('');

  const [tenantBedId, setTenantBedId] =
    useState('');

  const [tenantRent, setTenantRent] =
    useState('');

  const [tenantDueDate, setTenantDueDate] =
    useState('5');

  const [tenantDeposit, setTenantDeposit] =
    useState('');

  const [tenantMoveInDate, setTenantMoveInDate] =
    useState(today());

  const [paymentTenantId, setPaymentTenantId] =
    useState('');

  const [paymentAmount, setPaymentAmount] =
    useState('');

  const [paymentMethod, setPaymentMethod] =
    useState('UPI');

  const [paymentMonth, setPaymentMonth] =
    useState(currentMonthName());

  const [paymentDate, setPaymentDate] =
    useState(today());

  const [invoiceTenantId, setInvoiceTenantId] =
    useState('');

  const [invoiceAmount, setInvoiceAmount] =
    useState('');

  const [invoiceMonth, setInvoiceMonth] =
    useState(currentMonthName());

  const [invoiceDueDate, setInvoiceDueDate] =
    useState(today());

  /*
   * =====================================================
   * LOAD DATA
   * =====================================================
   */

  const loadAllData = async () => {
    setLoading(true);
    setError('');

    const results =
      await Promise.allSettled([
        apiRequest<Property[]>(
          '/properties',
        ),
        apiRequest<Room[]>(
          '/rooms',
        ),
        apiRequest<Bed[]>(
          '/beds',
        ),
        apiRequest<Tenant[]>(
          '/tenants',
        ),
        apiRequest<Payment[]>(
          '/payments',
        ),
        apiRequest<Invoice[]>(
          '/invoices',
        ),
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

    if (
      propertyResult.status ===
      'fulfilled'
    ) {
      setProperties(
        propertyResult.value || [],
      );
    } else {
      setProperties([]);
      errors.push(
        `Properties: ${
          propertyResult.reason instanceof
          Error
            ? propertyResult.reason.message
            : 'Failed'
        }`,
      );
    }

    if (
      roomResult.status ===
      'fulfilled'
    ) {
      setRooms(
        roomResult.value || [],
      );
    } else {
      setRooms([]);
      errors.push(
        `Rooms: ${
          roomResult.reason instanceof
          Error
            ? roomResult.reason.message
            : 'Failed'
        }`,
      );
    }

    if (
      bedResult.status ===
      'fulfilled'
    ) {
      setBeds(
        bedResult.value || [],
      );
    } else {
      setBeds([]);
      errors.push(
        `Beds: ${
          bedResult.reason instanceof
          Error
            ? bedResult.reason.message
            : 'Failed'
        }`,
      );
    }

    if (
      tenantResult.status ===
      'fulfilled'
    ) {
      setTenants(
        tenantResult.value || [],
      );
    } else {
      setTenants([]);
      errors.push(
        `Tenants: ${
          tenantResult.reason instanceof
          Error
            ? tenantResult.reason.message
            : 'Failed'
        }`,
      );
    }

    if (
      paymentResult.status ===
      'fulfilled'
    ) {
      setPayments(
        paymentResult.value || [],
      );
    } else {
      setPayments([]);
      errors.push(
        `Payments: ${
          paymentResult.reason instanceof
          Error
            ? paymentResult.reason.message
            : 'Failed'
        }`,
      );
    }

    if (
      invoiceResult.status ===
      'fulfilled'
    ) {
      setInvoices(
        invoiceResult.value || [],
      );
    } else {
      setInvoices([]);
      errors.push(
        `Invoices: ${
          invoiceResult.reason instanceof
          Error
            ? invoiceResult.reason.message
            : 'Failed'
        }`,
      );
    }

    if (errors.length) {
      setError(errors.join(' • '));
    }

    setLoading(false);
  };

  /*
   * =====================================================
   * CHECK SESSION
   * =====================================================
   */

  useEffect(() => {
    const checkSession =
      async () => {
        try {
          const response =
            await fetch(
              `${API}/auth/me`,
              {
                credentials:
                  'include',
              },
            );

          const data =
            await response
              .json()
              .catch(() => null);

          if (
            response.ok &&
            data?.authenticated &&
            data?.owner
          ) {
            setOwner(data.owner);
            setAuthenticated(true);
            await loadAllData();
          } else {
            setOwner(null);
            setAuthenticated(false);
            setLoading(false);
          }
        } catch (err) {
          console.error(
            'Session check failed:',
            err,
          );

          setOwner(null);
          setAuthenticated(false);
          setLoading(false);
        }
      };

    checkSession();
  }, []);

  /*
   * =====================================================
   * LOGIN
   * =====================================================
   */

  const handleLogin = async (
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (
      !authEmail.trim() ||
      !authPassword
    ) {
      setAuthError(
        'Email and password are required.',
      );
      return;
    }

    setAuthSaving(true);
    setAuthError('');

    try {
      const response =
        await fetch(
          `${API}/auth/login`,
          {
            method: 'POST',
            credentials:
              'include',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              email:
                authEmail.trim(),
              password:
                authPassword,
            }),
          },
        );

      const data =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'Invalid email or password.',
        );
      }

      setOwner(data.owner);
      setAuthenticated(true);
      setAuthPassword('');
      setAuthError('');

      await loadAllData();
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Unable to log in.',
      );
    } finally {
      setAuthSaving(false);
    }
  };

  /*
   * =====================================================
   * SIGNUP
   * =====================================================
   */

  const handleSignup = async (
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (!authName.trim()) {
      setAuthError(
        'Name is required.',
      );
      return;
    }

    if (!authEmail.trim()) {
      setAuthError(
        'Email is required.',
      );
      return;
    }

    if (
      authPassword.length < 6
    ) {
      setAuthError(
        'Password must be at least 6 characters.',
      );
      return;
    }

    setAuthSaving(true);
    setAuthError('');

    try {
      const response =
        await fetch(
          `${API}/auth/signup`,
          {
            method: 'POST',
            credentials:
              'include',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              name:
                authName.trim(),
              email:
                authEmail.trim(),
              phone:
                authPhone.trim(),
              password:
                authPassword,
            }),
          },
        );

      const data =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'Unable to create account.',
        );
      }

      setOwner(data.owner);
      setAuthenticated(true);
      setAuthPassword('');
      setAuthError('');

      await loadAllData();
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Unable to create account.',
      );
    } finally {
      setAuthSaving(false);
    }
  };

  /*
   * =====================================================
   * LOGOUT
   * =====================================================
   */

  const handleLogout =
    async () => {
      try {
        await fetch(
          `${API}/auth/logout`,
          {
            method: 'POST',
            credentials:
              'include',
          },
        );
      } catch (err) {
        console.error(
          'Logout failed:',
          err,
        );
      }

      setOwner(null);
      setAuthenticated(false);

      setProperties([]);
      setRooms([]);
      setBeds([]);
      setTenants([]);
      setPayments([]);
      setInvoices([]);

      setActiveTab('dashboard');
      setError('');
    };

  /*
   * =====================================================
   * FORM RESET
   * =====================================================
   */

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
    setTenantMoveInDate(
      today(),
    );

    setPaymentTenantId('');
    setPaymentAmount('');
    setPaymentMethod('UPI');
    setPaymentMonth(
      currentMonthName(),
    );
    setPaymentDate(today());

    setInvoiceTenantId('');
    setInvoiceAmount('');
    setInvoiceMonth(
      currentMonthName(),
    );
    setInvoiceDueDate(
      today(),
    );
  };

  const closeModal = () => {
    if (!saving) {
      setActiveModal('none');
      setError('');
    }
  };

  /*
   * =====================================================
   * PROPERTY
   * =====================================================
   */

  const handleCreateProperty =
    async (
      event: React.FormEvent,
    ) => {
      event.preventDefault();

      if (!propName.trim()) {
        setError(
          'Property name is required.',
        );
        return;
      }

      setSaving(true);
      setError('');

      try {
        await apiRequest(
          '/properties',
          {
            method: 'POST',
            body: JSON.stringify({
              name:
                propName.trim(),
              address:
                propAddress.trim(),
            }),
          },
        );

        resetForms();
        closeModal();
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

  /*
   * =====================================================
   * ROOM
   * =====================================================
   */

  const handleCreateRoom =
    async (
      event: React.FormEvent,
    ) => {
      event.preventDefault();

      if (
        !roomPropertyId ||
        !roomNumber.trim()
      ) {
        setError(
          'Select a property and enter a room number.',
        );
        return;
      }

      setSaving(true);
      setError('');

      try {
        await apiRequest(
          '/rooms',
          {
            method: 'POST',
            body: JSON.stringify({
              property_id:
                Number(
                  roomPropertyId,
                ),
              room_number:
                roomNumber.trim(),
              sharing_type:
                sharingType,
              rent_amount:
                Number(
                  roomRent,
                ) || 0,
            }),
          },
        );

        resetForms();
        closeModal();
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

  /*
   * =====================================================
   * BED
   * =====================================================
   */

  const handleCreateBed =
    async (
      event: React.FormEvent,
    ) => {
      event.preventDefault();

      if (
        !bedRoomId ||
        !bedNumber.trim()
      ) {
        setError(
          'Select a room and enter a bed number.',
        );
        return;
      }

      setSaving(true);
      setError('');

      try {
        await apiRequest(
          '/beds',
          {
            method: 'POST',
            body: JSON.stringify({
              room_id:
                Number(bedRoomId),
              bed_number:
                bedNumber.trim(),
            }),
          },
        );

        resetForms();
        closeModal();
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

  /*
   * =====================================================
   * TENANT
   * =====================================================
   */

  const handleCreateTenant =
    async (
      event: React.FormEvent,
    ) => {
      event.preventDefault();

      if (
        !tenantName.trim() ||
        !tenantPhone.trim() ||
        !tenantPropertyId
      ) {
        setError(
          'Name, phone and property are required.',
        );
        return;
      }

      setSaving(true);
      setError('');

      try {
        await apiRequest(
          '/tenants',
          {
            method: 'POST',
            body: JSON.stringify({
              name:
                tenantName.trim(),
              phone:
                tenantPhone.trim(),
              email:
                tenantEmail.trim(),
              property_id:
                Number(
                  tenantPropertyId,
                ),
              room_id:
                tenantRoomId
                  ? Number(
                      tenantRoomId,
                    )
                  : null,
              bed_id:
                tenantBedId
                  ? Number(
                      tenantBedId,
                    )
                  : null,
              monthly_rent:
                Number(
                  tenantRent,
                ) || 0,
              due_date:
                Number(
                  tenantDueDate,
                ) || 5,
              deposit_amount:
                Number(
                  tenantDeposit,
                ) || 0,
              move_in_date:
                tenantMoveInDate ||
                null,
            }),
          },
        );

        resetForms();
        closeModal();
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

  /*
   * =====================================================
   * PAYMENT
   * =====================================================
   */

  const handleRecordPayment =
    async (
      event: React.FormEvent,
    ) => {
      event.preventDefault();

      if (
        !paymentTenantId ||
        !paymentAmount ||
        Number(paymentAmount) <=
          0
      ) {
        setError(
          'Select a tenant and enter a valid amount.',
        );
        return;
      }

      setSaving(true);
      setError('');

      try {
        await apiRequest(
          '/payments',
          {
            method: 'POST',
            body: JSON.stringify({
              tenant_id:
                Number(
                  paymentTenantId,
                ),
              amount:
                Number(
                  paymentAmount,
                ),
              payment_date:
                paymentDate,
              payment_method:
                paymentMethod,
              payment_month:
                paymentMonth,
            }),
          },
        );

        resetForms();
        closeModal();
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

  /*
   * =====================================================
   * INVOICE
   * =====================================================
   */

  const handleCreateInvoice =
    async (
      event: React.FormEvent,
    ) => {
      event.preventDefault();

      if (
        !invoiceTenantId ||
        !invoiceAmount ||
        Number(invoiceAmount) <=
          0
      ) {
        setError(
          'Select a tenant and enter a valid amount.',
        );
        return;
      }

      setSaving(true);
      setError('');

      try {
        await apiRequest(
          '/invoices',
          {
            method: 'POST',
            body: JSON.stringify({
              tenant_id:
                Number(
                  invoiceTenantId,
                ),
              amount:
                Number(
                  invoiceAmount,
                ),
              month:
                invoiceMonth,
              due_date:
                invoiceDueDate,
              status: 'Pending',
            }),
          },
        );

        resetForms();
        closeModal();
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

  /*
   * =====================================================
   * CALCULATIONS
   * =====================================================
   */

  const activeTenants =
    useMemo(
      () =>
        tenants.filter(
          (tenant) =>
            String(
              tenant.status || '',
            )
              .toLowerCase() ===
            'active',
        ),
      [tenants],
    );

  const expectedRent =
    activeTenants.reduce(
      (sum, tenant) =>
        sum +
        Number(
          tenant.monthly_rent || 0,
        ),
      0,
    );

  const occupiedBeds =
    beds.filter(
      (bed) =>
        Boolean(
          bed.is_occupied,
        ),
    ).length;

  const totalOccupancy =
    beds.length > 0
      ? Math.round(
          (occupiedBeds /
            beds.length) *
            100,
        )
      : 0;

  const currentMonth =
    currentMonthName();

  const collectedThisMonth =
    payments
      .filter(
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
      )
      .reduce(
        (sum, payment) =>
          sum +
          Number(
            payment.amount || 0,
          ),
        0,
      );

  const pendingDues =
    Math.max(
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

  const tenantRooms =
    rooms.filter(
      (room) =>
        !tenantPropertyId ||
        Number(
          room.property_id,
        ) ===
          Number(
            tenantPropertyId,
          ),
    );

  const tenantBeds =
    beds.filter(
      (bed) =>
        !tenantRoomId ||
        Number(
          bed.room_id,
        ) ===
          Number(
            tenantRoomId,
          ),
    );

  const availableBeds =
    tenantBeds.filter(
      (bed) =>
        !bed.is_occupied,
    );

  const filteredTenants =
    tenants.filter(
      (tenant) => {
        const query =
          searchQuery
            .trim()
            .toLowerCase();

        return (
          tenant.name
            .toLowerCase()
            .includes(query) ||
          String(
            tenant.phone || '',
          )
            .toLowerCase()
            .includes(query) ||
          String(
            tenant.room_number ||
              '',
          )
            .toLowerCase()
            .includes(query) ||
          String(
            tenant.property_name ||
              '',
          )
            .toLowerCase()
            .includes(query)
        );
      },
    );

  /*
   * =====================================================
   * WHATSAPP
   * =====================================================
   */

  const sendWhatsAppReminder =
    (tenant: Tenant) => {
      let phone =
        tenant.phone.replace(
          /[^0-9]/g,
          '',
        );

      if (phone.length === 10) {
        phone = `91${phone}`;
      }

      const message =
        encodeURIComponent(
          `Hello ${tenant.name},\n\nThis is a gentle reminder regarding your monthly rent of ${money(
            tenant.monthly_rent,
          )} for Room ${
            tenant.room_number ||
            'N/A'
          }.\n\nYour rent is due on the ${tenant.due_date}.\n\nThank you.`,
        );

      window.open(
        `https://wa.me/${phone}?text=${message}`,
        '_blank',
      );
    };

  /*
   * =====================================================
   * AUTH SCREEN
   * =====================================================
   */

  if (authenticated === null) {
    return (
      <div className="mobile-shell">
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: '420px',
              textAlign: 'center',
              padding: '35px 25px',
            }}
          >
            <div
              className="brand-logo"
              style={{
                margin:
                  '0 auto 16px',
              }}
            >
              P
            </div>

            <h1
              className="brand-title"
              style={{
                fontSize: '30px',
              }}
            >
              Peacely
            </h1>

            <p className="brand-subtitle">
              Checking your session...
            </p>

            <div
              style={{
                marginTop: '30px',
                opacity: 0.7,
              }}
            >
              Connecting securely
              to your account
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (authenticated === false) {
    return (
      <div className="mobile-shell">
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: '450px',
              padding: '30px 24px',
            }}
          >
            <div
              style={{
                textAlign: 'center',
                marginBottom: '25px',
              }}
            >
              <div
                className="brand-logo"
                style={{
                  margin:
                    '0 auto 15px',
                }}
              >
                P
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: '30px',
                }}
              >
                Peacely
              </h1>

              <p
                style={{
                  marginTop: '8px',
                  opacity: 0.65,
                }}
              >
                Property & Tenant
                Management
              </p>
            </div>

            {authError && (
              <div
                style={{
                  padding:
                    '12px 14px',
                  borderRadius:
                    '12px',
                  marginBottom:
                    '16px',
                  background:
                    'rgba(244,63,94,0.12)',
                  border:
                    '1px solid rgba(244,63,94,0.3)',
                  color:
                    '#fda4af',
                  fontSize:
                    '13px',
                }}
              >
                {authError}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: '8px',
                marginBottom:
                  '20px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setAuthMode(
                    'login',
                  );
                  setAuthError(
                    '',
                  );
                }}
                style={{
                  flex: 1,
                  padding:
                    '11px',
                  borderRadius:
                    '10px',
                  border:
                    '1px solid rgba(255,255,255,0.1)',
                  background:
                    authMode ===
                    'login'
                      ? 'rgba(16,185,129,0.18)'
                      : 'rgba(255,255,255,0.04)',
                  color:
                    'inherit',
                  cursor:
                    'pointer',
                  fontWeight: 700,
                }}
              >
                Log In
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthMode(
                    'signup',
                  );
                  setAuthError(
                    '',
                  );
                }}
                style={{
                  flex: 1,
                  padding:
                    '11px',
                  borderRadius:
                    '10px',
                  border:
                    '1px solid rgba(255,255,255,0.1)',
                  background:
                    authMode ===
                    'signup'
                      ? 'rgba(16,185,129,0.18)'
                      : 'rgba(255,255,255,0.04)',
                  color:
                    'inherit',
                  cursor:
                    'pointer',
                  fontWeight: 700,
                }}
              >
                Sign Up
              </button>
            </div>

            <form
              onSubmit={
                authMode ===
                'login'
                  ? handleLogin
                  : handleSignup
              }
            >
              {authMode ===
                'signup' && (
                <>
                  <input
                    className="modal-input"
                    placeholder="Full name"
                    value={authName}
                    onChange={(
                      e,
                    ) =>
                      setAuthName(
                        e.target
                          .value,
                      )
                    }
                    autoComplete="name"
                  />

                  <input
                    className="modal-input"
                    placeholder="Phone number (optional)"
                    value={authPhone}
                    onChange={(
                      e,
                    ) =>
                      setAuthPhone(
                        e.target
                          .value,
                      )
                    }
                    autoComplete="tel"
                  />
                </>
              )}

              <input
                className="modal-input"
                type="email"
                placeholder="Email address"
                value={authEmail}
                onChange={(e) =>
                  setAuthEmail(
                    e.target.value,
                  )
                }
                autoComplete="email"
              />

              <input
                className="modal-input"
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) =>
                  setAuthPassword(
                    e.target.value,
                  )
                }
                autoComplete={
                  authMode ===
                  'login'
                    ? 'current-password'
                    : 'new-password'
                }
              />

              <button
                className="btn-primary"
                type="submit"
                disabled={
                  authSaving
                }
                style={{
                  width:
                    '100%',
                  marginTop:
                    '8px',
                }}
              >
                {authSaving
                  ? 'Please wait...'
                  : authMode ===
                      'login'
                    ? 'Log In'
                    : 'Create Account'}
              </button>
            </form>

            <p
              style={{
                textAlign:
                  'center',
                marginTop:
                  '20px',
                fontSize:
                  '13px',
                opacity:
                  0.65,
              }}
            >
              {authMode ===
              'login'
                ? 'New to Peacely? Click Sign Up above.'
                : 'Already have an account? Click Log In above.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  /*
   * =====================================================
   * LOADING
   * =====================================================
   */

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
                Asset Intelligence
              </p>
            </div>
          </div>
        </header>

        <main
          className="content-area"
          style={{
            padding:
              '30px 20px',
          }}
        >
          <div className="hero-card">
            <div className="hero-header">
              <span className="tag-light">
                Connected
              </span>

              <span className="live-indicator">
                <span className="pulse-dot" />
                Live
              </span>
            </div>

            <div className="hero-value">
              Loading...
            </div>

            <div className="hero-meta">
              Loading your
              property data
            </div>
          </div>
        </main>
      </div>
    );
  }

  /*
   * =====================================================
   * MAIN APP
   * =====================================================
   */

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
              {owner?.name ||
                'Property Management'}
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '7px',
            alignItems: 'center',
          }}
        >
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
              } else {
                setActiveModal(
                  'payment',
                );
              }
            }}
          >
            + Record
          </button>

          <button
            type="button"
            onClick={
              handleLogout
            }
            style={{
              border:
                '1px solid rgba(255,255,255,0.12)',
              background:
                'rgba(255,255,255,0.05)',
              color:
                'inherit',
              borderRadius:
                '10px',
              padding:
                '9px 10px',
              cursor:
                'pointer',
              fontSize:
                '12px',
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {error && (
        <div
          style={{
            margin:
              '12px 16px',
            padding:
              '12px 14px',
            borderRadius:
              '12px',
            background:
              'rgba(244,63,94,0.12)',
            border:
              '1px solid rgba(244,63,94,0.3)',
            color:
              '#fda4af',
            fontSize:
              '13px',
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
                  Monthly Revenue
                </span>

                <span className="live-indicator">
                  <span className="pulse-dot" />
                  Live
                </span>
              </div>

              <div className="hero-value">
                {money(
                  expectedRent,
                )}
              </div>

              <div className="hero-meta">
                <span>
                  {totalOccupancy}%
                  Occupancy
                </span>

                <span>
                  •
                </span>

                <span>
                  {
                    activeTenants.length
                  }{' '}
                  Active Tenants
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
                  {
                    collectionRate
                  }
                  %
                </div>
                <div className="tile-label">
                  Collection
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
                  {
                    properties.length
                  }
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
                  {
                    activeTenants.length
                  }
                </div>
                <div className="tile-label">
                  Tenants
                </div>
              </div>
            </div>

            <div className="section-heading">
              <div>
                <h2>
                  Quick Actions
                </h2>

                <p>
                  Manage your
                  rental business
                </p>
              </div>
            </div>

            <div className="metrics-grid">
              <button
                className="metric-tile"
                onClick={() =>
                  setActiveModal(
                    'property',
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
                    'room',
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
                    'bed',
                  )
                }
              >
                <div className="tile-icon">
                  🛏️
                </div>
                <div className="tile-label">
                  Add Bed
                </div>
              </button>

              <button
                className="metric-tile"
                onClick={() =>
                  setActiveModal(
                    'tenant',
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
                onClick={() =>
                  setActiveModal(
                    'payment',
                  )
                }
              >
                <div className="tile-icon">
                  ₹
                </div>
                <div className="tile-label">
                  Payment
                </div>
              </button>

              <button
                className="metric-tile"
                onClick={() =>
                  setActiveModal(
                    'invoice',
                  )
                }
              >
                <div className="tile-icon">
                  🧾
                </div>
                <div className="tile-label">
                  Invoice
                </div>
              </button>
            </div>

            <div className="section-heading">
              <div>
                <h2>
                  Properties
                </h2>
                <p>
                  Your rental
                  portfolio
                </p>
              </div>
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
                    Add your first
                    property to
                    start using
                    Peacely.
                  </p>

                  <button
                    className="btn-primary"
                    onClick={() =>
                      setActiveModal(
                        'property',
                      )
                    }
                  >
                    Add Property
                  </button>
                </div>
              </div>
            ) : (
              properties.map(
                (
                  property,
                ) => (
                  <div
                    className="glass-card"
                    key={
                      property.id
                    }
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
                            'No address'}
                        </p>
                      </div>

                      <span className="badge">
                        {
                          property.bed_count ||
                          0
                        }{' '}
                        Beds
                      </span>
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
                          Occupied
                        </span>
                        <strong>
                          {
                            property.occupied_bed_count ||
                            0
                          }
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

                    <div className="glass-footer">
                      <span>
                        Monthly Revenue
                      </span>
                      <strong>
                        {money(
                          property.monthly_revenue,
                        )}
                      </strong>
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
                  Manage your
                  properties
                </p>
              </div>

              <button
                className="btn-primary"
                onClick={() =>
                  setActiveModal(
                    'property',
                  )
                }
              >
                + Property
              </button>
            </div>

            {properties.map(
              (
                property,
              ) => (
                <div
                  className="glass-card"
                  key={
                    property.id
                  }
                >
                  <div className="glass-header">
                    <div>
                      <h3>
                        {
                          property.name
                        }
                      </h3>
                      <p>
                        {
                          property.address
                        }
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
                        {
                          property.bed_count ||
                          0
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Occupied
                      </span>
                      <strong>
                        {
                          property.occupied_bed_count ||
                          0
                        }
                      </strong>
                    </div>
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
                    Add your first
                    property.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab ===
          'rooms' && (
          <div className="view-container">
            <div className="section-heading">
              <div>
                <h2>
                  Rooms & Beds
                </h2>
                <p>
                  Manage rooms
                  and beds
                </p>
              </div>
            </div>

            <div className="metrics-grid">
              <button
                className="metric-tile"
                onClick={() =>
                  setActiveModal(
                    'room',
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
                    'bed',
                  )
                }
              >
                <div className="tile-icon">
                  🛏️
                </div>
                <div className="tile-label">
                  Add Bed
                </div>
              </button>
            </div>

            {rooms.map(
              (room) => (
                <div
                  className="glass-card"
                  key={room.id}
                >
                  <div className="glass-header">
                    <div>
                      <h3>
                        Room{' '}
                        {
                          room.room_number
                        }
                      </h3>

                      <p>
                        {
                          room.property_name
                        }
                      </p>
                    </div>

                    <span className="badge">
                      {
                        room.sharing_type
                      }
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
                        Beds
                      </span>
                      <strong>
                        {
                          room.bed_count ||
                          0
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Occupied
                      </span>
                      <strong>
                        {
                          room.occupied_bed_count ||
                          0
                        }
                      </strong>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop:
                        '15px',
                    }}
                  >
                    {beds
                      .filter(
                        (bed) =>
                          bed.room_id ===
                          room.id,
                      )
                      .map(
                        (
                          bed,
                        ) => (
                          <span
                            key={
                              bed.id
                            }
                            style={{
                              display:
                                'inline-block',
                              padding:
                                '7px 10px',
                              margin:
                                '4px',
                              borderRadius:
                                '8px',
                              background:
                                bed.is_occupied
                                  ? 'rgba(244,63,94,0.15)'
                                  : 'rgba(16,185,129,0.15)',
                              fontSize:
                                '12px',
                            }}
                          >
                            Bed{' '}
                            {
                              bed.bed_number
                            }{' '}
                            ·{' '}
                            {bed.is_occupied
                              ? 'Occupied'
                              : 'Available'}
                          </span>
                        ),
                      )}
                  </div>
                </div>
              ),
            )}
          </div>
        )}

        {activeTab ===
          'tenants' && (
          <div className="view-container">
            <div className="section-heading">
              <div>
                <h2>
                  Tenants
                </h2>
                <p>
                  Manage your
                  residents
                </p>
              </div>

              <button
                className="btn-primary"
                onClick={() =>
                  setActiveModal(
                    'tenant',
                  )
                }
              >
                + Tenant
              </button>
            </div>

            <input
              className="modal-input"
              placeholder="Search tenant, room or property..."
              value={
                searchQuery
              }
              onChange={(e) =>
                setSearchQuery(
                  e.target.value,
                )
              }
            />

            {filteredTenants.map(
              (
                tenant,
              ) => (
                <div
                  className="glass-card"
                  key={
                    tenant.id
                  }
                >
                  <div className="glass-header">
                    <div>
                      <h3>
                        {
                          tenant.name
                        }
                      </h3>

                      <p>
                        {tenant.phone}
                      </p>
                    </div>

                    <span className="badge">
                      {
                        tenant.status
                      }
                    </span>
                  </div>

                  <div className="metrics-row">
                    <div>
                      <span>
                        Property
                      </span>
                      <strong>
                        {
                          tenant.property_name ||
                          '-'
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Room
                      </span>
                      <strong>
                        {
                          tenant.room_number ||
                          '-'
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Rent
                      </span>
                      <strong>
                        {money(
                          tenant.monthly_rent,
                        )}
                      </strong>
                    </div>
                  </div>

                  <div
                    style={{
                      display:
                        'flex',
                      gap:
                        '8px',
                      marginTop:
                        '14px',
                    }}
                  >
                    <button
                      className="btn-secondary"
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
                      onClick={() => {
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
                          'payment',
                        );
                      }}
                    >
                      Payment
                    </button>
                  </div>
                </div>
              ),
            )}

            {filteredTenants.length ===
              0 && (
              <div className="glass-card">
                <div className="empty-state">
                  <h3>
                    No tenants
                  </h3>
                  <p>
                    Add your
                    first tenant.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab ===
          'payments' && (
          <div className="view-container">
            <div className="section-heading">
              <div>
                <h2>
                  Payments
                </h2>
                <p>
                  Rent collection
                  history
                </p>
              </div>

              <button
                className="btn-primary"
                onClick={() =>
                  setActiveModal(
                    'payment',
                  )
                }
              >
                + Payment
              </button>
            </div>

            {payments.map(
              (
                payment,
              ) => (
                <div
                  className="glass-card"
                  key={
                    payment.id
                  }
                >
                  <div className="glass-header">
                    <div>
                      <h3>
                        {
                          payment.tenant_name
                        }
                      </h3>

                      <p>
                        {
                          payment.payment_date
                        }
                      </p>
                    </div>

                    <strong>
                      {money(
                        payment.amount,
                      )}
                    </strong>
                  </div>

                  <div className="metrics-row">
                    <div>
                      <span>
                        Month
                      </span>
                      <strong>
                        {
                          payment.payment_month
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Method
                      </span>
                      <strong>
                        {
                          payment.payment_method
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Room
                      </span>
                      <strong>
                        {
                          payment.room_number ||
                          '-'
                        }
                      </strong>
                    </div>
                  </div>
                </div>
              ),
            )}

            {payments.length ===
              0 && (
              <div className="glass-card">
                <div className="empty-state">
                  <h3>
                    No payments
                  </h3>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab ===
          'invoices' && (
          <div className="view-container">
            <div className="section-heading">
              <div>
                <h2>
                  Invoices
                </h2>
                <p>
                  Rent invoices
                </p>
              </div>

              <button
                className="btn-primary"
                onClick={() =>
                  setActiveModal(
                    'invoice',
                  )
                }
              >
                + Invoice
              </button>
            </div>

            {invoices.map(
              (
                invoice,
              ) => (
                <div
                  className="glass-card"
                  key={
                    invoice.id
                  }
                >
                  <div className="glass-header">
                    <div>
                      <h3>
                        {
                          invoice.invoice_number
                        }
                      </h3>

                      <p>
                        {
                          invoice.tenant_name
                        }
                      </p>
                    </div>

                    <span className="badge">
                      {
                        invoice.status
                      }
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
                        {
                          invoice.month ||
                          '-'
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Due
                      </span>
                      <strong>
                        {
                          invoice.due_date
                        }
                      </strong>
                    </div>
                  </div>
                </div>
              ),
            )}

            {invoices.length ===
              0 && (
              <div className="glass-card">
                <div className="empty-state">
                  <h3>
                    No invoices
                  </h3>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab ===
          'analytics' && (
          <div className="view-container">
            <div className="section-heading">
              <div>
                <h2>
                  Analytics
                </h2>
                <p>
                  Business overview
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
                    expectedRent,
                  )}
                </div>
                <div className="tile-label">
                  Expected Rent
                </div>
              </div>

              <div className="metric-tile">
                <div className="tile-icon">
                  ✅
                </div>
                <div className="tile-value">
                  {money(
                    collectedThisMonth,
                  )}
                </div>
                <div className="tile-label">
                  Collected
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
                  Pending
                </div>
              </div>

              <div className="metric-tile">
                <div className="tile-icon">
                  🛏️
                </div>
                <div className="tile-value">
                  {
                    totalOccupancy
                  }
                  %
                </div>
                <div className="tile-label">
                  Occupancy
                </div>
              </div>
            </div>

            <div className="glass-card">
              <h3>
                Portfolio
                Summary
              </h3>

              <div
                className="metrics-row"
                style={{
                  marginTop:
                    '20px',
                }}
              >
                <div>
                  <span>
                    Properties
                  </span>
                  <strong>
                    {
                      properties.length
                    }
                  </strong>
                </div>

                <div>
                  <span>
                    Rooms
                  </span>
                  <strong>
                    {
                      rooms.length
                    }
                  </strong>
                </div>

                <div>
                  <span>
                    Beds
                  </span>
                  <strong>
                    {
                      beds.length
                    }
                  </strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      /*
       * =================================================
       * BOTTOM NAVIGATION
       * =================================================
       */

      <nav
        className="bottom-nav"
      >
        {(
          [
            [
              'dashboard',
              '⌂',
              'Home',
            ],
            [
              'properties',
              '🏠',
              'Properties',
            ],
            [
              'rooms',
              '🚪',
              'Rooms',
            ],
            [
              'tenants',
              '👥',
              'Tenants',
            ],
            [
              'payments',
              '₹',
              'Payments',
            ],
            [
              'invoices',
              '🧾',
              'Invoices',
            ],
            [
              'analytics',
              '📊',
              'Analytics',
            ],
          ] as [
            Tab,
            string,
            string,
          ][]
        ).map(
          ([
            tab,
            icon,
            label,
          ]) => (
            <button
              key={tab}
              className={
                activeTab ===
                tab
                  ? 'active'
                  : ''
              }
              onClick={() =>
                setActiveTab(tab)
              }
            >
              <span>
                {icon}
              </span>

              <small>
                {label}
              </small>
            </button>
          ),
        )}
      </nav>

      /*
       * =================================================
       * MODALS
       * =================================================
       */

      {activeModal !==
        'none' && (
        <div
          onClick={
            closeModal
          }
          style={{
            position:
              'fixed',
            inset: 0,
            zIndex: 1000,
            background:
              'rgba(0,0,0,0.72)',
            display: 'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            padding:
              '20px',
          }}
        >
          <div
            className="glass-card"
            onClick={(e) =>
              e.stopPropagation()
            }
            style={{
              width:
                '100%',
              maxWidth:
                '520px',
              maxHeight:
                '90vh',
              overflowY:
                'auto',
              padding:
                '24px',
            }}
          >
            {activeModal ===
              'property' && (
              <form
                onSubmit={
                  handleCreateProperty
                }
              >
                <h2>
                  Add Property
                </h2>

                <input
                  className="modal-input"
                  placeholder="Property name"
                  value={
                    propName
                  }
                  onChange={(
                    e,
                  ) =>
                    setPropName(
                      e.target
                        .value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  placeholder="Address"
                  value={
                    propAddress
                  }
                  onChange={(
                    e,
                  ) =>
                    setPropAddress(
                      e.target
                        .value,
                    )
                  }
                />

                <ModalButtons
                  saving={
                    saving
                  }
                  onCancel={
                    closeModal
                  }
                />
              </form>
            )}

            {activeModal ===
              'room' && (
              <form
                onSubmit={
                  handleCreateRoom
                }
              >
                <h2>
                  Add Room
                </h2>

                <select
                  className="modal-input"
                  value={
                    roomPropertyId
                  }
                  onChange={(
                    e,
                  ) =>
                    setRoomPropertyId(
                      e.target
                        .value,
                    )
                  }
                >
                  <option value="">
                    Select property
                  </option>

                  {properties.map(
                    (
                      property,
                    ) => (
                      <option
                        key={
                          property.id
                        }
                        value={
                          property.id
                        }
                      >
                        {
                          property.name
                        }
                      </option>
                    ),
                  )}
                </select>

                <input
                  className="modal-input"
                  placeholder="Room number"
                  value={
                    roomNumber
                  }
                  onChange={(
                    e,
                  ) =>
                    setRoomNumber(
                      e.target
                        .value,
                    )
                  }
                />

                <select
                  className="modal-input"
                  value={
                    sharingType
                  }
                  onChange={(
                    e,
                  ) =>
                    setSharingType(
                      e.target
                        .value,
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
                  placeholder="Monthly rent"
                  value={
                    roomRent
                  }
                  onChange={(
                    e,
                  ) =>
                    setRoomRent(
                      e.target
                        .value,
                    )
                  }
                />

                <ModalButtons
                  saving={
                    saving
                  }
                  onCancel={
                    closeModal
                  }
                />
              </form>
            )}

            {activeModal ===
              'bed' && (
              <form
                onSubmit={
                  handleCreateBed
                }
              >
                <h2>
                  Add Bed
                </h2>

                <select
                  className="modal-input"
                  value={
                    bedRoomId
                  }
                  onChange={(
                    e,
                  ) =>
                    setBedRoomId(
                      e.target
                        .value,
                    )
                  }
                >
                  <option value="">
                    Select room
                  </option>

                  {rooms.map(
                    (room) => (
                      <option
                        key={
                          room.id
                        }
                        value={
                          room.id
                        }
                      >
                        {
                          room.property_name
                        }{' '}
                        · Room{' '}
                        {
                          room.room_number
                        }
                      </option>
                    ),
                  )}
                </select>

                <input
                  className="modal-input"
                  placeholder="Bed number"
                  value={
                    bedNumber
                  }
                  onChange={(
                    e,
                  ) =>
                    setBedNumber(
                      e.target
                        .value,
                    )
                  }
                />

                <ModalButtons
                  saving={
                    saving
                  }
                  onCancel={
                    closeModal
                  }
                />
              </form>
            )}

            {activeModal ===
              'tenant' && (
              <form
                onSubmit={
                  handleCreateTenant
                }
              >
                <h2>
                  Add Tenant
                </h2>

                <input
                  className="modal-input"
                  placeholder="Tenant name"
                  value={
                    tenantName
                  }
                  onChange={(
                    e,
                  ) =>
                    setTenantName(
                      e.target
                        .value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  placeholder="Phone number"
                  value={
                    tenantPhone
                  }
                  onChange={(
                    e,
                  ) =>
                    setTenantPhone(
                      e.target
                        .value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  type="email"
                  placeholder="Email (optional)"
                  value={
                    tenantEmail
                  }
                  onChange={(
                    e,
                  ) =>
                    setTenantEmail(
                      e.target
                        .value,
                    )
                  }
                />

                <select
                  className="modal-input"
                  value={
                    tenantPropertyId
                  }
                  onChange={(
                    e,
                  ) => {
                    setTenantPropertyId(
                      e.target
                        .value,
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
                    (
                      property,
                    ) => (
                      <option
                        key={
                          property.id
                        }
                        value={
                          property.id
                        }
                      >
                        {
                          property.name
                        }
                      </option>
                    ),
                  )}
                </select>

                <select
                  className="modal-input"
                  value={
                    tenantRoomId
                  }
                  onChange={(
                    e,
                  ) => {
                    setTenantRoomId(
                      e.target
                        .value,
                    );
                    setTenantBedId(
                      '',
                    );
                  }}
                >
                  <option value="">
                    Select room
                  </option>

                  {tenantRooms.map(
                    (
                      room,
                    ) => (
                      <option
                        key={
                          room.id
                        }
                        value={
                          room.id
                        }
                      >
                        Room{' '}
                        {
                          room.room_number
                        }
                      </option>
                    ),
                  )}
                </select>

                <select
                  className="modal-input"
                  value={
                    tenantBedId
                  }
                  onChange={(
                    e,
                  ) =>
                    setTenantBedId(
                      e.target
                        .value,
                    )
                  }
                >
                  <option value="">
                    Select available bed
                  </option>

                  {availableBeds.map(
                    (
                      bed,
                    ) => (
                      <option
                        key={
                          bed.id
                        }
                        value={
                          bed.id
                        }
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
                  value={
                    tenantRent
                  }
                  onChange={(
                    e,
                  ) =>
                    setTenantRent(
                      e.target
                        .value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  type="number"
                  placeholder="Due day"
                  min="1"
                  max="31"
                  value={
                    tenantDueDate
                  }
                  onChange={(
                    e,
                  ) =>
                    setTenantDueDate(
                      e.target
                        .value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  type="number"
                  placeholder="Security deposit"
                  value={
                    tenantDeposit
                  }
                  onChange={(
                    e,
                  ) =>
                    setTenantDeposit(
                      e.target
                        .value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  type="date"
                  value={
                    tenantMoveInDate
                  }
                  onChange={(
                    e,
                  ) =>
                    setTenantMoveInDate(
                      e.target
                        .value,
                    )
                  }
                />

                <ModalButtons
                  saving={
                    saving
                  }
                  onCancel={
                    closeModal
                  }
                />
              </form>
            )}

            {activeModal ===
              'payment' && (
              <form
                onSubmit={
                  handleRecordPayment
                }
              >
                <h2>
                  Record Payment
                </h2>

                <select
                  className="modal-input"
                  value={
                    paymentTenantId
                  }
                  onChange={(
                    e,
                  ) => {
                    const id =
                      e.target
                        .value;

                    setPaymentTenantId(
                      id,
                    );

                    const tenant =
                      tenants.find(
                        (
                          item,
                        ) =>
                          item.id ===
                          Number(
                            id,
                          ),
                      );

                    if (
                      tenant
                    ) {
                      setPaymentAmount(
                        String(
                          tenant.monthly_rent ||
                            '',
                        ),
                      );
                    }
                  }}
                >
                  <option value="">
                    Select tenant
                  </option>

                  {activeTenants.map(
                    (
                      tenant,
                    ) => (
                      <option
                        key={
                          tenant.id
                        }
                        value={
                          tenant.id
                        }
                      >
                        {
                          tenant.name
                        }{' '}
                        ·{' '}
                        {money(
                          tenant.monthly_rent,
                        )}
                      </option>
                    ),
                  )}
                </select>

                <input
                  className="modal-input"
                  type="number"
                  placeholder="Amount"
                  value={
                    paymentAmount
                  }
                  onChange={(
                    e,
                  ) =>
                    setPaymentAmount(
                      e.target
                        .value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  type="date"
                  value={
                    paymentDate
                  }
                  onChange={(
                    e,
                  ) =>
                    setPaymentDate(
                      e.target
                        .value,
                    )
                  }
                />

                <select
                  className="modal-input"
                  value={
                    paymentMethod
                  }
                  onChange={(
                    e,
                  ) =>
                    setPaymentMethod(
                      e.target
                        .value,
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
                  placeholder="Payment month"
                  value={
                    paymentMonth
                  }
                  onChange={(
                    e,
                  ) =>
                    setPaymentMonth(
                      e.target
                        .value,
                    )
                  }
                />

                <ModalButtons
                  saving={
                    saving
                  }
                  onCancel={
                    closeModal
                  }
                />
              </form>
            )}

            {activeModal ===
              'invoice' && (
              <form
                onSubmit={
                  handleCreateInvoice
                }
              >
                <h2>
                  Create Invoice
                </h2>

                <select
                  className="modal-input"
                  value={
                    invoiceTenantId
                  }
                  onChange={(
                    e,
                  ) => {
                    const id =
                      e.target
                        .value;

                    setInvoiceTenantId(
                      id,
                    );

                    const tenant =
                      tenants.find(
                        (
                          item,
                        ) =>
                          item.id ===
                          Number(
                            id,
                          ),
                      );

                    if (
                      tenant
                    ) {
                      setInvoiceAmount(
                        String(
                          tenant.monthly_rent ||
                            '',
                        ),
                      );
                    }
                  }}
                >
                  <option value="">
                    Select tenant
                  </option>

                  {activeTenants.map(
                    (
                      tenant,
                    ) => (
                      <option
                        key={
                          tenant.id
                        }
                        value={
                          tenant.id
                        }
                      >
                        {
                          tenant.name
                        }
                      </option>
                    ),
                  )}
                </select>

                <input
                  className="modal-input"
                  type="number"
                  placeholder="Invoice amount"
                  value={
                    invoiceAmount
                  }
                  onChange={(
                    e,
                  ) =>
                    setInvoiceAmount(
                      e.target
                        .value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  placeholder="Month"
                  value={
                    invoiceMonth
                  }
                  onChange={(
                    e,
                  ) =>
                    setInvoiceMonth(
                      e.target
                        .value,
                    )
                  }
                />

                <input
                  className="modal-input"
                  type="date"
                  value={
                    invoiceDueDate
                  }
                  onChange={(
                    e,
                  ) =>
                    setInvoiceDueDate(
                      e.target
                        .value,
                    )
                  }
                />

                <ModalButtons
                  saving={
                    saving
                  }
                  onCancel={
                    closeModal
                  }
                />
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/*
 * =======================================================
 * MODAL BUTTONS
 * =======================================================
 */

function ModalButtons({
  saving,
  onCancel,
}: {
  saving: boolean;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '10px',
        marginTop: '20px',
      }}
    >
      <button
        type="button"
        className="btn-secondary"
        onClick={onCancel}
        disabled={saving}
        style={{
          flex: 1,
        }}
      >
        Cancel
      </button>

      <button
        type="submit"
        className="btn-primary"
        disabled={saving}
        style={{
          flex: 1,
        }}
      >
        {saving
          ? 'Saving...'
          : 'Save'}
      </button>
    </div>
  );
}

ReactDOM.createRoot(
  document.getElementById(
    'root',
  )!,
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
