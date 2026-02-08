import { getNotificationRedirectSection, getNotificationRedirectDescription } from '../navigationUtils';

describe('Navigation Utils', () => {
  describe('getNotificationRedirectSection', () => {
    test('should return correct section for new_request', () => {
      expect(getNotificationRedirectSection('new_request')).toBe('request-forms');
    });

    test('should return correct section for request_approved', () => {
      expect(getNotificationRedirectSection('request_approved')).toBe('request-forms');
    });

    test('should return correct section for request_rejected', () => {
      expect(getNotificationRedirectSection('request_rejected')).toBe('request-forms');
    });

    test('should return correct section for equipment_overdue', () => {
      expect(getNotificationRedirectSection('equipment_overdue')).toBe('request-forms');
    });

    test('should return correct section for equipment_returned', () => {
      expect(getNotificationRedirectSection('equipment_returned')).toBe('history');
    });

    test('should return correct section for maintenance_due_today', () => {
      expect(getNotificationRedirectSection('maintenance_due_today')).toBe('equipments');
    });

    test('should return dashboard for unknown notification type', () => {
      expect(getNotificationRedirectSection('unknown_type')).toBe('dashboard');
    });
  });

  describe('getNotificationRedirectDescription', () => {
    test('should return correct description for new_request', () => {
      expect(getNotificationRedirectDescription('new_request')).toBe('View request forms');
    });

    test('should return correct description for equipment_returned', () => {
      expect(getNotificationRedirectDescription('equipment_returned')).toBe('View history');
    });

    test('should return correct description for maintenance_due_today', () => {
      expect(getNotificationRedirectDescription('maintenance_due_today')).toBe('View equipment');
    });

    test('should return dashboard description for unknown notification type', () => {
      expect(getNotificationRedirectDescription('unknown_type')).toBe('Go to dashboard');
    });
  });
});
