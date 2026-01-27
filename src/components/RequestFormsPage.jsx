// src/components/RequestFormsPage.jsx
import React, { useState, useEffect } from "react";
import { ref, onValue, update, remove, get, push } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  notifyNewRequest,
  notifyRequestApproved,
  notifyRequestRejected,
  notifyEquipmentReturned,
} from "../utils/notificationUtils";
import { exportToPDF, printActivities } from "../utils/pdfUtils";
import "../CSS/RequestFormsPage.css";
import eyeIcon from '../images/eye.png';
import releaseIcon from '../images/release.png';
import rejectIcon from '../images/rejected.png';
import deleteIcon from '../images/delete.png';
import returnIcon from '../images/return.png';
import approveIcon from '../images/approve.png';

export default function RequestFormsPage() {
  const { isAdmin, getAssignedLaboratoryIds } = useAuth();
  const [allRequests, setAllRequests] = useState([]);
  const [requests, setRequests] = useState([]);
  const [equipmentData, setEquipmentData] = useState([]);
  const [laboratories, setLaboratories] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [filterBatch, setFilterBatch] = useState("All"); // "All", "Batch", "Individual"
  const [groupByBatch, setGroupByBatch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Add these missing state variables
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [signatureCanvasRef, setSignatureCanvasRef] = useState(null);
  const [returnFormData, setReturnFormData] = useState({
    condition: "good",
    conditionNotes: "",
    delayReason: "",
    delayNotes: "",
    notes: "",
    returnedQuantity: "1",
  });
  const [showReleaseConfirmation, setShowReleaseConfirmation] = useState(false);
  const [requestToRelease, setRequestToRelease] = useState(null);

  const statuses = [
    "pending",
    "approved",
    "released",
    "rejected",
    "in_progress",
    "returned",
  ];
  const requestTypes = [
    "Alcohol",
    "Laboratory Equipment",
    "Chemicals",
    "Other",
  ];

  // Load laboratories data
  const loadLaboratories = async () => {
    try {
      const laboratoriesRef = ref(database, "laboratories");
      const snapshot = await get(laboratoriesRef);

      if (snapshot.exists()) {
        const laboratoriesData = snapshot.val();
        const laboratoriesList = Object.keys(laboratoriesData).map((key) => ({
          id: key,
          ...laboratoriesData[key],
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
      const categoriesRef = ref(database, "equipment_categories");
      const snapshot = await get(categoriesRef);

      if (snapshot.exists()) {
        const categoriesData = snapshot.val();
        const allEquipment = [];

        // Load equipment from each category
        for (const categoryId in categoriesData) {
          const equipmentsRef = ref(
            database,
            `equipment_categories/${categoryId}/equipments`
          );
          const equipmentsSnapshot = await get(equipmentsRef);

          if (equipmentsSnapshot.exists()) {
            const equipmentData = equipmentsSnapshot.val();
            Object.keys(equipmentData).forEach((equipmentId) => {
              allEquipment.push({
                id: equipmentId,
                categoryId: categoryId,
                categoryName: categoriesData[categoryId].title,
                ...equipmentData[equipmentId],
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
      const usersRef = ref(database, "users");
      const snapshot = await get(usersRef);

      if (snapshot.exists()) {
        const usersData = snapshot.val();
        const usersList = Object.keys(usersData).map((key) => ({
          id: key,
          ...usersData[key],
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
    const user = users.find((u) => u.id === userId || u.userId === userId);
    return (
      user?.name ||
      user?.fullName ||
      user?.displayName ||
      user?.email ||
      "Unknown"
    );
  };

  // Check for new requests and create notifications
  const checkForNewRequests = async (requestsList) => {
    if (!equipmentData.length || !laboratories.length) return;

    // Get previously processed request IDs from localStorage
    const processedRequests = JSON.parse(
      localStorage.getItem("processedRequests") || "[]"
    );

    // Find new requests (pending status and not previously processed)
    const newRequests = requestsList.filter(
      (request) =>
        request.status === "pending" && !processedRequests.includes(request.id)
    );

    // Create notifications for new requests
    for (const request of newRequests) {
      // Find equipment data
      const equipment = equipmentData.find(
        (eq) =>
          eq.equipmentName === request.itemName ||
          eq.itemName === request.itemName ||
          eq.name === request.itemName ||
          eq.title === request.itemName
      );

      // Find laboratory data
      const laboratory = laboratories.find(
        (lab) => lab.labId === equipment?.labId
      );

      if (equipment && laboratory) {
        const studentName = getBorrowerName(request.userId);
        await notifyNewRequest(request, equipment, laboratory, studentName);
      }

      // Mark as processed
      processedRequests.push(request.id);
    }

    // Update localStorage with processed requests
    localStorage.setItem(
      "processedRequests",
      JSON.stringify(processedRequests)
    );
  };

  // Load static data once on mount
  useEffect(() => {
    loadLaboratories();
    loadEquipmentData();
    loadUsers();
  }, []);

  // Subscribe to borrow requests once
  useEffect(() => {
    const borrowRequestsRef = ref(database, "borrow_requests");
    const unsubscribe = onValue(borrowRequestsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const requestsList = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        setAllRequests(requestsList);
      } else {
        setAllRequests([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Check for new requests when dependencies are ready
  useEffect(() => {
    if (
      allRequests.length > 0 &&
      equipmentData.length > 0 &&
      laboratories.length > 0
    ) {
      checkForNewRequests(allRequests);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRequests, equipmentData, laboratories]);

  // Filter requests based on user role and assigned laboratories
  useEffect(() => {
    if (allRequests.length > 0) {
      let filteredRequests = allRequests;

      if (!isAdmin()) {
        const assignedLabIds = getAssignedLaboratoryIds();
        if (
          assignedLabIds &&
          equipmentData.length > 0 &&
          laboratories.length > 0
        ) {
          console.log("Filtering requests for Lab Manager:", {
            totalRequests: allRequests.length,
            assignedLabIds: assignedLabIds,
            equipmentCount: equipmentData.length,
            laboratoriesCount: laboratories.length,
          });

          // Filter requests to only show those from assigned laboratories
          filteredRequests = allRequests.filter((request) => {
            // Find the equipment that matches this request
            const matchingEquipment = equipmentData.find(
              (equipment) =>
                equipment.equipmentName === request.itemName ||
                equipment.itemName === request.itemName ||
                equipment.name === request.itemName ||
                equipment.title === request.itemName
            );

            if (matchingEquipment && matchingEquipment.labId) {
              // Find the laboratory that matches this equipment's labId
              const laboratory = laboratories.find(
                (lab) => lab.labId === matchingEquipment.labId
              );

              if (laboratory) {
                // Check if this laboratory is assigned to the current user
                const isAssigned = assignedLabIds.includes(laboratory.id);
                console.log(
                  `Request "${request.itemName}" from lab "${laboratory.labName}" (${laboratory.id}) - Assigned: ${isAssigned}`
                );
                return isAssigned;
              }
            }

            // If no matching equipment or laboratory found, don't show the request
            console.log(
              `Request "${request.itemName}" - No matching equipment/lab found`
            );
            return false;
          });

          console.log(
            `Filtered requests: ${filteredRequests.length} out of ${allRequests.length}`
          );
        } else {
          console.log("No assigned labs or missing data:", {
            assignedLabIds,
            equipmentCount: equipmentData.length,
            laboratoriesCount: laboratories.length,
          });
          filteredRequests = []; // Show no requests if we can't determine lab assignment
        }
      }

      // Sort by creation date, newest first
      filteredRequests.sort(
        (a, b) =>
          new Date(a.requestedAt || a.dateToBeUsed) -
          new Date(b.requestedAt || b.dateToBeUsed)
      );
      setRequests(filteredRequests);
    } else {
      setRequests([]);
    }
  }, [
    allRequests,
    equipmentData,
    laboratories,
    isAdmin,
    getAssignedLaboratoryIds,
  ]);

  // Filter and sort requests
  const filteredRequests = requests
    .filter((request) => {
      const borrowerName = getBorrowerName(request.userId);
      const matchesSearch =
        request.itemName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        request.adviserName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        borrowerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        request.categoryName
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        request.laboratory?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        request.itemNo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        request.batchId?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        filterStatus === "All" || request.status === filterStatus;
      const matchesType =
        filterType === "All" || request.categoryName === filterType;
      const matchesBatch =
        filterBatch === "All" ||
        (filterBatch === "Batch" && request.batchId) ||
        (filterBatch === "Individual" && !request.batchId);
      return matchesSearch && matchesStatus && matchesType && matchesBatch;
    })
    .sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      if (
        sortBy === "requestedAt" ||
        sortBy === "dateToBeUsed" ||
        sortBy === "dateToReturn"
      ) {
        aValue = new Date(aValue);
        bValue = new Date(bValue);
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

  // Group requests by batchId if grouping is enabled
  const groupedRequests = groupByBatch
    ? (() => {
        const groups = {};
        filteredRequests.forEach((request) => {
          const key = request.batchId || "individual";
          if (!groups[key]) {
            groups[key] = {
              batchId: request.batchId,
              batchSize: request.batchSize,
              requests: [],
              isBatch: !!request.batchId,
            };
          }
          groups[key].requests.push(request);
        });
        return Object.values(groups);
      })()
    : null;

  // Pagination calculations
  const totalItems = filteredRequests.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedRequests = filteredRequests.slice(startIndex, endIndex);
  const showingStart = totalItems === 0 ? 0 : startIndex + 1;
  const showingEnd = totalItems === 0 ? 0 : endIndex;

  useEffect(() => {
    // Reset to first page when filters/search/sort change
    setCurrentPage(1);
  }, [
    searchTerm,
    filterStatus,
    filterType,
    filterBatch,
    groupByBatch,
    sortBy,
    sortOrder,
  ]);

  const goToPage = (page) => {
    const target = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(target);
  };

  const renderPaginationPages = () => {
    const pages = [];
    if (totalPages === 0) return pages;

    let start = Math.max(1, safeCurrentPage - 1);
    let end = Math.min(totalPages, start + 2);

    if (end - start < 2) {
      start = Math.max(1, end - 2);
    }

    for (let page = start; page <= end; page += 1) {
      pages.push(
        <button
          key={page}
          onClick={() => goToPage(page)}
          className={`request-pagination-page${safeCurrentPage === page ? " active" : ""}`}
          aria-label={`Go to page ${page}`}
        >
          {page}
        </button>
      );
    }

    return pages;
  };

  const handleStatusUpdate = async (
    requestId,
    newStatus,
    returnDetails = null
  ) => {
    try {
      const requestRef = ref(database, `borrow_requests/${requestId}`);
      const updateData = {
        status: newStatus,
        updatedAt: new Date().toISOString(),
        reviewedBy: "Admin", // You can get actual admin name from auth
      };

      // Add return details if provided
      if (returnDetails) {
        updateData.returnDetails = returnDetails;
        updateData.returnedAt = new Date().toISOString();
      }

      // Find the request data
      const requestData = allRequests.find((req) => req.id === requestId);
      if (!requestData) {
        alert("Request not found");
        return;
      }

      // Find equipment data - try itemId first, then fallback to name matching
      let equipment = null;
      if (requestData.itemId && requestData.categoryId) {
        // Try to find by itemId and categoryId
        equipment = equipmentData.find(
          (eq) =>
            eq.id === requestData.itemId &&
            eq.categoryId === requestData.categoryId
        );
      }

      // Fallback to name matching
      if (!equipment) {
        equipment = equipmentData.find(
          (eq) =>
            eq.equipmentName === requestData.itemName ||
            eq.itemName === requestData.itemName ||
            eq.name === requestData.itemName ||
            eq.title === requestData.itemName
        );
      }

      // Manage quantity_borrowed based on status change
      if (
        equipment &&
        requestData.categoryId &&
        (requestData.itemId || equipment.id)
      ) {
        const equipmentId = requestData.itemId || equipment.id;
        const categoryId = requestData.categoryId || equipment.categoryId;
        const requestedQuantity = parseInt(requestData.quantity) || 1;
        const returnedQuantityValue =
          returnDetails && newStatus === "returned"
            ? parseInt(returnDetails.returnedQuantity) || requestedQuantity
            : requestedQuantity;

        const equipmentRef = ref(
          database,
          `equipment_categories/${categoryId}/equipments/${equipmentId}`
        );
        const equipmentSnapshot = await get(equipmentRef);
        const currentEquipment = equipmentSnapshot.exists()
          ? equipmentSnapshot.val()
          : null;

        if (currentEquipment) {
          const currentBorrowed = currentEquipment.quantity_borrowed || 0;
          const totalQuantity = parseInt(currentEquipment.quantity) || 0;

          let newBorrowed = currentBorrowed;
          let updatedQuantity = totalQuantity;

          const countedStatuses = ["released"];
          const wasCounted = countedStatuses.includes(requestData.status);
          const willBeCounted = countedStatuses.includes(newStatus);

          // Handle quantity_borrowed updates based on status changes that affect released items
          if (willBeCounted && !wasCounted) {
            // Increment when items are actually released
            const availableQuantity = totalQuantity - currentBorrowed;
            if (availableQuantity < requestedQuantity) {
              alert(
                `Cannot release: Only ${availableQuantity} available, but ${requestedQuantity} requested.`
              );
              return;
            }
            newBorrowed = currentBorrowed + requestedQuantity;
          } else if (!willBeCounted && wasCounted) {
            // Decrement when items leave the released state (returned/rejected/etc.)
            newBorrowed = Math.max(0, currentBorrowed - requestedQuantity);

            if (newStatus === "returned") {
              // If items were not fully returned, reflect the loss in total quantity
              const shortage = Math.max(0, requestedQuantity - returnedQuantityValue);
              if (shortage > 0) {
                updatedQuantity = Math.max(0, totalQuantity - shortage);
              }
            }
          }

          // Update quantity_borrowed if it changed
          const equipmentUpdates = {};
          if (newBorrowed !== currentBorrowed) {
            equipmentUpdates.quantity_borrowed = newBorrowed;
          }
          if (updatedQuantity !== totalQuantity) {
            equipmentUpdates.quantity = updatedQuantity;
          }

          if (Object.keys(equipmentUpdates).length > 0) {
            await update(equipmentRef, equipmentUpdates);
          }
        }
      }

      // Record release entry in history when status changes to released
      if (newStatus === "released") {
        const releasedAt = new Date().toISOString();
        const historyRef = ref(database, "history");

        // Find equipment data
        let equipment = null;
        if (requestData.itemId && requestData.categoryId) {
          // Try to find by itemId and categoryId
          equipment = equipmentData.find(
            (eq) =>
              eq.id === requestData.itemId &&
              eq.categoryId === requestData.categoryId
          );
        }

        // Fallback to name matching
        if (!equipment) {
          equipment = equipmentData.find(
            (eq) =>
              eq.equipmentName === requestData.itemName ||
              eq.itemName === requestData.itemName ||
              eq.name === requestData.itemName ||
              eq.title === requestData.itemName
          );
        }

        // Find laboratory data
        const laboratory = equipment
          ? laboratories.find((lab) => lab.labId === equipment.labId)
          : laboratories.find(
              (lab) =>
                lab.labName === requestData.laboratory ||
                lab.labId === requestData.labId
            );

        const releaseEntry = {
          requestId: requestData.id,
          itemId: requestData.itemId || "",
          categoryId: requestData.categoryId || "",
          categoryName: requestData.categoryName || "",
          equipmentName: requestData.itemName || "Unknown item",
          borrower: getBorrowerName(requestData.userId),
          userId: requestData.userId || "",
          borrowerEmail: requestData.userEmail || "",
          adviserName: requestData.adviserName || "",
          quantity: requestData.quantity || 1,
          laboratory: requestData.laboratory || laboratory?.labName || "",
          labId:
            laboratory?.labId || equipment?.labId || requestData.labId || "",
          labRecordId: laboratory?.id || "",
          batchId: requestData.batchId || null,
          batchSize: requestData.batchSize || null,
          status: "Released",
          action: "Item Released",
          releasedDate: releasedAt,
          returnDate: null,
          condition: "Item released to borrower",
          timestamp: releasedAt,
          processedBy: requestData.reviewedBy || "Admin",
          returnDetails: null,
          entryType: "release",
        };

        await push(historyRef, releaseEntry);
      }

      // Record rejection entry in history when status changes to rejected
      if (newStatus === "rejected") {
        const rejectedAt = new Date().toISOString();
        const historyRef = ref(database, "history");

        // Find equipment data
        let equipment = null;
        if (requestData.itemId && requestData.categoryId) {
          // Try to find by itemId and categoryId
          equipment = equipmentData.find(
            (eq) =>
              eq.id === requestData.itemId &&
              eq.categoryId === requestData.categoryId
          );
        }

        // Fallback to name matching
        if (!equipment) {
          equipment = equipmentData.find(
            (eq) =>
              eq.equipmentName === requestData.itemName ||
              eq.itemName === requestData.itemName ||
              eq.name === requestData.itemName ||
              eq.title === requestData.itemName
          );
        }

        // Find laboratory data
        const laboratory = equipment
          ? laboratories.find((lab) => lab.labId === equipment.labId)
          : laboratories.find(
              (lab) =>
                lab.labName === requestData.laboratory ||
                lab.labId === requestData.labId
            );

        const rejectionEntry = {
          requestId: requestData.id,
          itemId: requestData.itemId || "",
          categoryId: requestData.categoryId || "",
          categoryName: requestData.categoryName || "",
          equipmentName: requestData.itemName || "Unknown item",
          borrower: getBorrowerName(requestData.userId),
          userId: requestData.userId || "",
          borrowerEmail: requestData.userEmail || "",
          adviserName: requestData.adviserName || "",
          quantity: requestData.quantity || 1,
          laboratory: requestData.laboratory || laboratory?.labName || "",
          labId:
            laboratory?.labId || equipment?.labId || requestData.labId || "",
          labRecordId: laboratory?.id || "",
          batchId: requestData.batchId || null,
          batchSize: requestData.batchSize || null,
          status: "Rejected",
          action: "Request Rejected",
          releasedDate: null,
          returnDate: null,
          rejectedDate: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          condition: "Request rejected by Lab in charge",
          timestamp: rejectedAt,
          processedBy: requestData.reviewedBy || "Admin",
          returnDetails: null,
          entryType: "rejection",
        };

        await push(historyRef, rejectionEntry);
      }

      // Remove rejection entry from history when status changes from rejected to approved
      if (newStatus === "approved" && requestData.status === "rejected") {
        const historyRef = ref(database, "history");
        const historySnapshot = await get(historyRef);

        if (historySnapshot.exists()) {
          const historyData = historySnapshot.val();
          const rejectionEntries = Object.keys(historyData).filter(
            (key) =>
              historyData[key].requestId === requestData.id &&
              historyData[key].entryType === "rejection"
          );

          // Remove all rejection entries for this request
          for (const entryKey of rejectionEntries) {
            await remove(ref(database, `history/${entryKey}`));
          }
        }
      }

      await update(requestRef, updateData);

      // Send notifications based on status change
      if (equipment) {
        // Find laboratory data
        const laboratory = laboratories.find(
          (lab) => lab.labId === equipment?.labId
        );

        if (laboratory) {
          switch (newStatus) {
            case "approved":
              await notifyRequestApproved(
                requestData,
                equipment,
                laboratory,
                "Admin",
                getBorrowerName(requestData.userId)
              );
              break;
            case "rejected":
              await notifyRequestRejected(
                requestData,
                equipment,
                laboratory,
                "Admin"
              );
              break;
            case "returned":
              await notifyEquipmentReturned(
                requestData,
                equipment,
                laboratory,
                returnDetails,
                getBorrowerName(requestData.userId)
              );
              break;
            default:
              // No notification needed for other statuses
              break;
          }
        }
      }

      // Update local state for both allRequests and filtered requests
      setAllRequests((prev) =>
        prev.map((request) =>
          request.id === requestId
            ? {
                ...request,
                status: newStatus,
                updatedAt: new Date().toISOString(),
                ...(returnDetails && {
                  returnDetails,
                  returnedAt: new Date().toISOString(),
                }),
              }
            : request
        )
      );

      setRequests((prev) =>
        prev.map((request) =>
          request.id === requestId
            ? {
                ...request,
                status: newStatus,
                updatedAt: new Date().toISOString(),
                ...(returnDetails && {
                  returnDetails,
                  returnedAt: new Date().toISOString(),
                }),
              }
            : request
        )
      );
    } catch (error) {
      console.error("Error updating request status:", error);
      alert("Failed to update request status. Please try again.");
    }
  };

  const handleDeleteRequest = async (requestId) => {
    if (
      window.confirm("Are you sure you want to delete this borrow request?")
    ) {
      try {
        const requestRef = ref(database, `borrow_requests/${requestId}`);
        await remove(requestRef);
      } catch (error) {
        console.error("Error deleting request:", error);
        alert("Failed to delete request. Please try again.");
      }
    }
  };

  // Batch actions
  const handleBatchAction = async (batchId, action) => {
    if (!batchId) return;

    const batchRequests = allRequests.filter((req) => req.batchId === batchId);
    if (batchRequests.length === 0) {
      alert("No requests found in this batch");
      return;
    }

    const actionText = action === "approved" ? "approve" : "reject";
    if (
      !window.confirm(
        `Are you sure you want to ${actionText} all ${batchRequests.length} items in this batch?`
      )
    ) {
      return;
    }

    try {
      // Process all requests in the batch
      for (const request of batchRequests) {
        await handleStatusUpdate(request.id, action);
      }
      alert(`Batch ${actionText}d successfully!`);
    } catch (error) {
      console.error(`Error ${actionText}ing batch:`, error);
      alert(`Failed to ${actionText} batch. Please try again.`);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case "pending":
        return "status-pending";
      case "approved":
        return "status-approved";
      case "released":
        return "status-released";
      case "rejected":
        return "status-rejected";
      case "in_progress":
        return "status-progress";
      case "returned":
        return "status-returned";
      default:
        return "status-pending";
    }
  };

  // Signature handling functions
  const decodeSignature = (base64String) => {
    try {
      if (!base64String) return null;
      const decoded = atob(base64String);
      return JSON.parse(decoded);
    } catch (error) {
      console.error("Error decoding signature:", error);
      return null;
    }
  };

  const renderSignature = (signatureData, canvas) => {
    if (!signatureData || !canvas) return;

    try {
      const ctx = canvas.getContext("2d");
      const { points, strokeWidth } = signatureData;

      if (!points || points.length === 0) return;

      // Set canvas size
      canvas.width = 400;
      canvas.height = 200;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Set drawing style
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = strokeWidth || 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Find bounds to scale signature to canvas
      const bounds = points.reduce(
        (acc, point) => {
          if (point.x !== undefined && point.y !== undefined) {
            acc.minX = Math.min(acc.minX, point.x);
            acc.maxX = Math.max(acc.maxX, point.x);
            acc.minY = Math.min(acc.minY, point.y);
            acc.maxY = Math.max(acc.maxY, point.y);
          }
          return acc;
        },
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      );

      const width = bounds.maxX - bounds.minX || 1;
      const height = bounds.maxY - bounds.minY || 1;
      const scaleX = (canvas.width - 20) / width;
      const scaleY = (canvas.height - 20) / height;
      const scale = Math.min(scaleX, scaleY);

      const offsetX = (canvas.width - width * scale) / 2 - bounds.minX * scale;
      const offsetY =
        (canvas.height - height * scale) / 2 - bounds.minY * scale;

      // Draw signature
      let isDrawing = false;
      points.forEach((point, index) => {
        if (point.x === undefined || point.y === undefined) return;

        const x = point.x * scale + offsetX;
        const y = point.y * scale + offsetY;

        if (point.isNewStroke || index === 0) {
          // End previous stroke if any
          if (isDrawing) {
            ctx.stroke();
          }
          // Start new stroke
          ctx.beginPath();
          ctx.moveTo(x, y);
          isDrawing = true;
        } else if (isDrawing) {
          // Continue current stroke
          ctx.lineTo(x, y);
        }
      });

      // Final stroke
      if (isDrawing) {
        ctx.stroke();
      }
    } catch (error) {
      console.error("Error rendering signature:", error);
    }
  };

  // Effect to render signature when canvas is ready
  useEffect(() => {
    if (showSignature && signatureCanvasRef && selectedRequest?.signature) {
      const signatureData = decodeSignature(selectedRequest.signature);
      if (signatureData) {
        renderSignature(signatureData, signatureCanvasRef);
      }
    }
  }, [showSignature, signatureCanvasRef, selectedRequest?.signature]);

  const handleViewDetails = (request) => {
    setSelectedRequest(request);
    setShowDetailsModal(true);
    setShowSignature(false); // Reset signature view when opening new request
  };

  const closeDetailsModal = () => {
    setSelectedRequest(null);
    setShowDetailsModal(false);
    setShowSignature(false);
  };

  const openReturnModal = (request) => {
    setSelectedRequest(request);
    setReturnFormData({
      condition: "good",
      conditionNotes: "",
      delayReason: "",
      delayNotes: "",
      notes: "",
      returnedQuantity: String(request.quantity || 1),
    });
    setShowReturnModal(true);
  };

  const closeReturnModal = () => {
    setSelectedRequest(null);
    setShowReturnModal(false);
    setReturnFormData({
      condition: "good",
      conditionNotes: "",
      delayReason: "",
      delayNotes: "",
      notes: "",
      returnedQuantity: "1",
    });
  };

  const recordHistoryEntry = async (request, returnDetails, returnedAt) => {
    const historyRef = ref(database, "history");
    const matchingEquipment = equipmentData.find(
      (eq) =>
        eq.equipmentName === request.itemName ||
        eq.itemName === request.itemName ||
        eq.name === request.itemName ||
        eq.title === request.itemName
    );

    const laboratory = matchingEquipment
      ? laboratories.find((lab) => lab.labId === matchingEquipment.labId)
      : laboratories.find(
          (lab) =>
            lab.labName === request.laboratory || lab.labId === request.labId
        );

    const borrowedQuantity = parseInt(request.quantity, 10) || 1;
    const returnedQuantity = parseInt(returnDetails?.returnedQuantity, 10);
    const hasInsufficientReturn =
      Number.isFinite(returnedQuantity) && returnedQuantity < borrowedQuantity;

    const conditionText = (() => {
      const baseCondition = returnDetails?.condition;

      // When quantity returned is less than borrowed, still respect explicit lost/missing
      // so that analytics can treat this as a lost-item case.
      if (hasInsufficientReturn) {
        if (baseCondition === "lost" || baseCondition === "missing") {
          return "Item lost/missing (insufficient return)";
        }
        return "Item borrowed are Insufficient";
      }

      switch (baseCondition) {
        case "good":
          return "Returned in good condition";
        case "damaged":
          return "Returned damaged";
        case "lost":
        case "missing":
          return "Item lost/missing";
        default:
          return "Returned";
      }
    })();

    const historyEntry = {
      requestId: request.id,
      itemId: request.itemId || "",
      categoryId: request.categoryId || "",
      categoryName: request.categoryName || "",
      equipmentName: request.itemName || "Unknown item",
      borrower: getBorrowerName(request.userId),
      userId: request.userId || "",
      borrowerEmail: request.userEmail || "",
      adviserName: request.adviserName || "",
      quantity: request.quantity || 1,
      laboratory: request.laboratory || laboratory?.labName || "",
      labId:
        laboratory?.labId || matchingEquipment?.labId || request.labId || "",
      labRecordId: laboratory?.id || "",
      batchId: request.batchId || null,
      batchSize: request.batchSize || null,
      status: "Returned",
      action: "Item Returned",
      releasedDate: request.requestedAt || request.dateToBeUsed || returnedAt,
      returnDate: returnedAt,
      dateToReturn: request.dateToReturn || null, // Store expected return date for late returns analysis
      condition: conditionText,
      timestamp: returnedAt,
      processedBy: returnDetails?.processedBy || "Admin",
      returnDetails: returnDetails || null,
      entryType: "return",
    };

    await push(historyRef, historyEntry);
  };

  const handleReturnSubmit = async () => {
    if (!selectedRequest) return;

    try {
      const requestedQuantity = parseInt(selectedRequest.quantity, 10) || 1;
      const parsedReturnedQuantity = parseInt(
        returnFormData.returnedQuantity,
        10
      );
      let adjustedReturnedQuantity = Number.isFinite(parsedReturnedQuantity)
        ? parsedReturnedQuantity
        : requestedQuantity;

      adjustedReturnedQuantity = Math.max(
        1,
        Math.min(requestedQuantity, adjustedReturnedQuantity)
      );

      if (adjustedReturnedQuantity !== parsedReturnedQuantity) {
        setReturnFormData((prev) => ({
          ...prev,
          returnedQuantity: String(adjustedReturnedQuantity),
        }));
      }

      const lateReturnDescription =
        returnFormData.delayReason === "late"
          ? returnFormData.delayNotes || ""
          : "";
      const additionalNotes = returnFormData.notes || "";

      const returnDetails = {
        condition: returnFormData.condition,
        conditionNotes: returnFormData.conditionNotes,
        delayReason: returnFormData.delayReason,
        delayNotes: lateReturnDescription,
        notes: additionalNotes,
        returnedQuantity: adjustedReturnedQuantity,
        processedBy: "Admin", // You can get actual admin name from auth
      };

      const returnedAt = new Date().toISOString();

      // Update status to returned to trigger notifications
      await handleStatusUpdate(selectedRequest.id, "returned", returnDetails);

      // Record in history collection
      await recordHistoryEntry(selectedRequest, returnDetails, returnedAt);

      // Remove the request from active list
      const requestRef = ref(database, `borrow_requests/${selectedRequest.id}`);
      await remove(requestRef);

      setAllRequests((prev) =>
        prev.filter((request) => request.id !== selectedRequest.id)
      );
      setRequests((prev) =>
        prev.filter((request) => request.id !== selectedRequest.id)
      );

      closeReturnModal();
      closeDetailsModal();
      alert("Item marked as returned successfully!");
    } catch (error) {
      console.error("Error processing return:", error);
      alert("Failed to process return. Please try again.");
    }
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
    if (sortBy !== field) return "↕️";
    return sortOrder === "asc" ? "↑" : "↓";
  };

  if (loading) {
    return (
      <div className="request-forms-page">
        <div className="loading-container">
          <div className="loading-content">
            <div className="loading-icon">📋</div>
            <div className="loading-text">Loading request forms...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="request-forms-page">
      {/* Page Header */}
      <div className="request-forms-header">
        <div className="header-content">
          <h1 className="page-title">Item Request Management</h1>
          <p className="page-subtitle">
            Review and manage user requests for equipment and services
          </p>
        </div>
        <div
          className="header-actions"
          style={{ display: "flex", gap: "10px", marginTop: "10px" }}
        >
          <button
            className="action-button"
            onClick={() => {
              const formatRequests = (requests) => {
                return requests.map((request, index) => [
                  index + 1,
                  request.itemName || "N/A",
                  getBorrowerName(request.userId) || "N/A",
                  request.adviserName || "N/A",
                  request.laboratory || "N/A",
                  request.categoryName || "N/A",
                  request.quantity || "1",
                  request.status || "N/A",
                  formatDate(request.requestedAt || request.dateToBeUsed),
                ]);
              };
              exportToPDF(filteredRequests, "Request Forms", formatRequests);
            }}
          >
            📄 Export PDF
            
          </button>
          <button
            className="action-button"
            onClick={() => {
              const formatRequests = (requests) => {
                return requests.map((request) => ({
                  itemName: request.itemName || "N/A",
                  borrower: getBorrowerName(request.userId) || "N/A",
                  adviserName: request.adviserName || "N/A",
                  laboratory: request.laboratory || "N/A",
                  categoryName: request.categoryName || "N/A",
                  quantity: request.quantity || "1",
                  status: request.status || "N/A",
                  requestedAt: formatDate(
                    request.requestedAt || request.dateToBeUsed
                  ),
                }));
              };
              printActivities(
                filteredRequests,
                "Request Forms",
                formatRequests
              );
            }}
          >
            🖨️ Print
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="request-controls">
        <div className="search-section">
          <input
            type="text"
            placeholder="Search requests..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-section">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="All">All Status</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="filter-select"
          >
            <option value="All">All Types</option>
            {requestTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
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

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={groupByBatch}
              onChange={(e) => setGroupByBatch(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            <span>Group by Batch</span>
          </label>
        </div>
      </div>

      {/* Request Table */}
      <div className="requests-container">
        {filteredRequests.length > 0 ? (
          <div className="table-container">
            <table className="requests-table">
              <thead>
                <tr>
                  <th
                    onClick={() => handleSort("itemName")}
                    className="sortable"
                  >
                    Item Name {getSortIcon("itemName")}
                  </th>
                  <th>Borrower Name</th>
                  <th
                    onClick={() => handleSort("adviserName")}
                    className="sortable"
                  >
                    Instructor Name {getSortIcon("adviserName")}
                  </th>
                  <th
                    onClick={() => handleSort("laboratory")}
                    className="sortable"
                  >
                    Laboratory {getSortIcon("laboratory")}
                  </th>
                  <th
                    onClick={() => handleSort("quantity")}
                    className="sortable"
                  >
                    Quantity {getSortIcon("quantity")}
                  </th>
                  <th>Batch</th>
                  <th onClick={() => handleSort("status")} className="sortable">
                    Status {getSortIcon("status")}
                  </th>
                  <th
                    onClick={() => handleSort("requestedAt")}
                    className="sortable"
                  >
                    Date Requested {getSortIcon("requestedAt")}
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupByBatch && groupedRequests
                  ? // Grouped view
                    groupedRequests.map((group) => (
                      <React.Fragment key={group.batchId || "individual"}>
                        {group.isBatch && (
                          <tr
                            className="batch-header-row"
                            style={{
                              backgroundColor: "#f0f9ff",
                              fontWeight: "bold",
                            }}
                          >
                            <td colSpan="9" style={{ padding: "12px" }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                  }}
                                >
                                  <span
                                    style={{
                                      backgroundColor: "#3b82f6",
                                      color: "white",
                                      padding: "4px 12px",
                                      borderRadius: "12px",
                                      fontSize: "12px",
                                    }}
                                  >
                                    Batch of{" "}
                                    {group.batchSize || group.requests.length}{" "}
                                    items
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      color: "#6b7280",
                                    }}
                                  >
                                    Batch ID: {group.batchId?.substring(0, 8)}
                                    ...
                                  </span>
                                </div>
                                {group.requests[0]?.status === "pending" && (
                                  <div style={{ display: "flex", gap: "6px"  }}>
                                    <button
                                      className="action-btn approve-btn"
                                      onClick={() =>
                                        handleBatchAction(
                                          group.batchId,
                                          "approved"
                                        )
                                      }
                                      style={{
                                        padding: "6px 12px",
                                        fontSize: "12px",
                                      }}
                                    >
                                     <img src={approveIcon} alt="Approve" style={{ width: '18px', height: '18px' }} />
                                    </button>
                                    <button
                                      className="action-btn reject-btn"
                                      onClick={() =>
                                        handleBatchAction(
                                          group.batchId,
                                          "rejected"
                                        )
                                      }
                                      style={{
                                        padding: "6px 12px",
                                        fontSize: "12px",
                                      }}
                                    >
                                      <img src={rejectIcon} alt="Reject" style={{ width: '18px', height: '18px' }} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        {group.requests.map((request) => (
                          <tr
                            key={request.id}
                            style={
                              group.isBatch
                                ? { backgroundColor: "#f9fafb" }
                                : {}
                            }
                          >
                            <td className="item-name-cell">
                              <div className="item-info">
                                <span className="item-name">
                                  {request.itemName || "Untitled"}
                                </span>
                                <span className="item-number">
                                  {request.itemNo || ""}
                                </span>
                              </div>
                            </td>
                            <td className="borrower-cell">
                              <div className="borrower-info">
                                <div className="borrower-avatar">
                                  {getBorrowerName(request.userId)
                                    ?.charAt(0)
                                    ?.toUpperCase() || "?"}
                                </div>
                                <span className="borrower-name">
                                  {getBorrowerName(request.userId)}
                                </span>
                              </div>
                            </td>
                            <td className="adviser-cell">
                              <div className="adviser-info">
                                <div className="adviser-avatar">
                                  {request.adviserName
                                    ?.charAt(0)
                                    ?.toUpperCase() || "?"}
                                </div>
                                <span className="adviser-name">
                                  {request.adviserName || "Unknown"}
                                </span>
                              </div>
                            </td>
                            <td className="laboratory-cell">
                              {request.laboratory || "Not specified"}
                            </td>
                            <td className="quantity-cell">
                              <span className="quantity-badge">
                                {request.quantity || "1"}
                              </span>
                            </td>
                            <td>
                              {request.batchId ? (
                                <span
                                  style={{
                                    backgroundColor: "#dbeafe",
                                    color: "#1e40af",
                                    padding: "2px 8px",
                                    borderRadius: "8px",
                                    fontSize: "11px",
                                  }}
                                >
                                  Batch
                                </span>
                              ) : (
                                <span
                                  style={{ color: "#9ca3af", fontSize: "11px" }}
                                >
                                  —
                                </span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`status-badge ${getStatusBadgeClass(
                                  request.status
                                )}`}
                              >
                                {request.status || "pending"}
                              </span>
                            </td>
                            <td className="date-cell">
                              {formatDate(
                                request.requestedAt || request.dateToBeUsed
                              )}
                            </td>
                            <td>
                              <div className="table-actions">
                                <button
                                  className="action-btn icon-btn view-btn"
                                  onClick={() => handleViewDetails(request)}
                                  title="View Details"
                                >
                                  <img src={eyeIcon} alt="View" style={{ width: '18px', height: '18px' }} />
                                  
                                </button>
                                {request.status === "pending" && (
                                  <>
                                    <button
                                      className="action-btn icon-btn approve-btn"
                                      onClick={() =>
                                        handleStatusUpdate(
                                          request.id,
                                          "approved"
                                        )
                                      }
                                      title="Approve"
                                    >
                                      <img src={approveIcon} alt="Approve" style={{ width: '18px', height: '18px' }} />
                                    
                                    </button>
                                    <button
                                      className="action-btn icon-btn reject-btn"
                                      onClick={() =>
                                        handleStatusUpdate(
                                          request.id,
                                          "rejected"
                                        )
                                      }
                                      title="Reject"
                                    >
                                      <img src={rejectIcon} alt="Reject" style={{ width: '18px', height: '18px' }} />
                                    </button>
                                  </>
                                )}
                                {request.status === "approved" && (
                                  <button
                                    className="action-btn icon-btn release-btn"
                                    onClick={() => {
                                      setRequestToRelease(request);
                                      setShowReleaseConfirmation(true);
                                    }}
                                    title="Release Item"
                                  >
                                    <img src={releaseIcon} alt="Release" style={{ width: '18px', height: '18px' }} />
                                  </button>
                                )}
                                {(request.status === "released" ||
                                  request.status === "in_progress") && (
                                  <button
                                    className="action-btn icon-btn return-btn"
                                    onClick={() => openReturnModal(request)}
                                    title="Process Return"
                                  >
                                    <img src={returnIcon} alt="Return" style={{ width: '18px', height: '18px' }} />
                                  </button>
                                )}
                            {request.status === "rejected" && (
                              <button
                              className="action-btn icon-btn approve-btn"
                              onClick={() =>
                                handleStatusUpdate(request.id, "approved")
                              }
                              title="Back to Approved"
                              >
                                {/* ↩️ Back to Approved */}
                              <img src={approveIcon} alt="Return" style={{ width: '18px', height: '18px' }} />
                              </button>
                            )}
                            {request.status === "rejected" && (
                              <button
                                className="action-btn icon-btn delete-btn"
                                onClick={() =>
                                  handleDeleteRequest(request.id)
                                }
                                title="Delete"
                              >
                                <img src={deleteIcon} alt="Delete" style={{ width: '18px', height: '18px' }} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                      </React.Fragment>
                    ))
                  : // Regular (non-grouped) view
                    paginatedRequests.map((request) => (
                      <tr key={request.id}>
                        <td className="item-name-cell">
                          <div className="item-info">
                            <span className="item-name">
                              {request.itemName || "Untitled"}
                            </span>
                            <span className="item-number">
                              {request.itemNo || ""}
                            </span>
                            {request.batchId && (
                              <span
                                style={{
                                  backgroundColor: "#dbeafe",
                                  color: "#1e40af",
                                  padding: "2px 8px",
                                  borderRadius: "8px",
                                  fontSize: "10px",
                                  marginLeft: "8px",
                                }}
                              >
                                Batch of {request.batchSize || "?"} items
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="borrower-cell">
                          <div className="borrower-info">
                            <div className="borrower-avatar">
                              {getBorrowerName(request.userId)
                                ?.charAt(0)
                                ?.toUpperCase() || "?"}
                            </div>
                            <span className="borrower-name">
                              {getBorrowerName(request.userId)}
                            </span>
                          </div>
                        </td>
                        <td className="adviser-cell">
                          <div className="adviser-info">
                            <div className="adviser-avatar">
                              {request.adviserName?.charAt(0)?.toUpperCase() ||
                                "?"}
                            </div>
                            <span className="adviser-name">
                              {request.adviserName || "Unknown"}
                            </span>
                          </div>
                        </td>
                        <td className="laboratory-cell">
                          {request.laboratory || "Not specified"}
                        </td>
                        <td className="quantity-cell">
                          <span className="quantity-badge">
                            {request.quantity || "1"}
                          </span>
                        </td>
                        <td>
                          {request.batchId ? (
                            <span
                              style={{
                                backgroundColor: "#dbeafe",
                                color: "#1e40af",
                                padding: "2px 8px",
                                borderRadius: "8px",
                                fontSize: "11px",
                              }}
                            >
                              Batch
                            </span>
                          ) : (
                            <span
                              style={{ color: "#9ca3af", fontSize: "11px" }}
                            >
                              —
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`status-badge ${getStatusBadgeClass(
                              request.status
                            )}`}
                          >
                            {request.status || "pending"}
                          </span>
                        </td>
                        <td className="date-cell">
                          {formatDate(
                            request.requestedAt || request.dateToBeUsed
                          )}
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="action-btn icon-btn view-btn"
                              onClick={() => handleViewDetails(request)}
                              title="View Details"
                            >
                              <img src={eyeIcon} alt="View" style={{ width: '18px', height: '18px' }} />
                            </button>
                            {request.status === "pending" && (
                              <>
                                <button
                                  className="action-btn icon-btn approve-btn"
                                  onClick={() =>
                                    handleStatusUpdate(request.id, "approved")
                                  }
                                  title="Approve"
                                >
                                  
                                  <img src={approveIcon} alt="View" style={{ width: '18px', height: '18px' }} />
                                </button>
                                <button
                                  className="action-btn icon-btn reject-btn"
                                  onClick={() =>
                                    handleStatusUpdate(request.id, "rejected")
                                  }
                                  title="Reject"
                                >
                                  
                                  <img src={rejectIcon} alt="View" style={{ width: '18px', height: '18px' }} />
                                </button>
                              </>
                            )}
                            {request.status === "approved" && (
                              <>
                                <button
                                  className="action-btn icon-btn release-btn"
                                  onClick={() => {
                                    setRequestToRelease(request);
                                    setShowReleaseConfirmation(true);
                                  }}
                                  title="Release Item"
                                >
                                  <img src={releaseIcon} alt="View" style={{ width: '20px', height: '20px' }} />
                                </button>
                                <button
                                  className="action-btn icon-btn reject-btn"
                                  onClick={() =>
                                    handleStatusUpdate(request.id, "rejected")
                                  }
                                  title="Reject"
                                >
                                  <img src={rejectIcon} alt="View" style={{ width: '18px', height: '18px' }} />
                                </button>
                              </>
                            )}
                            {(request.status === "released" ||
                              request.status === "in_progress") && (
                                <button
                                className="action-btn icon-btn return-btn"
                                onClick={() => openReturnModal(request)}
                                title="Process Return"
                                >
                                
                                <img src={returnIcon} alt="View" style={{ width: '20px', height: '20px' }} />
                              </button>
                            )}
                            {request.status === "rejected" && (
                              <button
                                className="action-btn icon-btn delete-btn"
                                onClick={() => handleDeleteRequest(request.id)}
                                title="Delete"
                              >
                                <img src={deleteIcon} alt="View" style={{ width: '20px', height: '20px' }} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div className="request-pagination">
              <div className="request-pagination-card">
                <div className="request-pagination-info">
                  Showing <strong>{showingStart}</strong> to <strong>{showingEnd}</strong> of <strong>{totalItems}</strong> requests
                </div>
                <div className="request-pagination-controls">
                  <div className="request-pagination-size">
                    <span>Rows</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      aria-label="Rows per page"
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                  <div className="request-pagination-buttons">
                    <button
                      className="request-pagination-arrow"
                      onClick={() => goToPage(1)}
                      disabled={safeCurrentPage === 1 || totalItems === 0}
                      aria-label="First page"
                    >
                      «
                    </button>
                    <button
                      className="request-pagination-arrow"
                      onClick={() => goToPage(safeCurrentPage - 1)}
                      disabled={safeCurrentPage === 1 || totalItems === 0}
                      aria-label="Previous page"
                    >
                      ‹
                    </button>
                    {totalItems > 0 && (
                      <div className="request-pagination-pages">
                        {renderPaginationPages()}
                      </div>
                    )}
                    <button
                      className="request-pagination-arrow"
                      onClick={() => goToPage(safeCurrentPage + 1)}
                      disabled={safeCurrentPage === totalPages || totalItems === 0}
                      aria-label="Next page"
                    >
                      ›
                    </button>
                    <button
                      className="request-pagination-arrow"
                      onClick={() => goToPage(totalPages)}
                      disabled={safeCurrentPage === totalPages || totalItems === 0}
                      aria-label="Last page"
                    >
                      »
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>No Request Forms Found</h3>
            <p>
              {searchTerm ||
              filterStatus !== "All" ||
              filterType !== "All" ||
              filterBatch !== "All"
                ? "No requests match your current filters."
                : "No request forms have been submitted yet."}
            </p>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedRequest && (
        <div className="modal-overlay" onClick={closeDetailsModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Borrow Request Details</h2>
              <button className="modal-close" onClick={closeDetailsModal}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="details-grid">
                <div className="detail-section">
                  <h3>Request Information</h3>
                  <div className="detail-item">
                    <label>Item Name:</label>
                    <span>{selectedRequest.itemName || "N/A"}</span>
                  </div>
                  <div className="detail-item">
                    <label>Item Number:</label>
                    <span>{selectedRequest.itemNo || "N/A"}</span>
                  </div>
                  <div className="detail-item">
                    <label>Category:</label>
                    <span>{selectedRequest.categoryName || "N/A"}</span>
                  </div>
                  <div className="detail-item">
                    <label>Quantity:</label>
                    <span>{selectedRequest.quantity || "1"}</span>
                  </div>
                  <div className="detail-item">
                    <label>Laboratory:</label>
                    <span>{selectedRequest.laboratory || "N/A"}</span>
                  </div>
                  {selectedRequest.batchId && (
                    <>
                      <div className="detail-item">
                        <label>Batch ID:</label>
                        <span
                          style={{
                            backgroundColor: "#dbeafe",
                            color: "#1e40af",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontFamily: "monospace",
                          }}
                        >
                          {selectedRequest.batchId}
                        </span>
                      </div>
                      <div className="detail-item">
                        <label>Batch Size:</label>
                        <span
                          style={{
                            backgroundColor: "#3b82f6",
                            color: "white",
                            padding: "4px 12px",
                            borderRadius: "12px",
                            fontSize: "12px",
                            fontWeight: "bold",
                          }}
                        >
                          {selectedRequest.batchSize || "?"} items
                        </span>
                      </div>
                      <div className="detail-item">
                        <label>Batch Members:</label>
                        <div style={{ marginTop: "8px" }}>
                          {allRequests
                            .filter(
                              (req) => req.batchId === selectedRequest.batchId
                            )
                            .map((batchMember, index) => (
                              <div
                                key={batchMember.id}
                                style={{
                                  padding: "6px",
                                  marginBottom: "4px",
                                  backgroundColor: "#f3f4f6",
                                  borderRadius: "4px",
                                  fontSize: "12px",
                                }}
                              >
                                {index + 1}. {batchMember.itemName} (Qty:{" "}
                                {batchMember.quantity || 1}) -{" "}
                                {batchMember.status}
                              </div>
                            ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="detail-section">
                  <h3>Requester Information</h3>
                  <div className="detail-item">
                    <label>Borrower Name:</label>
                    <span className="highlight-text">
                      {getBorrowerName(selectedRequest.userId)}
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Borrower Email:</label>
                    <span>{selectedRequest.userEmail || "N/A"}</span>
                  </div>
                  <div className="detail-item">
                    <label>Borrower ID:</label>
                    <span>{selectedRequest.userId || "N/A"}</span>
                  </div>
                  <div className="detail-item">
                    <label>Instructor Name:</label>
                    <span className="highlight-text">
                      {selectedRequest.adviserName || "N/A"}
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Instructor ID:</label>
                    <span>{selectedRequest.adviserId || "N/A"}</span>
                  </div>
                </div>

                {/* Signature & Verification Section */}
                <div className="detail-section">
                  <h3>Signature & Verification</h3>
                  {selectedRequest.signature ? (
                    <div
                      className="signature-container"
                      style={{ marginTop: "12px" }}
                    >
                      <button
                        type="button"
                        onClick={() => setShowSignature(!showSignature)}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: showSignature
                            ? "#ef4444"
                            : "#3b82f6",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "14px",
                          fontWeight: "500",
                          marginBottom: showSignature ? "12px" : "0",
                          transition: "background-color 0.2s",
                        }}
                        onMouseOver={(e) => {
                          e.target.style.backgroundColor = showSignature
                            ? "#dc2626"
                            : "#2563eb";
                        }}
                        onMouseOut={(e) => {
                          e.target.style.backgroundColor = showSignature
                            ? "#ef4444"
                            : "#3b82f6";
                        }}
                      >
                        {showSignature
                          ? "🔼 Hide Signature"
                          : "✍️ View Signature"}
                      </button>
                      {showSignature && (
                        <div
                          style={{
                            marginTop: "12px",
                            padding: "16px",
                            backgroundColor: "#f9fafb",
                            border: "2px solid #e5e7eb",
                            borderRadius: "8px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "12px",
                          }}
                        >
                          <canvas
                            ref={(canvas) => {
                              if (canvas) {
                                setSignatureCanvasRef(canvas);
                              }
                            }}
                            style={{
                              border: "1px solid #d1d5db",
                              borderRadius: "4px",
                              backgroundColor: "white",
                              maxWidth: "100%",
                              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                            }}
                          />
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#6b7280",
                              fontStyle: "italic",
                            }}
                          >
                            Student Signature
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="detail-item">
                      <label>Signature:</label>
                      <span
                        style={{
                          color: "#9ca3af",
                          fontStyle: "italic",
                          fontSize: "14px",
                        }}
                      >
                        No signature provided
                      </span>
                    </div>
                  )}
                </div>

                <div className="detail-section">
                  <h3>Schedule Information</h3>
                  <div className="detail-item">
                    <label>Date to be Used:</label>
                    <span>
                      {selectedRequest.dateToBeUsed
                        ? formatDate(selectedRequest.dateToBeUsed)
                        : "N/A"}
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Date to Return:</label>
                    <span>
                      {selectedRequest.dateToReturn
                        ? formatDate(selectedRequest.dateToReturn)
                        : "N/A"}
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Requested At:</label>
                    <span>
                      {selectedRequest.requestedAt
                        ? formatDate(selectedRequest.requestedAt)
                        : "N/A"}
                    </span>
                  </div>
                </div>

                <div className="detail-section">
                  <h3>Status Information</h3>
                  <div className="detail-item">
                    <label>Current Status:</label>
                    <span
                      className={`status-badge ${getStatusBadgeClass(
                        selectedRequest.status
                      )}`}
                    >
                      {selectedRequest.status || "pending"}
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Request ID:</label>
                    <span>{selectedRequest.requestId || "N/A"}</span>
                  </div>
                  <div className="detail-item">
                    <label>Category ID:</label>
                    <span>{selectedRequest.categoryId || "N/A"}</span>
                  </div>
                  <div className="detail-item">
                    <label>Item ID:</label>
                    <span>{selectedRequest.itemId || "N/A"}</span>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                {selectedRequest.status === "pending" && (
                  <>
                    <button
                      className="btn btn-success"
                      onClick={() => {
                        handleStatusUpdate(selectedRequest.id, "approved");
                        closeDetailsModal();
                      }}
                    >
                      ✅ Approve Request
                    </button>
                    <button
                      className="btn btn-warning"
                      onClick={() => {
                        handleStatusUpdate(selectedRequest.id, "in_progress");
                        closeDetailsModal();
                      }}
                    >
                      🔄 Mark In Progress
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        handleStatusUpdate(selectedRequest.id, "rejected");
                        closeDetailsModal();
                      }}
                    >
                      ❌ Reject Request
                    </button>
                  </>
                )}

                {selectedRequest.status === "approved" && (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        setRequestToRelease(selectedRequest);
                        setShowReleaseConfirmation(true);
                      }}
                    >
                      🚀 Release Item
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        handleStatusUpdate(selectedRequest.id, "pending");
                        closeDetailsModal();
                      }}
                    >
                      🔄 Reset to Pending
                    </button>
                  </>
                )}

                {(selectedRequest.status === "released" ||
                  selectedRequest.status === "in_progress") && (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={() => openReturnModal(selectedRequest)}
                    >
                      📦 Process Return
                    </button>
                    <button
                      className="btn btn-success"
                      onClick={() => {
                        handleStatusUpdate(selectedRequest.id, "approved");
                        closeDetailsModal();
                      }}
                    >
                      ✅ Mark as Completed
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        handleStatusUpdate(selectedRequest.id, "rejected");
                        closeDetailsModal();
                      }}
                    >
                      ❌ Reject Request
                    </button>
                  </>
                )}

                {selectedRequest.status === "rejected" && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      handleStatusUpdate(selectedRequest.id, "approved");
                      closeDetailsModal();
                    }}
                  >
                    ↩️ Back to Approved
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {showReturnModal && selectedRequest && (
        <div className="modal-overlay" onClick={closeReturnModal}>
          <div
            className="modal-content return-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Process Item Return</h2>
              <button className="modal-close" onClick={closeReturnModal}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="return-form">
                <div className="form-group">
                  <label>Item: {selectedRequest.itemName}</label>
                  <label>
                    Borrower: {getBorrowerName(selectedRequest.userId)}
                  </label>
                  <label>Instructor: {selectedRequest.adviserName}</label>
                  <label>
                    Borrowed Quantity: {selectedRequest.quantity || 1}
                  </label>
                </div>

                <div className="form-group">
                  <label htmlFor="returnedQuantity">Returned Quantity:</label>
                  <input
                    id="returnedQuantity"
                    type="number"
                    min="0"
                    max={selectedRequest.quantity || 1}
                    value={returnFormData.returnedQuantity}
                    onChange={(e) =>
                      setReturnFormData((prev) => ({
                        ...prev,
                        returnedQuantity: e.target.value,
                      }))
                    }
                    className="form-input"
                  />
                  <small>Confirm how many units were returned.</small>
                </div>

                <div className="form-group">
                  <label htmlFor="condition">Item Condition:</label>
                  <select
                    id="condition"
                    value={returnFormData.condition}
                    onChange={(e) =>
                      setReturnFormData((prev) => ({
                        ...prev,
                        condition: e.target.value,
                        conditionNotes:
                          e.target.value === "damaged" || e.target.value === "lost"
                            ? prev.conditionNotes
                            : "",
                      }))
                    }
                    className="form-select"
                  >
                    <option value="good">Good Condition</option>
                    <option value="damaged">Damaged</option>
                    <option value="lost">Lost/Missing</option>
                  </select>
                </div>

                {(returnFormData.condition === "damaged" ||
                  returnFormData.condition === "lost") && (
                  <div className="form-group">
                    <label htmlFor="conditionNotes">Reason for Damage/Loss:</label>
                    <textarea
                      id="conditionNotes"
                      value={returnFormData.conditionNotes}
                      onChange={(e) =>
                        setReturnFormData((prev) => ({
                          ...prev,
                          conditionNotes: e.target.value,
                        }))
                      }
                      placeholder="Provide details about the damage or loss..."
                      className="form-textarea"
                      rows="3"
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="delayReason">Return Status:</label>
                  <select
                    id="delayReason"
                    value={returnFormData.delayReason}
                    onChange={(e) =>
                      setReturnFormData((prev) => ({
                        ...prev,
                        delayReason: e.target.value,
                        delayNotes:
                          e.target.value === "late" ? prev.delayNotes : "",
                      }))
                    }
                    className="form-select"
                  >
                    <option value="">On Time</option>
                    <option value="late">Late Return</option>
                    <option value="early">Early Return</option>
                  </select>
                </div>

                {returnFormData.delayReason === "late" && (
                  <div className="form-group">
                    <label htmlFor="delayNotes">Reason for Delay:</label>
                    <textarea
                      id="delayNotes"
                      value={returnFormData.delayNotes}
                      onChange={(e) =>
                        setReturnFormData((prev) => ({
                          ...prev,
                          delayNotes: e.target.value,
                        }))
                      }
                      placeholder="Please explain the reason for the delay..."
                      className="form-textarea"
                      rows="3"
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="returnNotes">Additional Notes:</label>
                  <textarea
                    id="returnNotes"
                    value={returnFormData.notes}
                    onChange={(e) =>
                      setReturnFormData((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    placeholder="Any additional notes about the return..."
                    className="form-textarea"
                    rows="3"
                  />
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{ gap: '12px', padding: '20px', marginBottom: '10px' }}>
              <button className="btn btn-secondary" onClick={closeReturnModal}>
                Cancel
              </button>
              <button className="btn btn-success" onClick={handleReturnSubmit}>
                ✅ Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Release Confirmation Modal */}
      {showReleaseConfirmation && requestToRelease && (
        <div className="modal-overlay" onClick={() => setShowReleaseConfirmation(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm Item Release</h2>
              <button className="modal-close" onClick={() => setShowReleaseConfirmation(false)}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <p>Are you sure you want to release this item?</p>
              <div className="confirmation-details">
                <p><strong>Item:</strong> {requestToRelease.itemName}</p>
                <p><strong>Quantity:</strong> {requestToRelease.quantity || 1}</p>
                <p><strong>Requested by:</strong> {getBorrowerName(requestToRelease.userId)}</p>
              </div>
              <div className="confirmation-warning">
                <p>⚠️ This action will mark the item as released and update the inventory.</p>
              </div>
            </div>

            <div className="modal-actions" style={{ gap: '12px', padding: '20px' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowReleaseConfirmation(false)}
                style={{ marginLeft: '10px' }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  handleStatusUpdate(requestToRelease.id, "released");
                  setShowReleaseConfirmation(false);
                  setRequestToRelease(null);
                  if (showDetailsModal) {
                    closeDetailsModal();
                  }
                }}
                style={{ marginRight: '10px' }}
              >
                🚀 Release Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
