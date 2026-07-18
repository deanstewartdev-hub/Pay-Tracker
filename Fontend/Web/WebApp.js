/*******************************************************
 * PAY TRACKER V2.6
 * Frontend/Web/WebApp.js
 *
 * Purpose:
 * - Serve the Pay Tracker web application
 * - Define frontend routes and navigation
 * - Build the initial application bootstrap context
 * - Load reusable HTML partials
 * - Provide safe startup and error handling
 *
 * Notes:
 * - Google Sheets remains the database.
 * - Existing spreadsheet features are not changed.
 * - This file does not write to spreadsheet data.
 *******************************************************/

const PayTrackerWebConfig = Object.freeze({
  VERSION: '2.6.0',

  APP_NAME: 'Pay Tracker',

  DEFAULT_ROUTE: 'dashboard',

  ROUTES: Object.freeze({
    DASHBOARD: 'dashboard',
    PAY: 'pay',
    FINANCE: 'finance',
    SAVINGS: 'savings',
    GOALS: 'goals',
    REPORTS: 'reports',
    CALENDAR: 'calendar',
    SETTINGS: 'settings'
  }),

  ROUTE_TITLES: Object.freeze({
    dashboard: 'Dashboard',
    pay: 'Pay',
    finance: 'Finance',
    savings: 'Savings',
    goals: 'Life Goals',
    reports: 'Reports',
    calendar: 'Calendar',
    settings: 'Settings'
  }),

  HTML: Object.freeze({
    INDEX: 'Frontend/Web/Index',
    STYLES: 'Frontend/Web/Styles',
    SCRIPTS: 'Frontend/Web/Scripts',

    LAYOUT_HEADER: 'Frontend/Layout/Header',
    LAYOUT_SIDEBAR: 'Frontend/Layout/Sidebar',
    LAYOUT_FOOTER: 'Frontend/Layout/Footer',

    DASHBOARD_PAGE: 'Frontend/Components/Dashboard'
  })
});

/**
 * Serves the Pay Tracker web application.
 *
 * Supported examples:
 *   /exec
 *   /exec?page=dashboard
 *   /exec?page=pay
 *   /exec?page=finance
 *   /exec?page=savings
 *
 * @param {GoogleAppsScript.Events.DoGet=} event Web request event.
 * @return {GoogleAppsScript.HTML.HtmlOutput} Rendered web application.
 */
function doGet(event) {
  try {
    const requestedRoute = getPayTrackerRequestedRoute_(event);
    const applicationContext =
      buildPayTrackerWebApplicationContext_(requestedRoute);

    const template = HtmlService.createTemplateFromFile(
      PayTrackerWebConfig.HTML.INDEX
    );

    template.app = applicationContext;
    template.bootstrapJson =
      serializePayTrackerBootstrapData_(applicationContext);

    return template
      .evaluate()
      .setTitle(
        applicationContext.pageTitle +
          ' | ' +
          PayTrackerWebConfig.APP_NAME
      )
      .addMetaTag(
        'viewport',
        'width=device-width, initial-scale=1, viewport-fit=cover'
      )
      .setXFrameOptionsMode(
        HtmlService.XFrameOptionsMode.ALLOWALL
      );
  } catch (error) {
    console.error(
      'Pay Tracker web application failed during startup.',
      error
    );

    return createPayTrackerWebErrorOutput_(error);
  }
}

/**
 * Includes a reusable HTML partial.
 *
 * Example:
 *   <?!= includePayTrackerHtml_('Frontend/Web/Styles'); ?>
 *
 * @param {string} filename Apps Script HTML filename without extension.
 * @return {string} HTML file contents.
 */
function includePayTrackerHtml_(filename) {
  const normalizedFilename = String(filename || '').trim();

  if (!normalizedFilename) {
    throw new Error(
      'A valid HTML filename is required when including a partial.'
    );
  }

  return HtmlService
    .createHtmlOutputFromFile(normalizedFilename)
    .getContent();
}

/**
 * Returns the application configuration for frontend refreshes.
 *
 * This method may be called with google.script.run.
 *
 * @param {string=} requestedRoute Optional requested route.
 * @return {Object} Serializable application configuration.
 */
