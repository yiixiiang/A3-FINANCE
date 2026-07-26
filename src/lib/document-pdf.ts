import { calculateDocumentTotals, type DocumentKind, type FinancialDocumentRecord } from "@/lib/finance-records";

export type PdfCompanyIdentity = {
  company: string;
  companyType?: string;
  uen: string;
  gst: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  accentColour?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankBranchCode?: string;
  bankSwiftCode?: string;
  payNowType?: string;
  payNowValue?: string;
  paymentInstructions?: string;
  logoData?: string;
  chopData?: string;
  logoWidth?: number;
  logoHeight?: number;
  chopWidth?: number;
  chopHeight?: number;
};

export type ShareChannel = "whatsapp" | "wechat" | "telegram";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 48;
const RIGHT = PAGE_WIDTH - 48;
const BOTTOM = 54;

type DrawCommand =
  | { type: "text"; x: number; y: number; value: string; size: number; bold: boolean; color?: string }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; width: number; color?: string }
  | { type: "rect"; x: number; y: number; width: number; height: number; fill?: string; stroke?: string; lineWidth?: number }
  | { type: "image"; x: number; y: number; width: number; height: number; data: string; fallback?: string };
type PdfPage = { commands: DrawCommand[] };

function safeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "");
}

/** Encode text as UTF-16BE for the PDF UniGB-UCS2-H CJK font. */
function encodePdfText(value: string): string {
  const text = safeText(value);
  let hex = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    // UniGB-UCS2-H supports BMP characters. Replace isolated surrogate pairs safely.
    if (code >= 0xd800 && code <= 0xdfff) {
      hex += "003f";
      if (code <= 0xdbff && index + 1 < text.length && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) index += 1;
      continue;
    }
    hex += code.toString(16).padStart(4, "0");
  }
  return `<${hex}>`;
}

function characterWidth(character: string, size: number): number {
  return /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(character) ? size : size * 0.52;
}

function approximateWidth(text: string, size: number): number {
  return [...safeText(text)].reduce((width, character) => width + characterWidth(character, size), 0);
}

function wrapText(text: string, maxChars: number): string[] {
  const clean = safeText(text).trim();
  if (!clean) return [""];
  const maxUnits = Math.max(1, maxChars);
  const output: string[] = [];

  for (const sourceLine of clean.split("\n")) {
    if (!sourceLine.trim()) {
      output.push("");
      continue;
    }
    let current = "";
    let units = 0;
    const flush = () => {
      if (current.trim()) output.push(current.trimEnd());
      current = "";
      units = 0;
    };
    for (const character of sourceLine) {
      const charUnits = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(character) ? 2 : 1;
      if (units + charUnits > maxUnits && current) flush();
      current += character;
      units += charUnits;
    }
    flush();
  }
  return output.length ? output : [""];
}

class PdfDocumentBuilder {
  private pages: PdfPage[] = [{ commands: [] }];
  private pageIndex = 0;
  private y = PAGE_HEIGHT - 52;

  private get page(): PdfPage {
    return this.pages[this.pageIndex];
  }

  private ensureSpace(height: number, continuationTitle?: string): void {
    if (this.y - height >= BOTTOM) return;
    this.addPage();
    if (continuationTitle) {
      this.text(LEFT, this.y, continuationTitle, 13, true);
      this.y -= 24;
      this.line(LEFT, this.y + 8, RIGHT, this.y + 8, 0.7);
    }
  }

  addPage(): void {
    this.pages.push({ commands: [] });
    this.pageIndex += 1;
    this.y = PAGE_HEIGHT - 52;
  }

  get cursorY(): number {
    return this.y;
  }

  set cursorY(value: number) {
    this.y = value;
  }

  text(x: number, y: number, value: string, size = 10, bold = false, color?: string): void {
    this.page.commands.push({ type: "text", x, y, value: safeText(value), size, bold, color });
  }

  rightText(x: number, y: number, value: string, size = 10, bold = false, color?: string): void {
    this.text(x - approximateWidth(value, size), y, value, size, bold, color);
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.5, color?: string): void {
    this.page.commands.push({ type: "line", x1, y1, x2, y2, width, color });
  }

  rect(x: number, y: number, width: number, height: number, fill?: string, stroke?: string, lineWidth = 0.5): void {
    this.page.commands.push({ type: "rect", x, y, width, height, fill, stroke, lineWidth });
  }

  image(x: number, y: number, width: number, height: number, data: string, fallback?: string): void {
    if (data) this.page.commands.push({ type: "image", x, y, width, height, data, fallback });
  }

