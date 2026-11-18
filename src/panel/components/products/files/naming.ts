/** File RPC exposes URLs only; no size or filename metadata. */
export function downloadFileName(url: string): string {
  try {
    return decodeURIComponent(
      new URL(url, "https://bitsnap.pl").pathname.split("/").pop() || "",
    );
  } catch {
    return "";
  }
}

const KNOWN_FORMATS = new Set([
  "pdf",
  "epub",
  "mobi",
  "azw3",
  "zip",
  "rar",
  "7z",
  "mp3",
  "m4a",
  "m4b",
  "wav",
  "flac",
  "mp4",
  "mov",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "svg",
  "psd",
  "ai",
  "stl",
  "glb",
]);

/**
 * Format badge from the URL path extension (`PDF`, `EPUB`, ...), or
 * `undefined` when there is none or it is not a known file type (query-only
 * names, `.php` endpoints).
 */
export function fileFormat(url: string): string | undefined {
  const name = downloadFileName(url);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return undefined;
  const extension = name.slice(dot + 1).toLowerCase();
  return KNOWN_FORMATS.has(extension) ? extension.toUpperCase() : undefined;
}

export type FileRowModel = {
  url: string;
  /** Main line. */
  title: string;
  /** Original file name under the title, when it adds something. */
  fileName?: string;
  format?: string;
};

/**
 * Display names of the bought files (client only, no backend metadata).
 * One file: the product name as the title and the file name below it, so a
 * name like `f1-medium-compression.pdf` is never the headline. Several files:
 * the decoded file name; a repeated name gets its position, a missing one
 * becomes "Plik 2".
 */
export function fileRows(
  urls: string[],
  productName: string,
  fileLabel: string,
): FileRowModel[] {
  const names = urls.map((url) => downloadFileName(url));
  if (urls.length === 1) {
    const title = productName.trim() || names[0] || `${fileLabel} 1`;
    return [
      {
        url: urls[0],
        title,
        fileName: names[0] && names[0] !== title ? names[0] : undefined,
        format: fileFormat(urls[0]),
      },
    ];
  }
  const counts = new Map<string, number>();
  for (const name of names) {
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return urls.map((url, index) => {
    const name = names[index];
    const title = !name
      ? `${fileLabel} ${index + 1}`
      : (counts.get(name) ?? 0) > 1
        ? `${name} (${index + 1})`
        : name;
    return { url, title, format: fileFormat(url) };
  });
}