function getPayTrackerWebApplicationConfig(requestedRoute) {
  const route = normalizePayTrackerRoute_(requestedRoute);

  return buildPayTrackerWebApplicationContext_(route);
}

/**
 * Returns a lightweight backend health response.
 *
 * The frontend uses this to confirm that Apps Script is reachable.
 *
 * @return {Object} Health-check result.
 */
function getPayTrackerWebHealth() {
  return {
    success: true,
    application: PayTrackerWebConfig.APP_NAME,
    version: PayTrackerWebConfig.VERSION,
    status: 'online',
    checkedAt: new Date().toISOString()
  };
}

/**
 * Builds the initial application context.
 *
 * @param {string} requestedRoute Requested application route.
 * @return {Object} Serializable application context.
 * @private
 */
function buildPayTrackerWebApplicationContext_(requestedRoute) {
  const activeRoute = normalizePayTrackerRoute_(requestedRoute);

  return {
    appName: PayTrackerWebConfig.APP_NAME,
    version: PayTrackerWebConfig.VERSION,
    activeRoute: activeRoute,
    pageTitle:
      PayTrackerWebConfig.ROUTE_TITLES[activeRoute] ||
      PayTrackerWebConfig.ROUTE_TITLES[
        PayTrackerWebConfig.DEFAULT_ROUTE
      ],
    navigation: buildPayTrackerNavigation_(),
    environment: getPayTrackerWebEnvironment_(),
    generatedAt: new Date().toISOString()
  };
}

/**
 * Builds the main application navigation.
 *
 * @return {Object[]} Navigation records.
 * @private
 */
function buildPayTrackerNavigation_() {
  return [
    {
      id: PayTrackerWebConfig.ROUTES.DASHBOARD,
      label: PayTrackerWebConfig.ROUTE_TITLES.dashboard,
      icon: 'dashboard',
      section: 'main',
      enabled: true
    },
    {
      id: PayTrackerWebConfig.ROUTES.PAY,
      label: PayTrackerWebConfig.ROUTE_TITLES.pay,
      icon: 'payments',
      section: 'main',
      enabled: true
    },
    {
      id: PayTrackerWebConfig.ROUTES.FINANCE,
      label: PayTrackerWebConfig.ROUTE_TITLES.finance,
      icon: 'account_balance_wallet',
      section: 'main',
      enabled: true
    },
    {
      id: PayTrackerWebConfig.ROUTES.SAVINGS,
      label: PayTrackerWebConfig.ROUTE_TITLES.savings,
      icon: 'savings',
      section: 'main',
      enabled: true
    },
    {
      id: PayTrackerWebConfig.ROUTES.GOALS,
      label: PayTrackerWebConfig.ROUTE_TITLES.goals,
      icon: 'flag',
      section: 'main',
      enabled: true
    },
    {
      id: PayTrackerWebConfig.ROUTES.REPORTS,
      label: PayTrackerWebConfig.ROUTE_TITLES.reports,
      icon: 'monitoring',
      section: 'analysis',
      enabled: true
    },
    {
      id: PayTrackerWebConfig.ROUTES.CALENDAR,
      label: PayTrackerWebConfig.ROUTE_TITLES.calendar,
      icon: 'calendar_month',
      section: 'analysis',
      enabled: true
    },
    {
      id: PayTrackerWebConfig.ROUTES.SETTINGS,
      label: PayTrackerWebConfig.ROUTE_TITLES.settings,
      icon: 'settings',
      section: 'system',
      enabled: true
    }
  ];
}

/**
 * Extracts the requested route from the Apps Script web event.
 *
 * @param {GoogleAppsScript.Events.DoGet=} event Web request event.
 * @return {string} Normalized route.
 * @private
 */
function getPayTrackerRequestedRoute_(event) {
  if (
    !event ||
    !event.parameter ||
    typeof event.parameter.page !== 'string'
  ) {
    return PayTrackerWebConfig.DEFAULT_ROUTE;
  }

  return normalizePayTrackerRoute_(event.parameter.page);
}