  paragraph(text: string, options: { size?: number; bold?: boolean; maxChars?: number; lineHeight?: number; indent?: number; continuationTitle?: string } = {}): void {
    const size = options.size ?? 10;
    const lineHeight = options.lineHeight ?? size + 4;
    const lines = wrapText(text, options.maxChars ?? 82);
    for (const line of lines) {
      this.ensureSpace(lineHeight + 2, options.continuationTitle);
      this.text(LEFT + (options.indent ?? 0), this.y, line, size, options.bold ?? false);
      this.y -= lineHeight;
    }
  }

  heading(text: string, size = 17): void {
    this.ensureSpace(size + 18);
    this.text(LEFT, this.y, text, size, true);
    this.y -= size + 9;
  }

  spacer(height: number): void {
    this.ensureSpace(height);
    this.y -= height;
  }

  reserve(height: number, continuationTitle?: string): void {
    this.ensureSpace(height, continuationTitle);
  }

  tableHeader(columns: Array<{ label: string; x: number; align?: "left" | "right" }>, continuationTitle?: string): void {
    this.ensureSpace(28, continuationTitle);
    this.line(LEFT, this.y + 9, RIGHT, this.y + 9, 0.9);
    columns.forEach(column => {
      if (column.align === "right") this.rightText(column.x, this.y - 4, column.label, 9, true);
      else this.text(column.x, this.y - 4, column.label, 9, true);
    });
    this.y -= 32;
    this.line(LEFT, this.y + 12, RIGHT, this.y + 12, 0.5);
  }

  tableRow(cells: Array<{ value: string; x: number; align?: "left" | "right"; bold?: boolean }>, height = 28, continuationTitle?: string): void {
    this.ensureSpace(height + 6, continuationTitle);
    cells.forEach(cell => {
      if (cell.align === "right") this.rightText(cell.x, this.y, cell.value, 9, Boolean(cell.bold));
      else this.text(cell.x, this.y, cell.value, 9, Boolean(cell.bold));
    });
    this.y -= height;
    this.line(LEFT, this.y + 14, RIGHT, this.y + 14, 0.25);
  }

