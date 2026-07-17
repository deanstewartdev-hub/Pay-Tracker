/*******************************************************
 * PAY TRACKER V2.1
 * BackupService.gs
 *
 * Handles:
 * - PaySheet backups
 * - Unique backup names
 * - Timestamped backup copies
 * - Backup metadata
 * - Backup discovery
 *
 * This file depends on:
 * - Config.gs
 * - Utilities.gs
 *******************************************************/

const PayTrackerBackupService = Object.freeze({
  /**
   * Creates a timestamped copy of PaySheet.
   *
   * The backup:
   * - Preserves values
   * - Preserves formulas
   * - Preserves formatting
   * - Preserves data validation
   * - Preserves hidden rows
   * - Preserves merged cells
   *
   * @return {Object} Backup result.
   */
  createBackup: function () {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    if (!spreadsheet) {
      throw new Error(
        'No active spreadsheet is available.'
      );
    }

    const sourceSheet =
      spreadsheet.getSheetByName(
        PayTrackerConfig.SHEET.NAME
      );

    if (!sourceSheet) {
      throw new Error(
        'Sheet not found: ' +
        PayTrackerConfig.SHEET.NAME
      );
    }

    const backupName =
      PayTrackerUtils.createUniqueBackupName(
        spreadsheet
      );

    const activeSheetBeforeBackup =
      spreadsheet.getActiveSheet();

    const backupSheet =
      sourceSheet.copyTo(
        spreadsheet
      );

    backupSheet.setName(
      backupName
    );

    PayTrackerBackupService
      .writeBackupMetadata(
        backupSheet,
        backupName
      );

    if (activeSheetBeforeBackup) {
      spreadsheet.setActiveSheet(
        activeSheetBeforeBackup
      );
    } else {
      spreadsheet.setActiveSheet(
        sourceSheet
      );
    }

    SpreadsheetApp.flush();

    return {
      backupName: backupName,
      backupSheetId:
        backupSheet.getSheetId(),
      createdAt: new Date()
    };
  },


  /**
   * Writes backup information into the backup sheet note.
   *
   * The visible cell value is not changed.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} backupSheet
   * @param {string} backupName
   */
  writeBackupMetadata: function (
    backupSheet,
    backupName
  ) {
    PayTrackerUtils.validateSheet(
      backupSheet
    );

    const createdAt =
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        'dd MMM yyyy HH:mm:ss'
      );

    const metadata = [
      'Pay Tracker Backup',
      'Version: ' +
        PayTrackerConfig.APP.VERSION,
      'Source sheet: ' +
        PayTrackerConfig.SHEET.NAME,
      'Backup sheet: ' +
        backupName,
      'Created: ' +
        createdAt
    ].join('\n');

    backupSheet
      .getRange('A1')
      .setNote(metadata);

    backupSheet.setTabColor(
      '#64748b'
    );
  },


  /**
   * Returns all Pay Tracker backup sheets.
   *
   * Backups are sorted newest first where the timestamped
   * naming format can be read.
   *
   * @return {Object[]}
   */
  getBackups: function () {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    if (!spreadsheet) {
      throw new Error(
        'No active spreadsheet is available.'
      );
    }

    const backups =
      spreadsheet
        .getSheets()
        .filter(
          function (sheet) {
            return /^Backup_\d{8}_\d{6}(?:_\d+)?$/
              .test(
                sheet.getName()
              );
          }
        )
        .map(
          function (sheet) {
            return {
              name: sheet.getName(),
              sheetId: sheet.getSheetId(),
              createdAt:
                PayTrackerBackupService
                  .getBackupDateFromName(
                    sheet.getName()
                  )
            };
          }
        );

    backups.sort(
      function (
        firstBackup,
        secondBackup
      ) {
        const firstTime =
          firstBackup.createdAt
            ? firstBackup.createdAt.getTime()
            : 0;

        const secondTime =
          secondBackup.createdAt
            ? secondBackup.createdAt.getTime()
            : 0;

        return secondTime - firstTime;
      }
    );

    return backups;
  },


  /**
   * Converts a backup sheet name into its timestamp.
   *
   * Supports names such as:
   * Backup_20260715_221530
   * Backup_20260715_221530_1
   *
   * @param {string} backupName
   * @return {Date|null}
   */
  getBackupDateFromName: function (
    backupName
  ) {
    const name = String(
      backupName || ''
    ).trim();

    const match = name.match(
      /^Backup_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(?:_\d+)?$/
    );

    if (!match) {
      return null;
    }

    const year =
      Number(match[1]);

    const monthIndex =
      Number(match[2]) - 1;

    const day =
      Number(match[3]);

    const hour =
      Number(match[4]);

    const minute =
      Number(match[5]);

    const second =
      Number(match[6]);

    const date = new Date(
      year,
      monthIndex,
      day,
      hour,
      minute,
      second
    );

    if (isNaN(date.getTime())) {
      return null;
    }

    return date;
  },


  /**
   * Returns the number of existing Pay Tracker backups.
   *
   * @return {number}
   */
  getBackupCount: function () {
    return PayTrackerBackupService
      .getBackups()
      .length;
  },


  /**
   * Returns the newest backup, or null when no backup exists.
   *
   * @return {Object|null}
   */
  getLatestBackup: function () {
    const backups =
      PayTrackerBackupService
        .getBackups();

    return backups.length > 0
      ? backups[0]
      : null;
  },


  /**
   * Deletes older backups while preserving the newest number
   * requested.
   *
   * This function is not added to the menu by default.
   *
   * Example:
   * keepLatestBackups(10)
   *
   * @param {number} numberToKeep
   * @return {Object}
   */
  keepLatestBackups: function (
    numberToKeep
  ) {
    const keepCount =
      PayTrackerUtils.requirePositiveInteger(
        numberToKeep,
        'numberToKeep'
      );

    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    if (!spreadsheet) {
      throw new Error(
        'No active spreadsheet is available.'
      );
    }

    const backups =
      PayTrackerBackupService
        .getBackups();

    if (
      backups.length <= keepCount
    ) {
      return {
        deletedCount: 0,
        retainedCount:
          backups.length,
        deletedNames: []
      };
    }

    const backupsToDelete =
      backups.slice(
        keepCount
      );

    const deletedNames = [];

    backupsToDelete.forEach(
      function (backup) {
        const backupSheet =
          spreadsheet.getSheetByName(
            backup.name
          );

        if (!backupSheet) {
          return;
        }

        spreadsheet.deleteSheet(
          backupSheet
        );

        deletedNames.push(
          backup.name
        );
      }
    );

    SpreadsheetApp.flush();

    return {
      deletedCount:
        deletedNames.length,

      retainedCount:
        backups.length -
        deletedNames.length,

      deletedNames:
        deletedNames
    };
  },


  /**
   * Creates a backup immediately before a destructive or
   * high-risk operation.
   *
   * @param {string} operationName
   * @return {Object}
   */
  createSafetyBackup: function (
    operationName
  ) {
    const result =
      PayTrackerBackupService
        .createBackup();

    console.log(
      'Safety backup created before ' +
      String(
        operationName ||
        'operation'
      ) +
      ': ' +
      result.backupName
    );

    return result;
  }
});


