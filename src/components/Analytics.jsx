// src/components/Analytics.jsx
import React, { useState, useEffect } from "react";
import { ref } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import "../CSS/Analytics.css";

export default function Analytics() {
  const { isAdmin, getAssignedLaboratoryIds } = useAuth();
  const [analyticsData, setAnalyticsData] = useState({
    equipmentStats: {},
    borrowingTrends: [],
    userActivity: {
      totalActiveUsers: 0,
      topUsers: [],
      others: {
        uniqueBorrowers: 0,
        totalBorrowCount: 0
      }
    },
    maintenanceStats: {},
    categoryBreakdown: [],
    monthlyData: [],
    monthlyTrends: [],
    utilizationRates: {},
    diagnosticAnalytics: {
      equipmentDamage: {},
      lostItems: {},
      lateReturns: {},
      approvalBottlenecks: {}
    }
  });
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("30"); // days
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    loadAnalyticsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod]);

  const loadAllEquipment = async (categories) => {
    const { get } = await import('firebase/database');
    const allEquipment = [];
    
    try {
      console.log("Categories loaded:", Object.keys(categories).length);
      
      // Load laboratories for filtering
      const laboratoriesRef = ref(database, 'laboratories');
      const labsSnapshot = await get(laboratoriesRef);
      let laboratories = [];
      if (labsSnapshot.exists()) {
        const labsData = labsSnapshot.val();
        laboratories = Object.keys(labsData).map(key => ({
          id: key,
          ...labsData[key]
        }));
      }
      
      // Load equipment from each category
      const equipmentPromises = Object.keys(categories).map(async (categoryId) => {
        const equipmentsRef = ref(database, `equipment_categories/${categoryId}/equipments`);
        const snapshot = await get(equipmentsRef);
        const equipmentData = snapshot.val();
        
        console.log(`Category ${categoryId} equipment data:`, equipmentData);
        
        if (equipmentData) {
          const categoryEquipment = Object.keys(equipmentData).map(equipmentId => ({
            id: equipmentId,
            categoryId: categoryId,
            categoryName: categories[categoryId].title,
            ...equipmentData[equipmentId]
          }));
          
          // Filter equipment based on user role and assigned laboratories
          let filteredEquipment = categoryEquipment;
          if (!isAdmin()) {
            const assignedLabIds = getAssignedLaboratoryIds();
            if (assignedLabIds) {
              filteredEquipment = categoryEquipment.filter(equipment => {
                const lab = laboratories.find(l => l.labId === equipment.labId);
                return lab && assignedLabIds.includes(lab.id);
              });
            }
          }
          
          console.log(`Category ${categoryId} processed equipment:`, filteredEquipment.length);
          return filteredEquipment;
        }
        return [];
      });
      
      const equipmentArrays = await Promise.all(equipmentPromises);
      allEquipment.push(...equipmentArrays.flat());
      
      console.log("Total equipment loaded:", allEquipment.length);
      console.log("Equipment details:", allEquipment);
      
    } catch (error) {
      console.error("Error loading equipment:", error);
    }
    
    return allEquipment;
  };

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      const { get } = await import('firebase/database');
      
      // Load all necessary data
      const [borrowRequestsSnapshot, historySnapshot, categoriesSnapshot] = await Promise.all([
        get(ref(database, 'borrow_requests')),
        get(ref(database, 'history')),
        get(ref(database, 'equipment_categories'))
      ]);

      const borrowRequests = borrowRequestsSnapshot.val() || {};
      const history = historySnapshot.val() || {};
      const categories = categoriesSnapshot.val() || {};
      
      console.log("Raw categories data:", categories);
      console.log("Categories keys:", Object.keys(categories));
      
      // Load equipment data from all categories
      const equipment = await loadAllEquipment(categories);

      // Process analytics data
      const processedData = processAnalyticsData(borrowRequests, equipment, history, categories, selectedPeriod);
      console.log("Processed analytics data:", processedData);
      setAnalyticsData(processedData);
      
    } catch (error) {
      console.error("Error loading analytics data:", error);
    } finally {
      setLoading(false);
    }
  };

  const processAnalyticsData = (borrowRequests, equipment, history, categories, period) => {
    const periodDays = parseInt(period);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - periodDays);

    // Equipment Statistics
    console.log("Processing equipment stats for:", equipment.length, "equipment items");
    console.log("Equipment status breakdown:", {
      available: equipment.filter(eq => eq.status === 'Available' || eq.status === 'available').length,
      inUse: equipment.filter(eq => eq.status === 'In Use' || eq.status === 'in_use' || eq.status === 'in use').length,
      maintenance: equipment.filter(eq => eq.status === 'Maintenance' || eq.status === 'maintenance').length,
      retired: equipment.filter(eq => eq.status === 'Retired' || eq.status === 'retired').length,
      other: equipment.filter(eq => !['Available', 'available', 'In Use', 'in_use', 'in use', 'Maintenance', 'maintenance', 'Retired', 'retired'].includes(eq.status)).length
    });
    
    const equipmentStats = {
      total: equipment.length,
      available: equipment.filter(eq => eq.status === 'Available' || eq.status === 'available').length,
      inUse: equipment.filter(eq => eq.status === 'In Use' || eq.status === 'in_use' || eq.status === 'in use').length,
      maintenance: equipment.filter(eq => eq.status === 'Maintenance' || eq.status === 'maintenance').length,
      utilizationRate: 0
    };

    if (equipmentStats.total > 0) {
      equipmentStats.utilizationRate = Math.round((equipmentStats.inUse / equipmentStats.total) * 100);
    }

    // Borrowing Trends
    const borrowingTrends = calculateBorrowingTrends(borrowRequests, periodDays);

    // User Activity
    const userActivity = calculateUserActivity(history, periodDays);

    // Maintenance Statistics
    const maintenanceStats = calculateMaintenanceStats(equipment, history, periodDays);

    // Category Breakdown
    const categoryBreakdown = calculateCategoryBreakdown(categories, borrowRequests);

    // Monthly Data
    const { monthlyTotals, monthlyTrends } = calculateMonthlyData(borrowRequests, history, periodDays);

    // Utilization Rates
    const utilizationRates = calculateUtilizationRates(equipment, history, periodDays);

    // Diagnostic Analytics
    const diagnosticAnalytics = calculateDiagnosticAnalytics(borrowRequests, history, periodDays);

    return {
      equipmentStats,
      borrowingTrends,
      userActivity,
      maintenanceStats,
      categoryBreakdown,
      monthlyData: monthlyTotals,
      monthlyTrends,
      utilizationRates,
      diagnosticAnalytics
    };
  };

  const calculateBorrowingTrends = (borrowRequests, periodDays) => {
    const trends = [];
    const requests = Object.values(borrowRequests);
    
    // Group by date
    const dailyData = {};
    requests.forEach(req => {
      if (req.requestedAt) {
        const date = new Date(req.requestedAt).toDateString();
        dailyData[date] = (dailyData[date] || 0) + 1;
      }
    });

    // Create trend data for the period
    for (let i = periodDays - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toDateString();
      trends.push({
        date: date.toISOString().split('T')[0],
        requests: dailyData[dateStr] || 0
      });
    }

    return trends;
  };

  const calculateUserActivity = (history, periodDays) => {
    const historyEntries = Object.values(history || {});
    const borrowerCounts = {};
    const cutoffDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    historyEntries.forEach(entry => {
      const status = (entry.status || '').toLowerCase();
      if (status !== 'released') return;

      const dateSource = entry.releasedDate || entry.timestamp;
      if (dateSource) {
        const entryDate = new Date(dateSource);
        if (isNaN(entryDate) || entryDate < cutoffDate) return;
      }

      const borrowerName =
        (entry.borrower && entry.borrower.trim()) ||
        (entry.borrowerName && entry.borrowerName.trim()) ||
        (entry.details?.originalRequest?.borrowerName && entry.details.originalRequest.borrowerName.trim()) ||
        (entry.details?.originalRequest?.userName && entry.details.originalRequest.userName.trim()) ||
        (entry.adviserName && entry.adviserName.trim()) ||
        (entry.userEmail && entry.userEmail.trim()) ||
        'Unknown';

      borrowerCounts[borrowerName] = (borrowerCounts[borrowerName] || 0) + 1;
    });

    const sortedBorrowers = Object.entries(borrowerCounts).sort(([, a], [, b]) => b - a);
    const topUsers = sortedBorrowers.slice(0, 10).map(([user, count]) => ({ user, count }));
    const remainingBorrowers = sortedBorrowers.slice(10);
    const others = {
      uniqueBorrowers: remainingBorrowers.length,
      totalBorrowCount: remainingBorrowers.reduce((sum, [, count]) => sum + count, 0)
    };

    return {
      totalActiveUsers: Object.keys(borrowerCounts).length,
      topUsers,
      others
    };
  };

  const calculateMaintenanceStats = (equipment, history, periodDays) => {
    const historyValues = Object.values(history);
    
    const maintenanceCount = equipment.filter(eq => eq.status === 'Maintenance' || eq.status === 'maintenance').length;
    const totalMaintenance = historyValues.filter(h => h.action && h.action.toLowerCase().includes('maintenance')).length;
    
    return {
      currentMaintenance: maintenanceCount,
      totalMaintenanceEvents: totalMaintenance,
      maintenanceRate: equipment.length > 0 ? Math.round((maintenanceCount / equipment.length) * 100) : 0
    };
  };

  const calculateCategoryBreakdown = (categories, borrowRequests) => {
    const requests = Object.values(borrowRequests);
    const categoryData = {};
    
    // Count requests by category
    requests.forEach(req => {
      const category = req.categoryName || 'Other';
      categoryData[category] = (categoryData[category] || 0) + 1;
    });

    // Get category details
    return Object.entries(categoryData).map(([name, count]) => ({
      name,
      count,
      color: getCategoryColor(name)
    })).sort((a, b) => b.count - a.count);
  };

  const calculateMonthlyData = (borrowRequests, history, periodDays) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - periodDays);

    const historyEntries = Object.values(history);
    const monthlyReleaseTotals = {};

    historyEntries.forEach(entry => {
      const action = (entry.action || '').toLowerCase();
      const status = (entry.status || '').toLowerCase();
      const isRelease = entry.entryType === 'release' || action.includes('release') || status === 'released';
      if (!isRelease) return;

      const dateSource = entry.releasedDate || entry.timestamp;
      if (!dateSource) return;
      const date = new Date(dateSource);
      if (isNaN(date) || date < cutoffDate) return;

      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const quantity =
        parseInt(entry.quantity, 10) ||
        parseInt(entry.details?.originalRequest?.quantity, 10) ||
        1;

      monthlyReleaseTotals[monthKey] = (monthlyReleaseTotals[monthKey] || 0) + quantity;
    });

    if (Object.keys(monthlyReleaseTotals).length === 0) {
      const requests = Object.values(borrowRequests);
      requests.forEach(req => {
        if (!req.requestedAt) return;
        const date = new Date(req.requestedAt);
        if (isNaN(date) || date < cutoffDate) return;
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyReleaseTotals[monthKey] = (monthlyReleaseTotals[monthKey] || 0) + 1;
      });
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const totalsArray = Object.entries(monthlyReleaseTotals)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const trendsArray = monthNames.map((_, index) => {
      const monthNumber = index + 1;
      const monthKey = Object.keys(monthlyReleaseTotals).find(key => {
        const [year, month] = key.split('-').map(Number);
        return month === monthNumber;
      });

      const count = monthKey ? monthlyReleaseTotals[monthKey] : 0;
      return {
        month: monthNumber,
        count
      };
    });

    return {
      monthlyTotals: totalsArray,
      monthlyTrends: trendsArray
    };
  };

  const calculateUtilizationRates = (equipment, history, periodDays) => {
    const totalEquipment = equipment.length;
    const inUseEquipment = equipment.filter(eq => eq.status === 'In Use' || eq.status === 'in_use' || eq.status === 'in use').length;
    
    return {
      overall: totalEquipment > 0 ? Math.round((inUseEquipment / totalEquipment) * 100) : 0,
      byCategory: {}
    };
  };

  // Diagnostic Analytics Functions
  const calculateDiagnosticAnalytics = (borrowRequests, history, periodDays) => {
    const periodDaysMs = periodDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(Date.now() - periodDaysMs);
    
    const historyValues = Object.values(history);
    const requests = Object.values(borrowRequests);

    // 1. Equipment Damage Analysis
    const damageEntries = historyValues.filter(h => {
      if (!h.timestamp || new Date(h.timestamp) < cutoffDate) return false;
      const condition = (h.condition || '').toLowerCase();
      return condition.includes('damaged') || condition === 'returned damaged';
    });

    const equipmentDamageAnalysis = {
      totalDamageIncidents: damageEntries.length,
      damageByEquipment: {},
      damageByCategory: {},
      damageByBorrower: {},
      mostDamagedEquipment: [],
      damageTrends: []
    };

    damageEntries.forEach(entry => {
      const equipmentName = entry.equipmentName || 'Unknown';
      const categoryName = entry.categoryName || 'Unknown';
      const borrower = entry.borrower || entry.adviserName || 'Unknown';

      equipmentDamageAnalysis.damageByEquipment[equipmentName] = 
        (equipmentDamageAnalysis.damageByEquipment[equipmentName] || 0) + 1;
      equipmentDamageAnalysis.damageByCategory[categoryName] = 
        (equipmentDamageAnalysis.damageByCategory[categoryName] || 0) + 1;
      equipmentDamageAnalysis.damageByBorrower[borrower] = 
        (equipmentDamageAnalysis.damageByBorrower[borrower] || 0) + 1;
    });

    equipmentDamageAnalysis.mostDamagedEquipment = Object.entries(equipmentDamageAnalysis.damageByEquipment)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([equipment, count]) => ({ equipment, count }));

    // 2. Lost/Missing Items Analysis
    const lostEntries = historyValues.filter(h => {
      if (!h.timestamp || new Date(h.timestamp) < cutoffDate) return false;
      const condition = (h.condition || '').toLowerCase();
      return condition.includes('lost') || condition.includes('missing') || condition === 'item lost/missing';
    });

    const lostItemsAnalysis = {
      totalLostItems: lostEntries.length,
      lostByEquipment: {},
      lostByCategory: {},
      lostByBorrower: {},
      causes: {},
      mostLostEquipment: []
    };

    lostEntries.forEach(entry => {
      const equipmentName = entry.equipmentName || 'Unknown';
      const categoryName = entry.categoryName || 'Unknown';
      const borrower = entry.borrower || entry.adviserName || 'Unknown';
      const notes = (entry.returnDetails?.notes || '').toLowerCase();
      const delayReason = (entry.returnDetails?.delayReason || '').toLowerCase();

      lostItemsAnalysis.lostByEquipment[equipmentName] = 
        (lostItemsAnalysis.lostByEquipment[equipmentName] || 0) + 1;
      lostItemsAnalysis.lostByCategory[categoryName] = 
        (lostItemsAnalysis.lostByCategory[categoryName] || 0) + 1;
      lostItemsAnalysis.lostByBorrower[borrower] = 
        (lostItemsAnalysis.lostByBorrower[borrower] || 0) + 1;

      // Extract causes from notes and delay reasons
      let cause = 'Unknown';
      if (delayReason) {
        cause = delayReason;
      } else if (notes.includes('forgot') || notes.includes('lost')) {
        cause = 'Forgot/Lost';
      } else if (notes.includes('stolen') || notes.includes('theft')) {
        cause = 'Theft';
      } else if (notes.includes('damaged') && notes.includes('beyond repair')) {
        cause = 'Damaged Beyond Repair';
      } else if (notes) {
        cause = 'Other (see notes)';
      }

      lostItemsAnalysis.causes[cause] = (lostItemsAnalysis.causes[cause] || 0) + 1;
    });

    lostItemsAnalysis.mostLostEquipment = Object.entries(lostItemsAnalysis.lostByEquipment)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([equipment, count]) => ({ equipment, count }));

    // 3. Late Returns Analysis
    // Check history entries for returned items
    const returnedEntries = historyValues.filter(h => {
      if (!h.timestamp || new Date(h.timestamp) < cutoffDate) return false;
      return h.action === 'Item Returned' || h.status === 'Returned';
    });

    const lateReturns = [];
    const lateReturnReasons = {};

    returnedEntries.forEach(entry => {
      // Use dateToReturn from history entry (stored when return was recorded)
      const dateToReturn = entry.dateToReturn;
      if (!dateToReturn) return;

      const returnDate = new Date(entry.returnDate || entry.timestamp);
      const dueDate = new Date(dateToReturn);
      
      if (returnDate > dueDate) {
        const daysLate = Math.ceil((returnDate - dueDate) / (1000 * 60 * 60 * 24));
        const delayReason = entry.returnDetails?.delayReason || '';
        const notes = (entry.returnDetails?.notes || '').toLowerCase();

        lateReturns.push({
          equipmentName: entry.equipmentName || 'Unknown',
          categoryName: entry.categoryName || 'Unknown',
          borrower: entry.borrower || entry.adviserName || 'Unknown',
          daysLate,
          delayReason,
          notes: entry.returnDetails?.notes || '',
          returnDate: entry.returnDate || entry.timestamp,
          dueDate: dateToReturn
        });

        // Categorize reasons
        let reason = 'No reason provided';
        if (delayReason === 'late') {
          if (notes.includes('forgot')) reason = 'Forgot to return';
          else if (notes.includes('damaged') || notes.includes('broken')) reason = 'Equipment damaged/broken';
          else if (notes.includes('still using') || notes.includes('needed')) reason = 'Still in use/needed';
          else if (notes.includes('unavailable') || notes.includes('could not')) reason = 'Could not return (unavailable)';
          else if (notes) reason = notes.substring(0, 50);
          else reason = 'Late return';
        }

        lateReturnReasons[reason] = (lateReturnReasons[reason] || 0) + 1;
      }
    });

    const lateReturnsAnalysis = {
      totalLateReturns: lateReturns.length,
      averageDaysLate: lateReturns.length > 0 
        ? Math.round(lateReturns.reduce((sum, r) => sum + r.daysLate, 0) / lateReturns.length) 
        : 0,
      lateByEquipment: {},
      lateByCategory: {},
      lateByBorrower: {},
      reasons: lateReturnReasons,
      topReasons: Object.entries(lateReturnReasons)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([reason, count]) => ({ reason, count }))
    };

    lateReturns.forEach(ret => {
      lateReturnsAnalysis.lateByEquipment[ret.equipmentName] = 
        (lateReturnsAnalysis.lateByEquipment[ret.equipmentName] || 0) + 1;
      lateReturnsAnalysis.lateByCategory[ret.categoryName] = 
        (lateReturnsAnalysis.lateByCategory[ret.categoryName] || 0) + 1;
      lateReturnsAnalysis.lateByBorrower[ret.borrower] = 
        (lateReturnsAnalysis.lateByBorrower[ret.borrower] || 0) + 1;
    });

    // 4. Approval Bottlenecks Analysis
    const approvalBottlenecks = [];
    const bottleneckByLab = {};
    const bottleneckByCategory = {};

    requests.forEach(req => {
      if (!req.requestedAt || !req.updatedAt) return;
      
      const requestedAt = new Date(req.requestedAt);
      if (requestedAt < cutoffDate) return;

      // Find when request was approved
      if (req.status === 'approved' || req.status === 'released' || req.status === 'in_progress') {
        const updatedAt = new Date(req.updatedAt);
        const approvalTimeHours = (updatedAt - requestedAt) / (1000 * 60 * 60);

        // Consider > 24 hours as a bottleneck
        if (approvalTimeHours > 24) {
          approvalBottlenecks.push({
            equipmentName: req.itemName || 'Unknown',
            categoryName: req.categoryName || 'Unknown',
            laboratory: req.laboratory || 'Unknown',
            labId: req.labId || 'Unknown',
            hoursToApprove: Math.round(approvalTimeHours * 10) / 10,
            requestedAt: req.requestedAt,
            approvedAt: req.updatedAt,
            borrower: req.adviserName || 'Unknown'
          });

          const lab = req.laboratory || 'Unknown';
          const category = req.categoryName || 'Unknown';
          
          bottleneckByLab[lab] = (bottleneckByLab[lab] || []).concat(approvalTimeHours);
          bottleneckByCategory[category] = (bottleneckByCategory[category] || []).concat(approvalTimeHours);
        }
      }
    });

    // Calculate average approval times
    const avgByLab = {};
    Object.keys(bottleneckByLab).forEach(lab => {
      const times = bottleneckByLab[lab];
      avgByLab[lab] = Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10;
    });

    const avgByCategory = {};
    Object.keys(bottleneckByCategory).forEach(cat => {
      const times = bottleneckByCategory[cat];
      avgByCategory[cat] = Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10;
    });

    const approvalBottlenecksAnalysis = {
      totalBottlenecks: approvalBottlenecks.length,
      averageApprovalTime: approvalBottlenecks.length > 0
        ? Math.round((approvalBottlenecks.reduce((sum, b) => sum + b.hoursToApprove, 0) / approvalBottlenecks.length) * 10) / 10
        : 0,
      bottlenecksByLab: avgByLab,
      bottlenecksByCategory: avgByCategory,
      topSlowestLabs: Object.entries(avgByLab)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([lab, avgHours]) => ({ lab, avgHours })),
      topSlowestCategories: Object.entries(avgByCategory)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([category, avgHours]) => ({ category, avgHours }))
    };

    return {
      equipmentDamage: equipmentDamageAnalysis,
      lostItems: lostItemsAnalysis,
      lateReturns: lateReturnsAnalysis,
      approvalBottlenecks: approvalBottlenecksAnalysis
    };
  };

  const getCategoryColor = (categoryName) => {
    const colors = [
      '#2aa59d', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
      '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1'
    ];
    const hash = categoryName.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
  };

  const formatMonthShort = (monthNumber) => {
    if (!monthNumber) return '';
    return new Date(0, monthNumber - 1).toLocaleString('en-US', { month: 'short' });
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const baseMonthlyTrendData = Array.isArray(analyticsData.monthlyTrends) && analyticsData.monthlyTrends.length > 0
    ? analyticsData.monthlyTrends
    : Array.isArray(analyticsData.monthlyData) ? analyticsData.monthlyData.map((item, index) => ({
        month: index + 1,
        count: item.count || 0
      })) : [];
  const currentMonthIndex = new Date().getMonth();
  const totalMonths = baseMonthlyTrendData.length;
  let monthlyTrendData = baseMonthlyTrendData;
  if (totalMonths > 0) {
    const offset = 5; // show current month in the middle (index 5)
    const startIndex = ((currentMonthIndex - offset) % totalMonths + totalMonths) % totalMonths;
    monthlyTrendData = Array.from({ length: totalMonths }, (_, idx) => {
      const sourceIndex = (startIndex + idx) % totalMonths;
      return baseMonthlyTrendData[sourceIndex];
    });
  }
  const maxMonthlyCount = monthlyTrendData.length > 0
    ? Math.max(...monthlyTrendData.map(m => m.count || 0))
    : 0;

  if (loading) {
    return (
      <div className="analytics-container">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading analytics data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-container">
      <div className="analytics-header">
        <div className="analytics-title">
          <h1>Analytics Dashboard</h1>
          <p>Comprehensive insights into your laboratory operations</p>
        </div>
        
        <div className="analytics-controls">
          <select 
            value={selectedPeriod} 
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="period-selector"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
        </div>
      </div>

      {/* Analytics Navigation */}
      <div className="analytics-nav">
        <button 
          className={`nav-tab ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button 
          className={`nav-tab ${activeTab === "equipment" ? "active" : ""}`}
          onClick={() => setActiveTab("equipment")}
        >
          Equipment
        </button>
        <button 
          className={`nav-tab ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          Users
        </button>
        <button 
          className={`nav-tab ${activeTab === "trends" ? "active" : ""}`}
          onClick={() => setActiveTab("trends")}
        >
          Trends
        </button>
        <button 
          className={`nav-tab ${activeTab === "diagnostics" ? "active" : ""}`}
          onClick={() => setActiveTab("diagnostics")}
        >
          Diagnostics
        </button>
      </div>

      {/* Analytics Content */}
      <div className="analytics-content">
        {activeTab === "overview" && (
          <div className="overview-tab">
            {/* Key Metrics */}
            <div className="metrics-grid">
              <div className="metric-card primary">
                <div className="metric-icon">📊</div>
                <div className="metric-content">
                  <div className="metric-value">{analyticsData.equipmentStats.total}</div>
                  <div className="metric-label">Total Equipment</div>
                </div>
              </div>
              
              <div className="metric-card success">
                <div className="metric-icon">✅</div>
                <div className="metric-content">
                  <div className="metric-value">{analyticsData.equipmentStats.utilizationRate}%</div>
                  <div className="metric-label">Utilization Rate</div>
                </div>
              </div>
              
              <div className="metric-card warning">
                <div className="metric-icon">🔧</div>
                <div className="metric-content">
                  <div className="metric-value">{analyticsData.maintenanceStats.currentMaintenance}</div>
                  <div className="metric-label">Under Maintenance</div>
                </div>
              </div>
              
              <div className="metric-card info">
                <div className="metric-icon">👥</div>
                <div className="metric-content">
                  <div className="metric-value">{analyticsData.userActivity.totalActiveUsers}</div>
                  <div className="metric-label">Active Users</div>
                </div>
              </div>
            </div>

            {/* Equipment Status Chart */}
            <div className="chart-section">
              <div className="chart-card">
                <h3>Equipment Status Distribution</h3>
                <div className="pie-chart">
                  <div className="pie-slice available" style={{
                    '--percentage': analyticsData.equipmentStats.total > 0 ? (analyticsData.equipmentStats.available / analyticsData.equipmentStats.total) * 100 : 0
                  }}>
                    <span>Available ({analyticsData.equipmentStats.available})</span>
                  </div>
                  <div className="pie-slice in-use" style={{
                    '--percentage': analyticsData.equipmentStats.total > 0 ? (analyticsData.equipmentStats.inUse / analyticsData.equipmentStats.total) * 100 : 0
                  }}>
                    <span>In Use ({analyticsData.equipmentStats.inUse})</span>
                  </div>
                  <div className="pie-slice maintenance" style={{
                    '--percentage': analyticsData.equipmentStats.total > 0 ? (analyticsData.equipmentStats.maintenance / analyticsData.equipmentStats.total) * 100 : 0
                  }}>
                    <span>Maintenance ({analyticsData.equipmentStats.maintenance})</span>
                  </div>
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="chart-card">
                <h3>Most Borrowed Categories</h3>
                <div className="category-chart">
                  {analyticsData.categoryBreakdown.slice(0, 5).map((category, index) => (
                    <div key={category.name} className="category-bar">
                      <div className="category-label">{category.name}</div>
                      <div className="category-bar-container">
                        <div 
                          className="category-bar-fill"
                          style={{
                            width: `${(category.count / Math.max(...analyticsData.categoryBreakdown.map(c => c.count))) * 100}%`,
                            backgroundColor: category.color
                          }}
                        ></div>
                        <span className="category-count">{category.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "equipment" && (
          <div className="equipment-tab">
            <div className="equipment-analytics">
              <div className="chart-card full-width">
                <h3>Equipment Utilization Trends</h3>
                <div className="line-chart">
                  <div className="line-chart-container">
                    {analyticsData.borrowingTrends.map((point, index) => (
                      <div key={point.date} className="chart-point">
                        <div 
                          className="point"
                          style={{
                            height: `${(point.requests / Math.max(...analyticsData.borrowingTrends.map(p => p.requests))) * 100}%`
                          }}
                        ></div>
                        <span className="point-label">{formatDate(point.date)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "users" && (
          <div className="users-tab">
            <div className="chart-card">
              <h3>Top Active Borrowers</h3>
              <div className="user-list top-users">
                {analyticsData.userActivity.topUsers.map((user, index) => (
                  <div key={user.user} className="user-item">
                    <div className="user-rank">#{index + 1}</div>
                    <div className="user-info">
                      <div className="user-name">{user.user}</div>
                      <div className="user-activity">{user.count} borrows</div>
                    </div>
                  </div>
                ))}
              </div>

              {analyticsData.userActivity.others?.totalBorrowCount > 0 && (
                <div className="user-list others-row">
                  <div className="user-item others">
                    <div className="user-rank">+</div>
                    <div className="user-info">
                      <div className="user-name">
                        Others ({analyticsData.userActivity.others.uniqueBorrowers})
                      </div>
                      <div className="user-activity">
                        {analyticsData.userActivity.others.totalBorrowCount} total borrows
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "trends" && (
          <div className="trends-tab">
            <div className="chart-card full-width">
              <h3>Monthly Borrowing Trends</h3>
              <div className="monthly-chart">
                <div className="monthly-chart-container">
                  {monthlyTrendData.map((dataPoint, index) => {
                    const heightPercent = maxMonthlyCount > 0
                      ? Math.max((dataPoint.count / maxMonthlyCount) * 100, 4)
                      : 0;
                    return (
                      <div key={`${dataPoint.month}-${index}`} className="monthly-bar">
                        <span className="monthly-bar-count">{dataPoint.count}</span>
                        <div className="monthly-bar-track">
                          <div 
                            className="monthly-bar-fill"
                            style={{ height: `${heightPercent}%` }}
                          />
                        </div>
                        <span className="monthly-bar-label">{formatMonthShort(dataPoint.month)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "diagnostics" && (
          <div className="diagnostics-tab">
            {/* Equipment Damage Analysis */}
            <div className="diagnostic-section">
              <h2>🔧 Equipment Damage Analysis</h2>
              <div className="diagnostic-metrics">
                <div className="metric-card warning">
                  <div className="metric-value">{analyticsData.diagnosticAnalytics.equipmentDamage.totalDamageIncidents || 0}</div>
                  <div className="metric-label">Total Damage Incidents</div>
                </div>
              </div>
              
              <div className="chart-card">
                <h3>Most Frequently Damaged Equipment</h3>
                <div className="diagnostic-list">
                  {analyticsData.diagnosticAnalytics.equipmentDamage.mostDamagedEquipment?.length > 0 ? (
                    analyticsData.diagnosticAnalytics.equipmentDamage.mostDamagedEquipment.map((item, index) => (
                      <div key={item.equipment} className="diagnostic-item">
                        <div className="diagnostic-rank">#{index + 1}</div>
                        <div className="diagnostic-info">
                          <div className="diagnostic-name">{item.equipment}</div>
                          <div className="diagnostic-count">{item.count} {item.count === 1 ? 'incident' : 'incidents'}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="no-data-text">No damage incidents recorded in the selected period.</p>
                  )}
                </div>
              </div>

              {Object.keys(analyticsData.diagnosticAnalytics.equipmentDamage.damageByCategory || {}).length > 0 && (
                <div className="chart-card">
                  <h3>Damage by Category</h3>
                  <div className="category-chart">
                    {Object.entries(analyticsData.diagnosticAnalytics.equipmentDamage.damageByCategory)
                      .sort(([,a], [,b]) => b - a)
                      .slice(0, 5)
                      .map(([category, count]) => (
                        <div key={category} className="category-bar">
                          <div className="category-label">{category}</div>
                          <div className="category-bar-container">
                            <div 
                              className="category-bar-fill"
                              style={{
                                width: `${(count / Math.max(...Object.values(analyticsData.diagnosticAnalytics.equipmentDamage.damageByCategory))) * 100}%`,
                                backgroundColor: '#ef4444'
                              }}
                            ></div>
                            <span className="category-count">{count}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Lost/Missing Items Analysis */}
            <div className="diagnostic-section">
              <h2>🔍 Lost/Missing Items Analysis</h2>
              <div className="diagnostic-metrics">
                <div className="metric-card danger">
                  <div className="metric-value">{analyticsData.diagnosticAnalytics.lostItems.totalLostItems || 0}</div>
                  <div className="metric-label">Total Lost/Missing Items</div>
                </div>
              </div>

              <div className="chart-card">
                <h3>Most Frequently Lost Equipment</h3>
                <div className="diagnostic-list">
                  {analyticsData.diagnosticAnalytics.lostItems.mostLostEquipment?.length > 0 ? (
                    analyticsData.diagnosticAnalytics.lostItems.mostLostEquipment.map((item, index) => (
                      <div key={item.equipment} className="diagnostic-item">
                        <div className="diagnostic-rank">#{index + 1}</div>
                        <div className="diagnostic-info">
                          <div className="diagnostic-name">{item.equipment}</div>
                          <div className="diagnostic-count">{item.count} {item.count === 1 ? 'item' : 'items'}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="no-data-text">No lost/missing items recorded in the selected period.</p>
                  )}
                </div>
              </div>

              {Object.keys(analyticsData.diagnosticAnalytics.lostItems.causes || {}).length > 0 && (
                <div className="chart-card">
                  <h3>Identified Causes of Lost/Missing Items</h3>
                  <div className="category-chart">
                    {Object.entries(analyticsData.diagnosticAnalytics.lostItems.causes)
                      .sort(([,a], [,b]) => b - a)
                      .slice(0, 5)
                      .map(([cause, count]) => (
                        <div key={cause} className="category-bar">
                          <div className="category-label">{cause}</div>
                          <div className="category-bar-container">
                            <div 
                              className="category-bar-fill"
                              style={{
                                width: `${(count / Math.max(...Object.values(analyticsData.diagnosticAnalytics.lostItems.causes))) * 100}%`,
                                backgroundColor: '#f59e0b'
                              }}
                            ></div>
                            <span className="category-count">{count}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Late Returns Analysis */}
            <div className="diagnostic-section">
              <h2>⏰ Late Returns Analysis</h2>
              <div className="diagnostic-metrics">
                <div className="metric-card warning">
                  <div className="metric-value">{analyticsData.diagnosticAnalytics.lateReturns.totalLateReturns || 0}</div>
                  <div className="metric-label">Total Late Returns</div>
                </div>
                <div className="metric-card info">
                  <div className="metric-value">{analyticsData.diagnosticAnalytics.lateReturns.averageDaysLate || 0}</div>
                  <div className="metric-label">Average Days Late</div>
                </div>
              </div>

              {analyticsData.diagnosticAnalytics.lateReturns.topReasons?.length > 0 && (
                <div className="chart-card">
                  <h3>Reasons for Late Returns</h3>
                  <div className="category-chart">
                    {analyticsData.diagnosticAnalytics.lateReturns.topReasons.map((reason, index) => (
                      <div key={index} className="category-bar">
                        <div className="category-label">{reason.reason}</div>
                        <div className="category-bar-container">
                          <div 
                            className="category-bar-fill"
                            style={{
                              width: `${(reason.count / Math.max(...analyticsData.diagnosticAnalytics.lateReturns.topReasons.map(r => r.count))) * 100}%`,
                              backgroundColor: '#3b82f6'
                            }}
                          ></div>
                          <span className="category-count">{reason.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(analyticsData.diagnosticAnalytics.lateReturns.lateByEquipment || {}).length > 0 && (
                <div className="chart-card">
                  <h3>Equipment with Most Late Returns</h3>
                  <div className="diagnostic-list">
                    {Object.entries(analyticsData.diagnosticAnalytics.lateReturns.lateByEquipment)
                      .sort(([,a], [,b]) => b - a)
                      .slice(0, 10)
                      .map(([equipment, count], index) => (
                        <div key={equipment} className="diagnostic-item">
                          <div className="diagnostic-rank">#{index + 1}</div>
                          <div className="diagnostic-info">
                            <div className="diagnostic-name">{equipment}</div>
                            <div className="diagnostic-count">{count} {count === 1 ? 'late return' : 'late returns'}</div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Approval Bottlenecks Analysis */}
            <div className="diagnostic-section">
              <h2>🚧 Approval Process Bottlenecks</h2>
              <div className="diagnostic-metrics">
                <div className="metric-card danger">
                  <div className="metric-value">{analyticsData.diagnosticAnalytics.approvalBottlenecks.totalBottlenecks || 0}</div>
                  <div className="metric-label">Delayed Approvals (&gt;24 hours)</div>
                </div>
                <div className="metric-card info">
                  <div className="metric-value">{analyticsData.diagnosticAnalytics.approvalBottlenecks.averageApprovalTime || 0}</div>
                  <div className="metric-label">Avg. Approval Time (hours)</div>
                </div>
              </div>

              {analyticsData.diagnosticAnalytics.approvalBottlenecks.topSlowestLabs?.length > 0 && (
                <div className="chart-card">
                  <h3>Laboratories with Slowest Approval Times</h3>
                  <div className="category-chart">
                    {analyticsData.diagnosticAnalytics.approvalBottlenecks.topSlowestLabs.map((lab, index) => (
                      <div key={lab.lab} className="category-bar">
                        <div className="category-label">{lab.lab}</div>
                        <div className="category-bar-container">
                          <div 
                            className="category-bar-fill"
                            style={{
                              width: `${(lab.avgHours / Math.max(...analyticsData.diagnosticAnalytics.approvalBottlenecks.topSlowestLabs.map(l => l.avgHours))) * 100}%`,
                              backgroundColor: '#8b5cf6'
                            }}
                          ></div>
                          <span className="category-count">{lab.avgHours}h</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analyticsData.diagnosticAnalytics.approvalBottlenecks.topSlowestCategories?.length > 0 && (
                <div className="chart-card">
                  <h3>Equipment Categories with Slowest Approval Times</h3>
                  <div className="category-chart">
                    {analyticsData.diagnosticAnalytics.approvalBottlenecks.topSlowestCategories.map((category, index) => (
                      <div key={category.category} className="category-bar">
                        <div className="category-label">{category.category}</div>
                        <div className="category-bar-container">
                          <div 
                            className="category-bar-fill"
                            style={{
                              width: `${(category.avgHours / Math.max(...analyticsData.diagnosticAnalytics.approvalBottlenecks.topSlowestCategories.map(c => c.avgHours))) * 100}%`,
                              backgroundColor: '#ec4899'
                            }}
                          ></div>
                          <span className="category-count">{category.avgHours}h</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
