import { useEffect, useMemo, useState } from "react";
import "./style.css";

type Page =
  | "dashboard"
  | "property"
  | "rooms"
  | "tenants"
  | "rent"
  | "invoices";

type PropertyData = {
  name: string;
  type: string;
  address: string;
  city: string;
  floors: string;
  rooms: string;
};

type BedStatus = "available" | "occupied";

type Room = {
  id: number;
  number: string;
  type: string;
  beds: number;
  rent: number;
  bedStatus: BedStatus[];
};

type Tenant = {
  id: number;
  name: string;
  phone: string;
  email: string;
  joiningDate: string;
  roomNumber: string;
  roomId: number;
  bedIndex: number;
  bedName: string;
  rent: number;
  deposit: number;
  emergencyContact: string;
};

type PaymentMethod = "Cash" | "UPI" | "Bank Transfer";

type Payment = {
  id: number;
  tenantId: number;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
};

const PROPERTY_KEY = "peacely_property";
const ROOMS_KEY = "peacely_rooms";
const TENANTS_KEY = "peacely_tenants";
const PAYMENTS_KEY = "peacely_payments";

const defaultProperty: PropertyData = {
  name: "",
  type: "PG",
  address: "",
  city: "",
  floors: "",
  rooms: "",
};

const readStorage = <T,>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);

    if (!saved) {
      return fallback;
    }

    return JSON.parse(saved) as T;
  } catch {
    return fallback;
  }
};

const saveStorage = <T,>(key: string, value: T) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const formatCurrency = (amount: number) => {
  return `₹${amount.toLocaleString("en-IN")}`;
};

const formatDate = (date: string) => {
  if (!date) return "-";

  const parsed = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getInitials = (name: string) => {
  if (!name.trim()) return "P";

  return name
    .trim()
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
};

function App() {
  const [page, setPage] = useState<Page>("dashboard");

  const [property, setProperty] = useState<PropertyData>(() =>
    readStorage(PROPERTY_KEY, defaultProperty)
  );

  const [rooms, setRooms] = useState<Room[]>(() =>
    readStorage(ROOMS_KEY, [])
  );

  const [tenants, setTenants] = useState<Tenant[]>(() =>
    readStorage(TENANTS_KEY, [])
  );

  const [payments, setPayments] = useState<Payment[]>(() =>
    readStorage(PAYMENTS_KEY, [])
  );

  useEffect(() => {
    saveStorage(PROPERTY_KEY, property);
  }, [property]);

  useEffect(() => {
    saveStorage(ROOMS_KEY, rooms);
  }, [rooms]);

  useEffect(() => {
    saveStorage(TENANTS_KEY, tenants);
  }, [tenants]);

  useEffect(() => {
    saveStorage(PAYMENTS_KEY, payments);
  }, [payments]);

  const handlePropertySave = (data: PropertyData) => {
    setProperty(data);
  };

  const handleRoomsChange = (updatedRooms: Room[]) => {
    setRooms(updatedRooms);
  };

  const handleTenantsChange = (updatedTenants: Tenant[]) => {
    setTenants(updatedTenants);
  };

  const handlePaymentsChange = (updatedPayments: Payment[]) => {
    setPayments(updatedPayments);
  };

  return (
    <div className="app">
      <TopBar />

      <div className="app-body">
        <Sidebar page={page} setPage={setPage} />

        <main className="main">
          <div className="main-content">
            {page === "dashboard" && (
              <Dashboard
                property={property}
                rooms={rooms}
                tenants={tenants}
                payments={payments}
                setPage={setPage}
              />
            )}

            {page === "property" && (
              <Property
                property={property}
                onSave={handlePropertySave}
              />
            )}

            {page === "rooms" && (
              <Rooms
                rooms={rooms}
                onRoomsChange={handleRoomsChange}
              />
            )}

            {page === "tenants" && (
              <Tenants
                tenants={tenants}
                rooms={rooms}
                onTenantsChange={handleTenantsChange}
                onRoomsChange={handleRoomsChange}
              />
            )}

            {page === "rent" && (
              <RentPayments
                tenants={tenants}
                payments={payments}
                onPaymentsChange={handlePaymentsChange}
              />
            )}

            {page === "invoices" && <Invoices />}
          </div>
        </main>
      </div>
    </div>
  );
}

/* =========================
   TOP BAR
========================= */

function TopBar() {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-logo">P</div>

        <div>
          <div className="brand-name">Peacely</div>
          <div className="brand-subtitle">PG Management</div>
        </div>
      </div>

      <div className="profile">
        <div className="profile-avatar">A</div>

        <div className="profile-text">
          <div className="profile-name">Admin</div>
          <div className="profile-role">Property Manager</div>
        </div>
      </div>
    </header>
  );
}

