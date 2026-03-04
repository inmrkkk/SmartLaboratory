// Direct fix for inventory data corruption
// Run this with: node -r esm fix_inventory_direct.js

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, update } from 'firebase/database';

// Firebase configuration (you may need to update this)
const firebaseConfig = {
  // Add your Firebase config here or import from your firebase.js
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const normalizeText = (value) => (value || "").toString().trim().toLowerCase();

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

      equipmentById.set(equipmentId, equipmentId);

      const nameCandidates = [equipment?.name, equipment?.itemName, equipment?.title, equipment?.equipmentName]
        .filter(Boolean)
        .map((n) => normalizeText(n));

      nameCandidates.forEach((key) => {
        if (!equipmentByName.has(key)) equipmentByName.set(key, equipmentId);
      });
    });
  });

  return { equipmentById, equipmentByName };
};

async function fixInventoryData() {
  console.log('🔧 Starting inventory data fix...');
  
  try {
    // Get data from Firebase
    const categoriesSnapshot = await get(ref(database, "equipment_categories"));
    const requestsSnapshot = await get(ref(database, "borrow_requests"));

    const categoriesData = categoriesSnapshot.exists() ? categoriesSnapshot.val() : {};
    const requestsData = requestsSnapshot.exists() ? requestsSnapshot.val() : {};

    const { equipmentById, equipmentByName } = buildEquipmentIndex(categoriesData);

    // Filter only released requests
    const releasedRequests = Object.entries(requestsData)
      .map(([id, req]) => ({ id, ...(req || {}) }))
      .filter((req) => normalizeText(req.status) === "released");

    console.log(`Found ${releasedRequests.length} released requests`);

    // Calculate expected borrowed quantities
    const borrowedByEquipmentKey = new Map();

    releasedRequests.forEach((req) => {
      const qty = Number(req.quantityReleased || req.approvedQuantity || req.quantity) || 1;

      const itemId = req.itemId ? String(req.itemId) : "";
      const categoryId = req.categoryId ? String(req.categoryId) : "";

      let resolvedEquipment = null;
      if (itemId && equipmentById.has(itemId)) {
        resolvedEquipment = itemId;
      }
      if (!resolvedEquipment && req.itemName) {
        resolvedEquipment = equipmentByName.get(normalizeText(req.itemName)) || null;
      }
      if (!resolvedEquipment) return;

      const key = `${categoryId}::${resolvedEquipment}`;
      borrowedByEquipmentKey.set(key, (borrowedByEquipmentKey.get(key) || 0) + qty);
    });

    // Find equipment that needs fixing
    const fixes = [];
    Object.entries(categoriesData || {}).forEach(([categoryId, category]) => {
      const equipments = category?.equipments || {};
      Object.entries(equipments).forEach(([equipmentId, equipment]) => {
        const currentBorrowed = Number(equipment?.quantity_borrowed) || 0;
        const key = `${categoryId}::${equipmentId}`;
        const expectedBorrowed = Number(borrowedByEquipmentKey.get(key) || 0);

        if (currentBorrowed !== expectedBorrowed) {
          fixes.push({
            categoryId,
            equipmentId,
            currentBorrowed,
            expectedBorrowed,
            equipmentName: equipment.name || equipment.equipmentName || 'Unknown'
          });
        }
      });
    });

    console.log(`Found ${fixes.length} equipment items that need fixing`);

    if (fixes.length === 0) {
      console.log('✅ No fixes needed! Data is already correct.');
      return;
    }

    // Show sample fixes
    console.log('\n🔍 Sample fixes to be applied:');
    fixes.slice(0, 5).forEach((fix, index) => {
      console.log(`${index + 1}. ${fix.equipmentName}: ${fix.currentBorrowed} → ${fix.expectedBorrowed}`);
    });

    if (fixes.length > 5) {
      console.log(`... and ${fixes.length - 5} more fixes`);
    }

    // Apply fixes
    console.log('\n🔨 Applying fixes...');
    for (const fix of fixes) {
      const equipmentRef = ref(database, `equipment_categories/${fix.categoryId}/equipments/${fix.equipmentId}`);
      await update(equipmentRef, {
        quantity_borrowed: fix.expectedBorrowed,
        updatedAt: new Date().toISOString()
      });
    }

    console.log('✅ Fix completed!');
    console.log(`- Fixes applied: ${fixes.length}`);
    console.log('\n🎉 Inventory data has been repaired!');
    console.log('Available counts should now be correct.');
    
  } catch (error) {
    console.error('❌ Error fixing inventory data:', error);
  }
}

// Run the fix
fixInventoryData().then(() => {
  console.log('Fix process completed');
  process.exit(0);
}).catch(error => {
  console.error('Fix process failed:', error);
  process.exit(1);
});
