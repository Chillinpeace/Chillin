(() => {
  const originalFetch = window.fetch.bind(window);
  const collectionKeys = {
    '/api/properties': 'properties',
    '/api/rooms': 'rooms',
    '/api/beds': 'beds',
    '/api/tenants': 'tenants',
    '/api/payments': 'payments',
    '/api/invoices': 'invoices',
  };

  const isApiRequest = (request) => {
    const url = typeof request === 'string' ? request : request?.url || '';
    return url.includes('/api/');
  };

  const getRequestUrl = (request) =>
    typeof request === 'string' ? request : request?.url || '';

  const preparePaymentRequest = async (args) => {
    const request = args[0];
    const options = args[1] || {};
    const url = getRequestUrl(request);
    const method = (
      options.method ||
      (typeof Request !== 'undefined' && request instanceof Request
        ? request.method
        : 'GET') ||
      'GET'
    ).toUpperCase();

    if (method !== 'POST' || !url.split('?')[0].endsWith('/api/payments')) {
      return args;
    }

    let body;
    try {
      body = typeof options.body === 'string'
        ? JSON.parse(options.body)
        : null;
    } catch {
      return args;
    }

    if (!body || !body.tenant_id || body.invoice_id) {
      return args;
    }

    try {
      const invoiceResponse = await originalFetch('/api/invoices', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (!invoiceResponse.ok) return args;

      const invoicePayload = await invoiceResponse.json().catch(() => null);
      const invoiceList = Array.isArray(invoicePayload)
        ? invoicePayload
        : Array.isArray(invoicePayload?.invoices)
          ? invoicePayload.invoices
          : [];

      const tenantId = Number(body.tenant_id);
      const availableInvoice = invoiceList
        .filter((invoice) => {
          const balance = Number(
            invoice.balance_amount ??
              Number(invoice.amount || 0) - Number(invoice.paid_amount || 0),
          );

          return (
            Number(invoice.tenant_id) === tenantId &&
            String(invoice.status || '').toLowerCase() !== 'cancelled' &&
            balance > 0
          );
        })
        .sort((a, b) => Number(a.id) - Number(b.id))[0];

      if (!availableInvoice) return args;

      const patchedBody = {
        ...body,
        invoice_id: Number(availableInvoice.id),
      };

      return [
        request,
        {
          ...options,
          body: JSON.stringify(patchedBody),
        },
      ];
    } catch (error) {
      console.error('[Peacely] Unable to auto-link payment invoice:', error);
      return args;
    }
  };

  window.fetch = async (...inputArgs) => {
    const preparedArgs = await preparePaymentRequest(inputArgs);
    const request = preparedArgs[0];
    const options = preparedArgs[1] || {};
    const method = (
      options.method ||
      (typeof Request !== 'undefined' && request instanceof Request
        ? request.method
        : 'GET') ||
      'GET'
    ).toUpperCase();

    let response;
    try {
      response = await originalFetch(...preparedArgs);
    } catch (error) {
      if (method === 'GET' && isApiRequest(request)) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        response = await originalFetch(...preparedArgs);
      } else {
        throw error;
      }
    }

    const url = getRequestUrl(request);
    const pathname = url.split('?')[0];
    const key = collectionKeys[pathname];

    if (!key || !response.ok) return response;

    const payload = await response.clone().json().catch(() => null);
    if (!payload || !Array.isArray(payload[key])) return response;

    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/json');
    headers.delete('Content-Length');

    return new Response(JSON.stringify(payload[key]), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };

  window.addEventListener('error', (event) => {
    console.error('[Peacely] Unhandled browser error:', event.error || event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Peacely] Unhandled promise rejection:', event.reason);
  });
})();
