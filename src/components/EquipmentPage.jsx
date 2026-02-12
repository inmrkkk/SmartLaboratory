// src/components/EquipmentPage.jsx
import React, { useState, useEffect, useCallback } from "react";
import { ref, push, onValue, remove, update, get } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
// Import EquipmentMaintenance - adjust path as needed
import EquipmentMaintenance from "./equipment/EquipmentMaintenance";
import DeleteConfirmationModal from "./DeleteConfirmationModal";
import ToastNotification from "./ToastNotification";
import "../CSS/Equipment.css";
import "../CSS/HistoryPage.css";

export default function EquipmentPage({ onMaintenanceComplete }) {
  const { isAdmin, getAssignedLaboratoryIds, assignedLaboratories, isLaboratoryManager } = useAuth();
  const [categories, setCategories] = useState([]);
  const [laboratories, setLaboratories] = useState([]);
  const [equipments, setEquipments] = useState([]);
  const [users, setUsers] = useState([]);

  const [selectedCategory, setSelectedCategory] = useState("");
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false);
  const [showAddEquipmentForm, setShowAddEquipmentForm] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);

  const [loading, setLoading] = useState(true);
  const [isSubmittingEquipment, setIsSubmittingEquipment] = useState(false);
  const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [activeTab, setActiveTab] = useState("categories");
  const [searchTerm, setSearchTerm] = useState("");
  const [laboratoryFilter, setLaboratoryFilter] = useState("");

  const [categoryFormData, setCategoryFormData] = useState({
    title: "",
    description: "",
    labId: "",
    labRecordId: "",
    labName: ""
  });

  const [equipmentFormData, setEquipmentFormData] = useState({
    name: "",
    model: "",
    serialNumber: "",
    status: "Available",
    condition: "Good",
    location: "",
    purchaseDate: "",
    warrantyExpiry: "",
    assignedTo: "",
    notes: "",
    categoryId: "",
    labId: "",
    labRecordId: "",
    laboratory: "",
    quantity: "1",
    imageUrl: ""
  });

  const [equipmentImage, setEquipmentImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [showUsageReportModal, setShowUsageReportModal] = useState(false);
  const [selectedEquipmentForReport, setSelectedEquipmentForReport] = useState(null);
  const [usageData, setUsageData] = useState(null);
  const [usageDataLoading, setUsageDataLoading] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [equipmentToDelete, setEquipmentToDelete] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
  };

  const getEquipmentDisplayName = (equipment) => {
    if (!equipment) return "Unnamed Equipment";
    
    // Safely handle each property
    const name = equipment.name && typeof equipment.name === 'string' ? equipment.name.trim() : null;
    const equipmentName = equipment.equipmentName && typeof equipment.equipmentName === 'string' ? equipment.equipmentName.trim() : null;
    const title = equipment.title && typeof equipment.title === 'string' ? equipment.title.trim() : null;
    const itemName = equipment.itemName && typeof equipment.itemName === 'string' ? equipment.itemName.trim() : null;
    
    const displayName = name || equipmentName || title || itemName || "Unnamed Equipment";
    
    return displayName;
  };

  const fetchCategories = useCallback(() => {
    try {
      setLoading(true);
      const categoriesRef = ref(database, 'equipment_categories');

      onValue(categoriesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const categoryList = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));

          const augmentedCategories = categoryList.map(category => {
            if (category.labRecordId && category.labName) {
              return category;
            }

            const matchingLab = laboratories.find(
              lab => lab.id === category.labRecordId || lab.labId === category.labId
            );

            return {
              ...category,
              labRecordId: category.labRecordId || matchingLab?.id || "",
              labName: category.labName || matchingLab?.labName || ""
            };
          });

          // Filter categories based on user role and lab assignment
          let filteredCategories = augmentedCategories;
          if (!isAdmin()) {
            const assignedLabIds = getAssignedLaboratoryIds();
            if (assignedLabIds) {
              // Filter categories to only show those from assigned laboratories
              filteredCategories = augmentedCategories.filter(category => {
                const lab = laboratories.find(l => l.labId === category.labId);
                return lab && assignedLabIds.includes(lab.id);
              });
            }
          }

          setCategories(filteredCategories);
        } else {
          setCategories([]);
        }
        setLoading(false);
      });
    } catch (error) {
      console.error("Error fetching categories:", error);
      setLoading(false);
    }
  }, [isAdmin, getAssignedLaboratoryIds, laboratories]);

  const fetchLaboratories = useCallback(() => {
    try {
      const laboratoriesRef = ref(database, 'laboratories');

      onValue(laboratoriesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const laboratoryList = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
          setLaboratories(laboratoryList);
        } else {
          setLaboratories([]);
        }
      });
    } catch (error) {
      console.error("Error fetching laboratories:", error);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const usersRef = ref(database, 'users');
      const snapshot = await get(usersRef);

      if (snapshot.exists()) {
        const usersData = snapshot.val();
        const fetchedUsers = [];

        // Convert the object to array with IDs
        Object.keys(usersData).forEach((userId) => {
          const userData = usersData[userId];
          fetchedUsers.push({
            id: userId,
            name: userData.name || "Unknown",
            email: userData.email || "No email",
            role: userData.role || "user",
            ...userData
          });
        });

        setUsers(fetchedUsers);
      } else {
        setUsers([]);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  }, []);

  // Fetch laboratories and users from Firebase
  useEffect(() => {
    fetchLaboratories();
    fetchUsers();
  }, [fetchLaboratories, fetchUsers]);

  // Re-fetch categories when laboratories change (for filtering)
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Fetch equipments when category is selected
  useEffect(() => {
    if (selectedCategory) {
      fetchEquipments(selectedCategory);
    } else {
      setEquipments([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  // Debug: Check assigned laboratories
  useEffect(() => {
    if (isLaboratoryManager()) {
      console.log('[EquipmentPage] Lab Manager - Assigned Laboratories:', assignedLaboratories);
      console.log('[EquipmentPage] isLaboratoryManager:', isLaboratoryManager());
    }
  }, [assignedLaboratories, isLaboratoryManager]);

  // Load history data for usage reports
  useEffect(() => {
    const historyRef = ref(database, 'history');

    const unsubscribe = onValue(historyRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const historyList = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        setHistoryData(historyList);
      } else {
        setHistoryData([]);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedCategory) return;

    const category = categories.find(cat => cat.id === selectedCategory);
    if (!category) return;

    const matchedLab = laboratories.find(
      lab => lab.id === category.labRecordId || lab.labId === category.labId
    );

    const resolvedLabId = category.labId || matchedLab?.labId || "";
    const resolvedLabRecordId = category.labRecordId || matchedLab?.id || "";
    const resolvedLabName = category.labName || matchedLab?.labName || "";

    setEquipmentFormData(prev => {
      if (
        prev.labId === resolvedLabId &&
        prev.labRecordId === resolvedLabRecordId &&
        prev.laboratory === resolvedLabName
      ) {
        return prev;
      }

      return {
        ...prev,
        labId: resolvedLabId,
        labRecordId: resolvedLabRecordId,
        laboratory: resolvedLabName
      };
    });
  }, [selectedCategory, categories, laboratories]);

  const fetchEquipments = (categoryId) => {
    try {
      const equipmentsRef = ref(database, `equipment_categories/${categoryId}/equipments`);

      onValue(equipmentsRef, (snapshot) => {
        const data = snapshot.val();
        console.log('[EquipmentPage] Raw equipment data from Firebase:', data);
        if (data) {
          const equipmentList = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
          console.log('[EquipmentPage] Processed equipment list:', equipmentList);
          // Log first equipment details
          if (equipmentList.length > 0) {
            console.log('[EquipmentPage] First equipment keys:', Object.keys(equipmentList[0]));
            console.log('[EquipmentPage] First equipment full object:', equipmentList[0]);
          }

          // Filter equipment based on user role and assigned laboratories
          let filteredEquipment = equipmentList;
          if (!isAdmin()) {
            const assignedLabIds = getAssignedLaboratoryIds();
            if (assignedLabIds) {
              // Filter equipment to only show those from assigned laboratories
              filteredEquipment = equipmentList.filter(equipment => {
                // Find the laboratory for this equipment
                const lab = laboratories.find(l => l.labId === equipment.labId);
                return lab && assignedLabIds.includes(lab.id);
              });
            }
          }

          setEquipments(filteredEquipment);
        } else {
          setEquipments([]);
        }
      });
    } catch (error) {
      console.error("Error fetching equipments:", error);
    }
  };

  const handleCategoryInputChange = (e) => {
    const { name, value } = e.target;

    if (name === "labId") {
      const selectedLab = laboratories.find((lab) => lab.labId === value || lab.id === value);

      setCategoryFormData(prev => ({
        ...prev,
        labId: value,
        labRecordId: selectedLab?.id || "",
        labName: selectedLab?.labName || ""
      }));
      return;
    }

    setCategoryFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleEquipmentInputChange = (e) => {
    const { name, value } = e.target;

    let updatedData = { [name]: value };

    // Auto-populate Assigned To when laboratory is selected
    if (name === 'quantity') {
      const sanitizedValue = value.replace(/[^\d]/g, "");
      updatedData.quantity = sanitizedValue;
    }

    if (name === 'labId') {
      const selectedLab = laboratories.find(lab => lab.labId === value || lab.id === value);

      updatedData.labRecordId = selectedLab?.id || "";
      updatedData.laboratory = selectedLab?.labName || "";

      if (selectedLab && selectedLab.managerUserId) {
        // Find the manager user
        const managerUser = users.find(user => user.id === selectedLab.managerUserId);

        if (managerUser) {
          updatedData.assignedTo = managerUser.name;
        }
      } else {
        // Clear assignedTo if no manager is assigned to the lab
        updatedData.assignedTo = "";
      }
    }

    setEquipmentFormData(prev => ({
      ...prev,
      ...updatedData
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file');
        return;
      }

      // Validate file size (max 2MB for base64 to avoid database bloat)
      if (file.size > 2 * 1024 * 1024) {
        alert('Image size should be less than 2MB for optimal performance');
        return;
      }

      setEquipmentImage(file);

      // Create preview and convert to base64
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
        // base64 string is stored in reader.result and will be used in uploadEquipmentImage
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadEquipmentImage = async (file) => {
    try {
      // Convert image to base64 string for storing in database
      console.log("Converting image to base64...");

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result;
          console.log("Image converted to base64 successfully");
          resolve(base64String);
        };
        reader.onerror = (error) => {
          console.error("Error reading file:", error);
          reject(error);
        };
        reader.readAsDataURL(file);
      });
    } catch (error) {
      console.error("Error converting image:", error);
      return "";
    }
  };

  const handleCategorySubmit = async (e) => {
    e.preventDefault();

    if (!categoryFormData.title.trim()) {
      alert("Please enter a category title");
      return;
    }

    if (isAdmin() && !categoryFormData.labId.trim()) {
      setFeedbackMessage("Please select a laboratory for this category");
      setShowErrorModal(true);
      return;
    }

    setIsSubmittingCategory(true);

    // Auto-assign labId for Lab Managers
    let submissionData = { ...categoryFormData };

    if (!isAdmin()) {
      const assignedLabIds = getAssignedLaboratoryIds();
      if (assignedLabIds && assignedLabIds.length > 0) {
        // For Lab Managers, use their first assigned lab
        const assignedLab = laboratories.find(lab => assignedLabIds.includes(lab.id));
        if (assignedLab) {
          submissionData.labId = assignedLab.labId;
          submissionData.labRecordId = assignedLab.id;
          submissionData.labName = assignedLab.labName || "";
        }
      }
    } else if (submissionData.labId) {
      const selectedLab = laboratories.find((lab) => lab.labId === submissionData.labId || lab.id === submissionData.labId);
      if (selectedLab) {
        submissionData.labId = selectedLab.labId;
        submissionData.labRecordId = selectedLab.id;
        submissionData.labName = selectedLab.labName || "";
      }
    }

    try {
      if (editingCategory) {
        const categoryRef = ref(database, `equipment_categories/${editingCategory.id}`);
        await update(categoryRef, {
          ...submissionData,
          updatedAt: new Date().toISOString()
        });
        showToast("Category updated successfully!");
      } else {
        const categoriesRef = ref(database, 'equipment_categories');
        await push(categoriesRef, {
          ...submissionData,
          availableCount: 0,
          totalCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        showToast("Category added successfully!");
      }

      // Close form after successful submission
      setTimeout(() => {
        resetCategoryForm();
      }, 1000);

    } catch (error) {
      console.error("Error saving category:", error);
      showToast(`Error saving category: ${error.message}. Please try again.`, "error");
    } finally {
      setIsSubmittingCategory(false);
    }
  };

  const handleEquipmentSubmit = async (e) => {
    e.preventDefault();

    if (!equipmentFormData.name.trim() || !selectedCategory) {
      setFeedbackMessage("Please fill in required fields and select a category");
      setShowErrorModal(true);
      return;
    }

    setIsSubmittingEquipment(true);

    try {
      // Upload image if one was selected (optional, don't block if it fails)
      let imageUrl = equipmentFormData.imageUrl;
      if (equipmentImage) {
        console.log("Uploading image...");
        imageUrl = await uploadEquipmentImage(equipmentImage);
        if (imageUrl) {
          console.log("Image uploaded successfully:", imageUrl);
        } else {
          console.warn("Image upload failed but continuing with equipment save");
        }
      }

      const selectedCategoryData = categories.find(cat => cat.id === selectedCategory);
      const categoryLabId = selectedCategoryData?.labId || "";
      const categoryLabRecordId = selectedCategoryData?.labRecordId || "";
      const categoryLabName = selectedCategoryData?.labName || "";

      const matchedLab = laboratories.find(
        lab =>
          lab.id === categoryLabRecordId ||
          lab.labId === categoryLabId ||
          lab.labId === equipmentFormData.labId ||
          lab.id === equipmentFormData.labRecordId
      );

      const resolvedLabId = categoryLabId || equipmentFormData.labId || matchedLab?.labId || "";
      let resolvedLabRecordId = categoryLabRecordId || equipmentFormData.labRecordId || matchedLab?.id || "";
      let resolvedLabName = categoryLabName || equipmentFormData.laboratory || matchedLab?.labName || "";

      if (!resolvedLabRecordId && resolvedLabId) {
        const labById = laboratories.find(lab => lab.labId === resolvedLabId || lab.id === resolvedLabId);
        if (labById) {
          resolvedLabRecordId = labById.id;
          if (!resolvedLabName) {
            resolvedLabName = labById.labName || "";
          }
        }
      }

      const parsedQuantity = Math.max(1, parseInt(equipmentFormData.quantity, 10) || 1);

      const equipmentData = {
        ...equipmentFormData,
        quantity: parsedQuantity,
        labId: resolvedLabId,
        labRecordId: resolvedLabRecordId,
        laboratory: resolvedLabName,
        categoryId: selectedCategory,
        imageUrl: imageUrl || "",
        // Ensure both name and equipmentName are set for consistency
        equipmentName: equipmentFormData.name || equipmentFormData.equipmentName
      };

      console.log("Saving equipment data:", equipmentData);

      if (editingEquipment) {
        const equipmentRef = ref(database, `equipment_categories/${selectedCategory}/equipments/${editingEquipment.id}`);
        await update(equipmentRef, {
          ...equipmentData,
          updatedAt: new Date().toISOString()
        });
        showToast("Equipment updated successfully!");
      } else {
        const equipmentsRef = ref(database, `equipment_categories/${selectedCategory}/equipments`);
        await push(equipmentsRef, {
          ...equipmentData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        await updateCategoryCounts(selectedCategory);
        showToast("Equipment added successfully!");
      }

      // Close form after successful submission
      setTimeout(() => {
        resetEquipmentForm();
        setIsSubmittingEquipment(false);
      }, 1000);

    } catch (error) {
      console.error("Error saving equipment:", error);
      showToast(`Error saving equipment: ${error.message}. Please try again.`, "error");
      setIsSubmittingEquipment(false);
    }
  };

  const updateCategoryCounts = async (categoryId) => {
    try {
      const equipmentsRef = ref(database, `equipment_categories/${categoryId}/equipments`);
      onValue(equipmentsRef, async (snapshot) => {
        const data = snapshot.val();
        const totalCount = data
          ? Object.values(data).reduce((sum, eq) => sum + (Number(eq.quantity) || 1), 0)
          : 0;
        const availableCount = data
          ? Object.values(data).reduce((sum, eq) => {
              const quantity = Number(eq.quantity) || 1;
              return (eq.status === 'Available' || eq.status === 'available') ? sum + quantity : sum;
            }, 0)
          : 0;

        const categoryRef = ref(database, `equipment_categories/${categoryId}`);
        await update(categoryRef, {
          totalCount,
          availableCount
        });
      }, { onlyOnce: true });
    } catch (error) {
      console.error("Error updating category counts:", error);
    }
  };

  // Keep category stored counts (totalCount, availableCount) in sync with
  // the actual equipments data so the category cards immediately reflect
  // the same numbers as the banner after login.
  useEffect(() => {
    if (!categories || categories.length === 0) return;

    categories.forEach((category) => {
      if (category && category.id) {
        updateCategoryCounts(category.id);
      }
    });
  }, [categories]);

  // Helper function to get user role from userId
  const getUserRole = (userId) => {
    if (!userId) return null;
    const user = users.find(u => u.id === userId || u.userId === userId);
    return user?.role || null;
  };

  // Determine if user is faculty or student
  const determineUserType = (entry) => {
    const userId = entry.userId || entry.details?.originalRequest?.userId || null;

    if (userId) {
      const userRole = getUserRole(userId);

      if (userRole === 'admin' || userRole === 'laboratory_manager') {
        return true; // Faculty
      }

      if (userRole === 'student') {
        return false; // Student
      }
    }

    return false; // Default to student
  };

  // Calculate usage data for equipment
  const calculateUsageData = async (equipmentName) => {
    const equipmentHistory = historyData.filter(entry =>
      entry.equipmentName === equipmentName
    );

    // Count system-generated records
    const systemBorrowings = equipmentHistory.filter(entry =>
      entry.action === "Item Released"
    ).length;

    // Count manual records with valid borrowing lifecycle (Returned status)
    const manualReturnedRecords = equipmentHistory.filter(entry =>
      entry.isManualEntry &&
      (entry.status === "Returned" || entry.status === "returned")
    );

    // Calculate quantities for manual records
    let manualTotalQuantity = 0;
    let manualStudentQuantity = 0;
    let manualFacultyQuantity = 0;

    manualReturnedRecords.forEach(entry => {
      const quantity = parseInt(entry.quantity) || 1;
      const borrowerType = entry.borrowerType || 'student';

      manualTotalQuantity += quantity;

      if (borrowerType === 'student' || borrowerType === 'Student') {
        manualStudentQuantity += quantity;
      } else if (borrowerType === 'faculty' || borrowerType === 'Faculty / Instructor' || borrowerType === 'laboratory_manager') {
        manualFacultyQuantity += quantity;
      }
    });

    // Calculate system-generated counts by user type
    let systemStudentBorrowings = 0;
    let systemFacultyBorrowings = 0;

    equipmentHistory.forEach(entry => {
      if (entry.action === "Item Released" && !entry.isManualEntry) {
        const isFaculty = determineUserType(entry);

        if (isFaculty) {
          systemFacultyBorrowings++;
        } else {
          systemStudentBorrowings++;
        }
      }
    });

    // Try to get analytics data from Firebase
    try {
      const analyticsRef = ref(database, `equipment_usage_analytics/${equipmentName}`);
      const analyticsSnapshot = await get(analyticsRef);

      if (analyticsSnapshot.exists()) {
        const analyticsData = analyticsSnapshot.val();
        console.log('[EquipmentPage] Using analytics data for', equipmentName, analyticsData);

        return {
          total: analyticsData.totalBorrowed || (systemBorrowings + manualTotalQuantity),
          students: analyticsData.borrowedByStudents || (systemStudentBorrowings + manualStudentQuantity),
          faculty: analyticsData.borrowedByFaculty || (systemFacultyBorrowings + manualFacultyQuantity),
          systemTotal: systemBorrowings,
          systemStudents: systemStudentBorrowings,
          systemFaculty: systemFacultyBorrowings,
          manualTotal: manualTotalQuantity,
          manualStudents: manualStudentQuantity,
          manualFaculty: manualFacultyQuantity,
          lastUpdated: analyticsData.lastUpdated
        };
      }
    } catch (error) {
      console.error('[EquipmentPage] Error fetching analytics data:', error);
    }

    // Fallback to calculated values if analytics data not available
    const totalBorrowings = systemBorrowings + manualTotalQuantity;
    const totalStudentBorrowings = systemStudentBorrowings + manualStudentQuantity;
    const totalFacultyBorrowings = systemFacultyBorrowings + manualFacultyQuantity;

    return {
      total: totalBorrowings,
      students: totalStudentBorrowings,
      faculty: totalFacultyBorrowings,
      systemTotal: systemBorrowings,
      systemStudents: systemStudentBorrowings,
      systemFaculty: systemFacultyBorrowings,
      manualTotal: manualTotalQuantity,
      manualStudents: manualStudentQuantity,
      manualFaculty: manualFacultyQuantity
    };
  };

  // Count how many times an equipment has been reported as lost/missing
  const getLostOrMissingCount = (equipmentName) => {
    if (!equipmentName || !historyData || historyData.length === 0) return 0;

    const normalizedName = equipmentName.toLowerCase();

    return historyData.filter(entry => {
      const entryName = (entry.equipmentName || '').toLowerCase();
      if (entryName !== normalizedName) return false;

      const condition = (entry.condition || '').toLowerCase();
      if (condition.includes('lost') || condition.includes('missing') || condition === 'item lost/missing') {
        return true;
      }

      const notesText = (
        entry.returnDetails?.notes ||
        entry.details?.notes ||
        ''
      ).toLowerCase();

      return notesText.includes('lost') || notesText.includes('missing');
    }).length;
  };

  // Calculate usage statistics
  const calculateUsageStatistics = (equipmentName) => {
    const equipmentHistory = historyData.filter(entry =>
      entry.equipmentName === equipmentName
    );

    if (equipmentHistory.length === 0) {
      return {
        mostActivePeriod: "No data available",
        averageUsage: "0 times/month",
        utilizationRate: "0%"
      };
    }

    // Calculate most active period (month with most borrowings)
    const monthlyData = {};
    equipmentHistory.forEach(entry => {
      if (entry.action === "Item Released" && entry.timestamp) {
        const date = new Date(entry.timestamp);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
      }
    });

    const mostActiveMonth = Object.entries(monthlyData).reduce((max, [month, count]) =>
      count > max.count ? { month, count } : max,
      { month: "No data", count: 0 }
    );

    // Format the most active period
    const formatMonth = (monthKey) => {
      if (monthKey === "No data") return "No data available";
      const [year, month] = monthKey.split('-');
      const monthNames = ["January", "February", "March", "April", "May", "June",
                         "July", "August", "September", "October", "November", "December"];
      return `${monthNames[parseInt(month) - 1]} ${year}`;
    };

    // Calculate average usage per month
    const totalMonths = Object.keys(monthlyData).length;
    const totalBorrowings = Object.values(monthlyData).reduce((sum, count) => sum + count, 0);
    const averageUsage = totalMonths > 0 ? (totalBorrowings / totalMonths).toFixed(1) : "0";

    // Calculate utilization rate (percentage of months with activity)
    const allMonths = Object.keys(monthlyData);
    const monthsWithActivity = allMonths.filter(month => monthlyData[month] > 0).length;
    const utilizationRate = allMonths.length > 0
      ? ((monthsWithActivity / allMonths.length) * 100).toFixed(0)
      : "0";

    return {
      mostActivePeriod: formatMonth(mostActiveMonth.month),
      averageUsage: `${averageUsage} times/month`,
      utilizationRate: `${utilizationRate}%`
    };
  };

  const handleViewUsageReport = async (equipment) => {
    setSelectedEquipmentForReport(equipment);
    setShowUsageReportModal(true);
    setUsageDataLoading(true);

    try {
      const data = await calculateUsageData(getEquipmentDisplayName(equipment));
      setUsageData(data);
    } catch (error) {
      console.error('[EquipmentPage] Error loading usage data:', error);
      setUsageData({
        total: 0,
        students: 0,
        faculty: 0
      });
    } finally {
      setUsageDataLoading(false);
    }
  };

  const handleEditCategory = (category) => {
    setEditingCategory(category);
    setCategoryFormData({
      title: category.title || "",
      description: category.description || "",
      labId: category.labId || "",
      labRecordId: category.labRecordId || "",
      labName: category.labName || ""
    });
    setShowAddCategoryForm(true);
  };

  const handleEditEquipment = (equipment) => {
    setEditingEquipment(equipment);

    // Auto-populate assignedTo if labId exists and has a manager
    let assignedTo = equipment.assignedTo || "";
    if (equipment.labId && !assignedTo) {
      const selectedLab = laboratories.find(lab => lab.labId === equipment.labId);
      if (selectedLab && selectedLab.managerUserId) {
        const managerUser = users.find(user => user.id === selectedLab.managerUserId);
        if (managerUser) {
          assignedTo = managerUser.name;
        }
      }
    }

    setEquipmentFormData({
      name: equipment.name || equipment.equipmentName || "",
      model: equipment.model || "",
      serialNumber: equipment.serialNumber || "",
      status: equipment.status || "Available",
      condition: equipment.condition || "Good",
      location: equipment.location || "",
      purchaseDate: equipment.purchaseDate || "",
      warrantyExpiry: equipment.warrantyExpiry || "",
      assignedTo: assignedTo,
      notes: equipment.notes || "",
      categoryId: equipment.categoryId || "",
      labId: equipment.labId || "",
      labRecordId: equipment.labRecordId || "",
      laboratory: equipment.laboratory || "",
      quantity: equipment.quantity ? String(equipment.quantity) : "1",
      imageUrl: equipment.imageUrl || ""
    });
    setEquipmentImage(null);
    // If imageUrl is a base64 string (starts with data:), use it as preview
    // Otherwise it might be empty or a URL
    setImagePreview(equipment.imageUrl && equipment.imageUrl.startsWith('data:') ? equipment.imageUrl : null);
    setShowAddEquipmentForm(true);
  };

  const handleDeleteCategory = (categoryId) => {
    setCategoryToDelete(categoryId);
    setShowDeleteConfirmModal(true);
  };

  const confirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    
    try {
      const categoryRef = ref(database, `equipment_categories/${categoryToDelete}`);
      await remove(categoryRef);
      showToast("Category deleted successfully!");
      if (selectedCategory === categoryToDelete) {
        setSelectedCategory("");
        setEquipments([]);
      }
    } catch (error) {
      console.error("Error deleting category:", error);
      showToast("Error deleting category. Please try again.", "error");
    } finally {
      setShowDeleteConfirmModal(false);
      setCategoryToDelete(null);
    }
  };

  const handleDeleteEquipment = (equipmentId) => {
    setEquipmentToDelete(equipmentId);
    setShowDeleteConfirmModal(true);
  };

  const confirmDeleteEquipment = async () => {
    if (!equipmentToDelete) return;
    
    try {
      const equipmentRef = ref(database, `equipment_categories/${selectedCategory}/equipments/${equipmentToDelete}`);
      await remove(equipmentRef);
      await updateCategoryCounts(selectedCategory);
      showToast("Equipment deleted successfully!");
    } catch (error) {
      console.error("Error deleting equipment:", error);
      showToast("Error deleting equipment. Please try again.", "error");
    } finally {
      setShowDeleteConfirmModal(false);
      setEquipmentToDelete(null);
    }
  };

  const resetCategoryForm = () => {
    setCategoryFormData({
      title: "",
      description: "",
      labId: "",
      labRecordId: "",
      labName: ""
    });
    setShowAddCategoryForm(false);
    setEditingCategory(null);
  };

  const resetEquipmentForm = () => {
    setEquipmentFormData({
      name: "",
      model: "",
      serialNumber: "",
      status: "Available",
      condition: "Good",
      location: "",
      purchaseDate: "",
      warrantyExpiry: "",
      assignedTo: "",
      notes: "",
      categoryId: "",
      labId: "",
      labRecordId: "",
      laboratory: "",
      quantity: "1",
      imageUrl: ""
    });
    setEquipmentImage(null);
    setImagePreview(null);
    setShowAddEquipmentForm(false);
    setEditingEquipment(null);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Available": return "#10b981";
      case "In Use": return "#f59e0b";
      case "Maintenance": return "#ef4444";
      case "Retired": return "#6b7280";
      default: return "#6b7280";
    }
  };

  const getWarrantyStatus = (warrantyExpiry) => {
    if (!warrantyExpiry) return null;

    const today = new Date();
    const warranty = new Date(warrantyExpiry);
    const diffDays = Math.ceil((warranty - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { status: 'expired', text: 'Expired', color: '#ef4444' };
    if (diffDays <= 30) return { status: 'warning', text: `${diffDays}d left`, color: '#f59e0b' };
    return { status: 'valid', text: 'Valid', color: '#10b981' };
  };

  // Filter equipments based on search term and laboratory filter
  const filteredEquipments = equipments.filter(equipment => {
    const normalizedSearch = (searchTerm || "").trim().toLowerCase();
    const displayName = getEquipmentDisplayName(equipment);

    const matchesSearch =
      !normalizedSearch ||
      displayName?.toLowerCase().includes(normalizedSearch) ||
      equipment.model?.toLowerCase().includes(normalizedSearch) ||
      equipment.serialNumber?.toLowerCase().includes(normalizedSearch) ||
      equipment.location?.toLowerCase().includes(normalizedSearch) ||
      equipment.assignedTo?.toLowerCase().includes(normalizedSearch);

    const matchesLaboratory = !laboratoryFilter || equipment.labId === laboratoryFilter;

    return matchesSearch && matchesLaboratory;
  });

  // Export equipment data to CSV
  const exportEquipmentData = () => {
    if (equipments.length === 0) {
      alert("No equipment data to export");
      return;
    }

    const csvData = equipments.map(equipment => ({
      Name: equipment.name,
      Model: equipment.model,
      'Serial Number': equipment.serialNumber,
      Status: equipment.status,
      Condition: equipment.condition,
      Location: equipment.location,
      'Purchase Date': equipment.purchaseDate,
      'Expiration Date': equipment.warrantyExpiry,
      'Assigned To': equipment.assignedTo,
      Notes: equipment.notes
    }));

    const csvContent = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).map(value => `"${value || ''}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `equipment_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportEquipmentToPDF = () => {
    if (filteredEquipments.length === 0) {
      alert("No equipment data to export");
      return;
    }

    const title = "Laboratory Equipment List";
    const dateStr = new Date().toLocaleString();

    const rowsHtml = filteredEquipments.map((equipment, index) => {
      const laboratory = laboratories.find(lab => lab.labId === equipment.labId);
      const warrantyStatus = getWarrantyStatus(equipment.warrantyExpiry);
      const warrantyText = warrantyStatus ? warrantyStatus.text : "—";

      return `
        <tr>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${index + 1}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${getEquipmentDisplayName(equipment)}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${equipment.model || ""}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${equipment.serialNumber || ""}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${laboratory ? laboratory.labName : ""}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${equipment.status || ""}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${equipment.condition || ""}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${equipment.location || ""}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${equipment.quantity || ""}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${warrantyText}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${equipment.assignedTo || ""}</td>
        </tr>
      `;
    }).join("");

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charSet="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          p { font-size: 12px; color: #6b7280; margin-top: 0; margin-bottom: 16px; }
          table { border-collapse: collapse; width: 100%; }
          thead { background-color: #f3f4f6; }
          th { text-align: left; padding: 8px; border: 1px solid #e5e7eb; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p>Generated on ${dateStr}</p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Model</th>
              <th>Serial Number</th>
              <th>Laboratory</th>
              <th>Status</th>
              <th>Condition</th>
              <th>Location</th>
              <th>Quantity</th>
              <th>Warranty</th>
              <th>Assigned To</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Unable to open print window. Please allow pop-ups and try again.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <div className="loading-text">Loading laboratory equipment...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="equipment-page">
      {/* Header - Welcome Banner Style */}
      <div className="equipment-welcome">
        <div className="welcome-content">
          <h1 className="welcome-title">Laboratory Equipment Management</h1>
          <p className="welcome-subtitle">Manage equipment categories, individual laboratory equipment, and maintenance schedules.</p>
        </div>
        {isLaboratoryManager() && (
          <div className="assigned-lab-container">
            {assignedLaboratories && assignedLaboratories.length > 0 ? (
              <>
                <div className="assigned-lab-label">
                  ASSIGNED LABORATORY{assignedLaboratories.length > 1 ? 'IES' : ''}
                </div>
                <div className="assigned-lab-buttons">
                  {assignedLaboratories.map((lab) => (
                    <div key={lab.id} className="lab-button">
                      <span className="lab-icon">🧪</span>
                      <span className="lab-name">{lab.labName || lab.labId || 'Unknown Lab'}</span>
                      {lab.labId && (
                        <span className="lab-code">{lab.labId}</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="no-lab-assignment">
                ⚠️ No laboratory assigned
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="nav-tabs">
        <button
          onClick={() => setActiveTab("categories")}
          className={`nav-tab ${activeTab === "categories" ? "active" : ""}`}
        >
          <span className="nav-tab-icon">📂</span>
          Equipment Categories ({categories.length})
        </button>
        <button
          onClick={() => setActiveTab("equipments")}
          className={`nav-tab ${activeTab === "equipments" ? "active" : ""}`}
        >
          <span className="nav-tab-icon">⚙️</span>
          Individual Equipment
        </button>
        <button
          onClick={() => setActiveTab("maintenance")}
          className={`nav-tab ${activeTab === "maintenance" ? "active" : ""}`}
        >
          <span className="nav-tab-icon">🔧</span>
          Equipment Maintenance
        </button>
      </div>

      {/* Equipment Summary - Show for Lab In Charge */}
      {isLaboratoryManager() && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          {(() => {
            const totalEquipment = equipments.reduce((sum, item) => {
              const quantity = Number(item.quantity) || 1;
              return sum + quantity;
            }, 0);

            const borrowedEquipment = equipments.reduce((sum, item) => {
              const quantityBorrowed = Number(item.quantity_borrowed) || 0;
              return sum + quantityBorrowed;
            }, 0);

            const availableEquipment = totalEquipment - borrowedEquipment;

            return (
              <>
                <div style={{
                  backgroundColor: '#f0fdf4',
                  border: '2px solid #10b981',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#10b981', marginBottom: '8px' }}>
                    {totalEquipment.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>
                    Total Equipment
                  </div>
                </div>
                <div style={{
                  backgroundColor: '#ecfdf5',
                  border: '2px solid #10b981',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#10b981', marginBottom: '8px' }}>
                    {availableEquipment.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>
                    Available Equipment
                  </div>
                  {totalEquipment > 0 && (
                    <div style={{ fontSize: '11px', color: '#059669', marginTop: '4px' }}>
                      {Math.round((availableEquipment / totalEquipment) * 100)}% available
                    </div>
                  )}
                </div>
                <div style={{
                  backgroundColor: '#fef3c7',
                  border: '2px solid #f59e0b',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#f59e0b', marginBottom: '8px' }}>
                    {borrowedEquipment.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>
                    Currently Borrowed
                  </div>
                  {totalEquipment > 0 && (
                    <div style={{ fontSize: '11px', color: '#d97706', marginTop: '4px' }}>
                      {Math.round((borrowedEquipment / totalEquipment) * 100)}% borrowed
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Categories Tab */}  
      {activeTab === "categories" && (
        <div className="tab-content">
          <div className="section-header">
            <h2 className="section-title">Equipment Categories</h2>
            <button
              onClick={() => setShowAddCategoryForm(true)}
              className="btn btn-primary"
            >
              <span className="btn-icon">+</span>
              Add Category
            </button>
          </div>

          {/* Categories Grid */}
          <div className="categories-grid">
            {categories.map((category) => (
              <div key={category.id} className="category-card">
                <div className="category-header">
                  <div className="category-info">
                    <h3 className="category-title">{category.title}</h3>
                    <p className="category-description">
                      {category.description || "No description"}
                    </p>
                    {category.labId && (
                      <div className="category-lab">
                        <span className="lab-badge">
                          🧪 {laboratories.find(lab => lab.labId === category.labId)?.labName || category.labId}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="category-stats">
                  {(() => {
                    const isSelected = category.id === selectedCategory;

                    // For the selected category, use the same equipments array
                    // that the banner uses so counts match exactly.
                    let equipmentsSource;
                    if (isSelected && equipments.length > 0) {
                      equipmentsSource = equipments;
                    } else {
                      // For other categories, derive from category.equipments
                      // and apply the same lab-based filtering rules used in
                      // fetchEquipments for non-admin users.
                      let equipmentsInCategory = category.equipments
                        ? Object.values(category.equipments)
                        : [];

                      if (!isAdmin()) {
                        const assignedLabIds = getAssignedLaboratoryIds();
                        if (assignedLabIds) {
                          equipmentsInCategory = equipmentsInCategory.filter((equipment) => {
                            const lab = laboratories.find((l) => l.labId === equipment.labId);
                            return lab && assignedLabIds.includes(lab.id);
                          });
                        }
                      }

                      equipmentsSource = equipmentsInCategory;
                    }

                    const derivedTotal = equipmentsSource.reduce((sum, item) => {
                      const quantity = Number(item.quantity) || 1;
                      return sum + quantity;
                    }, 0);

                    const derivedBorrowed = equipmentsSource.reduce((sum, item) => {
                      const quantityBorrowed = Number(item.quantity_borrowed) || 0;
                      return sum + quantityBorrowed;
                    }, 0);

                    const totalEquipment = derivedTotal;
                    const availableEquipment = Math.max(derivedTotal - derivedBorrowed, 0);

                    return (
                      <>
                        <div className="stat-item">
                          <div className="stat-number">{totalEquipment}</div>
                          <p style={{fontSize: "0.75rem", whiteSpace: "nowrap"}} >Total Equipments</p>
                        </div>
                        <div className="stat-item">
                          <div className="stat-number available">{availableEquipment}</div>
                          <p style={{fontSize: "0.75rem"}}>Available</p>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="category-actions">
                  <button
                    onClick={() => {
                      setSelectedCategory(category.id);
                      setActiveTab("equipments");
                    }}
                    className="btn btn-outline btn-xs"
                  >
                    View
                  </button>
                  <button
                    onClick={() => handleEditCategory(category)}
                    className="btn btn-secondary btn-xs"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(category.id)}
                    className="btn btn-danger btn-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {categories.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">🧪</div>
              <h3 className="empty-title">No categories found</h3>
              <p className="empty-message">Create your first equipment category to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Equipment Tab */}
      {activeTab === "equipments" && (
        <div className="tab-content">
          <div className="section-header">
            <div className="section-header-left">
              <h2 className="section-title">Individual Equipment</h2>
              <div className="category-selector">
                <label className="form-label">Category:</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="form-select"
                >
                  <option value="">Select Category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="section-header-right">
              {selectedCategory && filteredEquipments.length > 0 && (
                <>
                  <button
                    onClick={handleExportEquipmentToPDF}
                    className="btn btn-outline"
                    style={{ marginRight: '8px' }}
                  >
                    <span className="btn-icon">🧾</span>
                    Export PDF
                  </button>
                  <button
                    onClick={exportEquipmentData}
                    className="btn btn-outline"
                  >
                    <span className="btn-icon">📊</span>
                    Export CSV
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  if (!selectedCategory) {
                    alert("Please select a category first");
                    return;
                  }
                  setShowAddEquipmentForm(true);
                }}
                className={`btn ${selectedCategory ? "btn-success" : "btn-disabled"}`}
                disabled={!selectedCategory}
              >
                <span className="btn-icon">+</span>
                Add Equipment
              </button>
            </div>
          </div>

          {/* Search Bar */}
          {selectedCategory && equipments.length > 0 && (
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search equipment by name, model, serial number, location, or assigned person..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <select
                value={laboratoryFilter}
                onChange={(e) => setLaboratoryFilter(e.target.value)}
                className="laboratory-filter"
              >
                <option value="">All Laboratories</option>
                {laboratories.map((lab) => (
                  <option key={lab.id} value={lab.labId}>
                    {lab.labName}
                  </option>
                ))}
              </select>
              <span className="search-icon"></span>
            </div>
          )}
          
          {/* Equipment Content */}
          {!selectedCategory ? (
            <div className="empty-state">
              <div className="empty-icon">🔬</div>
              <h3 className="empty-title">Select a Category</h3>
              <p className="empty-message">Choose a category from the dropdown above to view and manage equipment.</p>
            </div>
          ) : filteredEquipments.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3 className="empty-title">
                {searchTerm ? "No equipment found" : `No equipment in this category (total: ${equipments.length})`}
              </h3>
              {console.log('[EquipmentPage] filteredEquipments:', filteredEquipments, 'equipments:', equipments)}
              <p className="empty-message">
                {searchTerm
                  ? "Try adjusting your search terms or clear the search to see all equipment."
                  : "Add your first equipment to this category."
                }
              </p>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="btn btn-outline btn-sm"
                >
                  Clear Search
                </button>
              )}
            </div>
          ) : (
            <div className="equipment-table-container">
              <div className="table-header">
                <h3 className="table-title">
                  Equipment List ({filteredEquipments.length}
                  {searchTerm && ` of ${equipments.length}`})
                </h3>
              </div>

              <div className="table-wrapper">
                <table className="equipment-table">
                  <thead>
                    <tr>
                      <th>Equipment</th>
                      <th>Serial Number</th>
                      <th>Laboratory</th>
                      <th>Status</th>
                      <th>Quantity</th>
                      <th>Condition</th>
                      <th>Location</th>
                      <th>Assigned To</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEquipments.map((equipment) => {
                      console.log('[EquipmentPage] Rendering equipment:', equipment);
                      console.log('[EquipmentPage] Equipment properties:', {
                        name: equipment.name,
                        equipmentName: equipment.equipmentName,
                        title: equipment.title,
                        itemName: equipment.itemName,
                        displayName: getEquipmentDisplayName(equipment)
                      });
                      const warrantyStatus = getWarrantyStatus(equipment.warrantyExpiry);
                      const laboratory = laboratories.find(lab => lab.labId === equipment.labId);
                      return (
                        <tr key={equipment.id} className="equipment-row">
                          <td className="equipment-cell">
                            <div className="equipment-info">
                              <div className="equipment-name">
                                {equipment.name && equipment.name.trim() ? equipment.name : (equipment.equipmentName && equipment.equipmentName.trim() ? equipment.equipmentName : "⚠️ No Equipment Name")}
                              </div>
                              <div className="equipment-model">
                                {equipment.model || equipment.equipmentModel || "—"}
                              </div>
                              {warrantyStatus && (
                                <div
                                  className={`warranty-status ${warrantyStatus.status}`}
                                  style={{ color: warrantyStatus.color }}
                                >
                                  Expires: {warrantyStatus.text}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="serial-cell">
                            <span className="serial-number">{equipment.serialNumber || "N/A"}</span>
                          </td>
                          <td className="laboratory-cell">
                            {laboratory ? (
                              <div className="laboratory-info">
                                <div className="laboratory-name">{laboratory.labName}</div>
                                <div className="laboratory-id">{laboratory.labId}</div>
                              </div>
                            ) : (
                              <span className="no-laboratory">—</span>
                            )}
                          </td>
                          <td>
                            <span
                              className="status-badge"
                              style={{
                                backgroundColor: getStatusColor(equipment.status) + "20",
                                color: getStatusColor(equipment.status),
                                borderColor: getStatusColor(equipment.status) + "30"
                              }}
                            >
                              {equipment.status}
                            </span>
                          </td>
                          <td className="quantity-cell">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {(() => {
                                const originalTotal = Number(equipment.quantity) || 1;
                                const lostCount = getLostOrMissingCount(equipment.name || equipment.equipmentName);
                                const effectiveTotal = Math.max(0, originalTotal - lostCount);
                                const borrowed = Number(equipment.quantity_borrowed) || 0;
                                const effectiveAvailable = Math.max(0, effectiveTotal - borrowed);

                                return (
                                  <>
                                    <span className="quantity-badge">
                                      Total: {effectiveTotal}
                                    </span>
                                    {equipment.quantity_borrowed !== undefined && equipment.quantity_borrowed !== null && (
                                      <span style={{
                                        fontSize: '11px',
                                        color: effectiveAvailable > 0
                                          ? '#10b981'
                                          : '#ef4444',
                                        fontWeight: '500'
                                      }}>
                                        Available: {effectiveAvailable}
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </td>
                          <td>
                            <span className={`condition-badge ${equipment.condition?.toLowerCase()}`}>
                              {equipment.condition || "—"}
                            </span>
                          </td>
                          <td className="location-cell">{equipment.location || "—"}</td>
                          <td className="assigned-cell">{equipment.assignedTo || "—"}</td>
                          <td className="actions-cell">
                            <div className="action-buttons">
                              <button
                                onClick={() => handleViewUsageReport(equipment)}
                                className="btn btn-info btn-xs"
                                style={{ backgroundColor: '#3b82f6', color: 'white', marginRight: '4px' }}
                              >
                                Report
                              </button>
                              <button
                                onClick={() => handleEditEquipment(equipment)}
                                className="btn btn-outline btn-xs"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteEquipment(equipment.id)}
                                className="btn btn-danger btn-xs"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Maintenance Tab */}
      {activeTab === "maintenance" && (
        <EquipmentMaintenance
          categories={categories}
          equipments={equipments}
          selectedCategory={selectedCategory}
          onMaintenanceComplete={onMaintenanceComplete}
        />
      )}

      {/* Category Modal */}
      {showAddCategoryForm && (
        <div className="modal-overlay">
          <div className="modal category-modal">
            <div className="modal-header">
              <h2 className="modal-title">
                {editingCategory ? "Edit Category" : "Add New Category"}
              </h2>
              <button
                onClick={resetCategoryForm}
                className="modal-close"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCategorySubmit} className="modal-form">
              <div className="form-group">
                <label className="form-label required">Category Title</label>
                <input
                  type="text"
                  name="title"
                  value={categoryFormData.title}
                  onChange={handleCategoryInputChange}
                  placeholder="e.g., Laboratory Glassware"
                  required
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Laboratory</label>
                {isAdmin() ? (
                  <select
                    name="labId"
                    value={categoryFormData.labId}
                    onChange={handleCategoryInputChange}
                    required
                    className="form-select"
                  >
                    <option value="">Select Laboratory</option>
                    {laboratories.map(lab => (
                      <option key={lab.id} value={lab.labId}>
                        {lab.labName} ({lab.labId})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="form-input-display">
                    {(() => {
                      const assignedLabIds = getAssignedLaboratoryIds();
                      if (assignedLabIds && assignedLabIds.length > 0) {
                        const assignedLab = laboratories.find(lab => assignedLabIds.includes(lab.id));
                        return assignedLab ? `${assignedLab.labName} (${assignedLab.labId})` : 'No laboratory assigned';
                      }
                      return 'No laboratory assigned';
                    })()}
                  </div>
                )}
                <small className="form-help">
                  {isAdmin() ? 'Select which laboratory this category belongs to' : 'This category will be created for your assigned laboratory'}
                </small>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  name="description"
                  value={categoryFormData.description}
                  onChange={handleCategoryInputChange}
                  placeholder="Brief description of this equipment category"
                  rows="3"
                  className="form-textarea"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={resetCategoryForm}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingCategory}
                >
                  {isSubmittingCategory ? (
                    <>
                      <span className="loading-spinner"></span>
                      {editingCategory ? "Updating..." : "Adding..."}
                    </>
                  ) : (
                    <>
                      {editingCategory ? "Update Category" : "Add Category"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Equipment Modal */}
      {showAddEquipmentForm && (
        <div className="modal-overlay">
          <div className="modal equipment-modal">
            <div className="modal-header">
              <h2 className="modal-title">
                {editingEquipment ? "Edit Equipment" : "Add New Equipment"}
              </h2>
              <button
                onClick={resetEquipmentForm}
                className="modal-close"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleEquipmentSubmit} className="modal-form">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label required">Equipment Name</label>
                  <input
                    type="text"
                    name="name"
                    value={equipmentFormData.name}
                    onChange={handleEquipmentInputChange}
                    placeholder="e.g., Digital Scale"
                    required
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Model</label>
                  <input
                    type="text"
                    name="model"
                    value={equipmentFormData.model}
                    onChange={handleEquipmentInputChange}
                    placeholder="e.g., XS205"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Serial Number</label>
                  <input
                    type="text"
                    name="serialNumber"
                    value={equipmentFormData.serialNumber}
                    onChange={handleEquipmentInputChange}
                    placeholder="e.g., SN123456789"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input
                    type="text"
                    name="location"
                    value={equipmentFormData.location}
                    onChange={handleEquipmentInputChange}
                    placeholder="e.g., Lab Room 101"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Laboratory</label>
                  <select
                    name="labId"
                    value={equipmentFormData.labId}
                    onChange={handleEquipmentInputChange}
                    className="form-select"
                  >
                    <option value="">Select Laboratory</option>
                    {laboratories.map((lab) => (
                      <option key={lab.id} value={lab.labId}>
                        {lab.labName} ({lab.labId})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    name="status"
                    value={equipmentFormData.status}
                    onChange={handleEquipmentInputChange}
                    className="form-select"
                  >
                    <option value="Available">Available</option>
                    <option value="In Use">In Use</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Retired">Retired</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Condition</label>
                  <select
                    name="condition"
                    value={equipmentFormData.condition}
                    onChange={handleEquipmentInputChange}
                    className="form-select"
                  >
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Poor">Poor</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label required">Quantity</label>
                  <input
                    type="number"
                    name="quantity"
                    min="1"
                    value={equipmentFormData.quantity}
                    onChange={handleEquipmentInputChange}
                    className="form-input"
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Purchase Date</label>
                  <input
                    type="date"
                    name="purchaseDate"
                    value={equipmentFormData.purchaseDate}
                    onChange={handleEquipmentInputChange}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Expiration Date</label>
                  <input
                    type="date"
                    name="warrantyExpiry"
                    value={equipmentFormData.warrantyExpiry}
                    onChange={handleEquipmentInputChange}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Assigned To</label>
                <input
                  type="text"
                  name="assignedTo"
                  value={equipmentFormData.assignedTo}
                  onChange={handleEquipmentInputChange}
                  placeholder="Auto-filled when laboratory is selected"
                  className="form-input"
                />
                <small className="form-help">
                  {equipmentFormData.assignedTo
                    ? `Automatically assigned to Lab In Charge: ${equipmentFormData.assignedTo}`
                    : "Select a laboratory to automatically assign it to the Lab In Charge"
                  }
                </small>
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  name="notes"
                  value={equipmentFormData.notes}
                  onChange={handleEquipmentInputChange}
                  placeholder="Additional notes about this equipment"
                  rows="3"
                  className="form-textarea"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Equipment Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="form-input"
                />
                <small className="form-help">
                  Upload an image of the equipment (Max 2MB, stored in database)
                </small>

                {imagePreview && (
                  <div className="image-preview-container">
                    <img src={imagePreview} alt="Equipment preview" className="image-preview" />
                    <button
                      type="button"
                      onClick={() => {
                        setEquipmentImage(null);
                        setImagePreview(null);
                      }}
                      className="btn btn-sm btn-danger"
                    >
                      Remove Image
                    </button>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={resetEquipmentForm}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-success"
                  disabled={isSubmittingEquipment}
                >
                  {isSubmittingEquipment ? (
                    <>
                      <span className="loading-spinner"></span>
                      {editingEquipment ? "Updating..." : "Adding..."}
                    </>
                  ) : (
                    <>
                      {editingEquipment ? "Update Equipment" : "Add Equipment"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="modal-overlay">
          <div className="modal-content success-modal">
            <div className="modal-header">
              <div className="success-icon">✅</div>
              <h2>Success!</h2>
            </div>
            <div className="modal-body">
              <p>{feedbackMessage}</p>
            </div>
            <div className="modal-actions">
              <button
                onClick={() => setShowSuccessModal(false)}
                className="btn btn-primary"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <div className="modal-overlay">
          <div className="modal-content error-modal">
            <div className="modal-header">
              <div className="error-icon">⚠️</div>
              <h2>Error</h2>
            </div>
            <div className="modal-body">
              <p>{feedbackMessage}</p>
            </div>
            <div className="modal-actions">
              <button
                onClick={() => setShowErrorModal(false)}
                className="btn btn-primary"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Modal */}
      {(isSubmittingEquipment || isSubmittingCategory) && (
        <div className="modal-overlay loading-overlay">
          <div className="loading-modal">
            <div className="loading-spinner-large"></div>
            <p>
              {isSubmittingEquipment
                ? (editingEquipment ? "Updating equipment..." : "Adding equipment...")
                : (editingCategory ? "Updating category..." : "Adding category...")
              }
            </p>
          </div>
        </div>
      )}

      {/* Usage Report Modal */}
      {showUsageReportModal && selectedEquipmentForReport && (
        <div className="modal-overlay" onClick={() => setShowUsageReportModal(false)}>
          <div className="modal-content enhanced-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                📊 Usage Report - {getEquipmentDisplayName(selectedEquipmentForReport)}
              </h2>
              <button
                onClick={() => setShowUsageReportModal(false)}
                className="modal-close"
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="usage-report">
                {usageDataLoading ? (
                  <div className="loading-container" style={{ textAlign: 'center', padding: '40px' }}>
                    <div className="loading-spinner"></div>
                    <p>Loading usage data...</p>
                  </div>
                ) : usageData ? (
                  <>
                    <div className="usage-table-container">
                      <table className="usage-table">
                        <thead>
                          <tr>
                            <th>Equipment Name</th>
                            <th>Total Borrowed</th>
                            <th>Borrowed by Students</th>
                            <th>Borrowed by Faculty</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>{getEquipmentDisplayName(selectedEquipmentForReport)}</td>
                            <td>{usageData.total} times</td>
                            <td>{usageData.students}</td>
                            <td>{usageData.faculty}</td>
                          </tr>
                        </tbody>
                      </table>

                      {/* Show breakdown if manual records exist */}
                      {(usageData.manualTotal > 0 || usageData.systemTotal > 0) && (
                        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Usage Breakdown</h4>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '12px' }}>
                            <div>
                              <strong>System Records:</strong> {usageData.systemTotal} total
                              ({usageData.systemStudents} students, {usageData.systemFaculty} faculty)
                            </div>
                            {usageData.manualTotal > 0 && (
                              <div>
                                <strong>Manual Records:</strong> {usageData.manualTotal} total
                                ({usageData.manualStudents} students, {usageData.manualFaculty} faculty)
                              </div>
                            )}
                          </div>
                          {usageData.lastUpdated && (
                            <div style={{ marginTop: '10px', fontSize: '11px', color: '#6b7280' }}>
                              Last updated: {new Date(usageData.lastUpdated).toLocaleString()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="usage-summary">
                      {(() => {
                        const usageStats = calculateUsageStatistics(getEquipmentDisplayName(selectedEquipmentForReport));
                        return (
                          <>
                            <div className="summary-card">
                              <div className="summary-title">Most Active Period</div>
                              <div className="summary-value">{usageStats.mostActivePeriod}</div>
                            </div>
                            <div className="summary-card">
                              <div className="summary-title">Average Usage</div>
                              <div className="summary-value">{usageStats.averageUsage}</div>
                            </div>
                            <div className="summary-card">
                              <div className="summary-title">Utilization Rate</div>
                              <div className="summary-value">{usageStats.utilizationRate}</div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    <p>No usage data available</p>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button 
                onClick={() => setShowUsageReportModal(false)} 
                className="close-button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteConfirmModal}
        onClose={() => {
          setShowDeleteConfirmModal(false);
          setCategoryToDelete(null);
        }}
        onConfirm={confirmDeleteCategory}
        title="Delete Category"
        message="Are you sure you want to delete this category? This will also delete all equipment in this category."
        confirmText="Delete Category"
        cancelText="Cancel"
      />

      {/* Equipment Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteConfirmModal}
        onClose={() => {
          setShowDeleteConfirmModal(false);
          setEquipmentToDelete(null);
        }}
        onConfirm={confirmDeleteEquipment}
        title="Delete Equipment"
        message="Are you sure you want to delete this equipment? This action cannot be undone."
        confirmText="Delete Equipment"
        cancelText="Cancel"
      />

      {/* Toast Notification */}
      {toast.show && (
        <ToastNotification
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ show: false, message: "", type: "success" })}
        />
      )}
    </div>
  );
}