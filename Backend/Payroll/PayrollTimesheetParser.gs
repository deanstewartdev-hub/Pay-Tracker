/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Payroll/PayrollTimesheetParser.gs
 *
 * Purpose:
 * - Extract individual timesheet rows from payslip text
 * - Preserve dates, references, descriptions and amounts
 * - Detect basic and enhanced pay lines
 * - Prepare entries for later job-type classification
 *
 * This service does not update Sheets.
 *******************************************************/

const PayTrackerPayrollTimesheetParser = Object.freeze({
  VERSION: '2.8.0',

  PARSER_TYPES: Object.freeze({
    STAFFLINE: 'STAFFLINE',
    GENERIC: 'GENERIC'
  }),

  /**
   * Parses timesheet rows from payslip text.
   *
   * @param {string} rawText Extracted PDF text.
   * @return {Object} Timesheet parse result.
   */
  parse: function(rawText) {
    const normalized =
      PayTrackerPayrollTimesheetParser
        .normalizeText_(rawText);

    if (!normalized.compactText) {
      return {
        success: false,
        parserType:
          PayTrackerPayrollTimesheetParser
            .PARSER_TYPES
            .GENERIC,

        entries: [],
        totals: {},

        error:
          'No readable payslip text was supplied.',

        warnings: []
      };
    }

    const parserType =
      PayTrackerPayrollTimesheetParser
        .detectParserType_(
          normalized
        );

    let result;

    if (
      parserType ===
      PayTrackerPayrollTimesheetParser
        .PARSER_TYPES
        .STAFFLINE
    ) {
      result =
        PayTrackerPayrollTimesheetParser
          .parseStaffline_(
            normalized
          );
    } else {
      result =
        PayTrackerPayrollTimesheetParser
          .parseGeneric_(
            normalized
          );
    }

    result.success = true;
    result.parserType =
      parserType;

    result.entryCount =
      result.entries.length;

    result.totals =
      PayTrackerPayrollTimesheetParser
        .calculateTotals_(
          result.entries
        );

    result.parsedAt =
      new Date().toISOString();

    return result;
  },

  /**
   * Parses the Staffline timesheet table.
   *
   * Expected structure:
   *
   * Week Ending
   * Timesheet
   * Description
   * Units
   * Rate
   * Amount
   *
   * @param {Object} normalized Normalized text.
   * @return {Object} Result.
   * @private
   */
  parseStaffline_: function(
    normalized
  ) {
    const section =
      PayTrackerPayrollTimesheetParser
        .extractStafflineTimesheetSection_(
          normalized.compactText
        );

    if (!section) {
      return {
        entries: [],
        warnings: [
          'The Staffline timesheet section could not be located.'
        ]
      };
    }

    const entries =
      PayTrackerPayrollTimesheetParser
        .extractStafflineRows_(
          section
        );

    const warnings = [];

    if (!entries.length) {
      warnings.push(
        'No individual timesheet rows could be extracted.'
      );
    }

    const invalidEntries =
      entries.filter(function(entry) {
        return (
          !entry.workDate ||
          !entry.reference ||
          entry.hours === null ||
          entry.rate === null ||
          entry.amount === null
        );
      });

    if (invalidEntries.length) {
      warnings.push(
        invalidEntries.length +
        ' timesheet entries are incomplete.'
      );
    }

    return {
      entries: entries,
      warnings: warnings,
      sourceSection: section
    };
  },

  /**
   * Generic fallback parser.
   *
   * @param {Object} normalized Normalized text.
   * @return {Object} Result.
   * @private
   */
  parseGeneric_: function(
    normalized
  ) {
    const entries =
      PayTrackerPayrollTimesheetParser
        .extractGenericRows_(
          normalized.compactText
        );

    return {
      entries: entries,

      warnings: [
        'A provider-specific timesheet parser was not detected. Generic row matching was used.'
      ],

      sourceSection:
        normalized.compactText
    };
  },

  /**
   * Extracts the Staffline timesheet area.
   *
   * Stops before accrued-hours or total-pay sections.
   *
   * @param {string} text Compact text.
   * @return {string} Timesheet section.
   * @private
   */
  extractStafflineTimesheetSection_: function(
    text
  ) {
    const compactText =
      String(text || '');

    /*
     * Real Staffline payslips abbreviate the header to "Wk Ending"
     * (not "Week Ending"), so the header match must not require the
     * full word. The section ends at "TOTAL PAY" or "TOTAL
     * PAYMENTS" -- both real template variants use one of these
     * immediately after the last payment row, unlike "hrs accrued"
     * / "pay to date", which do not reliably appear there.
     */
    const headerMatch =
      compactText.match(
        /wk\s+ending\s+timesheet\s+description\s+units\s+rate\s+amount/i
      );

    if (!headerMatch) {
      return '';
    }

    const afterHeader =
      compactText.slice(
        headerMatch.index +
        headerMatch[0].length
      );

    const endMatch =
      afterHeader.match(
        /total\s+pay(?:ments)?\b/i
      );

    const section =
      endMatch
        ? afterHeader.slice(0, endMatch.index)
        : afterHeader;

    return section
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * Extracts Staffline rows.
   *
   * Example row:
   * 19/07/2026 N607579 Enhanced 1.33 16.00 17.92 286.72
   *
   * @param {string} section Timesheet section.
   * @return {Array<Object>} Entries.
   * @private
   */
  extractStafflineRows_: function(section) {
    const text =
      String(section || '');

    /*
     * Real Staffline payslips come in two templates. One
     * interleaves each payment row's own deduction-column text
     * onto the same line (e.g. "...136.90 Tax 157.60..."); the
     * other leaves a description that legitimately embeds its own
     * decimal number (e.g. "Enhanced 1.33" is the full description,
     * immediately followed by the real Units/Rate/Amount columns
     * "4.00 17.92 71.68"). A single row-wide regex with a trailing
     * lookahead for "next date or end of string" cannot resolve
     * either case reliably -- confirmed against real payslip text,
     * where it silently dropped or corrupted rows.
     *
     * Instead: find every row's start (date + reference) first,
     * slice the text between consecutive starts (so each slice
     * holds exactly one row, plus any trailing junk after its real
     * amount), then greedily match "description + 3 trailing
     * decimal numbers" from the start of that slice with no end
     * anchor. Greedy backtracking naturally prefers the rightmost
     * valid 3-number window, which is always the true data columns
     * -- trailing deduction text after them is simply left
     * unconsumed, and a description-embedded number never has two
     * more genuine columns following it the way the real columns
     * do.
     */
    const startPattern =
      /(\d{1,2}\/\d{1,2}\/\d{4})\s+([A-Z0-9]{3,15})\s+/gi;

    const starts = [];

    let startMatch;

    while (
      (
        startMatch =
          startPattern.exec(text)
      ) !== null
    ) {
      starts.push({
        index: startMatch.index,
        date: startMatch[1],
        reference: startMatch[2],
        afterIndex: startPattern.lastIndex
      });
    }

    const fieldPattern =
      /^([\s\S]*)\s+([0-9]+(?:\.\d{1,2})?)\s+([0-9]+\.\d{2})\s+([0-9,]+\.\d{2})/;

    const entries = [];

    starts.forEach(function(start, index) {
      const sliceEnd =
        index + 1 < starts.length
          ? starts[index + 1].index
          : text.length;

      const body =
        text
          .slice(
            start.afterIndex,
            sliceEnd
          )
          .trim();

      const fieldMatch =
        body.match(
          fieldPattern
        );

      const description =
        PayTrackerPayrollTimesheetParser
          .cleanDescription_(
            fieldMatch
              ? fieldMatch[1]
              : body
          );

      const hours =
        fieldMatch
          ? PayTrackerPayrollTimesheetParser
              .toNullableNumber_(
                fieldMatch[2]
              )
          : null;

      const rate =
        fieldMatch
          ? PayTrackerPayrollTimesheetParser
              .toNullableMoney_(
                fieldMatch[3]
              )
          : null;

      const amount =
        fieldMatch
          ? PayTrackerPayrollTimesheetParser
              .toNullableMoney_(
                fieldMatch[4]
              )
          : null;

      entries.push({
        sequence:
          entries.length + 1,

        workDate:
          PayTrackerPayrollTimesheetParser
            .normaliseDate_(
              start.date
            ),

        workDateDisplay:
          start.date,

        reference:
          String(
            start.reference || ''
          ).trim(),

        description:
          description,

        hours: hours,
        rate: rate,
        amount: amount,

        enhancement:
          PayTrackerPayrollTimesheetParser
            .extractEnhancement_(
              description
            ),

        payCategory:
          PayTrackerPayrollTimesheetParser
            .classifyPayCategory_(
              description
            ),

        inferredDayType:
          PayTrackerPayrollTimesheetParser
            .inferDayType_(
              description
            ),

        jobType: null,
        employerKey: null,
        location: null,

        classificationStatus:
          'UNCLASSIFIED',

        validation:
          PayTrackerPayrollTimesheetParser
            .validateEntry_({
              hours: hours,
              rate: rate,
              amount: amount
            })
      });
    });

    return entries;
  },

  /**
   * Generic row extraction fallback.
   *
   * @param {string} text Compact payslip text.
   * @return {Array<Object>} Entries.
   * @private
   */
  extractGenericRows_: function(text) {
    const compactText =
      String(text || '');

    const rowPattern =
      /(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})\s+([A-Z0-9/-]{3,30})\s+([\s\S]*?)\s+([0-9]+(?:\.\d{1,2})?)\s+([0-9]+(?:\.\d{2}))\s+([0-9,]+(?:\.\d{2}))/gi;

    const entries = [];

    let match;

    while (
      (
        match =
          rowPattern.exec(
            compactText
          )
      ) !== null
    ) {
      const description =
        PayTrackerPayrollTimesheetParser
          .cleanDescription_(
            match[3]
          );

      entries.push({
        sequence:
          entries.length + 1,

        workDate:
          PayTrackerPayrollTimesheetParser
            .normaliseDate_(
              match[1]
            ),

        workDateDisplay:
          match[1],

        reference:
          String(
            match[2] || ''
          ).trim(),

        description:
          description,

        hours:
          PayTrackerPayrollTimesheetParser
            .toNullableNumber_(
              match[4]
            ),

        rate:
          PayTrackerPayrollTimesheetParser
            .toNullableMoney_(
              match[5]
            ),

        amount:
          PayTrackerPayrollTimesheetParser
            .toNullableMoney_(
              match[6]
            ),

        enhancement:
          PayTrackerPayrollTimesheetParser
            .extractEnhancement_(
              description
            ),

        payCategory:
          PayTrackerPayrollTimesheetParser
            .classifyPayCategory_(
              description
            ),

        inferredDayType:
          PayTrackerPayrollTimesheetParser
            .inferDayType_(
              description
            ),

        jobType: null,
        employerKey: null,
        location: null,

        classificationStatus:
          'UNCLASSIFIED'
      });

      if (
        match.index ===
        rowPattern.lastIndex
      ) {
        rowPattern.lastIndex += 1;
      }
    }

    return entries;
  },

  /**
   * Calculates extracted timesheet totals.
   *
   * @param {Array<Object>} entries Entries.
   * @return {Object} Totals.
   * @private
   */
  calculateTotals_: function(entries) {
    const records =
      Array.isArray(entries)
        ? entries
        : [];

    const totals = {
      entryCount:
        records.length,

      hours: 0,
      amount: 0,

      basicHours: 0,
      enhancedHours: 0,
      overtimeHours: 0,
      unsocialHours: 0,
      holidayHours: 0,

      byReference: {},
      byCategory: {}
    };

    records.forEach(function(entry) {
      const hours =
        Number(
          entry.hours || 0
        );

      const amount =
        Number(
          entry.amount || 0
        );

      totals.hours += hours;
      totals.amount += amount;

      switch (entry.payCategory) {
        case 'BASIC':
          totals.basicHours += hours;
          break;

        case 'ENHANCED':
          totals.enhancedHours += hours;
          break;

        case 'OVERTIME':
          totals.overtimeHours += hours;
          break;

        case 'UNSOCIAL':
          totals.unsocialHours += hours;
          break;

        case 'HOLIDAY':
          totals.holidayHours += hours;
          break;
      }

      const reference =
        entry.reference ||
        'UNKNOWN';

      if (!totals.byReference[reference]) {
        totals.byReference[reference] = {
          entries: 0,
          hours: 0,
          amount: 0
        };
      }

      totals.byReference[reference]
        .entries += 1;

      totals.byReference[reference]
        .hours += hours;

      totals.byReference[reference]
        .amount += amount;

      const category =
        entry.payCategory ||
        'OTHER';

      if (!totals.byCategory[category]) {
        totals.byCategory[category] = {
          entries: 0,
          hours: 0,
          amount: 0
        };
      }

      totals.byCategory[category]
        .entries += 1;

      totals.byCategory[category]
        .hours += hours;

      totals.byCategory[category]
        .amount += amount;
    });

    totals.hours =
      PayTrackerPayrollTimesheetParser
        .roundNumber_(
          totals.hours
        );

    totals.amount =
      PayTrackerPayrollTimesheetParser
        .roundMoney_(
          totals.amount
        );

    totals.basicHours =
      PayTrackerPayrollTimesheetParser
        .roundNumber_(
          totals.basicHours
        );

    totals.enhancedHours =
      PayTrackerPayrollTimesheetParser
        .roundNumber_(
          totals.enhancedHours
        );

    totals.overtimeHours =
      PayTrackerPayrollTimesheetParser
        .roundNumber_(
          totals.overtimeHours
        );

    totals.unsocialHours =
      PayTrackerPayrollTimesheetParser
        .roundNumber_(
          totals.unsocialHours
        );

    totals.holidayHours =
      PayTrackerPayrollTimesheetParser
        .roundNumber_(
          totals.holidayHours
        );

    Object.keys(
      totals.byReference
    ).forEach(function(reference) {
      totals.byReference[reference].hours =
        PayTrackerPayrollTimesheetParser
          .roundNumber_(
            totals.byReference[reference]
              .hours
          );

      totals.byReference[reference].amount =
        PayTrackerPayrollTimesheetParser
          .roundMoney_(
            totals.byReference[reference]
              .amount
          );
    });

    Object.keys(
      totals.byCategory
    ).forEach(function(category) {
      totals.byCategory[category].hours =
        PayTrackerPayrollTimesheetParser
          .roundNumber_(
            totals.byCategory[category]
              .hours
          );

      totals.byCategory[category].amount =
        PayTrackerPayrollTimesheetParser
          .roundMoney_(
            totals.byCategory[category]
              .amount
          );
    });

    return totals;
  },

  /**
   * Validates amount against hours multiplied by rate.
   *
   * @param {Object} entry Entry.
   * @return {Object} Validation.
   * @private
   */
  validateEntry_: function(entry) {
    if (
      entry.hours === null ||
      entry.rate === null ||
      entry.amount === null
    ) {
      return {
        status: 'INCOMPLETE',
        expectedAmount: null,
        difference: null
      };
    }

    const expectedAmount =
      PayTrackerPayrollTimesheetParser
        .roundMoney_(
          entry.hours *
          entry.rate
        );

    const difference =
      PayTrackerPayrollTimesheetParser
        .roundMoney_(
          entry.amount -
          expectedAmount
        );

    return {
      status:
        Math.abs(difference) <= 0.02
          ? 'MATCHED'
          : 'REVIEW',

      expectedAmount:
        expectedAmount,

      difference:
        difference
    };
  },

  /**
   * Extracts enhancement multiplier.
   *
   * @param {string} description Description.
   * @return {number|null} Enhancement.
   * @private
   */
  extractEnhancement_: function(
    description
  ) {
    const match =
      String(
        description || ''
      ).match(
        /\b(?:enhanced|enhancement|rate)\s*([0-9]+(?:\.[0-9]+)?)/i
      );

    if (
      !match ||
      !match[1]
    ) {
      return null;
    }

    return PayTrackerPayrollTimesheetParser
      .toNullableNumber_(
        match[1]
      );
  },

  /**
   * Classifies the pay category.
   *
   * @param {string} description Description.
   * @return {string} Category.
   * @private
   */
  classifyPayCategory_: function(
    description
  ) {
    const value =
      String(
        description || ''
      ).toLowerCase();

    if (
      value.indexOf('overtime') !== -1 ||
      /\bot\b/.test(value)
    ) {
      return 'OVERTIME';
    }

    if (
      value.indexOf('holiday') !== -1 ||
      value.indexOf('pub hol') !== -1 ||
      value.indexOf('bank hol') !== -1
    ) {
      return 'HOLIDAY';
    }

    if (
      value.indexOf('unsoc') !== -1 ||
      value.indexOf('night') !== -1
    ) {
      return 'UNSOCIAL';
    }

    if (
      value.indexOf('enhanced') !== -1 ||
      value.indexOf('enhancement') !== -1
    ) {
      return 'ENHANCED';
    }

    if (
      value.indexOf('basic') !== -1
    ) {
      return 'BASIC';
    }

    return 'OTHER';
  },

  /**
   * Detects day type from the description.
   *
   * @param {string} description Description.
   * @return {string|null} Day type.
   * @private
   */
  inferDayType_: function(
    description
  ) {
    const value =
      String(
        description || ''
      ).toLowerCase();

    if (
      value.indexOf('sunday') !== -1
    ) {
      return 'SUNDAY';
    }

    if (
      value.indexOf('saturday') !== -1 ||
      value.indexOf(' sat ') !== -1
    ) {
      return 'SATURDAY';
    }

    if (
      value.indexOf('holiday') !== -1 ||
      value.indexOf('pub hol') !== -1 ||
      value.indexOf('bank hol') !== -1
    ) {
      return 'PUBLIC_HOLIDAY';
    }

    if (
      value.indexOf('night') !== -1 ||
      value.indexOf('unsoc') !== -1
    ) {
      return 'NIGHT';
    }

    return null;
  },

  /**
   * Detects Staffline payslip format.
   *
   * @param {Object} normalized Normalized text.
   * @return {string} Parser type.
   * @private
   */
  detectParserType_: function(
    normalized
  ) {
    const text =
      normalized.searchText;

    const signals = [
      'pay advice',
      'please contact your consultant',
      'clock no.',
      'week ending timesheet',
      'please remember to send your timesheet'
    ];

    const matched =
      signals.filter(function(signal) {
        return (
          text.indexOf(signal) !== -1
        );
      });

    return matched.length
      ? PayTrackerPayrollTimesheetParser
          .PARSER_TYPES
          .STAFFLINE
      : PayTrackerPayrollTimesheetParser
          .PARSER_TYPES
          .GENERIC;
  },

  /**
   * Normalizes text.
   *
   * @param {*} rawText Raw text.
   * @return {Object} Normalized text.
   * @private
   */
  normalizeText_: function(rawText) {
    let text =
      String(
        rawText === undefined ||
        rawText === null
          ? ''
          : rawText
      );

    text =
      text
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    const lines =
      text
        .split('\n')
        .map(function(line) {
          return line.trim();
        })
        .filter(function(line) {
          return Boolean(line);
        });

    const compactText =
      lines
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

    return {
      text:
        lines.join('\n'),

      compactText:
        compactText,

      searchText:
        compactText.toLowerCase()
    };
  },

  /**
   * Cleans row descriptions.
   *
   * @param {*} value Description.
   * @return {string} Clean description.
   * @private
   */
  cleanDescription_: function(value) {
    return String(
      value || ''
    )
      .replace(/\s+/g, ' ')
      .replace(/^[\s,;:-]+/, '')
      .replace(/[\s,;:-]+$/, '')
      .trim();
  },

  /**
   * Converts UK date to ISO date.
   *
   * @param {string} value Date.
   * @return {string} ISO date.
   * @private
   */
  normaliseDate_: function(value) {
    const parts =
      String(
        value || ''
      )
        .replace(/[.-]/g, '/')
        .split('/');

    if (parts.length !== 3) {
      return '';
    }

    const day =
      Number(parts[0]);

    const month =
      Number(parts[1]);

    const year =
      Number(parts[2]);

    if (
      !day ||
      !month ||
      !year
    ) {
      return '';
    }

    const date =
      new Date(
        year,
        month - 1,
        day
      );

    if (
      date.getFullYear() !== year ||
      date.getMonth() !==
        month - 1 ||
      date.getDate() !== day
    ) {
      return '';
    }

    return [
      String(year),
      String(month).padStart(2, '0'),
      String(day).padStart(2, '0')
    ].join('-');
  },

  /**
   * Converts to nullable number.
   *
   * @param {*} value Value.
   * @return {number|null} Number.
   * @private
   */
  toNullableNumber_: function(value) {
    const number =
      Number(
        String(
          value === undefined ||
          value === null
            ? ''
            : value
        )
          .replace(/,/g, '')
          .trim()
      );

    return Number.isFinite(number)
      ? number
      : null;
  },

  /**
   * Converts to nullable money.
   *
   * @param {*} value Value.
   * @return {number|null} Money.
   * @private
   */
  toNullableMoney_: function(value) {
    const number =
      PayTrackerPayrollTimesheetParser
        .toNullableNumber_(
          String(
            value === undefined ||
            value === null
              ? ''
              : value
          )
            .replace(/£/g, '')
        );

    return number === null
      ? null
      : PayTrackerPayrollTimesheetParser
          .roundMoney_(number);
  },

  /**
   * Rounds hours or other decimal values.
   *
   * @param {*} value Value.
   * @return {number} Rounded value.
   * @private
   */
  roundNumber_: function(value) {
    return Math.round(
      Number(value || 0) *
      10000
    ) / 10000;
  },

  /**
   * Rounds money.
   *
   * @param {*} value Value.
   * @return {number} Rounded value.
   * @private
   */
  roundMoney_: function(value) {
    return Math.round(
      Number(value || 0) *
      100
    ) / 100;
  }
});


/**
 * Tests timesheet extraction against one stored payslip PDF.
 */
function testPayTrackerPayrollTimesheetParser() {
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
    console.log(
      JSON.stringify(
        extraction,
        null,
        2
      )
    );

    return extraction;
  }

  const result =
    PayTrackerPayrollTimesheetParser
      .parse(
        extraction.text
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