/* =========================
   SIDEBAR
========================= */

type SidebarProps = {
  page: Page;
  setPage: (page: Page) => void;
};

function Sidebar({ page, setPage }: SidebarProps) {
  const items: { id: Page; icon: string; label: string }[] = [
    {
      id: "dashboard",
      icon: "⌂",
      label: "Dashboard",
    },
    {
      id: "property",
      icon: "▣",
      label: "Property",
    },
    {
      id: "rooms",
      icon: "▦",
      label: "Rooms & Beds",
    },
    {
      id: "tenants",
      icon: "♙",
      label: "Tenants",
    },
    {
      id: "rent",
      icon: "₹",
      label: "Rent & Payments",
    },
    {
      id: "invoices",
      icon: "▤",
      label: "Invoices",
    },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-label">MAIN MENU</div>

      <nav className="nav-list">
        {items.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${page === item.id ? "active" : ""}`}
            onClick={() => setPage(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

/* =========================
   DASHBOARD
========================= */

type DashboardProps = {
  property: PropertyData;
  rooms: Room[];
  tenants: Tenant[];
  payments: Payment[];
  setPage: (page: Page) => void;
};

function Dashboard({
  property,
  rooms,
  tenants,
  payments,
  setPage,
}: DashboardProps) {
  const totalBeds = rooms.reduce((sum, room) => sum + room.beds, 0);

  const occupiedBeds = rooms.reduce(
    (sum, room) =>
      sum +
      room.bedStatus.filter((status) => status === "occupied").length,
    0
  );

  const availableBeds = Math.max(totalBeds - occupiedBeds, 0);

  const currentMonth = new Date().toISOString().slice(0, 7);

  const monthlyCollected = payments
    .filter((payment) => payment.paymentDate.startsWith(currentMonth))
    .reduce((sum, payment) => sum + payment.amount, 0);

  const totalMonthlyRent = tenants.reduce(
    (sum, tenant) => sum + tenant.rent,
    0
  );

  const rentDue = Math.max(totalMonthlyRent - monthlyCollected, 0);

  const recentTenants = [...tenants]
    .sort((a, b) => b.id - a.id)
    .slice(0, 5);

  return (
    <>
      <div className="welcome">
        <h1>Welcome to Peacely 👋</h1>
        <p>
          {property.name
            ? `Manage ${property.name} from one simple dashboard.`
            : "Manage your PG, rooms, tenants and payments from one simple dashboard."}
        </p>
      </div>

      <div className="stats">
        <StatCard
          label="TOTAL BEDS"
          value={totalBeds}
          note="Across all rooms"
        />

        <StatCard
          label="OCCUPIED"
          value={occupiedBeds}
          note="Currently occupied"
        />

        <StatCard
          label="AVAILABLE"
          value={availableBeds}
          note="Beds available"
        />

        <StatCard
          label="RENT DUE"
          value={formatCurrency(rentDue)}
          note="Current month"
        />
      </div>

      <div className="dashboard-grid">
        <section className="panel dashboard-panel">
          <div>
            <h2 className="panel-title">Recent Tenants</h2>
            <p className="panel-subtitle">
              Latest tenant admissions
            </p>
          </div>

          {recentTenants.length === 0 ? (
            <div className="empty-message">
              No tenants added yet.
            </div>
          ) : (
            <div className="recent-list">
              {recentTenants.map((tenant) => (
                <div className="recent-item" key={tenant.id}>
                  <div className="recent-main">
                    <div className="avatar">
                      {getInitials(tenant.name)}
                    </div>

                    <div>
                      <div className="recent-name">
                        {tenant.name}
                      </div>

                      <div className="recent-room">
                        Room {tenant.roomNumber} • {tenant.bedName}
                      </div>
                    </div>
                  </div>

                  <div className="recent-date">
                    {formatDate(tenant.joiningDate)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel dashboard-panel">
          <h2 className="panel-title">Quick Actions</h2>

          <p className="panel-subtitle">
            Common tasks
          </p>

          <div className="quick-actions">
            <button
              className="quick-action"
              onClick={() => setPage("property")}
            >
              <span>Set up property</span>
              <span>→</span>
            </button>

            <button
              className="quick-action"
              onClick={() => setPage("rooms")}
            >
              <span>Add rooms & beds</span>
              <span>→</span>
            </button>

            <button
              className="quick-action"
              onClick={() => setPage("tenants")}
            >
              <span>Admit new tenant</span>
              <span>→</span>
            </button>

            <button
              className="quick-action"
              onClick={() => setPage("rent")}
            >
              <span>Record rent payment</span>
              <span>→</span>
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

/* =========================
   PROPERTY
========================= */

type PropertyProps = {
  property: PropertyData;
  onSave: (data: PropertyData) => void;
};

function Property({ property, onSave }: PropertyProps) {
  const [form, setForm] = useState<PropertyData>(property);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(property);
  }, [property]);

  const updateField = (
    field: keyof PropertyData,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveProperty = () => {
    setMessage("");
    setError("");

    if (!form.name.trim()) {
      setError("Please enter the property name.");
      return;
    }

    if (!form.city.trim()) {
      setError("Please enter the city.");
      return;
    }

    onSave(form);
    setMessage("Property saved successfully.");
  };

  return (
    <div className="property-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Property</h1>
          <p className="page-description">
            Set up your PG or property details.
          </p>
        </div>
      </div>

      <section className="panel property-form">
        <div className="property-info">
          <div className="property-info-title">
            PROPERTY SETUP
          </div>

          <div className="property-info-text">
            Add your property details once and use them
            throughout Peacely.
          </div>
        </div>

        {message && (
          <div className="success-message">{message}</div>
        )}

        {error && (
          <div className="error-message">{error}</div>
        )}

        <div className="form-grid">
          <FormField
            label="Property / PG Name"
            value={form.name}
            placeholder="Example: Peace Residency"
            onChange={(value) =>
              updateField("name", value)
            }
          />

          <FormField
            label="Property Type"
            value={form.type}
            type="select"
            options={[
              "PG",
              "Hostel",
              "Apartment",
              "Shared Accommodation",
            ]}
            onChange={(value) =>
              updateField("type", value)
            }
          />

          <FormField
            label="Address"
            value={form.address}
            placeholder="Full address"
            onChange={(value) =>
              updateField("address", value)
            }
            full
          />

          <FormField
            label="City"
            value={form.city}
            placeholder="Example: Bengaluru"
            onChange={(value) =>
              updateField("city", value)
            }
          />

          <FormField
            label="Number of Floors"
            value={form.floors}
            placeholder="Example: 3"
            onChange={(value) =>
              updateField("floors", value)
            }
          />

          <FormField
            label="Number of Rooms"
            value={form.rooms}
            placeholder="Example: 25"
            onChange={(value) =>
              updateField("rooms", value)
            }
          />
        </div>

        <div className="form-actions">
          <button
            className="primary-btn"
            onClick={saveProperty}
          >
            Save Property
          </button>
        </div>
      </section>
    </div>
  );
}

/* =========================
   ROOMS & BEDS
========================= */

type RoomsProps = {
  rooms: Room[];
  onRoomsChange: (rooms: Room[]) => void;
};

function Rooms({ rooms, onRoomsChange }: RoomsProps) {
  const [showForm, setShowForm] = useState(
    rooms.length === 0
  );

  const [roomNumber, setRoomNumber] = useState("");
  const [roomType, setRoomType] =
    useState("Double Sharing");
  const [beds, setBeds] = useState("2");
  const [rent, setRent] = useState("");
  const [error, setError] = useState("");

  const totalBeds = rooms.reduce(
    (sum, room) => sum + room.beds,
    0
  );

  const occupiedBeds = rooms.reduce(
    (sum, room) =>
      sum +
      room.bedStatus.filter(
        (status) => status === "occupied"
      ).length,
    0
  );

  const availableBeds = totalBeds - occupiedBeds;

  const addRoom = () => {
    setError("");

    if (!roomNumber.trim()) {
      setError("Please enter a room number.");
      return;
    }

    if (rooms.some((room) => room.number === roomNumber.trim())) {
      setError("This room number already exists.");
      return;
    }

    const bedCount = Number(beds);
    const monthlyRent = Number(rent);

    if (!bedCount || bedCount < 1) {
      setError("Please enter a valid number of beds.");
      return;
    }

    if (!monthlyRent || monthlyRent < 0) {
      setError("Please enter a valid monthly rent.");
      return;
    }

    const newRoom: Room = {
      id: Date.now(),
      number: roomNumber.trim(),
      type: roomType,
      beds: bedCount,
      rent: monthlyRent,
      bedStatus: Array.from(
        { length: bedCount },
        () => "available"
      ),
    };

    onRoomsChange([...rooms, newRoom]);

    setRoomNumber("");
    setRoomType("Double Sharing");
    setBeds("2");
    setRent("");
    setShowForm(false);
  };

  const deleteRoom = (roomId: number) => {
    const room = rooms.find((item) => item.id === roomId);

    if (!room) return;

    const hasOccupiedBed = room.bedStatus.some(
      (status) => status === "occupied"
    );

    if (hasOccupiedBed) {
      alert(
        "This room cannot be deleted because one or more beds are occupied."
      );
      return;
    }

    onRoomsChange(
      rooms.filter((item) => item.id !== roomId)
    );
  };

  const toggleBed = (roomId: number, bedIndex: number) => {
    const updatedRooms = rooms.map((room) => {
      if (room.id !== roomId) return room;

      const updatedStatus = [...room.bedStatus];

      updatedStatus[bedIndex] =
        updatedStatus[bedIndex] === "available"
          ? "occupied"
          : "available";

      return {
        ...room,
        bedStatus: updatedStatus,
      };
    });

    onRoomsChange(updatedRooms);
  };

  return (
    <div className="rooms-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rooms & Beds</h1>
          <p className="page-description">
            Manage rooms, beds, rent and occupancy.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={() => {
            setShowForm((current) => !current);
            setError("");
          }}
        >
          {showForm ? "Close Form" : "+ Add Room"}
        </button>
      </div>

      {showForm && (
        <section className="panel room-form">
          <h3>Add New Room</h3>

          {error && (
            <div className="error-message">{error}</div>
          )}

          <div className="form-grid">
            <FormField
              label="Room Number"
              value={roomNumber}
              placeholder="Example: 101"
              onChange={setRoomNumber}
            />

            <FormField
              label="Room Type"
              value={roomType}
              type="select"
              options={[
                "Single",
                "Double Sharing",
                "Triple Sharing",
                "Four Sharing",
              ]}
              onChange={setRoomType}
            />

            <FormField
              label="Number of Beds"
              value={beds}
              type="number"
              placeholder="Example: 2"
              onChange={setBeds}
            />

            <FormField
              label="Monthly Rent / Bed"
              value={rent}
              type="number"
              placeholder="Example: 8000"
              onChange={setRent}
            />
          </div>

          <div className="form-actions">
            <button
              className="primary-btn"
              onClick={addRoom}
            >
              Add Room
            </button>
          </div>
        </section>
      )}

      <div className="room-summary">
        <StatCard
          label="TOTAL ROOMS"
          value={rooms.length}
          note="Configured rooms"
        />

        <StatCard
          label="TOTAL BEDS"
          value={totalBeds}
          note="Across all rooms"
        />

        <StatCard
          label="OCCUPIED"
          value={occupiedBeds}
          note="Currently occupied"
        />

        <StatCard
          label="AVAILABLE"
          value={availableBeds}
          note="Ready for admission"
        />
      </div>

      {rooms.length === 0 ? (
        <section className="panel empty-state">
          <h3>No rooms added yet</h3>
          <p>
            Add your first room to start managing beds.
          </p>
        </section>
      ) : (
        <div className="room-list">
          {rooms.map((room) => {
            const occupied = room.bedStatus.filter(
              (status) => status === "occupied"
            ).length;

            const available = room.beds - occupied;

            return (
              <section
                className="panel room-card"
                key={room.id}
              >
                <div className="room-card-top">
                  <div>
                    <div className="room-label">
                      ROOM
                    </div>

                    <h3>{room.number}</h3>
                  </div>

                  <button
                    className="delete-btn"
                    onClick={() =>
                      deleteRoom(room.id)
                    }
                  >
                    Delete
                  </button>
                </div>

                <div className="room-details">
                  <div>
                    <span>TYPE</span>
                    <strong>{room.type}</strong>
                  </div>

                  <div>
                    <span>BEDS</span>
                    <strong>{room.beds}</strong>
                  </div>

                  <div>
                    <span>RENT / BED</span>
                    <strong>
                      {formatCurrency(room.rent)}
                    </strong>
                  </div>
                </div>

                <div className="bed-status">
                  <span>
                    {occupied} occupied • {available}{" "}
                    available
                  </span>

                  <span
                    className={
                      available > 0
                        ? "available"
                        : "occupied"
                    }
                  >
                    {available > 0
                      ? "Available"
                      : "Full"}
                  </span>
                </div>

                <div className="bed-list">
                  {room.bedStatus.map(
                    (status, index) => {
                      const isOccupied =
                        status === "occupied";

                      return (
                        <div
                          key={index}
                          className={`bed-item ${
                            isOccupied
                              ? "bed-occupied"
                              : "bed-available"
                          }`}
                        >
                          <div className="bed-item-left">
                            <div className="bed-icon">
                              🛏
                            </div>

                            <div>
                              <strong>
                                Bed {index + 1}
                              </strong>

                              <small>
                                {isOccupied
                                  ? "Occupied"
                                  : "Available"}
                              </small>
                            </div>
                          </div>

                          <button
                            className="bed-toggle"
                            onClick={() =>
                              toggleBed(
                                room.id,
                                index
                              )
                            }
                          >
                            {isOccupied
                              ? "Free"
                              : "Occupy"}
                          </button>
                        </div>
                      );
                    }
                  )}
                </div>

                <p className="bed-help">
                  Tap Occupy/Free to manually change
                  bed status.
                </p>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================
   TENANTS
========================= */

type TenantsProps = {
  tenants: Tenant[];
  rooms: Room[];
  onTenantsChange: (tenants: Tenant[]) => void;
  onRoomsChange: (rooms: Room[]) => void;
};

function Tenants({
  tenants,
  rooms,
  onTenantsChange,
  onRoomsChange,
}: TenantsProps) {
  const [showForm, setShowForm] = useState(
    tenants.length === 0
  );

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [joiningDate, setJoiningDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [roomId, setRoomId] = useState("");
  const [bedIndex, setBedIndex] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [emergencyContact, setEmergencyContact] =
    useState("");

  const [error, setError] = useState("");

  const selectedRoom = rooms.find(
    (room) => room.id === Number(roomId)
  );

  const availableBeds = selectedRoom
    ? selectedRoom.bedStatus
        .map((status, index) => ({
          status,
          index,
        }))
        .filter((bed) => bed.status === "available")
    : [];

  useEffect(() => {
    if (!selectedRoom) {
      setMonthlyRent("");
      setBedIndex("");
      return;
    }

    setMonthlyRent(String(selectedRoom.rent));
    setBedIndex("");
  }, [roomId]);

  const resetForm = () => {
    setName("");
    setPhone("");
    setEmail("");
    setJoiningDate(
      new Date().toISOString().slice(0, 10)
    );
    setRoomId("");
    setBedIndex("");
    setMonthlyRent("");
    setDeposit("");
    setEmergencyContact("");
    setError("");
  };

  const addTenant = () => {
    setError("");

    if (!name.trim()) {
      setError("Please enter the tenant name.");
      return;
    }

    if (!phone.trim()) {
      setError("Please enter the phone number.");
      return;
    }

    if (!roomId) {
      setError("Please select a room.");
      return;
    }

    if (bedIndex === "") {
      setError("Please select an available bed.");
      return;
    }

    if (!monthlyRent || Number(monthlyRent) < 0) {
      setError("Please enter a valid monthly rent.");
      return;
    }

    if (!selectedRoom) {
      setError("Selected room could not be found.");
      return;
    }

    const selectedBed = Number(bedIndex);

    if (
      selectedRoom.bedStatus[selectedBed] !==
      "available"
    ) {
      setError("This bed is no longer available.");
      return;
    }

    const newTenant: Tenant = {
      id: Date.now(),
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      joiningDate,
      roomNumber: selectedRoom.number,
      roomId: selectedRoom.id,
      bedIndex: selectedBed,
      bedName: `Bed ${selectedBed + 1}`,
      rent: Number(monthlyRent),
      deposit: Number(deposit) || 0,
      emergencyContact: emergencyContact.trim(),
    };

    onTenantsChange([...tenants, newTenant]);

    const updatedRooms = rooms.map((room) => {
      if (room.id !== selectedRoom.id) {
        return room;
      }

      const updatedStatus = [...room.bedStatus];

      updatedStatus[selectedBed] = "occupied";

      return {
        ...room,
        bedStatus: updatedStatus,
      };
    });

    onRoomsChange(updatedRooms);

    resetForm();
    setShowForm(false);
  };

  const removeTenant = (tenant: Tenant) => {
    const confirmed = window.confirm(
      `Remove ${tenant.name} from Peacely?`
    );

    if (!confirmed) return;

    onTenantsChange(
      tenants.filter((item) => item.id !== tenant.id)
    );

    const updatedRooms = rooms.map((room) => {
      if (room.id !== tenant.roomId) {
        return room;
      }

      const updatedStatus = [...room.bedStatus];

      if (updatedStatus[tenant.bedIndex]) {
        updatedStatus[tenant.bedIndex] = "available";
      }

      return {
        ...room,
        bedStatus: updatedStatus,
      };
    });

    onRoomsChange(updatedRooms);
  };

  return (
    <div className="tenant-list-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tenants</h1>
          <p className="page-description">
            Manage admissions and tenant information.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={() => {
            setShowForm((current) => !current);
            setError("");
          }}
        >
          {showForm ? "Close Form" : "+ Add Tenant"}
        </button>
      </div>

      {showForm && (
        <section className="panel room-form">
          <h3>New Tenant Admission</h3>

          {error && (
            <div className="error-message">{error}</div>
          )}

          {rooms.length === 0 ? (
            <div className="empty-message">
              Please add a room before admitting a
              tenant.
            </div>
          ) : (
            <>
              <div className="form-grid">
                <FormField
                  label="Full Name"
                  value={name}
                  placeholder="Tenant full name"
                  onChange={setName}
                />

                <FormField
                  label="Phone Number"
                  value={phone}
                  type="tel"
                  placeholder="10 digit mobile number"
                  onChange={setPhone}
                />

                <FormField
                  label="Email"
                  value={email}
                  type="email"
                  placeholder="tenant@example.com"
                  onChange={setEmail}
                />

                <FormField
                  label="Joining Date"
                  value={joiningDate}
                  type="date"
                  onChange={setJoiningDate}
                />

                <FormField
                  label="Room"
                  value={roomId}
                  type="select"
                  options={rooms.map(
                    (room) =>
                      `${room.id}|||Room ${room.number}`
                  )}
                  onChange={setRoomId}
                  optionValues={rooms.map((room) =>
                    String(room.id)
                  )}
                />

                <FormField
                  label="Bed"
                  value={bedIndex}
                  type="select"
                  options={availableBeds.map(
                    (bed) =>
                      `${bed.index}|||Bed ${
                        bed.index + 1
                      }`
                  )}
                  onChange={setBedIndex}
                  optionValues={availableBeds.map(
                    (bed) => String(bed.index)
                  )}
                  disabled={availableBeds.length === 0}
                />

                <FormField
                  label="Monthly Rent"
                  value={monthlyRent}
                  type="number"
                  placeholder="Monthly rent"
                  onChange={setMonthlyRent}
                />

                <FormField
                  label="Security Deposit"
                  value={deposit}
                  type="number"
                  placeholder="Deposit amount"
                  onChange={setDeposit}
                />

                <FormField
                  label="Emergency Contact"
                  value={emergencyContact}
                  type="tel"
                  placeholder="Emergency contact number"
                  onChange={setEmergencyContact}
                />
              </div>

              {selectedRoom &&
                availableBeds.length === 0 && (
                  <div className="error-message">
                    This room has no available beds.
                    Please select another room.
                  </div>
                )}

              <div className="form-actions">
                <button
                  className="primary-btn"
                  onClick={addTenant}
                >
                  Admit Tenant
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {tenants.length === 0 ? (
        <section className="panel empty-state">
          <h3>No tenants yet</h3>
          <p>
            Add your first tenant admission to see
            them here.
          </p>
        </section>
      ) : (
        <div className="tenant-list">
          {tenants.map((tenant) => (
            <section
              className="panel tenant-card"
              key={tenant.id}
            >
              <div className="tenant-card-top">
                <div className="tenant-main">
                  <div className="large-avatar">
                    {getInitials(tenant.name)}
                  </div>

                  <div>
                    <h3>{tenant.name}</h3>

                    <p>
                      Room {tenant.roomNumber} •{" "}
                      {tenant.bedName}
                    </p>
                  </div>
                </div>

                <span className="tenant-status">
                  Active
                </span>
              </div>

              <div className="tenant-details">
                <div>
                  <span>PHONE</span>
                  <strong>{tenant.phone}</strong>
                </div>

                <div>
                  <span>JOINED</span>
                  <strong>
                    {formatDate(tenant.joiningDate)}
                  </strong>
                </div>

                <div>
                  <span>MONTHLY RENT</span>
                  <strong>
                    {formatCurrency(tenant.rent)}
                  </strong>
                </div>

                <div>
                  <span>DEPOSIT</span>
                  <strong>
                    {formatCurrency(tenant.deposit)}
                  </strong>
                </div>
              </div>

              <div className="tenant-contact">
                {tenant.email && (
                  <div>✉ {tenant.email}</div>
                )}

                {tenant.emergencyContact && (
                  <div>
                    ☎ Emergency:{" "}
                    {tenant.emergencyContact}
                  </div>
                )}
              </div>

              <div className="form-actions">
                <button
                  className="delete-btn"
                  onClick={() =>
                    removeTenant(tenant)
                  }
                >
                  Remove Tenant
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================
   RENT & PAYMENTS
========================= */

type RentPaymentsProps = {
  tenants: Tenant[];
  payments: Payment[];
  onPaymentsChange: (payments: Payment[]) => void;
};

function RentPayments({
  tenants,
  payments,
  onPaymentsChange,
}: RentPaymentsProps) {
  const [tenantId, setTenantId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("UPI");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const currentMonth = new Date()
    .toISOString()
    .slice(0, 7);

  const currentMonthPayments = useMemo(() => {
    return payments.filter((payment) =>
      payment.paymentDate.startsWith(currentMonth)
    );
  }, [payments, currentMonth]);

  const collected = currentMonthPayments.reduce(
    (sum, payment) => sum + payment.amount,
    0
  );

  const totalRent = tenants.reduce(
    (sum, tenant) => sum + tenant.rent,
    0
  );

  const pending = Math.max(totalRent - collected, 0);

  const recordPayment = () => {
    setError("");
    setMessage("");

    if (!tenantId) {
      setError("Please select a tenant.");
      return;
    }

    const paymentAmount = Number(amount);

    if (!paymentAmount || paymentAmount <= 0) {
      setError("Please enter a valid payment amount.");
      return;
    }

    if (!paymentDate) {
      setError("Please select a payment date.");
      return;
    }

    const newPayment: Payment = {
      id: Date.now(),
      tenantId: Number(tenantId),
      amount: paymentAmount,
      paymentDate,
      paymentMethod,
    };

    onPaymentsChange([
      newPayment,
      ...payments,
    ]);

    setTenantId("");
    setAmount("");
    setPaymentDate(
      new Date().toISOString().slice(0, 10)
    );
    setPaymentMethod("UPI");
    setMessage("Payment recorded successfully.");
  };

  const getTenant = (id: number) => {
    return tenants.find((tenant) => tenant.id === id);
  };

  const getTenantPaidThisMonth = (id: number) => {
    return currentMonthPayments
      .filter((payment) => payment.tenantId === id)
      .reduce((sum, payment) => sum + payment.amount, 0);
  };

  return (
    <div className="rent-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Rent & Payments
          </h1>

          <p className="page-description">
            Track monthly rent collection and payments.
          </p>
        </div>
      </div>

      <div className="rent-summary">
        <section className="panel rent-stat">
          <div className="rent-stat-label">
            MONTHLY RENT
          </div>

          <div className="rent-stat-value">
            {formatCurrency(totalRent)}
          </div>

          <div className="rent-stat-note">
            Total expected rent
          </div>
        </section>

        <section className="panel rent-stat">
          <div className="rent-stat-label">
            COLLECTED
          </div>

          <div className="rent-stat-value">
            {formatCurrency(collected)}
          </div>

          <div className="rent-stat-note">
            Current month
          </div>
        </section>

        <section className="panel rent-stat">
          <div className="rent-stat-label">
            PENDING
          </div>

          <div className="rent-stat-value">
            {formatCurrency(pending)}
          </div>

          <div className="rent-stat-note">
            Current month
          </div>
        </section>
      </div>

      <div className="rent-content">
        <section className="panel payment-form">
          <h3>Record Payment</h3>

          {message && (
            <div className="success-message">
              {message}
            </div>
          )}

          {error && (
            <div className="error-message">{error}</div>
          )}

          {tenants.length === 0 ? (
            <div className="empty-message">
              Add a tenant before recording a payment.
            </div>
          ) : (
            <>
              <div className="form-grid">
                <FormField
                  label="Tenant"
                  value={tenantId}
                  type="select"
                  options={tenants.map(
                    (tenant) =>
                      `${tenant.id}|||${tenant.name} - Room ${tenant.roomNumber}`
                  )}
                  optionValues={tenants.map((tenant) =>
                    String(tenant.id)
                  )}
                  onChange={(value) => {
                    setTenantId(value);

                    const tenant = tenants.find(
                      (item) =>
                        item.id === Number(value)
                    );

                    if (tenant) {
                      setAmount(String(tenant.rent));
                    }
                  }}
                />

                <FormField
                  label="Amount"
                  value={amount}
                  type="number"
                  placeholder="Payment amount"
                  onChange={setAmount}
                />

                <FormField
                  label="Payment Date"
                  value={paymentDate}
                  type="date"
                  onChange={setPaymentDate}
                />

                <FormField
                  label="Payment Method"
                  value={paymentMethod}
                  type="select"
                  options={[
                    "UPI",
                    "Cash",
                    "Bank Transfer",
                  ]}
                  onChange={(value) =>
                    setPaymentMethod(
                      value as PaymentMethod
                    )
                  }
                />
              </div>

              <div className="form-actions">
                <button
                  className="primary-btn"
                  onClick={recordPayment}
                >
                  Record Payment
                </button>
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">
              Tenant Rent Status
            </h2>

            <p className="panel-subtitle">
              Current month payment status
            </p>
          </div>

          {tenants.length === 0 ? (
            <div className="empty-message">
              No tenants available.
            </div>
          ) : (
            <>
              <div className="list-header">
                <span>Tenant</span>
                <span>Rent</span>
                <span>Paid</span>
                <span>Status</span>
              </div>

              <div className="payment-list">
                {tenants.map((tenant) => {
                  const paid =
                    getTenantPaidThisMonth(
                      tenant.id
                    );

                  const isPaid = paid >= tenant.rent;

                  return (
                    <div
                      className="payment-row"
                      key={tenant.id}
                    >
                      <div className="payment-tenant">
                        <div className="payment-tenant-avatar">
                          {getInitials(tenant.name)}
                        </div>

                        <div>
                          <div className="payment-tenant-name">
                            {tenant.name}
                          </div>

                          <div className="payment-tenant-room">
                            Room {tenant.roomNumber} •{" "}
                            {tenant.bedName}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="payment-label">
                          RENT
                        </div>

                        <div className="payment-number">
                          {formatCurrency(
                            tenant.rent
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="payment-label">
                          PAID
                        </div>

                        <div className="payment-number">
                          {formatCurrency(paid)}
                        </div>
                      </div>

                      <div>
                        <span
                          className={
                            isPaid
                              ? "paid"
                              : "pending"
                          }
                        >
                          {isPaid
                            ? "Paid"
                            : "Pending"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      <section className="panel payment-history">
        <div className="panel-header">
          <h2 className="panel-title">
            Recent Payment History
          </h2>

          <p className="panel-subtitle">
            Latest recorded payments
          </p>
        </div>

        {payments.length === 0 ? (
          <div className="empty-message">
            No payments recorded yet.
          </div>
        ) : (
          <div className="payment-history-list">
            {[...payments]
              .sort(
                (a, b) => b.id - a.id
              )
              .slice(0, 10)
              .map((payment) => {
                const tenant = getTenant(
                  payment.tenantId
                );

                return (
                  <div
                    className="history-row"
                    key={payment.id}
                  >
                    <div>
                      <div className="history-name">
                        {tenant
                          ? tenant.name
                          : "Unknown Tenant"}
                      </div>

                      <div className="history-date">
                        {formatDate(
                          payment.paymentDate
                        )}
                      </div>
                    </div>

                    <div className="history-method">
                      {payment.paymentMethod}
                    </div>

                    <div className="history-date">
                      {tenant
                        ? `Room ${tenant.roomNumber}`
                        : "-"}
                    </div>

                    <div className="history-amount">
                      +{formatCurrency(
                        payment.amount
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}

/* =========================
   INVOICES
========================= */

function Invoices() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>

          <p className="page-description">
            Create and manage tenant invoices.
          </p>
        </div>
      </div>

      <section className="panel coming-soon">
        <div className="coming-soon-inner">
          <div className="coming-soon-icon">
            🧾
          </div>

          <h2>Invoices are coming soon</h2>

          <p>
            Peacely will soon let you generate
            professional rent invoices, download them
            and share them with tenants.
          </p>
        </div>
      </section>
    </div>
  );
}

/* =========================
   FORM FIELD
========================= */

type FormFieldProps = {
  label: string;
  value: string;
  type?: "text" | "number" | "email" | "tel" | "date" | "select";
  placeholder?: string;
  options?: string[];
  optionValues?: string[];
  onChange: (value: string) => void;
  full?: boolean;
  disabled?: boolean;
};

function FormField({
  label,
  value,
  type = "text",
  placeholder,
  options = [],
  optionValues,
  onChange,
  full = false,
  disabled = false,
}: FormFieldProps) {
  return (
    <div
      className={`form-field ${
        full ? "full" : ""
      }`}
    >
      <label>{label}</label>

      {type === "select" ? (
        <select
          value={value}
          disabled={disabled}
          onChange={(event) =>
            onChange(event.target.value)
          }
        >
          <option value="">
            {disabled
              ? "No available options"
              : `Select ${label}`}
          </option>

          {options.map((option, index) => {
            const parts = option.split("|||");

            const optionValue =
              optionValues?.[index] ??
              parts[0] ??
              option;

            const optionLabel =
              parts[1] ?? option;

            return (
              <option
                key={`${optionValue}-${index}`}
                value={optionValue}
              >
                {optionLabel}
              </option>
            );
          })}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) =>
            onChange(event.target.value)
          }
        />
      )}
    </div>
  );
}

/* =========================
   STAT CARD
========================= */

type StatCardProps = {
  label: string;
  value: string | number;
  note: string;
};

function StatCard({
  label,
  value,
  note,
}: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>

      <div className="stat-value">{value}</div>

      <div className="stat-note">{note}</div>
    </div>
  );
}

export default App;
