// src/utils/damagedLostUtils.js
import { ref, push, update, get, remove } from "firebase/database";
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
    const restrictedUsersRef = ref(database, 'restricted_users');
    
    // Determine item status based on condition and insufficient return
    let itemStatus = 'Damaged';
    let damageDescription = returnData.conditionNotes || '';
    
    if (returnData.condition === 'lost' || returnData.condition === 'missing') {
      itemStatus = 'Lost';
      damageDescription = returnData.conditionNotes || 'Item reported as lost/missing';
    } else if (returnedQuantity < borrowedQuantity) {
      // Handle insufficient return case
      const missingQuantity = borrowedQuantity - returnedQuantity;
      itemStatus = 'Lost';
      damageDescription = `Insufficient return: ${missingQuantity} item(s) missing out of ${borrowedQuantity} borrowed`;
      if (returnData.conditionNotes) {
        damageDescription += `. Additional notes: ${returnData.conditionNotes}`;
      }
    } else if (returnData.condition === 'damaged') {
      damageDescription = returnData.conditionNotes || 'Item returned damaged';
    }

    const recordData = {
      borrowerId: returnData.userId || borrowerData.id,
      borrowerName: borrowerData.name || borrowerData.fullName || borrowerData.displayName,
      emailAddress: borrowerData.email,
      courseYearSection: borrowerData.courseYearSection || borrowerData.section || 'N/A',
      course: borrowerData.course || null,
      yearLevel: borrowerData.yearLevel || null,
      section: borrowerData.section || null,
      itemId: itemData.id || itemData.itemId,
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
      missingQuantity: Math.max(0, borrowedQuantity - returnedQuantity)
    };

    // Create the damaged/lost record
    const newRecordRef = push(damagedLostRef);
    await update(newRecordRef, recordData);

    // Add borrower to restricted users list
    const restrictionData = {
      borrowerId: recordData.borrowerId,
      borrowerName: recordData.borrowerName,
      emailAddress: recordData.emailAddress,
      restrictionReason: `Unsettled ${itemStatus.toLowerCase()} item: ${recordData.itemName} (${recordData.damageDescription})`,
      restrictedAt: new Date().toISOString(),
      restrictedBy: returnData.processedBy || 'system',
      status: 'active'
    };

    await update(restrictedUsersRef, {
      [recordData.borrowerId]: restrictionData
    });

    return {
      success: true,
      recordId: newRecordRef.key,
      message: `${itemStatus} item record created and borrower restricted successfully`
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
  try {
    const restrictedUsersRef = ref(database, 'restricted_users');
    const snapshot = await get(restrictedUsersRef);
    
    if (snapshot.exists()) {
      const restrictedData = snapshot.val();
      return restrictedData[borrowerId]?.status === 'active';
    }
    
    return false;
  } catch (error) {
    console.error("Error checking borrower restriction:", error);
    return false;
  }
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

    const recordData = recordSnapshot.val();
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

    // Check if all items for this borrower are settled
    await checkAndClearBorrowerRestriction(recordData.borrowerId);

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
  try {
    const damagedLostRef = ref(database, 'damaged_lost_records');
    const snapshot = await get(damagedLostRef);
    
    if (snapshot.exists()) {
      const data = snapshot.val();
      const pendingRecords = Object.keys(data).filter(key => 
        data[key].borrowerId === borrowerId && data[key].status === 'Pending'
      );

      // If no pending records, remove from restricted list
      if (pendingRecords.length === 0) {
        const restrictedUserRef = ref(database, `restricted_users/${borrowerId}`);
        await remove(restrictedUserRef);
        
        return {
          success: true,
          cleared: true,
          message: "Borrower restriction cleared - all items settled"
        };
      }
    }

    return {
      success: true,
      cleared: false,
      message: "Borrower still has pending records"
    };

  } catch (error) {
    console.error("Error checking borrower restriction:", error);
    return {
      success: false,
      error: error.message,
      message: "Failed to check borrower restriction"
    };
  }
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
  try {
    const restrictedUsersRef = ref(database, 'restricted_users');
    const snapshot = await get(restrictedUsersRef);
    
    if (snapshot.exists()) {
      const data = snapshot.val();
      return Object.keys(data)
        .map(key => ({
          id: key,
          ...data[key]
        }))
        .filter(borrower => borrower.status === 'active');
    }
    
    return [];

  } catch (error) {
    console.error("Error getting restricted borrowers:", error);
    return [];
  }
};

/**
 * Validate if a borrower can request items (not restricted)
 * @param {string} borrowerId - The borrower's user ID
 * @returns {Promise<Object>} - Validation result
 */
export const validateBorrowerEligibility = async (borrowerId) => {
  try {
    const isRestricted = await isBorrowerRestricted(borrowerId);
    
    if (isRestricted) {
      const restrictedUsersRef = ref(database, `restricted_users/${borrowerId}`);
      const snapshot = await get(restrictedUsersRef);
      
      let restrictionReason = "Unsettled damaged or lost items";
      if (snapshot.exists()) {
        const restrictionData = snapshot.val();
        restrictionReason = restrictionData.restrictionReason || restrictionReason;
      }

      return {
        eligible: false,
        reason: restrictionReason,
        message: "Borrower is restricted from requesting items due to unsettled damaged or lost items"
      };
    }

    return {
      eligible: true,
      reason: null,
      message: "Borrower is eligible to request items"
    };

  } catch (error) {
    console.error("Error validating borrower eligibility:", error);
    return {
      eligible: false,
      reason: "System error",
      message: "Unable to validate borrower eligibility"
    };
  }
};

/**
 * Get statistics for damaged/lost records
 * @returns {Promise<Object>} - Statistics object
 */
export const getDamagedLostStatistics = async () => {
  try {
    const damagedLostRef = ref(database, 'damaged_lost_records');
    const restrictedUsersRef = ref(database, 'restricted_users');
    
    const [damagedSnapshot, restrictedSnapshot] = await Promise.all([
      get(damagedLostRef),
      get(restrictedUsersRef)
    ]);

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
        
        if (record.itemStatus === 'Damaged') {
          stats.damagedItems++;
        } else if (record.itemStatus === 'Lost') {
          stats.lostItems++;
        }
      });
    }

    if (restrictedSnapshot.exists()) {
      const restrictedData = restrictedSnapshot.val();
      stats.restrictedBorrowers = Object.keys(restrictedData).filter(
        key => restrictedData[key].status === 'active'
      ).length;
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
