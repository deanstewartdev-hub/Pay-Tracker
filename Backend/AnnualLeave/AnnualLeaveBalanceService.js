/*******************************************************
 * PAY TRACKER V3.0
 * Per-job Annual Leave balance computation.
 *
 * Accrued balance = opening balance + earned hours - hours taken
 * Available-to-book = accrued balance - approved future leave
 * Outstanding holiday pay = hours taken - hours confirmed paid
 *
 * "Taken" and "paid" are deliberately different events (a day off
 * can be taken before the payslip that pays for it exists).
 *******************************************************/

const PayTrackerAnnualLeaveBalanceService = Object.freeze({
  TAKEN_STATUSES: Object.freeze(['Taken', 'Paid', 'Partially Paid']),
  FUTURE_COMMITMENT_STATUSES: Object.freeze(['Approved', 'Booked']),

  getBalanceForJob: function(job) {
    const earnings = PayTrackerAnnualLeaveEarningsRepository.getAll(job.jobId);
    const usage = PayTrackerAnnualLeaveUsageRepository.getAll(job.jobId);
    const self = this;

    const openingBalance = Number(job.annualLeaveOpeningBalanceHours) || 0;

    const earnedHours = earnings.reduce(function(total, record) {
      return total + (Number(record.hoursEarned) || 0);
    }, 0);

    const takenHours = usage.filter(function(record) {
      return self.TAKEN_STATUSES.indexOf(record.leaveStatus) !== -1;
    }).reduce(function(total, record) {
      return total + (Number(record.hoursTaken) || 0);
    }, 0);

    const paidHours = usage.filter(function(record) {
      return self.TAKEN_STATUSES.indexOf(record.leaveStatus) !== -1;
    }).reduce(function(total, record) {
      return total + (Number(record.hoursPaid) || 0);
    }, 0);

    const futureCommittedHours = usage.filter(function(record) {
      return self.FUTURE_COMMITMENT_STATUSES.indexOf(record.leaveStatus) !== -1;
    }).reduce(function(total, record) {
      return total + (Number(record.hoursApproved) || 0);
    }, 0);

    const needsReviewCount = usage.filter(function(record) {
      return record.leaveStatus === 'Needs Review' ||
        record.manualReviewStatus === 'Needs Review';
    }).length;

    const accruedBalance = openingBalance + earnedHours - takenHours;
    const availableToBookBalance = accruedBalance - futureCommittedHours;
    const outstandingHolidayPay = Math.max(0, takenHours - paidHours);

    return {
      jobId: job.jobId,
      jobName: job.jobName,
      annualLeaveEnabled: job.annualLeaveEnabled === true,
      openingBalanceHours: this.round(openingBalance),
      earnedHours: this.round(earnedHours),
      takenHours: this.round(takenHours),
      paidHours: this.round(paidHours),
      futureCommittedHours: this.round(futureCommittedHours),
      accruedBalanceHours: this.round(accruedBalance),
      availableToBookHours: this.round(availableToBookBalance),
      outstandingHolidayPayHours: this.round(outstandingHolidayPay),
      basicHourlyRate: Number(job.basicHourlyRate) || 0,
      accruedValue: this.round(accruedBalance * (Number(job.basicHourlyRate) || 0)),
      earningsRecordCount: earnings.length,
      usageRecordCount: usage.length,
      needsReviewCount: needsReviewCount,
      accrualRate: job.annualLeaveAccrualRate === '' || job.annualLeaveAccrualRate === undefined
        ? null : Number(job.annualLeaveAccrualRate),
      accrualMethod: job.annualLeaveAccrualMethod || ''
    };
  },

  getAllBalances: function() {
    return PayTrackerJobRegistryRepository.getAll(false)
      .filter(function(job) { return job.annualLeaveEnabled === true; })
      .map(this.getBalanceForJob.bind(this));
  },

  // Only "Nearest hundredth" is implemented today -- see
  // AnnualLeaveConfig.js's DEFAULT_JOB_SETTINGS note. The seeded
  // Rounding Method value is descriptive, not yet selectable.
  round: function(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }
});
