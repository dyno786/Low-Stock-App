// CC Stock Import — Warehouse (BR04)
// Paste this into the Warehouse Google Sheet Apps Script
// Extensions → Apps Script → delete everything → paste → Save → Run importWarehouse → Authorize

var WAREHOUSE_CSV_ID = '1UDTLpZ9mJidGZejGHt724iqc57zhcuf4';

function importWarehouse() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // ── STOCK DATA SHEET ─────────────────────────────────────
  var stockSheet = ss.getSheetByName('StockData');
  if (!stockSheet) stockSheet = ss.insertSheet('StockData');
  
  try {
    var file = DriveApp.getFileById(WAREHOUSE_CSV_ID);
    var csvContent = file.getBlob().getDataAsString();
    var csvData = Utilities.parseCsv(csvContent);
    
    if (csvData.length < 2) {
      logImport('ERROR', 0, 'CSV is empty', '');
      return;
    }
    
    var t0 = new Date();
    stockSheet.clearContents();
    stockSheet.getRange(1, 1, csvData.length, csvData[0].length).setValues(csvData);
    var duration = ((new Date() - t0) / 1000).toFixed(1) + 's';
    var rowCount = csvData.length - 1;
    
    logImport('OK', rowCount, '', duration);
    Logger.log('Warehouse import done: ' + rowCount + ' rows in ' + duration);
    
  } catch(e) {
    logImport('ERROR', 0, e.message, '');
    Logger.log('Warehouse import failed: ' + e.message);
  }
}

// ── IMPORT LOG ───────────────────────────────────────────────
function logImport(status, rowCount, errorMsg, duration) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName('ImportLog');
  if (!logSheet) logSheet = ss.insertSheet('ImportLog');
  
  // Headers on first run
  if (logSheet.getLastRow() === 0) {
    logSheet.getRange(1,1,1,5).setValues([['RunTime','CSVModified','Rows','Status','Duration']]);
  }
  
  var now = Utilities.formatDate(new Date(), 'Europe/London', 'dd/MM/yyyy HH:mm:ss');
  var csvMod = '';
  try {
    var file = DriveApp.getFileById(WAREHOUSE_CSV_ID);
    csvMod = Utilities.formatDate(file.getLastUpdated(), 'Europe/London', 'dd/MM/yyyy HH:mm:ss');
  } catch(e) {}
  
  logSheet.insertRowAfter(1);
  logSheet.getRange(2,1,1,5).setValues([[now, csvMod, rowCount, status || 'OK', duration]]);
  
  // Keep last 100 log entries
  if (logSheet.getLastRow() > 101) {
    logSheet.deleteRows(102, logSheet.getLastRow() - 101);
  }
}

// ── TRIGGERS ────────────────────────────────────────────────
function createTriggers() {
  // Delete existing triggers first
  ScriptApp.getProjectTriggers().forEach(function(t) {
    ScriptApp.deleteTrigger(t);
  });
  
  // Run every 30 minutes
  ScriptApp.newTrigger('importWarehouse')
    .timeBased()
    .everyMinutes(30)
    .create();
  
  Logger.log('Trigger created — importWarehouse runs every 30 minutes');
}
