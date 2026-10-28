/*******************************************************
 * PAY TRACKER V3.3 (Step 2A - Actual Cash Flow)
 * Pure bank-transaction -> cash-flow classification.
 *
 * No sheet access here: CashFlowPreviewService reads everything
 * and hands it in, so every rule is testable on plain objects.
 *
 * Rules, strongest evidence first:
 *  1. Declined transactions and repeated transaction IDs are
 *     excluded (a Monzo transaction ID is counted once, ever).
 *  2. Monzo pot transfers (description "pot_...") are Savings
 *     Transfers -- never income or spending.
 *  3. A Confirmed/Automatic bill or debt match is a Bill/Debt
 *     Payment; a Suggested one needs confirmation; Rejected is
 *     ignored. This is the existing TransactionMatchingService
 *     result, read, never re-decided.
 *  4. A Subscription Transactions link is a Subscription Payment
 *     (unless rule 3 already made it a bill: one transaction is
 *     one movement, so a bill that is also a subscription is
 *     never counted twice).
 *  5. A manual (or rule-suggested) Pay Tracker Category.
 *  6. Monzo's own signals (merchant, category, employer names).
 *  7. Anything else is Unrecognised and needs confirmation.
 *
 * Then the result is checked against the existing Money
 * Movements ledger: a movement already linked to the same
 * transaction ID means "Already recorded"; a manual movement
 * with the same amount and type within a few days means
 * "Possible duplicate". Neither is counted again.
 *******************************************************/

