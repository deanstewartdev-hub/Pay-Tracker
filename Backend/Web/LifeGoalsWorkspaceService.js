/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Web/LifeGoalsWorkspaceService.js
 *
 * Browser-safe controller for the Life Goals workspace.
 *******************************************************/

const PayTrackerWebLifeGoalsWorkspaceService =
  Object.freeze({
    getData: function() {
      const spreadsheet =
        SpreadsheetApp
          .getActiveSpreadsheet();

      if (!spreadsheet) {
        throw new Error(
          'No active Pay Tracker spreadsheet is available.'
        );
      }

      PayTrackerLifeGoalsService
        .recalculateAllGoals();

      const goals =
        PayTrackerLifeGoalsService
          .getGoalRows()
          .map(function(goal) {
            return Object.assign(
              {},
              goal,
              {
                linkedPots:
                  PayTrackerWebLifeGoalsWorkspaceService
                    .getLinkedPotSummaries(
                      goal.id
                    )
              }
            );
          });

      return {
        success: true,
        generatedAt:
          new Date().toISOString(),
        spreadsheetUrl:
          spreadsheet.getUrl(),
        summary:
          PayTrackerWebLifeGoalsWorkspaceService
            .buildSummary(goals),
        goals:
          goals
      };
    },

    getLinkedPotSummaries: function(goalId) {
      const rows =
        PayTrackerLifeGoalsService
          .getLinkedPotRows(
            goalId
          );

      const columns =
        PayTrackerSavingsConfig
          .POTS
          .COLUMNS;

      return rows.map(function(row) {
        return {
          name:
            String(
              row[
                columns.NAME - 1
              ] || ''
            ).trim(),
          currentBalance:
            Number(
              row[
                columns.CURRENT_BALANCE - 1
              ]
            ) || 0
        };
      });
    },

    buildSummary: function(goals) {
      const active =
        goals.filter(function(goal) {
          return (
            goal.active === 'Yes'
          );
        });

      const totalTarget =
        active.reduce(
          function(total, goal) {
            return (
              total +
              (
                Number(
                  goal.targetAmount
                ) || 0
              )
            );
          },
          0
        );

      const totalSaved =
        active.reduce(
          function(total, goal) {
            return (
              total +
              (
                Number(
                  goal.currentSavings
                ) || 0
              )
            );
          },
          0
        );

      const totalRemaining =
        active.reduce(
          function(total, goal) {
            return (
              total +
              (
                Number(
                  goal.remaining
                ) || 0
              )
            );
          },
          0
        );

      const completedGoals =
        active.filter(function(goal) {
          return (
            goal.targetStatus ===
            'Complete'
          );
        }).length;

      return {
        totalGoals:
          goals.length,
        activeGoals:
          active.length,
        completedGoals:
          completedGoals,
        totalTarget:
          PayTrackerUtils.roundCurrency(
            totalTarget
          ),
        totalSaved:
          PayTrackerUtils.roundCurrency(
            totalSaved
          ),
        totalRemaining:
          PayTrackerUtils.roundCurrency(
            totalRemaining
          ),
        overallProgress:
          totalTarget > 0
            ? Math.min(
                totalSaved /
                totalTarget,
                1
              )
            : 0
      };
    }
  });

function makePayTrackerLifeGoalsResponseBrowserSafe_(data) {
  return JSON.parse(
    JSON.stringify(
      data,
      function(key, value) {
        if (value instanceof Date) {
          return value.toISOString();
        }

        return value;
      }
    )
  );
}

function getPayTrackerLifeGoalsWorkspace() {
  return makePayTrackerLifeGoalsResponseBrowserSafe_(
    PayTrackerWebLifeGoalsWorkspaceService.getData()
  );
}