  async build(): Promise<Blob> {
    if (typeof document === "undefined") throw new Error("PDF generation requires a browser.");

    // Decode all uploaded company assets before painting the PDF canvas. Drawing a
    // newly-created Image synchronously can omit a logo or chop on the first export.
    const uniqueImageData = Array.from(new Set(
      this.pages.flatMap(page => page.commands)
        .filter((command): command is Extract<DrawCommand, { type: "image" }> => command.type === "image")
        .map(command => command.data)
        .filter(Boolean),
    ));
    const imageCache = new Map<string, HTMLImageElement | null>();
    await Promise.all(uniqueImageData.map(async data => {
      const image = new Image();
      image.decoding = "sync";
      const loaded = await new Promise<HTMLImageElement | null>(resolve => {
        let settled = false;
        const finish = (value: HTMLImageElement | null) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        image.onload = () => finish(image);
        image.onerror = () => finish(null);
        image.src = data;
        if (image.complete && image.naturalWidth > 0) finish(image);
        else if (typeof image.decode === "function") image.decode().then(() => finish(image)).catch(() => undefined);
      });
      imageCache.set(data, loaded);
    }));

    const scale = 2;
    const images = this.pages.map(page => {
      const canvas = document.createElement("canvas");
      canvas.width = PAGE_WIDTH * scale;
      canvas.height = PAGE_HEIGHT * scale;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable.");
      context.scale(scale, scale);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      context.fillStyle = "#111111";
      context.strokeStyle = "#222222";
      context.textBaseline = "alphabetic";
      for (const command of page.commands) {
        if (command.type === "rect") {
          const top = PAGE_HEIGHT - command.y - command.height;
          if (command.fill) { context.fillStyle = command.fill; context.fillRect(command.x, top, command.width, command.height); }
          if (command.stroke) { context.strokeStyle = command.stroke; context.lineWidth = command.lineWidth || 0.5; context.strokeRect(command.x, top, command.width, command.height); }
          context.fillStyle = "#111111"; context.strokeStyle = "#222222";
          continue;
        }
        if (command.type === "line") {
          context.strokeStyle = command.color || "#222222";
          context.lineWidth = command.width;
          context.beginPath();
          context.moveTo(command.x1, PAGE_HEIGHT - command.y1);
          context.lineTo(command.x2, PAGE_HEIGHT - command.y2);
          context.stroke();
          context.strokeStyle = "#222222";
          continue;
        }
        if (command.type === "image") {
          const top = PAGE_HEIGHT - command.y - command.height;
          const image = imageCache.get(command.data);
          if (image && image.naturalWidth > 0) {
            context.drawImage(image, command.x, top, command.width, command.height);
          } else {
            context.save();
            context.strokeStyle = "#9b1c31";
            context.lineWidth = 1.2;
            context.strokeRect(command.x, top, command.width, command.height);
            context.font = `700 9px Arial, "Microsoft YaHei", "PingFang SC", sans-serif`;
            context.fillStyle = "#9b1c31";
            context.textAlign = "center";
            context.fillText(command.fallback || "COMPANY CHOP", command.x + command.width / 2, top + command.height / 2);
            context.textAlign = "left";
            context.restore();
          }
          continue;
        }
        context.font = `${command.bold ? "700" : "400"} ${command.size}px Arial, "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif`;
        context.fillStyle = command.color || "#111111";
        context.fillText(command.value, command.x, PAGE_HEIGHT - command.y);
        context.fillStyle = "#111111";
      }
      const base64 = canvas.toDataURL("image/jpeg", 0.96).split(",")[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return { bytes, width: canvas.width, height: canvas.height };
    });

    const encoder = new TextEncoder();
    const objectCount = 2 + images.length * 3;
    const objects: Array<Uint8Array | undefined> = new Array(objectCount + 1);
    objects[1] = encoder.encode("<< /Type /Catalog /Pages 2 0 R >>");
    const pageIds = images.map((_, index) => 3 + index * 3);
    objects[2] = encoder.encode(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
    images.forEach((image, index) => {
      const pageId = pageIds[index];
      const imageId = pageId + 1;
      const contentId = pageId + 2;
      objects[pageId] = encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
      const imageHeader = encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`);
      const imageFooter = encoder.encode("\nendstream");
      const imageObject = new Uint8Array(imageHeader.length + image.bytes.length + imageFooter.length);
      imageObject.set(imageHeader, 0); imageObject.set(image.bytes, imageHeader.length); imageObject.set(imageFooter, imageHeader.length + image.bytes.length);
      objects[imageId] = imageObject;
      const content = `q ${PAGE_WIDTH} 0 0 ${PAGE_HEIGHT} 0 0 cm /Im0 Do Q`;
      objects[contentId] = encoder.encode(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    });

    const chunks: Uint8Array[] = [encoder.encode("%PDF-1.4\n%âãÏÓ\n")];
    const offsets = new Array(objectCount + 1).fill(0);
    let length = chunks[0].length;
    for (let id = 1; id <= objectCount; id += 1) {
      offsets[id] = length;
      const header = encoder.encode(`${id} 0 obj\n`);
      const footer = encoder.encode("\nendobj\n");
      const body = objects[id] ?? encoder.encode("<<>>");
      chunks.push(header, body, footer);
      length += header.length + body.length + footer.length;
    }
    const xrefOffset = length;
    let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= objectCount; id += 1) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    xref += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    chunks.push(encoder.encode(xref));
    const blobParts: BlobPart[] = chunks.map(chunk => {
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      return copy.buffer;
    });
    return new Blob(blobParts, { type: "application/pdf" });
  }
}

function currencyFormatter(company: PdfCompanyIdentity): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: company.currency || "SGD", minimumFractionDigits: 2 });
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "SGD", minimumFractionDigits: 2 });
  }
}

function documentDescription(record: FinancialDocumentRecord): string {
  const itemDescriptions = record.items.map(item => item.description.trim()).filter(Boolean);
  return itemDescriptions.length ? itemDescriptions.join("; ") : record.notes || "Services rendered";
}

function addCompanyHeader(builder: PdfDocumentBuilder, company: PdfCompanyIdentity, title: string, subtitle: string): void {
  const top = builder.cursorY + 22;
  builder.rect(LEFT, top - 72, RIGHT - LEFT, 72, "#172033");
  if (company.logoData) builder.image(LEFT + 14, top - 62, Math.min(company.logoWidth || 44, 58), Math.min(company.logoHeight || 44, 52), company.logoData, "LOGO");
  const companyTextX = company.logoData ? LEFT + 82 : LEFT + 18;
  builder.text(companyTextX, top - 27, company.company || "Company", 18, true, "#ffffff");
  builder.text(companyTextX, top - 47, [company.uen ? `UEN ${company.uen}` : "", company.gst ? `GST ${company.gst}` : ""].filter(Boolean).join("  •  "), 8, false, "#dbe4f0");
  builder.rightText(RIGHT - 18, top - 28, title, 22, true);
  builder.rightText(RIGHT - 18, top - 49, subtitle, 10, true);
  builder.cursorY = top - 91;
  const contact = [company.address, company.phone, company.email].filter(Boolean).join("  •  ");
  if (contact) builder.paragraph(contact, { size: 8, maxChars: 112, lineHeight: 11 });
  builder.line(LEFT, builder.cursorY + 4, RIGHT, builder.cursorY + 4, 1.2, "#172033");
  builder.spacer(14);
}

const LABELS = {
  EN: { invoice:"INVOICE", quotation:"QUOTATION", date:"Issue date", due:"Payment due", valid:"Valid until", status:"Status", documentNo:"Document no.", billTo:"BILL TO", preparedFor:"PREPARED FOR", contact:"Contact", description:"SERVICE DESCRIPTION", qty:"QTY", rate:"RATE", amount:"AMOUNT", lineSubtotal:"Line subtotal", discount:"Discount", subtotal:"Subtotal", total:"AMOUNT DUE", notes:"NOTES", terms:"TERMS & CONDITIONS", payment:"PAYMENT DETAILS", bank:"Bank", accountName:"Account name", accountNo:"Account number", branch:"Branch code", swift:"SWIFT / BIC", paynow:"PayNow", thanks:"Thank you for your business.", continued:"continued" },
  ZH: { invoice:"发票", quotation:"报价单", date:"开具日期", due:"付款日期", valid:"有效期至", status:"状态", documentNo:"文件编号", billTo:"账单客户", preparedFor:"报价客户", contact:"联系人", description:"服务项目", qty:"数量", rate:"单价", amount:"金额", lineSubtotal:"项目小计", discount:"折扣", subtotal:"小计", total:"应付金额", notes:"备注", terms:"条款与条件", payment:"付款资料", bank:"银行", accountName:"账户名称", accountNo:"账号", branch:"分行代码", swift:"SWIFT / BIC", paynow:"PayNow", thanks:"感谢您的惠顾。", continued:"续页" }
} as const;

export async function createDocumentPdf(record: FinancialDocumentRecord, kind: DocumentKind, company: PdfCompanyIdentity): Promise<File> {
  const builder = new PdfDocumentBuilder();
  const formatter = currencyFormatter(company);
  const totals = calculateDocumentTotals(record);
  const labels = LABELS[record.language === "ZH" ? "ZH" : "EN"];
  const title = kind === "invoice" ? labels.invoice : labels.quotation;
  const isLimousineQuotation = kind === "quotation" && company.companyType === "Limousine Company";
  const navy = "#12233f";
  const blue = company.accentColour || "#2563eb";
  const pale = "#f5f7fb";
  const border = "#d8dfeb";
  const muted = "#5d6b80";

  // Premium corporate masthead.
  const headerTop = builder.cursorY + 22;
  builder.rect(LEFT, headerTop - 86, RIGHT - LEFT, 86, navy);
  builder.rect(LEFT, headerTop - 86, 7, 86, blue);
  if (company.logoData) builder.image(LEFT + 18, headerTop - 70, Math.min(company.logoWidth || 54, 68), Math.min(company.logoHeight || 48, 56), company.logoData, "LOGO");
  const companyX = company.logoData ? LEFT + 100 : LEFT + 24;
  builder.text(companyX, headerTop - 31, company.company || "Company", 19, true, "#ffffff");
  const registration = [company.uen ? `UEN ${company.uen}` : "", company.gst ? `GST ${company.gst}` : ""].filter(Boolean).join("  •  ");
  if (registration) builder.text(companyX, headerTop - 52, registration, 8, false, "#cbd5e1");
  builder.rightText(RIGHT - 20, headerTop - 33, title, 24, true, "#ffffff");
  builder.rightText(RIGHT - 20, headerTop - 57, record.documentNo, 10, true, "#dbeafe");
  builder.cursorY = headerTop - 103;
  const contact = [company.address, company.phone, company.email].filter(Boolean).join("  •  ");
  if (contact) builder.paragraph(contact, { size: 8, maxChars: 112, lineHeight: 11 });
  builder.spacer(10);

  // Document metadata strip.
  builder.reserve(62, `${title} ${record.documentNo} - ${labels.continued}`);
  const metaTop = builder.cursorY + 5;
  builder.rect(LEFT, metaTop - 52, RIGHT - LEFT, 52, pale, border, 0.7);
  const meta = [
    [labels.documentNo, record.documentNo],
    [labels.date, record.date],
    [kind === "invoice" ? labels.due : labels.valid, kind === "invoice" ? (record.dueDate || "-") : (record.validUntil || "-")],
    [labels.status, record.status],
  ];
  const metaWidth = (RIGHT - LEFT) / 4;
  meta.forEach(([label, value], index) => {
    const x = LEFT + 13 + index * metaWidth;
    builder.text(x, metaTop - 17, label.toUpperCase(), 7, true, muted);
    builder.text(x, metaTop - 36, value, 9, true, navy);
    if (index > 0) builder.line(LEFT + index * metaWidth, metaTop - 43, LEFT + index * metaWidth, metaTop - 9, 0.5, border);
  });
  builder.cursorY = metaTop - 70;

  // Customer card.
  const clientLines = [record.clientName, [record.clientContact, record.clientPhone].filter(Boolean).join(" | "), record.clientUen ? `UEN: ${record.clientUen}` : "", record.clientAddress].filter(Boolean);
  const clientHeight = Math.max(84, 34 + clientLines.length * 14);
  builder.reserve(clientHeight + 18, `${title} ${record.documentNo} - ${labels.continued}`);
  builder.rect(LEFT, builder.cursorY - clientHeight + 8, RIGHT - LEFT, clientHeight, "#ffffff", border, 0.8);
  builder.rect(LEFT, builder.cursorY - clientHeight + 8, 7, clientHeight, blue);
  builder.text(LEFT + 20, builder.cursorY - 12, kind === "invoice" ? labels.billTo : labels.preparedFor, 8, true, blue);
  builder.cursorY -= 31;
  clientLines.forEach((line, index) => {
    builder.text(LEFT + 20, builder.cursorY, line, index === 0 ? 11 : 9, index === 0, index === 0 ? navy : muted);
    builder.cursorY -= index === 0 ? 17 : 14;
  });
  builder.cursorY -= 20;

  // Service table with a high-contrast header.
  builder.reserve(42, `${title} ${record.documentNo} - ${labels.continued}`);
  const headerY = builder.cursorY + 8;
  builder.rect(LEFT, headerY - 30, RIGHT - LEFT, 30, navy);
  builder.text(LEFT + 12, headerY - 19, labels.description, 8, true, "#ffffff");
  builder.rightText(392, headerY - 19, labels.qty, 8, true, "#ffffff");
  builder.rightText(470, headerY - 19, labels.rate, 8, true, "#ffffff");
  builder.rightText(RIGHT - 10, headerY - 19, labels.amount, 8, true, "#ffffff");
  builder.cursorY = headerY - 43;

  record.items.forEach((item, itemIndex) => {
    const descriptionLines = wrapText(item.description, 47);
    const rowHeight = Math.max(34, descriptionLines.length * 14 + 14);
    builder.reserve(rowHeight + 12, `${title} ${record.documentNo} - ${labels.continued}`);
    const rowTop = builder.cursorY + 9;
    if (itemIndex % 2 === 1) builder.rect(LEFT, rowTop - rowHeight, RIGHT - LEFT, rowHeight, "#fafbfe");
    descriptionLines.forEach((description, lineIndex) => {
      builder.text(LEFT + 12, builder.cursorY, description, 9, lineIndex === 0, lineIndex === 0 ? navy : muted);
      if (lineIndex === 0) {
        builder.rightText(392, builder.cursorY, String(item.quantity), 9, false, navy);
        builder.rightText(470, builder.cursorY, formatter.format(item.rate), 9, false, navy);
        builder.rightText(RIGHT - 10, builder.cursorY, formatter.format(item.quantity * item.rate), 9, true, navy);
      }
      builder.cursorY -= 14;
    });
    builder.cursorY = rowTop - rowHeight - 5;
    builder.line(LEFT, builder.cursorY + 10, RIGHT, builder.cursorY + 10, 0.35, border);
  });

  builder.spacer(14);
  if (!isLimousineQuotation) {
    const visibleRows: Array<[string, number, boolean]> = [
      [labels.lineSubtotal, totals.lineSubtotal, false],
      [labels.discount, -totals.discount, false],
      [labels.subtotal, totals.subtotal, false],
    ];
    if (record.gstEnabled) visibleRows.push([`GST (${record.gstRate}%)`, totals.gst, false]);
    visibleRows.push([labels.total, totals.total, true]);
    const rows = visibleRows.filter(([label, value]) => label !== labels.discount || value !== 0);
    const boxHeight = 22 + rows.length * 20;
    builder.reserve(boxHeight + 20, `${title} ${record.documentNo} - ${labels.continued}`);
    const boxX = 322;
    builder.rect(boxX, builder.cursorY - boxHeight + 10, RIGHT - boxX, boxHeight, pale, border, 0.8);
    rows.forEach(([label, value, bold], index) => {
      const y = builder.cursorY - index * 20 - 8;
      if (bold) builder.rect(boxX, y - 13, RIGHT - boxX, 24, navy);
      builder.text(boxX + 14, y, label, bold ? 10 : 9, bold, bold ? "#ffffff" : muted);
      builder.rightText(RIGHT - 12, y, formatter.format(value), bold ? 11 : 9, bold, bold ? "#ffffff" : navy);
    });
    builder.cursorY -= boxHeight + 8;
  } else {
    builder.text(LEFT, builder.cursorY, record.language === "ZH" ? "以上为服务报价项目，最终安排以确认预订为准。" : "Rates are presented by service item. Final arrangements remain subject to booking confirmation.", 8, false, muted);
    builder.cursorY -= 22;
  }

  // Bank and PayNow details from Company Management.
  const paymentRows = [
    company.bankName ? `${labels.bank}: ${company.bankName}` : "",
    company.bankAccountName ? `${labels.accountName}: ${company.bankAccountName}` : "",
    company.bankAccountNumber ? `${labels.accountNo}: ${company.bankAccountNumber}` : "",
    company.bankBranchCode ? `${labels.branch}: ${company.bankBranchCode}` : "",
    company.bankSwiftCode ? `${labels.swift}: ${company.bankSwiftCode}` : "",
    company.payNowValue ? `${labels.paynow} (${company.payNowType || ""}): ${company.payNowValue}` : "",
  ].filter(Boolean);
  if (paymentRows.length || company.paymentInstructions) {
    builder.spacer(10);
    builder.text(LEFT, builder.cursorY, labels.payment, 10, true, navy);
    builder.cursorY -= 16;
    const paymentHeight = Math.max(54, paymentRows.length * 14 + (company.paymentInstructions ? 28 : 10));
    builder.reserve(paymentHeight + 30, `${title} ${record.documentNo} - ${labels.continued}`);
    builder.rect(LEFT, builder.cursorY - paymentHeight + 10, RIGHT - LEFT, paymentHeight, "#eef4ff", "#bfd2f5", 0.8);
    let paymentY = builder.cursorY - 7;
    paymentRows.forEach((row, index) => {
      const x = LEFT + 14 + (index % 2) * 250;
      if (index > 0 && index % 2 === 0) paymentY -= 16;
      builder.text(x, paymentY, row, 8, index === 0, navy);
    });
    if (company.paymentInstructions) {
      paymentY -= paymentRows.length > 1 ? 24 : 17;
      wrapText(company.paymentInstructions, 100).slice(0, 2).forEach(line => { builder.text(LEFT + 14, paymentY, line, 8, false, muted); paymentY -= 12; });
    }
    builder.cursorY -= paymentHeight + 3;
  }

  if (record.notes) {
    builder.spacer(8);
    builder.text(LEFT, builder.cursorY, labels.notes, 9, true, navy); builder.cursorY -= 15;
    builder.paragraph(record.notes, { size: 8, maxChars: 98, lineHeight: 11, continuationTitle: `${title} ${record.documentNo} - ${labels.continued}` });
  }
  if (record.terms) {
    builder.spacer(8);
    builder.text(LEFT, builder.cursorY, labels.terms, 9, true, navy); builder.cursorY -= 15;
    builder.paragraph(record.terms, { size: 8, maxChars: 100, lineHeight: 11, continuationTitle: `${title} ${record.documentNo} - ${labels.continued}` });
  }

  builder.spacer(12);
  builder.line(LEFT, builder.cursorY + 4, RIGHT, builder.cursorY + 4, 0.7, border);
  builder.spacer(12);
  if (company.chopData) {
    const chopWidth = Math.min(company.chopWidth || 86, 110);
    const chopHeight = Math.min(company.chopHeight || 64, 82);
    builder.image(RIGHT - chopWidth, builder.cursorY - chopHeight + 8, chopWidth, chopHeight, company.chopData, record.language === "ZH" ? "公司印章" : "COMPANY CHOP");
  }
  builder.text(LEFT, builder.cursorY, labels.thanks, 9, true, navy);
  builder.rightText(RIGHT, builder.cursorY, company.email || company.phone || company.company, 8, false, muted);

  const blob = await builder.build();
  return new File([blob], `${record.documentNo}.pdf`, { type: "application/pdf" });
}

export async function createCombinedInvoicePdf(records: FinancialDocumentRecord[], company: PdfCompanyIdentity): Promise<File> {
  const builder = new PdfDocumentBuilder();
  const formatter = currencyFormatter(company);
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date) || a.documentNo.localeCompare(b.documentNo));
  const combinedTotal = sorted.reduce((sum, record) => sum + calculateDocumentTotals(record).total, 0);
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, "");
  const packageNo = `INVOICE-BUNDLE-${datePart}-${timePart}`;
  addCompanyHeader(builder, company, "INVOICE BUNDLE", packageNo);

  builder.heading("Client", 12);
  builder.paragraph(sorted[0]?.clientName || "-", { size: 11, bold: true, maxChars: 72, lineHeight: 14 });
  if (sorted[0]?.clientAddress) builder.paragraph(sorted[0].clientAddress, { size: 9, maxChars: 86, lineHeight: 12 });
  builder.spacer(8);
  builder.paragraph(`${sorted.length} invoices are enclosed in this single PDF. Every invoice keeps its own number, date, descriptions, line items, GST, notes and total.`, {
    size: 9,
    maxChars: 88,
    lineHeight: 12,
  });
  builder.spacer(10);

  builder.tableHeader([
    { label: "Invoice", x: LEFT },
    { label: "Date", x: 178 },
    { label: "Description", x: 248 },
    { label: "Status", x: 468, align: "right" },
    { label: "Total", x: RIGHT, align: "right" },
  ], "Invoice Bundle Summary - continued");

  sorted.forEach(record => {
    const total = calculateDocumentTotals(record).total;
    const descriptions = wrapText(documentDescription(record), 31);
    descriptions.forEach((line, index) => {
      builder.tableRow([
        { value: index === 0 ? record.documentNo : "", x: LEFT, bold: index === 0 },
        { value: index === 0 ? record.date : "", x: 178 },
        { value: line, x: 248 },
        { value: index === 0 ? record.status : "", x: 468, align: "right" },
        { value: index === 0 ? formatter.format(total) : "", x: RIGHT, align: "right", bold: index === 0 },
      ], 28, "Invoice Bundle Summary - continued");
    });
  });

  builder.spacer(12);
  builder.rect(322, builder.cursorY - 25, RIGHT - 322, 35, "#172033");
  builder.text(336, builder.cursorY - 9, "BUNDLE TOTAL", 11, true, "#ffffff");
  builder.rightText(RIGHT - 12, builder.cursorY - 9, formatter.format(combinedTotal), 12, true, "#ffffff");
  builder.cursorY -= 44;

  const bundlePaymentRows = [
    company.bankName ? `Bank: ${company.bankName}` : "",
    company.bankAccountName ? `Account name: ${company.bankAccountName}` : "",
    company.bankAccountNumber ? `Account number: ${company.bankAccountNumber}` : "",
    company.bankBranchCode ? `Branch code: ${company.bankBranchCode}` : "",
    company.bankSwiftCode ? `SWIFT / BIC: ${company.bankSwiftCode}` : "",
    company.payNowValue ? `PayNow (${company.payNowType || ""}): ${company.payNowValue}` : "",
  ].filter(Boolean);
  if (bundlePaymentRows.length || company.paymentInstructions) {
    builder.spacer(8);
    builder.heading("PAYMENT DETAILS", 10);
    builder.rect(LEFT, builder.cursorY - 56, RIGHT - LEFT, 66, "#eef4ff", "#bfd2f5", 0.8);
    builder.cursorY -= 8;
    builder.paragraph(bundlePaymentRows.join("  •  "), { size: 8, maxChars: 102, lineHeight: 11 });
    if (company.paymentInstructions) builder.paragraph(company.paymentInstructions, { size: 8, maxChars: 102, lineHeight: 11 });
    builder.cursorY -= 8;
  }

  sorted.forEach((record, invoiceIndex) => {
    builder.addPage();
    const totals = calculateDocumentTotals(record);
    addCompanyHeader(builder, company, `INVOICE ${invoiceIndex + 1} OF ${sorted.length}`, record.documentNo);

    const recordLabels = LABELS[record.language === "ZH" ? "ZH" : "EN"];
    builder.text(LEFT, builder.cursorY, `${recordLabels.date}: ${record.date}`, 10, true);
    builder.rightText(RIGHT, builder.cursorY, `${recordLabels.status}: ${record.status}`, 10, true);
    builder.cursorY -= 16;
    builder.text(LEFT, builder.cursorY, `${recordLabels.due}: ${record.dueDate || "-"}`, 9);
    builder.cursorY -= 25;

    builder.heading(recordLabels.billTo, 12);
    builder.paragraph(record.clientName, { size: 11, bold: true, maxChars: 70, lineHeight: 14 });
    if (record.clientContact || record.clientPhone) builder.paragraph([record.clientContact, record.clientPhone].filter(Boolean).join(" | "), { size: 9, maxChars: 80, lineHeight: 12 });
    if (record.clientUen) builder.paragraph(`UEN: ${record.clientUen}`, { size: 9, maxChars: 80, lineHeight: 12 });
    if (record.clientAddress) builder.paragraph(record.clientAddress, { size: 9, maxChars: 85, lineHeight: 12 });
    builder.spacer(12);

    builder.tableHeader([
      { label: recordLabels.description, x: LEFT },
      { label: recordLabels.qty, x: 390, align: "right" },
      { label: recordLabels.rate, x: 465, align: "right" },
      { label: recordLabels.amount, x: RIGHT, align: "right" },
    ], `${record.documentNo} - continued`);

    record.items.forEach(item => {
      const descriptionLines = wrapText(item.description, 48);
      descriptionLines.forEach((description, index) => {
        builder.tableRow([
          { value: description, x: LEFT },
          { value: index === 0 ? String(item.quantity) : "", x: 390, align: "right" },
          { value: index === 0 ? formatter.format(item.rate) : "", x: 465, align: "right" },
          { value: index === 0 ? formatter.format(item.quantity * item.rate) : "", x: RIGHT, align: "right" },
        ], 28, `${record.documentNo} - continued`);
      });
    });

    builder.spacer(14);
    const totalsRows: Array<[string, number, boolean]> = [
      [recordLabels.lineSubtotal, totals.lineSubtotal, false],
      [recordLabels.discount, -totals.discount, false],
      [recordLabels.subtotal, totals.subtotal, false],
    ];
    if (record.gstEnabled) totalsRows.push([`GST (${record.gstRate}%)`, totals.gst, false]);
    totalsRows.push([recordLabels.total, totals.total, true]);
    totalsRows.filter(([label, value]) => label !== recordLabels.discount || value !== 0).forEach(([label, value, bold]) => {
      if (bold) builder.rect(322, builder.cursorY - 14, RIGHT - 322, 25, "#172033");
      builder.text(bold ? 336 : 340, builder.cursorY - (bold ? 3 : 0), label, bold ? 10 : 9, bold, bold ? "#ffffff" : "#172033");
      builder.rightText(RIGHT - (bold ? 12 : 0), builder.cursorY - (bold ? 3 : 0), formatter.format(value), bold ? 11 : 9, bold, bold ? "#ffffff" : "#172033");
      builder.cursorY -= bold ? 30 : 16;
    });

    const invoicePaymentRows = [
      company.bankName ? `${recordLabels.bank}: ${company.bankName}` : "",
      company.bankAccountName ? `${recordLabels.accountName}: ${company.bankAccountName}` : "",
      company.bankAccountNumber ? `${recordLabels.accountNo}: ${company.bankAccountNumber}` : "",
      company.bankBranchCode ? `${recordLabels.branch}: ${company.bankBranchCode}` : "",
      company.bankSwiftCode ? `${recordLabels.swift}: ${company.bankSwiftCode}` : "",
      company.payNowValue ? `${recordLabels.paynow} (${company.payNowType || ""}): ${company.payNowValue}` : "",
    ].filter(Boolean);
    if (invoicePaymentRows.length || company.paymentInstructions) {
      builder.spacer(8);
      builder.text(LEFT, builder.cursorY, recordLabels.payment, 9, true, "#172033");
      builder.cursorY -= 16;
      builder.reserve(72, `${record.documentNo} - continued`);
      builder.rect(LEFT, builder.cursorY - 54, RIGHT - LEFT, 64, "#eef4ff", "#bfd2f5", 0.8);
      builder.cursorY -= 8;
      builder.paragraph(invoicePaymentRows.join("  •  "), { size: 8, maxChars: 102, lineHeight: 11, continuationTitle: `${record.documentNo} - continued` });
      if (company.paymentInstructions) builder.paragraph(company.paymentInstructions, { size: 8, maxChars: 102, lineHeight: 11, continuationTitle: `${record.documentNo} - continued` });
      builder.cursorY -= 8;
    }

    if (record.notes) {
      builder.spacer(8);
      builder.text(LEFT, builder.cursorY, recordLabels.notes, 10, true, "#172033"); builder.cursorY -= 16;
      builder.paragraph(record.notes, { size: 9, maxChars: 88, lineHeight: 12, continuationTitle: `${record.documentNo} - continued` });
    }
    if (record.terms) {
      builder.spacer(8);
      builder.text(LEFT, builder.cursorY, recordLabels.terms, 10, true, "#172033"); builder.cursorY -= 16;
      builder.paragraph(record.terms, { size: 9, maxChars: 88, lineHeight: 12, continuationTitle: `${record.documentNo} - continued` });
    }
  });

  const blob = await builder.build();
  const clientPart = safeText(sorted[0]?.clientName || "client").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28) || "client";
  return new File([blob], `${packageNo}-${clientPart}.pdf`, { type: "application/pdf" });
}

export function downloadPdf(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function sharePdf(file: File, channel: ShareChannel, message: string): Promise<"shared" | "downloaded"> {
  const shareData: ShareData = { files: [file], title: file.name, text: message };
  if (typeof navigator !== "undefined" && typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(shareData))) {
    await navigator.share(shareData);
    return "shared";
  }

  downloadPdf(file);
  const fallbackMessage = `${message}\n\nThe PDF has been downloaded as ${file.name}. Please attach it to this chat.`;
  try {
    await navigator.clipboard?.writeText(fallbackMessage);
  } catch {
    // Clipboard access is optional; the downloaded PDF remains available.
  }
  const encoded = encodeURIComponent(fallbackMessage);
  if (channel === "whatsapp") window.open(`https://wa.me/?text=${encoded}`, "_blank", "noopener,noreferrer");
  if (channel === "telegram") window.open(`https://t.me/share/url?url=&text=${encoded}`, "_blank", "noopener,noreferrer");
  if (channel === "wechat") alert(`The PDF has been downloaded and the message was copied where supported. Open WeChat and attach ${file.name}.`);
  return "downloaded";
}
