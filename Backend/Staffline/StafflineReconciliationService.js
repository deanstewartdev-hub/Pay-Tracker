/*******************************************************
 * PAY TRACKER V3.0
 * Backend/Staffline/StafflineReconciliationService.js
 *
 * Three-way reconciliation: Google Calendar shift -> Staffline
 * approved timesheet -> Payslip payment line.
 *
 * Nothing here is stored -- every call recomputes live from
 * CalendarSyncRepository, StafflineTimesheetRepository,
 * StafflinePaymentLineRepository and the Job Registry, the same
 * "nothing stored, nothing estimated" approach AnalyticsService.js
 * already uses. This keeps the view always current and avoids a
 * second place discrepancy data could go stale.
 *
 * Known, deliberate scope limit: Gmail approval emails carry a
 * timesheet's date range but never its submitted hours (the portal
 * itself was not reachable -- see docs/Changelog.md). "Calendar
 * expected hours" is therefore compared directly against "Payslip
 * paid hours"; Staffline's own role in this reconciliation is
 * existence + date-range + job classification, not an hours figure
 * of its own. HOURS_DIFFER in the Calendar<->Staffline vocabulary
 * is intentionally never produced for that reason -- it would have
 * to be fabricated.
 *******************************************************/

const PayTrackerStafflineReconciliationService = Object.freeze({
  /**
   * Full reconciliation rows for every Staffline-relevant job (any
   * job with a non-blank stafflineReferences), or one job when
   * jobId is given.
   *
   * @param {Object=} options {jobId}
   * @return {Object} {rows, generatedAt}
   */
  getReconciliation: function(options) {
    const request = options || {};
    const today = PayTrackerStafflineReconciliationService.startOfDay_(new Date());

    const jobs = PayTrackerJobRegistryRepository.getAll().filter(function(job) {
      if (request.jobId && job.jobId !== request.jobId) return false;
      return Boolean(String(job.stafflineReferences || '').trim());
    });

    const allShifts = PayTrackerCalendarSyncRepository.getActive();
    const allTimesheets = PayTrackerStafflineTimesheetRepository.getAll();
    const jobIds = jobs.map(function(job) { return job.jobId; });

    const relevantShifts = allShifts.filter(function(shift) { return jobIds.indexOf(shift.jobId) !== -1; });
    const relevantTimesheets = allTimesheets.filter(function(timesheet) {
      return jobIds.indexOf(timesheet.jobId) !== -1 || timesheet.classificationStatus === 'Needs Review';
    });

    const timesheetRows = relevantTimesheets.map(function(timesheet) {
      return PayTrackerStafflineReconciliationService.reconcileTimesheet_(timesheet, allShifts, today);
    });

    const missingRows = PayTrackerStafflineReconciliationService.findMissingFromStaffline_(
      relevantShifts, relevantTimesheets, jobs
    );

    const rows = timesheetRows.concat(missingRows).sort(function(left, right) {
      return String(right.weekEnding || '').localeCompare(String(left.weekEnding || ''));
    });

    return { rows: rows, generatedAt: new Date().toISOString() };
  },

  /**
   * Builds one reconciliation row anchored on a real Staffline
   * timesheet (it was approved -- the question is whether Calendar
   * agrees, and whether it was paid correctly).
   * @private
   */
  reconcileTimesheet_: function(timesheet, allShifts, today) {
    const inWindow = allShifts.filter(function(shift) {
      return PayTrackerStafflineReconciliationService.dateWithin_(
        shift.eventStart, timesheet.timesheetStart, timesheet.timesheetEnd
      );
    });
    const forJob = inWindow.filter(function(shift) { return shift.jobId === timesheet.jobId; });
    const forOtherJob = inWindow.filter(function(shift) { return shift.jobId !== timesheet.jobId; });
    const calendarHours = PayTrackerStafflineReconciliationService.sumHours_(forJob);

    const calendarStatus = PayTrackerStafflineReconciliationService.computeCalendarStatus_(
      timesheet, forJob, forOtherJob
    );

    const paymentLines = PayTrackerStafflinePaymentLineRepository.getByTimesheetReference(timesheet.timesheetId);
    const paidHours = PayTrackerStafflineReconciliationService.sumUnits_(paymentLines);
    const paidAmount = PayTrackerStafflineReconciliationService.sumAmount_(paymentLines);

    const paymentStatus = PayTrackerStafflineReconciliationService.computePaymentStatus_(
      timesheet, paymentLines, calendarHours
    );

    const discrepancyType = PayTrackerStafflineReconciliationService.computeDiscrepancyType_(
      calendarStatus, paymentStatus, timesheet, today
    );

    return {
      weekEnding: timesheet.timesheetEnd, jobId: timesheet.jobId || '', timesheetId: timesheet.timesheetId,
      stafflineStatus: timesheet.classificationStatus, calendarExpectedHours: calendarHours,
      stafflineSubmittedHours: null, payslipPaidHours: paymentLines.length ? paidHours : null,
      payslipPaidAmount: paymentLines.length ? paidAmount : null,
      calendarStatus: calendarStatus, paymentStatus: paymentStatus, discrepancyType: discrepancyType,
      payslipIds: PayTrackerStafflineReconciliationService.uniquePayslipIds_(paymentLines),
      calendarEventKeys: forJob.map(function(shift) { return shift.eventKey; }),
      gmailMessageId: timesheet.gmailMessageId, actionItemId: timesheet.actionItemId || '',
      reviewAction: PayTrackerStafflineReconciliationService.suggestReviewAction_(
        calendarStatus, paymentStatus, discrepancyType
      )
    };
  },

  /**
   * Calendar shifts for a Staffline-relevant job with no matching
   * timesheet at all (never approved, or approval not yet
   * imported) -- these have no timesheet row to anchor on, so they
   * are found by walking Calendar the other way, grouped by
   * (job, ISO week).
   * @private
   */
  findMissingFromStaffline_: function(shifts, timesheets, jobs) {
    const weeks = {};
    shifts.forEach(function(shift) {
      const weekEnding = PayTrackerStafflineReconciliationService.weekEndingOf_(shift.eventStart);
      if (!weekEnding) return;
      const key = shift.jobId + '|' + weekEnding;
      if (!weeks[key]) weeks[key] = { jobId: shift.jobId, weekEnding: weekEnding, shifts: [] };
      weeks[key].shifts.push(shift);
    });

    return Object.keys(weeks).filter(function(key) {
      const week = weeks[key];
      return !timesheets.some(function(timesheet) {
        return timesheet.jobId === week.jobId &&
          PayTrackerStafflineReconciliationService.dateWithin_(
            week.weekEnding, timesheet.timesheetStart, timesheet.timesheetEnd
          );
      });
    }).map(function(key) {
      const week = weeks[key];
      return {
        weekEnding: week.weekEnding, jobId: week.jobId, timesheetId: '',
        stafflineStatus: '', calendarExpectedHours: PayTrackerStafflineReconciliationService.sumHours_(week.shifts),
        stafflineSubmittedHours: null, payslipPaidHours: null, payslipPaidAmount: null,
        calendarStatus: 'Missing from Staffline', paymentStatus: 'Needs Review',
        discrepancyType: 'Timesheet Discrepancy', payslipIds: [],
        calendarEventKeys: week.shifts.map(function(shift) { return shift.eventKey; }),
        gmailMessageId: '', actionItemId: '',
        reviewAction: 'No Staffline approval email found for this week -- confirm the timesheet was submitted and approved.'
      };
    });
  },

  computeCalendarStatus_: function(timesheet, forJob, forOtherJob) {
    if (timesheet.classificationStatus === 'Needs Review') return 'Needs Review';
    if (!forJob.length && forOtherJob.length) return 'Job Mismatch';
    if (!forJob.length) return 'Extra on Staffline';
    return 'Match';
  },

  computePaymentStatus_: function(timesheet, paymentLines, calendarHours) {
    if (timesheet.classificationStatus === 'Needs Review') return 'Needs Review';
    if (!paymentLines.length) return 'Unpaid';

    const paidHours = PayTrackerStafflineReconciliationService.sumUnits_(paymentLines);
    if (!calendarHours) return 'Needs Review';

    const hoursMatch = Math.abs(paidHours - calendarHours) <= PayTrackerStafflineConfig.HOURS_TOLERANCE;
    const anyLineNeedsReview = paymentLines.some(function(line) {
      return line.validationStatus && line.validationStatus !== 'MATCHED';
    });

    if (hoursMatch && anyLineNeedsReview) return 'Wrong Rate';
    if (hoursMatch) return 'Paid';
    return paidHours < calendarHours ? 'Underpaid' : 'Overpaid';
  },

  /**
   * A week still inside a plausible payroll processing lag reads
   * as a timing issue (Delayed Payment), not yet a confirmed
   * payroll failure -- confirmed real-data lag was 5 days
   * (week ending 16/08/2026, paid 21/08/2026); 21 days is a
   * deliberately generous cutoff before treating an absence of
   * payment as a genuine underpayment worth chasing.
   */
  computeDiscrepancyType_: function(calendarStatus, paymentStatus, timesheet, today) {
    if (calendarStatus === 'Missing from Staffline' || calendarStatus === 'Extra on Staffline' ||
      calendarStatus === 'Job Mismatch') {
      return 'Timesheet Discrepancy';
    }
    if (paymentStatus === 'Unpaid') {
      const end = PayTrackerStafflineReconciliationService.toDate_(timesheet.timesheetEnd);
      const daysSinceEnd = end ? Math.round((today.getTime() - end.getTime()) / 86400000) : 0;
      return daysSinceEnd <= 21 ? 'Delayed Payment' : 'Payroll Underpayment';
    }
    if (paymentStatus === 'Underpaid' || paymentStatus === 'Overpaid' || paymentStatus === 'Wrong Rate') {
      return 'Payroll Underpayment';
    }
    return 'None';
  },

  suggestReviewAction_: function(calendarStatus, paymentStatus, discrepancyType) {
    if (discrepancyType === 'None') return '';
    if (calendarStatus === 'Missing from Staffline') return 'Confirm the timesheet was submitted on the Staffline portal.';
    if (calendarStatus === 'Extra on Staffline') return 'Add the missing shift to Calendar, or confirm it was worked.';
    if (calendarStatus === 'Job Mismatch') return 'Check whether this timesheet was approved under the wrong job.';
    if (calendarStatus === 'Needs Review') return 'Confirm which job this Staffline placement belongs to.';
    if (discrepancyType === 'Delayed Payment') return 'No action yet -- still within the normal payroll processing window.';
    if (paymentStatus === 'Unpaid') return 'Raise a Pay Adjustment -- no payslip line found for this timesheet.';
    if (paymentStatus === 'Underpaid') return 'Raise a Pay Adjustment for the missing hours.';
    if (paymentStatus === 'Overpaid') return 'Confirm the extra hours were genuinely worked.';
    if (paymentStatus === 'Wrong Rate') return 'Check the rate applied on the payslip against the expected rate.';
    return 'Review manually.';
  },

  sumHours_: function(shifts) {
    return PayTrackerStafflineReconciliationService.round_(
      shifts.reduce(function(sum, shift) { return sum + (Number(shift.hours) || 0); }, 0)
    );
  },
  sumUnits_: function(lines) {
    return PayTrackerStafflineReconciliationService.round_(
      lines.reduce(function(sum, line) { return sum + (Number(line.units) || 0); }, 0)
    );
  },
  sumAmount_: function(lines) {
    return PayTrackerStafflineReconciliationService.round_(
      lines.reduce(function(sum, line) { return sum + (Number(line.amount) || 0); }, 0)
    );
  },
  uniquePayslipIds_: function(lines) {
    const seen = {};
    const ids = [];
    lines.forEach(function(line) {
      const id = String(line.payslipId || '').trim();
      if (id && !seen[id]) { seen[id] = true; ids.push(id); }
    });
    return ids;
  },
  round_: function(value) { return Math.round((Number(value) || 0) * 100) / 100; },

  toDate_: function(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  },
  startOfDay_: function(date) {
    const copy = new Date(date.getTime());
    copy.setHours(0, 0, 0, 0);
    return copy;
  },
  dateWithin_: function(value, startValue, endValue) {
    const date = PayTrackerStafflineReconciliationService.toDate_(value);
    const start = PayTrackerStafflineReconciliationService.toDate_(startValue);
    const end = PayTrackerStafflineReconciliationService.toDate_(endValue);
    if (!date || !start || !end) return false;
    const dayKey = function(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
    return dayKey(date) >= dayKey(start) && dayKey(date) <= dayKey(end);
  },
  weekEndingOf_: function(value) {
    const date = PayTrackerStafflineReconciliationService.toDate_(value);
    if (!date) return '';
    // Staffline weeks run Mon-Sun; real data confirms "week ending" = Sunday.
    const copy = new Date(date.getTime());
    const day = copy.getDay(); // 0 = Sunday
    const daysUntilSunday = day === 0 ? 0 : 7 - day;
    copy.setDate(copy.getDate() + daysUntilSunday);
    const pad = function(v) { return v < 10 ? '0' + v : String(v); };
    return copy.getFullYear() + '-' + pad(copy.getMonth() + 1) + '-' + pad(copy.getDate());
  }
});
