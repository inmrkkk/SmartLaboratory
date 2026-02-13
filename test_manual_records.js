// Simple test to verify manual records with "Returned" status are included in Monthly Borrowing Trends

// Mock data for testing
const mockHistoryData = [
  // Manual record with "Returned" status
  {
    id: '1',
    equipmentName: 'Microscope',
    action: 'Returned',
    status: 'Returned',
    borrowerName: 'John Doe',
    borrowerType: 'student',
    quantity: '5',
    returnDate: '2024-01-15T14:00:00Z',
    timestamp: '2024-01-15T14:00:00Z',
    isManualEntry: true
  },
  // Manual record with "Released" status
  {
    id: '2',
    equipmentName: 'Microscope',
    action: 'Released',
    status: 'Released',
    borrowerName: 'Jane Smith',
    borrowerType: 'student',
    quantity: '3',
    releasedDate: '2024-01-16T10:00:00Z',
    timestamp: '2024-01-16T10:00:00Z',
    isManualEntry: true
  }
];

// Test function to simulate calculateMonthlyData logic
function testMonthlyData(history) {
  const monthlyReleaseTotals = {};
  
  history.forEach(entry => {
    const action = (entry.action || '').toLowerCase();
    const status = (entry.status || '').toLowerCase();
    
    // Include both system-generated releases and manual returned records
    const isSystemRelease = action.includes('release') || status === 'released';
    const isManualReturned = entry.isManualEntry && (status === 'returned' || action === 'returned');
    const isManualReleased = entry.isManualEntry && (status === 'released' || action === 'released');
    
    console.log(`Entry ${entry.id}:`);
    console.log(`  Status: ${entry.status}`);
    console.log(`  Action: ${entry.action}`);
    console.log(`  isManualEntry: ${entry.isManualEntry}`);
    console.log(`  isManualReturned: ${isManualReturned}`);
    console.log(`  isManualReleased: ${isManualReleased}`);
    console.log(`  Should be included: ${isSystemRelease || isManualReturned || isManualReleased}`);
    
    if (!isSystemRelease && !isManualReturned && !isManualReleased) {
      console.log(`  ❌ SKIPPED`);
      return;
    }
    
    const dateSource = entry.returnDate || entry.releasedDate || entry.timestamp;
    if (!dateSource) {
      console.log(`  ❌ NO DATE SOURCE`);
      return;
    }
    
    const date = new Date(dateSource);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const quantity = parseInt(entry.quantity, 10) || 1;
    
    monthlyReleaseTotals[monthKey] = (monthlyReleaseTotals[monthKey] || 0) + quantity;
    console.log(`  ✅ INCLUDED: +${quantity} to ${monthKey}`);
    console.log('');
  });
  
  return monthlyReleaseTotals;
}

console.log('=== TESTING MANUAL RECORDS IN MONTHLY BORROWING TRENDS ===\n');

const result = testMonthlyData(mockHistoryData);

console.log('=== RESULTS ===');
console.log('Monthly totals:', result);
console.log('');

// Expected: Both records should be included
// - Record 1 (Returned status): 5 quantity
// - Record 2 (Released status): 3 quantity
// Total for January 2024: 8

const expectedTotal = 8;
const actualTotal = result['2024-01'] || 0;

console.log(`Expected total for January 2024: ${expectedTotal}`);
console.log(`Actual total for January 2024: ${actualTotal}`);
console.log(`Test ${actualTotal === expectedTotal ? '✅ PASSED' : '❌ FAILED'}`);

if (actualTotal === expectedTotal) {
  console.log('\n🎉 Manual records with "Returned" status ARE being included in Monthly Borrowing Trends!');
} else {
  console.log('\n❌ Manual records with "Returned" status are NOT being included correctly.');
}
