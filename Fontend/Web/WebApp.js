/*******************************************************
 * PAY TRACKER V2.6
 * Web/WebApp.js
 *
 * Purpose:
 * - Web application entry point
 * - HTML template rendering
 * - Shared frontend file inclusion
 * - Initial application configuration
 *
 * This file does not modify spreadsheet data.
 *******************************************************/

const PayTrackerWebApp = Object.freeze({
  VERSION: '2.6.0',

  APP_NAME: 'Pay Tracker',

  DEFAULT_PAGE: 'dashboard',

  PAGES: Object.freeze({
    DASHBOARD: 'dashboard',
    PAY: 'pay',
    FINANCE: 'finance',
    SAVINGS: 'savings',
    GOALS: 'goals',
    SETTINGS: 'settings'
  }),

  PAGE_TITLES: Object.freeze({
    dashboard: 'Dashboard',
    pay: 'Pay',
    finance: 'Finance',
    savings: 'Savings',
    goals: 'Life Goals',
    settings: 'Settings'
  }),

  HTML_FILES: Object.freeze({
    INDEX: 'Web/Index',
    STYLES: 'Web/Styles',
    SCRIPTS: 'Web/Scripts',
    SIDEBAR: 'Web/Components/Sidebar',
    HEADER: 'Web/Components/Header',
    DASHBOARD: 'Web/Components/Dashboard'
  })
});

/**
 * Serves the Pay Tracker web application.
 *
 * Example routes:
 *   /exec
 *   /exec?page=dashboard
 *   /exec?page=pay
 *   /exec?page=finance
 *   /exec?page=savings
 *
 * @param {GoogleAppsScript.Events.DoGet} event Web request event.
 * @return {GoogleAppsScript.HTML.HtmlOutput} Rendered web application.
 */
function doGet(event) {
  try {
    const requestedPage = getPayTrackerRequestedPage_(event);
    const template = HtmlService.createTemplateFromFile(
      PayTrackerWebApp.HTML_FILES.INDEX
    );

    template.app = buildPayTrackerWebAppContext_(requestedPage);

    return template
      .evaluate()
      .setTitle(PayTrackerWebApp.APP_NAME)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    console.error('Pay Tracker web application failed to load.', error);

    return createPayTrackerWebErrorPage_(error);
  }
}

/**
 * Includes another HTML file inside an Apps Script HTML template.
 *
 * Usage inside HTML:
 *   <?!= includePayTrackerHtml_('Web/Styles'); ?>
 *
 * @param {string} filename Apps Script HTML filename without extension.
 * @return {string} File contents.
 */
function includePayTrackerHtml_(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('A valid HTML filename is required.');
  }

  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Returns the initial frontend application configuration.
 *
 * This method can also be called from google.script.run after the page loads.
 *
 * @return {Object} Serializable application configuration.
 */
function getPayTrackerWebAppConfig() {
  return buildPayTrackerWebAppContext_(PayTrackerWebApp.DEFAULT_PAGE);
}

/**
 * Creates the server-side context passed into Index.html.
 *
 * @param {string} requestedPage Valid application page.
 * @return {Object} Serializable application context.
 * @private
 */
