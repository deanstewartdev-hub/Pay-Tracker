/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Payroll/PayrollTimesheetMappingService.gs
 *
 * Purpose:
 * - Create the Payroll Timesheet Mappings sheet
 * - Store reference-to-job mappings
 * - Classify parsed timesheet entries
 * - Preserve unknown references for later review
 *
 * This keeps job classification out of the parser.
 *******************************************************/

const PayTrackerPayrollTimesheetMappingService =
  Object.freeze({
    VERSION: '2.8.0',

    SHEET_NAME:
      'Payroll Timesheet Mappings',

    HEADERS: Object.freeze([
      'Reference',
      'Employer Key',
      'Employer Name',
      'Job Type',
      'Location',
      'Shift Type',
      'Active',
      'Notes',
      'Created At',
      'Updated At'
    ]),

    /**
     * Creates or repairs the mapping sheet.
     *
     * @return {Object} Setup result.
     */
    setup: function() {
      const spreadsheet =
        SpreadsheetApp
          .getActiveSpreadsheet();

      if (!spreadsheet) {
        throw new Error(
          'No active spreadsheet is available.'
        );
      }

      let sheet =
        spreadsheet.getSheetByName(
          PayTrackerPayrollTimesheetMappingService
            .SHEET_NAME
        );

      const created =
        !sheet;

      if (!sheet) {
        sheet =
          spreadsheet.insertSheet(
            PayTrackerPayrollTimesheetMappingService
              .SHEET_NAME
          );
      }

      PayTrackerPayrollTimesheetMappingService
        .ensureHeaders_(sheet);

      const seededReferences =
        PayTrackerPayrollTimesheetMappingService
          .seedKnownReferences_(sheet);

      PayTrackerPayrollTimesheetMappingService
        .formatSheet_(sheet);

      return {
        success: true,

        sheetName:
          PayTrackerPayrollTimesheetMappingService
            .SHEET_NAME,

        created:
          created,

        seededReferences:
          seededReferences,

        totalMappings:
          PayTrackerPayrollTimesheetMappingService
            .getAllMappings()
            .length
      };
    },

    /**
     * Returns all mappings.
     *
     * @param {Object=} options Query options.
     * @return {Array<Object>} Mappings.
     */
    getAllMappings: function(options) {
      const config =
        Object.assign(
          {
            activeOnly: false
          },
          options || {}
        );

      const sheet =
        PayTrackerPayrollTimesheetMappingService
          .getSheet_();

      if (
        sheet.getLastRow() <= 1
      ) {
        return [];
      }

      const values =
        sheet
          .getRange(
            2,
            1,
            sheet.getLastRow() - 1,
            PayTrackerPayrollTimesheetMappingService
              .HEADERS
              .length
          )
          .getValues();

      return values
        .map(function(row) {
          return PayTrackerPayrollTimesheetMappingService
            .rowToMapping_(row);
        })
        .filter(function(mapping) {
          if (!mapping.reference) {
            return false;
          }

          if (
            config.activeOnly &&
            mapping.active !== true
          ) {
            return false;
          }

          return true;
        });
    },

    /**
     * Gets one mapping by reference.
     *
     * @param {string} reference Timesheet reference.
     * @return {Object|null} Mapping.
     */
    getMappingByReference: function(
      reference
    ) {
      const normalizedReference =
        PayTrackerPayrollTimesheetMappingService
          .normalizeReference_(
            reference
          );

      if (!normalizedReference) {
        return null;
      }

      const mappings =
        PayTrackerPayrollTimesheetMappingService
          .getAllMappings();

      return mappings.find(
        function(mapping) {
          return (
            mapping.reference ===
            normalizedReference
          );
        }
      ) || null;
    },

    /**
     * Creates or updates one reference mapping.
     *
     * @param {Object} mapping Mapping data.
     * @return {Object} Saved mapping.
     */
    saveMapping: function(mapping) {
      const input =
        mapping || {};

      const reference =
        PayTrackerPayrollTimesheetMappingService
          .normalizeReference_(
            input.reference
          );

      if (!reference) {
        throw new Error(
          'Timesheet reference is required.'
        );
      }

      const sheet =
        PayTrackerPayrollTimesheetMappingService
          .getSheet_();

      const existingRow =
        PayTrackerPayrollTimesheetMappingService
          .findRowByReference_(
            sheet,
            reference
          );

      const now =
        new Date();

      let createdAt =
        now;

      if (existingRow) {
        createdAt =
          sheet
            .getRange(
              existingRow,
              9
            )
            .getValue() ||
          now;
      }

      const row = [
        reference,

        PayTrackerPayrollTimesheetMappingService
          .normalizeString_(
            input.employerKey
          ),

        PayTrackerPayrollTimesheetMappingService
          .normalizeString_(
            input.employerName
          ),

        PayTrackerPayrollTimesheetMappingService
          .normalizeString_(
            input.jobType
          ),

        PayTrackerPayrollTimesheetMappingService
          .normalizeString_(
            input.location
          ),

        PayTrackerPayrollTimesheetMappingService
          .normalizeString_(
            input.shiftType
          ),

        input.active === false
          ? false
          : true,

        PayTrackerPayrollTimesheetMappingService
          .normalizeString_(
            input.notes
          ),

        createdAt,
        now
      ];

      if (existingRow) {
        sheet
          .getRange(
            existingRow,
            1,
            1,
            row.length
          )
          .setValues([row]);
      } else {
        sheet.appendRow(row);
      }

      return PayTrackerPayrollTimesheetMappingService
        .rowToMapping_(row);
    },

    /**
     * Ensures a reference exists as an unclassified mapping.
     *
     * @param {string} reference Timesheet reference.
     * @return {Object|null} Mapping.
     */
    ensureReferenceExists: function(
      reference
    ) {
      const normalizedReference =
        PayTrackerPayrollTimesheetMappingService
          .normalizeReference_(
            reference
          );

      if (!normalizedReference) {
        return null;
      }

      const existing =
        PayTrackerPayrollTimesheetMappingService
          .getMappingByReference(
            normalizedReference
          );

      if (existing) {
        return existing;
      }

      return PayTrackerPayrollTimesheetMappingService
        .saveMapping({
          reference:
            normalizedReference,

          employerKey: '',
          employerName: '',
          jobType: '',
          location: '',
          shiftType: '',

          active: true,

          notes:
            'Automatically discovered from an imported payslip. Classification required.'
        });
    },

    /**
     * Classifies one timesheet entry.
     *
     * @param {Object} entry Parsed timesheet entry.
     * @return {Object} Enriched entry.
     */
    classifyEntry: function(entry) {
      const source =
        Object.assign(
          {},
          entry || {}
        );

      const reference =
        PayTrackerPayrollTimesheetMappingService
          .normalizeReference_(
            source.reference
          );

      if (!reference) {
        source.classificationStatus =
          'MISSING_REFERENCE';

        return source;
      }

      const mapping =
        PayTrackerPayrollTimesheetMappingService
          .ensureReferenceExists(
            reference
          );

      if (
        !mapping ||
        mapping.active !== true
      ) {
        source.classificationStatus =
          'UNCLASSIFIED';

        return source;
      }

      source.reference =
        reference;

      source.employerKey =
        mapping.employerKey || null;

      source.employerName =
        mapping.employerName || null;

      source.jobType =
        mapping.jobType || null;

      source.location =
        mapping.location || null;

      source.shiftType =
        mapping.shiftType || null;

      source.classificationStatus =
        (
          mapping.jobType ||
          mapping.location ||
          mapping.employerKey
        )
          ? 'CLASSIFIED'
          : 'UNCLASSIFIED';

      source.mappingNotes =
        mapping.notes || '';

      return source;
    },

    /**
     * Classifies a list of timesheet entries.
     *
     * @param {Array<Object>} entries Parsed entries.
     * @return {Object} Classification result.
     */
    classifyEntries: function(entries) {
      const records =
        Array.isArray(entries)
          ? entries
          : [];

      const classifiedEntries =
        records.map(function(entry) {
          return PayTrackerPayrollTimesheetMappingService
            .classifyEntry(entry);
        });

      const classifiedCount =
        classifiedEntries.filter(
          function(entry) {
            return (
              entry.classificationStatus ===
              'CLASSIFIED'
            );
          }
        ).length;

      const unclassifiedReferences =
        Array.from(
          new Set(
            classifiedEntries
              .filter(function(entry) {
                return (
                  entry.classificationStatus !==
                  'CLASSIFIED'
                );
              })
              .map(function(entry) {
                return entry.reference;
              })
              .filter(Boolean)
          )
        );

      return {
        success: true,

        entries:
          classifiedEntries,

        totalEntries:
          classifiedEntries.length,

        classifiedCount:
          classifiedCount,

        unclassifiedCount:
          classifiedEntries.length -
          classifiedCount,

        unclassifiedReferences:
          unclassifiedReferences
      };
    },

    /**
     * Adds known discovered references as unclassified rows.
     *
     * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
     * @return {Array<string>} Seeded references.
     * @private
     */
    seedKnownReferences_: function(sheet) {
      const references = [
        'N607579',
        'N607606'
      ];

      const seeded = [];

      references.forEach(function(reference) {
        const existingRow =
          PayTrackerPayrollTimesheetMappingService
            .findRowByReference_(
              sheet,
              reference
            );

        if (existingRow) {
          return;
        }

        const now =
          new Date();

        sheet.appendRow([
          reference,
          '',
          '',
          '',
          '',
          '',
          true,
          'Discovered from Staffline payslip. Job and location must be confirmed.',
          now,
          now
        ]);

        seeded.push(reference);
      });

      return seeded;
    },

    /**
     * Ensures exact sheet headers.
     *
     * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
     * @private
     */
    ensureHeaders_: function(sheet) {
      const headers =
        PayTrackerPayrollTimesheetMappingService
          .HEADERS;

      const currentHeaders =
        sheet
          .getRange(
            1,
            1,
            1,
            headers.length
          )
          .getValues()[0];

      const headersMatch =
        headers.every(
          function(header, index) {
            return (
              String(
                currentHeaders[index] || ''
              ).trim() === header
            );
          }
        );

      if (!headersMatch) {
        sheet
          .getRange(
            1,
            1,
            1,
            headers.length
          )
          .setValues([
            headers.slice()
          ]);
      }

      sheet.setFrozenRows(1);
    },

    /**
     * Applies basic sheet formatting.
     *
     * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
     * @private
     */
    formatSheet_: function(sheet) {
      const headerRange =
        sheet.getRange(
          1,
          1,
          1,
          PayTrackerPayrollTimesheetMappingService
            .HEADERS
            .length
        );

      headerRange
        .setFontWeight('bold')
        .setBackground('#1e3a5f')
        .setFontColor('#ffffff');

      sheet.autoResizeColumns(
        1,
        PayTrackerPayrollTimesheetMappingService
          .HEADERS
          .length
      );

      sheet.setColumnWidth(
        8,
        360
      );

      if (
        sheet.getLastRow() > 1
      ) {
        sheet
          .getRange(
            2,
            7,
            sheet.getLastRow() - 1,
            1
          )
          .insertCheckboxes();
      }
    },

    /**
     * Returns the mapping sheet.
     *
     * @return {GoogleAppsScript.Spreadsheet.Sheet} Sheet.
     * @private
     */
    getSheet_: function() {
      const spreadsheet =
        SpreadsheetApp
          .getActiveSpreadsheet();

      if (!spreadsheet) {
        throw new Error(
          'No active spreadsheet is available.'
        );
      }

      const sheet =
        spreadsheet.getSheetByName(
          PayTrackerPayrollTimesheetMappingService
            .SHEET_NAME
        );

      if (!sheet) {
        PayTrackerPayrollTimesheetMappingService
          .setup();

        return spreadsheet.getSheetByName(
          PayTrackerPayrollTimesheetMappingService
            .SHEET_NAME
        );
      }

      return sheet;
    },

    /**
     * Finds row number by reference.
     *
     * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
     * @param {string} reference Reference.
     * @return {number|null} Row number.
     * @private
     */
    findRowByReference_: function(
      sheet,
      reference
    ) {
      if (
        sheet.getLastRow() <= 1
      ) {
        return null;
      }

      const references =
        sheet
          .getRange(
            2,
            1,
            sheet.getLastRow() - 1,
            1
          )
          .getValues();

      for (
        let index = 0;
        index < references.length;
        index += 1
      ) {
        if (
          PayTrackerPayrollTimesheetMappingService
            .normalizeReference_(
              references[index][0]
            ) === reference
        ) {
          return index + 2;
        }
      }

      return null;
    },

    /**
     * Converts one row to a mapping object.
     *
     * @param {Array<*>} row Sheet row.
     * @return {Object} Mapping.
     * @private
     */
    rowToMapping_: function(row) {
      return {
        reference:
          PayTrackerPayrollTimesheetMappingService
            .normalizeReference_(
              row[0]
            ),

        employerKey:
          PayTrackerPayrollTimesheetMappingService
            .normalizeString_(
              row[1]
            ),

        employerName:
          PayTrackerPayrollTimesheetMappingService
            .normalizeString_(
              row[2]
            ),

        jobType:
          PayTrackerPayrollTimesheetMappingService
            .normalizeString_(
              row[3]
            ),

        location:
          PayTrackerPayrollTimesheetMappingService
            .normalizeString_(
              row[4]
            ),

        shiftType:
          PayTrackerPayrollTimesheetMappingService
            .normalizeString_(
              row[5]
            ),

        active:
          row[6] === true ||
          String(row[6])
            .toLowerCase() ===
            'true',

        notes:
          PayTrackerPayrollTimesheetMappingService
            .normalizeString_(
              row[7]
            ),

        createdAt:
          PayTrackerPayrollTimesheetMappingService
            .serializeDate_(
              row[8]
            ),

        updatedAt:
          PayTrackerPayrollTimesheetMappingService
            .serializeDate_(
              row[9]
            )
      };
    },

    /**
     * Normalizes a timesheet reference.
     *
     * @param {*} value Reference.
     * @return {string} Normalized reference.
     * @private
     */
    normalizeReference_: function(value) {
      return String(
        value === undefined ||
        value === null
          ? ''
          : value
      )
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
    },

    /**
     * Normalizes text.
     *
     * @param {*} value Value.
     * @return {string} Text.
     * @private
     */
    normalizeString_: function(value) {
      return String(
        value === undefined ||
        value === null
          ? ''
          : value
      ).trim();
    },

    /**
     * Serializes a date.
     *
     * @param {*} value Date value.
     * @return {string} ISO value.
     * @private
     */
    serializeDate_: function(value) {
      if (!value) {
        return '';
      }

      const date =
        value instanceof Date
          ? value
          : new Date(value);

      return Number.isNaN(
        date.getTime()
      )
        ? ''
        : date.toISOString();
    }
  });


