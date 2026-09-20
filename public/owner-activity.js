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

  heartbeat();
  window.setInterval(heartbeat, 5 * 60 * 1000);
})();
