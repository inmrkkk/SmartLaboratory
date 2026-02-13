// src/components/EquipmentMaintenance.jsx
import React, { useState, useEffect } from "react";
import { ref, push, onValue, remove, update } from "firebase/database";
import { database } from "../../firebase";
import ToastNotification from "../ToastNotification";

export default function EquipmentMaintenance({ categories, equipments, selectedCategory, onMaintenanceComplete }) {
  const [maintenanceRecords, setMaintenanceRecords] = useState([]);
  const [scheduledMaintenance, setScheduledMaintenance] = useState([]);
  const [showAddMaintenanceForm, setShowAddMaintenanceForm] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState(null);
  const [completingScheduleId, setCompletingScheduleId] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
  };

  const [activeSubTab, setActiveSubTab] = useState("records");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [maintenanceFormData, setMaintenanceFormData] = useState({
    equipmentId: "",
    type: "Preventive",
    description: "",
    datePerformed: ""
  });

  const [scheduleFormData, setScheduleFormData] = useState({
    equipmentId: "",
    type: "Preventive",
    description: "",
    scheduledDate: "",
    notes: ""
  });

  // Fetch maintenance records when category changes
  useEffect(() => {
    const fetchMaintenanceRecords = () => {
      if (!selectedCategory) return;
      
      try {
        const maintenanceRef = ref(database, `equipment_categories/${selectedCategory}/maintenance_records`);
        
        onValue(maintenanceRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            const recordsList = Object.keys(data).map(key => ({
              id: key,
              ...data[key]
            })).sort((a, b) => new Date(b.datePerformed || b.createdAt) - new Date(a.datePerformed || a.createdAt));
            setMaintenanceRecords(recordsList);
          } else {
            setMaintenanceRecords([]);
          }
        });
      } catch (error) {
        console.error("Error fetching maintenance records:", error);
      }
    };

    const fetchScheduledMaintenance = () => {
      if (!selectedCategory) return;
      
      try {
        const scheduleRef = ref(database, `equipment_categories/${selectedCategory}/scheduled_maintenance`);
        
        onValue(scheduleRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            const scheduleList = Object.keys(data).map(key => ({
              id: key,
              ...data[key]
            })).sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
            setScheduledMaintenance(scheduleList);
          } else {
            setScheduledMaintenance([]);
          }
        });
      } catch (error) {
        console.error("Error fetching scheduled maintenance:", error);
      }
    };

    if (selectedCategory) {
      fetchMaintenanceRecords();
      fetchScheduledMaintenance();
    } else {
      setMaintenanceRecords([]);
      setScheduledMaintenance([]);
    }
  }, [selectedCategory]);

  const handleMaintenanceInputChange = (e) => {
    const { name, value } = e.target;
    setMaintenanceFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleScheduleInputChange = (e) => {
    const { name, value } = e.target;
    setScheduleFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleMaintenanceSubmit = async (e) => {
    e.preventDefault();
    
    if (!maintenanceFormData.equipmentId || !maintenanceFormData.description.trim()) {
      showToast("Please select equipment and enter description", "warning");
      return;
    }

    try {
      const maintenanceData = {
        ...maintenanceFormData,
        categoryId: selectedCategory,
        status: "Completed"
      };

      if (editingMaintenance) {
        const maintenanceRef = ref(database, `equipment_categories/${selectedCategory}/maintenance_records/${editingMaintenance.id}`);
        await update(maintenanceRef, {
          ...maintenanceData,
          updatedAt: new Date().toISOString()
        });
        showToast("Maintenance record updated successfully!");
      } else {
        const maintenanceRef = ref(database, `equipment_categories/${selectedCategory}/maintenance_records`);
        await push(maintenanceRef, {
          ...maintenanceData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        
        // Update equipment's last maintenance date
        if (maintenanceFormData.datePerformed) {
          const equipmentRef = ref(database, `equipment_categories/${selectedCategory}/equipments/${maintenanceFormData.equipmentId}`);
          await update(equipmentRef, {
            lastMaintenanceDate: maintenanceFormData.datePerformed
          });
        }
        
        showToast("Maintenance record added successfully!");
        
        // Notify parent component that maintenance is complete
        if (onMaintenanceComplete) {
          onMaintenanceComplete();
        }
      }

      // If this maintenance was created from a scheduled maintenance, permanently remove that schedule entry
      if (completingScheduleId) {
        try {
          const scheduleRef = ref(database, `equipment_categories/${selectedCategory}/scheduled_maintenance/${completingScheduleId}`);
          await remove(scheduleRef);
        } catch (scheduleError) {
          console.error("Error deleting related scheduled maintenance:", scheduleError);
        } finally {
          setCompletingScheduleId(null);
        }
      }
      
      resetMaintenanceForm();
    } catch (error) {
      console.error("Error saving maintenance record:", error);
      showToast("Error saving maintenance record. Please try again.", "error");
    }
  };

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    
    if (!scheduleFormData.equipmentId || !scheduleFormData.description.trim() || !scheduleFormData.scheduledDate) {
      showToast("Please fill in required fields", "warning");
      return;
    }

    try {
      const scheduleData = {
        ...scheduleFormData,
        categoryId: selectedCategory,
        status: "Scheduled"
      };

      const scheduleRef = ref(database, `equipment_categories/${selectedCategory}/scheduled_maintenance`);
      await push(scheduleRef, {
        ...scheduleData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      showToast("Maintenance scheduled successfully!");
      resetScheduleForm();
    } catch (error) {
      console.error("Error scheduling maintenance:", error);
      showToast("Error scheduling maintenance. Please try again.", "error");
    }
  };

  const handleEditMaintenance = (record) => {
    setEditingMaintenance(record);
    setMaintenanceFormData({
      equipmentId: record.equipmentId || "",
      type: record.type || "Preventive",
      description: record.description || "",
      datePerformed: record.datePerformed || ""
    });
    setShowAddMaintenanceForm(true);
  };

  const handleDeleteMaintenance = async (recordId) => {
    if (window.confirm("Are you sure you want to delete this maintenance record?")) {
      try {
        const maintenanceRef = ref(database, `equipment_categories/${selectedCategory}/maintenance_records/${recordId}`);
        await remove(maintenanceRef);
        showToast("Maintenance record deleted successfully!");
      } catch (error) {
        console.error("Error deleting maintenance record:", error);
        showToast("Error deleting maintenance record. Please try again.", "error");
      }
    }
  };

  const handleDeleteScheduled = async (scheduleId) => {
    if (window.confirm("Are you sure you want to delete this scheduled maintenance?")) {
      try {
        const scheduleRef = ref(database, `equipment_categories/${selectedCategory}/scheduled_maintenance/${scheduleId}`);
        await remove(scheduleRef);
        showToast("Scheduled maintenance deleted successfully!");
      } catch (error) {
        console.error("Error deleting scheduled maintenance:", error);
        showToast("Error deleting scheduled maintenance. Please try again.", "error");
      }
    }
  };

  const completeScheduledMaintenance = (scheduledItem) => {
    setMaintenanceFormData({
      equipmentId: scheduledItem.equipmentId,
      type: scheduledItem.type,
      description: scheduledItem.description,
      datePerformed: new Date().toISOString().split('T')[0]
    });
    setCompletingScheduleId(scheduledItem.id || null);
    setShowAddMaintenanceForm(true);
  };

  const resetMaintenanceForm = () => {
    setMaintenanceFormData({
      equipmentId: "",
      type: "Preventive",
      description: "",
      datePerformed: ""
    });
    setShowAddMaintenanceForm(false);
    setEditingMaintenance(null);
    setCompletingScheduleId(null);
  };

  const resetScheduleForm = () => {
    setScheduleFormData({
      equipmentId: "",
      type: "Preventive",
      description: "",
      scheduledDate: "",
      notes: ""
    });
    setShowScheduleForm(false);
  };

  const getEquipmentName = (equipmentId) => {
    const equipment = equipments.find(eq => eq.id === equipmentId);
    return equipment ? `${equipment.name} (${equipment.serialNumber})` : "Unknown Equipment";
  };

  const getMaintenanceTypeColor = (type) => {
    switch (type) {
      case "Preventive": return "#10b981";
      case "Corrective": return "#f59e0b";
      case "Emergency": return "#ef4444";
      case "Calibration": return "#8b5cf6";
      default: return "#6b7280";
    }
  };

  const isMaintenanceOverdue = (scheduledDate) => {
    return new Date(scheduledDate) < new Date();
  };

  // Filter maintenance records
  const filteredMaintenanceRecords = maintenanceRecords.filter(record => {
    const matchesSearch = !searchTerm || 
      getEquipmentName(record.equipmentId).toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === "all" || record.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const handleExportMaintenanceToPDF = () => {
    if (filteredMaintenanceRecords.length === 0) {
      showToast("No maintenance records to export", "warning");
      return;
    }

    const title = "Equipment Maintenance Records";
    const dateStr = new Date().toLocaleString();

    const rowsHtml = filteredMaintenanceRecords.map((record, index) => {
      const equipmentName = getEquipmentName(record.equipmentId);
      const datePerformed = record.datePerformed || "—";
      const status = record.status || "Completed";
      const type = record.type || "Preventive";

      return `
        <tr>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${index + 1}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${equipmentName}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${type}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${status}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${datePerformed}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${record.description || ""}</td>
        </tr>
      `;
    }).join("");

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charSet="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          p { font-size: 12px; color: #6b7280; margin-top: 0; margin-bottom: 16px; }
          table { border-collapse: collapse; width: 100%; }
          thead { background-color: #f3f4f6; }
          th { text-align: left; padding: 8px; border: 1px solid #e5e7eb; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p>Generated on ${dateStr}</p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Equipment</th>
              <th>Type</th>
              <th>Status</th>
              <th>Date</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showToast("Unable to open print window. Please allow pop-ups and try again.", "warning");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  // Filter scheduled maintenance - exclude completed items
  const filteredScheduledMaintenance = scheduledMaintenance.filter(schedule => {
    // Check if this scheduled maintenance has been completed
    const isCompleted = maintenanceRecords.some(record => 
      record.equipmentId === schedule.equipmentId &&
      record.description === schedule.description &&
      record.type === schedule.type &&
      record.status === "Completed"
    );
    
    // Exclude completed maintenance from scheduled/upcoming lists
    if (isCompleted) return false;
    
    const matchesSearch = !searchTerm || 
      getEquipmentName(schedule.equipmentId).toLowerCase().includes(searchTerm.toLowerCase()) ||
      schedule.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const scheduledForToday = filteredScheduledMaintenance.filter(item => {
    if (!item.scheduledDate) return false;
    const scheduledDate = new Date(item.scheduledDate);
    const userTimezoneOffset = scheduledDate.getTimezoneOffset() * 60000;
    const localScheduledDate = new Date(scheduledDate.getTime() + userTimezoneOffset);
    localScheduledDate.setHours(0,0,0,0);
    return localScheduledDate.getTime() === today.getTime();
  });

  const upcomingMaintenance = filteredScheduledMaintenance.filter(item => {
    if (!item.scheduledDate) return false;
    const scheduledDate = new Date(item.scheduledDate);
    const userTimezoneOffset = scheduledDate.getTimezoneOffset() * 60000;
    const localScheduledDate = new Date(scheduledDate.getTime() + userTimezoneOffset);
    localScheduledDate.setHours(0,0,0,0);
    return localScheduledDate.getTime() > today.getTime();
  });

  const renderScheduledItems = (items, emptyState) => {
    if (items.length === 0) {
      return emptyState;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {items.map((schedule) => (
            <div 
              key={schedule.id} 
              style={{
                background: 'white',
                border: isMaintenanceOverdue(schedule.scheduledDate) ? '1px solid #ef4444' : '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '1.5rem',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', margin: '0 0 0.25rem 0' }}>
                    {getEquipmentName(schedule.equipmentId)}
                  </h3>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0' }}>{schedule.description}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    backgroundColor: getMaintenanceTypeColor(schedule.type) + "20",
                    color: getMaintenanceTypeColor(schedule.type)
                  }}>
                    {schedule.type}
                  </span>
                  {isMaintenanceOverdue(schedule.scheduledDate) && (
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '20px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      backgroundColor: '#fef2f2',
                      color: '#dc2626'
                    }}>
                      OVERDUE
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Scheduled Date:</span>
                  <div style={{ fontSize: '0.875rem', color: '#111827', fontWeight: '500' }}>{schedule.scheduledDate}</div>
                </div>
                {schedule.notes && (
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Notes:</span>
                    <div style={{ fontSize: '0.875rem', color: '#111827', fontWeight: '500' }}>{schedule.notes}</div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #f3f4f6' }}>
                <button
                  onClick={() => completeScheduledMaintenance(schedule)}
                  className="btn btn-success btn-sm"
                >
                  Mark Complete
                </button>
                <button
                  onClick={() => handleDeleteScheduled(schedule.id)}
                  className="btn btn-danger btn-sm"
                >
                  Delete
                </button>
              </div>
            </div>
        ))}
      </div>
    );
  };

  if (!selectedCategory) {
    return (
      <div className="tab-content">
        <div className="empty-state">
          <div className="empty-icon">🔧</div>
          <h3 className="empty-title">Select a Category</h3>
          <p className="empty-message">Please select a category from individual equipment first to view related details.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-content">
      <div className="section-header">
        <h2 className="section-title">Equipment Maintenance</h2>
        <div className="section-header-right">
          <button
            onClick={() => setShowScheduleForm(true)}
            className="btn btn-outline"
          >
            <span className="btn-icon">+</span>
            Schedule Maintenance
          </button>
          <button
            onClick={() => setShowAddMaintenanceForm(true)}
            className="btn btn-primary"
          >
            <span className="btn-icon">+</span>
            Add Maintenance Record
          </button>
        </div>
      </div>

      {/* Maintenance Sub-tabs */}
      <div className="nav-tabs">
        <button
          onClick={() => setActiveSubTab("records")}
          className={`nav-tab ${activeSubTab === "records" ? "active" : ""}`}
        >
          <span className="nav-tab-icon"></span>
          Maintenance Records ({maintenanceRecords.length})
        </button>
        <button
          onClick={() => setActiveSubTab("scheduled")}
          className={`nav-tab ${activeSubTab === "scheduled" ? "active" : ""}`}
        >
          <span className="nav-tab-icon"></span>
          Scheduled Maintenance ({scheduledForToday.length})
        </button>
        <button
          onClick={() => setActiveSubTab("upcoming")}
          className={`nav-tab ${activeSubTab === "upcoming" ? "active" : ""}`}
        >
          <span className="nav-tab-icon"></span>
          Upcoming ({upcomingMaintenance.length})
        </button>
      </div>

      {/* Filters and Search */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search maintenance records..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '300px',
              padding: '0.75rem 1rem 0.75rem 2.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '0.875rem'
            }}
          />
          <span style={{
            position: 'absolute',
            left: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#9ca3af'
          }}></span>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {activeSubTab === "records" && (
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            >
              <option value="all">All Status</option>
              <option value="Completed">Completed</option>
              <option value="In Progress">In Progress</option>
              <option value="Pending">Pending</option>
            </select>
          )}
          {activeSubTab === "records" && (
            <button
              type="button"
              onClick={handleExportMaintenanceToPDF}
              className="btn btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <span className="btn-icon">🧾</span>
              Export to PDF
            </button>
          )}
        </div>
      </div>

      {/* Maintenance Records Tab */}
      {activeSubTab === "records" && (
        <div>
          {filteredMaintenanceRecords.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔧</div>
              <h3 className="empty-title">No maintenance records found</h3>
              <p className="empty-message">
                {searchTerm ? "Try adjusting your search or filters." : "Start by adding your first maintenance record."}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {filteredMaintenanceRecords.map((record) => (
                <div key={record.id} style={{
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', margin: '0 0 0.25rem 0' }}>
                        {getEquipmentName(record.equipmentId)}
                      </h3>
                      <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0' }}>{record.description}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '20px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        backgroundColor: getMaintenanceTypeColor(record.type) + "20",
                        color: getMaintenanceTypeColor(record.type)
                      }}>
                        {record.type}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Date:</span>
                      <div style={{ fontSize: '0.875rem', color: '#111827', fontWeight: '500' }}>{record.datePerformed || "—"}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Status:</span>
                      <div style={{ fontSize: '0.875rem', color: '#111827', fontWeight: '500' }}>{record.status || "Completed"}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #f3f4f6' }}>
                    <button
                      onClick={() => handleEditMaintenance(record)}
                      className="btn btn-outline btn-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteMaintenance(record.id)}
                      className="btn btn-danger btn-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scheduled Maintenance Tab */}
      {activeSubTab === "scheduled" && renderScheduledItems(
        scheduledForToday,
        <div className="empty-state">
          <div className="empty-icon">📅</div>
          <h3 className="empty-title">No maintenance scheduled for today</h3>
          <p className="empty-message">Schedule maintenance to keep your equipment in optimal condition.</p>
        </div>
      )}

      {/* Upcoming Maintenance Tab */}
      {activeSubTab === "upcoming" && renderScheduledItems(
        upcomingMaintenance,
        <div className="empty-state">
          <div className="empty-icon">⚠️</div>
          <h3 className="empty-title">No upcoming maintenance</h3>
          <p className="empty-message">All maintenance is up to date.</p>
        </div>
      )}

      {/* Add/Edit Maintenance Modal - New Simplified Form */}
      {showAddMaintenanceForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            {/* Header */}
            <div style={{
              padding: '1.5rem 1.5rem 1rem 1.5rem',
              borderBottom: '1px solid #f3f4f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                color: '#111827',
                margin: 0
              }}>
                {editingMaintenance ? "Edit Maintenance" : "Add Maintenance"}
              </h2>
              <button
                onClick={resetMaintenanceForm}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>

            {/* Form Content */}
            <div style={{
              padding: '1.5rem',
              maxHeight: 'calc(90vh - 120px)',
              overflowY: 'auto'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Equipment Selection */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    Equipment
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select
                      name="equipmentId"
                      value={maintenanceFormData.equipmentId}
                      onChange={handleMaintenanceInputChange}
                      required
                      style={{
                        width: '100%',
                        padding: '0.875rem 1rem',
                        fontSize: '1rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        backgroundColor: '#f9fafb',
                        color: maintenanceFormData.equipmentId ? '#111827' : '#9ca3af',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                        backgroundPosition: 'right 0.5rem center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '1.5em 1.5em',
                        paddingRight: '2.5rem'
                      }}
                    >
                      <option value="">Select Equipment</option>
                      {equipments.map((equipment) => (
                        <option key={equipment.id} value={equipment.id}>
                          {equipment.name} ({equipment.serialNumber})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Maintenance Type */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    Maintenance Type
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select
                      name="type"
                      value={maintenanceFormData.type}
                      onChange={handleMaintenanceInputChange}
                      style={{
                        width: '100%',
                        padding: '0.875rem 1rem',
                        fontSize: '1rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        backgroundColor: '#f9fafb',
                        color: '#111827',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                        backgroundPosition: 'right 0.5rem center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '1.5em 1.5em',
                        paddingRight: '2.5rem'
                      }}
                    >
                      <option value="Preventive">Preventive</option>
                      <option value="Corrective">Corrective</option>
                      <option value="Emergency">Emergency</option>
                      <option value="Calibration">Calibration</option>
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={maintenanceFormData.description}
                    onChange={handleMaintenanceInputChange}
                    placeholder="Enter maintenance details"
                    required
                    rows="4"
                    style={{
                      width: '100%',
                      padding: '0.875rem 1rem',
                      fontSize: '1rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      backgroundColor: '#f9fafb',
                      color: '#111827',
                      resize: 'vertical',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                {/* Date */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    Date
                  </label>
                  <input
                    type="date"
                    name="datePerformed"
                    value={maintenanceFormData.datePerformed}
                    onChange={handleMaintenanceInputChange}
                    style={{
                      width: '100%',
                      padding: '0.875rem 1rem',
                      fontSize: '1rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      backgroundColor: '#f9fafb',
                      color: maintenanceFormData.datePerformed ? '#111827' : '#9ca3af'
                    }}
                  />
                </div>

                {/* Submit Button */}
                <div style={{ paddingTop: '1rem' }}>
                  <button
                    onClick={handleMaintenanceSubmit}
                    style={{
                      width: '100%',
                      backgroundColor: '#10b981',
                      color: 'white',
                      padding: '0.875rem 1rem',
                      fontSize: '1rem',
                      fontWeight: '600',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#059669'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#10b981'}
                  >
                    Submit Maintenance
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Maintenance Modal */}
      {showScheduleForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            {/* Header */}
            <div style={{
              padding: '1.5rem 1.5rem 1rem 1.5rem',
              borderBottom: '1px solid #f3f4f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                color: '#111827',
                margin: 0
              }}>
                Schedule Maintenance
              </h2>
              <button
                onClick={resetScheduleForm}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>

            {/* Form Content */}
            <div style={{
              padding: '1.5rem',
              maxHeight: 'calc(90vh - 120px)',
              overflowY: 'auto'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Equipment Selection */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    Equipment
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select
                      name="equipmentId"
                      value={scheduleFormData.equipmentId}
                      onChange={handleScheduleInputChange}
                      required
                      style={{
                        width: '100%',
                        padding: '0.875rem 1rem',
                        fontSize: '1rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        backgroundColor: '#f9fafb',
                        color: scheduleFormData.equipmentId ? '#111827' : '#9ca3af',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                        backgroundPosition: 'right 0.5rem center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '1.5em 1.5em',
                        paddingRight: '2.5rem'
                      }}
                    >
                      <option value="">Select Equipment</option>
                      {equipments.map((equipment) => (
                        <option key={equipment.id} value={equipment.id}>
                          {equipment.name} ({equipment.serialNumber})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Maintenance Type */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    Maintenance Type
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select
                      name="type"
                      value={scheduleFormData.type}
                      onChange={handleScheduleInputChange}
                      style={{
                        width: '100%',
                        padding: '0.875rem 1rem',
                        fontSize: '1rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        backgroundColor: '#f9fafb',
                        color: '#111827',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                        backgroundPosition: 'right 0.5rem center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '1.5em 1.5em',
                        paddingRight: '2.5rem'
                      }}
                    >
                      <option value="Preventive">Preventive</option>
                      <option value="Corrective">Corrective</option>
                      <option value="Emergency">Emergency</option>
                      <option value="Calibration">Calibration</option>
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={scheduleFormData.description}
                    onChange={handleScheduleInputChange}
                    placeholder="Describe the maintenance work to be performed"
                    required
                    rows="4"
                    style={{
                      width: '100%',
                      padding: '0.875rem 1rem',
                      fontSize: '1rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      backgroundColor: '#f9fafb',
                      color: '#111827',
                      resize: 'vertical',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                {/* Scheduled Date */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    Scheduled Date
                  </label>
                  <input
                    type="date"
                    name="scheduledDate"
                    value={scheduleFormData.scheduledDate}
                    onChange={handleScheduleInputChange}
                    required
                    style={{
                      width: '100%',
                      padding: '0.875rem 1rem',
                      fontSize: '1rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      backgroundColor: '#f9fafb',
                      color: scheduleFormData.scheduledDate ? '#111827' : '#9ca3af'
                    }}
                  />
                </div>

                {/* Notes */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    value={scheduleFormData.notes}
                    onChange={handleScheduleInputChange}
                    placeholder="Additional notes or instructions"
                    rows="3"
                    style={{
                      width: '100%',
                      padding: '0.875rem 1rem',
                      fontSize: '1rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      backgroundColor: '#f9fafb',
                      color: '#111827',
                      resize: 'vertical',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                {/* Submit Button */}
                <div style={{ paddingTop: '1rem' }}>
                  <button
                    onClick={handleScheduleSubmit}
                    style={{
                      width: '100%',
                      backgroundColor: '#10b981',
                      color: 'white',
                      padding: '0.875rem 1rem',
                      fontSize: '1rem',
                      fontWeight: '600',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#059669'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#10b981'}
                  >
                    Schedule Maintenance
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast.show && (
        <ToastNotification
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ show: false, message: "", type: "success" })}
        />
      )}
    </div>
  );
}