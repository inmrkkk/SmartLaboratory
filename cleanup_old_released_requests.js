// Script to clean up old released requests
// Run this in Node.js with: node cleanup_old_released_requests.js

const { getDatabase, ref, get, update, remove } = require('firebase/database');
const { initializeApp } = require('firebase/app');

// Firebase configuration (same as your firebase.js)
const firebaseConfig = {
  apiKey: "AIzaSyDsoxuTXhtOyQQIWZNDpyiWfOw6XgK5F8Y",
  authDomain: "smartlab-e2107.firebaseapp.com",
  databaseURL: "https://smartlab-e2107-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "smartlab-e2107",
  storageBucket: "smartlab-e2107.firebasestorage.app",
  messagingSenderId: "1025540647070",
  appId: "1:1025540647070:web:af708cc3962933eac9738f"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

async function cleanupOldReleasedRequests() {
  try {
    console.log('Fetching all borrow requests...');
    const borrowRequestsRef = ref(database, 'borrow_requests');
    const snapshot = await get(borrowRequestsRef);
    
    if (!snapshot.exists()) {
      console.log('No borrow requests found.');
      return;
    }
    
    const requests = snapshot.val();
    const releasedRequests = [];
    
    // Find all released requests
    Object.keys(requests).forEach(key => {
      const request = requests[key];
      if (request.status && request.status.toLowerCase() === 'released') {
        releasedRequests.push({ id: key, ...request });
      }
    });
    
    console.log(`Found ${releasedRequests.length} released requests:`);
    releasedRequests.forEach(req => {
      console.log(`- ID: ${req.id}, Item: ${req.itemName}, Quantity: ${req.quantity || 1}, Date: ${req.releasedAt}`);
    });
    
    // Option 1: Delete all released requests
    if (confirm(`Delete all ${releasedRequests.length} released requests?`)) {
      for (const req of releasedRequests) {
        await remove(ref(database, `borrow_requests/${req.id}`));
      }
      console.log('Deleted all released requests.');
    }
    
    // Option 2: Update status to 'returned' for all released requests
    if (confirm(`Mark all ${releasedRequests.length} released requests as 'returned'?`)) {
      for (const req of releasedRequests) {
        await update(ref(database, `borrow_requests/${req.id}`), {
          status: 'returned',
          returnedAt: new Date().toISOString()
        });
      }
      console.log('Updated all released requests to returned status.');
    }
    
  } catch (error) {
    console.error('Error cleaning up requests:', error);
  }
}

cleanupOldReleasedRequests();
