'use strict';
/**
 * Local test sandbox for the Apps Script source (development tool only).
 *
 * Loads the real Backend/*.js files into a Node vm with IN-MEMORY fakes for
 * SpreadsheetApp, PropertiesService, LockService, ScriptApp and CalendarApp. Gmail,
 * Drive and UrlFetchApp throw if touched. Nothing here can reach Google, a real
 * spreadsheet or the network, so it is safe to run anywhere (including CI).
 *
 * The .cjs extension keeps clasp from pushing this folder to Apps Script.
 *
 * To let tests replace services that production declares with `const ... = Object.freeze`,
 * the loader rewrites top-level `const PayTracker... =` to `var` IN MEMORY ONLY (the files on
 * disk are never changed). Production code is otherwise run exactly as written.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');

function chain() {
  const proxy = new Proxy(function () {}, { get: (_, key) => (key === 'then' ? undefined : proxy), apply: () => proxy });
  return proxy;
}

function makeSheet(name) {
  const rows = [];
  let proxyRange;
  const sheet = {
    rows, name,
    getName: () => name,
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((m, r) => Math.max(m, r ? r.length : 0), 0),
    getMaxRows: () => 5000, getMaxColumns: () => 200,
    clear() { rows.length = 0; return sheet; }, clearContents() { rows.length = 0; return sheet; },
    setFrozenRows() { return sheet; }, showRows() { return sheet; }, hideRows() { return sheet; },
    insertRowsAfter() { return sheet; }, insertColumnsAfter() { return sheet; }, getSheetId: () => 1,
    deleteRow(n) { rows.splice(n - 1, 1); return sheet; },
    appendRow(values) { rows.push(values.slice()); return sheet; },
    getDataRange: () => sheet.getRange(1, 1, Math.max(rows.length, 1), Math.max(sheet.getLastColumn(), 1)),
    getRange(row, col, numRows = 1, numCols = 1) {
      const get = (r, c) => (rows[row - 1 + r] || [])[col - 1 + c] ?? '';
      const grid = fn => Array.from({ length: numRows }, (_, r) => Array.from({ length: numCols }, (_, c) => fn(r, c)));
      const range = {
        getValues: () => grid(get), getDisplayValues: () => grid((r, c) => String(get(r, c))),
        getValue: () => get(0, 0), getDisplayValue: () => String(get(0, 0)),
        setValues(values) {
          values.forEach((vals, r) => {
            rows[row - 1 + r] = rows[row - 1 + r] || [];
            vals.forEach((v, c) => { rows[row - 1 + r][col - 1 + c] = v; });
          });
          return proxyRange;
        },
        setValue(v) { rows[row - 1] = rows[row - 1] || []; rows[row - 1][col - 1] = v; return proxyRange; },
        clearContent() {
          for (let r = 0; r < numRows; r++) for (let c = 0; c < numCols; c++) if (rows[row - 1 + r]) rows[row - 1 + r][col - 1 + c] = '';
          return proxyRange;
        },
        getRow: () => row, getColumn: () => col, getNumRows: () => numRows, getNumColumns: () => numCols, getSheet: () => sheet
      };
      const local = new Proxy(range, { get: (t, k) => (k in t ? t[k] : (k === 'then' ? undefined : () => local)) });
      proxyRange = local;
      return local;
    }
  };
  return sheet;
}

/**
 * @param {Object=} options
 * @param {string[]=} options.calendarIds  replaces PayTrackerConfig.CALENDAR.IDS (in memory only)
 * @param {boolean=} options.stubLayout   replace PaySheet layout helpers so sync() can run on a small fake sheet
 */
