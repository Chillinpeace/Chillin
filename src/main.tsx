import { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
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
  bedStatus?: BedStatus[];
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

const propertyStorageKey = "peacely_property";
const roomsStorageKey = "peacely_rooms";
const tenantsStorageKey = "peacely_tenants";
const paymentsStorageKey = "peacely_payments";

function App() {
  const [page, setPage] = useState<Page>("dashboard");

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div>
            <h1>Peacely</h1>
            <span>PG Management</span>
          </div>
        </div>

        <div className="topbar-right">
          <div className="admin-avatar">A</div>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <nav>
            <NavItem
              label="Dashboard"
              icon="⌂"
              active={page === "dashboard"}
              onClick={() => setPage("dashboard")}
            />

            <NavItem
              label="Property"
              icon="▣"
              active={page === "property"}
              onClick={() => setPage("property")}
            />

            <NavItem
              label="Rooms & Beds"
              icon="▦"
              active={page === "rooms"}
              onClick={() => setPage("rooms")}
            />

            <NavItem
              label="Tenants"
              icon="♙"
              active={page === "tenants"}
              onClick={() => setPage("tenants")}
            />

            <NavItem
              label="Rent & Payments"
              icon="₹"
              active={page === "rent"}
              onClick={() => setPage("rent")}
            />

            <NavItem
              label="Invoices"
              icon="▤"
              active={page === "invoices"}
              onClick={() => setPage("invoices")}
            />
          </nav>

          <div className="sidebar-bottom">
            <div className="sidebar-help">
              <strong>Peacely</strong>
              <span>Manage your PG peacefully.</span>
            </div>
          </div>
        </aside>

        <main className="main-content">
          {page === "dashboard" && (
            <Dashboard
              goToTenants={() => setPage("tenants")}
              goToRooms={() => setPage("rooms")}
            />
          )}

          {page === "property" && <Property />}
          {page === "rooms" && <Rooms />}
          {page === "tenants" && <Tenants />}
          {page === "rent" && <RentPayments />}
          {page === "invoices" && <ComingSoon title="Invoices" />}
        </main>
      </div>
    </div>
  );
}

