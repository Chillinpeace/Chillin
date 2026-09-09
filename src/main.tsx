import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./style.css";

type Bed = {
  id: number;
  number: string;
  occupied: boolean;
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
          { id: 1, number: "A", occupied: true },
          { id: 2, number: "B", occupied: true },
        ],
      },
      {
        id: 102,
        number: "102",
        beds: [
          { id: 3, number: "A", occupied: true },
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

function Peacely() {
  const [properties, setProperties] =
    useState<Property[]>(initialProperties);

  const [selectedPropertyId, setSelectedPropertyId] =
    useState<number | null>(null);

  const [showPropertyForm, setShowPropertyForm] =
    useState(false);

  const [showRoomForm, setShowRoomForm] =
    useState(false);

  const [propertyName, setPropertyName] = useState("");
  const [propertyLocation, setPropertyLocation] = useState("");

  const [roomNumber, setRoomNumber] = useState("");
  const [bedCount, setBedCount] = useState("2");

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
          roomTotal +
          room.beds.filter((bed) => bed.occupied).length,
        0
      ),
    0
  );

  const vacantBeds = totalBeds - occupiedBeds;

  function addProperty() {
    if (!propertyName.trim() || !propertyLocation.trim()) {
      return;
    }

    const newProperty: Property = {
      id: Date.now(),
      name: propertyName.trim(),
      location: propertyLocation.trim(),
      rooms: [],
    };

    setProperties([...properties, newProperty]);

    setPropertyName("");
    setPropertyLocation("");
    setShowPropertyForm(false);
  }

  function addRoom() {
    if (!selectedProperty || !roomNumber.trim()) {
      return;
    }

    const count = Math.max(
      1,
      Math.min(10, Number(bedCount) || 1)
    );

    const newRoom: Room = {
      id: Date.now(),
      number: roomNumber.trim(),
      beds: Array.from({ length: count }, (_, index) => ({
        id: Date.now() + index,
        number: String.fromCharCode(65 + index),
        occupied: false,
      })),
    };

    setProperties(
      properties.map((property) =>
        property.id === selectedProperty.id
          ? {
              ...property,
              rooms: [...property.rooms, newRoom],
            }
          : property
      )
    );

    setRoomNumber("");
    setBedCount("2");
    setShowRoomForm(false);
  }

  function toggleBed(roomId: number, bedId: number) {
    if (!selectedProperty) return;

    setProperties(
      properties.map((property) =>
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

  if (selectedProperty) {
    const propertyBeds = selectedProperty.rooms.reduce(
      (total, room) => total + room.beds.length,
      0
    );

    const propertyOccupied = selectedProperty.rooms.reduce(
      (total, room) =>
        total +
        room.beds.filter((bed) => bed.occupied).length,
      0
    );

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

        <main className="content">
          <button
            className="back-button"
            onClick={() => setSelectedPropertyId(null)}
          >
            ← Back to Properties
          </button>

          <section className="page-heading">
            <div>
              <p className="eyebrow">PROPERTY</p>
              <h2>{selectedProperty.name}</h2>
              <p className="subtitle">
                📍 {selectedProperty.location}
              </p>
            </div>

            <button
              className="primary"
              onClick={() =>
                setShowRoomForm(!showRoomForm)
              }
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
                  onChange={(event) =>
                    setRoomNumber(event.target.value)
                  }
                />

                <input
                  type="number"
                  min="1"
                  max="10"
                  placeholder="Number of beds"
                  value={bedCount}
                  onChange={(event) =>
                    setBedCount(event.target.value)
                  }
                />

                <button
                  className="primary"
                  onClick={addRoom}
                >
                  Save Room
                </button>
              </div>
            </section>
          )}

          <section className="properties-section">
            <div className="section-title">
              <h3>Rooms & Beds</h3>
              <span>
                {selectedProperty.rooms.length} rooms
              </span>
            </div>

            {selectedProperty.rooms.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">🚪</div>
                <h3>No rooms yet</h3>
                <p>
                  Add your first room to start managing beds.
                </p>

                <button
                  className="primary"
                  onClick={() =>
                    setShowRoomForm(true)
                  }
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
                      {room.beds.map((bed) => (
                        <button
                          key={bed.id}
                          className={
                            bed.occupied
                              ? "bed occupied"
                              : "bed vacant"
                          }
                          onClick={() =>
                            toggleBed(
                              room.id,
                              bed.id
                            )
                          }
                        >
                          <span className="bed-icon">
                            🛏️
                          </span>

                          <strong>
                            Bed {bed.number}
                          </strong>

                          <small>
                            {bed.occupied
                              ? "Occupied"
                              : "Vacant"}
                          </small>
                        </button>
                      ))}
                    </div>

                    <p className="bed-hint">
                      Tap a bed to change its status
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
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

      <main className="content">
        <section className="page-heading">
          <div>
            <p className="eyebrow">
              PROPERTY MANAGEMENT
            </p>

            <h2>Your Properties</h2>

            <p className="subtitle">
              Manage your PGs, rooms and beds from one
              peaceful place.
            </p>
          </div>

          <button
            className="primary"
            onClick={() =>
              setShowPropertyForm(!showPropertyForm)
            }
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
                onChange={(event) =>
                  setPropertyName(event.target.value)
                }
              />

              <input
                type="text"
                placeholder="Location"
                value={propertyLocation}
                onChange={(event) =>
                  setPropertyLocation(event.target.value)
                }
              />

              <button
                className="primary"
                onClick={addProperty}
              >
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
            <span>
              {properties.length}{" "}
              {properties.length === 1
                ? "property"
                : "properties"}
            </span>
          </div>

          <div className="property-grid">
            {properties.map((property) => {
              const beds = property.rooms.reduce(
                (total, room) =>
                  total + room.beds.length,
                0
              );

              const occupied = property.rooms.reduce(
                (total, room) =>
                  total +
                  room.beds.filter(
                    (bed) => bed.occupied
                  ).length,
                0
              );

              return (
                <div
                  className="property-card"
                  key={property.id}
                >
                  <div className="property-top">
                    <div className="property-icon">
                      🏠
                    </div>

                    <div>
                      <h3>{property.name}</h3>
                      <p>
                        📍 {property.location}
                      </p>
                    </div>
                  </div>

                  <div className="property-stats">
                    <div>
                      <span>Rooms</span>
                      <strong>
                        {property.rooms.length}
                      </strong>
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
                      <strong>
                        {beds - occupied}
                      </strong>
                    </div>
                  </div>

                  <button
                    className="manage-button"
                    onClick={() =>
                      setSelectedPropertyId(
                        property.id
                      )
                    }
                  >
                    Manage Property →
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <Peacely />
  </React.StrictMode>
);
