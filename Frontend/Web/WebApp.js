/*******************************************************
 * PAY TRACKER V2.6
 * Frontend/Web/WebApp.js
 *
 * Purpose:
 * - Serve the Pay Tracker web application
 * - Resolve frontend routes
 * - Build the application bootstrap payload
 * - Render the main frontend template
 *
 * Architecture:
 * - Only Index.html is evaluated as an Apps Script template
 * - Included partials contain no server-side variables
 * - Frontend state is injected through a bootstrap JSON object
 *******************************************************/

const PAY_TRACKER_WEB_CONFIG = Object.freeze({
  APP_NAME: 'Pay Tracker',
  VERSION: '2.6.0',
  DEFAULT_ROUTE: 'dashboard',
  ENTRY_TEMPLATE: 'Frontend/Index',

  ROUTES: Object.freeze({
    DASHBOARD: 'dashboard',
    PAY: 'pay',
    FINANCE: 'finance',
    SAVINGS: 'savings',
    GOALS: 'goals',
    REPORTS: 'reports',
    CALENDAR: 'calendar',
    SETTINGS: 'settings'
  })
});

/**
 * Serves the Pay Tracker web application.
 *
 * @param {Object=} event Apps Script web request event.
 * @return {GoogleAppsScript.HTML.HtmlOutput} Rendered application.
 */
function doGet(event) {
  try {
    const applicationState =
      buildPayTrackerApplicationState_(event);

    const template = HtmlService.createTemplateFromFile(
      PAY_TRACKER_WEB_CONFIG.ENTRY_TEMPLATE
    );

    template.bootstrapJson =
      serializePayTrackerBootstrap_(applicationState);

    return template
      .evaluate()
      .setTitle(
        applicationState.pageTitle +
          ' | ' +
          applicationState.appName
      )
      .addMetaTag(
        'viewport',
        'width=device-width, initial-scale=1'
      )
      .setXFrameOptionsMode(
        HtmlService.XFrameOptionsMode.ALLOWALL
      );
  } catch (error) {
    console.error(
      'Pay Tracker web application failed to start.',
      error
    );

    return buildPayTrackerStartupError_(error);
  }
}

/**
 * Includes a frontend HTML partial without evaluating it
 * as a separate template.
 *
 * This is intentionally equivalent to the proven
 * Project Savannah pattern.
 *
 * Included partials must not depend on template variables.
 *
 * @param {string} fileName Apps Script HTML filename.
 * @return {string} Raw HTML content.
 */
function includePayTrackerHtml(fileName) {
  const normalizedFileName = String(fileName || '').trim();

  if (!normalizedFileName) {
    throw new Error(
      'A frontend include filename is required.'
    );
  }

  try {
    return HtmlService
      .createHtmlOutputFromFile(normalizedFileName)
      .getContent();
  } catch (error) {
    throw new Error(
      'Could not include frontend file "' +
        normalizedFileName +
        '". ' +
        getPayTrackerWebErrorMessage_(error)
    );
  }
}

/**
 * Returns a lightweight application health response.
 *
 * @return {Object} Health response.
 */
function getPayTrackerWebHealth() {
  return {
    success: true,
    application: PAY_TRACKER_WEB_CONFIG.APP_NAME,
    version: PAY_TRACKER_WEB_CONFIG.VERSION,
    runtime: 'Google Apps Script',
    database: 'Google Sheets',
    checkedAt: new Date().toISOString()
  };
}

/**
 * Returns the frontend bootstrap configuration.
 *
 * @return {Object} Application state.
 */
function getPayTrackerWebBootstrap() {
  return buildPayTrackerApplicationState_();
}

/**
 * Builds the application state injected into Index.html.
 *
 * @param {Object=} event Apps Script request event.
 * @return {Object} Application state.
 * @private
 */
function buildPayTrackerApplicationState_(event) {
  const activeRoute =
    resolvePayTrackerRoute_(event);

  return {
    appName: PAY_TRACKER_WEB_CONFIG.APP_NAME,
    version: PAY_TRACKER_WEB_CONFIG.VERSION,
    activeRoute: activeRoute,
    pageTitle: getPayTrackerRouteTitle_(activeRoute),

    navigation: buildPayTrackerNavigation_(),

    environment: {
      runtime: 'Apps Script',
      database: 'Google Sheets'
    },

    features: {
      dashboard: true,
      pay: true,
      finance: true,
      savings: true,
      goals: true,
      reports: true,
      calendar: true,
      settings: true
    },

    generatedAt: new Date().toISOString()
  };
}

/**
 * Resolves the requested route.
 *
 * @param {Object=} event Apps Script request event.
 * @return {string} Valid route.
 * @private
 */
function resolvePayTrackerRoute_(event) {
  const requestedRoute =
    event &&
    event.parameter &&
    event.parameter.page
      ? String(event.parameter.page)
          .trim()
          .toLowerCase()
      : PAY_TRACKER_WEB_CONFIG.DEFAULT_ROUTE;

  const validRoutes = Object.keys(
    PAY_TRACKER_WEB_CONFIG.ROUTES
  ).map(function(key) {
    return PAY_TRACKER_WEB_CONFIG.ROUTES[key];
  });

  return validRoutes.indexOf(requestedRoute) !== -1
    ? requestedRoute
    : PAY_TRACKER_WEB_CONFIG.DEFAULT_ROUTE;
}

