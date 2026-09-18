import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';
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
  property_type?: string;
  rent_cycle?: string;
  room_count: number;
  bed_count?: number;
  occupied_bed_count?: number;
  tenant_count: number;
  occupancy_rate?: number;
  monthly_revenue: number;
}

interface PropertyLevel {
  id: number;
  property_id: number;
  building_name: string;
  floor_name: string;
  created_at?: string;
}

interface Room {
  id: number;
  property_id: number;
  room_number: string;
  sharing_type: string;
  room_type?: string;
  floor_name?: string;
  per_day_rent?: number;
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
  gender?: string;
  id_proof_type?: string;
  id_photo_front?: string;
  id_photo_back?: string;
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
  invoice_id?: number;
  invoice_number?: string;
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
  paid_amount?: number;
  balance_amount?: number;
  payment_percentage?: number;
  delivery_status?: string;
  created_at?: string;
  updated_at?: string;
  payment_provider?: string;
  payment_link_id?: string;
  payment_link_cf_id?: string;
  payment_link_url?: string;
  payment_link_status?: string;
  payment_link_created_at?: string;
  payment_link_paid_amount?: number;
}

interface OwnerPaymentDetails {
  upi_id: string;
  phone: string;
  qr_code_data: string;
  payment_instructions: string;
}

interface FinanceSummary {
  expected: number;
  collected: number;
  pending: number;
  overdue: number;
  invoice_count: number;
  paid_invoice_count: number;
  overdue_invoice_count: number;
  collection_rate: number;
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
  | 'floor'
  | 'room'
  | 'bed'
  | 'tenant'
  | 'payment'
  | 'invoice'
  | 'tenantDetails'
  | 'accountSettings';

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

const normalize = (value: unknown) =>
  String(value || '').trim().toLowerCase();

const formatDate = (value?: string) => {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) =>
      part[0]?.toUpperCase(),
    )
    .join('') || 'P';

async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `${API}${endpoint}`,
    {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    },
  );

  const data = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error ||
        `Request failed: ${response.status}`,
    );
  }

  return data as T;
}

