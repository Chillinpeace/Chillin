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
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors.
  }
};

const normalizeRooms = (rooms: Room[]): Room[] => {
  if (!Array.isArray(rooms)) {
    return [];
  }

  return rooms.map((room) => {
    const safeBeds = Math.max(
      0,
      Number.isFinite(Number(room.beds)) ? Number(room.beds) : 0
    );

    const oldStatuses = Array.isArray(room.bedStatus)
      ? room.bedStatus
      : [];

    const statuses: BedStatus[] = oldStatuses
      .slice(0, safeBeds)
      .map((status) =>
        status === "occupied" ? "occupied" : "available"
      );

    while (statuses.length < safeBeds) {
      statuses.push("available");
    }

    return {
      ...room,
      id: Number(room.id) || Date.now(),
      number: String(room.number ?? ""),
      type: String(room.type ?? "Standard"),
      beds: safeBeds,
      rent: Number(room.rent) || 0,
      bedStatus: statuses,
    };
  });
};

const normalizeTenants = (tenants: Tenant[]): Tenant[] => {
  if (!Array.isArray(tenants)) {
    return [];
  }

  return tenants.map((tenant) => ({
    ...tenant,
    id: Number(tenant.id) || Date.now(),
    name: String(tenant.name ?? ""),
    phone: String(tenant.phone ?? ""),
    email: String(tenant.email ?? ""),
    joiningDate: String(tenant.joiningDate ?? ""),
    roomNumber: String(tenant.roomNumber ?? ""),
    roomId: Number(tenant.roomId) || 0,
    bedIndex: Number(tenant.bedIndex) || 0,
    bedName: String(tenant.bedName ?? ""),
    rent: Number(tenant.rent) || 0,
    deposit: Number(tenant.deposit) || 0,
    emergencyContact: String(tenant.emergencyContact ?? ""),
  }));
};

const normalizePayments = (payments: Payment[]): Payment[] => {
  if (!Array.isArray(payments)) {
    return [];
  }

  return payments.map((payment) => ({
    ...payment,
    id: Number(payment.id) || Date.now(),
    tenantId: Number(payment.tenantId) || 0,
    amount: Number(payment.amount) || 0,
    paymentDate: String(payment.paymentDate ?? ""),
    paymentMethod:
      payment.paymentMethod === "UPI" ||
      payment.paymentMethod === "Bank Transfer"
        ? payment.paymentMethod
        : "Cash",
  }));
};

function App() {
  const [page, setPage] = useState<Page>("dashboard");

  const [property, setProperty] = useState<PropertyData>(() =>
    readStorage<PropertyData>(PROPERTY_KEY, {
      name: "",
      type: "",
      address: "",
      city: "",
      floors: "",
      rooms: "",
    })
  );

  const [rooms, setRooms] = useState<Room[]>(() =>
    normalizeRooms(readStorage<Room[]>(ROOMS_KEY, []))
  );

  const [tenants, setTenants] = useState<Tenant[]>(() =>
    normalizeTenants(readStorage<Tenant[]>(TENANTS_KEY, []))
  );

  const [payments, setPayments] = useState<Payment[]>(() =>
    normalizePayments(readStorage<Payment[]>(PAYMENTS_KEY, []))
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

  return (
    <div className="app">
      <TopBar propertyName={property.name} />

      <Sidebar page={page} setPage={setPage} />

      <main className="main">
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
            setProperty={setProperty}
          />
        )}

        {page === "rooms" && (
          <Rooms
            rooms={rooms}
            setRooms={setRooms}
            tenants={tenants}
          />
        )}

        {page === "tenants" && (
          <Tenants
            rooms={rooms}
            setRooms={setRooms}
            tenants={tenants}
            setTenants={setTenants}
          />
        )}

        {page === "rent" && (
          <RentPayments
            tenants={tenants}
            payments={payments}
            setPayments={setPayments}
          />
        )}

        {page === "invoices" && (
          <Invoices />
        )}
      </main>
    </div>
  );
}

function TopBar({
  propertyName,
}: {
  propertyName: string;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-logo">P</div>

        <div>
          <div className="brand-name">Peacely</div>
          <div className="brand-subtitle">
            PG Management
          </div>
        </div>
      </div>

      <div className="topbar-right">
        <div className="topbar-property">
          {propertyName || "Set up your property"}
        </div>

        <div className="topbar-avatar">
          P
        </div>
      </div>
    </header>
  );
}

