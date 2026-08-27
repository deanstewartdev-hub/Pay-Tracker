/*******************************************************
 * PAY TRACKER V3.1 - Staffline Timesheet Details.
 *
 * One row per Timesheet ID, sourced from the real Staffline
 * candidate portal (https://portalni.stafflineni.co.uk), read-only.
 *
 * Why this exists and how it's populated:
 * Apps Script cannot authenticate to the Staffline portal on its
 * own -- there is no API, and no Staffline password is ever stored
 * (see docs/VERSION.md and the Phase 3 safety rules). The only way
 * to see a real timesheet's submitted detail is a real, already
 * logged-in browser session -- someone (a human, or an assistant
 * driving a browser on the user's behalf, always read-only) opens
 * the real portal page and calls importDetail() with exactly what
 * that page showed. This is why import here is a deliberate,
 * one-record-at-a-time call, never an automated "scan" the way
 * Gmail import is -- there is nothing to schedule.
 *
 * What the real portal reliably exposes (confirmed against 5 real
 * timesheets, Aug 2026) vs. what it does not:
 * - RELIABLE: "Total Hours/Days" (a header-level total for the
 *   whole timesheet), the distinct Rate/enhancement categories
 *   used (e.g. "Basic", "Enhanced 1.33", "HSC Unsoc: M-F 8pm-6am &
 *   Sat"), and a status History with dated Submitted/Approved
 *   entries and the approver's name. All confirmed to exactly
 *   match the corresponding real payslip's totals.
 * - NOT reliably scrapable: the individual per-day Hours/Days grid
 *   (date, start time, end time, break, per-row units worked) is
 *   rendered by client-side JS behind several async data-bound
 *   dropdowns; the row-level "Units Worked" values were observed
 *   to sometimes read as 0 shortly after the page loads even
 *   though the header total was already correct. Rather than
 *   import unreliable per-day numbers, this repository stores only
 *   what was consistently correct -- the honest position is a
 *   timesheet-level total, not a fabricated daily breakdown.
 *******************************************************/

const PayTrackerStafflineTimesheetDetailRepository = Object.freeze({
  getAll: function() {
    const sheet = this.getSheet();
    const headers = PayTrackerStafflineConfig.SHEETS.STAFFLINE_TIMESHEET_DETAILS.HEADERS;
    if (sheet.getLastRow() <= 1) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length)
      .getValues().map(function(row, index) {
        const record = { rowNumber: index + 2 };
        headers.forEach(function(header, column) {
          record[PayTrackerJobRegistryRepository.toKey(header)] = row[column];
        });
        return record;
      }).filter(function(record) { return Boolean(record.timesheetId); });
  },

  getByTimesheetId: function(timesheetId) {
    const target = PayTrackerStafflineConfig.normalizeReference(timesheetId);
    if (!target) return null;
    return this.getAll().filter(function(record) {
      return PayTrackerStafflineConfig.normalizeReference(record.timesheetId) === target;
    })[0] || null;
  },

  /**
   * Creates or updates one timesheet's real portal detail. Manual
   * corrections (Manual Override checked) are never overwritten by
   * a later import -- the same rule every other Phase 3 ledger
   * follows for re-imports.
   *
   * @param {Object} input {timesheetId, submittedHours, rateUnit,
   *   rateCategories (array), portalStatus, submittedDate,
   *   approvedDate, approvedBy, sourceUrl, notes}.
   * @return {Object} Saved record.
   */
  importDetail: function(input) {
    const value = input || {};
    const timesheetId = PayTrackerStafflineConfig.normalizeReference(value.timesheetId);
    if (!timesheetId) throw new Error('Staffline timesheet details require a Timesheet ID.');

    const sheet = this.getSheet();
    const existing = this.getByTimesheetId(timesheetId);

    if (existing && existing.manualOverride === true) {
      return existing;
    }

    const rateCategories = Array.isArray(value.rateCategories)
      ? value.rateCategories.join('; ')
      : String(value.rateCategories || '');

    const now = new Date();
    const row = [
      timesheetId,
      value.submittedHours === undefined || value.submittedHours === null ? '' : value.submittedHours,
      value.rateUnit || '', rateCategories, value.portalStatus || '',
      value.submittedDate || '', value.approvedDate || '', value.approvedBy || '',
      value.source || 'Staffline Portal (manual read-only import)',
      value.sourceUrl || '', now, false, value.notes || ''
    ];

    if (existing) {
      sheet.getRange(existing.rowNumber, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
    return this.getByTimesheetId(timesheetId);
  },

  /**
   * Marks a record as manually corrected so future imports leave it
   * alone. Does not otherwise change the row.
   *
   * @param {string} timesheetId Timesheet ID.
   * @param {Object=} changes Optional field overrides to apply at
   *   the same time.
   * @return {Object} Updated record.
   */
  setManualOverride: function(timesheetId, changes) {
    const existing = this.getByTimesheetId(timesheetId);
    if (!existing) throw new Error('Unknown Staffline timesheet detail: ' + timesheetId);
    const sheet = this.getSheet();
    const headers = PayTrackerStafflineConfig.SHEETS.STAFFLINE_TIMESHEET_DETAILS.HEADERS;
    const merged = Object.assign({}, existing, changes || {}, { manualOverride: true });
    const self = this;
    headers.forEach(function(header, index) {
      const key = PayTrackerJobRegistryRepository.toKey(header);
      if (key === 'manualOverride') {
        sheet.getRange(existing.rowNumber, index + 1).setValue(true);
      } else if (Object.prototype.hasOwnProperty.call(merged, key)) {
        sheet.getRange(existing.rowNumber, index + 1).setValue(merged[key]);
      }
    });
    return this.getByTimesheetId(timesheetId);
  },

  getSheet: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const definition = PayTrackerStafflineConfig.SHEETS.STAFFLINE_TIMESHEET_DETAILS;
    let sheet = spreadsheet && spreadsheet.getSheetByName(definition.NAME);
    if (!sheet) {
      PayTrackerStafflineSetupService.setup();
      sheet = spreadsheet.getSheetByName(definition.NAME);
    }
    return sheet;
  }
});
