// src/components/LaboratoryManagement.jsx
import React, { useState, useEffect } from "react";
import { ref, push, onValue, remove, update, get } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import "../CSS/LaboratoryManagement.css";

export default function LaboratoryManagement() {
  const { isAdmin, isLaboratoryManager, assignedLaboratories } = useAuth();
  const [laboratories, setLaboratories] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingLaboratory, setEditingLaboratory] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [sortBy, setSortBy] = useState("labName");
  const [sortOrder, setSortOrder] = useState("asc");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [laboratoryToDelete, setLaboratoryToDelete] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const getRoleLabel = (role) => {
    if (!role) return "Unknown";
    if (role === "laboratory_manager") return "Lab In Charge";
    if (role === "admin") return "Admin";
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const [laboratoryFormData, setLaboratoryFormData] = useState({
    labName: "",
    description: "",
    location: "",
    managerUserId: "",
    createdAt: ""
  });

  // Fetch laboratories and users from Firebase
  useEffect(() => {
    fetchLaboratories();
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isLaboratoryManager, assignedLaboratories]);

  const fetchLaboratories = () => {
    try {
      setLoading(true);
      const laboratoriesRef = ref(database, 'laboratories');
      
      console.log("Fetching laboratories from database...");
      console.log("isAdmin():", isAdmin());
      console.log("isLaboratoryManager():", isLaboratoryManager());
      console.log("Current user role:", isAdmin() ? 'admin' : isLaboratoryManager() ? 'laboratory_manager' : 'unknown');
      console.log("Assigned laboratories:", assignedLaboratories);
      
      onValue(laboratoriesRef, (snapshot) => {
        const data = snapshot.val();
        console.log("Raw laboratories data from database:", data);
        
        if (data) {
          const laboratoryList = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
          
          console.log("Processed laboratory list:", laboratoryList);
          console.log("Total laboratories found:", laboratoryList.length);
          
          // Filter laboratories based on user role
          let filteredLaboratories = laboratoryList;
          if (isLaboratoryManager() && !isAdmin()) {
            console.log("Filtering for Laboratory Manager. Assigned labs:", assignedLaboratories);
            // Laboratory managers can only see their assigned laboratories
            const assignedLabIds = assignedLaboratories.map(lab => lab.id);
            filteredLaboratories = laboratoryList.filter(lab => 
              assignedLabIds.includes(lab.id)
            );
            console.log("Filtered laboratories for Lab Manager:", filteredLaboratories);
          } else {
            console.log("Admin user - showing all laboratories");
          }
          
          console.log("Final filtered laboratories to display:", filteredLaboratories);
          setLaboratories(filteredLaboratories);
        } else {
          console.log("No laboratories data found in database");
          setLaboratories([]);
        }
        setLoading(false);
      });
    } catch (error) {
      console.error("Error fetching laboratories:", error);
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const usersRef = ref(database, 'users');
      const snapshot = await get(usersRef);
      
      if (snapshot.exists()) {
        const usersData = snapshot.val();
        const fetchedUsers = [];
        
        // Convert the object to array with IDs and filter for admins/laboratory managers only
        Object.keys(usersData).forEach((userId) => {
          const userData = usersData[userId];
          // Only include admins and laboratory managers as potential lab managers
          if (userData.role === 'admin' || userData.role === 'laboratory_manager') {
            fetchedUsers.push({
              id: userId,
              name: userData.name || "Unknown",
              email: userData.email || "No email",
              role: userData.role || "teacher",
              profile_setup: userData.profile_setup || false,
              ...userData
            });
          }
        });
        
        // Sort by name
        fetchedUsers.sort((a, b) => a.name.localeCompare(b.name));
        
        setUsers(fetchedUsers);
      } else {
        setUsers([]);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setLaboratoryFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!laboratoryFormData.labName.trim()) {
      alert("Please fill in required fields (Lab Name)");
      return;
    }

    // Generate Lab ID automatically
    const generatedLabId = editingLaboratory ? editingLaboratory.labId : generateNextLabId();
    
    const submissionData = {
      ...laboratoryFormData,
      labId: generatedLabId
    };

    console.log("Submitting laboratory data:", submissionData);

    try {
      if (editingLaboratory) {
        // Update existing laboratory
        console.log("Updating existing laboratory:", editingLaboratory.id);
        const laboratoryRef = ref(database, `laboratories/${editingLaboratory.id}`);
        await update(laboratoryRef, {
          ...submissionData,
          updatedAt: new Date().toISOString()
        });
        console.log("Laboratory updated successfully");
        setSuccessMessage("Laboratory updated successfully!");
      } else {
        // Add new laboratory
        console.log("Creating new laboratory with data:", {
          ...submissionData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        
        const laboratoriesRef = ref(database, 'laboratories');
        const newLaboratoryRef = await push(laboratoriesRef, {
          ...submissionData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        
        console.log("Laboratory created successfully with key:", newLaboratoryRef.key);
        setSuccessMessage("Laboratory added successfully!");
      }
      
      resetForm();
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 3000);
    } catch (error) {
      console.error("Error saving laboratory:", error);
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      alert(`Error saving laboratory: ${error.message}. Please try again.`);
    }
  };

  const handleEdit = (laboratory) => {
    setEditingLaboratory(laboratory);
    setLaboratoryFormData({
      labName: laboratory.labName || "",
      description: laboratory.description || "",
      location: laboratory.location || "",
      managerUserId: laboratory.managerUserId || "",
      createdAt: laboratory.createdAt || ""
    });
    setShowAddForm(true);
  };

  const handleDelete = async () => {
    if (!laboratoryToDelete) return;

    try {
      const laboratoryRef = ref(database, `laboratories/${laboratoryToDelete.id}`);
      await remove(laboratoryRef);
      setSuccessMessage("Laboratory deleted successfully!");
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 3000);
    } catch (error) {
      console.error("Error deleting laboratory:", error);
      alert("Error deleting laboratory. Please try again.");
    } finally {
      setShowDeleteModal(false);
      setLaboratoryToDelete(null);
    }
  };

  const confirmDelete = (laboratory) => {
    setLaboratoryToDelete(laboratory);
    setShowDeleteModal(true);
  };

  const resetForm = () => {
    setLaboratoryFormData({
      labName: "",
      description: "",
      location: "",
      managerUserId: "",
      createdAt: ""
    });
    setShowAddForm(false);
    setEditingLaboratory(null);
  };


  // Generate next Lab ID automatically
  const generateNextLabId = () => {
    if (laboratories.length === 0) {
      return "LAB001";
    }
    
    // Extract existing Lab IDs and find the highest number
    const existingIds = laboratories
      .map(lab => lab.labId)
      .filter(id => id && id.startsWith("LAB"))
      .map(id => {
        const number = parseInt(id.replace("LAB", ""));
        return isNaN(number) ? 0 : number;
      });
    
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    const nextNumber = maxId + 1;
    
    // Format with leading zeros (LAB001, LAB002, etc.)
    return `LAB${nextNumber.toString().padStart(3, '0')}`;
  };


  const filteredLaboratories = laboratories.filter(lab => {
    // Get manager info for search
    const manager = users.find(user => user.id === lab.managerUserId);
    const managerName = manager ? manager.name : "";
    
    const matchesSearch = lab.labId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lab.labName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lab.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lab.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      managerName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesLocation = !locationFilter || lab.location?.toLowerCase().includes(locationFilter.toLowerCase());
    const matchesManager = !managerFilter || lab.managerUserId === managerFilter;
    
    return matchesSearch && matchesLocation && matchesManager;
  });

  const sortedLaboratories = filteredLaboratories.sort((a, b) => {
    let aValue = a[sortBy] || "";
    let bValue = b[sortBy] || "";
    
    if (typeof aValue === 'string') aValue = aValue.toLowerCase();
    if (typeof bValue === 'string') bValue = bValue.toLowerCase();
    
    if (sortOrder === "asc") {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const getSortIcon = (column) => {
    if (sortBy !== column) return "↕";
    return sortOrder === "asc" ? "↑" : "↓";
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  // Get unique values for filter dropdowns
  const getUniqueLocations = () => {
    const locations = laboratories
      .map(lab => lab.location)
      .filter(location => location && location.trim() !== "")
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort();
    return locations;
  };


  const getUniqueManagers = () => {
    const managerIds = laboratories
      .map(lab => lab.managerUserId)
      .filter(managerId => managerId && managerId.trim() !== "")
      .filter((value, index, self) => self.indexOf(value) === index);
    
    return managerIds.map(managerId => {
      const user = users.find(u => u.id === managerId);
      return user ? { id: managerId, name: user.name } : null;
    }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSearchTerm("");
    setLocationFilter("");
    setManagerFilter("");
  };

  if (loading) {
    return (
      <div className="laboratory-management-container">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading laboratories...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="laboratory-management-container">
      {/* Header */}
      <div className="laboratory-header">
        <div className="header-content">
          <h1>Laboratory Management</h1>
          <p>Manage laboratory information, capacity, and supervisors</p>
        </div>
        {isAdmin() && (
          <button
            onClick={() => setShowAddForm(true)}
            className="btn btn-primary add-laboratory-btn"
          >
            <span className="btn-icon">+</span>
            Add Laboratory
          </button>
        )}
      </div>

      {/* Search and Filter */}
      <div className="search-filter-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search laboratories by ID, name, description, location, in-charge, or manager..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <span className="search-icon">🔍</span>
        </div>
        
        <div className="filter-controls">
          <div className="filter-group">
            <label className="filter-label">Location:</label>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="filter-select"
            >
              <option value="">All Locations</option>
              {getUniqueLocations().map(location => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </div>
          
          <div className="filter-group">
            <label className="filter-label">Manager:</label>
            <select
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
              className="filter-select"
            >
              <option value="">All Managers</option>
              {getUniqueManagers().map(manager => (
                <option key={manager.id} value={manager.id}>
                  {manager.name}
                </option>
              ))}
            </select>
          </div>
          
          <button
            onClick={clearAllFilters}
            className="clear-filters-btn"
            title="Clear all filters"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Laboratories Table */}
      <div className="laboratory-table-container">
        <div className="table-header">
          <div className="table-title">
            <h3>Laboratories ({sortedLaboratories.length})</h3>
            <div className="table-info">
              {searchTerm || locationFilter || managerFilter ? (
                <span className="filter-info">
                  Showing {sortedLaboratories.length} of {laboratories.length} laboratories
                </span>
              ) : (
                <span className="total-info">
                  Total: {laboratories.length} laboratories
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="laboratory-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("labId")} className="sortable">
                  Lab ID {getSortIcon("labId")}
                </th>
                <th onClick={() => handleSort("labName")} className="sortable">
                  Lab Name {getSortIcon("labName")}
                </th>
                <th onClick={() => handleSort("description")} className="sortable">
                  Description {getSortIcon("description")}
                </th>
                <th onClick={() => handleSort("location")} className="sortable">
                  Location {getSortIcon("location")}
                </th>
                <th onClick={() => handleSort("managerUserId")} className="sortable">
                  Lab In Charge {getSortIcon("managerUserId")}
                </th>
                <th onClick={() => handleSort("createdAt")} className="sortable">
                  Created At {getSortIcon("createdAt")}
                </th>
                <th className="center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedLaboratories.length > 0 ? (
                sortedLaboratories.map((laboratory) => {
                  const manager = users.find(user => user.id === laboratory.managerUserId);
                  return (
                    <tr key={laboratory.id}>
                      <td className="laboratory-id">{laboratory.labId || "—"}</td>
                      <td className="laboratory-name">
                        <div className="name-text">{laboratory.labName || "—"}</div>
                      </td>
                      <td className="laboratory-description">
                        <div className="description-text">{laboratory.description || "—"}</div>
                      </td>
                      <td className="laboratory-location">{laboratory.location || "—"}</td>
                      <td className="laboratory-manager">
                        {manager ? (
                          <div className="manager-info">
                            <div className="manager-name">{manager.name}</div>
                            <div className="manager-role">{manager.role}</div>
                          </div>
                        ) : (
                          <span className="no-manager">—</span>
                        )}
                      </td>
                      <td className="laboratory-created">
                        {laboratory.createdAt ? new Date(laboratory.createdAt).toLocaleDateString() : "—"}
                      </td>
                    <td className="center">
                      <div className="table-actions">
                        {isAdmin() && (
                          <>
                            <button
                              onClick={() => handleEdit(laboratory)}
                              className="btn-edit"
                              title="Edit laboratory"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => confirmDelete(laboratory)}
                              className="btn-delete"
                              title="Delete laboratory"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8" className="no-data">
                    <div className="empty-state">
                      <div className="empty-icon">🧪</div>
                      <h3>No laboratories found</h3>
                      <p>
                        {searchTerm 
                          ? "No laboratories match your search criteria." 
                          : "Add your first laboratory to get started."
                        }
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Laboratory Modal */}
      {showAddForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editingLaboratory ? "Edit Laboratory" : "Add Laboratory"}</h2>
              <button onClick={resetForm} className="modal-close-btn">×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">
                    Lab ID
                  </label>
                  <div className="form-input-display">
                    {editingLaboratory ? editingLaboratory.labId : generateNextLabId()}
                  </div>
                  <small className="form-help">
                    Lab ID is automatically generated
                  </small>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Lab Name *
                  </label>
                  <input
                    type="text"
                    name="labName"
                    value={laboratoryFormData.labName}
                    onChange={handleInputChange}
                    required
                    className="form-input"
                    placeholder="e.g., Chemistry Laboratory"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input
                    type="text"
                    name="location"
                    value={laboratoryFormData.location}
                    onChange={handleInputChange}
                    className="form-input"
                    placeholder="e.g., Building A, Room 101"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Lab In Charge</label>
                  <select
                    name="managerUserId"
                    value={laboratoryFormData.managerUserId}
                    onChange={handleInputChange}
                    className="form-select"
                  >
                    <option value="">Select Lab In Charge</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({getRoleLabel(user.role)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  name="description"
                  value={laboratoryFormData.description}
                  onChange={handleInputChange}
                  className="form-textarea"
                  placeholder="Describe the laboratory's purpose and facilities..."
                  rows="3"
                />
              </div>

              <div className="form-actions">
                <button type="button" onClick={resetForm} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingLaboratory ? "Update Laboratory" : "Add Laboratory"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="delete-modal-overlay">
          <div className="delete-modal-container">
            <div className="delete-modal-icon">⚠️</div>
            <h2 className="delete-modal-title">Delete Laboratory</h2>
            <p className="delete-modal-message">
              Are you sure you want to delete the laboratory "{laboratoryToDelete?.labName}"?
            </p>
            <p className="delete-modal-warning">
              This action cannot be undone and will remove all associated data.
            </p>
            <div className="delete-modal-actions">
              <button 
                onClick={() => {
                  setShowDeleteModal(false);
                  setLaboratoryToDelete(null);
                }} 
                className="delete-modal-cancel"
              >
                Cancel
              </button>
              <button onClick={handleDelete} className="delete-modal-confirm">
                Delete Laboratory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="success-modal-overlay">
          <div className="success-modal-container">
            <div className="success-modal-icon">✅</div>
            <h2 className="success-modal-title">Success</h2>
            <p className="success-modal-message">{successMessage}</p>
            <button 
              onClick={() => setShowSuccessModal(false)} 
              className="success-modal-button"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
