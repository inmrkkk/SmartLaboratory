// src/components/Analytics.jsx
import React, { useState, useEffect } from "react";
import { ref } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
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
      equipmentDamage: {
        damageByType: {
          'Cracked': 0,
          'Broken': 0,
          'Chipped': 0,
          'Scratched': 0,
          'Other': 0
        }
      },
      lostItems: {
        causes: {
          'Forgotten / Misplaced': 0,
          'Stolen': 0,
          'Unknown': 0
        }
      },
      lateReturns: {
        reasons: {
          'Forgot to Return': 0,
          'Extended Use': 0,
          'Not Available to Return': 0,
          'Lost Track of Schedule': 0,
          'Unexpected Conflict': 0,
          'Equipment Hard to Transport': 0,
          'Unknown': 0
        }
      },
      approvalBottlenecks: {}
    }
  });
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("30"); // days
  const [activeTab, setActiveTab] = useState("users");
  const [showReviewSection, setShowReviewSection] = useState(false);

  const chartPalette = {
    primary: "#4da1ff",
    secondary: "#a78bfa",
    accent: "#f7b23b",
    neutral: "#94a3b8"
  };

  const chartTooltipStyles = {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    boxShadow: "0 20px 45px rgba(15, 23, 42, 0.15)",
    padding: "12px 16px"
  };

  const chartAxisTick = {
    fill: "#475569",
    fontSize: 12,
    fontWeight: 600
  };

  const renderDateTick = ({ x, y, payload }) => {
    const [month = "", day = ""] = (payload.value || "").split(" ");
    return (
      <g transform={`translate(${x},${y})`}>
        <text dy={16} fill={chartAxisTick.fill} fontSize={chartAxisTick.fontSize} fontWeight={chartAxisTick.fontWeight} textAnchor="middle">
          <tspan x={0} dy="0">{month}</tspan>
          <tspan x={0} dy="14">{day}</tspan>
        </text>
      </g>
    );
  };

  const chartGridStroke = "#e2e8f0";
  const chartTooltipLabelStyle = { color: "#0f172a", fontWeight: 600 };
  const chartTooltipItemStyle = { color: "#0f172a", fontWeight: 500 };
  const sharedTooltipProps = {
    contentStyle: chartTooltipStyles,
    itemStyle: chartTooltipItemStyle,
    labelStyle: chartTooltipLabelStyle
  };

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

  // Keyword Matching Functions
  const categorizeDamage = (text) => {
    if (!text || text.trim().length === 0) return 'Other';
    const lowerText = text.toLowerCase().trim();
    
    // Skip generic damage descriptions that don't help with categorization
    if (lowerText === 'damaged' || lowerText === 'returned damaged' || 
        lowerText === 'item damaged' || lowerText === 'damage') {
      return 'Other';
    }
    
    // Check for Cracked (check first as it's more specific)
    if (lowerText.includes('cracked') || lowerText.includes('fissure') || 
        lowerText.includes('crack') || lowerText.includes('fracture') ||
        lowerText.includes('fractured') || lowerText.includes('split') ||
        lowerText.includes('splintered') || lowerText.includes('cracking')) {
      return 'Cracked';
    }
    
    // Check for Broken
    if (lowerText.includes('shattered') || lowerText.includes('pieces') ||
        lowerText.includes('broken') || lowerText.includes('broke') ||
        lowerText.includes('smashed') || lowerText.includes('destroyed') ||
        lowerText.includes('shatter') || lowerText.includes('busted') ||
        lowerText.includes('snapped') || lowerText.includes('torn apart') ||
        lowerText.includes('not working') || lowerText.includes('malfunction') ||
        lowerText.includes('doesn\'t work') || lowerText.includes('won\'t work')) {
      return 'Broken';
    }
    
    // Check for Chipped
    if (lowerText.includes('chipped') || lowerText.includes('chip') ||
        lowerText.includes('chunk') || lowerText.includes('piece missing') ||
        lowerText.includes('chipped off') || lowerText.includes('piece broke off') ||
        lowerText.includes('piece fell off') || lowerText.includes('missing piece')) {
      return 'Chipped';
    }
    
    // Check for Scratched
    if (lowerText.includes('scratched') || lowerText.includes('scratch') ||
        lowerText.includes('scrape') || lowerText.includes('abrasion') ||
        lowerText.includes('surface damage') || lowerText.includes('scraped') ||
        lowerText.includes('gouge') || lowerText.includes('gouged') ||
        lowerText.includes('surface wear') || lowerText.includes('worn') ||
        lowerText.includes('faded') || lowerText.includes('discolored')) {
      return 'Scratched';
    }
    
    return 'Other';
  };

  const categorizeLostItem = (text) => {
    if (!text) return 'Unknown';
    const lowerText = text.toLowerCase();
    
    // Check for Stolen (check first as it's more specific)
    if (lowerText.includes('stolen') || lowerText.includes('theft') ||
        lowerText.includes('robbed') || lowerText.includes('taken') ||
        lowerText.includes('stole') || lowerText.includes('theft') ||
        lowerText.includes('burglary') || lowerText.includes('stolen from')) {
      return 'Stolen';
    }
    
    // Check for Forgotten / Misplaced
    if (lowerText.includes('forgot') || lowerText.includes('forgotten') ||
        lowerText.includes('misplaced') || lowerText.includes('lost') ||
        lowerText.includes('cannot find') || lowerText.includes('can\'t find') ||
        lowerText.includes('can not find') || lowerText.includes('missing') ||
        lowerText.includes('don\'t know where') || lowerText.includes('don\'t remember') ||
        lowerText.includes('left behind') || lowerText.includes('left somewhere')) {
      return 'Forgotten / Misplaced';
    }
    
    return 'Unknown';
  };

  const categorizeLateReturn = (text) => {
    if (!text || text.trim().length === 0) return 'Unknown';
    const normalizedText = text
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .trim();

    const matches = (phrases) => phrases.some(phrase => normalizedText.includes(phrase));

    // Forgot to return
    if (matches([
      'forgot',
      'forgotten',
      'left it',
      'overlooked',
      'did not remember',
      "didn't remember",
      "i didn't remember",
      "i didnt remember",
      "i don't remember",
      "i dont remember",
      'forgot to return'
    ])) {
      return 'Forgot to Return';
    }

    // Extended use / still needed
    if (matches([
      'still using',
      'still used',
      'ongoing',
      'extended',
      'not done',
      'unfinished',
      'continued the experiment',
      'need more time',
      'still needed',
      'still need',
      'in use',
      'continued work',
      'extra time'
    ])) {
      return 'Extended Use';
    }

    // Borrower not available
    if (matches([
      'absent',
      'not in school',
      'was sick',
      'out of town',
      "couldn't come",
      'could not come',
      'busy with class',
      'had class',
      'not available'
    ])) {
      return 'Not Available to Return';
    }

    // Lost track of schedule
    if (matches([
      "didn't notice",
      'did not notice',
      "didn't know",
      'not aware',
      'lost track',
      'wrong schedule',
      'wrong time',
      'thought it was due later',
      'thought due later'
    ])) {
      return 'Lost Track of Schedule';
    }

    // Emergency or unexpected conflict
    if (matches([
      'emergency',
      'urgent',
      'sudden',
      'meeting',
      'important event',
      'unexpected',
      'conflict',
      'problem came up'
    ])) {
      return 'Unexpected Conflict';
    }

    // Hard to transport or difficulty returning equipment
    if (matches([
      'hard to carry',
      'heavy',
      'difficult to bring',
      'transport',
      'far lab',
      "can't carry",
      'cant carry',
      'difficult to return'
    ])) {
      return 'Equipment Hard to Transport';
    }

    return 'Unknown';
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
      damageByType: {
        'Cracked': 0,
        'Broken': 0,
        'Chipped': 0,
        'Scratched': 0,
        'Other': 0
      },
      mostDamagedEquipment: [],
      recentReports: [],
      uncategorizedCount: 0,
      otherItemsDetails: [] // Store details of items categorized as "Other"
    };

    damageEntries.forEach(entry => {
      const equipmentName = entry.equipmentName || 'Unknown';
      const categoryName = entry.categoryName || 'Unknown';
      const borrower = entry.borrower || entry.adviserName || 'Unknown';
      
      // Get damage description from conditionNotes (primary) or notes (fallback)
      // Don't use entry.condition as it's just "Returned damaged" and not descriptive
      const conditionNotes = entry.returnDetails?.conditionNotes || '';
      const notes = entry.returnDetails?.notes || '';
      const damageText = (conditionNotes || notes).trim().toLowerCase();
      
      // Debug: Log the extracted text for troubleshooting
      if (damageText) {
        console.log('Damage entry:', {
          equipment: equipmentName,
          conditionNotes: conditionNotes,
          notes: notes,
          extractedText: damageText
        });
      }
      
      // Categorize damage type - only if we have descriptive text
      let damageType = 'Other';
      if (damageText && damageText.length > 0) {
        damageType = categorizeDamage(damageText);
        // If still categorized as Other, store details for review
        if (damageType === 'Other') {
          equipmentDamageAnalysis.otherItemsDetails.push({
            equipmentName,
            categoryName,
            borrower,
            description: conditionNotes || notes || 'No description provided',
            timestamp: entry.timestamp
          });
        }
      } else {
        // If no descriptive text, mark as uncategorized
        equipmentDamageAnalysis.uncategorizedCount += 1;
        equipmentDamageAnalysis.otherItemsDetails.push({
          equipmentName,
          categoryName,
          borrower,
          description: 'No description provided',
          timestamp: entry.timestamp
        });
      }
      
      equipmentDamageAnalysis.damageByType[damageType] = 
        (equipmentDamageAnalysis.damageByType[damageType] || 0) + 1;

      equipmentDamageAnalysis.damageByEquipment[equipmentName] = 
        (equipmentDamageAnalysis.damageByEquipment[equipmentName] || 0) + 1;
      equipmentDamageAnalysis.damageByCategory[categoryName] = 
        (equipmentDamageAnalysis.damageByCategory[categoryName] || 0) + 1;
      equipmentDamageAnalysis.damageByBorrower[borrower] = 
        (equipmentDamageAnalysis.damageByBorrower[borrower] || 0) + 1;

      // Store recent reports
      equipmentDamageAnalysis.recentReports.push({
        equipmentName,
        categoryName,
        borrower,
        damageType,
        timestamp: entry.timestamp,
        notes: entry.returnDetails?.conditionNotes || entry.returnDetails?.notes || '',
        date: entry.returnDate || entry.timestamp
      });
    });

    // Sort recent reports by date (newest first) and take top 5
    equipmentDamageAnalysis.recentReports = equipmentDamageAnalysis.recentReports
      .sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date))
      .slice(0, 5);

    equipmentDamageAnalysis.mostDamagedEquipment = Object.entries(equipmentDamageAnalysis.damageByEquipment)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
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
      causes: {
        'Forgotten / Misplaced': 0,
        'Stolen': 0,
        'Unknown': 0
      },
      mostLostEquipment: [],
      recentReports: [],
      uncategorizedCount: 0
    };

    lostEntries.forEach(entry => {
      const equipmentName = entry.equipmentName || 'Unknown';
      const categoryName = entry.categoryName || 'Unknown';
      const borrower = entry.borrower || entry.adviserName || 'Unknown';
      
      // Get description from notes or conditionNotes
      const notesText = (entry.returnDetails?.conditionNotes || 
                        entry.returnDetails?.notes || 
                        entry.condition || '').toLowerCase();

      lostItemsAnalysis.lostByEquipment[equipmentName] = 
        (lostItemsAnalysis.lostByEquipment[equipmentName] || 0) + 1;
      lostItemsAnalysis.lostByCategory[categoryName] = 
        (lostItemsAnalysis.lostByCategory[categoryName] || 0) + 1;
      lostItemsAnalysis.lostByBorrower[borrower] = 
        (lostItemsAnalysis.lostByBorrower[borrower] || 0) + 1;

      // Categorize cause using keyword matching
      const cause = categorizeLostItem(notesText);
      lostItemsAnalysis.causes[cause] = (lostItemsAnalysis.causes[cause] || 0) + 1;

      // Track uncategorized
      if (cause === 'Unknown' && !notesText) {
        lostItemsAnalysis.uncategorizedCount += 1;
      }

      // Store recent reports
      lostItemsAnalysis.recentReports.push({
        equipmentName,
        categoryName,
        borrower,
        cause,
        timestamp: entry.timestamp,
        notes: entry.returnDetails?.conditionNotes || entry.returnDetails?.notes || '',
        date: entry.returnDate || entry.timestamp
      });
    });

    // Sort recent reports by date (newest first) and take top 5
    lostItemsAnalysis.recentReports = lostItemsAnalysis.recentReports
      .sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date))
      .slice(0, 5);

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
    const lateReturnReasons = {
      'Forgot to Return': 0,
      'Extended Use': 0,
      'Not Available to Return': 0,
      'Lost Track of Schedule': 0,
      'Unexpected Conflict': 0,
      'Equipment Hard to Transport': 0,
      'Unknown': 0
    };
    const uncategorizedLateReturns = []; // Store items with NO text (truly uncategorized)
    const unknownLateReturns = []; // Store ALL "Unknown" items for review (with or without text)

    returnedEntries.forEach(entry => {
      // Use dateToReturn from history entry (stored when return was recorded)
      const dateToReturn = entry.dateToReturn;
      if (!dateToReturn) return;

      const returnDate = new Date(entry.returnDate || entry.timestamp);
      const dueDate = new Date(dateToReturn);
      
      if (returnDate > dueDate) {
        const daysLate = Math.ceil((returnDate - dueDate) / (1000 * 60 * 60 * 24));
        
        // Get description from notes
        const notesText = (entry.returnDetails?.notes || 
                          entry.returnDetails?.delayReason || 
                          '').toLowerCase();

        lateReturns.push({
          equipmentName: entry.equipmentName || 'Unknown',
          categoryName: entry.categoryName || 'Unknown',
          borrower: entry.borrower || entry.adviserName || 'Unknown',
          daysLate,
          notes: entry.returnDetails?.notes || '',
          returnDate: entry.returnDate || entry.timestamp,
          dueDate: dateToReturn
        });

        // Categorize reason using keyword matching
        const reason = categorizeLateReturn(notesText);
        lateReturnReasons[reason] = (lateReturnReasons[reason] || 0) + 1;
        
        const lateReturnItem = {
          equipmentName: entry.equipmentName || 'Unknown',
          categoryName: entry.categoryName || 'Unknown',
          borrower: entry.borrower || entry.adviserName || 'Unknown',
          daysLate,
          notes: entry.returnDetails?.notes || '',
          timestamp: entry.timestamp,
          returnDate: entry.returnDate || entry.timestamp,
          dueDate: dateToReturn
        };
        
        // Store uncategorized late returns (only if no text provided - truly uncategorized)
        if (reason === 'Unknown' && !notesText.trim()) {
          uncategorizedLateReturns.push(lateReturnItem);
        }
        
        // Store ALL "Unknown" items for review (both with and without text)
        if (reason === 'Unknown') {
          unknownLateReturns.push(lateReturnItem);
        }
      }
    });

    // Calculate late return trends over time (daily for the period)
    const lateReturnTrends = [];
    const dailyLateReturns = {};
    
    lateReturns.forEach(ret => {
      const date = new Date(ret.returnDate);
      const dateKey = date.toISOString().split('T')[0];
      if (!dailyLateReturns[dateKey]) {
        dailyLateReturns[dateKey] = { count: 0, totalDaysLate: 0 };
      }
      dailyLateReturns[dateKey].count += 1;
      dailyLateReturns[dateKey].totalDaysLate += ret.daysLate;
    });

    // Create trend data for the period
    for (let i = periodDays - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      const dayData = dailyLateReturns[dateKey] || { count: 0, totalDaysLate: 0 };
      lateReturnTrends.push({
        date: dateKey,
        count: dayData.count,
        avgDaysLate: dayData.count > 0 ? Math.round((dayData.totalDaysLate / dayData.count) * 10) / 10 : 0
      });
    }

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
        .filter(([reason, count]) => reason !== 'Unknown' && count > 0)
        .sort(([,a], [,b]) => b - a)
        .map(([reason, count]) => ({ reason, count })),
      trends: lateReturnTrends,
      // Only count as uncategorized if there's no text at all (not just "Unknown" with text)
      uncategorizedCount: uncategorizedLateReturns.length,
      uncategorizedItems: uncategorizedLateReturns, // Items with NO text (truly uncategorized)
      unknownItems: unknownLateReturns // ALL "Unknown" items for review (with or without text)
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

    // Calculate total uncategorized incidents
    const totalUncategorized = 
      equipmentDamageAnalysis.uncategorizedCount +
      lostItemsAnalysis.uncategorizedCount +
      lateReturnsAnalysis.uncategorizedCount;

    return {
      equipmentDamage: equipmentDamageAnalysis,
      lostItems: lostItemsAnalysis,
      lateReturns: lateReturnsAnalysis,
      approvalBottlenecks: approvalBottlenecksAnalysis,
      totalIncidents: damageEntries.length + lostEntries.length + lateReturns.length,
      uncategorizedIncidents: {
        total: totalUncategorized,
        damage: equipmentDamageAnalysis.uncategorizedCount,
        lost: lostItemsAnalysis.uncategorizedCount,
        lateReturn: lateReturnsAnalysis.uncategorizedCount
      }
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
            {/* Overview Cards */}
            <div className="diagnostics-overview">
              <div className="overview-card total">
                <div className="overview-icon">📊</div>
                <div className="overview-content">
                  <div className="overview-value">{analyticsData.diagnosticAnalytics.totalIncidents || 0}</div>
                  <div className="overview-label">Total Incident Reports</div>
                </div>
              </div>
              <div className="overview-card damage">
                <div className="overview-icon">🔧</div>
                <div className="overview-content">
                  <div className="overview-value">{analyticsData.diagnosticAnalytics.equipmentDamage?.totalDamageIncidents || 0}</div>
                  <div className="overview-label">Damage Reports</div>
                  <div className="overview-percentage">
                    {analyticsData.diagnosticAnalytics.totalIncidents > 0 
                      ? Math.round((analyticsData.diagnosticAnalytics.equipmentDamage?.totalDamageIncidents / analyticsData.diagnosticAnalytics.totalIncidents) * 100)
                      : 0}% of total
                  </div>
                </div>
              </div>
              <div className="overview-card lost">
                <div className="overview-icon">🔍</div>
                <div className="overview-content">
                  <div className="overview-value">{analyticsData.diagnosticAnalytics.lostItems?.totalLostItems || 0}</div>
                  <div className="overview-label">Lost Reports</div>
                  <div className="overview-percentage">
                    {analyticsData.diagnosticAnalytics.totalIncidents > 0 
                      ? Math.round((analyticsData.diagnosticAnalytics.lostItems?.totalLostItems / analyticsData.diagnosticAnalytics.totalIncidents) * 100)
                      : 0}% of total
                  </div>
                </div>
              </div>
              <div className="overview-card late">
                <div className="overview-icon">⏰</div>
                <div className="overview-content">
                  <div className="overview-value">{analyticsData.diagnosticAnalytics.lateReturns?.totalLateReturns || 0}</div>
                  <div className="overview-label">Late Return Reports</div>
                  <div className="overview-percentage">
                    {analyticsData.diagnosticAnalytics.totalIncidents > 0 
                      ? Math.round((analyticsData.diagnosticAnalytics.lateReturns?.totalLateReturns / analyticsData.diagnosticAnalytics.totalIncidents) * 100)
                      : 0}% of total
                  </div>
                </div>
              </div>
            </div>

            {/* Main Analytics Layout */}
            <div className="diagnostics-row">
              {/* Lost Items Hero */}
              <section className="hero-card lost-hero">
                <div className="card-heading">
                  <div>
                    <p className="card-kicker">Lost Items</p>
                    <h2>Lost Items Analytics</h2>
                  </div>
                  <span className="card-pill">
                    <span className="pill-dot" />
                    {analyticsData.diagnosticAnalytics.lostItems?.totalLostItems || 0} reports
                  </span>
                </div>
                <div className="hero-panels two">
                  <div className="chart-card">
                    <h3>Lost Items by Cause</h3>
                    {(() => {
                      const lostData = Object.entries(analyticsData.diagnosticAnalytics.lostItems?.causes || {})
                        .filter(([cause, count]) => count > 0)
                        .map(([cause, count]) => ({ name: cause, value: count }));
                      const COLORS = {
                        'Forgotten / Misplaced': '#f97316',
                        'Stolen': '#ef4444',
                        'Unknown': chartPalette.neutral
                      };
                      const total = lostData.reduce((sum, item) => sum + item.value, 0);

                      if (lostData.length === 0) {
                        return <p className="no-data-text">No lost items data available</p>;
                      }

                      return (
                        <div className="chart-container">
                          <ResponsiveContainer width="100%" height={320}>
                            <PieChart>
                              <Pie
                                data={lostData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={5}
                                dataKey="value"
                                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                              >
                                {lostData.map((entry, index) => (
                                  <Cell key={`lost-cell-${index}`} fill={COLORS[entry.name] || chartPalette.accent} />
                                ))}
                              </Pie>
                              <Tooltip {...sharedTooltipProps} />
                              <Legend 
                                wrapperStyle={{ paddingTop: '20px' }}
                                layout="horizontal"
                                verticalAlign="bottom"
                                align="center"
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="chart-summary">
                            <div className="summary-item">
                              <span className="summary-label">Total:</span>
                              <span className="summary-value">{total}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="chart-card">
                    <h3>Top 5 Items by Lost Count</h3>
                    <div className="top-items-list">
                      {analyticsData.diagnosticAnalytics.lostItems?.mostLostEquipment?.length > 0 ? (
                        analyticsData.diagnosticAnalytics.lostItems.mostLostEquipment
                          .slice(0, 5)
                          .map((item, index) => (
                            <div key={item.equipment} className="top-item">
                              <div className="item-rank">#{index + 1}</div>
                              <div className="item-info">
                                <div className="item-name">{item.equipment}</div>
                                <div className="item-count">{item.count} {item.count === 1 ? 'report' : 'reports'}</div>
                              </div>
                            </div>
                          ))
                      ) : (
                        <p className="no-data-text">No lost items recorded</p>
                      )}
                    </div>
                  </div>
                  <div className="chart-card full-width reason-breakdown-card">
                    <h3>Lost Item Cause Breakdown</h3>
                    {(() => {
                      const lostCauses = analyticsData.diagnosticAnalytics.lostItems?.causes || {};
                      const totalLost = analyticsData.diagnosticAnalytics.lostItems?.totalLostItems || 0;
                      const reasonConfig = [
                        {
                          key: 'Forgotten / Misplaced',
                          label: 'Forgotten / Misplaced',
                          description: 'Item was misplaced or borrower forgot where it was left.',
                          badgeColor: '#f97316'
                        },
                        {
                          key: 'Stolen',
                          label: 'Stolen',
                          description: 'Incident report indicates possible theft.',
                          badgeColor: '#ef4444'
                        },
                        {
                          key: 'Unknown',
                          label: 'Other / Unknown',
                          description: 'Cause not specified; requires manual follow-up.',
                          badgeColor: '#94a3b8'
                        }
                      ];

                      return (
                        <div className="reason-breakdown-grid">
                          {reasonConfig.map(reason => {
                            const count = lostCauses[reason.key] || 0;
                            const percentage = totalLost > 0 ? Math.round((count / totalLost) * 100) : 0;
                            return (
                              <div key={reason.key} className="reason-item">
                                <div className="reason-item-header">
                                  <span className="reason-badge" style={{ backgroundColor: reason.badgeColor }} />
                                  <div>
                                    <div className="reason-label">{reason.label}</div>
                                    <div className="reason-description">{reason.description}</div>
                                  </div>
                                </div>
                                <div className="reason-metrics">
                                  <div className="reason-count">{count}</div>
                                  <div className="reason-percentage">{percentage}%</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </section>

              {/* Damage Hero */}
              <section className="hero-card damage-hero">
                <div className="card-heading">
                  <div>
                    <p className="card-kicker">Damage</p>
                    <h2>Damage Analytics</h2>
                  </div>
                  <span className="card-pill">
                    <span className="pill-dot" />
                    {analyticsData.diagnosticAnalytics.equipmentDamage?.totalDamageIncidents || 0} incidents
                  </span>
                </div>
                <div className="hero-panels two">
                  <div className="chart-card">
                    <h3>Damage by Type</h3>
                    {(() => {
                      const damageData = Object.entries(analyticsData.diagnosticAnalytics.equipmentDamage?.damageByType || {})
                        .filter(([type, count]) => count > 0)
                        .map(([type, count]) => ({ name: type, value: count }));
                      const COLORS = {
                        'Cracked': chartPalette.primary,
                        'Broken': '#5b21b6',
                        'Chipped': chartPalette.accent,
                        'Scratched': '#60a5fa',
                        'Other': chartPalette.neutral
                      };
                      const total = damageData.reduce((sum, item) => sum + item.value, 0);
                      
                      if (damageData.length === 0) {
                        return <p className="no-data-text">No damage data available</p>;
                      }
                      
                      return (
                        <div className="chart-container">
                          <ResponsiveContainer width="100%" height={350} minHeight={300}>
                            <PieChart>
                              <Pie
                                data={damageData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={5}
                                dataKey="value"
                                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                              >
                                {damageData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[entry.name] || '#6b7280'} />
                                ))}
                              </Pie>
                              <Tooltip {...sharedTooltipProps} />
                              <Legend 
                                wrapperStyle={{ paddingTop: '20px' }}
                                layout="horizontal"
                                verticalAlign="bottom"
                                align="center"
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="chart-summary">
                            <div className="summary-item">
                              <span className="summary-label">Total:</span>
                              <span className="summary-value">{total}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="chart-card">
                    <h3>Top 5 Items by Damage Count</h3>
                    <div className="top-items-list">
                      {analyticsData.diagnosticAnalytics.equipmentDamage?.mostDamagedEquipment?.length > 0 ? (
                        analyticsData.diagnosticAnalytics.equipmentDamage.mostDamagedEquipment
                          .slice(0, 5)
                          .map((item, index) => (
                            <div key={item.equipment} className="top-item">
                              <div className="item-rank">#{index + 1}</div>
                              <div className="item-info">
                                <div className="item-name">{item.equipment}</div>
                                <div className="item-count">{item.count} {item.count === 1 ? 'incident' : 'incidents'}</div>
                              </div>
                            </div>
                          ))
                      ) : (
                        <p className="no-data-text">No damage incidents recorded</p>
                      )}
                    </div>
                  </div>

                  <div className="chart-card full-width reason-breakdown-card">
                    <h3>Damage Reason Breakdown</h3>
                    {(() => {
                      const damageTypes = analyticsData.diagnosticAnalytics.equipmentDamage?.damageByType || {};
                      const totalDamage = analyticsData.diagnosticAnalytics.equipmentDamage?.totalDamageIncidents || 0;
                      const typeConfig = [
                        {
                          key: 'Cracked',
                          label: 'Cracked',
                          description: 'Surface or structural cracks observed on return.',
                          badgeColor: chartPalette.primary
                        },
                        {
                          key: 'Broken',
                          label: 'Broken',
                          description: 'Major breakage or non-functional equipment.',
                          badgeColor: '#5b21b6'
                        },
                        {
                          key: 'Chipped',
                          label: 'Chipped',
                          description: 'Small pieces or edges chipped off.',
                          badgeColor: chartPalette.accent
                        },
                        {
                          key: 'Scratched',
                          label: 'Scratched',
                          description: 'Surface scratches or abrasions reported.',
                          badgeColor: '#60a5fa'
                        },
                        {
                          key: 'Other',
                          label: 'Other / Uncategorized',
                          description: 'Does not fit mapped damage patterns.',
                          badgeColor: chartPalette.neutral
                        }
                      ];

                      return (
                        <div className="reason-breakdown-grid">
                          {typeConfig.map(type => {
                            const count = damageTypes[type.key] || 0;
                            const percentage = totalDamage > 0 ? Math.round((count / totalDamage) * 100) : 0;
                            return (
                              <div key={type.key} className="reason-item">
                                <div className="reason-item-header">
                                  <span className="reason-badge" style={{ backgroundColor: type.badgeColor }} />
                                  <div>
                                    <div className="reason-label">{type.label}</div>
                                    <div className="reason-description">{type.description}</div>
                                  </div>
                                </div>
                                <div className="reason-metrics">
                                  <div className="reason-count">{count}</div>
                                  <div className="reason-percentage">{percentage}%</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>

              </section>
            </div>

            {/* Late Return Hero */}
            <section className="hero-card late-hero">
              <div className="card-heading">
                <div>
                  <p className="card-kicker">Late Returns</p>
                  <h2>Late Return Analytics</h2>
                </div>
                <span className="card-pill">
                  <span className="pill-dot" />
                  {analyticsData.diagnosticAnalytics.lateReturns?.totalLateReturns || 0} reports
                </span>
              </div>
              <div className="hero-panels two">
                <div className="chart-card">
                  <h3>Late Returns Trend</h3>
                  {(() => {
                    const trendData = analyticsData.diagnosticAnalytics.lateReturns?.trends || [];
                    
                    if (trendData.length === 0) {
                      return <p className="no-data-text">No late return data available</p>;
                    }
                    
                    const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
                    const formattedData = trendData.map(item => ({
                      ...item,
                      dateLabel: dateFormatter.format(new Date(item.date))
                    }));
                    
                    return (
                      <div className="chart-container">
                        <ResponsiveContainer width="100%" height={320}>
                          <LineChart data={formattedData}>
                            <CartesianGrid stroke={chartGridStroke} strokeDasharray="3 3" />
                            <XAxis dataKey="dateLabel" tickLine={false} tick={renderDateTick} height={70} interval={0} />
                            <YAxis tick={chartAxisTick} />
                            <Tooltip
                              {...sharedTooltipProps}
                              labelFormatter={(label) => `Returned on ${label}`}
                              formatter={(value) => [`${value} reports`, 'Late Returns']}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="count" stroke={chartPalette.primary} strokeWidth={4} name="Late Returns" dot={{ r: 5 }} activeDot={{ r: 7 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}
                </div>
                <div className="chart-card">
                  <h3>Late Returns by Reason</h3>
                  {(() => {
                    const reasonsData = Object.entries(analyticsData.diagnosticAnalytics.lateReturns?.reasons || {})
                      .filter(([reason, count]) => reason !== 'Unknown' && count > 0)
                      .map(([reason, count]) => ({
                        name: reason,
                        value: count
                      }));
                    const reasonColors = {
                      'Forgot to Return': '#f97316',
                      'Extended Use': '#6366f1',
                      'Not Available to Return': '#0ea5e9',
                      'Lost Track of Schedule': '#10b981',
                      'Unexpected Conflict': '#e11d48',
                      'Equipment Hard to Transport': '#c026d3'
                    };
                    const totalReasons = reasonsData.reduce((sum, item) => sum + item.value, 0);

                    if (reasonsData.length === 0) {
                      return <p className="no-data-text">No late return reason data available</p>;
                    }

                    return (
                      <div className="chart-container">
                        <ResponsiveContainer width="100%" height={320}>
                          <PieChart>
                            <Pie
                              data={reasonsData}
                              cx="50%"
                              cy="50%"
                              innerRadius={80}
                              outerRadius={120}
                              paddingAngle={2}
                              cornerRadius={8}
                              dataKey="value"
                              nameKey="name"
                              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            >
                              {reasonsData.map((entry, index) => (
                                <Cell key={`late-reason-cell-${index}`} fill={reasonColors[entry.name] || chartPalette.accent} />
                              ))}
                            </Pie>
                            <Tooltip
                              {...sharedTooltipProps}
                              formatter={(value) => {
                                const percentage = totalReasons > 0 ? ((value / totalReasons) * 100).toFixed(1) : 0;
                                return [`${value} (${percentage}%)`, 'Late Returns'];
                              }}
                            />
                            <Legend verticalAlign="bottom" align="center" iconType="circle" />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}
                </div>
                <div className="chart-card full-width reason-breakdown-card">
                  <h3>Reason Breakdown Summary</h3>
                  {(() => {
                    const reasonTotals = analyticsData.diagnosticAnalytics.lateReturns?.reasons || {};
                    const totalLateReturns = analyticsData.diagnosticAnalytics.lateReturns?.totalLateReturns || 0;
                    const reasonConfig = [
                      {
                        key: 'Forgot to Return',
                        label: 'Forgot to Return',
                        description: 'Borrower admitted they simply forgot to bring the equipment back.',
                        badgeColor: '#f97316'
                      },
                      {
                        key: 'Extended Use',
                        label: 'Extended Use',
                        description: 'Borrower needed the gear longer to finish ongoing work.',
                        badgeColor: '#6366f1'
                      },
                      {
                        key: 'Not Available to Return',
                        label: 'Not Available to Return',
                        description: 'Borrower was absent or unavailable during the return window.',
                        badgeColor: '#0ea5e9'
                      },
                      {
                        key: 'Lost Track of Schedule',
                        label: 'Lost Track of Schedule',
                        description: 'Borrower misunderstood or forgot the due date.',
                        badgeColor: '#10b981'
                      },
                      {
                        key: 'Unexpected Conflict',
                        label: 'Unexpected Conflict',
                        description: 'Emergencies or sudden priorities interfered with the return.',
                        badgeColor: '#e11d48'
                      },
                      {
                        key: 'Equipment Hard to Transport',
                        label: 'Equipment Hard to Transport',
                        description: 'Borrower experienced difficulty transporting the equipment.',
                        badgeColor: '#c026d3'
                      },
                      {
                        key: 'Unknown',
                        label: 'Other',
                        description: 'No clear reason provided; requires manual follow-up.',
                        badgeColor: '#94a3b8'
                      }
                    ];

                    return (
                      <div className="reason-breakdown-grid">
                        {reasonConfig.map(reason => {
                          const count = reasonTotals[reason.key] || 0;
                          const percentage = totalLateReturns > 0 ? Math.round((count / totalLateReturns) * 100) : 0;
                          return (
                            <div key={reason.key} className="reason-item">
                              <div className="reason-item-header">
                                <span className="reason-badge" style={{ backgroundColor: reason.badgeColor }} />
                                <div>
                                  <div className="reason-label">{reason.label}</div>
                                  <div className="reason-description">{reason.description}</div>
                                </div>
                              </div>
                              <div className="reason-metrics">
                                <div className="reason-count">{count}</div>
                                <div className="reason-percentage">{percentage}%</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </section>

            <div className="diagnostics-stack">
              {/* Uncategorized Incidents Card */}
              <div className="diagnostic-section uncategorized-section">
                <h2>⚠️ Uncategorized Incidents for Review</h2>
                <div className="uncategorized-card">
                  <div className="uncategorized-header">
                    <div className="uncategorized-count">
                      <span className="count-value">{analyticsData.diagnosticAnalytics.uncategorizedIncidents?.total || 0}</span>
                      <span className="count-label">Total Uncategorized</span>
                    </div>
                    <div className="uncategorized-percentage">
                      {analyticsData.diagnosticAnalytics.totalIncidents > 0 
                        ? Math.round((analyticsData.diagnosticAnalytics.uncategorizedIncidents?.total / analyticsData.diagnosticAnalytics.totalIncidents) * 100)
                        : 0}% of all incidents
                    </div>
                  </div>
                  <div className="uncategorized-breakdown">
                    <div className="breakdown-item">
                      <span className="breakdown-label">Damage:</span>
                      <span className="breakdown-value">{analyticsData.diagnosticAnalytics.uncategorizedIncidents?.damage || 0}</span>
                    </div>
                    <div className="breakdown-item">
                      <span className="breakdown-label">Lost:</span>
                      <span className="breakdown-value">{analyticsData.diagnosticAnalytics.uncategorizedIncidents?.lost || 0}</span>
                    </div>
                    <div className="breakdown-item">
                      <span className="breakdown-label">Late Return:</span>
                      <span className="breakdown-value">{analyticsData.diagnosticAnalytics.uncategorizedIncidents?.lateReturn || 0}</span>
                    </div>
                  </div>
                  <div className="uncategorized-action">
                    <button 
                      className="review-button"
                      onClick={() => {
                        setShowReviewSection(!showReviewSection);
                        // Scroll to review section if showing it
                        if (!showReviewSection) {
                          setTimeout(() => {
                            const reviewSection = document.getElementById('review-section');
                            if (reviewSection) {
                              reviewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                          }, 100);
                        }
                      }}
                    >
                      {showReviewSection ? 'Hide Review Section' : 'Review Incidents'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Review Section - Show all uncategorized incidents */}
              {showReviewSection && (
                <div id="review-section" className="diagnostic-section review-section">
                  <h2>📋 Review Uncategorized Incidents</h2>
                  
                  {/* Damage Incidents */}
                  {analyticsData.diagnosticAnalytics.uncategorizedIncidents?.damage > 0 && (
                    <div className="review-category">
                      <h3>Damage Incidents ({analyticsData.diagnosticAnalytics.uncategorizedIncidents.damage})</h3>
                      <div className="review-items-list">
                        {analyticsData.diagnosticAnalytics.equipmentDamage?.otherItemsDetails?.length > 0 ? (
                          analyticsData.diagnosticAnalytics.equipmentDamage.otherItemsDetails.map((item, index) => (
                            <div key={index} className="review-item">
                              <div className="review-item-header">
                                <div className="review-item-name">{item.equipmentName}</div>
                                <div className="review-item-date">{formatDate(item.timestamp)}</div>
                              </div>
                              <div className="review-item-details">
                                <div className="review-item-meta">
                                  <span>Category: {item.categoryName}</span>
                                  <span>Borrower: {item.borrower}</span>
                                </div>
                                <div className="review-item-description">
                                  <strong>Description:</strong> {item.description || 'No description provided'}
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="no-data-text">No damage incidents to review</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Lost Incidents */}
                  {analyticsData.diagnosticAnalytics.uncategorizedIncidents?.lost > 0 && (
                    <div className="review-category">
                      <h3>Lost Incidents ({analyticsData.diagnosticAnalytics.uncategorizedIncidents.lost})</h3>
                      <div className="review-items-list">
                        {analyticsData.diagnosticAnalytics.lostItems?.recentReports?.filter(r => r.cause === 'Unknown').length > 0 ? (
                          analyticsData.diagnosticAnalytics.lostItems.recentReports
                            .filter(r => r.cause === 'Unknown')
                            .map((item, index) => (
                              <div key={index} className="review-item">
                                <div className="review-item-header">
                                  <div className="review-item-name">{item.equipmentName}</div>
                                  <div className="review-item-date">{formatDate(item.date || item.timestamp)}</div>
                                </div>
                                <div className="review-item-details">
                                  <div className="review-item-meta">
                                    <span>Category: {item.categoryName}</span>
                                    <span>Borrower: {item.borrower}</span>
                                  </div>
                                  <div className="review-item-description">
                                    <strong>Description:</strong> {item.notes || 'No description provided'}
                                  </div>
                                </div>
                              </div>
                            ))
                        ) : (
                          <p className="no-data-text">No lost incidents to review</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Late Return Incidents */}
                  {analyticsData.diagnosticAnalytics.uncategorizedIncidents?.lateReturn > 0 && (
                    <div className="review-category">
                      <h3>Late Return Incidents ({analyticsData.diagnosticAnalytics.uncategorizedIncidents.lateReturn})</h3>
                      <p className="info-text" style={{ color: '#64748b', marginBottom: '16px' }}>
                        Late return incidents are categorized as "Unknown" when the reason text doesn't match our keyword patterns.
                      </p>
                      <div className="review-items-list">
                        {analyticsData.diagnosticAnalytics.lateReturns?.unknownItems?.length > 0 ? (
                          analyticsData.diagnosticAnalytics.lateReturns.unknownItems.map((item, index) => (
                            <div key={index} className="review-item">
                              <div className="review-item-header">
                                <div className="review-item-name">{item.equipmentName}</div>
                                <div className="review-item-date">{formatDate(item.returnDate || item.timestamp)}</div>
                              </div>
                              <div className="review-item-details">
                                <div className="review-item-meta">
                                  <span>Category: {item.categoryName}</span>
                                  <span>Borrower: {item.borrower}</span>
                                  <span>Days Late: {item.daysLate}</span>
                                </div>
                                <div className="review-item-description">
                                  <strong>Description:</strong> {item.notes || 'No description provided'}
                                </div>
                                <div className="review-item-meta" style={{ marginTop: '8px' }}>
                                  <span>Due Date: {formatDate(item.dueDate)}</span>
                                  <span>Return Date: {formatDate(item.returnDate || item.timestamp)}</span>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="no-data-text">
                            {analyticsData.diagnosticAnalytics.uncategorizedIncidents.lateReturn} late return incidents need review.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {analyticsData.diagnosticAnalytics.uncategorizedIncidents?.total === 0 && (
                    <div className="no-data-text">
                      <p>🎉 All incidents have been properly categorized!</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
