import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "outputs/customer_storage";
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Customers");
sheet.showGridLines = false;

sheet.getRange("A1:I1").values = [["Customer ID", "Created At (UTC)", "Name", "Company", "Email", "Phone", "Requirement", "Source", "Status"]];
sheet.getRange("A1:I1").format = {
  fill: "#0B2949",
  font: { bold: true, color: "#FFFFFF", size: 11 },
  verticalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: "#0B2949" },
};
sheet.getRange("A1:I1").format.rowHeight = 28;
sheet.getRange("A:A").format.columnWidth = 22;
sheet.getRange("B:B").format.columnWidth = 23;
sheet.getRange("C:D").format.columnWidth = 24;
sheet.getRange("E:E").format.columnWidth = 30;
sheet.getRange("F:F").format.columnWidth = 18;
sheet.getRange("G:G").format.columnWidth = 55;
sheet.getRange("H:I").format.columnWidth = 17;
sheet.freezePanes.freezeRows(1);

const preview = await workbook.render({ sheetName: "Customers", range: "A1:I5", scale: 1.5, format: "png" });
await fs.writeFile(`${outputDir}/customers-preview.png`, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/customers.xlsx`);

const inspect = await workbook.inspect({ kind: "table", range: "Customers!A1:I5", include: "values,formulas", tableMaxRows: 5, tableMaxCols: 9 });
console.log(inspect.ndjson);
