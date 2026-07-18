/*******************************************************
 * PAY TRACKER V2.6
 * Frontend/App/AppController.js
 *
 * Purpose:
 * - Coordinate frontend application startup
 * - Manage client-side navigation
 * - Control loading and error states
 * - Manage sidebar and responsive behaviour
 * - Maintain application state
 * - Provide shared toast notifications
 *******************************************************/

const PayTrackerAppController = (() => {
  const STORAGE_KEYS = Object.freeze({
    THEME: 'payTracker.theme'
  });

  const THEMES = Object.freeze({
    LIGHT: 'light',
    DARK: 'dark'
  });

  const CONNECTION_STATES = Object.freeze({
    CONNECTING: 'connecting',
    ONLINE: 'online',
    OFFLINE: 'offline'
  });

  const state = {
    initialized: false,
    loading: false,
    bootstrap: null,
    activeRoute: PayTrackerAppRoutes.DEFAULT_ROUTE,
    theme: THEMES.LIGHT,
    connectionState: CONNECTION_STATES.CONNECTING
  };

  const elements = {};

  /**
   * Starts the Pay Tracker frontend.
   *
   * @return {void}
   */
  function initialize() {
    if (state.initialized) {
      return;
    }

    try {
      state.bootstrap = readBootstrap_();
      state.activeRoute = PayTrackerAppRoutes.normalize(
        state.bootstrap.activeRoute
      );

      cacheElements_();
      bindApplicationEvents_();
      initializeTheme_();
      initializeNavigation_();
      initializeProfileMenu_();
      initializeSearch_();

      setConnectionState_(
        CONNECTION_STATES.CONNECTING,
        'Connecting to Apps Script'
      );

      showLoadingState_();
      checkBackendHealth_();

      state.initialized = true;
    } catch (error) {
      console.error(
        'Pay Tracker frontend initialization failed.',
        error
      );

      showApplicationError_(
        getErrorMessage_(
          error,
          'Pay Tracker could not initialize.'
        )
      );
    }
  }

  /**
   * Reads the bootstrap object injected by Apps Script.
   *
   * @return {Object} Bootstrap configuration.
   * @private
   */
  function readBootstrap_() {
    const bootstrap = window.PAY_TRACKER_BOOTSTRAP;

    if (!bootstrap || typeof bootstrap !== 'object') {
      throw new Error(
        'The Pay Tracker bootstrap configuration is unavailable.'
      );
    }

    return bootstrap;
  }

  /**
   * Caches shared DOM elements.
   *
   * @return {void}
   * @private
   */
  function cacheElements_() {
    elements.app = document.getElementById(
      'pay-tracker-app'
    );

    elements.mainContent = document.getElementById(
      'app-main-content'
    );

    elements.loadingState = document.getElementById(
      'app-loading-state'
    );

    elements.errorState = document.getElementById(
      'app-error-state'
    );

    elements.errorMessage = document.getElementById(
      'app-error-message'
    );

    elements.retryButton = document.getElementById(
      'retry-app-button'
    );

    elements.sidebar = document.getElementById(
      'app-sidebar'
    );

    elements.sidebarOverlay = document.getElementById(
      'sidebar-overlay'
    );

    elements.sidebarOpenButton = document.getElementById(
      'sidebar-open-button'
    );

    elements.sidebarCloseButton = document.getElementById(
      'sidebar-close-button'
    );

    elements.pageTitle = document.getElementById(
      'page-title'
    );

    elements.refreshButton = document.getElementById(
      'refresh-app-button'
    );

    elements.themeToggleButton = document.getElementById(
      'theme-toggle-button'
    );

    elements.themeLightIcon = document.getElementById(
      'theme-light-icon'
    );

    elements.themeDarkIcon = document.getElementById(
      'theme-dark-icon'
    );

    elements.profileButton = document.getElementById(
      'profile-button'
    );

    elements.profileMenu = document.getElementById(
      'profile-menu'
    );

    elements.globalSearchInput = document.getElementById(
      'global-search-input'
    );

    elements.sidebarConnectionDot = document.getElementById(
      'sidebar-connection-dot'
    );

    elements.sidebarConnectionText = document.getElementById(
      'sidebar-connection-text'
    );

    elements.footerConnectionDot = document.getElementById(
      'footer-connection-dot'
    );

    elements.footerConnectionText = document.getElementById(
      'footer-connection-text'
    );

    elements.footerLastUpdated = document.getElementById(
      'footer-last-updated'
    );

    elements.toastRegion = document.getElementById(
      'toast-region'
    );
  }

  /**
   * Registers application-wide event handlers.
   *
   * @return {void}
   * @private
   */
  function bindApplicationEvents_() {
    if (elements.sidebarOpenButton) {
      elements.sidebarOpenButton.addEventListener(
        'click',
        openSidebar_
      );
    }

    if (elements.sidebarCloseButton) {
      elements.sidebarCloseButton.addEventListener(
        'click',
        closeSidebar_
      );
    }

    if (elements.sidebarOverlay) {
      elements.sidebarOverlay.addEventListener(
        'click',
        closeSidebar_
      );
    }

    if (elements.refreshButton) {
      elements.refreshButton.addEventListener(
        'click',
        refreshApplication_
      );
    }

    if (elements.retryButton) {
      elements.retryButton.addEventListener(
        'click',
        retryApplication_
      );
    }

    if (elements.themeToggleButton) {
      elements.themeToggleButton.addEventListener(
        'click',
        toggleTheme_
      );
    }

    document.addEventListener(
      'keydown',
      handleKeyboardShortcuts_
    );

    document.addEventListener(
      'click',
      handleDocumentClick_
    );

    window.addEventListener(
      'popstate',
      handleBrowserHistory_
    );

    window.addEventListener(
      'resize',
      handleViewportResize_
    );
  }

  /**
   * Connects route navigation controls.
   *
   * @return {void}
   * @private
   */
  function initializeNavigation_() {
    const routeButtons = document.querySelectorAll(
      '[data-route]'
    );

    routeButtons.forEach(function(button) {
      button.addEventListener('click', function() {
        navigateToRoute_(button.dataset.route);
      });
    });

    const routeTargetButtons = document.querySelectorAll(
      '[data-route-target]'
    );

    routeTargetButtons.forEach(function(button) {
      button.addEventListener('click', function() {
        navigateToRoute_(
          button.dataset.routeTarget
        );
      });
    });
  }

  /**
   * Navigates to a frontend route.
   *
   * @param {*} route Requested route.
   * @param {Object=} options Navigation options.
   * @return {void}
   * @private
   */
  function navigateToRoute_(route, options) {
    const settings = Object.assign(
      {
        updateHistory: true,
        focusContent: true
      },
      options || {}
    );

    const normalizedRoute =
      PayTrackerAppRoutes.normalize(route);

    state.activeRoute = normalizedRoute;

    showRoute_(normalizedRoute);
    updateNavigationState_(normalizedRoute);
    updatePageTitle_(normalizedRoute);
    updateDocumentTitle_(normalizedRoute);

    if (settings.updateHistory) {
      updateBrowserHistory_(normalizedRoute);
    }

    if (
      settings.focusContent &&
      elements.mainContent
    ) {
      try {
        elements.mainContent.focus({
          preventScroll: true
        });
      } catch (error) {
        elements.mainContent.focus();
      }
    }

    closeSidebar_();
  }

  /**
   * Displays the requested application page.
   *
   * @param {string} route Route identifier.
   * @return {void}
   * @private
   */
  function showRoute_(route) {
    const routeConfig =
      PayTrackerAppRoutes.get(route);

    const pages = document.querySelectorAll(
      '.app-page'
    );

    pages.forEach(function(page) {
      page.hidden =
        page.id !== routeConfig.pageElementId;
    });

    if (elements.loadingState) {
      elements.loadingState.hidden = true;
    }

    if (elements.errorState) {
      elements.errorState.hidden = true;
    }
  }

  /**
   * Updates navigation active-state styling.
   *
   * @param {string} route Active route.
   * @return {void}
   * @private
   */
  function updateNavigationState_(route) {
    const routeButtons = document.querySelectorAll(
      '[data-route]'
    );

    routeButtons.forEach(function(button) {
      const isActive =
        button.dataset.route === route;

      button.classList.toggle(
        'is-active',
        isActive
      );

      button.setAttribute(
        'aria-current',
        isActive ? 'page' : 'false'
      );
    });

    if (elements.app) {
      elements.app.dataset.activeRoute = route;
    }
  }

  /**
   * Updates the visible page title.
   *
   * @param {string} route Active route.
   * @return {void}
   * @private
   */
  function updatePageTitle_(route) {
    if (!elements.pageTitle) {
      return;
    }

    const routeConfig =
      PayTrackerAppRoutes.get(route);

    elements.pageTitle.textContent =
      routeConfig.title;
  }

  /**
   * Updates the browser tab title.
   *
   * @param {string} route Active route.
   * @return {void}
   * @private
   */
  function updateDocumentTitle_(route) {
    document.title =
      PayTrackerAppRoutes.getDocumentTitle(
        route,
        state.bootstrap.appName
      );
  }

  /**
   * Adds the current route to browser history.
   *
   * @param {string} route Route identifier.
   * @return {void}
   * @private
   */
  function updateBrowserHistory_(route) {
    const currentUrl = new URL(
      window.location.href
    );

    currentUrl.searchParams.set(
      'page',
      route
    );

    window.history.pushState(
      {
        route: route
      },
      '',
      currentUrl.toString()
    );
  }

  /**
   * Handles browser back and forward navigation.
   *
   * @return {void}
   * @private
   */
  function handleBrowserHistory_() {
    const currentUrl = new URL(
      window.location.href
    );

    const route =
      currentUrl.searchParams.get('page');

    navigateToRoute_(route, {
      updateHistory: false,
      focusContent: false
    });
  }

  /**
   * Opens the mobile sidebar.
   *
   * @return {void}
   * @private
   */
  function openSidebar_() {
    if (!elements.app) {
      return;
    }

    elements.app.classList.add(
      'is-sidebar-open'
    );

    if (elements.sidebarOverlay) {
      elements.sidebarOverlay.hidden = false;
    }

    if (elements.sidebarOpenButton) {
      elements.sidebarOpenButton.setAttribute(
        'aria-expanded',
        'true'
      );
    }
  }

  /**
   * Closes the mobile sidebar.
   *
   * @return {void}
   * @private
   */
  function closeSidebar_() {
    if (!elements.app) {
      return;
    }

    elements.app.classList.remove(
      'is-sidebar-open'
    );

    if (elements.sidebarOverlay) {
      elements.sidebarOverlay.hidden = true;
    }

    if (elements.sidebarOpenButton) {
      elements.sidebarOpenButton.setAttribute(
        'aria-expanded',
        'false'
      );
    }
  }

  /**
   * Closes the sidebar on wider screens.
   *
   * @return {void}
   * @private
   */
  function handleViewportResize_() {
    if (window.innerWidth > 860) {
      closeSidebar_();
    }
  }

  /**
   * Initializes the selected colour theme.
   *
   * @return {void}
   * @private
   */
  function initializeTheme_() {
    const savedTheme = readStoredTheme_();
    const preferredTheme = getPreferredTheme_();

    applyTheme_(
      savedTheme || preferredTheme
    );
  }

  /**
   * Reads the saved theme preference.
   *
   * @return {string|null} Stored theme.
   * @private
   */
  function readStoredTheme_() {
    try {
      const storedTheme =
        window.localStorage.getItem(
          STORAGE_KEYS.THEME
        );

      if (
        storedTheme === THEMES.LIGHT ||
        storedTheme === THEMES.DARK
      ) {
        return storedTheme;
      }
    } catch (error) {
      console.warn(
        'Pay Tracker could not read the saved theme.',
        error
      );
    }

    return null;
  }

  /**
   * Returns the browser colour-scheme preference.
   *
   * @return {string} Preferred theme.
   * @private
   */
  function getPreferredTheme_() {
    if (
      window.matchMedia &&
      window.matchMedia(
        '(prefers-color-scheme: dark)'
      ).matches
    ) {
      return THEMES.DARK;
    }

    return THEMES.LIGHT;
  }

  /**
   * Switches between light and dark themes.
   *
   * @return {void}
   * @private
   */
  function toggleTheme_() {
    const nextTheme =
      state.theme === THEMES.DARK
        ? THEMES.LIGHT
        : THEMES.DARK;

    applyTheme_(nextTheme);
    saveTheme_(nextTheme);

    showToast_(
      nextTheme === THEMES.DARK
        ? 'Dark theme enabled.'
        : 'Light theme enabled.',
      'info'
    );
  }

  /**
   * Applies a colour theme.
   *
   * @param {string} theme Theme name.
   * @return {void}
   * @private
   */
  function applyTheme_(theme) {
    const normalizedTheme =
      theme === THEMES.DARK
        ? THEMES.DARK
        : THEMES.LIGHT;

    state.theme = normalizedTheme;

    document.documentElement.dataset.theme =
      normalizedTheme;

    if (elements.themeLightIcon) {
      elements.themeLightIcon.hidden =
        normalizedTheme === THEMES.DARK;
    }

    if (elements.themeDarkIcon) {
      elements.themeDarkIcon.hidden =
        normalizedTheme !== THEMES.DARK;
    }

    if (elements.themeToggleButton) {
      const label =
        normalizedTheme === THEMES.DARK
          ? 'Use light theme'
          : 'Use dark theme';

      elements.themeToggleButton.setAttribute(
        'aria-label',
        label
      );

      elements.themeToggleButton.setAttribute(
        'title',
        label
      );
    }
  }

  /**
   * Stores the theme preference.
   *
   * @param {string} theme Theme name.
   * @return {void}
   * @private
   */
  function saveTheme_(theme) {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.THEME,
        theme
      );
    } catch (error) {
      console.warn(
        'Pay Tracker could not save the theme.',
        error
      );
    }
  }

  /**
   * Initializes profile-menu actions.
   *
   * @return {void}
   * @private
   */
  function initializeProfileMenu_() {
    if (elements.profileButton) {
      elements.profileButton.addEventListener(
        'click',
        toggleProfileMenu_
      );
    }

    const profileActions =
      document.querySelectorAll(
        '[data-profile-action]'
      );

    profileActions.forEach(function(button) {
      button.addEventListener(
        'click',
        function() {
          handleProfileAction_(
            button.dataset.profileAction
          );
        }
      );
    });
  }

  /**
   * Opens or closes the profile menu.
   *
   * @return {void}
   * @private
   */
  function toggleProfileMenu_() {
    if (
      !elements.profileMenu ||
      !elements.profileButton
    ) {
      return;
    }

    const willOpen =
      elements.profileMenu.hidden;

    elements.profileMenu.hidden =
      !willOpen;

    elements.profileButton.setAttribute(
      'aria-expanded',
      String(willOpen)
    );
  }

  /**
   * Closes the profile menu.
   *
   * @return {void}
   * @private
   */
  function closeProfileMenu_() {
    if (elements.profileMenu) {
      elements.profileMenu.hidden = true;
    }

    if (elements.profileButton) {
      elements.profileButton.setAttribute(
        'aria-expanded',
        'false'
      );
    }
  }

  /**
   * Handles profile menu actions.
   *
   * @param {string} action Profile action.
   * @return {void}
   * @private
   */
  function handleProfileAction_(action) {
    closeProfileMenu_();

    switch (action) {
      case 'settings':
        navigateToRoute_('settings');
        break;

      case 'profile':
        showToast_(
          'Profile management will be added later.',
          'info'
        );
        break;

      case 'about':
        showToast_(
          'Pay Tracker version ' +
            String(
              state.bootstrap.version || '2.6.0'
            ),
          'info'
        );
        break;

      default:
        break;
    }
  }

  /**
   * Initializes the global search field.
   *
   * @return {void}
   * @private
   */
  function initializeSearch_() {
    if (!elements.globalSearchInput) {
      return;
    }

    elements.globalSearchInput.addEventListener(
      'keydown',
      function(event) {
        if (event.key !== 'Enter') {
          return;
        }

        event.preventDefault();

        const query =
          elements.globalSearchInput.value.trim();

        if (!query) {
          return;
        }

        showToast_(
          'Search will be connected after the main pages are live.',
          'info'
        );
      }
    );
  }

  /**
   * Handles application keyboard shortcuts.
   *
   * @param {KeyboardEvent} event Keyboard event.
   * @return {void}
   * @private
   */
  function handleKeyboardShortcuts_(event) {
    const isSearchShortcut =
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'k';

    if (isSearchShortcut) {
      event.preventDefault();

      if (elements.globalSearchInput) {
        elements.globalSearchInput.focus();
        elements.globalSearchInput.select();
      }

      return;
    }

    if (event.key === 'Escape') {
      closeSidebar_();
      closeProfileMenu_();
    }
  }

  /**
   * Handles clicks outside transient menus.
   *
   * @param {MouseEvent} event Click event.
   * @return {void}
   * @private
   */
  function handleDocumentClick_(event) {
    if (
      elements.profileMenu &&
      elements.profileButton &&
      !elements.profileMenu.hidden &&
      !elements.profileMenu.contains(event.target) &&
      !elements.profileButton.contains(event.target)
    ) {
      closeProfileMenu_();
    }
  }

  /**
   * Refreshes the application health state.
   *
   * @return {void}
   * @private
   */
  function refreshApplication_() {
    if (state.loading) {
      return;
    }

    state.loading = true;
    setRefreshButtonBusy_(true);

    setConnectionState_(
      CONNECTION_STATES.CONNECTING,
      'Refreshing Pay Tracker'
    );

    callServerFunction_(
      'getPayTrackerWebHealth',
      [],
      function(response) {
        state.loading = false;
        setRefreshButtonBusy_(false);
        handleHealthSuccess_(response);

        showToast_(
          'Pay Tracker refreshed successfully.',
          'success'
        );
      },
      function(error) {
        state.loading = false;
        setRefreshButtonBusy_(false);
        handleHealthFailure_(error);

        showToast_(
          'Pay Tracker could not refresh.',
          'danger'
        );
      }
    );
  }

  /**
   * Updates the refresh button busy state.
   *
   * @param {boolean} isBusy Busy state.
   * @return {void}
   * @private
   */
  function setRefreshButtonBusy_(isBusy) {
    if (!elements.refreshButton) {
      return;
    }

    elements.refreshButton.disabled = isBusy;

    elements.refreshButton.setAttribute(
      'aria-busy',
      String(isBusy)
    );
  }

  /**
   * Checks the Apps Script backend.
   *
   * @return {void}
   * @private
   */
  function checkBackendHealth_() {
    callServerFunction_(
      'getPayTrackerWebHealth',
      [],
      handleHealthSuccess_,
      handleHealthFailure_
    );
  }

  /**
   * Handles a successful backend response.
   *
   * @param {Object} response Health response.
   * @return {void}
   * @private
   */
  function handleHealthSuccess_(response) {
    if (
      !response ||
      response.success !== true
    ) {
      handleHealthFailure_(
        new Error(
          'The backend returned an invalid health response.'
        )
      );

      return;
    }

    setConnectionState_(
      CONNECTION_STATES.ONLINE,
      'Apps Script online'
    );

    updateLastUpdated_(
      response.checkedAt
    );

    navigateToRoute_(
      state.activeRoute,
      {
        updateHistory: false,
        focusContent: false
      }
    );
  }

  /**
   * Handles a failed backend response.
   *
   * @param {*} error Backend error.
   * @return {void}
   * @private
   */
  function handleHealthFailure_(error) {
    const message = getErrorMessage_(
      error,
      'The Apps Script backend could not be reached.'
    );

    setConnectionState_(
      CONNECTION_STATES.OFFLINE,
      'Apps Script unavailable'
    );

    showApplicationError_(message);
  }

  /**
   * Updates connection indicators.
   *
   * @param {string} connectionState Connection state.
   * @param {string} message Display message.
   * @return {void}
   * @private
   */
  function setConnectionState_(
    connectionState,
    message
  ) {
    state.connectionState = connectionState;

    const statusDots = [
      elements.sidebarConnectionDot,
      elements.footerConnectionDot
    ];

    statusDots.forEach(function(dot) {
      if (!dot) {
        return;
      }

      dot.classList.remove(
        'is-online',
        'is-offline'
      );

      if (
        connectionState ===
        CONNECTION_STATES.ONLINE
      ) {
        dot.classList.add('is-online');
      }

      if (
        connectionState ===
        CONNECTION_STATES.OFFLINE
      ) {
        dot.classList.add('is-offline');
      }
    });

    if (elements.sidebarConnectionText) {
      elements.sidebarConnectionText.textContent =
        message;
    }

    if (elements.footerConnectionText) {
      elements.footerConnectionText.textContent =
        message;
    }
  }

  /**
   * Updates the footer timestamp.
   *
   * @param {string=} timestamp ISO timestamp.
   * @return {void}
   * @private
   */
  function updateLastUpdated_(timestamp) {
    if (!elements.footerLastUpdated) {
      return;
    }

    const parsedDate = timestamp
      ? new Date(timestamp)
      : new Date();

    const validDate = Number.isNaN(
      parsedDate.getTime()
    )
      ? new Date()
      : parsedDate;

    elements.footerLastUpdated.textContent =
      'Last updated: ' +
      validDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
  }

  /**
   * Shows the application loading state.
   *
   * @return {void}
   * @private
   */
  function showLoadingState_() {
    const pages =
      document.querySelectorAll('.app-page');

    pages.forEach(function(page) {
      page.hidden = true;
    });

    if (elements.errorState) {
      elements.errorState.hidden = true;
    }

    if (elements.loadingState) {
      elements.loadingState.hidden = false;
    }
  }

  /**
   * Shows the application error state.
   *
   * @param {string} message Error message.
   * @return {void}
   * @private
   */
  function showApplicationError_(message) {
    const pages =
      document.querySelectorAll('.app-page');

    pages.forEach(function(page) {
      page.hidden = true;
    });

    if (elements.loadingState) {
      elements.loadingState.hidden = true;
    }

    if (elements.errorMessage) {
      elements.errorMessage.textContent =
        message;
    }

    if (elements.errorState) {
      elements.errorState.hidden = false;
    }
  }

  /**
   * Retries application startup.
   *
   * @return {void}
   * @private
   */
  function retryApplication_() {
    showLoadingState_();

    setConnectionState_(
      CONNECTION_STATES.CONNECTING,
      'Retrying connection'
    );

    checkBackendHealth_();
  }

  /**
   * Displays a temporary notification.
   *
   * @param {string} message Notification text.
   * @param {string=} type Notification type.
   * @return {void}
   * @private
   */
  function showToast_(message, type) {
    if (
      !elements.toastRegion ||
      !message
    ) {
      return;
    }

    const normalizedType =
      String(type || 'info')
        .trim()
        .toLowerCase();

    const toast =
      document.createElement('div');

    toast.className =
      'toast toast--' + normalizedType;

    toast.setAttribute(
      'role',
      'status'
    );

    toast.textContent =
      String(message);

    elements.toastRegion.appendChild(toast);

    window.setTimeout(function() {
      toast.classList.add('is-leaving');

      window.setTimeout(function() {
        toast.remove();
      }, 180);
    }, 3600);
  }

  /**
   * Calls a Google Apps Script server function.
   *
   * @param {string} functionName Server function.
   * @param {Array<*>} parameters Function parameters.
   * @param {Function} successHandler Success callback.
   * @param {Function} failureHandler Failure callback.
   * @return {void}
   * @private
   */
  function callServerFunction_(
    functionName,
    parameters,
    successHandler,
    failureHandler
  ) {
    if (
      !window.google ||
      !google.script ||
      !google.script.run
    ) {
      failureHandler(
        new Error(
          'google.script.run is unavailable. Open the deployed Apps Script web application.'
        )
      );

      return;
    }

    let runner = google.script.run
      .withSuccessHandler(successHandler)
      .withFailureHandler(failureHandler);

    const serverFunction =
      runner[functionName];

    if (
      typeof serverFunction !== 'function'
    ) {
      failureHandler(
        new Error(
          'The backend function "' +
            functionName +
            '" is unavailable.'
        )
      );

      return;
    }

    serverFunction.apply(
      runner,
      parameters || []
    );
  }

  /**
   * Returns a readable error message.
   *
   * @param {*} error Error value.
   * @param {string} fallback Fallback message.
   * @return {string} Error message.
   * @private
   */
  function getErrorMessage_(error, fallback) {
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

    return fallback;
  }

  return Object.freeze({
    initialize: initialize,

    navigate: function(route) {
      navigateToRoute_(route);
    },

    refresh: refreshApplication_,

    showToast: function(message, type) {
      showToast_(message, type);
    },

    getState: function() {
      return Object.assign({}, state);
    }
  });
})();