import React, { useState } from "react";
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

type Room = {
  id: number;
  number: string;
  type: string;
  beds: number;
  rent: number;
};

function App() {
  const [page, setPage] = useState<Page>("dashboard");

  const menu = [
    { id: "dashboard" as Page, icon: "▦", label: "Dashboard" },
    { id: "property" as Page, icon: "🏠", label: "Property" },
    { id: "rooms" as Page, icon: "🛏️", label: "Rooms & Beds" },
    { id: "tenants" as Page, icon: "👥", label: "Tenants" },
    { id: "rent" as Page, icon: "₹", label: "Rent & Payments" },
    { id: "invoices" as Page, icon: "🧾", label: "Invoices" },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">P</div>
          <div>
            <h1>Peacely</h1>
            <p>PG Management</p>
          </div>
        </div>

        <button className="profile">Admin ▾</button>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-title">MENU</div>

          {menu.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </aside>

        <main className="dashboard">
          {page === "dashboard" && <Dashboard setPage={setPage} />}
          {page === "property" && <Property />}
          {page === "rooms" && <Rooms />}
          {page === "tenants" && <ComingSoon title="Tenants" />}
          {page === "rent" && <ComingSoon title="Rent & Payments" />}
          {page === "invoices" && <ComingSoon title="Invoices" />}
        </main>
      </div>
    </div>
  );
}

function Dashboard({ setPage }: { setPage: (page: Page) => void }) {
  return (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">OVERVIEW</p>
          <h2>Good afternoon 👋</h2>
          <p className="subtitle">
            Here's what's happening with your property today.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={() => setPage("tenants")}
        >
          + New Admission
        </button>
      </section>

      <section className="stats">
        <div className="stat-card">
          <div className="stat-icon">🏠</div>
          <p>Total Beds</p>
          <h3>100</h3>
          <span>Property capacity</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <p>Occupied</p>
          <h3>72</h3>
          <span>72% occupancy</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🛏️</div>
          <p>Available</p>
          <h3>28</h3>
          <span>Beds available</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon">₹</div>
          <p>Rent Due</p>
          <h3>₹24,500</h3>
          <span>Needs attention</span>
        </div>
      </section>

      <section className="main-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Recent Tenants</h3>
              <p>Latest admissions</p>
            </div>

            <button className="link-btn">View all →</button>
          </div>

          <div className="tenant-list">
            <div className="tenant">
              <div className="avatar">RK</div>

              <div className="tenant-info">
                <strong>Rahul Kumar</strong>
                <span>Room 204 • Bed B</span>
              </div>

              <span className="paid">Paid</span>
            </div>

            <div className="tenant">
              <div className="avatar">AS</div>

              <div className="tenant-info">
                <strong>Arjun Sharma</strong>
                <span>Room 105 • Bed A</span>
              </div>

              <span className="pending">Pending</span>
            </div>

            <div className="tenant">
              <div className="avatar">PS</div>

              <div className="tenant-info">
                <strong>Priya Singh</strong>
                <span>Room 301 • Bed C</span>
              </div>

              <span className="paid">Paid</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Quick Actions</h3>
              <p>Manage your property</p>
            </div>
          </div>

          <div className="quick-actions">
            <button>
              <span>👤</span>
              <div>
                <strong>Add Tenant</strong>
                <small>Register a new tenant</small>
              </div>
            </button>

            <button onClick={() => setPage("rooms")}>
              <span>🛏️</span>
              <div>
                <strong>Manage Rooms</strong>
                <small>View rooms and beds</small>
              </div>
            </button>

            <button>
              <span>💰</span>
              <div>
                <strong>Collect Rent</strong>
                <small>Record a payment</small>
              </div>
            </button>

            <button>
              <span>🧾</span>
              <div>
                <strong>Invoices</strong>
                <small>View rent invoices</small>
              </div>
            </button>
          </div>
        </div>
      </section>

      <section className="bottom-panel panel">
        <div className="panel-heading">
          <div>
            <h3>Occupancy</h3>
            <p>Current property capacity</p>
          </div>

          <strong className="occupancy-number">72%</strong>
        </div>

        <div className="progress">
          <div className="progress-fill"></div>
        </div>

        <div className="occupancy-details">
          <span>72 occupied</span>
          <span>28 available</span>
          <span>100 total beds</span>
        </div>
      </section>
    </>
  );
}

function Property() {
  const [property, setProperty] = useState<PropertyData>(() => {
    const saved = localStorage.getItem("peacely_property");

    return saved
      ? JSON.parse(saved)
      : {
          name: "",
          type: "",
          address: "",
          city: "",
          floors: "",
          rooms: "",
        };
  });

  const [saved, setSaved] = useState(false);

  function handleChange(
    field: keyof PropertyData,
    value: string
  ) {
    setProperty((current) => ({
      ...current,
      [field]: value,
    }));

    setSaved(false);
  }

  function saveProperty() {
    if (!property.name || !property.type || !property.city) {
      alert("Please enter Property Name, Property Type and City.");
      return;
    }

    localStorage.setItem(
      "peacely_property",
      JSON.stringify(property)
    );

    setSaved(true);
  }

  return (
    <section className="property-page">
      <p className="eyebrow">SETUP</p>

      <h2>Property Setup</h2>

      <p className="subtitle">
        Add and manage the basic information of your PG property.
      </p>

      <div className="panel property-form">
        <h3>Property Information</h3>

        <div className="form-grid">
          <label>
            Property Name
            <input
              value={property.name}
              onChange={(e) =>
                handleChange("name", e.target.value)
              }
              placeholder="Example: Peacely PG"
            />
          </label>

          <label>
            Property Type
            <select
              value={property.type}
              onChange={(e) =>
                handleChange("type", e.target.value)
              }
            >
              <option value="">Select type</option>
              <option value="PG">PG</option>
              <option value="Hostel">Hostel</option>
              <option value="Co-living">Co-living</option>
              <option value="Rental Property">
                Rental Property
              </option>
            </select>
          </label>

          <label>
            Address
            <input
              value={property.address}
              onChange={(e) =>
                handleChange("address", e.target.value)
              }
              placeholder="Enter property address"
            />
          </label>

          <label>
            City
            <input
              value={property.city}
              onChange={(e) =>
                handleChange("city", e.target.value)
              }
              placeholder="Enter city"
            />
          </label>

          <label>
            Total Floors
            <input
              type="number"
              value={property.floors}
              onChange={(e) =>
                handleChange("floors", e.target.value)
              }
              placeholder="Example: 3"
            />
          </label>

          <label>
            Total Rooms
            <input
              type="number"
              value={property.rooms}
              onChange={(e) =>
                handleChange("rooms", e.target.value)
              }
              placeholder="Example: 25"
            />
          </label>
        </div>

        <button
          className="primary-btn"
          onClick={saveProperty}
        >
          Save Property
        </button>

        {saved && (
          <div className="save-message">
            ✓ Property saved successfully
          </div>
        )}
      </div>
    </section>
  );
}

function Rooms() {
  const [rooms, setRooms] = useState<Room[]>(() => {
    const saved = localStorage.getItem("peacely_rooms");
    return saved ? JSON.parse(saved) : [];
  });

  const [showForm, setShowForm] = useState(false);

  const [roomNumber, setRoomNumber] = useState("");
  const [roomType, setRoomType] = useState("");
  const [beds, setBeds] = useState("");
  const [rent, setRent] = useState("");

  function addRoom() {
    if (!roomNumber || !roomType || !beds || !rent) {
      alert("Please fill all room details.");
      return;
    }

    const newRoom: Room = {
      id: Date.now(),
      number: roomNumber,
      type: roomType,
      beds: Number(beds),
      rent: Number(rent),
    };

    const updatedRooms = [...rooms, newRoom];

    setRooms(updatedRooms);

    localStorage.setItem(
      "peacely_rooms",
      JSON.stringify(updatedRooms)
    );

    setRoomNumber("");
    setRoomType("");
    setBeds("");
    setRent("");
    setShowForm(false);
  }

  function deleteRoom(id: number) {
    const updatedRooms = rooms.filter(
      (room) => room.id !== id
    );

    setRooms(updatedRooms);

    localStorage.setItem(
      "peacely_rooms",
      JSON.stringify(updatedRooms)
    );
  }

  const totalBeds = rooms.reduce(
    (total, room) => total + room.beds,
    0
  );

  return (
    <section className="property-page rooms-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">PROPERTY MANAGEMENT</p>

          <h2>Rooms & Beds</h2>

          <p className="subtitle">
            Create rooms and manage the beds available in your property.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Cancel" : "+ Add Room"}
        </button>
      </div>

      {showForm && (
        <div className="panel room-form">
          <h3>Add New Room</h3>

          <div className="form-grid">
            <label>
              Room Number
              <input
                value={roomNumber}
                onChange={(e) =>
                  setRoomNumber(e.target.value)
                }
                placeholder="Example: 101"
              />
            </label>

            <label>
              Room Type
              <select
                value={roomType}
                onChange={(e) =>
                  setRoomType(e.target.value)
                }
              >
                <option value="">Select room type</option>
                <option value="Single">Single</option>
                <option value="Double Sharing">
                  Double Sharing
                </option>
                <option value="Triple Sharing">
                  Triple Sharing
                </option>
                <option value="Four Sharing">
                  Four Sharing
                </option>
              </select>
            </label>

            <label>
              Number of Beds
              <input
                type="number"
                min="1"
                value={beds}
                onChange={(e) => setBeds(e.target.value)}
                placeholder="Example: 3"
              />
            </label>

            <label>
              Monthly Rent / Bed
              <input
                type="number"
                min="0"
                value={rent}
                onChange={(e) => setRent(e.target.value)}
                placeholder="Example: 8000"
              />
            </label>
          </div>

          <button
            className="primary-btn"
            onClick={addRoom}
          >
            Save Room
          </button>
        </div>
      )}

      <div className="room-summary">
        <div className="stat-card">
          <div className="stat-icon">🚪</div>
          <p>Total Rooms</p>
          <h3>{rooms.length}</h3>
          <span>Rooms created</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🛏️</div>
          <p>Total Beds</p>
          <h3>{totalBeds}</h3>
          <span>Bed capacity</span>
        </div>
      </div>

      {rooms.length === 0 ? (
        <div className="panel empty-state">
          <div className="coming-icon">🛏️</div>
          <h3>No rooms added yet</h3>
          <p>
            Click “Add Room” to create your first room.
          </p>
        </div>
      ) : (
        <div className="room-list">
          {rooms.map((room) => (
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
  <div className="bed-list">
    {Array.from({ length: room.beds }, (_, index) => (
      <div className="bed-item" key={index}>
        <span className="bed-name">
          Bed {String.fromCharCode(65 + index)}
        </span>

        <span className="available">
          Available
        </span>
      </div>
    ))}
  </div>
</div>
  );
}

function ComingSoon({ title }: { title: string }) {
  return (
    <section className="property-page">
      <p className="eyebrow">PEACELY</p>

      <h2>{title}</h2>

      <div className="panel coming-soon">
        <div className="coming-icon">🚧</div>

        <h3>This section is coming next</h3>

        <p>
          We are building Peacely step by step. This section
          will become fully functional.
        </p>
      </div>
    </section>
  );
}

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
