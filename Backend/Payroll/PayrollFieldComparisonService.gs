/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Payroll/PayrollFieldComparisonService.gs
 *
 * Purpose:
 * - Compare expected and actual payroll values
 * - Apply field-specific tolerances
 * - Return standard comparison results
 * - Produce scores, statuses and explanations
 *
 * This service does not update Sheets.
 *******************************************************/

const PayTrackerPayrollFieldComparisonService =
  Object.freeze({
    VERSION: '2.8.0',

    FIELD_TYPES: Object.freeze({
      MONEY: 'MONEY',
      HOURS: 'HOURS',
      NUMBER: 'NUMBER',
      TEXT: 'TEXT',
      DATE: 'DATE'
    }),

    STATUSES: Object.freeze({
      MATCHED: 'MATCHED',
      ROUNDING: 'ROUNDING',
      WARNING: 'WARNING',
      FAILED: 'FAILED',
      NOT_AVAILABLE: 'NOT_AVAILABLE'
    }),

    SEVERITIES: Object.freeze({
      SUCCESS: 'SUCCESS',
      INFO: 'INFO',
      WARNING: 'WARNING',
      ERROR: 'ERROR',
      NEUTRAL: 'NEUTRAL'
    }),

    /**
     * Default comparison rules.
     */
    DEFAULT_RULES: Object.freeze({
      MONEY: Object.freeze({
        matchedTolerance: 0.02,
        roundingTolerance: 0.10,
        warningTolerance: 10.00,
        warningPercentage: 2.00
      }),

      HOURS: Object.freeze({
        matchedTolerance: 0.01,
        roundingTolerance: 0.10,
        warningTolerance: 1.00,
        warningPercentage: 2.00
      }),

      NUMBER: Object.freeze({
        matchedTolerance: 0,
        roundingTolerance: 0,
        warningTolerance: 1,
        warningPercentage: 2.00
      }),

      TEXT: Object.freeze({
        caseSensitive: false
      }),

      DATE: Object.freeze({
        allowedDifferenceDays: 0
      })
    }),

    /**
     * Compares one payroll field.
     *
     * @param {Object} request Comparison request.
     * @return {Object} Field comparison.
     */
    compare: function(request) {
      const input =
        request || {};

      const fieldKey =
        PayTrackerPayrollFieldComparisonService
          .normalizeRequiredText_(
            input.fieldKey,
            'Field key'
          );

      const label =
        PayTrackerPayrollFieldComparisonService
          .normalizeText_(
            input.label
          ) ||
        PayTrackerPayrollFieldComparisonService
          .formatFieldLabel_(
            fieldKey
          );

      const fieldType =
        PayTrackerPayrollFieldComparisonService
          .normalizeFieldType_(
            input.fieldType
          );

      const rules =
        PayTrackerPayrollFieldComparisonService
          .mergeRules_(
            fieldType,
            input.rules
          );

      let result;

      switch (fieldType) {
        case PayTrackerPayrollFieldComparisonService
          .FIELD_TYPES
          .MONEY:

        case PayTrackerPayrollFieldComparisonService
          .FIELD_TYPES
          .HOURS:

        case PayTrackerPayrollFieldComparisonService
          .FIELD_TYPES
          .NUMBER:

          result =
            PayTrackerPayrollFieldComparisonService
              .compareNumeric_({
                fieldKey:
                  fieldKey,

                label:
                  label,

                fieldType:
                  fieldType,

                expected:
                  input.expected,

                actual:
                  input.actual,

                rules:
                  rules
              });

          break;

        case PayTrackerPayrollFieldComparisonService
          .FIELD_TYPES
          .DATE:

          result =
            PayTrackerPayrollFieldComparisonService
              .compareDate_({
                fieldKey:
                  fieldKey,

                label:
                  label,

                expected:
                  input.expected,

                actual:
                  input.actual,

                rules:
                  rules
              });

          break;

        case PayTrackerPayrollFieldComparisonService
          .FIELD_TYPES
          .TEXT:

        default:

          result =
            PayTrackerPayrollFieldComparisonService
              .compareText_({
                fieldKey:
                  fieldKey,

                label:
                  label,

                expected:
                  input.expected,

                actual:
                  input.actual,

                rules:
                  rules
              });

          break;
      }

      result.weight =
        PayTrackerPayrollFieldComparisonService
          .normalizeWeight_(
            input.weight
          );

      result.required =
        input.required === true;

      result.category =
        PayTrackerPayrollFieldComparisonService
          .normalizeText_(
            input.category
          ) ||
        'GENERAL';

      result.comparedAt =
        new Date().toISOString();

      return result;
    },

    /**
     * Compares multiple fields.
     *
     * @param {Array<Object>} requests Field requests.
     * @return {Object} Batch result.
     */
    compareMany: function(requests) {
      const records =
        Array.isArray(requests)
          ? requests
          : [];

      const comparisons =
        records.map(function(request) {
          return PayTrackerPayrollFieldComparisonService
            .compare(request);
        });

      const availableComparisons =
        comparisons.filter(
          function(comparison) {
            return (
              comparison.status !==
              PayTrackerPayrollFieldComparisonService
                .STATUSES
                .NOT_AVAILABLE
            );
          }
        );

      const totalWeight =
        availableComparisons.reduce(
          function(total, comparison) {
            return (
              total +
              comparison.weight
            );
          },
          0
        );

      const weightedScore =
        availableComparisons.reduce(
          function(total, comparison) {
            return (
              total +
              (
                comparison.score *
                comparison.weight
              )
            );
          },
          0
        );

      const score =
        totalWeight > 0
          ? PayTrackerPayrollFieldComparisonService
              .roundNumber_(
                weightedScore /
                totalWeight,
                2
              )
          : 0;

      const summary = {
        total:
          comparisons.length,

        available:
          availableComparisons.length,

        matched:
          PayTrackerPayrollFieldComparisonService
            .countByStatus_(
              comparisons,
              PayTrackerPayrollFieldComparisonService
                .STATUSES
                .MATCHED
            ),

        rounding:
          PayTrackerPayrollFieldComparisonService
            .countByStatus_(
              comparisons,
              PayTrackerPayrollFieldComparisonService
                .STATUSES
                .ROUNDING
            ),

        warnings:
          PayTrackerPayrollFieldComparisonService
            .countByStatus_(
              comparisons,
              PayTrackerPayrollFieldComparisonService
                .STATUSES
                .WARNING
            ),

        failed:
          PayTrackerPayrollFieldComparisonService
            .countByStatus_(
              comparisons,
              PayTrackerPayrollFieldComparisonService
                .STATUSES
                .FAILED
            ),

        notAvailable:
          PayTrackerPayrollFieldComparisonService
            .countByStatus_(
              comparisons,
              PayTrackerPayrollFieldComparisonService
                .STATUSES
                .NOT_AVAILABLE
            )
      };

      return {
        success: true,

        score:
          score,

        status:
          PayTrackerPayrollFieldComparisonService
            .getOverallStatus_(
              summary
            ),

        summary:
          summary,

        comparisons:
          comparisons
      };
    },

    /**
     * Compares numeric values.
     *
     * @param {Object} input Input.
     * @return {Object} Result.
     * @private
     */
    compareNumeric_: function(input) {
      const expected =
        PayTrackerPayrollFieldComparisonService
          .toNullableNumber_(
            input.expected
          );

      const actual =
        PayTrackerPayrollFieldComparisonService
          .toNullableNumber_(
            input.actual
          );

      if (
        expected === null ||
        actual === null
      ) {
        return PayTrackerPayrollFieldComparisonService
          .createUnavailableResult_(
            input,
            expected,
            actual
          );
      }

      const difference =
        PayTrackerPayrollFieldComparisonService
          .roundNumber_(
            actual -
            expected,
            input.fieldType ===
              PayTrackerPayrollFieldComparisonService
                .FIELD_TYPES
                .MONEY
              ? 2
              : 4
          );

      const absoluteDifference =
        Math.abs(difference);

      const percentageDifference =
        expected === 0
          ? (
              actual === 0
                ? 0
                : 100
            )
          : PayTrackerPayrollFieldComparisonService
              .roundNumber_(
                (
                  absoluteDifference /
                  Math.abs(expected)
                ) *
                100,
                2
              );

      const classification =
        PayTrackerPayrollFieldComparisonService
          .classifyNumericDifference_({
            absoluteDifference:
              absoluteDifference,

            percentageDifference:
              percentageDifference,

            rules:
              input.rules
          });

      return {
        fieldKey:
          input.fieldKey,

        label:
          input.label,

        fieldType:
          input.fieldType,

        expected:
          expected,

        actual:
          actual,

        difference:
          difference,

        absoluteDifference:
          absoluteDifference,

        percentageDifference:
          percentageDifference,

        status:
          classification.status,

        severity:
          classification.severity,

        score:
          classification.score,

        matched:
          classification.status ===
          PayTrackerPayrollFieldComparisonService
            .STATUSES
            .MATCHED,

        explanation:
          PayTrackerPayrollFieldComparisonService
            .buildNumericExplanation_({
              label:
                input.label,

              fieldType:
                input.fieldType,

              expected:
                expected,

              actual:
                actual,

              difference:
                difference,

              status:
                classification.status
            })
      };
    },

    /**
     * Classifies a numeric difference.
     *
     * @param {Object} input Classification input.
     * @return {Object} Classification.
     * @private
     */
    classifyNumericDifference_: function(input) {
      const difference =
        input.absoluteDifference;

      const percentage =
        input.percentageDifference;

      const rules =
        input.rules;

      if (
        difference <=
        rules.matchedTolerance
      ) {
        return {
          status:
            PayTrackerPayrollFieldComparisonService
              .STATUSES
              .MATCHED,

          severity:
            PayTrackerPayrollFieldComparisonService
              .SEVERITIES
              .SUCCESS,

          score: 100
        };
      }

      if (
        difference <=
        rules.roundingTolerance
      ) {
        return {
          status:
            PayTrackerPayrollFieldComparisonService
              .STATUSES
              .ROUNDING,

          severity:
            PayTrackerPayrollFieldComparisonService
              .SEVERITIES
              .INFO,

          score: 95
        };
      }

      if (
        difference <=
          rules.warningTolerance &&
        percentage <=
          rules.warningPercentage
      ) {
        return {
          status:
            PayTrackerPayrollFieldComparisonService
              .STATUSES
              .WARNING,

          severity:
            PayTrackerPayrollFieldComparisonService
              .SEVERITIES
              .WARNING,

          score: 70
        };
      }

      return {
        status:
          PayTrackerPayrollFieldComparisonService
            .STATUSES
            .FAILED,

        severity:
          PayTrackerPayrollFieldComparisonService
            .SEVERITIES
            .ERROR,

        score: 0
      };
    },

    /**
     * Compares text fields.
     *
     * @param {Object} input Input.
     * @return {Object} Result.
     * @private
     */
    compareText_: function(input) {
      const expected =
        PayTrackerPayrollFieldComparisonService
          .normalizeNullableText_(
            input.expected
          );

      const actual =
        PayTrackerPayrollFieldComparisonService
          .normalizeNullableText_(
            input.actual
          );

      if (
        expected === null ||
        actual === null
      ) {
        return PayTrackerPayrollFieldComparisonService
          .createUnavailableResult_(
            input,
            expected,
            actual
          );
      }

      const expectedForComparison =
        input.rules.caseSensitive
          ? expected
          : expected.toLowerCase();

      const actualForComparison =
        input.rules.caseSensitive
          ? actual
          : actual.toLowerCase();

      const matched =
        expectedForComparison ===
        actualForComparison;

      return {
        fieldKey:
          input.fieldKey,

        label:
          input.label,

        fieldType:
          PayTrackerPayrollFieldComparisonService
            .FIELD_TYPES
            .TEXT,

        expected:
          expected,

        actual:
          actual,

        difference:
          matched
            ? ''
            : actual,

        absoluteDifference:
          null,

        percentageDifference:
          null,

        status:
          matched
            ? PayTrackerPayrollFieldComparisonService
                .STATUSES
                .MATCHED
            : PayTrackerPayrollFieldComparisonService
                .STATUSES
                .FAILED,

        severity:
          matched
            ? PayTrackerPayrollFieldComparisonService
                .SEVERITIES
                .SUCCESS
            : PayTrackerPayrollFieldComparisonService
                .SEVERITIES
                .ERROR,

        score:
          matched
            ? 100
            : 0,

        matched:
          matched,

        explanation:
          matched
            ? input.label +
              ' matches.'
            : input.label +
              ' does not match. Expected "' +
              expected +
              '" but found "' +
              actual +
              '".'
      };
    },

    /**
     * Compares dates.
     *
     * @param {Object} input Input.
     * @return {Object} Result.
     * @private
     */
    compareDate_: function(input) {
      const expectedDate =
        PayTrackerPayrollFieldComparisonService
          .toNullableDate_(
            input.expected
          );

      const actualDate =
        PayTrackerPayrollFieldComparisonService
          .toNullableDate_(
            input.actual
          );

      if (
        !expectedDate ||
        !actualDate
      ) {
        return PayTrackerPayrollFieldComparisonService
          .createUnavailableResult_(
            input,
            expectedDate
              ? expectedDate.toISOString()
              : null,
            actualDate
              ? actualDate.toISOString()
              : null
          );
      }

      const differenceMilliseconds =
        actualDate.getTime() -
        expectedDate.getTime();

      const differenceDays =
        Math.round(
          differenceMilliseconds /
          86400000
        );

      const absoluteDifferenceDays =
        Math.abs(
          differenceDays
        );

      const matched =
        absoluteDifferenceDays <=
        input.rules
          .allowedDifferenceDays;

      return {
        fieldKey:
          input.fieldKey,

        label:
          input.label,

        fieldType:
          PayTrackerPayrollFieldComparisonService
            .FIELD_TYPES
            .DATE,

        expected:
          PayTrackerPayrollFieldComparisonService
            .formatIsoDate_(
              expectedDate
            ),

        actual:
          PayTrackerPayrollFieldComparisonService
            .formatIsoDate_(
              actualDate
            ),

        difference:
          differenceDays,

        absoluteDifference:
          absoluteDifferenceDays,

        percentageDifference:
          null,

        status:
          matched
            ? PayTrackerPayrollFieldComparisonService
                .STATUSES
                .MATCHED
            : PayTrackerPayrollFieldComparisonService
                .STATUSES
                .FAILED,

        severity:
          matched
            ? PayTrackerPayrollFieldComparisonService
                .SEVERITIES
                .SUCCESS
            : PayTrackerPayrollFieldComparisonService
                .SEVERITIES
                .ERROR,

        score:
          matched
            ? 100
            : 0,

        matched:
          matched,

        explanation:
          matched
            ? input.label +
              ' matches.'
            : input.label +
              ' differs by ' +
              absoluteDifferenceDays +
              (
                absoluteDifferenceDays === 1
                  ? ' day.'
                  : ' days.'
              )
      };
    },

    /**
     * Creates a result for missing expected or actual data.
     *
     * @param {Object} input Input.
     * @param {*} expected Expected.
     * @param {*} actual Actual.
     * @return {Object} Result.
     * @private
     */
    createUnavailableResult_: function(
      input,
      expected,
      actual
    ) {
      return {
        fieldKey:
          input.fieldKey,

        label:
          input.label,

        fieldType:
          input.fieldType,

        expected:
          expected,

        actual:
          actual,

        difference:
          null,

        absoluteDifference:
          null,

        percentageDifference:
          null,

        status:
          PayTrackerPayrollFieldComparisonService
            .STATUSES
            .NOT_AVAILABLE,

        severity:
          PayTrackerPayrollFieldComparisonService
            .SEVERITIES
            .NEUTRAL,

        score: 0,

        matched: false,

        explanation:
          PayTrackerPayrollFieldComparisonService
            .buildUnavailableExplanation_(
              input.label,
              expected,
              actual
            )
      };
    },

    /**
     * Builds a numeric explanation.
     *
     * @param {Object} input Input.
     * @return {string} Explanation.
     * @private
     */
    buildNumericExplanation_: function(input) {
      const expected =
        PayTrackerPayrollFieldComparisonService
          .formatValue_(
            input.expected,
            input.fieldType
          );

      const actual =
        PayTrackerPayrollFieldComparisonService
          .formatValue_(
            input.actual,
            input.fieldType
          );

      const difference =
        PayTrackerPayrollFieldComparisonService
          .formatSignedValue_(
            input.difference,
            input.fieldType
          );

      switch (input.status) {
        case PayTrackerPayrollFieldComparisonService
          .STATUSES
          .MATCHED:

          return (
            input.label +
            ' matches exactly.'
          );

        case PayTrackerPayrollFieldComparisonService
          .STATUSES
          .ROUNDING:

          return (
            input.label +
            ' has a small rounding difference of ' +
            difference +
            '.'
          );

        case PayTrackerPayrollFieldComparisonService
          .STATUSES
          .WARNING:

          return (
            input.label +
            ' differs slightly. Expected ' +
            expected +
            ', actual ' +
            actual +
            ', difference ' +
            difference +
            '.'
          );

        case PayTrackerPayrollFieldComparisonService
          .STATUSES
          .FAILED:

        default:

          return (
            input.label +
            ' does not match. Expected ' +
            expected +
            ', actual ' +
            actual +
            ', difference ' +
            difference +
            '.'
          );
      }
    },

    /**
     * Builds missing-data explanation.
     *
     * @param {string} label Label.
     * @param {*} expected Expected.
     * @param {*} actual Actual.
     * @return {string} Explanation.
     * @private
     */
    buildUnavailableExplanation_: function(
      label,
      expected,
      actual
    ) {
      if (
        expected === null &&
        actual === null
      ) {
        return (
          label +
          ' could not be compared because both values are unavailable.'
        );
      }

      if (expected === null) {
        return (
          label +
          ' could not be compared because the predicted value is unavailable.'
        );
      }

      return (
        label +
        ' could not be compared because the payslip value is unavailable.'
      );
    },

    /**
     * Returns the batch overall status.
     *
     * @param {Object} summary Summary.
     * @return {string} Status.
     * @private
     */
    getOverallStatus_: function(summary) {
      if (summary.failed > 0) {
        return 'FAILED';
      }

      if (summary.warnings > 0) {
        return 'WARNING';
      }

      if (summary.rounding > 0) {
        return 'ROUNDING';
      }

      if (
        summary.matched > 0
      ) {
        return 'MATCHED';
      }

      return 'INCOMPLETE';
    },

    /**
     * Merges default and custom rules.
     *
     * @param {string} fieldType Field type.
     * @param {Object=} customRules Rules.
     * @return {Object} Rules.
     * @private
     */
    mergeRules_: function(
      fieldType,
      customRules
    ) {
      const defaults =
        PayTrackerPayrollFieldComparisonService
          .DEFAULT_RULES[
            fieldType
          ] ||
        PayTrackerPayrollFieldComparisonService
          .DEFAULT_RULES
          .TEXT;

      return Object.assign(
        {},
        defaults,
        customRules || {}
      );
    },

    /**
     * Formats one value.
     *
     * @param {*} value Value.
     * @param {string} fieldType Type.
     * @return {string} Formatted.
     * @private
     */
    formatValue_: function(
      value,
      fieldType
    ) {
      if (
        fieldType ===
        PayTrackerPayrollFieldComparisonService
          .FIELD_TYPES
          .MONEY
      ) {
        return '£' +
          Number(value || 0)
            .toFixed(2);
      }

      if (
        fieldType ===
        PayTrackerPayrollFieldComparisonService
          .FIELD_TYPES
          .HOURS
      ) {
        return (
          Number(value || 0)
            .toFixed(2) +
          ' hours'
        );
      }

      return String(value);
    },

    /**
     * Formats signed value.
     *
     * @param {*} value Value.
     * @param {string} fieldType Type.
     * @return {string} Signed value.
     * @private
     */
    formatSignedValue_: function(
      value,
      fieldType
    ) {
      const number =
        Number(value || 0);

      const prefix =
        number > 0
          ? '+'
          : '';

      if (
        fieldType ===
        PayTrackerPayrollFieldComparisonService
          .FIELD_TYPES
          .MONEY
      ) {
        return (
          prefix +
          '£' +
          number.toFixed(2)
        );
      }

      if (
        fieldType ===
        PayTrackerPayrollFieldComparisonService
          .FIELD_TYPES
          .HOURS
      ) {
        return (
          prefix +
          number.toFixed(2) +
          ' hours'
        );
      }

      return (
        prefix +
        String(number)
      );
    },

    /**
     * Normalizes field type.
     *
     * @param {*} value Value.
     * @return {string} Field type.
     * @private
     */
    normalizeFieldType_: function(value) {
      const normalized =
        String(
          value ||
          PayTrackerPayrollFieldComparisonService
            .FIELD_TYPES
            .TEXT
        )
          .trim()
          .toUpperCase();

      return Object.prototype
        .hasOwnProperty.call(
          PayTrackerPayrollFieldComparisonService
            .FIELD_TYPES,
          normalized
        )
        ? normalized
        : PayTrackerPayrollFieldComparisonService
            .FIELD_TYPES
            .TEXT;
    },

    /**
     * Normalizes comparison weight.
     *
     * @param {*} value Weight.
     * @return {number} Weight.
     * @private
     */
    normalizeWeight_: function(value) {
      const weight =
        Number(value);

      return (
        Number.isFinite(weight) &&
        weight > 0
      )
        ? weight
        : 1;
    },

    /**
     * Counts comparisons by status.
     *
     * @param {Array<Object>} comparisons Comparisons.
     * @param {string} status Status.
     * @return {number} Count.
     * @private
     */
    countByStatus_: function(
      comparisons,
      status
    ) {
      return comparisons.filter(
        function(comparison) {
          return (
            comparison.status ===
            status
          );
        }
      ).length;
    },

    /**
     * Converts to nullable number.
     *
     * @param {*} value Value.
     * @return {number|null} Number.
     * @private
     */
    toNullableNumber_: function(value) {
      if (
        value === '' ||
        value === null ||
        value === undefined
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
     * Converts to nullable date.
     *
     * @param {*} value Value.
     * @return {Date|null} Date.
     * @private
     */
    toNullableDate_: function(value) {
      if (!value) {
        return null;
      }

      const date =
        value instanceof Date
          ? new Date(
              value.getTime()
            )
          : new Date(value);

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return null;
      }

      date.setHours(
        0,
        0,
        0,
        0
      );

      return date;
    },

    /**
     * Formats ISO date.
     *
     * @param {Date} date Date.
     * @return {string} ISO date.
     * @private
     */
    formatIsoDate_: function(date) {
      return [
        date.getFullYear(),
        String(
          date.getMonth() + 1
        ).padStart(2, '0'),
        String(
          date.getDate()
        ).padStart(2, '0')
      ].join('-');
    },

    /**
     * Normalizes nullable text.
     *
     * @param {*} value Value.
     * @return {string|null} Text.
     * @private
     */
    normalizeNullableText_: function(value) {
      if (
        value === null ||
        value === undefined
      ) {
        return null;
      }

      const text =
        String(value)
          .replace(/\s+/g, ' ')
          .trim();

      return text
        ? text
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
      )
        .replace(/\s+/g, ' ')
        .trim();
    },

    /**
     * Normalizes required text.
     *
     * @param {*} value Value.
     * @param {string} label Label.
     * @return {string} Text.
     * @private
     */
    normalizeRequiredText_: function(
      value,
      label
    ) {
      const text =
        PayTrackerPayrollFieldComparisonService
          .normalizeText_(
            value
          );

      if (!text) {
        throw new Error(
          label +
          ' is required.'
        );
      }

      return text;
    },

    /**
     * Formats a field-key label.
     *
     * @param {string} value Field key.
     * @return {string} Label.
     * @private
     */
    formatFieldLabel_: function(value) {
      return String(value)
        .replace(
          /([a-z])([A-Z])/g,
          '$1 $2'
        )
        .replace(
          /[_-]+/g,
          ' '
        )
        .replace(
          /\b\w/g,
          function(character) {
            return character.toUpperCase();
          }
        );
    },

    /**
     * Rounds numeric values.
     *
     * @param {*} value Value.
     * @param {number} places Decimal places.
     * @return {number} Rounded.
     * @private
     */
    roundNumber_: function(
      value,
      places
    ) {
      const multiplier =
        Math.pow(
          10,
          Number(places || 0)
        );

      return Math.round(
        Number(value || 0) *
        multiplier
      ) / multiplier;
    }
  });