function App() {
  const [authenticated, setAuthenticated] =
    useState<boolean | null>(null);

  const [owner, setOwner] =
    useState<Owner | null>(null);

  const [authMode, setAuthMode] =
    useState<'login' | 'signup'>('login');

  const [authName, setAuthName] =
    useState('');
  const [authEmail, setAuthEmail] =
    useState('');
  const [authPhone, setAuthPhone] =
    useState('');
  const [authPassword, setAuthPassword] =
    useState('');
  const [authError, setAuthError] =
    useState('');
  const [authSaving, setAuthSaving] =
    useState(false);

  const [activeTab, setActiveTab] =
    useState<Tab>('dashboard');

  const [properties, setProperties] =
    useState<Property[]>([]);
  const [rooms, setRooms] =
    useState<Room[]>([]);
  const [beds, setBeds] =
    useState<Bed[]>([]);
  const [propertyLevels, setPropertyLevels] =
    useState<PropertyLevel[]>([]);
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

  const [markingInvoiceId, setMarkingInvoiceId] =
    useState<number | null>(null);
  const [error, setError] =
    useState('');

  const [activeModal, setActiveModal] =
    useState<Modal>('none');

  const [selectedTenant, setSelectedTenant] =
    useState<Tenant | null>(null);

  const [searchQuery, setSearchQuery] =
    useState('');

  const [tenantFilter, setTenantFilter] =
    useState<
      'all' | 'paid' | 'pending' | 'overdue'
    >('all');

  const [paymentSearch, setPaymentSearch] =
    useState('');

  const [invoiceSearch, setInvoiceSearch] =
    useState('');

  const [propertyFilter, setPropertyFilter] =
    useState('');

  const [managedPropertyId, setManagedPropertyId] =
    useState<number | null>(null);

  const [propName, setPropName] =
    useState('');
  const [propAddress, setPropAddress] =
    useState('');
  const [propType, setPropType] =
    useState('Gents');
  const [rentCycle, setRentCycle] =
    useState('1st of every month');

  const [floorPropertyId, setFloorPropertyId] =
    useState('');
  const [floorName, setFloorName] =
    useState('');

  const [roomPropertyId, setRoomPropertyId] =
    useState('');
  const [roomNumber, setRoomNumber] =
    useState('');
  const [sharingType, setSharingType] =
    useState('Single');
  const [roomRent, setRoomRent] =
    useState('');
  const [roomType, setRoomType] =
    useState('Non AC');
  const [roomPerDayRent, setRoomPerDayRent] =
    useState('');
  const [roomFloorName, setRoomFloorName] =
    useState('Ground Floor');

  const [bedRoomId, setBedRoomId] =
    useState('');
  const [bedNumber, setBedNumber] =
    useState('');

  const [tenantName, setTenantName] =
    useState('');
  const [tenantPhone, setTenantPhone] =
    useState('');
  const [tenantGender, setTenantGender] =
    useState('');
  const [tenantIdProofType, setTenantIdProofType] =
    useState('');
  const [tenantIdPhotoFront, setTenantIdPhotoFront] =
    useState('');
  const [tenantIdPhotoBack, setTenantIdPhotoBack] =
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
  const [paymentInvoiceId, setPaymentInvoiceId] =
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

  const loadAllData = async () => {
    setLoading(true);
    setError('');

    const results =
      await Promise.allSettled([
        apiRequest<Property[]>('/properties'),
        apiRequest<Room[]>('/rooms'),
        apiRequest<Bed[]>('/beds'),
        apiRequest<Tenant[]>('/tenants'),
        apiRequest<Payment[]>('/payments'),
        apiRequest<Invoice[]>('/invoices'),
        apiRequest<PropertyLevel[]>('/nivaasi-upgrades/structure'),
      ]);

    const [
      propertyResult,
      roomResult,
      bedResult,
      tenantResult,
      paymentResult,
      invoiceResult,
      structureResult,
    ] = results;

    const errors: string[] = [];

    if (propertyResult.status === 'fulfilled') {
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

    if (roomResult.status === 'fulfilled') {
      setRooms(roomResult.value || []);
    } else {
      setRooms([]);

      errors.push(
        `Rooms: ${
          roomResult.reason instanceof Error
            ? roomResult.reason.message
            : 'Failed'
        }`,
      );
    }

    if (bedResult.status === 'fulfilled') {
      setBeds(bedResult.value || []);
    } else {
      setBeds([]);

      errors.push(
        `Beds: ${
          bedResult.reason instanceof Error
            ? bedResult.reason.message
            : 'Failed'
        }`,
      );
    }

    if (tenantResult.status === 'fulfilled') {
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

    if (paymentResult.status === 'fulfilled') {
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

    if (invoiceResult.status === 'fulfilled') {
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

    if (structureResult.status === 'fulfilled') {
      setPropertyLevels(structureResult.value || []);
    } else {
      setPropertyLevels([]);
      errors.push(
        `Property floors: ${structureResult.reason instanceof Error
          ? structureResult.reason.message
          : 'Failed'}`,
      );
    }

    if (errors.length) {
      setError(errors.join(' • '));
    }

    setLoading(false);
  };

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(
          `${API}/auth/me`,
          {
            credentials: 'include',
          },
        );

        const data = await response
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
      } catch {
        setOwner(null);
        setAuthenticated(false);
        setLoading(false);
      }
    };

    checkSession();
  }, []);

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
      const data =
        await apiRequest<{
          owner: Owner;
        }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: authEmail.trim(),
            password: authPassword,
          }),
        });

      setOwner(data.owner);
      setAuthenticated(true);
      setAuthPassword('');

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

  const handleSignup = async (
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (!authName.trim()) {
      setAuthError('Name is required.');
      return;
    }

    if (!authEmail.trim()) {
      setAuthError('Email is required.');
      return;
    }

    if (authPassword.length < 6) {
      setAuthError(
        'Password must be at least 6 characters.',
      );
      return;
    }

    setAuthSaving(true);
    setAuthError('');

    try {
      const data =
        await apiRequest<{
          owner: Owner;
        }>('/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            name: authName.trim(),
            email: authEmail.trim(),
            phone: authPhone.trim(),
            password: authPassword,
          }),
        });

      setOwner(data.owner);
      setAuthenticated(true);
      setAuthPassword('');

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

  const handleLogout = async () => {
    try {
      await fetch(
        `${API}/auth/logout`,
        {
          method: 'POST',
          credentials: 'include',
        },
      );
    } catch {}

    setOwner(null);
    setAuthenticated(false);

    setProperties([]);
    setRooms([]);
    setBeds([]);
    setPropertyLevels([]);
    setTenants([]);
    setPayments([]);
    setInvoices([]);

    setActiveTab('dashboard');
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      'Delete your Peacely account?\n\nAll your account information, properties, rooms, beds, tenants, tenant documents, payments, invoices, expenses, maintenance records, notifications and settings will be permanently deleted.\n\nThis action cannot be undone.\n\nAre you sure?',
    );

    if (!confirmed) return;

    try {
      await apiRequest('/auth/account', { method: 'DELETE' });

      setOwner(null);
      setAuthenticated(false);
      setProperties([]);
      setRooms([]);
      setBeds([]);
      setPropertyLevels([]);
      setTenants([]);
      setPayments([]);
      setInvoices([]);
      setActiveTab('dashboard');
      setActiveModal('none');
      setAuthMode('login');
      setAuthError('');
      setError('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to delete your account.',
      );
    }
  };


  const resetForms = () => {
    setPropName('');
    setPropAddress('');
    setPropType('Gents');
    setRentCycle('1st of every month');
    setFloorPropertyId('');
    setFloorName('');

    setRoomPropertyId('');
    setRoomNumber('');
    setSharingType('Single');
    setRoomRent('');
    setRoomType('Non AC');
    setRoomPerDayRent('');
    setRoomFloorName('Ground Floor');

    setBedRoomId('');
    setBedNumber('');

    setTenantName('');
    setTenantPhone('');
    setTenantGender('');
    setTenantIdProofType('');
    setTenantIdPhotoFront('');
    setTenantIdPhotoBack('');
    setTenantEmail('');
    setTenantPropertyId('');
    setTenantRoomId('');
    setTenantBedId('');
    setTenantRent('');
    setTenantDueDate('5');
    setTenantDeposit('');
    setTenantMoveInDate(today());

    setPaymentTenantId('');
    setPaymentInvoiceId('');
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
    setInvoiceDueDate(today());
  };

  const openModal = (modal: Modal) => {
    setError('');
    setActiveModal(modal);
  };

  /*
   * IMPORTANT:
   * Do not block modal closing while saving.
   *
   * Previously this function contained:
   * if (saving) return;
   *
   * That caused the payment modal to remain
   * open after a successful payment because
   * handleRecordPayment was still in the
   * saving=true state when closeModal() ran.
   */
  const closeModal = () => {
    setActiveModal('none');
    setSelectedTenant(null);
    setError('');
  };

  const handleCreateProperty = async (
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
      await apiRequest('/properties', {
        method: 'POST',
        body: JSON.stringify({
          name: propName.trim(),
          address: propAddress.trim(),
          property_type: propType,
          rent_cycle: rentCycle,
        }),
      });

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

  const handleCreateFloor = async (
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (!floorPropertyId || !floorName.trim()) {
      setError('Select a property and enter a floor name.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await apiRequest('/nivaasi-upgrades/structure', {
        method: 'POST',
        body: JSON.stringify({
          property_id: Number(floorPropertyId),
          building_name: 'Main Building',
          floor_name: floorName.trim(),
        }),
      });

      resetForms();
      setActiveModal('none');
      await loadAllData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to add floor.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveBed = async (bed: Bed) => {
    if (bed.is_occupied) {
      setError('Occupied beds cannot be removed.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await apiRequest(`/beds/${bed.id}`, {
        method: 'DELETE',
      });
      await loadAllData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to remove bed.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProperty = async (property: Property) => {
    if (!window.confirm(`Delete property "${property.name}"? This will also remove its rooms, beds and tenants.`)) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      await apiRequest(`/properties/${property.id}`, {
        method: 'DELETE',
      });
      setManagedPropertyId(null);
      await loadAllData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to delete property.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRoom = async (
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
      await apiRequest('/rooms', {
        method: 'POST',
        body: JSON.stringify({
          property_id:
            Number(roomPropertyId),
          room_number:
            roomNumber.trim(),
          sharing_type: sharingType,
          room_type: roomType,
          floor_name: roomFloorName || 'Ground Floor',
          per_day_rent: Number(roomPerDayRent) || 0,
          rent_amount:
            Number(roomRent) || 0,
        }),
      });

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

  const handleCreateBed = async (
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
      await apiRequest('/beds', {
        method: 'POST',
        body: JSON.stringify({
          room_id: Number(bedRoomId),
          bed_number:
            bedNumber.trim(),
        }),
      });

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

  const handleViewPaymentPage = (invoice: Invoice) => {
    // The server authenticates the owner, creates the secure payment token,
    // and redirects directly to the public payment page.
    window.location.assign(
      `${API}/payment-automation/invoices/${invoice.id}/payment-page`,
    );
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
        'Name, phone and property are required.',
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
          email: '',
          gender: tenantGender,
          id_proof_type: tenantIdProofType,
          id_photo_front: tenantIdPhotoFront,
          id_photo_back: tenantIdPhotoBack,
          property_id:
            Number(tenantPropertyId),
          room_id: tenantRoomId
            ? Number(tenantRoomId)
            : null,
          bed_id: tenantBedId
            ? Number(tenantBedId)
            : null,
          monthly_rent:
            Number(tenantRent) || 0,
          due_date:
            Number(tenantDueDate) || 5,
          deposit_amount:
            Number(tenantDeposit) || 0,
          move_in_date:
            tenantMoveInDate || null,
        }),
      });

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
   * FIXED PAYMENT HANDLER
   *
   * The payment is now:
   *
   * 1. Validated
   * 2. Sent to backend
   * 3. Backend confirms success
   * 4. Modal closes immediately
   * 5. Forms reset
   * 6. Data refreshes in background
   * 7. Saving is always released in finally
   */
  const handleRecordPayment = async (
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (!paymentTenantId) {
      setError(
        'Please select a tenant.',
      );
      return;
    }

    const amount = Number(
      paymentAmount,
    );

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setError(
        'Please enter a valid payment amount.',
      );
      return;
    }

    if (!paymentDate) {
      setError(
        'Please select a payment date.',
      );
      return;
    }

    if (!paymentMonth.trim()) {
      setError(
        'Please enter the payment month.',
      );
      return;
    }

    /*
     * If this payment is linked to an invoice,
     * validate the invoice before sending it.
     */
    if (paymentInvoiceId) {
      const invoice = invoices.find(
        (item) =>
          item.id ===
          Number(paymentInvoiceId),
      );

      if (!invoice) {
        setError(
          'Selected invoice could not be found.',
        );
        return;
      }

      if (
        normalize(invoice.status) ===
        'cancelled'
      ) {
        setError(
          'This invoice is cancelled and cannot receive a payment.',
        );
        return;
      }

      const invoiceAmount =
        Number(invoice.amount || 0);

      const paidAmount =
        Number(
          invoice.paid_amount || 0,
        );

      const balance = Math.max(
        Number(
          invoice.balance_amount ??
            invoiceAmount -
              paidAmount,
        ),
        0,
      );

      if (balance <= 0) {
        setError(
          'This invoice is already fully paid.',
        );
        return;
      }

      if (amount > balance) {
        setError(
          `Payment cannot be more than the invoice balance of ${money(
            balance,
          )}.`,
        );
        return;
      }
    }

    setSaving(true);
    setError('');

    try {
      const result =
        await apiRequest<{
          payment?: Payment;
          invoice?: Invoice;
          message?: string;
        }>('/payments', {
          method: 'POST',
          body: JSON.stringify({
            tenant_id:
              Number(paymentTenantId),
            amount,
            payment_date:
              paymentDate,
            payment_method:
              paymentMethod,
            payment_month:
              paymentMonth.trim(),
            invoice_id:
              paymentInvoiceId
                ? Number(
                    paymentInvoiceId,
                  )
                : null,
          }),
        });

      console.log(
        'Payment recorded successfully:',
        result,
      );

      /*
       * The backend has confirmed that
       * the payment was saved.
       *
       * Close the modal directly instead
       * of calling closeModal() while saving.
       */
      resetForms();
      setActiveModal('none');
      setSelectedTenant(null);
      setError('');

      /*
       * Refresh the dashboard, invoices,
       * payments and tenant balances.
       *
       * Even if the refresh has a temporary
       * problem, the payment itself is already
       * safely saved in the database.
       */
      loadAllData().catch((refreshError) => {
        console.error(
          'Payment saved but data refresh failed:',
          refreshError,
        );
      });
    } catch (err) {
      console.error(
        'Payment recording failed:',
        err,
      );

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
          tenant_id:
            Number(invoiceTenantId),
          amount:
            Number(invoiceAmount),
          month:
            invoiceMonth.trim(),
          due_date:
            invoiceDueDate,
          status: 'Pending',
        }),
      });

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

  const activeTenants = useMemo(
    () =>
      tenants.filter(
        (tenant) =>
          normalize(
            tenant.status,
          ) === 'active',
      ),
    [tenants],
  );

  const currentMonth =
    currentMonthName();

  const expectedRent =
    activeTenants.reduce(
      (sum, tenant) =>
        sum +
        Number(
          tenant.monthly_rent || 0,
        ),
      0,
    );

  const collectedThisMonth =
    payments
      .filter(
        (payment) =>
          normalize(
            payment.payment_month,
          ) === normalize(currentMonth),
      )
      .reduce(
        (sum, payment) =>
          sum +
          Number(
            payment.amount || 0,
          ),
        0,
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

  const occupiedBeds =
    beds.filter(
      (bed) =>
        Boolean(bed.is_occupied),
    ).length;

  const availableBedCount =
    beds.length - occupiedBeds;

  const totalOccupancy =
    beds.length > 0
      ? Math.round(
          (occupiedBeds /
            beds.length) *
            100,
        )
      : 0;

  const paymentTotalsByTenant =
    useMemo(() => {
      const totals: Record<
        number,
        number
      > = {};

      payments.forEach((payment) => {
        if (
          normalize(
            payment.payment_month,
          ) === normalize(currentMonth)
        ) {
          totals[payment.tenant_id] =
            (totals[
              payment.tenant_id
            ] || 0) +
            Number(
              payment.amount || 0,
            );
        }
      });

      return totals;
    }, [payments, currentMonth]);

  const getTenantPaid = (
    tenantId: number,
  ) =>
    Number(
      paymentTotalsByTenant[
        tenantId
      ] || 0,
    );

  const getTenantPending = (
    tenant: Tenant,
  ) =>
    Math.max(
      Number(
        tenant.monthly_rent || 0,
      ) -
        getTenantPaid(
          tenant.id,
        ),
      0,
    );

  const getTenantStatus = (
    tenant: Tenant,
  ):
    | 'paid'
    | 'pending'
    | 'overdue' => {
    const pending =
      getTenantPending(tenant);

    if (pending <= 0) {
      return 'paid';
    }

    const day =
      new Date().getDate();

    if (
      day >
      Number(
        tenant.due_date || 31,
      )
    ) {
      return 'overdue';
    }

    return 'pending';
  };

  const upcomingDues =
    useMemo(() => {
      const currentDay =
        new Date().getDate();

      return activeTenants
        .filter(
          (tenant) =>
            getTenantPending(
              tenant,
            ) > 0 &&
            Number(
              tenant.due_date || 31,
            ) >= currentDay,
        )
        .sort(
          (a, b) =>
            Number(
              a.due_date || 31,
            ) -
            Number(
              b.due_date || 31,
            ),
        )
        .slice(0, 5);
    }, [
      activeTenants,
      paymentTotalsByTenant,
    ]);

  const overdueTenants =
    useMemo(
      () =>
        activeTenants.filter(
          (tenant) =>
            getTenantStatus(
              tenant,
            ) === 'overdue',
        ),
      [
        activeTenants,
        paymentTotalsByTenant,
      ],
    );

  const recentPayments =
    useMemo(
      () =>
        [...payments]
          .sort(
            (a, b) =>
              new Date(
                b.payment_date,
              ).getTime() -
              new Date(
                a.payment_date,
              ).getTime(),
          )
          .slice(0, 6),
      [payments],
    );

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

  const handleMarkInvoicePaid = async (invoice: Invoice) => {
    if (normalize(invoice.status) === 'paid') return;

    const balance = Math.max(
      Number(invoice.balance_amount ?? Number(invoice.amount || 0) - Number(invoice.paid_amount || 0)),
      0,
    );

    if (balance <= 0) return;

    const confirmed = window.confirm(
      `Confirm that you received ${money(balance)} from ${invoice.tenant_name || 'this tenant'} for invoice ${invoice.invoice_number}?`,
    );

    if (!confirmed) return;

    setMarkingInvoiceId(invoice.id);
    setError('');

    try {
      await apiRequest(`/payment-automation/invoices/${invoice.id}/mark-paid`, {
        method: 'POST',
      });
      await loadAllData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not mark the invoice as paid.',
      );
    } finally {
      setMarkingInvoiceId(null);
    }
  };

  const filteredTenants =
    tenants.filter(
      (tenant) => {
        const query =
          normalize(searchQuery);

        const matchesSearch =
          !query ||
          normalize(
            tenant.name,
          ).includes(query) ||
          normalize(
            tenant.phone,
          ).includes(query) ||
          normalize(
            tenant.room_number,
          ).includes(query) ||
          normalize(
            tenant.property_name,
          ).includes(query);

        const status =
          getTenantStatus(
            tenant,
          );

        const matchesFilter =
          tenantFilter === 'all' ||
          status === tenantFilter;

        const matchesProperty =
          !propertyFilter ||
          Number(
            tenant.property_id,
          ) ===
            Number(
              propertyFilter,
            );

        return (
          matchesSearch &&
          matchesFilter &&
          matchesProperty
        );
      },
    );

  const filteredPayments =
    payments.filter(
      (payment) => {
        const query =
          normalize(paymentSearch);

        return (
          !query ||
          normalize(
            payment.tenant_name,
          ).includes(query) ||
          normalize(
            payment.property_name,
          ).includes(query) ||
          normalize(
            payment.room_number,
          ).includes(query) ||
          normalize(
            payment.payment_method,
          ).includes(query) ||
          normalize(
            payment.payment_month,
          ).includes(query) ||
          normalize(
            payment.invoice_number,
          ).includes(query)
        );
      },
    );

  const filteredInvoices =
    invoices.filter(
      (invoice) => {
        const query =
          normalize(invoiceSearch);

        return (
          !query ||
          normalize(
            invoice.invoice_number,
          ).includes(query) ||
          normalize(
            invoice.tenant_name,
          ).includes(query) ||
          normalize(
            invoice.month,
          ).includes(query) ||
          normalize(
            invoice.status,
          ).includes(query) ||
          normalize(
            invoice.delivery_status,
          ).includes(query)
        );
      },
    );

  const financeSummary =
    useMemo<FinanceSummary>(() => {
      const validInvoices =
        invoices.filter(
          (invoice) =>
            normalize(
              invoice.status,
            ) !== 'cancelled',
        );

      const expected =
        validInvoices.reduce(
          (sum, invoice) =>
            sum +
            Number(
              invoice.amount || 0,
            ),
          0,
        );

      const collected =
        validInvoices.reduce(
          (sum, invoice) =>
            sum +
            Number(
              invoice.paid_amount ||
                0,
            ),
          0,
        );

      const pending =
        validInvoices.reduce(
          (sum, invoice) =>
            sum +
            Math.max(
              Number(
                invoice.balance_amount ??
                  invoice.amount ??
                  0,
              ),
              0,
            ),
          0,
        );

      const overdue =
        validInvoices
          .filter(
            (invoice) =>
              normalize(
                invoice.status,
              ) === 'overdue',
          )
          .reduce(
            (sum, invoice) =>
              sum +
              Math.max(
                Number(
                  invoice.balance_amount ??
                    invoice.amount ??
                    0,
                ),
                0,
              ),
            0,
          );

      const paidInvoiceCount =
        validInvoices.filter(
          (invoice) =>
            normalize(
              invoice.status,
            ) === 'paid',
        ).length;

      const overdueInvoiceCount =
        validInvoices.filter(
          (invoice) =>
            normalize(
              invoice.status,
            ) === 'overdue',
        ).length;

      return {
        expected,
        collected,
        pending,
        overdue,
        invoice_count:
          validInvoices.length,
        paid_invoice_count:
          paidInvoiceCount,
        overdue_invoice_count:
          overdueInvoiceCount,
        collection_rate:
          expected > 0
            ? Math.min(
                Math.round(
                  (collected /
                    expected) *
                    100,
                ),
                100,
              )
            : 0,
      };
    }, [invoices]);

  const sendWhatsAppReminder = (
    tenant: Tenant,
  ) => {
    let phone =
      tenant.phone.replace(
        /[^0-9]/g,
        '',
      );

    if (phone.length === 10) {
      phone = `91${phone}`;
    }

    const pending =
      getTenantPending(tenant);

    const message =
      encodeURIComponent(
        `Hello ${tenant.name},\n\nThis is a gentle reminder regarding your monthly rent.\n\nRoom: ${
          tenant.room_number ||
          'N/A'
        }\nRent: ${money(
          tenant.monthly_rent,
        )}\nPaid: ${money(
          getTenantPaid(
            tenant.id,
          ),
        )}\nPending: ${money(
          pending,
        )}\nDue date: ${
          tenant.due_date
        }\n\nThank you.`,
      );

    window.open(
      `https://wa.me/${phone}?text=${message}`,
      '_blank',
    );
  };

  const sendInvoiceWhatsApp =
    async (
      invoice: Invoice,
    ) => {
      try {
        await apiRequest(
          `/invoices/${invoice.id}/sent`,
          {
            method: 'PATCH',
          },
        );

        const tenant =
          tenants.find(
            (item) =>
              item.id ===
              invoice.tenant_id,
          );

        if (!tenant) {
          throw new Error(
            'Tenant information not found.',
          );
        }

        const paymentPage =
          await apiRequest<{
            url: string;
          }>(
            `/payment-automation/invoices/${invoice.id}/payment-page`,
          );

        let phone =
          tenant.phone.replace(
            /[^0-9]/g,
            '',
          );

        if (phone.length === 10) {
          phone = `91${phone}`;
        }

        const paid =
          Number(
            invoice.paid_amount ||
              0,
          );

        const balance =
          Math.max(
            Number(
              invoice.balance_amount ??
                Number(
                  invoice.amount ||
                    0,
                ) -
                  paid,
            ),
            0,
          );

        const message =
          encodeURIComponent(
            `Hello ${tenant.name},\\n\\nHere is your rent invoice from Peacely.\\n\\nInvoice: ${
              invoice.invoice_number
            }\\nMonth: ${
              invoice.month || '-'
            }\\nAmount: ${money(
              invoice.amount,
            )}\\nPaid: ${money(
              paid,
            )}\\nBalance: ${money(
              balance,
            )}\\nDue date: ${formatDate(
              invoice.due_date,
            )}\\n\\nPay directly to the property owner using the UPI/phone/QR details here:\\n${paymentPage.url}\\n\\nAfter paying, inform the owner. The owner will confirm the payment in Peacely.`,
          );

        window.open(
          `https://wa.me/${phone}?text=${message}`,
          '_blank',
        );

        await loadAllData();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to send invoice.',
        );
      }
    };

  const openTenantDetails = (
    tenant: Tenant,
  ) => {
    setSelectedTenant(tenant);
    setActiveModal(
      'tenantDetails',
    );
  };

  const openPaymentForTenant = (
    tenant: Tenant,
  ) => {
    setPaymentTenantId(
      String(tenant.id),
    );

    setPaymentInvoiceId('');

    setPaymentAmount(
      String(
        getTenantPending(
          tenant,
        ) ||
          tenant.monthly_rent ||
          '',
      ),
    );

    setPaymentMonth(
      currentMonthName(),
    );

    setPaymentDate(today());

    setActiveModal('payment');
  };

  const openPaymentForInvoice = (
    invoice: Invoice,
  ) => {
    if (
      normalize(
        invoice.status,
      ) === 'cancelled'
    ) {
      setError(
        'Cancelled invoices cannot receive payments.',
      );
      return;
    }

    const invoiceAmount =
      Number(
        invoice.amount || 0,
      );

    const paidAmount =
      Number(
        invoice.paid_amount ||
          0,
      );

    const balance = Math.max(
      Number(
        invoice.balance_amount ??
          invoiceAmount -
            paidAmount,
      ),
      0,
    );

    if (balance <= 0) {
      setError(
        'This invoice is already fully paid.',
      );
      return;
    }

    setError('');

    setPaymentTenantId(
      String(invoice.tenant_id),
    );

    setPaymentInvoiceId(
      String(invoice.id),
    );

    setPaymentAmount(
      String(balance),
    );

    setPaymentMonth(
      invoice.month ||
        currentMonthName(),
    );

    setPaymentDate(today());

    setActiveModal('payment');
  };

  const getInvoiceBalance = (
    invoice: Invoice,
  ) =>
    Math.max(
      Number(
        invoice.balance_amount ??
          Number(
            invoice.amount || 0,
          ) -
            Number(
              invoice.paid_amount ||
                0,
            ),
      ),
      0,
    );

  const selectedTenantPayments =
    selectedTenant
      ? payments.filter(
          (payment) =>
            payment.tenant_id ===
            selectedTenant.id,
        )
      : [];

  if (authenticated === null) {
    return (
      <div className="mobile-shell auth-shell">
        <div className="auth-card glass-card">
          <div className="brand-logo auth-logo">
            P
          </div>

          <h1 className="auth-title">
            Peacely
          </h1>

          <p className="auth-subtitle">
            Checking your session...
          </p>

          <div className="auth-loader">
            Connecting securely
          </div>
        </div>
      </div>
    );
  }

  if (authenticated === false) {
    return (
      <div className="mobile-shell auth-shell">
        <div className="auth-card glass-card">
          <div className="auth-brand">
            <div className="brand-logo auth-logo">
              P
            </div>

            <h1>Peacely</h1>

            <p>
              Property & Tenant Management
            </p>
          </div>

          {authError && (
            <div className="error-box">
              {authError}
            </div>
          )}

          <div className="auth-tabs">
            <button
              className={
                authMode === 'login'
                  ? 'auth-tab active'
                  : 'auth-tab'
              }
              onClick={() => {
                setAuthMode(
                  'login',
                );
                setAuthError('');
              }}
            >
              Log In
            </button>

            <button
              className={
                authMode === 'signup'
                  ? 'auth-tab active'
                  : 'auth-tab'
              }
              onClick={() => {
                setAuthMode(
                  'signup',
                );
                setAuthError('');
              }}
            >
              Sign Up
            </button>
          </div>

          <form
            onSubmit={
              authMode === 'login'
                ? handleLogin
                : handleSignup
            }
          >
            {authMode === 'signup' && (
              <>
                <input
                  className="modal-input"
                  placeholder="Full name"
                  value={authName}
                  onChange={(e) =>
                    setAuthName(
                      e.target.value,
                    )
                  }
                  autoComplete="name"
                />

                <input
                  className="modal-input"
                  placeholder="Phone number"
                  value={authPhone}
                  onChange={(e) =>
                    setAuthPhone(
                      e.target.value,
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
                authMode === 'login'
                  ? 'current-password'
                  : 'new-password'
              }
            />

            <button
              className="btn-primary full-btn"
              type="submit"
              disabled={authSaving}
            >
              {authSaving
                ? 'Please wait...'
                : authMode === 'login'
                  ? 'Log In'
                  : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mobile-shell">
        <Header
        owner={owner}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
        onAccountSettings={() => openModal('accountSettings')}
      />

        <main className="content-area">
          <div className="hero-card">
            <div className="live-indicator">
              <span className="pulse-dot" />
              Loading
            </div>

            <div className="hero-value">
              Peacely
            </div>

            <div className="hero-meta">
              Loading your property data...
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="mobile-shell">
      <Header
        owner={owner}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
        onAccountSettings={() => openModal('accountSettings')}
      />

      {error && (
        <div className="error-box page-error">
          {error}
        </div>
      )}

      <main className="content-area">
        {activeTab === 'dashboard' && (
          <Dashboard
            expectedRent={expectedRent}
            collectedThisMonth={
              collectedThisMonth
            }
            pendingDues={
              pendingDues
            }
            collectionRate={
              collectionRate
            }
            totalOccupancy={
              totalOccupancy
            }
            activeTenants={
              activeTenants
            }
            occupiedBeds={
              occupiedBeds
            }
            availableBedCount={
              availableBedCount
            }
            properties={
              properties
            }
            upcomingDues={
              upcomingDues
            }
            overdueTenants={
              overdueTenants
            }
            recentPayments={
              recentPayments
            }
            getTenantPending={
              getTenantPending
            }
            getTenantPaid={
              getTenantPaid
            }
            openTenantDetails={
              openTenantDetails
            }
            openModal={
              openModal
            }
            setActiveTab={
              setActiveTab
            }
          />
        )}

        {activeTab === 'properties' && (
          <PropertiesView
            properties={
              properties
            }
            rooms={rooms}
            beds={beds}
            propertyLevels={propertyLevels}
            managedPropertyId={managedPropertyId}
            setManagedPropertyId={setManagedPropertyId}
            openModal={
              openModal
            }
            setRoomPropertyId={setRoomPropertyId}
            setRoomFloorName={setRoomFloorName}
            setFloorPropertyId={setFloorPropertyId}
            removeBed={handleRemoveBed}
            deleteProperty={handleDeleteProperty}
          />
        )}

        {activeTab === 'tenants' && (
          <TenantsView
            tenants={
              filteredTenants
            }
            searchQuery={
              searchQuery
            }
            setSearchQuery={
              setSearchQuery
            }
            tenantFilter={
              tenantFilter
            }
            setTenantFilter={
              setTenantFilter
            }
            propertyFilter={
              propertyFilter
            }
            setPropertyFilter={
              setPropertyFilter
            }
            properties={
              properties
            }
            openModal={
              openModal
            }
            getTenantStatus={
              getTenantStatus
            }
            getTenantPaid={
              getTenantPaid
            }
            getTenantPending={
              getTenantPending
            }
            openTenantDetails={
              openTenantDetails
            }
          />
        )}

        {activeTab === 'payments' && (
          <PaymentsView
            payments={payments}
            search={paymentSearch}
            setSearch={setPaymentSearch}
          />
        )}

        {activeTab === 'invoices' && (
          <InvoicesView
            invoices={filteredInvoices}
            search={invoiceSearch}
            setSearch={setInvoiceSearch}
            getBalance={getInvoiceBalance}
            onMarkPaid={handleMarkInvoicePaid}
            markingInvoiceId={markingInvoiceId}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            properties={
              properties
            }
            rooms={rooms}
            beds={beds}
            tenants={
              activeTenants
            }
            expectedRent={
              financeSummary.invoice_count >
              0
                ? financeSummary.expected
                : expectedRent
            }
            collected={
              financeSummary.invoice_count >
              0
                ? financeSummary.collected
                : collectedThisMonth
            }
            pending={
              financeSummary.invoice_count >
              0
                ? financeSummary.pending
                : pendingDues
            }
            overdue={
              financeSummary.overdue
            }
            occupancy={
              totalOccupancy
            }
            collectionRate={
              financeSummary.invoice_count >
              0
                ? financeSummary.collection_rate
                : collectionRate
            }
          />
        )}
      </main>

      <BottomNav
        activeTab={
          activeTab
        }
        setActiveTab={
          setActiveTab
        }
      />

      {activeModal !== 'none' && (
        <ModalOverlay
          onClose={closeModal}
        >
          {activeModal ===
            'property' && (
            <form
              onSubmit={
                handleCreateProperty
              }
            >
              <ModalTitle
                title="Add Property"
                subtitle="Set up your property, rental cycle and property type."
              />

              <input
                className="modal-input"
                placeholder="Property name"
                value={propName}
                onChange={(e) =>
                  setPropName(e.target.value)
                }
              />

              <input
                className="modal-input"
                placeholder="Address"
                value={propAddress}
                onChange={(e) =>
                  setPropAddress(e.target.value)
                }
              />

              <select
                className="modal-input"
                value={propType}
                onChange={(e) =>
                  setPropType(e.target.value)
                }
              >
                <option value="Gents">Gents</option>
                <option value="Ladies">Ladies</option>
                <option value="Coliving">Coliving</option>
              </select>

              <select
                className="modal-input"
                value={rentCycle}
                onChange={(e) =>
                  setRentCycle(e.target.value)
                }
              >
                <option value="1st of every month">From 1st to 1st of every month</option>
                <option value="date of joining">From the date of joining</option>
              </select>

              <ModalButtons
                saving={saving}
                onCancel={closeModal}
              />
            </form>
          )}

          {activeModal ===
            'floor' && (
            <form
              onSubmit={handleCreateFloor}
            >
              <ModalTitle
                title="Add Floor"
                subtitle="Add a floor before adding rooms."
              />

              <select
                className="modal-input"
                value={floorPropertyId}
                onChange={(e) =>
                  setFloorPropertyId(e.target.value)
                }
              >
                <option value="">Select property</option>
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
                className="modal-input"
                placeholder="Floor name"
                value={floorName}
                onChange={(e) =>
                  setFloorName(e.target.value)
                }
              />

              <ModalButtons
                saving={saving}
                onCancel={closeModal}
              />
            </form>
          )}

          {activeModal ===
            'room' && (
            <form
              onSubmit={handleCreateRoom}
            >
              <ModalTitle
                title="Add Room"
                subtitle="Add a room inside the selected property."
              />

              <select
                className="modal-input"
                value={roomPropertyId}
                onChange={(e) => {
                  const propertyId = e.target.value;
                  setRoomPropertyId(propertyId);
                  const firstFloor =
                    propertyLevels
                      .find((level) => level.property_id === Number(propertyId))
                      ?.floor_name ||
                    rooms
                      .find((room) => room.property_id === Number(propertyId))
                      ?.floor_name ||
                    'Ground Floor';
                  setRoomFloorName(firstFloor);
                }}
              >
                <option value="">Select property</option>
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
                value={roomFloorName}
                onChange={(e) =>
                  setRoomFloorName(e.target.value)
                }
              >
                {Array.from(
                  new Set([
                    'Ground Floor',
                    ...propertyLevels
                      .filter(
                        (level) =>
                          !roomPropertyId ||
                          level.property_id === Number(roomPropertyId),
                      )
                      .map((level) => level.floor_name),
                    ...rooms
                      .filter(
                        (room) =>
                          !roomPropertyId ||
                          room.property_id === Number(roomPropertyId),
                      )
                      .map((room) => room.floor_name || 'Ground Floor'),
                  ]),
                ).map((floor) => (
                  <option key={floor} value={floor}>
                    {floor}
                  </option>
                ))}
              </select>

              <input
                className="modal-input"
                placeholder="Room number"
                value={roomNumber}
                onChange={(e) =>
                  setRoomNumber(e.target.value)
                }
              />

              <select
                className="modal-input"
                value={sharingType}
                onChange={(e) =>
                  setSharingType(e.target.value)
                }
              >
                <option value="Single">Single (1 bed)</option>
                <option value="Double">Double (2 beds)</option>
                <option value="Triple">Triple (3 beds)</option>
                <option value="Four Sharing">Four Sharing (4 beds)</option>
                <option value="Five Sharing">Five Sharing (5 beds)</option>
                <option value="Six Sharing">Six Sharing (6 beds)</option>
              </select>

              <select
                className="modal-input"
                value={roomType}
                onChange={(e) =>
                  setRoomType(e.target.value)
                }
              >
                <option value="AC">AC</option>
                <option value="Non AC">Non AC</option>
              </select>

              <input
                className="modal-input"
                type="number"
                min="0"
                placeholder="Per day rent"
                value={roomPerDayRent}
                onChange={(e) =>
                  setRoomPerDayRent(e.target.value)
                }
              />

              <input
                className="modal-input"
                type="number"
                min="0"
                placeholder="Monthly rent"
                value={roomRent}
                onChange={(e) =>
                  setRoomRent(e.target.value)
                }
              />

              <ModalButtons
                saving={saving}
                onCancel={closeModal}
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
              <ModalTitle
                title="Add Bed"
                subtitle="Add an individual bed to a room."
              />

              <select
                className="modal-input"
                value={
                  bedRoomId
                }
                onChange={(e) =>
                  setBedRoomId(
                    e.target.value,
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
                onChange={(e) =>
                  setBedNumber(
                    e.target.value,
                  )
                }
              />

              <ModalButtons
                saving={saving}
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
              <ModalTitle
                title="Add Tenant"
                subtitle="Enter tenant identity details and assign a room or bed."
              />

              <input
                className="modal-input"
                placeholder="Full name"
                value={
                  tenantName
                }
                onChange={(e) =>
                  setTenantName(
                    e.target.value,
                  )
                }
              />

              <input
                className="modal-input"
                placeholder="Mobile number"
                type="tel"
                value={
                  tenantPhone
                }
                onChange={(e) =>
                  setTenantPhone(
                    e.target.value,
                  )
                }
              />

              <select
                className="modal-input"
                value={
                  tenantGender
                }
                onChange={(e) =>
                  setTenantGender(
                    e.target.value,
                  )
                }
              >
                <option value="">
                  Select gender
                </option>
                <option value="Male">
                  Male
                </option>
                <option value="Female">
                  Female
                </option>
                <option value="Other">
                  Other
                </option>
              </select>

              <select
                className="modal-input"
                value={
                  tenantIdProofType
                }
                onChange={(e) =>
                  setTenantIdProofType(
                    e.target.value,
                  )
                }
              >
                <option value="">
                  Select ID proof type
                </option>
                <option value="Aadhaar">
                  Aadhaar
                </option>
                <option value="PAN">
                  PAN
                </option>
                <option value="Voter ID">
                  Voter ID
                </option>
                <option value="Passport">
                  Passport
                </option>
              </select>

              <label className="modal-input" style={{ display: 'block' }}>
                ID photo — front
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'block', width: '100%', marginTop: '8px' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 800 * 1024) {
                      setError('Front ID photo must be 800 KB or smaller.');
                      e.currentTarget.value = '';
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => setTenantIdPhotoFront(String(reader.result || ''));
                    reader.readAsDataURL(file);
                  }}
                />
                {tenantIdPhotoFront && (
                  <small style={{ display: 'block', marginTop: '6px' }}>
                    Front photo selected
                  </small>
                )}
              </label>

              <label className="modal-input" style={{ display: 'block' }}>
                ID photo — back
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'block', width: '100%', marginTop: '8px' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 800 * 1024) {
                      setError('Back ID photo must be 800 KB or smaller.');
                      e.currentTarget.value = '';
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => setTenantIdPhotoBack(String(reader.result || ''));
                    reader.readAsDataURL(file);
                  }}
                />
                {tenantIdPhotoBack && (
                  <small style={{ display: 'block', marginTop: '6px' }}>
                    Back photo selected
                  </small>
                )}
              </label>

              <select
                className="modal-input"
                value={
                  tenantPropertyId
                }
                onChange={(e) => {
                  setTenantPropertyId(
                    e.target.value,
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
                onChange={(e) => {
                  setTenantRoomId(
                    e.target.value,
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
                  (room) => (
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
                onChange={(e) =>
                  setTenantBedId(
                    e.target.value,
                  )
                }
              >
                <option value="">
                  Select available bed
                </option>

                {availableBeds.map(
                  (bed) => (
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
                onChange={(e) =>
                  setTenantRent(
                    e.target.value,
                  )
                }
              />

              <input
                className="modal-input"
                type="number"
                min="1"
                max="28"
                placeholder="Rent due day"
                value={
                  tenantDueDate
                }
                onChange={(e) =>
                  setTenantDueDate(
                    e.target.value,
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
                onChange={(e) =>
                  setTenantDeposit(
                    e.target.value,
                  )
                }
              />

              <input
                className="modal-input"
                type="date"
                value={
                  tenantMoveInDate
                }
                onChange={(e) =>
                  setTenantMoveInDate(
                    e.target.value,
                  )
                }
              />

              <ModalButtons
                saving={saving}
                onCancel={
                  closeModal
                }
              />
            </form>
          )}

          {activeModal ===
            'accountSettings' && (
            <AccountSettingsModal
              onClose={closeModal}
            />
          )}

          {activeModal ===
            'tenantDetails' &&
            selectedTenant && (
              <TenantDetails
                tenant={
                  selectedTenant
                }
                payments={
                  selectedTenantPayments
                }
                paid={getTenantPaid(
                  selectedTenant.id,
                )}
                pending={getTenantPending(
                  selectedTenant,
                )}
                status={getTenantStatus(
                  selectedTenant,
                )}
                onClose={
                  closeModal
                }
              />
            )}
        </ModalOverlay>
      )}
    </div>
  );
}

function Header({
  owner,
  onLogout,
  onDeleteAccount,
  onAccountSettings,
}: {
  owner: Owner | null;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onAccountSettings: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSection, setMenuSection] = useState<
    'none' | 'plan' | 'updates' | 'guide' | 'contact' | 'terms'
  >('none');

  const toggleSection = (section: typeof menuSection) => {
    setMenuSection(menuSection === section ? 'none' : section);
  };

  return (
    <>
      <header className="app-header">
        <div className="brand-wrap">
          <div className="brand-logo">P</div>
          <div>
            <h1 className="brand-title">Peacely</h1>
            <p className="brand-subtitle">{owner?.name || 'Property Management'}</p>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="hamburger-btn"
            type="button"
            aria-label="Open profile menu"
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen(!menuOpen);
              if (menuOpen) setMenuSection('none');
            }}
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="profile-menu-backdrop" onClick={() => setMenuOpen(false)}>
          <aside className="profile-menu" onClick={(e) => e.stopPropagation()}>
            <div className="profile-menu-header">
              <div className="avatar">{getInitials(owner?.name || 'Owner')}</div>
              <div>
                <strong>{owner?.name || 'Owner'}</strong>
                <span>{owner?.email || ''}</span>
              </div>
            </div>

            <button className="profile-menu-item" type="button" onClick={() => { onAccountSettings(); setMenuOpen(false); }}>
              <span>⚙️</span><span>Account Settings</span>
            </button>

            <button className="profile-menu-item" type="button" onClick={() => toggleSection('plan')}>
              <span>💳</span><span>Active subscription plan</span><span className="menu-chevron">{menuSection === 'plan' ? '⌃' : '›'}</span>
            </button>
            {menuSection === 'plan' && (
              <div className="profile-menu-detail">
                <strong>Peacely Free Plan</strong>
                <p>Property management, tenant records, rent tracking and invoices.</p>
                <div className="menu-detail-row"><span>Status</span><strong>Active</strong></div>
                <div className="menu-detail-row"><span>Billing</span><strong>No charge currently</strong></div>
              </div>
            )}

            <button className="profile-menu-item" type="button" onClick={() => toggleSection('updates')}>
              <span>🔔</span><span>Important updates</span><span className="menu-chevron">{menuSection === 'updates' ? '⌃' : '›'}</span>
            </button>
            {menuSection === 'updates' && (
              <div className="profile-menu-detail">
                <strong>Peacely updates</strong>
                <p>Stay informed about new features, improvements and important account notices.</p>
                <ul>
                  <li>Rent invoices and payment tracking are available.</li>
                  <li>Direct owner payment details can be shared with tenants.</li>
                  <li>WhatsApp reminders are available when configured.</li>
                </ul>
              </div>
            )}

            <button className="profile-menu-item" type="button" onClick={() => toggleSection('guide')}>
              <span>📖</span><span>Support Guide</span><span className="menu-chevron">{menuSection === 'guide' ? '⌃' : '›'}</span>
            </button>
            {menuSection === 'guide' && (
              <div className="profile-menu-detail">
                <strong>Quick Support Guide</strong>
                <p>Manage your property from one place.</p>
                <ul>
                  <li><strong>Properties:</strong> add buildings, floors, rooms and beds.</li>
                  <li><strong>Tenants:</strong> add tenants and assign rooms or beds.</li>
                  <li><strong>Payments:</strong> record and review received rent.</li>
                  <li><strong>Invoices:</strong> review dues and confirm payments.</li>
                  <li><strong>Analytics:</strong> monitor occupancy and collection.</li>
                  <li><strong>Account Settings:</strong> manage payment and reminder settings.</li>
                </ul>
              </div>
            )}

            <button className="profile-menu-item" type="button" onClick={() => toggleSection('contact')}>
              <span>💬</span><span>Contact us</span><span className="menu-chevron">{menuSection === 'contact' ? '⌃' : '›'}</span>
            </button>
            {menuSection === 'contact' && (
              <div className="profile-menu-detail">
                <strong>Peacely Support</strong>
                <p>Need help with your account, payments or property management?</p>
                <div className="menu-contact-box">
                  <span>Email</span>
                  <strong>chillinpeace.team@gmail.com</strong>
                </div>
                <div className="menu-contact-box">
                  <span>Support hours</span>
                  <strong>Monday–Saturday · 9:00 AM–6:00 PM</strong>
                </div>
              </div>
            )}

            <button className="profile-menu-item" type="button" onClick={() => toggleSection('terms')}>
              <span>📄</span><span>Terms and Conditions</span><span className="menu-chevron">{menuSection === 'terms' ? '⌃' : '›'}</span>
            </button>
            {menuSection === 'terms' && (
              <div className="profile-menu-detail">
                <strong>Peacely Terms and Conditions</strong>
                <p>These terms explain the basic rules for using Peacely as a property owner or manager.</p>
                <ul>
                  <li><strong>Account:</strong> You are responsible for keeping your login credentials secure and for the accuracy of information entered into your account.</li>
                  <li><strong>Property information:</strong> You are responsible for ensuring that property, room, bed, tenant, rent and invoice information you enter is accurate and lawful.</li>
                  <li><strong>Tenant information:</strong> Only provide personal information that you are authorised to provide. You remain responsible for obtaining any permissions or notices required by applicable law.</li>
                  <li><strong>Payments:</strong> Peacely provides payment information, invoices and payment-recording tools. Rent is paid directly to the property owner using the payment details displayed by the owner. Peacely does not take possession of the rent through this payment flow.</li>
                  <li><strong>Payment confirmation:</strong> When direct payment is used, the owner is responsible for confirming that payment has actually been received before marking an invoice as paid.</li>
                  <li><strong>WhatsApp and notifications:</strong> Automated reminders and receipts depend on the relevant communication service and correct contact information. Delivery may be delayed or unavailable because of third-party service issues.</li>
                  <li><strong>Acceptable use:</strong> Do not use Peacely for unlawful activity, fraud, harassment, unauthorised access, or to store or distribute misleading or harmful information.</li>
                  <li><strong>Service availability:</strong> Features may be updated, changed, suspended or temporarily unavailable for maintenance, security, technical or operational reasons.</li>
                  <li><strong>Third-party services:</strong> Peacely may use third-party services for hosting, messaging, authentication or other functionality. Their own terms and policies may also apply.</li>
                  <li><strong>Data:</strong> Peacely handles personal information in accordance with its applicable privacy practices and Indian data-protection requirements. Users should review the privacy information provided by Peacely before using the service.</li>
                  <li><strong>Changes:</strong> Peacely may update these terms when the service, legal requirements or operating practices change. Important changes may be communicated through the app.</li>
                  <li><strong>Contact:</strong> Questions about these terms can be sent to chillinpeace.team@gmail.com.</li>
                </ul>
                <p style={{marginBottom: 0}}>By continuing to use Peacely, you acknowledge that you have read and understood these terms.</p>
              </div>
            )}

            <div className="profile-menu-divider"></div>
            <button className="profile-menu-item logout-menu-item" type="button" onClick={() => { setMenuOpen(false); onLogout(); }}>
              <span>↪</span><span>Logout</span>
            </button>
            <button
              className="profile-menu-item delete-account-menu-item"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onDeleteAccount();
              }}
            >
              <span>🗑️</span><span>Delete account</span>
            </button>
          </aside>
        </div>
      )}
    </>
  );
}

function Dashboard({
  expectedRent,
  collectedThisMonth,
  pendingDues,
  collectionRate,
  totalOccupancy,
  activeTenants,
  occupiedBeds,
  availableBedCount,
  properties,
  upcomingDues,
  overdueTenants,
  recentPayments,
  getTenantPending,
  getTenantPaid,
  openTenantDetails,
  openModal,
  setActiveTab,
}: {
  expectedRent: number;
  collectedThisMonth: number;
  pendingDues: number;
  collectionRate: number;
  totalOccupancy: number;
  activeTenants: Tenant[];
  occupiedBeds: number;
  availableBedCount: number;
  properties: Property[];
  upcomingDues: Tenant[];
  overdueTenants: Tenant[];
  recentPayments: Payment[];
  getTenantPending: (
    tenant: Tenant,
  ) => number;
  getTenantPaid: (
    id: number,
  ) => number;
  openTenantDetails: (
    tenant: Tenant,
  ) => void;
  openModal: (
    modal: Modal,
  ) => void;
  setActiveTab: (
    tab: Tab,
  ) => void;
}) {
  return (
    <div className="view-container">
      <div className="hero-card">
        <div className="hero-header">
          <span className="tag-light">
            Expected Monthly Rent
          </span>

          <span className="live-indicator">
            <span className="pulse-dot" />
            Live
          </span>
        </div>

        <div className="hero-value">
          {money(expectedRent)}
        </div>

        <div className="hero-meta">
          <span>
            {totalOccupancy}%
            occupancy
          </span>
          <span>•</span>
          <span>
            {activeTenants.length}{' '}
            active tenants
          </span>
        </div>

        <div className="progress-bar-bg">
          <div
            className="progress-bar-fill"
            style={{
              width: `${collectionRate}%`,
            }}
          />
        </div>

        <div className="hero-bottom">
          <span>
            {money(
              collectedThisMonth,
            )}{' '}
            collected
          </span>

          <strong>
            {collectionRate}%
          </strong>
        </div>
      </div>

      <div className="metrics-grid">
        <Metric
          icon="💰"
          value={money(
            collectedThisMonth,
          )}
          label="Collected"
        />

        <Metric
          icon="⏳"
          value={money(
            pendingDues,
          )}
          label="Pending"
        />

        <Metric
          icon="🛏️"
          value={`${occupiedBeds}/${
            occupiedBeds +
            availableBedCount
          }`}
          label="Beds Occupied"
        />

        <Metric
          icon="🏠"
          value={String(
            properties.length,
          )}
          label="Properties"
        />
      </div>

      <SectionHeading
        title="Quick Actions"
        subtitle="Manage your rental business"
      />

      <div className="quick-actions">
        <QuickAction
          icon="🏠"
          label="Property"
          onClick={() =>
            openModal(
              'property',
            )
          }
        />

        <QuickAction
          icon="🚪"
          label="Room"
          onClick={() =>
            openModal('room')
          }
        />

        <QuickAction
          icon="🛏️"
          label="Bed"
          onClick={() =>
            openModal('bed')
          }
        />

        <QuickAction
          icon="👤"
          label="Tenant"
          onClick={() =>
            openModal(
              'tenant',
            )
          }
        />


      </div>

      {overdueTenants.length >
        0 && (
        <>
          <SectionHeading
            title="Needs Attention"
            subtitle={`${overdueTenants.length} rent payment${
              overdueTenants.length >
              1
                ? 's'
                : ''
            } overdue`}
          />

          <div className="alert-card">
            <div className="alert-icon">
              ⚠️
            </div>

            <div className="alert-content">
              {overdueTenants
                .slice(0, 3)
                .map(
                  (tenant) => (
                    <div
                      className="alert-row"
                      key={
                        tenant.id
                      }
                    >
                      <div>
                        <strong>
                          {
                            tenant.name
                          }
                        </strong>

                        <span>
                          {money(
                            getTenantPending(
                              tenant,
                            ),
                          )}{' '}
                          pending
                        </span>
                      </div>


                    </div>
                  ),
                )}
            </div>
          </div>
        </>
      )}

      <SectionHeading
        title="Upcoming Dues"
        subtitle="Tenants with unpaid rent"
        action={
          <button
            className="text-btn"
            onClick={() =>
              setActiveTab(
                'tenants',
              )
            }
          >
            View all
          </button>
        }
      />

      {upcomingDues.length ===
      0 ? (
        <EmptyCard
          icon="🎉"
          title="All caught up"
          text="No upcoming unpaid rent found."
        />
      ) : (
        <div className="list-card">
          {upcomingDues.map(
            (tenant) => (
              <div
                className="list-row"
                key={
                  tenant.id
                }
                onClick={() =>
                  openTenantDetails(
                    tenant,
                  )
                }
              >
                <div className="avatar">
                  {getInitials(
                    tenant.name,
                  )}
                </div>

                <div className="list-main">
                  <strong>
                    {
                      tenant.name
                    }
                  </strong>

                  <span>
                    Room{' '}
                    {tenant.room_number ||
                      '-'}{' '}
                    · Due{' '}
                    {
                      tenant.due_date
                    }
                  </span>
                </div>

                <div className="list-side">
                  <strong>
                    {money(
                      getTenantPending(
                        tenant,
                      ),
                    )}
                  </strong>

                  <span className="status pending">
                    Pending
                  </span>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <SectionHeading
        title="Recent Payments"
        subtitle="Latest rent collection"
        action={
          <button
            className="text-btn"
            onClick={() =>
              setActiveTab(
                'payments',
              )
            }
          >
            View all
          </button>
        }
      />

      {recentPayments.length ===
      0 ? (
        <EmptyCard
          icon="₹"
          title="No payments yet"
          text="Recorded payments will appear here."
        />
      ) : (
        <div className="list-card">
          {recentPayments.map(
            (payment) => (
              <div
                className="list-row"
                key={
                  payment.id
                }
              >
                <div className="avatar payment-avatar">
                  ₹
                </div>

                <div className="list-main">
                  <strong>
                    {payment.tenant_name ||
                      'Tenant'}
                  </strong>

                  <span>
                    {
                      payment.payment_method
                    }{' '}
                    ·{' '}
                    {formatDate(
                      payment.payment_date,
                    )}
                  </span>
                </div>

                <div className="list-side">
                  <strong>
                    {money(
                      payment.amount,
                    )}
                  </strong>

                  <span className="status paid">
                    Paid
                  </span>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <SectionHeading
        title="Portfolio"
        subtitle="Property overview"
      />

      {properties.length ===
      0 ? (
        <EmptyCard
          icon="🏠"
          title="No properties"
          text="Add your first property to get started."
          action={
            <button
              className="btn-primary"
              onClick={() =>
                openModal(
                  'property',
                )
              }
            >
              Add Property
            </button>
          }
        />
      ) : (
        properties.map(
          (property) => (
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
                      'No address added'}
                  </p>
                </div>

                <span className="badge badge-emerald">
                  {property.occupancy_rate ||
                    0}
                  %
                </span>
              </div>

              <div className="metrics-row">
                <MiniMetric
                  label="Rooms"
                  value={
                    property.room_count
                  }
                />

                <MiniMetric
                  label="Beds"
                  value={
                    property.bed_count ||
                    0
                  }
                />

                <MiniMetric
                  label="Occupied"
                  value={
                    property.occupied_bed_count ||
                    0
                  }
                />
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
  );
}

function PropertiesView({
  properties, rooms, beds, propertyLevels, managedPropertyId,
  setManagedPropertyId, openModal, setRoomPropertyId, setRoomFloorName,
  setFloorPropertyId, removeBed, deleteProperty,
}: {
  properties: Property[]; rooms: Room[]; beds: Bed[]; propertyLevels: PropertyLevel[];
  managedPropertyId: number | null; setManagedPropertyId: (value: number | null) => void;
  openModal: (modal: Modal) => void; setRoomPropertyId: (value: string) => void;
  setRoomFloorName: (value: string) => void; setFloorPropertyId: (value: string) => void;
  removeBed: (bed: Bed) => void; deleteProperty: (property: Property) => void;
}) {
  const managedProperty = properties.find((property) => property.id === managedPropertyId) || null;

  if (managedProperty) {
    const propertyRooms = rooms.filter((room) => room.property_id === managedProperty.id);
    const propertyBeds = beds.filter((bed) => propertyRooms.some((room) => room.id === bed.room_id));
    const propertyLevelsForProperty = propertyLevels.filter((level) => level.property_id === managedProperty.id);

    return (
      <div className="view-container">
        <PageHeader
          title={managedProperty.name}
          subtitle="Manage property, floors, rooms and beds"
          action={<button className="btn-secondary" onClick={() => setManagedPropertyId(null)}>← Back</button>}
        />

        <div className="glass-card">
          <div className="glass-header">
            <div>
              <h3>Property Details</h3>
              <p>{managedProperty.address || 'No address'}</p>
            </div>
          </div>
          <div className="metrics-row">
            <MiniMetric label="Property Type" value={managedProperty.property_type || 'Gents'} />
            <MiniMetric label="Rental Cycle" value={managedProperty.rent_cycle || '1st of every month'} />
            <MiniMetric label="Rooms" value={propertyRooms.length} />
            <MiniMetric label="Beds" value={propertyBeds.length} />
            <MiniMetric label="Occupied" value={propertyBeds.filter((bed) => bed.is_occupied).length} />
          </div>
        </div>

        <div className="glass-card">
          <SectionHeading
            title="Floors"
            subtitle="Add floors before adding rooms"
            action={
              <button className="btn-secondary" onClick={() => {
                setFloorPropertyId(String(managedProperty.id));
                openModal('floor');
              }}>
                + Floor
              </button>
            }
          />
          {propertyLevelsForProperty.length === 0 ? (
            <div className="small-empty">No floors added yet.</div>
          ) : (
            <div className="bed-list">
              {propertyLevelsForProperty.map((level) => (
                <span className="badge" key={level.id}>{level.floor_name}</span>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card">
          <SectionHeading
            title="Rooms & Beds"
            subtitle="All rooms and automatically created beds for this property"
            action={
              <button className="btn-primary" onClick={() => {
                const firstFloor = propertyLevelsForProperty[0]?.floor_name || propertyRooms[0]?.floor_name;
                setRoomPropertyId(String(managedProperty.id));
                if (!firstFloor) {
                  setFloorPropertyId(String(managedProperty.id));
                  openModal('floor');
                  return;
                }
                setRoomFloorName(firstFloor);
                openModal('room');
              }}>
                + Room
              </button>
            }
          />
          {propertyRooms.length === 0 ? (
            <div className="small-empty">No rooms added yet. Add a floor first, then add rooms.</div>
          ) : (
            propertyRooms.map((room) => {
              const roomBeds = beds.filter((bed) => bed.room_id === room.id);
              return (
                <div className="glass-card" key={room.id} style={{ marginTop: '12px' }}>
                  <div className="glass-header">
                    <div>
                      <h3>Room {room.room_number}</h3>
                      <p>{room.floor_name || 'Ground Floor'} · {room.room_type || 'Non AC'} · {room.sharing_type}</p>
                    </div>
                  </div>
                  <div className="metrics-row">
                    <MiniMetric label="Per Day" value={money(room.per_day_rent || 0)} />
                    <MiniMetric label="Monthly" value={money(room.rent_amount || 0)} />
                    <MiniMetric label="Beds" value={roomBeds.length} />
                  </div>
                  <div className="bed-list">
                    {roomBeds.length === 0 ? <span className="muted">No beds</span> : roomBeds.map((bed) => (
                      <span className={bed.is_occupied ? 'bed-chip occupied' : 'bed-chip available'} key={bed.id}>
                        Bed {bed.bed_number}
                        <small>{bed.is_occupied ? 'Occupied' : 'Available'}</small>
                        {!bed.is_occupied && (
                          <button type="button" className="mini-action" onClick={() => removeBed(bed)}>Remove</button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    );
  }

  return (
    <div className="view-container">
      <PageHeader
        title="Properties"
        subtitle="Your properties at a glance"
        action={<button className="btn-primary" onClick={() => openModal('property')}>+ Property</button>}
      />

      {properties.map((property) => {
        const propertyRooms = rooms.filter((room) => room.property_id === property.id);
        return (
          <div className="glass-card" key={property.id}>
            <div className="glass-header">
              <div>
                <h3>{property.name}</h3>
                <p>{property.address || 'No address'}</p>
              </div>
            </div>
            <div className="metrics-row">
              <MiniMetric label="Type" value={property.property_type || 'Gents'} />
              <MiniMetric label="Rental Cycle" value={property.rent_cycle || '1st of every month'} />
              <MiniMetric label="Rooms" value={propertyRooms.length} />
              <MiniMetric label="Beds" value={property.bed_count || 0} />
              <MiniMetric label="Occupied" value={property.occupied_bed_count || 0} />
              <MiniMetric label="Occupancy" value={`${property.occupancy_rate || 0}%`} />
            </div>
            <div className="tenant-actions">
              <button className="btn-primary" onClick={() => setManagedPropertyId(property.id)}>Manage</button>
              <button className="btn-secondary" onClick={() => deleteProperty(property)}>Delete Property</button>
            </div>
          </div>
        );
      })}

      {properties.length === 0 && (
        <EmptyCard icon="🏠" title="No properties yet" text="Add your first property to begin."
          action={<button className="btn-primary" onClick={() => openModal('property')}>Add Property</button>}
        />
      )}
    </div>
  );
}

function RoomsView({
  rooms,
  beds,
  openModal,
}: {
  rooms: Room[];
  beds: Bed[];
  openModal: (
    modal: Modal,
  ) => void;
}) {
  return (
    <div className="view-container">
      <PageHeader
        title="Rooms & Beds"
        subtitle="Manage rooms and bed availability"
        action={
          <div className="header-button-group">
            <button
              className="btn-secondary"
              onClick={() =>
                openModal('bed')
              }
            >
              + Bed
            </button>

            <button
              className="btn-primary"
              onClick={() =>
                openModal(
                  'room',
                )
              }
            >
              + Room
            </button>
          </div>
        }
      />

      {rooms.map(
        (room) => {
          const roomBeds =
            beds.filter(
              (bed) =>
                bed.room_id ===
                room.id,
            );

          return (
            <div
              className="glass-card"
              key={
                room.id
              }
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
                    {room.property_name ||
                      'Property'}
                  </p>
                </div>

                <span className="badge">
                  {
                    room.sharing_type
                  }
                </span>
              </div>

              <div className="metrics-row">
                <MiniMetric
                  label="Rent"
                  value={money(
                    room.rent_amount,
                  )}
                />

                <MiniMetric
                  label="Beds"
                  value={
                    roomBeds.length
                  }
                />

                <MiniMetric
                  label="Occupied"
                  value={
                    roomBeds.filter(
                      (bed) =>
                        bed.is_occupied,
                    ).length
                  }
                />
              </div>

              <div className="bed-list">
                {roomBeds.length ===
                0 ? (
                  <span className="muted">
                    No beds added yet
                  </span>
                ) : (
                  roomBeds.map(
                    (bed) => (
                      <span
                        className={
                          bed.is_occupied
                            ? 'bed-chip occupied'
                            : 'bed-chip available'
                        }
                        key={
                          bed.id
                        }
                      >
                        Bed{' '}
                        {
                          bed.bed_number
                        }

                        <small>
                          {bed.is_occupied
                            ? 'Occupied'
                            : 'Available'}
                        </small>
                      </span>
                    ),
                  )
                )}
              </div>
            </div>
          );
        },
      )}

      {rooms.length ===
        0 && (
        <EmptyCard
          icon="🚪"
          title="No rooms yet"
          text="Add a room to start creating beds."
          action={
            <button
              className="btn-primary"
              onClick={() =>
                openModal(
                  'room',
                )
              }
            >
              Add Room
            </button>
          }
        />
      )}
    </div>
  );
}

function TenantsView({
  tenants,
  searchQuery,
  setSearchQuery,
  tenantFilter,
  setTenantFilter,
  propertyFilter,
  setPropertyFilter,
  properties,
  openModal,
  getTenantStatus,
  getTenantPaid,
  getTenantPending,
  openTenantDetails,
}: {
  tenants: Tenant[];
  searchQuery: string;
  setSearchQuery: (
    value: string,
  ) => void;
  tenantFilter:
    | 'all'
    | 'paid'
    | 'pending'
    | 'overdue';
  setTenantFilter: (
    value:
      | 'all'
      | 'paid'
      | 'pending'
      | 'overdue',
  ) => void;
  propertyFilter: string;
  setPropertyFilter: (
    value: string,
  ) => void;
  properties: Property[];
  openModal: (
    modal: Modal,
  ) => void;
  getTenantStatus: (
    tenant: Tenant,
  ) =>
    | 'paid'
    | 'pending'
    | 'overdue';
  getTenantPaid: (
    id: number,
  ) => number;
  getTenantPending: (
    tenant: Tenant,
  ) => number;
  openTenantDetails: (
    tenant: Tenant,
  ) => void;
}) {
  return (
    <div className="view-container">
      <PageHeader
        title="Tenants"
        subtitle={`${tenants.length} tenant${
          tenants.length !==
          1
            ? 's'
            : ''
        } shown`}
        action={
          <button
            className="btn-primary"
            onClick={() =>
              openModal(
                'tenant',
              )
            }
          >
            + Tenant
          </button>
        }
      />

      <input
        className="search-input"
        placeholder="Search name, phone, room or property..."
        value={
          searchQuery
        }
        onChange={(e) =>
          setSearchQuery(
            e.target.value,
          )
        }
      />

      <div className="filter-row">
        {(
          [
            ['all', 'All'],
            ['paid', 'Paid'],
            [
              'pending',
              'Pending',
            ],
            [
              'overdue',
              'Overdue',
            ],
          ] as const
        ).map(
          ([
            value,
            label,
          ]) => (
            <button
              key={
                value
              }
              className={
                tenantFilter ===
                value
                  ? 'filter-pill active'
                  : 'filter-pill'
              }
              onClick={() =>
                setTenantFilter(
                  value,
                )
              }
            >
              {label}
            </button>
          ),
        )}
      </div>

      <select
        className="modal-input compact-input"
        value={
          propertyFilter
        }
        onChange={(e) =>
          setPropertyFilter(
            e.target.value,
          )
        }
      >
        <option value="">
          All properties
        </option>

        {properties.map(
          (property) => (
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

      {tenants.map(
        (tenant) => {
          const status =
            getTenantStatus(
              tenant,
            );

          const paid =
            getTenantPaid(
              tenant.id,
            );

          const pending =
            getTenantPending(
              tenant,
            );

          return (
            <div
              className="glass-card tenant-card"
              key={
                tenant.id
              }
            >
              <div
                className="clickable-header"
                onClick={() =>
                  openTenantDetails(
                    tenant,
                  )
                }
              >
                <div className="avatar large">
                  {getInitials(
                    tenant.name,
                  )}
                </div>

                <div className="tenant-main">
                  <h3>
                    {
                      tenant.name
                    }
                  </h3>

                  <p>
                    {
                      tenant.phone
                    }
                  </p>

                  <span>
                    {tenant.property_name ||
                      'Property'}{' '}
                    · Room{' '}
                    {tenant.room_number ||
                      '-'}{' '}
                    · Bed{' '}
                    {tenant.bed_number ||
                      '-'}
                  </span>
                </div>

                <StatusBadge
                  status={
                    status
                  }
                />
              </div>

              <div className="tenant-finance">
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
                    Paid
                  </span>

                  <strong className="success-text">
                    {money(
                      paid,
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Pending
                  </span>

                  <strong
                    className={
                      pending >
                      0
                        ? 'danger-text'
                        : 'success-text'
                    }
                  >
                    {money(
                      pending,
                    )}
                  </strong>
                </div>
              </div>

              <div className="tenant-actions">
                <button
                  className="btn-secondary"
                  onClick={() =>
                    openTenantDetails(
                      tenant,
                    )
                  }
                >
                  Details
                </button>

              </div>
            </div>
          );
        },
      )}

      {tenants.length ===
        0 && (
        <EmptyCard
          icon="👥"
          title="No tenants found"
          text="Try changing your search or add a new tenant."
          action={
            <button
              className="btn-primary"
              onClick={() =>
                openModal(
                  'tenant',
                )
              }
            >
              Add Tenant
            </button>
          }
        />
      )}
    </div>
  );
}

function AccountSettingsModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [paymentDetails, setPaymentDetails] =
    useState<OwnerPaymentDetails>({
      upi_id: '',
      phone: '',
      qr_code_data: '',
      payment_instructions: '',
    });

  const [automationSettings, setAutomationSettings] = useState({
    reminders_enabled: true,
    reminder_days_before: 3,
    overdue_reminders_enabled: true,
    recurring_invoices_enabled: true,
  });

  const [savingPaymentDetails, setSavingPaymentDetails] = useState(false);
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [paymentResult, automationResult] = await Promise.all([
          apiRequest<{ payment_details: OwnerPaymentDetails }>(
            '/payment-automation/payment-details',
          ),
          apiRequest<{ settings: typeof automationSettings }>(
            '/payment-automation/settings',
          ),
        ]);

        if (paymentResult?.payment_details) {
          setPaymentDetails(paymentResult.payment_details);
        }
        if (automationResult?.settings) {
          setAutomationSettings(automationResult.settings);
        }
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Could not load account settings.',
        );
      }
    };

    load().catch(() => undefined);
  }, []);

  const handleQrUpload = (file?: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage('Please choose a QR image file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setMessage('QR image must be 2 MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      setPaymentDetails((current) => ({
        ...current,
        qr_code_data: value,
      }));
      setMessage('');
    };
    reader.readAsDataURL(file);
  };

  const savePaymentDetails = async () => {
    if (
      !paymentDetails.upi_id.trim() &&
      !paymentDetails.phone.trim() &&
      !paymentDetails.qr_code_data.trim()
    ) {
      setMessage('Add a UPI ID, phone number, or QR code.');
      return;
    }

    setSavingPaymentDetails(true);
    setMessage('');

    try {
      await apiRequest('/payment-automation/payment-details', {
        method: 'PUT',
        body: JSON.stringify(paymentDetails),
      });
      setMessage('Payment details saved. New rent reminders will use them automatically.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not save payment details.',
      );
    } finally {
      setSavingPaymentDetails(false);
    }
  };

  const saveAutomation = async () => {
    setSavingAutomation(true);
    setMessage('');

    try {
      await apiRequest('/payment-automation/settings', {
        method: 'PUT',
        body: JSON.stringify(automationSettings),
      });
      setMessage('Rent reminder settings saved.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not save reminder settings.',
      );
    } finally {
      setSavingAutomation(false);
    }
  };

  return (
    <div>
      <ModalTitle
        title="Account Settings"
        subtitle="Choose how tenants pay you directly. Peacely does not collect or take a percentage of rent."
      />

      <div className="small-empty">
        <strong>Owner payment details</strong><br />
        Add the UPI ID, phone number and/or QR code you want tenants to use. These details appear on the rent payment page linked from WhatsApp reminders.
      </div>

      <input
        className="modal-input"
        placeholder="UPI ID (example: owner@upi)"
        value={paymentDetails.upi_id}
        onChange={(e) =>
          setPaymentDetails((current) => ({
            ...current,
            upi_id: e.target.value,
          }))
        }
      />

      <input
        className="modal-input"
        inputMode="tel"
        placeholder="Phone number"
        value={paymentDetails.phone}
        onChange={(e) =>
          setPaymentDetails((current) => ({
            ...current,
            phone: e.target.value,
          }))
        }
      />

      <label className="detail-item">
        <span>UPI QR code</span>
        <input
          className="modal-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => handleQrUpload(e.target.files?.[0])}
        />
      </label>

      {paymentDetails.qr_code_data && (
        <div className="glass-card" style={{ marginTop: 12, textAlign: 'center' }}>
          <img
            src={paymentDetails.qr_code_data}
            alt="Owner UPI QR"
            style={{ maxWidth: 220, width: '100%', borderRadius: 12 }}
          />
          <button
            type="button"
            className="text-btn"
            onClick={() =>
              setPaymentDetails((current) => ({
                ...current,
                qr_code_data: '',
              }))
            }
          >
            Remove QR code
          </button>
        </div>
      )}

      <textarea
        className="modal-input"
        rows={3}
        placeholder="Optional payment instructions"
        value={paymentDetails.payment_instructions}
        onChange={(e) =>
          setPaymentDetails((current) => ({
            ...current,
            payment_instructions: e.target.value,
          }))
        }
      />

      <button
        type="button"
        className="btn-primary full-btn"
        onClick={savePaymentDetails}
        disabled={savingPaymentDetails}
      >
        {savingPaymentDetails ? 'Saving...' : 'Save Payment Details'}
      </button>

      <div className="small-empty" style={{ marginTop: 18 }}>
        <strong>Automatic rent reminders</strong>
      </div>

      <label className="detail-item">
        <span>Send rent reminders</span>
        <input
          type="checkbox"
          checked={automationSettings.reminders_enabled}
          onChange={(e) =>
            setAutomationSettings((current) => ({
              ...current,
              reminders_enabled: e.target.checked,
            }))
          }
        />
      </label>

      <label className="detail-item">
        <span>Days before due date</span>
        <input
          className="modal-input"
          type="number"
          min="0"
          max="30"
          value={automationSettings.reminder_days_before}
          onChange={(e) =>
            setAutomationSettings((current) => ({
              ...current,
              reminder_days_before: Number(e.target.value),
            }))
          }
        />
      </label>

      <label className="detail-item">
        <span>Overdue reminders</span>
        <input
          type="checkbox"
          checked={automationSettings.overdue_reminders_enabled}
          onChange={(e) =>
            setAutomationSettings((current) => ({
              ...current,
              overdue_reminders_enabled: e.target.checked,
            }))
          }
        />
      </label>

      <label className="detail-item">
        <span>Automatic monthly invoices</span>
        <input
          type="checkbox"
          checked={automationSettings.recurring_invoices_enabled}
          onChange={(e) =>
            setAutomationSettings((current) => ({
              ...current,
              recurring_invoices_enabled: e.target.checked,
            }))
          }
        />
      </label>

      <button
        type="button"
        className="btn-primary full-btn"
        onClick={saveAutomation}
        disabled={savingAutomation}
      >
        {savingAutomation ? 'Saving...' : 'Save Rent Automation'}
      </button>

      {message && <div className="small-empty">{message}</div>}

      <button
        type="button"
        className="btn-secondary full-btn"
        onClick={onClose}
        style={{ marginTop: 10 }}
      >
        Close
      </button>
    </div>
  );
}

function PaymentsView({
  payments,
  search,
  setSearch,
}: {
  payments: Payment[];
  search: string;
  setSearch: (value: string) => void;
}) {
  const total = payments.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0,
  );

  return (
    <div className="view-container">
      <PageHeader
        title="Payments"
        subtitle={`${money(total)} collected`}
      />
      <input
        className="search-input"
        placeholder="Search tenant, invoice, property, month or method..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="summary-strip">
        <span>{payments.length} transactions</span>
        <strong>{money(total)}</strong>
      </div>
      {payments.map((payment) => (
        <div className="glass-card" key={payment.id}>
          <div className="glass-header">
            <div className="avatar-title-wrap">
              <div className="avatar">{getInitials(payment.tenant_name || 'Tenant')}</div>
              <div>
                <h3>{payment.tenant_name || 'Tenant'}</h3>
                <p>{payment.property_name || 'Property'} · Room {payment.room_number || '-'}</p>
              </div>
            </div>
            <strong className="amount-tag">{money(payment.amount)}</strong>
          </div>
          <div className="metrics-row">
            <MiniMetric label="Invoice" value={payment.invoice_number || 'General Payment'} />
            <MiniMetric label="Month" value={payment.payment_month} />
            <MiniMetric label="Method" value={payment.payment_method} />
            <MiniMetric label="Date" value={formatDate(payment.payment_date)} />
          </div>
        </div>
      ))}
      {payments.length === 0 && (
        <EmptyCard icon="₹" title="No payments found" text="Owner-confirmed rent payments will appear here automatically." />
      )}
    </div>
  );
}

function InvoicesView({
  invoices,
  search,
  setSearch,
  getBalance,
  onMarkPaid,
  markingInvoiceId,
}: {
  invoices: Invoice[];
  search: string;
  setSearch: (value: string) => void;
  getBalance: (invoice: Invoice) => number;
  onMarkPaid: (invoice: Invoice) => void;
  markingInvoiceId: number | null;
}) {
  return (
    <div className="view-container">
      <PageHeader
        title="Invoices"
        subtitle={`${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`}
      />
      <input
        className="search-input"
        placeholder="Search invoice, tenant, month or status..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {invoices.map((invoice) => {
        const balance = getBalance(invoice);
        const paid = Number(invoice.paid_amount || 0);
        const isPaid = normalize(invoice.status) === 'paid';
        const percentage = Math.min(
          Math.round(
            Number(
              invoice.payment_percentage ??
                (Number(invoice.amount) > 0
                  ? (paid / Number(invoice.amount)) * 100
                  : 0),
            ),
          ),
          100,
        );
        return (
          <div className="glass-card" key={invoice.id}>
            <div className="glass-header">
              <div>
                <h3>{invoice.invoice_number}</h3>
                <p>{invoice.tenant_name || 'Tenant'}</p>
              </div>
              <StatusBadge status={invoice.status || 'Pending'} />
            </div>
            <div className="metrics-row">
              <MiniMetric label="Amount" value={money(invoice.amount)} />
              <MiniMetric label="Paid" value={money(paid)} />
              <MiniMetric label="Balance" value={money(balance)} />
              <MiniMetric label="Due" value={formatDate(invoice.due_date)} />
            </div>
            <div className="glass-footer">
              <span>{invoice.month || '-'} · {percentage}% paid</span>
              <span className={isPaid ? 'status paid' : 'status pending'}>
                {isPaid ? 'Payment Confirmed' : 'Awaiting Owner Confirmation'}
              </span>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${percentage}%` }} />
            </div>
            {balance > 0 && (
              <div className="tenant-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <a
                  className="btn-primary"
                  href={`${API}/payment-automation/invoices/${invoice.id}/payment-page`}
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  View Payment Page
                </a>
                {!isPaid && (
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={() => onMarkPaid(invoice)}
                    disabled={markingInvoiceId === invoice.id}
                  >
                    {markingInvoiceId === invoice.id ? 'Confirming...' : 'Mark as Paid'}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {invoices.length === 0 && (
        <EmptyCard
          icon="🧾"
          title="No invoices found"
          text="Invoices are created automatically from active tenant rent and due dates."
        />
      )}
    </div>
  );
}

function AnalyticsView({
  properties,
  rooms,
  beds,
  tenants,
  expectedRent,
  collected,
  pending,
  overdue,
  occupancy,
  collectionRate,
}: {
  properties: Property[];
  rooms: Room[];
  beds: Bed[];
  tenants: Tenant[];
  expectedRent: number;
  collected: number;
  pending: number;
  overdue: number;
  occupancy: number;
  collectionRate: number;
}) {
  return (
    <div className="view-container">
      <PageHeader
        title="Analytics"
        subtitle="Your rental business at a glance"
      />

      <div className="metrics-grid">
        <Metric
          icon="💰"
          value={money(
            expectedRent,
          )}
          label="Expected Rent"
        />

        <Metric
          icon="✅"
          value={money(
            collected,
          )}
          label="Collected"
        />

        <Metric
          icon="⏳"
          value={money(
            pending,
          )}
          label="Pending"
        />

        <Metric
          icon="⚠️"
          value={money(
            overdue,
          )}
          label="Overdue"
        />
      </div>

      <div className="metrics-grid">
        <Metric
          icon="📈"
          value={`${collectionRate}%`}
          label="Collection Rate"
        />

        <Metric
          icon="🏠"
          value={String(
            properties.length,
          )}
          label="Properties"
        />

        <Metric
          icon="👥"
          value={String(
            tenants.length,
          )}
          label="Active Tenants"
        />

        <Metric
          icon="🛏️"
          value={`${occupancy}%`}
          label="Occupancy"
        />
      </div>

      <div className="glass-card">
        <h3>
          Portfolio Summary
        </h3>

        <div className="analytics-list">
          <AnalyticsRow
            label="Properties"
            value={
              properties.length
            }
          />

          <AnalyticsRow
            label="Rooms"
            value={
              rooms.length
            }
          />

          <AnalyticsRow
            label="Beds"
            value={
              beds.length
            }
          />

          <AnalyticsRow
            label="Occupied Beds"
            value={
              beds.filter(
                (bed) =>
                  bed.is_occupied,
              ).length
            }
          />

          <AnalyticsRow
            label="Available Beds"
            value={
              beds.filter(
                (bed) =>
                  !bed.is_occupied,
              ).length
            }
          />

          <AnalyticsRow
            label="Active Tenants"
            value={
              tenants.length
            }
          />

          <AnalyticsRow
            label="Occupancy"
            value={`${occupancy}%`}
          />
        </div>
      </div>

      <div className="glass-card">
        <h3>
          Collection Health
        </h3>

        <div className="large-progress">
          <div
            style={{
              width: `${collectionRate}%`,
            }}
          />
        </div>

        <div className="collection-health">
          <span>
            {collectionRate}%
            collected
          </span>

          <strong>
            {money(
              pending,
            )}{' '}
            pending
          </strong>
        </div>
      </div>
    </div>
  );
}

function TenantDetails({
  tenant,
  payments,
  paid,
  pending,
  status,
  onClose,
}: {
  tenant: Tenant;
  payments: Payment[];
  paid: number;
  pending: number;
  status:
    | 'paid'
    | 'pending'
    | 'overdue';
  onClose: () => void;
}) {
  const [fullScreenImage, setFullScreenImage] = useState<{ src: string; label: string } | null>(null);

  return (
    <div className="tenant-detail">
      <div className="detail-profile">
        <div className="avatar profile-avatar">
          {getInitials(
            tenant.name,
          )}
        </div>

        <div>
          <h2>
            {tenant.name}
          </h2>

          <p>
            {tenant.phone}
          </p>
        </div>

        <StatusBadge
          status={status}
        />
      </div>

      <div className="detail-grid">
        <DetailItem
          label="Property"
          value={
            tenant.property_name ||
            '-'
          }
        />

        <DetailItem
          label="Room"
          value={
            tenant.room_number ||
            '-'
          }
        />

        <DetailItem
          label="Bed"
          value={
            tenant.bed_number ||
            '-'
          }
        />

        <DetailItem
          label="Monthly Rent"
          value={money(
            tenant.monthly_rent,
          )}
        />

        <DetailItem
          label="Due Day"
          value={`Every ${tenant.due_date}`}
        />

        <DetailItem
          label="Deposit"
          value={money(
            tenant.deposit_amount ||
              0,
          )}
        />

        <DetailItem
          label="Move In"
          value={formatDate(
            tenant.move_in_date,
          )}
        />

        <DetailItem
          label="Email"
          value={
            tenant.email || '-'
          }
        />
      </div>

      {(tenant.id_photo_front || tenant.id_photo_back) && (
        <div className="detail-section">
          <div className="section-heading">
            <div>
              <h3>ID Documents</h3>
              <p>Tap a document to view it full screen.</p>
            </div>
          </div>
          <div className="tenant-document-grid">
            {tenant.id_photo_front && (
              <button
                type="button"
                className="tenant-document-card"
                onClick={() => setFullScreenImage({ src: tenant.id_photo_front!, label: 'ID proof — Front side' })}
              >
                <img src={tenant.id_photo_front} alt="ID proof front side" />
                <span>Front side</span>
              </button>
            )}
            {tenant.id_photo_back && (
              <button
                type="button"
                className="tenant-document-card"
                onClick={() => setFullScreenImage({ src: tenant.id_photo_back!, label: 'ID proof — Back side' })}
              >
                <img src={tenant.id_photo_back} alt="ID proof back side" />
                <span>Back side</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="finance-panel">
        <div>
          <span>
            Paid this month
          </span>

          <strong className="success-text">
            {money(paid)}
          </strong>
        </div>

        <div>
          <span>
            Pending
          </span>

          <strong
            className={
              pending
                ? 'danger-text'
                : 'success-text'
            }
          >
            {money(pending)}
          </strong>
        </div>
      </div>

      {fullScreenImage && (
        <div
          className="document-fullscreen-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={fullScreenImage.label}
          onClick={() => setFullScreenImage(null)}
        >
          <button
            type="button"
            className="document-fullscreen-close"
            aria-label="Close full screen document"
            onClick={() => setFullScreenImage(null)}
          >
            ×
          </button>
          <div className="document-fullscreen-content" onClick={(e) => e.stopPropagation()}>
            <img src={fullScreenImage.src} alt={fullScreenImage.label} />
            <span>{fullScreenImage.label}</span>
          </div>
        </div>
      )}

      <div className="detail-section">
        <div className="section-heading">
          <div>
            <h3>
              Payment History
            </h3>

            <p>
              {
                payments.length
              }{' '}
              payment
              {payments.length !==
              1
                ? 's'
                : ''}
            </p>
          </div>
        </div>

        {payments.length ===
        0 ? (
          <div className="small-empty">
            No payments recorded
            yet.
          </div>
        ) : (
          payments
            .slice()
            .sort(
              (a, b) =>
                new Date(
                  b.payment_date,
                ).getTime() -
                new Date(
                  a.payment_date,
                ).getTime(),
            )
            .map(
              (payment) => (
                <div
                  className="history-row"
                  key={
                    payment.id
                  }
                >
                  <div>
                    <strong>
                      {money(
                        payment.amount,
                      )}
                    </strong>

                    <span>
                      {
                        payment.payment_month
                      }
                    </span>

                    {payment.invoice_number && (
                      <span>
                        {
                          payment.invoice_number
                        }
                      </span>
                    )}
                  </div>

                  <div>
                    <strong>
                      {
                        payment.payment_method
                      }
                    </strong>

                    <span>
                      {formatDate(
                        payment.payment_date,
                      )}
                    </span>
                  </div>
                </div>
              ),
            )
        )}
      </div>

      <button
        className="btn-secondary full-btn"
        onClick={
          onClose
        }
      >
        Close
      </button>
    </div>
  );
}

function BottomNav({
  activeTab,
  setActiveTab,
}: {
  activeTab: Tab;
  setActiveTab: (
    tab: Tab,
  ) => void;
}) {
  const items: [
    Tab,
    string,
    string,
  ][] = [
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
  ];

  return (
    <nav className="bottom-nav">
      {items.map(
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
                ? 'nav-item active'
                : 'nav-item'
            }
            onClick={() =>
              setActiveTab(
                tab,
              )
            }
          >
            <span className="nav-icon">
              {icon}
            </span>

            <small className="nav-label">
              {label}
            </small>
          </button>
        ),
      )}
    </nav>
  );
}

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      onClick={
        onClose
      }
    >
      <div
        className="modal-card"
        onClick={(e) =>
          e.stopPropagation()
        }
      >
        {children}
      </div>
    </div>
  );
}

function ModalTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="modal-title">
      <h2>{title}</h2>
      <p>
        {subtitle}
      </p>
    </div>
  );
}

function ModalButtons({
  saving,
  onCancel,
}: {
  saving: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="modal-actions">
      <button
        type="button"
        className="btn-secondary"
        onClick={
          onCancel
        }
        disabled={
          saving
        }
      >
        Cancel
      </button>

      <button
        type="submit"
        className="btn-primary"
        disabled={
          saving
        }
      >
        {saving
          ? 'Saving...'
          : 'Save'}
      </button>
    </div>
  );
}

function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h2>
          {title}
        </h2>

        <p>
          {subtitle}
        </p>
      </div>

      {action}
    </div>
  );
}

function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>
          {title}
        </h2>

        <p>
          {subtitle}
        </p>
      </div>

      {action}
    </div>
  );
}

function Metric({
  icon,
  value,
  label,
}: {
  icon: string;
  value: string;
  label: string;
}) {
  return (
    <div className="metric-tile">
      <div className="tile-icon">
        {icon}
      </div>

      <div className="tile-value">
        {value}
      </div>

      <div className="tile-label">
        {label}
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="quick-action"
      onClick={
        onClick
      }
    >
      <span>
        {icon}
      </span>

      <small>
        {label}
      </small>
    </button>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="mini-metric">
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized =
    normalize(status);

  return (
    <span
      className={`status ${normalized}`}
    >
      {status.charAt(0).toUpperCase() +
        status.slice(1)}
    </span>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="detail-item">
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}

function AnalyticsRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="analytics-row">
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}

function EmptyCard({
  icon,
  title,
  text,
  action,
}: {
  icon?: string;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass-card empty-card">
      {icon && (
        <div className="empty-icon">
          {icon}
        </div>
      )}

      <h3>
        {title}
      </h3>

      <p>
        {text}
      </p>

      {action}
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