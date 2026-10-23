/*******************************************************
 * PAY TRACKER V3.3 (Step 2B - Dynamic Upcoming Payments)
 * Pure payment timeline: one ordered list of upcoming Bill and
 * Subscription payments, their status, and payment history.
 *
 * No sheet access: UpcomingPaymentsService reads the existing
 * sheets and hands them in. Two stages, so the expensive part can
 * be cached and the date-dependent part is always current:
 *
 *   buildSeries(sources) -> plain JSON "series" (one per bill or
 *     subscription) + history. Cacheable; independent of today.
 *   present(model, today) -> statuses, countdowns, the ordered
 *     timeline, projected recurrences and 7/30-day totals.
 *
 * Rules (issue #46):
 * - A payment is never "Paid" because its date arrived. Paid
 *   needs evidence: a Confirmed/Automatic bank match to the Finance
 *   Payments row, the row's Paid? tick, or a Subscription
 *   Transactions link dated around the due date.
 * - An unconfirmed past-due payment stays visible (Awaiting
 *   confirmation for a few days, then Overdue). Nothing is removed.
 * - A subscription linked to (or identical to) an active bill is
 *   shown once, as the bill. One bank transaction confirms at most
 *   one payment.
 * - Dates are calendar days in the script time zone (Europe/London).
 *******************************************************/

