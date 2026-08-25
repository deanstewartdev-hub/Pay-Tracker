/*******************************************************
 * PAY TRACKER V2.5
 * Menu.gs
 *******************************************************/

const PayTrackerMenu = Object.freeze({
  build: function () {
    const ui = SpreadsheetApp.getUi();
    const mainMenu = ui.createMenu(PayTrackerConfig.APP.NAME);

    const calendarMenu = ui
      .createMenu('Calendar')
      .addItem(
        'Sync Google Calendar',
        'syncGoogleCalendarToPaySheet'
      )
      .addItem(
        'Debug Calendar Events',
        'debugCalendarEvents'
      )
      .addSeparator()
      .addItem(
        'Enable Automatic Sync (Every 6 Hours)',
        'enableAutomaticPayTrackerCalendarSync'
      )
      .addItem(
        'Disable Automatic Sync',
        'disableAutomaticPayTrackerCalendarSync'
      );

    const weeksMenu = ui
      .createMenu('Weeks')
      .addItem('Add Next Week', 'addNextWeek')
      .addItem(
        'Fix Week Dates Only',
        'fixAllWeekDatesOnly'
      )
      .addItem(
        'Show Relevant Weeks Only',
        'showRelevantWeeksOnly'
      )
      .addItem('Show All Weeks', 'showAllWeeks');

    const payMenu = ui
      .createMenu('Pay & Summaries')
      .addItem(
        'Refresh Summary Panels',
        'refreshPaySummaryPanels'
      )
      .addItem(
        'Recalculate All Pay',
        'recalculateAllPay'
      )
      .addItem(
        'Apply Month Colours',
        'applyMonthColoursToExistingWeeks'
      )
      .addItem(
        'Refresh Sheet Layout',
        'refreshPayTrackerLayout'
      );

    const financeMenu = ui
      .createMenu('Bills & Debts')
      .addItem(
        'Setup or Upgrade Finance Module',
        'setupFinanceModule'
      )
      .addItem(
        'Open Finance Dashboard',
        'openFinanceDashboard'
      )
      .addItem(
        'Refresh Finance Dashboard',
        'refreshFinanceDashboard'
      )
      .addItem(
        'Recalculate Bills & Debts',
        'recalculateFinanceModule'
      )
      .addItem(
        'Generate Upcoming Payments',
        'syncUpcomingFinancePayments'
      )
      .addSeparator()
      .addItem(
        'Undo Last Payment',
        'undoLastFinancePayment'
      )
      .addSeparator()
      .addItem('Open Bills', 'openBillsSheet')
      .addItem('Open Debts', 'openDebtsSheet')
      .addItem(
        'Open Finance Payments',
        'openFinancePaymentsSheet'
      )
      .addItem(
        'Open Payment History',
        'openPaymentHistorySheet'
      );

    const savingsMenu = ui
      .createMenu('Savings & Goals')
      .addItem(
        'Setup or Upgrade Savings Module',
        'setupSavingsModule'
      )
      .addItem(
        'Recalculate Savings',
        'recalculateSavingsModule'
      )
      .addItem(
        'Generate Savings Contributions',
        'syncUpcomingSavingsContributions'
      )
      .addItem(
        'Undo Last Savings Deposit',
        'undoLastSavingsDeposit'
      )
      .addSeparator()
      .addItem(
        'Open Savings Settings',
        'openSavingsSettingsSheet'
      )
      .addItem(
        'Open Savings Pots',
        'openSavingsPotsSheet'
      )
      .addItem(
        'Open Savings Contributions',
        'openSavingsContributionsSheet'
      )
      .addItem(
        'Open Savings History',
        'openSavingsHistorySheet'
      )
      .addItem(
        'Open Life Goals',
        'openLifeGoalsSheet'
      );

    const maintenanceMenu = ui
      .createMenu('Maintenance')
      .addItem('Backup PaySheet', 'backupPaySheet')
      .addItem(
        'Setup or Rebuild Pay Tracker',
        'setupPayTracker'
      );

    mainMenu
      .addSubMenu(calendarMenu)
      .addSubMenu(weeksMenu)
      .addSubMenu(payMenu)
      .addSubMenu(financeMenu)
      .addSubMenu(savingsMenu)
      .addSubMenu(maintenanceMenu)
      .addToUi();
  }
});

function payTrackerBuildMenu_() {
  PayTrackerMenu.build();
}
