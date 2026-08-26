/*******************************************************
 * PAY TRACKER V2.1
 * Config.gs
 *
 * Central application configuration.
 *
 * This file contains:
 * - Spreadsheet layout settings
 * - Calendar settings
 * - Table definitions
 * - Shift options
 * - Pay rules
 * - Month colour themes
 * - Summary panel styles
 *
 * Do not place business logic in this file.
 *******************************************************/

const PayTrackerConfig = Object.freeze({
  APP: Object.freeze({
    NAME: 'Pay Tracker',
    VERSION: '3.0.6'
  }),

  SHEET: Object.freeze({
    NAME: 'PaySheet',

    INITIAL_NUMBER_OF_WEEKS: 56,
    BLOCK_HEIGHT: 14,
    TOTAL_COLUMNS: 30,

    WEEK_HEADER_COLUMNS: 24,

    WEEK_DATA_ROW_OFFSET: 3,
    WEEK_DATA_ROW_COUNT: 8,

    WEEK_TOTAL_ROW_OFFSET: 11,
    WEEK_SEPARATOR_ROW_OFFSET: 13,

    WEEKLY_SUMMARY_LABEL_COLUMN: 26,
    WEEKLY_SUMMARY_VALUE_COLUMN: 27,

    RUNNING_TOTAL_LABEL_COLUMN: 29,
    RUNNING_TOTAL_VALUE_COLUMN: 30
  }),

  FIRST_WEEK: Object.freeze({
    YEAR: 2026,

    /*
     * JavaScript months are zero-based:
     * January = 0
     * February = 1
     * March = 2
     * April = 3
     */
    MONTH_INDEX: 3,

    DAY: 20
  }),

  CALENDAR: Object.freeze({
    IDS: Object.freeze([
      'dean99992011@gmail.com',
      'dean99992022@gmail.com'
    ]),

    OVERWRITE_EXISTING_SHIFTS: false,
    SYNC_MONTHS_AHEAD: 12,

    DEBUG_DAYS_BEHIND: 30,
    DEBUG_DAYS_AHEAD: 90
  }),

  FORMATS: Object.freeze({
    CURRENCY: '£#,##0.00',
    HOURS: '0.00',
    DATE: 'dd/MM/yyyy',
    WEEK_START_DATE: 'dd MMM',
    WEEK_END_DATE: 'dd MMM yyyy',
    BACKUP_TIMESTAMP: 'yyyyMMdd_HHmmss'
  }),

  DAYS: Object.freeze([
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
    'Extra'
  ]),

  MONTH_STYLES: Object.freeze({
    0: Object.freeze({
      name: 'January',
      colour: '#2563eb'
    }),

    1: Object.freeze({
      name: 'February',
      colour: '#7c3aed'
    }),

    2: Object.freeze({
      name: 'March',
      colour: '#16a34a'
    }),

    3: Object.freeze({
      name: 'April',
      colour: '#d97706'
    }),

    4: Object.freeze({
      name: 'May',
      colour: '#059669'
    }),

    5: Object.freeze({
      name: 'June',
      colour: '#0891b2'
    }),

    6: Object.freeze({
      name: 'July',
      colour: '#ea580c'
    }),

    7: Object.freeze({
      name: 'August',
      colour: '#dc2626'
    }),

    8: Object.freeze({
      name: 'September',
      colour: '#92400e'
    }),

    9: Object.freeze({
      name: 'October',
      colour: '#9333ea'
    }),

    10: Object.freeze({
      name: 'November',
      colour: '#4b5563'
    }),

    11: Object.freeze({
      name: 'December',
      colour: '#166534'
    })
  }),

  TABLES: Object.freeze({
    NHS: Object.freeze({
      name: 'NHS',
      startColumn: 1,
      taxable: true,

      shifts: Object.freeze([
        'Basic',
        'HSC Unsoc: M-F 8pm-6am & Sat',
        'HSC Unsoc: Sunday & Pub Hol',
        'HSC Overtime: M-F & Sat/Sun',
        'HSC Overtime: Bank/Pub Hol',
        'NHS 6am-2pm Basic',
        'NHS 2pm-10pm Split',
        'NHS Saturday',
        'NHS Sunday'
      ])
    }),

    RELIEF_ASSISTANT_WARDEN: Object.freeze({
      name: 'Relief Assistant Warden',
      startColumn: 7,
      taxable: true,

      shifts: Object.freeze([
        'Basic',
        'Enhanced 1.20',
        'Enhanced 1.33',
        'Enhanced 1.50',
        'Enhanced 2.00',
        'Enhanced 3.00',
        'Overtime 1.20',
        'Overtime 1.33',
        'Overtime 1.50',
        'Overtime 2.00',
        'Overtime 3.00'
      ])
    }),

    NIGHT_SECURITY_WARDEN: Object.freeze({
      name: 'Night Security Warden',
      startColumn: 13,
      taxable: true,

      shifts: Object.freeze([
        'Basic',
        'Enhanced 1.20',
        'Enhanced 1.33',
        'Enhanced 1.50',
        'Enhanced 2.00',
        'Enhanced 3.00',
        'Overtime 1.20',
        'Overtime 1.33',
        'Overtime 1.50',
        'Overtime 2.00',
        'Overtime 3.00'
      ])
    }),

    LOGGING_CASH: Object.freeze({
      name: 'Logging Cash',
      startColumn: 19,
      taxable: false,

      shifts: Object.freeze([
        'Logging Cash £10/hr'
      ])
    })
  }),

  PAY_RULES: Object.freeze({
    NHS: Object.freeze({
      'Basic': Object.freeze({
        fixedAmount: 95.33,
        hourlyRate: 12.71
      }),

      'HSC Unsoc: M-F 8pm-6am & Sat': Object.freeze({
        fixedAmount: 35.84,
        hourlyRate: 17.92
      }),

      'HSC Unsoc: Sunday & Pub Hol': Object.freeze({
        fixedAmount: 174.45,
        hourlyRate: 23.26
      }),

      'HSC Overtime: M-F & Sat/Sun': Object.freeze({
        fixedAmount: 154.95,
        hourlyRate: 20.66
      }),

      'HSC Overtime: Bank/Pub Hol': Object.freeze({
        fixedAmount: 198.45,
        hourlyRate: 26.46
      }),

      'NHS 6am-2pm Basic': Object.freeze({
        fixedAmount: 95.33,
        hourlyRate: 12.71
      }),

      'NHS 2pm-10pm Split': Object.freeze({
        fixedAmount: 105.75,
        hourlyRate: null
      }),

      'NHS Saturday': Object.freeze({
        fixedAmount: 134.40,
        hourlyRate: 17.92
      }),

      'NHS Sunday': Object.freeze({
        fixedAmount: 174.45,
        hourlyRate: 23.26
      })
    }),

    'Relief Assistant Warden': Object.freeze({
      'Basic': Object.freeze({
        fixedAmount: 136.90,
        hourlyRate: 13.69
      }),

      'Enhanced 1.20': Object.freeze({
        fixedAmount: 65.71,
        hourlyRate: 16.43
      }),

      'Enhanced 1.33': Object.freeze({
        fixedAmount: 72.83,
        hourlyRate: 18.21
      }),

      'Enhanced 1.50': Object.freeze({
        fixedAmount: 82.14,
        hourlyRate: 20.54
      }),

      'Enhanced 2.00': Object.freeze({
        fixedAmount: 109.52,
        hourlyRate: 27.38
      }),

      'Enhanced 3.00': Object.freeze({
        fixedAmount: 164.28,
        hourlyRate: 41.07
      }),

      'Overtime 1.20': Object.freeze({
        fixedAmount: 65.71,
        hourlyRate: 16.43
      }),

      'Overtime 1.33': Object.freeze({
        fixedAmount: 72.83,
        hourlyRate: 18.21
      }),

      'Overtime 1.50': Object.freeze({
        fixedAmount: 82.14,
        hourlyRate: 20.54
      }),

      'Overtime 2.00': Object.freeze({
        fixedAmount: 109.52,
        hourlyRate: 27.38
      }),

      'Overtime 3.00': Object.freeze({
        fixedAmount: 164.28,
        hourlyRate: 41.07
      })
    }),

    'Night Security Warden': Object.freeze({
      'Basic': Object.freeze({
        fixedAmount: 53.88,
        hourlyRate: 13.47
      }),

      'Enhanced 1.20': Object.freeze({
        fixedAmount: 64.66,
        hourlyRate: 16.16
      }),

      'Enhanced 1.33': Object.freeze({
        fixedAmount: 71.64,
        hourlyRate: 17.91
      }),

      'Enhanced 1.50': Object.freeze({
        fixedAmount: 80.82,
        hourlyRate: 20.21
      }),

      'Enhanced 2.00': Object.freeze({
        fixedAmount: 107.76,
        hourlyRate: 26.94
      }),

      'Enhanced 3.00': Object.freeze({
        fixedAmount: 161.64,
        hourlyRate: 40.41
      }),

      'Overtime 1.20': Object.freeze({
        fixedAmount: 64.66,
        hourlyRate: 16.16
      }),

      'Overtime 1.33': Object.freeze({
        fixedAmount: 71.64,
        hourlyRate: 17.91
      }),

      'Overtime 1.50': Object.freeze({
        fixedAmount: 80.82,
        hourlyRate: 20.21
      }),

      'Overtime 2.00': Object.freeze({
        fixedAmount: 107.76,
        hourlyRate: 26.94
      }),

      'Overtime 3.00': Object.freeze({
        fixedAmount: 161.64,
        hourlyRate: 40.41
      })
    }),

    'Logging Cash': Object.freeze({
      'Logging Cash £10/hr': Object.freeze({
        fixedAmount: 0,
        hourlyRate: 10.00
      })
    })
  }),

  DEDUCTION_TIERS: Object.freeze([
    Object.freeze({
      maximumGross: 600,
      rate: 0.16
    }),

    Object.freeze({
      maximumGross: 800,
      rate: 0.20
    }),

    Object.freeze({
      maximumGross: 1100,
      rate: 0.27
    }),

    Object.freeze({
      maximumGross: null,
      rate: 0.30
    })
  ]),

  SUMMARY: Object.freeze({
    LABELS: Object.freeze([
      'Taxable Gross',
      'Estimated Deductions',
      'Staffline Take Home',
      'Logging Cash',
      'Total Take Home'
    ]),

    STYLES: Object.freeze({
      CARD: Object.freeze({
        background: '#f8fafc',
        border: '#94a3b8'
      }),

      GROSS: Object.freeze({
        background: '#dbeafe',
        font: '#1e3a8a'
      }),

      DEDUCTIONS: Object.freeze({
        background: '#fee2e2',
        font: '#991b1b'
      }),

      TAKE_HOME: Object.freeze({
        background: '#dcfce7',
        font: '#166534'
      }),

      CASH: Object.freeze({
        background: '#fef3c7',
        font: '#92400e'
      }),

      TOTAL: Object.freeze({
        background: '#0f172a',
        font: '#ffffff'
      })
    })
  }),

  COLUMN_WIDTHS: Object.freeze({
    WEEKLY_SUMMARY_LABEL: 165,
    WEEKLY_SUMMARY_VALUE: 100,
    RUNNING_TOTAL_LABEL: 175,
    RUNNING_TOTAL_VALUE: 110
  }),

  LOCK: Object.freeze({
    WAIT_TIMEOUT_MILLISECONDS: 30000
  })
});