function NavItem({
  label,
  icon,
  active,
  onClick
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-item ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function Dashboard({
  goToTenants,
  goToRooms
}: {
  goToTenants: () => void;
  goToRooms: () => void;
}) {
  const [tenants, setTenants] = useState<Tenant[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(tenantsStorageKey);

    if (stored) {
      try {
        setTenants(JSON.parse(stored));
      } catch {
        setTenants([]);
      }
    }
  }, []);

  return (
    <div className="dashboard">
      <section className="welcome-card">
        <div>
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Good day, Admin 👋</h2>
          <p className="welcome-text">
            Manage your property, rooms, tenants and payments from one place.
          </p>
        </div>

        <div className="welcome-icon">🏠</div>
      </section>

      <section className="stats-grid">
        <StatCard
          title="TOTAL BEDS"
          value="100"
          subtitle="Across all rooms"
          icon="🛏"
        />
        <StatCard
          title="OCCUPIED"
          value="72"
          subtitle="72% occupancy"
          icon="👤"
        />
        <StatCard
          title="AVAILABLE"
          value="28"
          subtitle="Ready for admission"
          icon="✓"
        />
        <StatCard
          title="RENT DUE"
          value="₹24,500"
          subtitle="This month"
          icon="₹"
        />
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">TENANTS</p>
              <h3>Recent Tenants</h3>
            </div>

            <button className="text-btn" onClick={goToTenants}>
              View all →
            </button>
          </div>

          {tenants.length === 0 ? (
            <div className="empty-dashboard">
              <div className="empty-icon">♙</div>
              <h4>No tenants yet</h4>
              <p>Add your first tenant from the Tenants page.</p>
            </div>
          ) : (
            <div className="recent-list">
              {tenants.slice(0, 5).map((tenant) => (
                <div className="recent-item" key={tenant.id}>
                  <div className="small-avatar">
                    {tenant.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="recent-info">
                    <strong>{tenant.name}</strong>
                    <span>
                      Room {tenant.roomNumber} • {tenant.bedName}
                    </span>
                  </div>

                  <div className="recent-rent">
                    ₹{tenant.rent.toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">QUICK ACTIONS</p>
              <h3>Manage Peacely</h3>
            </div>
          </div>

          <div className="quick-actions">
            <button onClick={goToTenants}>
              <span>+</span>
              <div>
                <strong>New Admission</strong>
                <small>Add a new tenant</small>
              </div>
            </button>

            <button onClick={goToRooms}>
              <span>▦</span>
              <div>
                <strong>Manage Rooms</strong>
                <small>Add rooms and beds</small>
              </div>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        <div className="stat-icon">{icon}</div>
      </div>

      <strong>{value}</strong>
      <small>{subtitle}</small>
    </div>
  );
}

function Property() {
  const [form, setForm] = useState<PropertyData>({
    name: "",
    type: "",
    address: "",
    city: "",
    floors: "",
    rooms: ""
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(propertyStorageKey);

    if (stored) {
      try {
        setForm(JSON.parse(stored));
      } catch {
        // Ignore invalid saved data.
      }
    }
  }, []);

  const updateField = (field: keyof PropertyData, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const saveProperty = () => {
    if (!form.name.trim() || !form.type || !form.city.trim()) {
      alert("Please fill Property Name, Property Type and City.");
      return;
    }

    localStorage.setItem(propertyStorageKey, JSON.stringify(form));
    setSaved(true);

    setTimeout(() => {
      setSaved(false);
    }, 2500);
  };

  return (
    <div className="property-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">PROPERTY</p>
          <h2>Property Setup</h2>
          <p className="page-description">
            Add your PG or property details.
          </p>
        </div>
      </div>

      <div className="panel property-panel">
        <div className="panel-header">
          <div>
            <h3>Property Details</h3>
            <p>Basic information about your property.</p>
          </div>
        </div>

        <div className="form-grid">
          <FormField
            label="Property Name"
            value={form.name}
            placeholder="Example: Peace Residency"
            onChange={(value) => updateField("name", value)}
          />

          <div className="form-field">
            <label>Property Type</label>

            <select
              value={form.type}
              onChange={(event) =>
                updateField("type", event.target.value)
              }
            >
              <option value="">Select property type</option>
              <option value="PG">PG</option>
              <option value="Hostel">Hostel</option>
              <option value="Coliving">Co-Living</option>
              <option value="Apartment">Apartment</option>
            </select>
          </div>

          <FormField
            label="Address"
            value={form.address}
            placeholder="Full property address"
            onChange={(value) => updateField("address", value)}
            full
          />

          <FormField
            label="City"
            value={form.city}
            placeholder="Example: Bengaluru"
            onChange={(value) => updateField("city", value)}
          />

          <FormField
            label="Total Floors"
            value={form.floors}
            placeholder="Example: 4"
            onChange={(value) => updateField("floors", value)}
            type="number"
          />

          <FormField
            label="Total Rooms"
            value={form.rooms}
            placeholder="Example: 30"
            onChange={(value) => updateField("rooms", value)}
            type="number"
          />
        </div>

        <div className="form-footer">
          {saved && (
            <span className="success-message">
              ✓ Saved successfully
            </span>
          )}

          <button className="primary-btn" onClick={saveProperty}>
            Save Property
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  placeholder,
  onChange,
  type = "text",
  full = false
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  type?: string;
  full?: boolean;
}) {
  return (
    <div className={`form-field ${full ? "full" : ""}`}>
      <label>{label}</label>

      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Rooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [number, setNumber] = useState("");
  const [type, setType] = useState("Double Sharing");
  const [beds, setBeds] = useState("2");
  const [rent, setRent] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(roomsStorageKey);

    if (stored) {
      try {
        const parsed: Room[] = JSON.parse(stored);

        const normalized = parsed.map((room) => ({
          ...room,
          bedStatus:
            room.bedStatus &&
            room.bedStatus.length === room.beds
              ? room.bedStatus
              : Array.from(
                  { length: room.beds },
                  () => "available" as BedStatus
                )
        }));

        setRooms(normalized);
      } catch {
        setRooms([]);
      }
    }
  }, []);

  const saveRooms = (updatedRooms: Room[]) => {
    setRooms(updatedRooms);
    localStorage.setItem(
      roomsStorageKey,
      JSON.stringify(updatedRooms)
    );
  };

  const addRoom = () => {
    if (!number.trim() || !beds || !rent) {
      alert(
        "Please fill Room Number, Number of Beds and Monthly Rent."
      );
      return;
    }

    const bedCount = Math.max(1, Number(beds));
    const rentAmount = Math.max(0, Number(rent));

    const newRoom: Room = {
      id: Date.now(),
      number: number.trim(),
      type,
      beds: bedCount,
      rent: rentAmount,
      bedStatus: Array.from(
        { length: bedCount },
        () => "available" as BedStatus
      )
    };

    saveRooms([...rooms, newRoom]);

    setNumber("");
    setType("Double Sharing");
    setBeds("2");
    setRent("");
    setShowForm(false);
  };

  const deleteRoom = (roomId: number) => {
    const room = rooms.find((item) => item.id === roomId);

    if (!room) {
      return;
    }

    if (room.bedStatus?.some((status) => status === "occupied")) {
      alert(
        "This room has occupied beds. Please remove the tenants first."
      );
      return;
    }

    if (!window.confirm(`Delete Room ${room.number}?`)) {
      return;
    }

    saveRooms(
      rooms.filter((item) => item.id !== roomId)
    );
  };

  const toggleBed = (roomId: number, bedIndex: number) => {
    const updatedRooms = rooms.map((room) => {
      if (room.id !== roomId) {
        return room;
      }

      const statuses =
        room.bedStatus ??
        Array.from(
          { length: room.beds },
          () => "available" as BedStatus
        );

      const updatedStatuses = [...statuses];

      updatedStatuses[bedIndex] =
        updatedStatuses[bedIndex] === "occupied"
          ? "available"
          : "occupied";

      return {
        ...room,
        bedStatus: updatedStatuses
      };
    });

    saveRooms(updatedRooms);
  };

  const totalRooms = rooms.length;

  const totalBeds = rooms.reduce(
    (sum, room) => sum + room.beds,
    0
  );

  const occupiedBeds = rooms.reduce((sum, room) => {
    const statuses =
      room.bedStatus ??
      Array.from(
        { length: room.beds },
        () => "available" as BedStatus
      );

    return (
      sum +
      statuses.filter(
        (status) => status === "occupied"
      ).length
    );
  }, 0);

  const availableBeds = totalBeds - occupiedBeds;

  return (
    <div className="rooms-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">ROOMS & BEDS</p>
          <h2>Rooms & Beds</h2>
          <p className="page-description">
            Manage rooms, beds and availability.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={() => setShowForm((current) => !current)}
        >
          {showForm ? "Close" : "+ Add Room"}
        </button>
      </div>

      {showForm && (
        <div className="panel room-form">
          <h3>Add New Room</h3>

          <div className="form-grid">
            <FormField
              label="Room Number"
              value={number}
              placeholder="Example: 101"
              onChange={setNumber}
            />

            <div className="form-field">
              <label>Room Type</label>

              <select
                value={type}
                onChange={(event) =>
                  setType(event.target.value)
                }
              >
                <option>Single</option>
                <option>Double Sharing</option>
                <option>Triple Sharing</option>
                <option>Four Sharing</option>
              </select>
            </div>

            <FormField
              label="Number of Beds"
              value={beds}
              placeholder="Example: 2"
              onChange={setBeds}
              type="number"
            />

            <FormField
              label="Monthly Rent / Bed"
              value={rent}
              placeholder="Example: 8000"
              onChange={setRent}
              type="number"
            />
          </div>

          <div className="form-footer">
            <button className="primary-btn" onClick={addRoom}>
              Save Room
            </button>
          </div>
        </div>
      )}

      <div className="room-summary">
        <StatCard
          title="TOTAL ROOMS"
          value={String(totalRooms)}
          subtitle="Rooms added"
          icon="▦"
        />

        <StatCard
          title="TOTAL BEDS"
          value={String(totalBeds)}
          subtitle="Across all rooms"
          icon="🛏"
        />

        <StatCard
          title="OCCUPIED"
          value={String(occupiedBeds)}
          subtitle="Occupied beds"
          icon="👤"
        />

        <StatCard
          title="AVAILABLE"
          value={String(availableBeds)}
          subtitle="Available beds"
          icon="✓"
        />
      </div>

      {rooms.length === 0 ? (
        <div className="panel empty-state">
          <h3>No rooms added yet</h3>
          <p>Add your first room to start managing beds.</p>
        </div>
      ) : (
        <div className="room-list">
          {rooms.map((room) => {
            const statuses =
              room.bedStatus ??
              Array.from(
                { length: room.beds },
                () => "available" as BedStatus
              );

            return (
              <div className="panel room-card" key={room.id}>
                <div className="room-card-top">
                  <div>
                    <span className="room-label">ROOM</span>
                    <h3>{room.number}</h3>
                  </div>

                  <button
                    className="delete-btn"
                    onClick={() => deleteRoom(room.id)}
                  >
                    Delete
                  </button>
                </div>

                <div className="room-details">
                  <div>
                    <span>Type</span>
                    <strong>{room.type}</strong>
                  </div>

                  <div>
                    <span>Beds</span>
                    <strong>{room.beds}</strong>
                  </div>

                  <div>
                    <span>Rent / Bed</span>
                    <strong>
                      ₹{room.rent.toLocaleString("en-IN")}
                    </strong>
                  </div>
                </div>

                <div className="bed-status">
                  <span>Bed Status</span>

                  <strong className="available">
                    {
                      statuses.filter(
                        (status) => status === "available"
                      ).length
                    }{" "}
                    Available
                  </strong>
                </div>

                <div className="bed-list">
                  {statuses.map((status, index) => {
                    const bedName = `Bed ${String.fromCharCode(
                      65 + index
                    )}`;

                    return (
                      <button
                        key={index}
                        className={`bed-item ${
                          status === "occupied"
                            ? "bed-occupied"
                            : "bed-available"
                        }`}
                        onClick={() =>
                          toggleBed(room.id, index)
                        }
                      >
                        <span className="bed-item-left">
                          <span className="bed-icon">
                            🛏
                          </span>

                          <span>
                            <strong>{bedName}</strong>
                            <small>
                              {status === "occupied"
                                ? "Occupied"
                                : "Available"}
                            </small>
                          </span>
                        </span>

                        <span
                          className={
                            status === "occupied"
                              ? "occupied"
                              : "available"
                          }
                        >
                          {status === "occupied"
                            ? "Occupied"
                            : "Available"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p className="bed-help">
                  Tap a bed to change its status.
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Tenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [joiningDate, setJoiningDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [roomId, setRoomId] = useState("");
  const [bedIndex, setBedIndex] = useState("");
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");

  useEffect(() => {
    const storedTenants =
      localStorage.getItem(tenantsStorageKey);

    const storedRooms =
      localStorage.getItem(roomsStorageKey);

    if (storedTenants) {
      try {
        setTenants(JSON.parse(storedTenants));
      } catch {
        setTenants([]);
      }
    }

    if (storedRooms) {
      try {
        const parsed: Room[] = JSON.parse(storedRooms);

        const normalized = parsed.map((room) => ({
          ...room,
          bedStatus:
            room.bedStatus &&
            room.bedStatus.length === room.beds
              ? room.bedStatus
              : Array.from(
                  { length: room.beds },
                  () => "available" as BedStatus
                )
        }));

        setRooms(normalized);
      } catch {
        setRooms([]);
      }
    }
  }, []);

  const availableRooms = rooms.filter((room) => {
    const statuses =
      room.bedStatus ??
      Array.from(
        { length: room.beds },
        () => "available" as BedStatus
      );

    return statuses.some(
      (status) => status === "available"
    );
  });

  const selectedRoom = rooms.find(
    (room) => room.id === Number(roomId)
  );

  const availableBeds = selectedRoom
    ? (
        selectedRoom.bedStatus ??
        Array.from(
          { length: selectedRoom.beds },
          () => "available" as BedStatus
        )
      )
        .map((status, index) => ({
          status,
          index
        }))
        .filter(
          (bed) => bed.status === "available"
        )
    : [];

  useEffect(() => {
    if (selectedRoom) {
      setRent(String(selectedRoom.rent));

      if (
        bedIndex === "" ||
        !availableBeds.some(
          (bed) => bed.index === Number(bedIndex)
        )
      ) {
        setBedIndex(
          availableBeds.length > 0
            ? String(availableBeds[0].index)
            : ""
        );
      }
    } else {
      setRent("");
      setBedIndex("");
    }
  }, [roomId]);

  const addTenant = () => {
    if (
      !name.trim() ||
      !phone.trim() ||
      !roomId ||
      bedIndex === ""
    ) {
      alert(
        "Please fill Full Name, Phone Number, Room and Bed."
      );
      return;
    }

    const room = rooms.find(
      (item) => item.id === Number(roomId)
    );

    if (!room) {
      alert("Selected room not found.");
      return;
    }

    const statuses =
      room.bedStatus ??
      Array.from(
        { length: room.beds },
        () => "available" as BedStatus
      );

    if (statuses[Number(bedIndex)] !== "available") {
      alert("This bed is no longer available.");
      return;
    }

    const index = Number(bedIndex);
    const updatedStatuses = [...statuses];

    updatedStatuses[index] = "occupied";

    const updatedRooms = rooms.map((item) =>
      item.id === room.id
        ? {
            ...item,
            bedStatus: updatedStatuses
          }
        : item
    );

    const newTenant: Tenant = {
      id: Date.now(),
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      joiningDate,
      roomNumber: room.number,
      roomId: room.id,
      bedIndex: index,
      bedName: `Bed ${String.fromCharCode(
        65 + index
      )}`,
      rent: Number(rent) || room.rent,
      deposit: Number(deposit) || 0,
      emergencyContact: emergencyContact.trim()
    };

    const updatedTenants = [
      ...tenants,
      newTenant
    ];

    localStorage.setItem(
      roomsStorageKey,
      JSON.stringify(updatedRooms)
    );

    localStorage.setItem(
      tenantsStorageKey,
      JSON.stringify(updatedTenants)
    );

    setRooms(updatedRooms);
    setTenants(updatedTenants);

    setName("");
    setPhone("");
    setEmail("");
    setJoiningDate(
      new Date().toISOString().slice(0, 10)
    );
    setRoomId("");
    setBedIndex("");
    setRent("");
    setDeposit("");
    setEmergencyContact("");

    setShowForm(false);

    alert(
      "Tenant added successfully. Bed marked as occupied."
    );
  };

  const removeTenant = (tenant: Tenant) => {
    if (
      !window.confirm(
        `Remove ${tenant.name} from Peacely?`
      )
    ) {
      return;
    }

    const updatedTenants = tenants.filter(
      (item) => item.id !== tenant.id
    );

    const updatedRooms = rooms.map((room) => {
      if (room.id !== tenant.roomId) {
        return room;
      }

      const statuses =
        room.bedStatus ??
        Array.from(
          { length: room.beds },
          () => "available" as BedStatus
        );

      const updatedStatuses = [...statuses];

      if (
        updatedStatuses[tenant.bedIndex] !==
        undefined
      ) {
        updatedStatuses[tenant.bedIndex] =
          "available";
      }

      return {
        ...room,
        bedStatus: updatedStatuses
      };
    });

    localStorage.setItem(
      tenantsStorageKey,
      JSON.stringify(updatedTenants)
    );

    localStorage.setItem(
      roomsStorageKey,
      JSON.stringify(updatedRooms)
    );

    setTenants(updatedTenants);
    setRooms(updatedRooms);
  };

  return (
    <div className="tenant-list-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">TENANTS</p>
          <h2>Tenants</h2>
          <p className="page-description">
            Manage admissions and tenant information.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={() =>
            setShowForm((current) => !current)
          }
        >
          {showForm
            ? "Close"
            : "+ New Admission"}
        </button>
      </div>

      {showForm && (
        <div className="panel room-form">
          <h3>New Tenant Admission</h3>

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
              placeholder="10 digit mobile number"
              onChange={setPhone}
              type="tel"
            />

            <FormField
              label="Email"
              value={email}
              placeholder="tenant@email.com"
              onChange={setEmail}
              type="email"
            />

            <FormField
              label="Joining Date"
              value={joiningDate}
              placeholder=""
              onChange={setJoiningDate}
              type="date"
            />

            <div className="form-field">
              <label>Room</label>

              <select
                value={roomId}
                onChange={(event) =>
                  setRoomId(event.target.value)
                }
              >
                <option value="">
                  Select room
                </option>

                {availableRooms.map((room) => (
                  <option
                    key={room.id}
                    value={room.id}
                  >
                    Room {room.number} — ₹
                    {room.rent.toLocaleString(
                      "en-IN"
                    )}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Bed</label>

              <select
                value={bedIndex}
                onChange={(event) =>
                  setBedIndex(event.target.value)
                }
                disabled={!roomId}
              >
                <option value="">
                  Select bed
                </option>

                {availableBeds.map((bed) => (
                  <option
                    key={bed.index}
                    value={bed.index}
                  >
                    Bed{" "}
                    {String.fromCharCode(
                      65 + bed.index
                    )}
                  </option>
                ))}
              </select>
            </div>

            <FormField
              label="Monthly Rent"
              value={rent}
              placeholder="Monthly rent"
              onChange={setRent}
              type="number"
            />

            <FormField
              label="Security Deposit"
              value={deposit}
              placeholder="Deposit amount"
              onChange={setDeposit}
              type="number"
            />

            <FormField
              label="Emergency Contact"
              value={emergencyContact}
              placeholder="Emergency contact number"
              onChange={setEmergencyContact}
              type="tel"
            />
          </div>

          <div className="form-footer">
            <button
              className="primary-btn"
              onClick={addTenant}
            >
              Save Tenant
            </button>
          </div>
        </div>
      )}

      {tenants.length === 0 ? (
        <div className="panel empty-state">
          <h3>No tenants added yet</h3>
          <p>
            Add your first tenant to start managing
            admissions.
          </p>
        </div>
      ) : (
        <div className="tenant-list">
          {tenants.map((tenant) => (
            <div
              className="panel tenant-card"
              key={tenant.id}
            >
              <div className="tenant-card-top">
                <div className="tenant-main">
                  <div className="large-avatar">
                    {tenant.name
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div>
                    <h3>{tenant.name}</h3>
                    <span>
                      Room {tenant.roomNumber} •{" "}
                      {tenant.bedName}
                    </span>
                  </div>
                </div>

                <button
                  className="delete-btn"
                  onClick={() =>
                    removeTenant(tenant)
                  }
                >
                  Remove
                </button>
              </div>

              <div className="tenant-details">
                <div>
                  <span>Monthly Rent</span>
                  <strong>
                    ₹{tenant.rent.toLocaleString(
                      "en-IN"
                    )}
                  </strong>
                </div>

                <div>
                  <span>Joining Date</span>
                  <strong>
                    {tenant.joiningDate}
                  </strong>
                </div>

                <div>
                  <span>Deposit</span>
                  <strong>
                    ₹{tenant.deposit.toLocaleString(
                      "en-IN"
                    )}
                  </strong>
                </div>
              </div>

              <div className="tenant-contact">
                <span>📱 {tenant.phone}</span>

                {tenant.email && (
                  <span>
                    ✉️ {tenant.email}
                  </span>
                )}

                {tenant.emergencyContact && (
                  <span>
                    🚨 {tenant.emergencyContact}
                  </span>
                )}

                <span className="occupied">
                  Occupied
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RentPayments() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [tenantId, setTenantId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] =
    useState(
      new Date()
        .toISOString()
        .slice(0, 10)
    );
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("UPI");

  useEffect(() => {
    const storedTenants =
      localStorage.getItem(
        tenantsStorageKey
      );

    const storedPayments =
      localStorage.getItem(
        paymentsStorageKey
      );

    if (storedTenants) {
      try {
        setTenants(
          JSON.parse(storedTenants)
        );
      } catch {
        setTenants([]);
      }
    }

    if (storedPayments) {
      try {
        setPayments(
          JSON.parse(storedPayments)
        );
      } catch {
        setPayments([]);
      }
    }
  }, []);

  const currentMonth =
    new Date()
      .toISOString()
      .slice(0, 7);

  const currentMonthPayments =
    useMemo(() => {
      return payments.filter((payment) =>
        payment.paymentDate.startsWith(
          currentMonth
        )
      );
    }, [payments, currentMonth]);

  const totalMonthlyRent =
    tenants.reduce(
      (sum, tenant) =>
        sum + tenant.rent,
      0
    );

  const totalCollected =
    currentMonthPayments.reduce(
      (sum, payment) =>
        sum + payment.amount,
      0
    );

  const totalPending = Math.max(
    totalMonthlyRent -
      totalCollected,
    0
  );

  const tenantPaidAmount = (
    id: number
  ) => {
    return currentMonthPayments
      .filter(
        (payment) =>
          payment.tenantId === id
      )
      .reduce(
        (sum, payment) =>
          sum + payment.amount,
        0
      );
  };

  const getTenantStatus = (
    tenant: Tenant
  ) => {
    const paid =
      tenantPaidAmount(tenant.id);

    if (paid >= tenant.rent) {
      return "Paid";
    }

    return "Pending";
  };

  const selectTenant = (
    value: string
  ) => {
    setTenantId(value);

    const tenant =
      tenants.find(
        (item) =>
          item.id === Number(value)
      );

    if (tenant) {
      setAmount(
        String(tenant.rent)
      );
    } else {
      setAmount("");
    }
  };

  const recordPayment = () => {
    if (
      !tenantId ||
      !amount ||
      !paymentDate
    ) {
      alert(
        "Please select a tenant, enter amount and payment date."
      );
      return;
    }

    const tenant =
      tenants.find(
        (item) =>
          item.id === Number(
            tenantId
          )
      );

    if (!tenant) {
      alert("Tenant not found.");
      return;
    }

    const paymentAmount =
      Number(amount);

    if (paymentAmount <= 0) {
      alert(
        "Payment amount must be greater than zero."
      );
      return;
    }

    const newPayment: Payment = {
      id: Date.now(),
      tenantId: tenant.id,
      amount: paymentAmount,
      paymentDate,
      paymentMethod
    };

    const updatedPayments = [
      ...payments,
      newPayment
    ];

    localStorage.setItem(
      paymentsStorageKey,
      JSON.stringify(
        updatedPayments
      )
    );

    setPayments(
      updatedPayments
    );

    setTenantId("");
    setAmount("");
    setPaymentDate(
      new Date()
        .toISOString()
        .slice(0, 10)
    );
    setPaymentMethod("UPI");
    setShowForm(false);

    alert(
      "Payment recorded successfully."
    );
  };

  return (
    <div className="rent-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">
            FINANCE
          </p>

          <h2>
            Rent & Payments
          </h2>

          <p className="page-description">
            Track monthly rent and
            record tenant payments.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={() =>
            setShowForm(
              (current) =>
                !current
            )
          }
        >
          {showForm
            ? "Close"
            : "+ Record Payment"}
        </button>
      </div>

      <div className="room-summary">
        <StatCard
          title="MONTHLY RENT"
          value={`₹${totalMonthlyRent.toLocaleString(
            "en-IN"
          )}`}
          subtitle="Expected this month"
          icon="₹"
        />

        <StatCard
          title="COLLECTED"
          value={`₹${totalCollected.toLocaleString(
            "en-IN"
          )}`}
          subtitle="Payments received"
          icon="✓"
        />

        <StatCard
          title="PENDING"
          value={`₹${totalPending.toLocaleString(
            "en-IN"
          )}`}
          subtitle="Still to collect"
          icon="!"
        />

        <StatCard
          title="TENANTS"
          value={String(
            tenants.length
          )}
          subtitle="Active tenants"
          icon="👤"
        />
      </div>

      {showForm && (
        <div className="panel room-form">
          <h3>
            Record Rent Payment
          </h3>

          <div className="form-grid">
            <div className="form-field">
              <label>
                Tenant
              </label>

              <select
                value={tenantId}
                onChange={(event) =>
                  selectTenant(
                    event.target.value
                  )
                }
              >
                <option value="">
                  Select tenant
                </option>

                {tenants.map(
                  (tenant) => (
                    <option
                      key={tenant.id}
                      value={
                        tenant.id
                      }
                    >
                      {tenant.name} —
                      Room{" "}
                      {
                        tenant.roomNumber
                      }
                    </option>
                  )
                )}
              </select>
            </div>

            <FormField
              label="Amount"
              value={amount}
              placeholder="Example: 8000"
              onChange={setAmount}
              type="number"
            />

            <FormField
              label="Payment Date"
              value={paymentDate}
              placeholder=""
              onChange={
                setPaymentDate
              }
              type="date"
            />

            <div className="form-field">
              <label>
                Payment Method
              </label>

              <select
                value={
                  paymentMethod
                }
                onChange={(event) =>
                  setPaymentMethod(
                    event.target
                      .value as PaymentMethod
                  )
                }
              >
                <option value="UPI">
                  UPI
                </option>

                <option value="Cash">
                  Cash
                </option>

                <option value="Bank Transfer">
                  Bank Transfer
                </option>
              </select>
            </div>
          </div>

          <div className="form-footer">
            <button
              className="primary-btn"
              onClick={
                recordPayment
              }
            >
              Save Payment
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">
              THIS MONTH
            </p>

            <h3>
              Rent Collection
            </h3>
          </div>
        </div>

        {tenants.length === 0 ? (
          <div className="empty-state">
            <h3>
              No tenants found
            </h3>

            <p>
              Add tenants first,
              then you can record
              their rent.
            </p>
          </div>
        ) : (
          <div className="payment-list">
            {tenants.map(
              (tenant) => {
                const paid =
                  tenantPaidAmount(
                    tenant.id
                  );

                const status =
                  getTenantStatus(
                    tenant
                  );

                return (
                  <div
                    className="payment-row"
                    key={
                      tenant.id
                    }
                  >
                    <div className="payment-tenant">
                      <div className="small-avatar">
                        {tenant.name
                          .charAt(
                            0
                          )
                          .toUpperCase()}
                      </div>

                      <div>
                        <strong>
                          {
                            tenant.name
                          }
                        </strong>

                        <span>
                          Room{" "}
                          {
                            tenant.roomNumber
                          }{" "}
                          •{" "}
                          {
                            tenant.bedName
                          }
                        </span>
                      </div>
                    </div>

                    <div className="payment-number">
                      <span>
                        Rent
                      </span>

                      <strong>
                        ₹
                        {tenant.rent.toLocaleString(
                          "en-IN"
                        )}
                      </strong>
                    </div>

                    <div className="payment-number">
                      <span>
                        Paid
                      </span>

                      <strong>
                        ₹
                        {paid.toLocaleString(
                          "en-IN"
                        )}
                      </strong>
                    </div>

                    <div>
                      <span
                        className={
                          status ===
                          "Paid"
                            ? "paid"
                            : "pending"
                        }
                      >
                        {status}
                      </span>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}
      </div>

      {payments.length > 0 && (
        <div className="panel payment-history">
          <div className="panel-header">
            <div>
              <p className="eyebrow">
                HISTORY
              </p>

              <h3>
                Recent Payments
              </h3>
            </div>
          </div>

          <div className="payment-history-list">
            {payments
              .slice()
              .reverse()
              .slice(0, 10)
              .map(
                (payment) => {
                  const tenant =
                    tenants.find(
                      (item) =>
                        item.id ===
                        payment.tenantId
                    );

                  return (
                    <div
                      className="history-row"
                      key={
                        payment.id
                      }
                    >
                      <div>
                        <strong>
                          {tenant?.name ??
                            "Unknown Tenant"}
                        </strong>

                        <span>
                          {
                            payment.paymentDate
                          }{" "}
                          •{" "}
                          {
                            payment.paymentMethod
                          }
                        </span>
                      </div>

                      <strong className="history-amount">
                        ₹
                        {payment.amount.toLocaleString(
                          "en-IN"
                        )}
                      </strong>
                    </div>
                  );
                }
              )}
          </div>
        </div>
      )}
    </div>
  );
}

function ComingSoon({
  title
}: {
  title: string;
}) {
  return (
    <div className="coming-soon">
      <div className="coming-icon">
        🚧
      </div>

      <p className="eyebrow">
        PEACELY
      </p>

      <h2>{title}</h2>

      <p>
        This module is coming next.
        We are building Peacely step
        by step.
      </p>
    </div>
  );
}

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <App />
);
