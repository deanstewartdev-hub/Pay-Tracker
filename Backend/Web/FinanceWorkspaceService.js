/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Web/FinanceWorkspaceService.js
 *
 * Browser-safe controller for the Finance workspace.
 *******************************************************/

const PayTrackerWebFinanceWorkspaceService =
  Object.freeze({
    getData: function() {
      const spreadsheet =
        SpreadsheetApp
          .getActiveSpreadsheet();

      if (!spreadsheet) {
        throw new Error(
          'No active Pay Tracker spreadsheet is available.'
        );
      }

      PayTrackerFinanceIntegrationSetupService
        .setup();

      PayTrackerPaymentService
        .syncUpcomingPayments();

      const dashboard =
        PayTrackerFinanceDashboard
          .calculateDashboardFigures();

      const subscriptions =
        PayTrackerSubscriptionRepository
          .getAll();

      return {
        success: true,
        generatedAt:
          new Date().toISOString(),
        spreadsheetUrl:
          spreadsheet.getUrl(),
        dashboard:
          dashboard,
        bills:
          PayTrackerWebFinanceWorkspaceService
            .readBills(spreadsheet),
        debts:
          PayTrackerWebFinanceWorkspaceService
            .readDebts(spreadsheet),
        payments:
          PayTrackerWebFinanceWorkspaceService
            .readPayments(spreadsheet),
        history:
          PayTrackerWebFinanceWorkspaceService
            .readHistory(spreadsheet),
        subscriptions:
          subscriptions.map(
            PayTrackerWebFinanceWorkspaceService
              .serializeDates
          ),
        subscriptionSummary:
          PayTrackerSubscriptionRepository
            .getSummary(),
        bank:
          PayTrackerWebFinanceWorkspaceService
            .getBankStatus(spreadsheet)
      };
    },

    markPaymentPaid: function(paymentId) {
      const spreadsheet =
        SpreadsheetApp
          .getActiveSpreadsheet();

      const sheet =
        spreadsheet.getSheetByName(
          PayTrackerFinanceConfig
            .SHEETS
            .PAYMENTS
        );

      if (!sheet) {
        throw new Error(
          'Finance Payments sheet was not found.'
        );
      }

      const row =
        PayTrackerPaymentService
          .findPaymentRowById(
            sheet,
            paymentId
          );

      if (!row) {
        throw new Error(
          'Payment "' +
          paymentId +
          '" was not found.'
        );
      }

      PayTrackerPaymentService
        .processPaymentRow(
          sheet,
          row
        );

      return PayTrackerWebFinanceWorkspaceService
        .getData();
    },

    undoLastPayment: function() {
      PayTrackerPaymentService
        .undoLastPayment();

      return PayTrackerWebFinanceWorkspaceService
        .getData();
    },

    confirmSubscription: function(
      subscriptionId
    ) {
      PayTrackerSubscriptionRepository
        .confirm(
          subscriptionId
        );

      return PayTrackerWebFinanceWorkspaceService
        .getData();
    },

    rejectSubscription: function(
      subscriptionId
    ) {
      PayTrackerSubscriptionRepository
        .reject(
          subscriptionId
        );

      return PayTrackerWebFinanceWorkspaceService
        .getData();
    },

    readBills: function(spreadsheet) {
      const config =
        PayTrackerFinanceConfig.BILLS;

      return PayTrackerWebFinanceWorkspaceService
        .readConfiguredSheet(
          spreadsheet,
          PayTrackerFinanceConfig
            .SHEETS
            .BILLS,
          config.HEADERS,
          function(row) {
            const column =
              config.COLUMNS;

            return {
              id:
                row[column.ID - 1],
              name:
                row[column.NAME - 1],
              category:
                row[column.CATEGORY - 1],
              amount:
                Number(
                  row[column.AMOUNT - 1]
                ) || 0,
              frequency:
                row[column.FREQUENCY - 1],
              nextDueDate:
                PayTrackerWebFinanceWorkspaceService
                  .serializeDate(
                    row[
                      column.NEXT_DUE_DATE -
                      1
                    ]
                  ),
              active:
                String(
                  row[column.ACTIVE - 1]
                ).toLowerCase() ===
                'yes',
              weeklyCost:
                Number(
                  row[
                    column.WEEKLY_COST -
                    1
                  ]
                ) || 0,
              monthlyCost:
                Number(
                  row[
                    column.MONTHLY_COST -
                    1
                  ]
                ) || 0,
              notes:
                row[column.NOTES - 1]
            };
          }
        );
    },

    readDebts: function(spreadsheet) {
      const config =
        PayTrackerFinanceConfig.DEBTS;

      return PayTrackerWebFinanceWorkspaceService
        .readConfiguredSheet(
          spreadsheet,
          PayTrackerFinanceConfig
            .SHEETS
            .DEBTS,
          config.HEADERS,
          function(row) {
            const column =
              config.COLUMNS;

            return {
              id:
                row[column.ID - 1],
              name:
                row[column.NAME - 1],
              type:
                row[column.TYPE - 1],
              originalAmount:
                Number(
                  row[
                    column.ORIGINAL_AMOUNT -
                    1
                  ]
                ) || 0,
              currentBalance:
                Number(
                  row[
                    column.CURRENT_BALANCE -
                    1
                  ]
                ) || 0,
              apr:
                Number(
                  row[column.APR - 1]
                ) || 0,
              repaymentAmount:
                Number(
                  row[
                    column.REPAYMENT_AMOUNT -
                    1
                  ]
                ) || 0,
              frequency:
                row[column.FREQUENCY - 1],
              nextPaymentDate:
                PayTrackerWebFinanceWorkspaceService
                  .serializeDate(
                    row[
                      column.NEXT_PAYMENT_DATE -
                      1
                    ]
                  ),
              active:
                String(
                  row[column.ACTIVE - 1]
                ).toLowerCase() ===
                'yes',
              monthlyRepayment:
                Number(
                  row[
                    column.MONTHLY_REPAYMENT -
                    1
                  ]
                ) || 0,
              monthsLeft:
                Number(
                  row[
                    column.MONTHS_LEFT -
                    1
                  ]
                ) || 0,
              payoffDate:
                PayTrackerWebFinanceWorkspaceService
                  .serializeDate(
                    row[
                      column.PAYOFF_DATE -
                      1
                    ]
                  ),
              amountRepaid:
                Number(
                  row[
                    column.AMOUNT_REPAID -
                    1
                  ]
                ) || 0,
              percentageRepaid:
                Number(
                  row[
                    column.PERCENTAGE_REPAID -
                    1
                  ]
                ) || 0
            };
          }
        );
    },

    readPayments: function(spreadsheet) {
      const config =
        PayTrackerFinanceConfig.PAYMENTS;

      return PayTrackerWebFinanceWorkspaceService
        .readConfiguredSheet(
          spreadsheet,
          PayTrackerFinanceConfig
            .SHEETS
            .PAYMENTS,
          config.HEADERS,
          function(row) {
            const column =
              config.COLUMNS;

            return {
              id:
                row[column.ID - 1],
              dueDate:
                PayTrackerWebFinanceWorkspaceService
                  .serializeDate(
                    row[
                      column.DUE_DATE -
                      1
                    ]
                  ),
              type:
                row[column.TYPE - 1],
              itemId:
                row[column.ITEM_ID - 1],
              name:
                row[
                  column.ITEM_NAME -
                  1
                ],
              amount:
                Number(
                  row[
                    column.AMOUNT_DUE -
                    1
                  ]
                ) || 0,
              paid:
                row[column.PAID - 1] ===
                true,
              status:
                PayTrackerWebFinanceWorkspaceService
                  .getPaymentStatus(
                    row[
                      column.DUE_DATE -
                      1
                    ],
                    row[column.PAID - 1] === true
                  ),
              notes:
                row[column.NOTES - 1]
            };
          }
        )
        .sort(
          PayTrackerWebFinanceWorkspaceService
          
            .sortByDate('dueDate')
        );
    },

    readHistory: function(spreadsheet) {
      const config =
        PayTrackerFinanceConfig
          .PAYMENT_HISTORY;

      return PayTrackerWebFinanceWorkspaceService
        .readConfiguredSheet(
          spreadsheet,
          PayTrackerFinanceConfig
            .SHEETS
            .PAYMENT_HISTORY,
          config.HEADERS,
          function(row) {
            const column =
              config.COLUMNS;

            return {
              id:
                row[column.ID - 1],
              dueDate:
                PayTrackerWebFinanceWorkspaceService
                  .serializeDate(
                    row[
                      column.ORIGINAL_DUE_DATE -
                      1
                    ]
                  ),
              paidDate:
                PayTrackerWebFinanceWorkspaceService
                  .serializeDate(
                    row[
                      column.PAID_DATE -
                      1
                    ]
                  ),
              type:
                row[column.TYPE - 1],
              name:
                row[
                  column.ITEM_NAME -
                  1
                ],
              amount:
                Number(
                  row[
                    column.AMOUNT_PAID -
                    1
                  ]
                ) || 0,
              principal:
                Number(
                  row[
                    column.PRINCIPAL -
                    1
                  ]
                ) || 0,
              interest:
                Number(
                  row[
                    column.INTEREST -
                    1
                  ]
                ) || 0,
              undoStatus:
                row[
                  column.UNDO_STATUS -
                  1
                ]
            };
          }
                )
        .filter(function(record) {
          return (
            record.undoStatus !==
            PayTrackerFinanceConfig
              .UNDO_STATUSES
              .UNDONE
          );
        })
        .sort(
          PayTrackerWebFinanceWorkspaceService
          
            .sortByDate(
              'paidDate',
              true
            )
        )
        .slice(0, 50);
    },

    getBankStatus: function(spreadsheet) {
      const sheet =
        spreadsheet.getSheetByName(
          PayTrackerFinanceIntegrationConfig
            .SHEETS
            .BANK_CONNECTIONS
            .NAME
        );

      if (
        !sheet ||
        sheet.getLastRow() <= 1
      ) {
        return {
          connected: false,
          provider: 'Monzo',
          status: 'Not Connected',
          lastSuccessfulSync: ''
        };
      }

      const row =
        sheet
          .getRange(
            2,
            1,
            1,
            PayTrackerFinanceIntegrationConfig
              .SHEETS
              .BANK_CONNECTIONS
              .HEADERS
              .length
          )
          .getValues()[0];

      return {
        connected:
          row[6] ===
          PayTrackerFinanceIntegrationConfig
            .CONNECTION_STATUSES
            .CONNECTED,
        provider:
          row[1] ||
          'Monzo',
        accountName:
          row[3] ||
          '',
        status:
          row[6] ||
          'Not Connected',
        lastSuccessfulSync:
          PayTrackerWebFinanceWorkspaceService
            .serializeDate(
              row[8]
            )
      };
    },

    readConfiguredSheet: function(
      spreadsheet,
      sheetName,
      headers,
      mapper
    ) {
      const sheet =
        spreadsheet.getSheetByName(
          sheetName
        );

      if (
        !sheet ||
        sheet.getLastRow() <= 1
      ) {
        return [];
      }

      return sheet
        .getRange(
          2,
          1,
          sheet.getLastRow() - 1,
          headers.length
        )
        .getValues()
        .map(mapper)
        .filter(function(record) {
          return Boolean(record.id);
        });
    },
getPaymentStatus: function(
  dueDate,
  paid
) {
  if (paid === true) {
    return 'Paid';
  }

  if (!dueDate) {
    return 'Upcoming';
  }

  const timezone =
    Session.getScriptTimeZone();

  const todayKey =
    Utilities.formatDate(
      new Date(),
      timezone,
      'yyyy-MM-dd'
    );

  const dueDateObject =
    dueDate instanceof Date
      ? dueDate
      : new Date(dueDate);

  if (
    Number.isNaN(
      dueDateObject.getTime()
    )
  ) {
    return 'Upcoming';
  }

  const dueKey =
    Utilities.formatDate(
      dueDateObject,
      timezone,
      'yyyy-MM-dd'
    );

  if (dueKey < todayKey) {
    return 'Overdue';
  }

  if (dueKey === todayKey) {
    return 'Due Today';
  }

  return 'Upcoming';
},

    sortByDate: function(
      field,
      descending
    ) {
      return function(left, right) {
        const leftTime =
          new Date(
            left[field] || 0
          ).getTime();

        const rightTime =
          new Date(
            right[field] || 0
          ).getTime();

        return descending
          ? rightTime - leftTime
          : leftTime - rightTime;
      };
    },

    serializeDates: function(record) {
      const result =
        Object.assign(
          {},
          record
        );

      [
        'lastPaymentDate',
        'nextExpectedDate',
        'firstSeenDate',
        'createdAt',
        'updatedAt'
      ].forEach(function(field) {
        result[field] =
          PayTrackerWebFinanceWorkspaceService
            .serializeDate(
              result[field]
            );
      });

      return result;
    },

    serializeDate: function(value) {
      if (!value) {
        return '';
      }

      const date =
        value instanceof Date
          ? value
          : new Date(value);

      return Number.isNaN(
        date.getTime()
      )
        ? ''
        : date.toISOString();
    }
  });

  function makePayTrackerFinanceResponseBrowserSafe(data) {
  return JSON.parse(
    JSON.stringify(
      data,
      function(key, value) {
        if (value instanceof Date) {
          return value.toISOString();
        }

        if (
          typeof value === 'number' &&
          !Number.isFinite(value)
        ) {
          return 0;
        }

        if (value === undefined) {
          return null;
        }

        return value;
      }
    )
  );
}

function getPayTrackerFinanceWorkspace() {
  return makePayTrackerFinanceResponseBrowserSafe(
    PayTrackerWebFinanceWorkspaceService.getData()
  );
}

function markPayTrackerFinancePaymentPaid(paymentId) {
  return makePayTrackerFinanceResponseBrowserSafe(
    PayTrackerWebFinanceWorkspaceService.markPaymentPaid(paymentId)
  );
}

function undoPayTrackerFinancePayment() {
  return makePayTrackerFinanceResponseBrowserSafe(
    PayTrackerWebFinanceWorkspaceService.undoLastPayment()
  );
}

function confirmPayTrackerSubscription(subscriptionId) {
  return makePayTrackerFinanceResponseBrowserSafe(
    PayTrackerWebFinanceWorkspaceService.confirmSubscription(subscriptionId)
  );
}

function rejectPayTrackerSubscription(subscriptionId) {
  return makePayTrackerFinanceResponseBrowserSafe(
    PayTrackerWebFinanceWorkspaceService.rejectSubscription(subscriptionId)
  );
}
