/*******************************************************
 * PAY TRACKER V3.0
 * Pure transaction-to-rule matching. No sheet access here --
 * everything is read/write elsewhere so this stays trivially
 * testable against plain objects.
 *******************************************************/

const PayTrackerTransactionRuleMatchingService = Object.freeze({
  /**
   * Returns the highest-priority active rule matching a
   * transaction, or null. Every condition present on a rule must
   * match (AND) -- a rule with zero conditions never matches
   * anything, so an accidentally-blank rule can't swallow every
   * transaction.
   */
  findMatchingRule: function(transaction, rules) {
    const candidates = (rules || []).filter(function(rule) {
      return PayTrackerTransactionRuleMatchingService.doesRuleMatch(transaction, rule);
    });
    return candidates[0] || null;
  },

  doesRuleMatch: function(transaction, rule) {
    const tx = transaction || {};
    const merchant = String(tx.merchantName || '').toLowerCase();
    const description = String(tx.description || '').toLowerCase();
    const category = String(tx.category || '').toLowerCase();
    const amount = Math.abs(Number(tx.amount) || 0);
    const direction = String(tx.direction || '');

    const merchantContains = String(rule.merchantContains || '').toLowerCase().trim();
    const descriptionContains = String(rule.descriptionContains || '').toLowerCase().trim();
    const monzoCategory = String(rule.monzoCategory || '').toLowerCase().trim();
    const ruleDirection = String(rule.direction || '').trim();
    const amountMinimum = rule.amountMinimum === '' || rule.amountMinimum === undefined
      ? null : Number(rule.amountMinimum);
    const amountMaximum = rule.amountMaximum === '' || rule.amountMaximum === undefined
      ? null : Number(rule.amountMaximum);

    if (merchantContains && merchant.indexOf(merchantContains) === -1) return false;
    if (descriptionContains && description.indexOf(descriptionContains) === -1) return false;
    if (monzoCategory && category !== monzoCategory) return false;
    if (ruleDirection && direction !== ruleDirection) return false;
    if (amountMinimum !== null && amount < amountMinimum) return false;
    if (amountMaximum !== null && amount > amountMaximum) return false;

    return Boolean(
      merchantContains || descriptionContains || monzoCategory ||
      ruleDirection || amountMinimum !== null || amountMaximum !== null
    );
  }
});
