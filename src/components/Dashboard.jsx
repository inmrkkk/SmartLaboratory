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
import DamagedLostRecords from "./DamagedLostRecords";
import DataConsistencyAudit from "./DataConsistencyAudit";
import AdminLabEquipment from "./AdminLabEquipment";
import { checkForOverdueEquipment, notifyMaintenanceDueToday, notifyNewRequest, notifyRequestApproved, notifyRequestRejected } from "../utils/notificationUtils";
import { exportToPDF } from "../utils/pdfUtils";
import { getDueDateTimeAtFivePm } from "../utils/dueTimeUtils";
import DeleteConfirmationModal from "./DeleteConfirmationModal";
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
  const [recentActivity, setRecentActivity] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [equipmentData, setEquipmentData] = useState([]);
  const [laboratories, setLaboratories] = useState([]);
  const [users, setUsers] = useState([]);
  const [borrowingTimeFilter, setBorrowingTimeFilter] = useState('all'); // 'all', 'week', 'month'
  const [historyTopBorrowed, setHistoryTopBorrowed] = useState([]);
  const [totalItemsBorrowedFromHistory, setTotalItemsBorrowedFromHistory] = useState(0);
  const [activityStates, setActivityStates] = useState({});
  const [rawActivities, setRawActivities] = useState([]);
  const [activityFilter, setActivityFilter] = useState("all"); // all, unread, read
  const [isClearingActivities, setIsClearingActivities] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => { }
  });

  const normalizeText = (value) => (value || "").toString().trim().toLowerCase();

  const equipmentBelongsToAssignedLabs = useCallback((item) => {
    if (isAdmin()) return true;
    const assignedLabIds = getAssignedLaboratoryIds?.() || [];
    if (!assignedLabIds.length) return false;

    // 1. Direct check on the item's own laboratory identifiers
    // We check all possible ID fields against the user's assigned lab keys
    const itemLabIds = [
      item.labRecordId,
      item.labId,
      item.laboratoryId,
      item.assignedLabId
    ].filter(Boolean);

    if (itemLabIds.some(id => assignedLabIds.includes(id))) return true;

    // 2. Check by laboratory name
    // If the item has a laboratory name, find that lab and check if it's assigned
    if (item.laboratory) {
      const lab = laboratories.find(l =>
        normalizeText(l.labName) === normalizeText(item.laboratory) ||
        normalizeText(l.labId) === normalizeText(item.laboratory)
      );
      if (lab && (assignedLabIds.includes(lab.id) || assignedLabIds.includes(lab.labId))) return true;
    }

    // 3. Check by item's labId string mapping to a laboratory record
    // Sometimes items only have a string ID like "CPE-LAB" instead of a Firebase key
    if (item.labId) {
      const lab = laboratories.find(l => l.labId === item.labId || l.id === item.labId);
      if (lab && (assignedLabIds.includes(lab.id) || assignedLabIds.includes(lab.labId))) return true;
    }

    return false;
  }, [isAdmin, getAssignedLaboratoryIds, laboratories]);

  const requestBelongsToAssignedLabs = useCallback((request) => {
    if (isAdmin()) return true;
    const assignedLabIds = getAssignedLaboratoryIds?.() || [];
    if (!assignedLabIds.length) return false;

    // 1. Direct check on the request's own laboratory identifiers
    const requestLabIds = [
      request.labRecordId,
      request.labId,
      request.laboratoryId,
      request.assignedLabId
    ].filter(Boolean);

    if (requestLabIds.some(id => assignedLabIds.includes(id))) return true;

    // 2. Check by laboratory name
    if (request.laboratory) {
      const lab = laboratories.find(l =>
        normalizeText(l.labName) === normalizeText(request.laboratory) ||
        normalizeText(l.labId) === normalizeText(request.laboratory)
      );
      if (lab && (assignedLabIds.includes(lab.id) || assignedLabIds.includes(lab.labId))) return true;
    }

    // 3. Check by the laboratory of the associated equipment
    const equipment = equipmentData.find((eq) =>
      eq.id === request.itemId ||
      eq.equipmentId === request.itemId ||
      eq.categoryId === request.categoryId ||
      eq.name === request.itemName ||
      eq.itemName === request.itemName ||
      eq.title === request.itemName
    );

    if (equipment) {
      // Use the already-calculated equipment check logic
      return equipmentBelongsToAssignedLabs(equipment);
    }

    return false;
  }, [isAdmin, getAssignedLaboratoryIds, laboratories, equipmentData, equipmentBelongsToAssignedLabs]);

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

  useEffect(() => {
    const laboratoriesRef = ref(database, 'laboratories');
    const unsubscribe = onValue(laboratoriesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const labsList = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        setLaboratories(labsList);
      } else {
        setLaboratories([]);
      }
    });

    return () => unsubscribe();
  }, []);

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

  // Load activity states (read/deleted status)
  useEffect(() => {
    if (!user) return;

    const activityStatesRef = ref(database, `activity_states/${user.uid}`);
    const unsubscribe = onValue(activityStatesRef, (snapshot) => {
      if (snapshot.exists()) {
        setActivityStates(snapshot.val());
      } else {
        setActivityStates({});
      }
    });

    return () => unsubscribe();
  }, [user]);

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
      } catch (error) {
        console.error("Error loading data for overdue check:", error);
      }
    };

    loadDataForOverdueCheck();
  }, []);

  // Reactive users loading
  useEffect(() => {
    const usersRef = ref(database, 'users');
    const unsubscribe = onValue(usersRef, (snapshot) => {
      if (snapshot.exists()) {
        const usersData = snapshot.val();
        const usersList = Object.keys(usersData).map(key => ({
          id: key,
          ...usersData[key]
        }));
        setUsers(usersList);
        console.log(`[Dashboard] Reactively loaded ${usersList.length} users`);
      } else {
        setUsers([]);
      }
    });

    return () => unsubscribe();
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
              // Inherit laboratory information from category if missing on item
              labId: equipments[equipmentId].labId || category.labId || "",
              labRecordId: equipments[equipmentId].labRecordId || category.labRecordId || "",
              laboratory: equipments[equipmentId].laboratory || category.labName || "",
              ...equipments[equipmentId]
            };
            allEquipment.push(equipmentEntry);
          });
        });

        console.log(`[Dashboard] Loaded ${allEquipment.length} total equipment items from database`);
        setEquipmentData(allEquipment);
      } else {
        setEquipmentData([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Periodic overdue equipment check (runs every hour)
  // IMPORTANT: We wait for users to be loaded before running the check, otherwise
  // the borrower name can't be resolved from userId and notifications will show "Unknown Student".
  // The localStorage dedup guard would then prevent re-creation with the correct name.
  useEffect(() => {
    if (allRequests.length === 0 || equipmentData.length === 0 || laboratories.length === 0 || users.length === 0) return;

    const checkOverdue = async () => {
      await checkForOverdueEquipment(allRequests, equipmentData, laboratories, users);
    };

    // Run immediately
    checkOverdue();

    // Set up interval to check every hour
    const interval = setInterval(checkOverdue, 12 * 60 * 60 * 1000); // 12 hour

    return () => clearInterval(interval);
  }, [allRequests, equipmentData, laboratories, users]);

  // Helper function to get borrower name from userId
  const getBorrowerName = useCallback((userId) => {
    if (!userId) return "Unknown";
    const user = users.find(u => u.id === userId || u.userId === userId);
    return user?.name || user?.fullName || user?.displayName || user?.email || "Unknown";
  }, [users]);

  // Load dashboard analytics data
  useEffect(() => {
    // Load borrow requests for statistics
    const borrowRequestsRef = ref(database, 'borrow_requests');

    const unsubscribeBorrowRequests = onValue(borrowRequestsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const requestsList = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));

        // 1. Check for new pending requests that need notifications
        // We only handle 'pending' reactively here because these might come from 
        // external sources (like mobile app). 'approved' and 'rejected' are
        // handled directly at the point of action in RequestFormsPage.

        if (requestsList.length > 0) {
          requestsList.forEach(async (request) => {
            const status = (request.status || '').toString().trim().toLowerCase();

            // Only trigger if this request status hasn't been notified yet
            if (status === 'pending' && request.notifiedPending) return;
            if (status === 'approved' && request.notifiedApproved) return;
            if (status === 'rejected' && request.notifiedRejected) return;

            // Check if the request is relatively recent (e.g., within last 24 hours)
            const requestTime = request.requestedAt ? new Date(request.requestedAt).getTime() : 0;
            const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
            if (requestTime < oneDayAgo && request.requestedAt) return;

            // Find the laboratory for this request
            const laboratory = laboratories.find(lab =>
              (request.labId && (lab.labId === request.labId || lab.id === request.labId)) ||
              (request.labRecordId && (lab.id === request.labRecordId || lab.labId === request.labRecordId)) ||
              (request.laboratory && (lab.labName === request.laboratory || lab.labId === request.laboratory))
            );

            if (laboratory) {
              // Find equipment within this laboratory
              const equipment = equipmentData.find(eq =>
                (eq.labId === laboratory.labId || eq.labRecordId === laboratory.id) &&
                (eq.id === request.itemId || eq.name === request.itemName || eq.itemName === request.itemName)
              );

              if (equipment) {
                const studentName = getBorrowerName(request.userId);
                const requestRef = ref(database, `borrow_requests/${request.id}`);

                // 1. Handle Pending Requests
                if (status === 'pending') {
                  await update(requestRef, { notifiedPending: true });
                  await notifyNewRequest(request, equipment, laboratory, studentName);
                }

                // 2. Handle Approved Requests (catch external approvals like mobile app)
                else if (status === 'approved') {
                  // Try to resolve the name: 
                  // 1. Look up by userId (most reliable)
                  // 2. Use stored reviewedByName
                  // 3. Fallback to adviserName if it's an instructor
                  // 4. Fallback to reviewedBy label
                  const approverName = getBorrowerName(request.reviewedByUserId);
                  const isInstructorRole = (request.reviewedBy || '').toLowerCase() === 'instructor' || (request.reviewedBy || '').toLowerCase() === 'teacher';

                  const approverInfo = (approverName !== "Unknown" && approverName !== "Unknown Borrower")
                    ? approverName
                    : request.reviewedByName ||
                    (isInstructorRole ? (request.adviserName || 'Instructor') : (laboratory?.managerName || request.adviserName || request.reviewedBy || 'Authorized Personnel'));

                  await update(requestRef, { notifiedApproved: true });
                  await notifyRequestApproved(request, equipment, laboratory, approverInfo, studentName);
                  console.log(`[Dashboard] Sent notification for approved request: ${request.id} by ${approverInfo}`);
                }

                // 3. Handle Rejected Requests
                else if (status === 'rejected') {
                  const rejecterName = getBorrowerName(request.reviewedByUserId);
                  const isInstructorRejectRole = (request.reviewedBy || '').toLowerCase() === 'instructor' || (request.reviewedBy || '').toLowerCase() === 'teacher';

                  const rejecterInfo = (rejecterName !== "Unknown" && rejecterName !== "Unknown Borrower")
                    ? rejecterName
                    : request.reviewedByName ||
                    (isInstructorRejectRole ? (request.adviserName || 'Instructor') : (laboratory?.managerName || request.adviserName || request.reviewedBy || 'Authorized Personnel'));

                  await update(requestRef, { notifiedRejected: true });
                  await notifyRequestRejected(request, equipment, laboratory, rejecterInfo, studentName);
                  console.log(`[Dashboard] Sent notification for rejected request: ${request.id} by ${rejecterInfo}`);
                }
              }
            }
          });
        }

        let requests = Object.values(data);
        if (!isAdmin()) {
          requests = requests.filter(requestBelongsToAssignedLabs);
        }

        // Calculate statistics
        const pendingCount = requests.filter(req => (req.status || '').toString().trim().toLowerCase() === 'pending').length;

        // Debug: Log all request statuses to see what's in the data
        console.log('[Dashboard] Request status breakdown:', {
          totalRequests: requests.length,
          pendingCount,
          pendingLowerCase: requests.filter(req => (req.status || '').toString().trim().toLowerCase() === 'pending').length,
          pendingUpperCase: requests.filter(req => (req.status || '').toString().trim() === 'Pending').length,
          allStatuses: requests.map(req => ({
            id: req.id,
            status: req.status,
            statusLower: (req.status || '').toString().trim().toLowerCase(),
            itemName: req.itemName,
            borrower: req.adviserName || req.userEmail
          }))
        });

        const getQuantity = (req) => {
          if (!req) return 1;
          return Number(req.quantityReleased ?? req.quantity) || 1;
        };
        // Count items that are actually released (physically borrowed)
        const borrowedCount = requests.reduce((sum, req) => {
          const status = (req.status || '').toString().trim().toLowerCase();
          if (['released', 'overdue', 'in_progress'].includes(status)) {
            return sum + getQuantity(req);
          }
          return sum;
        }, 0);

        // Verify borrowedCount matches equipment field calculation
        const borrowedFromEquipment = equipmentData.reduce((sum, item) => {
          const quantityBorrowed = Number(item.quantity_borrowed) || 0;
          return sum + quantityBorrowed;
        }, 0);

        console.log('[Dashboard] Borrowed count verification:', {
          borrowedFromRequests: borrowedCount,
          borrowedFromEquipmentField: borrowedFromEquipment,
          countsMatch: borrowedCount === borrowedFromEquipment
        });

        const overdueCount = requests.filter(req => {
          const statusValue = (req.status || '').toString().trim().toLowerCase();
          // Only released items can be overdue; items still in the laboratory should not be counted.
          if (req.dateToReturn && statusValue === 'released') {
            const dueDateTime = getDueDateTimeAtFivePm(req.dateToReturn);
            if (!dueDateTime) return false;
            return dueDateTime.getTime() < Date.now();
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
          const statusValue = (req.status || '').toString().trim().toLowerCase();
          if (statusValue === 'released' || statusValue === 'in_progress' || statusValue === 'returned') {
            const itemName = req.itemName || 'Unknown Item';
            const quantity = getQuantity(req);
            itemData[itemName] = (itemData[itemName] || 0) + quantity;
          }
        });

        // Calculate adviser vs student borrowing statistics (released items only)
        let adviserBorrowings = 0;
        let studentBorrowings = 0;
        const borrowingDetails = [];

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
          const status = (req.status || '').toString().trim().toLowerCase();
          if (['released', 'overdue', 'in_progress'].includes(status)) {
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

            // Store details for debugging
            borrowingDetails.push({
              id: req.id,
              itemName: req.itemName,
              borrower: req.adviserName || req.userEmail,
              role: borrowerRole,
              isFaculty,
              quantity,
              userId: req.userId
            });

            if (isFaculty) {
              adviserBorrowings += quantity;
            } else {
              studentBorrowings += quantity;
            }
          }
        });

        // Debug: Log instructor/student borrowing details
        console.log('[Dashboard] Instructor/Student borrowing breakdown:', {
          adviserBorrowings,
          studentBorrowings,
          totalReleasedRequests: borrowingDetails.length,
          details: borrowingDetails,
          hasAnyRequests: requests.length > 0,
          hasReleasedRequests: requests.some(req => (req.status || '').toString().trim().toLowerCase() === 'released')
        });

        // If there are no requests or no borrowed requests, set counts to 0
        const hasBorrowed = requests.some(req => ['released', 'overdue', 'in_progress'].includes((req.status || '').toString().trim().toLowerCase()));
        const finalAdviserBorrowings = (requests.length === 0 || !hasBorrowed) ? 0 : adviserBorrowings;
        const finalStudentBorrowings = (requests.length === 0 || !hasBorrowed) ? 0 : studentBorrowings;
        const finalBorrowedCount = (requests.length === 0 || !hasBorrowed) ? 0 : borrowedCount;

        console.log('[Dashboard] Final counts after validation:', {
          finalAdviserBorrowings,
          finalStudentBorrowings,
          finalBorrowedCount,
          shouldAllBeZero: requests.length === 0
        });

        setDashboardStats(prev => ({
          ...prev,
          pendingRequests: pendingCount,
          borrowedItems: finalBorrowedCount,
          overdueItems: overdueCount,
          borrowedByAdviser: finalAdviserBorrowings,
          borrowedByStudents: finalStudentBorrowings
        }));
      } else {
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
  }, [isAdmin, requestBelongsToAssignedLabs, users, borrowingTimeFilter, equipmentData, getBorrowerName, laboratories]);

  useEffect(() => {
    let equipmentList = equipmentData;
    if (!isAdmin()) {
      equipmentList = equipmentList.filter(equipmentBelongsToAssignedLabs);
    }

    const totalEquipment = equipmentList.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 1;
      return sum + quantity;
    }, 0);

    // Calculate borrowed items using quantity_borrowed field (updated by RequestFormsPage when requests are released)
    const borrowedEquipment = equipmentList.reduce((sum, item) => {
      const quantityBorrowed = Number(item.quantity_borrowed) || 0;
      return sum + quantityBorrowed;
    }, 0);

    // Calculate available items (total - borrowed)
    const availableEquipment = totalEquipment - borrowedEquipment;

    // Calculate items in stock (based on status, for backward compatibility)
    // Note: inStock calculation kept for potential future use
    setDashboardStats(prev => ({
      ...prev,
      totalEquipment,
      itemsInStock: availableEquipment, // Use calculated available instead of status-based
      availableEquipment, // Available equipment count
      borrowedEquipment, // Add borrowed equipment count
    }));
  }, [equipmentData, isAdmin, equipmentBelongsToAssignedLabs, getAssignedLaboratoryIds]);

  useEffect(() => {
    const categoriesRef = ref(database, 'equipment_categories');
    const unsubscribe = onValue(categoriesRef, (snapshot) => {
      if (!snapshot.exists()) {
        setDashboardStats(prev => ({
          ...prev,
          needMaintenance: 0
        }));
        return;
      }

      const categoriesData = snapshot.val();
      let totalScheduledToday = 0;
      const notificationQueue = [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayKey = today.toISOString().split('T')[0];

      Object.keys(categoriesData).forEach((categoryId) => {
        const category = categoriesData[categoryId] || {};
        const scheduledMaintenance = category.scheduled_maintenance || {};
        const maintenanceRecords = category.maintenance_records || {};
        const equipments = category.equipments || {};
        const categoryTitle = category.title || 'Equipment Category';

        const completedForToday = Object.values(maintenanceRecords).filter(record => {
          if (!record.datePerformed) return false;
          const completedDate = new Date(record.datePerformed);
          const userTimezoneOffset = completedDate.getTimezoneOffset() * 60000;
          const localCompletedDate = new Date(completedDate.getTime() + userTimezoneOffset);
          localCompletedDate.setHours(0, 0, 0, 0);
          return localCompletedDate.getTime() === today.getTime() && record.status === 'Completed';
        });

        Object.entries(scheduledMaintenance).forEach(([scheduleId, schedule]) => {
          if (!schedule?.scheduledDate) return;

          const scheduledDate = new Date(schedule.scheduledDate);
          if (Number.isNaN(scheduledDate.getTime())) return;
          const userTimezoneOffset = scheduledDate.getTimezoneOffset() * 60000;
          const localScheduledDate = new Date(scheduledDate.getTime() + userTimezoneOffset);
          localScheduledDate.setHours(0, 0, 0, 0);

          if (localScheduledDate.getTime() !== today.getTime()) return;

          const isCompleted = completedForToday.some(record =>
            record.equipmentId === schedule.equipmentId &&
            record.description === schedule.description &&
            record.type === schedule.type
          );

          if (isCompleted) return;

          totalScheduledToday += 1;

          const lab = laboratories.find((labItem) =>
            labItem.id === category.labRecordId ||
            labItem.labId === category.labId ||
            labItem.id === category.labId ||
            labItem.labId === category.labRecordId
          );

          if (!lab || !lab.managerUserId) return;

          const storageKey = `maintenance_${categoryId}_${scheduleId}_${todayKey}`;
          if (typeof window !== 'undefined' && localStorage.getItem(storageKey)) return;

          const equipmentEntry = equipments[schedule.equipmentId] || {};
          const equipmentName =
            equipmentEntry.name ||
            equipmentEntry.itemName ||
            equipmentEntry.title ||
            equipmentEntry.equipmentName ||
            equipmentEntry.serialNumber ||
            schedule.equipmentName ||
            'Equipment';

          notificationQueue.push({
            storageKey,
            params: {
              scheduleId,
              schedule,
              lab,
              equipmentName,
              categoryTitle,
              categoryId
            }
          });
        });
      });

      setDashboardStats(prev => ({
        ...prev,
        needMaintenance: totalScheduledToday
      }));

      notificationQueue.forEach(({ storageKey, params }) => {
        notifyMaintenanceDueToday(params)
          .then(() => {
            if (typeof window !== 'undefined') {
              localStorage.setItem(storageKey, 'true');
            }
          })
          .catch((error) => {
            console.error('Error sending maintenance notification:', error);
          });
      });
    });

    return () => unsubscribe();
  }, [laboratories]);

  useEffect(() => {
    const historyRef = ref(database, 'history');
    const unsubscribe = onValue(historyRef, (snapshot) => {
      if (snapshot.exists()) {
        const historyData = snapshot.val();
        const releasedItems = Object.values(historyData).filter((entry) => {
          const statusValue = (entry?.status || entry?.action || '').toString().trim().toLowerCase();
          // Include Released or Returned for manual entries; only Released for regular entries
          return statusValue === 'released' || (statusValue === 'returned' && entry.isManualEntry);
        });

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
            entry.quantity,
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

        const totalBorrowed = filteredEntries.reduce(
          (sum, entry) => sum + getHistoryEntryQuantity(entry),
          0
        );
        setTotalItemsBorrowedFromHistory(totalBorrowed);

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
              // 1. Direct check on the request's own laboratory identifiers
              const requestLabIds = [
                request.labRecordId,
                request.labId,
                request.laboratoryId,
                request.assignedLabId
              ].filter(Boolean);

              if (requestLabIds.some(id => assignedLabIds.includes(id))) {
                shouldShow = true;
              } else if (request.laboratory) {
                // 2. Check by laboratory name
                const lab = laboratories.find(l =>
                  l.labName === request.laboratory || l.labId === request.laboratory
                );
                if (lab && (assignedLabIds.includes(lab.id) || assignedLabIds.includes(lab.labId))) {
                  shouldShow = true;
                }
              }
            }

            if (shouldShow) {
              const status = (request.status || '').toString().trim().toLowerCase();

              // Recent Activity should ONLY display general, passive activities (released, returned)
              // High-priority alerts (pending, approved, rejected) go to Notifications modal
              if (status === 'released' || status === 'returned') {
                const quantity = request.quantityReleased || request.quantity || 1;
                const itemName = request.itemName || 'Items';
                const borrowerName = getBorrowerName(request.userId);
                const actionText = status === 'released' ? 'released to' : 'returned by';

                // Ensure we get the correct laboratory name by prioritizing the centralized laboratories list
                let labName = null;

                // 1. Try to find by request.labId
                if (request.labId) {
                  const lab = laboratories.find(l => l.labId === request.labId || l.id === request.labId);
                  if (lab) labName = lab.labName;
                }

                // 2. Try to find by category if still not found
                if (!labName && request.categoryName) {
                  const category = categoriesData ? Object.values(categoriesData).find(cat => cat.title === request.categoryName) : null;
                  if (category && category.labId) {
                    const lab = laboratories.find(l => l.labId === category.labId || l.id === category.labId);
                    if (lab) labName = lab.labName;
                  }
                }

                // 3. Fallback to what's stored in the request
                if (!labName) labName = request.laboratory || 'General Laboratory';

                activities.push({
                  id: `request_${key}`,
                  type: 'request',
                  title: `${quantity} ${itemName} ${actionText} ${borrowerName}`,
                  time: status === 'returned' && request.returnedAt
                    ? request.returnedAt
                    : request.updatedAt || request.requestedAt,
                  icon: 'success',
                  details: {
                    quantity: quantity,
                    item: itemName,
                    action: actionText,
                    borrower: borrowerName,
                    status: request.status,
                    laboratory: labName
                  },
                  labId: request.labId
                });
              }
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

        // Sort by time
        activities.sort((a, b) => new Date(b.time) - new Date(a.time));

        // Store raw activities
        setRawActivities(activities);

      } catch (error) {
        console.error("Error loading recent activity:", error);
      }
    };

    loadRecentActivity();
  }, [isAdmin, isLaboratoryManager, getAssignedLaboratoryIds, laboratories, getBorrowerName, users]);

  // Filter and process activities based on state
  useEffect(() => {
    const filtered = rawActivities
      .filter(activity => !activityStates[activity.id]?.deleted)
      .map(activity => ({
        ...activity,
        isRead: activityStates[activity.id]?.read || false
      }));

    setAllActivities(filtered);
    setRecentActivity(filtered.slice(0, 4));
  }, [rawActivities, activityStates]);

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

  const handleMarkAsRead = async (activityId) => {
    if (!user) return;
    try {
      const stateRef = ref(database, `activity_states/${user.uid}/${activityId}`);
      await update(stateRef, { read: true });
    } catch (error) {
      console.error("Error marking activity as read:", error);
    }
  };

  const handleDeleteActivity = (activityId) => {
    if (!user) return;

    setConfirmModal({
      isOpen: true,
      title: "Dismiss Activity",
      message: "Are you sure you want to dismiss this activity from your view?",
      onConfirm: async () => {
        try {
          const stateRef = ref(database, `activity_states/${user.uid}/${activityId}`);
          await update(stateRef, { deleted: true });
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          console.error("Error deleting activity:", error);
        }
      }
    });
  };

  const handleMarkAllAsRead = async () => {
    if (!user || allActivities.length === 0) return;
    try {
      const updates = {};
      allActivities.forEach(activity => {
        if (!activity.isRead) {
          updates[`${activity.id}/read`] = true;
        }
      });

      if (Object.keys(updates).length > 0) {
        const statesRef = ref(database, `activity_states/${user.uid}`);
        await update(statesRef, updates);
      }
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const handleDeleteAllActivities = () => {
    if (!user || allActivities.length === 0) return;

    setConfirmModal({
      isOpen: true,
      title: "Dismiss All Activities",
      message: "Are you sure you want to dismiss all current activities from your view?",
      onConfirm: async () => {
        try {
          setIsClearingActivities(true);
          const updates = {};
          allActivities.forEach(activity => {
            updates[`${activity.id}/deleted`] = true;
          });

          if (Object.keys(updates).length > 0) {
            const statesRef = ref(database, `activity_states/${user.uid}`);
            await update(statesRef, updates);
          }
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          console.error("Error deleting all activities:", error);
        } finally {
          setIsClearingActivities(false);
        }
      }
    });
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
                <div className="stat-label">Items Borrowed by Faculty</div>
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
              <div className="stat-card-small info">
                <div className="stat-number">{totalItemsBorrowedFromHistory.toLocaleString()}</div>
                <div className="stat-label">Total Items Borrowed</div>
              </div>
              <div className="stat-card-small">
                <div className="stat-number">{dashboardStats.totalEquipment.toLocaleString()}</div>
                <div className="stat-label">Total Equipment</div>
              </div>
              <div className="stat-card-small success">
                <div className="stat-number">{dashboardStats.availableEquipment.toLocaleString()}</div>
                <div className="stat-label">Available Equipment</div>
                <div className="stat-subtext">
                  {dashboardStats.totalEquipment > 0
                    ? `${Math.round((dashboardStats.availableEquipment / dashboardStats.totalEquipment) * 100)}% of total`
                    : 'No equipment'}
                </div>
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
                        <div className={`activity-icon ${activity.icon} ${activity.isRead ? 'read' : 'unread'}`}>
                          {!activity.isRead && <span className="unread-dot"></span>}
                        </div>
                        <div className="activity-content">
                          <div className="activity-title">
                            {renderActivityTitle(activity)}
                          </div>
                          {activity.details && activity.details.item && activity.type !== 'request' && (
                            <div className="activity-details">
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
                      <div className="activity-icon info"></div>
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

      case "admin-lab-equipment":
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
        return <AdminLabEquipment />;

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

      case "damaged-lost":
        if (!isAdmin() && !isLaboratoryManager()) {
          return (
            <div className="dashboard-content-centered">
              <div className="access-denied">
                <h1>Access Denied</h1>
                <p>You don't have permission to access this section. Admin or Laboratory Manager privileges required.</p>
              </div>
            </div>
          );
        }
        return <DamagedLostRecords />;

      case "data-consistency":
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
        return <DataConsistencyAudit />;

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

  // Helper to render activity title with colored highlights
  const renderActivityTitle = (activity) => {
    if (activity.type !== 'request' || !activity.details) return activity.title;

    const { quantity, item, borrower } = activity.details;
    const actionText = activity.title.includes('released') ? 'released to' : 'returned by';

    // We'll use the quantity and item name, then the action, then borrower, then lab
    // Find quantity in title if not in details
    const displayQuantity = quantity || activity.title.split(' ')[0] || '1';

    return (
      <div className="activity-title-container">
        <div className="activity-title-main">
          <span className="activity-item-quantity">{displayQuantity} </span>
          <span className="activity-highlight">{item} </span>
          <span className="activity-action">{actionText} </span>
          <span className="activity-borrower-name">{borrower} </span>
        </div>
      </div>
    );
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
          onRedirect={handleSectionChange}
        />
      )}

      {showAllActivitiesModal && (
        <div className="notification-overlay">
          <div className="notification-modal" style={{ maxWidth: '800px' }}>
            <div className="notification-header">
              <h2>Recent Activities</h2>
              <div className="notification-controls">
                <select
                  value={activityFilter}
                  onChange={(e) => setActivityFilter(e.target.value)}
                  className="notification-filter"
                >
                  <option value="all">All ({allActivities.length})</option>
                  <option value="unread">Unread ({allActivities.filter(a => !a.isRead).length})</option>
                  <option value="read">Read ({allActivities.filter(a => a.isRead).length})</option>
                </select>

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
                    exportToPDF(allActivities, 'Recent Activities', formatActivities);
                  }}
                  className="btn btn-sm btn-primary"
                  style={{ borderRadius: '999px', height: '36px', display: 'flex', alignItems: 'center' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  Export
                </button>

                {allActivities.some(a => !a.isRead) && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="mark-all-read-btn"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Mark All Read
                  </button>
                )}

                {allActivities.length > 0 && (
                  <button
                    onClick={handleDeleteAllActivities}
                    className="clear-all-btn"
                    disabled={isClearingActivities}
                    style={{ display: 'flex', alignItems: 'center' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                    {isClearingActivities ? 'Deleting...' : 'Delete All'}
                  </button>
                )}

                <button onClick={() => setShowAllActivitiesModal(false)} className="close-btn">✖</button>
              </div>
            </div>
            <div className="notification-content">
              <div className="notification-list">
                {allActivities
                  .filter(activity => {
                    if (activityFilter === 'unread') return !activity.isRead;
                    if (activityFilter === 'read') return activity.isRead;
                    return true;
                  })
                  .map((activity) => (
                    <div
                      key={activity.id}
                      className={`notification-item ${activity.isRead ? 'read' : 'unread'}`}
                      style={{ cursor: 'default' }}
                    >
                      <div className={`notification-icon ${activity.icon}`}>
                      </div>
                      <div className="notification-body">
                        <div className="notification-title">
                          {renderActivityTitle(activity)}
                        </div>
                        {activity.details && activity.type !== 'request' && (
                          <div className="notification-message">
                            {activity.details.author && (
                              <span className="activity-author">by {activity.details.author}</span>
                            )}
                            {activity.details.totalEquipment && (
                              <span>Total inventory: {activity.details.totalEquipment} items</span>
                            )}
                          </div>
                        )}
                        <div className="notification-meta">
                          <span className="notification-time">{formatDate(activity.time)}</span>
                          {activity.details?.laboratory && (
                            <span className="notification-lab">Lab: {activity.details.laboratory}</span>
                          )}
                        </div>
                      </div>

                      <div className="activity-actions-inline" style={{ alignSelf: 'center', opacity: 1 }}>
                        {!activity.isRead && (
                          <button
                            className="action-btn-small read-btn"
                            onClick={() => handleMarkAsRead(activity.id)}
                            title="Mark as read"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          </button>
                        )}
                        <button
                          className="action-btn-small delete-btn"
                          onClick={() => handleDeleteActivity(activity.id)}
                          title="Delete"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                          </svg>
                        </button>
                      </div>

                      {!activity.isRead && <div className="unread-indicator"></div>}
                    </div>
                  ))}

                {allActivities.length === 0 && (
                  <div className="no-notifications">
                    <div className="no-notifications-icon"></div>
                    <p>No activities to show.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <DeleteConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="Dismiss"
      />
    </div>
  );
}