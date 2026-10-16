// نص ملف Word (.docx) — word/document.xml بلا وسوم، وكل فقرة سطر.
// كان في request-summary وحده؛ صار مشتركاً مع research-source («الباحث» 2026-10-16).
// @deno-types="https://esm.sh/jszip@3.10.1/index.d.ts"
import * as JSZipNS from "https://esm.sh/jszip@3.10.1";
// deno-lint-ignore no-explicit-any
const JSZip: any = (JSZipNS as any).default ?? JSZipNS;

export async function docxText(u8: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(u8);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .trim();
}
