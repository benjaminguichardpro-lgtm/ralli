import { strToU8, zipSync } from "fflate";

// Modèle Excel (.xlsx) de l'import des joueurs. TOUTES les colonnes sont en format « Texte » (numFmtId 49) : sans cela, Excel et Numbers
// transforment « 30/2 » en 15 (une division) ou en date, et le classement est perdu. Les 300 premières lignes sont préformatées en texte.

const HEADERS = ["Nom", "Prénom", "Date de naissance", "Classement"];
const EXAMPLES = [
  ["Dupont", "Camille", "14/03/1987", "30/2"],
  ["Martin", "Léa", "02/11/1995", "NC"],
  ["Bernard", "Thomas", "21/07/1979", "15/4"],
];
const PREFORMATTED_ROWS = 300;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const col = (i: number) => String.fromCharCode(65 + i);

/** Contenu du fichier .xlsx du modèle (un classeur est un zip de fichiers XML). */
export function buildPlayersTemplateXlsx(): Uint8Array {
  const text = (ref: string, value: string, style: number) => `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
  const rows: string[] = [];
  rows.push(`<row r="1">${HEADERS.map((h, j) => text(`${col(j)}1`, h, 2)).join("")}</row>`);
  EXAMPLES.forEach((r, i) => rows.push(`<row r="${i + 2}">${r.map((v, j) => text(`${col(j)}${i + 2}`, v, 1)).join("")}</row>`));
  for (let n = EXAMPLES.length + 2; n <= PREFORMATTED_ROWS; n++) rows.push(`<row r="${n}">${HEADERS.map((_, j) => `<c r="${col(j)}${n}" s="1"/>`).join("")}</row>`);

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="2" width="20" style="1" customWidth="1"/><col min="3" max="3" width="20" style="1" customWidth="1"/><col min="4" max="4" width="14" style="1" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs></styleSheet>`;
  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Joueurs" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(styles),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}
