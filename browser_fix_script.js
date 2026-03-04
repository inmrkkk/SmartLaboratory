// Copy this code and paste it into your browser console when on the Smart Laboratory application
// This will fix the inventory data corruption

async function fixInventoryData() {
  console.log('🔧 Starting inventory data fix...');
  
  try {
    // Import the necessary functions (they should be available in the global scope)
    const { rebuildQuantityBorrowedFromReleasedRequests } = window.dataConsistencyUtils || {};
    
    if (!rebuildQuantityBorrowedFromReleasedRequests) {
      console.error('❌ rebuildQuantityBorrowedFromReleasedRequests function not found. Make sure you\'re on the Smart Laboratory app.');
      return;
    }
    
    // First, preview what will be fixed
    console.log('📊 Previewing fixes...');
    const preview = await rebuildQuantityBorrowedFromReleasedRequests({ dryRun: true });
    
    console.log('Preview results:');
    console.log(`- Released requests found: ${preview.summary.releasedRequests}`);
    console.log(`- Equipment checked: ${preview.summary.equipmentChecked}`);
    console.log(`- Fixes needed: ${preview.summary.fixes}`);
    
    if (preview.summary.fixes === 0) {
      console.log('✅ No fixes needed! Data is already correct.');
      return;
    }
    
    console.log('\n🔍 Sample fixes to be applied:');
    preview.fixes.slice(0, 5).forEach((fix, index) => {
      console.log(`${index + 1}. ${fix.reason}`);
    });
    
    if (preview.fixes.length > 5) {
      console.log(`... and ${preview.fixes.length - 5} more fixes`);
    }
    
    // Ask for confirmation
    const confirmed = confirm(
      `Apply ${preview.summary.fixes} fixes to rebuild quantity_borrowed from released requests only? This will modify your database.`
    );
    
    if (!confirmed) {
      console.log('❌ Fix cancelled by user.');
      return;
    }
    
    // Apply the fixes
    console.log('\n🔨 Applying fixes...');
    const result = await rebuildQuantityBorrowedFromReleasedRequests({ dryRun: false });
    
    console.log('✅ Fix completed!');
    console.log(`- Fixes applied: ${result.fixesApplied}`);
    console.log('\n🎉 Inventory data has been repaired!');
    console.log('Available counts should now be correct.');
    console.log('Refresh the page to see the updated counts.');
    
  } catch (error) {
    console.error('❌ Error fixing inventory data:', error);
  }
}

// Run the fix
fixInventoryData();
