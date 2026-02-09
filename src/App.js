// src/App.js
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./contexts/AuthContext";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";

function RequireAuth({ children }) {
  const { user, userRole, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;

  const allowedRoles = ["admin", "laboratory_manager"];
  if (!allowedRoles.includes(userRole)) return <Navigate to="/" replace />;

  return children;
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route 
            path="/dashboard" 
            element={
              <RequireAuth>
                <div className="dashboard-container">
                  <Dashboard />
                </div>
              </RequireAuth>
            } 
          />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
