/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Finance/TransactionMatchingService.js
 *
 * Matches imported Monzo Bank Transactions against
 * upcoming Finance Payments (Bills and Debts).
 *
 * Handles:
 * - Scoring transactions against unpaid upcoming payments
 * - Writing Suggested matches back to Bank Transactions
 * - Confirming a match (marks the payment paid)
 * - Rejecting a match
 *
 * Important:
 * - Nothing is ever auto-confirmed. A match only ever
 *   reaches "Suggested" status here; a person always
 *   confirms or rejects it.
 *******************************************************/

const PayTrackerTransactionMatchingService =
  Object.freeze({
    MAXIMUM_DAY_DIFFERENCE: 10,

    /**
     * Scores every unmatched Debit transaction against
     * unpaid upcoming payments and records Suggested
     * matches above the suggestion confidence threshold.
     *
     * @return {number} Number of transactions newly
     *     suggested.
     */
    matchTransactions: function() {
      const spreadsheet =
        SpreadsheetApp.getActiveSpreadsheet();

      const transactionsSheet =
        spreadsheet.getSheetByName(
          PayTrackerFinanceIntegrationConfig
            .SHEETS
            .BANK_TRANSACTIONS
            .NAME
        );

      const paymentsSheet =
        spreadsheet.getSheetByName(
          PayTrackerFinanceConfig.SHEETS.PAYMENTS
        );

      if (
        !transactionsSheet ||
        transactionsSheet.getLastRow() < 2 ||
        !paymentsSheet ||
        paymentsSheet.getLastRow() < 2
      ) {
        return 0;
      }

      const payments =
        PayTrackerTransactionMatchingService
          .readUnpaidPayments(
            paymentsSheet
          );

      if (payments.length === 0) {
        return 0;
      }

      const txColumns =
        PayTrackerFinanceIntegrationConfig
          .SHEETS
          .BANK_TRANSACTIONS
          .COLUMNS;

      const txHeaders =
        PayTrackerFinanceIntegrationConfig
          .SHEETS
          .BANK_TRANSACTIONS
          .HEADERS;

      const rows =
        transactionsSheet
          .getRange(
            2,
            1,
            transactionsSheet.getLastRow() - 1,
            txHeaders.length
          )
          .getValues();

      let suggested =
        0;

      rows.forEach(function(row, index) {
        const sheetRow =
          index + 2;

        const matchStatus =
          String(
            row[
              txColumns.MATCH_STATUS - 1
            ] || ''
          ).trim();

        if (
          matchStatus !== '' &&
          matchStatus !==
            PayTrackerFinanceIntegrationConfig
              .MATCH_STATUSES
              .UNMATCHED
        ) {
          return;
        }

        const direction =
          String(
            row[
              txColumns.DIRECTION - 1
            ] || ''
          ).trim();

        if (
          direction !==
          PayTrackerFinanceIntegrationConfig
            .TRANSACTION_DIRECTIONS
            .DEBIT
        ) {
          return;
        }

        const pending =
          row[
            txColumns.PENDING - 1
          ] === true;

        const declined =
          row[
            txColumns.DECLINED - 1
          ] === true;

        if (pending || declined) {
          return;
        }

        const settledAt =
          row[
            txColumns.SETTLED_AT - 1
          ];

        const createdAt =
          row[
            txColumns.CREATED_AT - 1
          ];

        const transactionDate =
          settledAt instanceof Date
            ? settledAt
            : (
                createdAt instanceof Date
                  ? createdAt
                  : null
              );

        if (!transactionDate) {
          return;
        }

        const transaction = {
          amount:
            Number(
              row[
                txColumns.AMOUNT - 1
              ]
            ) || 0,
          description:
            String(
              row[
                txColumns.DESCRIPTION - 1
              ] || ''
            ),
          merchantName:
            String(
              row[
                txColumns.MERCHANT_NAME - 1
              ] || ''
            ),
          date:
            transactionDate
        };

        const best =
          PayTrackerTransactionMatchingService
            .findBestPaymentMatch(
              transaction,
              payments
            );

        if (
          !best ||
          best.confidence <
          PayTrackerFinanceIntegrationConfig
            .DETECTION
            .SUGGESTION_THRESHOLD
        ) {
          return;
        }

        transactionsSheet
          .getRange(
            sheetRow,
            txColumns.MATCHED_FINANCE_TYPE
          )
          .setValue(
            best.payment.type
          );

        transactionsSheet
          .getRange(
            sheetRow,
            txColumns.MATCHED_FINANCE_ID
          )
          .setValue(
            best.payment.id
          );

        transactionsSheet
          .getRange(
            sheetRow,
            txColumns.MATCH_CONFIDENCE
          )
          .setValue(
            best.confidence
          );

        transactionsSheet
          .getRange(
            sheetRow,
            txColumns.MATCH_STATUS
          )
          .setValue(
            PayTrackerFinanceIntegrationConfig
              .MATCH_STATUSES
              .SUGGESTED
          );

        transactionsSheet
          .getRange(
            sheetRow,
            txColumns.MATCH_REASON
          )
          .setValue(
            best.reason
          );

        transactionsSheet
          .getRange(
            sheetRow,
            txColumns.UPDATED_AT
          )
          .setValue(
            new Date()
          );

        suggested++;
      });

      return suggested;
    },


    /**
     * Reads every unpaid upcoming payment.
     *
     * @param {GoogleAppsScript.Spreadsheet.Sheet} paymentsSheet
     * @return {Array<Object>}
     */
    readUnpaidPayments: function(
      paymentsSheet
    ) {
      const columns =
        PayTrackerFinanceConfig.PAYMENTS.COLUMNS;

      return paymentsSheet
        .getRange(
          2,
          1,
          paymentsSheet.getLastRow() - 1,
          PayTrackerFinanceConfig
            .PAYMENTS
            .HEADERS
            .length
        )
        .getValues()
        .map(function(row) {
          return {
            id:
              String(
                row[
                  columns.ID - 1
                ] || ''
              ).trim(),
            dueDate:
              row[
                columns.DUE_DATE - 1
              ],
            type:
              String(
                row[
                  columns.TYPE - 1
                ] || ''
              ).trim(),
            itemName:
              String(
                row[
                  columns.ITEM_NAME - 1
                ] || ''
              ).trim(),
            amount:
              Number(
                row[
                  columns.AMOUNT_DUE - 1
                ]
              ) || 0,
            paid:
              row[
                columns.PAID - 1
              ] === true
          };
        })
        .filter(function(payment) {
          return (
            !payment.paid &&
            payment.id !== '' &&
            payment.dueDate instanceof Date
          );
        });
    },


    /**
     * Finds the closest-matching unpaid payment for one
     * transaction.
     *
     * @param {{amount: number, description: string, merchantName: string, date: Date}} transaction
     * @param {Array<Object>} payments
     * @return {{payment: Object, confidence: number, reason: string}|null}
     */
    findBestPaymentMatch: function(
      transaction,
      payments
    ) {
      const detection =
        PayTrackerFinanceIntegrationConfig
          .DETECTION;

      let best =
        null;

      payments.forEach(function(payment) {
        const amountTolerance =
          Math.max(
            payment.amount *
            (
              detection
                .AMOUNT_TOLERANCE_PERCENTAGE /
              100
            ),
            detection
              .AMOUNT_TOLERANCE_MINIMUM
          );

        const amountDifference =
          Math.abs(
            transaction.amount -
            payment.amount
          );

        if (amountDifference > amountTolerance) {
          return;
        }

        const dayDifference =
          Math.abs(
            PayTrackerUtils
              .stripTime(
                transaction.date
              )
              .getTime() -
            PayTrackerUtils
              .stripTime(
                payment.dueDate
              )
              .getTime()
          ) /
          (
            24 * 60 * 60 * 1000
          );

        if (
          dayDifference >
          PayTrackerTransactionMatchingService
            .MAXIMUM_DAY_DIFFERENCE
        ) {
          return;
        }

        const nameScore =
          PayTrackerTransactionMatchingService
            .nameSimilarity(
              transaction.merchantName ||
              transaction.description,
              payment.itemName
            );

        const amountScore =
          amountDifference === 0
            ? 40
            : Math.max(
                40 -
                (
                  amountDifference /
                  amountTolerance
                ) * 40,
                0
              );

        const dateScore =
          Math.max(
            30 -
            dayDifference * 3,
            0
          );

        const nameWeightedScore =
          nameScore * 30;

        const confidence =
          Math.round(
            Math.min(
              amountScore +
              dateScore +
              nameWeightedScore,
              100
            )
          );

        if (
          !best ||
          confidence > best.confidence
        ) {
          best = {
            payment:
              payment,
            confidence:
              confidence,
            reason:
              (
                amountDifference === 0
                  ? 'Amount matches exactly'
                  : 'Amount within tolerance'
              ) +
              ', due ' +
              Math.round(dayDifference) +
              ' day(s) apart' +
              (
                nameScore > 0.3
                  ? ', name similar'
                  : ''
              )
          };
        }
      });

      return best;
    },


    /**
     * Scores how similar two free-text names are, from 0
     * (unrelated) to 1 (one contains the other).
     *
     * @param {string} a
     * @param {string} b
     * @return {number}
     */
    nameSimilarity: function(a, b) {
      const normalize =
        function(value) {
          return String(value || '')
            .toLowerCase()
            .replace(
              /[^a-z0-9]+/g,
              ' '
            )
            .trim();
        };

      const normalizedA =
        normalize(a);

      const normalizedB =
        normalize(b);

      if (
        normalizedA === '' ||
        normalizedB === ''
      ) {
        return 0;
      }

      if (
        normalizedA.indexOf(normalizedB) !== -1 ||
        normalizedB.indexOf(normalizedA) !== -1
      ) {
        return 1;
      }

      const wordsA =
        normalizedA.split(' ');

      const wordsB =
        normalizedB.split(' ');

      let sharedWords =
        0;

      wordsA.forEach(function(word) {
        if (
          word.length > 2 &&
          wordsB.indexOf(word) !== -1
        ) {
          sharedWords++;
        }
      });

      return (
        sharedWords /
        Math.max(
          wordsA.length,
          wordsB.length,
          1
        )
      );
    },


    /**
     * Returns every Suggested match, enriched with the
     * matched payment's details for display.
     *
     * @return {Array<Object>}
     */
    getSuggestedMatches: function() {
      const spreadsheet =
        SpreadsheetApp.getActiveSpreadsheet();

      const transactionsSheet =
        spreadsheet.getSheetByName(
          PayTrackerFinanceIntegrationConfig
            .SHEETS
            .BANK_TRANSACTIONS
            .NAME
        );

      if (
        !transactionsSheet ||
        transactionsSheet.getLastRow() < 2
      ) {
        return [];
      }

      const paymentsSheet =
        spreadsheet.getSheetByName(
          PayTrackerFinanceConfig.SHEETS.PAYMENTS
        );

      const paymentsById = {};

      if (
        paymentsSheet &&
        paymentsSheet.getLastRow() >= 2
      ) {
        PayTrackerTransactionMatchingService
          .readUnpaidPayments(
            paymentsSheet
          )
          .forEach(function(payment) {
            paymentsById[payment.id] =
              payment;
          });
      }

      const columns =
        PayTrackerFinanceIntegrationConfig
          .SHEETS
          .BANK_TRANSACTIONS
          .COLUMNS;

      const headers =
        PayTrackerFinanceIntegrationConfig
          .SHEETS
          .BANK_TRANSACTIONS
          .HEADERS;

      return transactionsSheet
        .getRange(
          2,
          1,
          transactionsSheet.getLastRow() - 1,
          headers.length
        )
        .getValues()
        .filter(function(row) {
          return (
            String(
              row[
                columns.MATCH_STATUS - 1
              ] || ''
            ).trim() ===
            PayTrackerFinanceIntegrationConfig
              .MATCH_STATUSES
              .SUGGESTED
          );
        })
        .map(function(row) {
          const matchedFinanceId =
            String(
              row[
                columns.MATCHED_FINANCE_ID - 1
              ] || ''
            ).trim();

          const matchedPayment =
            paymentsById[matchedFinanceId] ||
            null;

          return {
            transactionId:
              String(
                row[
                  columns.ID - 1
                ] || ''
              ).trim(),
            description:
              String(
                row[
                  columns.DESCRIPTION - 1
                ] || ''
              ).trim(),
            merchantName:
              String(
                row[
                  columns.MERCHANT_NAME - 1
                ] || ''
              ).trim(),
            amount:
              Number(
                row[
                  columns.AMOUNT - 1
                ]
              ) || 0,
            settledAt:
              row[
                columns.SETTLED_AT - 1
              ],
            matchedFinanceType:
              String(
                row[
                  columns.MATCHED_FINANCE_TYPE - 1
                ] || ''
              ).trim(),
            matchedFinanceId:
              matchedFinanceId,
            matchedItemName:
              matchedPayment
                ? matchedPayment.itemName
                : '',
            matchedAmount:
              matchedPayment
                ? matchedPayment.amount
                : 0,
            matchedDueDate:
              matchedPayment
                ? matchedPayment.dueDate
                : null,
            confidence:
              Number(
                row[
                  columns.MATCH_CONFIDENCE - 1
                ]
              ) || 0,
            reason:
              String(
                row[
                  columns.MATCH_REASON - 1
                ] || ''
              ).trim()
          };
        });
    },


    /**
     * Confirms a Suggested match: marks the matched
     * payment as paid and marks the transaction Confirmed.
     *
     * @param {string} transactionId
     * @return {Object}
     */
    confirmMatch: function(
      transactionId
    ) {
      const spreadsheet =
        SpreadsheetApp.getActiveSpreadsheet();

      const transactionsSheet =
        spreadsheet.getSheetByName(
          PayTrackerFinanceIntegrationConfig
            .SHEETS
            .BANK_TRANSACTIONS
            .NAME
        );

      if (!transactionsSheet) {
        throw new Error(
          'Bank Transactions sheet was not found.'
        );
      }

      const columns =
        PayTrackerFinanceIntegrationConfig
          .SHEETS
          .BANK_TRANSACTIONS
          .COLUMNS;

      const row =
        PayTrackerTransactionMatchingService
          .findTransactionRowById(
            transactionsSheet,
            transactionId
          );

      if (!row) {
        throw new Error(
          'Transaction "' +
          transactionId +
          '" was not found.'
        );
      }

      const matchedFinanceId =
        String(
          transactionsSheet
            .getRange(
              row,
              columns.MATCHED_FINANCE_ID
            )
            .getValue() || ''
        ).trim();

      if (matchedFinanceId === '') {
        throw new Error(
          'This transaction has no suggested match.'
        );
      }

      const paymentsSheet =
        spreadsheet.getSheetByName(
          PayTrackerFinanceConfig.SHEETS.PAYMENTS
        );

      if (!paymentsSheet) {
        throw new Error(
          'Finance Payments sheet was not found.'
        );
      }

      const paymentRow =
        PayTrackerPaymentService
          .findPaymentRowById(
            paymentsSheet,
            matchedFinanceId
          );

      if (!paymentRow) {
        throw new Error(
          'The matched payment could not be found. It may already be paid.'
        );
      }

      PayTrackerPaymentService
        .processPaymentRow(
          paymentsSheet,
          paymentRow
        );

      transactionsSheet
        .getRange(
          row,
          columns.MATCH_STATUS
        )
        .setValue(
          PayTrackerFinanceIntegrationConfig
            .MATCH_STATUSES
            .CONFIRMED
        );

      transactionsSheet
        .getRange(
          row,
          columns.UPDATED_AT
        )
        .setValue(
          new Date()
        );

      PayTrackerPaymentService
        .syncUpcomingPayments();

      PayTrackerFinanceDashboard.refresh();

      return {
        confirmed: true
      };
    },


    /**
     * Rejects a Suggested match.
     *
     * @param {string} transactionId
     * @return {Object}
     */
    rejectMatch: function(
      transactionId
    ) {
      const spreadsheet =
        SpreadsheetApp.getActiveSpreadsheet();

      const transactionsSheet =
        spreadsheet.getSheetByName(
          PayTrackerFinanceIntegrationConfig
            .SHEETS
            .BANK_TRANSACTIONS
            .NAME
        );

      if (!transactionsSheet) {
        throw new Error(
          'Bank Transactions sheet was not found.'
        );
      }

      const columns =
        PayTrackerFinanceIntegrationConfig
          .SHEETS
          .BANK_TRANSACTIONS
          .COLUMNS;

      const row =
        PayTrackerTransactionMatchingService
          .findTransactionRowById(
            transactionsSheet,
            transactionId
          );

      if (!row) {
        throw new Error(
          'Transaction "' +
          transactionId +
          '" was not found.'
        );
      }

      transactionsSheet
        .getRange(
          row,
          columns.MATCH_STATUS
        )
        .setValue(
          PayTrackerFinanceIntegrationConfig
            .MATCH_STATUSES
            .REJECTED
        );

      transactionsSheet
        .getRange(
          row,
          columns.UPDATED_AT
        )
        .setValue(
          new Date()
        );

      return {
        rejected: true
      };
    },


    /**
     * Finds a Bank Transactions row by Transaction ID.
     *
     * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
     * @param {string} transactionId
     * @return {number|null}
     */
    findTransactionRowById: function(
      sheet,
      transactionId
    ) {
      if (
        !sheet ||
        sheet.getLastRow() < 2
      ) {
        return null;
      }

      const targetId =
        String(
          transactionId || ''
        ).trim();

      if (targetId === '') {
        return null;
      }

      const values =
        sheet
          .getRange(
            2,
            1,
            sheet.getLastRow() - 1,
            1
          )
          .getDisplayValues();

      for (
        let index = 0;
        index < values.length;
        index++
      ) {
        if (
          String(
            values[index][0] || ''
          ).trim() === targetId
        ) {
          return index + 2;
        }
      }

      return null;
    }
  });