function createSandbox(options = {}) {
  const sheets = {};
  const getSheet = name => (sheets[name] = sheets[name] || makeSheet(name));
  const spreadsheet = {
    getSheetByName: name => sheets[name] || null, insertSheet: name => getSheet(name),
    getId: () => 'FAKE', getSheets: () => Object.values(sheets), getName: () => 'Fake', getUrl: () => 'https://example.invalid/fake'
  };
  const props = {};
  const scriptProps = {
    getProperty: k => (k in props ? props[k] : null),
    setProperty(k, v) { props[k] = String(v); return scriptProps; },
    deleteProperty(k) { delete props[k]; return scriptProps; },
    getProperties: () => Object.assign({}, props)
  };
  const triggers = [];
  const logs = [];
  let calendars = {};
  const calendarCalls = [];

  const forbidden = name => new Proxy({}, { get(_, k) { throw new Error('Test touched ' + name + '.' + String(k)); } });
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Logger: { log: message => logs.push(String(message)) },
    Utilities: {
      getUuid: () => crypto.randomUUID(), formatDate: d => new Date(d).toISOString(), computeDigest: () => [],
      sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
    },
    Session: {
      getScriptTimeZone: () => 'Europe/London',
      getActiveUser: () => ({ getEmail: () => 'owner@example.invalid' }),
      getEffectiveUser: () => ({ getEmail: () => 'owner@example.invalid' })
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet, getUi: () => chain(), flush() {} },
    PropertiesService: { getScriptProperties: () => scriptProps, getUserProperties: () => scriptProps, getDocumentProperties: () => scriptProps },
    LockService: {
      getDocumentLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {}, hasLock: () => true }),
      getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {}, hasLock: () => true })
    },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      newTrigger: handler => {
        const builder = new Proxy({}, { get: (_, k) => k === 'create'
          ? () => { const t = { getHandlerFunction: () => handler, getUniqueId: () => crypto.randomUUID() }; triggers.push(t); return t; }
          : () => builder });
        return builder;
      },
      deleteTrigger(t) { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); }
    },
    CalendarApp: {
      getCalendarById(id) {
        calendarCalls.push(['getCalendarById', id]);
        const entry = calendars[id];
        if (entry === undefined || entry === null) return null;
        if (entry === 'THROWS') throw new Error('Calendar service unavailable');
        return {
          getEvents(start, end) {
            calendarCalls.push(['getEvents', id]);
            if (entry && entry.readThrows) throw new Error('Events could not be read');
            return (entry.events || entry).slice();
          }
        };
      }
    },
    GmailApp: forbidden('GmailApp'), DriveApp: forbidden('DriveApp'), UrlFetchApp: forbidden('UrlFetchApp'),
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) }
  });

  function listSourceFiles(dir) {
    return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
      const relative = dir + '/' + entry.name;
      if (entry.isDirectory()) return entry.name === 'node' ? [] : listSourceFiles(relative);
      return /\.(js|gs)$/.test(entry.name) ? [relative] : [];
    });
  }
  const files = ['Backend/Core/Config.js', 'Backend/Core/Utilities.js']
    .concat(listSourceFiles('Backend').filter(f => f !== 'Backend/Core/Config.js' && f !== 'Backend/Core/Utilities.js').sort())
    .concat(listSourceFiles('Tests').sort());
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/^const (PayTracker\w+) = /gm, 'var $1 = ');
    vm.runInContext(source, context, { filename: file });
  }

  const run = expression => vm.runInContext(expression, context, { timeout: 30000 });
  const json = expression => JSON.parse(JSON.stringify(run(expression) ?? null));
  const RealDate = run('Date');

  if (options.calendarIds) {
    context.__ids = options.calendarIds;
    run('PayTrackerConfig = Object.assign({}, PayTrackerConfig, { CALENDAR: Object.assign({}, PayTrackerConfig.CALENDAR, { IDS: __ids.slice() }) })');
  }
  if (options.stubLayout) {
    // Week layout services only arrange rows and formulas; the tests seed the week rows they need.
    run('PayTrackerSummaryService = Object.assign({}, PayTrackerSummaryService, { ensureCompleteWeekExists() {}, buildRunningTotals() {} })');
    run('PayTrackerWeekManager = Object.assign({}, PayTrackerWeekManager, { showRelevantWeeksOnly() {} })');
  }

  const api = {
    context, run, json, sheets, getSheet, logs, calendarCalls,
    paySheet: makeSheet('PaySheet'),
    date: (y, m, d, h = 12, min = 0) => new RealDate(y, m, d, h, min, 0, 0),
    setCalendars(map) { calendars = map; },
    /** A calendar event as Apps Script returns it (only the methods the source uses). */
    event(title, start, end, extra = {}) {
      return {
        getTitle: () => title, getDescription: () => extra.description || '', getLocation: () => extra.location || '',
        getStartTime: () => start, getEndTime: () => end, isAllDayEvent: () => extra.allDay === true,
        getId: () => extra.id || '', getOriginalCalendarId: () => extra.calendarId || 'dean99992011@gmail.com'
      };
    },
    /** Fill the seven date cells of the week containing `date`, for every pay table, as a real PaySheet has them. */
    seedWeek(date) {
      context.__d = date;
      const week = run('PayTrackerUtils.getWeekNumberFromDate(__d)');
      const monday = run('PayTrackerUtils.getWeekStartDate(' + week + ')');
      const first = run('PayTrackerUtils.getWeekStartRow(' + week + ')') + run('PayTrackerConfig.SHEET.WEEK_DATA_ROW_OFFSET');
      const tables = json('getConfiguredPayTables_().map(function (t) { return { name: t.name, startColumn: t.startColumn }; })');
      tables.forEach(table => {
        for (let i = 0; i < 7; i++) {
          const day = new RealDate(monday.getFullYear(), monday.getMonth(), monday.getDate() + i, 12, 0, 0, 0);
          const rowIndex = first + i - 1;
          api.paySheet.rows[rowIndex] = api.paySheet.rows[rowIndex] || [];
          api.paySheet.rows[rowIndex][table.startColumn - 1] = day;
        }
      });
      api.weekFirstRow = first; api.weekMonday = monday;
      return { week, first, monday };
    },
    /** [shiftType, hours, pay] for a table on a date in the seeded week. */
    shiftOn(tableName, date) {
      const table = json('getConfiguredPayTableByName_(' + JSON.stringify(tableName) + ')');
      const dayIndex = Math.round((new RealDate(date.getFullYear(), date.getMonth(), date.getDate(), 12) - api.weekMonday) / 86400000);
      const row = api.paySheet.rows[api.weekFirstRow + dayIndex - 1] || [];
      return [row[table.startColumn + 1] ?? '', row[table.startColumn + 2] ?? '', row[table.startColumn + 3] ?? ''];
    },
    setShift(tableName, date, shiftType, hours, pay) {
      const table = json('getConfiguredPayTableByName_(' + JSON.stringify(tableName) + ')');
      const dayIndex = Math.round((new RealDate(date.getFullYear(), date.getMonth(), date.getDate(), 12) - api.weekMonday) / 86400000);
      const row = api.paySheet.rows[api.weekFirstRow + dayIndex - 1];
      row[table.startColumn + 1] = shiftType; row[table.startColumn + 2] = hours; row[table.startColumn + 3] = pay;
    },
    snapshotPaySheet: () => JSON.stringify(api.paySheet.rows),
    sync() { context.__paySheet = api.paySheet; return json('PayTrackerCalendarService.sync(__paySheet)'); },
    actionItems() {
      const name = run('PayTrackerReconciliationConfig.SHEETS.ACTION_ITEMS.NAME');
      const headers = json('PayTrackerReconciliationConfig.SHEETS.ACTION_ITEMS.HEADERS');
      return (sheets[name] ? sheets[name].rows.slice(1) : []).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
    },
    syncRecords() {
      const name = run('PayTrackerReconciliationConfig.SHEETS.CALENDAR_SYNC_RECORDS.NAME');
      const headers = json('PayTrackerReconciliationConfig.SHEETS.CALENDAR_SYNC_RECORDS.HEADERS');
      return (sheets[name] ? sheets[name].rows.slice(1) : []).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
    },
    ROOT
  };
  return api;
}

module.exports = { createSandbox, ROOT };
