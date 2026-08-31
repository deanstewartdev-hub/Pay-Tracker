/*******************************************************
 * PAY TRACKER V3.0 - safe Annual Leave engine unit checks.
 *******************************************************/

function runAnnualLeaveEngineTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }

  const definitions = PayTrackerAnnualLeaveConfig.getDefinitions();
  check('four additive Annual Leave sheet definitions', definitions.length === 4);
  check('Jobs sheet carries the AL setting columns',
    PayTrackerReconciliationConfig.SHEETS.JOBS.HEADERS.indexOf('Annual Leave Accrual Rate') !== -1 &&
    PayTrackerReconciliationConfig.SHEETS.JOBS.HEADERS.indexOf('Annual Leave Opening Balance Hours') !== -1
  );
  check('header mapping produces the expected camelCase keys',
    PayTrackerJobRegistryRepository.toKey('Annual Leave Accrual Rate') === 'annualLeaveAccrualRate' &&
    PayTrackerJobRegistryRepository.toKey('AL Earnings ID') === 'alEarningsId' &&
    PayTrackerJobRegistryRepository.toKey('AL Usage ID') === 'alUsageId'
  );

  const takenStatuses = PayTrackerAnnualLeaveBalanceService.TAKEN_STATUSES;
  const futureStatuses = PayTrackerAnnualLeaveBalanceService.FUTURE_COMMITMENT_STATUSES;
  check('Taken/Paid/Partially Paid all reduce balance',
    takenStatuses.indexOf('Taken') !== -1 &&
    takenStatuses.indexOf('Paid') !== -1 &&
    takenStatuses.indexOf('Partially Paid') !== -1
  );
  check('Cancelled and Rejected never reduce balance',
    takenStatuses.indexOf('Cancelled') === -1 && takenStatuses.indexOf('Rejected') === -1 &&
    futureStatuses.indexOf('Cancelled') === -1 && futureStatuses.indexOf('Rejected') === -1
  );

  const balance = PayTrackerAnnualLeaveBalanceService.getBalanceForJob({
    jobId: 'JOB-TEST', jobName: 'Test Job', annualLeaveEnabled: true,
    annualLeaveOpeningBalanceHours: '', basicHourlyRate: '', annualLeaveAccrualRate: '',
    annualLeaveAccrualMethod: ''
  });
  check('a job with no ledger rows and blank settings returns clean zeros, not NaN/blank',
    balance.accruedBalanceHours === 0 &&
    balance.availableToBookHours === 0 &&
    balance.outstandingHolidayPayHours === 0 &&
    balance.accrualRate === null
  );

  check('rounding stops floating-point drift from ever surfacing',
    PayTrackerAnnualLeaveBalanceService.round(10.1 + 0.2) === 10.3
  );

  const defaults = PayTrackerAnnualLeaveConfig.DEFAULT_JOB_SETTINGS;
  check('seeded accrual rate default is a fraction, not a whole-number percentage',
    defaults.annualLeaveAccrualRate > 0 && defaults.annualLeaveAccrualRate < 1
  );

  const gmailService = PayTrackerAnnualLeaveGmailImportService;
  const rangeA = gmailService.extractDateRange('Leave from 27 Jul 2026 to 29 Jul 2026 approved.');
  check('date extraction reads a textual range',
    rangeA.start === '2026-07-27' && rangeA.end === '2026-07-29'
  );
  const rangeB = gmailService.extractDateRange('Confirmed for 27/07/2026.');
  check('date extraction reads a numeric dd/mm/yyyy date',
    rangeB.start === '2026-07-27' && rangeB.end === '2026-07-27'
  );
  check('date extraction returns nothing rather than guessing',
    Object.keys(gmailService.extractDateRange('no dates mentioned here')).length === 0
  );
  check('an invalid calendar date (month 13) is rejected, not silently accepted',
    Object.keys(gmailService.extractDateRange('on 35/13/2026')).length === 0
  );

  check('a cancellation mention outranks an earlier approval mention in the same text',
    gmailService.detectLeaveStatus('Leave approved -- actually now cancelled, sorry.') === 'Cancelled'
  );
  check('vague wording with no status keyword defaults to Requested, not Approved',
    gmailService.detectLeaveStatus('Just checking in about your leave.') === 'Requested'
  );

  check('confidence is High only with a known job, a found date, and clear status wording',
    gmailService.computeConfidence({
      rule: { jobId: 'JOB-NHS' }, dateRange: { start: '2026-07-27' }, status: 'Approved'
    }) === PayTrackerAnnualLeaveConfig.CONFIDENCE_LEVELS.HIGH
  );
  check('confidence is never High when the rule has no Job ID -- never guess the job',
    gmailService.computeConfidence({
      rule: { jobId: '' }, dateRange: { start: '2026-07-27' }, status: 'Approved'
    }) !== PayTrackerAnnualLeaveConfig.CONFIDENCE_LEVELS.HIGH
  );
  check('confidence is never High without a found date',
    gmailService.computeConfidence({
      rule: { jobId: 'JOB-NHS' }, dateRange: {}, status: 'Approved'
    }) !== PayTrackerAnnualLeaveConfig.CONFIDENCE_LEVELS.HIGH
  );

  check('confidence is never High/Medium when the job could not be disambiguated (null jobId)',
    gmailService.computeConfidence({
      rule: { jobId: null }, dateRange: { start: '2026-04-06' }, status: 'Approved'
    }) === PayTrackerAnnualLeaveConfig.CONFIDENCE_LEVELS.LOW
  );

  // --- Regression: real Gmail thread shapes that produced a wrong
  // auto-import before the attachment-based date fix. Reconstructed
  // to match the failure mode found during the 2026-08-31 Gmail
  // investigation, not verbatim source text.

  // Shape 1 (NHS): a reply-chain email whose body contains a quoted
  // prior message with its own send date ("On Mon, 16 Mar 2026, ...
  // wrote:"), while the real leave dates only appear as ordinal days
  // with no year ("6th April" / "4th April") -- a format
  // extractDateRange correctly never guesses a year for.
  {
    const quotedReplyBody =
      'Hi, confirming my leave request for 6th April and 4th April as discussed.\n\n' +
      'On Mon, 16 Mar 2026, 14:14, Aodhan Traynor <aodhan.traynor@northerntrust.hscni.net> wrote:\n' +
      '> Please confirm your annual leave dates for the rota.\n' +
      '> Thanks, Aodhan';

    const rawExtraction = gmailService.extractDateRange(quotedReplyBody);
    check('pre-fix bug reproduced: scanning the RAW body finds the quoted reply\'s own date (16 Mar 2026), not a real leave date',
      rawExtraction.start === '2026-03-16'
    );

    const stripped = gmailService.stripQuotedReplyText(quotedReplyBody);
    check('stripQuotedReplyText removes the quoted "On ... wrote:" block and everything after it',
      stripped.indexOf('16 Mar 2026') === -1 && stripped.indexOf('Aodhan') === -1 &&
      stripped.indexOf('6th April') !== -1
    );

    const fixedExtraction = gmailService.extractDateRange(stripped);
    check('fix verified: scanning the STRIPPED body finds no date (ordinal day with no year is never guessed) -- must route to Needs Review, not a wrong date',
      Object.keys(fixedExtraction).length === 0
    );
  }

  // Shape 2 (Causeway Coast and Glens): identical sender/subject
  // ("Re: Holiday Request Form" from causewaycoastandglens.gov.uk)
  // used for both Relief Warden and Night Security correspondence --
  // the Job ID can only come from positive wording inside the
  // attachment, never from "not the other job".
  check('clear Relief Warden attachment wording resolves to JOB-RELIEF-WARDEN',
    gmailService.classifyCausewayJobFromAttachment(
      'Cushendall Holiday and Leisure Park -- Relief Assistant Warden -- Caravan Park annual leave form'
    ).jobId === 'JOB-RELIEF-WARDEN'
  );
  check('clear Night Security attachment wording resolves to JOB-NIGHT-SECURITY',
    gmailService.classifyCausewayJobFromAttachment(
      'Client Name: Causeway Coast and Glens Borough Council (Night Shift) -- Night Security Warden leave form'
    ).jobId === 'JOB-NIGHT-SECURITY'
  );
  check('mixed wording (both jobs mentioned) is never guessed -- routes to Needs Review',
    gmailService.classifyCausewayJobFromAttachment(
      'Caravan Park Relief Warden cover arranged during Night Shift leave'
    ).jobId === null
  );
  check('no identifiable wording is never guessed -- routes to Needs Review',
    gmailService.classifyCausewayJobFromAttachment(
      'Holiday Request Form -- please sign and return.'
    ).jobId === null
  );
  check('no attachment text at all is never guessed -- routes to Needs Review',
    gmailService.classifyCausewayJobFromAttachment('').jobId === null
  );
  check('absence of Night Security wording alone is never treated as proof of Relief Warden',
    gmailService.classifyCausewayJobFromAttachment('Please see attached form for your records.').jobId === null
  );

  check('extractHours reads explicit "N hours" wording',
    gmailService.extractHours('Approved for 7.5 hours of annual leave.') === 7.5
  );
  check('extractHours returns null rather than guessing when no hours wording is present',
    gmailService.extractHours('Approved for 6th and 4th April.') === null
  );

  return { success: true, passed: results.length, results: results };
}
