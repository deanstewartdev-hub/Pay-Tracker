/*******************************************************
 * PAY TRACKER V3.0 - safe Staffline reconciliation checks.
 *
 * The 5 known-timesheet fixtures (621093, 621105, 621137, 624148,
 * 624186) are real data confirmed against the live Gmail account
 * and two real downloaded payslip PDFs -- not invented. Their exact
 * field values and payment amounts are regression-tested here so a
 * future change cannot silently break real reconciliation.
 *******************************************************/

function runStafflineReconciliationTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }

  // --- Config -------------------------------------------------
  const definitions = PayTrackerStafflineConfig.getDefinitions();
  check('three additive Staffline sheet definitions', definitions.length === 3);
  check('reference normalization strips the N prefix and matches the bare Gmail ID',
    PayTrackerStafflineConfig.normalizeReference('N621093') === '621093' &&
    PayTrackerStafflineConfig.normalizeReference('621093') === '621093'
  );

  // --- Gmail field extraction, against real email bodies -------
  // Verbatim from the real "Timesheet Approved" emails (Aug 2026).
  const email621093 = [
    'Hi Dean,', '',
    'Timesheet has been approved by Carol O\'Brien, working for Causeway Coast & Glens Borough Council.',
    '',
    'Timesheet Id: 621093',
    'Placement Description: Relief Assistant Warden C/Dall C/Dun',
    'Applicant Name: Dean Stewart',
    'Client Name: Causeway Coast & Glens Borough Council',
    'Timesheet Start: 10/08/2026',
    'Timesheet End: 16/08/2026',
    'Work Address: Cloonavin, 66 Portstewart Road, Coleraine, BT521EY, United Kingdom',
    'Timesheet: Click here to view the timesheet.', '',
    'Regards,', '', 'Staffline'
  ].join('\n');
  const html621093 = '<a href="https://portalni.stafflineni.co.uk/Secure/Candidates/Jobs/Placements/' +
    'Timesheets/ViewList.aspx#/ApplicantTimesheetList?timesheetId=ljURuxC%2f4h3ObQ1VVgeFfQ%3d%3d">here</a>';

  const fields621093 = PayTrackerStafflineGmailImportService.extractFields(email621093, html621093);
  check('621093: Timesheet Id extracted and normalized', fields621093.timesheetId === '621093');
  check('621093: Placement Description extracted exactly',
    fields621093.placementDescription === 'Relief Assistant Warden C/Dall C/Dun'
  );
  check('621093: Approved By extracted from the opening sentence', fields621093.approvedBy === "Carol O'Brien");
  check('621093: UK dates converted to ISO',
    fields621093.timesheetStart === '2026-08-10' && fields621093.timesheetEnd === '2026-08-16'
  );
  check('621093: portal URL extracted from the HTML body',
    fields621093.portalUrl.indexOf('portalni.stafflineni.co.uk') !== -1 &&
    fields621093.portalUrl.indexOf('timesheetId=') !== -1
  );

  const email621137Placement = 'Placement Description: Car Parking Assistant';
  const email621105Placement = 'Placement Description: Night Security C/Dun & C/Dall';

  // --- Placement -> Job classification, against real placements -
  const nhs = PayTrackerStafflineGmailImportService.classifyPlacement('Car Parking Assistant');
  check('known placement "Car Parking Assistant" classifies to JOB-NHS', nhs.jobId === 'JOB-NHS');

  const reliefWarden = PayTrackerStafflineGmailImportService.classifyPlacement('Relief Assistant Warden C/Dall C/Dun');
  check('known placement "Relief Assistant Warden C/Dall C/Dun" classifies to JOB-RELIEF-WARDEN',
    reliefWarden.jobId === 'JOB-RELIEF-WARDEN'
  );

  const nightSecurity = PayTrackerStafflineGmailImportService.classifyPlacement('Night Security C/Dun & C/Dall');
  check('known placement "Night Security C/Dun & C/Dall" classifies to JOB-NIGHT-SECURITY',
    nightSecurity.jobId === 'JOB-NIGHT-SECURITY'
  );

  const unknown = PayTrackerStafflineGmailImportService.classifyPlacement('Some Brand New Placement Nobody Has Seen');
  check('an unrecognised placement is Needs Review, never guessed',
    unknown.status === 'Needs Review' && unknown.jobId === ''
  );

  // --- Payslip payment-line parser, against the two real PDFs ---
  // (Same fixture proven offline in Node against the real .gs file
  // before this fix shipped -- kept here so it stays proven.)
  const payslip1Text = [
    'PAY ADVICE',
    'Name Dean Stewart PAY TO DATE',
    'Clock No. N1566677PA Gross Pay 17292.09',
    'Pay Period 20/2026',
    'PLEASE CONTACT YOUR CONSULTANT WITH QUERIES.',
    'PAYMENTS DEDUCTIONS',
    'Wk Ending Timesheet Description Units Rate Amount Deduction Amount',
    '16/08/2026 N621093 Basic 10.00 13.69 136.90 Tax 157.60',
    '16/08/2026 N621105 Enhanced 1.33 16.00 17.92 286.72 N I 59.27',
    '16/08/2026 N621105 Enhanced 1.50 4.00 20.21 80.84 Pension Contrib 33.88',
    '16/08/2026 N621137 Basic 28.00 12.71 355.88 Student Loan 46.00',
    '16/08/2026 N621137 HSC Unsoc: M-F 8pm-6am & Sat 9.50 17.92 170.24',
    'TOTAL PAY 1030.58 TOTAL DEDUCTIONS 296.75'
  ].join(' ');

  const payslip1 = PayTrackerPayrollTimesheetParser.parse(payslip1Text);
  check('payslip 1 (interleaved deductions) detects as STAFFLINE', payslip1.parserType === 'STAFFLINE');
  check('payslip 1 extracts all 5 real payment lines', payslip1.entryCount === 5);
  check('payslip 1 line 1 (N621093 Basic) matches the real amount exactly',
    payslip1.entries[0].reference === 'N621093' && payslip1.entries[0].hours === 10 &&
    payslip1.entries[0].rate === 13.69 && payslip1.entries[0].amount === 136.90
  );
  check('payslip 1 line 5 description keeps its embedded punctuation, not swallowed by the deduction column',
    payslip1.entries[4].description === 'HSC Unsoc: M-F 8pm-6am & Sat' && payslip1.entries[4].amount === 170.24
  );
  check('payslip 1: every line\'s own hours x rate matches its amount',
    payslip1.entries.every(function(entry) { return entry.validation.status === 'MATCHED'; })
  );

  const payslip2Text = [
    'Please remember to send your timesheet to Payroll no later than a Monday 12pm',
    'PAYMENTS DEDUCTIONS',
    'Wk Ending Timesheet Description Units Rate Amount Deduction Amount',
    '23/08/2026 N624148 Enhanced 1.33 4.00 17.92 71.68 Tax 124.60',
    '23/08/2026 N624148 Enhanced 1.50 4.00 20.21 80.84 N I 49.83',
    '23/08/2026 N624186 Basic 22.00 12.71 279.62 Pension Contribution 23.60',
    '23/08/2026 N624186 HSC Unsoc: M-F 8pm-6am & Sat 15.50 17.92 277.76 Student Loan 31.00',
    '23/08/2026 N624186 HSC Overtime: M-F & Sat/Sun 7.50 20.66 154.95',
    'TOTAL PAYMENTS 864.85 TOTAL DEDUCTIONS 229.03'
  ].join(' ');

  const payslip2 = PayTrackerPayrollTimesheetParser.parse(payslip2Text);
  check('payslip 2 (description embeds its own decimal) detects as STAFFLINE', payslip2.parserType === 'STAFFLINE');
  check('payslip 2 extracts all 5 real payment lines, including the final one', payslip2.entryCount === 5);
  check('payslip 2 line 1 keeps "Enhanced 1.33" as description, not misread as the Units column',
    payslip2.entries[0].description === 'Enhanced 1.33'
  );
  check('payslip 2 line 1 real Units/Rate/Amount are correct despite the embedded decimal',
    payslip2.entries[0].hours === 4 && payslip2.entries[0].rate === 17.92 && payslip2.entries[0].amount === 71.68
  );
  check('payslip 2 last line (previously dropped by the old regex) is present and correct',
    payslip2.entries[4].reference === 'N624186' && payslip2.entries[4].amount === 154.95
  );

  // --- Repository round-trip, sacrificial IDs only --------------
  const savedTimesheet = PayTrackerStafflineTimesheetRepository.upsert({
    timesheetId: '999999', gmailMessageId: 'TEST-MSG-STAFFLINE-1', jobId: 'JOB-TEST',
    placementDescription: 'Test Placement', timesheetStart: '2099-01-05', timesheetEnd: '2099-01-11',
    classificationStatus: 'Classified'
  });
  check('a new Staffline timesheet round-trips by Timesheet ID', savedTimesheet.timesheetId === '999999');

  const refreshed = PayTrackerStafflineTimesheetRepository.upsert({
    timesheetId: 'N999999', gmailMessageId: 'TEST-MSG-STAFFLINE-1', jobId: 'JOB-TEST',
    placementDescription: 'Test Placement Updated', timesheetStart: '2099-01-05', timesheetEnd: '2099-01-11',
    classificationStatus: 'Classified'
  });
  check('re-scanning the same timesheet (N-prefixed this time) updates in place, never duplicates',
    refreshed.placementDescription === 'Test Placement Updated' &&
    PayTrackerStafflineTimesheetRepository.getAll().filter(function(record) {
      return record.timesheetId === '999999';
    }).length === 1
  );

  const savedLines = PayTrackerStafflinePaymentLineRepository.replaceForPayslip('PAYSLIP-TEST-STAFFLINE-1', [
    { reference: 'N999999', workDate: '2099-01-11', description: 'Basic', units: 10, rate: 12, amount: 120, validationStatus: 'MATCHED' }
  ]);
  check('payment lines round-trip by Payslip ID', savedLines.length === 1 && savedLines[0].normalizedTimesheetId === '999999');

  const replacedLines = PayTrackerStafflinePaymentLineRepository.replaceForPayslip('PAYSLIP-TEST-STAFFLINE-1', [
    { reference: 'N999999', workDate: '2099-01-11', description: 'Basic', units: 8, rate: 12, amount: 96, validationStatus: 'MATCHED' }
  ]);
  check('re-importing the same payslip replaces its lines rather than accumulating duplicates',
    replacedLines.length === 1 && replacedLines[0].amount === 96
  );

  const byReference = PayTrackerStafflinePaymentLineRepository.getByTimesheetReference('999999');
  check('payment lines are findable by normalized Timesheet ID across payslips', byReference.length === 1);

  // --- Reconciliation status logic, literal fixtures only -------
  const matchTimesheet = { classificationStatus: 'Classified', jobId: 'JOB-TEST', timesheetEnd: '2099-01-11' };

  // Calendar <-> Staffline, no Staffline detail known (stafflineHours
  // null) -- the pre-existing, coarser fallback path.
  check('a job with Calendar hours and no other job\'s shifts in the window is a Match (no Staffline detail)',
    PayTrackerStafflineReconciliationService.computeCalendarStatus_(
      matchTimesheet, [{ jobId: 'JOB-TEST', hours: 20 }], [], 20, null
    ) === 'Match'
  );
  check('Calendar shifts for a different job in the same window is a Job Mismatch, not just Extra on Staffline',
    PayTrackerStafflineReconciliationService.computeCalendarStatus_(
      matchTimesheet, [], [{ jobId: 'JOB-OTHER', hours: 20 }], 0, null
    ) === 'Job Mismatch'
  );
  check('no Calendar shifts at all for the job is Extra on Staffline',
    PayTrackerStafflineReconciliationService.computeCalendarStatus_(matchTimesheet, [], [], 0, null) === 'Extra on Staffline'
  );
  check('an unclassified placement is always Needs Review on the Calendar side',
    PayTrackerStafflineReconciliationService.computeCalendarStatus_(
      { classificationStatus: 'Needs Review' }, [{ jobId: 'JOB-TEST', hours: 20 }], [], 20, null
    ) === 'Needs Review'
  );

  // Calendar <-> Staffline, WITH real Staffline submitted hours --
  // the genuine three-way chain this release adds.
  check('Calendar and real Staffline submitted hours agreeing is a Match',
    PayTrackerStafflineReconciliationService.computeCalendarStatus_(
      matchTimesheet, [{ jobId: 'JOB-TEST', hours: 8 }], [], 8, 8
    ) === 'Match'
  );
  check('Calendar and real Staffline submitted hours disagreeing is Hours Differ, not silently averaged',
    PayTrackerStafflineReconciliationService.computeCalendarStatus_(
      matchTimesheet, [{ jobId: 'JOB-TEST', hours: 8 }], [], 8, 6
    ) === 'Hours Differ'
  );

  // Staffline <-> Payslip. expectedHours is whatever the caller
  // decided is authoritative (real Staffline hours, or Calendar's as
  // a fallback) -- these calls exercise the comparison itself.
  check('matching paid hours against expected hours is Match',
    PayTrackerStafflineReconciliationService.computePaymentStatus_(
      matchTimesheet, null, [{ units: 20, validationStatus: 'MATCHED', payCategory: 'Basic', payslipId: 'P1' }], 20, []
    ).status === 'Match'
  );
  check('fewer paid hours than expected is Underpaid, never silently averaged away',
    PayTrackerStafflineReconciliationService.computePaymentStatus_(
      matchTimesheet, null, [{ units: 12, validationStatus: 'MATCHED', payCategory: 'Basic', payslipId: 'P1' }], 20, []
    ).status === 'Underpaid'
  );
  check('no payment lines found anywhere is Unpaid', PayTrackerStafflineReconciliationService.computePaymentStatus_(
    matchTimesheet, null, [], 20, []
  ).status === 'Unpaid');
  check('matching hours but the payslip\'s own amount does not match hours x rate is Wrong Rate',
    PayTrackerStafflineReconciliationService.computePaymentStatus_(
      matchTimesheet, null, [{ units: 20, validationStatus: 'REVIEW', payCategory: 'Basic', payslipId: 'P1' }], 20, []
    ).status === 'Wrong Rate'
  );

  // A whole rate category Staffline submitted never appears on the
  // payslip at all -- Partially Paid, distinct from a plain
  // across-the-board Underpaid.
  const partialDetail = { rateCategories: 'Basic; Enhanced 1.33' };
  const partialResult = PayTrackerStafflineReconciliationService.computePaymentStatus_(
    matchTimesheet, partialDetail,
    [{ units: 10, validationStatus: 'MATCHED', payCategory: 'Basic', payslipId: 'P1' }], 15, []
  );
  check('a whole missing rate category (not just fewer hours) is Partially Paid', partialResult.status === 'Partially Paid');
  check('Partially Paid names exactly which category was never paid', partialResult.note.indexOf('Enhanced 1.33') !== -1);

  // Paid under the wrong enhancement multiplier -- both sides are
  // Enhanced/Overtime variants, just disagreeing on which one.
  const wrongEnhancementDetail = { rateCategories: 'Enhanced 1.50' };
  const wrongEnhancementResult = PayTrackerStafflineReconciliationService.computePaymentStatus_(
    matchTimesheet, wrongEnhancementDetail,
    [{ units: 20, validationStatus: 'MATCHED', payCategory: 'Enhanced 1.33', payslipId: 'P1' }], 20, []
  );
  check('same hours but the wrong enhancement multiplier is Wrong Enhancement, not a generic Wrong Rate',
    wrongEnhancementResult.status === 'Wrong Enhancement'
  );

  // Paid as an entirely different (non-enhancement) category.
  const wrongRateDetail = { rateCategories: 'Basic' };
  const wrongRateResult = PayTrackerStafflineReconciliationService.computePaymentStatus_(
    matchTimesheet, wrongRateDetail,
    [{ units: 20, validationStatus: 'MATCHED', payCategory: 'Enhanced 1.33', payslipId: 'P1' }], 20, []
  );
  check('same hours but paid under an unrelated category is a generic Wrong Rate', wrongRateResult.status === 'Wrong Rate');

  // The exact same line paid on two different payslips.
  const duplicateLines = [
    { units: 10, amount: 100, rate: 10, description: 'Basic', payCategory: 'Basic', validationStatus: 'MATCHED', payslipId: 'PAYSLIP-A' },
    { units: 10, amount: 100, rate: 10, description: 'Basic', payCategory: 'Basic', validationStatus: 'MATCHED', payslipId: 'PAYSLIP-B' }
  ];
  const duplicateResult = PayTrackerStafflineReconciliationService.computePaymentStatus_(
    matchTimesheet, null, duplicateLines, 10, duplicateLines
  );
  check('the same line paid on two different payslips is Duplicate Payment', duplicateResult.status === 'Duplicate Payment');
  check('Duplicate Payment names both payslip IDs',
    duplicateResult.note.indexOf('PAYSLIP-A') !== -1 && duplicateResult.note.indexOf('PAYSLIP-B') !== -1
  );

  const recentToday = new Date(2099, 0, 15); // 4 days after the 11th -- still within the lag window
  const laterToday = new Date(2099, 1, 15); // over a month later -- past any plausible lag
  check('an unpaid timesheet still within the normal payroll lag reads as Delayed Payment, not a confirmed failure',
    PayTrackerStafflineReconciliationService.computeDiscrepancyType_(
      'Match', 'Unpaid', matchTimesheet, recentToday
    ) === 'Delayed Payment'
  );
  check('an unpaid timesheet well past the normal lag reads as a genuine Payroll Underpayment',
    PayTrackerStafflineReconciliationService.computeDiscrepancyType_(
      'Match', 'Unpaid', matchTimesheet, laterToday
    ) === 'Payroll Underpayment'
  );
  check('a Staffline-side mismatch is always a Timesheet Discrepancy, regardless of payment status',
    PayTrackerStafflineReconciliationService.computeDiscrepancyType_(
      'Missing from Staffline', 'Needs Review', matchTimesheet, recentToday
    ) === 'Timesheet Discrepancy'
  );
  check('a full, matching reconciliation is None -- nothing to review',
    PayTrackerStafflineReconciliationService.computeDiscrepancyType_(
      'Match', 'Match', matchTimesheet, recentToday
    ) === 'None'
  );

  // --- The exact three-way distinction this release exists for ---
  // Calendar 8h / Staffline 6h / Payslip 6h -> the timesheet itself
  // is wrong, not payroll: Payslip correctly paid what was
  // submitted, Calendar just disagrees with what was submitted.
  const timesheetDiscrepancyCalendarStatus = PayTrackerStafflineReconciliationService.computeCalendarStatus_(
    matchTimesheet, [{ jobId: 'JOB-TEST', hours: 8 }], [], 8, 6
  );
  const timesheetDiscrepancyPaymentStatus = PayTrackerStafflineReconciliationService.computePaymentStatus_(
    matchTimesheet, null, [{ units: 6, validationStatus: 'MATCHED', payCategory: 'Basic', payslipId: 'P1' }], 6, []
  ).status;
  check('Calendar 8h / Staffline 6h / Payslip 6h is a Timesheet Discrepancy, not a Payroll Underpayment',
    PayTrackerStafflineReconciliationService.computeDiscrepancyType_(
      timesheetDiscrepancyCalendarStatus, timesheetDiscrepancyPaymentStatus, matchTimesheet, recentToday
    ) === 'Timesheet Discrepancy'
  );

  // Calendar 8h / Staffline 8h / Payslip 6h -> Calendar and
  // Staffline agree, so the payslip genuinely underpaid.
  const payrollUnderpaymentCalendarStatus = PayTrackerStafflineReconciliationService.computeCalendarStatus_(
    matchTimesheet, [{ jobId: 'JOB-TEST', hours: 8 }], [], 8, 8
  );
  const payrollUnderpaymentPaymentStatus = PayTrackerStafflineReconciliationService.computePaymentStatus_(
    matchTimesheet, null, [{ units: 6, validationStatus: 'MATCHED', payCategory: 'Basic', payslipId: 'P1' }], 8, []
  ).status;
  check('Calendar 8h / Staffline 8h / Payslip 6h is a Payroll Underpayment, not a Timesheet Discrepancy',
    PayTrackerStafflineReconciliationService.computeDiscrepancyType_(
      payrollUnderpaymentCalendarStatus, payrollUnderpaymentPaymentStatus, matchTimesheet, recentToday
    ) === 'Payroll Underpayment'
  );

  // --- The 5 real fixtures, now with real Staffline portal detail -
  // Imported 2026-08-27 from the real, authenticated Staffline
  // portal (read-only) -- Total Hours/Days confirmed to exactly
  // match each real payslip's total. Proves the live
  // StafflineTimesheetDetailRepository data reconciles clean.
  const realFixtureHours = {
    '621093': 10.00, '621105': 20.00, '621137': 37.50, '624148': 8.00, '624186': 45.00
  };
  Object.keys(realFixtureHours).forEach(function(timesheetId) {
    const detail = PayTrackerStafflineTimesheetDetailRepository.getByTimesheetId(timesheetId);
    check('real Staffline detail is imported for Timesheet ' + timesheetId, Boolean(detail));
    if (detail) {
      check('Timesheet ' + timesheetId + ' submitted hours match the real portal figure',
        Number(detail.submittedHours) === realFixtureHours[timesheetId]
      );
    }
  });

  return { success: true, passed: results.length, results: results };
}
