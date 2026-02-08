// src/components/HistoryPage.jsx
import { useState, useEffect, Fragment } from "react";

import { ref, onValue, get, push } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { exportToPDF, printActivities } from "../utils/pdfUtils";
import "../CSS/HistoryPage.css";
import eyeIcon from '../images/eye.png';

export default function HistoryPage() {
  const { isAdmin, getAssignedLaboratoryIds } = useAuth();
  const [historyData, setHistoryData] = useState([]);
  const [allHistoryEntries, setAllHistoryEntries] = useState([]);
  const [equipmentData, setEquipmentData] = useState([]);
  const [laboratories, setLaboratories] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("All Types");
  const [filterBatch, setFilterBatch] = useState("All");
  const [groupByBatch, setGroupByBatch] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Manual record form state
  const [showManualRecordModal, setShowManualRecordModal] = useState(false);
  const [manualRecordData, setManualRecordData] = useState({
    action: "Released",
    equipmentName: "",
    borrowerType: "student",
    borrowerName: "",
    userId: "",
    adviserName: "",
    status: "Released",
    releasedDate: "",
    returnDate: "",
    condition: "Good",
    quantity: "1",
    batchId: "",
    batchSize: "",
    notes: ""
  });
  const [isSubmittingManualRecord, setIsSubmittingManualRecord] = useState(false);

  // Load laboratories data
  const loadLaboratories = async () => {
    try {
      const laboratoriesRef = ref(database, 'laboratories');
      const snapshot = await get(laboratoriesRef);
      
      if (snapshot.exists()) {
        const laboratoriesData = snapshot.val();
        const laboratoriesList = Object.keys(laboratoriesData).map(key => ({
          id: key,
          ...laboratoriesData[key]
        }));
        setLaboratories(laboratoriesList);
      }
    } catch (error) {
      console.error("Error loading laboratories:", error);
    }
  };

  // Load equipment data for laboratory filtering
  const loadEquipmentData = async () => {
    try {
      const categoriesRef = ref(database, 'equipment_categories');
      const snapshot = await get(categoriesRef);
      
      if (snapshot.exists()) {
        const categoriesData = snapshot.val();
        const allEquipment = [];
        
        // Load equipment from each category
        for (const categoryId in categoriesData) {
          const equipmentsRef = ref(database, `equipment_categories/${categoryId}/equipments`);
          const equipmentsSnapshot = await get(equipmentsRef);
          
          if (equipmentsSnapshot.exists()) {
            const equipmentData = equipmentsSnapshot.val();
            Object.keys(equipmentData).forEach(equipmentId => {
              allEquipment.push({
                id: equipmentId,
                categoryId: categoryId,
                categoryName: categoriesData[categoryId].title,
                ...equipmentData[equipmentId]
              });
            });
          }
        }
        
        setEquipmentData(allEquipment);
      }
    } catch (error) {
      console.error("Error loading equipment data:", error);
    }
  };

  // Load users data to get borrower names
  const loadUsers = async () => {
    try {
      const usersRef = ref(database, 'users');
      const snapshot = await get(usersRef);
      
      if (snapshot.exists()) {
        const usersData = snapshot.val();
        const usersList = Object.keys(usersData).map(key => ({
          id: key,
          ...usersData[key]
        }));
        setUsers(usersList);
      }
    } catch (error) {
      console.error("Error loading users data:", error);
    }
  };

  // Helper function to get borrower name from userId
  const getBorrowerName = (userId) => {
    if (!userId) return "Unknown";
    const user = users.find(u => u.id === userId || u.userId === userId);
    return user?.name || user?.fullName || user?.displayName || user?.email || "Unknown";
  };

  // Load history data from Firebase
  useEffect(() => {
    loadLaboratories();
    loadEquipmentData();
    loadUsers();

    const historyRef = ref(database, 'history');
    const unsubscribe = onValue(historyRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const entries = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));

        entries.sort((a, b) => new Date(b.timestamp || b.returnDate || b.releasedDate || 0) - new Date(a.timestamp || a.returnDate || a.releasedDate || 0));
        setAllHistoryEntries(entries);
      } else {
        setAllHistoryEntries([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (allHistoryEntries.length === 0) {
      setHistoryData([]);
      return;
    }

    let filteredHistory = [...allHistoryEntries];

    if (!isAdmin()) {
      const assignedLabIds = getAssignedLaboratoryIds();
      if (assignedLabIds && assignedLabIds.length > 0) {
        filteredHistory = filteredHistory.filter(entry => {
          if (entry.labRecordId && assignedLabIds.includes(entry.labRecordId)) {
            return true;
          }
          if (entry.labId && assignedLabIds.includes(entry.labId)) {
            return true;
          }

          // Fallback: match via equipment dataset
          const matchingEquipment = equipmentData.find(equipment => 
            equipment.equipmentName === entry.equipmentName ||
            equipment.itemName === entry.equipmentName ||
            equipment.name === entry.equipmentName ||
            equipment.title === entry.equipmentName
          );

          if (matchingEquipment && matchingEquipment.labId) {
            const laboratory = laboratories.find(lab => lab.labId === matchingEquipment.labId);
            if (laboratory) {
              return assignedLabIds.includes(laboratory.id) || assignedLabIds.includes(laboratory.labId);
            }
          }

          return false;
        });
      } else {
        filteredHistory = [];
      }
    }

    setHistoryData(filteredHistory);
  }, [allHistoryEntries, isAdmin, getAssignedLaboratoryIds, equipmentData, laboratories]);

  // Filter and sort history data
  const filteredHistory = historyData.filter(entry => {
    const borrowerName = getBorrowerName(entry.userId);
    const matchesSearch = entry.equipmentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         entry.borrower?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         borrowerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         entry.adviserName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         entry.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         entry.batchId?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === "All Types" || entry.action.includes(filterType);
    const matchesBatch =
      filterBatch === "All" ||
      (filterBatch === "Batch" && entry.batchId) ||
      (filterBatch === "Individual" && !entry.batchId);

    return matchesSearch && matchesType && matchesBatch;
  });

  // Pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredHistory.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);

  const groupedHistory = groupByBatch
    ? (() => {
        const groups = {};
        filteredHistory.forEach((entry) => {
          const key = entry.batchId || "individual";
          if (!groups[key]) {
            groups[key] = {
              batchId: entry.batchId,
              batchSize: entry.batchSize,
              entries: [],
              isBatch: Boolean(entry.batchId),
            };
          }
          groups[key].entries.push(entry);
        });
        return Object.values(groups);
      })()
    : null;

  const hasHistoryToDisplay = groupByBatch
    ? filteredHistory.length > 0
    : currentItems.length > 0;

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const getStatusClass = (status) => {
    switch (status.toLowerCase()) {
      case 'released': return 'status-released';
      case 'returned': return 'status-returned';
      case 'pending': return 'status-pending';
      case 'approved': return 'status-approved';
      case 'rejected': return 'status-rejected';
      default: return 'status-pending';
    }
  };

  const getRequestedQuantity = (entry) => {
    if (!entry) return 'N/A';
    return (
      entry.quantity ??
      entry.details?.originalRequest?.quantity ??
      entry.returnDetails?.requestedQuantity ??
      'N/A'
    );
  };

  const getReturnedQuantity = (entry) => {
    if (!entry) return 'N/A';
    if (entry.returnDetails?.returnedQuantity !== undefined && entry.returnDetails?.returnedQuantity !== null) {
      return entry.returnDetails.returnedQuantity;
    }
    if (entry.returnQuantity !== undefined && entry.returnQuantity !== null) {
      return entry.returnQuantity;
    }
    if ((entry.status || '').toLowerCase() === 'returned') {
      return entry.quantity ?? 'N/A';
    }
    return 'Not returned yet';
  };

  const handleViewDetails = (entry) => {
    setSelectedEntry(entry);
    setShowDetailsModal(true);
  };

  const closeDetailsModal = () => {
    setSelectedEntry(null);
    setShowDetailsModal(false);
  };

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  // Handle manual record form submission
  const handleManualRecordSubmit = async (e) => {
    e.preventDefault();
    setIsSubmittingManualRecord(true);

    try {
      const historyRef = ref(database, 'history');

      const normalizedStatus = (manualRecordData.status || manualRecordData.action || '').toString().trim();
      const normalizedAction = (manualRecordData.action || manualRecordData.status || '').toString().trim();

      const selectedEquipment = equipmentData.find((equipment) => {
        const equipmentName = equipment.equipmentName || equipment.itemName || equipment.name || equipment.title;
        return equipmentName === manualRecordData.equipmentName;
      });

      const normalizeDateTimeLocalToIso = (value) => {
        if (!value) return null;
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.toISOString();
      };

      const resolvedReleasedDate =
        normalizeDateTimeLocalToIso(manualRecordData.releasedDate) || new Date().toISOString();
      const resolvedReturnDate = normalizeDateTimeLocalToIso(manualRecordData.returnDate);

      let resolvedLabId = selectedEquipment?.labId || null;
      const resolvedCategoryId = selectedEquipment?.categoryId || null;
      const resolvedItemId = selectedEquipment?.id || null;

      if (!resolvedLabId && resolvedCategoryId) {
        try {
          const categorySnapshot = await get(ref(database, `equipment_categories/${resolvedCategoryId}`));
          if (categorySnapshot.exists()) {
            const categoryData = categorySnapshot.val() || {};
            resolvedLabId = categoryData.labId || resolvedLabId;
          }
        } catch (error) {
          console.error('Error resolving labId from category:', error);
        }
      }

      let resolvedLabRecordId = null;
      if (resolvedLabId) {
        resolvedLabRecordId = laboratories.find((lab) => lab.labId === resolvedLabId || lab.id === resolvedLabId)?.id || null;
      }

      if (!resolvedLabRecordId && resolvedCategoryId) {
        try {
          const categorySnapshot = await get(ref(database, `equipment_categories/${resolvedCategoryId}`));
          if (categorySnapshot.exists()) {
            const categoryData = categorySnapshot.val() || {};
            resolvedLabRecordId = categoryData.labRecordId || resolvedLabRecordId;
          }
        } catch (error) {
          console.error('Error resolving labRecordId from category:', error);
        }
      }

      const resolvedLabName = resolvedLabRecordId
        ? (laboratories.find((lab) => lab.id === resolvedLabRecordId)?.labName || '')
        : (laboratories.find((lab) => lab.labId === resolvedLabId)?.labName || '');

      const newRecord = {
        action: normalizedAction,
        equipmentName: manualRecordData.equipmentName,
        itemName: manualRecordData.equipmentName,
        itemId: resolvedItemId,
        categoryId: resolvedCategoryId,
        labId: resolvedLabId,
        labRecordId: resolvedLabRecordId,
        laboratory: resolvedLabName,
        borrowerType: manualRecordData.borrowerType,
        borrowerName: manualRecordData.borrowerName,
        userId: manualRecordData.userId || 'manual-entry',
        adviserName: manualRecordData.adviserName,
        status: normalizedStatus,
        releasedDate: resolvedReleasedDate,
        returnDate: resolvedReturnDate,
        condition: manualRecordData.condition,
        quantity: parseInt(manualRecordData.quantity) || 1,
        batchId: manualRecordData.batchId || null,
        batchSize: manualRecordData.batchSize ? parseInt(manualRecordData.batchSize) : null,
        notes: manualRecordData.notes,
        timestamp: new Date().toISOString(),
        isManualEntry: true
      };

      const createdHistoryRef = await push(historyRef, newRecord);
      console.log('[HistoryPage] Manual history record created:', createdHistoryRef.key, newRecord);

      // Manual records are saved only to history, not to borrow_requests

      // Reset form and close modal
      setManualRecordData({
        action: "Released",
        equipmentName: "",
        borrowerType: "student",
        borrowerName: "",
        userId: "",
        adviserName: "",
        status: "Released",
        releasedDate: "",
        returnDate: "",
        condition: "Good",
        quantity: "1",
        batchId: "",
        batchSize: "",
        notes: ""
      });
      setShowManualRecordModal(false);
      alert("Manual record added successfully!");
    } catch (error) {
      console.error("Error adding manual record:", error);
      alert("Failed to add manual record. Please try again.");
    } finally {
      setIsSubmittingManualRecord(false);
    }
  };

  const closeManualRecordModal = () => {
    setShowManualRecordModal(false);
    setManualRecordData({
      action: "Released",
      equipmentName: "",
      borrowerType: "student",
      borrowerName: "",
      userId: "",
      adviserName: "",
      status: "Released",
      releasedDate: "",
      returnDate: "",
      condition: "Good",
      quantity: "1",
      batchId: "",
      batchSize: "",
      notes: ""
    });
  };

  if (loading) {
    return (
      <div className="history-page">
        <div className="loading-container">
          <div className="loading-icon">📊</div>
          <div className="loading-text">Loading history data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="history-page">
      {/* Header - Welcome Banner Style */}
      <div className="history-welcome">
        <div className="welcome-content">
          <h1 className="welcome-title">Equipment Borrowing History</h1>
          <p className="welcome-subtitle">Track and analyze equipment borrowing patterns and request history.</p>
        </div>
        <div className="header-actions">
          <button 
            className="action-button primary-button"
            onClick={() => setShowManualRecordModal(true)}
          >
            ➕ Add Manual Record
          </button>
          <button 
            className="action-button"
            onClick={() => {
              const formatHistory = (history) => {
                return history.map((entry, index) => [
                  index + 1,
                  entry.action || 'N/A',
                  entry.equipmentName || 'N/A',
                  getBorrowerName(entry.userId) || 'N/A',
                  entry.adviserName || 'N/A',
                  entry.status || 'N/A',
                  formatDate(entry.releasedDate) + ' ' + formatTime(entry.releasedDate),
                  entry.returnDate ? (formatDate(entry.returnDate) + ' ' + formatTime(entry.returnDate)) : 'N/A',
                  entry.condition || 'N/A'
                ]);
              };
              exportToPDF(filteredHistory, 'Equipment Borrowing History', formatHistory);
            }}
          >
            📄 Export PDF
          </button>
          <button 
            className="action-button"
            onClick={() => {
              const formatHistory = (history) => {
                return history.map((entry) => ({
                  action: entry.action || 'N/A',
                  equipmentName: entry.equipmentName || 'N/A',
                  borrower: getBorrowerName(entry.userId) || 'N/A',
                  adviserName: entry.adviserName || 'N/A',
                  status: entry.status || 'N/A',
                  releasedDate: formatDate(entry.releasedDate) + ' ' + formatTime(entry.releasedDate),
                  returnDate: entry.returnDate ? (formatDate(entry.returnDate) + ' ' + formatTime(entry.returnDate)) : 'N/A',
                  condition: entry.condition || 'N/A'
                }));
              };
              printActivities(filteredHistory, 'Equipment Borrowing History', formatHistory);
            }}
          >
            🖨️ Print
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-container">
        {/* Search */}
        <div className="search-container">
          <input
            type="text"
            placeholder="Search equipment or batch ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        {/* Type Filter */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="filter-select"
        >
          <option value="All Types">All Types</option>
          <option value="Released">Released</option>
          <option value="Returned">Returned</option>
          <option value="Rejected">Rejected</option>
        </select>

        <select
          value={filterBatch}
          onChange={(e) => setFilterBatch(e.target.value)}
          className="filter-select"
        >
          <option value="All">All Requests</option>
          <option value="Batch">Batch Requests</option>
          <option value="Individual">Individual Requests</option>
        </select>

        <label className="filter-select" style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={groupByBatch}
            onChange={(e) => setGroupByBatch(e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          <span>Group by Batch</span>
        </label>
      </div>

      {/* Table */}
      <div className="table-container">
        {hasHistoryToDisplay ? (
          <>
            <div className="table-wrapper">
              <table className="history-table">
                <thead className="table-header">
                  <tr>
                    <th>Action</th>
                    <th>Equipment Name</th>
                    <th>Borrower Name</th>
                    <th>Instructor Name</th>
                    <th>Status</th>
                    <th>Released Date</th>
                    <th>Return Date</th>
                    <th>Condition</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {groupByBatch && groupedHistory
                    ? groupedHistory.map((group) => (
                        <Fragment key={group.batchId || "individual"}>
                          {group.isBatch && (
                            <tr
                              className="batch-header-row"
                              style={{ backgroundColor: "#f0f9ff", fontWeight: "bold" }}
                            >
                              <td colSpan="9" style={{ padding: "12px" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: "12px",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
                                    <span
                                      style={{
                                        backgroundColor: "#3b82f6",
                                        color: "white",
                                        padding: "4px 12px",
                                        borderRadius: "999px",
                                        fontSize: "12px",
                                      }}
                                    >
                                      Batch of {group.batchSize || group.entries.length} items
                                    </span>
                                    <span
                                      style={{
                                        fontFamily: "monospace",
                                        color: "#1e40af",
                                        fontSize: "12px",
                                      }}
                                    >
                                      Batch ID: {group.batchId}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: "12px", color: "#6b7280" }}>
                                    Showing {group.entries.length} entr{group.entries.length === 1 ? "y" : "ies"}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )}
                          {group.entries.map((entry) => (
                            <tr key={entry.id}>
                              <td className="table-cell">{entry.action}</td>
                              <td className="table-cell equipment-name">{entry.equipmentName}</td>
                              <td className="table-cell">{getBorrowerName(entry.userId)}</td>
                              <td className="table-cell">{entry.adviserName || "Unknown"}</td>
                              <td className="table-cell">
                                <span className={`status-badge ${getStatusClass(entry.status)}`}>
                                  {entry.status}
                                </span>
                              </td>
                              <td className="table-cell date-cell">
                                <div>{formatDate(entry.releasedDate)}</div>
                                <div className="date-time">{formatTime(entry.releasedDate)}</div>
                              </td>
                              <td className="table-cell date-cell">
                                {entry.returnDate ? (
                                  <>
                                    <div>{formatDate(entry.returnDate)}</div>
                                    <div className="date-time">{formatTime(entry.returnDate)}</div>
                                  </>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="table-cell date-cell">{entry.condition}</td>
                              <td className="table-cell">
                                <button
                                  onClick={() => handleViewDetails(entry)}
                                  className="view-button"
                                  title="View Details"
                                >
                                   <img src={eyeIcon} alt="View" style={{ width: '18px', height: '18px' }} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      ))
                    : currentItems.map((entry) => (
                        <tr key={entry.id}>
                          <td className="table-cell">{entry.action}</td>
                          <td className="table-cell equipment-name">{entry.equipmentName}</td>
                          <td className="table-cell">{getBorrowerName(entry.userId)}</td>
                          <td className="table-cell">{entry.adviserName || "Unknown"}</td>
                          <td className="table-cell">
                            <span className={`status-badge ${getStatusClass(entry.status)}`}>
                              {entry.status}
                            </span>
                          </td>
                          <td className="table-cell date-cell">
                            <div>{formatDate(entry.releasedDate)}</div>
                            <div className="date-time">{formatTime(entry.releasedDate)}</div>
                          </td>
                          <td className="table-cell date-cell">
                            {entry.returnDate ? (
                              <>
                                <div>{formatDate(entry.returnDate)}</div>
                                <div className="date-time">{formatTime(entry.returnDate)}</div>
                              </>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="table-cell date-cell">{entry.condition}</td>
                          <td className="table-cell">
                            <button
                              onClick={() => handleViewDetails(entry)}
                              className="view-button"
                              title="View Details"
                            >
                               <img src={eyeIcon} alt="View" style={{ width: '18px', height: '18px' }} />
                            </button>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!groupByBatch && (
              <div className="pagination-container">
                <div className="pagination-info">
                  Showing <strong>{filteredHistory.length === 0 ? 0 : indexOfFirstItem + 1}</strong> to <strong>{Math.min(indexOfLastItem, filteredHistory.length)}</strong> of <strong>{filteredHistory.length}</strong> entries
                </div>

                <div className="pagination-controls">
                  <button
                    onClick={() => paginate(1)}
                    disabled={currentPage === 1}
                    className="pagination-arrow"
                    aria-label="First page"
                  >
                    «
                  </button>
                  <button
                    onClick={() => paginate(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="pagination-arrow"
                    aria-label="Previous page"
                  >
                    ‹
                  </button>

                  <div className="pagination-pages">
                    {(() => {
                      const pages = [];
                      if (totalPages === 0) return pages;
                      let start = Math.max(1, currentPage - 1);
                      let end = Math.min(totalPages, start + 2);
                      if (end - start < 2) {
                        start = Math.max(1, end - 2);
                      }
                      for (let page = start; page <= end; page += 1) {
                        pages.push(
                          <button
                            key={page}
                            onClick={() => paginate(page)}
                            className={`pagination-page ${currentPage === page ? 'active' : ''}`}
                          >
                            {page}
                          </button>
                        );
                      }
                      return pages;
                    })()}
                  </div>

                  <button
                    onClick={() => paginate(currentPage + 1)}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="pagination-arrow"
                    aria-label="Next page"
                  >
                    ›
                  </button>
                  <button
                    onClick={() => paginate(totalPages || 1)}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="pagination-arrow"
                    aria-label="Last page"
                  >
                    »
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <h3 className="empty-title">No History Found</h3>
            <p className="empty-message">
              {searchTerm || filterType !== "All Types"
                ? "No activities match your current filters."
                : "No borrowing activities have been recorded yet."
              }
            </p>
          </div>
        )}
      </div>

      {/* Enhanced Details Modal with Tabs */}
      {showDetailsModal && selectedEntry && (
        <div className="modal-overlay" onClick={closeDetailsModal}>
          <div className="modal-content enhanced-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Equipment Details - {selectedEntry.equipmentName}</h2>
              <button onClick={closeDetailsModal} className="modal-close">×</button>
            </div>
            
            <div className="modal-body">
              <div className="tab-content">
                  <div className="modal-details">
                    <div className="detail-item">
                      <div className="detail-label">Action:</div>
                      <div className="detail-value">{selectedEntry.action}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Equipment:</div>
                      <div className="detail-value">{selectedEntry.equipmentName}</div>
                    </div>
                    {selectedEntry.batchId && (
                      <>
                        <div className="detail-item">
                          <div className="detail-label">Batch ID:</div>
                          <div className="detail-value" style={{ fontFamily: "monospace" }}>{selectedEntry.batchId}</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Batch Size:</div>
                          <div className="detail-value">{selectedEntry.batchSize || 'N/A'}</div>
                        </div>
                      </>
                    )}
                    <div className="detail-item">
                      <div className="detail-label">Borrower Name:</div>
                      <div className="detail-value highlight-text">{getBorrowerName(selectedEntry.userId)}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Instructor Name:</div>
                      <div className="detail-value highlight-text">{selectedEntry.adviserName || "Unknown"}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Requested Quantity:</div>
                      <div className="detail-value">{getRequestedQuantity(selectedEntry)}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Returned Quantity:</div>
                      <div className="detail-value">{getReturnedQuantity(selectedEntry)}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Status:</div>
                      <div className="detail-value">
                        <span className={`status-badge ${getStatusClass(selectedEntry.status)}`}>
                          {selectedEntry.status}
                        </span>
                      </div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Condition:</div>
                      <div className="detail-value">{selectedEntry.condition}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Released Date:</div>
                      <div className="detail-value">
                        {formatDate(selectedEntry.releasedDate)} at {formatTime(selectedEntry.releasedDate)}
                      </div>
                    </div>
                    {selectedEntry.returnDate && (
                      <div className="detail-item">
                        <div className="detail-label">Return Date:</div>
                        <div className="detail-value">
                          {formatDate(selectedEntry.returnDate)} at {formatTime(selectedEntry.returnDate)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )

            </div>

            <div className="modal-footer">
              <button onClick={closeDetailsModal} className="close-button">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Record Modal */}
      {showManualRecordModal && (
        <div className="modal-overlay" onClick={closeManualRecordModal}>
          <div className="modal-content manual-record-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Manual Record</h2>
              <button onClick={closeManualRecordModal} className="modal-close">×</button>
            </div>
            
            <form onSubmit={handleManualRecordSubmit} className="manual-record-form">
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="action">Action *</label>
                    <select
                      id="action"
                      value={manualRecordData.action}
                      onChange={(e) => setManualRecordData({...manualRecordData, action: e.target.value})}
                      required
                    >
                      <option value="Released">Released</option>
                      <option value="Returned">Returned</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="status">Status *</label>
                    <select
                      id="status"
                      value={manualRecordData.status}
                      onChange={(e) => setManualRecordData({...manualRecordData, status: e.target.value})}
                      required
                    >
                      <option value="Released">Released</option>
                      <option value="Returned">Returned</option>
                      <option value="Pending">Pending</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>

                  <div className="form-group full-width">
                    <label htmlFor="equipmentName">Equipment Name *</label>
                    <select
                      id="equipmentName"
                      value={manualRecordData.equipmentName}
                      onChange={(e) => setManualRecordData({...manualRecordData, equipmentName: e.target.value})}
                      required
                    >
                      <option value="">Select equipment...</option>
                      {equipmentData
                        .filter((equipment) => {
                          // If admin, show all equipment
                          if (isAdmin()) return true;
                          
                          // For lab managers, filter by assigned laboratories
                          const assignedLabIds = getAssignedLaboratoryIds();
                          if (!assignedLabIds || assignedLabIds.length === 0) return false;
                          
                          // Check if equipment belongs to an assigned laboratory
                          const equipmentLab = laboratories.find(lab => 
                            lab.labId === equipment.labId || 
                            lab.id === equipment.labRecordId ||
                            lab.labId === equipment.labRecordId ||
                            lab.id === equipment.labId
                          );
                          
                          return equipmentLab && assignedLabIds.includes(equipmentLab.id);
                        })
                        .map((equipment) => (
                          <option key={equipment.id} value={equipment.equipmentName || equipment.itemName || equipment.name || equipment.title}>
                            {equipment.equipmentName || equipment.itemName || equipment.name || equipment.title} ({equipment.categoryName})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="borrowerType">Borrower Type *</label>
                    <select
                      id="borrowerType"
                      value={manualRecordData.borrowerType}
                      onChange={(e) => setManualRecordData({...manualRecordData, borrowerType: e.target.value, borrowerName: "", userId: ""})}
                      required
                    >
                      <option value="student">Student</option>
                      <option value="instructor">Instructor</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="borrowerName">Borrower Name *</label>
                    <select
                      id="borrowerName"
                      value={manualRecordData.borrowerName}
                      onChange={(e) => {
                        const selectedUser = users.find(u => (u.name || u.fullName || u.displayName || u.email) === e.target.value);
                        setManualRecordData({
                          ...manualRecordData, 
                          borrowerName: e.target.value,
                          userId: selectedUser?.id || selectedUser?.userId || e.target.value
                        });
                      }}
                      required
                    >
                      <option value="">Select {manualRecordData.borrowerType}...</option>
                      {users
                        .filter(u => {
                          const role = u.role?.toLowerCase() || '';
                          if (manualRecordData.borrowerType === 'student') {
                            return role === 'student';
                          } else {
                            return role === 'instructor' || role === 'teacher' || role === 'faculty';
                          }
                        })
                        .map((user) => (
                          <option key={user.id} value={user.name || user.fullName || user.displayName || user.email}>
                            {user.name || user.fullName || user.displayName || user.email}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="adviserName">Instructor/Adviser Name</label>
                    <select
                      id="adviserName"
                      value={manualRecordData.adviserName}
                      onChange={(e) => setManualRecordData({...manualRecordData, adviserName: e.target.value})}
                    >
                      <option value="">Select instructor...</option>
                      {users
                        .filter(u => {
                          const role = u.role?.toLowerCase() || '';
                          return role === 'instructor' || role === 'teacher' || role === 'faculty';
                        })
                        .map((user) => (
                          <option key={user.id} value={user.name || user.fullName || user.displayName || user.email}>
                            {user.name || user.fullName || user.displayName || user.email}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="quantity">Quantity *</label>
                    <input
                      type="number"
                      id="quantity"
                      min="1"
                      value={manualRecordData.quantity}
                      onChange={(e) => setManualRecordData({...manualRecordData, quantity: e.target.value})}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="condition">Condition *</label>
                    <select
                      id="condition"
                      value={manualRecordData.condition}
                      onChange={(e) => setManualRecordData({...manualRecordData, condition: e.target.value})}
                      required
                    >
                      <option value="Good">Good</option>
                      <option value="Fair">Fair</option>
                      <option value="Poor">Poor</option>
                      <option value="Damaged">Damaged</option>
                      <option value="Lost">Lost</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="releasedDate">Released Date *</label>
                    <input
                      type="datetime-local"
                      id="releasedDate"
                      value={manualRecordData.releasedDate}
                      onChange={(e) => setManualRecordData({...manualRecordData, releasedDate: e.target.value})}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="returnDate">Return Date</label>
                    <input
                      type="datetime-local"
                      id="returnDate"
                      value={manualRecordData.returnDate}
                      onChange={(e) => setManualRecordData({...manualRecordData, returnDate: e.target.value})}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="batchId">Batch ID (optional)</label>
                    <input
                      type="text"
                      id="batchId"
                      value={manualRecordData.batchId}
                      onChange={(e) => setManualRecordData({...manualRecordData, batchId: e.target.value})}
                      placeholder="Enter batch ID if applicable"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="batchSize">Batch Size (optional)</label>
                    <input
                      type="number"
                      id="batchSize"
                      min="1"
                      value={manualRecordData.batchSize}
                      onChange={(e) => setManualRecordData({...manualRecordData, batchSize: e.target.value})}
                      placeholder="Number of items in batch"
                    />
                  </div>

                  <div className="form-group full-width">
                    <label htmlFor="notes">Notes</label>
                    <textarea
                      id="notes"
                      rows="3"
                      value={manualRecordData.notes}
                      onChange={(e) => setManualRecordData({...manualRecordData, notes: e.target.value})}
                      placeholder="Additional notes about this record..."
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={closeManualRecordModal} className="cancel-button">
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="submit-button"
                  disabled={isSubmittingManualRecord}
                >
                  {isSubmittingManualRecord ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}