import React from "react";
import ReactDOM from "react-dom/client";
import "./style.css";

function Peacely() {
  return (
    <div className="app">
      <header className="header">
        <div>
          <div className="logo">P</div>
          <div>
            <h1>Peacely</h1>
            <p>PG & Rental Management</p>
          </div>
        </div>

        <button className="profile">Admin</button>
      </header>

      <main className="content">
        <section className="welcome">
          <p className="eyebrow">GOOD MORNING 👋</p>
          <h2>Manage your property peacefully.</h2>
          <p className="subtitle">
            Keep tenants, rooms, rent and payments organized in one place.
          </p>
        </section>

        <section className="stats">
          <div className="card">
            <span>Total Tenants</span>
            <strong>0</strong>
          </div>

          <div className="card">
            <span>Occupied Beds</span>
            <strong>0</strong>
          </div>

          <div className="card">
            <span>Rent Collected</span>
            <strong>₹0</strong>
          </div>

          <div className="card">
            <span>Pending Rent</span>
            <strong>₹0</strong>
          </div>
        </section>

        <section className="quick">
          <h3>Quick actions</h3>

          <div className="actions">
            <button>＋ Add Tenant</button>
            <button>＋ Add Property</button>
            <button>🏠 Manage Rooms</button>
            <button>💰 Record Payment</button>
          </div>
        </section>

        <section className="empty">
          <div className="empty-icon">🏠</div>
          <h3>Your Peacely dashboard is ready</h3>
          <p>
            Add your first property to start managing rooms, tenants and rent.
          </p>
          <button className="primary">Add Your First Property</button>
        </section>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Peacely />
  </React.StrictMode>
);
