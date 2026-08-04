/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Finance/FinanceIntegrationSetupService.js
 *
 * Purpose:
 * - Create Finance integration sheets safely
 * - Preserve every existing row and column
 * - Apply standard formatting
 * - Seed existing subscription-category bills for review
 *
 * Important:
 * - Existing sheets are never deleted or cleared
 * - Monzo is not contacted by this service
 * - No connection tokens are stored by this service
 *******************************************************/

const PayTrackerFinanceIntegrationSetupService =
  Object.freeze({
    setup: function() {
      const spreadsheet =
        SpreadsheetApp
          .getActiveSpreadsheet();

      if (!spreadsheet) {
        throw new Error(
          'No active spreadsheet is available.'
        );
      }

      const result = {
        success: true,
        sheetsCreated: [],
        sheetsUnchanged: [],
        subscriptionsSeeded: 0,
        warnings: [],
        completedAt: new Date()
      };

      PayTrackerFinanceIntegrationConfig
        .getSheetDefinitions()
        .forEach(function(definition) {
          const created =
            PayTrackerFinanceIntegrationSetupService
              .ensureSheet(
                spreadsheet,
                definition
              );

          if (created) {
            result.sheetsCreated.push(
              definition.NAME
            );
          } else {
            result.sheetsUnchanged.push(
              definition.NAME
            );
          }
        });

      result.subscriptionsSeeded =
        PayTrackerFinanceIntegrationSetupService
          .seedExistingSubscriptions(
            spreadsheet
          );

      SpreadsheetApp.flush();

      console.log(
        JSON.stringify(
          result,
          null,
          2
        )
      );

      return result;
    },

    ensureSheet: function(
      spreadsheet,
      definition
    ) {
      let sheet =
        spreadsheet.getSheetByName(
          definition.NAME
        );

      let created = false;

      if (!sheet) {
        sheet =
          spreadsheet.insertSheet(
            definition.NAME
          );

        created = true;
      }

      const requiredColumns =
        definition.HEADERS.length;

      if (
        sheet.getMaxColumns() <
        requiredColumns
      ) {
        sheet.insertColumnsAfter(
          sheet.getMaxColumns(),
          requiredColumns -
          sheet.getMaxColumns()
        );
      }

      const currentHeaders =
        sheet
          .getRange(
            1,
            1,
            1,
            requiredColumns
          )
          .getDisplayValues()[0];

      const finalHeaders =
        currentHeaders.slice();

      let headerChanged = false;

      definition.HEADERS
        .forEach(function(header, index) {
          if (
            !String(
              finalHeaders[index] || ''
            ).trim()
          ) {
            finalHeaders[index] =
              header;

            headerChanged = true;
          }
        });

      if (headerChanged) {
        sheet
          .getRange(
            1,
            1,
            1,
            requiredColumns
          )
          .setValues([
            finalHeaders
          ]);
      }

      PayTrackerFinanceIntegrationSetupService
        .formatSheet(
          sheet,
          definition
        );

      return created;
    },

    formatSheet: function(
      sheet,
      definition
    ) {
      const columnCount =
        definition.HEADERS.length;

      sheet
        .getRange(
          1,
          1,
          1,
          columnCount
        )
        .setBackground('#0f172a')
        .setFontColor('#ffffff')
        .setFontWeight('bold')
        .setHorizontalAlignment(
          'center'
        )
        .setVerticalAlignment(
          'middle'
        )
        .setWrap(true);

      sheet.setFrozenRows(1);
      sheet.setRowHeight(1, 38);

      definition.HEADERS
        .forEach(function(header, index) {
          let width = 145;

          if (
            header.indexOf(
              'Reason'
            ) !== -1 ||
            header.indexOf(
              'Summary'
            ) !== -1 ||
            header.indexOf(
              'Notes'
            ) !== -1
          ) {
            width = 260;
          } else if (
            header.indexOf(
              'Name'
            ) !== -1 ||
            header.indexOf(
              'Description'
            ) !== -1
          ) {
            width = 210;
          } else if (
            header.indexOf(
              'ID'
            ) !== -1
          ) {
            width = 190;
          }

          sheet.setColumnWidth(
            index + 1,
            width
          );
        });
    },

    seedExistingSubscriptions: function(
      spreadsheet
    ) {
      const billsSheet =
        spreadsheet.getSheetByName(
          PayTrackerFinanceConfig
            .SHEETS
            .BILLS
        );

      const subscriptionsSheet =
        spreadsheet.getSheetByName(
          PayTrackerFinanceIntegrationConfig
            .SHEETS
            .SUBSCRIPTIONS
            .NAME
        );

      if (
        !billsSheet ||
        !subscriptionsSheet ||
        billsSheet.getLastRow() <= 1
      ) {
        return 0;
      }

      const billColumns =
        PayTrackerFinanceConfig
          .BILLS
          .COLUMNS;

      const billRows =
        billsSheet
          .getRange(
            2,
            1,
            billsSheet.getLastRow() - 1,
            PayTrackerFinanceConfig
              .BILLS
              .HEADERS
              .length
          )
          .getValues();

      const existingBillIds =
        PayTrackerFinanceIntegrationSetupService
          .getExistingLinkedBillIds(
            subscriptionsSheet
          );

      let inserted = 0;

      billRows.forEach(function(row) {
        const billId =
          String(
            row[
              billColumns.ID - 1
            ] || ''
          ).trim();

        const category =
          String(
            row[
              billColumns.CATEGORY - 1
            ] || ''
          ).trim();

        const active =
          String(
            row[
              billColumns.ACTIVE - 1
            ] || ''
          ).trim();

        if (
          !billId ||
          category.toLowerCase() !==
            'subscriptions' ||
          active.toLowerCase() !==
            'yes' ||
          existingBillIds[billId]
        ) {
          return;
        }

        const name =
          String(
            row[
              billColumns.NAME - 1
            ] || ''
          ).trim();

        const amount =
          Number(
            row[
              billColumns.AMOUNT - 1
            ]
          ) || 0;

        const frequency =
          PayTrackerFinanceIntegrationConfig
            .normalizeFrequency(
              row[
                billColumns.FREQUENCY - 1
              ]
            );

        const nextDueDate =
          row[
            billColumns
              .NEXT_DUE_DATE - 1
          ] || '';

        const timestamp =
          new Date();

        subscriptionsSheet.appendRow([
          PayTrackerFinanceIntegrationSetupService
            .createSubscriptionId(),
          name,
          PayTrackerFinanceIntegrationSetupService
            .normalizeMerchantKey(name),
          name,
          category,
          frequency,
          amount,
          PayTrackerFinanceIntegrationConfig
            .toMonthlyCost(
              amount,
              frequency
            ),
          PayTrackerFinanceIntegrationConfig
            .toAnnualCost(
              amount,
              frequency
            ),
          '',
          nextDueDate,
          '',
          PayTrackerFinanceIntegrationConfig
            .SOURCE_TYPES
            .EXISTING_BILL,
          billId,
          100,
          'Imported from an active Finance bill.',
          PayTrackerFinanceIntegrationConfig
            .REVIEW_STATUSES
            .CONFIRMED,
          PayTrackerFinanceIntegrationConfig
            .SUBSCRIPTION_STATUSES
            .ACTIVE,
          0,
          0,
          '',
          0,
          '',
          timestamp,
          timestamp
        ]);

        existingBillIds[billId] =
          true;

        inserted += 1;
      });

      return inserted;
    },

    getExistingLinkedBillIds: function(
      sheet
    ) {
      const result = {};

      if (sheet.getLastRow() <= 1) {
        return result;
      }

      const headers =
        PayTrackerFinanceIntegrationConfig
          .SHEETS
          .SUBSCRIPTIONS
          .HEADERS;

      const linkedBillIndex =
        headers.indexOf(
          'Linked Bill ID'
        );

      if (linkedBillIndex === -1) {
        return result;
      }

      sheet
        .getRange(
          2,
          linkedBillIndex + 1,
          sheet.getLastRow() - 1,
          1
        )
        .getDisplayValues()
        .forEach(function(row) {
          const billId =
            String(
              row[0] || ''
            ).trim();

          if (billId) {
            result[billId] =
              true;
          }
        });

      return result;
    },

    normalizeMerchantKey: function(value) {
      return String(
        value === undefined ||
        value === null
          ? ''
          : value
      )
        .trim()
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          '-'
        )
        .replace(
          /^-+|-+$/g,
          ''
        );
    },

    createSubscriptionId: function() {
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
    }
  });

/**
 * Manual setup entrypoint.
 *
 * @return {Object} Setup result.
 */
function setupPayTrackerFinanceIntegrations() {
  return PayTrackerFinanceIntegrationSetupService
    .setup();
}