/**
 * Builds frontend navigation configuration.
 *
 * @return {Array<Object>} Navigation items.
 * @private
 */
function buildPayTrackerNavigation_() {
  return [
    {
      id: PAY_TRACKER_WEB_CONFIG.ROUTES.DASHBOARD,
      label: 'Dashboard',
      section: 'main',
      icon: 'dashboard'
    },
    {
      id: PAY_TRACKER_WEB_CONFIG.ROUTES.PAY,
      label: 'Pay',
      section: 'main',
      icon: 'pay'
    },
    {
      id: PAY_TRACKER_WEB_CONFIG.ROUTES.FINANCE,
      label: 'Finance',
      section: 'main',
      icon: 'finance'
    },
    {
      id: PAY_TRACKER_WEB_CONFIG.ROUTES.SAVINGS,
      label: 'Savings',
      section: 'main',
      icon: 'savings'
    },
    {
      id: PAY_TRACKER_WEB_CONFIG.ROUTES.GOALS,
      label: 'Life Goals',
      section: 'main',
      icon: 'goals'
    },
    {
      id: PAY_TRACKER_WEB_CONFIG.ROUTES.REPORTS,
      label: 'Reports',
      section: 'insights',
      icon: 'reports'
    },
    {
      id: PAY_TRACKER_WEB_CONFIG.ROUTES.CALENDAR,
      label: 'Calendar',
      section: 'insights',
      icon: 'calendar'
    },
    {
      id: PAY_TRACKER_WEB_CONFIG.ROUTES.SETTINGS,
      label: 'Settings',
      section: 'system',
      icon: 'settings'
    }
  ];
}

/**
 * Returns a page title for a route.
 *
 * @param {string} route Route identifier.
 * @return {string} Page title.
 * @private
 */
function getPayTrackerRouteTitle_(route) {
  const routeTitles = {
    dashboard: 'Dashboard',
    pay: 'Pay',
    finance: 'Finance',
    savings: 'Savings',
    goals: 'Life Goals',
    reports: 'Reports',
    calendar: 'Calendar',
    settings: 'Settings'
  };

  return routeTitles[route] || routeTitles.dashboard;
}

/**
 * Safely serializes frontend bootstrap data.
 *
 * @param {Object} bootstrap Application state.
 * @return {string} Safe JSON string.
 * @private
 */
function serializePayTrackerBootstrap_(bootstrap) {
  return JSON.stringify(bootstrap)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Builds a startup error page.
 *
 * @param {*} error Startup error.
 * @return {GoogleAppsScript.HTML.HtmlOutput} Error output.
 * @private
 */
function buildPayTrackerStartupError_(error) {
  const message = escapePayTrackerWebHtml_(
    getPayTrackerWebErrorMessage_(
      error,
      'An unknown startup error occurred.'
    )
  );

  const html =
    '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
    '<base target="_top">' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Pay Tracker | Startup Error</title>' +
    '<style>' +
    'html,body{margin:0;min-height:100%;font-family:Arial,sans-serif;}' +
    'body{min-height:100vh;display:grid;place-items:center;padding:24px;' +
    'box-sizing:border-box;background:#0f172a;color:#f8fafc;}' +
    '.error-card{width:min(620px,100%);padding:28px;border:1px solid #334155;' +
    'border-radius:16px;background:#111827;box-shadow:0 20px 50px rgba(0,0,0,.3);}' +
    'h1{margin:0 0 12px;font-size:24px;}' +
    'p{margin:0 0 18px;color:#cbd5e1;}' +
    'code{display:block;padding:14px;border-radius:10px;background:#020617;' +
    'color:#f8fafc;white-space:pre-wrap;overflow-wrap:anywhere;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<main class="error-card">' +
    '<h1>Pay Tracker could not start</h1>' +
    '<p>The web application encountered an error before the dashboard loaded.</p>' +
    '<code>' +
    message +
    '</code>' +
    '</main>' +
    '</body>' +
    '</html>';

  return HtmlService
    .createHtmlOutput(html)
    .setTitle('Pay Tracker | Startup Error')
    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL
    );
}

/**
 * Returns a readable error message.
 *
 * @param {*} error Error value.
 * @param {string=} fallback Fallback message.
 * @return {string} Error message.
 * @private
 */
function getPayTrackerWebErrorMessage_(error, fallback) {
  if (
    error &&
    typeof error === 'object' &&
    error.message
  ) {
    return String(error.message);
  }

  if (
    typeof error === 'string' &&
    error.trim()
  ) {
    return error.trim();
  }

  return fallback || 'An unknown error occurred.';
}

/**
 * Escapes text before inserting it into HTML.
 *
 * @param {*} value Value to escape.
 * @return {string} Escaped value.
 * @private
 */
function escapePayTrackerWebHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}