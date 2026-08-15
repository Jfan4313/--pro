import * as XLSX from "xlsx";
import type { MaterialImportType } from "./types";

const templateHeaders: Record<MaterialImportType, { headers: string[]; filename: string }> = {
  BOM: {
    headers: ["材料编号", "材料名称", "规格型号", "方案计划数量", "单位", "所属项目"],
    filename: "材料清单(BOM)导入模板.xlsx",
  },
  PO: {
    headers: ["材料编号", "采购数量", "供应商"],
    filename: "采购单导入模板.xlsx",
  },
  INVENTORY: {
    headers: ["材料编号", "材料名称", "规格型号", "入库数量", "单位", "存放区域", "供应商", "来源项目", "材料类型", "入库时间"],
    filename: "入库登记导入模板.xlsx",
  },
  PRICE: {
    headers: ["材料编号", "材料名称", "规格型号", "单价", "单位", "登记日期", "供应商"],
    filename: "价格登记导入模板.xlsx",
  },
};

const validators: Record<MaterialImportType, Array<{ field: string; message: string; numeric?: boolean }>> = {
  BOM: [
    { field: "材料编号", message: "缺少材料编号" },
    { field: "方案计划数量", message: "计划数量无效", numeric: true },
  ],
  PO: [
    { field: "材料编号", message: "缺少材料编号" },
    { field: "采购数量", message: "采购数量无效", numeric: true },
  ],
  INVENTORY: [
    { field: "材料编号", message: "缺少材料编号" },
    { field: "入库数量", message: "入库数量无效", numeric: true },
  ],
  PRICE: [
    { field: "材料编号", message: "缺少材料编号" },
    { field: "单价", message: "单价无效", numeric: true },
  ],
};

function readAsBinaryString(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsBinaryString(file);
  });
}

function parseRows(binaryString: string) {
  const workbook = XLSX.read(binaryString, { type: "binary" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet);
}

function validateRows(type: MaterialImportType, rows: any[]) {
  return rows.map((row: any, index) => {
    const errors = validators[type]
      .filter((rule) => !row[rule.field] || (rule.numeric && isNaN(Number(row[rule.field]))))
      .map((rule) => rule.message);
    return { ...row, _errors: errors, _rowIndex: index + 1 };
  });
}

export async function readMaterialImportFile(file: File, type: MaterialImportType) {
  const binaryString = await readAsBinaryString(file);
  return validateRows(type, parseRows(binaryString));
}

export function downloadMaterialTemplate(type: MaterialImportType) {
  const template = templateHeaders[type];
  const sheet = XLSX.utils.aoa_to_sheet([template.headers]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  XLSX.writeFile(workbook, template.filename);
}