/**
 * Creates the Payroll Timesheet Mappings sheet.
 */
function setupPayTrackerPayrollTimesheetMappings() {
  const result =
    PayTrackerPayrollTimesheetMappingService
      .setup();

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/**
 * Tests classification against the same payslip used by
 * the timesheet parser test.
 */
function testPayTrackerPayrollTimesheetMapping() {
  const driveFileId =
    '1FOVJ2-lz4EbPjpTse3RYEHJ7260kNngk';

  const extraction =
    PayTrackerPayrollPdfTextService
      .extractTextFromPdf(
        driveFileId
      );

  if (
    !extraction ||
    extraction.success !== true
  ) {
    return extraction;
  }

  const parsed =
    PayTrackerPayrollTimesheetParser
      .parse(
        extraction.text
      );

  const classified =
    PayTrackerPayrollTimesheetMappingService
      .classifyEntries(
        parsed.entries
      );

  console.log(
    JSON.stringify(
      classified,
      null,
      2
    )
  );

  return classified;
}

/**
 * Saves the confirmed timesheet-reference mappings.
 *
 * Confirmed from the Staffline timesheet portal.
 */
function seedPayTrackerConfirmedTimesheetMappings() {
  const mappings = [
    {
      reference: 'N607606',
      employerKey: 'NHS',
      employerName:
        'Northern Health & Social Care Trust',
      jobType:
        'Car Parking Assistant',
      location:
        'Antrim',
      shiftType:
        'Mixed',
      active: true,
      notes:
        'Confirmed from Staffline timesheet portal. Non-Coleraine NHS car-parking placement.'
    },

    {
      reference: 'N607579',
      employerKey: 'COUNCIL',
      employerName:
        'Causeway Coast & Glens Borough Council',
      jobType:
        'Night Security',
      location:
        'Cushendun / Cushendall',
      shiftType:
        'Night',
      active: true,
      notes:
        'Confirmed from Staffline portal: Night Security C/Dun & C/Dall.'
    },

    {
      reference: 'N607572',
      employerKey: 'COUNCIL',
      employerName:
        'Causeway Coast & Glens Borough Council',
      jobType:
        'Relief Assistant Warden',
      location:
        'Cushendall / Cushendun',
      shiftType:
        'Day',
      active: true,
      notes:
        'Confirmed from Staffline portal: Relief Assistant Warden C/Dall C/Dun.'
    },

    {
      reference: 'N607322',
      employerKey: 'NHS',
      employerName:
        'Northern Health & Social Care Trust',
      jobType:
        'Car Parking Assistant',
      location:
        'Coleraine',
      shiftType:
        'Mixed',
      active: true,
      notes:
        'Confirmed from Staffline portal: Car Parking Assistant - Coleraine.'
    }
  ];

  const savedMappings =
    mappings.map(function(mapping) {
      return PayTrackerPayrollTimesheetMappingService
        .saveMapping(mapping);
    });

  const result = {
    success: true,
    savedCount:
      savedMappings.length,
    mappings:
      savedMappings
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