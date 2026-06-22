/**
 * PICCO FEED WATCHDOG — standalone Apps Script project (keep it separate from the importers).
 *
 * Every CHECK_EVERY_MIN minutes it opens each branch's picco sheet, finds the newest scan,
 * and emails ALERT_EMAIL when a feed has gone STALE (no new scan within STALE_HOURS),
 * EMPTY (sheet wiped), or unreadable — and again when it RECOVERS. It tracks state between
 * runs, so you get ONE email when a branch breaks and ONE when it's back — never a flood.
 *
 * SETUP (once):
 *   1. Paste this into a new Apps Script project (script.google.com → New project).
 *   2. Run `statusReport` once — approve the permissions prompt, then check the execution log
 *      to confirm it can read every branch and see today's newest scan.
 *   3. Run `sendTestEmail` once to confirm the email lands at ALERT_EMAIL.
 *   4. Run `createWatchdogTrigger` once to start the every-30-min checks.
 */

// ---- EDIT THESE ----
var ALERT_EMAIL     = 'cchnborders@gmail.com';
var STALE_HOURS     = 3;     // alert if a branch has had no new scan for this many hours (you wanted ~3–6)
var EMPTY_BELOW     = 50;    // a sheet with fewer rows than this = wiped/empty
var CHECK_EVERY_MIN = 30;    // how often the watchdog runs (1, 5, 10, 15 or 30)

// Branch picco SHEETS — the same ones the dashboard reads.
var BRANCHES = [
  { name: 'Roundhay',    sheetId: '1XmZ8sl6T8cT-Iuwp1uB-eXths121GIW2zU9bDCpc-IQ' },
  { name: 'City Centre', sheetId: '1n-Xb3Zowb7J-FQ9rjZrChCrSC7UFT3iscFGPnjfWxas' },
  { name: 'Chapeltown',  sheetId: '10o97Gmcoa41MglKmIQb8bkTnCyHb5Qqix9znu8WBDRg' },
  { name: 'Warehouse',   sheetId: '1f9uvQSTJo9Rns6lniUJ0sZZIwZVIGQhpUCpAHSdC4vs' }
];

var DATE_COL = 2;  // 'Date' is column B in the picco layout (TransactionID, Date, ...)
// --------------------

/** Main check — this is what the trigger runs. */
function checkFeeds() {
  var props = PropertiesService.getScriptProperties();
  var problems = [], recovered = [];

  for (var i = 0; i < BRANCHES.length; i++) {
    var b = BRANCHES[i];
    var st = statusFor(b);                 // {state, detail, ageH}
    var key = 'state_' + b.name;
    var prev = props.getProperty(key) || 'ok';

    if (st.state !== 'ok' && prev === 'ok') problems.push({ b: b, st: st });
    if (st.state === 'ok' && prev !== 'ok') recovered.push({ b: b });

    props.setProperty(key, st.state);
    Logger.log('%s: %s %s', b.name, st.state, st.detail || ('age ' + (st.ageH != null ? st.ageH.toFixed(1) + 'h' : '?')));
  }

  if (problems.length)  emailProblems(problems);
  if (recovered.length) emailRecovered(recovered);
}

/** Inspect one branch sheet → {state:'ok'|'stale'|'empty'|'error', detail, ageH}. */
function statusFor(b) {
  try {
    var sheet = SpreadsheetApp.openById(b.sheetId).getSheets()[0];
    var last = sheet.getLastRow();
    if (last - 1 < EMPTY_BELOW) return { state: 'empty', detail: (last - 1) + ' rows' };

    var vals = sheet.getRange(2, DATE_COL, last - 1, 1).getValues();
    var max = null;
    for (var i = 0; i < vals.length; i++) {
      var d = parseDate(vals[i][0]);
      if (d && (!max || d > max)) max = d;
    }
    if (!max) return { state: 'error', detail: 'no readable dates in column ' + DATE_COL };

    var ageH = (Date.now() - max.getTime()) / 3600000;
    if (ageH > STALE_HOURS) return { state: 'stale', detail: 'newest ' + fmt(max), ageH: ageH };
    return { state: 'ok', ageH: ageH };
  } catch (e) {
    return { state: 'error', detail: String(e && e.message || e) };
  }
}

/** Accepts a Date cell or a "2026-06-20 19:03:41" string. */
function parseDate(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (v == null || v === '') return null;
  var s = String(v).trim().replace(/-/g, '/').replace('T', ' ');
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function fmt(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'EEE d MMM HH:mm');
}

function emailProblems(list) {
  var lines = list.map(function (p) {
    var s = p.st;
    if (s.state === 'stale') return '• ' + p.b.name + ' — FROZEN: no new scan for ' + s.ageH.toFixed(1) + 'h (' + s.detail + ')';
    if (s.state === 'empty') return '• ' + p.b.name + ' — EMPTY: ' + s.detail + ' (an import may have wiped it)';
    return '• ' + p.b.name + ' — ERROR: ' + s.detail;
  });
  var subject = 'PICCO feed alert — ' + list.length + ' branch' + (list.length > 1 ? 'es' : '') + ' need attention';
  var body = 'A PICCO feed has stopped updating:\n\n' + lines.join('\n') +
    '\n\nThreshold: no new scan within ' + STALE_HOURS + 'h.\n' +
    'Likely fix: run the branch PC export so its picco.csv refreshes, then the importer carries it through.\n\n— PICCO watchdog';
  MailApp.sendEmail(ALERT_EMAIL, subject, body);
}

function emailRecovered(list) {
  var names = list.map(function (x) { return x.b.name; });
  MailApp.sendEmail(ALERT_EMAIL,
    'PICCO feed recovered — ' + names.join(', '),
    'Back to normal: ' + names.join(', ') + ' ' + (names.length > 1 ? 'are' : 'is') + ' updating again.\n\n— PICCO watchdog');
}

/** Run manually anytime — logs the live state of every branch (no email unless a state changed). */
function statusReport() {
  for (var i = 0; i < BRANCHES.length; i++) {
    var b = BRANCHES[i], st = statusFor(b);
    Logger.log('%s → %s %s', b.name, st.state.toUpperCase(),
      st.detail || ('(newest ' + (st.ageH != null ? st.ageH.toFixed(1) + 'h ago' : '?') + ')'));
  }
}

/** Run once to confirm email delivery works. */
function sendTestEmail() {
  MailApp.sendEmail(ALERT_EMAIL, 'PICCO watchdog — test',
    'This is a test from the PICCO feed watchdog. If you got this, alerts will reach you.\n\n— PICCO watchdog');
}

/** Run ONCE to start the every-30-min checks (replaces any previous checkFeeds trigger). */
function createWatchdogTrigger() {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === 'checkFeeds') ScriptApp.deleteTrigger(ts[i]);
  }
  ScriptApp.newTrigger('checkFeeds').timeBased().everyMinutes(CHECK_EVERY_MIN).create();
  Logger.log('Watchdog trigger set: checkFeeds every %s min, alerting %s.', CHECK_EVERY_MIN, ALERT_EMAIL);
}
