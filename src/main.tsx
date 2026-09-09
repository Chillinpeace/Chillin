import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./style.css";

type Property = {
  id: number;
  name: string;
  location: string;
  rooms: number;
  beds: number;
  occupied: number;
};

const initialProperties: Property[] = [
  {
    id: 1,
    name: "My First PG",
    location: "Electronic City, Bengaluru",
    rooms: 12,
    beds: 24,
    occupied: 18,
  },
];

function Peacely() {
  const [properties, setProperties] =
    useState<Property[]>(initialProperties);

  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");

  const totalRooms = properties.reduce((sum, p) => sum + p.rooms, 0);
  const totalBeds = properties.reduce((sum, p) => sum + p.beds, 0);
  const occupiedBeds = properties.reduce(
    (sum, p) => sum + p.occupied,
    0
  );

  const vacantBeds = totalBeds - occupiedBeds;

  function addProperty() {
    if (!name.trim() || !location.trim()) return;

    const newProperty: Property = {
      id: Date.now(),
      name: name.trim(),
      location: location.trim(),
      rooms: 0,
      beds: 0,
      occupied: 0,
    };

    setProperties([...properties, newProperty]);

    setName("");
    setLocation("");
    setShowForm(false);
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
            <p className="eyebrow">PROPERTY MANAGEMENT</p>
            <h2>Your Properties</h2>
            <p className="subtitle">
              Manage your PGs, rooms and beds from one peaceful place.
            </p>
          </div>

          <button
            className="primary"
            onClick={() => setShowForm(!showForm)}
          >
            ＋ Add Property
          </button>
        </section>

        {showForm && (
          <section className="form-card">

            <h3>Add a new property</h3>

            <div className="form-grid">

              <input
                type="text"
                placeholder="Property / PG name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <input
                type="text"
                placeholder="Location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
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
            <span>{properties.length} property</span>
          </div>

          <div className="property-grid">

            {properties.map((property) => {

              const vacancy =
                property.beds > 0
                  ? property.beds - property.occupied
                  : 0;

              return (
                <div className="property-card" key={property.id}>

                  <div className="property-top">

                    <div className="property-icon">
                      🏠
                    </div>

                    <div>
                      <h3>{property.name}</h3>
                      <p>📍 {property.location}</p>
                    </div>

                  </div>

                  <div className="property-stats">

                    <div>
                      <span>Rooms</span>
                      <strong>{property.rooms}</strong>
                    </div>

                    <div>
                      <span>Beds</span>
                      <strong>{property.beds}</strong>
                    </div>

                    <div>
                      <span>Occupied</span>
                      <strong>{property.occupied}</strong>
                    </div>

                    <div>
                      <span>Vacant</span>
                      <strong>{vacancy}</strong>
                    </div>

                  </div>

                  <button className="manage-button">
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
