/** Hands bytes to the browser as a file download; nothing leaves the device. */
export function saveFile(filename: string, data: string | Uint8Array, type = 'application/octet-stream'): void {
  const blob = new Blob([data as BlobPart], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export const tapDate = (d = new Date()): string => {
  const h = d.getHours() % 12 || 12, two = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${h}:${two(d.getMinutes())}:${two(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
};

/** Machine controllers and old tools choke on other characters, so output names stay plain. */
export const cleanBaseName = (s: string): string => s.replace(/[^A-Za-z0-9 _+.-]/g, '').trim() || 'Foam';
export const sheetFileName = (base: string, i: number): string => `${cleanBaseName(base)} ${String(i + 1).padStart(2, '0')}`;
