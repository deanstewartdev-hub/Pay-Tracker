/*******************************************************
 * PAY TRACKER V3.3 (Step 3 - Smart Savings)
 * Pure: how much can genuinely be saved for the rest of this
 * month, from what has ACTUALLY happened in the bank, and how
 * it would be split across the existing Savings Pots.
 *
 * No sheet access. SmartSavingsService reads the sheets and
 * passes in Step 2A's cash-flow proposals and Step 2B's payment
 * timeline. Nothing here moves money or writes anything.
 *
 * Actual vs planned:
 *  - PLANNED is the existing module's own figure (each pot's
 *    Monthly Equivalent, from estimated take-home pay). Shown
 *    unchanged for comparison.
 *  - ACTUAL starts from money actually received this month and
 *    subtracts what has actually gone out, what is still due
 *    before month end, and what has already been saved.
 *
 * Deliberately conservative: income that is unconfirmed or still
 * pending is NOT added; outgoings that are unconfirmed or pending
 * ARE subtracted. Expected-but-unpaid income (a salary later this
 * month) is planned, not actual, so it is not counted.
 *******************************************************/

const PayTrackerSmartSavingsCalculator = Object.freeze({
  MATCH_WINDOW_DAYS: 3,

  /**
   * @param {Object} input
   *   today, cashFlow (2A proposals), upcoming (2B occurrences),
   *   payments, matchedPaymentIds, pots, contributions, history,
   *   goals, settings {mode, percentage, fixedAmount, maximumAmount}
   */
  calculate: function(input) {
    const T = PayTrackerPaymentTimeline;
    const todayKey = T.dayKey(input.today);
    const parts = todayKey.split('-').map(Number);
    const monthStart = T.dayKey(new Date(parts[0], parts[1] - 1, 1));
    const monthEnd = T.dayKey(new Date(parts[0], parts[1], 0));
    const period = { from: monthStart, to: monthEnd, today: todayKey, daysLeft: T.daysBetween(todayKey, monthEnd) + 1 };
    const warnings = [];

    const actual = this.actuals(input.cashFlow || [], period);
    const committed = this.commitments(input, period, actual, warnings);
    const pots = this.readPots(input.pots || [], actual.depositsByMonzoPot, input.history || [], period);
    // Net bank movement into pots this month (a withdrawal makes it smaller, or negative).
    const savedThisMonth = actual.savedThisMonth;

    const disposable = this.round(
      actual.income - actual.spending + actual.refunds - actual.billsPaid
      - actual.uncertainOut - actual.pendingOut
      - actual.ownTransfersOut + actual.ownTransfersIn
      - committed.total - savedThisMonth
    );

    // Towards the monthly target and cap: money put into pots this month. A
    // withdrawal is not "negative saving" that raises the cap, and contributions
    // recorded for pots Monzo cannot see (e.g. an ISA elsewhere) still count.
    const recordedElsewhere = pots.filter(function(pot) { return !pot.monzoPotId; })
      .reduce(function(sum, pot) { return sum + Math.max(pot.savedThisMonth, 0); }, 0);
    const savedTowardsTarget = this.round(Math.max(savedThisMonth, 0) + recordedElsewhere);

    const suggestion = this.suggest(input.settings || {}, disposable, savedTowardsTarget, warnings);
    const distribution = this.distribute(suggestion.amount, pots, warnings);
    const planned = this.planned(pots);

    if (actual.income === 0) {
      warnings.push('No confirmed income has arrived this month yet, so nothing is suggested from actual money. ' +
        'Your planned savings (' + this.money(planned.total) + '/month) are unchanged.');
    }
    if (actual.ownTransfersOut > 0) {
      warnings.push(this.money(actual.ownTransfersOut) + ' moved to your own other accounts is not spending, ' +
        'but it is no longer in Monzo, so it is not counted as available.');
    }
    if (actual.uncertainIn > 0) {
      warnings.push(this.money(actual.uncertainIn) + ' of incoming money needs confirming in Money Movements before it can count.');
    }

    const confirmations = this.confirmations(input.contributions || [], pots, actual.potDeposits, period);
    const unverified = this.unverifiedRecords(input.history || [], pots, actual.potDeposits, confirmations, period);
    if (unverified.length) {
      warnings.push(unverified.length + ' contribution(s) recorded this month for Monzo-linked pots are not in Monzo yet. ' +
        'They are not counted as saved; check Monzo if a sync has run since.');
    }

    return {
      period: period,
      actual: actual.summary,
      committed: committed,
      savedThisMonth: savedThisMonth,
      savedTowardsTarget: savedTowardsTarget,
      disposable: disposable,
      suggestion: suggestion,
      distribution: distribution.pots,
      unallocated: distribution.unallocated,
      planned: planned,
      goals: this.goals(input.goals || [], pots, distribution.pots),
      confirmations: confirmations,
      unverifiedRecords: unverified,
      warnings: warnings
    };
  },

  /* Money that has actually moved this month, from Step 2A's proposals. */
  actuals: function(proposals, period) {
    const C = PayTrackerCashFlowClassifier.CATEGORIES;
    const K = PayTrackerCashFlowClassifier.CONFIDENCE;
    const S = PayTrackerCashFlowClassifier.STATUSES;
    const T = PayTrackerPaymentTimeline;
    const sum = { income: 0, spending: 0, refunds: 0, billsPaid: 0, debtPaid: 0, subscriptionsPaid: 0,
      uncertainOut: 0, uncertainIn: 0, pendingOut: 0, savedThisMonth: 0, ownTransfersOut: 0, ownTransfersIn: 0 };
    const transactionIds = {};
    const depositsByMonzoPot = {};
    const potDeposits = [];
    // Settled outgoing payments, used to spot a past-due bill or subscription already paid.
    const debits = [];

    proposals.forEach(function(p) {
      const day = T.dayKey(p.date);
      if (!day || day < period.from || day > period.to || p.status === S.EXCLUDED) return;
      // The bank is the truth here: a transaction already recorded in (or possibly
      // duplicated by) the ledger is still money that moved, counted once.
      if (p.transactionId) transactionIds[p.transactionId] = true;
      const out = p.direction !== 'Credit';
      // A "Possible duplicate" of a manual ledger entry is still real bank money:
      // judge it by how sure its category is, not by the ledger doubt.
      const unsure = (p.categoryConfidence || p.confidence) === K.NEEDS_CONFIRMATION;
      if (p.status === S.PENDING) {
        // Pending money out has already left the spendable balance (pot moves included).
        if (out) sum.pendingOut += p.amount;
        return;
      }
      if (out && !p.internalTransfer) {
        debits.push({ transactionId: p.transactionId, amount: p.amount, date: day, text: String(p.description || '') });
      }
      if (p.category === C.SAVINGS) {
        const potId = (/pot_[0-9a-z]+/i.exec(p.description || '') || [''])[0];
        const signed = out ? p.amount : -p.amount;
        sum.savedThisMonth += signed;
        if (potId) {
          depositsByMonzoPot[potId] = (depositsByMonzoPot[potId] || 0) + signed;
          if (out) potDeposits.push({ transactionId: p.transactionId, monzoPotId: potId, amount: p.amount, date: day });
        }
        return;
      }
      if (p.category === C.TRANSFER) {
        if (unsure) {
          if (out) sum.uncertainOut += p.amount; else sum.uncertainIn += p.amount;
        } else if (out) {
          // Not spending, but no longer in Monzo to save from.
          sum.ownTransfersOut += p.amount;
        } else {
          // Not income, but now in Monzo.
          sum.ownTransfersIn += p.amount;
        }
        return;
      }
      if (unsure) {
        if (out) sum.uncertainOut += p.amount; else sum.uncertainIn += p.amount;
        return;
      }
      if (!out) {
        if (p.category === C.REFUND) sum.refunds += p.amount;
        else if (p.category === C.UNRECOGNISED) sum.uncertainIn += p.amount;
        else sum.income += p.amount;
        return;
      }
      if (p.category === C.BILL) sum.billsPaid += p.amount;
      else if (p.category === C.DEBT) { sum.billsPaid += p.amount; sum.debtPaid += p.amount; }
      else if (p.category === C.SUBSCRIPTION) { sum.billsPaid += p.amount; sum.subscriptionsPaid += p.amount; }
      else if (p.category === C.UNRECOGNISED) sum.uncertainOut += p.amount;
      else sum.spending += p.amount;
    });

    const self = this;
    Object.keys(sum).forEach(function(key) { sum[key] = self.round(sum[key]); });
    return Object.assign({}, sum, {
      summary: {
        incomeReceived: sum.income, spending: sum.spending, refunds: sum.refunds,
        billsPaid: sum.billsPaid, debtRepaymentsPaid: sum.debtPaid, subscriptionsPaid: sum.subscriptionsPaid,
        pendingOutgoing: sum.pendingOut, unconfirmedOutgoing: sum.uncertainOut, unconfirmedIncoming: sum.uncertainIn,
        movedToOwnAccounts: sum.ownTransfersOut, receivedFromOwnAccounts: sum.ownTransfersIn
      },
      transactionIds: transactionIds,
      debits: debits,
      depositsByMonzoPot: depositsByMonzoPot,
      potDeposits: potDeposits
    });
  },

  /*
   * Still to pay before month end: Step 2B bills/subscriptions plus unpaid debt repayments.
   * Anything due before this month with no bank confirmation is listed as carried over
   * and NOT deducted: an unconfirmed July bill would otherwise reduce every later month.
   */
  commitments: function(input, period, actual, warnings) {
    const self = this;
    const T = PayTrackerPaymentTimeline;
    const countedTransactions = actual.transactionIds;
    const items = [];
    const likelyPaid = [];
    const carriedOver = [];
    const usedDebits = {};
    let outstanding = 0;
    (input.pastDue || []).concat(input.upcoming || []).forEach(function(item) {
      if (item.dueDate > period.to) return;
      if (item.dueDate < period.from) {
        carriedOver.push({ kind: item.kind, name: item.name, dueDate: item.dueDate, amount: item.amount, status: item.status });
        return;
      }
      // Its bank transaction is already in this month's actuals: don't subtract it twice.
      if (item.evidenceTransactionId && countedTransactions[item.evidenceTransactionId]) return;
      if (item.daysRemaining <= 0) {
        // Past due with no linked evidence, but a payment that looks like it left
        // the account this month: it is already in the actuals, so don't subtract
        // it again. It is NOT marked paid anywhere; the owner still confirms it.
        const paid = self.findLikelyPayment(item, actual.debits, usedDebits);
        if (paid) {
          usedDebits[paid.transactionId] = true;
          likelyPaid.push({ name: item.name, dueDate: item.dueDate, amount: item.amount, paidDate: paid.date, transactionId: paid.transactionId });
          return;
        }
      }
      if (item.daysRemaining < 0) outstanding++;
      items.push({ kind: item.kind, name: item.name, dueDate: item.dueDate, amount: item.amount, status: item.status });
    });
    this.debtCommitments(input, period).forEach(function(item) {
      if (item.dueDate < period.from) {
        carriedOver.push(item);
        return;
      }
      if (item.dueDate < period.today) outstanding++;
      items.push(item);
    });
    items.sort(function(a, b) { return a.dueDate === b.dueDate ? 0 : (a.dueDate < b.dueDate ? -1 : 1); });
    const unknown = items.filter(function(item) { return item.amount === null; }).length;
    if (unknown) warnings.push(unknown + ' payment(s) due this month have no known amount and are not deducted - check them before saving.');
    if (outstanding) warnings.push(outstanding + ' past-due payment(s) have no bank confirmation yet, so they are still treated as money to pay.');
    if (carriedOver.length) {
      carriedOver.sort(function(a, b) { return a.dueDate === b.dueDate ? 0 : (a.dueDate < b.dueDate ? -1 : 1); });
      const carriedTotal = carriedOver.reduce(function(s, i) { return s + (i.amount || 0); }, 0);
      warnings.push(carriedOver.length + ' payment(s) due before this month (' + this.money(carriedTotal) + ') have no bank confirmation. ' +
        'They are not deducted from this month: mark them paid in Finance if they were paid.');
    }
    likelyPaid.forEach(function(item) {
      warnings.push(item.name + ' (due ' + item.dueDate + ') looks paid on ' + item.paidDate +
        ', so it is not deducted twice. Confirm the match in Finance so it moves to history.');
    });
    const totalOf = function(kind) {
      return self.round(items.filter(function(i) { return i.kind === kind && i.amount !== null; })
        .reduce(function(s, i) { return s + i.amount; }, 0));
    };
    const bills = totalOf('Bill');
    const subscriptions = totalOf('Subscription');
    const debts = totalOf('Debt');
    return { bills: bills, subscriptions: subscriptions, debts: debts, total: this.round(bills + subscriptions + debts),
      items: items, likelyPaid: likelyPaid, carriedOver: carriedOver };
  },

  /*
   * A settled debit this month that is plausibly this payment: same
   * amount (within 1p or 1%), dated 5 days before to 10 days after the
   * due date, and the payee's name contains the payment's name (or the
   * reverse). Each debit can only be used once.
   */
  findLikelyPayment: function(item, debits, used) {
    const T = PayTrackerPaymentTimeline;
    if (item.amount === null || item.amount === undefined) return null;
    const name = PayTrackerPaymentTimeline.normaliseName(item.name);
    if (name.length < 3) return null;
    return (debits || []).filter(function(debit) {
      if (used[debit.transactionId]) return false;
      const payee = PayTrackerPaymentTimeline.normaliseName(debit.text);
      const offset = T.daysBetween(item.dueDate, debit.date);
      return Math.abs(debit.amount - item.amount) <= Math.max(0.01, 0.01 * item.amount) &&
        offset >= -5 && offset <= 10 && payee.length >= 3 &&
        (payee.indexOf(name) !== -1 || name.indexOf(payee) !== -1);
    })[0] || null;
  },

  /*
   * Debt repayments still to pay before month end. The Finance Payments
   * queue holds only the next repayment per debt, so later repayments of
   * weekly/fortnightly debts are projected from the Debts sheet.
   */
  debtCommitments: function(input, period) {
    const T = PayTrackerPaymentTimeline;
    const matched = input.matchedPaymentIds || {};
    const items = [];
    const anchors = {};
    (input.payments || []).forEach(function(row) {
      const type = String(row.paymentType || '');
      const due = T.dayKey(row.dueDate);
      if (!/debt/i.test(type) || !due) return;
      // Anchor even a ticked row, so its repayment is not re-added from the Debts sheet.
      if (type === 'Debt Repayment') {
        const itemId = String(row.itemId || '');
        if (!anchors[itemId] || due < anchors[itemId]) anchors[itemId] = due;
      }
      if (T.isTrue(row.paid) || due > period.to) return;
      // A bank transaction already matched to this repayment is counted in the actuals.
      if (matched[String(row.paymentId || '')]) return;
      const amount = Number(row.amountDue);
      items.push({ kind: 'Debt', name: String(row.billOrDebtName || ''), dueDate: due, amount: amount > 0 ? amount : null,
        status: due < period.today ? 'Overdue' : 'Upcoming' });
    });
    (input.debts || []).forEach(function(debt) {
      const id = String(debt.debtId || '').trim();
      if (!id || String(debt.active || '').trim() !== 'Yes') return;
      const frequency = String(debt.frequency || '');
      const amount = Number(debt.repaymentAmount);
      // Without a queued row, the Debts sheet's next date is the first one.
      const anchor = anchors[id] || T.dayKey(debt.nextPaymentDate);
      if (!anchor) return;
      if (!anchors[id] && anchor >= period.today && anchor <= period.to) {
        items.push({ kind: 'Debt', name: String(debt.debtName || id), dueDate: anchor, amount: amount > 0 ? amount : null, status: 'Upcoming' });
      }
      for (let step = 1; step <= 10; step++) {
        const due = T.stepKey(anchor, frequency, step);
        if (!due || due > period.to) break;
        if (due < period.today) continue;
        items.push({ kind: 'Debt', name: String(debt.debtName || id), dueDate: due, amount: amount > 0 ? amount : null, status: 'Upcoming' });
      }
    });
    return items;
  },

  readPots: function(rows, depositsByMonzoPot, history, period) {
    const T = PayTrackerPaymentTimeline;
    const self = this;
    const recorded = {};
    history.forEach(function(h) {
      const day = T.dayKey(h.depositedDate);
      if (!day || day < period.from || day > period.to || String(h.undoStatus || '') === 'Undone') return;
      recorded[h.potId] = (recorded[h.potId] || 0) + (Number(h.amountDeposited) || 0);
    });
    return rows.filter(function(row) { return String(row.potId || '').trim() && String(row.potName || '').trim(); })
      .map(function(row) {
        const monzoPotId = String(row.linkedMonzoPotId || '').trim();
        const balance = Number(row.currentBalance) || 0;
        const goal = Number(row.goalAmount) || 0;
        // A Monzo-linked pot's deposits are read from the bank; others from Savings History.
        const saved = monzoPotId ? (depositsByMonzoPot[monzoPotId] || 0) : (recorded[row.potId] || 0);
        return {
          potId: String(row.potId), name: String(row.potName), active: String(row.active || 'Yes') === 'Yes',
          method: String(row.contributionMethod || 'Percentage Allocation'),
          allocation: Math.max(Number(row.allocation) || 0, 0),
          plannedMonthly: self.round(Number(row.monthlyEquivalent) || 0),
          balance: self.round(balance), goal: self.round(goal),
          complete: goal > 0 && balance >= goal,
          linkedGoalId: String(row.linkedGoalId || ''), monzoPotId: monzoPotId,
          savedThisMonth: self.round(saved), savedSource: monzoPotId ? 'Monzo' : 'Savings History'
        };
      });
  },

  suggest: function(settings, disposable, savedThisMonth, warnings) {
    const mode = String(settings.mode || 'Percentage of Disposable Income');
    const percentage = Math.max(Number(settings.percentage) || 0, 0);
    const fixed = Math.max(Number(settings.fixedAmount) || 0, 0);
    const maximum = Math.max(Number(settings.maximumAmount) || 0, 0);
    const available = Math.max(disposable, 0);
    let amount;
    let basis;
    if (mode === 'Fixed Monthly Amount') {
      amount = Math.min(Math.max(fixed - savedThisMonth, 0), available);
      basis = 'Your fixed ' + this.money(fixed) + '/month, less ' + this.money(savedThisMonth) + ' already saved, limited to what is actually available.';
      if (fixed - savedThisMonth > available) warnings.push('Only ' + this.money(available) + ' is genuinely available, less than your fixed monthly amount still to save.');
    } else {
      amount = available * percentage;
      basis = Math.round(percentage * 100) + '% of the ' + this.money(available) + ' genuinely available.';
    }
    let cappedBy = '';
    if (maximum > 0 && amount > maximum - savedThisMonth) {
      amount = Math.max(maximum - savedThisMonth, 0);
      cappedBy = 'Maximum Monthly Savings (' + this.money(maximum) + ', ' + this.money(savedThisMonth) + ' already saved)';
    }
    if (disposable < 0) warnings.push('Spending and commitments this month exceed the money received by ' + this.money(-disposable) + '. Nothing is suggested.');
    return { mode: mode, percentage: percentage, amount: this.floorPennies(amount), basis: basis, cappedBy: cappedBy };
  },

  /*
   * Fixed-amount pots first (what is still due on their plan this
   * month), then the rest by Allocation %. Completed or inactive
   * pots get nothing; their share stays unallocated.
   */
  distribute: function(amount, pots, warnings) {
    const self = this;
    let remaining = amount;
    const out = pots.map(function(pot) {
      return { potId: pot.potId, name: pot.name, method: pot.method, allocation: pot.allocation,
        plannedMonthly: pot.plannedMonthly, savedThisMonth: pot.savedThisMonth, savedSource: pot.savedSource,
        balance: pot.balance, goal: pot.goal, suggested: 0, note: '' };
    });
    out.forEach(function(entry, i) {
      const pot = pots[i];
      if (!pot.active) { entry.note = 'Inactive'; return; }
      if (pot.complete) { entry.note = 'Goal reached'; return; }
      if (pot.method !== 'Fixed Amount') return;
      // A withdrawal this month is not a reason to suggest more than the plan.
      const need = Math.max(pot.plannedMonthly - Math.max(pot.savedThisMonth, 0), 0);
      entry.suggested = self.floorPennies(Math.min(need, remaining));
      remaining = self.round(remaining - entry.suggested);
      if (need === 0) entry.note = 'Already saved its fixed amount this month';
    });
    const sharePots = out.filter(function(entry, i) {
      return pots[i].active && !pots[i].complete && pots[i].method !== 'Fixed Amount' && pots[i].allocation > 0;
    });
    const totalAllocation = pots.filter(function(p) { return p.active && p.method !== 'Fixed Amount'; })
      .reduce(function(s, p) { return s + p.allocation; }, 0);
    if (totalAllocation > 1.0001) warnings.push('Pot allocations add up to ' + Math.round(totalAllocation * 100) + '%, so they were scaled to 100% for this suggestion.');
    const scale = Math.max(totalAllocation, 1);
    const pool = remaining;
    sharePots.forEach(function(entry) {
      entry.suggested = self.floorPennies(pool * entry.allocation / scale);
      remaining = self.round(remaining - entry.suggested);
    });
    out.forEach(function(entry) {
      entry.balanceAfter = self.round(entry.balance + entry.suggested);
      entry.progressAfter = entry.goal > 0 ? Math.min(entry.balanceAfter / entry.goal, 1) : null;
    });
    return { pots: out, unallocated: this.round(Math.max(remaining, 0)) };
  },

  planned: function(pots) {
    const active = pots.filter(function(p) { return p.active; });
    return {
      total: this.round(active.reduce(function(s, p) { return s + p.plannedMonthly; }, 0)),
      source: 'Each pot\'s Monthly Equivalent from the existing Savings module (based on estimated take-home pay).'
    };
  },

  goals: function(rows, pots, distribution) {
    const self = this;
    return rows.filter(function(g) { return String(g.goalId || '').trim() && String(g.active || 'Yes') === 'Yes'; })
      .map(function(g) {
        const target = Number(g.targetAmount) || 0;
        const current = Number(g.currentLinkedSavings) || 0;
        const extra = distribution.filter(function(d, i) { return pots[i].linkedGoalId === String(g.goalId); })
          .reduce(function(s, d) { return s + d.suggested; }, 0);
        return {
          goalId: String(g.goalId), name: String(g.goalName || ''), category: String(g.category || ''),
          target: self.round(target), current: self.round(current), suggestedThisMonth: self.round(extra),
          progress: target > 0 ? Math.min(current / target, 1) : null,
          progressAfter: target > 0 ? Math.min((current + extra) / target, 1) : null,
          remainingAfter: self.round(Math.max(target - current - extra, 0))
        };
      });
  },

  /*
   * Queued contributions due this month that are not marked as
   * deposited, each with any Monzo pot deposit that looks like it
   * (same linked pot, same amount, within 3 days). One deposit
   * supports one contribution. The owner confirms; nothing auto-confirms.
   */
  confirmations: function(rows, pots, potDeposits, period) {
    const T = PayTrackerPaymentTimeline;
    const self = this;
    const used = {};
    const potById = {};
    pots.forEach(function(p) { potById[p.potId] = p; });
    return rows.filter(function(row) {
      const due = T.dayKey(row.dueDate);
      return String(row.contributionId || '').trim() && !T.isTrue(row.deposited) &&
        String(row.status || '') !== 'Completed' && due && due <= period.to;
    }).map(function(row) {
      const due = T.dayKey(row.dueDate);
      const amount = self.round(Number(row.contributionAmount) || 0);
      const pot = potById[row.potId] || {};
      const match = potDeposits.filter(function(d) {
        return !used[d.transactionId] && pot.monzoPotId && d.monzoPotId === pot.monzoPotId &&
          Math.abs(d.amount - amount) < 0.005 && Math.abs(T.daysBetween(due, d.date)) <= self.MATCH_WINDOW_DAYS;
      })[0];
      if (match) used[match.transactionId] = true;
      return {
        contributionId: String(row.contributionId), potId: String(row.potId || ''), potName: String(row.potName || pot.name || ''),
        dueDate: due, amount: amount,
        // A Monzo-linked pot can only be recorded once Monzo shows the deposit.
        monzoLinked: Boolean(pot.monzoPotId),
        bankEvidence: match ? { transactionId: match.transactionId, date: match.date, amount: match.amount } : null
      };
    });
  },

  /*
   * Contributions already recorded this month for Monzo-linked pots
   * that no Monzo pot deposit supports yet: a delayed sync, or money
   * that was never actually moved. Shown for review; nothing changes.
   * Deposits already supporting a queued contribution are not reused.
   */
  unverifiedRecords: function(history, pots, potDeposits, confirmations, period) {
    const T = PayTrackerPaymentTimeline;
    const self = this;
    const used = {};
    confirmations.forEach(function(c) { if (c.bankEvidence) used[c.bankEvidence.transactionId] = true; });
    const potById = {};
    pots.forEach(function(p) { potById[p.potId] = p; });
    return history.filter(function(h) {
      const day = T.dayKey(h.depositedDate);
      const pot = potById[h.potId];
      return pot && pot.monzoPotId && day && day >= period.from && day <= period.to &&
        String(h.undoStatus || '') !== 'Undone';
    }).map(function(h) {
      const pot = potById[h.potId];
      const amount = self.round(Number(h.amountDeposited) || 0);
      const recorded = T.dayKey(h.depositedDate);
      const due = T.dayKey(h.originalDueDate) || recorded;
      const match = potDeposits.filter(function(d) {
        return !used[d.transactionId] && d.monzoPotId === pot.monzoPotId && Math.abs(d.amount - amount) < 0.005 &&
          (Math.abs(T.daysBetween(recorded, d.date)) <= self.MATCH_WINDOW_DAYS ||
            Math.abs(T.daysBetween(due, d.date)) <= self.MATCH_WINDOW_DAYS);
      })[0];
      if (match) used[match.transactionId] = true;
      return match ? null : {
        contributionId: String(h.contributionId || ''), potName: pot.name, amount: amount, recordedDate: recorded,
        daysSinceRecorded: T.daysBetween(recorded, period.today)
      };
    }).filter(Boolean);
  },

  round: function(value) { return Math.round((Number(value) || 0) * 100) / 100; },
  floorPennies: function(value) { return Math.max(Math.floor((Number(value) || 0) * 100 + 1e-6) / 100, 0); },
  money: function(value) { return '£' + (Number(value) || 0).toFixed(2); }
});
