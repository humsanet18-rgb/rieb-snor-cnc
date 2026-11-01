import { tr } from '../../app/i18n';
import { writePdf, type PdfPage } from '../../engines/export/pdf';
import { saveFile } from '../../services/download';
import { toast } from '../../stores/ui-store';
import type { ShopData, ShopOrder } from '../../types/shop';
import { LINE, loadPdfFonts, MUTED, newPage, PAD, PAGE_H, PAGE_W, text, toJpeg } from '../export/pdf-report';
import { formatMoney, lineTotal, totalsOf, type Range, type ReportData } from './logic';

const WIDTH = PAGE_W - PAD * 2;
const rule = (g: CanvasRenderingContext2D, y: number) => { g.fillStyle = LINE; g.fillRect(PAD, y, WIDTH, 2); };

function right(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, bold = false) {
  text(g, '', 0, 0, size, undefined, bold);
  text(g, s, x - g.measureText(s).width, y, size, undefined, bold);
}

function fit(g: CanvasRenderingContext2D, s: string, width: number): string {
  if (g.measureText(s).width <= width) return s;
  let out = s;
  while (out && g.measureText(out + '…').width > width) out = out.slice(0, -1);
  return out + '…';
}

function letterhead(g: CanvasRenderingContext2D, data: ShopData, title: string, sub: string): number {
  const s = data.settings;
  text(g, s.shopName || tr('app.name'), PAD, 130, 40, undefined, true);
  const line = [s.phone, s.address].filter(Boolean).join(' · ');
  if (line) text(g, line, PAD, 176, 24, MUTED);
  right(g, title, PAGE_W - PAD, 130, 44, true);
  text(g, '', 0, 0, 26);
  right(g, sub, PAGE_W - PAD, 176, 26);
  rule(g, 205);
  return 260;
}

async function finish(pages: CanvasRenderingContext2D[], name: string, title: string) {
  const jpegs: PdfPage[] = [];
  for (const p of pages) jpegs.push(await toJpeg(p));
  saveFile(name, writePdf(jpegs, title), 'application/pdf');
  toast(tr('toast.saved', { name }));
}

/** A quotation until the order is accepted, an invoice after that. */
export async function makeOrderPdf(order: ShopOrder, data: ShopData): Promise<void> {
  await loadPdfFonts();
  const quote = order.status === 'quote', c = data.settings.currency, t = totalsOf(data, order);
  const customer = data.customers.find(x => x.id === order.customerId), money = (n: number) => formatMoney(n, c);
  const title = tr(quote ? 'shop.doc.quote' : 'shop.doc.invoice');
  const pages = [newPage()];
  let g = pages[0], y = letterhead(g, data, title, order.number);
  text(g, tr('shop.doc.to'), PAD, y, 24, MUTED);
  text(g, customer?.name ?? '', PAD + 200, y, 28, undefined, true);
  if (customer?.phone) { y += 40; text(g, customer.phone, PAD + 200, y, 24); }
  if (customer?.address) { y += 36; text(g, fit(g, customer.address, WIDTH - 200), PAD + 200, y, 24); }
  y += 46;
  text(g, tr('shop.date'), PAD, y, 24, MUTED);
  text(g, new Date().toLocaleDateString('en-GB'), PAD + 200, y, 24);
  if (order.dueDate) {
    y += 40;
    text(g, tr('shop.due'), PAD, y, 24, MUTED);
    text(g, new Date(order.dueDate + 'T00:00:00').toLocaleDateString('en-GB'), PAD + 200, y, 24);
  }
  y += 46;
  text(g, fit(g, order.title, WIDTH), PAD, y, 28, undefined, true);
  y += 50;
  const header = () => {
    text(g, tr('shop.item.description'), PAD, y, 24, MUTED);
    right(g, tr('shop.item.qty'), PAGE_W - PAD - 420, y, 24);
    right(g, tr('shop.item.price'), PAGE_W - PAD - 210, y, 24);
    right(g, tr('shop.total'), PAGE_W - PAD, y, 24);
    y += 16; rule(g, y); y += 46;
  };
  header();
  for (const i of order.items) {
    if (y > PAGE_H - 420) { g = newPage(); pages.push(g); y = 130; header(); }
    text(g, '', 0, 0, 26);
    text(g, fit(g, i.description, WIDTH - 560), PAD, y, 26);
    right(g, String(i.qty), PAGE_W - PAD - 420, y, 26);
    right(g, money(i.unitPrice), PAGE_W - PAD - 210, y, 26);
    right(g, money(lineTotal(i)), PAGE_W - PAD, y, 26);
    y += 46;
  }
  rule(g, y - 26);
  y += 20;
  const row = (label: string, value: string, bold = false) => {
    text(g, label, PAGE_W - PAD - 480, y, 26, bold ? undefined : MUTED, bold);
    right(g, value, PAGE_W - PAD, y, 26, bold);
    y += 44;
  };
  row(tr('shop.subtotal'), money(t.subtotal));
  if (t.discount) row(tr('shop.discount'), '-' + money(t.discount));
  if (t.tax) row(tr('shop.tax', { n: order.taxRate }), money(t.tax));
  row(tr('shop.total'), money(t.total), true);
  if (!quote) {
    row(tr('shop.paid'), money(t.paid));
    row(tr('shop.balance'), money(t.balance), true);
  }
  if (order.notes) {
    y += 30;
    text(g, '', 0, 0, 24);
    text(g, fit(g, order.notes, WIDTH), PAD, y, 24, MUTED);
  }
  await finish(pages, `${order.number}.pdf`, `${title} ${order.number}`);
}

export async function makeReportPdf(r: ReportData, range: Range, data: ShopData, lang: string): Promise<void> {
  await loadPdfFonts();
  const c = data.settings.currency, money = (n: number) => formatMoney(n, c);
  const g = newPage();
  let y = letterhead(g, data, tr('shop.doc.report'), `${range.from || '…'} → ${range.to || '…'}`);
  const rows: [string, string][] = [
    [tr('shop.report.created'), String(r.created.length)], [tr('shop.report.completed'), String(r.completed.length)], [tr('shop.report.late'), String(r.late)],
    [tr('shop.invoiced'), money(r.invoiced)], [tr('shop.received'), money(r.received)], [tr('shop.expenses'), money(r.expenses)], [tr('shop.report.result'), money(r.cashResult)]
  ];
  for (const [k, v] of rows) {
    text(g, k, PAD, y, 28, MUTED);
    right(g, v, PAGE_W - PAD, y, 28, true);
    y += 50;
  }
  y += 30;
  const list = (title: string, lines: [string, string][]) => {
    if (!lines.length) return;
    text(g, title, PAD, y, 32, undefined, true);
    y += 20; rule(g, y); y += 44;
    for (const [k, v] of lines) {
      if (y > PAGE_H - 140) break;
      text(g, '', 0, 0, 26);
      text(g, fit(g, k, WIDTH - 300), PAD, y, 26);
      right(g, v, PAGE_W - PAD, y, 26);
      y += 42;
    }
    y += 30;
  };
  list(tr('shop.tab.customers'), r.customers.map(x => [x.name, money(x.total)]));
  list(tr('shop.tab.stock'), r.materials.map(x => [x.name, `${x.used} · ${money(x.cost)}`]));
  text(g, new Date().toLocaleString(lang === 'km' ? 'km-KH' : 'en-GB'), PAD, PAGE_H - 50, 22, MUTED);
  await finish([g], `report ${range.from || 'all'} ${range.to || ''}.pdf`.replace(' .pdf', '.pdf'), tr('shop.doc.report'));
}
