/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Finance/FinanceIntegrationConfig.js
 *
 * Purpose:
 * - Define Finance web-workspace integration sheets
 * - Define subscription detection and review statuses
 * - Define read-only Monzo connection metadata
 * - Define bank transaction matching rules
 *
 * Important:
 * - This file does not create or modify sheets
 * - This file does not contact Monzo
 * - This file never stores banking passwords, PINs,
 *   card numbers or verification codes
 *******************************************************/

const PayTrackerFinanceIntegrationConfig =
  Object.freeze({
    VERSION: '2.8.0',

    SHEETS: Object.freeze({
      BANK_CONNECTIONS: Object.freeze({
        NAME: 'Bank Connections',

        HEADERS: Object.freeze([
          'Connection ID',
          'Provider',
          'Account ID',
          'Account Name',
          'Account Type',
          'Currency',
          'Connection Status',
          'Consent Scope',
          'Last Successful Sync',
          'Last Transaction ID',
          'Last Error',
          'Active',
          'Created At',
          'Updated At'
        ])
      }),

      BANK_TRANSACTIONS: Object.freeze({
        NAME: 'Bank Transactions',

        HEADERS: Object.freeze([
          'Transaction ID',
          'Connection ID',
          'Account ID',
          'Created At',
          'Settled At',
          'Description',
          'Merchant Name',
          'Merchant ID',
          'Category',
          'Amount',
          'Currency',
          'Debit or Credit',
          'Pending',
          'Declined',
          'Matched Finance Type',
          'Matched Finance ID',
          'Match Confidence',
          'Match Status',
          'Match Reason',
          'Imported At',
          'Updated At'
        ]),

        COLUMNS: Object.freeze({
          ID: 1,
          CONNECTION_ID: 2,
          ACCOUNT_ID: 3,
          CREATED_AT: 4,
          SETTLED_AT: 5,
          DESCRIPTION: 6,
          MERCHANT_NAME: 7,
          MERCHANT_ID: 8,
          CATEGORY: 9,
          AMOUNT: 10,
          CURRENCY: 11,
          DIRECTION: 12,
          PENDING: 13,
          DECLINED: 14,
          MATCHED_FINANCE_TYPE: 15,
          MATCHED_FINANCE_ID: 16,
          MATCH_CONFIDENCE: 17,
          MATCH_STATUS: 18,
          MATCH_REASON: 19,
          IMPORTED_AT: 20,
          UPDATED_AT: 21
        })
      }),

      SUBSCRIPTIONS: Object.freeze({
        NAME: 'Subscriptions',

        HEADERS: Object.freeze([
          'Subscription ID',
          'Subscription Name',
          'Merchant Key',
          'Merchant Display Name',
          'Category',
          'Frequency',
          'Latest Amount',
          'Monthly Cost',
          'Annual Cost',
          'Last Payment Date',
          'Next Expected Date',
          'Payment Method',
          'Source Type',
          'Linked Bill ID',
          'Detection Confidence',
          'Detection Reason',
          'Review Status',
          'Subscription Status',
          'Price Change Amount',
          'Price Change Percentage',
          'First Seen Date',
          'Occurrence Count',
          'Notes',
          'Created At',
          'Updated At'
        ])
      }),

      SUBSCRIPTION_TRANSACTIONS: Object.freeze({
        NAME: 'Subscription Transactions',

        HEADERS: Object.freeze([
          'Link ID',
          'Subscription ID',
          'Transaction ID',
          'Payment Date',
          'Amount',
          'Merchant Name',
          'Confidence',
          'Match Reason',
          'Confirmed',
          'Created At'
        ])
      }),

      BANK_SYNC_HISTORY: Object.freeze({
        NAME: 'Bank Sync History',

        HEADERS: Object.freeze([
          'Sync ID',
          'Connection ID',
          'Provider',
          'Started At',
          'Completed At',
          'Transactions Checked',
          'Transactions Imported',
          'Duplicates Skipped',
          'Subscription Suggestions',
          'Bill Match Suggestions',
          'Errors',
          'Status',
          'Summary'
        ])
      })
    }),

    PROVIDERS: Object.freeze({
      MONZO: 'Monzo'
    }),

    CONNECTION_STATUSES: Object.freeze({
      NOT_CONNECTED: 'Not Connected',
      CONNECTED: 'Connected',
      REAUTHORISATION_REQUIRED:
        'Reauthorisation Required',
      ERROR: 'Error',
      DISCONNECTED: 'Disconnected'
    }),

    TRANSACTION_DIRECTIONS: Object.freeze({
      DEBIT: 'Debit',
      CREDIT: 'Credit'
    }),

    MATCH_STATUSES: Object.freeze({
      UNMATCHED: 'Unmatched',
      SUGGESTED: 'Suggested',
      CONFIRMED: 'Confirmed',
      REJECTED: 'Rejected',
      AUTOMATIC: 'Automatic'
    }),

    REVIEW_STATUSES: Object.freeze({
      NEEDS_REVIEW: 'Needs Review',
      CONFIRMED: 'Confirmed',
      REJECTED: 'Rejected'
    }),

    SUBSCRIPTION_STATUSES: Object.freeze({
      ACTIVE: 'Active',
      POSSIBLY_CANCELLED: 'Possibly Cancelled',
      CANCELLED: 'Cancelled',
      PAUSED: 'Paused'
    }),

    SOURCE_TYPES: Object.freeze({
      EXISTING_BILL: 'Existing Bill',
      BANK_PATTERN: 'Bank Pattern',
      DIRECT_DEBIT: 'Direct Debit',
      STANDING_ORDER: 'Standing Order',
      MANUAL: 'Manual'
    }),

    FREQUENCIES: Object.freeze({
      WEEKLY: 'Weekly',
      FORTNIGHTLY: 'Fortnightly',
      FOUR_WEEKLY: 'Four Weekly',
      MONTHLY: 'Monthly',
      QUARTERLY: 'Quarterly',
      SIX_MONTHLY: 'Six Monthly',
      ANNUAL: 'Annual',
      IRREGULAR: 'Irregular'
    }),

    SYNC_STATUSES: Object.freeze({
      RUNNING: 'Running',
      COMPLETE: 'Complete',
      COMPLETE_WITH_WARNINGS:
        'Complete With Warnings',
      ERROR: 'Error'
    }),

    MONZO: Object.freeze({
      API_BASE_URL:
        'https://api.monzo.com',

      AUTHORIZE_URL:
        'https://auth.monzo.com',

      TOKEN_URL:
        'https://api.monzo.com/oauth2/token',

      READ_ONLY_ENDPOINTS: Object.freeze([
        '/accounts',
        '/balance',
        '/transactions',
        '/pots'
      ]),

      REQUIRED_SCOPES: Object.freeze([
        'accounts',
        'balance',
        'transactions'
      ]),

      TRANSACTION_PAGE_LIMIT: 100,
      INITIAL_HISTORY_DAYS: 365,

      /*
       * Monzo requires Strong Customer Authentication to
       * access transactions older than 90 days, and the SCA
       * grace period following an OAuth connection is short.
       * A rolling 30-day window stays comfortably clear of
       * that requirement for routine syncs; already-imported
       * transactions are de-duplicated by ID regardless of
       * window size, so this does not lose history already
       * captured by earlier syncs.
       */
      NORMAL_SYNC_DAYS: 30
    }),

    DETECTION: Object.freeze({
      MINIMUM_OCCURRENCES: 2,
      HIGH_CONFIDENCE_OCCURRENCES: 3,

      AMOUNT_TOLERANCE_PERCENTAGE: 5,
      AMOUNT_TOLERANCE_MINIMUM: 1,

      INTERVALS: Object.freeze([
        Object.freeze({
          frequency: 'Weekly',
          targetDays: 7,
          toleranceDays: 2
        }),

        Object.freeze({
          frequency: 'Fortnightly',
          targetDays: 14,
          toleranceDays: 2
        }),

        Object.freeze({
          frequency: 'Four Weekly',
          targetDays: 28,
          toleranceDays: 3
        }),

        Object.freeze({
          frequency: 'Monthly',
          targetDays: 30,
          toleranceDays: 5
        }),

        Object.freeze({
          frequency: 'Quarterly',
          targetDays: 91,
          toleranceDays: 10
        }),

        Object.freeze({
          frequency: 'Six Monthly',
          targetDays: 182,
          toleranceDays: 15
        }),

        Object.freeze({
          frequency: 'Annual',
          targetDays: 365,
          toleranceDays: 31
        })
      ]),

      CONFIDENCE: Object.freeze({
        NONE: 0,
        LOW: 35,
        MEDIUM: 60,
        HIGH: 80,
        CONFIRMED: 100
      }),

      AUTO_CONFIRM_THRESHOLD: 95,
      SUGGESTION_THRESHOLD: 60,

      BILL_CATEGORIES: Object.freeze([
        'bills',
        'subscriptions',
        'entertainment',
        'transport'
      ])
    }),

    getSheetDefinitions: function() {
      return [
        PayTrackerFinanceIntegrationConfig
          .SHEETS
          .BANK_CONNECTIONS,

        PayTrackerFinanceIntegrationConfig
          .SHEETS
          .BANK_TRANSACTIONS,

        PayTrackerFinanceIntegrationConfig
          .SHEETS
          .SUBSCRIPTIONS,

        PayTrackerFinanceIntegrationConfig
          .SHEETS
          .SUBSCRIPTION_TRANSACTIONS,

        PayTrackerFinanceIntegrationConfig
          .SHEETS
          .BANK_SYNC_HISTORY
      ];
    },

    normalizeFrequency: function(value) {
      const normalized =
        String(
          value === undefined ||
          value === null
            ? ''
            : value
        )
          .trim()
          .toLowerCase();

      const frequencies =
        PayTrackerFinanceIntegrationConfig
          .FREQUENCIES;

      const keys =
        Object.keys(frequencies);

      for (
        let index = 0;
        index !== keys.length;
        index += 1
      ) {
        const frequency =
          frequencies[keys[index]];

        if (
          String(frequency)
            .toLowerCase() ===
          normalized
        ) {
          return frequency;
        }
      }

      return frequencies.IRREGULAR;
    },

    toMonthlyCost: function(
      amount,
      frequency
    ) {
      const value =
        Number(amount) || 0;

      switch (
        PayTrackerFinanceIntegrationConfig
          .normalizeFrequency(
            frequency
          )
      ) {
        case 'Weekly':
          return value * 52 / 12;

        case 'Fortnightly':
          return value * 26 / 12;

        case 'Four Weekly':
          return value * 13 / 12;

        case 'Quarterly':
          return value / 3;

        case 'Six Monthly':
          return value / 6;

        case 'Annual':
          return value / 12;

        case 'Monthly':
          return value;

        default:
          return 0;
      }
    },

    toAnnualCost: function(
      amount,
      frequency
    ) {
      return (
        PayTrackerFinanceIntegrationConfig
          .toMonthlyCost(
            amount,
            frequency
          ) *
        12
      );
    }
  });
