/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Payroll/PayrollPdfTextService.gs
 *
 * Purpose:
 * - Read a payslip PDF stored in Google Drive
 * - Convert the PDF temporarily into a Google Doc
 * - Extract readable text from the converted document
 * - Delete the temporary extraction document afterwards
 *
 * Requirements:
 * - Google Drive advanced service must be enabled
 * - The Apps Script project must have permission to read
 *   the Pay Tracker Payroll Centre Drive folder
 *******************************************************/

const PayTrackerPayrollPdfTextService = Object.freeze({
  VERSION: '2.8.0',

  GOOGLE_DOC_MIME_TYPE:
    'application/vnd.google-apps.document',

  PDF_MIME_TYPE:
    'application/pdf',

  TEMPORARY_FOLDER_NAME:
    'Pay Tracker Temporary PDF Extraction',

  /**
   * Extracts readable text from a stored PDF.
   *
   * @param {string} driveFileId Google Drive PDF file ID.
   * @return {Object} Extraction result.
   */
  extractTextFromPdf: function(driveFileId) {
    const normalizedFileId =
      PayTrackerPayrollPdfTextService
        .normalizeRequiredString_(
          driveFileId,
          'Drive file ID'
        );

    let temporaryDocumentId = '';

    try {
      const sourceFile =
        DriveApp.getFileById(
          normalizedFileId
        );

      PayTrackerPayrollPdfTextService
        .validateSourceFile_(
          sourceFile
        );

      const sourceBlob =
        sourceFile.getBlob();

      const temporaryFolder =
        PayTrackerPayrollPdfTextService
          .getOrCreateTemporaryFolder_();

      const convertedDocument =
        Drive.Files.create(
          {
            name:
              PayTrackerPayrollPdfTextService
                .buildTemporaryDocumentName_(
                  sourceFile.getName()
                ),

            mimeType:
              PayTrackerPayrollPdfTextService
                .GOOGLE_DOC_MIME_TYPE,

            parents: [
              temporaryFolder.getId()
            ]
          },
          sourceBlob,
          {
            fields:
              'id,name,mimeType'
          }
        );

      if (
        !convertedDocument ||
        !convertedDocument.id
      ) {
        throw new Error(
          'Google Drive did not return a converted document ID.'
        );
      }

      temporaryDocumentId =
        String(
          convertedDocument.id
        );

      const extractedText =
        PayTrackerPayrollPdfTextService
          .readConvertedDocumentText_(
            temporaryDocumentId
          );

      return {
        success: true,

        sourceFileId:
          normalizedFileId,

        sourceFileName:
          sourceFile.getName(),

        sourceMimeType:
          sourceFile.getMimeType(),

        temporaryDocumentId:
          temporaryDocumentId,

        characterCount:
          extractedText.length,

        lineCount:
          PayTrackerPayrollPdfTextService
            .countLines_(
              extractedText
            ),

        text:
          extractedText,

        extractedAt:
          new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,

        sourceFileId:
          normalizedFileId,

        error:
          PayTrackerPayrollPdfTextService
            .getErrorMessage_(
              error
            ),

        extractedAt:
          new Date().toISOString()
      };
    } finally {
      if (temporaryDocumentId) {
        PayTrackerPayrollPdfTextService
          .trashTemporaryDocument_(
            temporaryDocumentId
          );
      }
    }
  },

  /**
   * Extracts text and returns a shortened preview.
   *
   * Useful for safe testing in the Apps Script execution log.
   *
   * @param {string} driveFileId Google Drive PDF file ID.
   * @param {number=} maximumCharacters Preview length.
   * @return {Object} Preview result.
   */
  extractTextPreview: function(
    driveFileId,
    maximumCharacters
  ) {
    const result =
      PayTrackerPayrollPdfTextService
        .extractTextFromPdf(
          driveFileId
        );

    if (
      !result ||
      result.success !== true
    ) {
      return result;
    }

    const previewLength =
      PayTrackerPayrollPdfTextService
        .normalizePositiveInteger_(
          maximumCharacters,
          2500
        );

    return {
      success: true,

      sourceFileId:
        result.sourceFileId,

      sourceFileName:
        result.sourceFileName,

      sourceMimeType:
        result.sourceMimeType,

      characterCount:
        result.characterCount,

      lineCount:
        result.lineCount,

      preview:
        result.text.slice(
          0,
          previewLength
        ),

      previewTruncated:
        result.text.length >
        previewLength,

      extractedAt:
        result.extractedAt
    };
  },

  /**
   * Reads text from the temporary converted Google Doc.
   *
   * Google Drive conversion may take a moment before the
   * document becomes readable, so this includes retries.
   *
   * @param {string} documentId Google Doc file ID.
   * @return {string} Extracted text.
   * @private
   */
  readConvertedDocumentText_: function(
    documentId
  ) {
    const maximumAttempts = 8;
    const retryDelayMilliseconds = 750;

    let lastError = null;

    for (
      let attempt = 1;
      attempt <= maximumAttempts;
      attempt += 1
    ) {
      try {
        const document =
          DocumentApp.openById(
            documentId
          );

        const body =
          document.getBody();

        const text =
          body
            ? String(
                body.getText() || ''
              ).trim()
            : '';

        if (text) {
          return text;
        }

        lastError =
          new Error(
            'The converted document did not contain readable text.'
          );
      } catch (error) {
        lastError = error;
      }

      if (
        attempt <
        maximumAttempts
      ) {
        Utilities.sleep(
          retryDelayMilliseconds
        );
      }
    }

    throw new Error(
      lastError
        ? PayTrackerPayrollPdfTextService
            .getErrorMessage_(
              lastError
            )
        : 'The converted document could not be read.'
    );
  },

  /**
   * Validates the source Drive file.
   *
   * Some Gmail PDFs were imported as
   * application/octet-stream, so the .pdf extension is also
   * accepted.
   *
   * @param {GoogleAppsScript.Drive.File} file Drive file.
   * @private
   */
  validateSourceFile_: function(file) {
    if (!file) {
      throw new Error(
        'The source Drive file could not be found.'
      );
    }

    const filename =
      String(
        file.getName() || ''
      ).trim();

    const mimeType =
      String(
        file.getMimeType() || ''
      ).trim()
      .toLowerCase();

    const hasPdfExtension =
      filename
        .toLowerCase()
        .endsWith('.pdf');

    const isPdfMimeType =
      mimeType ===
      PayTrackerPayrollPdfTextService
        .PDF_MIME_TYPE;

    const isGenericBinaryMimeType =
      mimeType ===
      'application/octet-stream';

    if (
      !isPdfMimeType &&
      !(
        isGenericBinaryMimeType &&
        hasPdfExtension
      ) &&
      !hasPdfExtension
    ) {
      throw new Error(
        'The selected Drive file is not a PDF.'
      );
    }

    if (
      file.getSize() <= 0
    ) {
      throw new Error(
        'The selected PDF file is empty.'
      );
    }
  },

  /**
   * Gets or creates the temporary extraction folder.
   *
   * @return {GoogleAppsScript.Drive.Folder} Folder.
   * @private
   */
  getOrCreateTemporaryFolder_: function() {
    const matchingFolders =
      DriveApp.getFoldersByName(
        PayTrackerPayrollPdfTextService
          .TEMPORARY_FOLDER_NAME
      );

    if (
      matchingFolders.hasNext()
    ) {
      return matchingFolders.next();
    }

    return DriveApp.createFolder(
      PayTrackerPayrollPdfTextService
        .TEMPORARY_FOLDER_NAME
    );
  },

  /**
   * Builds a temporary document name.
   *
   * @param {string} sourceFilename Source filename.
   * @return {string} Temporary name.
   * @private
   */
  buildTemporaryDocumentName_: function(
    sourceFilename
  ) {
    const cleanName =
      String(
        sourceFilename ||
        'Payslip'
      )
        .replace(
          /\.pdf$/i,
          ''
        )
        .trim();

    return [
      'TEMP',
      'PAYSLIP',
      cleanName,
      Date.now()
    ].join(' - ');
  },

  /**
   * Moves the temporary converted document to Trash.
   *
   * @param {string} documentId Google Doc ID.
   * @private
   */
  trashTemporaryDocument_: function(
    documentId
  ) {
    try {
      DriveApp
        .getFileById(
          documentId
        )
        .setTrashed(true);
    } catch (error) {
      console.warn(
        'Temporary payroll extraction document could not be trashed.',
        error
      );
    }
  },

  /**
   * Counts non-empty text lines.
   *
   * @param {string} text Extracted text.
   * @return {number} Line count.
   * @private
   */
  countLines_: function(text) {
    return String(
      text || ''
    )
      .split(/\r?\n/)
      .map(function(line) {
        return line.trim();
      })
      .filter(function(line) {
        return Boolean(line);
      })
      .length;
  },

  /**
   * Normalizes a required string.
   *
   * @param {*} value Value.
   * @param {string} label Label.
   * @return {string} Normalized value.
   * @private
   */
  normalizeRequiredString_: function(
    value,
    label
  ) {
    const normalizedValue =
      String(
        value === undefined ||
        value === null
          ? ''
          : value
      ).trim();

    if (!normalizedValue) {
      throw new Error(
        String(
          label ||
          'Required value'
        ) +
        ' is required.'
      );
    }

    return normalizedValue;
  },

  /**
   * Normalizes a positive integer.
   *
   * @param {*} value Value.
   * @param {number} fallback Fallback.
   * @return {number} Integer.
   * @private
   */
  normalizePositiveInteger_: function(
    value,
    fallback
  ) {
    const number =
      Number(value);

    if (
      !Number.isFinite(number) ||
      number <= 0
    ) {
      return fallback;
    }

    return Math.floor(number);
  },

  /**
   * Returns a safe error message.
   *
   * @param {*} error Error.
   * @return {string} Message.
   * @private
   */
  getErrorMessage_: function(error) {
    if (
      error &&
      typeof error.message ===
        'string' &&
      error.message.trim()
    ) {
      return error.message.trim();
    }

    return String(
      error ||
      'Unknown PDF extraction error.'
    );
  }
});


/**
 * Manual test helper.
 *
 * Replace the Drive file ID below with one Drive File ID
 * from the Payslip Register, then run this function.
 */
function testPayTrackerPayrollPdfTextExtraction() {
  const driveFileId =
    '1qRcKBH2wuuRSM22P8oYaXQgm3V_M_8NI';

  const result =
    PayTrackerPayrollPdfTextService
      .extractTextPreview(
        driveFileId,
        4000
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