import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Bed = {
  id: number;
  roomId: number;
  bedNumber: string;
  status: string;
};

type Room = {
  id: number;
  propertyId: number;
  roomNumber: string;
  bedCount: number;
  beds?: Bed[];
};

type Property = {
  id: number;
  name: string;
  address?: string;
  ownerId?: number;
};

type Tenant = {
  id: number;
  ownerId?: number;
  propertyId: number;
  roomId: number;
  bedId: number;
  name: string;
  phone?: string;
  email?: string;
  rent: number;
  deposit?: number;
  dueDay: number;
  moveInDate?: string;
  status?: string;
};

type Payment = {
  id: number;
  tenantId: number;
  amount: number;
  paymentDate: string;
  month: string;
  method?: string;
  note?: string;
};

type Invoice = {
  id: number;
  tenantId: number;
  invoiceNumber: string;
  amount: number;
  month: string;
  dueDate: string;
  status: string;
};

type View =
  | "dashboard"
  | "properties"
  | "property"
  | "tenants"
  | "payments"
  | "invoices";

const API_BASE = "/api";

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();

  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : typeof data === "string" && data
        ? data
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return data as T;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function money(value: number | string | undefined) {
  const amount = Number(value || 0);

  return `₹${amount.toLocaleString("en-IN")}`;
}

