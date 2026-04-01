export function printTable(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] || '').length)));

  const header = headers.map((h, i) => h.padEnd(colWidths[i])).join('  ');
  const separator = colWidths.map((w) => '\u2500'.repeat(w)).join('  ');

  console.log(`  ${header}`);
  console.log(`  ${separator}`);
  rows.forEach((row) => {
    console.log(`  ${row.map((c, i) => (c || '').padEnd(colWidths[i])).join('  ')}`);
  });
}

export function printJSON(data: any): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printSuccess(message: string): void {
  console.log(`\u2713 ${message}`);
}

export function printError(message: string): void {
  console.error(`\u2717 Error: ${message}`);
}

export function printWarning(message: string): void {
  console.error(`\u26A0 ${message}`);
}
