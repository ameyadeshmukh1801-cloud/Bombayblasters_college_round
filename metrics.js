/**
 * metrics.js - Shared Telemetry & Evaluation Metrics Store
 * Provides persistent event logging for command recovery flows,
 * interaction accuracy, latency tracking, and session diagnostics.
 */

export class SharedMetricsStore {
  constructor() {
    this.events = [];
    this.listeners = new Set();
    this.initStorage();
  }

  initStorage() {
    try {
      const saved = sessionStorage.getItem('handsfree_metrics_events');
      if (saved) {
        this.events = JSON.parse(saved);
      }
    } catch (e) {
      this.events = [];
    }
  }

  saveStorage() {
    try {
      sessionStorage.setItem('handsfree_metrics_events', JSON.stringify(this.events.slice(-200)));
    } catch (e) {
      // storage unavailable or full
    }
  }

  /**
   * Log an event with an explicit timestamp and structured metadata
   * @param {string} eventType - 'misheard' | 'corrected' | 'dismissed' | custom
   * @param {Object} details - Additional event details
   * @returns {Object} The recorded entry
   */
  logEvent(eventType, details = {}) {
    const entry = {
      type: eventType,
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      ...details
    };

    this.events.push(entry);
    this.saveStorage();
    this.notifyListeners(entry);

    console.log(`[MetricsStore] Event logged (${eventType}):`, entry);
    return entry;
  }

  /**
   * Retrieve logged events, optionally filtered by type
   * @param {string|null} type
   * @returns {Array<Object>}
   */
  getEvents(type = null) {
    if (!type) return [...this.events];
    return this.events.filter(e => e.type === type);
  }

  /**
   * Clear all stored events
   */
  clear() {
    this.events = [];
    this.saveStorage();
  }

  /**
   * Subscribe to new log entries
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(entry) {
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (err) {
        console.error('Error in metrics listener:', err);
      }
    }
  }
}

// Global shared singleton instance
export const metricsStore = new SharedMetricsStore();

if (typeof window !== 'undefined') {
  window.handsfreeMetricsStore = metricsStore;
}

/**
 * Convenience helper to log command-recovery events
 * @param {string} eventType - 'misheard' | 'corrected' | 'dismissed'
 * @param {Object} details
 */
export function logRecoveryEvent(eventType, details = {}) {
  return metricsStore.logEvent(eventType, details);
}

/**
 * Retrieve recovery-specific metrics breakdown
 */
export function getRecoveryMetrics() {
  return {
    misheard: metricsStore.getEvents('misheard'),
    corrected: metricsStore.getEvents('corrected'),
    dismissed: metricsStore.getEvents('dismissed'),
    all: metricsStore.getEvents()
  };
}
