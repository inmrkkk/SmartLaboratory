// Find the source of the "2" pending requests count
// Run this in the browser console on your Smart Laboratory app

function findPendingRequestsSource() {
  console.log('🔍 Finding source of pending requests count...');
  
  try {
    // Get Firebase from the window object
    const { ref, get } = window.firebase.database;
    const database = window.firebase.database.database;
    
    if (!ref || !get || !database) {
      console.error('❌ Firebase database functions not found. Make sure you\'re on the Smart Laboratory app.');
      return;
    }

    // Get all borrow requests
    const borrowRequestsRef = ref(database, 'borrow_requests');
    
    get(borrowRequestsRef).then((snapshot) => {
      if (!snapshot.exists()) {
        console.log('✅ No borrow requests found - pending count should be 0');
        return;
      }

      const requestsData = snapshot.val();
      const allRequests = Object.entries(requestsData).map(([id, data]) => ({
        id,
        ...data
      }));

      console.log('📊 All requests analysis:');
      console.log('Total requests:', allRequests.length);

      // Find pending requests (exact same logic as Dashboard)
      const pendingRequests = allRequests.filter(req => 
        (req.status || '').toString().trim().toLowerCase() === 'pending'
      );

      console.log('🎯 Pending requests found:', pendingRequests.length);
      
      if (pendingRequests.length > 0) {
        console.log('📋 Pending requests details:');
        pendingRequests.forEach((req, index) => {
          console.log(`${index + 1}. ID: ${req.id}`);
          console.log(`   Status: "${req.status}"`);
          console.log(`   Item: ${req.itemName || 'No item name'}`);
          console.log(`   Borrower: ${req.adviserName || req.userEmail || 'No borrower'}`);
          console.log(`   Requested: ${req.requestedAt || 'No date'}`);
          console.log('---');
        });
      }

      // Check for status variations
      const statusVariations = {};
      allRequests.forEach(req => {
        const status = req.status || 'null';
        statusVariations[status] = (statusVariations[status] || 0) + 1;
      });

      console.log('🔢 Status breakdown:');
      Object.entries(statusVariations).forEach(([status, count]) => {
        console.log(`"${status}": ${count} requests`);
      });

      // Check if there are any requests with unusual status values
      const unusualStatuses = allRequests.filter(req => {
        const status = req.status || '';
        return status !== 'pending' && status !== 'approved' && status !== 'released' && status !== 'returned' && status !== 'rejected';
      });

      if (unusualStatuses.length > 0) {
        console.log('⚠️ Requests with unusual status values:');
        unusualStatuses.forEach(req => {
          console.log(`ID: ${req.id}, Status: "${req.status}", Item: ${req.itemName}`);
        });
      }

    }).catch((error) => {
      console.error('❌ Error fetching requests:', error);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the analysis
findPendingRequestsSource();
