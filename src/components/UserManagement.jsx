// src/components/UserManagement.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ref, 
  get, 
  update,
  set,
  remove
} from "firebase/database";
import { 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from "firebase/auth";
import { database, auth } from "../firebase";
import "../CSS/UserManagement.css";

export default function UserManagement({ onRedirectToUsers }) {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [emailValidation, setEmailValidation] = useState({ status: '', message: '' });

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "admin",
    profile_setup: true,
    course: "",
    yearLevel: "",
    section: ""
  });

  const roles = ["admin", "laboratory_manager", "student"];
  const roleLabels = {
    admin: "Admin",
    laboratory_manager: "Lab In Charge",
    student: "Student"
  };

  const handleDelete = async (user) => {
    const confirmDelete = window.confirm(`Delete ${user.name}? This action cannot be undone.`);
    if (!confirmDelete) return;

    try {
      const userRef = ref(database, `users/${user.id}`);
      await remove(userRef);
      setUsers(prev => prev.filter(u => u.id !== user.id));
      alert(`User ${user.name} deleted successfully.`);
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Failed to delete user. Please try again.");
    }
  };
  const getRoleLabel = (role) => roleLabels[role] || role;
  const statuses = ["Active", "Inactive", "Pending"];

  // Fetch users from Firebase Realtime Database
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const usersRef = ref(database, 'users');
      const snapshot = await get(usersRef);
      
      if (snapshot.exists()) {
        const usersData = snapshot.val();
        const fetchedUsers = [];
        
        // Convert the object to array with IDs
        Object.keys(usersData).forEach((userId) => {
          const userData = usersData[userId];
          fetchedUsers.push({
            id: userId,
            name: userData.name || "Unknown",
            email: userData.email || "No email",
            role: userData.role || "student",
            status: userData.profile_setup ? "Active" : "Pending",
            createdAt: userData.createdAt ? new Date(userData.createdAt).toLocaleDateString() : "Unknown",
            profile_setup: userData.profile_setup || false,
            course: userData.course || "",
            yearLevel: userData.yearLevel || "",
            section: userData.section || "",
            ...userData
          });
        });
        
        // Sort by creation date (newest first)
        fetchedUsers.sort((a, b) => {
          const dateA = new Date(a.createdAt || 0);
          const dateB = new Date(b.createdAt || 0);
          return dateB - dateA;
        });
        
        setUsers(fetchedUsers);
      } else {
        setUsers([]);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      alert("Error fetching users. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Load users when component mounts
  useEffect(() => {
    fetchUsers();
  }, []);

  // Filter and sort users
  const filteredUsers = users
    .filter(user => {
      const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           user.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = filterRole === "All" || user.role === filterRole;
      const matchesStatus = filterStatus === "All" || user.status === filterStatus;
      return matchesSearch && matchesRole && matchesStatus;
    })
    .sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
      
      if (sortBy === "createdAt") {
        aValue = new Date(aValue);
        bValue = new Date(bValue);
      }
      
      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear email validation when user starts typing
    if (name === 'email') {
      setEmailValidation({ status: '', message: '' });
    }
  };

  const handleEmailBlur = async () => {
    if (isCreatingUser && formData.email && formData.email.includes('@')) {
      setEmailValidation({ status: 'checking', message: 'Checking email availability...' });
      
      try {
        const emailExists = await checkEmailExists(formData.email);
        if (emailExists) {
          setEmailValidation({ 
            status: 'error', 
            message: 'This email is already registered' 
          });
        } else {
          setEmailValidation({ 
            status: 'success', 
            message: 'Email is available' 
          });
        }
      } catch (error) {
        setEmailValidation({ 
          status: 'error', 
          message: 'Unable to verify email' 
        });
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    
    try {
      if (isCreatingUser) {
        // Check if email already exists before creating user
        const emailExists = await checkEmailExists(formData.email);
        if (emailExists) {
          setError('This email is already registered. Please use a different email address.');
          return;
        }

        // Create new user with Firebase Authentication
        // Note: Admin session info stored but not used as we navigate to login after creation
        
        // Create the new user (this will temporarily sign them in)
        const userCredential = await createUserWithEmailAndPassword(
          auth, 
          formData.email, 
          formData.password
        );
        
        const newUser = userCredential.user;
        
        // Save user data to Realtime Database
        const userRef = ref(database, `users/${newUser.uid}`);
        await set(userRef, {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          profile_setup: formData.profile_setup,
          course: formData.course,
          yearLevel: formData.yearLevel,
          section: formData.section,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        
        // Send password reset email to let user set their own password
        await sendPasswordResetEmail(auth, formData.email);
        
        // Sign out the newly created user
        await signOut(auth);
        
        // Try to restore admin session by navigating to login
        // The AuthContext will handle the session restoration
        setSuccess(`User ${formData.name} created successfully! Redirecting to login...`);
        
        setTimeout(() => {
          closeModal();
          // Navigate to login page where admin can log back in
          navigate('/');
        }, 2000);
        
      } else {
        // Update existing user
        const userRef = ref(database, `users/${editingUser.id}`);
        await update(userRef, {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          profile_setup: formData.profile_setup,
          course: formData.course,
          yearLevel: formData.yearLevel,
          section: formData.section,
          updatedAt: Date.now()
        });
        
        // Update local state
        setUsers(prev => prev.map(user => 
          user.id === editingUser.id 
            ? { 
                ...user, 
                name: formData.name,
                email: formData.email,
                role: formData.role,
                profile_setup: formData.profile_setup,
                course: formData.course,
                yearLevel: formData.yearLevel,
                section: formData.section,
                status: formData.profile_setup ? "Active" : "Pending"
              }
            : user
        ));
        
        setSuccess(`User ${formData.name} updated successfully!`);
        
        // Close modal and reset form after a short delay for updates
        setTimeout(() => {
          closeModal();
        }, 1500);
      }
      
    } catch (error) {
      console.error("Error managing user:", error);
      setError(getErrorMessage(error.code));
    }
  };

  const checkEmailExists = async (email) => {
    try {
      const usersRef = ref(database, 'users');
      const snapshot = await get(usersRef);
      
      if (snapshot.exists()) {
        const usersData = snapshot.val();
        // Check if any user has this email
        for (const userId in usersData) {
          if (usersData[userId].email === email) {
            return true; // Email already exists
          }
        }
      }
      return false; // Email doesn't exist
    } catch (error) {
      console.error('Error checking email:', error);
      return false; // Assume email doesn't exist if check fails
    }
  };

  const getErrorMessage = (errorCode) => {
    switch (errorCode) {
      case 'auth/email-already-in-use':
        return 'This email is already registered. Please use a different email address.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.';
      case 'auth/operation-not-allowed':
        return 'Email/password accounts are not enabled.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection and try again.';
      case 'auth/too-many-requests':
        return 'Too many requests. Please wait a moment and try again.';
      default:
        return 'An error occurred. Please try again.';
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setIsCreatingUser(false);
    setFormData({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      profile_setup: user.profile_setup,
      course: user.course || "",
      yearLevel: user.yearLevel || "",
      section: user.section || ""
    });
    setIsModalOpen(true);
  };

  const handleCreateUser = () => {
    setEditingUser(null);
    setIsCreatingUser(true);
    setFormData({
      name: "",
      email: "",
      password: "",
      role: "student",
      profile_setup: true,
      course: "",
      yearLevel: "",
      section: ""
    });
    setError("");
    setSuccess("");
    setIsModalOpen(true);
  };


  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setIsCreatingUser(false);
    setFormData({
      name: "",
      email: "",
      password: "",
      role: "admin",
      profile_setup: true,
      course: "",
      yearLevel: "",
      section: ""
    });
    setError("");
    setSuccess("");
    setEmailValidation({ status: '', message: '' });
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (field) => {
    if (sortBy !== field) return "↕";
    return sortOrder === "asc" ? "↑" : "↓";
  };


  return (
    <div className="user-management">
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner">Loading users...</div>
        </div>
      )}
      
      <div className="user-management-header">
        <div className="header-left">
          <h1>User Management</h1>
          <p>Manage user accounts, roles, and permissions ({users.length} users)</p>
        </div>
        <div className="header-right">
          <button 
            onClick={handleCreateUser}
            className="btn btn-primary"
          >
            <span className="btn-icon">+</span>
            Create User
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="user-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="filter-group">
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="filter-select"
          >
            <option value="All">All Roles</option>
            {roles.map(role => (
              <option key={role} value={role}>{getRoleLabel(role)}</option>
            ))}
          </select>
          
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="All">All Status</option>
            {statuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("name")} className="sortable">
                Name {getSortIcon("name")}
              </th>
              <th onClick={() => handleSort("email")} className="sortable">
                Email {getSortIcon("email")}
              </th>
              <th onClick={() => handleSort("role")} className="sortable">
                Role {getSortIcon("role")}
              </th>
              <th onClick={() => handleSort("status")} className="sortable">
                Status {getSortIcon("status")}
              </th>
              <th onClick={() => handleSort("course")} className="sortable">
                Course {getSortIcon("course")}
              </th>
              <th>Profile Setup</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => (
              <tr key={user.id}>
                <td className="user-name">
                  <div className="user-avatar">
                    {user.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  {user.name}
                </td>
                <td>{user.email}</td>
                <td>
                  <span className={`role-badge role-${user.role.toLowerCase()}`}>
                    {getRoleLabel(user.role)}
                  </span>
                </td>
                <td>
                  <span className={`status-badge status-${user.status === 'Active' ? 'success' : user.status === 'Pending' ? 'warning' : 'danger'}`}>
                    {user.status}
                  </span>
                </td>
                <td>
                  {user.course || user.yearLevel || user.section ? (
                    <div className="course-info">
                      <div className="course-name">
                        {user.course && user.yearLevel && user.section 
                          ? `${user.course} ${user.yearLevel}-${user.section}`
                          : user.course || 'N/A'}
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted">Not specified</span>
                  )}
                </td>
                <td>
                  <span className={`profile-badge ${user.profile_setup ? 'setup-complete' : 'setup-pending'}`}>
                    {user.profile_setup ? ' Complete' : ' Pending'}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleEdit(user)}
                      title="Edit User"
                    >
                       Edit
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(user)}
                      title="Delete User"
                    >
                       Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredUsers.length === 0 && (
          <div className="empty-state">
            <p>No users found matching your criteria.</p>
          </div>
        )}
      </div>

      {/* Modal for Edit User */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{isCreatingUser ? 'Create New User' : 'Edit User'}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            
            <form onSubmit={handleSubmit} className="user-form">
              {error && (
                <div className="alert alert-error">
                  <span className="alert-icon">⚠️</span>
                  {error}
                </div>
              )}
              
              {success && (
                <div className="alert alert-success">
                  <span className="alert-icon">✅</span>
                  {success}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="form-input"
                  required
                  placeholder="Enter full name"
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  onBlur={handleEmailBlur}
                  className={`form-input ${emailValidation.status === 'error' ? 'input-error' : emailValidation.status === 'success' ? 'input-success' : ''}`}
                  required
                  placeholder="Enter email address"
                />
                {emailValidation.message && (
                  <div className={`form-validation ${emailValidation.status}`}>
                    {emailValidation.status === 'checking' && <span className="validation-icon">⏳</span>}
                    {emailValidation.status === 'error' && <span className="validation-icon">❌</span>}
                    {emailValidation.status === 'success' && <span className="validation-icon">✅</span>}
                    {emailValidation.message}
                  </div>
                )}
              </div>

              {isCreatingUser && (
                <div className="form-group">
                  <label className="form-label">Password *</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="form-input"
                    required
                    minLength="6"
                    placeholder="Enter password (min 6 characters)"
                  />
                  <small className="form-help">
                    A password reset email will be sent to the user to set their own password.
                  </small>
                </div>
              )}
              
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select
                    name="role"
                    value={formData.role}
                    onChange={handleInputChange}
                    className="form-select"
                  >
                    {roles.map(role => (
                      <option key={role} value={role}>{getRoleLabel(role)}</option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Profile Setup Status</label>
                  <select
                    name="profile_setup"
                    value={formData.profile_setup}
                    onChange={(e) => setFormData(prev => ({...prev, profile_setup: e.target.value === 'true'}))}
                    className="form-select"
                  >
                    <option value={true}>Complete</option>
                    <option value={false}>Pending</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Course</label>
                <input
                  type="text"
                  name="course"
                  value={formData.course}
                  onChange={handleInputChange}
                  className="form-input"
                  placeholder="e.g., Computer Science, Engineering"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Year Level</label>
                  <select
                    name="yearLevel"
                    value={formData.yearLevel}
                    onChange={handleInputChange}
                    className="form-select"
                  >
                    <option value="">Select Year Level</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Section</label>
                  <input
                    type="text"
                    name="section"
                    value={formData.section}
                    onChange={handleInputChange}
                    className="form-input"
                    placeholder="e.g., A, B, C"
                  />
                </div>
              </div>
              
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {isCreatingUser ? 'Create User' : 'Update User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}