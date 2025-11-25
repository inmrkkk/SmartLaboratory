import { ref, push } from "firebase/database";
import { database } from "../firebase";

/**
 * Creates a notification for laboratory managers
 * @param {Object} params - Notification parameters
 * @param {string} params.type - Notification type (new_request, request_approved, request_rejected, equipment_returned)
 * @param {string} params.title - Notification title
 * @param {string} params.message - Notification message
 * @param {string} params.labId - Laboratory ID
 * @param {string} params.labName - Laboratory name
 * @param {string} params.recipientUserId - User ID of the laboratory manager (optional)
 * @param {Object} params.metadata - Additional metadata (optional)
 */
export const createNotification = async ({
  type,
  title,
  message,
  labId,
  labName,
  recipientUserId = null,
  metadata = {}
}) => {
  try {
    const notificationData = {
      type,
      title,
      message,
      labId,
      labName,
      recipientUserId,
      timestamp: new Date().toISOString(),
      isRead: false,
      readAt: null,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString()
      }
    };

    const notificationsRef = ref(database, 'notifications');
    await push(notificationsRef, notificationData);
    
    console.log('Notification created successfully:', notificationData);
    return true;
  } catch (error) {
    console.error('Error creating notification:', error);
    return false;
  }
};

/**
 * Notifies laboratory managers that maintenance is due today
 * @param {Object} params
 * @param {string} params.scheduleId - Firebase ID of the schedule entry
 * @param {Object} params.schedule - Schedule payload
 * @param {Object} params.lab - Laboratory information
 * @param {string} params.equipmentName - Human readable equipment name
 * @param {string} params.categoryTitle - Category title
 * @param {string} params.categoryId - Category identifier
 */
export const notifyMaintenanceDueToday = async ({
  scheduleId,
  schedule,
  lab,
  equipmentName,
  categoryTitle,
  categoryId
}) => {
  if (!lab?.labId || !lab?.labName || !lab?.managerUserId) {
    console.warn('Missing laboratory info for maintenance notification', { lab, scheduleId });
    return;
  }

  const scheduledDateText = schedule?.scheduledDate
    ? new Date(schedule.scheduledDate).toLocaleDateString()
    : 'today';

  const descriptionText = schedule?.description ? `Task: ${schedule.description}.` : '';
  const notesText = schedule?.notes ? `Notes: ${schedule.notes}` : '';
  const locationText = categoryTitle ? `in ${categoryTitle}` : '';

  const title = 'Maintenance Needed Today';
  const message = `Scheduled maintenance for "${equipmentName || 'equipment'}" ${locationText} is due today (${scheduledDateText}). ${descriptionText} ${notesText}`.trim();

  await createNotification({
    type: 'maintenance_due_today',
    title,
    message,
    labId: lab.labId,
    labName: lab.labName,
    recipientUserId: lab.managerUserId,
    metadata: {
      scheduleId,
      equipmentId: schedule?.equipmentId || null,
      scheduledDate: schedule?.scheduledDate || null,
      priority: schedule?.priority || 'Medium',
      maintenanceType: schedule?.type || 'Preventive',
      categoryId: categoryId || null,
      createdAt: new Date().toISOString()
    }
  });
};

/**
 * Creates notifications for laboratory managers when a new request is made
 * @param {Object} requestData - The request data
 * @param {Object} equipmentData - The equipment data
 * @param {Object} laboratoryData - The laboratory data
 * @param {string} studentName - The name of the student who borrowed the equipment
 */
export const notifyNewRequest = async (requestData, equipmentData, laboratoryData, studentName) => {
  if (!equipmentData.labId || !laboratoryData) {
    console.log('No lab information available for notification');
    return;
  }

  const borrowerName = studentName || requestData.adviserName || "Unknown Student";
  const title = "New Equipment Request";
  const message = `Student ${borrowerName} has requested to borrow "${requestData.itemName}" from ${laboratoryData.labName}. Please review the request.`;

  await createNotification({
    type: 'new_request',
    title,
    message,
    labId: equipmentData.labId,
    labName: laboratoryData.labName,
    recipientUserId: laboratoryData.managerUserId, // Target the laboratory manager directly
    metadata: {
      requestId: requestData.id,
      studentName: borrowerName,
      equipmentName: requestData.itemName,
      requestDate: requestData.requestedAt || requestData.dateToBeUsed
    }
  });
};

/**
 * Creates notifications for laboratory managers when a request is approved
 * @param {Object} requestData - The request data
 * @param {Object} equipmentData - The equipment data
 * @param {Object} laboratoryData - The laboratory data
 * @param {string} approvedBy - Who approved the request
 * @param {string} studentName - The name of the student who borrowed the equipment
 */
export const notifyRequestApproved = async (requestData, equipmentData, laboratoryData, approvedBy, studentName) => {
  if (!equipmentData.labId || !laboratoryData) {
    console.log('No lab information available for notification');
    return;
  }

  const borrowerName =
    studentName ||
    requestData.borrowerName ||
    requestData.userName ||
    requestData.studentName ||
    requestData.displayName ||
    requestData.userEmail ||
    "Unknown Borrower";
  const title = "Equipment Request Approved";
  const message = `The request for "${requestData.itemName}" by ${borrowerName} has been approved by ${approvedBy}. Please prepare the equipment for release.`;

  await createNotification({
    type: 'request_approved',
    title,
    message,
    labId: equipmentData.labId,
    labName: laboratoryData.labName,
    recipientUserId: laboratoryData.managerUserId, // Target the laboratory manager directly
    metadata: {
      requestId: requestData.id,
      studentName: borrowerName,
      equipmentName: requestData.itemName,
      approvedBy,
      approvedAt: new Date().toISOString(),
      expectedReturnDate: requestData.dateToReturn
    }
  });
};

