// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { database } from '../firebase';
import { ref, get } from 'firebase/database';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [assignedLaboratories, setAssignedLaboratories] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchAssignedLaboratories = async (userId) => {
    try {
      console.log("Fetching assigned laboratories for user:", userId);
      const laboratoriesRef = ref(database, 'laboratories');
      const snapshot = await get(laboratoriesRef);
      
      if (snapshot.exists()) {
        const laboratoriesData = snapshot.val();
        console.log("All laboratories data:", laboratoriesData);
        const assignedLabs = [];
        
        // Find laboratories where this user is the manager
        Object.keys(laboratoriesData).forEach((labId) => {
          const labData = laboratoriesData[labId];
          console.log(`Checking lab ${labId}:`, labData);
          if (labData.managerUserId === userId) {
            console.log(`User ${userId} is manager of lab ${labId}`);
            assignedLabs.push({
              id: labId,
              labId: labData.labId,
              labName: labData.labName,
              ...labData
            });
          }
        });
        
        console.log("Assigned laboratories:", assignedLabs);
        setAssignedLaboratories(assignedLabs);
      } else {
        console.log("No laboratories data found");
        setAssignedLaboratories([]);
      }
    } catch (error) {
      console.error('Error fetching assigned laboratories:', error);
      setAssignedLaboratories([]);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Auth state changed. Firebase user:", firebaseUser ? {
        uid: firebaseUser.uid,
        email: firebaseUser.email
      } : null);
      
      if (firebaseUser) {
        try {
          // Fetch user role from Firebase
          const userRef = ref(database, `users/${firebaseUser.uid}`);
          const snapshot = await get(userRef);
          
          if (snapshot.exists()) {
            const userData = snapshot.val();
            console.log("User data from database:", userData);
            
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              ...userData
            });
            setUserRole(userData.role);
            
            console.log("Set user role to:", userData.role);
            
            // If user is a laboratory manager, fetch their assigned laboratories
            if (userData.role === 'laboratory_manager') {
              console.log("Fetching assigned laboratories for lab manager");
              await fetchAssignedLaboratories(firebaseUser.uid);
            } else {
              console.log("Clearing assigned laboratories for admin");
              setAssignedLaboratories([]);
            }
          } else {
            console.log("User not found in database, signing out");
            // User not found in database
            await signOut(auth);
            setUser(null);
            setUserRole(null);
            setAssignedLaboratories([]);
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          await signOut(auth);
          setUser(null);
          setUserRole(null);
          setAssignedLaboratories([]);
        }
      } else {
        console.log("No firebase user, clearing state");
        setUser(null);
        setUserRole(null);
        setAssignedLaboratories([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserRole(null);
      setAssignedLaboratories([]);
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const hasRole = useCallback((requiredRole) => {
    if (!userRole) return false;
    
    // Admin has access to everything
    if (userRole === 'admin') return true;
    
    // Check specific role
    return userRole === requiredRole;
  }, [userRole]);

  const hasAnyRole = useCallback((roles) => {
    if (!userRole) return false;
    return roles.includes(userRole);
  }, [userRole]);

  const isAdmin = useCallback(() => userRole === 'admin', [userRole]);
  const isLaboratoryManager = useCallback(() => userRole === 'laboratory_manager', [userRole]);
  
  const canAccessLaboratory = useCallback((laboratoryId) => {
    if (userRole === 'admin') return true;
    if (userRole !== 'laboratory_manager') return false;
    return assignedLaboratories.some(lab => lab.id === laboratoryId);
  }, [userRole, assignedLaboratories]);
  
  const getAssignedLaboratoryIds = useCallback(() => {
    if (userRole === 'admin') return null; // Admin can access all labs
    return assignedLaboratories.map(lab => lab.id);
  }, [userRole, assignedLaboratories]);

  const value = {
    user,
    userRole,
    assignedLaboratories,
    loading,
    logout,
    hasRole,
    hasAnyRole,
    isAdmin,
    isLaboratoryManager,
    canAccessLaboratory,
    getAssignedLaboratoryIds
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
