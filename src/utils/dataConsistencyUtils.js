import { ref, get, update } from "firebase/database";
import { database } from "../firebase";

const normalizeText = (value) => (value || "").toString().trim().toLowerCase();

const toNumberOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const buildNextLabId = (existingLabIds) => {
  const numbers = (existingLabIds || [])
    .filter((id) => typeof id === "string")
    .map((id) => id.trim())
    .filter((id) => /^LAB\d+$/i.test(id))
    .map((id) => parseInt(id.replace(/lab/i, ""), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `LAB${String(next).padStart(3, "0")}`;
};

const buildEquipmentIndex = (categoriesData) => {
  const equipmentById = new Map();
  const equipmentByName = new Map();

  if (!categoriesData) return { equipmentById, equipmentByName };

  Object.entries(categoriesData).forEach(([categoryId, category]) => {
    const equipments = category?.equipments || {};
    Object.entries(equipments).forEach(([equipmentId, equipment]) => {
      const entry = {
        id: equipmentId,
        categoryId,
        categoryTitle: category?.title,
        labId: category?.labId || equipment?.labId,
        labRecordId: category?.labRecordId || equipment?.labRecordId,
        ...equipment
      };

      equipmentById.set(equipmentId, entry);

      const nameCandidates = [equipment?.name, equipment?.itemName, equipment?.title, equipment?.equipmentName]
        .filter(Boolean)
        .map((n) => normalizeText(n));

      nameCandidates.forEach((key) => {
        if (!equipmentByName.has(key)) equipmentByName.set(key, entry);
      });
    });
  });

  return { equipmentById, equipmentByName };
};

export const auditDataConsistency = async ({ dryRun = true } = {}) => {
  const findings = [];
  const fixes = [];

  const addFinding = (severity, title, details) => {
    findings.push({
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      severity,
      title,
      details
    });
  };

  const queueFix = (path, value, reason, safe = true) => {
    fixes.push({ path, value, reason, safe });
  };

  const [
    laboratoriesSnapshot,
    usersSnapshot,
    categoriesSnapshot,
    requestsSnapshot,
    damagedLostSnapshot,
    restrictedSnapshot
  ] = await Promise.all([
    get(ref(database, "laboratories")),
    get(ref(database, "users")),
    get(ref(database, "equipment_categories")),
    get(ref(database, "borrow_requests")),
    get(ref(database, "damaged_lost_records")),
    get(ref(database, "restricted_users"))
  ]);

  const laboratoriesData = laboratoriesSnapshot.exists() ? laboratoriesSnapshot.val() : {};
  const usersData = usersSnapshot.exists() ? usersSnapshot.val() : {};
  const categoriesData = categoriesSnapshot.exists() ? categoriesSnapshot.val() : {};
  const requestsData = requestsSnapshot.exists() ? requestsSnapshot.val() : {};
  const damagedLostData = damagedLostSnapshot.exists() ? damagedLostSnapshot.val() : {};
  const restrictedData = restrictedSnapshot.exists() ? restrictedSnapshot.val() : {};

  const laboratories = Object.entries(laboratoriesData).map(([id, lab]) => ({ id, ...lab }));
  const labsByRecordId = new Map(laboratories.map((lab) => [lab.id, lab]));
  const labsByLabId = new Map(
    laboratories
      .filter((lab) => lab.labId)
      .map((lab) => [String(lab.labId).trim(), lab])
  );
  const labsByName = new Map(
    laboratories
      .filter((lab) => lab.labName)
      .map((lab) => [normalizeText(lab.labName), lab])
  );

  const userIds = new Set(Object.keys(usersData || {}));

  const existingLabIds = laboratories.map((lab) => lab.labId).filter(Boolean);
  const seenLabIds = new Map();
  laboratories.forEach((lab) => {
    if (!lab.labId) return;
    const key = String(lab.labId).trim();
    if (!seenLabIds.has(key)) seenLabIds.set(key, []);
    seenLabIds.get(key).push(lab.id);
  });

  seenLabIds.forEach((recordIds, labId) => {
    if (recordIds.length > 1) {
      addFinding("error", "Duplicate Laboratory ID", {
        labId,
        laboratoryRecordIds: recordIds
      });
    }
  });

  let nextLabIdCache = null;

  laboratories.forEach((lab) => {
    if (!lab.labName) {
      addFinding("warning", "Laboratory missing labName", {
        laboratoryRecordId: lab.id
      });
    }

    if (!lab.labId) {
      addFinding("warning", "Laboratory missing labId", {
        laboratoryRecordId: lab.id,
        labName: lab.labName || null
      });

      if (!nextLabIdCache) {
        nextLabIdCache = buildNextLabId(existingLabIds);
      }

      const newId = nextLabIdCache;
      existingLabIds.push(newId);
      nextLabIdCache = buildNextLabId(existingLabIds);

      queueFix(`laboratories/${lab.id}/labId`, newId, "Assign missing labId", true);
    }

    if (lab.managerUserId && !userIds.has(lab.managerUserId)) {
      addFinding("warning", "Laboratory managerUserId does not exist", {
        laboratoryRecordId: lab.id,
        managerUserId: lab.managerUserId
      });
      queueFix(`laboratories/${lab.id}/managerUserId`, null, "Remove invalid managerUserId (user deleted)", true);
    }
  });

  const categories = Object.entries(categoriesData).map(([id, category]) => ({ id, ...category }));

  categories.forEach((category) => {
    const categoryLabId = category.labId;
    const categoryLabRecordId = category.labRecordId;

    if (categoryLabRecordId && !labsByRecordId.has(categoryLabRecordId)) {
      addFinding("error", "Equipment category has invalid labRecordId", {
        categoryId: category.id,
        labRecordId: categoryLabRecordId
      });

      if (categoryLabId && labsByLabId.has(String(categoryLabId).trim())) {
        const lab = labsByLabId.get(String(categoryLabId).trim());
        queueFix(`equipment_categories/${category.id}/labRecordId`, lab.id, "Fix category labRecordId from labId", true);
      }
    }

    if (!categoryLabRecordId && categoryLabId && labsByLabId.has(String(categoryLabId).trim())) {
      const lab = labsByLabId.get(String(categoryLabId).trim());
      addFinding("warning", "Equipment category missing labRecordId", {
        categoryId: category.id,
        labId: categoryLabId
      });
      queueFix(`equipment_categories/${category.id}/labRecordId`, lab.id, "Populate missing labRecordId from labId", true);
    }

    if (categoryLabId && !labsByLabId.has(String(categoryLabId).trim())) {
      addFinding("warning", "Equipment category references unknown labId", {
        categoryId: category.id,
        labId: categoryLabId
      });

      if (categoryLabRecordId && labsByRecordId.has(categoryLabRecordId)) {
        const lab = labsByRecordId.get(categoryLabRecordId);
        if (lab?.labId) {
          queueFix(`equipment_categories/${category.id}/labId`, lab.labId, "Fix category labId from labRecordId", true);
        }
      }
    }
  });

  const { equipmentById, equipmentByName } = buildEquipmentIndex(categoriesData);

  const requests = Object.entries(requestsData).map(([id, req]) => ({ id, ...req }));
  requests.forEach((request) => {
    const itemId = request.itemId;
    const categoryId = request.categoryId;

    const equipment = itemId ? equipmentById.get(itemId) : null;
    const equipmentFromName = !equipment && request.itemName ? equipmentByName.get(normalizeText(request.itemName)) : null;
    const resolvedEquipment = equipment || equipmentFromName;

    const category = categoryId ? categoriesData?.[categoryId] : null;

    const expectedLabId = resolvedEquipment?.labId || category?.labId || null;
    const expectedLabRecordId = resolvedEquipment?.labRecordId || category?.labRecordId || null;

    if (request.userId && !userIds.has(request.userId)) {
      addFinding("warning", "Borrow request userId does not exist", {
        requestId: request.id,
        userId: request.userId
      });
      // Deleting a request is considered a major change, so we mark it as not safe for auto-fix
      queueFix(`borrow_requests/${request.id}`, null, "Delete orphaned borrow request (user deleted)", false);
    }

    if (expectedLabId && request.labId && String(request.labId).trim() !== String(expectedLabId).trim()) {
      addFinding("warning", "Borrow request labId does not match equipment/category labId", {
        requestId: request.id,
        requestLabId: request.labId,
        expectedLabId
      });
      queueFix(`borrow_requests/${request.id}/labId`, expectedLabId, "Fix request labId from equipment/category", true);
    }

    if (expectedLabId && !request.labId) {
      addFinding("warning", "Borrow request missing labId", {
        requestId: request.id,
        expectedLabId
      });
      queueFix(`borrow_requests/${request.id}/labId`, expectedLabId, "Populate missing request labId from equipment/category", true);
    }

    if (expectedLabRecordId && request.labRecordId && String(request.labRecordId).trim() !== String(expectedLabRecordId).trim()) {
      addFinding("warning", "Borrow request labRecordId does not match equipment/category labRecordId", {
        requestId: request.id,
        requestLabRecordId: request.labRecordId,
        expectedLabRecordId
      });
      queueFix(`borrow_requests/${request.id}/labRecordId`, expectedLabRecordId, "Fix request labRecordId from equipment/category", true);
    }

    if (expectedLabRecordId && !request.labRecordId) {
      addFinding("warning", "Borrow request missing labRecordId", {
        requestId: request.id,
        expectedLabRecordId
      });
      queueFix(`borrow_requests/${request.id}/labRecordId`, expectedLabRecordId, "Populate missing request labRecordId from equipment/category", true);
    }

    if (request.laboratory && !expectedLabId && !expectedLabRecordId) {
      const labFromName = labsByName.get(normalizeText(request.laboratory));
      if (labFromName?.labId && (!request.labId || String(request.labId).trim() !== String(labFromName.labId).trim())) {
        addFinding("warning", "Borrow request labId inferred from laboratory name", {
          requestId: request.id,
          laboratory: request.laboratory,
          inferredLabId: labFromName.labId
        });
        queueFix(`borrow_requests/${request.id}/labId`, labFromName.labId, "Infer request labId from laboratory name", true);
      }
      if (labFromName?.id && (!request.labRecordId || String(request.labRecordId).trim() !== String(labFromName.id).trim())) {
        queueFix(`borrow_requests/${request.id}/labRecordId`, labFromName.id, "Infer request labRecordId from laboratory name", true);
      }
    }

    const quantity = toNumberOrNull(request.quantityReleased ?? request.approvedQuantity ?? request.quantity);
    if (quantity !== null && quantity <= 0) {
      addFinding("warning", "Borrow request has non-positive quantity", {
        requestId: request.id,
        quantity
      });
      
      // Queue a fix to set quantity to 1 if it's 0 or negative
      const fixQuantity = quantity <= 0 ? 1 : quantity;
      const quantityField = request.quantityReleased !== undefined ? "quantityReleased" : 
                           request.approvedQuantity !== undefined ? "approvedQuantity" : 
                           "quantity";
      
      queueFix(`borrow_requests/${request.id}/${quantityField}`, fixQuantity, 
               `Fix non-positive quantity (${quantity}) to 1`, true);
    }
  });

  const damagedRecords = Object.entries(damagedLostData).map(([id, rec]) => ({ id, ...rec }));
  damagedRecords.forEach((record) => {
    if (record.borrowerId && !userIds.has(record.borrowerId)) {
      addFinding("warning", "Damaged/Lost record borrowerId does not exist", {
        recordId: record.id,
        borrowerId: record.borrowerId
      });
      queueFix(`damaged_lost_records/${record.id}`, null, "Delete orphaned damaged/lost record (user deleted)", false);
    }

    if (record.labId && !labsByLabId.has(String(record.labId).trim())) {
      addFinding("warning", "Damaged/Lost record references unknown labId", {
        recordId: record.id,
        labId: record.labId
      });

      const item = record.itemId ? equipmentById.get(record.itemId) : null;
      if (item?.labId) {
        queueFix(`damaged_lost_records/${record.id}/labId`, item.labId, "Fix damaged/lost labId from equipment", true);
      }
    }

    if (!record.labId) {
      const item = record.itemId ? equipmentById.get(record.itemId) : null;
      const expected = item?.labId || null;
      if (expected) {
        addFinding("warning", "Damaged/Lost record missing labId", {
          recordId: record.id,
          expectedLabId: expected
        });
        queueFix(`damaged_lost_records/${record.id}/labId`, expected, "Populate damaged/lost labId from equipment", true);
      }
    }
  });

  Object.entries(restrictedData || {}).forEach(([borrowerId, restriction]) => {
    if (!userIds.has(borrowerId)) {
      addFinding("warning", "Restricted user entry refers to missing user", {
        borrowerId
      });
      queueFix(`restricted_users/${borrowerId}`, null, "Delete orphaned restricted user entry (user deleted)", false);
    }

    const status = (restriction?.status || "").toString().toLowerCase();
    if (status && status !== "active") {
      addFinding("info", "Restricted user entry has non-active status", {
        borrowerId,
        status: restriction?.status
      });
    }
  });

  const summary = {
    laboratories: laboratories.length,
    equipmentCategories: categories.length,
    borrowRequests: requests.length,
    damagedLostRecords: damagedRecords.length,
    restrictedUsers: Object.keys(restrictedData || {}).length,
    findings: findings.length,
    fixes: fixes.length,
    safeFixes: fixes.filter((f) => f.safe).length
  };

  return {
    summary,
    findings,
    fixes,
    dryRun
  };
};

export const applyDataConsistencyFixes = async (fixesToApply) => {
  const safeFixes = (fixesToApply || []).filter((fix) => fix && typeof fix.path === "string");
  if (!safeFixes.length) {
    return {
      success: true,
      applied: 0
    };
  }

  const updates = {};
  safeFixes.forEach((fix) => {
    updates[fix.path] = fix.value;
  });

  await update(ref(database), updates);

  return {
    success: true,
    applied: safeFixes.length
  };
};



export const rebuildQuantityBorrowedFromReleasedRequests = async ({

  dryRun = true,

  autoRepair = false,

  cooldownMs = 5 * 60 * 1000,

  storageKey = "sl_auto_rebuild_quantity_borrowed"

} = {}) => {
  if (autoRepair && typeof window !== "undefined") {
    try {
      const lastRunRaw = window.localStorage.getItem(storageKey);
      const lastRun = lastRunRaw ? Number(lastRunRaw) : 0;
      if (Number.isFinite(lastRun) && lastRun > 0 && Date.now() - lastRun < cooldownMs) {
        return {
          success: true,
          skipped: true,
          reason: "cooldown",
          summary: { dryRun }
        };
      }
    } catch {
      // ignore storage failures and continue
    }
  }

  const categoriesSnapshot = await get(ref(database, "equipment_categories"));
  const requestsSnapshot = await get(ref(database, "borrow_requests"));

  const categoriesData = categoriesSnapshot.exists() ? categoriesSnapshot.val() : {};
  const requestsData = requestsSnapshot.exists() ? requestsSnapshot.val() : {};

  const { equipmentById, equipmentByName } = buildEquipmentIndex(categoriesData);

  const releasedRequests = Object.entries(requestsData)
    .map(([id, req]) => ({ id, ...(req || {}) }))
    .filter((req) => normalizeText(req.status) === "released");

  const releasedQuantityForRequest = (req) => {
    const candidates = [req.quantityReleased, req.approvedQuantity, req.quantity];
    for (const value of candidates) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 1;
  };

  const borrowedByEquipmentKey = new Map();

  releasedRequests.forEach((req) => {
    const qty = releasedQuantityForRequest(req);

    const itemId = req.itemId ? String(req.itemId) : "";
    const categoryId = req.categoryId ? String(req.categoryId) : "";

    let resolvedEquipment = null;
    if (itemId && equipmentById.has(itemId)) {
      const eq = equipmentById.get(itemId);
      if (!categoryId || String(eq.categoryId) === categoryId) {
        resolvedEquipment = eq;
      }
    }
    if (!resolvedEquipment && req.itemName) {
      resolvedEquipment = equipmentByName.get(normalizeText(req.itemName)) || null;
    }
    if (!resolvedEquipment || !resolvedEquipment.id || !resolvedEquipment.categoryId) return;

    const key = `${resolvedEquipment.categoryId}::${resolvedEquipment.id}`;
    borrowedByEquipmentKey.set(key, (borrowedByEquipmentKey.get(key) || 0) + qty);
  });

  const fixes = [];
  Object.values(categoriesData || {}).forEach((category) => {
    const categoryId = category?.id;
    return categoryId;
  });

  Object.entries(categoriesData || {}).forEach(([categoryId, category]) => {
    const equipments = category?.equipments || {};
    Object.entries(equipments).forEach(([equipmentId, equipment]) => {
      const currentBorrowed = Number(equipment?.quantity_borrowed) || 0;
      const key = `${categoryId}::${equipmentId}`;
      const expectedBorrowed = Number(borrowedByEquipmentKey.get(key) || 0);

      if (currentBorrowed !== expectedBorrowed) {
        fixes.push({
          path: `equipment_categories/${categoryId}/equipments/${equipmentId}/quantity_borrowed`,
          value: expectedBorrowed,
          reason: `Rebuild quantity_borrowed from released requests (was ${currentBorrowed}, expected ${expectedBorrowed})`,
          safe: true
        });
      }
    });
  });

  const summary = {
    releasedRequests: releasedRequests.length,
    equipmentChecked: Object.values(categoriesData || {}).reduce((sum, category) => {
      const equipments = category?.equipments ? Object.keys(category.equipments).length : 0;
      return sum + equipments;
    }, 0),
    fixes: fixes.length,
    dryRun
  };

  if (dryRun) {
    return { success: true, summary, fixes };
  }

  await applyDataConsistencyFixes(fixes);

  if (autoRepair && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(storageKey, String(Date.now()));
    } catch {
      // ignore storage failures
    }
  }

  return { success: true, summary, fixesApplied: fixes.length };
};



export const backfillQuantityReleasedForReleasedRequests = async ({

  dryRun = true,

  autoBackfill = false,

  cooldownMs = 5 * 60 * 1000,

  storageKey = "sl_auto_backfill_quantity_released"

} = {}) => {
  if (autoBackfill && typeof window !== "undefined") {
    try {
      const lastRunRaw = window.localStorage.getItem(storageKey);
      const lastRun = lastRunRaw ? Number(lastRunRaw) : 0;
      if (Number.isFinite(lastRun) && lastRun > 0 && Date.now() - lastRun < cooldownMs) {
        return {
          success: true,
          skipped: true,
          reason: "cooldown",
          summary: { dryRun }
        };
      }
    } catch {
      // ignore storage failures
    }
  }

  const requestsSnapshot = await get(ref(database, "borrow_requests"));
  const requestsData = requestsSnapshot.exists() ? requestsSnapshot.val() : {};

  const fixes = [];
  Object.entries(requestsData || {}).forEach(([requestId, req]) => {
    const request = req || {};
    const statusValue = normalizeText(request.status);
    if (statusValue !== "released") return;

    const existing = Number(request.quantityReleased);
    if (Number.isFinite(existing) && existing > 0) return;

    const fallback = Number(request.approvedQuantity ?? request.quantity);
    const value = Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
    fixes.push({
      path: `borrow_requests/${requestId}/quantityReleased`,
      value,
      reason: "Backfill missing quantityReleased for released request",
      safe: true
    });
  });

  const summary = {
    releasedRequests: Object.values(requestsData || {}).filter((r) => normalizeText(r?.status) === "released").length,
    fixes: fixes.length,
    dryRun
  };

  if (dryRun) {
    return { success: true, summary, fixes };
  }

  if (fixes.length) {
    await applyDataConsistencyFixes(fixes);
  }

  if (autoBackfill && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(storageKey, String(Date.now()));
    } catch {
      // ignore
    }
  }

  return { success: true, summary, fixesApplied: fixes.length };
};
