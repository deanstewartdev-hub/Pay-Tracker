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
    const columns = {};
    PayTrackerTransactionRulesConfig.CATEGORY_COLUMNS.forEach(function(name) {
      let index = headerRow.indexOf(name);
      if (index === -1) {
        const newColumnNumber = sheet.getMaxColumns() + 1;
        sheet.insertColumnsAfter(sheet.getMaxColumns(), 1);
        sheet.getRange(1, newColumnNumber).setValue(name)
          .setFontWeight('bold').setBackground('#172554').setFontColor('#ffffff');
        headerRow.push(name);
        index = newColumnNumber - 1;
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
  }
});
