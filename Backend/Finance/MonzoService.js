/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Finance/MonzoService.js
 *
 * Personal, read-only Monzo integration.
 *
 * Script properties required:
 * - PAY_TRACKER_MONZO_CLIENT_ID
 * - PAY_TRACKER_MONZO_CLIENT_SECRET
 *
 * Access and refresh tokens are held in User Properties.
 *******************************************************/

const PayTrackerMonzoService =
  Object.freeze({
    CLIENT_ID_PROPERTY:
      'PAY_TRACKER_MONZO_CLIENT_ID',
    CLIENT_SECRET_PROPERTY:
      'PAY_TRACKER_MONZO_CLIENT_SECRET',
    ACCESS_TOKEN_PROPERTY:
      'PAY_TRACKER_MONZO_ACCESS_TOKEN',
    REFRESH_TOKEN_PROPERTY:
      'PAY_TRACKER_MONZO_REFRESH_TOKEN',
    STATE_PROPERTY:
      'PAY_TRACKER_MONZO_OAUTH_STATE',

    getAction: function() {
      if (
        PayTrackerMonzoService
          .hasAccessToken()
      ) {
        return PayTrackerMonzoService
          .sync();
      }

      return {
        success: true,
        connected: false,
        authorizationUrl:
          PayTrackerMonzoService
            .createAuthorizationUrl(),
        message:
          'Continue in Monzo to grant read-only access.'
      };
    },

    createAuthorizationUrl: function() {
      const credentials =
        PayTrackerMonzoService
          .getCredentials();

      const redirectUrl =
        ScriptApp
          .getService()
          .getUrl();

      if (!redirectUrl) {
        throw new Error(
          'Deploy the Pay Tracker web app before connecting Monzo.'
        );
      }

      const state =
        Utilities
          .getUuid();

      PropertiesService
        .getUserProperties()
        .setProperty(
          PayTrackerMonzoService
            .STATE_PROPERTY,
          state
        );

      return (
        PayTrackerFinanceIntegrationConfig
          .MONZO
          .AUTHORIZE_URL +
        '/?' +
        [
          'client_id=' +
            encodeURIComponent(
              credentials.clientId
            ),
          'redirect_uri=' +
            encodeURIComponent(
              redirectUrl
            ),
          'response_type=code',
          'state=' +
            encodeURIComponent(
              state
            )
        ].join('&')
      );
    },

    handleCallback: function(event) {
      const parameters =
        event &&
        event.parameter
          ? event.parameter
          : {};

      if (parameters.error) {
        throw new Error(
          'Monzo connection was not approved: ' +
          parameters.error
        );
      }

      const userProperties =
        PropertiesService
          .getUserProperties();

      const expectedState =
        userProperties.getProperty(
          PayTrackerMonzoService
            .STATE_PROPERTY
        );

      if (
        !parameters.state ||
        !expectedState ||
        parameters.state !==
          expectedState
      ) {
        throw new Error(
          'The Monzo connection could not be verified. Start again from Finance.'
        );
      }

      const credentials =
        PayTrackerMonzoService
          .getCredentials();

      const response =
        UrlFetchApp.fetch(
          PayTrackerFinanceIntegrationConfig
            .MONZO
            .TOKEN_URL,
          {
            method: 'post',
            payload: {
              grant_type:
                'authorization_code',
              client_id:
                credentials.clientId,
              client_secret:
                credentials.clientSecret,
              redirect_uri:
                ScriptApp
                  .getService()
                  .getUrl(),
              code:
                parameters.code
            },
            muteHttpExceptions:
              true
          }
        );

      const token =
        PayTrackerMonzoService
          .parseResponse(response);

      userProperties
        .setProperties(
          {
            PAY_TRACKER_MONZO_ACCESS_TOKEN:
              token.access_token,
            PAY_TRACKER_MONZO_REFRESH_TOKEN:
              token.refresh_token || ''
          },
          false
        );

      userProperties.deleteProperty(
        PayTrackerMonzoService
          .STATE_PROPERTY
      );

      PayTrackerMonzoService
        .ensureConnectionRecord();

      return PayTrackerMonzoService
        .buildCallbackPage();
    },

    sync: function() {
      const accessToken =
        PayTrackerMonzoService
          .getAccessToken();

      const accounts =
        PayTrackerMonzoService
          .request(
            '/accounts',
            {},
            accessToken
          )
          .accounts ||
        [];

      if (!accounts.length) {
        throw new Error(
          'Monzo did not return an available account.'
        );
      }

      const account =
        accounts[0];

      const since =
        new Date();

      since.setDate(
        since.getDate() -
        PayTrackerFinanceIntegrationConfig
          .MONZO
          .NORMAL_SYNC_DAYS
      );

      const response =
        PayTrackerMonzoService
          .request(
            '/transactions',
            {
              account_id:
                account.id,
              since:
                since.toISOString(),
              limit:
                PayTrackerFinanceIntegrationConfig
                  .MONZO
                  .TRANSACTION_PAGE_LIMIT,
              expand:
                'merchant'
            },
            accessToken
          );

      const imported =
        PayTrackerMonzoService
          .storeTransactions(
            account,
            response.transactions ||
            []
          );

      PayTrackerMonzoService
        .updateConnection(
          account,
          ''
        );

      const detection =
        PayTrackerSubscriptionDetectionService
          .detect(
            PayTrackerMonzoService
              .readStoredTransactions()
          );

      const suggestionsAdded =
        PayTrackerMonzoService
          .storeSuggestions(
            detection.suggestions
          );

      const monzoPots =
        PayTrackerMonzoService
          .fetchPots(
            account.id,
            accessToken
          );

      const potsUpdated =
        PayTrackerSavingsService
          .applyMonzoPotBalances(
            monzoPots
          );

      const paymentsMatched =
        PayTrackerTransactionMatchingService
          .matchTransactions();

      return {
        success: true,
        connected: true,
        imported:
          imported,
        suggestions:
          suggestionsAdded,
        potsUpdated:
          potsUpdated,
        paymentsMatched:
          paymentsMatched,
        message:
          'Monzo sync complete: ' +
          imported +
          ' new transactions, ' +
          suggestionsAdded +
          ' subscription suggestions, ' +
          potsUpdated +
          ' linked pot balances updated and ' +
          paymentsMatched +
          ' payment matches suggested.'
      };
    },


    /**
     * Lists the signed-in Monzo account's pots.
     *
     * Used by the Savings workspace to let the user pick
     * which Monzo Pot to link a Savings Pot to.
     *
     * @return {Array<{id: string, name: string, balance: number, currency: string}>}
     */
    listPots: function() {
      const accessToken =
        PayTrackerMonzoService
          .getAccessToken();

      const accounts =
        PayTrackerMonzoService
          .request(
            '/accounts',
            {},
            accessToken
          )
          .accounts ||
        [];

      if (!accounts.length) {
        throw new Error(
          'Monzo did not return an available account.'
        );
      }

      return PayTrackerMonzoService
        .fetchPots(
          accounts[0].id,
          accessToken
        );
    },


    /**
     * Reads active pots for one Monzo account.
     *
     * @param {string} accountId
     * @param {string} accessToken
     * @return {Array<{id: string, name: string, balance: number, currency: string}>}
     */
    fetchPots: function(
      accountId,
      accessToken
    ) {
      const response =
        PayTrackerMonzoService
          .request(
            '/pots',
            {
              current_account_id:
                accountId
            },
            accessToken
          );

      return (response.pots || [])
        .filter(function(pot) {
          return !pot.deleted;
        })
        .map(function(pot) {
          return {
            id:
              pot.id,
            name:
              pot.name ||
              'Monzo Pot',
            balance:
              Number(pot.balance || 0) /
              100,
            currency:
              pot.currency ||
              'GBP'
          };
        });
    },

    request: function(
      path,
      parameters,
      accessToken,
      isRetry
    ) {
      const query =
        Object.keys(parameters || {})
          .map(function(key) {
            return (
              encodeURIComponent(key) +
              '=' +
              encodeURIComponent(
                parameters[key]
              )
            );
          })
          .join('&');

      const response =
        UrlFetchApp.fetch(
          PayTrackerFinanceIntegrationConfig
            .MONZO
            .API_BASE_URL +
          path +
          (
            query
              ? '?' + query
              : ''
          ),
          {
            method: 'get',
            headers: {
              Authorization:
                'Bearer ' +
                accessToken
            },
            muteHttpExceptions:
              true
          }
        );

      try {
        return PayTrackerMonzoService
          .parseResponse(response);
      } catch (error) {
        if (
          error.status === 401 &&
          !isRetry
        ) {
          const refreshedToken =
            PayTrackerMonzoService
              .refreshAccessToken();

          return PayTrackerMonzoService
            .request(
              path,
              parameters,
              refreshedToken,
              true
            );
        }

        throw error;
      }
    },

    /**
     * Exchanges the stored Monzo refresh token for a new
     * access token when the current one has expired.
     * Monzo access tokens are short-lived (a few hours).
     *
     * @return {string} the new access token
     */
    refreshAccessToken: function() {
      const userProperties =
        PropertiesService
          .getUserProperties();

      const refreshToken =
        userProperties.getProperty(
          PayTrackerMonzoService
            .REFRESH_TOKEN_PROPERTY
        );

      if (!refreshToken) {
        throw new Error(
          'Your Monzo connection has expired. Reconnect Monzo from Finance to continue syncing.'
        );
      }

      const credentials =
        PayTrackerMonzoService
          .getCredentials();

      const response =
        UrlFetchApp.fetch(
          PayTrackerFinanceIntegrationConfig
            .MONZO
            .TOKEN_URL,
          {
            method: 'post',
            payload: {
              grant_type:
                'refresh_token',
              client_id:
                credentials.clientId,
              client_secret:
                credentials.clientSecret,
              refresh_token:
                refreshToken
            },
            muteHttpExceptions:
              true
          }
        );

      let token;

      try {
        token =
          PayTrackerMonzoService
            .parseResponse(response);
      } catch (refreshError) {
        throw new Error(
          'Your Monzo connection has expired. Reconnect Monzo from Finance to continue syncing.'
        );
      }

      userProperties
        .setProperties(
          {
            PAY_TRACKER_MONZO_ACCESS_TOKEN:
              token.access_token,
            PAY_TRACKER_MONZO_REFRESH_TOKEN:
              token.refresh_token ||
              refreshToken
          },
          false
        );

      return token.access_token;
    },

    storeTransactions: function(
      account,
      transactions
    ) {
      const spreadsheet =
        SpreadsheetApp
          .getActiveSpreadsheet();

      const sheet =
        spreadsheet.getSheetByName(
          PayTrackerFinanceIntegrationConfig
            .SHEETS
            .BANK_TRANSACTIONS
            .NAME
        );

      if (!sheet) {
        throw new Error(
          'Run setupPayTrackerFinanceIntegrations() before syncing Monzo.'
        );
      }

      const known = {};

      if (sheet.getLastRow() > 1) {
        sheet
          .getRange(
            2,
            1,
            sheet.getLastRow() - 1,
            1
          )
          .getDisplayValues()
          .forEach(function(row) {
            known[row[0]] = true;
          });
      }

      let imported = 0;

      transactions.forEach(function(item) {
        if (
          !item.id ||
          known[item.id]
        ) {
          return;
        }

        const merchant =
          item.merchant || {};

        const amount =
          Number(item.amount || 0) /
          100;

        sheet.appendRow([
          item.id,
          'MONZO-PERSONAL',
          account.id,
          PayTrackerMonzoService
            .toDate(item.created),
          PayTrackerMonzoService
            .toDate(item.settled),
          item.description || '',
          merchant.name ||
            item.description ||
            '',
          merchant.id || '',
          item.category || '',
          Math.abs(amount),
          item.currency || 'GBP',
          amount < 0
            ? 'Debit'
            : 'Credit',
          item.settled
            ? false
            : true,
          item.decline_reason
            ? true
            : false,
          '',
          '',
          0,
          'Unmatched',
          '',
          new Date(),
          new Date()
        ]);

        known[item.id] = true;
        imported += 1;
      });

      return imported;
    },

    readStoredTransactions: function() {
      const sheet =
        SpreadsheetApp
          .getActiveSpreadsheet()
          .getSheetByName(
            PayTrackerFinanceIntegrationConfig
              .SHEETS
              .BANK_TRANSACTIONS
              .NAME
          );

      if (
        !sheet ||
        sheet.getLastRow() <= 1
      ) {
        return [];
      }

      return sheet
        .getRange(
          2,
          1,
          sheet.getLastRow() - 1,
          21
        )
        .getValues()
        .map(function(row) {
          return {
            transactionId:
              row[0],
            createdAt:
              row[3],
            settledAt:
              row[4],
            description:
              row[5],
            merchantName:
              row[6],
            category:
              row[8],
            amount:
              row[9],
            direction:
              row[11],
            pending:
              row[12] === true,
            declined:
              row[13] === true
          };
        });
    },

    storeSuggestions: function(
      suggestions
    ) {
      const existing =
        PayTrackerSubscriptionRepository
          .getAll();

      const merchantKeys = {};

      existing.forEach(function(record) {
        merchantKeys[
          record.merchantKey
        ] = true;
      });

      let added = 0;

      suggestions.forEach(function(item) {
        if (
          merchantKeys[
            item.merchantKey
          ]
        ) {
          return;
        }

        PayTrackerSubscriptionRepository
          .create(item);

        merchantKeys[
          item.merchantKey
        ] = true;

        added += 1;
      });

      return added;
    },

    ensureConnectionRecord: function() {
      const sheet =
        SpreadsheetApp
          .getActiveSpreadsheet()
          .getSheetByName(
            PayTrackerFinanceIntegrationConfig
              .SHEETS
              .BANK_CONNECTIONS
              .NAME
          );

      if (!sheet) {
        throw new Error(
          'Run setupPayTrackerFinanceIntegrations() first.'
        );
      }

      if (sheet.getLastRow() <= 1) {
        const timestamp =
          new Date();

        sheet.appendRow([
          'MONZO-PERSONAL',
          'Monzo',
          '',
          '',
          '',
          'GBP',
          'Connected',
          'Read-only accounts, balance and transactions',
          '',
          '',
          '',
          true,
          timestamp,
          timestamp
        ]);
      }
    },

    updateConnection: function(
      account,
      errorMessage
    ) {
      PayTrackerMonzoService
        .ensureConnectionRecord();

      const sheet =
        SpreadsheetApp
          .getActiveSpreadsheet()
          .getSheetByName(
            'Bank Connections'
          );

      sheet
        .getRange(
          2,
          3,
          1,
          12
        )
        .setValues([[
          account.id || '',
          account.description ||
            'Monzo Personal',
          account.type || '',
          account.currency ||
            'GBP',
          errorMessage
            ? 'Error'
            : 'Connected',
          'Read-only accounts, balance and transactions',
          errorMessage
            ? ''
            : new Date(),
          '',
          errorMessage || '',
          true,
          '',
          new Date()
        ]]);
    },

    getCredentials: function() {
      const properties =
        PropertiesService
          .getScriptProperties();

      const clientId =
        properties.getProperty(
          PayTrackerMonzoService
            .CLIENT_ID_PROPERTY
        );

      const clientSecret =
        properties.getProperty(
          PayTrackerMonzoService
            .CLIENT_SECRET_PROPERTY
        );

      if (
        !clientId ||
        !clientSecret
      ) {
        throw new Error(
          'Add the Monzo client ID and client secret to Apps Script Properties before connecting.'
        );
      }

      return {
        clientId:
          clientId,
        clientSecret:
          clientSecret
      };
    },

    hasAccessToken: function() {
      return Boolean(
        PropertiesService
          .getUserProperties()
          .getProperty(
            PayTrackerMonzoService
              .ACCESS_TOKEN_PROPERTY
          )
      );
    },

    getAccessToken: function() {
      const token =
        PropertiesService
          .getUserProperties()
          .getProperty(
            PayTrackerMonzoService
              .ACCESS_TOKEN_PROPERTY
          );

      if (!token) {
        throw new Error(
          'Monzo is not connected.'
        );
      }

      return token;
    },

    parseResponse: function(response) {
      const status =
        response.getResponseCode();

      const body =
        response.getContentText();

      let value = {};

      try {
        value =
          JSON.parse(body || '{}');
      } catch (ignoredError) {
        value = {};
      }

      if (
        status < 200 ||
        status >= 300
      ) {
        const error =
          new Error(
            value.message ||
            value.error_description ||
            value.error ||
            'Monzo returned HTTP ' +
            status +
            '.'
          );

        error.status = status;

        throw error;
      }

      return value;
    },

    toDate: function(value) {
      if (!value) {
        return '';
      }

      const date =
        new Date(value);

      return Number.isNaN(
        date.getTime()
      )
        ? ''
        : date;
    },

    buildCallbackPage: function() {
      return HtmlService
        .createHtmlOutput(
          '<!doctype html><html><body style="font-family:Arial,sans-serif;padding:40px;background:#f8fafc;color:#0f172a">' +
          '<h1>Monzo connected</h1>' +
          '<p>Return to Pay Tracker and press Sync Monzo to import your transactions.</p>' +
          '<script>setTimeout(function(){window.close();},2500);</script>' +
          '</body></html>'
        )
        .setTitle(
          'Monzo connected'
        );
    }
  });

function getPayTrackerMonzoAction() {
  return PayTrackerMonzoService
    .getAction();
}
