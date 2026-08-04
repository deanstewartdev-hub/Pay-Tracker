/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Payroll/PayrollComparisonService.gs
 *
 * Purpose:
 * - Match a registered payslip to its PaySheet week
 * - Filter predictions through the assigned Payroll Group
 * - Compare predicted pay with extracted actual pay
 * - Persist summary status and discrepancy values
 * - Return detailed comparisons for the Payroll Centre UI
 *******************************************************/

const PayTrackerPayrollComparisonService =
  Object.freeze({
    VERSION: '2.8.0',

    /**
     * Compares and stores one registered payslip.
     *
     * @param {string} payslipId Payslip ID.
     * @return {Object} Comparison response.
     */
    comparePayslip: function(payslipId) {
      const workspace =
        PayTrackerWebPayWorkspaceService
          .getPayWorkspaceData();

      return PayTrackerPayrollComparisonService
        .comparePayslipWithWorkspace_(
          payslipId,
          workspace,
          true
        );
    },

    /**
     * Builds a current comparison without changing Sheets.
     *
     * @param {string} payslipId Payslip ID.
     * @return {Object} Comparison response.
     */
    previewPayslip: function(payslipId) {
      const workspace =
        PayTrackerWebPayWorkspaceService
          .getPayWorkspaceData();

      return PayTrackerPayrollComparisonService
        .comparePayslipWithWorkspace_(
          payslipId,
          workspace,
          false
        );
    },

    /**
     * Compares a controlled batch of payslips.
     *
     * @param {Object=} options Batch options.
     * @return {Object} Batch result.
     */
    compareBatch: function(options) {
      const config =
        Object.assign(
          {
            limit: 50,
            onlyNotCompared: false
          },
          options || {}
        );

      const limit =
        Math.max(
          1,
          Math.min(
            Number(config.limit) || 50,
            100
          )
        );

      const workspace =
        PayTrackerWebPayWorkspaceService
          .getPayWorkspaceData();

      if (
        !workspace ||
        workspace.success !== true
      ) {
        throw new Error(
          workspace &&
          workspace.message
            ? workspace.message
            : 'PaySheet weeks could not be loaded.'
        );
      }

      const payslips =
        PayTrackerPayslipRepository
          .getAll()
          .filter(function(payslip) {
            if (
              config.onlyNotCompared !==
              true
            ) {
              return true;
            }

            return (
              !payslip.comparisonStatus ||
              payslip.comparisonStatus ===
                PayTrackerPayrollConfig
                  .COMPARISON_STATUSES
                  .NOT_READY ||
              payslip.comparisonStatus ===
                PayTrackerPayrollConfig
                  .COMPARISON_STATUSES
                  .INCOMPLETE
            );
          })
          .slice(
            0,
            limit
          );

      const results =
        payslips.map(function(payslip) {
          try {
            return PayTrackerPayrollComparisonService
              .comparePayslipWithWorkspace_(
                payslip.payslipId,
                workspace,
                true
              );
          } catch (error) {
            return {
              success:
                false,

              payslipId:
                payslip.payslipId,

              error:
                PayTrackerPayrollComparisonService
                  .getErrorMessage_(
                    error
                  )
            };
          }
        });

      return {
        success:
          true,

        processed:
          results.length,

        completed:
          results.filter(function(result) {
            return result.success === true;
          }).length,

        failed:
          results.filter(function(result) {
            return result.success !== true;
          }).length,

        results:
          results
      };
    },

    /**
     * Compares one payslip using an already loaded workspace.
     *
     * @param {string} payslipId Payslip ID.
     * @param {Object} workspace Pay workspace data.
     * @param {boolean} persist Store summary.
     * @return {Object} Comparison response.
     * @private
     */
    comparePayslipWithWorkspace_: function(
      payslipId,
      workspace,
      persist
    ) {
      const normalizedId =
        PayTrackerPayrollComparisonService
          .requiredText_(
            payslipId,
            'Payslip ID'
          );

      const payslip =
        PayTrackerPayslipRepository
          .getById(
            normalizedId
          );

      if (!payslip) {
        throw new Error(
          'Payslip "' +
          normalizedId +
          '" was not found.'
        );
      }

      const extraction =
        PayTrackerPayrollCentreController
          .getPayslipExtraction(
            payslip
          );

      if (
        !extraction ||
        extraction.status.toUpperCase() !==
          'COMPLETED'
      ) {
        throw new Error(
          'The payslip PDF must be processed before comparison.'
        );
      }

      if (
        !workspace ||
        workspace.success !== true
      ) {
        throw new Error(
          'PaySheet weeks are unavailable.'
        );
      }

      const week =
        PayTrackerPayrollComparisonService
          .findMatchingWeek_(
            payslip,
            extraction,
            workspace.weeks || []
          );

      if (!week) {
        const incomplete =
          {
            success:
              true,

            payslipId:
              normalizedId,

            matchedWeek:
              null,

            status:
              PayTrackerPayrollConfig
                .COMPARISON_STATUSES
                .INCOMPLETE,

            score:
              0,

            message:
              'No matching PaySheet week was found for this payslip.',

            comparisons:
              [],

            persisted:
              persist === true
          };

        if (persist === true) {
          PayTrackerPayslipRepository
            .setComparisonResult(
              normalizedId,
              {
                comparisonStatus:
                  incomplete.status,

                matchConfidence:
                  0,

                matchReason:
                  incomplete.message
              }
            );
        }

        return incomplete;
      }

      const prediction =
        PayTrackerPayrollComparisonService
          .buildPrediction_(
            payslip,
            week
          );

      const actual =
        {
          payslipId:
            normalizedId,

          payrollGroupId:
            payslip.payrollGroupId,

          fields:
            {
              payDate:
                extraction.payDate,

              payPeriod:
                extraction.payPeriod,

              taxCode:
                extraction.taxCode,

              grossPay:
                extraction.grossPay,

              netPay:
                extraction.netPay,

              incomeTax:
                extraction.incomeTax,

              nationalInsurance:
                extraction.nationalInsurance,

              pension:
                extraction.pension,

              studentLoan:
                extraction.studentLoan,

              totalDeductions:
                extraction.totalDeductions
            },

          timesheet:
            {
              totals:
                {
                  hours:
                    extraction.totalHours,

                  basicHours:
                    extraction.basicHours,

                  enhancedHours:
                    extraction.enhancedHours,

                  unsocialHours:
                    extraction.unsocialHours,

                  overtimeHours:
                    extraction.overtimeHours,

                  holidayHours:
                    extraction.holidayHours
                }
            }
        };

      const comparison =
        PayTrackerPayrollComparisonEngine
          .compare(
            prediction,
            actual
          );

      const storedStatus =
        PayTrackerPayrollComparisonService
          .toStoredStatus_(
            comparison.status
          );

      const grossDifference =
        comparison.totals
          .grossDifference;

      const predictedGross =
        comparison.totals
          .expectedGross;

      const differencePercentage =
        predictedGross
          ? Math.abs(
              grossDifference /
              predictedGross
            )
          : 0;

      if (persist === true) {
        PayTrackerPayslipRepository
          .setComparisonResult(
            normalizedId,
            {
              predictedGross:
                comparison.totals
                  .expectedGross,

              predictedTakeHome:
                comparison.totals
                  .expectedNet,

              grossDifference:
                grossDifference,

              netDifference:
                comparison.totals
                  .netDifference,

              differencePercentage:
                differencePercentage,

              comparisonStatus:
                storedStatus,

              matchConfidence:
                comparison.score,

              matchReason:
                [
                  comparison.comparisonMessage,
                  'Matched to',
                  week.weekLabel ||
                  (
                    week.weekStart +
                    ' to ' +
                    week.weekEnd
                  )
                ].join(' ')
            }
          );
      }

      return {
        success:
          true,

        payslipId:
          normalizedId,

        matchedWeek:
          {
            weekNumber:
              week.weekNumber,

            weekLabel:
              week.weekLabel,

            weekStart:
              week.weekStart,

            weekEnd:
              week.weekEnd
          },

        prediction:
          prediction,

        actual:
          actual.fields,

        status:
          storedStatus,

        engineStatus:
          comparison.status,

        score:
          comparison.score,

        summary:
          comparison.summary,

        totals:
          comparison.totals,

        comparisons:
          comparison.comparisons,

        warnings:
          comparison.warnings,

        errors:
          comparison.errors,

        message:
          comparison.comparisonMessage,

        persisted:
          persist === true
      };
    },

    /**
     * Builds a Payroll Group prediction for one PaySheet week.
     *
     * @param {Object} payslip Payslip.
     * @param {Object} week PaySheet week.
     * @return {Object} Comparison prediction.
     * @private
     */
    buildPrediction_: function(
      payslip,
      week
    ) {
      const assignments =
        PayTrackerPayrollGroupRepository
          .getTaxableEmployersForGroup(
            payslip.payrollGroupId
          );

      const employerKeys =
        assignments.map(function(assignment) {
          return String(
            assignment.employerKey ||
            ''
          ).toLowerCase();
        });

      const weekEmployers =
        Array.isArray(week.employers)
          ? week.employers
          : Object.keys(
              week.employers ||
              {}
            ).map(function(key) {
              return week.employers[key];
            });

      const employers =
        weekEmployers.filter(function(
          employer
        ) {
          return (
            employerKeys.indexOf(
              String(
                employer.key ||
                ''
              ).toLowerCase()
            ) !== -1
          );
        });

      const grossPay =
        PayTrackerPayrollComparisonService
          .roundCurrency_(
            employers.reduce(function(
              total,
              employer
            ) {
              return (
                total +
                Number(
                  employer.total ||
                  0
                )
              );
            }, 0)
          );

      const totalHours =
        PayTrackerPayrollComparisonService
          .roundHours_(
            employers.reduce(function(
              total,
              employer
            ) {
              return (
                total +
                Number(
                  employer.hours ||
                  0
                )
              );
            }, 0)
          );

      const taxableGross =
        Number(
          week.taxableGross ||
          0
        );

      const payrollShare =
        taxableGross > 0
          ? Math.min(
              grossPay /
              taxableGross,
              1
            )
          : 0;

      const totalDeductions =
        PayTrackerPayrollComparisonService
          .roundCurrency_(
            Number(
              week.estimatedDeductions ||
              0
            ) *
            payrollShare
          );

      return {
        predictionId:
          [
            'PREDICTION',
            week.weekNumber,
            payslip.payrollGroupId
          ].join('-'),

        payslipId:
          payslip.payslipId,

        payrollGroupId:
          payslip.payrollGroupId,

        weekStart:
          week.weekStart,

        weekEnd:
          week.weekEnd,

        payDate:
          payslip.payDate,

        grossPay:
          grossPay,

        netPay:
          PayTrackerPayrollComparisonService
            .roundCurrency_(
              grossPay -
              totalDeductions
            ),

        totalDeductions:
          totalDeductions,

        hours:
          {
            total:
              totalHours
          }
      };
    },

    /**
     * Finds the PaySheet week covered by a payslip.
     *
     * @param {Object} payslip Payslip.
     * @param {Object} extraction Extracted details.
     * @param {Array<Object>} weeks PaySheet weeks.
     * @return {Object|null} Matching week.
     * @private
     */
    findMatchingWeek_: function(
      payslip,
      extraction,
      weeks
    ) {
      const candidates = [];

      PayTrackerPayrollComparisonService
        .pushDateCandidate_(
          candidates,
          payslip.payPeriodEnd
        );

      const subjectDate =
        PayTrackerPayrollComparisonService
          .readUkDateFromText_(
            payslip.emailSubject
          );

      PayTrackerPayrollComparisonService
        .pushDateCandidate_(
          candidates,
          subjectDate
        );

      const payDate =
        PayTrackerPayrollComparisonService
          .toDateOrNull_(
            extraction.payDate ||
            payslip.payDate
          );

      if (payDate) {
        const likelyWeekEnd =
          new Date(
            payDate.getTime()
          );

        likelyWeekEnd.setDate(
          likelyWeekEnd.getDate() -
          5
        );

        PayTrackerPayrollComparisonService
          .pushDateCandidate_(
            candidates,
            likelyWeekEnd
          );
      }

      for (
        let weekIndex = 0;
        weekIndex < weeks.length;
        weekIndex += 1
      ) {
        const week =
          weeks[weekIndex];

        const start =
          PayTrackerPayrollComparisonService
            .toDateOrNull_(
              week.weekStart
            );

        const end =
          PayTrackerPayrollComparisonService
            .toDateOrNull_(
              week.weekEnd
            );

        if (
          !start ||
          !end
        ) {
          continue;
        }

        for (
          let candidateIndex = 0;
          candidateIndex <
            candidates.length;
          candidateIndex += 1
        ) {
          const candidate =
            candidates[
              candidateIndex
            ];

          if (
            candidate.getTime() >=
              start.getTime() &&
            candidate.getTime() <=
              end.getTime()
          ) {
            return week;
          }
        }
      }

      return null;
    },

    /**
     * Reads the last dd/mm/yyyy date from text.
     *
     * @param {*} value Text.
     * @return {Date|null} Date.
     * @private
     */
    readUkDateFromText_: function(value) {
      const text =
        String(
          value || ''
        );

      const matches =
        text.match(
          /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g
        );

      if (
        !matches ||
        !matches.length
      ) {
        return null;
      }

      const parts =
        matches[
          matches.length - 1
        ].split('/');

      const date =
        new Date(
          Number(parts[2]),
          Number(parts[1]) - 1,
          Number(parts[0])
        );

      return isNaN(
        date.getTime()
      )
        ? null
        : date;
    },

    /**
     * Adds a unique calendar-date candidate.
     *
     * @param {Array<Date>} candidates Dates.
     * @param {*} value Date value.
     * @private
     */
    pushDateCandidate_: function(
      candidates,
      value
    ) {
      const date =
        PayTrackerPayrollComparisonService
          .toDateOrNull_(
            value
          );

      if (!date) {
        return;
      }

      date.setHours(
        0,
        0,
        0,
        0
      );

      const exists =
        candidates.some(function(candidate) {
          return (
            candidate.getTime() ===
            date.getTime()
          );
        });

      if (!exists) {
        candidates.push(
          date
        );
      }
    },

    /**
     * Maps engine status to the register model.
     *
     * @param {string} status Engine status.
     * @return {string} Register status.
     * @private
     */
    toStoredStatus_: function(status) {
      switch (
        String(
          status || ''
        ).toUpperCase()
      ) {
        case 'MATCHED':
          return PayTrackerPayrollConfig
            .COMPARISON_STATUSES
            .MATCHED;

        case 'ROUNDING':
          return PayTrackerPayrollConfig
            .COMPARISON_STATUSES
            .MINOR_VARIANCE;

        case 'WARNING':
          return PayTrackerPayrollConfig
            .COMPARISON_STATUSES
            .REVIEW;

        case 'FAILED':
          return PayTrackerPayrollConfig
            .COMPARISON_STATUSES
            .MAJOR_DISCREPANCY;

        default:
          return PayTrackerPayrollConfig
            .COMPARISON_STATUSES
            .INCOMPLETE;
      }
    },

    /**
     * Returns a Date or null.
     *
     * @param {*} value Date value.
     * @return {Date|null} Date.
     * @private
     */
    toDateOrNull_: function(value) {
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
        isNaN(
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
     * Rounds currency.
     *
     * @param {*} value Value.
     * @return {number} Rounded amount.
     * @private
     */
    roundCurrency_: function(value) {
      return Math.round(
        Number(value || 0) *
        100
      ) / 100;
    },

    /**
     * Rounds hours.
     *
     * @param {*} value Value.
     * @return {number} Rounded hours.
     * @private
     */
    roundHours_: function(value) {
      return Math.round(
        Number(value || 0) *
        100
      ) / 100;
    },

    /**
     * Returns required text.
     *
     * @param {*} value Value.
     * @param {string} label Label.
     * @return {string} Text.
     * @private
     */
    requiredText_: function(
      value,
      label
    ) {
      const text =
        String(
          value === null ||
          value === undefined
            ? ''
            : value
        ).trim();

      if (!text) {
        throw new Error(
          label +
          ' is required.'
        );
      }

      return text;
    },

    /**
     * Returns a safe error message.
     *
     * @param {*} error Error.
     * @return {string} Message.
     * @private
     */
    getErrorMessage_: function(error) {
      return error &&
        error.message
        ? String(error.message)
        : String(
            error ||
            'Unknown payroll comparison error.'
          );
    }
  });

/**
 * Frontend API: compares and stores one payslip.
 *
 * @param {string} payslipId Payslip ID.
 * @return {Object} Comparison response.
 */
function comparePayTrackerPayslip(payslipId) {
  return PayTrackerPayrollComparisonService
    .comparePayslip(
      payslipId
    );
}

/**
 * Manual batch entrypoint for controlled comparison runs.
 *
 * @return {Object} Batch comparison result.
 */
function compareAllPayTrackerPayslips() {
  return PayTrackerPayrollComparisonService
    .compareBatch({
      limit: 100,
      onlyNotCompared: false
    });
}

/**
 * Read-only diagnostic for Payroll Group prediction inputs.
 *
 * @return {Object} Current comparison inputs.
 */
function testPayTrackerPayrollComparisonInputs() {
  const workspace =
    PayTrackerWebPayWorkspaceService
      .getPayWorkspaceData();

  const payslip =
    PayTrackerPayslipRepository
      .getAll()[0];

  const extraction =
    PayTrackerPayrollCentreController
      .getPayslipExtraction(
        payslip
      );

  const week =
    PayTrackerPayrollComparisonService
      .findMatchingWeek_(
        payslip,
        extraction,
        workspace.weeks || []
      );

  const assignments =
    PayTrackerPayrollGroupRepository
      .getTaxableEmployersForGroup(
        payslip.payrollGroupId
      );

  const result = {
    payslipId:
      payslip.payslipId,

    payrollGroupId:
      payslip.payrollGroupId,

    assignmentKeys:
      assignments.map(function(
        assignment
      ) {
        return assignment.employerKey;
      }),

    matchedWeek:
      week
        ? {
            weekNumber:
              week.weekNumber,

            taxableGross:
              week.taxableGross,

            employerCount:
              Array.isArray(
                week.employers
              )
                ? week.employers.length
                : 0,

            employers:
              week.employers || []
          }
        : null
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