const PayTrackerPaymentTimeline = Object.freeze({
  KINDS: Object.freeze({ BILL: 'Bill', SUBSCRIPTION: 'Subscription' }),

  STATUSES: Object.freeze({
    UPCOMING: 'Upcoming',
    DUE_TODAY: 'Due today',
    AWAITING: 'Awaiting confirmation',
    OVERDUE: 'Overdue',
    PAID: 'Paid',
    NEEDS_REVIEW: 'Needs review'
  }),

  // Bank payments can post a day or two after the due date.
  AWAITING_GRACE_DAYS: 3,
  HORIZON_DAYS: 30,
  // A subscription payment this close to its expected date confirms it.
  SUBSCRIPTION_MATCH_BEFORE_DAYS: 5,
  SUBSCRIPTION_MATCH_AFTER_DAYS: 10,
  HISTORY_LIMIT_PER_KIND: 25,

  /* ---------------- calendar-day helpers ---------------- */

  toDate: function(value) {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (value === '' || value === null || value === undefined) return null;
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  },

  /** 'yyyy-mm-dd' of the date's calendar day in the script time zone. */
  dayKey: function(value) {
    const date = this.toDate(value);
    if (!date) return '';
    const pad = function(n) { return (n < 10 ? '0' : '') + n; };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  },

  fromKey: function(key) {
    const parts = String(key).split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  },

  /** Whole calendar days from one day to another (DST-safe). */
  daysBetween: function(fromKey, toKey) {
    const a = String(fromKey).split('-').map(Number);
    const b = String(toKey).split('-').map(Number);
    return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
  },

  addDaysKey: function(key, days) {
    const date = this.fromKey(key);
    return this.dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
  },

  /**
   * The day `count` frequency steps after `anchorKey`. Month-based
   * steps keep the anchor's day of month and clamp to short months,
   * always counted from the anchor (31 Jan -> 28 Feb -> 31 Mar,
   * never 31 Jan -> 3 Mar, and no drift to the 28th).
   * Returns '' for frequencies that cannot be projected.
   */
  stepKey: function(anchorKey, frequency, count) {
    const days = { 'Weekly': 7, 'Fortnightly': 14, 'Four Weekly': 28 }[frequency];
    if (days) return this.addDaysKey(anchorKey, days * count);
    const months = { 'Monthly': 1, 'Quarterly': 3, 'Six Monthly': 6, 'Annual': 12 }[frequency];
    if (!months) return '';
    return this.dayKey(this.addMonthsClamped(this.fromKey(anchorKey), months * count));
  },

  addMonthsClamped: function(date, months) {
    const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
  },

  /* ---------------- stage 1: series (cacheable) ---------------- */

  /**
   * @param {Object} sources Header-keyed sheet rows:
   *   {bills, payments, paymentHistory, subscriptions, subscriptionLinks, bankTransactions}
   * @return {{series: Array<Object>, history: Array<Object>, notes: Array<string>}}
   */
  buildSeries: function(sources) {
    const self = this;
    const src = sources || {};
    const notes = [];
    const usedTransactions = {};
    const series = [];

    // Bank evidence for Finance Payments rows, from the existing matcher.
    const bankByPayment = {};
    (src.bankTransactions || []).forEach(function(tx) {
      const paymentId = String(tx.matchedFinanceId || '').trim();
      const status = String(tx.matchStatus || '').trim();
      if (!paymentId || status === 'Rejected' || status === 'Unmatched' || status === '') return;
      const confirmed = status === 'Confirmed' || status === 'Automatic';
      const existing = bankByPayment[paymentId];
      if (!existing || (confirmed && !existing.confirmed)) {
        bankByPayment[paymentId] = {
          confirmed: confirmed, transactionId: String(tx.transactionId || ''),
          date: self.dayKey(tx.settledAt || tx.createdAt)
        };
      }
    });

    const unpaidBillPayments = {};
    (src.payments || []).forEach(function(row) {
      if (String(row.paymentType || '').trim() !== 'Bill Payment') return;
      const itemId = String(row.itemId || '').trim();
      const due = self.dayKey(row.dueDate);
      if (!itemId || !due) return;
      const current = unpaidBillPayments[itemId];
      // The queue holds one row per bill; if there are several, the earliest is the next one due.
      if (!current || due < current.due) unpaidBillPayments[itemId] = { row: row, due: due };
    });

    const activeBills = {};
    (src.bills || []).forEach(function(bill) {
      const id = String(bill.billId || '').trim();
      if (!id || String(bill.active || '').trim() !== 'Yes') return;
      const queued = unpaidBillPayments[id];
      const due = queued ? queued.due : self.dayKey(bill.nextDueDate);
      if (!due) return;
      const paymentId = queued ? String(queued.row.paymentId || '').trim() : '';
      const amount = queued ? Number(queued.row.amountDue) : Number(bill.amount);
      let evidence = { state: 'none' };
      if (queued && self.isTrue(queued.row.paid)) evidence = { state: 'paid', source: 'Marked paid in Pay Tracker' };
      else if (queued && String(queued.row.status || '').trim() === 'Error') {
        evidence = { state: 'review', source: 'Payment processing reported an error' };
      } else if (paymentId && bankByPayment[paymentId]) {
        const bank = bankByPayment[paymentId];
        evidence = bank.confirmed
          ? { state: 'paid', source: 'Confirmed Monzo transaction', transactionId: bank.transactionId, date: bank.date }
          : { state: 'review', source: 'Possible Monzo transaction - confirm the match', transactionId: bank.transactionId, date: bank.date };
      }
      if (evidence.transactionId) usedTransactions[evidence.transactionId] = true;
      activeBills[id] = { name: String(bill.billName || ''), amount: Number(bill.amount) || 0 };
      series.push({
        seriesId: 'BILL:' + id, kind: self.KINDS.BILL, sourceId: id, paymentId: paymentId,
        name: String(bill.billName || (queued && queued.row.billOrDebtName) || id),
        category: String(bill.category || ''), frequency: String(bill.frequency || ''),
        amount: amount > 0 ? Math.round(amount * 100) / 100 : null,
        nextDue: due, evidence: evidence, priceChange: 0
      });
    });

    const linksBySubscription = {};
    (src.subscriptionLinks || []).forEach(function(link) {
      const id = String(link.subscriptionId || '').trim();
      if (!id) return;
      (linksBySubscription[id] = linksBySubscription[id] || []).push(link);
    });

    let awaitingReview = 0;
    const shownSubscriptions = {};
    (src.subscriptions || []).forEach(function(sub) {
      const id = String(sub.subscriptionId || '').trim();
      if (!id) return;
      const status = String(sub.subscriptionStatus || 'Active').trim() || 'Active';
      const review = String(sub.reviewStatus || '').trim();
      if (status !== 'Active' || review === 'Rejected') return;
      if (review !== 'Confirmed') { awaitingReview++; return; }
      const name = String(sub.subscriptionName || sub.merchantDisplayName || id);
      const linkedBill = String(sub.linkedBillId || '').trim();
      const amount = Number(sub.latestAmount);
      if (linkedBill && activeBills[linkedBill]) {
        notes.push(name + ' is shown once, as the bill "' + activeBills[linkedBill].name + '".');
        return;
      }
      const twin = Object.keys(activeBills).filter(function(billId) {
        const bill = activeBills[billId];
        return self.normaliseName(bill.name) === self.normaliseName(name) &&
          Math.abs(bill.amount - (amount || 0)) <= Math.max(0.01, 0.01 * bill.amount);
      })[0];
      if (twin) {
        notes.push(name + ' looks like the bill "' + activeBills[twin].name + '" (same name and amount), so it is shown once, as the bill.');
        return;
      }
      const due = self.dayKey(sub.nextExpectedDate);
      if (!due) return;
      shownSubscriptions[id] = name;

      let evidence = { state: 'none' };
      (linksBySubscription[id] || []).forEach(function(link) {
        const txId = String(link.transactionId || '').trim();
        const paid = self.dayKey(link.paymentDate);
        if (!paid || (txId && usedTransactions[txId])) return;
        const offset = self.daysBetween(due, paid);
        if (offset >= -self.SUBSCRIPTION_MATCH_BEFORE_DAYS && offset <= self.SUBSCRIPTION_MATCH_AFTER_DAYS) {
          evidence = self.isTrue(link.confirmed)
            ? { state: 'paid', source: 'Confirmed Monzo transaction', transactionId: txId, date: paid }
            : { state: 'review', source: 'Possible Monzo transaction - confirm the match', transactionId: txId, date: paid };
        }
      });
      if (evidence.transactionId) usedTransactions[evidence.transactionId] = true;

      series.push({
        seriesId: 'SUB:' + id, kind: self.KINDS.SUBSCRIPTION, sourceId: id, paymentId: '',
        name: name, category: String(sub.category || ''), frequency: String(sub.frequency || ''),
        amount: amount > 0 ? Math.round(amount * 100) / 100 : null,
        nextDue: due, evidence: evidence, priceChange: Number(sub.priceChangeAmount) || 0
      });
    });
    if (awaitingReview) notes.push(awaitingReview + ' detected subscription(s) are waiting for your review and are not shown yet.');

    return { series: series, history: this.buildHistory(src, shownSubscriptions, usedTransactions), notes: notes };
  },

  buildHistory: function(src, shownSubscriptions, usedTransactions) {
    const self = this;
    const bills = (src.paymentHistory || []).filter(function(row) {
      return String(row.paymentType || '').trim() === 'Bill Payment' &&
        String(row.undoStatus || '').trim() !== 'Undone' && self.dayKey(row.paidDate);
    }).map(function(row) {
      return {
        kind: self.KINDS.BILL, sourceId: String(row.itemId || ''), name: String(row.billOrDebtName || ''),
        amount: Math.round((Number(row.amountPaid) || 0) * 100) / 100,
        dueDate: self.dayKey(row.originalDueDate), paidDate: self.dayKey(row.paidDate),
        source: 'Recorded in Payment History'
      };
    });
    const seen = {};
    const subs = (src.subscriptionLinks || []).filter(function(link) {
      const id = String(link.subscriptionId || '').trim();
      const txId = String(link.transactionId || '').trim();
      if (!shownSubscriptions[id] || !self.isTrue(link.confirmed) || !self.dayKey(link.paymentDate)) return false;
      // A transaction already used as evidence (for a bill, or for the current
      // occurrence, which present() moves into history itself) is never listed twice.
      if (txId && (seen[txId] || usedTransactions[txId])) return false;
      if (txId) seen[txId] = true;
      return true;
    }).map(function(link) {
      return {
        kind: self.KINDS.SUBSCRIPTION, sourceId: String(link.subscriptionId), name: shownSubscriptions[link.subscriptionId],
        amount: Math.round((Number(link.amount) || 0) * 100) / 100,
        dueDate: '', paidDate: self.dayKey(link.paymentDate), transactionId: String(link.transactionId || ''),
        source: 'Confirmed Monzo transaction'
      };
    });
    const newestFirst = function(a, b) { return a.paidDate === b.paidDate ? 0 : (a.paidDate < b.paidDate ? 1 : -1); };
    return bills.sort(newestFirst).slice(0, this.HISTORY_LIMIT_PER_KIND)
      .concat(subs.sort(newestFirst).slice(0, this.HISTORY_LIMIT_PER_KIND));
  },

  /* ---------------- stage 2: present (always current) ---------------- */

  /**
   * @param {Object} model buildSeries() output (possibly from cache).
   * @param {Date|string} today
   * @param {Object=} options {kind: 'Bill'|'Subscription', limit}
   */
  present: function(model, today, options) {
    const self = this;
    const opts = options || {};
    const todayKey = this.dayKey(today);
    const horizonKey = this.addDaysKey(todayKey, this.HORIZON_DAYS);
    const upcoming = [];
    const confirmedNow = [];

    (model.series || []).forEach(function(series) {
      if (opts.kind && series.kind !== opts.kind) return;
      let index = 0;
      let dueKey = series.nextDue;
      if (series.evidence && series.evidence.state === 'paid') {
        confirmedNow.push({
          kind: series.kind, sourceId: series.sourceId, name: series.name, amount: series.amount,
          dueDate: series.nextDue, paidDate: series.evidence.date || '', transactionId: series.evidence.transactionId || '',
          source: series.evidence.source
        });
        index = 1;
        dueKey = self.stepKey(series.nextDue, series.frequency, 1);
      }
      // Always show the next unresolved payment, then project recurrences inside the horizon.
      let first = true;
      while (dueKey && (first || dueKey < horizonKey)) {
        const isOpenOccurrence = index === 0;
        // Only the open occurrence may be in the past; projections start today.
        if (isOpenOccurrence || dueKey >= todayKey || first) {
          upcoming.push(self.occurrence(series, dueKey, todayKey, isOpenOccurrence ? series.evidence : { state: 'none' }, index));
        }
        first = false;
        index++;
        dueKey = self.stepKey(series.nextDue, series.frequency, index);
        if (index > 60) break;
      }
    });

    upcoming.sort(function(a, b) {
      if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const history = (model.history || []).concat(confirmedNow)
      .filter(function(item) { return !opts.kind || item.kind === opts.kind; })
      .sort(function(a, b) {
        const left = a.paidDate || a.dueDate;
        const right = b.paidDate || b.dueDate;
        return left === right ? 0 : (left < right ? 1 : -1);
      });

    return {
      today: todayKey,
      upcoming: opts.limit ? upcoming.slice(0, opts.limit) : upcoming,
      totals: {
        next7Days: this.totalWithin(upcoming, 7),
        next30Days: this.totalWithin(upcoming, 30)
      },
      totalsByKind: [this.KINDS.BILL, this.KINDS.SUBSCRIPTION].reduce(function(byKind, kind) {
        const ofKind = upcoming.filter(function(item) { return item.kind === kind; });
        byKind[kind] = { next7Days: self.totalWithin(ofKind, 7), next30Days: self.totalWithin(ofKind, 30) };
        return byKind;
      }, {}),
      history: history,
      notes: (model.notes || []).slice()
    };
  },

  occurrence: function(series, dueKey, todayKey, evidence, index) {
    const S = this.STATUSES;
    const days = this.daysBetween(todayKey, dueKey);
    let status;
    if (evidence && evidence.state === 'review') status = S.NEEDS_REVIEW;
    else if (days > 0) status = S.UPCOMING;
    else if (days === 0) status = S.DUE_TODAY;
    else if (-days <= this.AWAITING_GRACE_DAYS) status = S.AWAITING;
    else status = S.OVERDUE;
    return {
      occurrenceId: series.seriesId + '@' + dueKey,
      kind: series.kind, sourceId: series.sourceId, paymentId: index === 0 ? series.paymentId : '',
      name: series.name, category: series.category, frequency: series.frequency,
      amount: series.amount, priceChange: series.priceChange || 0,
      dueDate: dueKey, daysRemaining: days, countdown: this.countdownText(days),
      status: status, projected: index > 0,
      evidence: evidence && evidence.state !== 'none' ? evidence.source : ''
    };
  },

  countdownText: function(days) {
    if (days === 0) return 'Due today';
    if (days === 1) return 'Tomorrow';
    if (days > 1) return 'In ' + days + ' days';
    if (days === -1) return '1 day ago';
    return (-days) + ' days ago';
  },

  /** Unpaid amounts due before today + days, including anything still outstanding. */
  totalWithin: function(upcoming, days) {
    const within = upcoming.filter(function(item) { return item.daysRemaining < days; });
    const known = within.filter(function(item) { return item.amount !== null; });
    return {
      amount: Math.round(known.reduce(function(sum, item) { return sum + item.amount; }, 0) * 100) / 100,
      count: within.length,
      outstandingCount: within.filter(function(item) { return item.daysRemaining < 0; }).length,
      unknownAmountCount: within.length - known.length
    };
  },

  normaliseName: function(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  },

  isTrue: function(value) {
    return value === true || String(value).toUpperCase() === 'TRUE';
  }
});
