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
  status: string;
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
  status: string;
};

type View =
  | "dashboard"
  | "properties"
  | "property"
  | "tenants"
  | "payments"
  | "invoices";

const API = "/api";

function money(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();

  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
        data?.message ||
        (typeof data === "string" ? data : "Request failed")
    );
  }

  return data as T;
}

function App() {
  const [view, setView] = useState<View>("dashboard");

  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedPropertyId, setSelectedPropertyId] =
    useState<number | null>(null);

  const [propertyModal, setPropertyModal] = useState(false);
  const [roomModal, setRoomModal] = useState(false);
  const [tenantModal, setTenantModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);

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
  const [paymentMonth, setPaymentMonth] = useState(currentMonth());
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [paymentNote, setPaymentNote] = useState("");

  const [tenantSearch, setTenantSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedProperty = properties.find(
    (p) => p.id === selectedPropertyId
  );

  async function loadData() {
    try {
      setError("");

      const [p, t, pay, inv] = await Promise.all([
        request<any[]>("/properties"),
        request<any[]>("/tenants"),
        request<any[]>("/payments"),
        request<any[]>("/invoices"),
      ]);

      const tenantList: Tenant[] = (t || []).map((x) => ({
        id: Number(x.id),
        name: x.name || "",
        phone: x.phone || "",
        email: x.email || "",
        propertyId: Number(x.property_id || 0),
        roomId: Number(x.room_id || 0),
        bedId: Number(x.bed_id || 0),
        rent: Number(x.rent || 0),
        dueDay: Number(x.due_day || 5),
        moveInDate: x.move_in_date
          ? String(x.move_in_date).slice(0, 10)
          : "",
        deposit: Number(x.deposit || 0),
        status:
          String(x.status || "active").toLowerCase() === "inactive"
            ? "Inactive"
            : "Active",
      }));

      const propertyList: Property[] = await Promise.all(
        (p || []).map(async (property) => {
          const roomsRaw = await request<any[]>(
            `/properties/${property.id}/rooms`
          );

          const rooms: Room[] = await Promise.all(
            (roomsRaw || []).map(async (room) => {
              const bedsRaw = await request<any[]>(
                `/rooms/${room.id}/beds`
              );

              return {
                id: Number(room.id),
                number: String(room.room_number),
                beds: (bedsRaw || []).map((bed) => {
                  const tenant = tenantList.find(
                    (t) =>
                      t.bedId === Number(bed.id) &&
                      t.roomId === Number(room.id)
                  );

                  return {
                    id: Number(bed.id),
                    number: String(bed.bed_number),
                    occupied: Boolean(bed.occupied) || !!tenant,
                    tenantId: tenant?.id,
                  };
                }),
              };
            })
          );

          return {
            id: Number(property.id),
            name: property.name || "",
            location: property.location || "",
            rooms,
          };
        })
      );

      const paymentList: Payment[] = (pay || []).map((x) => ({
        id: Number(x.id),
        tenantId: Number(x.tenant_id),
        amount: Number(x.amount || 0),
        date: x.payment_date
          ? String(x.payment_date).slice(0, 10)
          : "",
        month: x.month || "",
        method: x.method || "",
        note: x.note || "",
      }));

      const invoiceList: Invoice[] = (inv || []).map((x) => ({
        id: Number(x.id),
        tenantId: Number(x.tenant_id),
        invoiceNumber: x.invoice_number || "",
        amount: Number(x.amount || 0),
        month: x.month || "",
        dueDate: x.due_date
          ? String(x.due_date).slice(0, 10)
          : "",
        status:
          String(x.status || "pending").toLowerCase() === "paid"
            ? "Paid"
            : "Pending",
      }));

      setProperties(propertyList);
      setTenants(tenantList);
      setPayments(paymentList);
      setInvoices(invoiceList);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "Unable to load Peacely data"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const totalRooms = properties.reduce(
    (sum, p) => sum + p.rooms.length,
    0
  );

  const totalBeds = properties.reduce(
    (sum, p) =>
      sum +
      p.rooms.reduce((roomSum, r) => roomSum + r.beds.length, 0),
    0
  );

  const occupiedBeds = properties.reduce(
    (sum, p) =>
      sum +
      p.rooms.reduce(
        (roomSum, r) =>
          roomSum + r.beds.filter((b) => b.occupied).length,
        0
      ),
    0
  );

  const vacantBeds = totalBeds - occupiedBeds;

  const activeTenants = tenants.filter(
    (t) => t.status === "Active"
  );

  const expectedRent = activeTenants.reduce(
    (sum, t) => sum + t.rent,
    0
  );

  const collectedThisMonth = payments
    .filter((p) => p.month === currentMonth())
    .reduce((sum, p) => sum + p.amount, 0);

  const pendingInvoices = invoices.filter(
    (i) => i.status === "Pending"
  );

  const pendingAmount = pendingInvoices.reduce(
    (sum, i) => sum + i.amount,
    0
  );

  const filteredTenants = useMemo(() => {
    const q = tenantSearch.toLowerCase().trim();

    if (!q) return tenants;

    return tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.phone.toLowerCase().includes(q)
    );
  }, [tenants, tenantSearch]);

  const tenantProperty = properties.find(
    (p) => p.id === Number(tenantPropertyId)
  );

  const tenantRoom = tenantProperty?.rooms.find(
    (r) => r.id === Number(tenantRoomId)
  );

  const availableBeds =
    tenantRoom?.beds.filter((b) => !b.occupied) || [];

  function tenantName(id: number) {
    return (
      tenants.find((t) => t.id === id)?.name || "Unknown tenant"
    );
  }

  function propertyName(id: number) {
    return properties.find((p) => p.id === id)?.name || "-";
  }

  function roomName(propertyId: number, roomId: number) {
    const property = properties.find((p) => p.id === propertyId);

    return (
      property?.rooms.find((r) => r.id === roomId)?.number || "-"
    );
  }

  function bedName(
    propertyId: number,
    roomId: number,
    bedId: number
  ) {
    const property = properties.find((p) => p.id === propertyId);
    const room = property?.rooms.find((r) => r.id === roomId);

    return room?.beds.find((b) => b.id === bedId)?.number || "-";
  }

  function go(next: View) {
    setView(next);
    if (next !== "property") setSelectedPropertyId(null);
  }

  function openTenant(
    propertyId = "",
    roomId = "",
    bedId = ""
  ) {
    setTenantPropertyId(String(propertyId));
    setTenantRoomId(String(roomId));
    setTenantBedId(String(bedId));
    setTenantModal(true);
  }

  function openPayment(id = "") {
    setPaymentTenantId(String(id));
    setPaymentModal(true);
  }

  async function addProperty() {
    if (!propertyName.trim() || !propertyLocation.trim()) {
      alert("Please enter property name and location.");
      return;
    }

    try {
      setSaving(true);

      await request("/properties", {
        method: "POST",
        body: JSON.stringify({
          name: propertyName.trim(),
          location: propertyLocation.trim(),
        }),
      });

      setPropertyName("");
      setPropertyLocation("");
      setPropertyModal(false);

      await loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add property");
    } finally {
      setSaving(false);
    }
  }

  async function addRoom() {
    if (!selectedProperty || !roomNumber.trim()) {
      alert("Enter a room number.");
      return;
    }

    try {
      setSaving(true);

      await request(
        `/properties/${selectedProperty.id}/rooms`,
        {
          method: "POST",
          body: JSON.stringify({
            roomNumber: roomNumber.trim(),
            bedCount: Math.max(
              1,
              Math.min(10, Number(bedCount) || 1)
            ),
          }),
        }
      );

      setRoomNumber("");
      setBedCount("2");
      setRoomModal(false);

      await loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add room");
    } finally {
      setSaving(false);
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
      alert("Please complete all required tenant fields.");
      return;
    }

    try {
      setSaving(true);

      await request("/tenants", {
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
      setTenantPropertyId("");
      setTenantRoomId("");
      setTenantBedId("");
      setTenantRent("");
      setTenantDueDay("5");
      setTenantMoveIn(today());
      setTenantDeposit("");
      setTenantModal(false);

      await loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add tenant");
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

      /*
       * IMPORTANT:
       * These are the exact camelCase fields expected by
       * the Peacely backend.
       */
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

      /*
       * If this tenant has a pending invoice for the same month,
       * mark that invoice as paid.
       */
      const matchingInvoice = invoices.find(
        (invoice) =>
          invoice.tenantId === tenantId &&
          invoice.month === paymentMonth &&
          invoice.status === "Pending"
      );

      if (matchingInvoice) {
        await request(`/invoices/${matchingInvoice.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "paid",
          }),
        });
      }

      setPaymentTenantId("");
      setPaymentAmount("");
      setPaymentMonth(currentMonth());
      setPaymentMethod("UPI");
      setPaymentNote("");
      setPaymentModal(false);

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
      (i) => i.tenantId === tenant.id && i.month === month
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
      const monthNumber = String(now.getMonth() + 1).padStart(
        2,
        "0"
      );
      const day = String(
        Math.min(Math.max(tenant.dueDay || 5, 1), 28)
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

  if (loading) {
    return (
      <div className="loading-page">
        <div className="loading-box">
          <div className="logo">P</div>
          <h1>Peacely</h1>
          <p>Loading your property data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">P</div>
          <div>
            <h2>Peacely</h2>
            <span>Property Manager</span>
          </div>
        </div>

        <nav>
          <button
            className={view === "dashboard" ? "nav-active" : ""}
            onClick={() => go("dashboard")}
          >
            <span>⌂</span>
            Dashboard
          </button>

          <button
            className={
              view === "properties" || view === "property"
                ? "nav-active"
                : ""
            }
            onClick={() => go("properties")}
          >
            <span>▦</span>
            Properties
          </button>

          <button
            className={view === "tenants" ? "nav-active" : ""}
            onClick={() => go("tenants")}
          >
            <span>♙</span>
            Tenants
          </button>

          <button
            className={view === "payments" ? "nav-active" : ""}
            onClick={() => go("payments")}
          >
            <span>₹</span>
            Payments
          </button>

          <button
            className={view === "invoices" ? "nav-active" : ""}
            onClick={() => go("invoices")}
          >
            <span>▤</span>
            Invoices
          </button>
        </nav>

        <div className="sidebar-bottom">
          <strong>Peace of mind.</strong>
          <span>Powered by Peacely</span>
        </div>
      </aside>

      <main className="main">
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
                ? "Everything you need to manage your rental business."
                : "Manage your rental operations with ease."}
            </p>
          </div>

          <button
            className="primary"
            onClick={() => setPropertyModal(true)}
          >
            + Add Property
          </button>
        </header>

        {error && (
          <div className="error">
            ⚠ {error}
          </div>
        )}

        {view === "dashboard" && (
          <section className="page">
            <div className="stats">
              <div className="stat">
                <span>Properties</span>
                <strong>{properties.length}</strong>
                <small>Total properties</small>
              </div>

              <div className="stat">
                <span>Rooms</span>
                <strong>{totalRooms}</strong>
                <small>Total rooms</small>
              </div>

              <div className="stat">
                <span>Occupied Beds</span>
                <strong>{occupiedBeds}</strong>
                <small>{vacantBeds} vacant</small>
              </div>

              <div className="stat">
                <span>Active Tenants</span>
                <strong>{activeTenants.length}</strong>
                <small>Currently staying</small>
              </div>

              <div className="stat">
                <span>Expected Rent</span>
                <strong>{money(expectedRent)}</strong>
                <small>Monthly</small>
              </div>

              <div className="stat">
                <span>Collected</span>
                <strong>{money(collectedThisMonth)}</strong>
                <small>{currentMonth()}</small>
              </div>

              <div className="stat">
                <span>Pending</span>
                <strong>{money(pendingAmount)}</strong>
                <small>Pending invoices</small>
              </div>
            </div>

            <div className="two-columns">
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Properties</h2>
                    <p>Your rental properties</p>
                  </div>

                  <button
                    className="secondary"
                    onClick={() => go("properties")}
                  >
                    View all
                  </button>
                </div>

                {properties.length === 0 ? (
                  <Empty
                    icon="⌂"
                    title="No properties yet"
                    text="Add your first property to get started."
                    action={
                      <button
                        className="primary"
                        onClick={() => setPropertyModal(true)}
                      >
                        Add Property
                      </button>
                    }
                  />
                ) : (
                  <div className="list">
                    {properties.slice(0, 5).map((p) => {
                      const beds = p.rooms.flatMap((r) => r.beds);
                      const occupied = beds.filter(
                        (b) => b.occupied
                      ).length;

                      return (
                        <button
                          className="property-row"
                          key={p.id}
                          onClick={() => {
                            setSelectedPropertyId(p.id);
                            setView("property");
                          }}
                        >
                          <div className="property-icon">⌂</div>

                          <div className="row-main">
                            <strong>{p.name}</strong>
                            <span>{p.location}</span>
                          </div>

                          <div className="row-right">
                            <strong>
                              {occupied}/{beds.length}
                            </strong>
                            <span>occupied</span>
                          </div>

                          <b>›</b>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Recent Payments</h2>
                    <p>Latest rent collections</p>
                  </div>
                </div>

                {payments.length === 0 ? (
                  <Empty
                    icon="₹"
                    title="No payments yet"
                    text="Recorded payments will appear here."
                  />
                ) : (
                  <div className="list">
                    {payments.slice(0, 7).map((p) => (
                      <div className="payment-row" key={p.id}>
                        <div>
                          <strong>{tenantName(p.tenantId)}</strong>
                          <span>
                            {p.date} · {p.method}
                          </span>
                        </div>

                        <strong>{money(p.amount)}</strong>
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
            <div className="section-head">
              <div>
                <h2>All Properties</h2>
                <p>Manage properties, rooms and beds.</p>
              </div>

              <button
                className="primary"
                onClick={() => setPropertyModal(true)}
              >
                + Add Property
              </button>
            </div>

            {properties.length === 0 ? (
              <div className="card">
                <Empty
                  icon="⌂"
                  title="No properties"
                  text="Create your first property."
                />
              </div>
            ) : (
              <div className="property-grid">
                {properties.map((p) => {
                  const beds = p.rooms.flatMap((r) => r.beds);
                  const occupied = beds.filter(
                    (b) => b.occupied
                  ).length;

                  return (
                    <div className="property-card" key={p.id}>
                      <div className="property-title">
                        <div className="property-icon big">⌂</div>

                        <div>
                          <h3>{p.name}</h3>
                          <p>{p.location}</p>
                        </div>
                      </div>

                      <div className="property-stats">
                        <div>
                          <strong>{p.rooms.length}</strong>
                          <span>Rooms</span>
                        </div>

                        <div>
                          <strong>{beds.length}</strong>
                          <span>Beds</span>
                        </div>

                        <div>
                          <strong>{occupied}</strong>
                          <span>Occupied</span>
                        </div>

                        <div>
                          <strong>{beds.length - occupied}</strong>
                          <span>Vacant</span>
                        </div>
                      </div>

                      <button
                        className="secondary full"
                        onClick={() => {
                          setSelectedPropertyId(p.id);
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
            <div className="section-head">
              <div>
                <button
                  className="back"
                  onClick={() => go("properties")}
                >
                  ← Back to Properties
                </button>

                <h2>{selectedProperty.name}</h2>
                <p>{selectedProperty.location}</p>
              </div>

              <button
                className="primary"
                onClick={() => setRoomModal(true)}
              >
                + Add Room
              </button>
            </div>

            {selectedProperty.rooms.length === 0 ? (
              <div className="card">
                <Empty
                  icon="▦"
                  title="No rooms yet"
                  text="Add a room and define the number of beds."
                  action={
                    <button
                      className="primary"
                      onClick={() => setRoomModal(true)}
                    >
                      Add Room
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="room-grid">
                {selectedProperty.rooms.map((room) => (
                  <div className="room-card" key={room.id}>
                    <div className="room-head">
                      <div>
                        <span>ROOM</span>
                        <h3>{room.number}</h3>
                      </div>

                      <b>{room.beds.length} beds</b>
                    </div>

                    <div className="beds">
                      {room.beds.map((bed) => {
                        const tenant = tenants.find(
                          (t) => t.id === bed.tenantId
                        );

                        return (
                          <button
                            key={bed.id}
                            className={
                              bed.occupied
                                ? "bed occupied"
                                : "bed vacant"
                            }
                            onClick={() => {
                              if (!bed.occupied) {
                                openTenant(
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
                ))}
              </div>
            )}
          </section>
        )}

        {view === "tenants" && (
          <section className="page">
            <div className="section-head">
              <div>
                <h2>Tenants</h2>
                <p>Manage all your tenants.</p>
              </div>

              <button
                className="primary"
                onClick={() => openTenant()}
              >
                + Add Tenant
              </button>
            </div>

            <div className="card">
              <input
                className="search"
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
                placeholder="Search tenant by name or phone..."
              />

              {filteredTenants.length === 0 ? (
                <Empty
                  icon="♙"
                  title="No tenants found"
                  text="Add a tenant to start managing rent."
                />
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
                        <th></th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredTenants.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <strong>{t.name}</strong>
                            <small>{t.phone}</small>
                          </td>

                          <td>{propertyName(t.propertyId)}</td>

                          <td>
                            {roomName(t.propertyId, t.roomId)}
                          </td>

                          <td>
                            {bedName(
                              t.propertyId,
                              t.roomId,
                              t.bedId
                            )}
                          </td>

                          <td>{money(t.rent)}</td>
                          <td>{t.dueDay}</td>

                          <td>
                            <span
                              className={`badge ${
                                t.status === "Active"
                                  ? "green"
                                  : "gray"
                              }`}
                            >
                              {t.status}
                            </span>
                          </td>

                          <td>
                            <button
                              className="small"
                              onClick={() => openPayment(t.id)}
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
            <div className="section-head">
              <div>
                <h2>Payments</h2>
                <p>Track rent payments collected from tenants.</p>
              </div>

              <button
                className="primary"
                onClick={() => openPayment()}
              >
                + Record Payment
              </button>
            </div>

            <div className="card">
              {payments.length === 0 ? (
                <Empty
                  icon="₹"
                  title="No payments yet"
                  text="Record your first rent payment."
                  action={
                    <button
                      className="primary"
                      onClick={() => openPayment()}
                    >
                      Record Payment
                    </button>
                  }
                />
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
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{tenantName(p.tenantId)}</strong>
                          </td>
                          <td>
                            <strong>{money(p.amount)}</strong>
                          </td>
                          <td>{p.date}</td>
                          <td>{p.month}</td>
                          <td>{p.method}</td>
                          <td>{p.note}</td>
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
            <div className="section-head">
              <div>
                <h2>Invoices</h2>
                <p>Create and track monthly rent invoices.</p>
              </div>
            </div>

            <div className="card">
              {invoices.length === 0 ? (
                <Empty
                  icon="▤"
                  title="No invoices yet"
                  text="Generate an invoice for an active tenant below."
                />
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
                      {invoices.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <strong>{i.invoiceNumber}</strong>
                          </td>

                          <td>{tenantName(i.tenantId)}</td>
                          <td>{i.month}</td>
                          <td>{money(i.amount)}</td>
                          <td>{i.dueDate}</td>

                          <td>
                            <span
                              className={`badge ${
                                i.status === "Paid"
                                  ? "green"
                                  : "orange"
                              }`}
                            >
                              {i.status}
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
              <div className="card invoice-card">
                <div className="card-head">
                  <div>
                    <h2>Generate Monthly Invoice</h2>
                    <p>
                      Create an invoice for tenants who don't have one
                      this month.
                    </p>
                  </div>
                </div>

                <div className="invoice-list">
                  {activeTenants.map((tenant) => {
                    const exists = invoices.some(
                      (i) =>
                        i.tenantId === tenant.id &&
                        i.month === currentMonth()
                    );

                    return (
                      <div className="invoice-row" key={tenant.id}>
                        <div>
                          <strong>{tenant.name}</strong>
                          <span>
                            {money(tenant.rent)} · Due day{" "}
                            {tenant.dueDay}
                          </span>
                        </div>

                        <button
                          className="small"
                          disabled={exists || saving}
                          onClick={() => createInvoice(tenant)}
                        >
                          {exists ? "Created" : "Create Invoice"}
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

      {propertyModal && (
        <Modal
          title="Add Property"
          subtitle="Create a new rental property."
          close={() => setPropertyModal(false)}
        >
          <div className="form">
            <label>
              Property Name
              <input
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
                placeholder="Example: Peacely Residency"
              />
            </label>

            <label>
              Location
              <input
                value={propertyLocation}
                onChange={(e) =>
                  setPropertyLocation(e.target.value)
                }
                placeholder="Example: Electronic City"
              />
            </label>

            <button
              className="primary full"
              disabled={saving}
              onClick={addProperty}
            >
              {saving ? "Creating..." : "Create Property"}
            </button>
          </div>
        </Modal>
      )}

      {roomModal && selectedProperty && (
        <Modal
          title="Add Room"
          subtitle={selectedProperty.name}
          close={() => setRoomModal(false)}
        >
          <div className="form">
            <label>
              Room Number
              <input
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
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
                onChange={(e) => setBedCount(e.target.value)}
              />
            </label>

            <button
              className="primary full"
              disabled={saving}
              onClick={addRoom}
            >
              {saving ? "Creating..." : "Create Room"}
            </button>
          </div>
        </Modal>
      )}

      {tenantModal && (
        <Modal
          title="Add Tenant"
          subtitle="Assign a tenant to an available bed."
          close={() => setTenantModal(false)}
          large
        >
          <div className="form-grid">
            <label>
              Full Name *
              <input
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="Tenant name"
              />
            </label>

            <label>
              Phone *
              <input
                value={tenantPhone}
                onChange={(e) => setTenantPhone(e.target.value)}
                placeholder="Phone number"
              />
            </label>

            <label>
              Email
              <input
                type="email"
                value={tenantEmail}
                onChange={(e) => setTenantEmail(e.target.value)}
                placeholder="Email address"
              />
            </label>

            <label>
              Property *
              <select
                value={tenantPropertyId}
                onChange={(e) => {
                  setTenantPropertyId(e.target.value);
                  setTenantRoomId("");
                  setTenantBedId("");
                }}
              >
                <option value="">Select property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Room *
              <select
                value={tenantRoomId}
                disabled={!tenantPropertyId}
                onChange={(e) => {
                  setTenantRoomId(e.target.value);
                  setTenantBedId("");
                }}
              >
                <option value="">Select room</option>

                {tenantProperty?.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    Room {r.number}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Bed *
              <select
                value={tenantBedId}
                disabled={!tenantRoomId}
                onChange={(e) => setTenantBedId(e.target.value)}
              >
                <option value="">Select bed</option>

                {availableBeds.map((b) => (
                  <option key={b.id} value={b.id}>
                    Bed {b.number}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Monthly Rent *
              <input
                type="number"
                value={tenantRent}
                onChange={(e) => setTenantRent(e.target.value)}
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
                onChange={(e) => setTenantDueDay(e.target.value)}
              />
            </label>

            <label>
              Move-in Date
              <input
                type="date"
                value={tenantMoveIn}
                onChange={(e) => setTenantMoveIn(e.target.value)}
              />
            </label>

            <label>
              Security Deposit
              <input
                type="number"
                value={tenantDeposit}
                onChange={(e) => setTenantDeposit(e.target.value)}
                placeholder="₹"
              />
            </label>
          </div>

          <button
            className="primary full"
            disabled={saving}
            onClick={addTenant}
          >
            {saving ? "Adding..." : "Add Tenant"}
          </button>
        </Modal>
      )}

      {paymentModal && (
        <Modal
          title="Record Payment"
          subtitle="Record a rent payment."
          close={() => setPaymentModal(false)}
        >
          <div className="form">
            <label>
              Tenant *
              <select
                value={paymentTenantId}
                onChange={(e) =>
                  setPaymentTenantId(e.target.value)
                }
              >
                <option value="">Select tenant</option>

                {activeTenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {money(t.rent)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Amount *
              <input
                type="number"
                min="1"
                value={paymentAmount}
                onChange={(e) =>
                  setPaymentAmount(e.target.value)
                }
                placeholder="₹"
              />
            </label>

            <label>
              Month
              <input
                value={paymentMonth}
                onChange={(e) => setPaymentMonth(e.target.value)}
              />
            </label>

            <label>
              Payment Method
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value)
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
                rows={3}
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Optional note"
              />
            </label>

            <button
              className="primary full"
              disabled={saving}
              onClick={recordPayment}
            >
              {saving ? "Saving Payment..." : "Record Payment"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: string;
  title?: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      {title && <h3>{title}</h3>}
      <p>{text}</p>
      {action}
    </div>
  );
}

function Modal({
  title,
  subtitle,
  close,
  children,
  large = false,
}: {
  title: string;
  subtitle: string;
  close: () => void;
  children: React.ReactNode;
  large?: boolean;
}) {
  return (
    <div className="modal-overlay" onClick={close}>
      <div
        className={`modal ${large ? "modal-large" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>

          <button className="close" onClick={close}>
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
