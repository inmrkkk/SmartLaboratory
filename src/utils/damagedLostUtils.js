// src/utils/damagedLostUtils.js
import { ref, push, update, get } from "firebase/database";
import { database } from "../firebase";

/**
 * Create a damaged/lost record when an item is returned with damage, lost, or insufficient return status
 * @param {Object} returnData - The return transaction data
 * @param {Object} borrowerData - The borrower information
 * @param {Object} itemData - The item information
 * @param {number} borrowedQuantity - The original borrowed quantity
 * @param {number} returnedQuantity - The actual returned quantity
 */
export const createDamagedLostRecord = async (returnData, borrowerData, itemData, borrowedQuantity, returnedQuantity) => {
  try {
    const damagedLostRef = ref(database, 'damaged_lost_records');
    
    // Determine item status based on condition and insufficient return
    let itemStatus = 'Damaged';
    let damageDescription = returnData.conditionNotes || '';

    const normalizedCondition = (returnData?.condition || '').toString().trim().toLowerCase();
    const hasInsufficientReturn = returnedQuantity < borrowedQuantity;
    const shortage = Math.max(0, borrowedQuantity - returnedQuantity);
    
    if (normalizedCondition === 'lost' || normalizedCondition === 'missing') {
      itemStatus = 'Lost';
      damageDescription = 'Item reported as lost/missing';
      if (returnData.conditionNotes) {
        damageDescription += `. ${returnData.conditionNotes}`;
      }
    } else if (hasInsufficientReturn) {
      // Handle insufficient return case
      itemStatus = normalizedCondition === 'damaged' ? 'Damaged' : 'Lost';
      if (itemStatus === 'Damaged') {
        damageDescription = 'Item reported as damaged';
        if (returnData.conditionNotes) {
          damageDescription += `. ${returnData.conditionNotes}`;
        }
      } else {
        damageDescription = 'Item reported as lost/missing';
        if (returnData.conditionNotes) {
          damageDescription += `. ${returnData.conditionNotes}`;
        }
      }
    } else if (normalizedCondition === 'damaged') {
      damageDescription = 'Item reported as damaged';
      if (returnData.conditionNotes) {
        damageDescription += `. ${returnData.conditionNotes}`;
      }
    }

    const resolvedItemId = (itemData?.id || itemData?.itemId || returnData?.itemId || returnData?.equipmentId || '').toString().trim();

    const recordData = {
      borrowerId: returnData.userId || borrowerData.id,
      borrowerName: borrowerData.name || borrowerData.fullName || borrowerData.displayName,
      emailAddress: borrowerData.email,
      courseYearSection: borrowerData.courseYearSection || borrowerData.section || 'N/A',
      course: borrowerData.course || null,
      yearLevel: borrowerData.yearLevel || null,
      section: borrowerData.section || null,
      // Stable linkage to the specific inventory record
      equipment_id: resolvedItemId,
      itemId: resolvedItemId,
      itemName: itemData.name || itemData.itemName || itemData.title,
      itemStatus: itemStatus,
      damageDescription: damageDescription,
      penalty: returnData.penalty || 'N/A',
      transactionId: returnData.transactionId || returnData.id,
      transactionDate: returnData.returnDate || returnData.timestamp || new Date().toISOString(),
      status: 'Pending',
      createdAt: new Date().toISOString(),
      createdBy: returnData.processedBy || 'system',
      labId: returnData.labId || itemData.labId,
      categoryId: itemData.categoryId,
      borrowedQuantity: borrowedQuantity,
      returnedQuantity: returnedQuantity,
      damagedQuantity: itemStatus === 'Damaged' ? (shortage > 0 ? shortage : borrowedQuantity) : 0,
      missingQuantity: itemStatus === 'Lost' ? (shortage > 0 ? shortage : borrowedQuantity) : 0
    };

    // Create the damaged/lost record
    const newRecordRef = push(damagedLostRef);
    await update(newRecordRef, recordData);

    return {
      success: true,
      recordId: newRecordRef.key,
      message: `${itemStatus} item record created successfully`
    };

  } catch (error) {
    console.error("Error creating damaged/lost record:", error);
    return {
      success: false,
      error: error.message,
      message: "Failed to create damaged/lost record"
    };
  }
};

/**
 * Check if a borrower is restricted from borrowing items
 * @param {string} borrowerId - The borrower's user ID
 * @returns {Promise<boolean>} - True if borrower is restricted
 */
export const isBorrowerRestricted = async (borrowerId) => {
  return false;
};

