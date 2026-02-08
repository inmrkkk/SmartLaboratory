/**
 * Navigation utilities for SmartLaboratory application
 */

/**
 * Determines the appropriate section to navigate to based on notification type
 * @param {string} notificationType - The type of notification
 * @returns {string} - The section key to navigate to
 */
export const getNotificationRedirectSection = (notificationType) => {
  const redirectMap = {
    'new_request': 'request-forms',
    'request_approved': 'request-forms',
    'request_rejected': 'request-forms',
    'equipment_overdue': 'request-forms',
    'equipment_returned': 'history',
    'maintenance_due_today': 'equipments'
  };

  return redirectMap[notificationType] || 'dashboard';
};

/**
 * Gets a user-friendly description of where a notification will redirect
 * @param {string} notificationType - The type of notification
 * @returns {string} - Description of the redirect destination
 */
export const getNotificationRedirectDescription = (notificationType) => {
  const descriptionMap = {
    'new_request': 'View request forms',
    'request_approved': 'View request forms',
    'request_rejected': 'View request forms',
    'equipment_overdue': 'View request forms',
    'equipment_returned': 'View history',
    'maintenance_due_today': 'View equipment'
  };

  return descriptionMap[notificationType] || 'Go to dashboard';
};
