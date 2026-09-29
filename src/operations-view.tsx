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
  const [section, setSection] = useState<'tenant' | 'property' | 'handover' | 'maintenance' | 'incidents'>('tenant');
  const [tenantId, setTenantId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [passport, setPassport] = useState<Passport | null>(null);
  const [moveIn, setMoveIn] = useState<any>(null);
  const [moveOut, setMoveOut] = useState<any>(null);
  const [tenantCompliance, setTenantCompliance] = useState<any>(null);
  const [damageEvidence, setDamageEvidence] = useState<any>(null);
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
  const [maintenanceJobs, setMaintenanceJobs] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [maintenanceTitle, setMaintenanceTitle] = useState('');
  const [maintenanceDescription, setMaintenanceDescription] = useState('');
  const [maintenanceCategory, setMaintenanceCategory] = useState('General');
  const [maintenancePriority, setMaintenancePriority] = useState('medium');
  const [maintenancePropertyId, setMaintenancePropertyId] = useState('');
  const [maintenanceTenantId, setMaintenanceTenantId] = useState('');
  const [maintenanceVendorId, setMaintenanceVendorId] = useState('');
  const [maintenanceEstimatedCost, setMaintenanceEstimatedCost] = useState('');
  const [maintenancePayer, setMaintenancePayer] = useState('owner');
  const [vendorName, setVendorName] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [vendorService, setVendorService] = useState('');

  const [complianceRequirement, setComplianceRequirement] = useState('');
  const [complianceStatus, setComplianceStatus] = useState('pending');
  const [complianceExpiry, setComplianceExpiry] = useState('');
  const [complianceNotes, setComplianceNotes] = useState('');

  const [evidenceCategory, setEvidenceCategory] = useState('room');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [evidenceFileName, setEvidenceFileName] = useState('');
  const [evidenceMimeType, setEvidenceMimeType] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [evidenceStage, setEvidenceStage] = useState<'move_in' | 'move_out'>('move_in');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [damageCategory, setDamageCategory] = useState('general');
  const [damageDescription, setDamageDescription] = useState('');
  const [damageCost, setDamageCost] = useState('');
  const [agreements, setAgreements] = useState<any[]>([]);
  const [agreementProviderMode, setAgreementProviderMode] = useState('mock');
  const [agreementTemplate, setAgreementTemplate] = useState('pg');
  const [agreementTitle, setAgreementTitle] = useState('Peacely PG Agreement');

  const [settlement, setSettlement] = useState({
    rent_outstanding: '',
    utility_charges: '',
    damage_charges: '',
    other_charges: '',
  });

  const [handovers, setHandovers] = useState<any[]>([]);
  const [selectedHandover, setSelectedHandover] = useState<any>(null);
  const [handoverAcknowledgements, setHandoverAcknowledgements] = useState<any[]>([]);
  const [handoverCurrentOwnerName, setHandoverCurrentOwnerName] = useState('');
  const [handoverCurrentOwnerContact, setHandoverCurrentOwnerContact] = useState('');
  const [handoverNewOwnerName, setHandoverNewOwnerName] = useState('');
  const [handoverNewOwnerContact, setHandoverNewOwnerContact] = useState('');
  const [handoverDate, setHandoverDate] = useState(new Date().toISOString().slice(0, 10));
  const [handoverNotes, setHandoverNotes] = useState('');

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
      const [p, mi, mo, c, d, a] = await Promise.all([
        request<{ passport: Passport }>(`/tenant-passport/${id}`),
        request<any>(`/move-in/${id}`),
        request<any>(`/move-out/${id}`),
        request<any>(`/tenant-compliance/${id}`),
        request<any>(`/damage-evidence/${id}`),
        request<any>(`/agreements/${id}`),
      ]);
      setPassport(p.passport);
      setMoveIn(mi);
      setMoveOut(mo);
      setTenantCompliance(c);
      setDamageEvidence(d);
      setAgreements(a.agreements || []);
      setAgreementProviderMode(a.provider_mode || 'mock');
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

  const loadHandovers = async (id = Number(propertyId)) => {
    if (!id) {
      setHandovers([]);
      setSelectedHandover(null);
      setHandoverAcknowledgements([]);
      return;
    }
    setLoading(true); setError('');
    try {
      const result = await request<{ handovers: any[] }>(`/owner-handover?property_id=${id}`);
      setHandovers(result.handovers || []);
      if (selectedHandover && !result.handovers?.some((item) => Number(item.id) === Number(selectedHandover.id))) {
        setSelectedHandover(null);
        setHandoverAcknowledgements([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load owner handovers.');
    } finally { setLoading(false); }
  };

  const loadHandoverDetail = async (id: number) => {
    setLoading(true); setError('');
    try {
      const result = await request<{ handover: any; acknowledgements: any[] }>(`/owner-handover/${id}`);
      setSelectedHandover(result.handover);
      setHandoverAcknowledgements(result.acknowledgements || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load handover details.');
    } finally { setLoading(false); }
  };

  const createHandover = async () => {
    if (!propertyId || !handoverNewOwnerName.trim()) {
      setError('Select a property and enter the new owner/manager name.');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await request<any>('/owner-handover', {
        method: 'POST',
        body: JSON.stringify({
          property_id: Number(propertyId),
          current_owner_name: handoverCurrentOwnerName.trim(),
          current_owner_contact: handoverCurrentOwnerContact.trim(),
          new_owner_name: handoverNewOwnerName.trim(),
          new_owner_contact: handoverNewOwnerContact.trim(),
          handover_date: handoverDate,
          notes: handoverNotes.trim(),
        }),
      });
      setSelectedHandover(result.handover);
      setHandoverAcknowledgements([]);
      await loadHandovers(Number(propertyId));
      setMessage('Owner handover created with a fresh property snapshot.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create owner handover.');
    } finally { setSaving(false); }
  };

  const acknowledgeHandover = async (party: 'current_owner' | 'new_owner') => {
    if (!selectedHandover) return;
    const defaultName = party === 'current_owner'
      ? selectedHandover.current_owner_name
      : selectedHandover.new_owner_name;
    const name = window.prompt(
      party === 'current_owner' ? 'Confirm current owner name' : 'Confirm new owner / manager name',
      defaultName || '',
    );
    if (!name?.trim()) return;
    const note = window.prompt('Optional acknowledgement note', '') ?? '';
    setSaving(true); setError(''); setMessage('');
    try {
      await request(`/owner-handover/${selectedHandover.id}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({
          party,
          acknowledged_by: name.trim(),
          note: note.trim(),
        }),
      });
      await loadHandoverDetail(Number(selectedHandover.id));
      await loadHandovers(Number(propertyId));
      setMessage(party === 'current_owner'
        ? 'Current owner acknowledgement recorded.'
        : 'New owner/manager acknowledgement recorded.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to record acknowledgement.');
    } finally { setSaving(false); }
  };

  const updateHandoverStatus = async (status: string) => {
    if (!selectedHandover) return;
    if (status === 'completed' && !window.confirm('Complete this handover? The backend will require both acknowledgement records.')) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await request<any>(`/owner-handover/${selectedHandover.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setSelectedHandover(result.handover);
      await loadHandovers(Number(propertyId));
      setMessage(`Handover marked ${status.replace(/_/g, ' ')}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update handover status.');
    } finally { setSaving(false); }
  };

  const printHandoverReport = () => {
    if (!selectedHandover) return;
    window.print();
  };

  const loadMaintenance = async () => {
    setLoading(true); setError('');
    try {
      const [jobs, vendorResult] = await Promise.all([
        request<{ jobs: any[] }>('/maintenance-workflow'),
        request<{ vendors: any[] }>('/maintenance-workflow/vendors'),
      ]);
      setMaintenanceJobs(jobs.jobs || []);
      setVendors(vendorResult.vendors || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load maintenance workflow.');
    } finally { setLoading(false); }
  };

  const createMaintenanceJob = async () => {
    if (!maintenancePropertyId || !maintenanceDescription.trim()) {
      setError('Select a property and describe the maintenance request.');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      await request('/maintenance-workflow', {
        method: 'POST',
        body: JSON.stringify({
          property_id: Number(maintenancePropertyId),
          tenant_id: maintenanceTenantId ? Number(maintenanceTenantId) : null,
          title: maintenanceTitle.trim() || 'Maintenance request',
          description: maintenanceDescription.trim(),
          category: maintenanceCategory,
          priority: maintenancePriority,
          vendor_id: maintenanceVendorId ? Number(maintenanceVendorId) : null,
          estimated_cost: Number(maintenanceEstimatedCost) || 0,
          payer: maintenancePayer,
        }),
      });
      setMaintenanceTitle(''); setMaintenanceDescription(''); setMaintenanceEstimatedCost('');
      await loadMaintenance();
      setMessage('Maintenance request created.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create maintenance request.');
    } finally { setSaving(false); }
  };

  const createVendor = async () => {
    if (!vendorName.trim()) {
      setError('Vendor name is required.');
      return;
    }
    setSaving(true); setError('');
    try {
      await request('/maintenance-workflow/vendors', {
        method: 'POST',
        body: JSON.stringify({ name: vendorName.trim(), phone: vendorPhone.trim(), service: vendorService.trim() }),
      });
      setVendorName(''); setVendorPhone(''); setVendorService('');
      await loadMaintenance();
      setMessage('Vendor added.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to add vendor.');
    } finally { setSaving(false); }
  };

  const updateMaintenanceStatus = async (job: any, status: string) => {
    setSaving(true); setError('');
    try {
      await request(`/maintenance-workflow/${job.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadMaintenance();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update maintenance status.');
    } finally { setSaving(false); }
  };

  const assignMaintenanceVendor = async (job: any, vendorId: string) => {
    setSaving(true); setError('');
    try {
      await request(`/maintenance-workflow/${job.id}/assignment`, {
        method: 'PATCH',
        body: JSON.stringify({ vendor_id: vendorId ? Number(vendorId) : null }),
      });
      await loadMaintenance();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to assign vendor.');
    } finally { setSaving(false); }
  };

  const confirmMaintenance = async (job: any) => {
    if (!window.confirm('Record tenant confirmation for this completed maintenance job?')) return;
    setSaving(true); setError('');
    try {
      await request(`/maintenance-workflow/${job.id}/tenant-confirm`, { method: 'POST' });
      await loadMaintenance();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to record tenant confirmation.');
    } finally { setSaving(false); }
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
      setDamageEvidence(null);
      setAgreements([]);
      setAgreementProviderMode('mock');
    }
  }, [tenantId]);

  useEffect(() => {
    if (propertyId) loadPropertyOperations(Number(propertyId));
    else setPropertyPassport(null);
  }, [propertyId]);

  useEffect(() => {
    if (section === 'incidents') loadIncidents();
    if (section === 'maintenance') loadMaintenance();
    if (section === 'handover') loadHandovers(Number(propertyId));
  }, [section]);

  useEffect(() => {
    if (section === 'handover' && propertyId) loadHandovers(Number(propertyId));
  }, [propertyId, section]);

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

  const uploadEvidenceFile = async () => {
    if (!tenantId || !evidenceFile) {
      setError('Select a tenant and choose a file.');
      return;
    }
    const reportId = evidenceStage === 'move_in' ? moveInReport?.id : moveOutReport?.id;
    if (!reportId) {
      setError(`Start the ${evidenceStage === 'move_in' ? 'move-in' : 'move-out'} workflow first.`);
      return;
    }
    if (evidenceFile.size > 2 * 1024 * 1024) {
      setError('Evidence files are limited to 2 MB in the current development/staging storage mode.');
      return;
    }

    setSaving(true); setError(''); setMessage('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Unable to read the selected file.'));
        reader.readAsDataURL(evidenceFile);
      });

      const result = await request<any>('/evidence-storage/upload', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: Number(tenantId),
          report_id: Number(reportId),
          stage: evidenceStage,
          category: evidenceCategory,
          file_name: evidenceFile.name,
          mime_type: evidenceFile.type,
          data_url: dataUrl,
          note: evidenceNote.trim(),
        }),
      });

      setEvidenceFile(null);
      setEvidenceNote('');
      const input = document.getElementById('peacely-evidence-file') as HTMLInputElement | null;
      if (input) input.value = '';
      await loadTenantOperations(Number(tenantId));
      setMessage('Evidence uploaded and added to the timeline.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to upload evidence.');
    } finally { setSaving(false); }
  };

  const addEvidence = async () => {
    if (!tenantId || !evidenceUrl.trim()) {
      setError('Select a tenant and provide an approved storage URL.');
      return;
    }
    const reportId = evidenceStage === 'move_in' ? moveInReport?.id : moveOutReport?.id;
    if (!reportId) {
      setError(`Start the ${evidenceStage === 'move_in' ? 'move-in' : 'move-out'} workflow first.`);
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      await request(`/move-${evidenceStage === 'move_in' ? 'in' : 'out'}/${reportId}/evidence`, {
        method: 'POST',
        body: JSON.stringify({
          category: evidenceCategory,
          file_url: evidenceUrl.trim(),
          file_name: evidenceFileName.trim(),
          mime_type: evidenceMimeType.trim(),
          note: evidenceNote.trim(),
        }),
      });
      setEvidenceUrl('');
      setEvidenceFileName('');
      setEvidenceMimeType('');
      setEvidenceNote('');
      await loadTenantOperations(Number(tenantId));
      setMessage('Evidence added to the tenant timeline.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to add evidence.');
    } finally { setSaving(false); }
  };

  const createDamageReport = async () => {
    if (!tenantId || !damageDescription.trim()) {
      setError('Select a tenant and describe the observed damage.');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      await request('/damage-evidence', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: Number(tenantId),
          category: damageCategory,
          description: damageDescription.trim(),
          estimated_cost: Number(damageCost) || 0,
          move_in_report_id: moveInReport?.id || null,
          move_out_report_id: moveOutReport?.id || null,
        }),
      });
      setDamageDescription('');
      setDamageCost('');
      await loadTenantOperations(Number(tenantId));
      setMessage('Damage report created.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create damage report.');
    } finally { setSaving(false); }
  };

  const updateDamageDecision = async (report: any, decision: string) => {
    setSaving(true); setError('');
    try {
      await request(`/damage-evidence/${report.id}/decision`, {
        method: 'PATCH',
        body: JSON.stringify({
          owner_decision: decision,
          owner_decision_note: report.owner_decision_note || '',
        }),
      });
      await loadTenantOperations(Number(tenantId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update damage decision.');
    } finally { setSaving(false); }
  };

  const acknowledgeDamage = async (report: any) => {
    if (!window.confirm('Record tenant acknowledgement for this damage report?')) return;
    setSaving(true); setError('');
    try {
      await request(`/damage-evidence/${report.id}/acknowledge`, { method: 'POST' });
      await loadTenantOperations(Number(tenantId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to record acknowledgement.');
    } finally { setSaving(false); }
  };

  const createAgreement = async () => {
    if (!tenantId) {
      setError('Select a tenant first.');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      await request('/agreements', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: Number(tenantId),
          template_type: agreementTemplate,
          title: agreementTitle.trim() || 'Peacely Agreement',
        }),
      });
      await loadTenantOperations(Number(tenantId));
      setMessage('Agreement draft created.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create agreement.');
    } finally { setSaving(false); }
  };

  const signAgreement = async (agreement: any, party: 'owner' | 'tenant') => {
    const label = party === 'owner' ? 'owner' : 'tenant';
    if (!window.confirm('Record the ' + label + ' signature in the current ' + agreementProviderMode + ' environment?')) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await request<any>(`/agreements/${agreement.id}/sign`, {
        method: 'POST',
        body: JSON.stringify({ party }),
      });
      await loadTenantOperations(Number(tenantId));
      setMessage(result.message || 'Signature status updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update agreement signature.');
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

  const addPropertyCompliance = async () => {
    if (!propertyId || !propertyComplianceTitle.trim()) {
      setError('Select a property and enter a compliance item title.');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      await request('/property-compliance', {
        method: 'POST',
        body: JSON.stringify({
          property_id: Number(propertyId),
          title: propertyComplianceTitle.trim(),
          category: propertyComplianceCategory,
          status: propertyComplianceStatus,
          expiry_date: propertyComplianceExpiry || null,
          notes: propertyComplianceNotes.trim(),
        }),
      });
      setPropertyComplianceTitle('');
      setPropertyComplianceExpiry('');
      setPropertyComplianceNotes('');
      await loadPropertyOperations(Number(propertyId));
      setMessage('Property compliance item added.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to add property compliance.');
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
        {[
          ['tenant', '🪪 Tenant'],
          ['property', '🏠 Property'],
          ['handover', '🔄 Handover'],
          ['maintenance', '🔧 Maintenance'],
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
                <div className="section-heading">
                  <div>
                    <h3>Agreement & E-Sign</h3>
                    <p>Create an agreement draft and track both signature parties.</p>
                  </div>
                  <Pill value={agreementProviderMode} />
                </div>
                {agreementProviderMode === 'mock' && (
                  <div className="small-empty" style={{ marginBottom: 10 }}>
                    Test mode: signatures are simulated and are not legal e-signatures.
                  </div>
                )}
                {agreementProviderMode === 'live' && (
                  <div className="small-empty" style={{ marginBottom: 10 }}>
                    Live e-sign is not connected. Peacely will fail closed instead of claiming a legal signature.
                  </div>
                )}
                <div style={{ display: 'grid', gap: 8 }}>
                  <select className="modal-input" value={agreementTemplate} onChange={(e) => setAgreementTemplate(e.target.value)}>
                    <option value="pg">PG Agreement</option>
                    <option value="rental">Rental Agreement</option>
                    <option value="custom">Custom Agreement</option>
                  </select>
                  <input className="modal-input" value={agreementTitle} onChange={(e) => setAgreementTitle(e.target.value)} placeholder="Agreement title" />
                  <button className="btn-primary full-btn" type="button" onClick={createAgreement} disabled={saving}>Create Agreement Draft</button>
                </div>
                <div style={{ marginTop: 14 }}>
                  {(agreements || []).map((agreement: any) => (
                    <div className="history-row" key={agreement.id}>
                      <div>
                        <strong>{agreement.title}</strong>
                        <span>{String(agreement.template_type || '').toUpperCase()} · Created {dateText(agreement.created_at)}</span>
                        <span>Owner: {agreement.owner_signed_at ? 'Signed' : 'Pending'} · Tenant: {agreement.tenant_signed_at ? 'Signed' : 'Pending'}</span>
                        {agreement.provider_reference ? <span>Reference: {agreement.provider_reference}</span> : null}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                        <Pill value={agreement.status} />
                        {agreement.status !== 'signed' && (
                          <>
                            {!agreement.owner_signed_at && <button className="btn-secondary" type="button" onClick={() => signAgreement(agreement, 'owner')} disabled={saving}>Sign as Owner</button>}
                            {!agreement.tenant_signed_at && <button className="btn-secondary" type="button" onClick={() => signAgreement(agreement, 'tenant')} disabled={saving}>Sign as Tenant</button>}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {!agreements.length && <div className="small-empty">No agreements created for this tenant yet.</div>}
                </div>
              </Card>

              <Card>
                <h3>Evidence & Damage</h3>
                <p style={{ margin: '6px 0 12px', color: 'var(--text-muted)' }}>
                  Add evidence references and record observed damage. Evidence comparison is observational and does not determine legal liability.
                </p>
                <div style={{ display: 'grid', gap: 8 }}>
                  <select className="modal-input" value={evidenceStage} onChange={(e) => setEvidenceStage(e.target.value as 'move_in' | 'move_out')}>
                    <option value="move_in">Move-in evidence</option>
                    <option value="move_out">Move-out evidence</option>
                  </select>
                  <select className="modal-input" value={evidenceCategory} onChange={(e) => setEvidenceCategory(e.target.value)}>
                    <option value="room">Room</option>
                    <option value="bed">Bed</option>
                    <option value="mattress">Mattress</option>
                    <option value="wardrobe">Wardrobe</option>
                    <option value="fan">Fan</option>
                    <option value="ac">AC</option>
                    <option value="lights">Lights</option>
                    <option value="switches">Switches</option>
                    <option value="walls">Walls</option>
                    <option value="door">Door</option>
                    <option value="windows">Windows</option>
                    <option value="bathroom">Bathroom</option>
                    <option value="fixtures">Fixtures</option>
                    <option value="general">General</option>
                  </select>
                  <input
                    id="peacely-evidence-file"
                    className="modal-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf"
                    onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                  />
                  <div className="small-empty">
                    {evidenceFile ? `${evidenceFile.name} · ${Math.ceil(evidenceFile.size / 1024)} KB` : 'Upload a photo, short video or PDF. Current development/staging limit: 2 MB.'}
                  </div>
                  <button className="btn-primary full-btn" type="button" onClick={uploadEvidenceFile} disabled={saving || !evidenceFile}>
                    Upload Evidence File
                  </button>
                  <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: 10, marginTop: 4 }}>
                    <strong>External storage reference</strong>
                    <input className="modal-input" style={{ marginTop: 8 }} placeholder="Approved storage URL" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
                    <input className="modal-input" placeholder="File name (optional)" value={evidenceFileName} onChange={(e) => setEvidenceFileName(e.target.value)} />
                    <input className="modal-input" placeholder="MIME type (optional)" value={evidenceMimeType} onChange={(e) => setEvidenceMimeType(e.target.value)} />
                    <button className="btn-secondary full-btn" type="button" onClick={addEvidence} disabled={saving}>Add URL Evidence</button>
                  </div>
                  <textarea className="modal-input" rows={2} placeholder="Evidence note" value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} />
                </div>

                <div style={{ marginTop: 14 }}>
                  <strong>Move-in vs Move-out comparison</strong>
                  {(damageEvidence?.comparison || []).map((item: any) => (
                    <div className="history-row" key={item.category}>
                      <div>
                        <strong>{String(item.category).replace(/_/g, ' ')}</strong>
                        <span>Move-in: {item.move_in_evidence?.length || 0} · Move-out: {item.move_out_evidence?.length || 0}</span>
                      </div>
                      <Pill value={item.requires_review ? 'review' : 'tracked'} />
                    </div>
                  ))}
                  {!damageEvidence?.comparison?.length && <div className="small-empty">No evidence comparison yet.</div>}
                </div>

                <div style={{ marginTop: 14 }}>
                  <strong>Damage report</strong>
                  <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                    <select className="modal-input" value={damageCategory} onChange={(e) => setDamageCategory(e.target.value)}>
                      <option value="general">General</option>
                      <option value="room">Room</option>
                      <option value="bed">Bed</option>
                      <option value="bathroom">Bathroom</option>
                      <option value="furniture">Furniture</option>
                      <option value="electrical">Electrical</option>
                      <option value="other">Other</option>
                    </select>
                    <textarea className="modal-input" rows={3} placeholder="Describe the observed damage" value={damageDescription} onChange={(e) => setDamageDescription(e.target.value)} />
                    <input className="modal-input" type="number" min="0" placeholder="Estimated cost" value={damageCost} onChange={(e) => setDamageCost(e.target.value)} />
                    <button className="btn-secondary full-btn" type="button" onClick={createDamageReport} disabled={saving}>Create Damage Report</button>
                  </div>
                </div>

                {(damageEvidence?.damage_reports || []).map((report: any) => (
                  <div className="history-row" key={report.id}>
                    <div>
                      <strong>{report.category}</strong>
                      <span>{report.description}</span>
                      <span>Estimated: {money(report.estimated_cost)}{report.tenant_acknowledged_at ? ' · Acknowledged' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <select
                        className="modal-input"
                        style={{ minWidth: 140, margin: 0, padding: '7px 9px' }}
                        value={report.owner_decision}
                        onChange={(e) => updateDamageDecision(report, e.target.value)}
                        disabled={saving}
                      >
                        <option value="pending">Pending</option>
                        <option value="charge_tenant">Charge tenant</option>
                        <option value="owner_absorbs">Owner absorbs</option>
                        <option value="insurance">Insurance</option>
                        <option value="disputed">Disputed</option>
                        <option value="no_charge">No charge</option>
                      </select>
                      {!report.tenant_acknowledged_at && (
                        <button className="btn-secondary" type="button" onClick={() => acknowledgeDamage(report)} disabled={saving}>
                          Record Acknowledgement
                        </button>
                      )}
                    </div>
                  </div>
                ))}
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
                <h3>Property Compliance</h3>
                <p style={{ margin: '6px 0 12px', color: 'var(--text-muted)' }}>
                  Track licences, safety records and other property evidence with expiry dates.
                </p>
                <div style={{ display: 'grid', gap: 8 }}>
                  <input
                    className="modal-input"
                    placeholder="Compliance item title"
                    value={propertyComplianceTitle}
                    onChange={(e) => setPropertyComplianceTitle(e.target.value)}
                  />
                  <select className="modal-input" value={propertyComplianceCategory} onChange={(e) => setPropertyComplianceCategory(e.target.value)}>
                    <option value="property">Property</option>
                    <option value="safety">Safety</option>
                    <option value="licence">Licence</option>
                    <option value="document">Document</option>
                    <option value="other">Other</option>
                  </select>
                  <select className="modal-input" value={propertyComplianceStatus} onChange={(e) => setPropertyComplianceStatus(e.target.value)}>
                    <option value="attention">Attention</option>
                    <option value="critical">Critical</option>
                    <option value="up_to_date">Up to date</option>
                  </select>
                  <input className="modal-input" type="date" value={propertyComplianceExpiry} onChange={(e) => setPropertyComplianceExpiry(e.target.value)} />
                  <input className="modal-input" placeholder="Notes" value={propertyComplianceNotes} onChange={(e) => setPropertyComplianceNotes(e.target.value)} />
                  <button className="btn-secondary full-btn" type="button" onClick={addPropertyCompliance} disabled={saving}>
                    Add Property Compliance
                  </button>
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


      {section === 'handover' && (
        <>
          <Card>
            <div className="section-heading">
              <div>
                <h3>Owner Handover</h3>
                <p>Create a point-in-time property snapshot, record both sides' acknowledgement, and close the handover with an audit trail.</p>
              </div>
              <Pill value={selectedHandover?.status || 'not_started'} />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <select
                className="modal-input"
                value={propertyId}
                onChange={(e) => {
                  setPropertyId(e.target.value);
                  setSelectedHandover(null);
                  setHandoverAcknowledgements([]);
                }}
              >
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>{property.name}</option>
                ))}
              </select>

              <input className="modal-input" placeholder="Current owner name" value={handoverCurrentOwnerName} onChange={(e) => setHandoverCurrentOwnerName(e.target.value)} />
              <input className="modal-input" placeholder="Current owner contact" value={handoverCurrentOwnerContact} onChange={(e) => setHandoverCurrentOwnerContact(e.target.value)} />
              <input className="modal-input" placeholder="New owner / manager name" value={handoverNewOwnerName} onChange={(e) => setHandoverNewOwnerName(e.target.value)} />
              <input className="modal-input" placeholder="New owner / manager contact" value={handoverNewOwnerContact} onChange={(e) => setHandoverNewOwnerContact(e.target.value)} />
              <input className="modal-input" type="date" value={handoverDate} onChange={(e) => setHandoverDate(e.target.value)} />
              <textarea className="modal-input" rows={3} placeholder="Handover notes" value={handoverNotes} onChange={(e) => setHandoverNotes(e.target.value)} />
              <button className="btn-primary full-btn" type="button" onClick={createHandover} disabled={saving || !propertyId || !handoverNewOwnerName.trim()}>
                Create Handover & Capture Snapshot
              </button>
            </div>
          </Card>

          <Card>
            <div className="section-heading">
              <div>
                <h3>Handover Records</h3>
                <p>Select a record to review its property, tenants, finances, operations and compliance snapshot.</p>
              </div>
              {propertyId && <button className="btn-secondary" type="button" onClick={() => loadHandovers(Number(propertyId))} disabled={loading}>Refresh</button>}
            </div>

            {!propertyId ? (
              <div className="small-empty">Select a property to load handover records.</div>
            ) : loading ? (
              <div className="small-empty">Loading handovers…</div>
            ) : !handovers.length ? (
              <div className="small-empty">No handovers recorded for this property.</div>
            ) : (
              handovers.map((handover) => (
                <button
                  key={handover.id}
                  type="button"
                  className="history-row"
                  style={{ width: '100%', textAlign: 'left', border: 0, background: 'transparent', cursor: 'pointer' }}
                  onClick={() => loadHandoverDetail(Number(handover.id))}
                >
                  <div>
                    <strong>{handover.new_owner_name || 'New owner / manager'}</strong>
                    <span>{dateText(handover.handover_date)} · Created {dateText(handover.created_at)}</span>
                  </div>
                  <Pill value={handover.status || 'draft'} />
                </button>
              ))
            )}
          </Card>

          {selectedHandover && (
            <>
              <Card>
                <div className="section-heading">
                  <div>
                    <h3>Handover Snapshot</h3>
                    <p>Captured when this handover was created. This is a record of the property state at that point in time.</p>
                  </div>
                  <button className="btn-secondary" type="button" onClick={printHandoverReport}>Print / Save PDF</button>
                </div>

                <div className="detail-grid">
                  <div className="detail-item"><span>Property</span><strong>{selectedHandover.property_snapshot?.property?.name || selectedProperty?.name || '-'}</strong></div>
                  <div className="detail-item"><span>Handover date</span><strong>{dateText(selectedHandover.handover_date)}</strong></div>
                  <div className="detail-item"><span>Current owner</span><strong>{selectedHandover.current_owner_name || '-'}</strong></div>
                  <div className="detail-item"><span>New owner / manager</span><strong>{selectedHandover.new_owner_name || '-'}</strong></div>
                  <div className="detail-item"><span>Rooms</span><strong>{selectedHandover.property_snapshot?.structure?.room_count ?? 0}</strong></div>
                  <div className="detail-item"><span>Beds</span><strong>{selectedHandover.property_snapshot?.structure?.bed_count ?? 0}</strong></div>
                  <div className="detail-item"><span>Occupied beds</span><strong>{selectedHandover.property_snapshot?.structure?.occupied_beds ?? 0}</strong></div>
                  <div className="detail-item"><span>Vacant beds</span><strong>{selectedHandover.property_snapshot?.structure?.vacant_beds ?? 0}</strong></div>
                  <div className="detail-item"><span>Active tenants</span><strong>{selectedHandover.tenant_snapshot?.active_count ?? 0}</strong></div>
                  <div className="detail-item"><span>Collected</span><strong>{money(selectedHandover.financial_snapshot?.collected_total)}</strong></div>
                  <div className="detail-item"><span>Outstanding</span><strong>{money(selectedHandover.financial_snapshot?.outstanding_total)}</strong></div>
                  <div className="detail-item"><span>Expenses</span><strong>{money(selectedHandover.financial_snapshot?.expense_total)}</strong></div>
                </div>

                {selectedHandover.notes && (
                  <div className="small-empty" style={{ marginTop: 10 }}>
                    <strong>Notes:</strong> {selectedHandover.notes}
                  </div>
                )}
              </Card>

              <Card>
                <h3>Operational Snapshot</h3>
                <div className="detail-grid" style={{ marginTop: 10 }}>
                  <div className="detail-item"><span>Maintenance</span><strong>{selectedHandover.maintenance_snapshot?.maintenance_count ?? 0}</strong></div>
                  <div className="detail-item"><span>Open maintenance</span><strong>{selectedHandover.maintenance_snapshot?.open_maintenance_count ?? 0}</strong></div>
                  <div className="detail-item"><span>Incidents</span><strong>{selectedHandover.maintenance_snapshot?.incident_count ?? 0}</strong></div>
                  <div className="detail-item"><span>Open incidents</span><strong>{selectedHandover.maintenance_snapshot?.open_incident_count ?? 0}</strong></div>
                  <div className="detail-item"><span>Compliance items</span><strong>{selectedHandover.compliance_snapshot?.count ?? 0}</strong></div>
                  <div className="detail-item"><span>Compliance critical</span><strong>{selectedHandover.compliance_snapshot?.critical_count ?? 0}</strong></div>
                  <div className="detail-item"><span>Compliance attention</span><strong>{selectedHandover.compliance_snapshot?.attention_count ?? 0}</strong></div>
                </div>
              </Card>

              <Card>
                <div className="section-heading">
                  <div>
                    <h3>Two-Sided Acknowledgement</h3>
                    <p>Both acknowledgement records are required by the backend before this handover can be marked completed.</p>
                  </div>
                </div>

                <div className="detail-grid">
                  {(['current_owner', 'new_owner'] as const).map((party) => {
                    const ack = handoverAcknowledgements.find((item) => item.party === party);
                    return (
                      <div className="glass-card" key={party} style={{ marginBottom: 0 }}>
                        <strong>{party === 'current_owner' ? 'Current owner' : 'New owner / manager'}</strong>
                        <div style={{ marginTop: 8 }}><Pill value={ack ? 'acknowledged' : 'pending'} /></div>
                        {ack && <div className="small-empty" style={{ marginTop: 8 }}>{ack.acknowledged_by}<br />{dateText(ack.acknowledged_at)}</div>}
                        {!ack && (
                          <button className="btn-secondary full-btn" type="button" style={{ marginTop: 8 }} onClick={() => acknowledgeHandover(party)} disabled={saving}>
                            Record Acknowledgement
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <select
                    className="modal-input"
                    style={{ flex: 1, minWidth: 180, margin: 0 }}
                    value={selectedHandover.status || 'ready'}
                    onChange={(e) => updateHandoverStatus(e.target.value)}
                    disabled={saving}
                  >
                    <option value="draft">Draft</option>
                    <option value="ready">Ready</option>
                    <option value="acknowledged">Acknowledged</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <button className="btn-primary" type="button" onClick={() => updateHandoverStatus('completed')} disabled={saving || selectedHandover.status === 'completed'}>
                    {selectedHandover.status === 'completed' ? 'Completed' : 'Complete Handover'}
                  </button>
                </div>

                <div className="small-empty" style={{ marginTop: 10 }}>
                  <strong>Important:</strong> Peacely records the acknowledgement entries you submit; the current session is not a separate legal identity provider for the new owner/manager.
                </div>
              </Card>

              <Card>
                <h3>Tenant Snapshot</h3>
                {(selectedHandover.tenant_snapshot?.records || []).length ? (
                  selectedHandover.tenant_snapshot.records.map((tenant: any) => (
                    <div className="history-row" key={tenant.id}>
                      <div>
                        <strong>{tenant.name}</strong>
                        <span>{tenant.phone || '-'} · Rent {money(tenant.monthly_rent)} · Deposit {money(tenant.deposit_amount)}</span>
                      </div>
                      <Pill value={tenant.status || 'active'} />
                    </div>
                  ))
                ) : <div className="small-empty">No tenant records in this snapshot.</div>}
              </Card>
            </>
          )}
        </>
      )}

      {section === 'maintenance' && (
        <>
          <Card>
            <h3>Maintenance Workflow</h3>
            <p style={{ margin: '6px 0 12px', color: 'var(--text-muted)' }}>
              Reported → Assigned → Work started → Completed → Tenant confirmed.
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              <select className="modal-input" value={maintenancePropertyId} onChange={(e) => setMaintenancePropertyId(e.target.value)}>
                <option value="">Select property</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="modal-input" value={maintenanceTenantId} onChange={(e) => setMaintenanceTenantId(e.target.value)}>
                <option value="">Optional tenant</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.property_name || 'Property'}</option>)}
              </select>
              <input className="modal-input" placeholder="Request title" value={maintenanceTitle} onChange={(e) => setMaintenanceTitle(e.target.value)} />
              <textarea className="modal-input" rows={3} placeholder="Describe the maintenance issue" value={maintenanceDescription} onChange={(e) => setMaintenanceDescription(e.target.value)} />
              <select className="modal-input" value={maintenanceCategory} onChange={(e) => setMaintenanceCategory(e.target.value)}>
                <option>General</option><option>Plumbing</option><option>Electrical</option><option>AC</option><option>Cleaning</option><option>Furniture</option><option>Internet</option><option>Security</option>
              </select>
              <select className="modal-input" value={maintenancePriority} onChange={(e) => setMaintenancePriority(e.target.value)}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
              <select className="modal-input" value={maintenanceVendorId} onChange={(e) => setMaintenanceVendorId(e.target.value)}>
                <option value="">Assign later</option>
                {vendors.filter((v) => v.active).map((v) => <option key={v.id} value={v.id}>{v.name} · {v.service || 'Vendor'}</option>)}
              </select>
              <input className="modal-input" type="number" min="0" placeholder="Estimated cost" value={maintenanceEstimatedCost} onChange={(e) => setMaintenanceEstimatedCost(e.target.value)} />
              <select className="modal-input" value={maintenancePayer} onChange={(e) => setMaintenancePayer(e.target.value)}>
                <option value="owner">Owner</option><option value="tenant">Tenant</option><option value="shared">Shared</option><option value="vendor">Vendor</option><option value="insurance">Insurance</option>
              </select>
              <button className="btn-primary full-btn" type="button" onClick={createMaintenanceJob} disabled={saving}>Create Maintenance Request</button>
            </div>
          </Card>

          <Card>
            <h3>Vendors</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <input className="modal-input" placeholder="Vendor name" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
              <input className="modal-input" placeholder="Phone" value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} />
              <input className="modal-input" placeholder="Service" value={vendorService} onChange={(e) => setVendorService(e.target.value)} />
              <button className="btn-secondary full-btn" type="button" onClick={createVendor} disabled={saving}>Add Vendor</button>
            </div>
            <div style={{ marginTop: 12 }}>
              {vendors.map((v) => <div className="history-row" key={v.id}><div><strong>{v.name}</strong><span>{v.service || 'General service'} · {v.phone || 'No phone'}</span></div><Pill value={v.active ? 'active' : 'inactive'} /></div>)}
              {!vendors.length && <div className="small-empty">No vendors yet.</div>}
            </div>
          </Card>

          <Card>
            <h3>Maintenance Jobs</h3>
            {loading ? <div className="small-empty">Loading maintenance…</div> : maintenanceJobs.map((job) => (
              <div className="history-row" key={job.id}>
                <div>
                  <strong>{job.title}</strong>
                  <span>{job.description}</span>
                  <span>{job.property_name || 'Property'} · {job.tenant_name || 'No tenant'} · {money(job.actual_cost || job.estimated_cost)}</span>
                  {job.vendor_name && <span>Vendor: {job.vendor_name} · {job.vendor_service || ''}</span>}
                  {job.tenant_confirmed_at && <span>Tenant confirmed</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <Pill value={job.priority} />
                  <select className="modal-input" style={{ minWidth: 140, margin: 0, padding: '7px 9px' }} value={job.status} onChange={(e) => updateMaintenanceStatus(job, e.target.value)} disabled={saving}>
                    <option value="reported">Reported</option><option value="assigned">Assigned</option><option value="work_started">Work started</option><option value="completed">Completed</option>
                  </select>
                  <select className="modal-input" style={{ minWidth: 140, margin: 0, padding: '7px 9px' }} value={job.vendor_id || ''} onChange={(e) => assignMaintenanceVendor(job, e.target.value)} disabled={saving}>
                    <option value="">No vendor</option>
                    {vendors.filter((v) => v.active).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  {job.status === 'completed' && !job.tenant_confirmed_at && <button className="btn-secondary" type="button" onClick={() => confirmMaintenance(job)} disabled={saving}>Tenant Confirmed</button>}
                </div>
              </div>
            ))}
            {!loading && !maintenanceJobs.length && <div className="small-empty">No maintenance jobs yet.</div>}
          </Card>
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
