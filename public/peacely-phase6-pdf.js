(() => {
  'use strict';

  if (window.__peacelyPhase6PdfBooted) return;
  window.__peacelyPhase6PdfBooted = true;

  const API = '/api';
  const today = () => new Date().toISOString().slice(0, 10);
  const yearStart = () => `${new Date().getFullYear()}-01-01`;

  async function exportPdf() {
    const from = document.getElementById('p6-from')?.value || yearStart();
    const to = document.getElementById('p6-to')?.value || today();
    const tenantId = Number(document.getElementById('p6-tenant')?.value || 0);
    const btn = document.getElementById('p6-export');

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creating PDF…';
    }

    try {
      const params = new URLSearchParams({ from, to });
      if (tenantId) params.set('tenant_id', String(tenantId));

      // Download a real application/pdf response. No CSV is created and no
      // print window or contacts/import workflow is used.
      const response = await fetch(`${API}/reports/financial.pdf?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      });

      if (!response.ok) {
        let message = `PDF export failed (${response.status})`;
        try {
          const data = await response.json();
          if (data?.error) message = data.error;
        } catch {}
        throw new Error(message);
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('application/pdf')) {
        throw new Error('The server did not return a PDF document.');
      }

      const blob = await response.blob();
      if (!blob.size) throw new Error('The generated PDF is empty.');

      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || `peacely-financial-${from}-to-${to}.pdf`;
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.type = 'application/pdf';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error) {
      console.error('Peacely financial PDF export failed:', error);
      alert(`Could not create PDF: ${error?.message || error}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Export Financial PDF';
      }
    }
  }

  window.peacelyExportFinancialPdf = exportPdf;
})();
