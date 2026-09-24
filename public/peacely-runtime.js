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

  const currentMonthLabel = () => {
    const now = new Date();
    return now.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  const normalizedMonth = (value) =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const isCurrentMonth = (value) => {
    const target = normalizedMonth(currentMonthLabel());
    const text = normalizedMonth(value);
    return text === target;
  };

  const dateMonthLabel = (value) => {
    if (!value) return '';
    const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  const fetchCollection = async (path, key) => {
    try {
      const response = await originalFetch(path, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return [];
      const payload = await response.json().catch(() => null);
      if (Array.isArray(payload)) return payload;
      return Array.isArray(payload?.[key]) ? payload[key] : [];
    } catch (error) {
      console.error(`[Peacely] Unable to load ${path}:`, error);
      return [];
    }
  };

  const prepareAnalyticsPayload = async (payload) => {
    if (!payload || typeof payload !== 'object') return payload;

    const [invoices, payments] = await Promise.all([
      fetchCollection('/api/invoices', 'invoices'),
      fetchCollection('/api/payments', 'payments'),
    ]);

    const monthName = currentMonthLabel();

    const currentInvoices = invoices.filter((invoice) => {
      if (String(invoice.status || '').toLowerCase() === 'cancelled') return false;
      const invoiceMonth = invoice.month || dateMonthLabel(invoice.due_date);
      return isCurrentMonth(invoiceMonth);
    });

    const propertyTotals = new Map();
    for (const invoice of currentInvoices) {
      const propertyId = Number(invoice.property_id);
      if (!Number.isInteger(propertyId)) continue;

      const existing = propertyTotals.get(propertyId) || {
        expected: 0,
        collected: 0,
      };

      existing.expected += Number(invoice.amount || 0);
      existing.collected += Number(invoice.paid_amount || 0);
      propertyTotals.set(propertyId, existing);
    }

    const propertyRows = Array.isArray(payload.properties)
      ? payload.properties.map((property) => {
          const totals = propertyTotals.get(Number(property.id)) || {
            expected: 0,
            collected: 0,
          };

          return {
            ...property,
            monthly_revenue: totals.expected,
            monthly_collected: totals.collected,
            monthly_outstanding: Math.max(
              totals.expected - totals.collected,
              0,
            ),
          };
        })
      : payload.properties;

    const methodTotals = new Map();
    for (const payment of payments) {
      const paymentMonth =
        payment.payment_month ||
        dateMonthLabel(payment.payment_date);

      if (!isCurrentMonth(paymentMonth)) continue;

      const method = String(payment.payment_method || 'Other').trim() || 'Other';
      const existing = methodTotals.get(method) || {
        method,
        count: 0,
        amount: 0,
      };

      existing.count += 1;
      existing.amount += Number(payment.amount || 0);
      methodTotals.set(method, existing);
    }

    return {
      ...payload,
      analytics_month: monthName,
      properties: propertyRows,
      payment_methods: Array.from(methodTotals.values()).sort(
        (a, b) => b.amount - a.amount,
      ),
    };
  };

  const preparePaymentRequest = async (args) => {
    const request = args[0];
    const options = args[1] || {};
    const url = getRequestUrl(request);
    const method = (
      options.method ||
      (typeof Request !== 'undefined' && request instanceof Request ? request.method : 'GET') ||
      'GET'
    ).toUpperCase();

    if (method !== 'POST' || !url.split('?')[0].endsWith('/api/payments')) return args;

    let body;
    try {
      body = typeof options.body === 'string' ? JSON.parse(options.body) : null;
    } catch {
      return args;
    }

    if (!body || !body.tenant_id || body.invoice_id) return args;

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
        : Array.isArray(invoicePayload?.invoices) ? invoicePayload.invoices : [];
      const tenantId = Number(body.tenant_id);
      const availableInvoice = invoiceList.filter((invoice) => {
        const balance = Number(invoice.balance_amount ?? Number(invoice.amount || 0) - Number(invoice.paid_amount || 0));
        return Number(invoice.tenant_id) === tenantId && String(invoice.status || '').toLowerCase() !== 'cancelled' && balance > 0;
      }).sort((a, b) => Number(a.id) - Number(b.id))[0];

      if (!availableInvoice) return args;
      return [request, { ...options, body: JSON.stringify({ ...body, invoice_id: Number(availableInvoice.id) }) }];
    } catch (error) {
      console.error('[Peacely] Unable to auto-link payment invoice:', error);
      return args;
    }
  };

  // Production fallback: guarantee that the Record Payment form has a real
  // submit action even if React's synthetic submit handler is not firing.
  const savePaymentDirectly = async (form) => {
    const selects = Array.from(form.querySelectorAll('select'));
    const inputs = Array.from(form.querySelectorAll('input'));
    const tenantId = selects[0]?.value || '';
    const invoiceId = selects[1]?.value || '';
    const amount = inputs.find((input) => input.type === 'number')?.value || '';
    const date = inputs.find((input) => input.type === 'date')?.value || '';
    const month = inputs.filter((input) => input.type !== 'number' && input.type !== 'date').at(-1)?.value || '';
    const paymentMethod = selects[2]?.value || 'UPI';

    if (!tenantId) throw new Error('Please select a tenant.');
    if (!amount || Number(amount) <= 0) throw new Error('Please enter a valid payment amount.');
    if (!date) throw new Error('Please select a payment date.');
    if (!month.trim()) throw new Error('Please enter the payment month.');

    let resolvedInvoiceId = invoiceId;
    if (!resolvedInvoiceId) {
      const invoiceResponse = await originalFetch('/api/invoices', {
        method: 'GET', credentials: 'include', headers: { Accept: 'application/json' },
      });
      const invoicePayload = await invoiceResponse.json().catch(() => null);
      const invoiceList = Array.isArray(invoicePayload)
        ? invoicePayload
        : Array.isArray(invoicePayload?.invoices) ? invoicePayload.invoices : [];
      const availableInvoice = invoiceList.filter((invoice) => {
        const balance = Number(invoice.balance_amount ?? Number(invoice.amount || 0) - Number(invoice.paid_amount || 0));
        return Number(invoice.tenant_id) === Number(tenantId) && String(invoice.status || '').toLowerCase() !== 'cancelled' && balance > 0;
      }).sort((a, b) => Number(a.id) - Number(b.id))[0];
      if (!availableInvoice) throw new Error('No pending invoice was found for this tenant.');
      resolvedInvoiceId = String(availableInvoice.id);
    }

    const response = await originalFetch('/api/payments', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        tenant_id: Number(tenantId),
        amount: Number(amount),
        payment_date: date,
        payment_method: paymentMethod,
        payment_month: month.trim(),
        invoice_id: Number(resolvedInvoiceId),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `Payment failed: ${response.status}`);
    return payload;
  };

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!String(form.textContent || '').toLowerCase().includes('record payment')) return;
    if (form.dataset.peacelyPaymentSaving === 'true') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    form.dataset.peacelyPaymentSaving = 'true';

    const button = form.querySelector('button[type="submit"]');
    const originalText = button?.textContent || 'Save';
    if (button) {
      button.disabled = true;
      button.textContent = 'Saving...';
    }

    try {
      await savePaymentDirectly(form);
      window.location.reload();
    } catch (error) {
      console.error('[Peacely] Payment save failed:', error);
      form.dataset.peacelyPaymentSaving = 'false';
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
      window.alert(error instanceof Error ? error.message : 'Failed to record payment.');
    }
  }, true);

  window.fetch = async (...inputArgs) => {
    const preparedArgs = await preparePaymentRequest(inputArgs);
    const request = preparedArgs[0];
    const options = preparedArgs[1] || {};
    const method = (
      options.method ||
      (typeof Request !== 'undefined' && request instanceof Request ? request.method : 'GET') ||
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

    if (pathname.endsWith('/api/analytics') && response.ok) {
      const analyticsPayload = await response.clone().json().catch(() => null);
      if (analyticsPayload) {
        const normalizedPayload = await prepareAnalyticsPayload(analyticsPayload);
        const headers = new Headers(response.headers);
        headers.set('Content-Type', 'application/json');
        headers.delete('Content-Length');
        return new Response(JSON.stringify(normalizedPayload), {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
    }

    // Do not rewrite collection API responses.
    // The application handles both the normal API envelope and raw arrays.
    // Rewriting responses here can make a successful property save appear
    // to disappear from the React state.
    return response;
  };

  window.addEventListener('error', (event) => {
    console.error('[Peacely] Unhandled browser error:', event.error || event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Peacely] Unhandled promise rejection:', event.reason);
  });
})();
