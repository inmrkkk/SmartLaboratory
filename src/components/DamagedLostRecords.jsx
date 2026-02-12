// src/components/DamagedLostRecords.jsx
import React, { useMemo, useState, useEffect } from "react";
import { ref, onValue, update, get, remove } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import "../CSS/DamagedLostRecords.css";

export default function DamagedLostRecords() {
  const { user } = useAuth();
  const [restrictedBorrowers, setRestrictedBorrowers] = useState([]);
  const [settledRecords, setSettledRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showSettledModal, setShowSettledModal] = useState(false);
  const [borrowerDetails, setBorrowerDetails] = useState(null);
  const [selectedSettledRecords, setSelectedSettledRecords] = useState([]);
  const [activeTab, setActiveTab] = useState('restricted');

  const [users, setUsers] = useState([]);
  const [laboratories, setLaboratories] = useState([]);

  const usersById = useMemo(() => {
    const map = new Map();
    users.forEach((u) => {
      if (u?.id) map.set(u.id, u);
    });
    return map;
  }, [users]);

  const laboratoriesByLabId = useMemo(() => {
    const map = new Map();
    laboratories.forEach((lab) => {
      const labId = (lab?.labId || '').toString().trim();
      if (labId) map.set(labId, lab);
    });
    return map;
  }, [laboratories]);

  const getSettledByDisplay = (record) => {
    const directName = (record?.settledByName || '').toString().trim();
    if (directName) return directName;

    const settledById = (record?.settledBy || '').toString().trim();
    const settledByUser = settledById ? usersById.get(settledById) : null;
    const resolvedName = (
      settledByUser?.name ||
      settledByUser?.fullName ||
      settledByUser?.displayName ||
      settledByUser?.email ||
      ''
    )
      .toString()
      .trim();

    if (resolvedName) return resolvedName;

    const recordLabId = (record?.labId || '').toString().trim();
    const lab = recordLabId ? laboratoriesByLabId.get(recordLabId) : null;
    const managerUser = lab?.managerUserId ? usersById.get(lab.managerUserId) : null;
    const managerName = (
      managerUser?.name ||
      managerUser?.fullName ||
      managerUser?.displayName ||
      managerUser?.email ||
      ''
    )
      .toString()
      .trim();

    return managerName || 'Lab In-Charge';
  };

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersRef = ref(database, 'users');
        const snapshot = await get(usersRef);

        if (snapshot.exists()) {
          const usersData = snapshot.val();
          const usersList = Object.keys(usersData).map((key) => ({
            id: key,
            ...usersData[key]
          }));
          setUsers(usersList);
        } else {
          setUsers([]);
        }
      } catch (error) {
        console.error("Error loading users:", error);
      }
    };

    loadUsers();
  }, []);

  useEffect(() => {
    const loadLaboratories = async () => {
      try {
        const laboratoriesRef = ref(database, 'laboratories');
        const snapshot = await get(laboratoriesRef);

        if (snapshot.exists()) {
          const labsData = snapshot.val();
          const labsList = Object.keys(labsData).map((key) => ({
            id: key,
            ...labsData[key]
          }));
          setLaboratories(labsList);
        } else {
          setLaboratories([]);
        }
      } catch (error) {
        console.error('Error loading laboratories:', error);
      }
    };

    loadLaboratories();
  }, []);

  const getCourseSectionDisplay = (borrowerId, fallbackRecord = {}) => {
    const borrowerUser = usersById.get(borrowerId);

    const course = borrowerUser?.course || fallbackRecord.course;
    const yearLevel = borrowerUser?.yearLevel || fallbackRecord.yearLevel;
    const section = borrowerUser?.section || fallbackRecord.section;

    if (course && yearLevel && section) {
      return `${course} ${yearLevel}-${section}`;
    }

    if (course && yearLevel) {
      return `${course} ${yearLevel}`;
    }

    if (fallbackRecord.courseYearSection && fallbackRecord.courseYearSection !== 'N/A') {
      return fallbackRecord.courseYearSection;
    }

    if (section) {
      return section;
    }

    return 'N/A';
  };
  // Load damaged/lost records and restricted borrowers
  useEffect(() => {
    const damagedLostRef = ref(database, 'damaged_lost_records');
    const restrictedUsersRef = ref(database, 'restricted_users');

    const unsubscribeDamagedLost = onValue(damagedLostRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const records = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));

        // Group by borrower and calculate totals for restricted borrowers
        const borrowerGroups = {};
        const settledRecordsList = [];
        
        records.forEach(record => {
          if (record.status === 'Pending') {
            const borrowerId = record.borrowerId;
            if (!borrowerGroups[borrowerId]) {
              borrowerGroups[borrowerId] = {
                borrowerId,
                borrowerName: record.borrowerName,
                emailAddress: record.emailAddress,
                courseYearSection: record.courseYearSection,
                totalDamaged: 0,
                totalLost: 0,
                items: []
              };
            }
            
            if (record.itemStatus === 'Damaged') {
              borrowerGroups[borrowerId].totalDamaged += 1;
            } else if (record.itemStatus === 'Lost') {
              borrowerGroups[borrowerId].totalLost += 1;
            }
            
            borrowerGroups[borrowerId].items.push(record);
          } else if (record.status === 'Settled') {
            settledRecordsList.push(record);
          }
        });

        const restrictedList = Object.values(borrowerGroups);
        setRestrictedBorrowers(restrictedList);
        setSettledRecords(settledRecordsList);
      } else {
        setRestrictedBorrowers([]);
        setSettledRecords([]);
      }
      setLoading(false);
    });

    const unsubscribeRestricted = onValue(restrictedUsersRef, (snapshot) => {
      // This will help keep the data in sync
    });

    return () => {
      unsubscribeDamagedLost();
      unsubscribeRestricted();
    };
  }, []);

  // View borrower details
  const viewBorrowerDetails = async (borrower) => {
    try {
      const damagedLostRef = ref(database, 'damaged_lost_records');
      const snapshot = await get(damagedLostRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        const borrowerRecords = Object.keys(data)
          .map(key => ({
            id: key,
            ...data[key]
          }))
          .filter(record => record.borrowerId === borrower.borrowerId);

        const pendingRecords = borrowerRecords.filter(record => record.status === 'Pending');
        const settledRecords = borrowerRecords.filter(record => record.status === 'Settled');

        setBorrowerDetails({
          ...borrower,
          pendingRecords,
          settledRecords
        });
        setShowDetailsModal(true);
      }
    } catch (error) {
      console.error("Error loading borrower details:", error);
    }
  };

  // Update item status
  const updateItemStatus = async (recordId, newStatus, adminRemarks = '') => {
    try {
      const recordRef = ref(database, `damaged_lost_records/${recordId}`);
      await update(recordRef, {
        status: newStatus,
        adminRemarks,
        settledAt: newStatus === 'Settled' ? new Date().toISOString() : null,
        settledBy: newStatus === 'Settled' ? (user?.uid || 'admin') : null,
        settledByName: newStatus === 'Settled' ? (user?.name || user?.displayName || user?.email || 'Admin') : null
      });

      // Check if all items are settled for this borrower
      const damagedLostRef = ref(database, 'damaged_lost_records');
      const snapshot = await get(damagedLostRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        const borrowerRecords = Object.keys(data)
          .map(key => ({
            id: key,
            ...data[key]
          }))
          .filter(record => 
            record.borrowerId === borrowerDetails.borrowerId && 
            record.status === 'Pending'
          );

        // If no more pending records, remove from restricted list
        if (borrowerRecords.length === 0) {
          const restrictedUserRef = ref(database, `restricted_users/${borrowerDetails.borrowerId}`);
          await remove(restrictedUserRef);
        }
      }

      // Refresh the data
      if (showDetailsModal) {
        viewBorrowerDetails(borrowerDetails);
      }
    } catch (error) {
      console.error("Error updating item status:", error);
    }
  };

  // View settled records for specific borrower
  const viewSettledRecords = async (borrower) => {
    try {
      const borrowerSettledRecords = settledRecords.filter(record => 
        record.borrowerId === borrower.borrowerId
      );
      setSelectedSettledRecords(borrowerSettledRecords);
      setShowSettledModal(true);
    } catch (error) {
      console.error("Error loading settled records:", error);
    }
  };

  // Handle tab switching
  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
  };

  if (loading) {
    return <div className="loading">Loading damaged/lost records...</div>;
  }

  return (
    <div className="damaged-lost-records">
      {/* Header - Welcome Banner Style */}
      <div className="damaged-lost-welcome">
        <div className="welcome-content">
          <h1 className="welcome-title">Damaged / Lost Item Records</h1>
          <p className="welcome-subtitle">Track and manage damaged, lost, and missing laboratory equipment records.</p>
        </div>
      </div>

      {/* Statistics Overview */}
      <div className="stats-overview">
        <div className="stat-card">
          <div className="stat-number">{restrictedBorrowers.length}</div>
          <div className="stat-label">Restricted Borrowers</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{restrictedBorrowers.reduce((sum, b) => sum + b.totalDamaged, 0)}</div>
          <div className="stat-label">Damaged Items</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{restrictedBorrowers.reduce((sum, b) => sum + b.totalLost, 0)}</div>
          <div className="stat-label">Lost Items</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{settledRecords.length}</div>
          <div className="stat-label">Settled Records</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button 
          className={`tab-button ${activeTab === 'restricted' ? 'active' : ''}`}
          onClick={() => handleTabSwitch('restricted')}
        >
          Restricted Borrowers ({restrictedBorrowers.length})
        </button>
        <button 
          className={`tab-button ${activeTab === 'settled' ? 'active' : ''}`}
          onClick={() => handleTabSwitch('settled')}
        >
          Settled Records ({settledRecords.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'restricted' && (
          <div className="restricted-tab">
            {restrictedBorrowers.length === 0 ? (
              <div className="no-records">
                <div className="no-records-icon"></div>
                <h3>No Restricted Borrowers</h3>
                <p>All borrowers have cleared their damaged/lost item records.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="borrowers-table">
                  <thead>
                    <tr>
                      <th>Borrower Information</th>
                      <th>Course/Section</th>
                      <th>Damaged Items</th>
                      <th>Lost Items</th>
                      <th>Total Items</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {restrictedBorrowers.map((borrower) => (
                      <tr key={borrower.borrowerId} className="borrower-row">
                        <td className="borrower-name-cell">
                          <div className="borrower-avatar">
                            {borrower.borrowerName.charAt(0).toUpperCase()}
                          </div>
                          <div className="borrower-name">
                            <strong>{borrower.borrowerName}</strong>
                          </div>
                        </td>
                        <td className="course-cell">
                          <span className="course-badge">
                            {getCourseSectionDisplay(borrower.borrowerId, borrower)}
                          </span>
                        </td>
                        <td className="damaged-cell">
                          <span className="item-count-badge damaged">
                            {borrower.totalDamaged}
                          </span>
                        </td>
                        <td className="lost-cell">
                          <span className="item-count-badge lost">
                            {borrower.totalLost}
                          </span>
                        </td>
                        <td className="total-cell">
                          <span className="total-count">
                            {borrower.totalDamaged + borrower.totalLost}
                          </span>
                        </td>
                        <td className="status-cell">
                          <span className="status-badge restricted">
                            RESTRICTED
                          </span>
                        </td>
                        <td className="actions-cell">
                          <div className="action-buttons">
                            <button 
                              className="btn-action btn-primary"
                              onClick={() => viewBorrowerDetails(borrower)}
                              title="View Details"
                            >
                               View
                            </button>
                            <button 
                              className="btn-action btn-secondary"
                              onClick={() => viewSettledRecords(borrower)}
                              title="View Settled Records"
                            >
                              Settled
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settled' && (
          <div className="settled-tab">
            {settledRecords.length === 0 ? (
              <div className="no-records">
                <div className="no-records-icon">📋</div>
                <h3>No Settled Records</h3>
                <p>No damaged/lost item records have been settled yet.</p>
              </div>
            ) : (
              <>
                <div className="table-container">
                  <table className="borrowers-table settled-table">
                    <thead>
                      <tr>
                        <th>Borrower Information</th>
                        <th>Type of Borrower</th>
                        <th>Course/Section</th>
                        <th>Item Name</th>
                        <th>Status</th>
                        <th>Transaction Date</th>
                        <th>Settled Date</th>
                        <th>Admin Remarks</th>
                        <th>Settled By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settledRecords.slice(0, 15).map((record) => (
                        <tr key={record.id} className="settled-row">
                          <td className="borrower-name-cell">
                            <div className="borrower-avatar">
                              {record.borrowerName.charAt(0).toUpperCase()}
                            </div>
                            <div className="borrower-name">
                              <strong>{record.borrowerName}</strong>
                            </div>
                          </td>
                          <td className="borrower-type-cell">
                            {(() => {
                              const borrowerUser = usersById.get(record.borrowerId);
                              const role = (borrowerUser?.role || borrowerUser?.userType || borrowerUser?.accountType || record.userType || '').toString().toLowerCase();
                              const isInstructor = role === 'instructor' || role === 'teacher';
                              return (
                                <span
                                  className="borrower-type-badge"
                                  data-type={isInstructor ? 'instructor' : 'student'}
                                >
                                  {isInstructor ? 'Instructor' : 'Student'}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="course-cell">
                            <span className="course-badge">
                              {getCourseSectionDisplay(record.borrowerId, record)}
                            </span>
                          </td>
                          <td className="item-name-cell">
                            <span className="item-name">{record.itemName}</span>
                          </td>
                          <td className="status-cell">
                            <span className={`status-badge ${record.itemStatus.toLowerCase()}`}>
                              {record.itemStatus}
                            </span>
                          </td>
                          <td className="transaction-date-cell">
                            <span className="transaction-date">
                              {new Date(record.transactionDate).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="settled-date-cell">
                            <span className="settled-date">
                              {new Date(record.settledAt).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="remarks-cell">
                            <span className="admin-remarks">{record.adminRemarks || 'N/A'}</span>
                          </td>
                          <td className="settled-by-cell">
                            <span className="settled-by">
                              {getSettledByDisplay(record)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {settledRecords.length > 15 && (
                    <div className="show-more">
                      <p>Showing 15 of {settledRecords.length} settled records.</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Borrower Details Modal */}
      {showDetailsModal && borrowerDetails && (
        <div className="modal-overlay">
          <div className="modal-content large">
            <div className="modal-header">
              <h2>Borrower Details - {borrowerDetails.borrowerName}</h2>
              <button 
                className="close-btn"
                onClick={() => setShowDetailsModal(false)}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="borrower-info-section">
                <div className="info-grid">
                  <div className="info-item">
                    <label>Name:</label>
                    <span>{borrowerDetails.borrowerName}</span>
                  </div>
                  <div className="info-item">
                    <label>Email:</label>
                    <span>{borrowerDetails.emailAddress}</span>
                  </div>
                  <div className="info-item">
                    <label>Course/Year/Section:</label>
                    <span>{borrowerDetails.courseYearSection}</span>
                  </div>
                </div>
              </div>

              <div className="records-section">
                <h3>Unsettled Records ({borrowerDetails.pendingRecords.length})</h3>
                <div className="records-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Item Name</th>
                        <th>Status</th>
                        <th>Quantity</th>
                        <th>Transaction Date</th>
                        <th>Description</th>
                        <th>Penalty</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {borrowerDetails.pendingRecords.map((record) => (
                        <tr key={record.id}>
                          <td>{record.itemName}</td>
                          <td>
                            <span className={`status-badge ${record.itemStatus.toLowerCase()}`}>
                              {record.itemStatus}
                            </span>
                          </td>
                          <td>
                            {record.missingQuantity > 0 ? (
                              <span className="quantity-info">
                                {record.returnedQuantity}/{record.borrowedQuantity}
                              </span>
                            ) : (
                              <span className="quantity-normal">
                                {record.borrowedQuantity || 1}
                              </span>
                            )}
                          </td>
                          <td>{new Date(record.transactionDate).toLocaleDateString()}</td>
                          <td>{record.damageDescription || 'N/A'}</td>
                          <td>{record.penalty || 'N/A'}</td>
                          <td>
                            <button 
                              className="btn-success small"
                              onClick={() => updateItemStatus(record.id, 'Settled')}
                            >
                              Mark Settled
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settled Records Modal */}
      {showSettledModal && (
        <div className="modal-overlay">
          <div className="modal-content large">
            <div className="modal-header">
              <h2>Settled Records ({selectedSettledRecords.length})</h2>
              <button 
                className="close-btn"
                onClick={() => setShowSettledModal(false)}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="records-table">
                <table>
                  <thead>
                    <tr>
                      <th>Borrower Name</th>
                      <th>Email</th>
                      <th>Item Name</th>
                      <th>Status</th>
                      <th>Transaction Date</th>
                      <th>Settled Date</th>
                      <th>Admin Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSettledRecords.map((record) => (
                      <tr key={record.id}>
                        <td>{record.borrowerName}</td>
                        <td>{record.emailAddress}</td>
                        <td>{record.itemName}</td>
                        <td>
                          <span className={`status-badge ${record.itemStatus.toLowerCase()}`}>
                            {record.itemStatus}
                          </span>
                        </td>
                        <td>{new Date(record.transactionDate).toLocaleDateString()}</td>
                        <td>{new Date(record.settledAt).toLocaleDateString()}</td>
                        <td>{record.adminRemarks || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