/**
 * Manual field-comparison test.
 */
function testPayTrackerPayrollFieldComparisonService() {
  const result =
    PayTrackerPayrollFieldComparisonService
      .compareMany([
        {
          fieldKey: 'grossPay',
          label: 'Gross Pay',
          fieldType: 'MONEY',
          expected: 1053.65,
          actual: 1053.65,
          weight: 5
        },

        {
          fieldKey: 'netPay',
          label: 'Net Pay',
          fieldType: 'MONEY',
          expected: 749.70,
          actual: 749.64,
          weight: 5
        },

        {
          fieldKey: 'incomeTax',
          label: 'Income Tax',
          fieldType: 'MONEY',
          expected: 162.40,
          actual: 162.40,
          weight: 3
        },

        {
          fieldKey: 'basicHours',
          label: 'Basic Hours',
          fieldType: 'HOURS',
          expected: 20.5,
          actual: 20.5,
          weight: 4
        },

        {
          fieldKey: 'taxCode',
          label: 'Tax Code',
          fieldType: 'TEXT',
          expected: '1257L',
          actual: '1257L',
          weight: 2
        },

        {
          fieldKey: 'payDate',
          label: 'Pay Date',
          fieldType: 'DATE',
          expected: '2026-07-24',
          actual: '2026-07-24',
          weight: 2
        }
      ]);

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
