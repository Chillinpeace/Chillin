(() => {
  const visitorKey = 'peacely_visitor_id';
  let visitorId = '';

  try {
    visitorId = localStorage.getItem(visitorKey) || '';
    if (!visitorId) {
      visitorId = `v_${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).slice(2)}`;
      localStorage.setItem(visitorKey, visitorId);
    }
  } catch {
    visitorId = `v_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  const post = (url, body) => {
    fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  };

  post('/api/visit', {
    visitor_id: visitorId,
    referrer: document.referrer || '',
    path: window.location.pathname + window.location.search,
  });

  const heartbeat = () => {
    post('/api/owner-activity', {
      path: window.location.pathname,
    });
  };

  // Record activity immediately when the page is opened, focused, or restored.
  heartbeat();
  window.addEventListener('focus', heartbeat);
  window.addEventListener('pageshow', heartbeat);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      heartbeat();
    }
  });

  // Keep the owner marked active while they are using Peacely.
  window.setInterval(heartbeat, 60 * 1000);
})();