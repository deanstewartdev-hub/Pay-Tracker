/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Payroll/PayrollComparisonEngine.gs
 *
 * Purpose:
 * - Compare Pay Tracker predictions against parsed payslips
 * - Compare financial totals and timesheet hours
 * - Produce a weighted payroll accuracy score
 * - Generate warnings and discrepancy explanations
 *
 * Dependencies:
 * - PayrollFieldComparisonService.gs
 *******************************************************/

const PayTrackerPayrollComparisonEngine =
  Object.freeze({
    VERSION: '2.8.0',

    /**
     * Comparison statuses.
     */
    STATUSES: Object.freeze({
      MATCHED: 'MATCHED',
      ROUNDING: 'ROUNDING',
      WARNING: 'WARNING',
      FAILED: 'FAILED',
      INCOMPLETE: 'INCOMPLETE'
    }),

    /**
     * Compares one Pay Tracker prediction against one
     * parsed payslip.
     *
     * Expected prediction structure:
     *
     * {
     *   payslipId: '',
     *   weekStart: '',
     *   weekEnd: '',
     *   payDate: '',
     *   grossPay: 0,
     *   netPay: 0,
     *   incomeTax: 0,
     *   nationalInsurance: 0,
     *   pension: 0,
     *   studentLoan: 0,
     *   totalDeductions: 0,
     *   taxCode: '',
     *   payPeriod: '',
     *   hours: {
     *     basic: 0,
     *     enhanced: 0,
     *     unsocial: 0,
     *     overtime: 0,
     *     holiday: 0,
     *     total: 0
     *   }
     * }
     *
     * Expected payslip structure:
     *
     * {
     *   payslipId: '',
     *   fields: {
     *     payDate: '',
     *     grossPay: 0,
     *     netPay: 0,
     *     incomeTax: 0,
     *     nationalInsurance: 0,
     *     pension: 0,
     *     studentLoan: 0,
     *     totalDeductions: 0,
     *     taxCode: '',
     *     payPeriod: ''
     *   },
     *   timesheet: {
     *     totals: {
     *       hours: 0,
     *       basicHours: 0,
     *       enhancedHours: 0,
     *       unsocialHours: 0,
     *       overtimeHours: 0,
     *       holidayHours: 0
     *     }
     *   }
     * }
     *
     * @param {Object} prediction Pay Tracker prediction.
     * @param {Object} payslip Parsed payslip package.
     * @return {Object} Payroll comparison result.
     */
    compare: function(
      prediction,
      payslip
    ) {
      const expected =
        prediction || {};

      const actualPackage =
        payslip || {};

      const actualFields =
        actualPackage.fields ||
        actualPackage.parser &&
        actualPackage.parser.fields ||
        actualPackage.payslipFields ||
        {};

      const actualTimesheet =
        actualPackage.timesheet ||
        actualPackage.timesheetResult ||
        {};

      const actualTimesheetTotals =
        actualTimesheet.totals ||
        actualPackage.timesheetTotals ||
        {};

      const expectedHours =
        expected.hours || {};

      const comparisonId =
        Utilities.getUuid();

      const fieldRequests =
        PayTrackerPayrollComparisonEngine
          .buildFieldRequests_({
            expected:
              expected,

            actualFields:
              actualFields,

            expectedHours:
              expectedHours,

            actualTimesheetTotals:
              actualTimesheetTotals
          });

      const fieldComparison =
        PayTrackerPayrollFieldComparisonService
          .compareMany(
            fieldRequests
          );

      const comparisons =
        fieldComparison.comparisons || [];

      const summary =
        PayTrackerPayrollComparisonEngine
          .buildSummary_(
            fieldComparison.summary || {}
          );

      const totals =
        PayTrackerPayrollComparisonEngine
          .buildTotals_(
            expected,
            actualFields
          );

      const warnings =
        PayTrackerPayrollComparisonEngine
          .buildWarnings_(
            comparisons
          );

      const errors =
        PayTrackerPayrollComparisonEngine
          .buildErrors_(
            comparisons
          );

      const status =
        PayTrackerPayrollComparisonEngine
          .normalizeOverallStatus_(
            fieldComparison.status
          );

      return {
        success: true,

        comparisonId:
          comparisonId,

        payslipId:
          PayTrackerPayrollComparisonEngine
            .normalizeText_(
              expected.payslipId ||
              actualPackage.payslipId ||
              actualFields.payslipId
            ),

        predictionId:
          PayTrackerPayrollComparisonEngine
            .normalizeText_(
              expected.predictionId
            ),

        payrollGroupId:
          PayTrackerPayrollComparisonEngine
            .normalizeText_(
              expected.payrollGroupId ||
              actualPackage.payrollGroupId
            ),

        weekStart:
          PayTrackerPayrollComparisonEngine
            .normalizeDateValue_(
              expected.weekStart
            ),

        weekEnd:
          PayTrackerPayrollComparisonEngine
            .normalizeDateValue_(
              expected.weekEnd
            ),

        createdAt:
          new Date().toISOString(),

        status:
          status,

        score:
          fieldComparison.score || 0,

        summary:
          summary,

        totals:
          totals,

        comparisons:
          comparisons,

        warnings:
          warnings,

        errors:
          errors,

        reviewRequired:
          status ===
            PayTrackerPayrollComparisonEngine
              .STATUSES
              .WARNING ||
          status ===
            PayTrackerPayrollComparisonEngine
              .STATUSES
              .FAILED,

        comparisonMessage:
          PayTrackerPayrollComparisonEngine
            .buildOverallMessage_({
              status:
                status,

              score:
                fieldComparison.score || 0,

              summary:
                summary,

              totals:
                totals
            }),

        engineVersion:
          PayTrackerPayrollComparisonEngine
            .VERSION
      };
    },

    /**
     * Builds all field-comparison requests.
     *
     * @param {Object} input Comparison input.
     * @return {Array<Object>} Requests.
     * @private
     */
    buildFieldRequests_: function(input) {
      const expected =
        input.expected || {};

      const actual =
        input.actualFields || {};

      const expectedHours =
        input.expectedHours || {};

      const actualHours =
        input.actualTimesheetTotals || {};

      return [
        {
          fieldKey: 'grossPay',
          label: 'Gross Pay',
          category: 'PAY',
          fieldType: 'MONEY',
          expected:
            PayTrackerPayrollComparisonEngine
              .firstAvailable_(
                expected.grossPay,
                expected.expectedGross,
                expected.weeklyGross
              ),
          actual:
            actual.grossPay,
          weight: 10,
          required: true
        },

        {
          fieldKey: 'netPay',
          label: 'Net Pay',
          category: 'PAY',
          fieldType: 'MONEY',
          expected:
            PayTrackerPayrollComparisonEngine
              .firstAvailable_(
                expected.netPay,
                expected.expectedNet,
                expected.estimatedTakeHome
              ),
          actual:
            actual.netPay,
          weight: 10,
          required: true
        },

        {
          fieldKey: 'totalDeductions',
          label: 'Total Deductions',
          category: 'DEDUCTIONS',
          fieldType: 'MONEY',
          expected:
            PayTrackerPayrollComparisonEngine
              .firstAvailable_(
                expected.totalDeductions,
                expected.expectedDeductions
              ),
          actual:
            actual.totalDeductions,
          weight: 7
        },

        {
          fieldKey: 'incomeTax',
          label: 'Income Tax',
          category: 'DEDUCTIONS',
          fieldType: 'MONEY',
          expected:
            expected.incomeTax,
          actual:
            actual.incomeTax,
          weight: 5
        },

        {
          fieldKey: 'nationalInsurance',
          label: 'National Insurance',
          category: 'DEDUCTIONS',
          fieldType: 'MONEY',
          expected:
            PayTrackerPayrollComparisonEngine
              .firstAvailable_(
                expected.nationalInsurance,
                expected.ni
              ),
          actual:
            actual.nationalInsurance,
          weight: 5
        },

        {
          fieldKey: 'pension',
          label: 'Pension',
          category: 'DEDUCTIONS',
          fieldType: 'MONEY',
          expected:
            expected.pension,
          actual:
            PayTrackerPayrollComparisonEngine
              .firstAvailable_(
                actual.employeePension,
                actual.pension
              ),
          weight: 4
        },

        {
          fieldKey: 'studentLoan',
          label: 'Student Loan',
          category: 'DEDUCTIONS',
          fieldType: 'MONEY',
          expected:
            expected.studentLoan,
          actual:
            actual.studentLoan,
          weight: 4
        },

        {
          fieldKey: 'payDate',
          label: 'Pay Date',
          category: 'PAYSLIP',
          fieldType: 'DATE',
          expected:
            expected.payDate,
          actual:
            actual.payDate,
          weight: 3
        },

        {
          fieldKey: 'taxCode',
          label: 'Tax Code',
          category: 'PAYSLIP',
          fieldType: 'TEXT',
          expected:
            expected.taxCode,
          actual:
            actual.taxCode,
          weight: 2
        },

        {
          fieldKey: 'payPeriod',
          label: 'Pay Period',
          category: 'PAYSLIP',
          fieldType: 'TEXT',
          expected:
            expected.payPeriod,
          actual:
            actual.payPeriod,
          weight: 2
        },

        {
          fieldKey: 'totalHours',
          label: 'Total Hours',
          category: 'HOURS',
          fieldType: 'HOURS',
          expected:
            PayTrackerPayrollComparisonEngine
              .firstAvailable_(
                expectedHours.total,
                expectedHours.hours,
                expected.totalHours
              ),
          actual:
            actualHours.hours,
          weight: 8
        },

        {
          fieldKey: 'basicHours',
          label: 'Basic Hours',
          category: 'HOURS',
          fieldType: 'HOURS',
          expected:
            expectedHours.basic,
          actual:
            actualHours.basicHours,
          weight: 6
        },

        {
          fieldKey: 'enhancedHours',
          label: 'Enhanced Hours',
          category: 'HOURS',
          fieldType: 'HOURS',
          expected:
            expectedHours.enhanced,
          actual:
            actualHours.enhancedHours,
          weight: 6
        },

        {
          fieldKey: 'unsocialHours',
          label: 'Unsocial Hours',
          category: 'HOURS',
          fieldType: 'HOURS',
          expected:
            expectedHours.unsocial,
          actual:
            actualHours.unsocialHours,
          weight: 6
        },

        {
          fieldKey: 'overtimeHours',
          label: 'Overtime Hours',
          category: 'HOURS',
          fieldType: 'HOURS',
          expected:
            expectedHours.overtime,
          actual:
            actualHours.overtimeHours,
          weight: 5
        },

        {
          fieldKey: 'holidayHours',
          label: 'Holiday Hours',
          category: 'HOURS',
          fieldType: 'HOURS',
          expected:
            expectedHours.holiday,
          actual:
            actualHours.holidayHours,
          weight: 4
        }
      ];
    },

    /**
     * Builds the comparison summary.
     *
     * @param {Object} source Field-service summary.
     * @return {Object} Summary.
     * @private
     */
    buildSummary_: function(source) {
      const value =
        source || {};

      return {
        totalChecks:
          Number(
            value.total || 0
          ),

        availableChecks:
          Number(
            value.available || 0
          ),

        matched:
          Number(
            value.matched || 0
          ),

        rounding:
          Number(
            value.rounding || 0
          ),

        warnings:
          Number(
            value.warnings || 0
          ),

        failed:
          Number(
            value.failed || 0
          ),

        notAvailable:
          Number(
            value.notAvailable || 0
          )
      };
    },

    /**
     * Builds high-level financial totals.
     *
     * @param {Object} expected Prediction.
     * @param {Object} actual Parsed fields.
     * @return {Object} Totals.
     * @private
     */
    buildTotals_: function(
      expected,
      actual
    ) {
      const expectedGross =
        PayTrackerPayrollComparisonEngine
          .toNullableNumber_(
            PayTrackerPayrollComparisonEngine
              .firstAvailable_(
                expected.grossPay,
                expected.expectedGross,
                expected.weeklyGross
              )
          );

      const actualGross =
        PayTrackerPayrollComparisonEngine
          .toNullableNumber_(
            actual.grossPay
          );

      const expectedNet =
        PayTrackerPayrollComparisonEngine
          .toNullableNumber_(
            PayTrackerPayrollComparisonEngine
              .firstAvailable_(
                expected.netPay,
                expected.expectedNet,
                expected.estimatedTakeHome
              )
          );

      const actualNet =
        PayTrackerPayrollComparisonEngine
          .toNullableNumber_(
            actual.netPay
          );

      return {
        expectedGross:
          expectedGross,

        actualGross:
          actualGross,

        grossDifference:
          PayTrackerPayrollComparisonEngine
            .calculateDifference_(
              expectedGross,
              actualGross
            ),

        expectedNet:
          expectedNet,

        actualNet:
          actualNet,

        netDifference:
          PayTrackerPayrollComparisonEngine
            .calculateDifference_(
              expectedNet,
              actualNet
            ),

        expectedDeductions:
          PayTrackerPayrollComparisonEngine
            .toNullableNumber_(
              PayTrackerPayrollComparisonEngine
                .firstAvailable_(
                  expected.totalDeductions,
                  expected.expectedDeductions
                )
            ),

        actualDeductions:
          PayTrackerPayrollComparisonEngine
            .toNullableNumber_(
              actual.totalDeductions
            )
      };
    },

    /**
     * Creates warning messages.
     *
     * @param {Array<Object>} comparisons Comparisons.
     * @return {Array<Object>} Warnings.
     * @private
     */
    buildWarnings_: function(comparisons) {
      return comparisons
        .filter(function(comparison) {
          return (
            comparison.status ===
              'WARNING' ||
            comparison.status ===
              'ROUNDING'
          );
        })
        .map(function(comparison) {
          return {
            fieldKey:
              comparison.fieldKey,

            label:
              comparison.label,

            status:
              comparison.status,

            explanation:
              comparison.explanation
          };
        });
    },

    /**
     * Creates error messages.
     *
     * @param {Array<Object>} comparisons Comparisons.
     * @return {Array<Object>} Errors.
     * @private
     */
    buildErrors_: function(comparisons) {
      return comparisons
        .filter(function(comparison) {
          return (
            comparison.status ===
            'FAILED'
          );
        })
        .map(function(comparison) {
          return {
            fieldKey:
              comparison.fieldKey,

            label:
              comparison.label,

            status:
              comparison.status,

            explanation:
              comparison.explanation
          };
        });
    },

    /**
     * Normalizes overall status.
     *
     * @param {string} status Field-service status.
     * @return {string} Status.
     * @private
     */
    normalizeOverallStatus_: function(status) {
      const normalized =
        PayTrackerPayrollComparisonEngine
          .normalizeText_(
            status
          )
          .toUpperCase();

      switch (normalized) {
        case 'MATCHED':
          return PayTrackerPayrollComparisonEngine
            .STATUSES
            .MATCHED;

        case 'ROUNDING':
          return PayTrackerPayrollComparisonEngine
            .STATUSES
            .ROUNDING;

        case 'WARNING':
          return PayTrackerPayrollComparisonEngine
            .STATUSES
            .WARNING;

        case 'FAILED':
          return PayTrackerPayrollComparisonEngine
            .STATUSES
            .FAILED;

        default:
          return PayTrackerPayrollComparisonEngine
            .STATUSES
            .INCOMPLETE;
      }
    },

    /**
     * Builds overall human-readable message.
     *
     * @param {Object} input Comparison data.
     * @return {string} Message.
     * @private
     */
    buildOverallMessage_: function(input) {
      const score =
        Number(
          input.score || 0
        ).toFixed(2);

      switch (input.status) {
        case PayTrackerPayrollComparisonEngine
          .STATUSES
          .MATCHED:

          return (
            'Payroll matched with an accuracy score of ' +
            score +
            '%.'
          );

        case PayTrackerPayrollComparisonEngine
          .STATUSES
          .ROUNDING:

          return (
            'Payroll is substantially matched, with only small rounding differences. Accuracy score: ' +
            score +
            '%.'
          );

        case PayTrackerPayrollComparisonEngine
          .STATUSES
          .WARNING:

          return (
            'Payroll contains differences that should be reviewed. Accuracy score: ' +
            score +
            '%.'
          );

        case PayTrackerPayrollComparisonEngine
          .STATUSES
          .FAILED:

          return (
            'Payroll contains one or more significant discrepancies. Accuracy score: ' +
            score +
            '%.'
          );

        default:

          return (
            'Payroll comparison is incomplete because some expected or actual values are unavailable.'
          );
      }
    },

    /**
     * Returns the first supplied non-empty value.
     *
     * Zero and false remain valid values.
     *
     * @param {...*} values Values.
     * @return {*} First available value.
     * @private
     */
    firstAvailable_: function() {
      const values =
        Array.prototype.slice.call(
          arguments
        );

      for (
        let index = 0;
        index < values.length;
        index += 1
      ) {
        const value =
          values[index];

        if (
          value !== undefined &&
          value !== null &&
          value !== ''
        ) {
          return value;
        }
      }

      return null;
    },

    /**
     * Calculates actual minus expected.
     *
     * @param {number|null} expected Expected.
     * @param {number|null} actual Actual.
     * @return {number|null} Difference.
     * @private
     */
    calculateDifference_: function(
      expected,
      actual
    ) {
      if (
        expected === null ||
        actual === null
      ) {
        return null;
      }

      return Math.round(
        (
          actual -
          expected
        ) *
        100
      ) / 100;
    },

    /**
     * Converts a value to a nullable number.
     *
     * @param {*} value Value.
     * @return {number|null} Number.
     * @private
     */
    toNullableNumber_: function(value) {
      if (
        value === undefined ||
        value === null ||
        value === ''
      ) {
        return null;
      }

      const number =
        Number(
          String(value)
            .replace(/[£,\s]/g, '')
        );

      return Number.isFinite(number)
        ? number
        : null;
    },

    /**
     * Normalizes text.
     *
     * @param {*} value Value.
     * @return {string} Text.
     * @private
     */
    normalizeText_: function(value) {
      return String(
        value === undefined ||
        value === null
          ? ''
          : value
      ).trim();
    },

    /**
     * Normalizes a date value without throwing.
     *
     * @param {*} value Value.
     * @return {string} ISO date or blank.
     * @private
     */
    normalizeDateValue_: function(value) {
      if (!value) {
        return '';
      }

      const date =
        value instanceof Date
          ? value
          : new Date(value);

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return '';
      }

      return [
        date.getFullYear(),
        String(
          date.getMonth() + 1
        ).padStart(2, '0'),
        String(
          date.getDate()
        ).padStart(2, '0')
      ].join('-');
    }
  });


