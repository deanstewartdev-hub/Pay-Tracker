/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Payroll/PayrollPayslipParser.gs
 *
 * Purpose:
 * - Normalize extracted payslip text
 * - Parse Staffline combined-payroll payslips
 * - Extract pay date, period, gross, net and deductions
 * - Return confidence and field-level warnings
 *
 * This service does not update Sheets yet.
 *******************************************************/

const PayTrackerPayrollPayslipParser = Object.freeze({
  VERSION: '2.8.0',

  PARSER_TYPES: Object.freeze({
    STAFFLINE: 'STAFFLINE',
    GENERIC: 'GENERIC'
  }),

  /**
   * Parses extracted payslip text.
   *
   * @param {string} rawText Extracted PDF text.
   * @return {Object} Parse result.
   */
  parse: function(rawText) {
    const normalized =
      PayTrackerPayrollPayslipParser
        .normalizeText(rawText);

    if (!normalized.text) {
      return {
        success: false,
        parserType:
          PayTrackerPayrollPayslipParser
            .PARSER_TYPES
            .GENERIC,
        error:
          'No readable payslip text was supplied.',
        warnings: [],
        fields: {}
      };
    }

    const parserType =
      PayTrackerPayrollPayslipParser
        .detectParserType_(
          normalized
        );

    let result;

    if (
      parserType ===
      PayTrackerPayrollPayslipParser
        .PARSER_TYPES
        .STAFFLINE
    ) {
      result =
        PayTrackerPayrollPayslipParser
          .parseStaffline_(
            normalized
          );
    } else {
      result =
        PayTrackerPayrollPayslipParser
          .parseGeneric_(
            normalized
          );
    }

    result.success = true;
    result.parserType =
      parserType;

    result.normalizedText =
      normalized.text;

    result.compactText =
      normalized.compactText;

    result.characterCount =
      normalized.text.length;

    result.parsedAt =
      new Date().toISOString();

    result.confidence =
      PayTrackerPayrollPayslipParser
        .calculateConfidence_(
          result.fields
        );

    result.missingFields =
      PayTrackerPayrollPayslipParser
        .getMissingImportantFields_(
          result.fields
        );

    if (
      result.missingFields.length
    ) {
      result.warnings.push(
        'Missing important fields: ' +
        result.missingFields.join(', ')
      );
    }

    return result;
  },

  /**
   * Normalizes OCR and Google Docs text.
   *
   * @param {*} rawText Raw text.
   * @return {Object} Normalized representations.
   */
  normalizeText: function(rawText) {
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

    const searchText =
      compactText
        .toLowerCase();

    return {
      text: lines.join('\n'),
      lines: lines,
      compactText: compactText,
      searchText: searchText
    };
  },

  /**
   * Detects the payslip provider/layout.
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

    const stafflineSignals = [
    'staffline',
    'nipayroll@stafflinerecruit.com',
    'pay advice',
    'ballymena psa',
    'please contact your consultant',
    'clock no.',
    'week ending timesheet',
    'please remember to send your timesheet'
    ];

    const matchingSignals =
      stafflineSignals.filter(
        function(signal) {
          return (
            text.indexOf(signal) !== -1
          );
        }
      );

    return matchingSignals.length >= 1
      ? PayTrackerPayrollPayslipParser
          .PARSER_TYPES
          .STAFFLINE
      : PayTrackerPayrollPayslipParser
          .PARSER_TYPES
          .GENERIC;
  },

  /**
   * Parses Staffline combined-payroll text.
   *
   * @param {Object} normalized Normalized text.
   * @return {Object} Result.
   * @private
   */
  parseStaffline_: function(
    normalized
  ) {
    const text =
      normalized.compactText;

    const fields = {
      provider: 'Staffline',
      employer:
        PayTrackerPayrollPayslipParser
          .extractEmployer_(text),

      employeeName:
        PayTrackerPayrollPayslipParser
          .extractEmployeeName_(text),

      payrollNumber:
        PayTrackerPayrollPayslipParser
            .extractFirstText_(
            text,
            [
                /\bclock\s*(?:no|number)\.?\s*[:#-]?\s*([a-z0-9/-]+)/i,
                /\bemployee\s*(?:no|number)\s*[:#-]?\s*([a-z0-9/-]+)/i
            ]
        ),

      nationalInsuranceNumber:
        PayTrackerPayrollPayslipParser
          .extractFirstText_(
            text,
            [
              /\bn\.?i\.?\s*number\s*[:#-]?\s*([a-z]{2}\s*\d{2}\s*\d{2}\s*\d{2}\s*[a-z])/i,
              /\bni\s*number\s*[:#-]?\s*([a-z]{2}\s*\d{6}\s*[a-z])/i
            ]
          ),

      taxCode:
        PayTrackerPayrollPayslipParser
          .extractFirstText_(
            text,
            [
              /\btax\s*code\s*[:#-]?\s*([0-9]{3,4}[a-z]+)/i
            ]
          ),

      payPeriod:
        PayTrackerPayrollPayslipParser
          .extractFirstText_(
            text,
            [
              /\bpay\s*period\s*[:#-]?\s*([0-9]{1,2}\s*\/\s*[0-9]{4})/i,
              /\bperiod\s*[:#-]?\s*([0-9]{1,2}\s*\/\s*[0-9]{4})/i
            ]
          ),

      payDate:
        PayTrackerPayrollPayslipParser
          .extractDate_(
            text,
            [
              /\bpay\s*date\s*[:#-]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
              /\bdate\s*[:#-]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
            ]
          ),

      grossPay:
  PayTrackerPayrollPayslipParser
    .extractCurrentPeriodMoney_(
      text,
      'grossPay'
    ),

taxablePay:
  PayTrackerPayrollPayslipParser
    .extractCurrentPeriodMoney_(
      text,
      'taxablePay'
    ),

incomeTax:
  PayTrackerPayrollPayslipParser
    .extractCurrentPeriodMoney_(
      text,
      'incomeTax'
    ),

nationalInsurance:
  PayTrackerPayrollPayslipParser
    .extractCurrentPeriodMoney_(
      text,
      'nationalInsurance'
    ),

employerNationalInsurance: null,

pension:
  PayTrackerPayrollPayslipParser
    .extractCurrentPeriodMoney_(
      text,
      'pension'
    ),

employerPension: null,

employeePension:
  PayTrackerPayrollPayslipParser
    .extractCurrentPeriodMoney_(
      text,
      'pension'
    ),

studentLoan:
  PayTrackerPayrollPayslipParser
    .extractCurrentPeriodMoney_(
      text,
      'studentLoan'
    ),

totalDeductions:
  PayTrackerPayrollPayslipParser
    .extractCurrentPeriodMoney_(
      text,
      'totalDeductions'
    ),

netPay:
  PayTrackerPayrollPayslipParser
    .extractCurrentPeriodMoney_(
      text,
      'netPay'
    ),

      hours: {
        basic:
          PayTrackerPayrollPayslipParser
            .extractHoursByLabel_(
              text,
              [
                'basic'
              ]
            ),

        enhanced:
          PayTrackerPayrollPayslipParser
            .extractHoursByLabel_(
              text,
              [
                'enhanced'
              ]
            ),

        sunday:
          PayTrackerPayrollPayslipParser
            .extractHoursByLabel_(
              text,
              [
                'sunday'
              ]
            ),

        night:
          PayTrackerPayrollPayslipParser
            .extractHoursByLabel_(
              text,
              [
                'night',
                'unsoc'
              ]
            )
      }
    };

    PayTrackerPayrollPayslipParser
      .applyDerivedFields_(
        fields
      );

    return {
      fields: fields,
      warnings: []
    };
  },

  /**
   * Generic parser fallback.
   *
   * @param {Object} normalized Normalized text.
   * @return {Object} Result.
   * @private
   */
  parseGeneric_: function(
    normalized
  ) {
    const text =
      normalized.compactText;

    const fields = {
      provider: '',
      employer: '',
      employeeName: '',

      payDate:
        PayTrackerPayrollPayslipParser
          .extractDate_(
            text,
            [
              /\bpay\s*date\s*[:#-]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/i
            ]
          ),

      grossPay:
        PayTrackerPayrollPayslipParser
          .extractMoney_(
            text,
            [
              /\bgross\s*pay\s*£?\s*([0-9,]+\.\d{2})/i,
              /\bgross\s*£?\s*([0-9,]+\.\d{2})/i
            ]
          ),

      incomeTax:
        PayTrackerPayrollPayslipParser
          .extractMoney_(
            text,
            [
              /\bincome\s*tax\s*£?\s*([0-9,]+\.\d{2})/i,
              /\btax\s*£?\s*([0-9,]+\.\d{2})/i
            ]
          ),

      nationalInsurance:
        PayTrackerPayrollPayslipParser
          .extractMoney_(
            text,
            [
              /\bnational\s*insurance\s*£?\s*([0-9,]+\.\d{2})/i,
              /\bn\.?i\.?\s*£?\s*([0-9,]+\.\d{2})/i
            ]
          ),

      pension:
        PayTrackerPayrollPayslipParser
          .extractMoney_(
            text,
            [
              /\bpension\s*£?\s*([0-9,]+\.\d{2})/i
            ]
          ),

      studentLoan:
        PayTrackerPayrollPayslipParser
          .extractMoney_(
            text,
            [
              /\bstudent\s*loan\s*£?\s*([0-9,]+\.\d{2})/i
            ]
          ),

      totalDeductions:
        PayTrackerPayrollPayslipParser
          .extractMoney_(
            text,
            [
              /\btotal\s*deductions\s*£?\s*([0-9,]+\.\d{2})/i
            ]
          ),

      netPay:
        PayTrackerPayrollPayslipParser
          .extractMoney_(
            text,
            [
              /\bnet\s*pay\s*£?\s*([0-9,]+\.\d{2})/i
            ],
            {
              preferLast: true
            }
          )
    };

    PayTrackerPayrollPayslipParser
      .applyDerivedFields_(
        fields
      );

    return {
      fields: fields,
      warnings: [
        'A provider-specific parser was not detected. Generic matching was used.'
      ]
    };
  },

  /**
   * Applies safe derived values.
   *
   * @param {Object} fields Parsed fields.
   * @private
   */
  applyDerivedFields_: function(fields) {
    if (
      !fields.pension &&
      (
        fields.employeePension ||
        fields.employerPension
      )
    ) {
      fields.pension =
        Number(
          fields.employeePension || 0
        );
    }

    if (
      !fields.totalDeductions
    ) {
      const calculated =
        Number(
          fields.incomeTax || 0
        ) +
        Number(
          fields.nationalInsurance || 0
        ) +
        Number(
          fields.employeePension ||
          fields.pension ||
          0
        ) +
        Number(
          fields.studentLoan || 0
        );

      fields.calculatedDeductions =
        PayTrackerPayrollPayslipParser
          .roundMoney_(
            calculated
          );
    }

    if (
      fields.grossPay &&
      fields.netPay
    ) {
      fields.grossToNetDifference =
        PayTrackerPayrollPayslipParser
          .roundMoney_(
            fields.grossPay -
            fields.netPay
          );
    }
  },

  /**
   * Extracts employer.
   *
   * @param {string} text Compact text.
   * @return {string} Employer.
   * @private
   */
  extractEmployer_: function(text) {
    const knownEmployers = [
      'Ballymena PSA',
      'Staffline Ireland',
      'Staffline'
    ];

    for (
      let index = 0;
      index <
      knownEmployers.length;
      index += 1
    ) {
      if (
        text
          .toLowerCase()
          .indexOf(
            knownEmployers[index]
              .toLowerCase()
          ) !== -1
      ) {
        return knownEmployers[index];
      }
    }

    return '';
  },

  /**
   * Extracts employee name.
   *
   * @param {string} text Compact text.
   * @return {string} Name.
   * @private
   */
  extractEmployeeName_: function(text) {
    const direct =
      PayTrackerPayrollPayslipParser
        .extractFirstText_(
          text,
          [
            /\bmr\s+([a-z][a-z' -]{2,60})\s+\d{1,4}\s+[a-z]/i,
            /\bemployee\s*name\s*[:#-]?\s*([a-z][a-z' -]{2,60})/i
          ]
        );

    if (!direct) {
      return '';
    }

    return direct
      .replace(/\s+/g, ' ')
      .trim()
      .replace(
        /\b\w/g,
        function(character) {
          return character.toUpperCase();
        }
      );
  },

  /**
   * Extracts hours near a label.
   *
   * @param {string} text Compact text.
   * @param {Array<string>} labels Labels.
   * @return {number|null} Hours.
   * @private
   */
  extractHoursByLabel_: function(
    text,
    labels
  ) {
    for (
      let index = 0;
      index < labels.length;
      index += 1
    ) {
      const escaped =
        PayTrackerPayrollPayslipParser
          .escapeRegex_(
            labels[index]
          );

      const patterns = [
        new RegExp(
          '\\b' +
          escaped +
          '\\b[^0-9]{0,30}([0-9]+(?:\\.\\d{1,2})?)\\s+(?:hrs?|hours?)',
          'i'
        ),

        new RegExp(
          '\\b' +
          escaped +
          '\\b\\s+([0-9]+(?:\\.\\d{1,2})?)\\s+[0-9]+(?:\\.\\d{2})',
          'i'
        )
      ];

      const value =
        PayTrackerPayrollPayslipParser
          .extractNumber_(
            text,
            patterns
          );

      if (value !== null) {
        return value;
      }
    }

    return null;
  },

  /**
   * Extracts first matching text.
   *
   * @param {string} text Text.
   * @param {Array<RegExp>} patterns Patterns.
   * @return {string} Match.
   * @private
   */
  extractFirstText_: function(
    text,
    patterns
  ) {
    for (
      let index = 0;
      index < patterns.length;
      index += 1
    ) {
      const match =
        text.match(
          patterns[index]
        );

      if (
        match &&
        match[1]
      ) {
        return String(
          match[1]
        )
          .replace(/\s+/g, ' ')
          .trim();
      }
    }

    return '';
  },

  /**
   * Extracts date in ISO format.
   *
   * @param {string} text Text.
   * @param {Array<RegExp>} patterns Patterns.
   * @return {string} ISO date.
   * @private
   */
  extractDate_: function(
    text,
    patterns
  ) {
    const value =
      PayTrackerPayrollPayslipParser
        .extractFirstText_(
          text,
          patterns
        );

    if (!value) {
      return '';
    }

    const parts =
      value
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
 /**
 * Extracts current-period values from the Staffline
 * deductions and final pay-summary sections.
 *
 * @param {string} text Compact payslip text.
 * @param {string} fieldName Requested field.
 * @return {number|null} Current-period value.
 * @private
 */
extractCurrentPeriodMoney_: function(
  text,
  fieldName
) {
  const compactText =
    String(text || '')
      .replace(/\s+/g, ' ')
      .trim();

  /*
   * Staffline final summary:
   *
   * Taxable Pay
   * Non-Taxable Pay
   * Total Pay
   * Total Deductions
   * NET PAY
   *
   * followed by five values in the same order.
   */
  const finalSummaryMatch =
    compactText.match(
      /taxable\s+pay\s+non-taxable\s+pay\s+total\s+pay\s+total\s+deductions\s+net\s+pay\s+([0-9,]+\.\d{2})\s+([0-9,]+\.\d{2})\s+([0-9,]+\.\d{2})\s+([0-9,]+\.\d{2})\s+([0-9,]+\.\d{2})/i
    );

  if (finalSummaryMatch) {
    const finalSummary = {
      taxablePay:
        PayTrackerPayrollPayslipParser
          .parseMoney_(
            finalSummaryMatch[1]
          ),

      nonTaxablePay:
        PayTrackerPayrollPayslipParser
          .parseMoney_(
            finalSummaryMatch[2]
          ),

      grossPay:
        PayTrackerPayrollPayslipParser
          .parseMoney_(
            finalSummaryMatch[3]
          ),

      totalDeductions:
        PayTrackerPayrollPayslipParser
          .parseMoney_(
            finalSummaryMatch[4]
          ),

      netPay:
        PayTrackerPayrollPayslipParser
          .parseMoney_(
            finalSummaryMatch[5]
          )
    };

    if (
      Object.prototype.hasOwnProperty.call(
        finalSummary,
        fieldName
      )
    ) {
      return finalSummary[fieldName];
    }
  }

  /*
   * Restrict deduction matching to the current-period
   * DEDUCTIONS block. Stop before the final summary.
   */
  const deductionsMatch =
    compactText.match(
      /deductions\s+deduction\s+amount\s+([\s\S]*?)taxable\s+pay\s+non-taxable\s+pay/i
    );

  const deductionsText =
    deductionsMatch
      ? deductionsMatch[1]
      : '';

  const deductionPatterns = {
    incomeTax: [
      /\btax\s+([0-9,]+\.\d{2})/i
    ],

    nationalInsurance: [
      /\bn\.?\s*i\.?\s+([0-9,]+\.\d{2})/i
    ],

    pension: [
      /\bpension\s+contrib(?:ution)?\s+([0-9,]+\.\d{2})/i
    ],

    studentLoan: [
      /\bstudent\s+loan\s+([0-9,]+\.\d{2})/i
    ],

    totalDeductions: [
      /\btotal\s+deductions\s+([0-9,]+\.\d{2})/i
    ]
  };

  const requestedPatterns =
    deductionPatterns[fieldName] || [];

  if (
    deductionsText &&
    requestedPatterns.length
  ) {
    const deductionValue =
      PayTrackerPayrollPayslipParser
        .extractMoney_(
          deductionsText,
          requestedPatterns,
          {
            preferLast: false
          }
        );

    if (deductionValue !== null) {
      return deductionValue;
    }
  }

  /*
   * Gross pay fallback:
   * use TOTAL PAY immediately before PAY TO DATE.
   */
  if (
    fieldName === 'grossPay'
  ) {
    const grossPayMatch =
      compactText.match(
        /total\s+pay\s+([0-9,]+\.\d{2})\s+pay\s+to\s+date/i
      );

    if (grossPayMatch) {
      return PayTrackerPayrollPayslipParser
        .parseMoney_(
          grossPayMatch[1]
        );
    }
  }

  return null;
},


  /**
   * Extracts a money value.
   *
   * @param {string} text Text.
   * @param {Array<RegExp>} patterns Patterns.
   * @param {Object=} options Options.
   * @return {number|null} Amount.
   * @private
   */
  extractMoney_: function(
    text,
    patterns,
    options
  ) {
    const config =
      options || {};

    let matches = [];

    patterns.forEach(function(pattern) {
      const flags =
        pattern.flags.indexOf('g') === -1
          ? pattern.flags + 'g'
          : pattern.flags;

      const globalPattern =
        new RegExp(
          pattern.source,
          flags
        );

      let match;

      while (
        (
          match =
            globalPattern.exec(text)
        ) !== null
      ) {
        if (
          match[1] !== undefined
        ) {
          matches.push(
            match[1]
          );
        }

        if (
          match.index ===
          globalPattern.lastIndex
        ) {
          globalPattern.lastIndex += 1;
        }
      }
    });

    if (!matches.length) {
      return null;
    }

    const selected =
      config.preferLast
        ? matches[
            matches.length - 1
          ]
        : matches[0];

    return PayTrackerPayrollPayslipParser
      .parseMoney_(selected);
  },

  /**
   * Extracts a number.
   *
   * @param {string} text Text.
   * @param {Array<RegExp>} patterns Patterns.
   * @return {number|null} Number.
   * @private
   */
  extractNumber_: function(
    text,
    patterns
  ) {
    const value =
      PayTrackerPayrollPayslipParser
        .extractFirstText_(
          text,
          patterns
        );

    if (!value) {
      return null;
    }

    const number =
      Number(
        String(value)
          .replace(/,/g, '')
      );

    return Number.isFinite(number)
      ? number
      : null;
  },

  /**
   * Parses a money value.
   *
   * @param {*} value Value.
   * @return {number|null} Amount.
   * @private
   */
  parseMoney_: function(value) {
    const number =
      Number(
        String(
          value === undefined ||
          value === null
            ? ''
            : value
        )
          .replace(/[£,\s]/g, '')
          .trim()
      );

    return Number.isFinite(number)
      ? PayTrackerPayrollPayslipParser
          .roundMoney_(
            number
          )
      : null;
  },

  /**
   * Calculates parser confidence.
   *
   * @param {Object} fields Fields.
   * @return {Object} Confidence.
   * @private
   */
  calculateConfidence_: function(
    fields
  ) {
    const weightedFields = [
      {
        key: 'payDate',
        weight: 15
      },
      {
        key: 'grossPay',
        weight: 25
      },
      {
        key: 'netPay',
        weight: 25
      },
      {
        key: 'incomeTax',
        weight: 10
      },
      {
        key: 'nationalInsurance',
        weight: 10
      },
      {
        key: 'totalDeductions',
        weight: 10
      },
      {
        key: 'payPeriod',
        weight: 5
      }
    ];

    let score = 0;

    weightedFields.forEach(
      function(item) {
        if (
          fields[item.key] !== null &&
          fields[item.key] !== undefined &&
          fields[item.key] !== ''
        ) {
          score += item.weight;
        }
      }
    );

    let level = 'LOW';

    if (score >= 85) {
      level = 'HIGH';
    } else if (score >= 60) {
      level = 'MEDIUM';
    }

    return {
      score: score,
      level: level
    };
  },

  /**
   * Returns missing important fields.
   *
   * @param {Object} fields Fields.
   * @return {Array<string>} Missing.
   * @private
   */
  getMissingImportantFields_: function(
    fields
  ) {
    const required = [
      'payDate',
      'grossPay',
      'netPay',
      'incomeTax',
      'nationalInsurance'
    ];

    return required.filter(
      function(key) {
        return (
          fields[key] === null ||
          fields[key] === undefined ||
          fields[key] === ''
        );
      }
    );
  },

  /**
   * Escapes text for RegExp.
   *
   * @param {string} value Value.
   * @return {string} Escaped.
   * @private
   */
  escapeRegex_: function(value) {
    return String(value)
      .replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );
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
 * Tests extraction and parsing against one stored PDF.
 *
 * Uses the same Drive file ID currently placed in
 * testPayTrackerPayrollPdfTextExtraction().
 */
function testPayTrackerPayrollPayslipParser() {
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

  const parsed =
    PayTrackerPayrollPayslipParser
      .parse(
        extraction.text
      );

  const result = {
    extraction: {
      success:
        extraction.success,

      sourceFileId:
        extraction.sourceFileId,

      sourceFileName:
        extraction.sourceFileName,

      characterCount:
        extraction.characterCount,

      lineCount:
        extraction.lineCount
    },

    parser: parsed
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