/**
 * Temporary modular wrapper for creating a PaySheet backup.
 *
 * The final public menu function will be connected through
 * Main.gs after the original script is retired.
 */
function payTrackerCreateBackup_() {
  PayTrackerUtils.withDocumentLock(
    function () {
      const result =
        PayTrackerBackupService
          .createBackup();

      PayTrackerUtils.showMessage(
        'Backup Created',
        'A backup was created successfully:\n' +
        result.backupName
      );
    }
  );
}


/**
 * Manual test function.
 *
 * Creates one backup using the modular backup service.
 * Do not run unless you intentionally want another backup.
 */
function testCreateModularBackup_() {
  payTrackerCreateBackup_();
}


/**
 * Manual maintenance function.
 *
 * Keeps the newest 10 backups and deletes older Pay Tracker
 * backup sheets.
 *
 * This is deliberately not connected to the menu.
 */
function keepLatestTenPayTrackerBackups_() {
  PayTrackerUtils.withDocumentLock(
    function () {
      const result =
        PayTrackerBackupService
          .keepLatestBackups(10);

      PayTrackerUtils.showMessage(
        'Backup Cleanup Complete',
        'Deleted backups: ' +
        result.deletedCount +
        '\nBackups retained: ' +
        result.retainedCount
      );
    }
  );
}