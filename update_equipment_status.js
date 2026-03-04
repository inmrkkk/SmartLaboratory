// Update all equipment status to "Available"
// Run this script in browser console on your Smart Laboratory app

async function updateAllEquipmentStatusToAvailable() {
  console.log('🔧 Updating all equipment status to "Available"...');
  
  try {
    // Get Firebase from the window object
    const { ref, get, update } = window.firebase.database;
    const database = window.firebase.database.database;
    
    if (!ref || !get || !update || !database) {
      console.error('❌ Firebase database functions not found. Make sure you\'re on the Smart Laboratory app.');
      return;
    }

    // Get all categories
    console.log('📊 Loading categories...');
    const categoriesSnapshot = await get(ref(database, "equipment_categories"));
    
    if (!categoriesSnapshot.exists()) {
      console.log('✅ No categories found. Nothing to update.');
      return;
    }

    const categoriesData = categoriesSnapshot.val();
    const updates = [];
    let totalEquipment = 0;
    let equipmentToUpdate = 0;

    // Process each category
    for (const [categoryId, category] of Object.entries(categoriesData)) {
      const equipments = category?.equipments || {};
      
      for (const [equipmentId, equipment] of Object.entries(equipments)) {
        totalEquipment++;
        
        // Check if status is not "Available"
        if (equipment.status !== "Available") {
          equipmentToUpdate++;
          updates.push({
            path: `equipment_categories/${categoryId}/equipments/${equipmentId}/status`,
            value: "Available",
            equipmentName: equipment.name || equipment.equipmentName || 'Unknown',
            oldStatus: equipment.status
          });
        }
      }
    }

    if (updates.length === 0) {
      console.log('✅ All equipment already have "Available" status. No updates needed.');
      return;
    }

    console.log(`📋 Found ${equipmentToUpdate} equipment items to update out of ${totalEquipment} total.`);
    console.log('\n🔍 Sample updates to be applied:');
    updates.slice(0, 5).forEach((update, index) => {
      console.log(`${index + 1}. ${update.equipmentName}: "${update.oldStatus}" → "Available"`);
    });

    if (updates.length > 5) {
      console.log(`... and ${updates.length - 5} more updates`);
    }

    // Ask for confirmation
    const confirmed = confirm(
      `Update status to "Available" for ${updates.length} equipment items? This will modify your database.`
    );
    
    if (!confirmed) {
      console.log('❌ Update cancelled by user.');
      return;
    }

    // Apply updates
    console.log('\n🔨 Applying updates...');
    let successCount = 0;
    let errorCount = 0;

    for (const update of updates) {
      try {
        const equipmentRef = ref(database, update.path);
        await update(equipmentRef, update.value);
        successCount++;
      } catch (error) {
        console.error(`❌ Error updating ${update.equipmentName}:`, error);
        errorCount++;
      }
    }

    console.log(`✅ Update completed!`);
    console.log(`- Successfully updated: ${successCount} equipment items`);
    console.log(`- Failed updates: ${errorCount} equipment items`);
    console.log('\n🎉 All equipment status has been set to "Available"!');
    console.log('Refresh the page to see the updated status badges.');
    
  } catch (error) {
    console.error('❌ Error updating equipment status:', error);
  }
}

// Run the update
updateAllEquipmentStatusToAvailable();
