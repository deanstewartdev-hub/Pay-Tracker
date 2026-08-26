/*******************************************************
 * PAY TRACKER V3.0
 * Backend/TransactionRules/TransactionCategoryService.js
 *
 * Reads/writes exactly two additive columns on the existing Bank
 * Transactions sheet (Pay Tracker Category, Category Source),
 * appended at the end and found/created by name every time -- the
 * existing FinanceIntegrationConfig.js HEADERS/COLUMNS map for that
 * sheet is never read or modified, so nothing here can disturb the
 * existing bill/debt matching (TransactionMatchingService.js) that
 * already indexes that sheet by fixed column number.
 *
 * Rules with Auto Confirm = true are NOT acted on automatically --
 * that field is stored for a later phase to safely build on, but
 * applying a suggested category always requires an explicit user
 * action here, matching the "nothing auto-confirms" rule the
 * existing bill/debt matcher already follows.
 *******************************************************/

const PayTrackerTransactionCategoryService = Object.freeze({
  getBankTransactionsSheet: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet && spreadsheet.getSheetByName(
      PayTrackerFinanceIntegrationConfig.SHEETS.BANK_TRANSACTIONS.NAME
    );
    if (!sheet) throw new Error('Bank Transactions sheet was not found.');
    return sheet;
  },

  ensureCategoryColumns: function(sheet) {
    const width = Math.max(sheet.getMaxColumns(), 1);
    const headerRow = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
    // getMaxColumns() is the sheet's raw grid width, which is often wider
    // than the columns that actually hold a header (a new Sheet defaults
    // to 26 columns) -- placing a new column there would strand it past a
    // gap of genuinely blank columns instead of right after real content.
    let lastContentColumn = 0;
    headerRow.forEach(function(value, i) {
      if (String(value).trim() !== '') lastContentColumn = i + 1;
    });
    const columns = {};
    PayTrackerTransactionRulesConfig.CATEGORY_COLUMNS.forEach(function(name) {
      let index = headerRow.indexOf(name);
      if (index === -1) {
        lastContentColumn += 1;
        if (lastContentColumn > sheet.getMaxColumns()) {
          sheet.insertColumnsAfter(sheet.getMaxColumns(), 1);
        }
        sheet.getRange(1, lastContentColumn).setValue(name)
          .setFontWeight('bold').setBackground('#172554').setFontColor('#ffffff');
        headerRow[lastContentColumn - 1] = name;
        index = lastContentColumn - 1;
      }
      columns[name] = index + 1;
    });
    return columns;
  },

  /**
   * Reads every Bank Transactions row into a plain object shape
   * TransactionRuleMatchingService can consume, plus which rows
   * have no Pay Tracker Category set yet.
   */
  readTransactions: function() {
    const sheet = this.getBankTransactionsSheet();
    const columns = this.ensureCategoryColumns(sheet);
    if (sheet.getLastRow() <= 1) return [];

    const baseColumns = PayTrackerFinanceIntegrationConfig.SHEETS.BANK_TRANSACTIONS.COLUMNS;
    const lastRow = sheet.getLastRow();
    const width = Math.max(sheet.getMaxColumns(), columns[PayTrackerTransactionRulesConfig.CATEGORY_COLUMNS[1]]);
    const values = sheet.getRange(2, 1, lastRow - 1, width).getValues();

    return values.map(function(row, index) {
      return {
        rowNumber: index + 2,
        transactionId: row[baseColumns.ID - 1],
        merchantName: row[baseColumns.MERCHANT_NAME - 1],
        description: row[baseColumns.DESCRIPTION - 1],
        category: row[baseColumns.CATEGORY - 1],
        amount: row[baseColumns.AMOUNT - 1],
        direction: row[baseColumns.DIRECTION - 1],
        settledAt: row[baseColumns.SETTLED_AT - 1] || row[baseColumns.CREATED_AT - 1] || null,
        payTrackerCategory: row[columns['Pay Tracker Category'] - 1] || '',
        categorySource: row[columns['Category Source'] - 1] || ''
      };
    });
  },

  getUncategorized: function() {
    return this.readTransactions().filter(function(tx) {
      return !tx.payTrackerCategory;
    });
  },

  /**
   * Read-only: computes what each uncategorised transaction WOULD
   * be set to, without writing anything.
   */
  previewMatches: function() {
    const rules = PayTrackerTransactionRulesRepository.getActive();
    return this.getUncategorized().map(function(tx) {
      const rule = PayTrackerTransactionRuleMatchingService.findMatchingRule(tx, rules);
      return {
        transactionId: tx.transactionId,
        merchantName: tx.merchantName,
        amount: tx.amount,
        suggestedCategory: rule ? rule.payTrackerCategory : '',
        matchedRuleId: rule ? rule.ruleId : '',
        matchedRuleName: rule ? rule.ruleName : ''
      };
    }).filter(function(preview) { return Boolean(preview.matchedRuleId); });
  },

  /**
   * Applies a category to one transaction. learnRule (opt-in, must
   * be explicitly requested) also creates a new rule for this exact
   * merchant so future imports match automatically -- the roadmap's
   * "rules should learn from confirmed manual classifications".
   */
  applyCategory: function(transactionId, category, source, learnRule) {
    const sheet = this.getBankTransactionsSheet();
    const columns = this.ensureCategoryColumns(sheet);
    const transactions = this.readTransactions();
    const target = transactions.filter(function(tx) {
      return String(tx.transactionId) === String(transactionId);
    })[0];
    if (!target) throw new Error('Transaction "' + transactionId + '" was not found.');

    sheet.getRange(target.rowNumber, columns['Pay Tracker Category']).setValue(category);
    sheet.getRange(target.rowNumber, columns['Category Source']).setValue(
      source || PayTrackerTransactionRulesConfig.CATEGORY_SOURCES.MANUAL
    );

    if (learnRule === true && target.merchantName) {
      PayTrackerTransactionRulesRepository.create({
        ruleName: 'Learned: ' + target.merchantName,
        merchantContains: target.merchantName,
        payTrackerCategory: category,
        priority: 0,
        active: true,
        notes: 'Created from a manual categorisation of transaction ' + transactionId + '.'
      });
    }

    return { transactionId: transactionId, payTrackerCategory: category };
  },

  /**
   * Applies every currently-computed rule suggestion in one go.
   * Still fully explicit -- only runs when the user calls it, never
   * from Monzo sync.
   */
  applyAllSuggested: function() {
    const suggestions = this.previewMatches();
    const self = this;
    suggestions.forEach(function(suggestion) {
      self.applyCategory(
        suggestion.transactionId, suggestion.suggestedCategory,
        PayTrackerTransactionRulesConfig.CATEGORY_SOURCES.RULE, false
      );
    });
    return { applied: suggestions.length };
  },

  /**
   * One-time cleanup for a known cosmetic artifact: an early build of
   * ensureCategoryColumns() used sheet.getMaxColumns() (the sheet's
   * raw grid width) instead of its last real header column, so on a
   * sheet with trailing blank grid columns the two category columns
   * landed at the far edge of the grid instead of directly after the
   * existing headers -- e.g. landing at AA/AB with a blank V-Z gap,
   * instead of V/W. ensureCategoryColumns() itself was fixed to find
   * the true last-content column, but that fix cannot move columns
   * that were already created in the wrong place.
   *
   * This function is deliberately conservative: it only ever deletes
   * the two stray columns, and only after confirming every single
   * cell below their header row is genuinely blank (nothing to lose)
   * and that the header text matches exactly. It throws instead of
   * acting on anything it cannot fully confirm. Not run automatically
   * by anything -- call it manually if you want the sheet tidied.
   *
   * @return {Object} What was found and whether anything was removed.
   */
  cleanupStrayCategoryColumnsIfSafe: function() {
    const sheet = this.getBankTransactionsSheet();
    const width = Math.max(sheet.getMaxColumns(), 1);
    const headerRow = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];

    const columnNames = PayTrackerTransactionRulesConfig.CATEGORY_COLUMNS;
    const positions = columnNames.map(function(name) { return headerRow.indexOf(name) + 1; });

    if (positions.indexOf(0) !== -1) {
      return { changed: false, reason: 'One or both category columns were not found by name -- nothing to clean up.' };
    }

    const first = Math.min.apply(null, positions);
    const last = Math.max.apply(null, positions);

    if (last !== first + 1) {
      return { changed: false, reason: 'Pay Tracker Category and Category Source are not adjacent -- refusing to guess, no columns touched.' };
    }

    const baseColumns = PayTrackerFinanceIntegrationConfig.SHEETS.BANK_TRANSACTIONS.COLUMNS;
    const lastKnownColumn = Math.max.apply(null, Object.keys(baseColumns).map(function(key) { return baseColumns[key]; }));

    if (first <= lastKnownColumn + 1) {
      return { changed: false, reason: 'Category columns are already directly after the known data columns -- nothing to clean up.' };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const dataValues = sheet.getRange(2, first, lastRow - 1, 2).getValues();
      const hasAnyData = dataValues.some(function(row) {
        return row.some(function(cell) { return String(cell || '').trim() !== ''; });
      });
      if (hasAnyData) {
        throw new Error(
          'Refusing to delete columns ' + first + '-' + last + ': at least one row has a value in ' +
          'Pay Tracker Category or Category Source. This cleanup only ever removes genuinely empty columns.'
        );
      }
    }

    sheet.deleteColumns(first, 2);

    return {
      changed: true,
      deletedColumns: [first, last],
      note: 'Deleted the two empty, misplaced category header columns. Reload the Finance > Rules tab once to recreate them correctly, directly after the existing data.'
    };
  }
});
