export interface SafePrintOptions {
  elementId: string;
  documentTitle: string;
  filename: string;
}

export interface SafePrintResult {
  mode: 'native_print' | 'downloaded_printable';
  filename: string;
  message: string;
}

export function isSandboxedIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function triggerSafePrint({
  elementId,
  documentTitle,
  filename,
}: SafePrintOptions): SafePrintResult {
  const safeFilename = filename.replace(/[^a-zA-Z0-9_-]/g, '-');

  // If running in a top-level browser tab (not inside the sandboxed preview iframe), native print works directly
  if (!isSandboxedIframe()) {
    window.print();
    return {
      mode: 'native_print',
      filename: `${safeFilename}.html`,
      message: 'Dialog cetak printer telah dibuka.',
    };
  }

  // Inside sandboxed iframe without 'allow-modals', calling window.print() is blocked by the browser.
  // Build a self-contained, auto-printing HTML document and download it cleanly.
  const targetEl = document.getElementById(elementId);
  const contentHtml = targetEl ? targetEl.outerHTML : '<p>Dokumen tidak ditemukan.</p>';

  const styleNodes = Array.from(
    document.querySelectorAll('style, link[rel="stylesheet"]')
  )
    .map((node) => node.outerHTML)
    .join('\n');

  const standaloneHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${documentTitle}</title>
  ${styleNodes}
  <style>
    body {
      background: #f8fafc;
      color: #0f172a;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 24px;
    }
    .print-toolbar {
      max-width: 680px;
      margin: 0 auto 16px auto;
      padding: 12px 16px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      font-size: 13px;
    }
    .print-btn {
      background: #b91c1c;
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      font-size: 12px;
    }
    .print-btn:hover {
      background: #991b1b;
    }
    .print-container {
      max-width: 680px;
      margin: 0 auto;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .print-toolbar {
        display: none !important;
      }
      .print-container {
        max-width: 100%;
        margin: 0;
      }
    }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <div>
      <strong>${documentTitle}</strong>
      <div style="color:#64748b;font-size:11px;margin-top:2px;">Dokumen siap cetak ke printer atau simpan sebagai PDF</div>
    </div>
    <button class="print-btn" onclick="window.print()">Cetak Sekarang / Simpan PDF</button>
  </div>
  <div class="print-container">
    ${contentHtml}
  </div>
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.print();
      }, 300);
    });
  </script>
</body>
</html>`;

  const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${safeFilename}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

  return {
    mode: 'downloaded_printable',
    filename: `${safeFilename}.html`,
    message: `Dokumen siap cetak (${safeFilename}.html) berhasil diunduh otomatis. Buka file hasil unduhan untuk langsung mencetak ke printer atau simpan sebagai PDF.`,
  };
}
