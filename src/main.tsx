import React from "react";
import ReactDOM from "react-dom/client";
import "./style.css";

function App() {
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

      <main className="dashboard">
        <section className="welcome">
          <div>
            <p className="eyebrow">OVERVIEW</p>
            <h2>Good afternoon 👋</h2>
            <p className="subtitle">
              Here's what's happening with your property today.
            </p>
          </div>

          <button className="primary-btn">+ New Admission</button>
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

              <button>
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
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