function Sidebar({
  page,
  setPage,
}: {
  page: Page;
  setPage: (page: Page) => void;
}) {
  const items: {
    id: Page;
    label: string;
    icon: string;
  }[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "⌂",
    },
    {
      id: "property",
      label: "Property",
      icon: "▣",
    },
    {
      id: "rooms",
      label: "Rooms & Beds",
      icon: "▤",
    },
    {
      id: "tenants",
      label: "Tenants",
      icon: "♙",
    },
    {
      id: "rent",
      label: "Rent & Payments",
      icon: "₹",
    },
    {
      id: "invoices",
      label: "Invoices",
      icon: "▧",
    },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-title">
        MANAGEMENT
      </div>

      <nav>
        {items.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${
              page === item.id ? "active" : ""
            }`}
            onClick={() => setPage(item.id)}
          >
            <span className="nav-icon">
              {item.icon}
            </span>

            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-help">
          <div className="sidebar-help-icon">
            ?
          </div>

          <div>
            <strong>Need help?</strong>
            <span>Peacely support</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Dashboard({
  property,
  rooms,
  tenants,
  payments,
  setPage,
}: {
  property: PropertyData;
  rooms: Room[];
  tenants: Tenant[];
  payments: Payment[];
  setPage: (page: Page) => void;
}) {
  const totalBeds = rooms.reduce(
    (sum, room) => sum + room.beds,
    0
  );

  const occupiedBeds = rooms.reduce(
    (sum, room) =>
      sum +
      (Array.isArray(room.bedStatus)
        ? room.bedStatus.filter(
            (status) => status === "occupied"
          ).length
        : 0),
    0
  );

  const availableBeds = Math.max(
    0,
    totalBeds - occupiedBeds
  );

  const currentMonth = new Date()
    .toISOString()
    .slice(0, 7);

  const collectedThisMonth = payments
    .filter((payment) =>
      payment.paymentDate.startsWith(currentMonth)
    )
    .reduce(
      (sum, payment) => sum + payment.amount,
      0
    );

  const monthlyRent = tenants.reduce(
    (sum, tenant) => sum + tenant.rent,
    0
  );

  const pendingRent = Math.max(
    0,
    monthlyRent - collectedThisMonth
  );

  const occupancyRate =
    totalBeds > 0
      ? Math.round((occupiedBeds / totalBeds) * 100)
      : 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your PG"
      />

      <div className="welcome">
        <div>
          <div className="welcome-label">
            WELCOME TO PEACELY
          </div>

          <h2>
            {property.name
              ? `Manage ${property.name} with ease`
              : "Manage your PG with ease"}
          </h2>

          <p>
            Keep track of rooms, tenants, rent and
            payments from one simple place.
          </p>
        </div>

        {!property.name && (
          <button
            className="primary-btn"
            onClick={() => setPage("property")}
          >
            Set up property
          </button>
        )}
      </div>

      <div className="stats">
        <StatCard
          label="Total Beds"
          value={totalBeds}
          icon="▤"
        />

        <StatCard
          label="Occupied"
          value={occupiedBeds}
          icon="♙"
        />

        <StatCard
          label="Available"
          value={availableBeds}
          icon="✓"
        />

        <StatCard
          label="Rent Pending"
          value={`₹${pendingRent.toLocaleString(
            "en-IN"
          )}`}
          icon="₹"
        />
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Occupancy</h3>
              <p>Current bed occupancy</p>
            </div>

            <span className="panel-number">
              {occupancyRate}%
            </span>
          </div>

          <div className="progress">
            <div
              className="progress-bar"
              style={{
                width: `${occupancyRate}%`,
              }}
            />
          </div>

          <div className="occupancy-info">
            <span>
              {occupiedBeds} occupied
            </span>

            <span>
              {availableBeds} available
            </span>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Quick Actions</h3>
              <p>Common management tasks</p>
            </div>
          </div>

          <div className="quick-actions">
            <button
              onClick={() => setPage("rooms")}
            >
              <span>▤</span>
              Manage Rooms
            </button>

            <button
              onClick={() => setPage("tenants")}
            >
              <span>♙</span>
              Add Tenant
            </button>

            <button
              onClick={() => setPage("rent")}
            >
              <span>₹</span>
              Record Rent
            </button>
          </div>
        </div>
      </div>

      <div className="panel dashboard-overview">
        <div className="panel-header">
          <div>
            <h3>Property Overview</h3>
            <p>Your current PG information</p>
          </div>

          <button
            className="secondary-btn"
            onClick={() => setPage("property")}
          >
            Edit Property
          </button>
        </div>

        {property.name ? (
          <div className="overview-grid">
            <div>
              <span>Property</span>
              <strong>{property.name}</strong>
            </div>

            <div>
              <span>Type</span>
              <strong>
                {property.type || "Not set"}
              </strong>
            </div>

            <div>
              <span>City</span>
              <strong>
                {property.city || "Not set"}
              </strong>
            </div>

            <div>
              <span>Rooms</span>
              <strong>{rooms.length}</strong>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              ▣
            </div>

            <h3>No property added yet</h3>

            <p>
              Add your PG details to start managing
              Peacely.
            </p>

            <button
              className="primary-btn"
              onClick={() => setPage("property")}
            >
              Add Property
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function Property({
  property,
  setProperty,
}: {
  property: PropertyData;
  setProperty: (
    property: PropertyData
  ) => void;
}) {
  const [form, setForm] =
    useState<PropertyData>(property);

  const [saved, setSaved] = useState(false);

  const update = (
    key: keyof PropertyData,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));

    setSaved(false);
  };

  const save = () => {
    setProperty(form);
    setSaved(true);

    setTimeout(() => {
      setSaved(false);
    }, 3000);
  };

  return (
    <>
      <PageHeader
        title="Property"
        description="Set up your PG property details"
      />

      <div className="panel property-panel">
        <div className="panel-header">
          <div>
            <h3>Property Information</h3>
            <p>
              Enter the basic details of your PG.
            </p>
          </div>
        </div>

        <div className="form-grid">
          <FormField
            label="Property Name"
            value={form.name}
            onChange={(value) =>
              update("name", value)
            }
            placeholder="Example: Peacely PG"
          />

          <FormField
            label="Property Type"
            value={form.type}
            onChange={(value) =>
              update("type", value)
            }
            options="Boys PG|||Girls PG|||Co-Living|||Family Rental|||Other"
            optionValues={[
              "Boys PG",
              "Girls PG",
              "Co-Living",
              "Family Rental",
              "Other",
            ]}
            placeholder="Select property type"
          />

          <FormField
            label="Address"
            value={form.address}
            onChange={(value) =>
              update("address", value)
            }
            placeholder="Street / area"
          />

          <FormField
            label="City"
            value={form.city}
            onChange={(value) =>
              update("city", value)
            }
            placeholder="Example: Bengaluru"
          />

          <FormField
            label="Number of Floors"
            value={form.floors}
            onChange={(value) =>
              update("floors", value)
            }
            placeholder="Example: 3"
            type="number"
          />

          <FormField
            label="Total Rooms"
            value={form.rooms}
            onChange={(value) =>
              update("rooms", value)
            }
            placeholder="Example: 20"
            type="number"
          />
        </div>

        <div className="form-actions">
          {saved && (
            <div className="success-message">
              ✓ Property saved successfully
            </div>
          )}

          <button
            className="primary-btn"
            onClick={save}
          >
            Save Property
          </button>
        </div>
      </div>
    </>
  );
}

function Rooms({
  rooms,
  setRooms,
  tenants,
}: {
  rooms: Room[];
  setRooms: (rooms: Room[]) => void;
  tenants: Tenant[];
}) {
  const [showForm, setShowForm] =
    useState(false);

  const [roomNumber, setRoomNumber] =
    useState("");

  const [roomType, setRoomType] =
    useState("Double Sharing");

  const [beds, setBeds] =
    useState("2");

  const [rent, setRent] =
    useState("");

  const [message, setMessage] =
    useState("");

  const addRoom = () => {
    if (!roomNumber.trim()) {
      setMessage("Please enter a room number.");
      return;
    }

    const bedsNumber = Math.max(
      1,
      Number(beds) || 1
    );

    const rentNumber = Math.max(
      0,
      Number(rent) || 0
    );

    const duplicate = rooms.some(
      (room) =>
        room.number.trim().toLowerCase() ===
        roomNumber.trim().toLowerCase()
    );

    if (duplicate) {
      setMessage(
        "A room with this number already exists."
      );
      return;
    }

    const newRoom: Room = {
      id: Date.now(),
      number: roomNumber.trim(),
      type: roomType,
      beds: bedsNumber,
      rent: rentNumber,
      bedStatus: Array.from(
        { length: bedsNumber },
        () => "available" as BedStatus
      ),
    };

    setRooms([...rooms, newRoom]);

    setRoomNumber("");
    setRoomType("Double Sharing");
    setBeds("2");
    setRent("");
    setShowForm(false);
    setMessage("Room added successfully.");

    setTimeout(() => {
      setMessage("");
    }, 3000);
  };

  const toggleBed = (
    roomId: number,
    bedIndex: number
  ) => {
    const room = rooms.find(
      (item) => item.id === roomId
    );

    if (!room) return;

    const tenantOnBed = tenants.some(
      (tenant) =>
        tenant.roomId === roomId &&
        tenant.bedIndex === bedIndex
    );

    if (tenantOnBed) {
      setMessage(
        "This bed is assigned to a tenant."
      );

      setTimeout(() => {
        setMessage("");
      }, 2500);

      return;
    }

    const updatedRooms = rooms.map(
      (item) => {
        if (item.id !== roomId) {
          return item;
        }

        const statuses = Array.isArray(
          item.bedStatus
        )
          ? [...item.bedStatus]
          : Array.from(
              { length: item.beds },
              () => "available" as BedStatus
            );

        while (statuses.length < item.beds) {
          statuses.push("available");
        }

        statuses[bedIndex] =
          statuses[bedIndex] === "occupied"
            ? "available"
            : "occupied";

        return {
          ...item,
          bedStatus: statuses,
        };
      }
    );

    setRooms(updatedRooms);
  };

  const deleteRoom = (roomId: number) => {
    const hasTenant = tenants.some(
      (tenant) => tenant.roomId === roomId
    );

    if (hasTenant) {
      setMessage(
        "You cannot delete a room with tenants."
      );

      setTimeout(() => {
        setMessage("");
      }, 2500);

      return;
    }

    const room = rooms.find(
      (item) => item.id === roomId
    );

    if (!room) return;

    const occupied = Array.isArray(
      room.bedStatus
    )
      ? room.bedStatus.some(
          (status) => status === "occupied"
        )
      : false;

    if (occupied) {
      setMessage(
        "Please make all beds available before deleting the room."
      );

      setTimeout(() => {
        setMessage("");
      }, 2500);

      return;
    }

    setRooms(
      rooms.filter(
        (item) => item.id !== roomId
      )
    );

    setMessage("Room deleted.");

    setTimeout(() => {
      setMessage("");
    }, 2500);
  };

  return (
    <>
      <PageHeader
        title="Rooms & Beds"
        description="Manage your rooms and bed availability"
      />

      {message && (
        <div className="info-message">
          {message}
        </div>
      )}

      <div className="room-toolbar">
        <div>
          <strong>
            {rooms.length}{" "}
            {rooms.length === 1
              ? "Room"
              : "Rooms"}
          </strong>

          <span>
            {" "}
            •{" "}
            {rooms.reduce(
              (sum, room) => sum + room.beds,
              0
            )}{" "}
            total beds
          </span>
        </div>

        <button
          className="primary-btn"
          onClick={() =>
            setShowForm(!showForm)
          }
        >
          {showForm
            ? "Close"
            : "+ Add Room"}
        </button>
      </div>

      {showForm && (
        <div className="panel add-room-panel">
          <div className="panel-header">
            <div>
              <h3>Add New Room</h3>
              <p>
                Create a room and define its bed
                capacity.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <FormField
              label="Room Number"
              value={roomNumber}
              onChange={setRoomNumber}
              placeholder="Example: 101"
            />

            <FormField
              label="Room Type"
              value={roomType}
              onChange={setRoomType}
              options="Single|||Double Sharing|||Triple Sharing|||Four Sharing"
              optionValues={[
                "Single",
                "Double Sharing",
                "Triple Sharing",
                "Four Sharing",
              ]}
            />

            <FormField
              label="Number of Beds"
              value={beds}
              onChange={setBeds}
              type="number"
              placeholder="Example: 2"
            />

            <FormField
              label="Monthly Rent / Bed"
              value={rent}
              onChange={setRent}
              type="number"
              placeholder="Example: 8000"
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
        </div>
      )}

      {rooms.length === 0 ? (
        <div className="panel empty-state">
          <div className="empty-icon">
            ▤
          </div>

          <h3>No rooms added yet</h3>

          <p>
            Add your first room to start managing
            beds and tenants.
          </p>

          <button
            className="primary-btn"
            onClick={() => setShowForm(true)}
          >
            + Add First Room
          </button>
        </div>
      ) : (
        <div className="room-list">
          {rooms.map((room) => {
            const statuses =
              Array.isArray(room.bedStatus)
                ? room.bedStatus
                : Array.from(
                    { length: room.beds },
                    () =>
                      "available" as BedStatus
                  );

            const occupied = statuses.filter(
              (status) => status === "occupied"
            ).length;

            return (
              <div
                className="room-card"
                key={room.id}
              >
                <div className="room-card-header">
                  <div>
                    <div className="room-number">
                      Room {room.number}
                    </div>

                    <div className="room-type">
                      {room.type}
                    </div>
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
                    <span>Beds</span>
                    <strong>
                      {room.beds}
                    </strong>
                  </div>

                  <div>
                    <span>Occupied</span>
                    <strong>
                      {occupied}
                    </strong>
                  </div>

                  <div>
                    <span>Available</span>
                    <strong>
                      {Math.max(
                        0,
                        room.beds - occupied
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Rent</span>
                    <strong>
                      ₹
                      {room.rent.toLocaleString(
                        "en-IN"
                      )}
                    </strong>
                  </div>
                </div>

                <div className="beds-title">
                  Bed Status
                </div>

                <div className="bed-list">
                  {Array.from(
                    {
                      length: room.beds,
                    },
                    (_, index) => {
                      const status =
                        statuses[index] ||
                        "available";

                      const tenant =
                        tenants.find(
                          (item) =>
                            item.roomId ===
                              room.id &&
                            item.bedIndex ===
                              index
                        );

                      return (
                        <button
                          key={index}
                          className={`bed ${
                            status ===
                            "occupied"
                              ? "occupied"
                              : "available"
                          }`}
                          onClick={() =>
                            toggleBed(
                              room.id,
                              index
                            )
                          }
                        >
                          <span>
                            Bed {index + 1}
                          </span>

                          <small>
                            {tenant
                              ? tenant.name
                              : status ===
                                "occupied"
                              ? "Occupied"
                              : "Available"}
                          </small>
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Tenants({
  rooms,
  setRooms,
  tenants,
  setTenants,
}: {
  rooms: Room[];
  setRooms: (rooms: Room[]) => void;
  tenants: Tenant[];
  setTenants: (tenants: Tenant[]) => void;
}) {
  const [showForm, setShowForm] =
    useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [joiningDate, setJoiningDate] =
    useState("");
  const [roomId, setRoomId] = useState("");
  const [bedIndex, setBedIndex] =
    useState("");
  const [deposit, setDeposit] =
    useState("");
  const [emergencyContact, setEmergencyContact] =
    useState("");

  const [message, setMessage] =
    useState("");

  const selectedRoom = useMemo(() => {
    return rooms.find(
      (room) =>
        room.id === Number(roomId)
    );
  }, [rooms, roomId]);

  const availableBeds = useMemo(() => {
    if (!selectedRoom) {
      return [];
    }

    const statuses =
      Array.isArray(
        selectedRoom.bedStatus
      )
        ? selectedRoom.bedStatus
        : Array.from(
            {
              length: selectedRoom.beds,
            },
            () =>
              "available" as BedStatus
          );

    return statuses
      .map((status, index) => ({
        status,
        index,
      }))
      .filter(
        (bed) => bed.status === "available"
      );
  }, [selectedRoom]);

  useEffect(() => {
    if (
      bedIndex &&
      !availableBeds.some(
        (bed) =>
          bed.index === Number(bedIndex)
      )
    ) {
      setBedIndex("");
    }
  }, [availableBeds, bedIndex]);

  const addTenant = () => {
    if (!name.trim()) {
      setMessage(
        "Please enter the tenant name."
      );
      return;
    }

    if (!phone.trim()) {
      setMessage(
        "Please enter the phone number."
      );
      return;
    }

    if (!selectedRoom) {
      setMessage(
        "Please select a room."
      );
      return;
    }

    if (!bedIndex) {
      setMessage(
        "Please select an available bed."
      );
      return;
    }

    const selectedBed = Number(bedIndex);

    const alreadyOccupied = tenants.some(
      (tenant) =>
        tenant.roomId === selectedRoom.id &&
        tenant.bedIndex === selectedBed
    );

    if (alreadyOccupied) {
      setMessage(
        "This bed is already assigned."
      );
      return;
    }

    const newTenant: Tenant = {
      id: Date.now(),
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      joiningDate:
        joiningDate ||
        new Date()
          .toISOString()
          .slice(0, 10),
      roomNumber: selectedRoom.number,
      roomId: selectedRoom.id,
      bedIndex: selectedBed,
      bedName: `Bed ${selectedBed + 1}`,
      rent: selectedRoom.rent,
      deposit: Number(deposit) || 0,
      emergencyContact:
        emergencyContact.trim(),
    };

    const updatedRooms = rooms.map(
      (room) => {
        if (
          room.id !== selectedRoom.id
        ) {
          return room;
        }

        const statuses =
          Array.isArray(room.bedStatus)
            ? [...room.bedStatus]
            : Array.from(
                {
                  length: room.beds,
                },
                () =>
                  "available" as BedStatus
              );

        while (
          statuses.length < room.beds
        ) {
          statuses.push("available");
        }

        statuses[selectedBed] =
          "occupied";

        return {
          ...room,
          bedStatus: statuses,
        };
      }
    );

    setRooms(updatedRooms);
    setTenants([
      ...tenants,
      newTenant,
    ]);

    setName("");
    setPhone("");
    setEmail("");
    setJoiningDate("");
    setRoomId("");
    setBedIndex("");
    setDeposit("");
    setEmergencyContact("");
    setShowForm(false);

    setMessage(
      "Tenant added successfully."
    );

    setTimeout(() => {
      setMessage("");
    }, 3000);
  };

  const removeTenant = (
    tenant: Tenant
  ) => {
    const updatedRooms = rooms.map(
      (room) => {
        if (room.id !== tenant.roomId) {
          return room;
        }

        const statuses =
          Array.isArray(room.bedStatus)
            ? [...room.bedStatus]
            : Array.from(
                {
                  length: room.beds,
                },
                () =>
                  "available" as BedStatus
              );

        while (
          statuses.length < room.beds
        ) {
          statuses.push("available");
        }

        if (
          tenant.bedIndex >= 0 &&
          tenant.bedIndex <
            statuses.length
        ) {
          statuses[tenant.bedIndex] =
            "available";
        }

        return {
          ...room,
          bedStatus: statuses,
        };
      }
    );

    setRooms(updatedRooms);

    setTenants(
      tenants.filter(
        (item) => item.id !== tenant.id
      )
    );

    setMessage(
      "Tenant removed successfully."
    );

    setTimeout(() => {
      setMessage("");
    }, 2500);
  };

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Manage your PG residents"
      />

      {message && (
        <div className="info-message">
          {message}
        </div>
      )}

      <div className="room-toolbar">
        <div>
          <strong>
            {tenants.length}{" "}
            {tenants.length === 1
              ? "Tenant"
              : "Tenants"}
          </strong>
        </div>

        <button
          className="primary-btn"
          onClick={() =>
            setShowForm(!showForm)
          }
        >
          {showForm
            ? "Close"
            : "+ Add Tenant"}
        </button>
      </div>

      {showForm && (
        <div className="panel add-room-panel">
          <div className="panel-header">
            <div>
              <h3>Add Tenant</h3>
              <p>
                Assign a tenant to an available
                bed.
              </p>
            </div>
          </div>

          {rooms.length === 0 ? (
            <div className="empty-state compact">
              <h3>No rooms available</h3>
              <p>
                Add a room first before adding a
                tenant.
              </p>
            </div>
          ) : (
            <>
              <div className="form-grid">
                <FormField
                  label="Full Name"
                  value={name}
                  onChange={setName}
                  placeholder="Tenant name"
                />

                <FormField
                  label="Phone Number"
                  value={phone}
                  onChange={setPhone}
                  placeholder="10 digit number"
                  type="tel"
                />

                <FormField
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  placeholder="Email address"
                  type="email"
                />

                <FormField
                  label="Joining Date"
                  value={joiningDate}
                  onChange={setJoiningDate}
                  type="date"
                />

                <FormField
                  label="Room"
                  value={roomId}
                  onChange={(value) => {
                    setRoomId(value);
                    setBedIndex("");
                  }}
                  options={[
                    "Select a room",
                    ...rooms.map(
                      (room) =>
                        `Room ${room.number} - ${room.type}`
                    ),
                  ].join("|||")}
                  optionValues={[
                    "",
                    ...rooms.map(
                      (room) =>
                        String(room.id)
                    ),
                  ]}
                  placeholder="Select room"
                />

                <FormField
                  label="Bed"
                  value={bedIndex}
                  onChange={setBedIndex}
                  options={[
                    "Select an available bed",
                    ...availableBeds.map(
                      (bed) =>
                        `Bed ${bed.index + 1}`
                    ),
                  ].join("|||")}
                  optionValues={[
                    "",
                    ...availableBeds.map(
                      (bed) =>
                        String(bed.index)
                    ),
                  ]}
                  placeholder="Select bed"
                />

                <FormField
                  label="Security Deposit"
                  value={deposit}
                  onChange={setDeposit}
                  placeholder="Example: 10000"
                  type="number"
                />

                <FormField
                  label="Emergency Contact"
                  value={emergencyContact}
                  onChange={
                    setEmergencyContact
                  }
                  placeholder="Emergency phone number"
                  type="tel"
                />
              </div>

              {selectedRoom && (
                <div className="selected-room-info">
                  <strong>
                    Selected Room:{" "}
                    {selectedRoom.number}
                  </strong>

                  <span>
                    Rent: ₹
                    {selectedRoom.rent.toLocaleString(
                      "en-IN"
                    )} / month
                  </span>

                  <span>
                    Available beds:{" "}
                    {availableBeds.length}
                  </span>
                </div>
              )}

              <div className="form-actions">
                <button
                  className="primary-btn"
                  onClick={addTenant}
                >
                  Add Tenant
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tenants.length === 0 ? (
        <div className="panel empty-state">
          <div className="empty-icon">
            ♙
          </div>

          <h3>No tenants yet</h3>

          <p>
            Add your first tenant and assign a
            bed.
          </p>

          <button
            className="primary-btn"
            onClick={() =>
              setShowForm(true)
            }
          >
            + Add First Tenant
          </button>
        </div>
      ) : (
        <div className="tenant-list">
          {tenants.map((tenant) => (
            <div
              className="tenant-card"
              key={tenant.id}
            >
              <div className="tenant-avatar">
                {tenant.name
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div className="tenant-main">
                <h3>{tenant.name}</h3>

                <div className="tenant-meta">
                  <span>
                    📞 {tenant.phone}
                  </span>

                  {tenant.email && (
                    <span>
                      ✉ {tenant.email}
                    </span>
                  )}
                </div>

                <div className="tenant-tags">
                  <span>
                    Room {tenant.roomNumber}
                  </span>

                  <span>
                    {tenant.bedName}
                  </span>

                  <span>
                    ₹
                    {tenant.rent.toLocaleString(
                      "en-IN"
                    )} / month
                  </span>
                </div>
              </div>

              <div className="tenant-actions">
                <button
                  className="delete-btn"
                  onClick={() =>
                    removeTenant(tenant)
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function RentPayments({
  tenants,
  payments,
  setPayments,
}: {
  tenants: Tenant[];
  payments: Payment[];
  setPayments: (
    payments: Payment[]
  ) => void;
}) {
  const [tenantId, setTenantId] =
    useState("");

  const [amount, setAmount] =
    useState("");

  const [paymentDate, setPaymentDate] =
    useState(
      new Date()
        .toISOString()
        .slice(0, 10)
    );

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("UPI");

  const [message, setMessage] =
    useState("");

  const currentMonth = new Date()
    .toISOString()
    .slice(0, 7);

  const collectedThisMonth = payments
    .filter((payment) =>
      payment.paymentDate.startsWith(
        currentMonth
      )
    )
    .reduce(
      (sum, payment) =>
        sum + payment.amount,
      0
    );

  const monthlyRent = tenants.reduce(
    (sum, tenant) =>
      sum + tenant.rent,
    0
  );

  const pending = Math.max(
    0,
    monthlyRent - collectedThisMonth
  );

  const recordPayment = () => {
    if (!tenantId) {
      setMessage(
        "Please select a tenant."
      );
      return;
    }

    const amountNumber = Number(amount);

    if (
      !amount ||
      !Number.isFinite(amountNumber) ||
      amountNumber <= 0
    ) {
      setMessage(
        "Please enter a valid payment amount."
      );
      return;
    }

    const payment: Payment = {
      id: Date.now(),
      tenantId: Number(tenantId),
      amount: amountNumber,
      paymentDate,
      paymentMethod,
    };

    setPayments([
      payment,
      ...payments,
    ]);

    setTenantId("");
    setAmount("");

    setMessage(
      "Payment recorded successfully."
    );

    setTimeout(() => {
      setMessage("");
    }, 3000);
  };

  const tenantName = (id: number) => {
    return (
      tenants.find(
        (tenant) => tenant.id === id
      )?.name || "Unknown Tenant"
    );
  };

  return (
    <>
      <PageHeader
        title="Rent & Payments"
        description="Track monthly rent and payment history"
      />

      {message && (
        <div className="info-message">
          {message}
        </div>
      )}

      <div className="rent-summary">
        <StatCard
          label="Monthly Rent"
          value={`₹${monthlyRent.toLocaleString(
            "en-IN"
          )}`}
          icon="₹"
        />

        <StatCard
          label="Collected This Month"
          value={`₹${collectedThisMonth.toLocaleString(
            "en-IN"
          )}`}
          icon="✓"
        />

        <StatCard
          label="Pending"
          value={`₹${pending.toLocaleString(
            "en-IN"
          )}`}
          icon="!"
        />
      </div>

      <div className="rent-content">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Record Payment</h3>
              <p>
                Add a rent payment from a tenant.
              </p>
            </div>
          </div>

          {tenants.length === 0 ? (
            <div className="empty-state compact">
              <h3>No tenants available</h3>

              <p>
                Add a tenant before recording a
                payment.
              </p>
            </div>
          ) : (
            <>
              <div className="form-grid">
                <FormField
                  label="Tenant"
                  value={tenantId}
                  onChange={setTenantId}
                  options={[
                    "Select tenant",
                    ...tenants.map(
                      (tenant) =>
                        `${tenant.name} - Room ${tenant.roomNumber}`
                    ),
                  ].join("|||")}
                  optionValues={[
                    "",
                    ...tenants.map(
                      (tenant) =>
                        String(tenant.id)
                    ),
                  ]}
                  placeholder="Select tenant"
                />

                <FormField
                  label="Amount"
                  value={amount}
                  onChange={setAmount}
                  placeholder="Example: 8000"
                  type="number"
                />

                <FormField
                  label="Payment Date"
                  value={paymentDate}
                  onChange={setPaymentDate}
                  type="date"
                />

                <FormField
                  label="Payment Method"
                  value={paymentMethod}
                  onChange={(value) =>
                    setPaymentMethod(
                      value as PaymentMethod
                    )
                  }
                  options="UPI|||Cash|||Bank Transfer"
                  optionValues={[
                    "UPI",
                    "Cash",
                    "Bank Transfer",
                  ]}
                />
              </div>

              <div className="form-actions">
                <button
                  className="primary-btn"
                  onClick={
                    recordPayment
                  }
                >
                  Record Payment
                </button>
              </div>
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Tenant Rent Status</h3>
              <p>
                Payments recorded this month.
              </p>
            </div>
          </div>

          {tenants.length === 0 ? (
            <div className="empty-state compact">
              <p>
                No tenants to display.
              </p>
            </div>
          ) : (
            <div className="rent-tenant-list">
              {tenants.map((tenant) => {
                const paid =
                  payments
                    .filter(
                      (payment) =>
                        payment.tenantId ===
                          tenant.id &&
                        payment.paymentDate.startsWith(
                          currentMonth
                        )
                    )
                    .reduce(
                      (sum, payment) =>
                        sum +
                        payment.amount,
                      0
                    );

                const due = Math.max(
                  0,
                  tenant.rent - paid
                );

                return (
                  <div
                    className="payment-row"
                    key={tenant.id}
                  >
                    <div>
                      <strong>
                        {tenant.name}
                      </strong>

                      <span>
                        Room{" "}
                        {tenant.roomNumber} •{" "}
                        {tenant.bedName}
                      </span>
                    </div>

                    <div className="payment-amount">
                      <strong>
                        ₹
                        {paid.toLocaleString(
                          "en-IN"
                        )}
                      </strong>

                      <span
                        className={
                          due === 0
                            ? "paid"
                            : "due"
                        }
                      >
                        {due === 0
                          ? "Paid"
                          : `₹${due.toLocaleString(
                              "en-IN"
                            )} due`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="panel payment-history">
        <div className="panel-header">
          <div>
            <h3>Recent Payments</h3>
            <p>
              Latest recorded rent payments.
            </p>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="empty-state compact">
            <p>
              No payments recorded yet.
            </p>
          </div>
        ) : (
          <div className="payment-table">
            <div className="table-header">
              <span>Tenant</span>
              <span>Date</span>
              <span>Method</span>
              <span>Amount</span>
            </div>

            {payments
              .slice(0, 10)
              .map((payment) => (
                <div
                  className="table-row"
                  key={payment.id}
                >
                  <span>
                    {tenantName(
                      payment.tenantId
                    )}
                  </span>

                  <span>
                    {payment.paymentDate}
                  </span>

                  <span>
                    {payment.paymentMethod}
                  </span>

                  <strong>
                    ₹
                    {payment.amount.toLocaleString(
                      "en-IN"
                    )}
                  </strong>
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  );
}

function Invoices() {
  return (
    <>
      <PageHeader
        title="Invoices"
        description="Create and manage rent invoices"
      />

      <div className="panel coming-soon">
        <div className="coming-soon-icon">
          ▧
        </div>

        <h2>Invoices are coming soon</h2>

        <p>
          Peacely will soon let you generate
          professional rent invoices for your
          tenants.
        </p>

        <div className="coming-soon-features">
          <span>✓ Rent invoice</span>
          <span>✓ Payment receipt</span>
          <span>✓ Download PDF</span>
          <span>✓ Share with tenant</span>
        </div>
      </div>
    </>
  );
}

function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">
          {title}
        </h1>

        <p className="page-description">
          {description}
        </p>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  options,
  optionValues,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  options?: string;
  optionValues?: string[];
}) {
  const optionList = options
    ? options.split("|||")
    : [];

  if (options) {
    return (
      <label className="form-field">
        <span>{label}</span>

        <select
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
        >
          {optionList.map(
            (option, index) => (
              <option
                key={`${option}-${index}`}
                value={
                  optionValues?.[index] ??
                  option
                }
              >
                {option}
              </option>
            )
          )}
        </select>
      </label>
    );
  }

  return (
    <label className="form-field">
      <span>{label}</span>

      <input
        type={type}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
      />
    </label>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">
        {icon}
      </div>

      <div className="stat-content">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

export default App;