/**
 * Tests a complete payroll comparison using the same
 * Staffline payslip values already confirmed.
 */
function testPayTrackerPayrollComparisonEngine() {
  const prediction = {
    predictionId:
      'PREDICTION-TEST-001',

    payslipId:
      'PAYSLIP-TEST-001',

    payrollGroupId:
      'COMBINED_PAYROLL',

    weekStart:
      '2026-07-13',

    weekEnd:
      '2026-07-19',

    payDate:
      '2026-07-24',

    payPeriod:
      '16/2026',

    taxCode:
      '1257L',

    grossPay:
      1053.65,

    netPay:
      749.70,

    incomeTax:
      162.40,

    nationalInsurance:
      59.73,

    pension:
      33.88,

    studentLoan:
      48.00,

    totalDeductions:
      303.95,

    hours: {
      total: 54,
      basic: 20.5,
      enhanced: 24,
      unsocial: 9.5,
      overtime: 0,
      holiday: 0
    }
  };

  const payslip = {
    payslipId:
      'PAYSLIP-TEST-001',

    payrollGroupId:
      'COMBINED_PAYROLL',

    fields: {
      payDate:
        '2026-07-24',

      payPeriod:
        '16/2026',

      taxCode:
        '1257L',

      grossPay:
        1053.65,

      netPay:
        749.64,

      incomeTax:
        162.40,

      nationalInsurance:
        59.73,

      pension:
        33.88,

      studentLoan:
        48.00,

      totalDeductions:
        304.01
    },

    timesheet: {
      totals: {
        hours: 54,
        basicHours: 20.5,
        enhancedHours: 24,
        unsocialHours: 9.5,
        overtimeHours: 0,
        holidayHours: 0
      }
    }
  };

  const result =
    PayTrackerPayrollComparisonEngine
      .compare(
        prediction,
        payslip
      );

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}