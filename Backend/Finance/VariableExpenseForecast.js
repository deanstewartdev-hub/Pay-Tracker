/*******************************************************
 * PAY TRACKER V3.3 - Variable expense forecast (fuel)
 * Pure: a forecast for an expense that has no fixed due date.
 *
 * Fuel is spent when it is needed, not on a schedule, so it is
 * never a bill: it has no due date, is never overdue and is never
 * marked paid. It is an ESTIMATE of future spending, shown beside
 * the fixed commitments.
 *
 * No double counting:
 *  - The forecast only covers days AFTER today. Fuel bought today
 *    or earlier is real money already in the actuals (spending).
 *  - Recent actual fuel spending only changes the forecast RATE,
 *    never adds to it, so a purchase is counted once: as spending.
 *
 * No sheet access. Nothing here writes anything.
 *******************************************************/

const PayTrackerVariableExpenseForecast = Object.freeze({
  FUEL: Object.freeze({
    LABEL: 'Fuel',
    CATEGORY: 'Fuel',
    DEFAULT_AMOUNT: 75,
    DEFAULT_EVERY_DAYS: 4,
    OBSERVED_WINDOW_DAYS: 30,
    // Refine the estimate only from enough real history to mean something.
    MIN_OBSERVED_PURCHASES: 2,
    MIN_OBSERVED_DAYS: 8
  }),

  /** Spend per day from an amount spent every `everyDays` days. */
  dailyRate: function(amount, everyDays) {
    const days = Number(everyDays) || 0;
    return days > 0 ? (Number(amount) || 0) / days : 0;
  },

  /**
   * Fuel estimate for the days after `today` up to and including `to`.
   * @param {Object} input {today: 'yyyy-mm-dd', to: 'yyyy-mm-dd', observed: {amount, count, days}}
   */
  fuelForecast: function(input) {
    const T = PayTrackerPaymentTimeline;
    const config = this.FUEL;
    const observed = input.observed || { amount: 0, count: 0, days: 0 };
    const useObserved = observed.count >= config.MIN_OBSERVED_PURCHASES &&
      observed.days >= config.MIN_OBSERVED_DAYS && observed.amount > 0;
    const defaultRate = this.dailyRate(config.DEFAULT_AMOUNT, config.DEFAULT_EVERY_DAYS);
    const rate = useObserved ? observed.amount / observed.days : defaultRate;
    const daysAhead = Math.max(T.daysBetween(input.today, input.to), 0);
    const round = PayTrackerSmartSavingsCalculator.round;
    return {
      label: config.LABEL,
      estimateOnly: true,
      source: useObserved
        ? 'Your fuel spending over the last ' + observed.days + ' days'
        : 'Estimate: ' + PayTrackerSmartSavingsCalculator.money(config.DEFAULT_AMOUNT) +
          ' every ' + config.DEFAULT_EVERY_DAYS + ' days',
      dailyRate: round(rate),
      daysAhead: daysAhead,
      forecast: round(rate * daysAhead),
      perWeek: round(rate * 7),
      per30Days: round(rate * 30)
    };
  },

  /**
   * Actual fuel purchases over the trailing window, used to refine the
   * rate. Pending purchases are excluded (not settled yet); declined and
   * excluded rows never reach here. `days` is the history actually
   * available, so a short history is not averaged over a longer window.
   * @param {Array} proposals Step 2A cash-flow proposals
   * @param {string} todayKey 'yyyy-mm-dd'
   */
  observeFuel: function(proposals, todayKey) {
    const T = PayTrackerPaymentTimeline;
    const C = PayTrackerCashFlowClassifier.STATUSES;
    const windowDays = this.FUEL.OBSERVED_WINDOW_DAYS;
    let earliest = null;
    let amount = 0;
    let count = 0;
    (proposals || []).forEach(function(p) {
      const day = T.dayKey(p.date);
      if (!day || day > todayKey || p.status === C.EXCLUDED) return;
      if (!earliest || day < earliest) earliest = day;
      const age = T.daysBetween(day, todayKey);
      if (age < 0 || age >= windowDays) return;
      if (p.status === C.PENDING || p.direction === 'Credit') return;
      if (String(p.payTrackerCategory || '').trim().toLowerCase() !== 'fuel') return;
      amount += Number(p.amount) || 0;
      count++;
    });
    const span = earliest ? Math.min(windowDays, T.daysBetween(earliest, todayKey) + 1) : 0;
    return { amount: PayTrackerSmartSavingsCalculator.round(amount), count: count, days: span };
  }
});
