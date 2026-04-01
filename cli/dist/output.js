"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printTable = printTable;
exports.printJSON = printJSON;
exports.printSuccess = printSuccess;
exports.printError = printError;
exports.printWarning = printWarning;
function printTable(headers, rows) {
    const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] || '').length)));
    const header = headers.map((h, i) => h.padEnd(colWidths[i])).join('  ');
    const separator = colWidths.map((w) => '\u2500'.repeat(w)).join('  ');
    console.log(`  ${header}`);
    console.log(`  ${separator}`);
    rows.forEach((row) => {
        console.log(`  ${row.map((c, i) => (c || '').padEnd(colWidths[i])).join('  ')}`);
    });
}
function printJSON(data) {
    console.log(JSON.stringify(data, null, 2));
}
function printSuccess(message) {
    console.log(`\u2713 ${message}`);
}
function printError(message) {
    console.error(`\u2717 Error: ${message}`);
}
function printWarning(message) {
    console.error(`\u26A0 ${message}`);
}
//# sourceMappingURL=output.js.map