const PayTrackerCashFlowClassifier = Object.freeze({
  CATEGORIES: Object.freeze({
    SALARY: 'Salary Income',
    OTHER_INCOME: 'Other Income',
    SPENDING: 'Everyday Spending',
    BILL: 'Bill Payment',
    DEBT: 'Debt Payment',
    SUBSCRIPTION: 'Subscription Payment',
    REFUND: 'Refund',
    SAVINGS: 'Savings Transfer',
    TRANSFER: 'Internal Transfer',
    INTEREST: 'Interest',
    UNRECOGNISED: 'Unrecognised'
  }),

  CONFIDENCE: Object.freeze({
    CONFIRMED: 'Confirmed',
    LIKELY: 'Likely',
    NEEDS_CONFIRMATION: 'Needs confirmation'
  }),

  STATUSES: Object.freeze({
    NEW: 'New',
    ALREADY_RECORDED: 'Already recorded',
    POSSIBLE_DUPLICATE: 'Possible duplicate',
    PENDING: 'Pending',
    EXCLUDED: 'Excluded'
  }),

  // A manual ledger entry this close to a bank transaction of the
  // same amount and type is treated as possibly the same money.
  DUPLICATE_WINDOW_DAYS: 3,

  /**
   * @param {Array<Object>} transactions Bank Transactions rows (camelCase keys).
   * @param {Object} context {movements, subscriptionLinks, linkedPotIds, employerKeywords}
   * @return {Array<Object>} one proposal per transaction row, in input order.
   */
  classifyAll: function(transactions, context) {
    const self = this;
    const ctx = this.buildContext(context || {});
    const seen = {};
    return (transactions || []).map(function(tx) {
      const id = String(tx.transactionId || '').trim();
      if (id && seen[id]) {
        return self.proposal(tx, self.CATEGORIES.UNRECOGNISED, self.CONFIDENCE.CONFIRMED,
          'Repeated row for a transaction already in this preview.', self.STATUSES.EXCLUDED);
      }
      if (id) seen[id] = true;
      return self.reconcileWithLedger(self.classify(tx, ctx), ctx);
    });
  },

  buildContext: function(context) {
    const byTransaction = {};
    const manual = [];
    // Manual entries indexed by amount in pennies: sameMoney() needs equal
    // amounts anyway, so only these need comparing (6k x 800 rows took ~1s).
    const manualByPennies = {};
    const self = this;
    (context.movements || []).forEach(function(movement) {
      const related = String(movement.relatedTransactionId || '').trim();
      if (related) { byTransaction[related] = movement; return; }
      manual.push(movement);
      const key = self.pennies(movement.amount);
      (manualByPennies[key] = manualByPennies[key] || []).push(movement);
    });
    const links = {};
    (context.subscriptionLinks || []).forEach(function(link) {
      const id = String(link.transactionId || '').trim();
      if (id && !links[id]) links[id] = link;
    });
    const pots = {};
    (context.linkedPotIds || []).forEach(function(potId) {
      if (potId) pots[String(potId).trim()] = true;
    });
    return {
      ledgerByTransaction: byTransaction,
      manualMovements: manual,
      manualByPennies: manualByPennies,
      subscriptionLinks: links,
      linkedPots: pots,
      employerKeywords: (context.employerKeywords || [])
        .map(function(word) { return String(word || '').toLowerCase().trim(); })
        .filter(function(word) { return word.length >= 3; })
    };
  },

  classify: function(tx, ctx) {
    const C = this.CATEGORIES;
    const K = this.CONFIDENCE;
    const isCredit = String(tx.debitOrCredit || tx.direction || '') === 'Credit';
    const description = String(tx.description || '').trim();
    const text = (description + ' ' + String(tx.merchantName || '')).toLowerCase();
    const monzoCategory = String(tx.category || '').toLowerCase().trim();
    const hasMerchant = String(tx.merchantId || '').trim() !== '';

    if (this.isTrue(tx.declined)) {
      return this.proposal(tx, C.UNRECOGNISED, K.CONFIRMED, 'Declined by the bank - no money moved.', this.STATUSES.EXCLUDED);
    }

    let result = null;

    if (/^pot_[0-9a-z]+$/i.test(description)) {
      result = [C.SAVINGS, ctx.linkedPots[description] ? K.CONFIRMED : K.LIKELY,
        (isCredit ? 'Withdrawal from' : 'Deposit to') + ' Monzo pot ' + description +
        (ctx.linkedPots[description] ? ' (linked Savings Pot).' : '.')];
    }

    if (!result) result = this.fromFinanceMatch(tx);

    if (!result) {
      const link = ctx.subscriptionLinks[String(tx.transactionId || '').trim()];
      if (link && !isCredit) {
        result = [C.SUBSCRIPTION, this.isTrue(link.confirmed) ? K.CONFIRMED : K.NEEDS_CONFIRMATION,
          'Linked to subscription ' + (link.subscriptionId || '') +
          (this.isTrue(link.confirmed) ? '.' : ' (link not yet confirmed).')];
      }
    }

    if (!result) result = this.fromPayTrackerCategory(tx, isCredit);

    // Money sent to the Credit Union loan account is a transfer out of Monzo,
    // not spending: the loan repayment itself is the Debt commitment (or the
    // matched Debt payment), so it is counted once, there.
    let loanAccount = false;
    if (!result && !isCredit && this.isLoanAccountPayment(text)) {
      result = [C.TRANSFER, K.LIKELY,
        'Payment to your loan account. It counts towards the loan only once matched to a Debt payment.'];
      loanAccount = true;
    }

    if (!result && isCredit) {
      if (/\binterest\b/.test(text)) {
        result = [C.INTEREST, K.LIKELY, 'Credit described as interest.'];
      } else if (this.matchesEmployer(text, ctx.employerKeywords)) {
        result = [C.SALARY, K.LIKELY, 'Credit from a known employer.'];
      } else if (/\brefund/.test(text) || hasMerchant) {
        result = [C.REFUND, K.LIKELY, 'Credit from a merchant.'];
      } else if (monzoCategory === 'income') {
        result = [C.OTHER_INCOME, K.NEEDS_CONFIRMATION, 'Monzo marks this as income, but no known employer matched.'];
      } else if (monzoCategory === 'transfers') {
        result = [C.TRANSFER, K.NEEDS_CONFIRMATION, 'Incoming transfer: your own account, or money from someone else?'];
      }
    }

    if (!result && !isCredit) {
      if (monzoCategory === 'transfers') {
        result = [C.TRANSFER, K.NEEDS_CONFIRMATION, 'Outgoing transfer: to your own account, or a payment to someone?'];
      } else if (monzoCategory === 'bills') {
        result = [C.BILL, K.NEEDS_CONFIRMATION, 'Monzo marks this as a bill, but it matches none of your Bills.'];
      } else if (hasMerchant) {
        result = [C.SPENDING, K.LIKELY, 'Card or merchant payment.'];
      }
    }

    if (!result) {
      result = [C.UNRECOGNISED, K.NEEDS_CONFIRMATION, 'Not enough information to classify.'];
    }

    const proposal = this.proposal(tx, result[0], result[1], result[2],
      this.isTrue(tx.pending) ? this.STATUSES.PENDING : this.STATUSES.NEW);
    proposal.loanAccount = loanAccount;
    return proposal;
  },

  // Payees that are the owner's loan accounts (outgoing payments only).
  LOAN_ACCOUNT_NAMES: Object.freeze(['credit union']),

  isLoanAccountPayment: function(text) {
    const lower = String(text || '').toLowerCase();
    return this.LOAN_ACCOUNT_NAMES.some(function(name) { return lower.indexOf(name) !== -1; });
  },

  fromFinanceMatch: function(tx) {
    const status = String(tx.matchStatus || '').trim();
    const type = String(tx.matchedFinanceType || '').trim();
    if (!type || status === 'Rejected' || status === 'Unmatched' || status === '') return null;
    const category = /debt/i.test(type) ? this.CATEGORIES.DEBT : this.CATEGORIES.BILL;
    const confirmed = status === 'Confirmed' || status === 'Automatic';
    return [category, confirmed ? this.CONFIDENCE.CONFIRMED : this.CONFIDENCE.NEEDS_CONFIRMATION,
      (confirmed ? 'Matched to ' : 'Suggested match to ') + type + ' ' + (tx.matchedFinanceId || '') + '.'];
  },

  // Pay Tracker Category values the user (or a rule) may have set.
  CATEGORY_SYNONYMS: Object.freeze({
    'salary': 'Salary Income', 'salary income': 'Salary Income', 'wages': 'Salary Income',
    'income': 'Other Income', 'other income': 'Other Income',
    'bill': 'Bill Payment', 'bills': 'Bill Payment', 'bill payment': 'Bill Payment',
    'debt': 'Debt Payment', 'debt payment': 'Debt Payment', 'debt repayment': 'Debt Payment',
    'subscription': 'Subscription Payment', 'subscriptions': 'Subscription Payment',
    'subscription payment': 'Subscription Payment',
    'refund': 'Refund', 'refunds': 'Refund',
    'savings': 'Savings Transfer', 'savings transfer': 'Savings Transfer',
    'transfer': 'Internal Transfer', 'transfers': 'Internal Transfer',
    'internal transfer': 'Internal Transfer', 'own account': 'Internal Transfer',
    'interest': 'Interest'
  }),

  fromPayTrackerCategory: function(tx, isCredit) {
    const value = String(tx.payTrackerCategory || '').trim();
    if (!value) return null;
    const manual = String(tx.categorySource || '').trim() === 'Manual';
    const confidence = manual ? this.CONFIDENCE.CONFIRMED : this.CONFIDENCE.LIKELY;
    const reason = (manual ? 'You categorised this as "' : 'A rule categorised this as "') + value + '".';
    const mapped = this.CATEGORY_SYNONYMS[value.toLowerCase()];
    if (mapped) return [mapped, confidence, reason];
    // Any other category ("Groceries", "Fuel"...) is ordinary spending or income.
    return [isCredit ? this.CATEGORIES.OTHER_INCOME : this.CATEGORIES.SPENDING, confidence, reason];
  },

  // Whole words only: "nhs" must not match "JOHNSON".
  matchesEmployer: function(text, keywords) {
    return (keywords || []).some(function(word) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('(^|[^a-z0-9])' + escaped + '($|[^a-z0-9])').test(text);
    });
  },

  reconcileWithLedger: function(proposal, ctx) {
    if (proposal.status === this.STATUSES.EXCLUDED) return proposal;
    const linked = ctx.ledgerByTransaction[proposal.transactionId];
    if (linked) {
      proposal.status = this.STATUSES.ALREADY_RECORDED;
      proposal.existingMovementId = linked.movementId || '';
      proposal.reason += ' Already in Money Movements (' + (linked.movementId || '') + ').';
      return proposal;
    }
    const self = this;
    const possible = (ctx.manualByPennies[this.pennies(proposal.amount)] || []).filter(function(movement) {
      return self.sameMoney(proposal, movement);
    });
    if (possible.length) {
      proposal.status = this.STATUSES.POSSIBLE_DUPLICATE;
      proposal.confidence = this.CONFIDENCE.NEEDS_CONFIRMATION;
      proposal.possibleDuplicateOf = possible.map(function(m) { return m.movementId || ''; });
      proposal.reason += ' A manual Money Movement with the same amount is within ' +
        this.DUPLICATE_WINDOW_DAYS + ' days - confirm it is not the same payment.';
    }
    return proposal;
  },

  sameMoney: function(proposal, movement) {
    if (Math.abs((Math.abs(Number(movement.amount) || 0)) - proposal.amount) >= 0.005) return false;
    const movementDate = this.toDate(movement.date);
    if (!movementDate || !proposal.date) return false;
    const days = Math.abs(movementDate.getTime() - proposal.date.getTime()) / 86400000;
    if (days > this.DUPLICATE_WINDOW_DAYS) return false;
    const movementIsInternal = movement.internalTransfer === true ||
      PayTrackerMoneyMovementsConfig.INTERNAL_TRANSFER_TYPES.indexOf(movement.movementType) !== -1;
    if (movementIsInternal !== proposal.internalTransfer) return false;
    // Manual Adjustment / unknown types could be anything: compare on amount and date only.
    const type = String(movement.movementType || '');
    if (type === 'Manual Adjustment' || PayTrackerMoneyMovementsConfig.MOVEMENT_TYPES.indexOf(type) === -1) return true;
    return this.isIncomeSide(type) === (proposal.direction === 'Credit');
  },

  isIncomeSide: function(movementType) {
    return ['Salary Income', 'Other Income', 'Refund', 'Interest', 'Pot Withdrawal'].indexOf(movementType) !== -1;
  },

  /**
   * The Money Movements ledger type this proposal would be written
   * as, if the owner later approves writing it.
   */
  movementTypeFor: function(category, direction) {
    const C = this.CATEGORIES;
    switch (category) {
      case C.SALARY: return 'Salary Income';
      case C.OTHER_INCOME: return 'Other Income';
      case C.SPENDING: return 'Everyday Spending';
      case C.BILL: return 'Bill Payment';
      case C.DEBT: return 'Debt Payment';
      case C.SUBSCRIPTION: return 'Subscription Payment';
      case C.REFUND: return 'Refund';
      case C.SAVINGS: return direction === 'Credit' ? 'Pot Withdrawal' : 'Pot Deposit';
      case C.TRANSFER: return 'Transfer';
      case C.INTEREST: return 'Interest';
      default: return '';
    }
  },

  proposal: function(tx, category, confidence, reason, status) {
    const direction = String(tx.debitOrCredit || tx.direction || '') === 'Credit' ? 'Credit' : 'Debit';
    const internal = category === this.CATEGORIES.SAVINGS || category === this.CATEGORIES.TRANSFER;
    return {
      transactionId: String(tx.transactionId || '').trim(),
      date: this.toDate(tx.settledAt) || this.toDate(tx.createdAt),
      description: String(tx.merchantName || tx.description || ''),
      amount: Math.round(Math.abs(Number(tx.amount) || 0) * 100) / 100,
      direction: direction,
      category: category,
      movementType: this.movementTypeFor(category, direction),
      internalTransfer: internal,
      loanAccount: false,
      payTrackerCategory: String(tx.payTrackerCategory || '').trim(),
      confidence: confidence,
      // How sure the CATEGORY is, kept even when a ledger duplicate later
      // lowers `confidence` (that doubt is about the ledger, not the money).
      categoryConfidence: confidence,
      reason: reason,
      status: status,
      existingMovementId: '',
      possibleDuplicateOf: []
    };
  },

  pennies: function(value) {
    return Math.round(Math.abs(Number(value) || 0) * 100);
  },

  isTrue: function(value) {
    return value === true || String(value).toUpperCase() === 'TRUE';
  },

  toDate: function(value) {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (value === '' || value === null || value === undefined) return null;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
});
