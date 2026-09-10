import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import "./style.css";

type Bed = {
  id: number;
  number: string;
  occupied: boolean;
  tenantId?: number;
};

type Room = {
  id: number;
  number: string;
  beds: Bed[];
};

type Property = {
  id: number;
  name: string;
  location: string;
  rooms: Room[];
};

type Tenant = {
  id: number;
  name: string;
  phone: string;
  email: string;
  propertyId: number;
  roomId: number;
  bedId: number;
  rent: number;
  dueDay: number;
  moveInDate: string;
  deposit: number;
  status: "Active" | "Inactive";
};

type Payment = {
  id: number;
  tenantId: number;
  amount: number;
  date: string;
  month: string;
  method: string;
  note: string;
};

type Invoice = {
  id: number;
  tenantId: number;
  invoiceNumber: string;
  amount: number;
  month: string;
  dueDate: string;
  status: "Paid" | "Pending";
  createdAt: string;
};

type View =
  | "dashboard"
  | "properties"
  | "property"
  | "tenants"
  | "payments"
  | "invoices";

const API = "/api";

function formatMoney(amount: number) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthName(date = new Date()) {
  return date.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function normalizeStatus(status: string): "Active" | "Inactive" {
  return status?.toLowerCase() === "inactive" ? "Inactive" : "Active";
}

function normalizeInvoiceStatus(status: string): "Paid" | "Pending" {
  return status?.toLowerCase() === "paid" ? "Paid" : "Pending";
}

async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });

  let data: any = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
        data?.message ||
        `Request failed with status ${response.status}`
    );
  }

  return data as T;
}

