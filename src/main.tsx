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

interface VacancyBed extends Bed {
  potential_monthly_rent: number;
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

interface Expense {
  id: number;
  property_id?: number | null;
  property_name?: string;
  category: string;
  amount: number;
  expense_date: string;
  note?: string;
}

interface MaintenanceTicket {
  id: number;
  property_id?: number | null;
  room_id?: number | null;
  bed_id?: number | null;
  property_name?: string;
  room_number?: string;
  bed_number?: string;
  category?: string;
  description?: string;
  actual_cost?: number;
  due_date?: string;
  status?: string;
  priority?: string;
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
  expenses: number;
  net: number;
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
  | 'reassign'
  | 'accountSettings'
  | 'expenses'
  | 'maintenance';

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
  const [dashboardFinance, setDashboardFinance] =
    useState<{ expenses: number; net: number }>({ expenses: 0, net: 0 });
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [maintenanceTickets, setMaintenanceTickets] =
    useState<MaintenanceTicket[]>([]);

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

  const [invoiceStatusFilter, setInvoiceStatusFilter] =
    useState<'all' | 'pending' | 'overdue' | 'paid' | 'cancelled'>('all');

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

  const [reassignTenantId, setReassignTenantId] = useState<number | null>(null);
  const [reassignPropertyId, setReassignPropertyId] = useState('');
  const [reassignRoomId, setReassignRoomId] = useState('');
  const [reassignBedId, setReassignBedId] = useState('');

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
        apiRequest<{ expenses?: number; net?: number }>('/nivaasi-upgrades/finance'),
        apiRequest<{ expenses: Expense[] }>('/expenses'),
        apiRequest<MaintenanceTicket[]>('/maintenance'),
      ]);

    const [
      propertyResult,
      roomResult,
      bedResult,
      tenantResult,
      paymentResult,
      invoiceResult,
      structureResult,
      financeResult,
      expensesResult,
      maintenanceResult,
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

    if (financeResult.status === 'fulfilled') {
      const expenses = Number(financeResult.value?.expenses || 0);
      setDashboardFinance({
        expenses,
        net: Number(financeResult.value?.net ?? 0),
      });
    } else {
      setDashboardFinance({ expenses: 0, net: 0 });
      errors.push(
        `Finance: ${financeResult.reason instanceof Error
          ? financeResult.reason.message
          : 'Failed'}`,
      );
    }

    if (expensesResult.status === 'fulfilled') {
      setExpenses(expensesResult.value?.expenses || []);
    } else {
      setExpenses([]);
      errors.push(
        `Expenses: ${expensesResult.reason instanceof Error
          ? expensesResult.reason.message
          : 'Failed'}`,
      );
    }

    if (maintenanceResult.status === 'fulfilled') {
      setMaintenanceTickets(maintenanceResult.value || []);
    } else {
      setMaintenanceTickets([]);
      errors.push(
        `Maintenance: ${maintenanceResult.reason instanceof Error
          ? maintenanceResult.reason.message
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
    setExpenses([]);
    setMaintenanceTickets([]);

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

    setReassignTenantId(null);
    setReassignPropertyId('');
    setReassignRoomId('');
    setReassignBedId('');

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

  const openVacantBedAssignment = (bed: VacancyBed) => {
    const room = rooms.find(
      (item) => Number(item.id) === Number(bed.room_id),
    );

    if (!room) {
      setError('Could not find the room for this vacant bed.');
      return;
    }

    setTenantPropertyId(String(bed.property_id || room.property_id));
    setTenantRoomId(String(bed.room_id));
    setTenantBedId(String(bed.id));
    setTenantRent(String(Number(bed.potential_monthly_rent || room.rent_amount || 0)));
    setTenantName('');
    setTenantPhone('');
    setTenantGender('');
    setTenantIdProofType('');
    setTenantIdPhotoFront('');
    setTenantIdPhotoBack('');
    setTenantEmail('');
    setTenantDueDate('5');
    setTenantDeposit('');
    setTenantMoveInDate(today());
    setError('');
    setActiveModal('tenant');
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
      const created = await apiRequest<{
        property: Property;
      }>('/properties', {
        method: 'POST',
        body: JSON.stringify({
          name: propName.trim(),
          address: propAddress.trim(),
          property_type: propType,
          rent_cycle: rentCycle,
        }),
      });

      const createdPropertyId = Number(created.property?.id || 0);

      resetForms();

      if (createdPropertyId) {
        // Continue directly into room setup. The backend automatically
        // creates the required beds from the selected sharing type.
        setRoomPropertyId(String(createdPropertyId));
        setRoomFloorName('Ground Floor');
        setActiveModal('room');
      } else {
        closeModal();
      }

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

  const openReassignTenant = (tenant: Tenant) => {
    setReassignTenantId(tenant.id);
    setReassignPropertyId(String(tenant.property_id || ''));
    setReassignRoomId(String(tenant.room_id || ''));
    setReassignBedId(String(tenant.bed_id || ''));
    setError('');
    setActiveModal('reassign');
  };

  const handleReassignTenant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reassignTenantId || !reassignPropertyId) { setError('Please select a property.'); return; }
    if (!reassignRoomId || !reassignBedId) { setError('Please select a room and an available bed.'); return; }
    setSaving(true); setError('');
    try {
      await apiRequest('/tenants/' + reassignTenantId + '/reassign', {
        method: 'PATCH',
        body: JSON.stringify({ property_id: Number(reassignPropertyId), room_id: Number(reassignRoomId), bed_id: Number(reassignBedId) }),
      });
      resetForms(); closeModal(); await loadAllData();
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to change room or bed.'); }
    finally { setSaving(false); }
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
        (tenant) => {
          const status = normalize(tenant.status);
          return status === 'active' || status === 'move out notice';
        },
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

  const upcomingMoveOuts =
    useMemo(
      () =>
        activeTenants
          .filter((tenant) => {
            if (!tenant.move_out_date) return false;
            const date = new Date(tenant.move_out_date);
            if (Number.isNaN(date.getTime())) return false;
            const todayDate = new Date();
            todayDate.setHours(0, 0, 0, 0);
            date.setHours(0, 0, 0, 0);
            return date >= todayDate;
          })
          .sort(
            (a, b) =>
              new Date(a.move_out_date || '').getTime() -
              new Date(b.move_out_date || '').getTime(),
          )
          .slice(0, 5),
      [activeTenants],
    );

  const reassignRooms = rooms.filter((room) => !reassignPropertyId || Number(room.property_id) === Number(reassignPropertyId));
  const reassignBeds = beds.filter((bed) => !reassignRoomId || Number(bed.room_id) === Number(reassignRoomId));
  const reassignAvailableBeds = reassignBeds.filter((bed) => !bed.is_occupied || Number(bed.id) === Number(reassignBedId));

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

  const vacancyBeds = useMemo(
    () => beds.filter((bed) => !bed.is_occupied),
    [beds],
  );

  const vacancyBedDetails = useMemo<VacancyBed[]>(
    () =>
      vacancyBeds.map((bed) => {
        const room = rooms.find(
          (item) => Number(item.id) === Number(bed.room_id),
        );
        const roomBeds = beds.filter(
          (item) => Number(item.room_id) === Number(bed.room_id),
        );
        const bedCount = roomBeds.length || Number(room?.bed_count || 0);
        // rent_amount is the monthly rent for one bed in the room.
        // Each vacant bed therefore represents one full bed rent.
        const roomRentPerBed = Number(room?.rent_amount || 0);
        const potentialMonthlyRent = roomRentPerBed;

        return {
          ...bed,
          room_number: bed.room_number || room?.room_number,
          property_id: bed.property_id || room?.property_id,
          property_name: bed.property_name || room?.property_name,
          potential_monthly_rent: potentialMonthlyRent,
        };
      }),
    [beds, rooms, vacancyBeds],
  );

  const vacancyPotentialRevenue = useMemo(
    () =>
      vacancyBedDetails.reduce(
        (sum, bed) => sum + Number(bed.potential_monthly_rent || 0),
        0,
      ),
    [vacancyBedDetails],
  );

  const propertyProfitability = useMemo(
    () =>
      properties.map((property) => {
        const propertyTenants = tenants.filter(
          (tenant) =>
            Number(tenant.property_id) === Number(property.id),
        );
        const tenantIds = new Set(
          propertyTenants.map((tenant) => Number(tenant.id)),
        );
        const propertyPayments = payments
          .filter(
            (payment) =>
              tenantIds.has(Number(payment.tenant_id)) &&
              normalize(payment.payment_month) ===
                normalize(currentMonthName()),
          )
          .reduce(
            (sum, payment) =>
              sum + Number(payment.amount || 0),
            0,
          );
        const propertyExpenses = expenses
          .filter(
            (expense) =>
              Number(expense.property_id) === Number(property.id) &&
              String(expense.expense_date || '').slice(0, 7) ===
                today().slice(0, 7),
          )
          .reduce(
            (sum, expense) =>
              sum + Number(expense.amount || 0),
            0,
          );
        const propertyBeds = beds.filter(
          (bed) =>
            Number(bed.property_id) === Number(property.id),
        );
        const occupied = propertyBeds.filter(
          (bed) => Boolean(bed.is_occupied),
        ).length;
        const occupancyRate =
          propertyBeds.length > 0
            ? Math.round(
                (occupied / propertyBeds.length) * 100,
              )
            : 0;

        return {
          id: property.id,
          name: property.name,
          collected: propertyPayments,
          expenses: propertyExpenses,
          net: propertyPayments - propertyExpenses,
          occupancy: occupancyRate,
        };
      }),
    [beds, expenses, payments, properties, tenants],
  );

  const openMaintenanceTickets = useMemo(
    () => maintenanceTickets.filter((ticket) => {
      const status = normalize(ticket.status);
      return status !== 'resolved' && status !== 'closed' && status !== 'cancelled';
    }).slice(0, 5),
    [maintenanceTickets],
  );

  const handleMarkInvoicePaid = (invoice: Invoice) => {
    if (normalize(invoice.status) === 'paid') return;

    const balance = Math.max(
      Number(invoice.balance_amount ?? Number(invoice.amount || 0) - Number(invoice.paid_amount || 0)),
      0,
    );

    if (balance <= 0) return;
    setError('');

    // Confirm the payment on the server, then redirect to the
    // successful-payment WhatsApp invoice message.
    // Use a native form POST so mobile browsers do not block the
    // WhatsApp navigation after an awaited fetch request.
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${API}/payment-automation/invoices/${invoice.id}/mark-paid?redirect=whatsapp`;
    form.style.display = 'none';
    document.body.appendChild(form);
    form.submit();
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

        const matchesSearch =
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
          ).includes(query);

        const matchesStatus =
          invoiceStatusFilter === 'all' ||
          normalize(invoice.status) === invoiceStatusFilter;

        return matchesSearch && matchesStatus;
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
        expenses: dashboardFinance.expenses,
        net: dashboardFinance.net,
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
    }, [invoices, dashboardFinance]);

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

        const result =
          await apiRequest<{
            url: string;
          }>(
            `/payment-automation/invoices/${invoice.id}/whatsapp-link`,
          );

        window.open(
          result.url,
          '_blank',
        );

        await loadAllData();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to open WhatsApp.',
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

  const handleTenantMoveOut = async (tenant: Tenant) => {
    const noticeDate = new Date();
    noticeDate.setMonth(noticeDate.getMonth() + 1);
    const noticeDateText = noticeDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    if (!window.confirm(
      `Start a 1-month move-out notice for ${tenant.name}?\\n\\nExpected move-out date: ${noticeDateText}.\\nThe tenant remains active during the notice period.\\n\\nContinue?`,
    )) return;

    try {
      const result = await apiRequest<{ tenant: Tenant }>(
        `/tenants/${tenant.id}/move-out`,
        { method: 'POST' },
      );
      setSelectedTenant({
        ...tenant,
        ...result.tenant,
      });
      setError('');
      await loadAllData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to start move-out notice.',
      );
    }
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
        onExpenses={() => openModal('expenses')}
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
        onExpenses={() => openModal('expenses')}
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
            upcomingMoveOuts={
              upcomingMoveOuts
            }
            recentPayments={
              recentPayments
            }
            dashboardFinance={dashboardFinance}
            vacancyBeds={vacancyBeds}
            vacancyBedDetails={vacancyBedDetails}
            vacancyPotentialRevenue={vacancyPotentialRevenue}
            openMaintenanceTickets={openMaintenanceTickets}
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
            openVacantBedAssignment={
              openVacantBedAssignment
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
            setBedRoomId={setBedRoomId}
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
            onMoveOut={handleTenantMoveOut}
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
            statusFilter={invoiceStatusFilter}
            setStatusFilter={setInvoiceStatusFilter}
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
            propertyProfitability={
              propertyProfitability
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
                title="Step 1 · Add Property"
                subtitle="Create the property. Next, Peacely will take you directly to room setup."
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
                subtitle="Optional: add a floor name for better room organization."
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
                title="Step 2 · Add Room"
                subtitle="Choose sharing. Peacely will automatically create the required beds."
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
                placeholder="Monthly rent (auto-filled from room)"
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
                subtitle="Use this only when you need an additional bed beyond the sharing setup."
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
                subtitle="Add the tenant, then assign them to an available room and bed."
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
                disabled={!tenantPropertyId}
                onChange={(e) => {
                  const nextRoomId = e.target.value;
                  setTenantRoomId(nextRoomId);
                  setTenantBedId('');

                  const selectedRoom = tenantRooms.find(
                    (room) => Number(room.id) === Number(nextRoomId),
                  );

                  if (
                    selectedRoom &&
                    (!tenantRent.trim() ||
                      Number(tenantRent) === 0)
                  ) {
                    setTenantRent(
                      String(Number(selectedRoom.rent_amount || 0)),
                    );
                  }
                }}
              >
                <option value="">
                  {tenantPropertyId
                    ? 'Select room'
                    : 'Select property first'}
                </option>

                {tenantRooms.map(
                  (room) => {
                    const roomBeds = beds.filter(
                      (bed) =>
                        Number(bed.room_id) === Number(room.id),
                    );
                    const availableCount = roomBeds.filter(
                      (bed) => !bed.is_occupied,
                    ).length;

                    return (
                      <option
                        key={
                          room.id
                        }
                        value={
                          room.id
                        }
                        disabled={
                          roomBeds.length > 0 &&
                          availableCount === 0
                        }
                      >
                        Room {room.room_number} · {availableCount} available
                      </option>
                    );
                  },
                )}
              </select>

              <select
                className="modal-input"
                value={
                  tenantBedId
                }
                disabled={!tenantRoomId}
                onChange={(e) =>
                  setTenantBedId(
                    e.target.value,
                  )
                }
              >
                <option value="">
                  {tenantRoomId
                    ? 'Select available bed'
                    : 'Select room first'}
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
                      Bed {bed.bed_number} · Available
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

          {activeModal === 'reassign' && reassignTenantId && (
            <form onSubmit={handleReassignTenant}>
              <ModalTitle title="Change Room & Bed" subtitle="Move this tenant to another available bed." />
              <select className="modal-input" value={reassignPropertyId} onChange={(e) => { setReassignPropertyId(e.target.value); setReassignRoomId(''); setReassignBedId(''); }}>
                <option value="">Select property</option>
                {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
              <select className="modal-input" value={reassignRoomId} disabled={!reassignPropertyId} onChange={(e) => { setReassignRoomId(e.target.value); setReassignBedId(''); }}>
                <option value="">{reassignPropertyId ? 'Select room' : 'Select property first'}</option>
                {reassignRooms.map((room) => <option key={room.id} value={room.id}>Room {room.room_number}</option>)}
              </select>
              <select className="modal-input" value={reassignBedId} disabled={!reassignRoomId} onChange={(e) => setReassignBedId(e.target.value)}>
                <option value="">{reassignRoomId ? 'Select available bed' : 'Select room first'}</option>
                {reassignAvailableBeds.map((bed) => <option key={bed.id} value={bed.id}>Bed {bed.bed_number} · Available</option>)}
              </select>
              <ModalButtons saving={saving} onCancel={closeModal} />
            </form>
          )}

          {activeModal === 'maintenance' && (
            <MaintenanceModal
              onClose={closeModal}
              properties={properties}
              rooms={rooms}
              beds={beds}
              onSaved={loadAllData}
            />
          )}

          {activeModal ===
            'accountSettings' && (
            <AccountSettingsModal
              onClose={closeModal}
              financeSummary={financeSummary}
              properties={properties}
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
                onMoveOut={handleTenantMoveOut}
                onReassign={openReassignTenant}
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
  onExpenses,
}: {
  owner: Owner | null;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onAccountSettings: () => void;
  onExpenses: () => void;
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

            <button className="profile-menu-item" type="button" onClick={() => { onExpenses(); setMenuOpen(false); }}>
              <span>💰</span><span>Expenses</span><span className="menu-chevron">›</span>
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

            <button className="profile-menu-item" type="button" onClick={() => window.open('/privacy.html', '_blank', 'noopener,noreferrer')}>
              <span>🔒</span><span>Privacy Policy</span><span className="menu-chevron">›</span>
            </button>
            <button className="profile-menu-item" type="button" onClick={() => window.open('/beta-guide.html', '_blank', 'noopener,noreferrer')}>
              <span>🧭</span><span>Beta Owner Guide</span><span className="menu-chevron">›</span>
            </button>
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
  upcomingMoveOuts,
  recentPayments,
  dashboardFinance,
  vacancyBeds,
  vacancyBedDetails,
  vacancyPotentialRevenue,
  openMaintenanceTickets,
  getTenantPending,
  getTenantPaid,
  openTenantDetails,
  openModal,
  openVacantBedAssignment,
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
  upcomingMoveOuts: Tenant[];
  recentPayments: Payment[];
  dashboardFinance: { expenses: number; net: number };
  vacancyBeds: Bed[];
  vacancyBedDetails: VacancyBed[];
  vacancyPotentialRevenue: number;
  openMaintenanceTickets: MaintenanceTicket[];
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
  openVacantBedAssignment: (
    bed: VacancyBed,
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

        <Metric
          icon="💸"
          value={money(dashboardFinance.expenses)}
          label="Expenses"
        />

        <Metric
          icon="📊"
          value={money(dashboardFinance.net)}
          label="Net Cash"
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
          label=""
          iconOnly
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

        <QuickAction
          icon="🔧"
          label="Maintenance"
          onClick={() =>
            openModal('maintenance')
          }
        />
      </div>

      {(overdueTenants.length > 0 ||
        vacancyBeds.length > 0 ||
        openMaintenanceTickets.length > 0 ||
        upcomingMoveOuts.length > 0) && (
        <div className="glass-card">
          <SectionHeading
            title="Needs Attention"
            subtitle="Issues that may need action today"
          />
          <div className="metrics-row">
            <MiniMetric label="Overdue Rent" value={overdueTenants.length} />
            <MiniMetric label="Vacant Beds" value={vacancyBeds.length} />
            <MiniMetric label="Move-outs" value={upcomingMoveOuts.length} />
            <MiniMetric label="Maintenance" value={openMaintenanceTickets.length} />
          </div>
        </div>
      )}

      <>
        <SectionHeading
          title="Vacancy"
          subtitle="Available beds and the monthly rent they represent"
          action={
            <button className="text-btn" onClick={() => setActiveTab('properties')}>
              View properties
            </button>
          }
        />
        <div className="glass-card">
          <div className="metrics-row">
            <MiniMetric label="Vacant Beds" value={vacancyBeds.length} />
            <MiniMetric
              label="Potential Monthly Revenue"
              value={money(vacancyPotentialRevenue)}
            />
          </div>
        </div>
        {vacancyBeds.length > 0 ? (
          <div className="list-card">
            {vacancyBedDetails.slice(0, 5).map((bed) => (
              <div className="list-row" key={bed.id}>
                <div className="avatar">🛏️</div>
                <div className="list-main">
                  <strong>{bed.property_name || 'Property'}</strong>
                  <span>
                    Room {bed.room_number || '-'} · Bed {bed.bed_number || '-'}
                  </span>
                  <span>
                    Lost potential: {money(bed.potential_monthly_rent)}/month
                  </span>
                </div>
                <div className="list-side">
                  <strong>{money(bed.potential_monthly_rent)}</strong>
                  <span className="status pending">Vacant</span>
                  <button
                    type="button"
                    className="mini-action"
                    onClick={() => openVacantBedAssignment(bed)}
                  >
                    Assign Tenant
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="small-empty">
            No vacant beds right now. Your current beds are occupied.
          </div>
        )}
        {vacancyBeds.length > 5 && (
          <div className="small-empty">
            Showing 5 of {vacancyBeds.length} vacant beds. Total potential monthly revenue:{' '}
            {money(vacancyPotentialRevenue)}.
          </div>
        )}
      </>

      {openMaintenanceTickets.length > 0 && (
        <>
          <SectionHeading
            title="Open Maintenance"
            subtitle="Maintenance issues still requiring attention"
            action={
              <button className="text-btn" onClick={() => openModal('maintenance')}>
                Add
              </button>
            }
          />
          <div className="list-card">
            {openMaintenanceTickets.map((ticket) => (
              <div className="list-row" key={ticket.id}>
                <div className="avatar">🔧</div>
                <div className="list-main">
                  <strong>{ticket.category || 'Maintenance'}</strong>
                  <span>
                    {ticket.property_name || 'Property'} · Room {ticket.room_number || '-'}
                    {ticket.bed_number ? ' · Bed ' + ticket.bed_number : ''}
                  </span>
                </div>
                <div className="list-side">
                  <strong>{ticket.priority || 'Medium'}</strong>
                  <span className="status pending">{ticket.status || 'Open'}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

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
        title="Upcoming Move-outs"
        subtitle="Tenants with an active move-out notice"
        action={
          <button
            className="text-btn"
            onClick={() => setActiveTab('tenants')}
          >
            View all
          </button>
        }
      />

      {upcomingMoveOuts.length === 0 ? (
        <EmptyCard
          icon="📅"
          title="No move-outs scheduled"
          text="Tenants with an active one-month move-out notice will appear here."
        />
      ) : (
        <div className="list-card">
          {upcomingMoveOuts.map((tenant) => (
            <div
              className="list-row"
              key={tenant.id}
              onClick={() => openTenantDetails(tenant)}
            >
              <div className="avatar">
                {getInitials(tenant.name)}
              </div>

              <div className="list-main">
                <strong>{tenant.name}</strong>
                <span>
                  {tenant.property_name || 'Property'} · Room {tenant.room_number || '-'}
                </span>
              </div>

              <div className="list-side">
                <strong>{formatDate(tenant.move_out_date)}</strong>
                <span className="status pending">Move Out</span>
              </div>
            </div>
          ))}
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
  setFloorPropertyId, setBedRoomId, removeBed, deleteProperty,
}: {
  properties: Property[]; rooms: Room[]; beds: Bed[]; propertyLevels: PropertyLevel[];
  managedPropertyId: number | null; setManagedPropertyId: (value: number | null) => void;
  openModal: (modal: Modal) => void; setRoomPropertyId: (value: string) => void;
  setRoomFloorName: (value: string) => void; setFloorPropertyId: (value: string) => void;
  setBedRoomId: (value: string) => void;
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
                const firstFloor = propertyLevelsForProperty[0]?.floor_name || propertyRooms[0]?.floor_name || 'Ground Floor';
                setRoomPropertyId(String(managedProperty.id));
                setRoomFloorName(firstFloor);
                openModal('room');
              }}>
                + Room
              </button>
            }
          />
          {propertyRooms.length === 0 ? (
            <div className="small-empty">No rooms added yet. Add a room to start. Beds are created automatically from the sharing type.</div>
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
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setBedRoomId(String(room.id));
                        openModal('bed');
                      }}
                    >
                      + Bed
                    </button>
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
  onMoveOut,
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
  onMoveOut: (tenant: Tenant) => void;
  onReassign: (tenant: Tenant) => void;
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

                {!tenant.move_out_date && normalize(tenant.status) !== 'inactive' && normalize(tenant.status) !== 'moved out' && (
                  <button
                    className="btn-secondary move-out-inline-btn"
                    onClick={() => onMoveOut(tenant)}
                  >
                    Move Out
                  </button>
                )}
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


function MaintenanceModal({
  onClose,
  properties,
  rooms,
  beds,
  onSaved,
}: {
  onClose: () => void;
  properties: Property[];
  rooms: Room[];
  beds: Bed[];
  onSaved: () => Promise<void>;
}) {
  const [records, setRecords] = useState<Array<{
    id: number;
    property_name?: string;
    room_number?: string;
    bed_number?: string;
    description?: string;
    category?: string;
    status?: string;
    actual_cost?: number;
    due_date?: string;
    created_at?: string;
  }>>([]);
  const [propertyId, setPropertyId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [bedId, setBedId] = useState('');
  const [category, setCategory] = useState('General');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const selectedRooms = rooms.filter(
    (room) => !propertyId || Number(room.property_id) === Number(propertyId),
  );
  const selectedBeds = beds.filter(
    (bed) => !roomId || Number(bed.room_id) === Number(roomId),
  );

  const loadRecords = async () => {
    const result = await apiRequest<any[]>('/maintenance');
    setRecords(result || []);
  };

  useEffect(() => {
    loadRecords().catch((error) => {
      setMessage(error instanceof Error ? error.message : 'Could not load maintenance history.');
    });
  }, []);

  const saveMaintenance = async () => {
    if (!propertyId || !roomId || !bedId) {
      setMessage('Select a property, room and bed.');
      return;
    }
    if (!description.trim()) {
      setMessage('Enter a maintenance description.');
      return;
    }
    const amount = Number(cost);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage('Enter a valid maintenance cost.');
      return;
    }
    if (!date) {
      setMessage('Select the maintenance date.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      await apiRequest('/maintenance', {
        method: 'POST',
        body: JSON.stringify({
          property_id: Number(propertyId),
          room_id: Number(roomId),
          bed_id: Number(bedId),
          category,
          description: description.trim(),
          actual_cost: amount,
          due_date: date,
        }),
      });
      setPropertyId('');
      setRoomId('');
      setBedId('');
      setCategory('General');
      setDescription('');
      setCost('');
      setDate(today());
      await loadRecords();
      await onSaved();
      setMessage('Maintenance recorded and added to Expenses.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save maintenance.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <ModalTitle
        title="Maintenance"
        subtitle="Record a property issue. The maintenance cost is automatically added to Expenses."
      />

      <select className="modal-input" value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setRoomId(''); setBedId(''); }}>
        <option value="">Select property</option>
        {properties.map((property) => (
          <option key={property.id} value={property.id}>{property.name}</option>
        ))}
      </select>

      <select className="modal-input" value={roomId} disabled={!propertyId} onChange={(e) => { setRoomId(e.target.value); setBedId(''); }}>
        <option value="">{propertyId ? 'Select room' : 'Select property first'}</option>
        {selectedRooms.map((room) => (
          <option key={room.id} value={room.id}>Room {room.room_number}</option>
        ))}
      </select>

      <select className="modal-input" value={bedId} disabled={!roomId} onChange={(e) => setBedId(e.target.value)}>
        <option value="">{roomId ? 'Select bed' : 'Select room first'}</option>
        {selectedBeds.map((bed) => (
          <option key={bed.id} value={bed.id}>Bed {bed.bed_number}{bed.is_occupied ? ' · Occupied' : ' · Available'}</option>
        ))}
      </select>

      <select className="modal-input" value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="General">General</option>
        <option value="Electrical">Electrical</option>
        <option value="Plumbing">Plumbing</option>
        <option value="Furniture">Furniture</option>
        <option value="Appliance">Appliance</option>
        <option value="Cleaning">Cleaning</option>
        <option value="Other">Other</option>
      </select>

      <input className="modal-input" placeholder="Describe the issue or work done" value={description} onChange={(e) => setDescription(e.target.value)} />
      <input className="modal-input" type="number" min="0.01" step="0.01" placeholder="Maintenance cost" value={cost} onChange={(e) => setCost(e.target.value)} />
      <input className="modal-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      <button type="button" className="btn-primary full-btn" onClick={saveMaintenance} disabled={saving}>
        {saving ? 'Saving...' : 'Add Maintenance'}
      </button>

      <div className="section-heading" style={{ marginTop: 18 }}>
        <div>
          <h3>Maintenance History</h3>
          <p>{records.length} record{records.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="small-empty">No maintenance records yet.</div>
      ) : (
        records.map((record) => (
          <div className="glass-card" key={record.id} style={{ marginBottom: 8 }}>
            <div className="glass-header">
              <div>
                <h3>{record.category || 'General'}</h3>
                <p>{record.property_name || 'Property'} · Room {record.room_number || '-'} · Bed {record.bed_number || '-'}</p>
              </div>
              <strong className="amount-tag">{money(Number(record.actual_cost || 0))}</strong>
            </div>
            <p style={{ margin: '8px 0 0' }}>{record.description || 'No description'}</p>
            <div className="menu-detail-row" style={{ marginTop: 8 }}>
              <span>{formatDate(record.due_date || record.created_at)}</span>
              <strong>{record.status || 'Open'}</strong>
            </div>
          </div>
        ))
      )}

      {message && <div className="small-empty">{message}</div>}
      <button type="button" className="btn-secondary full-btn" onClick={onClose} style={{ marginTop: 10 }}>Close</button>
    </div>
  );
}

function ExpensesModal({
  onClose,
  financeSummary,
  properties,
}: {
  onClose: () => void;
  financeSummary: FinanceSummary;
  properties: Property[];
}) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseCategory, setExpenseCategory] = useState('Maintenance');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(today());
  const [expensePropertyId, setExpensePropertyId] = useState('');
  const [expenseNote, setExpenseNote] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);
  const [message, setMessage] = useState('');

  const loadExpenses = async () => {
    const result = await apiRequest<{ expenses: Expense[] }>('/expenses');
    setExpenses(result.expenses || []);
  };

  useEffect(() => {
    loadExpenses().catch((error) => {
      setMessage(error instanceof Error ? error.message : 'Could not load expenses.');
    });
  }, []);

  const saveExpense = async () => {
    const amount = Number(expenseAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage('Enter a valid expense amount.');
      return;
    }

    setSavingExpense(true);
    setMessage('');
    try {
      await apiRequest('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category: expenseCategory,
          amount,
          expense_date: expenseDate,
          property_id: expensePropertyId || null,
          note: expenseNote,
        }),
      });
      setExpenseAmount('');
      setExpenseDate(today());
      setExpensePropertyId('');
      setExpenseNote('');
      await loadExpenses();
      setMessage('Expense added.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not add expense.');
    } finally {
      setSavingExpense(false);
    }
  };

  const deleteExpense = async (expense: Expense) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await apiRequest('/expenses/' + expense.id, { method: 'DELETE' });
      await loadExpenses();
      setMessage('Expense deleted.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete expense.');
    }
  };

  const totalExpenses = expenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0,
  );
  const net = financeSummary.collected - totalExpenses;

  return (
    <div>
      <ModalTitle
        title="Expenses"
        subtitle="Track your property expenses and compare them with rent collected."
      />

      <div className="small-empty">
        <strong>Add an expense</strong><br />
        Record an expense with its category, amount, date, property and optional note.
      </div>

      <select className="modal-input" value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}>
        <option value="Maintenance">Maintenance</option>
        <option value="Electricity">Electricity</option>
        <option value="Water">Water</option>
        <option value="Internet">Internet</option>
        <option value="Cleaning">Cleaning</option>
        <option value="Staff">Staff</option>
        <option value="Supplies">Supplies</option>
        <option value="Other">Other</option>
      </select>

      <input className="modal-input" type="number" min="0" step="0.01" placeholder="Expense amount" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} />

      <input className="modal-input" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />

      <select className="modal-input" value={expensePropertyId} onChange={(e) => setExpensePropertyId(e.target.value)}>
        <option value="">All / General</option>
        {properties.map((property) => (
          <option key={property.id} value={property.id}>{property.name}</option>
        ))}
      </select>

      <input className="modal-input" placeholder="Optional note" value={expenseNote} onChange={(e) => setExpenseNote(e.target.value)} />

      <button type="button" className="btn-primary full-btn" onClick={saveExpense} disabled={savingExpense}>
        {savingExpense ? 'Saving...' : 'Add Expense'}
      </button>

      <div className="small-empty" style={{ marginTop: 12 }}>
        <div className="menu-detail-row"><span>Total Expenses</span><strong>{money(totalExpenses)}</strong></div>
        <div className="menu-detail-row"><span>Rent Collected</span><strong>{money(financeSummary.collected)}</strong></div>
        <div className="menu-detail-row"><span>Collected Less Expenses</span><strong>{money(net)}</strong></div>
      </div>

      <div className="section-heading" style={{ marginTop: 18 }}>
        <div>
          <h3>Expense History</h3>
          <p>{expenses.length} expense{expenses.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      {expenses.length === 0 ? (
        <div className="small-empty">No expenses recorded yet.</div>
      ) : (
        expenses.map((expense) => (
          <div className="glass-card" key={expense.id} style={{ marginBottom: 8 }}>
            <div className="glass-header">
              <div>
                <h3>{expense.category}</h3>
                <p>{expense.property_name || 'General'} · {formatDate(expense.expense_date)}</p>
              </div>
              <strong className="amount-tag">{money(expense.amount)}</strong>
            </div>
            {expense.note && <p style={{ margin: '8px 0 0' }}>{expense.note}</p>}
            <button type="button" className="text-btn" onClick={() => deleteExpense(expense)}>
              Delete Expense
            </button>
          </div>
        ))
      )}

      {message && <div className="small-empty">{message}</div>}

      <button type="button" className="btn-secondary full-btn" onClick={onClose} style={{ marginTop: 10 }}>
        Close
      </button>
    </div>
  );
}

function AccountSettingsModal({
  onClose,
  financeSummary,
}: {
  onClose: () => void;
  financeSummary: FinanceSummary;
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
        }      } catch (error) {
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
        <strong>Payment</strong><br />
        Add the UPI ID, phone number and/or QR code you want tenants to use. Tenants pay you directly; Peacely does not collect rent.
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
        <strong>Rent Automation</strong><br />
        Monthly invoices are created automatically. When a reminder is due, use Send WhatsApp on the invoice or tenant to open a ready-to-send message.
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

      <div className="small-empty" style={{ marginTop: 18 }}>
        <strong>WhatsApp</strong><br />
        No WhatsApp API or business registration is required for Peacely at this stage. Rent automation creates invoices automatically. When a reminder is due, use Send WhatsApp on the invoice or tenant to open a ready-to-send message; you press Send.
      </div>

      <div className="small-empty" style={{ marginTop: 18 }}>
        <strong>Finance</strong><br />
        Current rent collection overview.
        <div className="menu-detail-row"><span>Expected</span><strong>{money(financeSummary.expected)}</strong></div>
        <div className="menu-detail-row"><span>Collected</span><strong>{money(financeSummary.collected)}</strong></div>
        <div className="menu-detail-row"><span>Pending</span><strong>{money(financeSummary.pending)}</strong></div>
        <div className="menu-detail-row"><span>Overdue</span><strong>{money(financeSummary.overdue)}</strong></div>
        <div className="menu-detail-row"><span>Collection rate</span><strong>{financeSummary.collection_rate}%</strong></div>
      </div>

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
  statusFilter,
  setStatusFilter,
  getBalance,
  onMarkPaid,
  markingInvoiceId,
}: {
  invoices: Invoice[];
  search: string;
  setSearch: (value: string) => void;
  statusFilter: 'all' | 'pending' | 'overdue' | 'paid' | 'cancelled';
  setStatusFilter: (value: 'all' | 'pending' | 'overdue' | 'paid' | 'cancelled') => void;
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

      <div className="filter-row">
        {([
          ['all', 'All'],
          ['pending', 'Pending'],
          ['overdue', 'Overdue'],
          ['paid', 'Paid'],
          ['cancelled', 'Cancelled'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={statusFilter === value ? 'filter-pill active' : 'filter-pill'}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="summary-strip">
        <span>{invoices.length} shown</span>
        <strong>
          {money(
            invoices.reduce(
              (sum, invoice) =>
                sum + Number(invoice.amount || 0),
              0,
            ),
          )}
        </strong>
      </div>

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
                {!isPaid && (
                  <a
                    className="btn-secondary"
                    href={API + '/payment-automation/invoices/' + invoice.id + '/whatsapp-link'}
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    Send WhatsApp
                  </a>
                )}
                {!isPaid && (
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={() => onMarkPaid(invoice)}
                    disabled={markingInvoiceId === invoice.id}
                  >
                    {markingInvoiceId === invoice.id ? 'Saving...' : 'Paid'}
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
  propertyProfitability,
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
  propertyProfitability: {
    id: number;
    name: string;
    collected: number;
    expenses: number;
    net: number;
    occupancy: number;
  }[];
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
          Property Profitability · This Month
        </h3>

        {propertyProfitability.length === 0 ? (
          <div className="small-empty">
            Add a property to see property-level financial performance.
          </div>
        ) : (
          <div className="analytics-list">
            {propertyProfitability.map((property) => (
              <div className="analytics-row" key={property.id}>
                <div>
                  <strong>{property.name}</strong>
                  <span style={{ display: 'block', marginTop: '4px' }}>
                    {property.occupancy}% occupied · {money(property.collected)} collected · {money(property.expenses)} expenses
                  </span>
                </div>
                <strong>
                  {money(property.net)}
                </strong>
              </div>
            ))}
          </div>
        )}
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
  onMoveOut,
  onReassign,
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
  onMoveOut: (tenant: Tenant) => void;
  onReassign: (tenant: Tenant) => void;
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

        <DetailItem
          label="Move Out"
          value={
            tenant.move_out_date
              ? formatDate(tenant.move_out_date)
              : 'No notice'
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

      {!tenant.move_out_date && normalize(tenant.status) !== 'inactive' && normalize(tenant.status) !== 'moved out' ? (
        <button
          type="button"
          className="btn-secondary full-btn move-out-btn"
          onClick={() => onMoveOut(tenant)}
        >
          Move Out · 1 Month Notice
        </button>
      ) : tenant.move_out_date ? (
        <div className="small-empty move-out-notice">
          <strong>Move-out notice active</strong>
          <span>Expected move-out date: {formatDate(tenant.move_out_date)}</span>
        </div>
      ) : null}

      <button type="button" className="btn-secondary full-btn" onClick={() => onReassign(tenant)}>
        Change Room / Bed
      </button>

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
    [
      'analytics',
      '📊',
      'Analytics',
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
  iconOnly,
  onClick,
}: {
  icon: string;
  label: string;
  iconOnly?: boolean;
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

      {!iconOnly && (
        <small>
          {label}
        </small>
      )}
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