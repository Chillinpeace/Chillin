import React from "react";
import ReactDOM from "react-dom/client";

function TestApp() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        fontFamily: "Arial, sans-serif",
        background: "#f5f7ff",
        padding: "20px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "80px",
          height: "80px",
          borderRadius: "20px",
          background: "#4f46e5",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "42px",
          fontWeight: "bold",
          marginBottom: "20px",
        }}
      >
        P
      </div>

      <h1
        style={{
          margin: "0 0 10px",
          fontSize: "32px",
          color: "#111827",
        }}
      >
        Peacely
      </h1>

      <p
        style={{
          margin: "0 0 20px",
          fontSize: "18px",
          color: "#6b7280",
        }}
      >
        React is working successfully.
      </p>

      <div
        style={{
          padding: "12px 20px",
          borderRadius: "10px",
          background: "#dcfce7",
          color: "#166534",
          fontWeight: "600",
        }}
      >
        ✓ Application is running
      </div>
    </div>
  );
}

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <TestApp />
  </React.StrictMode>
);
