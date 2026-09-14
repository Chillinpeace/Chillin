:root {
  --bg-deep: #0b0e14;
  --card-glass: rgba(22, 27, 38, 0.75);
  --card-border: rgba(255, 255, 255, 0.08);
  --text-main: #f3f4f6;
  --text-muted: #9ca3af;
  --emerald-accent: #10b981;
  --emerald-glow: rgba(16, 185, 129, 0.15);
  --amber-accent: #f59e0b;
  --rose-accent: #f43f5e;
  --radius-xl: 20px;
  --radius-full: 9999px;
  --font-stack: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: var(--font-stack);
  -webkit-tap-highlight-color: transparent;
}

body {
  background-color: var(--bg-deep);
  color: var(--text-main);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 100vh;
  overflow-x: hidden;
}

.mobile-shell {
  width: 100%;
  max-width: 430px;
  min-height: 100vh;
  background: var(--bg-deep);
  padding: 16px 16px 100px 16px;
  position: relative;
  display: flex;
  flex-direction: column;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0 20px 0;
}

.brand-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-logo {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #10b981, #059669);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 20px;
  color: #ffffff;
  box-shadow: 0 4px 20px var(--emerald-glow);
}

.brand-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.brand-subtitle {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

.avatar-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--card-border);
  color: var(--text-main);
  padding: 8px 14px;
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.plus-icon {
  color: var(--emerald-accent);
  font-weight: 700;
}

.content-area {
  flex: 1;
}

.view-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.hero-card {
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
  border: 1px solid var(--card-border);
  border-radius: var(--radius-xl);
  padding: 22px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.hero-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.tag-light {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.live-indicator {
  font-size: 11px;
  color: var(--emerald-accent);
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background-color: var(--emerald-accent);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--emerald-accent);
}

.hero-value {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -1px;
  color: #ffffff;
  margin-bottom: 8px;
}

.hero-meta {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 16px;
}

.divider {
  opacity: 0.4;
}

.progress-bar-bg {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #10b981, #34d399);
  border-radius: var(--radius-full);
}

.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.metric-tile {
  background: var(--card-glass);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-xl);
  padding: 16px;
  backdrop-filter: blur(12px);
}

.tile-icon {
  font-size: 18px;
  margin-bottom: 8px;
}

.tile-value {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 2px;
}

.tile-label {
  font-size: 11px;
  color: var(--text-muted);
}

.section-title-wrap {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.section-title-wrap h2 {
  font-size: 16px;
  font-weight: 700;
}

.actions-dock {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.dock-btn {
  background: var(--card-glass);
  border: 1px solid var(--card-border);
  border-radius: 16px;
  padding: 14px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--text-main);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.dock-icon {
  font-size: 20px;
}

.glass-card {
  background: var(--card-glass);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-xl);
  padding: 16px;
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.glass-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.card-heading {
  font-size: 15px;
  font-weight: 700;
  color: #ffffff;
}

.card-subtext {
  font-size: 12px;
  color: var(--text-muted);
}

.glass-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 10px;
}

.accent-text {
  color: var(--emerald-accent);
  font-weight: 600;
}

.badge {
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 700;
}

.badge-emerald {
  background: var(--emerald-glow);
  color: var(--emerald-accent);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.badge-amber {
  background: rgba(245, 158, 11, 0.15);
  color: var(--amber-accent);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.badge-rose {
  background: rgba(244, 63, 94, 0.15);
  color: var(--rose-accent);
  border: 1px solid rgba(244, 63, 94, 0.3);
}

.filter-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.search-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-full);
  padding: 12px 18px;
  color: var(--text-main);
  font-size: 13px;
  outline: none;
}

.pills-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.filter-pill {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--card-border);
  color: var(--text-muted);
  padding: 6px 14px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.filter-pill.active {
  background: var(--emerald-accent);
  color: #000000;
  border-color: var(--emerald-accent);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 200;
}

.modal-card {
  width: 100%;
  max-width: 360px;
  background: #161b26;
  border: 1px solid var(--card-border);
  border-radius: var(--radius-xl);
  padding: 24px;
}

.modal-card h3 {
  font-size: 18px;
  margin-bottom: 16px;
}

.modal-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 12px;
  color: var(--text-main);
  font-size: 14px;
  margin-bottom: 12px;
}

.modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.btn-primary {
  flex: 1;
  background: var(--emerald-accent);
  color: #000000;
  font-weight: 700;
  padding: 12px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
}

.btn-secondary {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-main);
  font-weight: 600;
  padding: 12px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
}

.btn-primary-sm {
  background: var(--emerald-accent);
  color: #000000;
  font-weight: 700;
  padding: 8px 14px;
  border-radius: var(--radius-full);
  border: none;
  font-size: 12px;
  cursor: pointer;
}

.text-btn {
  background: none;
  border: none;
  color: var(--emerald-accent);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.avatar-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: var(--emerald-accent);
}

.amount-tag {
  font-size: 16px;
  font-weight: 700;
  color: var(--emerald-accent);
}

.metrics-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.mini-label {
  font-size: 10px;
  color: var(--text-muted);
}

.mini-val {
  font-size: 13px;
  font-weight: 700;
}

.distribution-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dist-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 4px;
}

.glass-nav {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 32px);
  max-width: 398px;
  height: 64px;
  background: rgba(18, 22, 31, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 0 8px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
  z-index: 100;
}

.nav-item {
  background: none;
  border: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 8px 12px;
  border-radius: var(--radius-full);
  transition: all 0.2s ease;
}

.nav-icon {
  font-size: 18px;
}

.nav-label {
  font-size: 10px;
  font-weight: 600;
}

.nav-item.active {
  color: var(--emerald-accent);
}
