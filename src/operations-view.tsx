import React, { useEffect, useMemo, useState } from 'react';

type Tenant = {
  id: number;
  name: string;
  phone?: string;
  property_id: number;
  property_name?: string;
  room_id?: number;
  bed_id?: number;
  room_number?: string;
  bed_number?: string;
  monthly_rent?: number;
  deposit_amount?: number;
  status?: string;
  move_in_date?: string;
  move_out_date?: string;
};

type Property = {
  id: number;
  name: string;
  address?: string;
};

type Passport = any;
type Checklist = Record<string, boolean>;

const money = (v: unknown) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const dateText = (v: unknown) => {
  if (!v) return '-';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Request failed: ${response.status}`);
  return data as T;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="glass-card" style={{ marginBottom: 12 }}>{children}</div>;
}

function Pill({ value }: { value: string }) {
  const v = String(value || '').replace(/_/g, ' ');
  return <span className={`status ${String(value || '').toLowerCase()}`}>{v.charAt(0).toUpperCase() + v.slice(1)}</span>;
}

const moveInKeys = [
  ['tenant_verified', 'Tenant verified'],
  ['agreement_signed', 'Agreement signed'],
  ['deposit_received', 'Deposit received'],
  ['rent_configured', 'Rent configured'],
  ['bed_assigned', 'Bed assigned'],
] as const;

const moveOutKeys = [
  ['rent_settled', 'Rent settled'],
  ['maintenance_checked', 'Maintenance checked'],
  ['damage_checked', 'Damage checked'],
  ['documents_checked', 'Documents checked'],
  ['inspection_completed', 'Inspection completed'],
] as const;

function Checklist({
  items,
  value,
  onChange,
}: {
  items: readonly (readonly [string, string])[];
  value: Checklist;
  onChange: (key: string, checked: boolean) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map(([key, label]) => (
        <label
          key={key}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            border: '1px solid var(--card-border)',
            borderRadius: 12,
          }}
        >
          <input
            type="checkbox"
            checked={Boolean(value?.[key])}
            onChange={(e) => onChange(key, e.target.checked)}
          />
          <span style={{ flex: 1 }}>{label}</span>
          {value?.[key] ? <span>✓</span> : null}
        </label>
      ))}
    </div>
  );
}

export default function OperationsView({
  tenants,
  properties,
}: {
  tenants: Tenant[];
  properties: Property[];
}) {
  const [section, setSection] = useState<'tenant' | 'property' | 'incidents'>('tenant');
  const [tenantId, setTenantId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [passport, setPassport] = useState<Passport | null>(null);
  const [moveIn, setMoveIn] = useState<any>(null);
  const [moveOut, setMoveOut] = useState<any>(null);
  const [tenantCompliance, setTenantCompliance] = useState<any>(null);
  const [propertyPassport, setPropertyPassport] = useState<any>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentType, setIncidentType] = useState('other');
  const [incidentSeverity, setIncidentSeverity] = useState('medium');
  const [incidentDescription, setIncidentDescription] = useState('');

  const [complianceRequirement, setComplianceRequirement] = useState('');
  const [complianceStatus, setComplianceStatus] = useState('pending');
  const [complianceExpiry, setComplianceExpiry] = useState('');
  const [complianceNotes, setComplianceNotes] = useState('');

  const [settlement, setSettlement] = useState({
    rent_outstanding: '',
    utility_charges: '',
    damage_charges: '',
    other_charges: '',
  });

  const selectedTenant = useMemo(
    () => tenants.find((t) => Number(t.id) === Number(tenantId)) || null,
    [tenants, tenantId],
  );

  const selectedProperty = useMemo(
    () => properties.find((p) => Number(p.id) === Number(propertyId)) || null,
    [properties, propertyId],
  );

  const loadTenantOperations = async (id: number) => {
    setLoading(true);
    setError('');
    try {
      const [p, mi, mo, c] = await Promise.all([
        request<{ passport: Passport }>(`/tenant-passport/${id}`),
        request<any>(`/move-in/${id}`),
        request<any>(`/move-out/${id}`),
        request<any>(`/tenant-compliance/${id}`),
      ]);
      setPassport(p.passport);
      setMoveIn(mi);
      setMoveOut(mo);
      setTenantCompliance(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load tenant operations.');
    } finally {
      setLoading(false);
    }
  };

  const loadPropertyOperations = async (id: number) => {
    setLoading(true);
    setError('');
    try {
      const result = await request<{ passport: any }>(`/property-passport/${id}`);
      setPropertyPassport(result.passport);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load property passport.');
    } finally {
      setLoading(false);
    }
  };

  const loadIncidents = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await request<{ incidents: any[] }>('/incidents');
      setIncidents(result.incidents || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load incidents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) loadTenantOperations(Number(tenantId));
    else {
      setPassport(null);
      setMoveIn(null);
      setMoveOut(null);
      setTenantCompliance(null);
    }
  }, [tenantId]);

  useEffect(() => {
    if (propertyId) loadPropertyOperations(Number(propertyId));
    else setPropertyPassport(null);
  }, [propertyId]);

  useEffect(() => {
    if (section === 'incidents') loadIncidents();
  }, [section]);

  const startMoveIn = async () => {
    if (!tenantId) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await request('/move-in', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: Number(tenantId) }),
      });
      await loadTenantOperations(Number(tenantId));
      setMessage('Move-in workflow started.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start move-in.');
    } finally { setSaving(false); }
  };

  const updateMoveInChecklist = async (key: string, checked: boolean) => {
    if (!moveIn?.report?.id) return;
    setSaving(true); setError('');
    try {
      await request(`/move-in/${moveIn.report.id}/checklist`, {
        method: 'PATCH',
        body: JSON.stringify({ [key]: checked }),
      });
      await loadTenantOperations(Number(tenantId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update move-in checklist.');
    } finally { setSaving(false); }
  };

  const completeMoveIn = async () => {
    if (!moveIn?.report?.id) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await request(`/move-in/${moveIn.report.id}/complete`, { method: 'POST' });
      await loadTenantOperations(Number(tenantId));
      setMessage('Move-in completed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to complete move-in.');
    } finally { setSaving(false); }
  };

  const startMoveOut = async () => {
    if (!tenantId) return;
    const date = window.prompt('Expected move-out date (YYYY-MM-DD)', selectedTenant?.move_out_date || '');
    if (!date) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await request('/move-out', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: Number(tenantId),
          expected_move_out: date,
          notice_date: new Date().toISOString().slice(0, 10),
        }),
      });
      await loadTenantOperations(Number(tenantId));
      setMessage('Move-out workflow started.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start move-out.');
    } finally { setSaving(false); }
  };

  const updateMoveOutChecklist = async (key: string, checked: boolean) => {
    const report = moveOut?.reports?.[0];
    if (!report?.id) return;
    setSaving(true); setError('');
    try {
      await request(`/move-out/${report.id}/checklist`, {
        method: 'PATCH',
        body: JSON.stringify({ [key]: checked }),
      });
      await loadTenantOperations(Number(tenantId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update move-out checklist.');
    } finally { setSaving(false); }
  };

  const calculateSettlement = async () => {
    const report = moveOut?.reports?.[0];
    if (!report?.id) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await request(`/move-out/${report.id}/settlement`, {
        method: 'POST',
        body: JSON.stringify({
          rent_outstanding: Number(settlement.rent_outstanding) || 0,
          utility_charges: Number(settlement.utility_charges) || 0,
          damage_charges: Number(settlement.damage_charges) || 0,
          other_charges: Number(settlement.other_charges) || 0,
        }),
      });
      await loadTenantOperations(Number(tenantId));
      setMessage('Deposit settlement calculated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to calculate settlement.');
    } finally { setSaving(false); }
  };

  const completeMoveOut = async () => {
    const report = moveOut?.reports?.[0];
    if (!report?.id) return;
    if (!window.confirm('Complete this move-out and close the tenant workflow?')) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await request(`/move-out/${report.id}/complete`, { method: 'POST' });
      await loadTenantOperations(Number(tenantId));
      setMessage('Move-out completed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to complete move-out.');
    } finally { setSaving(false); }
  };

  const addCompliance = async () => {
    if (!tenantId || !complianceRequirement.trim()) {
      setError('Enter a compliance requirement.');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      await request('/tenant-compliance', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: Number(tenantId),
          requirement: complianceRequirement.trim(),
          status: complianceStatus,
          expires_at: complianceExpiry || null,
          notes: complianceNotes.trim(),
        }),
      });
      setComplianceRequirement('');
      setComplianceExpiry('');
      setComplianceNotes('');
      await loadTenantOperations(Number(tenantId));
      setMessage('Tenant compliance record added.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to add compliance record.');
    } finally { setSaving(false); }
  };

  const updateCompliance = async (item: any, status: string) => {
    setSaving(true); setError('');
    try {
      await request(`/tenant-compliance/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...item, status }),
      });
      await loadTenantOperations(Number(tenantId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update compliance.');
    } finally { setSaving(false); }
  };

  const createIncident = async () => {
    if (!incidentTitle.trim()) {
      setError('Incident title is required.');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      await request('/incidents', {
        method: 'POST',
        body: JSON.stringify({
          title: incidentTitle.trim(),
          incident_type: incidentType,
          severity: incidentSeverity,
          description: incidentDescription.trim(),
          tenant_id: tenantId ? Number(tenantId) : null,
          property_id: propertyId ? Number(propertyId) : selectedTenant?.property_id || null,
          room_id: selectedTenant?.room_id || null,
          bed_id: selectedTenant?.bed_id || null,
        }),
      });
      setIncidentTitle('');
      setIncidentDescription('');
      await loadIncidents();
      setMessage('Incident recorded.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create incident.');
    } finally { setSaving(false); }
  };

  const updateIncident = async (incident: any, status: string) => {
    setSaving(true); setError('');
    try {
      await request(`/incidents/${incident.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadIncidents();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update incident.');
    } finally { setSaving(false); }
  };

  const moveInReport = moveIn?.report;
  const moveInChecklist = moveInReport?.checklist || {};
  const moveOutReport = moveOut?.reports?.[0];
  const moveOutChecklist = moveOutReport?.checklist || {};
  const moveInComplete = moveInKeys.every(([key]) => moveInChecklist[key] === true);
  const moveOutComplete = moveOutKeys.every(([key]) => moveOutChecklist[key] === true);
  const radar = tenantCompliance?.radar || { critical: 0, attention: 0, up_to_date: 0 };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Operations</h2>
          <p>Passports, move-in/out, compliance and incidents in one place.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        {[
          ['tenant', '🪪 Tenant'],
          ['property', '🏠 Property'],
          ['incidents', '🚨 Incidents'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={section === key ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setSection(key as any)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
      {message && <div className="small-empty" style={{ marginBottom: 12 }}>{message}</div>}

      {section === 'tenant' && (
        <>
          <Card>
            <h3>Tenant Passport</h3>
            <p style={{ margin: '6px 0 12px', color: 'var(--text-muted)' }}>Select a tenant to load the complete identity, contract, financial and operations timeline.</p>
            <select className="modal-input" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">Select tenant</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.property_name || 'Property'}</option>
              ))}
            </select>
          </Card>

          {loading && <Card><div className="small-empty">Loading operations…</div></Card>}

          {selectedTenant && !loading && (
            <>
              <Card>
                <div className="detail-profile">
                  <div className="avatar profile-avatar">{selectedTenant.name.slice(0, 1).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <h2>{selectedTenant.name}</h2>
                    <p>{selectedTenant.phone || '-'} · {selectedTenant.room_number || 'No room'} · {selectedTenant.bed_number || 'No bed'}</p>
                  </div>
                  <Pill value={selectedTenant.status || 'active'} />
                </div>

                <div className="detail-grid" style={{ marginTop: 14 }}>
                  <div className="detail-item"><span>Rent</span><strong>{money(selectedTenant.monthly_rent)}</strong></div>
                  <div className="detail-item"><span>Deposit</span><strong>{money(selectedTenant.deposit_amount)}</strong></div>
                  <div className="detail-item"><span>Move in</span><strong>{dateText(selectedTenant.move_in_date)}</strong></div>
                  <div className="detail-item"><span>Move out</span><strong>{dateText(selectedTenant.move_out_date)}</strong></div>
                </div>
              </Card>

              {passport && (
                <Card>
                  <h3>Identity & Verification</h3>
                  <div className="detail-grid" style={{ marginTop: 10 }}>
                    <div className="detail-item"><span>Verification</span><strong><Pill value={passport.identity?.verification?.status || 'not_started'} /></strong></div>
                    <div className="detail-item"><span>Source</span><strong>{passport.identity?.verification?.source || '-'}</strong></div>
                    <div className="detail-item"><span>Document</span><strong>{passport.identity?.verification?.masked_document || 'Not verified'}</strong></div>
                    <div className="detail-item"><span>Outstanding</span><strong>{money(passport.financial?.outstanding_amount)}</strong></div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <strong>Timeline</strong>
                    {(passport.timeline || []).slice(0, 8).map((event: any, index: number) => (
                      <div className="history-row" key={`${event.entity_id || index}-${event.created_at || index}`}>
                        <div><strong>{String(event.action || event.type || 'event').replace(/[._-]/g, ' ')}</strong><span>{event.metadata?.source || event.metadata?.category || ''}</span></div>
                        <div><span>{dateText(event.created_at)}</span></div>
                      </div>
                    ))}
                    {!passport.timeline?.length && <div className="small-empty">No timeline events yet.</div>}
                  </div>
                </Card>
              )}

              <Card>
                <div className="section-heading">
                  <div><h3>Move-In</h3><p>Complete the controlled move-in checklist before closing the workflow.</p></div>
                  {!moveInReport && <button className="btn-primary" type="button" onClick={startMoveIn} disabled={saving}>Start</button>}
                </div>
                {moveInReport ? (
                  <>
                    <Checklist items={moveInKeys} value={moveInChecklist} onChange={updateMoveInChecklist} />
                    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                      <Pill value={moveInReport.status} />
                      <button className="btn-primary" type="button" onClick={completeMoveIn} disabled={saving || !moveInComplete || moveInReport.status === 'completed'}>
                        {moveInReport.status === 'completed' ? 'Completed' : 'Complete Move-In'}
                      </button>
                    </div>
                  </>
                ) : <div className="small-empty">No move-in report yet.</div>}
              </Card>

              <Card>
                <div className="section-heading">
                  <div><h3>Move-Out</h3><p>Notice, inspection, settlement and final closure.</p></div>
                  {!moveOutReport && <button className="btn-secondary" type="button" onClick={startMoveOut} disabled={saving}>Start Notice</button>}
                </div>
                {moveOutReport ? (
                  <>
                    <div className="detail-grid">
                      <div className="detail-item"><span>Expected</span><strong>{dateText(moveOutReport.expected_move_out)}</strong></div>
                      <div className="detail-item"><span>Status</span><strong><Pill value={moveOutReport.status} /></strong></div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <Checklist items={moveOutKeys} value={moveOutChecklist} onChange={updateMoveOutChecklist} />
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <strong>Deposit settlement</strong>
                      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                        {([
                          ['rent_outstanding', 'Rent outstanding'],
                          ['utility_charges', 'Utility charges'],
                          ['damage_charges', 'Damage charges'],
                          ['other_charges', 'Other charges'],
                        ] as const).map(([key, label]) => (
                          <input key={key} className="modal-input" type="number" min="0" placeholder={label} value={settlement[key]} onChange={(e) => setSettlement((s) => ({ ...s, [key]: e.target.value }))} />
                        ))}
                        <button className="btn-secondary full-btn" type="button" onClick={calculateSettlement} disabled={saving}>Calculate Settlement</button>
                      </div>
                    </div>
                    {moveOutReport.deposit_settlement && (
                      <div className="finance-panel" style={{ marginTop: 10 }}>
                        <div><span>Deposit</span><strong>{money(moveOutReport.deposit_settlement.deposit)}</strong></div>
                        <div><span>Deductions</span><strong>{money(moveOutReport.deposit_settlement.total_deductions)}</strong></div>
                        <div><span>Refund</span><strong>{money(moveOutReport.deposit_settlement.refund)}</strong></div>
                      </div>
                    )}
                    <button className="btn-primary full-btn" type="button" style={{ marginTop: 10 }} onClick={completeMoveOut} disabled={saving || !moveOutComplete || !moveOutReport.deposit_settlement || moveOutReport.status === 'completed'}>
                      {moveOutReport.status === 'completed' ? 'Move-Out Completed' : 'Complete Move-Out'}
                    </button>
                  </>
                ) : <div className="small-empty">No move-out report yet.</div>}
              </Card>

              <Card>
                <h3>Tenant Compliance</h3>
                <div className="finance-panel" style={{ margin: '10px 0' }}>
                  <div><span>Critical</span><strong className="danger-text">{radar.critical}</strong></div>
                  <div><span>Attention</span><strong>{radar.attention}</strong></div>
                  <div><span>Up to date</span><strong className="success-text">{radar.up_to_date}</strong></div>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <input className="modal-input" placeholder="Requirement (e.g. Police verification)" value={complianceRequirement} onChange={(e) => setComplianceRequirement(e.target.value)} />
                  <select className="modal-input" value={complianceStatus} onChange={(e) => setComplianceStatus(e.target.value)}>
                    <option value="pending">Pending</option>
                    <option value="verified">Verified</option>
                    <option value="manual_review">Manual review</option>
                    <option value="failed">Failed</option>
                    <option value="completed">Completed</option>
                  </select>
                  <input className="modal-input" type="date" value={complianceExpiry} onChange={(e) => setComplianceExpiry(e.target.value)} />
                  <input className="modal-input" placeholder="Notes" value={complianceNotes} onChange={(e) => setComplianceNotes(e.target.value)} />
                  <button className="btn-secondary full-btn" type="button" onClick={addCompliance} disabled={saving}>Add Compliance Record</button>
                </div>
                <div style={{ marginTop: 10 }}>
                  {(tenantCompliance?.items || []).map((item: any) => (
                    <div className="history-row" key={item.id}>
                      <div><strong>{item.requirement}</strong><span>{item.expires_at ? `Expires ${dateText(item.expires_at)}` : 'No expiry'}</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Pill value={item.effective_status || item.status} />
                        {item.effective_status !== 'verified' && <button className="btn-secondary" type="button" onClick={() => updateCompliance(item, 'verified')} disabled={saving}>Verify</button>}
                      </div>
                    </div>
                  ))}
                  {!tenantCompliance?.items?.length && <div className="small-empty">No tenant compliance records yet.</div>}
                </div>
                <p style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: 12 }}>
                  Peacely tracks supplied records and evidence; this does not itself establish legal compliance or official clearance.
                </p>
              </Card>
            </>
          )}
        </>
      )}

      {section === 'property' && (
        <>
          <Card>
            <h3>Property Passport</h3>
            <p style={{ margin: '6px 0 12px', color: 'var(--text-muted)' }}>Portfolio identity, structure, occupancy, operations and compliance evidence.</p>
            <select className="modal-input" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">Select property</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
          </Card>
          {loading && <Card><div className="small-empty">Loading property passport…</div></Card>}
          {propertyPassport && !loading && (
            <>
              <Card>
                <h3>{propertyPassport.identity?.name || selectedProperty?.name}</h3>
                <p style={{ marginTop: 4, color: 'var(--text-muted)' }}>{propertyPassport.identity?.address || selectedProperty?.address || '-'}</p>
                <div className="finance-panel" style={{ marginTop: 12 }}>
                  <div><span>Total beds</span><strong>{propertyPassport.occupancy?.total_beds || 0}</strong></div>
                  <div><span>Occupied</span><strong>{propertyPassport.occupancy?.occupied || 0}</strong></div>
                  <div><span>Vacant</span><strong>{propertyPassport.occupancy?.vacant || 0}</strong></div>
                </div>
              </Card>
              <Card>
                <h3>Compliance Radar</h3>
                <div className="finance-panel" style={{ marginTop: 10 }}>
                  <div><span>Critical</span><strong className="danger-text">{propertyPassport.compliance?.critical || 0}</strong></div>
                  <div><span>Attention</span><strong>{propertyPassport.compliance?.attention || 0}</strong></div>
                  <div><span>Up to date</span><strong className="success-text">{propertyPassport.compliance?.up_to_date || 0}</strong></div>
                </div>
                {(propertyPassport.compliance?.items || []).map((item: any) => (
                  <div className="history-row" key={item.id}>
                    <div><strong>{item.title}</strong><span>{item.expiry_date ? `Expiry ${dateText(item.expiry_date)}` : 'No expiry'}</span></div>
                    <Pill value={item.effective_status || item.status} />
                  </div>
                ))}
              </Card>
              <Card>
                <h3>Operations Snapshot</h3>
                <div className="detail-grid" style={{ marginTop: 10 }}>
                  <div className="detail-item"><span>Rooms</span><strong>{propertyPassport.structure?.rooms?.length || 0}</strong></div>
                  <div className="detail-item"><span>Tenants</span><strong>{propertyPassport.tenants?.length || 0}</strong></div>
                  <div className="detail-item"><span>Maintenance</span><strong>{propertyPassport.operations?.maintenance?.length || 0}</strong></div>
                  <div className="detail-item"><span>Incidents</span><strong>{propertyPassport.operations?.incidents?.length || 0}</strong></div>
                  <div className="detail-item"><span>Expenses</span><strong>{money(propertyPassport.financials?.total_expenses)}</strong></div>
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {section === 'incidents' && (
        <>
          <Card>
            <h3>Incident Management</h3>
            <p style={{ margin: '6px 0 12px', color: 'var(--text-muted)' }}>Record, track and close serious property/tenant events with an audit trail.</p>
            <div style={{ display: 'grid', gap: 8 }}>
              <select className="modal-input" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                <option value="">Optional tenant</option>
                {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
              </select>
              <select className="modal-input" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                <option value="">Optional property</option>
                {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
              <input className="modal-input" placeholder="Incident title" value={incidentTitle} onChange={(e) => setIncidentTitle(e.target.value)} />
              <select className="modal-input" value={incidentType} onChange={(e) => setIncidentType(e.target.value)}>
                <option value="other">Other</option>
                <option value="theft">Theft</option>
                <option value="damage">Damage</option>
                <option value="fight">Fight</option>
                <option value="safety">Safety</option>
                <option value="medical_emergency">Medical emergency</option>
                <option value="fire">Fire</option>
                <option value="security">Security</option>
              </select>
              <select className="modal-input" value={incidentSeverity} onChange={(e) => setIncidentSeverity(e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <textarea className="modal-input" rows={3} placeholder="What happened?" value={incidentDescription} onChange={(e) => setIncidentDescription(e.target.value)} />
              <button className="btn-primary full-btn" type="button" onClick={createIncident} disabled={saving}>Record Incident</button>
            </div>
          </Card>

          <Card>
            <h3>Recent Incidents</h3>
            {loading ? <div className="small-empty">Loading incidents…</div> : incidents.map((incident) => (
              <div className="history-row" key={incident.id}>
                <div>
                  <strong>{incident.title}</strong>
                  <span>{String(incident.incident_type || 'other').replace(/_/g, ' ')} · {dateText(incident.created_at)}</span>
                  {incident.description && <span>{incident.description}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <Pill value={incident.severity} />
                  <select
                    className="modal-input"
                    style={{ minWidth: 120, margin: 0, padding: '7px 9px' }}
                    value={incident.status}
                    onChange={(e) => updateIncident(incident, e.target.value)}
                    disabled={saving}
                  >
                    <option value="reported">Reported</option>
                    <option value="acknowledged">Acknowledged</option>
                    <option value="action_taken">Action taken</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>
            ))}
            {!loading && !incidents.length && <div className="small-empty">No incidents recorded.</div>}
          </Card>
        </>
      )}
    </div>
  );
}