/**
 * Normalizes and validates an application route.
 *
 * @param {*} route Requested route.
 * @return {string} Valid application route.
 * @private
 */
function normalizePayTrackerRoute_(route) {
  const normalizedRoute = String(route || '')
    .trim()
    .toLowerCase();

  if (!normalizedRoute) {
    return PayTrackerWebConfig.DEFAULT_ROUTE;
  }

  if (!isPayTrackerRouteValid_(normalizedRoute)) {
    return PayTrackerWebConfig.DEFAULT_ROUTE;
  }

  return normalizedRoute;
}

/**
 * Determines whether a route exists.
 *
 * @param {string} route Route identifier.
 * @return {boolean} True when the route is supported.
 * @private
 */
function isPayTrackerRouteValid_(route) {
  return Object.prototype.hasOwnProperty.call(
    PayTrackerWebConfig.ROUTE_TITLES,
    route
  );
}

/**
 * Creates environment information for the frontend.
 *
 * No private spreadsheet identifiers are exposed.
 *
 * @return {Object} Environment information.
 * @private
 */
function getPayTrackerWebEnvironment_() {
  const activeSpreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  let spreadsheetName = 'Pay Tracker';

  if (activeSpreadsheet) {
    spreadsheetName =
      activeSpreadsheet.getName() || spreadsheetName;
  }

  return {
    spreadsheetName: spreadsheetName,
    runtime: 'Google Apps Script',
    database: 'Google Sheets'
  };
}

/**
 * Serializes startup data for safe insertion into JavaScript.
 *
 * Characters that could terminate or alter a script element are escaped.
 *
 * @param {Object} value Bootstrap value.
 * @return {string} Safe JSON string.
 * @private
 */
function serializePayTrackerBootstrapData_(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Creates a safe fallback page when the main application fails.
 *
 * @param {*} error Startup error.
 * @return {GoogleAppsScript.HTML.HtmlOutput} Error output.
 * @private
 */
function createPayTrackerWebErrorOutput_(error) {
  const message =
    error && error.message
      ? String(error.message)
      : 'An unexpected startup error occurred.';

  const safeMessage = escapePayTrackerWebHtml_(message);

  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <base target="_top">',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>Pay Tracker | Startup Error</title>',
    '  <style>',
    '    :root {',
    '      color-scheme: light dark;',
    '      font-family: Inter, Arial, sans-serif;',
    '    }',
    '    * { box-sizing: border-box; }',
    '    body {',
    '      margin: 0;',
    '      min-height: 100vh;',
    '      display: grid;',
    '      place-items: center;',
    '      padding: 24px;',
    '      background: #0f172a;',
    '      color: #e2e8f0;',
    '    }',
    '    .error-card {',
    '      width: 100%;',
    '      max-width: 620px;',
    '      padding: 32px;',
    '      border: 1px solid #334155;',
    '      border-radius: 18px;',
    '      background: #111827;',
    '    }',
    '    h1 {',
    '      margin: 0 0 12px;',
    '      font-size: 1.75rem;',
    '    }',
    '    p {',
    '      margin: 0;',
    '      color: #cbd5e1;',
    '      line-height: 1.6;',
    '    }',
    '    code {',
    '      display: block;',
    '      margin-top: 20px;',
    '      padding: 14px;',
    '      overflow-wrap: anywhere;',
    '      border-radius: 10px;',
    '      background: #020617;',
    '      color: #f8fafc;',
    '    }',
    '  </style>',
    '</head>',
    '<body>',
    '  <main class="error-card">',
    '    <h1>Pay Tracker could not start</h1>',
    '    <p>',
    '      The web application encountered an error before the dashboard loaded.',
    '    </p>',
    '    <code>' + safeMessage + '</code>',
    '  </main>',
    '</body>',
    '</html>'
  ].join('\n');

  return HtmlService
    .createHtmlOutput(html)
    .setTitle('Pay Tracker | Startup Error')
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1'
    );
}

/**
 * Escapes text for insertion into fallback HTML.
 *
 * @param {*} value Value to escape.
 * @return {string} Escaped HTML.
 * @private
 */
function escapePayTrackerWebHtml_(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}