/*******************************************************
 * PAY TRACKER V3.0
 * Backend/Web/AnalyticsService.js
 *
 * Browser-safe RPC layer for the Reports page's Ledger Analytics
 * section (roadmap Phase 9). Delegates all aggregation to
 * PayTrackerAnalyticsService -- this file only serializes the result.
 *******************************************************/

function makePayTrackerAnalyticsResponseBrowserSafe_(data) {
  return JSON.parse(JSON.stringify(data, function(key, value) {
    return value instanceof Date ? value.toISOString() : value;
  }));
}

function getPayTrackerAnalytics(options) {
  return makePayTrackerAnalyticsResponseBrowserSafe_(
    PayTrackerAnalyticsService.getData(options || {})
  );
}