/**
 * Creates notifications for laboratory managers when a request is rejected
 * @param {Object} requestData - The request data
 * @param {Object} equipmentData - The equipment data
 * @param {Object} laboratoryData - The laboratory data
 * @param {string} rejectedBy - Who rejected the request
 * @param {string} studentName - The name of the student who borrowed the equipment
 */
export const notifyRequestRejected = async (requestData, equipmentData, laboratoryData, rejectedBy, studentName) => {
  if (!equipmentData.labId || !laboratoryData) {
    console.log('No lab information available for notification');
    return;
  }

  const borrowerName = studentName || requestData.adviserName || "Unknown Student";
  const title = "Equipment Request Rejected";
  const message = `The request for "${requestData.itemName}" by ${borrowerName} has been rejected by ${rejectedBy}.`;

  await createNotification({
    type: 'request_rejected',
    title,
    message,
    labId: equipmentData.labId,
    labName: laboratoryData.labName,
    recipientUserId: laboratoryData.managerUserId, // Target the laboratory manager directly
    metadata: {
      requestId: requestData.id,
      studentName: borrowerName,
      equipmentName: requestData.itemName,
      rejectedBy,
      rejectedAt: new Date().toISOString()
    }
  });
};

/**
 * Creates notifications for laboratory managers when equipment is returned
 * @param {Object} requestData - The request data
 * @param {Object} equipmentData - The equipment data
 * @param {Object} laboratoryData - The laboratory data
 * @param {Object} returnDetails - Return details
 * @param {string} studentName - The name of the student who borrowed the equipment
 */
export const notifyEquipmentReturned = async (requestData, equipmentData, laboratoryData, returnDetails, studentName) => {
  if (!equipmentData.labId || !laboratoryData) {
    console.log('No lab information available for notification');
    return;
  }

  const borrowerName = studentName || requestData.adviserName || "Unknown Student";
  const title = "Equipment Returned";
  const message = `"${requestData.itemName}" has been returned by ${borrowerName}. Please check the equipment condition.`;

  await createNotification({
    type: 'equipment_returned',
    title,
    message,
    labId: equipmentData.labId,
    labName: laboratoryData.labName,
    recipientUserId: laboratoryData.managerUserId, // Target the laboratory manager directly
    metadata: {
      requestId: requestData.id,
      studentName: borrowerName,
      equipmentName: requestData.itemName,
      returnedAt: new Date().toISOString(),
      returnDetails
    }
  });
};

/**
 * Creates notifications for laboratory managers when equipment is overdue
 * @param {Object} requestData - The request data
 * @param {Object} equipmentData - The equipment data
 * @param {Object} laboratoryData - The laboratory data
 * @param {number} daysOverdue - Number of days overdue
 * @param {string} studentName - The name of the student who borrowed the equipment
 */
export const notifyEquipmentOverdue = async (requestData, equipmentData, laboratoryData, daysOverdue, studentName) => {
  if (!equipmentData.labId || !laboratoryData) {
    console.log('No lab information available for notification');
    return;
  }

  const borrowerName = studentName || requestData.adviserName || "Unknown Student";
  const title = "Equipment Overdue";
  const message = `"${requestData.itemName}" borrowed by ${borrowerName} is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue. Expected return date was ${new Date(requestData.dateToReturn).toLocaleDateString()}.`;

  await createNotification({
    type: 'equipment_overdue',
    title,
    message,
    labId: equipmentData.labId,
    labName: laboratoryData.labName,
    recipientUserId: laboratoryData.managerUserId, // Target the laboratory manager directly
    metadata: {
      requestId: requestData.id,
      studentName: borrowerName,
      equipmentName: requestData.itemName,
      expectedReturnDate: requestData.dateToReturn,
      daysOverdue,
      overdueSince: new Date().toISOString()
    }
  });
};

/**
 * Checks for overdue equipment and creates notifications
 * @param {Array} requests - Array of all requests
 * @param {Array} equipmentData - Array of all equipment
 * @param {Array} laboratories - Array of all laboratories
 */
export const checkForOverdueEquipment = async (requests, equipmentData, laboratories) => {
  const today = new Date();
  const overdueRequests = [];

  // Find requests that are overdue
  requests.forEach(request => {
    // Only check requests that are approved, released, or in_progress (not returned)
    if (['approved', 'released', 'in_progress'].includes(request.status) && request.dateToReturn) {
      const returnDate = new Date(request.dateToReturn);
      
      if (returnDate < today) {
        const daysOverdue = Math.ceil((today - returnDate) / (1000 * 60 * 60 * 24));
        overdueRequests.push({ request, daysOverdue });
      }
    }
  });

  // Create notifications for overdue equipment
  for (const { request, daysOverdue } of overdueRequests) {
    // Find equipment data
    const equipment = equipmentData.find(eq => 
      eq.equipmentName === request.itemName || 
      eq.itemName === request.itemName ||
      eq.name === request.itemName ||
      eq.title === request.itemName
    );
    
    // Find laboratory data
    const laboratory = laboratories.find(lab => lab.labId === equipment?.labId);
    
    if (equipment && laboratory) {
      // Check if we've already notified for this overdue item today
      const notificationKey = `overdue_${request.id}_${today.toDateString()}`;
      const hasNotifiedToday = localStorage.getItem(notificationKey);
      
      if (!hasNotifiedToday) {
        await notifyEquipmentOverdue(request, equipment, laboratory, daysOverdue);
        // Mark as notified for today
        localStorage.setItem(notificationKey, 'true');
      }
    }
  }
};
