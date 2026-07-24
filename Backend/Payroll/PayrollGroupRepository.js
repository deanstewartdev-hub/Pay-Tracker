/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Payroll/PayrollGroupRepository.js
 *
 * Purpose:
 * - Read Payroll Group records
 * - Read employer-to-group assignments
 * - Return complete Payroll Group models
 * - Create and update Payroll Groups safely
 * - Create and update employer assignments safely
 * - Preserve all existing spreadsheet data
 *
 * Important:
 * - This repository does not access Gmail
 * - This repository does not access Google Drive
 * - This repository does not delete spreadsheet rows
 * - Logging Cash remains excluded unless explicitly added
 *******************************************************/

const PayTrackerPayrollGroupRepository = Object.freeze({
  VERSION: '2.8.0',

  /**
   * Returns every Payroll Group.
   *
   * @param {boolean=} includeInactive Include inactive groups.
   * @return {Array<Object>} Payroll Groups.
   */
  getAll: function(includeInactive) {
    const spreadsheet =
      PayTrackerPayrollGroupRepository
        .getSpreadsheet();

    const groups =
      PayTrackerPayrollGroupRepository
        .readPayrollGroups(
          spreadsheet
        );

    const assignments =
      PayTrackerPayrollGroupRepository
        .readEmployerAssignments(
          spreadsheet
        );

    return groups
      .filter(function(group) {
        return (
          includeInactive === true ||
          group.active === true
        );
      })
      .map(function(group) {
        return PayTrackerPayrollGroupRepository
          .attachEmployers(
            group,
            assignments,
            includeInactive
          );
      });
  },

  /**
   * Returns all active Payroll Groups.
   *
   * @return {Array<Object>} Active groups.
   */
  getActive: function() {
    return PayTrackerPayrollGroupRepository
      .getAll(false);
  },

  /**
   * Returns one Payroll Group by ID.
   *
   * @param {string} payrollGroupId Payroll Group ID.
   * @param {boolean=} includeInactive Include inactive records.
   * @return {Object|null} Payroll Group or null.
   */
  getById: function(
    payrollGroupId,
    includeInactive
  ) {
    const normalizedId =
      PayTrackerPayrollGroupRepository
        .normalizeText(
          payrollGroupId
        );

    if (!normalizedId) {
      return null;
    }

    const groups =
      PayTrackerPayrollGroupRepository
        .getAll(
          includeInactive === true
        );

    for (
      let index = 0;
      index !== groups.length;
      index += 1
    ) {
      if (
        PayTrackerPayrollGroupRepository
          .normalizeText(
            groups[index].payrollGroupId
          ) === normalizedId
      ) {
        return groups[index];
      }
    }

    return null;
  },

  /**
   * Returns the Payroll Group containing an employer.
   *
   * @param {string} employerKey Employer key.
   * @return {Object|null} Payroll Group or null.
   */
  getByEmployerKey: function(employerKey) {
    const normalizedEmployerKey =
      PayTrackerPayrollGroupRepository
        .normalizeKey(
          employerKey
        );

    if (!normalizedEmployerKey) {
      return null;
    }

    const groups =
      PayTrackerPayrollGroupRepository
        .getActive();

    for (
      let groupIndex = 0;
      groupIndex !== groups.length;
      groupIndex += 1
    ) {
      const employers =
        groups[groupIndex].employers || [];

      for (
        let employerIndex = 0;
        employerIndex !== employers.length;
        employerIndex += 1
      ) {
        if (
          PayTrackerPayrollGroupRepository
            .normalizeKey(
              employers[employerIndex]
                .employerKey
            ) === normalizedEmployerKey
        ) {
          return groups[groupIndex];
        }
      }
    }

    return null;
  },

  /**
   * Returns employer assignments for one Payroll Group.
   *
   * @param {string} payrollGroupId Payroll Group ID.
   * @param {boolean=} includeInactive Include inactive assignments.
   * @return {Array<Object>} Employer assignments.
   */
  getEmployersForGroup: function(
    payrollGroupId,
    includeInactive
  ) {
    const normalizedGroupId =
      PayTrackerPayrollGroupRepository
        .normalizeText(
          payrollGroupId
        );

    if (!normalizedGroupId) {
      return [];
    }

    return PayTrackerPayrollGroupRepository
      .readEmployerAssignments(
        PayTrackerPayrollGroupRepository
          .getSpreadsheet()
      )
      .filter(function(assignment) {
        return (
          PayTrackerPayrollGroupRepository
            .normalizeText(
              assignment.payrollGroupId
            ) === normalizedGroupId &&
          (
            includeInactive === true ||
            assignment.active === true
          )
        );
      });
  },

  /**
   * Returns taxable employers for one Payroll Group.
   *
   * @param {string} payrollGroupId Payroll Group ID.
   * @return {Array<Object>} Taxable employer assignments.
   */
  getTaxableEmployersForGroup: function(
    payrollGroupId
  ) {
    return PayTrackerPayrollGroupRepository
      .getEmployersForGroup(
        payrollGroupId,
        false
      )
      .filter(function(assignment) {
        return (
          assignment
            .includedInTaxablePayroll === true
        );
      });
  },

  /**
   * Creates a new Payroll Group.
   *
   * @param {Object} group Payroll Group data.
   * @return {Object} Created Payroll Group.
   */
  create: function(group) {
    const normalizedGroup =
      PayTrackerPayrollGroupRepository
        .normalizePayrollGroup(
          group
        );

    PayTrackerPayrollGroupRepository
      .validatePayrollGroup(
        normalizedGroup,
        true
      );

    const existing =
      PayTrackerPayrollGroupRepository
        .getById(
          normalizedGroup
            .payrollGroupId,
          true
        );

    if (existing) {
      throw new Error(
        'A Payroll Group already exists with ID "' +
        normalizedGroup.payrollGroupId +
        '".'
      );
    }

    const spreadsheet =
      PayTrackerPayrollGroupRepository
        .getSpreadsheet();

    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_GROUPS;

    const sheet =
      PayTrackerPayrollGroupRepository
        .getRequiredSheet(
          spreadsheet,
          definition.NAME
        );

    const timestamp =
      new Date();

    normalizedGroup.createdAt =
      normalizedGroup.createdAt ||
      timestamp;

    normalizedGroup.updatedAt =
      timestamp;

    sheet.appendRow(
      PayTrackerPayrollGroupRepository
        .payrollGroupToRow(
          normalizedGroup
        )
    );

    SpreadsheetApp.flush();

    return PayTrackerPayrollGroupRepository
      .getById(
        normalizedGroup
          .payrollGroupId,
        true
      );
  },

  /**
   * Updates an existing Payroll Group.
   *
   * The Payroll Group ID cannot be changed.
   *
   * @param {string} payrollGroupId Payroll Group ID.
   * @param {Object} changes Updated fields.
   * @return {Object} Updated Payroll Group.
   */
  update: function(
    payrollGroupId,
    changes
  ) {
    const existing =
      PayTrackerPayrollGroupRepository
        .getById(
          payrollGroupId,
          true
        );

    if (!existing) {
      throw new Error(
        'Payroll Group "' +
        payrollGroupId +
        '" was not found.'
      );
    }

    const merged =
      PayTrackerPayrollGroupRepository
        .normalizePayrollGroup(
          Object.assign(
            {},
            existing,
            changes || {},
            {
              payrollGroupId:
                existing.payrollGroupId,

              createdAt:
                existing.createdAt,

              updatedAt:
                new Date()
            }
          )
        );

    PayTrackerPayrollGroupRepository
      .validatePayrollGroup(
        merged,
        false
      );

    const spreadsheet =
      PayTrackerPayrollGroupRepository
        .getSpreadsheet();

    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_GROUPS;

    const sheet =
      PayTrackerPayrollGroupRepository
        .getRequiredSheet(
          spreadsheet,
          definition.NAME
        );

    const rowNumber =
      PayTrackerPayrollGroupRepository
        .findRowById(
          sheet,
          definition.COLUMNS
            .PAYROLL_GROUP_ID,
          payrollGroupId
        );

    if (!rowNumber) {
      throw new Error(
        'The Payroll Group row could not be found.'
      );
    }

    sheet
      .getRange(
        rowNumber,
        1,
        1,
        definition.HEADERS.length
      )
      .setValues([
        PayTrackerPayrollGroupRepository
          .payrollGroupToRow(
            merged
          )
      ]);

    SpreadsheetApp.flush();

    return PayTrackerPayrollGroupRepository
      .getById(
        payrollGroupId,
        true
      );
  },

  /**
   * Activates or deactivates a Payroll Group.
   *
   * No rows are deleted.
   *
   * @param {string} payrollGroupId Payroll Group ID.
   * @param {boolean} active Active state.
   * @return {Object} Updated Payroll Group.
   */
  setActive: function(
    payrollGroupId,
    active
  ) {
    return PayTrackerPayrollGroupRepository
      .update(
        payrollGroupId,
        {
          active: active === true
        }
      );
  },

  /**
   * Creates an employer assignment.
   *
   * @param {Object} assignment Assignment data.
   * @return {Object} Created assignment.
   */
  addEmployerAssignment: function(
    assignment
  ) {
    const normalizedAssignment =
      PayTrackerPayrollGroupRepository
        .normalizeEmployerAssignment(
          assignment
        );

    PayTrackerPayrollGroupRepository
      .validateEmployerAssignment(
        normalizedAssignment,
        true
      );

    const group =
      PayTrackerPayrollGroupRepository
        .getById(
          normalizedAssignment
            .payrollGroupId,
          true
        );

    if (!group) {
      throw new Error(
        'Payroll Group "' +
        normalizedAssignment
          .payrollGroupId +
        '" does not exist.'
      );
    }

    const spreadsheet =
      PayTrackerPayrollGroupRepository
        .getSpreadsheet();

    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_GROUP_EMPLOYERS;

    const sheet =
      PayTrackerPayrollGroupRepository
        .getRequiredSheet(
          spreadsheet,
          definition.NAME
        );

    const existingRow =
      PayTrackerPayrollGroupRepository
        .findRowById(
          sheet,
          definition.COLUMNS
            .ASSIGNMENT_ID,
          normalizedAssignment
            .assignmentId
        );

    if (existingRow) {
      throw new Error(
        'An employer assignment already exists with ID "' +
        normalizedAssignment.assignmentId +
        '".'
      );
    }

    const duplicate =
      PayTrackerPayrollGroupRepository
        .findEmployerAssignment(
          normalizedAssignment
            .payrollGroupId,
          normalizedAssignment
            .employerKey,
          true
        );

    if (duplicate) {
      throw new Error(
        'Employer "' +
        normalizedAssignment
          .employerDisplayName +
        '" is already assigned to this Payroll Group.'
      );
    }

    const timestamp =
      new Date();

    normalizedAssignment.createdAt =
      normalizedAssignment.createdAt ||
      timestamp;

    normalizedAssignment.updatedAt =
      timestamp;

    sheet.appendRow(
      PayTrackerPayrollGroupRepository
        .employerAssignmentToRow(
          normalizedAssignment
        )
    );

    SpreadsheetApp.flush();

    return PayTrackerPayrollGroupRepository
      .findEmployerAssignment(
        normalizedAssignment
          .payrollGroupId,
        normalizedAssignment
          .employerKey,
        true
      );
  },

  /**
   * Updates an employer assignment.
   *
   * @param {string} assignmentId Assignment ID.
   * @param {Object} changes Updated fields.
   * @return {Object} Updated assignment.
   */
  updateEmployerAssignment: function(
    assignmentId,
    changes
  ) {
    const spreadsheet =
      PayTrackerPayrollGroupRepository
        .getSpreadsheet();

    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_GROUP_EMPLOYERS;

    const sheet =
      PayTrackerPayrollGroupRepository
        .getRequiredSheet(
          spreadsheet,
          definition.NAME
        );

    const rowNumber =
      PayTrackerPayrollGroupRepository
        .findRowById(
          sheet,
          definition.COLUMNS
            .ASSIGNMENT_ID,
          assignmentId
        );

    if (!rowNumber) {
      throw new Error(
        'Employer assignment "' +
        assignmentId +
        '" was not found.'
      );
    }

    const currentRow =
      sheet
        .getRange(
          rowNumber,
          1,
          1,
          definition.HEADERS.length
        )
        .getValues()[0];

    const existing =
      PayTrackerPayrollGroupRepository
        .rowToEmployerAssignment(
          currentRow,
          rowNumber
        );

    const updated =
      PayTrackerPayrollGroupRepository
        .normalizeEmployerAssignment(
          Object.assign(
            {},
            existing,
            changes || {},
            {
              assignmentId:
                existing.assignmentId,

              createdAt:
                existing.createdAt,

              updatedAt:
                new Date()
            }
          )
        );

    PayTrackerPayrollGroupRepository
      .validateEmployerAssignment(
        updated,
        false
      );

    sheet
      .getRange(
        rowNumber,
        1,
        1,
        definition.HEADERS.length
      )
      .setValues([
        PayTrackerPayrollGroupRepository
          .employerAssignmentToRow(
            updated
          )
      ]);

    SpreadsheetApp.flush();

    return PayTrackerPayrollGroupRepository
      .findEmployerAssignmentById(
        assignmentId
      );
  },

  /**
   * Activates or deactivates an employer assignment.
   *
   * @param {string} assignmentId Assignment ID.
   * @param {boolean} active Active state.
   * @return {Object} Updated assignment.
   */
  setEmployerAssignmentActive: function(
    assignmentId,
    active
  ) {
    return PayTrackerPayrollGroupRepository
      .updateEmployerAssignment(
        assignmentId,
        {
          active: active === true
        }
      );
  },

  /**
   * Returns an assignment by assignment ID.
   *
   * @param {string} assignmentId Assignment ID.
   * @return {Object|null} Assignment or null.
   */
  findEmployerAssignmentById: function(
    assignmentId
  ) {
    const assignments =
      PayTrackerPayrollGroupRepository
        .readEmployerAssignments(
          PayTrackerPayrollGroupRepository
            .getSpreadsheet()
        );

    const normalizedId =
      PayTrackerPayrollGroupRepository
        .normalizeText(
          assignmentId
        );

    for (
      let index = 0;
      index !== assignments.length;
      index += 1
    ) {
      if (
        PayTrackerPayrollGroupRepository
          .normalizeText(
            assignments[index]
              .assignmentId
          ) === normalizedId
      ) {
        return assignments[index];
      }
    }

    return null;
  },

  /**
   * Finds an employer assignment by group and employer.
   *
   * @param {string} payrollGroupId Payroll Group ID.
   * @param {string} employerKey Employer key.
   * @param {boolean=} includeInactive Include inactive.
   * @return {Object|null} Assignment or null.
   */
  findEmployerAssignment: function(
    payrollGroupId,
    employerKey,
    includeInactive
  ) {
    const normalizedGroupId =
      PayTrackerPayrollGroupRepository
        .normalizeText(
          payrollGroupId
        );

    const normalizedEmployerKey =
      PayTrackerPayrollGroupRepository
        .normalizeKey(
          employerKey
        );

    const assignments =
      PayTrackerPayrollGroupRepository
        .readEmployerAssignments(
          PayTrackerPayrollGroupRepository
            .getSpreadsheet()
        );

    for (
      let index = 0;
      index !== assignments.length;
      index += 1
    ) {
      const assignment =
        assignments[index];

      if (
        PayTrackerPayrollGroupRepository
          .normalizeText(
            assignment.payrollGroupId
          ) === normalizedGroupId &&
        PayTrackerPayrollGroupRepository
          .normalizeKey(
            assignment.employerKey
          ) === normalizedEmployerKey &&
        (
          includeInactive === true ||
          assignment.active === true
        )
      ) {
        return assignment;
      }
    }

    return null;
  },

  /**
   * Reads all Payroll Group sheet rows.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}
   *   spreadsheet Spreadsheet.
   * @return {Array<Object>} Payroll Groups.
   */
  readPayrollGroups: function(spreadsheet) {
    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_GROUPS;

    const sheet =
      PayTrackerPayrollGroupRepository
        .getRequiredSheet(
          spreadsheet,
          definition.NAME
        );

    const lastRow =
      sheet.getLastRow();

    if (lastRow <= 1) {
      return [];
    }

    const rows =
      sheet
        .getRange(
          2,
          1,
          lastRow - 1,
          definition.HEADERS.length
        )
        .getValues();

    return rows
      .map(function(row, index) {
        return PayTrackerPayrollGroupRepository
          .rowToPayrollGroup(
            row,
            index + 2
          );
      })
      .filter(function(group) {
        return Boolean(
          group.payrollGroupId
        );
      });
  },

  /**
   * Reads all employer-assignment rows.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}
   *   spreadsheet Spreadsheet.
   * @return {Array<Object>} Employer assignments.
   */
  readEmployerAssignments: function(
    spreadsheet
  ) {
    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_GROUP_EMPLOYERS;

    const sheet =
      PayTrackerPayrollGroupRepository
        .getRequiredSheet(
          spreadsheet,
          definition.NAME
        );

    const lastRow =
      sheet.getLastRow();

    if (lastRow <= 1) {
      return [];
    }

    const rows =
      sheet
        .getRange(
          2,
          1,
          lastRow - 1,
          definition.HEADERS.length
        )
        .getValues();

    return rows
      .map(function(row, index) {
        return PayTrackerPayrollGroupRepository
          .rowToEmployerAssignment(
            row,
            index + 2
          );
      })
      .filter(function(assignment) {
        return Boolean(
          assignment.assignmentId
        );
      });
  },

  /**
   * Adds employer assignments to a Payroll Group model.
   *
   * @param {Object} group Payroll Group.
   * @param {Array<Object>} assignments All assignments.
   * @param {boolean=} includeInactive Include inactive.
   * @return {Object} Group with employers.
   */
  attachEmployers: function(
    group,
    assignments,
    includeInactive
  ) {
    const normalizedGroupId =
      PayTrackerPayrollGroupRepository
        .normalizeText(
          group.payrollGroupId
        );

    const employers =
      assignments.filter(function(assignment) {
        return (
          PayTrackerPayrollGroupRepository
            .normalizeText(
              assignment.payrollGroupId
            ) === normalizedGroupId &&
          (
            includeInactive === true ||
            assignment.active === true
          )
        );
      });

    return Object.assign(
      {},
      group,
      {
        employers: employers,

        employerKeys:
          employers.map(function(
            employer
          ) {
            return employer.employerKey;
          }),

        taxableEmployerKeys:
          employers
            .filter(function(employer) {
              return (
                employer
                  .includedInTaxablePayroll ===
                true
              );
            })
            .map(function(employer) {
              return employer.employerKey;
            })
      }
    );
  },

  /**
   * Converts a sheet row into a Payroll Group.
   *
   * @param {Array<*>} row Sheet row.
   * @param {number} rowNumber Spreadsheet row.
   * @return {Object} Payroll Group.
   */
  rowToPayrollGroup: function(
    row,
    rowNumber
  ) {
    const columns =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_GROUPS
        .COLUMNS;

    return {
      payrollGroupId:
        PayTrackerPayrollGroupRepository
          .readColumn(
            row,
            columns.PAYROLL_GROUP_ID
          ),

      payrollGroupName:
        PayTrackerPayrollGroupRepository
          .readColumn(
            row,
            columns.PAYROLL_GROUP_NAME
          ),

      description:
        PayTrackerPayrollGroupRepository
          .readColumn(
            row,
            columns.DESCRIPTION
          ),

      primaryEmployerKey:
        PayTrackerPayrollGroupRepository
          .normalizeKey(
            PayTrackerPayrollGroupRepository
              .readColumn(
                row,
                columns
                  .PRIMARY_EMPLOYER_KEY
              )
          ),

      payFrequency:
        PayTrackerPayrollGroupRepository
          .readColumn(
            row,
            columns.PAY_FREQUENCY
          ),

      expectedSenderRules:
        PayTrackerPayrollGroupRepository
          .readColumn(
            row,
            columns
              .EXPECTED_SENDER_RULES
          ),

      expectedSubjectRules:
        PayTrackerPayrollGroupRepository
          .readColumn(
            row,
            columns
              .EXPECTED_SUBJECT_RULES
          ),

      storageFolderId:
        PayTrackerPayrollGroupRepository
          .readColumn(
            row,
            columns.STORAGE_FOLDER_ID
          ),

      active:
        PayTrackerPayrollGroupRepository
          .toBoolean(
            PayTrackerPayrollGroupRepository
              .readColumn(
                row,
                columns.ACTIVE
              )
          ),

      createdAt:
        PayTrackerPayrollGroupRepository
          .readColumn(
            row,
            columns.CREATED_AT
          ) || null,

      updatedAt:
        PayTrackerPayrollGroupRepository
          .readColumn(
            row,
            columns.UPDATED_AT
          ) || null,

      rowNumber: rowNumber
    };
  },

  /**
   * Converts a sheet row into an employer assignment.
   *
   * @param {Array<*>} row Sheet row.
   * @param {number} rowNumber Spreadsheet row.
   * @return {Object} Employer assignment.
   */
  rowToEmployerAssignment: function(
    row,
    rowNumber
  ) {
    const columns =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_GROUP_EMPLOYERS
        .COLUMNS;

    return {
      assignmentId:
        PayTrackerPayrollGroupRepository
          .readColumn(
            row,
            columns.ASSIGNMENT_ID
          ),

      payrollGroupId:
        PayTrackerPayrollGroupRepository
          .readColumn(
            row,
            columns.PAYROLL_GROUP_ID
          ),

      employerKey:
        PayTrackerPayrollGroupRepository
          .normalizeKey(
            PayTrackerPayrollGroupRepository
              .readColumn(
                row,
                columns.EMPLOYER_KEY
              )
          ),

      employerDisplayName:
        PayTrackerPayrollGroupRepository
          .readColumn(
            row,
            columns
              .EMPLOYER_DISPLAY_NAME
          ),

      includedInTaxablePayroll:
        PayTrackerPayrollGroupRepository
          .toBoolean(
            PayTrackerPayrollGroupRepository
              .readColumn(
                row,
                columns
                  .INCLUDED_IN_TAXABLE_PAYROLL
              )
          ),

      active:
        PayTrackerPayrollGroupRepository
          .toBoolean(
            PayTrackerPayrollGroupRepository
              .readColumn(
                row,
                columns.ACTIVE
              )
          ),

      createdAt:
        PayTrackerPayrollGroupRepository
          .readColumn(
            row,
            columns.CREATED_AT
          ) || null,

      updatedAt:
        PayTrackerPayrollGroupRepository
          .readColumn(
            row,
            columns.UPDATED_AT
          ) || null,

      rowNumber: rowNumber
    };
  },

  /**
   * Converts a Payroll Group to a sheet row.
   *
   * @param {Object} group Payroll Group.
   * @return {Array<*>} Sheet row.
   */
  payrollGroupToRow: function(group) {
    return [
      group.payrollGroupId,
      group.payrollGroupName,
      group.description,
      group.primaryEmployerKey,
      group.payFrequency,
      group.expectedSenderRules,
      group.expectedSubjectRules,
      group.storageFolderId,
      group.active === true,
      group.createdAt || new Date(),
      group.updatedAt || new Date()
    ];
  },

  /**
   * Converts an employer assignment to a sheet row.
   *
   * @param {Object} assignment Employer assignment.
   * @return {Array<*>} Sheet row.
   */
  employerAssignmentToRow: function(
    assignment
  ) {
    return [
      assignment.assignmentId,
      assignment.payrollGroupId,
      assignment.employerKey,
      assignment.employerDisplayName,
      assignment
        .includedInTaxablePayroll === true,
      assignment.active === true,
      assignment.createdAt || new Date(),
      assignment.updatedAt || new Date()
    ];
  },

  /**
   * Normalizes a Payroll Group model.
   *
   * @param {Object} group Payroll Group input.
   * @return {Object} Normalized Payroll Group.
   */
  normalizePayrollGroup: function(group) {
    const value =
      group || {};

    return {
      payrollGroupId:
        PayTrackerPayrollGroupRepository
          .cleanText(
            value.payrollGroupId
          ),

      payrollGroupName:
        PayTrackerPayrollGroupRepository
          .cleanText(
            value.payrollGroupName
          ),

      description:
        PayTrackerPayrollGroupRepository
          .cleanText(
            value.description
          ),

      primaryEmployerKey:
        PayTrackerPayrollGroupRepository
          .normalizeKey(
            value.primaryEmployerKey
          ),

      payFrequency:
        PayTrackerPayrollGroupRepository
          .cleanText(
            value.payFrequency
          ),

      expectedSenderRules:
        PayTrackerPayrollGroupRepository
          .cleanText(
            value.expectedSenderRules
          ),

      expectedSubjectRules:
        PayTrackerPayrollGroupRepository
          .cleanText(
            value.expectedSubjectRules
          ),

      storageFolderId:
        PayTrackerPayrollGroupRepository
          .cleanText(
            value.storageFolderId
          ),

      active:
        value.active !== false,

      createdAt:
        value.createdAt || null,

      updatedAt:
        value.updatedAt || null
    };
  },

  /**
   * Normalizes an employer assignment model.
   *
   * @param {Object} assignment Assignment input.
   * @return {Object} Normalized assignment.
   */
  normalizeEmployerAssignment: function(
    assignment
  ) {
    const value =
      assignment || {};

    return {
      assignmentId:
        PayTrackerPayrollGroupRepository
          .cleanText(
            value.assignmentId
          ),

      payrollGroupId:
        PayTrackerPayrollGroupRepository
          .cleanText(
            value.payrollGroupId
          ),

      employerKey:
        PayTrackerPayrollGroupRepository
          .normalizeKey(
            value.employerKey
          ),

      employerDisplayName:
        PayTrackerPayrollGroupRepository
          .cleanText(
            value.employerDisplayName
          ),

      includedInTaxablePayroll:
        value.includedInTaxablePayroll ===
        true,

      active:
        value.active !== false,

      createdAt:
        value.createdAt || null,

      updatedAt:
        value.updatedAt || null
    };
  },

  /**
   * Validates a Payroll Group.
   *
   * @param {Object} group Payroll Group.
   * @param {boolean} requireId Require ID.
   */
  validatePayrollGroup: function(
    group,
    requireId
  ) {
    if (
      requireId === true &&
      !group.payrollGroupId
    ) {
      throw new Error(
        'Payroll Group ID is required.'
      );
    }

    if (!group.payrollGroupName) {
      throw new Error(
        'Payroll Group name is required.'
      );
    }

    if (!group.primaryEmployerKey) {
      throw new Error(
        'A primary employer is required.'
      );
    }

    if (
      !PayTrackerPayrollConfig
        .isValidPayFrequency(
          group.payFrequency
        )
    ) {
      throw new Error(
        'Unsupported payroll frequency "' +
        group.payFrequency +
        '".'
      );
    }
  },

  /**
   * Validates an employer assignment.
   *
   * @param {Object} assignment Assignment.
   * @param {boolean} requireId Require ID.
   */
  validateEmployerAssignment: function(
    assignment,
    requireId
  ) {
    if (
      requireId === true &&
      !assignment.assignmentId
    ) {
      throw new Error(
        'Employer assignment ID is required.'
      );
    }

    if (!assignment.payrollGroupId) {
      throw new Error(
        'Payroll Group ID is required.'
      );
    }

    if (!assignment.employerKey) {
      throw new Error(
        'Employer key is required.'
      );
    }

    if (!assignment.employerDisplayName) {
      throw new Error(
        'Employer display name is required.'
      );
    }
  },

  /**
   * Finds a spreadsheet row by identifier.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
   * @param {number} idColumn One-based ID column.
   * @param {string} recordId Record ID.
   * @return {number|null} Row number or null.
   */
  findRowById: function(
    sheet,
    idColumn,
    recordId
  ) {
    const lastRow =
      sheet.getLastRow();

    if (lastRow <= 1) {
      return null;
    }

    const values =
      sheet
        .getRange(
          2,
          idColumn,
          lastRow - 1,
          1
        )
        .getDisplayValues();

    const normalizedId =
      PayTrackerPayrollGroupRepository
        .normalizeText(
          recordId
        );

    for (
      let index = 0;
      index !== values.length;
      index += 1
    ) {
      if (
        PayTrackerPayrollGroupRepository
          .normalizeText(
            values[index][0]
          ) === normalizedId
      ) {
        return index + 2;
      }
    }

    return null;
  },

  /**
   * Returns the active spreadsheet.
   *
   * @return {GoogleAppsScript.Spreadsheet.Spreadsheet}
   *   Spreadsheet.
   */
  getSpreadsheet: function() {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    if (!spreadsheet) {
      throw new Error(
        'Pay Tracker could not access the active spreadsheet.'
      );
    }

    return spreadsheet;
  },

  /**
   * Returns a required spreadsheet sheet.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}
   *   spreadsheet Spreadsheet.
   * @param {string} sheetName Sheet name.
   * @return {GoogleAppsScript.Spreadsheet.Sheet} Sheet.
   */
  getRequiredSheet: function(
    spreadsheet,
    sheetName
  ) {
    const sheet =
      spreadsheet.getSheetByName(
        sheetName
      );

    if (!sheet) {
      throw new Error(
        'Required Payroll Centre sheet "' +
        sheetName +
        '" was not found. Run ' +
        'setupPayTrackerPayrollCentre() first.'
      );
    }

    return sheet;
  },

  /**
   * Reads one-based sheet-column data from a row.
   *
   * @param {Array<*>} row Row.
   * @param {number} column One-based column.
   * @return {*} Value.
   */
  readColumn: function(
    row,
    column
  ) {
    return row[column - 1];
  },

  /**
   * Converts checkbox-like values to a boolean.
   *
   * @param {*} value Value.
   * @return {boolean} Boolean.
   */
  toBoolean: function(value) {
    if (value === true) {
      return true;
    }

    const normalized =
      PayTrackerPayrollGroupRepository
        .normalizeText(
          value
        );

    return (
      normalized === 'true' ||
      normalized === 'yes' ||
      normalized === '1' ||
      normalized === 'active'
    );
  },

  /**
   * Creates a stable Payroll Group ID.
   *
   * @return {string} Payroll Group ID.
   */
  createPayrollGroupId: function() {
    return (
      'PAYROLL-GROUP-' +
      Utilities
        .getUuid()
        .replace(
          /-/g,
          ''
        )
        .substring(
          0,
          12
        )
        .toUpperCase()
    );
  },

  /**
   * Creates a stable assignment ID.
   *
   * @return {string} Assignment ID.
   */
  createAssignmentId: function() {
    return (
      'PAYROLL-ASSIGNMENT-' +
      Utilities
        .getUuid()
        .replace(
          /-/g,
          ''
        )
        .substring(
          0,
          12
        )
        .toUpperCase()
    );
  },

  /**
   * Cleans display text.
   *
   * @param {*} value Value.
   * @return {string} Clean text.
   */
  cleanText: function(value) {
    return String(
      value === null ||
      value === undefined
        ? ''
        : value
    ).trim();
  },

  /**
   * Normalizes comparison text.
   *
   * @param {*} value Value.
   * @return {string} Normalized text.
   */
  normalizeText: function(value) {
    return PayTrackerPayrollGroupRepository
      .cleanText(value)
      .toLowerCase();
  },

  /**
   * Normalizes stable keys.
   *
   * @param {*} value Value.
   * @return {string} Normalized key.
   */
  normalizeKey: function(value) {
    return PayTrackerPayrollGroupRepository
      .normalizeText(value)
      .replace(
        /[^a-z0-9]+/g,
        '-'
      )
      .replace(
        /^-+|-+$/g,
        ''
      );
  }
});

/**
 * Manual repository test.
 *
 * This performs read-only checks and does not change data.
 *
 * @return {Object} Repository test result.
 */
function testPayTrackerPayrollGroupRepository() {
  const groups =
    PayTrackerPayrollGroupRepository
      .getAll(true);

  const combinedGroup =
    PayTrackerPayrollGroupRepository
      .getById(
        'PAYROLL-GROUP-COMBINED-001',
        true
      );

  const result = {
    success:
      Boolean(combinedGroup),

    groupCount:
      groups.length,

    combinedGroup:
      combinedGroup,

    timestamp:
      new Date()
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