/**
 * Update item settlement status
 * @param {string} recordId - The damaged/lost record ID
 * @param {string} newStatus - The new status ('Settled' or 'Pending')
 * @param {string} adminRemarks - Optional admin remarks
 * @param {string} settledBy - User ID of who settled the record
 */
export const updateItemSettlementStatus = async (recordId, newStatus, adminRemarks = '', settledBy = null) => {
  try {
    const recordRef = ref(database, `damaged_lost_records/${recordId}`);
    const recordSnapshot = await get(recordRef);
    
    if (!recordSnapshot.exists()) {
      throw new Error("Record not found");
    }

    const updateData = {
      status: newStatus,
      adminRemarks,
      updatedAt: new Date().toISOString()
    };

    if (newStatus === 'Settled') {
      updateData.settledAt = new Date().toISOString();
      updateData.settledBy = settledBy || 'admin';
    } else {
      updateData.settledAt = null;
      updateData.settledBy = null;
    }

    await update(recordRef, updateData);

    return {
      success: true,
      message: `Record status updated to ${newStatus}`
    };

  } catch (error) {
    console.error("Error updating settlement status:", error);
    return {
      success: false,
      error: error.message,
      message: "Failed to update settlement status"
    };
  }
};

/**
 * Check if all borrower's records are settled and clear restriction if so
 * @param {string} borrowerId - The borrower's user ID
 */
export const checkAndClearBorrowerRestriction = async (borrowerId) => {
  return {
    success: true,
    cleared: false,
    message: "Borrower restriction system disabled"
  };
};

/**
 * Get all damaged/lost records for a specific borrower
 * @param {string} borrowerId - The borrower's user ID
 * @returns {Promise<Array>} - Array of damaged/lost records
 */
export const getBorrowerDamagedLostRecords = async (borrowerId) => {
  try {
    const damagedLostRef = ref(database, 'damaged_lost_records');
    const snapshot = await get(damagedLostRef);
    
    if (snapshot.exists()) {
      const data = snapshot.val();
      return Object.keys(data)
        .map(key => ({
          id: key,
          ...data[key]
        }))
        .filter(record => record.borrowerId === borrowerId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    return [];

  } catch (error) {
    console.error("Error getting borrower records:", error);
    return [];
  }
};

/**
 * Get all restricted borrowers
 * @returns {Promise<Array>} - Array of restricted borrowers
 */
export const getAllRestrictedBorrowers = async () => {
  return [];
};

/**
 * Validate if a borrower can request items (not restricted)
 * @param {string} borrowerId - The borrower's user ID
 * @returns {Promise<Object>} - Validation result
 */
export const validateBorrowerEligibility = async (borrowerId) => {
  return {
    eligible: true,
    reason: null,
    message: "Borrower is eligible to request items"
  };
};

/**
 * Get statistics for damaged/lost records
 * @returns {Promise<Object>} - Statistics object
 */
export const getDamagedLostStatistics = async () => {
  try {
    const damagedLostRef = ref(database, 'damaged_lost_records');

    const damagedSnapshot = await get(damagedLostRef);

    const stats = {
      totalRecords: 0,
      pendingRecords: 0,
      settledRecords: 0,
      damagedItems: 0,
      lostItems: 0,
      restrictedBorrowers: 0
    };

    if (damagedSnapshot.exists()) {
      const data = damagedSnapshot.val();
      stats.totalRecords = Object.keys(data).length;
      
      Object.values(data).forEach(record => {
        if (record.status === 'Pending') {
          stats.pendingRecords++;
        } else if (record.status === 'Settled') {
          stats.settledRecords++;
        }

        const borrowedQuantity = Number(record?.borrowedQuantity);
        const safeBorrowedQuantity = Number.isFinite(borrowedQuantity) && borrowedQuantity > 0 ? borrowedQuantity : 1;
        const missingQuantity = Number(record?.missingQuantity);
        const safeMissingQuantity = Number.isFinite(missingQuantity) && missingQuantity > 0 ? missingQuantity : 0;

        if (record.itemStatus === 'Damaged') {
          stats.damagedItems += safeBorrowedQuantity;
        } else if (record.itemStatus === 'Lost') {
          stats.lostItems += safeMissingQuantity > 0 ? safeMissingQuantity : safeBorrowedQuantity;
        }
      });
    }

    return stats;

  } catch (error) {
    console.error("Error getting statistics:", error);
    return {
      totalRecords: 0,
      pendingRecords: 0,
      settledRecords: 0,
      damagedItems: 0,
      lostItems: 0,
      restrictedBorrowers: 0
    };
  }
};
