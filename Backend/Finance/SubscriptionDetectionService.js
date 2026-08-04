/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Finance/SubscriptionDetectionService.js
 *
 * Purpose:
 * - Detect recurring debit-card and bank payments
 * - Recognise weekly through annual payment patterns
 * - Produce reviewable subscription suggestions
 * - Detect likely price changes and missed recurrences
 *
 * Important:
 * - Suggestions are never confirmed automatically
 * - This service does not contact Monzo
 * - This service does not modify spreadsheet data
 *******************************************************/

const PayTrackerSubscriptionDetectionService =
  Object.freeze({
    detect: function(transactions) {
      const groups = {};

      (Array.isArray(transactions)
        ? transactions
        : []
      )
        .map(function(transaction) {
          return PayTrackerSubscriptionDetectionService
            .normalizeTransaction(
              transaction
            );
        })
        .filter(function(transaction) {
          return (
            transaction.transactionId &&
            transaction.amount > 0 &&
            transaction.direction ===
              PayTrackerFinanceIntegrationConfig
                .TRANSACTION_DIRECTIONS
                .DEBIT &&
            transaction.pending !== true &&
            transaction.declined !== true
          );
        })
        .forEach(function(transaction) {
          const key =
            transaction.merchantKey;

          if (!groups[key]) {
            groups[key] = [];
          }

          groups[key].push(transaction);
        });

      const suggestions = [];

      Object.keys(groups)
        .forEach(function(key) {
          const suggestion =
            PayTrackerSubscriptionDetectionService
              .analyseGroup(
                key,
                groups[key]
              );

          if (
            suggestion &&
            suggestion.detectionConfidence >=
              PayTrackerFinanceIntegrationConfig
                .DETECTION
                .SUGGESTION_THRESHOLD
          ) {
            suggestions.push(
              suggestion
            );
          }
        });

      suggestions.sort(function(left, right) {
        return (
          right.detectionConfidence -
          left.detectionConfidence
        );
      });

      return {
        success: true,
        transactionCount:
          (transactions || []).length,
        merchantCount:
          Object.keys(groups).length,
        suggestionCount:
          suggestions.length,
        suggestions:
          suggestions
      };
    },

    analyseGroup: function(
      merchantKey,
      transactions
    ) {
      const records =
        transactions
          .slice()
          .sort(function(left, right) {
            return (
              left.paymentDate.getTime() -
              right.paymentDate.getTime()
            );
          });

      if (
        records.length <
        PayTrackerFinanceIntegrationConfig
          .DETECTION
          .MINIMUM_OCCURRENCES
      ) {
        return null;
      }

      const intervals = [];

      for (
        let index = 1;
        index !== records.length;
        index += 1
      ) {
        intervals.push(
          Math.round(
            (
              records[index]
                .paymentDate
                .getTime() -
              records[index - 1]
                .paymentDate
                .getTime()
            ) /
            86400000
          )
        );
      }

      const medianInterval =
        PayTrackerSubscriptionDetectionService
          .median(intervals);

      const recurrence =
        PayTrackerSubscriptionDetectionService
          .findRecurrence(
            medianInterval
          );

      if (!recurrence) {
        return null;
      }

      const amounts =
        records.map(function(record) {
          return record.amount;
        });

      const medianAmount =
        PayTrackerSubscriptionDetectionService
          .median(amounts);

      const amountTolerance =
        Math.max(
          PayTrackerFinanceIntegrationConfig
            .DETECTION
            .AMOUNT_TOLERANCE_MINIMUM,
          medianAmount *
          PayTrackerFinanceIntegrationConfig
            .DETECTION
            .AMOUNT_TOLERANCE_PERCENTAGE /
          100
        );

      const stableAmountCount =
        amounts.filter(function(amount) {
          return (
            Math.abs(
              amount -
              medianAmount
            ) <= amountTolerance
          );
        }).length;

      const amountStability =
        stableAmountCount /
        amounts.length;

      const intervalStability =
        intervals.filter(function(days) {
          return (
            Math.abs(
              days -
              recurrence.targetDays
            ) <=
            recurrence.toleranceDays
          );
        }).length /
        intervals.length;

      const occurrenceScore =
        Math.min(
          20,
          records.length *
          5
        );

      const confidence =
        Math.round(
          25 +
          occurrenceScore +
          amountStability *
          25 +
          intervalStability *
          30
        );

      const latest =
        records[
          records.length - 1
        ];

      const previousAmount =
        records.length > 1
          ? records[
              records.length - 2
            ].amount
          : latest.amount;

      const priceChangeAmount =
        PayTrackerSubscriptionDetectionService
          .roundMoney(
            latest.amount -
            previousAmount
          );

      const priceChangePercentage =
        previousAmount > 0
          ? PayTrackerSubscriptionDetectionService
              .roundNumber(
                priceChangeAmount /
                previousAmount *
                100,
                2
              )
          : 0;

      const nextExpectedDate =
        new Date(
          latest.paymentDate
            .getTime()
        );

      nextExpectedDate.setDate(
        nextExpectedDate.getDate() +
        recurrence.targetDays
      );

      const reasonParts = [
        records.length +
        ' payments',
        'approximately every ' +
        recurrence.targetDays +
        ' days',
        Math.round(
          amountStability *
          100
        ) +
        '% amount consistency'
      ];

      return {
        subscriptionName:
          latest.merchantName,
        merchantKey:
          merchantKey,
        merchantDisplayName:
          latest.merchantName,
        category:
          latest.category,
        frequency:
          recurrence.frequency,
        latestAmount:
          latest.amount,
        monthlyCost:
          PayTrackerSubscriptionDetectionService
            .roundMoney(
              PayTrackerFinanceIntegrationConfig
                .toMonthlyCost(
                  latest.amount,
                  recurrence.frequency
                )
            ),
        annualCost:
          PayTrackerSubscriptionDetectionService
            .roundMoney(
              PayTrackerFinanceIntegrationConfig
                .toAnnualCost(
                  latest.amount,
                  recurrence.frequency
                )
            ),
        lastPaymentDate:
          latest.paymentDate,
        nextExpectedDate:
          nextExpectedDate,
        paymentMethod:
          latest.paymentMethod,
        sourceType:
          PayTrackerFinanceIntegrationConfig
            .SOURCE_TYPES
            .BANK_PATTERN,
        linkedBillId:
          '',
        detectionConfidence:
          Math.min(
            100,
            confidence
          ),
        detectionReason:
          reasonParts.join(', ') +
          '.',
        reviewStatus:
          PayTrackerFinanceIntegrationConfig
            .REVIEW_STATUSES
            .NEEDS_REVIEW,
        subscriptionStatus:
          PayTrackerFinanceIntegrationConfig
            .SUBSCRIPTION_STATUSES
            .ACTIVE,
        priceChangeAmount:
          priceChangeAmount,
        priceChangePercentage:
          priceChangePercentage,
        firstSeenDate:
          records[0].paymentDate,
        occurrenceCount:
          records.length,
        transactionIds:
          records.map(function(record) {
            return record.transactionId;
          })
      };
    },

    findRecurrence: function(days) {
      const intervals =
        PayTrackerFinanceIntegrationConfig
          .DETECTION
          .INTERVALS;

      let best = null;
      let bestDifference = null;

      intervals.forEach(function(interval) {
        const difference =
          Math.abs(
            days -
            interval.targetDays
          );

        if (
          difference <=
            interval.toleranceDays &&
          (
            bestDifference === null ||
            difference <
              bestDifference
          )
        ) {
          best = interval;
          bestDifference =
            difference;
        }
      });

      return best;
    },

    normalizeTransaction: function(value) {
      const transaction =
        value || {};

      const rawAmount =
        Number(
          transaction.amount
        ) || 0;

      const direction =
        transaction.direction ||
        transaction.debitOrCredit ||
        (
          rawAmount < 0
            ? PayTrackerFinanceIntegrationConfig
                .TRANSACTION_DIRECTIONS
                .DEBIT
            : PayTrackerFinanceIntegrationConfig
                .TRANSACTION_DIRECTIONS
                .CREDIT
        );

      const merchantName =
        String(
          transaction.merchantName ||
          transaction.description ||
          'Unknown merchant'
        ).trim();

      return {
        transactionId:
          String(
            transaction.transactionId ||
            transaction.id ||
            ''
          ).trim(),
        merchantName:
          merchantName,
        merchantKey:
          PayTrackerSubscriptionDetectionService
            .normalizeMerchantKey(
              transaction.merchantKey ||
              merchantName
            ),
        category:
          String(
            transaction.category ||
            'General'
          ).trim(),
        amount:
          Math.abs(rawAmount),
        direction:
          direction,
        paymentDate:
          PayTrackerSubscriptionDetectionService
            .toDate(
              transaction.settledAt ||
              transaction.createdAt ||
              transaction.paymentDate
            ),
        paymentMethod:
          String(
            transaction.paymentMethod ||
            'Card or bank payment'
          ).trim(),
        pending:
          transaction.pending === true,
        declined:
          transaction.declined === true
      };
    },

    normalizeMerchantKey: function(value) {
      return String(value || '')
        .toLowerCase()
        .replace(
          /\b(ltd|limited|plc|payment|payments)\b/g,
          ''
        )
        .replace(
          /[^a-z0-9]+/g,
          '-'
        )
        .replace(
          /^-+|-+$/g,
          ''
        );
    },

    toDate: function(value) {
      const date =
        value instanceof Date
          ? new Date(
              value.getTime()
            )
          : new Date(value);

      return Number.isNaN(
        date.getTime()
      )
        ? new Date(0)
        : date;
    },

    median: function(values) {
      const sorted =
        values
          .map(Number)
          .filter(Number.isFinite)
          .sort(function(left, right) {
            return left - right;
          });

      if (!sorted.length) {
        return 0;
      }

      const middle =
        Math.floor(
          sorted.length / 2
        );

      return (
        sorted.length % 2
      )
        ? sorted[middle]
        : (
            sorted[middle - 1] +
            sorted[middle]
          ) /
          2;
    },

    roundMoney: function(value) {
      return PayTrackerSubscriptionDetectionService
        .roundNumber(
          value,
          2
        );
    },

    roundNumber: function(
      value,
      places
    ) {
      const multiplier =
        Math.pow(
          10,
          places
        );

      return Math.round(
        Number(value || 0) *
        multiplier
      ) / multiplier;
    }
  });

/**
 * Pure recurring-payment detector test.
 *
 * @return {Object} Detection result.
 */
function testPayTrackerSubscriptionDetection() {
  return PayTrackerSubscriptionDetectionService
    .detect([
      {
        id: 'tx-1',
        merchantName: 'Example Streaming',
        amount: -12.99,
        createdAt: '2026-04-01'
      },
      {
        id: 'tx-2',
        merchantName: 'Example Streaming',
        amount: -12.99,
        createdAt: '2026-05-01'
      },
      {
        id: 'tx-3',
        merchantName: 'Example Streaming',
        amount: -13.99,
        createdAt: '2026-06-01'
      }
    ]);
}
