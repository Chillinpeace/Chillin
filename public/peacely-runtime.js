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

  window.fetch = async (...args) => {
    const request = args[0];
    const method = (args[1]?.method || (typeof Request !== 'undefined' && request instanceof Request ? request.method : 'GET') || 'GET').toUpperCase();

    let response;
    try {
      response = await originalFetch(...args);
    } catch (error) {
      if (method === 'GET' && isApiRequest(request)) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        response = await originalFetch(...args);
      } else {
        throw error;
      }
    }

    const url = typeof request === 'string' ? request : request?.url || '';
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