function buildPayTrackerWebAppContext_(requestedPage) {
  const page = isPayTrackerValidPage_(requestedPage)
    ? requestedPage
    : PayTrackerWebApp.DEFAULT_PAGE;

  return {
    appName: PayTrackerWebApp.APP_NAME,
    version: PayTrackerWebApp.VERSION,
    activePage: page,
    pageTitle: PayTrackerWebApp.PAGE_TITLES[page],
    pages: [
      {
        id: PayTrackerWebApp.PAGES.DASHBOARD,
        label: PayTrackerWebApp.PAGE_TITLES.dashboard,
        icon: 'dashboard'
      },
      {
        id: PayTrackerWebApp.PAGES.PAY,
        label: PayTrackerWebApp.PAGE_TITLES.pay,
        icon: 'payments'
      },
      {
        id: PayTrackerWebApp.PAGES.FINANCE,
        label: PayTrackerWebApp.PAGE_TITLES.finance,
        icon: 'account_balance'
      },
      {
        id: PayTrackerWebApp.PAGES.SAVINGS,
        label: PayTrackerWebApp.PAGE_TITLES.savings,
        icon: 'savings'
      },
      {
        id: PayTrackerWebApp.PAGES.GOALS,
        label: PayTrackerWebApp.PAGE_TITLES.goals,
        icon: 'flag'
      },
      {
        id: PayTrackerWebApp.PAGES.SETTINGS,
        label: PayTrackerWebApp.PAGE_TITLES.settings,
        icon: 'settings'
      }
    ],
    generatedAt: new Date().toISOString()
  };
}

/**
 * Extracts and validates the requested route from the web request.
 *
 * @param {GoogleAppsScript.Events.DoGet} event Web request event.
 * @return {string} Normalized page identifier.
 * @private
 */
function getPayTrackerRequestedPage_(event) {
  if (
    !event ||
    !event.parameter ||
    typeof event.parameter.page !== 'string'
  ) {
    return PayTrackerWebApp.DEFAULT_PAGE;
  }

  const requestedPage = event.parameter.page.trim().toLowerCase();

  return isPayTrackerValidPage_(requestedPage)
    ? requestedPage
    : PayTrackerWebApp.DEFAULT_PAGE;
}

/**
 * Determines whether a page identifier is supported.
 *
 * @param {string} page Page identifier.
 * @return {boolean} True when supported.
 * @private
 */
function isPayTrackerValidPage_(page) {
  if (!page || typeof page !== 'string') {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(
    PayTrackerWebApp.PAGE_TITLES,
    page
  );
}

/**
 * Generates a safe fallback page when the primary template fails.
 *
 * @param {*} error Error raised while rendering the web application.
 * @return {GoogleAppsScript.HTML.HtmlOutput} Error page.
 * @private
 */
function createPayTrackerWebErrorPage_(error) {
  const message =
    error && error.message
      ? String(error.message)
      : 'An unexpected error occurred.';

  const safeMessage = escapePayTrackerHtml_(message);

  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <base target="_top">',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>Pay Tracker</title>',
    '  <style>',
    '    body {',
    '      margin: 0;',
    '      min-height: 100vh;',
    '      display: grid;',
    '      place-items: center;',
    '      padding: 24px;',
    '      box-sizing: border-box;',
    '      background: #f3f4f6;',
    '      color: #111827;',
    '      font-family: Arial, sans-serif;',
    '    }',
    '    .error-card {',
    '      width: 100%;',
    '      max-width: 560px;',
    '      padding: 32px;',
    '      box-sizing: border-box;',
    '      border: 1px solid #e5e7eb;',
    '      border-radius: 16px;',
    '      background: #ffffff;',
    '    }',
    '    h1 { margin-top: 0; }',
    '    p { line-height: 1.6; }',
    '    code {',
    '      display: block;',
    '      margin-top: 16px;',
    '      padding: 12px;',
    '      overflow-wrap: anywhere;',
    '      border-radius: 8px;',
    '      background: #f9fafb;',
    '    }',
    '  </style>',
    '</head>',
    '<body>',
    '  <main class="error-card">',
    '    <h1>Pay Tracker could not load</h1>',
    '    <p>The web application encountered an error while starting.</p>',
    '    <code>' + safeMessage + '</code>',
    '  </main>',
    '</body>',
    '</html>'
  ].join('\n');

  return HtmlService
    .createHtmlOutput(html)
    .setTitle('Pay Tracker — Error')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Escapes a value before inserting it into fallback HTML.
 *
 * @param {*} value Value to escape.
 * @return {string} Escaped text.
 * @private
 */
function escapePayTrackerHtml_(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}