function App() {
  const [view, setView] = useState<View>("dashboard");

  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [propertyModal, setPropertyModal] = useState(false);
  const [roomModal, setRoomModal] = useState(false);
  const [tenantModal, setTenantModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);

  const [propertyName, setPropertyName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");

  const [roomNumber, setRoomNumber] = useState("");
  const [roomBedCount, setRoomBedCount] = useState("4");

  const [tenantName, setTenantName] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantRent, setTenantRent] = useState("");
  const [tenantDeposit, setTenantDeposit] = useState("");
  const [tenantDueDay, setTenantDueDay] = useState("5");
  const [tenantMoveInDate, setTenantMoveInDate] = useState(today());
  const [tenantPropertyId, setTenantPropertyId] = useState("");
  const [tenantRoomId, setTenantRoomId] = useState("");
  const [tenantBedId, setTenantBedId] = useState("");

  const [paymentTenantId, setPaymentTenantId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMonth, setPaymentMonth] = useState(currentMonth());
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [paymentNote, setPaymentNote] = useState("");

  async function loadData() {
    try {
      setError("");

      const [
        propertyData,
        roomData,
        bedData,
        tenantData,
        paymentData,
        invoiceData,
      ] = await Promise.all([
        request<Property[]>("/properties"),
        request<Room[]>("/rooms"),
        request<Bed[]>("/beds"),
        request<Tenant[]>("/tenants"),
        request<Payment[]>("/payments"),
        request<Invoice[]>("/invoices"),
      ]);

      setProperties(Array.isArray(propertyData) ? propertyData : []);
      setRooms(Array.isArray(roomData) ? roomData : []);
      setBeds(Array.isArray(bedData) ? bedData : []);
      setTenants(Array.isArray(tenantData) ? tenantData : []);
      setPayments(Array.isArray(paymentData) ? paymentData : []);
      setInvoices(Array.isArray(invoiceData) ? invoiceData : []);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "Unable to load application data."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedProperty = properties.find(
    (property) => property.id === selectedPropertyId
  );

  const selectedRooms = useMemo(() => {
    if (!selectedPropertyId) return [];

    return rooms.filter((room) => room.propertyId === selectedPropertyId);
  }, [rooms, selectedPropertyId]);

  const tenantRooms = useMemo(() => {
    if (!tenantPropertyId) return [];

    return rooms.filter(
      (room) => room.propertyId === Number(tenantPropertyId)
    );
  }, [rooms, tenantPropertyId]);

  const tenantBeds = useMemo(() => {
    if (!tenantRoomId) return [];

    return beds.filter((bed) => bed.roomId === Number(tenantRoomId));
  }, [beds, tenantRoomId]);

  const totalBeds = beds.length;

  const occupiedBeds = beds.filter(
    (bed) =>
      bed.status?.toLowerCase() === "occupied" ||
      tenants.some((tenant) => tenant.bedId === bed.id)
  ).length;

  const vacantBeds = Math.max(totalBeds - occupiedBeds, 0);

  const monthlyRent = tenants.reduce(
    (sum, tenant) => sum + Number(tenant.rent || 0),
    0
  );

  const currentMonthPayments = payments
    .filter((payment) => payment.month === currentMonth())
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  function openProperty(id: number) {
    setSelectedPropertyId(id);
    setView("property");
  }

  function getTenantName(id: number) {
    return tenants.find((tenant) => tenant.id === id)?.name || "Unknown tenant";
  }

  function getPropertyName(id: number) {
    return properties.find((property) => property.id === id)?.name || "-";
  }

  function resetPropertyForm() {
    setPropertyName("");
    setPropertyAddress("");
  }

  function resetRoomForm() {
    setRoomNumber("");
    setRoomBedCount("4");
  }

  function resetTenantForm() {
    setTenantName("");
    setTenantPhone("");
    setTenantEmail("");
    setTenantRent("");
    setTenantDeposit("");
    setTenantDueDay("5");
    setTenantMoveInDate(today());
    setTenantPropertyId("");
    setTenantRoomId("");
    setTenantBedId("");
  }

  function resetPaymentForm() {
    setPaymentTenantId("");
    setPaymentAmount("");
    setPaymentMonth(currentMonth());
    setPaymentMethod("UPI");
    setPaymentNote("");
  }

  async function addProperty() {
    if (!propertyName.trim()) {
      alert("Enter a property name.");
      return;
    }

    try {
      setSaving(true);

      await request("/properties", {
        method: "POST",
        body: JSON.stringify({
          name: propertyName.trim(),
          address: propertyAddress.trim(),
        }),
      });

      setPropertyModal(false);
      resetPropertyForm();

      await loadData();

      alert("Property added successfully.");
    } catch (e) {
      console.error(e);
      alert(
        e instanceof Error ? `Failed: ${e.message}` : "Failed to add property."
      );
    } finally {
      setSaving(false);
    }
  }

  async function addRoom() {
    if (!selectedPropertyId) {
      alert("Select a property first.");
      return;
    }

    if (!roomNumber.trim()) {
      alert("Enter a room number.");
      return;
    }

    const bedCount = Number(roomBedCount);

    if (!Number.isInteger(bedCount) || bedCount < 1) {
      alert("Enter a valid bed count.");
      return;
    }

    try {
      setSaving(true);

      await request(`/properties/${selectedPropertyId}/rooms`, {
        method: "POST",
        body: JSON.stringify({
          roomNumber: roomNumber.trim(),
          bedCount,
        }),
      });

      setRoomModal(false);
      resetRoomForm();

      await loadData();

      alert("Room added successfully.");
    } catch (e) {
      console.error(e);
      alert(
        e instanceof Error ? `Failed: ${e.message}` : "Failed to add room."
      );
    } finally {
      setSaving(false);
    }
  }

  async function addTenant() {
    if (!tenantName.trim()) {
      alert("Enter tenant name.");
      return;
    }

    if (!tenantPropertyId || !tenantRoomId || !tenantBedId) {
      alert("Select property, room and bed.");
      return;
    }

    const rent = Number(tenantRent);
    const deposit = Number(tenantDeposit || 0);
    const dueDay = Number(tenantDueDay);

    if (!Number.isFinite(rent) || rent <= 0) {
      alert("Enter a valid rent amount.");
      return;
    }

    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
      alert("Due day must be between 1 and 28.");
      return;
    }

    try {
      setSaving(true);

      await request("/tenants", {
        method: "POST",
        body: JSON.stringify({
          ownerId: 1,
          propertyId: Number(tenantPropertyId),
          roomId: Number(tenantRoomId),
          bedId: Number(tenantBedId),
          name: tenantName.trim(),
          phone: tenantPhone.trim(),
          email: tenantEmail.trim(),
          rent,
          deposit,
          dueDay,
          moveInDate: tenantMoveInDate,
          status: "active",
        }),
      });

      setTenantModal(false);
      resetTenantForm();

      await loadData();

      alert("Tenant added successfully.");
    } catch (e) {
      console.error(e);
      alert(
        e instanceof Error ? `Failed: ${e.message}` : "Failed to add tenant."
      );
    } finally {
      setSaving(false);
    }
  }

  async function recordPayment() {
    if (!paymentTenantId || !paymentAmount) {
      alert("Select a tenant and enter the payment amount.");
      return;
    }

    const tenantId = Number(paymentTenantId);
    const amount = Number(paymentAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Enter a valid payment amount.");
      return;
    }

    try {
      setSaving(true);

      await request("/payments", {
        method: "POST",
        body: JSON.stringify({
          tenantId,
          amount,
          paymentDate: today(),
          month: paymentMonth.trim() || currentMonth(),
          method: paymentMethod,
          note: paymentNote.trim() || "Monthly rent",
        }),
      });

      const matchingInvoice = invoices.find(
        (invoice) =>
          invoice.tenantId === tenantId &&
          invoice.month === paymentMonth &&
          invoice.status?.toLowerCase() === "pending"
      );

      if (matchingInvoice) {
        await request(`/invoices/${matchingInvoice.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "paid",
          }),
        });
      }

      setPaymentModal(false);
      resetPaymentForm();

      await loadData();

      alert("Payment recorded successfully.");
    } catch (e) {
      console.error("Payment error:", e);

      alert(
        e instanceof Error
          ? `Payment failed: ${e.message}`
          : "Payment failed."
      );
    } finally {
      setSaving(false);
    }
  }

  async function createInvoice(tenant: Tenant) {
    const month = currentMonth();

    const exists = invoices.some(
      (invoice) =>
        invoice.tenantId === tenant.id && invoice.month === month
    );

    if (exists) {
      alert("An invoice already exists for this tenant this month.");
      return;
    }

    try {
      setSaving(true);

      const invoiceNumber = `INV-${Date.now()}`;

      const now = new Date();
      const year = now.getFullYear();
      const monthNumber = String(now.getMonth() + 1).padStart(2, "0");

      const day = String(
        Math.min(Math.max(Number(tenant.dueDay || 5), 1), 28)
      ).padStart(2, "0");

      const dueDate = `${year}-${monthNumber}-${day}`;

      await request("/invoices", {
        method: "POST",
        body: JSON.stringify({
          tenantId: tenant.id,
          invoiceNumber,
          amount: Number(tenant.rent),
          month,
          dueDate,
          status: "pending",
        }),
      });

      await loadData();

      alert("Invoice created successfully.");
    } catch (e) {
      console.error("Invoice error:", e);

      alert(
        e instanceof Error
          ? `Invoice failed: ${e.message}`
          : "Invoice creation failed."
      );
    } finally {
      setSaving(false);
    }
  }

  function openTenantModal() {
    resetTenantForm();

    if (selectedPropertyId) {
      setTenantPropertyId(String(selectedPropertyId));
    }

    setTenantModal(true);
  }

  function navigate(nextView: View) {
    setView(nextView);

    if (nextView !== "property") {
      setSelectedPropertyId(null);
    }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <h2>Loading Peacely...</h2>
        <p>Getting your rental data ready.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">P</div>
          <div>
            <h1>Peacely</h1>
            <span>Rental Manager</span>
          </div>
        </div>

        <nav>
          <button
            className={view === "dashboard" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("dashboard")}
          >
            <span>⌂</span>
            Dashboard
          </button>

          <button
            className={
              view === "properties" || view === "property"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => navigate("properties")}
          >
            <span>⌂</span>
            Properties
          </button>

          <button
            className={view === "tenants" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("tenants")}
          >
            <span>👥</span>
            Tenants
          </button>

          <button
            className={view === "payments" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("payments")}
          >
            <span>₹</span>
            Payments
          </button>

          <button
            className={view === "invoices" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("invoices")}
          >
            <span>▤</span>
            Invoices
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="peace-card">
            <strong>Stay organised.</strong>
            <span>Manage your rentals peacefully.</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h2>
              {view === "dashboard" && "Dashboard"}
              {view === "properties" && "Properties"}
              {view === "property" &&
                (selectedProperty?.name || "Property")}
              {view === "tenants" && "Tenants"}
              {view === "payments" && "Payments"}
              {view === "invoices" && "Invoices"}
            </h2>

            <p>
              {view === "dashboard"
                ? "A simple overview of your rental business."
                : "Manage your rental information in one place."}
            </p>
          </div>

          <div className="top-actions">
            <button
              className="btn secondary"
              onClick={() => {
                setPaymentModal(true);
                resetPaymentForm();
              }}
            >
              + Record Payment
            </button>

            <button className="btn primary" onClick={openTenantModal}>
              + Add Tenant
            </button>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        <section className="page">
          {view === "dashboard" && (
            <>
              <div className="stats">
                <div className="stat-card">
                  <span className="stat-label">Properties</span>
                  <strong>{properties.length}</strong>
                  <small>Total properties</small>
                </div>

                <div className="stat-card">
                  <span className="stat-label">Tenants</span>
                  <strong>{tenants.length}</strong>
                  <small>Active tenants</small>
                </div>

                <div className="stat-card">
                  <span className="stat-label">Occupied Beds</span>
                  <strong>{occupiedBeds}</strong>
                  <small>{vacantBeds} beds vacant</small>
                </div>

                <div className="stat-card">
                  <span className="stat-label">Monthly Rent</span>
                  <strong>{money(monthlyRent)}</strong>
                  <small>Expected rent</small>
                </div>
              </div>

              <div className="dashboard-grid">
                <div className="card">
                  <div className="card-header">
                    <div>
                      <h3>Properties</h3>
                      <p>Your rental properties</p>
                    </div>

                    <button
                      className="text-btn"
                      onClick={() => navigate("properties")}
                    >
                      View all →
                    </button>
                  </div>

                  {properties.length === 0 ? (
                    <div className="empty">
                      <div className="empty-icon">⌂</div>
                      <h3>No properties yet</h3>
                      <p>Add your first property to get started.</p>
                      <button
                        className="btn primary"
                        onClick={() => setPropertyModal(true)}
                      >
                        + Add Property
                      </button>
                    </div>
                  ) : (
                    <div className="property-list">
                      {properties.slice(0, 5).map((property) => {
                        const propertyRooms = rooms.filter(
                          (room) => room.propertyId === property.id
                        );

                        const propertyTenants = tenants.filter(
                          (tenant) => tenant.propertyId === property.id
                        );

                        return (
                          <button
                            className="property-row"
                            key={property.id}
                            onClick={() => openProperty(property.id)}
                          >
                            <div className="property-icon">⌂</div>

                            <div className="property-info">
                              <strong>{property.name}</strong>
                              <span>
                                {property.address || "No address added"}
                              </span>
                            </div>

                            <div className="property-meta">
                              <span>{propertyRooms.length} rooms</span>
                              <span>{propertyTenants.length} tenants</span>
                            </div>

                            <span className="arrow">→</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="card">
                  <div className="card-header">
                    <div>
                      <h3>Payments</h3>
                      <p>{currentMonth()}</p>
                    </div>

                    <button
                      className="text-btn"
                      onClick={() => navigate("payments")}
                    >
                      View all →
                    </button>
                  </div>

                  <div className="big-number">
                    {money(currentMonthPayments)}
                  </div>

                  <div className="mini-stat">
                    <span>Payments received</span>
                    <strong>
                      {
                        payments.filter(
                          (payment) => payment.month === currentMonth()
                        ).length
                      }
                    </strong>
                  </div>

                  <button
                    className="btn primary full"
                    onClick={() => {
                      resetPaymentForm();
                      setPaymentModal(true);
                    }}
                  >
                    + Record Payment
                  </button>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div>
                    <h3>Recent Payments</h3>
                    <p>Latest rent payments</p>
                  </div>
                </div>

                {payments.length === 0 ? (
                  <div className="empty compact">
                    <p>No payments recorded yet.</p>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Tenant</th>
                          <th>Month</th>
                          <th>Date</th>
                          <th>Method</th>
                          <th>Amount</th>
                        </tr>
                      </thead>

                      <tbody>
                        {payments.slice(0, 8).map((payment) => (
                          <tr key={payment.id}>
                            <td>
                              <strong>
                                {getTenantName(payment.tenantId)}
                              </strong>
                            </td>
                            <td>{payment.month}</td>
                            <td>{payment.paymentDate}</td>
                            <td>
                              <span className="badge success">
                                {payment.method || "—"}
                              </span>
                            </td>
                            <td>
                              <strong>{money(payment.amount)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {view === "properties" && (
            <>
              <div className="page-actions">
                <div>
                  <h3>Your Properties</h3>
                  <p>Add and manage all your rental properties.</p>
                </div>

                <button
                  className="btn primary"
                  onClick={() => {
                    resetPropertyForm();
                    setPropertyModal(true);
                  }}
                >
                  + Add Property
                </button>
              </div>

              {properties.length === 0 ? (
                <div className="card">
                  <div className="empty">
                    <div className="empty-icon">⌂</div>
                    <h3>No properties yet</h3>
                    <p>Create a property to start adding rooms and tenants.</p>
                    <button
                      className="btn primary"
                      onClick={() => setPropertyModal(true)}
                    >
                      + Add Property
                    </button>
                  </div>
                </div>
              ) : (
                <div className="property-grid">
                  {properties.map((property) => {
                    const propertyRooms = rooms.filter(
                      (room) => room.propertyId === property.id
                    );

                    const propertyTenants = tenants.filter(
                      (tenant) => tenant.propertyId === property.id
                    );

                    return (
                      <div className="property-card" key={property.id}>
                        <div className="property-card-top">
                          <div className="property-icon large">⌂</div>
                          <span className="badge">
                            {propertyRooms.length} rooms
                          </span>
                        </div>

                        <h3>{property.name}</h3>

                        <p>{property.address || "No address added"}</p>

                        <div className="property-card-stats">
                          <div>
                            <strong>{propertyRooms.length}</strong>
                            <span>Rooms</span>
                          </div>

                          <div>
                            <strong>{propertyTenants.length}</strong>
                            <span>Tenants</span>
                          </div>
                        </div>

                        <button
                          className="btn secondary full"
                          onClick={() => openProperty(property.id)}
                        >
                          Manage Property →
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {view === "property" && selectedProperty && (
            <>
              <div className="page-actions">
                <div>
                  <button
                    className="back-btn"
                    onClick={() => navigate("properties")}
                  >
                    ← Properties
                  </button>

                  <h3>{selectedProperty.name}</h3>

                  <p>
                    {selectedProperty.address || "No address added"}
                  </p>
                </div>

                <div className="top-actions">
                  <button
                    className="btn secondary"
                    onClick={() => setRoomModal(true)}
                  >
                    + Add Room
                  </button>

                  <button
                    className="btn primary"
                    onClick={openTenantModal}
                  >
                    + Add Tenant
                  </button>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div>
                    <h3>Rooms & Beds</h3>
                    <p>Manage rooms and bed occupancy.</p>
                  </div>
                </div>

                {selectedRooms.length === 0 ? (
                  <div className="empty compact">
                    <p>No rooms added yet.</p>
                    <button
                      className="btn primary"
                      onClick={() => setRoomModal(true)}
                    >
                      + Add Room
                    </button>
                  </div>
                ) : (
                  <div className="room-grid">
                    {selectedRooms.map((room) => {
                      const roomBeds = beds.filter(
                        (bed) => bed.roomId === room.id
                      );

                      return (
                        <div className="room-card" key={room.id}>
                          <div className="room-header">
                            <div>
                              <strong>Room {room.roomNumber}</strong>
                              <span>
                                {roomBeds.length} beds
                              </span>
                            </div>
                          </div>

                          <div className="beds">
                            {roomBeds.map((bed) => {
                              const tenant = tenants.find(
                                (item) => item.bedId === bed.id
                              );

                              const occupied = Boolean(tenant);

                              return (
                                <div
                                  className={
                                    occupied
                                      ? "bed occupied"
                                      : "bed vacant"
                                  }
                                  key={bed.id}
                                >
                                  <span>Bed {bed.bedNumber}</span>
                                  <small>
                                    {occupied
                                      ? tenant?.name
                                      : "Vacant"}
                                  </small>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {view === "tenants" && (
            <>
              <div className="page-actions">
                <div>
                  <h3>Tenants</h3>
                  <p>Manage your tenants and their rental details.</p>
                </div>

                <button
                  className="btn primary"
                  onClick={openTenantModal}
                >
                  + Add Tenant
                </button>
              </div>

              <div className="card">
                {tenants.length === 0 ? (
                  <div className="empty">
                    <div className="empty-icon">👥</div>
                    <h3>No tenants yet</h3>
                    <p>Add a tenant to start managing rent.</p>
                    <button
                      className="btn primary"
                      onClick={openTenantModal}
                    >
                      + Add Tenant
                    </button>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Tenant</th>
                          <th>Property</th>
                          <th>Room / Bed</th>
                          <th>Rent</th>
                          <th>Due Day</th>
                          <th>Status</th>
                        </tr>
                      </thead>

                      <tbody>
                        {tenants.map((tenant) => {
                          const room = rooms.find(
                            (item) => item.id === tenant.roomId
                          );

                          const bed = beds.find(
                            (item) => item.id === tenant.bedId
                          );

                          return (
                            <tr key={tenant.id}>
                              <td>
                                <strong>{tenant.name}</strong>
                                <small className="table-sub">
                                  {tenant.phone || "No phone"}
                                </small>
                              </td>

                              <td>
                                {getPropertyName(tenant.propertyId)}
                              </td>

                              <td>
                                {room
                                  ? `Room ${room.roomNumber}`
                                  : "-"}
                                {bed
                                  ? ` / Bed ${bed.bedNumber}`
                                  : ""}
                              </td>

                              <td>
                                <strong>{money(tenant.rent)}</strong>
                              </td>

                              <td>{tenant.dueDay}</td>

                              <td>
                                <span className="badge success">
                                  {tenant.status || "active"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {view === "payments" && (
            <>
              <div className="page-actions">
                <div>
                  <h3>Payments</h3>
                  <p>Track all rent payments.</p>
                </div>

                <button
                  className="btn primary"
                  onClick={() => {
                    resetPaymentForm();
                    setPaymentModal(true);
                  }}
                >
                  + Record Payment
                </button>
              </div>

              <div className="card">
                {payments.length === 0 ? (
                  <div className="empty">
                    <div className="empty-icon">₹</div>
                    <h3>No payments yet</h3>
                    <p>Record your first tenant payment.</p>
                    <button
                      className="btn primary"
                      onClick={() => setPaymentModal(true)}
                    >
                      + Record Payment
                    </button>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Tenant</th>
                          <th>Month</th>
                          <th>Payment Date</th>
                          <th>Method</th>
                          <th>Note</th>
                          <th>Amount</th>
                        </tr>
                      </thead>

                      <tbody>
                        {payments.map((payment) => (
                          <tr key={payment.id}>
                            <td>
                              <strong>
                                {getTenantName(payment.tenantId)}
                              </strong>
                            </td>
                            <td>{payment.month}</td>
                            <td>{payment.paymentDate}</td>
                            <td>
                              <span className="badge success">
                                {payment.method || "—"}
                              </span>
                            </td>
                            <td>{payment.note || "—"}</td>
                            <td>
                              <strong>{money(payment.amount)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {view === "invoices" && (
            <>
              <div className="page-actions">
                <div>
                  <h3>Invoices</h3>
                  <p>Create and track monthly tenant invoices.</p>
                </div>
              </div>

              <div className="card">
                {tenants.length === 0 ? (
                  <div className="empty">
                    <div className="empty-icon">▤</div>
                    <h3>No tenants available</h3>
                    <p>Add a tenant before creating an invoice.</p>
                  </div>
                ) : (
                  <div className="invoice-list">
                    {tenants.map((tenant) => {
                      const tenantInvoices = invoices.filter(
                        (invoice) => invoice.tenantId === tenant.id
                      );

                      const currentInvoice = tenantInvoices.find(
                        (invoice) => invoice.month === currentMonth()
                      );

                      return (
                        <div className="invoice-row" key={tenant.id}>
                          <div>
                            <strong>{tenant.name}</strong>
                            <span>
                              {getPropertyName(tenant.propertyId)}
                            </span>
                          </div>

                          <div>
                            <strong>{money(tenant.rent)}</strong>
                            <span>
                              Due day: {tenant.dueDay}
                            </span>
                          </div>

                          <div>
                            {currentInvoice ? (
                              <>
                                <span className="badge success">
                                  {currentInvoice.status}
                                </span>
                                <small>
                                  {currentInvoice.invoiceNumber}
                                </small>
                              </>
                            ) : (
                              <span className="badge warning">
                                Not created
                              </span>
                            )}
                          </div>

                          <button
                            className="btn secondary"
                            disabled={Boolean(currentInvoice) || saving}
                            onClick={() => createInvoice(tenant)}
                          >
                            {currentInvoice
                              ? "Invoice Created"
                              : "Create Invoice"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </main>

      {propertyModal && (
        <div
          className="modal-overlay"
          onClick={() => setPropertyModal(false)}
        >
          <div
            className="modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>Add Property</h3>
                <p>Create a new rental property.</p>
              </div>

              <button
                className="close-btn"
                onClick={() => setPropertyModal(false)}
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
                  placeholder="Example: Peacely PG"
                />
              </label>

              <label>
                Address
                <input
                  value={propertyAddress}
                  onChange={(event) =>
                    setPropertyAddress(event.target.value)
                  }
                  placeholder="Example: Electronic City, Bengaluru"
                />
              </label>

              <div className="modal-actions">
                <button
                  className="btn secondary"
                  onClick={() => setPropertyModal(false)}
                >
                  Cancel
                </button>

                <button
                  className="btn primary"
                  disabled={saving}
                  onClick={addProperty}
                >
                  {saving ? "Saving..." : "Add Property"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {roomModal && (
        <div
          className="modal-overlay"
          onClick={() => setRoomModal(false)}
        >
          <div
            className="modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>Add Room</h3>
                <p>
                  {selectedProperty?.name || "Selected property"}
                </p>
              </div>

              <button
                className="close-btn"
                onClick={() => setRoomModal(false)}
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
                  value={roomBedCount}
                  onChange={(event) =>
                    setRoomBedCount(event.target.value)
                  }
                />
              </label>

              <div className="modal-actions">
                <button
                  className="btn secondary"
                  onClick={() => setRoomModal(false)}
                >
                  Cancel
                </button>

                <button
                  className="btn primary"
                  disabled={saving}
                  onClick={addRoom}
                >
                  {saving ? "Saving..." : "Add Room"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tenantModal && (
        <div
          className="modal-overlay"
          onClick={() => setTenantModal(false)}
        >
          <div
            className="modal large"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>Add Tenant</h3>
                <p>Add tenant and assign a bed.</p>
              </div>

              <button
                className="close-btn"
                onClick={() => setTenantModal(false)}
              >
                ×
              </button>
            </div>

            <div className="form two-column">
              <label>
                Tenant Name
                <input
                  value={tenantName}
                  onChange={(event) =>
                    setTenantName(event.target.value)
                  }
                  placeholder="Full name"
                />
              </label>

              <label>
                Phone
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
                Monthly Rent
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
                Deposit
                <input
                  type="number"
                  value={tenantDeposit}
                  onChange={(event) =>
                    setTenantDeposit(event.target.value)
                  }
                  placeholder="₹"
                />
              </label>

              <label>
                Rent Due Day
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
                  value={tenantMoveInDate}
                  onChange={(event) =>
                    setTenantMoveInDate(event.target.value)
                  }
                />
              </label>

              <label>
                Property
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
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Room
                <select
                  value={tenantRoomId}
                  onChange={(event) => {
                    setTenantRoomId(event.target.value);
                    setTenantBedId("");
                  }}
                  disabled={!tenantPropertyId}
                >
                  <option value="">Select room</option>

                  {tenantRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      Room {room.roomNumber}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Bed
                <select
                  value={tenantBedId}
                  onChange={(event) =>
                    setTenantBedId(event.target.value)
                  }
                  disabled={!tenantRoomId}
                >
                  <option value="">Select bed</option>

                  {tenantBeds
                    .filter(
                      (bed) =>
                        !tenants.some(
                          (tenant) => tenant.bedId === bed.id
                        )
                    )
                    .map((bed) => (
                      <option key={bed.id} value={bed.id}>
                        Bed {bed.bedNumber}
                      </option>
                    ))}
                </select>
              </label>

              <div className="modal-actions full-width">
                <button
                  className="btn secondary"
                  onClick={() => setTenantModal(false)}
                >
                  Cancel
                </button>

                <button
                  className="btn primary"
                  disabled={saving}
                  onClick={addTenant}
                >
                  {saving ? "Saving..." : "Add Tenant"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {paymentModal && (
        <div
          className="modal-overlay"
          onClick={() => setPaymentModal(false)}
        >
          <div
            className="modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>Record Payment</h3>
                <p>Record a tenant's rent payment.</p>
              </div>

              <button
                className="close-btn"
                onClick={() => setPaymentModal(false)}
              >
                ×
              </button>
            </div>

            <div className="form">
              <label>
                Tenant
                <select
                  value={paymentTenantId}
                  onChange={(event) =>
                    setPaymentTenantId(event.target.value)
                  }
                >
                  <option value="">Select tenant</option>

                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} — {money(tenant.rent)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Amount
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
                  placeholder="September 2026"
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
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">
                    Bank Transfer
                  </option>
                  <option value="Card">Card</option>
                  <option value="Other">Other</option>
                </select>
              </label>

              <label>
                Note
                <input
                  value={paymentNote}
                  onChange={(event) =>
                    setPaymentNote(event.target.value)
                  }
                  placeholder="Monthly rent"
                />
              </label>

              <div className="modal-actions">
                <button
                  className="btn secondary"
                  onClick={() => setPaymentModal(false)}
                >
                  Cancel
                </button>

                <button
                  className="btn primary"
                  disabled={saving}
                  onClick={recordPayment}
                >
                  {saving ? "Saving..." : "Record Payment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {saving && <div className="saving-indicator">Saving...</div>}
    </div>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
