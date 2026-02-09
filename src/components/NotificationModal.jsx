import React, { useState, useEffect } from "react";
import { ref, onValue, update } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { getNotificationRedirectDescription } from "../utils/navigationUtils";
import "../CSS/NotificationModal.css";

export default function NotificationModal({ isOpen, onClose, onRedirect }) {
  const { user, isLaboratoryManager, getAssignedLaboratoryIds } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, unread, read
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (!isOpen || !isLaboratoryManager()) return;

    const fetchNotifications = async () => {
      try {
        setLoading(true);
        const notificationsRef = ref(database, 'notifications');
        
        onValue(notificationsRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            const notificationList = Object.keys(data).map(key => ({
              id: key,
              ...data[key]
            }));

            // Filter notifications for this laboratory manager
            const assignedLabIds = getAssignedLaboratoryIds() || [];
            const filteredNotifications = notificationList.filter(notification => {
              // Check if notification is for this user or their assigned laboratories
              return notification.recipientUserId === user.uid || 
                     (notification.labId && Array.isArray(assignedLabIds) && assignedLabIds.includes(notification.labId));
            });

            // Sort by timestamp (newest first)
            filteredNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            setNotifications(filteredNotifications);
          } else {
            setNotifications([]);
          }
          setLoading(false);
        });
      } catch (error) {
        console.error("Error fetching notifications:", error);
        setLoading(false);
      }
    };

    fetchNotifications();

    // Add ESC key handler
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, user, isLaboratoryManager, getAssignedLaboratoryIds, onClose]);

  const markAsRead = async (notificationId) => {
    try {
      const notificationRef = ref(database, `notifications/${notificationId}`);
      await update(notificationRef, {
        isRead: true,
        readAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleNotificationClick = async (notification) => {
    // Mark as read if unread
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }

    // Determine where to redirect based on notification type
    let targetSection = 'dashboard'; // default fallback
    
    switch (notification.type) {
      case 'new_request':
      case 'request_approved':
      case 'request_rejected':
      case 'equipment_overdue':
        targetSection = 'request-forms';
        break;
      case 'equipment_returned':
        targetSection = 'history';
        break;
      case 'maintenance_due_today':
        targetSection = 'equipments';
        break;
      default:
        targetSection = 'dashboard';
        break;
    }

    // Close modal and redirect
    onClose();
    if (onRedirect) {
      onRedirect(targetSection);
    }
  };

  const clearNotifications = async () => {
    if (isClearing) return;
    try {
      setIsClearing(true);
      const assignedLabIds = getAssignedLaboratoryIds() || [];
      const updates = {};

      notifications.forEach(notification => {
        const isForUser = notification.recipientUserId === user.uid;
        const isForAssignedLab = notification.labId && Array.isArray(assignedLabIds) && assignedLabIds.includes(notification.labId);
        if (isForUser || isForAssignedLab) {
          updates[`notifications/${notification.id}`] = null;
        }
      });

      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
      }
    } catch (error) {
      console.error("Error clearing notifications:", error);
    } finally {
      setIsClearing(false);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(n => !n.isRead);
      const updates = {};
      
      unreadNotifications.forEach(notification => {
        updates[`notifications/${notification.id}/isRead`] = true;
        updates[`notifications/${notification.id}/readAt`] = new Date().toISOString();
      });

      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
      }
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
    }
  };

  // const getNotificationIcon = (type) => {
  //   switch (type) {
  //     case 'new_request':
  //       return '📋';
  //     case 'request_approved':
  //       return '✅';
  //     case 'request_rejected':
  //       return '❌';
  //     case 'equipment_returned':
  //       return '📦';
  //     case 'equipment_overdue':
  //       return '⚠️';
  //     default:
  //       return '🔔';
  //   }
  // };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'new_request':
        return '#3b82f6'; // blue
      case 'request_approved':
        return '#10b981'; // green
      case 'request_rejected':
        return '#ef4444'; // red
      case 'equipment_returned':
        return '#8b5cf6'; // purple
      case 'equipment_overdue':
        return '#f59e0b'; // orange
      default:
        return '#6b7280'; // gray
    }
  };

  const filteredNotifications = notifications.filter(notification => {
    if (filter === 'unread') return !notification.isRead;
    if (filter === 'read') return notification.isRead;
    return true; // all
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (!isOpen) return null;

  return (
    <div className="notification-overlay">
      <div className="notification-modal">
        <div className="notification-header">
          <h2>🔔 Notifications</h2>
          <div className="notification-controls">
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)}
              className="notification-filter"
            >
              <option value="all">All ({notifications.length})</option>
              <option value="unread">Unread ({unreadCount})</option>
              <option value="read">Read ({notifications.length - unreadCount})</option>
            </select>
            {unreadCount > 0 && (
              <button 
                className="mark-all-read-btn"
                onClick={markAllAsRead}
                title="Mark all as read"
              >
                Mark All Read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                className="clear-all-btn"
                onClick={clearNotifications}
                disabled={isClearing}
                title="Clear all notifications"
              >
                {isClearing ? 'Clearing…' : 'Clear All'}
              </button>
            )}
            <button 
              className="close-btn"
              onClick={onClose}
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="notification-content">
          {loading ? (
            <div className="loading">Loading notifications...</div>
          ) : filteredNotifications.length === 0 ? (
            <div className="no-notifications">
              <div className="no-notifications-icon">🔕</div>
              <p>No notifications found</p>
            </div>
          ) : (
            <div className="notification-list">
              {filteredNotifications.map((notification) => (
                <div 
                  key={notification.id} 
                  className={`notification-item ${notification.isRead ? 'read' : 'unread'} clickable`}
                  onClick={() => handleNotificationClick(notification)}
                  title={`Click to ${getNotificationRedirectDescription(notification.type)}`}
                >
                  {/* <div className="notification-icon" style={{ color: getNotificationColor(notification.type) }}>
                    {getNotificationIcon(notification.type)}
                  </div> */}
                  <div className="notification-body">
                    <div className="notification-title">{notification.title}</div>
                    <div className="notification-message">{notification.message}</div>
                    <div className="notification-meta">
                      <span className="notification-time">
                        {new Date(notification.timestamp).toLocaleString()}
                      </span>
                      {notification.labName && (
                        <span className="notification-lab">Lab: {notification.labName}</span>
                      )}
                    </div>
                  </div>
                  {!notification.isRead && <div className="unread-indicator"></div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
