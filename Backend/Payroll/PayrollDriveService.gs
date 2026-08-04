/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Payroll/PayrollDriveService.gs
 *
 * Purpose:
 * - Create and locate the Payroll Centre Drive folder
 * - Create a folder for each Payroll Group
 * - Save payslip PDF attachments to Google Drive
 * - Accept PDFs delivered as application/octet-stream
 * - Generate safe and consistent filenames
 * - Return Drive metadata to the Payslip Repository
 * - Avoid duplicate Drive files where possible
 *
 * Important:
 * - PDFs are stored in Google Drive, not Google Sheets
 * - Existing Drive files are never silently deleted
 * - Gmail is not accessed by this service
 * - Folder IDs are stored against the Payroll Group
 *******************************************************/

const PayTrackerPayrollDriveService = Object.freeze({
  VERSION: '2.8.1',

  ROOT_FOLDER_NAME:
    'Pay Tracker Payroll Centre',

  /**
   * Returns the Payroll Centre root folder.
   *
   * @return {GoogleAppsScript.Drive.Folder} Root folder.
   */
  getOrCreateRootFolder: function() {
    const properties =
      PropertiesService
        .getScriptProperties();

    const storedFolderId =
      properties.getProperty(
        'PAY_TRACKER_PAYROLL_ROOT_FOLDER_ID'
      );

    if (storedFolderId) {
      const storedFolder =
        PayTrackerPayrollDriveService
          .getFolderByIdSafely(
            storedFolderId
          );

      if (storedFolder) {
        return storedFolder;
      }
    }

    const folders =
      DriveApp.getFoldersByName(
        PayTrackerPayrollDriveService
          .ROOT_FOLDER_NAME
      );

    let rootFolder = null;

    if (folders.hasNext()) {
      rootFolder =
        folders.next();
    } else {
      rootFolder =
        DriveApp.createFolder(
          PayTrackerPayrollDriveService
            .ROOT_FOLDER_NAME
        );
    }

    properties.setProperty(
      'PAY_TRACKER_PAYROLL_ROOT_FOLDER_ID',
      rootFolder.getId()
    );

    return rootFolder;
  },

  /**
   * Returns the Drive folder for a Payroll Group.
   *
   * @param {string} payrollGroupId Payroll Group ID.
   * @return {GoogleAppsScript.Drive.Folder} Group folder.
   */
  getOrCreatePayrollGroupFolder: function(
    payrollGroupId
  ) {
    const group =
      PayTrackerPayrollGroupRepository
        .getById(
          payrollGroupId,
          true
        );

    if (!group) {
      throw new Error(
        'Payroll Group "' +
        payrollGroupId +
        '" was not found.'
      );
    }

    if (group.storageFolderId) {
      const existingFolder =
        PayTrackerPayrollDriveService
          .getFolderByIdSafely(
            group.storageFolderId
          );

      if (existingFolder) {
        return existingFolder;
      }
    }

    const rootFolder =
      PayTrackerPayrollDriveService
        .getOrCreateRootFolder();

    const folderName =
      PayTrackerPayrollDriveService
        .createPayrollGroupFolderName(
          group
        );

    const matchingFolders =
      rootFolder.getFoldersByName(
        folderName
      );

    let groupFolder = null;

    if (matchingFolders.hasNext()) {
      groupFolder =
        matchingFolders.next();
    } else {
      groupFolder =
        rootFolder.createFolder(
          folderName
        );
    }

    PayTrackerPayrollGroupRepository
      .update(
        payrollGroupId,
        {
          storageFolderId:
            groupFolder.getId()
        }
      );

    return groupFolder;
  },

  /**
   * Saves a payslip PDF to the correct Drive folder.
   *
   * Some payroll providers send PDF files using the generic
   * application/octet-stream MIME type. These are accepted
   * when the attachment filename ends in .pdf.
   *
   * @param {Object} input Save request.
   * @return {Object} Saved Drive file metadata.
   */
  savePayslipPdf: function(input) {
    const request =
      input || {};

    const payrollGroupId =
      PayTrackerPayrollDriveService
        .cleanText(
          request.payrollGroupId
        );

    if (!payrollGroupId) {
      throw new Error(
        'Payroll Group ID is required before saving a payslip.'
      );
    }

    const blob =
      request.blob;

    if (!blob) {
      throw new Error(
        'A payslip PDF blob is required.'
      );
    }

    const originalFilename =
      PayTrackerPayrollDriveService
        .cleanText(
          request.originalFilename ||
          blob.getName()
        );

    const mimeType =
      PayTrackerPayrollDriveService
        .normalizeText(
          blob.getContentType()
        );

    const filenameIsPdf =
      PayTrackerPayrollDriveService
        .isPdfFilename(
          originalFilename
        );

    const mimeTypeIsPdf =
      mimeType ===
      'application/pdf';

    const mimeTypeIsGeneric =
      mimeType ===
        'application/octet-stream' ||
      mimeType ===
        'binary/octet-stream' ||
      mimeType ===
        'application/x-download' ||
      !mimeType;

    const validPdf =
      mimeTypeIsPdf ||
      (
        filenameIsPdf &&
        mimeTypeIsGeneric
      );

    if (!validPdf) {
      throw new Error(
        'Only PDF payslip attachments can be saved. ' +
        'Received MIME type "' +
        (
          mimeType ||
          'unknown'
        ) +
        '" and filename "' +
        (
          originalFilename ||
          'unnamed attachment'
        ) +
        '".'
      );
    }

    const group =
      PayTrackerPayrollGroupRepository
        .getById(
          payrollGroupId,
          true
        );

    if (!group) {
      throw new Error(
        'Payroll Group "' +
        payrollGroupId +
        '" does not exist.'
      );
    }

    const groupFolder =
      PayTrackerPayrollDriveService
        .getOrCreatePayrollGroupFolder(
          payrollGroupId
        );

    const fileHash =
      PayTrackerPayrollDriveService
        .cleanText(
          request.fileHash
        ) ||
      PayTrackerPayslipRepository
        .createFileHash(
          blob
        );

    const duplicate =
      PayTrackerPayrollDriveService
        .findExistingFile(
          groupFolder,
          {
            originalFilename:
              originalFilename,

            fileHash:
              fileHash
          }
        );

    if (duplicate) {
      return {
        created:
          false,

        duplicate:
          true,

        driveFileId:
          duplicate.getId(),

        driveFileUrl:
          duplicate.getUrl(),

        driveFolderId:
          groupFolder.getId(),

        driveFolderUrl:
          groupFolder.getUrl(),

        filename:
          duplicate.getName(),

        mimeType:
          duplicate.getMimeType(),

        fileSize:
          duplicate.getSize(),

        fileHash:
          fileHash
      };
    }

    const filename =
      PayTrackerPayrollDriveService
        .createPayslipFilename({
          group:
            group,

          originalFilename:
            originalFilename,

          payDate:
            request.payDate,

          emailDate:
            request.emailDate,

          payslipId:
            request.payslipId
        });

    const savedBlob =
      blob.copyBlob();

    savedBlob
      .setName(
        filename
      )
      .setContentType(
        'application/pdf'
      );

    const file =
      groupFolder.createFile(
        savedBlob
      );

    file.setDescription(
      [
        'Pay Tracker Payroll Centre payslip',
        'Payroll Group: ' +
          group.payrollGroupName,
        'Payroll Group ID: ' +
          group.payrollGroupId,
        'Payslip ID: ' +
          (
            request.payslipId ||
            'Not registered'
          ),
        'Original MIME Type: ' +
          (
            mimeType ||
            'unknown'
          ),
        'Original Filename: ' +
          (
            originalFilename ||
            'unknown'
          ),
        'File Hash: ' +
          fileHash
      ].join('\n')
    );

    return {
      created:
        true,

      duplicate:
        false,

      driveFileId:
        file.getId(),

      driveFileUrl:
        file.getUrl(),

      driveFolderId:
        groupFolder.getId(),

      driveFolderUrl:
        groupFolder.getUrl(),

      filename:
        file.getName(),

      mimeType:
        file.getMimeType(),

      fileSize:
        file.getSize(),

      fileHash:
        fileHash
    };
  },

  /**
   * Returns an existing saved file.
   *
   * @param {GoogleAppsScript.Drive.Folder} folder Folder.
   * @param {Object} input Search input.
   * @return {GoogleAppsScript.Drive.File|null} File or null.
   */
  findExistingFile: function(
    folder,
    input
  ) {
    const request =
      input || {};

    const fileHash =
      PayTrackerPayrollDriveService
        .cleanText(
          request.fileHash
        );

    if (
      fileHash &&
      PayTrackerPayslipRepository
        .existsByFileHash(
          fileHash
        )
    ) {
      const registeredPayslip =
        PayTrackerPayslipRepository
          .findDuplicate({
            fileHash:
              fileHash
          });

      if (
        registeredPayslip &&
        registeredPayslip.driveFileId
      ) {
        const registeredFile =
          PayTrackerPayrollDriveService
            .getFileByIdSafely(
              registeredPayslip
                .driveFileId
            );

        if (registeredFile) {
          return registeredFile;
        }
      }
    }

    const originalFilename =
      PayTrackerPayrollDriveService
        .cleanFilename(
          request.originalFilename
        );

    if (!originalFilename) {
      return null;
    }

    const normalizedOriginal =
      PayTrackerPayrollDriveService
        .normalizeFilename(
          originalFilename
        );

    const files =
      folder.getFiles();

    while (files.hasNext()) {
      const file =
        files.next();

      const normalizedExisting =
        PayTrackerPayrollDriveService
          .normalizeFilename(
            file.getName()
          );

      if (
        normalizedExisting ===
        normalizedOriginal
      ) {
        return file;
      }
    }

    return null;
  },

  /**
   * Tests whether a filename identifies a PDF.
   *
   * @param {*} filename Filename.
   * @return {boolean} True when filename ends in .pdf.
   */
  isPdfFilename: function(filename) {
    const value =
      PayTrackerPayrollDriveService
        .normalizeText(
          filename
        );

    return (
      value.length >= 4 &&
      value.slice(-4) === '.pdf'
    );
  },

  /**
   * Creates the Payroll Group folder name.
   *
   * @param {Object} group Payroll Group.
   * @return {string} Folder name.
   */
  createPayrollGroupFolderName: function(
    group
  ) {
    return (
      PayTrackerPayrollDriveService
        .cleanFilename(
          group.payrollGroupName
        ) ||
      'Payroll Group'
    );
  },

  /**
   * Creates a safe payslip filename.
   *
   * @param {Object} input Filename input.
   * @return {string} Filename.
   */
  createPayslipFilename: function(input) {
    const request =
      input || {};

    const group =
      request.group || {};

    const effectiveDate =
      PayTrackerPayrollDriveService
        .toDateOrNull(
          request.payDate
        ) ||
      PayTrackerPayrollDriveService
        .toDateOrNull(
          request.emailDate
        ) ||
      new Date();

    const dateText =
      Utilities.formatDate(
        effectiveDate,
        Session.getScriptTimeZone(),
        'yyyy-MM-dd'
      );

    const groupName =
      PayTrackerPayrollDriveService
        .cleanFilename(
          group.payrollGroupName
        ) ||
      'Payroll';

    const originalFilename =
      PayTrackerPayrollDriveService
        .cleanFilename(
          request.originalFilename
        );

    let description =
      originalFilename
        ? originalFilename.replace(
            /\.pdf$/i,
            ''
          )
        : 'Payslip';

    if (!description) {
      description =
        'Payslip';
    }

    let filename =
      [
        dateText,
        groupName,
        description
      ].join(' - ');

    filename =
      PayTrackerPayrollDriveService
        .cleanFilename(
          filename
        );

    if (
      !PayTrackerPayrollDriveService
        .isPdfFilename(
          filename
        )
    ) {
      filename +=
        '.pdf';
    }

    return filename;
  },

  /**
   * Returns Drive file metadata.
   *
   * @param {string} driveFileId Drive file ID.
   * @return {Object|null} File metadata.
   */
  getFileMetadata: function(driveFileId) {
    const file =
      PayTrackerPayrollDriveService
        .getFileByIdSafely(
          driveFileId
        );

    if (!file) {
      return null;
    }

    const parents =
      file.getParents();

    const parent =
      parents.hasNext()
        ? parents.next()
        : null;

    return {
      driveFileId:
        file.getId(),

      driveFileUrl:
        file.getUrl(),

      filename:
        file.getName(),

      mimeType:
        file.getMimeType(),

      fileSize:
        file.getSize(),

      createdAt:
        file.getDateCreated(),

      updatedAt:
        file.getLastUpdated(),

      driveFolderId:
        parent
          ? parent.getId()
          : '',

      driveFolderUrl:
        parent
          ? parent.getUrl()
          : ''
    };
  },

  /**
   * Returns a Drive folder safely.
   *
   * @param {string} folderId Folder ID.
   * @return {GoogleAppsScript.Drive.Folder|null} Folder.
   */
  getFolderByIdSafely: function(folderId) {
    const normalizedId =
      PayTrackerPayrollDriveService
        .cleanText(
          folderId
        );

    if (!normalizedId) {
      return null;
    }

    try {
      return DriveApp.getFolderById(
        normalizedId
      );
    } catch (error) {
      console.warn(
        'Payroll folder could not be accessed: ' +
        error.message
      );

      return null;
    }
  },

  /**
   * Returns a Drive file safely.
   *
   * @param {string} fileId File ID.
   * @return {GoogleAppsScript.Drive.File|null} File.
   */
  getFileByIdSafely: function(fileId) {
    const normalizedId =
      PayTrackerPayrollDriveService
        .cleanText(
          fileId
        );

    if (!normalizedId) {
      return null;
    }

    try {
      return DriveApp.getFileById(
        normalizedId
      );
    } catch (error) {
      console.warn(
        'Payroll file could not be accessed: ' +
        error.message
      );

      return null;
    }
  },

  /**
   * Cleans a filename.
   *
   * @param {*} value Value.
   * @return {string} Safe filename.
   */
  cleanFilename: function(value) {
    return PayTrackerPayrollDriveService
      .cleanText(
        value
      )
      .replace(
        /[\\/:*?"<>|]+/g,
        '-'
      )
      .replace(
        /\s+/g,
        ' '
      )
      .replace(
        /-+/g,
        '-'
      )
      .trim();
  },

  /**
   * Normalizes a filename.
   *
   * @param {*} value Filename.
   * @return {string} Normalized filename.
   */
  normalizeFilename: function(value) {
    return PayTrackerPayrollDriveService
      .cleanFilename(
        value
      )
      .toLowerCase();
  },

  /**
   * Cleans text.
   *
   * @param {*} value Value.
   * @return {string} Text.
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
   * Normalizes text.
   *
   * @param {*} value Value.
   * @return {string} Normalized text.
   */
  normalizeText: function(value) {
    return PayTrackerPayrollDriveService
      .cleanText(
        value
      )
      .toLowerCase();
  },

  /**
   * Converts a value to a Date or null.
   *
   * @param {*} value Value.
   * @return {Date|null} Date.
   */
  toDateOrNull: function(value) {
    if (!value) {
      return null;
    }

    if (
      Object.prototype.toString.call(
        value
      ) === '[object Date]'
    ) {
      return isNaN(
        value.getTime()
      )
        ? null
        : value;
    }

    const parsed =
      new Date(value);

    return isNaN(
      parsed.getTime()
    )
      ? null
      : parsed;
  }
});

/**
 * Creates or verifies the Payroll Centre Drive folders.
 *
 * @return {Object} Test result.
 */
function testPayTrackerPayrollDriveService() {
  const rootFolder =
    PayTrackerPayrollDriveService
      .getOrCreateRootFolder();

  const groups =
    PayTrackerPayrollGroupRepository
      .getActive();

  const groupResults =
    groups.map(function(group) {
      const folder =
        PayTrackerPayrollDriveService
          .getOrCreatePayrollGroupFolder(
            group.payrollGroupId
          );

      return {
        payrollGroupId:
          group.payrollGroupId,

        payrollGroupName:
          group.payrollGroupName,

        folderId:
          folder.getId(),

        folderUrl:
          folder.getUrl(),

        folderName:
          folder.getName()
      };
    });

  const result = {
    success:
      Boolean(
        rootFolder &&
        groupResults.length
      ),

    version:
      PayTrackerPayrollDriveService
        .VERSION,

    rootFolderId:
      rootFolder.getId(),

    rootFolderUrl:
      rootFolder.getUrl(),

    rootFolderName:
      rootFolder.getName(),

    payrollGroupFolders:
      groupResults,

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