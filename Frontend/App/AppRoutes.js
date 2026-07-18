/*******************************************************
 * PAY TRACKER V2.6
 * Frontend/App/AppRoutes.js
 *
 * Purpose:
 * - Define the supported frontend routes
 * - Resolve route titles and metadata
 * - Provide shared route validation
 * - Keep navigation configuration in one place
 *******************************************************/

const PayTrackerAppRoutes = Object.freeze({
  DEFAULT_ROUTE: 'dashboard',

  ROUTES: Object.freeze({
    dashboard: Object.freeze({
      id: 'dashboard',
      title: 'Dashboard',
      pageElementId: 'page-dashboard',
      section: 'main',
      icon: 'dashboard',
      enabled: true
    }),

    pay: Object.freeze({
      id: 'pay',
      title: 'Pay',
      pageElementId: 'page-pay',
      section: 'main',
      icon: 'pay',
      enabled: true
    }),

    finance: Object.freeze({
      id: 'finance',
      title: 'Finance',
      pageElementId: 'page-finance',
      section: 'main',
      icon: 'finance',
      enabled: true
    }),

    savings: Object.freeze({
      id: 'savings',
      title: 'Savings',
      pageElementId: 'page-savings',
      section: 'main',
      icon: 'savings',
      enabled: true
    }),

    goals: Object.freeze({
      id: 'goals',
      title: 'Life Goals',
      pageElementId: 'page-goals',
      section: 'main',
      icon: 'goals',
      enabled: true
    }),

    reports: Object.freeze({
      id: 'reports',
      title: 'Reports',
      pageElementId: 'page-reports',
      section: 'insights',
      icon: 'reports',
      enabled: true
    }),

    calendar: Object.freeze({
      id: 'calendar',
      title: 'Calendar',
      pageElementId: 'page-calendar',
      section: 'insights',
      icon: 'calendar',
      enabled: true
    }),

    settings: Object.freeze({
      id: 'settings',
      title: 'Settings',
      pageElementId: 'page-settings',
      section: 'system',
      icon: 'settings',
      enabled: true
    })
  }),

  /**
   * Returns a valid route ID.
   *
   * @param {*} route Requested route.
   * @return {string} Valid route ID.
   */
  normalize: function(route) {
    const normalizedRoute = String(route || '')
      .trim()
      .toLowerCase();

    const routeConfig =
      PayTrackerAppRoutes.ROUTES[normalizedRoute];

    if (routeConfig && routeConfig.enabled) {
      return normalizedRoute;
    }

    return PayTrackerAppRoutes.DEFAULT_ROUTE;
  },

  /**
   * Returns route metadata.
   *
   * @param {*} route Requested route.
   * @return {Object} Route configuration.
   */
  get: function(route) {
    const normalizedRoute =
      PayTrackerAppRoutes.normalize(route);

    return PayTrackerAppRoutes.ROUTES[normalizedRoute];
  },

  /**
   * Returns all enabled routes.
   *
   * @return {Array<Object>} Enabled route configurations.
   */
  getAll: function() {
    return Object.keys(PayTrackerAppRoutes.ROUTES)
      .map(function(routeId) {
        return PayTrackerAppRoutes.ROUTES[routeId];
      })
      .filter(function(route) {
        return route.enabled;
      });
  },

  /**
   * Returns routes for a navigation section.
   *
   * @param {string} section Navigation section.
   * @return {Array<Object>} Matching routes.
   */
  getBySection: function(section) {
    const normalizedSection = String(section || '')
      .trim()
      .toLowerCase();

    return PayTrackerAppRoutes.getAll()
      .filter(function(route) {
        return route.section === normalizedSection;
      });
  },

  /**
   * Returns the browser page title.
   *
   * @param {*} route Requested route.
   * @param {string=} appName Application name.
   * @return {string} Browser title.
   */
  getDocumentTitle: function(route, appName) {
    const routeConfig = PayTrackerAppRoutes.get(route);
    const normalizedAppName =
      String(appName || 'Pay Tracker').trim();

    return routeConfig.title + ' | ' + normalizedAppName;
  },

  /**
   * Returns whether a route exists and is enabled.
   *
   * @param {*} route Requested route.
   * @return {boolean} True when valid.
   */
  isValid: function(route) {
    const normalizedRoute = String(route || '')
      .trim()
      .toLowerCase();

    const routeConfig =
      PayTrackerAppRoutes.ROUTES[normalizedRoute];

    return Boolean(routeConfig && routeConfig.enabled);
  }
});