function Peacely() {
  const [view, setView] = useState<View>("dashboard");

  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");

  const [selectedPropertyId, setSelectedPropertyId] =
    useState<number | null>(null);

  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [showTenantForm, setShowTenantForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const [propertyName, setPropertyName] = useState("");
  const [propertyLocation, setPropertyLocation] = useState("");

  const [roomNumber, setRoomNumber] = useState("");
  const [bedCount, setBedCount] = useState("2");

  const [tenantName, setTenantName] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantPropertyId, setTenantPropertyId] = useState("");
  const [tenantRoomId, setTenantRoomId] = useState("");
  const [tenantBedId, setTenantBedId] = useState("");
  const [tenantRent, setTenantRent] = useState("");
  const [tenantDueDay, setTenantDueDay] = useState("5");
  const [tenantMoveIn, setTenantMoveIn] = useState(today());
  const [tenantDeposit, setTenantDeposit] = useState("");

  const [paymentTenantId, setPaymentTenantId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [paymentMonth, setPaymentMonth] = useState(monthName());
  const [paymentNote, setPaymentNote] = useState("");

  const [tenantSearch, setTenantSearch] = useState("");

  async function loadAllData() {
    try {
      setApiError("");

      const [
        propertiesResponse,
        tenantsResponse,
        paymentsResponse,
        invoicesResponse,
      ] = await Promise.all([
        apiRequest<any[]>("/properties"),
        apiRequest<any[]>("/tenants"),
        apiRequest<any[]>("/payments"),
        apiRequest<any[]>("/invoices"),
      ]);

      const propertiesWithRooms: Property[] = await Promise.all(
        (propertiesResponse || []).map(async (property) => {
          const roomsResponse = await apiRequest<any[]>(
            `/properties/${property.id}/rooms`
          );

          const rooms: Room[] = await Promise.all(
            (roomsResponse || []).map(async (room) => {
              const bedsResponse = await apiRequest<any[]>(
                `/rooms/${room.id}/beds`
              );

              return {
                id: Number(room.id),
                number: String(room.room_number),
                beds: (bedsResponse || []).map((bed) => ({
                  id: Number(bed.id),
                  number: String(bed.bed_number),
                  occupied: Boolean(bed.occupied),
                })),
              };
            })
          );

          return {
            id: Number(property.id),
            name: property.name,
            location: property.location || "",
            rooms,
          };
        })
      );

      const normalizedTenants: Tenant[] = (
        tenantsResponse || []
      ).map((tenant) => ({
        id: Number(tenant.id),
        name: tenant.name,
        phone: tenant.phone || "",
        email: tenant.email || "",
        propertyId: Number(tenant.property_id || 0),
        roomId: Number(tenant.room_id || 0),
        bedId: Number(tenant.bed_id || 0),
        rent: Number(tenant.rent || 0),
        dueDay: Number(tenant.due_day || 5),
        moveInDate: tenant.move_in_date
          ? String(tenant.move_in_date).slice(0, 10)
          : "",
        deposit: Number(tenant.deposit || 0),
        status: normalizeStatus(tenant.status),
      }));

      const updatedProperties = propertiesWithRooms.map((property) => ({
        ...property,
        rooms: property.rooms.map((room) => ({
          ...room,
          beds: room.beds.map((bed) => {
            const tenant = normalizedTenants.find(
              (item) =>
                item.propertyId === property.id &&
                item.roomId === room.id &&
                item.bedId === bed.id
            );

            return {
              ...bed,
              tenantId: tenant?.id,
              occupied: tenant ? true : bed.occupied,
            };
          }),
        })),
      }));

      const normalizedPayments: Payment[] = (
        paymentsResponse || []
      ).map((payment) => ({
        id: Number(payment.id),
        tenantId: Number(payment.tenant_id),
        amount: Number(payment.amount || 0),
        date: payment.payment_date
          ? String(payment.payment_date).slice(0, 10)
          : "",
        month: payment.month || "",
        method: payment.method || "",
        note: payment.note || "",
      }));

      const normalizedInvoices: Invoice[] = (
        invoicesResponse || []
      ).map((invoice) => ({
        id: Number(invoice.id),
        tenantId: Number(invoice.tenant_id),
        invoiceNumber: invoice.invoice_number,
        amount: Number(invoice.amount || 0),
        month: invoice.month || "",
        dueDate: invoice.due_date
          ? String(invoice.due_date).slice(0, 10)
          : "",
        status: normalizeInvoiceStatus(invoice.status),
        createdAt: invoice.created_at
          ? String(invoice.created_at).slice(0, 10)
          : "",
      }));

      setProperties(updatedProperties);
      setTenants(normalizedTenants);
      setPayments(normalizedPayments);
      setInvoices(normalizedInvoices);
    } catch (error) {
      console.error("Peacely data loading error:", error);

      setApiError(
        error instanceof Error
          ? error.message
          : "Unable to connect to Peacely database"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAllData();
  }, []);

  const selectedProperty = properties.find(
    (property) => property.id === selectedPropertyId
  );

  const totalRooms = properties.reduce(
    (total, property) => total + property.rooms.length,
    0
  );

  const totalBeds = properties.reduce(
    (total, property) =>
      total +
      property.rooms.reduce(
        (roomTotal, room) => roomTotal + room.beds.length,
        0
      ),
    0
  );

  const occupiedBeds = properties.reduce(
    (total, property) =>
      total +
      property.rooms.reduce(
        (roomTotal, room) =>
          roomTotal + room.beds.filter((bed) => bed.occupied).length,
        0
      ),
    0
  );

  const vacantBeds = totalBeds - occupiedBeds;

  const activeTenants = tenants.filter(
    (tenant) => tenant.status === "Active"
  );

  const monthlyExpectedRent = activeTenants.reduce(
    (total, tenant) => total + tenant.rent,
    0
  );

  const currentMonth = monthName();

  const currentMonthPayments = payments
    .filter((payment) => payment.month === currentMonth)
    .reduce((total, payment) => total + payment.amount, 0);

  const pendingInvoices = invoices.filter(
    (invoice) => invoice.status === "Pending"
  );

  const pendingAmount = pendingInvoices.reduce(
    (total, invoice) => total + invoice.amount,
    0
  );

  const filteredTenants = useMemo(() => {
    const search = tenantSearch.toLowerCase().trim();

    if (!search) return tenants;

    return tenants.filter(
      (tenant) =>
        tenant.name.toLowerCase().includes(search) ||
        tenant.phone.includes(search)
    );
  }, [tenants, tenantSearch]);

  const tenantProperty = properties.find(
    (property) => property.id === Number(tenantPropertyId)
  );

  const availableRooms = tenantProperty?.rooms || [];

  const tenantRoom = tenantProperty?.rooms.find(
    (room) => room.id === Number(tenantRoomId)
  );

  const availableBeds =
    tenantRoom?.beds.filter((bed) => !bed.occupied) || [];

  function navigate(nextView: View) {
    setView(nextView);
    setSelectedPropertyId(null);
  }

  async function addProperty() {
    if (!propertyName.trim() || !propertyLocation.trim()) return;

    try {
      await apiRequest("/properties", {
        method: "POST",
        body: JSON.stringify({
          name: propertyName.trim(),
          location: propertyLocation.trim(),
        }),
      });

      setPropertyName("");
      setPropertyLocation("");
      setShowPropertyForm(false);

      await loadAllData();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to create property"
      );
    }
  }

  async function addRoom() {
    if (!selectedProperty || !roomNumber.trim()) return;

    try {
      const count = Math.max(
        1,
        Math.min(10, Number(bedCount) || 1)
      );

      await apiRequest(`/properties/${selectedProperty.id}/rooms`, {
        method: "POST",
        body: JSON.stringify({
          roomNumber: roomNumber.trim(),
          bedCount: count,
        }),
      });

      setRoomNumber("");
      setBedCount("2");
      setShowRoomForm(false);

      await loadAllData();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to create room"
      );
    }
  }

  async function addTenant() {
    if (
      !tenantName.trim() ||
      !tenantPhone.trim() ||
      !tenantPropertyId ||
      !tenantRoomId ||
      !tenantBedId ||
      !tenantRent
    ) {
      alert("Please fill all required tenant details.");
      return;
    }

    try {
      await apiRequest("/tenants", {
        method: "POST",
        body: JSON.stringify({
          name: tenantName.trim(),
          phone: tenantPhone.trim(),
          email: tenantEmail.trim() || null,
          ownerId: null,
          propertyId: Number(tenantPropertyId),
          roomId: Number(tenantRoomId),
          bedId: Number(tenantBedId),
          rent: Number(tenantRent),
          dueDay: Number(tenantDueDay) || 5,
          moveInDate: tenantMoveIn,
          deposit: Number(tenantDeposit) || 0,
          status: "active",
        }),
      });

      setTenantName("");
      setTenantPhone("");
      setTenantEmail("");
      setTenantRent("");
      setTenantDueDay("5");
      setTenantMoveIn(today());
      setTenantDeposit("");
      setTenantPropertyId("");
      setTenantRoomId("");
      setTenantBedId("");
      setShowTenantForm(false);

      await loadAllData();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to create tenant"
      );
    }
  }

  async function recordPayment() {
    if (!paymentTenantId || !paymentAmount) {
      alert("Please select a tenant and enter an amount.");
      return;
    }

    try {
      const tenantId = Number(paymentTenantId);

      await apiRequest("/payments", {
        method: "POST",
        body: JSON.stringify({
          tenantId,
          amount: Number(paymentAmount),
          paymentDate: today(),
          month: paymentMonth,
          method: paymentMethod,
          note: paymentNote.trim() || "Monthly rent",
        }),
      });

      const matchingInvoice = invoices.find(
        (invoice) =>
          invoice.tenantId === tenantId &&
          invoice.month === paymentMonth &&
          invoice.status === "Pending"
      );

      if (matchingInvoice) {
        await apiRequest(`/invoices/${matchingInvoice.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "paid",
          }),
        });
      }

      setPaymentTenantId("");
      setPaymentAmount("");
      setPaymentMethod("UPI");
      setPaymentMonth(monthName());
      setPaymentNote("");
      setShowPaymentForm(false);

      await loadAllData();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to record payment"
      );
    }
  }

  async function createInvoice(tenant: Tenant) {
    const invoiceMonth = monthName();

    const alreadyExists = invoices.some(
      (invoice) =>
        invoice.tenantId === tenant.id &&
        invoice.month === invoiceMonth
    );

    if (alreadyExists) {
      alert("Invoice already exists for this month.");
      return;
    }

    try {
      const invoiceNumber = `INV-${Date.now()}`;

      const dueDate = `${today().slice(0, 8)}${String(
        tenant.dueDay
      ).padStart(2, "0")}`;

      await apiRequest("/invoices", {
        method: "POST",
        body: JSON.stringify({
          tenantId: tenant.id,
          invoiceNumber,
          amount: tenant.rent,
          month: invoiceMonth,
          dueDate,
          status: "pending",
        }),
      });

      await loadAllData();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to create invoice"
      );
    }
  }

  function tenantNameById(id: number) {
    return (
      tenants.find((tenant) => tenant.id === id)?.name ||
      "Unknown"
    );
  }

  function propertyNameById(id: number) {
    return (
      properties.find((property) => property.id === id)?.name ||
      "-"
    );
  }

  function roomNameById(propertyId: number, roomId: number) {
    const property = properties.find(
      (item) => item.id === propertyId
    );

    return (
      property?.rooms.find((room) => room.id === roomId)?.number ||
      "-"
    );
  }

  function bedNameById(
    propertyId: number,
    roomId: number,
    bedId: number
  ) {
    const property = properties.find(
      (item) => item.id === propertyId
    );

    const room = property?.rooms.find(
      (item) => item.id === roomId
    );

    return (
      room?.beds.find((bed) => bed.id === bedId)?.number || "-"
    );
  }

  function openTenantForm(
    propertyId = "",
    roomId = "",
    bedId = ""
  ) {
    setTenantPropertyId(String(propertyId));
    setTenantRoomId(String(roomId));
    setTenantBedId(String(bedId));
    setShowTenantForm(true);
  }

  function openPaymentForm(tenantId = "") {
    setPaymentTenantId(String(tenantId));
    setShowPaymentForm(true);
  }

  function propertyOccupancy(property: Property) {
    const beds = property.rooms.flatMap((room) => room.beds);
    const occupied = beds.filter((bed) => bed.occupied).length;

    return {
      total: beds.length,
      occupied,
      vacant: beds.length - occupied,
    };
  }

  if (loading) {
    return (
      <div className="app-shell">
        <div className="loading-screen">
          <div className="loading-card">
            <div className="logo-mark">P</div>
            <h1>Peacely</h1>
            <p>Connecting to your database...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo-mark">P</div>
          <div>
            <h2>Peacely</h2>
            <span>Property Manager</span>
          </div>
        </div>

        <nav className="nav-menu">
          <button
            className={view === "dashboard" ? "active" : ""}
            onClick={() => navigate("dashboard")}
          >
            🏠 Dashboard
          </button>

          <button
            className={
              view === "properties" || view === "property"
                ? "active"
                : ""
            }
            onClick={() => navigate("properties")}
          >
            🏢 Properties
          </button>

          <button
            className={view === "tenants" ? "active" : ""}
            onClick={() => navigate("tenants")}
          >
            👥 Tenants
          </button>

          <button
            className={view === "payments" ? "active" : ""}
            onClick={() => navigate("payments")}
          >
            💳 Payments
          </button>

          <button
            className={view === "invoices" ? "active" : ""}
            onClick={() => navigate("invoices")}
          >
            🧾 Invoices
          </button>
        </nav>

        <div className="sidebar-footer">
          <span>Peace of mind.</span>
          <strong>Powered by Peacely</strong>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h1>
              {view === "dashboard" && "Dashboard"}
              {view === "properties" && "Properties"}
              {view === "property" && selectedProperty?.name}
              {view === "tenants" && "Tenants"}
              {view === "payments" && "Payments"}
              {view === "invoices" && "Invoices"}
            </h1>

            <p>
              {view === "dashboard"
                ? "Everything you need to manage your properties."
                : "Manage your rental operations with ease."}
            </p>
          </div>

          <div className="topbar-actions">
            <button
              className="primary-button"
              onClick={() => setShowPropertyForm(true)}
            >
              + Add Property
            </button>
          </div>
        </header>

        {apiError && (
          <div className="error-banner">
            ⚠️ {apiError}
          </div>
        )}

        {view === "dashboard" && (
          <section className="page">
            <div className="stats-grid">
              <div className="stat-card">
                <span>Properties</span>
                <strong>{properties.length}</strong>
                <small>Total properties</small>
              </div>

              <div className="stat-card">
                <span>Rooms</span>
                <strong>{totalRooms}</strong>
                <small>Total rooms</small>
              </div>

              <div className="stat-card">
                <span>Occupied Beds</span>
                <strong>{occupiedBeds}</strong>
                <small>{vacantBeds} vacant</small>
              </div>

              <div className="stat-card">
                <span>Active Tenants</span>
                <strong>{activeTenants.length}</strong>
                <small>Currently staying</small>
              </div>

              <div className="stat-card">
                <span>Expected Rent</span>
                <strong>{formatMoney(monthlyExpectedRent)}</strong>
                <small>Monthly</small>
              </div>

              <div className="stat-card">
                <span>Collected</span>
                <strong>{formatMoney(currentMonthPayments)}</strong>
                <small>{currentMonth}</small>
              </div>

              <div className="stat-card">
                <span>Pending</span>
                <strong>{formatMoney(pendingAmount)}</strong>
                <small>Pending invoices</small>
              </div>
            </div>

            <div className="dashboard-grid">
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Properties</h2>
                    <p>Your rental properties</p>
                  </div>

                  <button
                    className="secondary-button"
                    onClick={() => navigate("properties")}
                  >
                    View all
                  </button>
                </div>

                {properties.length === 0 ? (
                  <div className="empty-state">
                    <div>🏢</div>
                    <h3>No properties yet</h3>
                    <p>Add your first property to get started.</p>
                    <button
                      className="primary-button"
                      onClick={() => setShowPropertyForm(true)}
                    >
                      Add Property
                    </button>
                  </div>
                ) : (
                  <div className="property-list">
                    {properties.slice(0, 5).map((property) => {
                      const occupancy = propertyOccupancy(property);

                      return (
                        <button
                          className="property-row"
                          key={property.id}
                          onClick={() => {
                            setSelectedPropertyId(property.id);
                            setView("property");
                          }}
                        >
                          <div className="property-icon">🏠</div>

                          <div className="property-info">
                            <strong>{property.name}</strong>
                            <span>{property.location}</span>
                          </div>

                          <div className="property-meta">
                            <strong>
                              {occupancy.occupied}/{occupancy.total}
                            </strong>
                            <span>occupied</span>
                          </div>

                          <span>›</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Recent Payments</h2>
                    <p>Latest rent collections</p>
                  </div>
                </div>

                {payments.length === 0 ? (
                  <div className="empty-state compact">
                    <div>💳</div>
                    <p>No payments recorded yet.</p>
                  </div>
                ) : (
                  <div className="payment-list">
                    {payments.slice(0, 6).map((payment) => (
                      <div className="payment-row" key={payment.id}>
                        <div>
                          <strong>
                            {tenantNameById(payment.tenantId)}
                          </strong>
                          <span>
                            {payment.date} · {payment.method}
                          </span>
                        </div>

                        <strong className="payment-amount">
                          {formatMoney(payment.amount)}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {view === "properties" && (
          <section className="page">
            <div className="section-actions">
              <div>
                <h2>All Properties</h2>
                <p>Manage your properties, rooms and beds.</p>
              </div>

              <button
                className="primary-button"
                onClick={() => setShowPropertyForm(true)}
              >
                + Add Property
              </button>
            </div>

            {properties.length === 0 ? (
              <div className="panel empty-state">
                <div>🏢</div>
                <h3>No properties</h3>
                <p>Create your first property.</p>
              </div>
            ) : (
              <div className="cards-grid">
                {properties.map((property) => {
                  const occupancy = propertyOccupancy(property);

                  return (
                    <div className="property-card" key={property.id}>
                      <div className="property-card-top">
                        <div className="property-icon large">🏠</div>

                        <div>
                          <h3>{property.name}</h3>
                          <p>{property.location}</p>
                        </div>
                      </div>

                      <div className="property-card-stats">
                        <div>
                          <strong>{property.rooms.length}</strong>
                          <span>Rooms</span>
                        </div>

                        <div>
                          <strong>{occupancy.total}</strong>
                          <span>Beds</span>
                        </div>

                        <div>
                          <strong>{occupancy.occupied}</strong>
                          <span>Occupied</span>
                        </div>

                        <div>
                          <strong>{occupancy.vacant}</strong>
                          <span>Vacant</span>
                        </div>
                      </div>

                      <button
                        className="secondary-button full"
                        onClick={() => {
                          setSelectedPropertyId(property.id);
                          setView("property");
                        }}
                      >
                        Manage Property →
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {view === "property" && selectedProperty && (
          <section className="page">
            <div className="section-actions">
              <div>
                <button
                  className="back-button"
                  onClick={() => navigate("properties")}
                >
                  ← Back to Properties
                </button>

                <h2>{selectedProperty.name}</h2>
                <p>{selectedProperty.location}</p>
              </div>

              <button
                className="primary-button"
                onClick={() => setShowRoomForm(true)}
              >
                + Add Room
              </button>
            </div>

            <div className="room-grid">
              {selectedProperty.rooms.length === 0 ? (
                <div className="panel empty-state">
                  <div>🚪</div>
                  <h3>No rooms yet</h3>
                  <p>Add a room and define the number of beds.</p>
                  <button
                    className="primary-button"
                    onClick={() => setShowRoomForm(true)}
                  >
                    Add Room
                  </button>
                </div>
              ) : (
                selectedProperty.rooms.map((room) => (
                  <div className="room-card" key={room.id}>
                    <div className="room-header">
                      <div>
                        <span>ROOM</span>
                        <h3>{room.number}</h3>
                      </div>

                      <span className="room-bed-count">
                        {room.beds.length} beds
                      </span>
                    </div>

                    <div className="bed-grid">
                      {room.beds.map((bed) => {
                        const tenant = tenants.find(
                          (item) => item.id === bed.tenantId
                        );

                        return (
                          <button
                            key={bed.id}
                            className={`bed ${bed.occupied ? "occupied" : "vacant"}`}
                            onClick={() => {
                              if (!bed.occupied) {
                                openTenantForm(
                                  selectedProperty.id,
                                  room.id,
                                  bed.id
                                );
                              }
                            }}
                          >
                            <strong>{bed.number}</strong>

                            <span>
                              {bed.occupied
                                ? tenant?.name || "Occupied"
                                : "Vacant"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {view === "tenants" && (
          <section className="page">
            <div className="section-actions">
              <div>
                <h2>Tenants</h2>
                <p>Manage all your active and inactive tenants.</p>
              </div>

              <button
                className="primary-button"
                onClick={() => openTenantForm()}
              >
                + Add Tenant
              </button>
            </div>

            <div className="panel">
              <input
                className="search-input"
                placeholder="Search tenant by name or phone..."
                value={tenantSearch}
                onChange={(event) =>
                  setTenantSearch(event.target.value)
                }
              />

              {filteredTenants.length === 0 ? (
                <div className="empty-state">
                  <div>👥</div>
                  <h3>No tenants found</h3>
                  <p>Add a tenant to start managing rent.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tenant</th>
                        <th>Property</th>
                        <th>Room</th>
                        <th>Bed</th>
                        <th>Rent</th>
                        <th>Due</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredTenants.map((tenant) => (
                        <tr key={tenant.id}>
                          <td>
                            <strong>{tenant.name}</strong>
                            <small>{tenant.phone}</small>
                          </td>

                          <td>
                            {propertyNameById(tenant.propertyId)}
                          </td>

                          <td>
                            {roomNameById(
                              tenant.propertyId,
                              tenant.roomId
                            )}
                          </td>

                          <td>
                            {bedNameById(
                              tenant.propertyId,
                              tenant.roomId,
                              tenant.bedId
                            )}
                          </td>

                          <td>{formatMoney(tenant.rent)}</td>

                          <td>{tenant.dueDay}</td>

                          <td>
                            <span
                              className={`status ${tenant.status.toLowerCase()}`}
                            >
                              {tenant.status}
                            </span>
                          </td>

                          <td>
                            <button
                              className="small-button"
                              onClick={() =>
                                openPaymentForm(tenant.id)
                              }
                            >
                              Pay
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {view === "payments" && (
          <section className="page">
            <div className="section-actions">
              <div>
                <h2>Payments</h2>
                <p>Track rent payments collected from tenants.</p>
              </div>

              <button
                className="primary-button"
                onClick={() => openPaymentForm()}
              >
                + Record Payment
              </button>
            </div>

            <div className="panel">
              {payments.length === 0 ? (
                <div className="empty-state">
                  <div>💳</div>
                  <h3>No payments yet</h3>
                  <p>Recorded payments will appear here.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tenant</th>
                        <th>Amount</th>
                        <th>Date</th>
                        <th>Month</th>
                        <th>Method</th>
                        <th>Note</th>
                      </tr>
                    </thead>

                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment.id}>
                          <td>
                            <strong>
                              {tenantNameById(payment.tenantId)}
                            </strong>
                          </td>

                          <td>
                            <strong>
                              {formatMoney(payment.amount)}
                            </strong>
                          </td>

                          <td>{payment.date}</td>
                          <td>{payment.month}</td>
                          <td>{payment.method}</td>
                          <td>{payment.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {view === "invoices" && (
          <section className="page">
            <div className="section-actions">
              <div>
                <h2>Invoices</h2>
                <p>Create and track monthly rent invoices.</p>
              </div>
            </div>

            <div className="panel">
              {invoices.length === 0 ? (
                <div className="empty-state">
                  <div>🧾</div>
                  <h3>No invoices yet</h3>
                  <p>
                    Generate invoices from the tenant list below.
                  </p>

                  {activeTenants.length > 0 && (
                    <button
                      className="primary-button"
                      onClick={() =>
                        createInvoice(activeTenants[0])
                      }
                    >
                      Create Invoice
                    </button>
                  )}
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Tenant</th>
                        <th>Month</th>
                        <th>Amount</th>
                        <th>Due Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {invoices.map((invoice) => (
                        <tr key={invoice.id}>
                          <td>
                            <strong>{invoice.invoiceNumber}</strong>
                          </td>

                          <td>
                            {tenantNameById(invoice.tenantId)}
                          </td>

                          <td>{invoice.month}</td>

                          <td>{formatMoney(invoice.amount)}</td>

                          <td>{invoice.dueDate}</td>

                          <td>
                            <span
                              className={`status ${invoice.status.toLowerCase()}`}
                            >
                              {invoice.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {activeTenants.length > 0 && (
              <div className="panel invoice-generator">
                <div className="panel-header">
                  <div>
                    <h2>Generate Monthly Invoice</h2>
                    <p>
                      Create an invoice for an active tenant who
                      does not already have one this month.
                    </p>
                  </div>
                </div>

                <div className="generator-grid">
                  {activeTenants.map((tenant) => {
                    const exists = invoices.some(
                      (invoice) =>
                        invoice.tenantId === tenant.id &&
                        invoice.month === currentMonth
                    );

                    return (
                      <div className="generator-row" key={tenant.id}>
                        <div>
                          <strong>{tenant.name}</strong>
                          <span>
                            {formatMoney(tenant.rent)} · Due{" "}
                            {tenant.dueDay}
                          </span>
                        </div>

                        <button
                          className="small-button"
                          disabled={exists}
                          onClick={() => createInvoice(tenant)}
                        >
                          {exists ? "Created" : "Create"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {showPropertyForm && (
        <div
          className="modal-backdrop"
          onClick={() => setShowPropertyForm(false)}
        >
          <div
            className="modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>Add Property</h2>
                <p>Create a new rental property.</p>
              </div>

              <button
                className="close-button"
                onClick={() => setShowPropertyForm(false)}
              >
                ×
              </button>
            </div>

            <div className="form">
              <label>
                Property Name
                <input
                  value={propertyName}
                  onChange={(event) =>
                    setPropertyName(event.target.value)
                  }
                  placeholder="Example: Peacely Residency"
                />
              </label>

              <label>
                Location
                <input
                  value={propertyLocation}
                  onChange={(event) =>
                    setPropertyLocation(event.target.value)
                  }
                  placeholder="Example: Electronic City"
                />
              </label>

              <button
                className="primary-button full"
                onClick={addProperty}
              >
                Create Property
              </button>
            </div>
          </div>
        </div>
      )}

      {showRoomForm && selectedProperty && (
        <div
          className="modal-backdrop"
          onClick={() => setShowRoomForm(false)}
        >
          <div
            className="modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>Add Room</h2>
                <p>{selectedProperty.name}</p>
              </div>

              <button
                className="close-button"
                onClick={() => setShowRoomForm(false)}
              >
                ×
              </button>
            </div>

            <div className="form">
              <label>
                Room Number
                <input
                  value={roomNumber}
                  onChange={(event) =>
                    setRoomNumber(event.target.value)
                  }
                  placeholder="Example: 101"
                />
              </label>

              <label>
                Number of Beds
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={bedCount}
                  onChange={(event) =>
                    setBedCount(event.target.value)
                  }
                />
              </label>

              <button
                className="primary-button full"
                onClick={addRoom}
              >
                Create Room
              </button>
            </div>
          </div>
        </div>
      )}

      {showTenantForm && (
        <div
          className="modal-backdrop"
          onClick={() => setShowTenantForm(false)}
        >
          <div
            className="modal large"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>Add Tenant</h2>
                <p>Assign a tenant to an available bed.</p>
              </div>

              <button
                className="close-button"
                onClick={() => setShowTenantForm(false)}
              >
                ×
              </button>
            </div>

            <div className="form-grid">
              <label>
                Full Name *
                <input
                  value={tenantName}
                  onChange={(event) =>
                    setTenantName(event.target.value)
                  }
                  placeholder="Tenant name"
                />
              </label>

              <label>
                Phone *
                <input
                  value={tenantPhone}
                  onChange={(event) =>
                    setTenantPhone(event.target.value)
                  }
                  placeholder="Phone number"
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={tenantEmail}
                  onChange={(event) =>
                    setTenantEmail(event.target.value)
                  }
                  placeholder="Email address"
                />
              </label>

              <label>
                Property *
                <select
                  value={tenantPropertyId}
                  onChange={(event) => {
                    setTenantPropertyId(event.target.value);
                    setTenantRoomId("");
                    setTenantBedId("");
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
              </label>

              <label>
                Room *
                <select
                  value={tenantRoomId}
                  disabled={!tenantPropertyId}
                  onChange={(event) => {
                    setTenantRoomId(event.target.value);
                    setTenantBedId("");
                  }}
                >
                  <option value="">Select room</option>

                  {availableRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      Room {room.number}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Bed *
                <select
                  value={tenantBedId}
                  disabled={!tenantRoomId}
                  onChange={(event) =>
                    setTenantBedId(event.target.value)
                  }
                >
                  <option value="">Select bed</option>

                  {availableBeds.map((bed) => (
                    <option key={bed.id} value={bed.id}>
                      Bed {bed.number}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Monthly Rent *
                <input
                  type="number"
                  value={tenantRent}
                  onChange={(event) =>
                    setTenantRent(event.target.value)
                  }
                  placeholder="₹"
                />
              </label>

              <label>
                Due Day
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={tenantDueDay}
                  onChange={(event) =>
                    setTenantDueDay(event.target.value)
                  }
                />
              </label>

              <label>
                Move-in Date
                <input
                  type="date"
                  value={tenantMoveIn}
                  onChange={(event) =>
                    setTenantMoveIn(event.target.value)
                  }
                />
              </label>

              <label>
                Security Deposit
                <input
                  type="number"
                  value={tenantDeposit}
                  onChange={(event) =>
                    setTenantDeposit(event.target.value)
                  }
                  placeholder="₹"
                />
              </label>
            </div>

            <button
              className="primary-button full"
              onClick={addTenant}
            >
              Add Tenant
            </button>
          </div>
        </div>
      )}

      {showPaymentForm && (
        <div
          className="modal-backdrop"
          onClick={() => setShowPaymentForm(false)}
        >
          <div
            className="modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>Record Payment</h2>
                <p>Record a rent payment.</p>
              </div>

              <button
                className="close-button"
                onClick={() => setShowPaymentForm(false)}
              >
                ×
              </button>
            </div>

            <div className="form">
              <label>
                Tenant *
                <select
                  value={paymentTenantId}
                  onChange={(event) =>
                    setPaymentTenantId(event.target.value)
                  }
                >
                  <option value="">Select tenant</option>

                  {activeTenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Amount *
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(event) =>
                    setPaymentAmount(event.target.value)
                  }
                  placeholder="₹"
                />
              </label>

              <label>
                Month
                <input
                  value={paymentMonth}
                  onChange={(event) =>
                    setPaymentMonth(event.target.value)
                  }
                />
              </label>

              <label>
                Payment Method
                <select
                  value={paymentMethod}
                  onChange={(event) =>
                    setPaymentMethod(event.target.value)
                  }
                >
                  <option>UPI</option>
                  <option>Cash</option>
                  <option>Bank Transfer</option>
                  <option>Card</option>
                  <option>Other</option>
                </select>
              </label>

              <label>
                Note
                <textarea
                  value={paymentNote}
                  onChange={(event) =>
                    setPaymentNote(event.target.value)
                  }
                  placeholder="Optional note"
                  rows={3}
                />
              </label>

              <button
                className="primary-button full"
                onClick={recordPayment}
              >
                Record Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
).render(
  <React.StrictMode>
    <Peacely />
  </React.StrictMode>
);
