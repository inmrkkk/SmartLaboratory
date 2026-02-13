// Debug script to check why manual records aren't showing in Monthly Borrowing Trends

// This simulates the filtering logic from calculateMonthlyData
function debugManualRecords(history) {
  console.log('=== DEBUGGING MANUAL RECORDS ===\n');
  
  const periodDays = 30; // Last 30 days (like your screenshot)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - periodDays);
  
  console.log(`Cutoff date (last ${periodDays} days): ${cutoffDate.toISOString()}`);
  console.log(`Current date: ${new Date().toISOString()}\n`);
  
  const historyEntries = Object.values(history);
  const monthlyReleaseTotals = {};
  
  historyEntries.forEach((entry, index) => {
    console.log(`--- Entry ${index + 1} ---`);
    console.log(`ID: ${entry.id}`);
    console.log(`Equipment: ${entry.equipmentName}`);
    console.log(`Action: "${entry.action}"`);
    console.log(`Status: "${entry.status}"`);
    console.log(`Is Manual Entry: ${entry.isManualEntry}`);
    console.log(`Quantity: ${entry.quantity}`);
    console.log(`Released Date: ${entry.releasedDate}`);
    console.log(`Return Date: ${entry.returnDate}`);
    console.log(`Timestamp: ${entry.timestamp}`);
    
    const action = (entry.action || '').toLowerCase();
    const status = (entry.status || '').toLowerCase();
    
    // Check filtering conditions
    const isSystemRelease = entry.entryType === 'release' || action.includes('release') || status === 'released';
    const isManualReturned = entry.isManualEntry && (status === 'returned' || action === 'returned');
    const isManualReleased = entry.isManualEntry && (status === 'released' || action === 'released');
    
    console.log(`\nFiltering Results:`);
    console.log(`  isSystemRelease: ${isSystemRelease}`);
    console.log(`  isManualReturned: ${isManualReturned}`);
    console.log(`  isManualReleased: ${isManualReleased}`);
    console.log(`  Should be included: ${isSystemRelease || isManualReturned || isManualReleased}`);
    
    if (!isSystemRelease && !isManualReturned && !isManualReleased) {
      console.log(`  ❌ REJECTED: Doesn't match any inclusion criteria\n`);
      return;
    }
    
    const dateSource = entry.releasedDate || entry.returnDate || entry.timestamp;
    console.log(`  Date Source: ${dateSource}`);
    
    if (!dateSource) {
      console.log(`  ❌ REJECTED: No date source\n`);
      return;
    }
    
    const date = new Date(dateSource);
    console.log(`  Parsed Date: ${date.toISOString()}`);
    console.log(`  Is Valid Date: ${!isNaN(date)}`);
    console.log(`  Is After Cutoff: ${date >= cutoffDate}`);
    
    if (isNaN(date) || date < cutoffDate) {
      console.log(`  ❌ REJECTED: Invalid date or outside date range\n`);
      return;
    }
    
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const quantity = parseInt(entry.quantity, 10) || parseInt(entry.details?.originalRequest?.quantity, 10) || 1;
    
    console.log(`  Month Key: ${monthKey}`);
    console.log(`  Final Quantity: ${quantity}`);
    
    monthlyReleaseTotals[monthKey] = (monthlyReleaseTotals[monthKey] || 0) + quantity;
    console.log(`  ✅ INCLUDED: Added ${quantity} to ${monthKey} (total: ${monthlyReleaseTotals[monthKey]})\n`);
  });
  
  console.log('=== FINAL RESULTS ===');
  console.log('Monthly Totals:', monthlyReleaseTotals);
  
  const totalQuantity = Object.values(monthlyReleaseTotals).reduce((sum, count) => sum + count, 0);
  console.log(`Total Quantity: ${totalQuantity}`);
  
  return monthlyReleaseTotals;
}

// Example usage - replace with your actual Firebase data
console.log('To debug your actual data:');
console.log('1. Open browser dev tools on your Analytics page');
console.log('2. Go to the Console tab');
console.log('3. Run: localStorage.setItem("debugHistory", JSON.stringify(historyData))');
console.log('4. Then run this script with your data\n');

console.log('Or check these common issues:');
console.log('1. Are your manual records marked with isManualEntry: true?');
console.log('2. What status do your manual records have? (Released/Returned/Other)');
console.log('3. Are the dates within the last 30 days?');
console.log('4. Is the quantity field a valid number?');

module.exports = { debugManualRecords };
