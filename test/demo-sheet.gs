/**
 * @OnlyCurrentDoc
 * Builds a fake-data demo spreadsheet that exercises everything a Sheets dark mode has to survive:
 * dark + pastel fills, banding, color scales, red negatives, colored text, checkboxes, dropdown chips,
 * sparklines, merged cells, borders, frozen rows, and four chart types. No real data.
 */
function buildDemo() {
  const ss = SpreadsheetApp.getActive();
  ss.rename('Nightcell demo (fake data)');
  let sh = ss.getSheets()[0];
  sh.setName('Budget');
  sh.clear(); sh.clearConditionalFormatRules();
  sh.getCharts().forEach(c => sh.removeChart(c));
  sh.getBandings().forEach(b => b.remove());

  sh.getRange('A1:H1').merge().setValue('Studio budget 2026 (demo data)')
    .setFontSize(18).setFontWeight('bold').setFontColor('#1f2937');
  sh.getRange('A2:H2').merge().setValue('Every number here is made up for testing.').setFontColor('#6b7280').setFontStyle('italic');

  const head = ['Month', 'Food', 'Travel', 'Software', 'Hardware', 'Total', 'vs plan', 'Trend'];
  const rows = [
    ['Jan', 4200, 1800, 2500, 0], ['Feb', 3900, 2600, 2500, 12000], ['Mar', 5100, 900, 3100, 0],
    ['Apr', 4700, 3200, 3100, 4500], ['May', 5300, 1500, 3600, 0], ['Jun', 4100, 4100, 3600, 900],
    ['Jul', 4800, 2200, 3600, 0], ['Aug', 5600, 700, 4200, 2600], ['Sep', 4400, 3900, 4200, 0],
    ['Oct', 5000, 1200, 4200, 7800], ['Nov', 4600, 2800, 4800, 0], ['Dec', 6200, 5200, 4800, 3100]];
  sh.getRange(4, 1, 1, head.length).setValues([head]).setFontWeight('bold')
    .setBackground('#1f2937').setFontColor('#ffffff');
  sh.getRange(5, 1, rows.length, 5).setValues(rows);
  for (let i = 0; i < rows.length; i++) {
    const r = 5 + i;
    sh.getRange(r, 6).setFormula(`=SUM(B${r}:E${r})`);
    sh.getRange(r, 7).setFormula(`=F${r}-15000`);
    sh.getRange(r, 8).setFormula(`=SPARKLINE(B${r}:E${r},{"charttype","column";"color1","#2563eb"})`);
  }
  const last = 4 + rows.length;
  sh.getRange(last + 1, 1).setValue('Total').setFontWeight('bold');
  ['B', 'C', 'D', 'E', 'F', 'G'].forEach((c, k) => sh.getRange(last + 1, 2 + k).setFormula(`=SUM(${c}5:${c}${last})`));
  sh.getRange(last + 1, 1, 1, 8).setBackground('#fff2cc').setFontWeight('bold')
    .setBorder(true, null, true, null, null, null, '#111827', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.getRange(5, 2, rows.length + 1, 6).setNumberFormat('₹#,##0;[Red]-₹#,##0');
  sh.getRange(5, 1, rows.length, 8).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  const rules = sh.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule().setGradientMaxpoint('#f87171').setGradientMidpointWithValue('#fde68a', SpreadsheetApp.InterpolationType.PERCENTILE, '50').setGradientMinpoint('#86efac').setRanges([sh.getRange(5, 6, rows.length, 1)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor('#b91c1c').setBackground('#fee2e2').setRanges([sh.getRange(5, 7, rows.length, 1)]).build());
  sh.setConditionalFormatRules(rules);
  sh.setFrozenRows(4);
  sh.setColumnWidths(1, 8, 110);

  // colour swatches + text colours, checkboxes and chips
  const sw = [['Pastel yellow', '#fff2cc'], ['Pastel green', '#d9ead3'], ['Pastel blue', '#cfe2f3'], ['Pastel red', '#f4cccc'],
              ['Brand blue', '#2563eb'], ['Deep green', '#166534'], ['Purple', '#7c3aed'], ['Black', '#000000']];
  sh.getRange(19, 1).setValue('Fill swatches').setFontWeight('bold');
  sw.forEach(([n, c], i) => {
    const cell = sh.getRange(20 + i, 1);
    cell.setValue(n).setBackground(c);
    if (['#2563eb', '#166534', '#7c3aed', '#000000'].includes(c)) cell.setFontColor('#ffffff');
  });
  const tc = [['Red text', '#dc2626'], ['Green text', '#16a34a'], ['Blue text', '#2563eb'], ['Orange text', '#ea580c'], ['Grey text', '#6b7280']];
  sh.getRange(19, 3).setValue('Text colours').setFontWeight('bold');
  tc.forEach(([n, c], i) => sh.getRange(20 + i, 3).setValue(n).setFontColor(c));
  sh.getRange(19, 5).setValue('Done?').setFontWeight('bold');
  sh.getRange(20, 5, 5, 1).insertCheckboxes();
  sh.getRange(20, 5, 2, 1).check();
  sh.getRange(19, 6).setValue('Status').setFontWeight('bold');
  const dv = SpreadsheetApp.newDataValidation().requireValueInList(['Paid', 'Pending', 'Refunded'], true).build();
  sh.getRange(20, 6, 5, 1).setDataValidation(dv).setValues([['Paid'], ['Pending'], ['Refunded'], ['Paid'], ['Pending']]);
  sh.getRange(19, 7).setValue('Link').setFontWeight('bold');
  sh.getRange(20, 7).setFormula('=HYPERLINK("https://example.com","example.com")');
  sh.getRange(20, 1).setNote('A note on a pastel cell');

  // charts
  const data = sh.getRange(4, 1, rows.length + 1, 5);
  sh.insertChart(sh.newChart().asColumnChart().addRange(data).setStacked().setPosition(29, 1, 0, 0)
    .setOption('title', 'Spend by month').setOption('width', 620).setOption('height', 340).build());
  sh.insertChart(sh.newChart().asPieChart().addRange(sh.getRange(4, 2, 1, 4)).addRange(sh.getRange(last + 1, 2, 1, 4))
    .setTransposeRowsAndColumns(true).setOption('pieHole', 0.5).setOption('title', 'Share of spend')
    .setPosition(29, 7, 0, 0).setOption('width', 420).setOption('height', 340).build());
  sh.insertChart(sh.newChart().asLineChart().addRange(sh.getRange(4, 1, rows.length + 1, 1)).addRange(sh.getRange(4, 6, rows.length + 1, 1))
    .setOption('title', 'Total per month').setPosition(47, 1, 0, 0).setOption('width', 620).setOption('height', 300).build());
  sh.insertChart(sh.newChart().asBarChart().addRange(data).setPosition(47, 7, 0, 0)
    .setOption('title', 'Category bars').setOption('width', 420).setOption('height', 300).build());
  return 'demo built';
}
