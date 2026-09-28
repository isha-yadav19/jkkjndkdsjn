// Push Notification Service for IMD Critical Weather Warnings
export interface CriticalAlertPayload {
  title: string;
  message: string;
  severity: 'red' | 'orange' | 'yellow';
  category: 'cyclone' | 'rain' | 'heatwave' | 'fog' | 'aqi' | 'thunderstorm';
  issuedAt: string;
}

const NOTIFICATION_KEY = 'mausam_push_notifications_enabled';
const ALERT_LEVEL_KEY = 'mausam_alert_severity_threshold';

export class PushNotificationManager {
  private static swRegistration: ServiceWorkerRegistration | null = null;

  // Initialize service worker registration
  public static async init(): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      this.swRegistration = reg;
      console.log('Mausam Service Worker registered with scope:', reg.scope);
    } catch (err) {
      console.warn('Service worker registration failed:', err);
    }
  }

  // Check if browser supports notifications
  public static isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  // Get current permission status
  public static getPermission(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  // Check if notifications are enabled by user in settings
  public static isEnabled(): boolean {
    if (!this.isSupported()) return false;
    return this.getPermission() === 'granted' && localStorage.getItem(NOTIFICATION_KEY) !== 'false';
  }

  // Request browser notification permission
  public static async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        localStorage.setItem(NOTIFICATION_KEY, 'true');
        return true;
      } else {
        localStorage.setItem(NOTIFICATION_KEY, 'false');
        return false;
      }
    } catch (err) {
      console.warn('Error requesting notification permission:', err);
      return false;
    }
  }

  // Toggle user preference
  public static setEnabled(enabled: boolean): void {
    localStorage.setItem(NOTIFICATION_KEY, enabled ? 'true' : 'false');
  }

  // Set minimum severity threshold: 'red' (red only) or 'orange' (red & orange)
  public static setSeverityThreshold(threshold: 'red' | 'orange'): void {
    localStorage.setItem(ALERT_LEVEL_KEY, threshold);
  }

  public static getSeverityThreshold(): 'red' | 'orange' {
    return (localStorage.getItem(ALERT_LEVEL_KEY) as 'red' | 'orange') || 'orange';
  }

  // Send a native system notification for severe weather
  public static async sendCriticalAlert(alert: CriticalAlertPayload): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    const threshold = this.getSeverityThreshold();
    if (threshold === 'red' && alert.severity !== 'red') {
      return false; // Skip orange if user wants red only
    }

    const title = `${alert.severity === 'red' ? '🚨 RED ALERT' : '⚠️ ORANGE ALERT'}: ${alert.title}`;
    const options: any = {
      body: `${alert.message}\nIssued: ${alert.issuedAt}`,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: `imd-alert-${alert.category}-${Date.now()}`,
      renotify: true,
      requireInteraction: alert.severity === 'red',
      vibrate: [300, 150, 300, 150, 450],
      data: {
        severity: alert.severity,
        category: alert.category,
        url: '/'
      }
    };

    // Prefer service worker showNotification for native background integration
    try {
      if (this.swRegistration) {
        await this.swRegistration.showNotification(title, options);
        return true;
      } else if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, options);
        return true;
      } else {
        // Fallback to standard Window Notification
        new Notification(title, options);
        return true;
      }
    } catch (err) {
      console.warn('Failed to send notification via service worker, trying fallback:', err);
      try {
        new Notification(title, options);
        return true;
      } catch {
        return false;
      }
    }
  }

  // Send a test critical alert to verify notifications work
  public static async sendTestNotification(): Promise<boolean> {
    const granted = await this.requestPermission();
    if (!granted) return false;

    return this.sendCriticalAlert({
      title: 'IMD Coastal Warning System Test',
      message: 'Severe squally weather test broadcast. High wind speeds & coastal alert simulated successfully.',
      severity: 'red',
      category: 'cyclone',
      issuedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  }
}