/**
 * Returns all configured pay tables as a standard array.
 *
 * @return {Object[]} Pay table configuration objects.
 */
function getConfiguredPayTables_() {
  return [
    PayTrackerConfig.TABLES.NHS,
    PayTrackerConfig.TABLES.RELIEF_ASSISTANT_WARDEN,
    PayTrackerConfig.TABLES.NIGHT_SECURITY_WARDEN,
    PayTrackerConfig.TABLES.LOGGING_CASH
  ];
}


/**
 * Returns a pay table configuration by its displayed name.
 *
 * @param {string} tableName Displayed table name.
 * @return {Object|null} Matching configuration or null.
 */
function getConfiguredPayTableByName_(tableName) {
  const normalisedName = String(tableName || '').trim();

  const tables = getConfiguredPayTables_();

  for (let index = 0; index < tables.length; index++) {
    if (tables[index].name === normalisedName) {
      return tables[index];
    }
  }

  return null;
}


/**
 * Returns the pay rules for a configured table.
 *
 * @param {string} tableName Displayed table name.
 * @return {Object|null} Pay rules or null.
 */
function getConfiguredPayRules_(tableName) {
  const normalisedName = String(tableName || '').trim();

  return PayTrackerConfig.PAY_RULES[normalisedName] || null;
}
