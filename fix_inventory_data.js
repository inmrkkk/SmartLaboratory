// Fix quantity_borrowed data corruption
// This script will rebuild quantity_borrowed from released requests only

const { rebuildQuantityBorrowedFromReleasedRequests } = require('./src/utils/dataConsistencyUtils.js');
const { database } = require('./src/firebase.js');

async function fixInventoryData() {
  console.log('🔧 Starting inventory data fix...');
  
  try {
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
    
    // Apply the fixes
    console.log('\n🔨 Applying fixes...');
    const result = await rebuildQuantityBorrowedFromReleasedRequests({ dryRun: false });
    
    console.log('✅ Fix completed!');
    console.log(`- Fixes applied: ${result.fixesApplied}`);
    console.log('\n🎉 Inventory data has been repaired!');
    console.log('Available counts should now be correct.');
    
  } catch (error) {
    console.error('❌ Error fixing inventory data:', error);
  }
}

// Run the fix
fixInventoryData();
