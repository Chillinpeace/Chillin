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

const initialProperties: Property[] = [
  {
    id: 1,
    name: "My First PG",
    location: "Electronic City, Bengaluru",
    rooms: [
      {
        id: 101,
        number: "101",
        beds: [
          { id: 1, number: "A", occupied: true, tenantId: 1 },
          { id: 2, number: "B", occupied: true, tenantId: 2 },
        ],
      },
      {
        id: 102,
        number: "102",
        beds: [
          { id: 3, number: "A", occupied: true, tenantId: 3 },
          { id: 4, number: "B", occupied: false },
        ],
      },
      {
        id: 103,
        number: "103",
        beds: [
          { id: 5, number: "A", occupied: false },
          { id: 6, number: "B", occupied: false },
        ],
      },
    ],
  },
];

const initialTenants: Tenant[] = [
  {
    id: 1,
    name: "Rahul Kumar",
    phone: "9876543210",
    email: "rahul@example.com",
    propertyId: 1,
    roomId: 101,
    bedId: 1,
    rent: 8500,
    dueDay: 5,
    moveInDate: "2026-08-01",
    deposit: 10000,
    status: "Active",
  },
  {
    id: 2,
    name: "Arun Raj",
    phone: "9876543211",
    email: "arun@example.com",
    propertyId: 1,
    roomId: 101,
    bedId: 2,
    rent: 8500,
    dueDay: 5,
    moveInDate: "2026-08-05",
    deposit: 10000,
    status: "Active",
  },
  {
    id: 3,
    name: "Vikram Singh",
    phone: "9876543212",
    email: "vikram@example.com",
    propertyId: 1,
    roomId: 102,
    bedId: 3,
    rent: 9000,
    dueDay: 10,
    moveInDate: "2026-08-10",
    deposit: 12000,
    status: "Active",
  },
];

const initialPayments: Payment[] = [
  {
    id: 1,
    tenantId: 1,
    amount: 8500,
    date: "2026-09-05",
    month: "September 2026",
    method: "UPI",
    note: "Monthly rent",
  },
];

const initialInvoices: Invoice[] = [
  {
    id: 1,
    tenantId: 1,
    invoiceNumber: "INV-0001",
    amount: 8500,
    month: "September 2026",
    dueDate: "2026-09-05",
    status: "Paid",
    createdAt: "2026-09-01",
  },
  {
    id: 2,
    tenantId: 2,
    invoiceNumber: "INV-0002",
    amount: 8500,
    month: "September 2026",
    dueDate: "2026-09-05",
    status: "Pending",
    createdAt: "2026-09-01",
  },
];

