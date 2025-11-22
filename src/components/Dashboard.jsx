// src/components/Dashboard.js
import React, { useState, useEffect, useCallback } from "react";
import { ref, push, onValue, remove, update, get } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import Sidebar from "./Sidebar";
import EquipmentPage from "./EquipmentPage";
import UserManagement from "./UserManagement";
import RequestFormsPage from "./RequestFormsPage";
import HistoryPage from "./HistoryPage";
import AnnouncementModal from "./AnnouncementModal";
import Analytics from "./Analytics";
import LaboratoryManagement from "./LaboratoryManagement";
import NotificationModal from "./NotificationModal";
import { checkForOverdueEquipment } from "../utils/notificationUtils";
import { exportToPDF, printActivities } from "../utils/pdfUtils";
import "../CSS/Dashboard.css";

export default function Dashboard() {
  const { user, isAdmin, isLaboratoryManager, getAssignedLaboratoryIds } = useAuth();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showAllActivitiesModal, setShowAllActivitiesModal] = useState(false);
  const [allActivities, setAllActivities] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [announcements, setAnnouncements] = useState([]);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [dashboardStats, setDashboardStats] = useState({
    totalEquipment: 0,
    totalUsers: 0,
    pendingRequests: 0,
    borrowedItems: 0,
    borrowedEquipment: 0, // Equipment currently borrowed (from quantity_borrowed)
    itemsInStock: 0,
    availableEquipment: 0, // Available equipment (total - borrowed)
    needMaintenance: 0,
    overdueItems: 0,
    borrowedByAdviser: 0,
    borrowedByStudents: 0
  });
  const [borrowingData, setBorrowingData] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [equipmentData, setEquipmentData] = useState([]);
  const [laboratories, setLaboratories] = useState([]);
  const [users, setUsers] = useState([]);
  const [borrowingTimeFilter, setBorrowingTimeFilter] = useState('all'); // 'all', 'week', 'month'
  const [historyTopBorrowed, setHistoryTopBorrowed] = useState([]);
  const [totalItemsBorrowedFromHistory, setTotalItemsBorrowedFromHistory] = useState(0);

  const normalizeText = (value) => (value || "").toString().trim().toLowerCase();

  const requestBelongsToAssignedLabs = useCallback((request) => {
    if (isAdmin()) return true;
    const assignedLabIds = getAssignedLaboratoryIds?.() || [];
    if (!assignedLabIds.length) return false;

    const matchesAssigned = (lab) => {
      if (!lab) return false;
      return assignedLabIds.includes(lab.id) || assignedLabIds.includes(lab.labId) || assignedLabIds.includes(lab.labRecordId);
    };

    if (request.labRecordId && assignedLabIds.includes(request.labRecordId)) return true;
    if (request.labId && assignedLabIds.includes(request.labId)) return true;

    const labFromRequest = laboratories.find((lab) =>
      (request.labId && (lab.id === request.labId || lab.labId === request.labId)) ||
      (request.laboratory && normalizeText(lab.labName) === normalizeText(request.laboratory))
    );
    if (matchesAssigned(labFromRequest)) return true;

    const equipment = equipmentData.find((eq) =>
      eq.id === request.itemId ||
      eq.equipmentId === request.itemId ||
      eq.categoryId === request.categoryId ||
      eq.name === request.itemName ||
      eq.itemName === request.itemName ||
      eq.title === request.itemName
    );
    if (equipment) {
      if (equipment.labId && assignedLabIds.includes(equipment.labId)) return true;
      const lab = laboratories.find((lab) => lab.labId === equipment.labId || lab.id === equipment.labId);
      if (matchesAssigned(lab)) return true;
    }

    return false;
  }, [isAdmin, getAssignedLaboratoryIds, laboratories, equipmentData]);

  const equipmentBelongsToAssignedLabs = useCallback((item) => {
    if (isAdmin()) return true;
    const assignedLabIds = getAssignedLaboratoryIds?.() || [];
    if (!assignedLabIds.length) return false;

    const labIdentifiers = [
      item.labRecordId,
      item.labId,
      item.laboratoryId,
      item.laboratory,
      item.assignedLabId
    ].filter(Boolean);

    if (labIdentifiers.some((id) => assignedLabIds.includes(id))) return true;

    if (item.laboratory) {
      const lab = laboratories.find((lab) => normalizeText(lab.labName) === normalizeText(item.laboratory));
      if (lab && (assignedLabIds.includes(lab.id) || assignedLabIds.includes(lab.labId))) return true;
    }

    if (item.categoryId || item.id || item.name) {
      const categoryEquipment = equipmentData.find((eq) =>
        eq.id === item.id ||
        eq.equipmentId === item.id ||
        eq.categoryId === item.categoryId ||
        eq.name === item.name ||
        eq.itemName === item.itemName ||
        eq.title === item.name
      );
      if (categoryEquipment) {
        if (categoryEquipment.labId && assignedLabIds.includes(categoryEquipment.labId)) return true;
        const lab = laboratories.find((lab) => lab.labId === categoryEquipment.labId || lab.id === categoryEquipment.labId);
        if (lab && (assignedLabIds.includes(lab.id) || assignedLabIds.includes(lab.labId))) return true;
      }
    }

    return false;
  }, [isAdmin, getAssignedLaboratoryIds, laboratories, equipmentData]);

  // Load announcements from Firebase
  useEffect(() => {
    const announcementsRef = ref(database, 'announcements');
    
    const unsubscribe = onValue(announcementsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const announcementsList = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        // Sort by creation date, newest first
        announcementsList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setAnnouncements(announcementsList);
      } else {
        setAnnouncements([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load unread notification count for Laboratory Managers
  useEffect(() => {
    if (!isLaboratoryManager()) return;

    const notificationsRef = ref(database, 'notifications');
    
    const unsubscribe = onValue(notificationsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const notificationsList = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        
        // Get assigned laboratory IDs for this user
        const assignedLabIds = getAssignedLaboratoryIds() || [];
        
        // Count unread notifications for this user
        const unreadCount = notificationsList.filter(notification => {
          if (notification.isRead) return false;
          
          // Check if notification is directly for this user
          if (notification.recipientUserId === user.uid) return true;
          
          // Check if notification is for one of their assigned laboratories
          if (notification.labId && Array.isArray(assignedLabIds) && assignedLabIds.includes(notification.labId)) return true;
          
          return false;
        }).length;
        
        setUnreadNotificationCount(unreadCount);
      } else {
        setUnreadNotificationCount(0);
      }
    });

    return () => unsubscribe();
  }, [isLaboratoryManager, user, getAssignedLaboratoryIds]);

  // Load data for overdue equipment checking
  useEffect(() => {
    const loadDataForOverdueCheck = async () => {
      try {
        // Load borrow requests
        const borrowRequestsRef = ref(database, 'borrow_requests');
        const borrowSnapshot = await get(borrowRequestsRef);
        
        if (borrowSnapshot.exists()) {
          const requestsData = borrowSnapshot.val();
          const requestsList = Object.keys(requestsData).map(key => ({
            id: key,
            ...requestsData[key]
          }));
          setAllRequests(requestsList);
        }

        // Load laboratories
        const laboratoriesRef = ref(database, 'laboratories');
        const laboratoriesSnapshot = await get(laboratoriesRef);
        
        if (laboratoriesSnapshot.exists()) {
          const laboratoriesData = laboratoriesSnapshot.val();
          const laboratoriesList = Object.keys(laboratoriesData).map(key => ({
            id: key,
            ...laboratoriesData[key]
          }));
          setLaboratories(laboratoriesList);
        }

        // Load users data to get borrower names
        const usersRef = ref(database, 'users');
        const usersSnapshot = await get(usersRef);
        
        if (usersSnapshot.exists()) {
          const usersData = usersSnapshot.val();
          const usersList = Object.keys(usersData).map(key => ({
            id: key,
            ...usersData[key]
          }));
          setUsers(usersList);
        }
      } catch (error) {
        console.error("Error loading data for overdue check:", error);
      }
    };

    loadDataForOverdueCheck();
  }, []);

  useEffect(() => {
    const categoriesRef = ref(database, 'equipment_categories');

    const unsubscribe = onValue(categoriesRef, (snapshot) => {
      if (snapshot.exists()) {
        const categoriesData = snapshot.val();
        const allEquipment = [];

        Object.keys(categoriesData).forEach((categoryId) => {
          const category = categoriesData[categoryId] || {};
          const equipments = category.equipments || {};

          Object.keys(equipments).forEach((equipmentId) => {
            const equipmentEntry = {
              id: equipmentId,
              categoryId,
              categoryName: category.title,
              ...equipments[equipmentId]
            };
            allEquipment.push(equipmentEntry);
          });
        });

        setEquipmentData(allEquipment);
      } else {
        setEquipmentData([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Periodic overdue equipment check (runs every hour)
  useEffect(() => {
    if (allRequests.length === 0 || equipmentData.length === 0 || laboratories.length === 0) return;

    const checkOverdue = async () => {
      await checkForOverdueEquipment(allRequests, equipmentData, laboratories);
    };

    // Run immediately
    checkOverdue();

    // Set up interval to check every hour
    const interval = setInterval(checkOverdue, 60 * 60 * 1000); // 1 hour

    return () => clearInterval(interval);
  }, [allRequests, equipmentData, laboratories]);

  // Load dashboard analytics data
  useEffect(() => {
    // Load borrow requests for statistics
    const borrowRequestsRef = ref(database, 'borrow_requests');

    const unsubscribeBorrowRequests = onValue(borrowRequestsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        let requests = Object.values(data);
        if (!isAdmin()) {
          requests = requests.filter(requestBelongsToAssignedLabs);
        }

        // Calculate statistics
        const pendingCount = requests.filter(req => req.status === 'pending').length;
        const getQuantity = (req) => {
          if (!req) return 1;
          return Number(req.quantityReleased ?? req.approvedQuantity ?? req.quantity) || 1;
        };
        // Count items that are actually released (physically borrowed)
        const borrowedCount = requests.reduce((sum, req) => {
          if (req.status === 'released') {
            return sum + getQuantity(req);
          }
          return sum;
        }, 0);

        const overdueCount = requests.filter(req => {
          if (req.dateToReturn && (req.status === 'approved' || req.status === 'released' || req.status === 'in_progress')) {
            return new Date(req.dateToReturn) < new Date();
          }
          return false;
        }).length;

        // Filter requests by time period
        const now = new Date();
        let filteredRequestsForChart = requests;
        
        if (borrowingTimeFilter === 'week') {
          const weekAgo = new Date(now);
          weekAgo.setDate(weekAgo.getDate() - 7);
          filteredRequestsForChart = requests.filter(req => {
            const requestDate = req.requestedAt || req.releasedAt || req.updatedAt;
            if (!requestDate) return false;
            return new Date(requestDate) >= weekAgo;
          });
        } else if (borrowingTimeFilter === 'month') {
          const monthAgo = new Date(now);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          filteredRequestsForChart = requests.filter(req => {
            const requestDate = req.requestedAt || req.releasedAt || req.updatedAt;
            if (!requestDate) return false;
            return new Date(requestDate) >= monthAgo;
          });
        }
        // 'all' - no filtering needed

        // Create borrowing chart data - count items that were actually borrowed
        // Includes: released (currently borrowed) and returned (were borrowed)
        const itemData = {};
        
        filteredRequestsForChart.forEach(req => {
          // Count requests that were actually borrowed (released, in_progress, or returned)
          if (req.status === 'released' || req.status === 'in_progress' || req.status === 'returned') {
            const itemName = req.itemName || 'Unknown Item';
            const quantity = getQuantity(req);
            itemData[itemName] = (itemData[itemName] || 0) + quantity;
          }
        });

        const chartData = Object.entries(itemData).map(([name, value]) => ({
          name,
          value
        }));

        setBorrowingData(chartData);
        // eslint-disable-next-line react-hooks/exhaustive-deps

        // Calculate adviser vs student borrowing statistics (released items only)
        let adviserBorrowings = 0;
        let studentBorrowings = 0;
        
        // Helper function to determine borrower role with fallbacks
        const getBorrowerRole = (request) => {
          if (!request) return null;

          if (request.userId) {
            const user = users.find(u => u.id === request.userId || u.userId === request.userId);
            if (user?.role) return user.role.toLowerCase();
          }

          const adviserName = request.adviserName?.toLowerCase();
          const instructorKeywords = ['instructor', 'adviser', 'advisor', 'prof', 'professor', 'teacher', 'sir ', "ma'am", 'maam', 'mr.', 'ms.', 'mrs.'];
          if (adviserName && instructorKeywords.some(keyword => adviserName.includes(keyword))) {
            return 'instructor';
          }

          if (request.roleHint) return request.roleHint.toLowerCase();
          if (request.borrowerType) return request.borrowerType.toLowerCase();

          return null;
        };

        const facultyRoles = ['admin', 'laboratory_manager', 'instructor', 'adviser', 'advisor', 'faculty', 'teacher'];
        
        requests.forEach(req => {
          if (req.status === 'released') {
            const borrowerRole = getBorrowerRole(req);
            const quantity = getQuantity(req);
            let isFaculty = false;

            if (borrowerRole) {
              if (facultyRoles.includes(borrowerRole)) {
                isFaculty = true;
              } else if (borrowerRole === 'student') {
                isFaculty = false;
              }
            }

            if (isFaculty) {
              adviserBorrowings += quantity;
            } else {
              studentBorrowings += quantity;
            }
          }
        });

        setDashboardStats(prev => ({
          ...prev,
          pendingRequests: pendingCount,
          borrowedItems: borrowedCount,
          overdueItems: overdueCount,
          borrowedByAdviser: adviserBorrowings,
          borrowedByStudents: studentBorrowings
        }));
      } else {
        setBorrowingData([]);
        setDashboardStats(prev => ({
          ...prev,
          pendingRequests: 0,
          borrowedItems: 0,
          overdueItems: 0,
          borrowedByAdviser: 0,
          borrowedByStudents: 0
        }));
      }
    });

    // Load users data (estimate from borrow requests)
    const unsubscribeUsers = onValue(borrowRequestsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        let requests = Object.values(data);
        if (!isAdmin()) {
          requests = requests.filter(requestBelongsToAssignedLabs);
        }

        const uniqueUsers = new Set();
        requests.forEach(req => {
          if (req.userEmail) uniqueUsers.add(req.userEmail);
          if (req.adviserName) uniqueUsers.add(req.adviserName);
        });

        setDashboardStats(prev => ({
          ...prev,
          totalUsers: uniqueUsers.size
        }));
      } else {
        setDashboardStats(prev => ({
          ...prev,
          totalUsers: 0
        }));
      }
    });

    return () => {
      unsubscribeBorrowRequests();
      unsubscribeUsers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, requestBelongsToAssignedLabs, users, borrowingTimeFilter]);

  useEffect(() => {
    let equipmentList = equipmentData;
    if (!isAdmin()) {
      equipmentList = equipmentList.filter(equipmentBelongsToAssignedLabs);
    }

    const totalEquipment = equipmentList.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 1;
      return sum + quantity;
    }, 0);

    // Calculate borrowed items using quantity_borrowed field
    const borrowedEquipment = equipmentList.reduce((sum, item) => {
      const quantityBorrowed = Number(item.quantity_borrowed) || 0;
      return sum + quantityBorrowed;
    }, 0);

    // Calculate available items (total - borrowed)
    const availableEquipment = totalEquipment - borrowedEquipment;

    // Calculate items in stock (based on status, for backward compatibility)
    // Note: inStock calculation kept for potential future use
    // const inStock = equipmentList.reduce((sum, item) => {
    //   const quantity = Number(item.quantity) || 1;
    //   return normalizeText(item.status) === 'available' ? sum + quantity : sum;
    // }, 0);

    setDashboardStats(prev => ({
      ...prev,
      totalEquipment,
      itemsInStock: availableEquipment, // Use calculated available instead of status-based
      availableEquipment, // Available equipment count
      borrowedEquipment, // Add borrowed equipment count
    }));
  }, [equipmentData, isAdmin, equipmentBelongsToAssignedLabs, getAssignedLaboratoryIds]);


  useEffect(() => {
    const fetchMaintenanceData = () => {
      const categoriesRef = ref(database, 'equipment_categories');
      onValue(categoriesRef, (snapshot) => {
        if (snapshot.exists()) {
          const categoriesData = snapshot.val();
          let totalScheduledToday = 0;

          const today = new Date();
          today.setHours(0, 0, 0, 0);

          Object.keys(categoriesData).forEach((categoryId) => {
            const category = categoriesData[categoryId] || {};
            const scheduledMaintenance = category.scheduled_maintenance || {};
            const maintenanceRecords = category.maintenance_records || {};

            const completedForToday = Object.values(maintenanceRecords).filter(record => {
              if (!record.datePerformed) return false;
              const completedDate = new Date(record.datePerformed);
              const userTimezoneOffset = completedDate.getTimezoneOffset() * 60000;
              const localCompletedDate = new Date(completedDate.getTime() + userTimezoneOffset);
              localCompletedDate.setHours(0, 0, 0, 0);
              return localCompletedDate.getTime() === today.getTime() && record.status === 'Completed';
            });

            Object.values(scheduledMaintenance).forEach((schedule) => {
              if (!schedule.scheduledDate) return;

              const scheduledDate = new Date(schedule.scheduledDate);
              const userTimezoneOffset = scheduledDate.getTimezoneOffset() * 60000;
              const localScheduledDate = new Date(scheduledDate.getTime() + userTimezoneOffset);
              localScheduledDate.setHours(0, 0, 0, 0);

              if (localScheduledDate.getTime() === today.getTime()) {
                const isCompleted = completedForToday.some(record =>
                  record.equipmentId === schedule.equipmentId &&
                  record.description === schedule.description &&
                  record.type === schedule.type
                );

                if (!isCompleted) {
                  totalScheduledToday++;
                }
              }
            });
          });

          setDashboardStats(prev => ({
            ...prev,
            needMaintenance: totalScheduledToday
          }));
        }
      });
    };

    fetchMaintenanceData();
  }, []);

  useEffect(() => {
    const historyRef = ref(database, 'history');
    const unsubscribe = onValue(historyRef, (snapshot) => {
      if (snapshot.exists()) {
        const historyData = snapshot.val();
        const releasedItems = Object.values(historyData).filter(
          (entry) => entry.status === "Released"
        );
        const totalBorrowed = releasedItems.reduce(
          (sum, entry) =>
            sum +
            Number(
              entry.quantityReleased ||
                entry.approvedQuantity ||
                entry.quantity ||
                1
            ),
          0
        );
        setTotalItemsBorrowedFromHistory(totalBorrowed);

        const matchesLaboratoryAccess = (entry) => {
          if (isAdmin()) return true;
          return equipmentBelongsToAssignedLabs({
            labRecordId: entry.labRecordId,
            labId: entry.labId,
            laboratoryId: entry.labId,
            laboratory: entry.laboratory,
            assignedLabId: entry.labRecordId,
            categoryId: entry.categoryId,
            id: entry.itemId,
            name: entry.equipmentName || entry.itemName,
            itemName: entry.equipmentName || entry.itemName,
            title: entry.equipmentName || entry.itemName
          });
        };

        const getHistoryEntryQuantity = (entry) => {
          const candidates = [
            entry.quantityReleased,
            entry.approvedQuantity,
            entry.quantity,
            entry.details?.originalRequest?.approvedQuantity,
            entry.details?.originalRequest?.quantity,
            entry.returnDetails?.requestedQuantity
          ];
          for (const value of candidates) {
            const numericValue = Number(value);
            if (!Number.isNaN(numericValue) && numericValue > 0) return numericValue;
          }
          return 1;
        };

        const getHistoryEntryName = (entry) =>
          entry?.equipmentName || entry?.itemName || entry?.details?.originalRequest?.itemName || 'Unknown Item';

        const matchesTimeFilter = (entry) => {
          if (borrowingTimeFilter === 'all') return true;
          const dateString = entry.releasedDate || entry.timestamp || entry.returnDate || entry.createdAt;
          if (!dateString) return false;
          const entryDate = new Date(dateString);
          if (Number.isNaN(entryDate.getTime())) return false;
          const now = new Date();
          if (borrowingTimeFilter === 'week') {
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return entryDate >= weekAgo;
          }
          if (borrowingTimeFilter === 'month') {
            const monthAgo = new Date(now);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return entryDate >= monthAgo;
          }
          return true;
        };

        const filteredEntries = releasedItems
          .filter(matchesLaboratoryAccess)
          .filter(matchesTimeFilter);

        const aggregatedData = filteredEntries.reduce((acc, entry) => {
          const name = getHistoryEntryName(entry);
          const quantity = getHistoryEntryQuantity(entry);
          acc[name] = (acc[name] || 0) + quantity;
          return acc;
        }, {});

        const historyTop = Object.entries(aggregatedData)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

        setHistoryTopBorrowed(historyTop);
      } else {
        setTotalItemsBorrowedFromHistory(0);
        setHistoryTopBorrowed([]);
      }
    });

    return () => unsubscribe();
  }, [borrowingTimeFilter, equipmentBelongsToAssignedLabs, isAdmin]);

  // Helper function to get borrower name from userId
  const getBorrowerName = useCallback((userId) => {
    if (!userId) return "Unknown";
    const user = users.find(u => u.id === userId || u.userId === userId);
    return user?.name || user?.fullName || user?.displayName || user?.email || "Unknown";
  }, [users]);

  // Load recent activity data
  useEffect(() => {
    const loadRecentActivity = async () => {
      try {
        // Get recent borrow requests
        const borrowRequestsRef = ref(database, 'borrow_requests');
        const equipmentRef = ref(database, 'equipment');
        const announcementsRef = ref(database, 'announcements');
        const categoriesRef = ref(database, 'equipment_categories');

        // Import get function for one-time reads
        const { get } = await import('firebase/database');
        
        const [borrowSnapshot, equipmentSnapshot, announcementsSnapshot, categoriesSnapshot] = await Promise.all([
          get(borrowRequestsRef),
          get(equipmentRef),
          get(announcementsRef),
          get(categoriesRef)
        ]);

        const activities = [];
        const assignedLabIds = isLaboratoryManager() ? (getAssignedLaboratoryIds() || []) : [];

        // Process announcements (visible to everyone)
        const announcementsData = announcementsSnapshot.val();
        if (announcementsData) {
          Object.keys(announcementsData).forEach(key => {
            const announcement = announcementsData[key];
            activities.push({
              id: `announcement_${key}`,
              type: 'announcement',
              title: 'New announcement published',
              time: announcement.createdAt,
              icon: 'primary',
              details: {
                title: announcement.title,
                author: announcement.author
              },
              labId: announcement.labId // Include labId for filtering
            });
          });
        }

        // Process borrow requests with role-based filtering
        const borrowData = borrowSnapshot.val();
        const categoriesData = categoriesSnapshot.val();
        
        if (borrowData) {
          Object.keys(borrowData).forEach(key => {
            const request = borrowData[key];
            
            // Check if this request should be visible to the current user
            let shouldShow = false;
            
            if (isAdmin()) {
              // Admin sees all requests
              shouldShow = true;
            } else if (isLaboratoryManager() && assignedLabIds) {
              // Lab Manager only sees requests from their assigned laboratories
              if (categoriesData) {
                // Find the equipment category for this request
                const category = Object.values(categoriesData).find(cat => cat.title === request.categoryName);
                if (category && category.labId) {
                  // Check if this lab is assigned to the current manager
                  const lab = laboratories.find(lab => lab.labId === category.labId);
                  if (lab && Array.isArray(assignedLabIds) && assignedLabIds.includes(lab.id)) {
                    shouldShow = true;
                  }
                }
              }
            }
            
            if (shouldShow) {
              activities.push({
                id: `request_${key}`,
                type: 'request',
                title: request.status === 'approved' ? 'Borrow request approved' : 
                       request.status === 'pending' ? 'New borrow request submitted' :
                       request.status === 'rejected' ? 'Borrow request rejected' :
                       request.status === 'released' ? 'Equipment released' :
                       request.status === 'returned' ? 'Equipment returned' :
                       'Borrow request status updated',
                time: request.status === 'returned' && request.returnedAt 
                      ? request.returnedAt 
                      : request.requestedAt || request.updatedAt,
                icon: request.status === 'approved' ? 'info' : 
                      request.status === 'released' ? 'success' :
                      request.status === 'returned' ? 'success' :
                      request.status === 'rejected' ? 'warning' : 'success',
                details: {
                  item: request.itemName,
                  borrower: getBorrowerName(request.userId),
                  status: request.status,
                  laboratory: request.laboratory
                },
                labId: request.labId
              });
            }
          });
        }

        // Process equipment additions (only for admin)
        if (isAdmin()) {
          const equipmentData = equipmentSnapshot.val();
          if (equipmentData) {
            const equipmentCount = Object.keys(equipmentData).length;
            activities.push({
              id: 'equipment_management',
              type: 'equipment',
              title: 'Equipment inventory updated',
              time: new Date().toISOString(),
              icon: 'success',
              details: {
                totalEquipment: equipmentCount
              }
            });
          }
        }

        // Sort by time and take most recent
        activities.sort((a, b) => new Date(b.time) - new Date(a.time));
        
        // Store all activities for "See All" modal
        setAllActivities(activities);
        
        // Show only first 4 for recent activity
        setRecentActivity(activities.slice(0, 4));

      } catch (error) {
        console.error("Error loading recent activity:", error);
      }
    };

    loadRecentActivity();
  }, [isAdmin, isLaboratoryManager, getAssignedLaboratoryIds, laboratories, getBorrowerName, users]);

  const handleMaintenanceComplete = () => {
    setDashboardStats(prev => ({
      ...prev,
      needMaintenance: Math.max(0, prev.needMaintenance - 1)
    }));
  };

  const handleSectionChange = (section) => {
    setActiveSection(section);
  };

  const handleAddAnnouncement = () => {
    setEditingAnnouncement(null);
    setShowAnnouncementModal(true);
  };

  const handleEditAnnouncement = (announcement) => {
    setEditingAnnouncement(announcement);
    setShowAnnouncementModal(true);
  };

  const handleSaveAnnouncement = async (announcementData) => {
    try {
      if (editingAnnouncement) {
        // Update existing announcement
        const announcementRef = ref(database, `announcements/${editingAnnouncement.id}`);
        await update(announcementRef, {
          ...announcementData,
          updatedAt: new Date().toISOString()
        });
      } else {
        // Add new announcement
        const announcementsRef = ref(database, 'announcements');
        await push(announcementsRef, {
          ...announcementData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      setShowAnnouncementModal(false);
      setEditingAnnouncement(null);
    } catch (error) {
      console.error("Error saving announcement:", error);
      alert("Failed to save announcement. Please try again.");
    }
  };

  const handleDeleteAnnouncement = async (announcementId) => {
    if (window.confirm("Are you sure you want to delete this announcement?")) {
      try {
        const announcementRef = ref(database, `announcements/${announcementId}`);
        await remove(announcementRef);
      } catch (error) {
        console.error("Error deleting announcement:", error);
        alert("Failed to delete announcement. Please try again.");
      }
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'priority-high';
      case 'medium': return 'priority-medium';
      case 'low': return 'priority-low';
      default: return 'priority-medium';
    }
  };

  // Helper function to format time differences
  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now - time) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)} months ago`;
    return `${Math.floor(diffInSeconds / 31536000)} years ago`;
  };

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
        return (
          <div className="dashboard-content-centered">
            <div className="dashboard-welcome">
              <div className="welcome-content">
                <h1>Welcome to SmartLab Dashboard</h1>
                <p>Monitor and manage your laboratory equipment efficiently</p>
              </div>
              {isLaboratoryManager() && (
                <div className="notification-bell-container">
                  <button 
                    className="notification-bell"
                    onClick={() => setShowNotificationModal(true)}
                    title="View Notifications"
                  >
                    🔔
                    {unreadNotificationCount > 0 && (
                      <span className="notification-badge">{unreadNotificationCount}</span>
                    )}
                  </button>
                </div>
              )}
            </div>
            
            {/* Main Statistics Grid */}
            <div className="main-stats-grid">
              <div className="stat-card-large primary">
                <div className="stat-number">{dashboardStats.borrowedByAdviser}</div>
                <div className="stat-label">Items Borrowed by Instructor</div>
                <div className="stat-icon">👨‍🏫</div>
              </div>
              <div className="stat-card-large success">
                <div className="stat-number">{dashboardStats.borrowedByStudents}</div>
                <div className="stat-label">Items Borrowed by Students</div>
                <div className="stat-icon">👨‍🎓</div>
              </div>
              <div className="stat-card-large info">
                <div className="stat-number">{dashboardStats.borrowedItems}</div>
                <div className="stat-label">Currently Items Borrowed</div>
                <div className="stat-icon">📦</div>
              </div>
            </div>

            {/* Secondary Statistics Grid */}
            <div className="secondary-stats-grid">
              <div className="stat-card-small success">
                <div className="stat-number">{dashboardStats.availableEquipment.toLocaleString()}</div>
                <div className="stat-label">Available Equipment</div>
                <div className="stat-subtext" style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                  {dashboardStats.totalEquipment > 0 
                    ? `${Math.round((dashboardStats.availableEquipment / dashboardStats.totalEquipment) * 100)}% of total`
                    : 'No equipment'}
                </div>
              </div>
              <div className="stat-card-small info">
                <div className="stat-number">{totalItemsBorrowedFromHistory.toLocaleString()}</div>
                <div className="stat-label">Total Items Borrowed</div>
              </div>
              <div className="stat-card-small">
                <div className="stat-number">{dashboardStats.totalEquipment.toLocaleString()}</div>
                <div className="stat-label">Total Equipment</div>
              </div>
              <div className="stat-card-small warning">
                <div className="stat-number">{dashboardStats.needMaintenance}</div>
                <div className="stat-label">Need Maintenance</div>
              </div>
              <div className="stat-card-small danger">
                <div className="stat-number">{dashboardStats.overdueItems}</div>
                <div className="stat-label">Overdue Items</div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="charts-section">
              {/* Top Borrowed Items Chart */}
              <div className="chart-card">
                <div className="chart-header">
                  <div>
                    <h3>Top 5 Borrowed Items</h3>
                    <p>Most frequently borrowed equipment items</p>
                  </div>
                  <select 
                    className="time-filter-select"
                    value={borrowingTimeFilter}
                    onChange={(e) => setBorrowingTimeFilter(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #ddd',
                      backgroundColor: '#fff',
                      fontSize: '14px',
                      cursor: 'pointer',
                      marginLeft: 'auto'
                    }}
                  >
                    <option value="all">All Time</option>
                    <option value="month">Last Month</option>
                    <option value="week">Last Week</option>
                  </select>
                </div>
                <div className="chart-container">
                  <div className="bar-chart">
                    {(() => {
                      const topBorrowedItems = historyTopBorrowed.slice(0, 5);
                      if (!topBorrowedItems.length) {
                        return (
                          <div className="bar-item empty">
                            <div className="bar-label">No released history yet</div>
                          </div>
                        );
                      }
                      const maxBorrowingValue = Math.max(...topBorrowedItems.map((d) => d.value));
                      return topBorrowedItems.map((item, index) => (
                        <div key={item.name} className="bar-item">
                          <div className="bar-label">{item.name}</div>
                          <div className="bar-container">
                            <div
                              className="bar-fill"
                              style={{
                                width: `${(item.value / (maxBorrowingValue || 1)) * 100}%`,
                                backgroundColor: `hsl(${200 + index * 30}, 70%, 50%)`
                              }}
                            ></div>
                            <span className="bar-value">{item.value}</span>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>

              {/* Activity Summary */}
              <div className="activity-card">
                <div className="activity-header-with-button">
                  <div>
                    <h3>Recent Activity</h3>
                    <p>Latest system activities</p>
                  </div>
                  {allActivities.length > 0 && (
                    <button 
                      className="btn btn-sm btn-secondary"
                      onClick={() => setShowAllActivitiesModal(true)}
                      title="View all activities"
                    >
                      See All ({allActivities.length})
                    </button>
                  )}
                </div>
                <div className="activity-list">
                  {recentActivity.length > 0 ? (
                    recentActivity.map((activity) => (
                      <div key={activity.id} className="activity-item">
                        <div className={`activity-icon ${activity.icon}`}>
                          {activity.icon === 'success' ? '✅' : 
                           activity.icon === 'info' ? '📋' :
                           activity.icon === 'warning' ? '⚠️' :
                           activity.icon === 'primary' ? '📢' : '📋'}
                        </div>
                        <div className="activity-content">
                          <div className="activity-title">{activity.title}</div>
                          {activity.details && activity.details.item && (
                            <div className="activity-details">
                              {activity.type === 'request' && (
                                <span className="activity-item-name">{activity.details.item}</span>
                              )}
                              {activity.details.borrower && (
                                <span className="activity-borrower">by {activity.details.borrower}</span>
                              )}
                              {activity.details.laboratory && (
                                <span className="activity-lab">Lab: {activity.details.laboratory}</span>
                              )}
                            </div>
                          )}
                          <div className="activity-time">{formatTimeAgo(activity.time)}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="activity-item">
                      <div className="activity-icon info">📋</div>
                      <div className="activity-content">
                        <div className="activity-title">No recent activity</div>
                        <div className="activity-time">System is ready</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>


            {/* Announcements Section */}
            <div className="announcements-section">
              <div className="section-header-with-button">
                <div className="section-header">
                  <h2>Important Announcements</h2>
                  <p>Stay updated with the latest information and updates</p>
                </div>
                <button 
                  className="btn btn-primary"
                  onClick={handleAddAnnouncement}
                >
                  <span className="btn-icon">📢</span>
                  Add Announcement
                </button>
              </div>

              <div className="announcements-grid">
                {announcements.length > 0 ? (
                  announcements.map((announcement) => (
                    <div key={announcement.id} className={`announcement-card ${getPriorityColor(announcement.priority)}`}>
                      <div className="announcement-header">
                        <div className="announcement-title-section">
                          <h3 className="announcement-title">{announcement.title}</h3>
                          <span className={`priority-badge ${announcement.priority}`}>
                            {announcement.priority?.toUpperCase() || 'MEDIUM'}
                          </span>
                        </div>
                        <div className="announcement-actions">
                          <button 
                            className="action-btn edit-btn"
                            onClick={() => handleEditAnnouncement(announcement)}
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button 
                            className="action-btn delete-btn"
                            onClick={() => handleDeleteAnnouncement(announcement.id)}
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      
                      <div className="announcement-content">
                        <p>{announcement.content}</p>
                      </div>
                      
                      <div className="announcement-footer">
                        <div className="announcement-meta">
                          <span className="announcement-author">By: {announcement.author}</span>
                          <span className="announcement-date">
                            {formatDate(announcement.createdAt)}
                          </span>
                        </div>
                        {announcement.category && (
                          <span className="announcement-category">
                            {announcement.category}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-announcements">
                    <div className="empty-icon">📢</div>
                    <h3>No Announcements Yet</h3>
                    <p>Click "Add Announcement" to create your first announcement.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      
      case "equipments":
        return isLaboratoryManager() ? <EquipmentPage onMaintenanceComplete={handleMaintenanceComplete} /> : null;
      
      case "laboratories":
        return <LaboratoryManagement />;
      
      case "request-forms":
        return isLaboratoryManager() ? <RequestFormsPage /> : null;
      
      case "history":
        return isLaboratoryManager() ? <HistoryPage /> : null;
      
      case "analytics":
        return isLaboratoryManager() ? <Analytics /> : null;
      
      case "users":
        if (!isAdmin()) {
          return (
            <div className="dashboard-content-centered">
              <div className="access-denied">
                <h1>Access Denied</h1>
                <p>You don't have permission to access this section. Admin privileges required.</p>
              </div>
            </div>
          );
        }
        return <UserManagement onRedirectToUsers={() => setActiveSection("users")} />;
      
      case "profile":
        return (
          <div className="dashboard-content-centered">
            <div className="section-header">
              <h1>Profile Settings</h1>
              <p>Manage your account settings and preferences.</p>
            </div>
            
            <div className="profile-grid">
              <div className="profile-card">
                <h3>Profile Picture</h3>
                <div className="profile-picture">👤</div>
                <button className="btn btn-secondary">Change Photo</button>
              </div>
              
              <div className="profile-card">
                <h3>Account Information</h3>
                <div className="form-group">
                  <label className="form-label">Name:</label>
                  <input 
                    type="text" 
                    placeholder="Your Name" 
                    className="form-input" 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email:</label>
                  <input 
                    type="email" 
                    placeholder="your.email@example.com" 
                    className="form-input" 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Role:</label>
                  <select className="form-select">
                    <option>Admin</option>
                    <option>User</option>
                    <option>Manager</option>
                  </select>
                </div>
                <button className="btn btn-primary">Save Changes</button>
              </div>
            </div>
          </div>
        );
      
      default:
        return (
          <div className="dashboard-content-centered">
            <div className="empty-state">
              <h3>Section not found</h3>
              <p>The requested section could not be found.</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="dashboard-container">
      <Sidebar 
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      />
      <main className="dashboard-main">
        <div className="dashboard-inner">
          {renderContent()}
        </div>
      </main>
      
      {showAnnouncementModal && (
        <AnnouncementModal
          announcement={editingAnnouncement}
          onSave={handleSaveAnnouncement}
          onClose={() => {
            setShowAnnouncementModal(false);
            setEditingAnnouncement(null);
          }}
        />
      )}
      
      {showNotificationModal && (
        <NotificationModal
          isOpen={showNotificationModal}
          onClose={() => setShowNotificationModal(false)}
        />
      )}
      
      {showAllActivitiesModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{maxWidth: '800px', maxHeight: '80vh', overflow: 'auto'}}>
            <div className="modal-header">
              <h2>All Activities</h2>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button 
                  onClick={() => {
                    const formatActivities = (activities) => {
                      return activities.map((activity, index) => [
                        index + 1,
                        activity.title || 'N/A',
                        activity.details?.item || activity.details?.title || 'N/A',
                        activity.details?.borrower || activity.details?.author || 'N/A',
                        activity.details?.status || 'N/A',
                        formatDate(activity.time)
                      ]);
                    };
                    exportToPDF(allActivities, 'All Activities', formatActivities);
                  }}
                  className="btn btn-sm btn-primary"
                  style={{ marginRight: '5px' }}
                >
                  📄 Export PDF
                </button>
                <button 
                  onClick={() => {
                    const formatActivities = (activities) => {
                      return activities.map((activity) => ({
                        title: activity.title || 'N/A',
                        item: activity.details?.item || activity.details?.title || 'N/A',
                        borrower: activity.details?.borrower || activity.details?.author || 'N/A',
                        status: activity.details?.status || 'N/A',
                        time: formatDate(activity.time)
                      }));
                    };
                    printActivities(allActivities, 'All Activities', formatActivities);
                  }}
                  className="btn btn-sm btn-secondary"
                >
                  🖨️ Print
                </button>
                <button onClick={() => setShowAllActivitiesModal(false)} className="modal-close-btn">×</button>
              </div>
            </div>
            <div className="modal-body">
              <div className="activity-list">
                {allActivities.map((activity) => (
                  <div key={activity.id} className="activity-item">
                    <div className={`activity-icon ${activity.icon}`}>
                      {activity.icon === 'success' ? '✅' : 
                       activity.icon === 'info' ? '📋' :
                       activity.icon === 'warning' ? '⚠️' :
                       activity.icon === 'primary' ? '📢' : '📋'}
                    </div>
                    <div className="activity-content">
                      <div className="activity-title">{activity.title}</div>
                      {activity.details && (
                        <div className="activity-details">
                          {activity.details.item && (
                            <span className="activity-item-name">{activity.details.item}</span>
                          )}
                          {activity.details.borrower && (
                            <span className="activity-borrower">by {activity.details.borrower}</span>
                          )}
                          {activity.details.laboratory && (
                            <span className="activity-lab">Lab: {activity.details.laboratory}</span>
                          )}
                          {activity.details.author && (
                            <span className="activity-author">by {activity.details.author}</span>
                          )}
                        </div>
                      )}
                      <div className="activity-time">{formatDate(activity.time)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}