/*******************************************************
 * PAY TRACKER V3.0 - safe Transaction Matching Rules unit checks.
 *
 * Deliberately limited to pure functions only (TransactionRuleMatchingService
 * takes plain objects, never touches a sheet) plus config sanity checks.
 * TransactionCategoryService reads/writes the real, existing Bank
 * Transactions sheet, so it is NOT exercised here -- that safety
 * (additive columns, original data never touched) was proven with a
 * Node vm harness against a mock sheet instead, not against real data.
 *******************************************************/

function runTransactionRulesTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }

  const definitions = PayTrackerTransactionRulesConfig.getDefinitions();
  check('one additive Transaction Matching Rules sheet definition', definitions.length === 1);
  check('exactly two additive category columns are defined',
    PayTrackerTransactionRulesConfig.CATEGORY_COLUMNS.length === 2
  );

  const matcher = PayTrackerTransactionRuleMatchingService;

  check('a rule with zero conditions never matches anything',
    matcher.doesRuleMatch({ merchantName: 'Anything', amount: 100 }, {}) === false
  );
  check('merchant-contains matching is case-insensitive',
    matcher.doesRuleMatch({ merchantName: 'TESCO STORES' }, { merchantContains: 'tesco' }) === true
  );
  check('amount minimum excludes amounts below it',
    matcher.doesRuleMatch({ merchantName: 'Shop', amount: 5 }, { merchantContains: 'shop', amountMinimum: 10 }) === false
  );
  check('amount maximum is inclusive at the boundary',
    matcher.doesRuleMatch({ merchantName: 'Shop', amount: 100 }, { merchantContains: 'shop', amountMaximum: 100 }) === true
  );
  check('negative debit amounts are compared by magnitude',
    matcher.doesRuleMatch(
      { merchantName: 'Shop', amount: -42 },
      { merchantContains: 'shop', amountMinimum: 40, amountMaximum: 50 }
    ) === true
  );
  check('a wrong direction excludes an otherwise-matching rule',
    matcher.doesRuleMatch({ merchantName: 'Shop', direction: 'Credit' }, { merchantContains: 'shop', direction: 'Debit' }) === false
  );

  const rules = [
    { ruleId: 'LOW', merchantContains: 'shop', payTrackerCategory: 'Generic', priority: 1 },
    { ruleId: 'HIGH', merchantContains: 'shop', monzoCategory: 'groceries', payTrackerCategory: 'Groceries', priority: 10 }
  ].sort(function(a, b) { return (Number(b.priority) || 0) - (Number(a.priority) || 0); });
  const found = matcher.findMatchingRule({ merchantName: 'Shop', category: 'groceries' }, rules);
  check('when several rules match, priority order decides the winner',
    found && found.ruleId === 'HIGH'
  );
  check('findMatchingRule returns null, not throws, when nothing matches',
    matcher.findMatchingRule({ merchantName: 'Unrelated' }, rules) === null
  );

  return { success: true, passed: results.length, results: results };
}