function loadData<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function formatMoney(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function Peacely() {
  const [view, setView] = useState<View>("dashboard");

  const [properties, setProperties] = useState<Property[]>(() =>
    loadData("peacely_properties", initialProperties)
  );

  const [tenants, setTenants] = useState<Tenant[]>(() =>
    loadData("peacely_tenants", initialTenants)
  );

  const [payments, setPayments] = useState<Payment[]>(() =>
    loadData("peacely_payments", initialPayments)
  );

  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    loadData("peacely_invoices", initialInvoices)
  );

  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(
    null
  );

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
  const [paymentMonth, setPaymentMonth] = useState("September 2026");
  const [paymentNote, setPaymentNote] = useState("");

  const [tenantSearch, setTenantSearch] = useState("");

  useEffect(() => {
    localStorage.setItem("peacely_properties", JSON.stringify(properties));
  }, [properties]);

  useEffect(() => {
    localStorage.setItem("peacely_tenants", JSON.stringify(tenants));
  }, [tenants]);

  useEffect(() => {
    localStorage.setItem("peacely_payments", JSON.stringify(payments));
  }, [payments]);

  useEffect(() => {
    localStorage.setItem("peacely_invoices", JSON.stringify(invoices));
  }, [invoices]);

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

  const currentMonthPayments = payments
    .filter((payment) => payment.month === "September 2026")
    .reduce((total, payment) => total + payment.amount, 0);

  const pendingInvoices = invoices.filter(
    (invoice) => invoice.status === "Pending"
  );

  const pendingAmount = pendingInvoices.reduce(
    (total, invoice) => total + invoice.amount,
    0
  );

  const filteredTenants = tenants.filter((tenant) => {
    const search = tenantSearch.toLowerCase();

    return (
      tenant.name.toLowerCase().includes(search) ||
      tenant.phone.includes(search)
    );
  });

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

  function addProperty() {
    if (!propertyName.trim() || !propertyLocation.trim()) return;

    const newProperty: Property = {
      id: Date.now(),
      name: propertyName.trim(),
      location: propertyLocation.trim(),
      rooms: [],
    };

    setProperties((current) => [...current, newProperty]);
    setPropertyName("");
    setPropertyLocation("");
    setShowPropertyForm(false);
  }

  function addRoom() {
    if (!selectedProperty || !roomNumber.trim()) return;

    const count = Math.max(1, Math.min(10, Number(bedCount) || 1));

    const newRoom: Room = {
      id: Date.now(),
      number: roomNumber.trim(),
      beds: Array.from({ length: count }, (_, index) => ({
        id: Date.now() + index,
        number: String.fromCharCode(65 + index),
        occupied: false,
      })),
    };

    setProperties((current) =>
      current.map((property) =>
        property.id === selectedProperty.id
          ? { ...property, rooms: [...property.rooms, newRoom] }
          : property
      )
    );

    setRoomNumber("");
    setBedCount("2");
    setShowRoomForm(false);
  }

  function toggleBed(roomId: number, bedId: number) {
    if (!selectedProperty) return;

    setProperties((current) =>
      current.map((property) =>
        property.id === selectedProperty.id
          ? {
              ...property,
              rooms: property.rooms.map((room) =>
                room.id === roomId
                  ? {
                      ...room,
                      beds: room.beds.map((bed) =>
                        bed.id === bedId
                          ? {
                              ...bed,
                              occupied: !bed.occupied,
                              tenantId: bed.occupied
                                ? undefined
                                : bed.tenantId,
                            }
                          : bed
                      ),
                    }
                  : room
              ),
            }
          : property
      )
    );
  }

  function addTenant() {
    if (
      !tenantName.trim() ||
      !tenantPhone.trim() ||
      !tenantPropertyId ||
      !tenantRoomId ||
      !tenantBedId ||
      !tenantRent
    ) {
      return;
    }

    const newTenantId = Date.now();

    const newTenant: Tenant = {
      id: newTenantId,
      name: tenantName.trim(),
      phone: tenantPhone.trim(),
      email: tenantEmail.trim(),
      propertyId: Number(tenantPropertyId),
      roomId: Number(tenantRoomId),
      bedId: Number(tenantBedId),
      rent: Number(tenantRent),
      dueDay: Number(tenantDueDay) || 5,
      moveInDate: tenantMoveIn,
      deposit: Number(tenantDeposit) || 0,
      status: "Active",
    };

    setTenants((current) => [...current, newTenant]);

    setProperties((current) =>
      current.map((property) =>
        property.id === Number(tenantPropertyId)
          ? {
              ...property,
              rooms: property.rooms.map((room) =>
                room.id === Number(tenantRoomId)
                  ? {
                      ...room,
                      beds: room.beds.map((bed) =>
                        bed.id === Number(tenantBedId)
                          ? {
                              ...bed,
                              occupied: true,
                              tenantId: newTenantId,
                            }
                          : bed
                      ),
                    }
                  : room
              ),
            }
          : property
      )
    );

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
  }

  function recordPayment() {
    if (!paymentTenantId || !paymentAmount) return;

    const tenantId = Number(paymentTenantId);
    const amount = Number(paymentAmount);

    const payment: Payment = {
      id: Date.now(),
      tenantId,
      amount,
      date: today(),
      month: paymentMonth,
      method: paymentMethod,
      note: paymentNote.trim() || "Monthly rent",
    };

    setPayments((current) => [payment, ...current]);

    setInvoices((current) =>
      current.map((invoice) =>
        invoice.tenantId === tenantId && invoice.month === paymentMonth
          ? { ...invoice, status: "Paid" }
          : invoice
      )
    );

    setPaymentTenantId("");
    setPaymentAmount("");
    setPaymentMethod("UPI");
    setPaymentNote("");
    setShowPaymentForm(false);
  }

  function createInvoice(tenant: Tenant) {
    const alreadyExists = invoices.some(
      (invoice) =>
        invoice.tenantId === tenant.id &&
        invoice.month === "September 2026"
    );

    if (alreadyExists) return;

    const invoice: Invoice = {
      id: Date.now(),
      tenantId: tenant.id,
      invoiceNumber: `INV-${String(invoices.length + 1).padStart(4, "0")}`,
      amount: tenant.rent,
      month: "September 2026",
      dueDate: `2026-09-${String(tenant.dueDay).padStart(2, "0")}`,
      status: "Pending",
      createdAt: today(),
    };

    setInvoices((current) => [invoice, ...current]);
  }

  function tenantNameById(id: number) {
    return tenants.find((tenant) => tenant.id === id)?.name || "Unknown";
  }

  function propertyNameById(id: number) {
    return properties.find((property) => property.id === id)?.name || "-";
  }

  function roomNameById(propertyId: number, roomId: number) {
    const property = properties.find((item) => item.id === propertyId);
    return property?.rooms.find((room) => room.id === roomId)?.number || "-";
  }

  function bedNameById(
    propertyId: number,
    roomId: number,
    bedId: number
  ) {
    const property = properties.find((item) => item.id === propertyId);
    const room = property?.rooms.find((item) => item.id === roomId);
    return room?.beds.find((bed) => bed.id === bedId)?.number || "-";
  }

  function renderDashboard() {
    return (
      <>
        <section className="page-heading">
          <div>
            <p className="eyebrow">OVERVIEW</p>
            <h2>Good to see you 👋</h2>
            <p className="subtitle">
              Everything important about your PG, in one peaceful place.
            </p>
          </div>
          <button
            className="primary"
            onClick={() => setShowTenantForm(true)}
          >
            ＋ Add Tenant
          </button>
        </section>

        <section className="stats">
          <div className="card">
            <span>Properties</span>
            <strong>{properties.length}</strong>
          </div>
          <div className="card">
            <span>Occupied Beds</span>
            <strong>{occupiedBeds}</strong>
          </div>
          <div className="card">
            <span>Vacant Beds</span>
            <strong>{vacantBeds}</strong>
          </div>
          <div className="card">
            <span>Active Tenants</span>
            <strong>{activeTenants.length}</strong>
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="large-card">
            <div className="section-title">
              <div>
                <h3>Rent Overview</h3>
                <p>This month's collection</p>
              </div>
              <span className="success-pill">September 2026</span>
            </div>

            <div className="money-row">
              <div>
                <span>Expected</span>
                <strong>{formatMoney(monthlyExpectedRent)}</strong>
              </div>
              <div>
                <span>Collected</span>
                <strong>{formatMoney(currentMonthPayments)}</strong>
              </div>
              <div>
                <span>Pending</span>
                <strong>{formatMoney(pendingAmount)}</strong>
              </div>
            </div>
          </div>

          <div className="large-card">
            <div className="section-title">
              <div>
                <h3>Occupancy</h3>
                <p>Current bed usage</p>
              </div>
            </div>

            <div className="occupancy-number">
              {totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0}%
            </div>

            <div className="progress">
              <div
                style={{
                  width: `${
                    totalBeds ? (occupiedBeds / totalBeds) * 100 : 0
                  }%`,
                }}
              />
            </div>

            <p className="muted">
              {occupiedBeds} occupied of {totalBeds} total beds
            </p>
          </div>
        </section>

        <section className="properties-section">
          <div className="section-title">
            <h3>Quick Actions</h3>
          </div>

          <div className="quick-grid">
            <button
              className="quick-card"
              onClick={() => navigate("properties")}
            >
              <span>🏠</span>
              <strong>Manage Properties</strong>
              <small>Rooms and beds</small>
            </button>

            <button
              className="quick-card"
              onClick={() => navigate("tenants")}
            >
              <span>👤</span>
              <strong>Manage Tenants</strong>
              <small>Residents and assignments</small>
            </button>

            <button
              className="quick-card"
              onClick={() => navigate("payments")}
            >
              <span>💰</span>
              <strong>Rent & Payments</strong>
              <small>Track collections</small>
            </button>

            <button
              className="quick-card"
              onClick={() => navigate("invoices")}
            >
              <span>🧾</span>
              <strong>Invoices</strong>
              <small>Create and track bills</small>
            </button>
          </div>
        </section>
      </>
    );
  }

  function renderProperties() {
    return (
      <>
        <section className="page-heading">
          <div>
            <p className="eyebrow">PROPERTY MANAGEMENT</p>
            <h2>Your Properties</h2>
            <p className="subtitle">
              Manage your PGs, rooms and beds from one peaceful place.
            </p>
          </div>

          <button
            className="primary"
            onClick={() => setShowPropertyForm(!showPropertyForm)}
          >
            ＋ Add Property
          </button>
        </section>

        {showPropertyForm && (
          <section className="form-card">
            <h3>Add a new property</h3>

            <div className="form-grid">
              <input
                type="text"
                placeholder="Property / PG name"
                value={propertyName}
                onChange={(event) => setPropertyName(event.target.value)}
              />

              <input
                type="text"
                placeholder="Location"
                value={propertyLocation}
                onChange={(event) =>
                  setPropertyLocation(event.target.value)
                }
              />

              <button className="primary" onClick={addProperty}>
                Save Property
              </button>
            </div>
          </section>
        )}

        <section className="stats">
          <div className="card">
            <span>Properties</span>
            <strong>{properties.length}</strong>
          </div>
          <div className="card">
            <span>Total Rooms</span>
            <strong>{totalRooms}</strong>
          </div>
          <div className="card">
            <span>Occupied Beds</span>
            <strong>{occupiedBeds}</strong>
          </div>
          <div className="card">
            <span>Vacant Beds</span>
            <strong>{vacantBeds}</strong>
          </div>
        </section>

        <section className="properties-section">
          <div className="section-title">
            <h3>Properties</h3>
            <span>{properties.length} properties</span>
          </div>

          <div className="property-grid">
            {properties.map((property) => {
              const beds = property.rooms.reduce(
                (total, room) => total + room.beds.length,
                0
              );

              const occupied = property.rooms.reduce(
                (total, room) =>
                  total +
                  room.beds.filter((bed) => bed.occupied).length,
                0
              );

              return (
                <div className="property-card" key={property.id}>
                  <div className="property-top">
                    <div className="property-icon">🏠</div>

                    <div>
                      <h3>{property.name}</h3>
                      <p>📍 {property.location}</p>
                    </div>
                  </div>

                  <div className="property-stats">
                    <div>
                      <span>Rooms</span>
                      <strong>{property.rooms.length}</strong>
                    </div>

                    <div>
                      <span>Beds</span>
                      <strong>{beds}</strong>
                    </div>

                    <div>
                      <span>Occupied</span>
                      <strong>{occupied}</strong>
                    </div>

                    <div>
                      <span>Vacant</span>
                      <strong>{beds - occupied}</strong>
                    </div>
                  </div>

                  <button
                    className="manage-button"
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
        </section>
      </>
    );
  }

  function renderProperty() {
    if (!selectedProperty) return null;

    const propertyBeds = selectedProperty.rooms.reduce(
      (total, room) => total + room.beds.length,
      0
    );

    const propertyOccupied = selectedProperty.rooms.reduce(
      (total, room) =>
        total + room.beds.filter((bed) => bed.occupied).length,
      0
    );

    return (
      <>
        <button
          className="back-button"
          onClick={() => navigate("properties")}
        >
          ← Back to Properties
        </button>

        <section className="page-heading">
          <div>
            <p className="eyebrow">PROPERTY</p>
            <h2>{selectedProperty.name}</h2>
            <p className="subtitle">📍 {selectedProperty.location}</p>
          </div>

          <button
            className="primary"
            onClick={() => setShowRoomForm(!showRoomForm)}
          >
            ＋ Add Room
          </button>
        </section>

        <section className="stats">
          <div className="card">
            <span>Rooms</span>
            <strong>{selectedProperty.rooms.length}</strong>
          </div>

          <div className="card">
            <span>Total Beds</span>
            <strong>{propertyBeds}</strong>
          </div>

          <div className="card">
            <span>Occupied</span>
            <strong>{propertyOccupied}</strong>
          </div>

          <div className="card">
            <span>Vacant</span>
            <strong>{propertyBeds - propertyOccupied}</strong>
          </div>
        </section>

        {showRoomForm && (
          <section className="form-card">
            <h3>Add a room</h3>

            <div className="form-grid">
              <input
                type="text"
                placeholder="Room number e.g. 104"
                value={roomNumber}
                onChange={(event) => setRoomNumber(event.target.value)}
              />

              <input
                type="number"
                min="1"
                max="10"
                placeholder="Number of beds"
                value={bedCount}
                onChange={(event) => setBedCount(event.target.value)}
              />

              <button className="primary" onClick={addRoom}>
                Save Room
              </button>
            </div>
          </section>
        )}

        <section className="properties-section">
          <div className="section-title">
            <h3>Rooms & Beds</h3>
            <span>{selectedProperty.rooms.length} rooms</span>
          </div>

          {selectedProperty.rooms.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🚪</div>
              <h3>No rooms yet</h3>
              <p>Add your first room to start managing beds.</p>

              <button
                className="primary"
                onClick={() => setShowRoomForm(true)}
              >
                Add First Room
              </button>
            </div>
          ) : (
            <div className="room-grid">
              {selectedProperty.rooms.map((room) => (
                <div className="room-card" key={room.id}>
                  <div className="room-header">
                    <div>
                      <span>ROOM</span>
                      <h3>{room.number}</h3>
                    </div>

                    <div className="bed-count">
                      {room.beds.length} beds
                    </div>
                  </div>

                  <div className="beds">
                    {room.beds.map((bed) => {
                      const tenant = tenants.find(
                        (item) => item.id === bed.tenantId
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
                              setTenantPropertyId(selectedProperty.id.toString());
                              setTenantRoomId(room.id.toString());
                              setTenantBedId(bed.id.toString());
                              setShowTenantForm(true);
                            }
                          }}
                        >
                          <span className="bed-icon">🛏️</span>

                          <strong>Bed {bed.number}</strong>

                          <small>
                            {bed.occupied
                              ? tenant?.name || "Occupied"
                              : "Vacant"}
                          </small>
                        </button>
                      );
                    })}
                  </div>

                  <p className="bed-hint">
                    Tap a vacant bed to assign a tenant
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </>
    );
  }

  function renderTenants() {
    return (
      <>
        <section className="page-heading">
          <div>
            <p className="eyebrow">TENANT MANAGEMENT</p>
            <h2>Tenants</h2>
            <p className="subtitle">
              Keep your residents, assignments and rent details organized.
            </p>
          </div>

          <button
            className="primary"
            onClick={() => setShowTenantForm(true)}
          >
            ＋ Add Tenant
          </button>
        </section>

        <div className="search-box">
          🔎
          <input
            placeholder="Search tenant by name or phone..."
            value={tenantSearch}
            onChange={(event) => setTenantSearch(event.target.value)}
          />
        </div>

        <section className="tenant-list">
          {filteredTenants.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">👤</div>
              <h3>No tenants found</h3>
              <p>Add a tenant or change your search.</p>
            </div>
          ) : (
            filteredTenants.map((tenant) => (
              <div className="tenant-card" key={tenant.id}>
                <div className="tenant-avatar">
                  {tenant.name.charAt(0).toUpperCase()}
                </div>

                <div className="tenant-main">
                  <div className="tenant-name-row">
                    <h3>{tenant.name}</h3>
                    <span className="status-pill">Active</span>
                  </div>

                  <p>📱 {tenant.phone}</p>

                  <div className="tenant-location">
                    🏠 {propertyNameById(tenant.propertyId)}
                    {" · "}
                    Room {roomNameById(tenant.propertyId, tenant.roomId)}
                    {" · "}
                    Bed{" "}
                    {bedNameById(
                      tenant.propertyId,
                      tenant.roomId,
                      tenant.bedId
                    )}
                  </div>
                </div>

                <div className="tenant-rent">
                  <span>Monthly Rent</span>
                  <strong>{formatMoney(tenant.rent)}</strong>
                  <small>Due on {tenant.dueDay}th</small>
                </div>
              </div>
            ))
          )}
        </section>
      </>
    );
  }

  function renderPayments() {
    return (
      <>
        <section className="page-heading">
          <div>
            <p className="eyebrow">FINANCE</p>
            <h2>Rent & Payments</h2>
            <p className="subtitle">
              Record rent payments and keep your collection history.
            </p>
          </div>

          <button
            className="primary"
            onClick={() => setShowPaymentForm(true)}
          >
            ＋ Record Payment
          </button>
        </section>

        <section className="stats">
          <div className="card">
            <span>Expected Rent</span>
            <strong>{formatMoney(monthlyExpectedRent)}</strong>
          </div>

          <div className="card">
            <span>Collected</span>
            <strong>{formatMoney(currentMonthPayments)}</strong>
          </div>

          <div className="card">
            <span>Pending</span>
            <strong>{formatMoney(pendingAmount)}</strong>
          </div>

          <div className="card">
            <span>Payments</span>
            <strong>{payments.length}</strong>
          </div>
        </section>

        <section className="properties-section">
          <div className="section-title">
            <h3>Payment History</h3>
          </div>

          <div className="table-card">
            {payments.length === 0 ? (
              <div className="empty small-empty">
                <h3>No payments yet</h3>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tenant</th>
                      <th>Month</th>
                      <th>Amount</th>
                      <th>Date</th>
                      <th>Method</th>
                    </tr>
                  </thead>

                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{tenantNameById(payment.tenantId)}</td>
                        <td>{payment.month}</td>
                        <td>
                          <strong>{formatMoney(payment.amount)}</strong>
                        </td>
                        <td>{payment.date}</td>
                        <td>
                          <span className="method-pill">
                            {payment.method}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </>
    );
  }

  function renderInvoices() {
    return (
      <>
        <section className="page-heading">
          <div>
            <p className="eyebrow">FINANCE</p>
            <h2>Invoices</h2>
            <p className="subtitle">
              Create monthly rent invoices and track payment status.
            </p>
          </div>
        </section>

        <section className="invoice-grid">
          {activeTenants.map((tenant) => {
            const invoice = invoices.find(
              (item) =>
                item.tenantId === tenant.id &&
                item.month === "September 2026"
            );

            return (
              <div className="invoice-card" key={tenant.id}>
                <div className="invoice-top">
                  <div>
                    <span>MONTHLY RENT</span>
                    <h3>{tenant.name}</h3>
                  </div>

                  {invoice ? (
                    <span
                      className={
                        invoice.status === "Paid"
                          ? "status-pill"
                          : "pending-pill"
                      }
                    >
                      {invoice.status}
                    </span>
                  ) : (
                    <span className="pending-pill">Not Created</span>
                  )}
                </div>

                <div className="invoice-info">
                  <div>
                    <span>Amount</span>
                    <strong>{formatMoney(tenant.rent)}</strong>
                  </div>

                  <div>
                    <span>Due Date</span>
                    <strong>
                      September {String(tenant.dueDay).padStart(2, "0")}
                    </strong>
                  </div>
                </div>

                {invoice ? (
                  <div className="invoice-number">
                    {invoice.invoiceNumber}
                  </div>
                ) : (
                  <button
                    className="manage-button"
                    onClick={() => createInvoice(tenant)}
                  >
                    Create September Invoice
                  </button>
                )}
              </div>
            );
          })}
        </section>
      </>
    );
  }

  function renderTenantForm() {
    if (!showTenantForm) return null;

    return (
      <div
        className="modal-overlay"
        onClick={() => setShowTenantForm(false)}
      >
        <div
          className="modal"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-header">
            <div>
              <p className="eyebrow">TENANT</p>
              <h2>Add Tenant</h2>
            </div>

            <button
              className="close-button"
              onClick={() => setShowTenantForm(false)}
            >
              ×
            </button>
          </div>

          <div className="modal-form">
            <label>
              Full Name
              <input
                value={tenantName}
                onChange={(event) => setTenantName(event.target.value)}
                placeholder="Tenant name"
              />
            </label>

            <label>
              Phone Number
              <input
                value={tenantPhone}
                onChange={(event) => setTenantPhone(event.target.value)}
                placeholder="10 digit phone number"
              />
            </label>

            <label>
              Email
              <input
                value={tenantEmail}
                onChange={(event) => setTenantEmail(event.target.value)}
                placeholder="Optional email"
              />
            </label>

            <div className="two-column">
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
                  {availableRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      Room {room.number}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Bed
              <select
                value={tenantBedId}
                onChange={(event) => setTenantBedId(event.target.value)}
                disabled={!tenantRoomId}
              >
                <option value="">Select vacant bed</option>
                {availableBeds.map((bed) => (
                  <option key={bed.id} value={bed.id}>
                    Bed {bed.number}
                  </option>
                ))}
              </select>
            </label>

            <div className="two-column">
              <label>
                Monthly Rent
                <input
                  type="number"
                  value={tenantRent}
                  onChange={(event) => setTenantRent(event.target.value)}
                  placeholder="₹8500"
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
            </div>

            <div className="two-column">
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
                  placeholder="₹10000"
                />
              </label>
            </div>

            <button className="primary full-button" onClick={addTenant}>
              Save Tenant
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderPaymentForm() {
    if (!showPaymentForm) return null;

    return (
      <div
        className="modal-overlay"
        onClick={() => setShowPaymentForm(false)}
      >
        <div
          className="modal"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-header">
            <div>
              <p className="eyebrow">PAYMENT</p>
              <h2>Record Payment</h2>
            </div>

            <button
              className="close-button"
              onClick={() => setShowPaymentForm(false)}
            >
              ×
            </button>
          </div>

          <div className="modal-form">
            <label>
              Tenant
              <select
                value={paymentTenantId}
                onChange={(event) => {
                  const id = event.target.value;
                  setPaymentTenantId(id);

                  const tenant = tenants.find(
                    (item) => item.id === Number(id)
                  );

                  if (tenant) {
                    setPaymentAmount(String(tenant.rent));
                  }
                }}
              >
                <option value="">Select tenant</option>
                {activeTenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} — {formatMoney(tenant.rent)}
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
                placeholder="₹8500"
              />
            </label>

            <label>
              Month
              <select
                value={paymentMonth}
                onChange={(event) => setPaymentMonth(event.target.value)}
              >
                <option>September 2026</option>
                <option>October 2026</option>
                <option>November 2026</option>
              </select>
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
              </select>
            </label>

            <label>
              Note
              <input
                value={paymentNote}
                onChange={(event) => setPaymentNote(event.target.value)}
                placeholder="Optional note"
              />
            </label>

            <button
              className="primary full-button"
              onClick={recordPayment}
            >
              Save Payment
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="logo">P</div>

          <div>
            <h1>Peacely</h1>
            <p>PG & Rental Management</p>
          </div>
        </div>

        <button className="profile">Admin</button>
      </header>

      <div className="app-layout">
        <aside className="sidebar">
          <nav>
            <button
              className={view === "dashboard" ? "nav-item active" : "nav-item"}
              onClick={() => navigate("dashboard")}
            >
              <span>📊</span>
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
              <span>🏠</span>
              Properties
            </button>

            <button
              className={view === "tenants" ? "nav-item active" : "nav-item"}
              onClick={() => navigate("tenants")}
            >
              <span>👤</span>
              Tenants
            </button>

            <button
              className={view === "payments" ? "nav-item active" : "nav-item"}
              onClick={() => navigate("payments")}
            >
              <span>💰</span>
              Payments
            </button>

            <button
              className={view === "invoices" ? "nav-item active" : "nav-item"}
              onClick={() => navigate("invoices")}
            >
              <span>🧾</span>
              Invoices
            </button>
          </nav>

          <div className="sidebar-footer">
            <div className="peace-mark">☮</div>
            <strong>Manage peacefully.</strong>
            <span>Everything in one place.</span>
          </div>
        </aside>

        <main className="content">
          {view === "dashboard" && renderDashboard()}
          {view === "properties" && renderProperties()}
          {view === "property" && renderProperty()}
          {view === "tenants" && renderTenants()}
          {view === "payments" && renderPayments()}
          {view === "invoices" && renderInvoices()}
        </main>
      </div>

      {renderTenantForm()}
      {renderPaymentForm()}

      <div className="mobile-nav">
        <button
          className={view === "dashboard" ? "mobile-active" : ""}
          onClick={() => navigate("dashboard")}
        >
          <span>📊</span>
          Home
        </button>

        <button
          className={
            view === "properties" || view === "property"
              ? "mobile-active"
              : ""
          }
          onClick={() => navigate("properties")}
        >
          <span>🏠</span>
          Properties
        </button>

        <button
          className={view === "tenants" ? "mobile-active" : ""}
          onClick={() => navigate("tenants")}
        >
          <span>👤</span>
          Tenants
        </button>

        <button
          className={view === "payments" ? "mobile-active" : ""}
          onClick={() => navigate("payments")}
        >
          <span>💰</span>
          Payments
        </button>

        <button
          className={view === "invoices" ? "mobile-active" : ""}
          onClick={() => navigate("invoices")}
        >
          <span>🧾</span>
          Bills
        </button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Peacely />
  </React.StrictMode>
);
