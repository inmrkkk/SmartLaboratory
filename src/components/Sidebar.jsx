// src/components/Sidebar.js
import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import "../CSS/Sidebar.css";

export default function Sidebar({ activeSection, onSectionChange }) {
  const { logout, userRole, isAdmin } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  const allMenuItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "🏠",
      roles: ["admin", "laboratory_manager"],
      description: "Overview of system activity"
    },
    {
      id: "equipments",
      label: "Equipments", 
      icon: "⚙️",
      roles: ["laboratory_manager"],
      description: "Manage laboratory equipment"
    },
    {
      id: "laboratories",
      label: "Laboratories",
      icon: "🧪",
      roles: ["admin"],
      description: "Manage laboratories and assignments"
    },
    {
      id: "request-forms",
      label: "Item Request",
      icon: "📋",
      roles: ["laboratory_manager"],
      description: "View and manage borrow requests"
    },
    {
      id: "history",
      label: "History",
      icon: "📊",
      roles: ["laboratory_manager"],
      description: "View equipment usage history"
    },
    {
      id: "analytics",
      label: "Analytics",
      icon: "📈",
      roles: ["laboratory_manager"],
      description: "View system analytics and reports"
    },
    {
      id: "users",
      label: "Users",
      icon: "👥",
      roles: ["admin"], // Only admins can manage users
      description: "Manage user accounts and roles"
    },
    {
      id: "damaged-lost",
      label: "Damaged / Lost Records",
      icon: "🚨",
      roles: ["admin", "laboratory_manager"],
      description: "Manage damaged and lost item records"
    }
  ];

  // Filter menu items based on user role
  const menuItems = allMenuItems.filter(item => 
    item.roles.includes(userRole)
  );

  // Get restricted items for visual feedback (optional)
  const restrictedItems = allMenuItems.filter(item => 
    !item.roles.includes(userRole)
  );

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <h2 className="sidebar-title">
          {userRole === 'admin' ? 'Admin Panel' : 'Lab In Charge Panel'}
        </h2>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="toggle-button"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? "→" : "←"}
        </button>
      </div>

      <nav className="sidebar-nav" role="navigation">
        {/* Available menu items */}
        {menuItems.map((item) => (
          <button
            key={item.id}
            className={`menu-item ${activeSection === item.id ? 'active' : ''} tooltip`}
            onClick={() => onSectionChange(item.id)}
            data-tooltip={item.label}
            title={isCollapsed ? item.label : ''}
            aria-label={item.label}
          >
            <span className="menu-item-icon" role="img" aria-hidden="true">
              {item.icon}
            </span>
            <span className="menu-item-label">{item.label}</span>
          </button>
        ))}

        {/* Restricted menu items (shown as disabled) - Only show for non-admin users */}
        {restrictedItems.length > 0 && !isCollapsed && !isAdmin() && (
          <>
            <div className="sidebar-divider"></div>
            <div className="restricted-section">
              <div className="restricted-label">Restricted Access</div>
              {restrictedItems.map((item) => (
                <button
                  key={item.id}
                  className="menu-item disabled tooltip"
                  disabled
                  data-tooltip={`${item.label} - ${userRole === 'laboratory_manager' ? 'Admin access required' : 'Access restricted'}`}
                  title={`${item.label} - ${userRole === 'laboratory_manager' ? 'Admin access required' : 'Access restricted'}`}
                  aria-label={`${item.label} - Access restricted`}
                >
                  <span className="menu-item-icon" role="img" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="menu-item-label">{item.label}</span>
                  <span className="restricted-indicator" title="Access restricted">🔒</span>
                </button>
              ))}
            </div>
          </>
        )}
      </nav>

      <button
        onClick={handleLogout}
        className="logout-button"
        title="Sign out of admin panel"
        aria-label="Logout"
      >
        <span className="logout-button-text">Logout</span>
        <span className="logout-button-icon" role="img" aria-hidden="true">
          ↪
        </span>
      </button>
    </div>
  );
}