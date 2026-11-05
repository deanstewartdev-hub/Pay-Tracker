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

  /** Job id for a pay table name (the calendar sync knows the table, not the job). Unknown tables return ''. */
  jobIdForTable: function(tableName) {
    return ({
      'NHS': 'JOB-NHS',
      'Relief Assistant Warden': 'JOB-RELIEF-WARDEN',
      'Night Security Warden': 'JOB-NIGHT-SECURITY',
      'Logging Cash': 'JOB-LOGGING-CASH'
    })[String(tableName || '')] || '';
  },

  /** Local calendar day of a Date as yyyy-mm-dd (same convention as the pay resolver). */
  dayKeyOf: function(date) {
    const pad = function(n) { return (n < 10 ? '0' : '') + n; };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  },

  /** Action Centre action type for a Calendar shift dated after a contract ended. */
  REVIEW_ACTION_TYPE: 'Post-contract Calendar shift',

  /**
   * The review item for a Calendar shift that is NOT written to PaySheet because its contract ended.
   * The item goes to the Action Centre queue only. It is keyed by the calendar event, so repeated syncs
   * produce one item. Nothing here is a pay row, and nothing is marked paid.
   */
  postContractReviewItem: function(input) {
    const i = input || {};
    const day = i.date ? this.dayKeyOf(i.date) : '';
    const hours = Number(i.hours) || 0;
    return {
      actionType: this.REVIEW_ACTION_TYPE,
      title: 'Calendar shift after a contract end: ' + String(i.tableName || '') + ' on ' + day,
      description: 'Calendar event "' + String(i.eventTitle || '').slice(0, 120) + '" on ' + day + ' (' + String(i.shiftType || '') +', ' + hours + ' hours) was NOT added to PaySheet, because the ' +
        String(i.tableName || '') + ' contract ended on ' + ((this.JOB_PERIODS[i.jobId] || [])[0] || {}).end + '. ' +
        'Decide whether it is a genuine shift (for example a reactivation or final work) and record it by hand if so. Nothing has been paid or changed.',
      priority: 'Normal',
      sourceType: 'Google Calendar',
      sourceId: String(i.eventKey || ''),
      confidence: 'Manual review required',
      suggestedResolution: 'Confirm with Staffline. Add the shift by hand only with a contract or payslip reason.'
    };
  },

  /**
   * Estimated monthly take-home from historical weeks (average week x 52 / 12).
   * weeks: [{takeHome, seasonalJobIds: [job ids whose shifts were worked that week]}].
   * A week is left out of the average once one of its seasonal jobs has ENDED as of todayKey,
   * so earnings from a finished contract are not projected forward. Before the end, every week counts,
   * as before. Returns 0 when no usable week exists (no evidence, so no estimate).
   */
  forecastTakeHome: function(weeks, todayKey) {
    const list = Array.isArray(weeks) ? weeks : [];
    const usable = list.filter((week) => {
      return !(week.seasonalJobIds || []).some((jobId) => !this.forecastAllowed(jobId, todayKey));
    });
    if (usable.length === 0) return 0;
    const total = usable.reduce((sum, week) => sum + (Number(week.takeHome) || 0), 0);
    return total / usable.length * 52 / 12;
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

  // Pay tables whose classification is not yet verified. Their values are kept, but the automatic
  // minimum-wage check does not apply until the owner confirms what the table represents.
  UNVERIFIED_CLASSIFICATION: Object.freeze({
    'Logging Cash': 'Unverified: may be a real hourly employment rate, a cash-earnings category, or a fixed payment for logging work. Owner to classify.'
  }),

  /** The automatic minimum-wage check applies only to tables with a verified classification. */
  minimumCheckApplies: function(tableName) {
    return !Object.prototype.hasOwnProperty.call(this.UNVERIFIED_CLASSIFICATION, String(tableName || ''));
  },

  /** True when an hourly rate is below the minimum in force on dayKey. Unknown minimum: not flagged. */
  belowMinimum: function(hourlyRate, dayKey) {
    const minimum = this.minimumWageOn(dayKey);
    const rate = Number(hourlyRate);
    if (minimum === null || !isFinite(rate)) return false;
    return rate < minimum;
  }
});
