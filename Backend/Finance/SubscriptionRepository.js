/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Finance/SubscriptionRepository.js
 *
 * Purpose:
 * - Read and maintain subscription records
 * - Keep monthly and annual costs consistent
 * - Support review, confirmation and cancellation
 * - Provide summary data for the Finance workspace
 *
 * Important:
 * - Records are never deleted
 * - This repository does not contact Monzo
 *******************************************************/

const PayTrackerSubscriptionRepository =
  Object.freeze({
    getAll: function(options) {
      const settings =
        options || {};

      const sheet =
        PayTrackerSubscriptionRepository
          .getSheet();

      const definition =
        PayTrackerFinanceIntegrationConfig
          .SHEETS
          .SUBSCRIPTIONS;

      if (sheet.getLastRow() <= 1) {
        return [];
      }

      const rows =
        sheet
          .getRange(
            2,
            1,
            sheet.getLastRow() - 1,
            definition.HEADERS.length
          )
          .getValues();

      return rows
        .map(function(row, index) {
          return PayTrackerSubscriptionRepository
            .rowToRecord(
              row,
              index + 2
            );
        })
        .filter(function(record) {
          if (!record.subscriptionId) {
            return false;
          }

          if (
            settings.reviewStatus &&
            record.reviewStatus !==
              settings.reviewStatus
          ) {
            return false;
          }

          if (
            settings.subscriptionStatus &&
            record.subscriptionStatus !==
              settings.subscriptionStatus
          ) {
            return false;
          }

          return true;
        })
        .sort(function(left, right) {
          return String(
            left.subscriptionName
          ).localeCompare(
            String(
              right.subscriptionName
            )
          );
        });
    },

    getById: function(subscriptionId) {
      const target =
        PayTrackerSubscriptionRepository
          .normalizeText(
            subscriptionId
          );

      const records =
        PayTrackerSubscriptionRepository
          .getAll();

      for (
        let index = 0;
        index !== records.length;
        index += 1
      ) {
        if (
          PayTrackerSubscriptionRepository
            .normalizeText(
              records[index]
                .subscriptionId
            ) === target
        ) {
          return records[index];
        }
      }

      return null;
    },

    getSummary: function() {
      const records =
        PayTrackerSubscriptionRepository
          .getAll();

      const active =
        records.filter(function(record) {
          return (
            record.subscriptionStatus ===
            PayTrackerFinanceIntegrationConfig
              .SUBSCRIPTION_STATUSES
              .ACTIVE
          );
        });

      const confirmed =
        active.filter(function(record) {
          return (
            record.reviewStatus ===
            PayTrackerFinanceIntegrationConfig
              .REVIEW_STATUSES
              .CONFIRMED
          );
        });

      return {
        total: records.length,
        active: active.length,
        confirmed: confirmed.length,
        needsReview:
          records.filter(function(record) {
            return (
              record.reviewStatus ===
              PayTrackerFinanceIntegrationConfig
                .REVIEW_STATUSES
                .NEEDS_REVIEW
            );
          }).length,
        possiblyCancelled:
          records.filter(function(record) {
            return (
              record.subscriptionStatus ===
              PayTrackerFinanceIntegrationConfig
                .SUBSCRIPTION_STATUSES
                .POSSIBLY_CANCELLED
            );
          }).length,
        monthlyCost:
          PayTrackerSubscriptionRepository
            .roundMoney(
              confirmed.reduce(
                function(total, record) {
                  return (
                    total +
                    record.monthlyCost
                  );
                },
                0
              )
            ),
        annualCost:
          PayTrackerSubscriptionRepository
            .roundMoney(
              confirmed.reduce(
                function(total, record) {
                  return (
                    total +
                    record.annualCost
                  );
                },
                0
              )
            )
      };
    },

    create: function(subscription) {
      const record =
        PayTrackerSubscriptionRepository
          .normalizeRecord(
            subscription
          );

      if (!record.subscriptionId) {
        record.subscriptionId =
          PayTrackerSubscriptionRepository
            .createId();
      }

      PayTrackerSubscriptionRepository
        .validateRecord(record);

      if (
        PayTrackerSubscriptionRepository
          .getById(
            record.subscriptionId
          )
      ) {
        throw new Error(
          'A subscription already exists with ID "' +
          record.subscriptionId +
          '".'
        );
      }

      const timestamp =
        new Date();

      record.createdAt =
        record.createdAt ||
        timestamp;

      record.updatedAt =
        timestamp;

      PayTrackerSubscriptionRepository
        .getSheet()
        .appendRow(
          PayTrackerSubscriptionRepository
            .recordToRow(record)
        );

      SpreadsheetApp.flush();

      return PayTrackerSubscriptionRepository
        .getById(
          record.subscriptionId
        );
    },

    update: function(
      subscriptionId,
      changes
    ) {
      const existing =
        PayTrackerSubscriptionRepository
          .getById(
            subscriptionId
          );

      if (!existing) {
        throw new Error(
          'Subscription "' +
          subscriptionId +
          '" was not found.'
        );
      }

      const updated =
        PayTrackerSubscriptionRepository
          .normalizeRecord(
            Object.assign(
              {},
              existing,
              changes || {},
              {
                subscriptionId:
                  existing.subscriptionId,
                createdAt:
                  existing.createdAt,
                updatedAt:
                  new Date()
              }
            )
          );

      PayTrackerSubscriptionRepository
        .validateRecord(updated);

      const definition =
        PayTrackerFinanceIntegrationConfig
          .SHEETS
          .SUBSCRIPTIONS;

      PayTrackerSubscriptionRepository
        .getSheet()
        .getRange(
          existing.rowNumber,
          1,
          1,
          definition.HEADERS.length
        )
        .setValues([
          PayTrackerSubscriptionRepository
            .recordToRow(updated)
        ]);

      SpreadsheetApp.flush();

      return PayTrackerSubscriptionRepository
        .getById(
          subscriptionId
        );
    },

    confirm: function(subscriptionId) {
      return PayTrackerSubscriptionRepository
        .update(
          subscriptionId,
          {
            reviewStatus:
              PayTrackerFinanceIntegrationConfig
                .REVIEW_STATUSES
                .CONFIRMED
          }
        );
    },

    reject: function(subscriptionId) {
      return PayTrackerSubscriptionRepository
        .update(
          subscriptionId,
          {
            reviewStatus:
              PayTrackerFinanceIntegrationConfig
                .REVIEW_STATUSES
                .REJECTED
          }
        );
    },

    setStatus: function(
      subscriptionId,
      status
    ) {
      const allowed =
        Object.keys(
          PayTrackerFinanceIntegrationConfig
            .SUBSCRIPTION_STATUSES
        )
          .map(function(key) {
            return PayTrackerFinanceIntegrationConfig
              .SUBSCRIPTION_STATUSES[key];
          });

      if (
        allowed.indexOf(status) === -1
      ) {
        throw new Error(
          'Unsupported subscription status "' +
          status +
          '".'
        );
      }

      return PayTrackerSubscriptionRepository
        .update(
          subscriptionId,
          {
            subscriptionStatus:
              status
          }
        );
    },

    rowToRecord: function(
      row,
      rowNumber
    ) {
      const headers =
        PayTrackerFinanceIntegrationConfig
          .SHEETS
          .SUBSCRIPTIONS
          .HEADERS;

      const read =
        function(header) {
          return row[
            headers.indexOf(header)
          ];
        };

      return {
        subscriptionId:
          read('Subscription ID'),
        subscriptionName:
          read('Subscription Name'),
        merchantKey:
          read('Merchant Key'),
        merchantDisplayName:
          read('Merchant Display Name'),
        category:
          read('Category'),
        frequency:
          read('Frequency'),
        latestAmount:
          Number(
            read('Latest Amount')
          ) || 0,
        monthlyCost:
          Number(
            read('Monthly Cost')
          ) || 0,
        annualCost:
          Number(
            read('Annual Cost')
          ) || 0,
        lastPaymentDate:
          read('Last Payment Date') ||
          null,
        nextExpectedDate:
          read('Next Expected Date') ||
          null,
        paymentMethod:
          read('Payment Method'),
        sourceType:
          read('Source Type'),
        linkedBillId:
          read('Linked Bill ID'),
        detectionConfidence:
          Number(
            read('Detection Confidence')
          ) || 0,
        detectionReason:
          read('Detection Reason'),
        reviewStatus:
          read('Review Status'),
        subscriptionStatus:
          read('Subscription Status'),
        priceChangeAmount:
          Number(
            read('Price Change Amount')
          ) || 0,
        priceChangePercentage:
          Number(
            read('Price Change Percentage')
          ) || 0,
        firstSeenDate:
          read('First Seen Date') ||
          null,
        occurrenceCount:
          Number(
            read('Occurrence Count')
          ) || 0,
        notes:
          read('Notes'),
        createdAt:
          read('Created At') ||
          null,
        updatedAt:
          read('Updated At') ||
          null,
        rowNumber:
          rowNumber
      };
    },

    normalizeRecord: function(value) {
      const record =
        value || {};

      const amount =
        Math.abs(
          Number(
            record.latestAmount
          ) || 0
        );

      const frequency =
        PayTrackerFinanceIntegrationConfig
          .normalizeFrequency(
            record.frequency
          );

      return {
        subscriptionId:
          PayTrackerSubscriptionRepository
            .cleanText(
              record.subscriptionId
            ),
        subscriptionName:
          PayTrackerSubscriptionRepository
            .cleanText(
              record.subscriptionName
            ),
        merchantKey:
          PayTrackerSubscriptionRepository
            .normalizeKey(
              record.merchantKey ||
              record.merchantDisplayName ||
              record.subscriptionName
            ),
        merchantDisplayName:
          PayTrackerSubscriptionRepository
            .cleanText(
              record.merchantDisplayName ||
              record.subscriptionName
            ),
        category:
          PayTrackerSubscriptionRepository
            .cleanText(
              record.category
            ),
        frequency:
          frequency,
        latestAmount:
          amount,
        monthlyCost:
          PayTrackerSubscriptionRepository
            .roundMoney(
              PayTrackerFinanceIntegrationConfig
                .toMonthlyCost(
                  amount,
                  frequency
                )
            ),
        annualCost:
          PayTrackerSubscriptionRepository
            .roundMoney(
              PayTrackerFinanceIntegrationConfig
                .toAnnualCost(
                  amount,
                  frequency
                )
            ),
        lastPaymentDate:
          record.lastPaymentDate ||
          '',
        nextExpectedDate:
          record.nextExpectedDate ||
          '',
        paymentMethod:
          PayTrackerSubscriptionRepository
            .cleanText(
              record.paymentMethod
            ),
        sourceType:
          PayTrackerSubscriptionRepository
            .cleanText(
              record.sourceType
            ) ||
          PayTrackerFinanceIntegrationConfig
            .SOURCE_TYPES
            .MANUAL,
        linkedBillId:
          PayTrackerSubscriptionRepository
            .cleanText(
              record.linkedBillId
            ),
        detectionConfidence:
          Math.max(
            0,
            Math.min(
              100,
              Number(
                record.detectionConfidence
              ) || 0
            )
          ),
        detectionReason:
          PayTrackerSubscriptionRepository
            .cleanText(
              record.detectionReason
            ),
        reviewStatus:
          PayTrackerSubscriptionRepository
            .cleanText(
              record.reviewStatus
            ) ||
          PayTrackerFinanceIntegrationConfig
            .REVIEW_STATUSES
            .NEEDS_REVIEW,
        subscriptionStatus:
          PayTrackerSubscriptionRepository
            .cleanText(
              record.subscriptionStatus
            ) ||
          PayTrackerFinanceIntegrationConfig
            .SUBSCRIPTION_STATUSES
            .ACTIVE,
        priceChangeAmount:
          Number(
            record.priceChangeAmount
          ) || 0,
        priceChangePercentage:
          Number(
            record.priceChangePercentage
          ) || 0,
        firstSeenDate:
          record.firstSeenDate ||
          '',
        occurrenceCount:
          Math.max(
            0,
            Number(
              record.occurrenceCount
            ) || 0
          ),
        notes:
          PayTrackerSubscriptionRepository
            .cleanText(
              record.notes
            ),
        createdAt:
          record.createdAt ||
          '',
        updatedAt:
          record.updatedAt ||
          ''
      };
    },

    validateRecord: function(record) {
      if (!record.subscriptionId) {
        throw new Error(
          'Subscription ID is required.'
        );
      }

      if (!record.subscriptionName) {
        throw new Error(
          'Subscription name is required.'
        );
      }

      if (record.latestAmount < 0) {
        throw new Error(
          'Subscription amount cannot be negative.'
        );
      }
    },

    recordToRow: function(record) {
      return [
        record.subscriptionId,
        record.subscriptionName,
        record.merchantKey,
        record.merchantDisplayName,
        record.category,
        record.frequency,
        record.latestAmount,
        record.monthlyCost,
        record.annualCost,
        record.lastPaymentDate,
        record.nextExpectedDate,
        record.paymentMethod,
        record.sourceType,
        record.linkedBillId,
        record.detectionConfidence,
        record.detectionReason,
        record.reviewStatus,
        record.subscriptionStatus,
        record.priceChangeAmount,
        record.priceChangePercentage,
        record.firstSeenDate,
        record.occurrenceCount,
        record.notes,
        record.createdAt ||
          new Date(),
        record.updatedAt ||
          new Date()
      ];
    },

    getSheet: function() {
      const spreadsheet =
        SpreadsheetApp
          .getActiveSpreadsheet();

      if (!spreadsheet) {
        throw new Error(
          'No active spreadsheet is available.'
        );
      }

      const sheet =
        spreadsheet.getSheetByName(
          PayTrackerFinanceIntegrationConfig
            .SHEETS
            .SUBSCRIPTIONS
            .NAME
        );

      if (!sheet) {
        throw new Error(
          'Subscriptions sheet was not found. Run ' +
          'setupPayTrackerFinanceIntegrations() first.'
        );
      }

      return sheet;
    },

    createId: function() {
      return (
        'SUBSCRIPTION-' +
        Utilities
          .getUuid()
          .replace(
            /-/g,
            ''
          )
          .substring(
            0,
            12
          )
          .toUpperCase()
      );
    },

    roundMoney: function(value) {
      return Math.round(
        Number(value || 0) *
        100
      ) / 100;
    },

    cleanText: function(value) {
      return String(
        value === undefined ||
        value === null
          ? ''
          : value
      ).trim();
    },

    normalizeText: function(value) {
      return PayTrackerSubscriptionRepository
        .cleanText(value)
        .toLowerCase();
    },

    normalizeKey: function(value) {
      return PayTrackerSubscriptionRepository
        .normalizeText(value)
        .replace(
          /[^a-z0-9]+/g,
          '-'
        )
        .replace(
          /^-+|-+$/g,
          ''
        );
    }
  });

/**
 * Read-only repository test.
 *
 * @return {Object} Subscription summary.
 */
function testPayTrackerSubscriptionRepository() {
  const result =
    PayTrackerSubscriptionRepository
      .getSummary();

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
