/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Payroll/PayrollManualUploadService.gs
 *
 * Purpose:
 * - Accept a user-selected PDF from the Payroll Centre
 * - Validate the private manual upload
 * - Prevent duplicate payslip registration
 * - Store the PDF in the Payroll Group Drive folder
 * - Register and process it through the existing pipeline
 *
 * Important:
 * - PDF data is never written to Google Sheets
 * - Drive files remain private
 * - Gmail is not accessed
 *******************************************************/

const PayTrackerPayrollManualUploadService =
  Object.freeze({
    VERSION: '2.8.0',

    MAX_FILE_SIZE_BYTES:
      10 * 1024 * 1024,

    /**
     * Imports one manually selected payslip PDF.
     *
     * @param {Object} input Upload request.
     * @return {Object} Import and processing result.
     */
    upload: function(input) {
      const request =
        input || {};

      const payrollGroupId =
        PayTrackerPayrollManualUploadService
          .requiredText_(
            request.payrollGroupId,
            'Payroll Group'
          );

      const originalFilename =
        PayTrackerPayrollManualUploadService
          .requiredText_(
            request.originalFilename,
            'PDF filename'
          );

      const base64Data =
        PayTrackerPayrollManualUploadService
          .cleanBase64_(
            request.base64Data
          );

      if (!base64Data) {
        throw new Error(
          'The selected PDF did not contain upload data.'
        );
      }

      if (
        !/\.pdf$/i.test(
          originalFilename
        )
      ) {
        throw new Error(
          'Only PDF payslips can be uploaded.'
        );
      }

      const group =
        PayTrackerPayrollGroupRepository
          .getById(
            payrollGroupId,
            false
          );

      if (!group) {
        throw new Error(
          'The selected Payroll Group is unavailable.'
        );
      }

      let bytes;

      try {
        bytes =
          Utilities.base64Decode(
            base64Data
          );
      } catch (error) {
        throw new Error(
          'The selected PDF could not be decoded.'
        );
      }

      if (!bytes.length) {
        throw new Error(
          'The selected PDF is empty.'
        );
      }

      if (
        bytes.length >
        PayTrackerPayrollManualUploadService
          .MAX_FILE_SIZE_BYTES
      ) {
        throw new Error(
          'The selected PDF is larger than the 10 MB upload limit.'
        );
      }

      const blob =
        Utilities.newBlob(
          bytes,
          PayTrackerPayrollConfig
            .FILE_TYPES
            .PDF_MIME_TYPE,
          originalFilename
        );

      const fileHash =
        PayTrackerPayslipRepository
          .createFileHash(
            blob
          );

      const duplicate =
        PayTrackerPayslipRepository
          .findDuplicate({
            fileHash:
              fileHash
          });

      if (duplicate) {
        return {
          success:
            true,

          created:
            false,

          duplicate:
            true,

          message:
            'This PDF is already registered.',

          payslip:
            PayTrackerPayrollCentreController
              .serializePayslip(
                duplicate
              )
        };
      }

      const payslipId =
        PayTrackerPayslipRepository
          .createPayslipId();

      const payDate =
        PayTrackerPayrollManualUploadService
          .toDateOrNull_(
            request.payDate
          );

      const driveResult =
        PayTrackerPayrollDriveService
          .savePayslipPdf({
            payrollGroupId:
              payrollGroupId,

            blob:
              blob,

            originalFilename:
              originalFilename,

            payDate:
              payDate,

            payslipId:
              payslipId,

            fileHash:
              fileHash
          });

      const registered =
        PayTrackerPayslipRepository
          .create({
            payslipId:
              payslipId,

            payrollGroupId:
              payrollGroupId,

            sourceType:
              PayTrackerPayrollConfig
                .SOURCE_TYPES
                .MANUAL_UPLOAD,

            originalFilename:
              originalFilename,

            mimeType:
              PayTrackerPayrollConfig
                .FILE_TYPES
                .PDF_MIME_TYPE,

            fileSize:
              bytes.length,

            fileHash:
              fileHash,

            driveFileId:
              driveResult.driveFileId,

            driveFileUrl:
              driveResult.driveFileUrl,

            payDate:
              payDate,

            importStatus:
              PayTrackerPayrollConfig
                .IMPORT_STATUSES
                .REGISTERED,

            comparisonStatus:
              PayTrackerPayrollConfig
                .COMPARISON_STATUSES
                .NOT_READY,

            notes:
              'Uploaded manually through the Payroll Centre.'
          });

      const processing =
        PayTrackerPayrollPayslipProcessingService
          .processPayslip(
            registered.payslipId
          );

      const completedPayslip =
        processing.success === true
          ? PayTrackerPayslipRepository
              .setImportStatus(
                registered.payslipId,
                PayTrackerPayrollConfig
                  .IMPORT_STATUSES
                  .COMPLETE,
                'Uploaded manually and processed successfully.'
              )
          : registered;

      return {
        success:
          true,

        created:
          true,

        duplicate:
          false,

        message:
          processing.success === true
            ? 'Payslip uploaded and processed.'
            : 'Payslip uploaded, but its PDF details need review.',

        payslip:
          PayTrackerPayrollCentreController
            .serializePayslip(
              completedPayslip
            ),

        processing:
          {
            success:
              processing.success === true,

            status:
              processing.extractionStatus ||
              '',

            error:
              processing.error ||
              ''
          }
      };
    },

    /**
     * Removes an optional data-URL prefix.
     *
     * @param {*} value Base64 value.
     * @return {string} Base64 payload.
     * @private
     */
    cleanBase64_: function(value) {
      const text =
        String(
          value === null ||
          value === undefined
            ? ''
            : value
        ).trim();

      const marker =
        'base64,';

      const markerIndex =
        text.indexOf(
          marker
        );

      return markerIndex === -1
        ? text
        : text.substring(
            markerIndex +
            marker.length
          );
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

      const parsed =
        value instanceof Date
          ? value
          : new Date(value);

      return isNaN(
        parsed.getTime()
      )
        ? null
        : parsed;
    },

    /**
     * Returns required trimmed text.
     *
     * @param {*} value Value.
     * @param {string} label Field label.
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
    }
  });

/**
 * Frontend API: imports a manually selected payslip PDF.
 *
 * @param {Object} input Upload request.
 * @return {Object} Upload result.
 */
function uploadPayTrackerPayslipPdf(input) {
  return PayTrackerPayrollManualUploadService
    .upload(
      input || {}
    );
}
