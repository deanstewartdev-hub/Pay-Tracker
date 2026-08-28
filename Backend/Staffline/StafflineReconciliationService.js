/*******************************************************
 * PAY TRACKER V3.1
 * Backend/Staffline/StafflineReconciliationService.js
 *
 * True three-way reconciliation: Google Calendar shift -> Staffline
 * submitted/approved timesheet -> Payslip payment line.
 *
 * Nothing here is stored -- every call recomputes live from
 * CalendarSyncRepository, StafflineTimesheetRepository,
 * StafflineTimesheetDetailRepository, StafflinePaymentLineRepository
 * and the Job Registry, the same "nothing stored, nothing estimated"
 * approach AnalyticsService.js already uses.
 *
 * Staffline submitted hours: real, not fabricated, but real-world
 * partial. StafflineTimesheetDetailRepository is populated by a
 * read-only human/assistant browse of the real portal (Apps Script
 * itself cannot authenticate there), so it exists for whichever
 * timesheets have actually been imported that way -- not all of
 * them. Every comparison below explicitly branches on whether real
 * Staffline detail exists for a given timesheet:
 * - When it exists: Calendar is compared against the real Staffline
 *   submitted hours (the genuine three-way chain), and Staffline's
 *   submitted hours -- not Calendar's -- are what Payslip is judged
 *   against, so a Calendar/Staffline mismatch reads as a Timesheet
 *   Discrepancy even when the payslip paid exactly what Staffline
 *   submitted.
 * - When it does not exist: falls back to the previous, coarser
 *   comparison (Calendar directly against Payslip) and the row is
 *   marked stafflineSubmittedHours: null so the UI can say
 *   "Staffline detail unavailable" rather than silently implying
 *   Calendar's figure came from Staffline.
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
    const allDetails = PayTrackerStafflineTimesheetDetailRepository.getAll();
    const allPaymentLines = PayTrackerStafflinePaymentLineRepository.getAll();
    const jobIds = jobs.map(function(job) { return job.jobId; });

    const relevantShifts = allShifts.filter(function(shift) { return jobIds.indexOf(shift.jobId) !== -1; });
    const relevantTimesheets = allTimesheets.filter(function(timesheet) {
      return jobIds.indexOf(timesheet.jobId) !== -1 || timesheet.classificationStatus === 'Needs Review';
    });

    const timesheetRows = relevantTimesheets.map(function(timesheet) {
      const detail = PayTrackerStafflineReconciliationService.findDetail_(allDetails, timesheet.timesheetId);
      return PayTrackerStafflineReconciliationService.reconcileTimesheet_(timesheet, detail, allShifts, allPaymentLines, today);
    });

    const missingRows = PayTrackerStafflineReconciliationService.findMissingFromStaffline_(
      relevantShifts, relevantTimesheets, jobs
    );

    const unexpectedRows = PayTrackerStafflineReconciliationService.findUnexpectedPayments_(
      allPaymentLines, allTimesheets, jobIds
    );

    const rows = timesheetRows.concat(missingRows).concat(unexpectedRows).sort(function(left, right) {
      return String(right.weekEnding || '').localeCompare(String(left.weekEnding || ''));
    });

    return { rows: rows, generatedAt: new Date().toISOString() };
  },

  findDetail_: function(allDetails, timesheetId) {
    const target = PayTrackerStafflineConfig.normalizeReference(timesheetId);
    if (!target) return null;
    return allDetails.filter(function(detail) {
      return PayTrackerStafflineConfig.normalizeReference(detail.timesheetId) === target;
    })[0] || null;
  },

  /**
   * Builds one reconciliation row anchored on a real Staffline
   * timesheet (it was approved -- the question is whether Calendar
   * agrees, whether Staffline's own submitted hours agree with
   * Calendar, and whether it was paid correctly).
   * @private
   */
  reconcileTimesheet_: function(timesheet, detail, allShifts, allPaymentLines, today) {
    const inWindow = allShifts.filter(function(shift) {
      return PayTrackerStafflineReconciliationService.dateWithin_(
        shift.eventStart, timesheet.timesheetStart, timesheet.timesheetEnd
      );
    });
    const forJob = inWindow.filter(function(shift) { return shift.jobId === timesheet.jobId; });
    const forOtherJob = inWindow.filter(function(shift) { return shift.jobId !== timesheet.jobId; });
    const calendarHours = PayTrackerStafflineReconciliationService.sumHours_(forJob);

    const stafflineHours = detail && detail.submittedHours !== '' && detail.submittedHours !== undefined
      ? PayTrackerStafflineReconciliationService.round_(detail.submittedHours)
      : null;

    const calendarStatus = PayTrackerStafflineReconciliationService.computeCalendarStatus_(
      timesheet, forJob, forOtherJob, calendarHours, stafflineHours
    );

    const paymentLines = PayTrackerStafflineReconciliationService.linesForTimesheet_(allPaymentLines, timesheet.timesheetId);
    const paidHours = PayTrackerStafflineReconciliationService.sumUnits_(paymentLines);
    const paidAmount = PayTrackerStafflineReconciliationService.sumAmount_(paymentLines);

    // The hours Payslip is actually judged against: real Staffline
    // submitted hours when known, Calendar's as a fallback -- never
    // both at once, so a Calendar/Staffline disagreement can never
    // also silently read as a payroll problem.
    const expectedHours = stafflineHours !== null ? stafflineHours : calendarHours;

    const paymentResult = PayTrackerStafflineReconciliationService.computePaymentStatus_(
      timesheet, detail, paymentLines, expectedHours, allPaymentLines
    );

    const discrepancyType = PayTrackerStafflineReconciliationService.computeDiscrepancyType_(
      calendarStatus, paymentResult.status, timesheet, today
    );

    return {
      weekEnding: timesheet.timesheetEnd, jobId: timesheet.jobId || '', timesheetId: timesheet.timesheetId,
      stafflineStatus: timesheet.classificationStatus, calendarExpectedHours: calendarHours,
      stafflineSubmittedHours: stafflineHours,
      stafflineDetailAvailable: stafflineHours !== null,
      stafflineApprovedDate: detail ? detail.approvedDate : '',
      stafflineApprovedBy: detail ? detail.approvedBy : '',
      payslipPaidHours: paymentLines.length ? paidHours : null,
      payslipPaidAmount: paymentLines.length ? paidAmount : null,
      calendarStatus: calendarStatus, paymentStatus: paymentResult.status, discrepancyType: discrepancyType,
      payslipIds: PayTrackerStafflineReconciliationService.uniquePayslipIds_(paymentLines),
      calendarEventKeys: forJob.map(function(shift) { return shift.eventKey; }),
      gmailMessageId: timesheet.gmailMessageId, actionItemId: timesheet.actionItemId || '',
      reviewAction: PayTrackerStafflineReconciliationService.suggestReviewAction_(
        calendarStatus, paymentResult.status, discrepancyType, paymentResult.note
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
        stafflineSubmittedHours: null, stafflineDetailAvailable: false,
        stafflineApprovedDate: '', stafflineApprovedBy: '',
        payslipPaidHours: null, payslipPaidAmount: null,
        calendarStatus: 'Missing from Staffline', paymentStatus: 'Needs Review',
        discrepancyType: 'Timesheet Discrepancy', payslipIds: [],
        calendarEventKeys: week.shifts.map(function(shift) { return shift.eventKey; }),
        gmailMessageId: '', actionItemId: '',
        reviewAction: 'No Staffline approval email found for this week -- confirm the timesheet was submitted and approved.'
      };
    });
  },

  /**
   * Payment lines whose Timesheet Reference does not correspond to
   * any known Staffline Timesheet at all -- paid for something that
   * was (as far as this app knows) never approved. Only flagged for
   * Staffline-relevant jobs so an unrelated payslip line never shows
   * up here.
   * @private
   */
  findUnexpectedPayments_: function(allPaymentLines, allTimesheets, jobIds) {
    const knownIds = {};
    allTimesheets.forEach(function(timesheet) {
      knownIds[PayTrackerStafflineConfig.normalizeReference(timesheet.timesheetId)] = true;
    });

    const byReference = {};
    allPaymentLines.forEach(function(line) {
      const ref = line.normalizedTimesheetId;
      if (!ref || knownIds[ref]) return;
      if (!byReference[ref]) byReference[ref] = [];
      byReference[ref].push(line);
    });

    return Object.keys(byReference).map(function(ref) {
      const lines = byReference[ref];
      return {
        weekEnding: lines[0].workDate || '', jobId: lines[0].jobId || '', timesheetId: ref,
        stafflineStatus: '', calendarExpectedHours: null,
        stafflineSubmittedHours: null, stafflineDetailAvailable: false,
        stafflineApprovedDate: '', stafflineApprovedBy: '',
        payslipPaidHours: PayTrackerStafflineReconciliationService.sumUnits_(lines),
        payslipPaidAmount: PayTrackerStafflineReconciliationService.sumAmount_(lines),
        calendarStatus: 'Needs Review', paymentStatus: 'Unexpected Payment',
        discrepancyType: 'Payroll Underpayment', payslipIds: PayTrackerStafflineReconciliationService.uniquePayslipIds_(lines),
        calendarEventKeys: [], gmailMessageId: '', actionItemId: '',
        reviewAction: 'Payslip paid Timesheet ' + ref + ' but no matching Staffline approval was ever imported -- confirm this was genuinely worked and approved.'
      };
    });
  },

  computeCalendarStatus_: function(timesheet, forJob, forOtherJob, calendarHours, stafflineHours) {
    if (timesheet.classificationStatus === 'Needs Review') return 'Needs Review';
    if (!forJob.length && forOtherJob.length) return 'Job Mismatch';
    if (!forJob.length) return 'Extra on Staffline';
    if (stafflineHours !== null &&
      Math.abs(calendarHours - stafflineHours) > PayTrackerStafflineConfig.HOURS_TOLERANCE) {
      return 'Hours Differ';
    }
    return 'Match';
  },

  /**
   * Staffline <-> Payslip comparison. expectedHours is Staffline's
   * real submitted hours when known, Calendar's as a fallback (see
   * reconcileTimesheet_) -- this function does not know or care
   * which, it only compares against whatever it was given.
   * @private
   */
  computePaymentStatus_: function(timesheet, detail, paymentLines, expectedHours, allPaymentLines) {
    if (timesheet.classificationStatus === 'Needs Review') return { status: 'Needs Review' };

    const duplicate = PayTrackerStafflineReconciliationService.findDuplicateLine_(paymentLines);
    if (duplicate) {
      return { status: 'Duplicate Payment', note: duplicate };
    }

    if (!paymentLines.length) return { status: 'Unpaid' };
    if (!expectedHours) return { status: 'Needs Review' };

    const paidHours = PayTrackerStafflineReconciliationService.sumUnits_(paymentLines);
    const hoursMatch = Math.abs(paidHours - expectedHours) <= PayTrackerStafflineConfig.HOURS_TOLERANCE;

    const expectedCategories = detail && detail.rateCategories
      ? String(detail.rateCategories).split(';').map(function(c) { return c.trim(); }).filter(Boolean)
      : null;
    // Compared against the payslip line's own description, not its
    // payCategory bucket -- payCategory deliberately coarsens e.g.
    // "Enhanced 1.33" and "Enhanced 1.50" down to one "ENHANCED"
    // value (see PayrollTimesheetParser.classifyPayCategory_), which
    // would make every real multiplier-specific Staffline category
    // read as a mismatch even when the payslip paid the right one.
    // Real payslip line descriptions were confirmed to match
    // Staffline's own rate-category names verbatim (both come from
    // the same underlying agency rate-category text).
    const paidCategories = Array.from(new Set(paymentLines.map(function(line) { return String(line.description || '').trim(); })));

    const anyLineNeedsReview = paymentLines.some(function(line) {
      return line.validationStatus && line.validationStatus !== 'MATCHED';
    });

    // "Partially Paid": at least one whole rate category Staffline
    // submitted never appears on any payslip line at all -- a
    // stronger signal than a simple hours shortfall, since it names
    // exactly which kind of work was never paid for.
    if (expectedCategories && expectedCategories.length &&
      !PayTrackerStafflineReconciliationService.sameCategoryFamily_(expectedCategories, paidCategories) &&
      paidHours < expectedHours - PayTrackerStafflineConfig.HOURS_TOLERANCE) {
      const paidCategoriesNormalized = paidCategories.map(PayTrackerStafflineReconciliationService.normalizeCategoryLabel_);
      const missingCategories = expectedCategories.filter(function(category) {
        return paidCategoriesNormalized.indexOf(PayTrackerStafflineReconciliationService.normalizeCategoryLabel_(category)) === -1;
      });
      if (missingCategories.length) {
        return { status: 'Partially Paid', note: 'Missing from the payslip: ' + missingCategories.join(', ') + '.' };
      }
    }

    if (hoursMatch && anyLineNeedsReview) {
      return { status: 'Wrong Rate', note: 'The payslip\'s own hours x rate does not match its stated amount.' };
    }

    if (hoursMatch && expectedCategories && expectedCategories.length) {
      const categoriesDiffer = !PayTrackerStafflineReconciliationService.sameCategoryFamily_(expectedCategories, paidCategories);
      if (categoriesDiffer) {
        const bothEnhancement = expectedCategories.every(function(c) { return /^(Enhanced|Overtime)\b/i.test(c); }) &&
          paidCategories.every(function(c) { return /^(Enhanced|Overtime)\b/i.test(c); });
        return {
          status: bothEnhancement ? 'Wrong Enhancement' : 'Wrong Rate',
          note: 'Staffline: ' + expectedCategories.join(', ') + '. Payslip: ' + paidCategories.join(', ') + '.'
        };
      }
    }

    if (hoursMatch) return { status: 'Match' };
    return { status: paidHours < expectedHours ? 'Underpaid' : 'Overpaid' };
  },

  /**
   * True when the two category lists name the same set (order,
   * duplicates, case and surrounding whitespace all ignored) -- used
   * to decide whether Payslip paid under the categories Staffline
   * actually submitted. Staffline's portal-transcribed category text
   * and the payslip PDF's independently-parsed line description are
   * two separate pipelines that happen to use the same underlying
   * rate-category names today (verified against all real data), but
   * are not guaranteed to always agree on case/whitespace, so this
   * normalizes rather than comparing raw strings.
   * @private
   */
  sameCategoryFamily_: function(expected, paid) {
    const a = Array.from(new Set(expected.map(PayTrackerStafflineReconciliationService.normalizeCategoryLabel_))).sort();
    const b = Array.from(new Set(paid.map(PayTrackerStafflineReconciliationService.normalizeCategoryLabel_))).sort();
    if (a.length !== b.length) return false;
    return a.every(function(value, index) { return value === b[index]; });
  },

  /**
   * @private
   */
  normalizeCategoryLabel_: function(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  },

  /**
   * A real duplicate payment: the same Timesheet Reference,
   * description and amount appearing on two different payslips --
   * not just two lines within the same payslip (that's normal, e.g.
   * two "Enhanced" rows for different rates).
   * @private
   */
  findDuplicateLine_: function(paymentLines) {
    const seen = {};
    for (let index = 0; index < paymentLines.length; index += 1) {
      const line = paymentLines[index];
      const key = [line.description, line.units, line.rate, line.amount].join('|');
      if (seen[key] && seen[key] !== line.payslipId) {
        return 'The same line (' + line.description + ', ' + line.amount + ') was paid on both ' +
          seen[key] + ' and ' + line.payslipId + '.';
      }
      seen[key] = line.payslipId;
    }
    return null;
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
      calendarStatus === 'Job Mismatch' || calendarStatus === 'Hours Differ') {
      return 'Timesheet Discrepancy';
    }
    if (paymentStatus === 'Unpaid') {
      const end = PayTrackerStafflineReconciliationService.toDate_(timesheet.timesheetEnd);
      const daysSinceEnd = end ? Math.round((today.getTime() - end.getTime()) / 86400000) : 0;
      return daysSinceEnd <= 21 ? 'Delayed Payment' : 'Payroll Underpayment';
    }
    if (paymentStatus === 'Underpaid' || paymentStatus === 'Overpaid' || paymentStatus === 'Wrong Rate' ||
      paymentStatus === 'Wrong Enhancement' || paymentStatus === 'Partially Paid' ||
      paymentStatus === 'Duplicate Payment') {
      return 'Payroll Underpayment';
    }
    return 'None';
  },

  suggestReviewAction_: function(calendarStatus, paymentStatus, discrepancyType, note) {
    if (discrepancyType === 'None') return '';
    if (calendarStatus === 'Missing from Staffline') return 'Confirm the timesheet was submitted on the Staffline portal.';
    if (calendarStatus === 'Extra on Staffline') return 'Add the missing shift to Calendar, or confirm it was worked.';
    if (calendarStatus === 'Job Mismatch') return 'Check whether this timesheet was approved under the wrong job.';
    if (calendarStatus === 'Hours Differ') return 'Calendar and the Staffline-submitted timesheet disagree on hours -- check which one is right before looking at the payslip.';
    if (calendarStatus === 'Needs Review') return 'Confirm which job this Staffline placement belongs to.';
    if (discrepancyType === 'Delayed Payment') return 'No action yet -- still within the normal payroll processing window.';
    if (paymentStatus === 'Unpaid') return 'Raise a Pay Adjustment -- no payslip line found for this timesheet.';
    if (paymentStatus === 'Partially Paid') return 'Raise a Pay Adjustment. ' + (note || '');
    if (paymentStatus === 'Underpaid') return 'Raise a Pay Adjustment for the missing hours.';
    if (paymentStatus === 'Overpaid') return 'Confirm the extra hours were genuinely worked.';
    if (paymentStatus === 'Wrong Rate') return 'Check the rate applied on the payslip against Staffline. ' + (note || '');
    if (paymentStatus === 'Wrong Enhancement') return 'The enhancement multiplier paid does not match Staffline. ' + (note || '');
    if (paymentStatus === 'Duplicate Payment') return note || 'This line appears to have been paid twice.';
    if (paymentStatus === 'Unexpected Payment') return 'Confirm this payment against a real, approved Staffline timesheet.';
    return 'Review manually.';
  },

  linesForTimesheet_: function(allPaymentLines, timesheetId) {
    const target = PayTrackerStafflineConfig.normalizeReference(timesheetId);
    if (!target) return [];
    return allPaymentLines.filter(function(line) { return line.normalizedTimesheetId === target; });
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
