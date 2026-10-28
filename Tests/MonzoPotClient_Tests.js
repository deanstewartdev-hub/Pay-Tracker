/*******************************************************
 * PAY TRACKER V3.3 - Monzo GET /pots client: mocked HTTP checks.
 * UrlFetchApp is replaced by an in-test fake for the duration of each
 * check and restored afterwards. No request leaves this process.
 *******************************************************/

function runMonzoPotClientTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }
  const M = PayTrackerMonzoService;
  const POTS_PATH = '/pots';
  const reply = function(status, body) {
    return { getResponseCode: function() { return status; }, getContentText: function() { return JSON.stringify(body); } };
  };
  // The offline Properties fake has no batch setter; the production refresh uses one. Shim it for this suite only.
  const realGetUserProperties = PropertiesService.getUserProperties;
  PropertiesService.getUserProperties = function() {
    const store = realGetUserProperties();
    return {
      getProperty: function(key) { return store.getProperty(key); },
      setProperty: function(key, value) { return store.setProperty(key, value); },
      setProperties: function(map) { Object.keys(map).forEach(function(key) { store.setProperty(key, map[key]); }); return this; },
      deleteProperty: function(key) { store.setProperty(key, ''); return this; }
    };
  };
  const props = PropertiesService.getUserProperties();
  // Test-only placeholder credentials, so the refresh path can run offline.
  const scriptProps = PropertiesService.getScriptProperties();
  scriptProps.setProperty(M.CLIENT_ID_PROPERTY, 'test-client-id');
  scriptProps.setProperty(M.CLIENT_SECRET_PROPERTY, 'test-client-secret');
  // Run `fn` with a fake HTTP layer; `route(url, options, callIndex)` returns a response.
  function withFakeHttp(route, fn) {
    const original = UrlFetchApp;
    const calls = [];
    UrlFetchApp = { fetch: function(url, options) { calls.push({ url: url, options: options }); return route(url, options, calls.length); } };
    try { return fn(calls); } finally { UrlFetchApp = original; }
  }
  function setTokens(access, refresh) {
    props.setProperty(M.ACCESS_TOKEN_PROPERTY, access);
    props.setProperty(M.REFRESH_TOKEN_PROPERTY, refresh);
  }
  const isPots = function(url) { return url.indexOf(POTS_PATH) !== -1; };
  const isToken = function(url) { return url === PayTrackerFinanceIntegrationConfig.MONZO.TOKEN_URL; };
  const potsBody = { pots: [
    { id: 'pot_home', name: 'Home Mortgage', balance: 25, currency: 'GBP', deleted: false },
    { id: 'pot_prague', name: 'Holiday Prague', balance: 0, currency: 'GBP', deleted: false },
    { id: 'pot_old', name: 'Old Pot', balance: 500, currency: 'GBP', deleted: true }
  ] };

  // Success: pence converted to pounds, archived pots excluded, Bearer token sent, read-only GET.
  setTokens('access-1', 'refresh-1');
  withFakeHttp(function(url) { return reply(200, potsBody); }, function(calls) {
    const pots = M.fetchPots('acc_1', M.getAccessToken());
    check('a successful GET /pots maps balances from pence to pounds', pots[0].balance === 0.25 && pots[1].balance === 0);
    check('archived Monzo pots are excluded from the client result', pots.length === 2 && pots.every(function(p) { return p.id !== 'pot_old'; }));
    check('the client only issues GET requests', calls.every(function(c) { return c.options.method === 'get'; }));
    check('the request carries the bearer token and the account id',
      calls[0].options.headers.Authorization === 'Bearer access-1' && calls[0].url.indexOf('current_account_id=acc_1') !== -1);
  });

  // Expired access token: one 401, a refresh, then the retry succeeds with the new token.
  setTokens('expired', 'refresh-1');
  withFakeHttp(function(url, options) {
    if (isToken(url)) return reply(200, { access_token: 'access-2', refresh_token: 'refresh-2' });
    return options.headers.Authorization === 'Bearer access-2' ? reply(200, potsBody) : reply(401, { message: 'Unauthorized' });
  }, function(calls) {
    const pots = M.fetchPots('acc_1', M.getAccessToken());
    check('an expired token is refreshed once and the request retried', pots.length === 2);
    check('the refreshed tokens are stored for next time', props.getProperty(M.ACCESS_TOKEN_PROPERTY) === 'access-2' && props.getProperty(M.REFRESH_TOKEN_PROPERTY) === 'refresh-2');
    check('the refresh happens once, not in a loop', calls.filter(function(c) { return isToken(c.url); }).length === 1);
  });

  // Refresh token rejected: the user is asked to reconnect, nothing is stored.
  setTokens('expired', 'revoked');
  withFakeHttp(function(url) { return isToken(url) ? reply(400, { error: 'invalid_grant' }) : reply(401, { message: 'Unauthorized' }); }, function() {
    let message = '';
    try { M.fetchPots('acc_1', M.getAccessToken()); } catch (error) { message = String(error.message); }
    check('a rejected refresh asks the owner to reconnect Monzo', /Reconnect Monzo/.test(message));
  });

  // API failure: a server error is surfaced with its status, and no token refresh is attempted.
  setTokens('access-3', 'refresh-3');
  withFakeHttp(function() { return reply(500, { message: 'Internal error' }); }, function(calls) {
    let error = null;
    try { M.fetchPots('acc_1', M.getAccessToken()); } catch (e) { error = e; }
    check('a server error is surfaced with its HTTP status', error !== null && error.status === 500 && /Internal error/.test(error.message));
    check('a server error does not trigger a token refresh', calls.every(function(c) { return !isToken(c.url); }));
  });

  // Rate limit: HTTP 429 is surfaced, not retried in a loop, and the token is left alone.
  setTokens('access-4', 'refresh-4');
  withFakeHttp(function() { return reply(429, { message: 'Too many requests' }); }, function(calls) {
    let error = null;
    try { M.fetchPots('acc_1', M.getAccessToken()); } catch (e) { error = e; }
    check('a rate-limited request is reported with status 429', error !== null && error.status === 429);
    check('a rate-limited request is made once, with no retry loop', calls.length === 1);
    check('a rate-limited request keeps the stored token', props.getProperty(M.ACCESS_TOKEN_PROPERTY) === 'access-4');
  });

  // Disconnected: no request is made at all.
  props.setProperty(M.ACCESS_TOKEN_PROPERTY, '');
  withFakeHttp(function() { return reply(200, potsBody); }, function(calls) {
    let message = '';
    try { M.getAccessToken(); } catch (error) { message = String(error.message); }
    check('with Monzo disconnected, no request is made and the owner is told', calls.length === 0 && /not connected/.test(message));
  });

  return { success: true, passed: results.length, results: results };
}
