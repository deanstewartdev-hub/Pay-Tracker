/*******************************************************
 * PAY TRACKER V2.6
 * Frontend/Web/WebApp.js
 *
 * Purpose:
 * - Serve the Pay Tracker web application
 * - Build the frontend bootstrap configuration
 * - Load Apps Script HTML partials safely
 * - Support local folder organisation through clasp
 *******************************************************/

const PayTrackerWebConfig = Object.freeze({
  APP_NAME: 'Pay Tracker',
  VERSION: '2.6.0',
  DEFAULT_ROUTE: 'dashboard',
  ENTRY_FILE: 'Index',

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
 * @return {GoogleAppsScript.HTML.HtmlOutput} Web application output.
 */
function doGet(event) {
  try {
    const appContext =
      buildPayTrackerWebApplicationContext_(event);

    const template = HtmlService.createTemplateFromFile(
      PayTrackerWebConfig.ENTRY_FILE
    );

    template.app = appContext;
    template.bootstrapJson =
      serializePayTrackerWebBootstrap_(appContext);

    return template
      .evaluate()
      .setTitle(
        appContext.pageTitle +
          ' | ' +
          PayTrackerWebConfig.APP_NAME
      )
      .setXFrameOptionsMode(
        HtmlService.XFrameOptionsMode.ALLOWALL
      )
      .addMetaTag(
        'viewport',
        'width=device-width, initial-scale=1'
      );
  } catch (error) {
    console.error(
      'Pay Tracker web application startup failed.',
      error
    );

    return buildPayTrackerWebErrorOutput_(error);
  }
}

/**
 * Includes an HTML partial.
 *
 * Apps Script does not preserve local folder paths when clasp uploads
 * project files. For example:
 *
 * Frontend/Layout/Header.html
 *
 * becomes:
 *
 * Header
 *
 * Therefore this helper accepts either the original local path or the
 * flattened Apps Script filename.
 *
 * @param {string} filePath Local path or Apps Script file name.
 * @return {string} Evaluated HTML content.
 */
function includePayTrackerHtml_(filePath) {
  const fileName =
    getPayTrackerAppsScriptFileName_(filePath);

  try {
    return HtmlService
      .createTemplateFromFile(fileName)
      .evaluate()
      .getContent();
  } catch (error) {
    throw new Error(
      'Could not include HTML file "' +
        fileName +
        '" from "' +
        String(filePath || '') +
        '". ' +
        getPayTrackerWebErrorMessage_(error)
    );
  }
}

/**
 * Converts a local project path into the filename used by Apps Script.
 *
 * Examples:
 * Frontend/Web/Styles       -> Styles
 * Frontend/Layout/Header    -> Header
 * Frontend/Components/Dashboard.html -> Dashboard
 *
 * @param {string} filePath File path.
 * @return {string} Apps Script filename.
 * @private
 */
function getPayTrackerAppsScriptFileName_(filePath) {
  const normalizedPath = String(filePath || '')
    .trim()
    .replace(/\\/g, '/');

  if (!normalizedPath) {
    throw new Error(
      'An HTML filename is required.'
    );
  }

  const pathParts = normalizedPath.split('/');
  const fileName = pathParts[pathParts.length - 1]
    .replace(/\.html$/i, '')
    .trim();

  if (!fileName) {
    throw new Error(
      'The HTML filename could not be determined from "' +
        normalizedPath +
        '".'
    );
  }

  return fileName;
}

/**
 * Returns frontend application configuration.
 *
 * @return {Object} Application configuration.
 */
function getPayTrackerWebApplicationConfig() {
  return buildPayTrackerWebApplicationContext_();
}

/**
 * Returns a lightweight backend health response.
 *
 * @return {Object} Health information.
 */
function getPayTrackerWebHealth() {
  return {
    success: true,
    application: PayTrackerWebConfig.APP_NAME,
    version: PayTrackerWebConfig.VERSION,
    runtime: 'Google Apps Script',
    database: 'Google Sheets',
    checkedAt: new Date().toISOString()
  };
}

/**
 * Creates the frontend application context.
 *
 * @param {Object=} event Apps Script request event.
 * @return {Object} Application context.
 * @private
 */
function buildPayTrackerWebApplicationContext_(event) {
  const requestedRoute =
    getPayTrackerRequestedRoute_(event);

  return {
    appName: PayTrackerWebConfig.APP_NAME,
    version: PayTrackerWebConfig.VERSION,
    activeRoute: requestedRoute,
    pageTitle:
      getPayTrackerRouteTitle_(requestedRoute),

    navigation:
      buildPayTrackerWebNavigation_(),

    environment: {
      runtime: 'Apps Script',
      database: 'Google Sheets'
    },

    generatedAt: new Date().toISOString()
  };
}

/**
 * Resolves the requested frontend route.
 *
 * @param {Object=} event Apps Script request event.
 * @return {string} Valid route.
 * @private
 */
function getPayTrackerRequestedRoute_(event) {
  const route =
    event &&
    event.parameter &&
    event.parameter.page
      ? String(event.parameter.page)
          .trim()
          .toLowerCase()
      : PayTrackerWebConfig.DEFAULT_ROUTE;

  const validRoutes = Object.keys(
    PayTrackerWebConfig.ROUTES
  ).map(function(key) {
    return PayTrackerWebConfig.ROUTES[key];
  });

  return validRoutes.indexOf(route) !== -1
    ? route
    : PayTrackerWebConfig.DEFAULT_ROUTE;
}

/**
 * Creates the sidebar navigation configuration.
 *
 * @return {Array<Object>} Navigation entries.
 * @private
 */
function buildPayTrackerWebNavigation_() {
  return [
    {
      id: PayTrackerWebConfig.ROUTES.DASHBOARD,
      label: 'Dashboard',
      section: 'main',
      enabled: true
    },
    {
      id: PayTrackerWebConfig.ROUTES.PAY,
      label: 'Pay',
      section: 'main',
      enabled: true
    },
    {
      id: PayTrackerWebConfig.ROUTES.FINANCE,
      label: 'Finance',
      section: 'main',
      enabled: true
    },
    {
      id: PayTrackerWebConfig.ROUTES.SAVINGS,
      label: 'Savings',
      section: 'main',
      enabled: true
    },
    {
      id: PayTrackerWebConfig.ROUTES.GOALS,
      label: 'Life Goals',
      section: 'main',
      enabled: true
    },
    {
      id: PayTrackerWebConfig.ROUTES.REPORTS,
      label: 'Reports',
      section: 'analysis',
      enabled: true
    },
    {
      id: PayTrackerWebConfig.ROUTES.CALENDAR,
      label: 'Calendar',
      section: 'analysis',
      enabled: true
    },
    {
      id: PayTrackerWebConfig.ROUTES.SETTINGS,
      label: 'Settings',
      section: 'system',
      enabled: true
    }
  ];
}

/**
 * Returns a readable title for a route.
 *
 * @param {string} route Route identifier.
 * @return {string} Page title.
 * @private
 */
function getPayTrackerRouteTitle_(route) {
  const titles = {
    dashboard: 'Dashboard',
    pay: 'Pay',
    finance: 'Finance',
    savings: 'Savings',
    goals: 'Life Goals',
    reports: 'Reports',
    calendar: 'Calendar',
    settings: 'Settings'
  };

  return titles[route] || titles.dashboard;
}

/**
 * Serializes bootstrap data safely for insertion into HTML.
 *
 * @param {Object} bootstrap Bootstrap data.
 * @return {string} Safe JSON.
 * @private
 */
function serializePayTrackerWebBootstrap_(bootstrap) {
  return JSON.stringify(bootstrap)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Builds a standalone startup-error page.
 *
 * @param {*} error Startup error.
 * @return {GoogleAppsScript.HTML.HtmlOutput} Error page.
 * @private
 */
function buildPayTrackerWebErrorOutput_(error) {
  const message =
    escapePayTrackerWebHtml_(
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
 * Returns an error message safely.
 *
 * @param {*} error Error value.
 * @param {string=} fallback Fallback message.
 * @return {string} Error message.
 * @private
 */
function getPayTrackerWebErrorMessage_(
  error,
  fallback
) {
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
 * Escapes text for safe HTML output.
 *
 * @param {*} value Value to escape.
 * @return {string} Escaped text.
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