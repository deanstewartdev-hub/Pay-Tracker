/*******************************************************
 * PAY TRACKER V3.3 - Employment periods and National Living Wage (pure)
 * Reads nothing and writes nothing. It answers two questions:
 *  - Is a job active on a day? (used to decide whether FUTURE regular shifts are forecast)
 *  - Is an hourly rate below the National Living Wage (21 and over) on a day?
 *
 * Rules:
 *  - A job with no periods listed is always active (ongoing roles, e.g. NHS).
 *  - A job with periods is active only on days inside one of them. A period with a null start
 *    is open from the beginning; a null end is open-ended.
 *  - Ended contracts keep their history: reactivation adds a new period, it never deletes one.
 *  - Recording pay that has already been earned (final wages, adjustments, holiday pay) is NOT
 *    gated by the employment period. Only forecasting of future regular shifts is.
 *  - Days are calendar days (yyyy-mm-dd, Europe/London).
 *******************************************************/
const PayTrackerEmploymentPeriods = Object.freeze({
  // Minimum hourly rate for workers aged 21 and over, by the day it took effect.
  NATIONAL_LIVING_WAGE: Object.freeze([
    Object.freeze({ effectiveFrom: '2025-04-01', hourly: 12.21 }),
    Object.freeze({ effectiveFrom: '2026-04-01', hourly: 12.71 })
  ]),

  // Contract periods by job id. Night Security and Relief Warden were seasonal and ended 31 Oct 2026.
  JOB_PERIODS: Object.freeze({
    'JOB-NIGHT-SECURITY': Object.freeze([
      Object.freeze({ start: null, end: '2026-10-31', note: 'Seasonal contract ended 31 Oct 2026' })
    ]),
    'JOB-RELIEF-WARDEN': Object.freeze([
      Object.freeze({ start: null, end: '2026-10-31', note: 'Seasonal contract ended 31 Oct 2026' })
    ])
  }),

  /** True when dayKey (yyyy-mm-dd) falls inside any period. No periods means always active. */
  isActiveOn: function(periods, dayKey) {
    if (!periods || periods.length === 0) return true;
    return periods.some(function(period) {
      return (!period.start || dayKey >= period.start) && (!period.end || dayKey <= period.end);
    });
  },

  /** Forecast a regular shift for this job on this day? Only true inside an active period. */
  forecastAllowed: function(jobId, dayKey) {
    return this.isActiveOn((this.JOB_PERIODS || {})[jobId] || [], dayKey);
  },

  /** Recording pay already earned is never blocked by the employment period. */
  recordingAllowed: function() {
    return true;
  },

  /** The National Living Wage (21+) in force on dayKey. */
  minimumWageOn: function(dayKey) {
    const applicable = this.NATIONAL_LIVING_WAGE.filter(function(entry) {
      return entry.effectiveFrom <= dayKey;
    });
    return applicable.length ? applicable[applicable.length - 1].hourly : null;
  },

  /** True when an hourly rate is below the minimum in force on dayKey. Unknown minimum: not flagged. */
  belowMinimum: function(hourlyRate, dayKey) {
    const minimum = this.minimumWageOn(dayKey);
    const rate = Number(hourlyRate);
    if (minimum === null || !isFinite(rate)) return false;
    return rate < minimum;
  }
});
