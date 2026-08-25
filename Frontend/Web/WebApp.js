/*******************************************************
 * PAY TRACKER V2.6
 * Frontend/Web/WebApp.js
 *
 * Purpose:
 * - Serve the Pay Tracker web application
 * - Resolve frontend routes
 * - Build the application bootstrap payload
 * - Render the main frontend template
 *******************************************************/

const PAY_TRACKER_WEB_CONFIG = Object.freeze({
  APP_NAME: 'Pay Tracker',
  VERSION: '3.0.4',
  DEFAULT_ROUTE: 'dashboard',
  ENTRY_TEMPLATE: 'Frontend/Index',

  ROUTES: Object.freeze({
    DASHBOARD: 'dashboard',
    ACTION_CENTRE: 'action-centre',
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
    const authorizationInfo =
      ScriptApp.getAuthorizationInfo(
        ScriptApp.AuthMode.FULL
      );

    if (
      authorizationInfo.getAuthorizationStatus() ===
      ScriptApp.AuthorizationStatus.REQUIRED
    ) {
      return buildPayTrackerAuthorizationRequiredPage_(
        authorizationInfo.getAuthorizationUrl()
      );
    }

    if (
      event &&
      event.parameter &&
      (
        event.parameter.code ||
        event.parameter.error
      ) &&
      event.parameter.state
    ) {
      return PayTrackerMonzoService
        .handleCallback(event);
    }

    const applicationState =
      buildPayTrackerApplicationState_(event);

    const template = HtmlService.createTemplateFromFile(
      PAY_TRACKER_WEB_CONFIG.ENTRY_TEMPLATE
    );

    /*
     * These values are available to Index.html through
     * Apps Script template expressions.
     */
    template.appName = applicationState.appName;
    template.version = applicationState.version;
    template.pageTitle = applicationState.pageTitle;
    template.activeRoute = applicationState.activeRoute;
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
 * Includes a frontend HTML partial.
 *
 * Included files must be Apps Script HTML files.
 * Do not include the .html extension in fileName.
 *
 * @param {string} fileName Apps Script HTML filename.
 * @return {string} Raw HTML content.
 */
/**
 * Includes and evaluates a frontend HTML partial.
 *
 * This supports nested Apps Script template expressions,
 * allowing Styles.html and Scripts.html to include their
 * own CSS and JavaScript partials.
 *
 * Do not include the .html extension in fileName.
 *
 * @param {string} fileName Apps Script HTML filename.
 * @return {string} Evaluated HTML content.
 */
function includePayTrackerHtml(fileName) {
  const normalizedFileName =
    String(fileName || '').trim();

  if (!normalizedFileName) {
    throw new Error(
      'A frontend include filename is required.'
    );
  }

  try {
    const content =
      HtmlService
        .createTemplateFromFile(normalizedFileName)
        .evaluate()
        .getContent();

    return content;
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
  const activeRoute = resolvePayTrackerRoute_(event);

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
      actionCentre: true,
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
      id: PAY_TRACKER_WEB_CONFIG.ROUTES.ACTION_CENTRE,
      label: 'Action Centre',
      section: 'main',
      icon: 'actions'
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
    'action-centre': 'Action Centre',
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
 * Safely serializes frontend bootstrap data for insertion
 * inside a script element.
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

  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" ',
    'content="width=device-width, initial-scale=1">',
    '<title>Pay Tracker | Startup Error</title>',
    '<style>',
    'html,body{margin:0;min-height:100%;}',
    'body{display:grid;place-items:center;',
    'padding:24px;background:#f6f8fc;',
    'color:#334155;font-family:Arial,sans-serif;}',
    '.error-card{width:min(620px,100%);',
    'padding:30px;border:1px solid #e2e8f0;',
    'border-radius:16px;background:#fff;',
    'box-shadow:0 16px 40px rgba(15,23,42,.10);}',
    'h1{margin:0;color:#0f172a;font-size:24px;}',
    'p{margin:12px 0 0;line-height:1.6;}',
    'code{display:block;margin-top:18px;',
    'padding:14px;border-radius:10px;',
    'background:#f1f5f9;color:#b91c1c;',
    'white-space:pre-wrap;overflow-wrap:anywhere;}',
    '</style>',
    '</head>',
    '<body>',
    '<main class="error-card">',
    '<h1>Pay Tracker could not start</h1>',
    '<p>The web application encountered an error ',
    'before the dashboard loaded.</p>',
    '<code>',
    message,
    '</code>',
    '</main>',
    '</body>',
    '</html>'
  ].join('');

  return HtmlService
    .createHtmlOutput(html)
    .setTitle('Pay Tracker | Startup Error')
    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL
    );
}

/**
 * Builds a page asking the deploying user to grant the
 * script's requested permissions.
 *
 * Apps Script web apps running as "Execute as: Me" need this
 * one-time authorization completed by the deploying account
 * before restricted services (such as UrlFetchApp for Monzo)
 * can run. Without this check, a missing scope surfaces as a
 * generic thrown error instead of a way to fix it.
 *
 * @param {string} authorizationUrl Google consent screen URL.
 * @return {GoogleAppsScript.HTML.HtmlOutput} Authorization page.
 * @private
 */
function buildPayTrackerAuthorizationRequiredPage_(
  authorizationUrl
) {
  const safeUrl =
    escapePayTrackerWebHtml_(authorizationUrl);

  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" ',
    'content="width=device-width, initial-scale=1">',
    '<title>Pay Tracker | Authorization Required</title>',
    '<style>',
    'html,body{margin:0;min-height:100%;}',
    'body{display:grid;place-items:center;',
    'padding:24px;background:#f6f8fc;',
    'color:#334155;font-family:Arial,sans-serif;}',
    '.auth-card{width:min(620px,100%);',
    'padding:30px;border:1px solid #e2e8f0;',
    'border-radius:16px;background:#fff;',
    'box-shadow:0 16px 40px rgba(15,23,42,.10);}',
    'h1{margin:0;color:#0f172a;font-size:24px;}',
    'p{margin:12px 0 0;line-height:1.6;}',
    'a.button{display:inline-block;margin-top:18px;',
    'padding:12px 20px;border-radius:10px;',
    'background:#2563eb;color:#fff;font-weight:700;',
    'text-decoration:none;}',
    '</style>',
    '</head>',
    '<body>',
    '<main class="auth-card">',
    '<h1>One-time authorization required</h1>',
    '<p>Pay Tracker needs your permission to use ',
    'Google services it depends on (such as making ',
    'requests to your connected bank). This is a ',
    'one-time Google consent screen for your own script ',
    '&mdash; approve it, then come back and refresh ',
    'this page.</p>',
    '<a class="button" href="',
    safeUrl,
    '" target="_blank" rel="noopener">',
    'Review permissions',
    '</a>',
    '</main>',
    '</body>',
    '</html>'
  ].join('');

  return HtmlService
    .createHtmlOutput(html)
    .setTitle('Pay Tracker | Authorization Required')
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
    .replace(/'/g, '&#39;');
}
