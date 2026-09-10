const API = "/api";

function formatMoney(amount: number) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthName(date = new Date()) {
  return date.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function normalizeStatus(status: string): "Active" | "Inactive" {
  return status?.toLowerCase() === "inactive" ? "Inactive" : "Active";
}

function normalizeInvoiceStatus(status: string): "Paid" | "Pending" {
  return status?.toLowerCase() === "paid" ? "Paid" : "Pending";
}

async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });

  let data: any = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
        data?.message ||
        `Request failed with status ${response.status}`
    );
  }

  return data as T;
}

function Peacely() {
  const [view, setView] = useState<View>("dashboard");

  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");

  const [selectedPropertyId, setSelectedPropertyId] =
    useState<number | null>(null);

  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [showTenantForm, setShowTenantForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const [propertyName, setPropertyName] = useState("");
  const [propertyLocation, setPropertyLocation] = useState("");

  const [roomNumber, setRoomNumber] = useState("");
  const [bedCount, setBedCount] = useState("2");

  const [tenantName, setTenantName] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantPropertyId, setTenantPropertyId] = useState("");
  const [tenantRoomId, setTenantRoomId] = useState("");
  const [tenantBedId, setTenantBedId] = useState("");
  const [tenantRent, setTenantRent] = useState("");
  const [tenantDueDay, setTenantDueDay] = useState("5");
  const [tenantMoveIn, setTenantMoveIn] = useState(today());
  const [tenantDeposit, setTenantDeposit] = useState("");

  const [paymentTenantId, setPaymentTenantId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [paymentMonth, setPaymentMonth] = useState(monthName());
  const [paymentNote, setPaymentNote] = useState("");

  const [tenantSearch, setTenantSearch] = useState("");

  /*
   * =========================
   * LOAD DATA FROM POSTGRESQL
   * =========================
   */

  async function loadAllData() {
    try {
      setApiError("");

      const [
        propertiesResponse,
        tenantsResponse,
        paymentsResponse,
        invoicesResponse,
      ] = await Promise.all([
        apiRequest<any[]>("/properties"),
        apiRequest<any[]>("/tenants"),
        apiRequest<any[]>("/payments"),
        apiRequest<any[]>("/invoices"),
      ]);

      const propertiesWithRooms: Property[] = await Promise.all(
        (propertiesResponse || []).map(async (property) => {
          const roomsResponse = await apiRequest<any[]>(
            `/properties/${property.id}/rooms`
          );

          const rooms: Room[] = await Promise.all(
            (roomsResponse || []).map(async (room) => {
              const bedsResponse = await apiRequest<any[]>(
                `/rooms/${room.id}/beds`
              );

              return {
                id: Number(room.id),
                number: String(room.room_number),
                beds: (bedsResponse || []).map((bed) => ({
                  id: Number(bed.id),
                  number: String(bed.bed_number),
                  occupied: Boolean(bed.occupied),
                  tenantId: undefined,
                })),
              };
            })
          );

          return {
            id: Number(property.id),
            name: property.name,
            location: property.location || "",
            rooms,
          };
        })
      );

      const normalizedTenants: Tenant[] = (
        tenantsResponse || []
      ).map((tenant) => ({
        id: Number(tenant.id),
        name: tenant.name,
        phone: tenant.phone || "",
        email: tenant.email || "",
        propertyId: Number(tenant.property_id || 0),
        roomId: Number(tenant.room_id || 0),
        bedId: Number(tenant.bed_id || 0),
        rent: Number(tenant.rent || 0),
        dueDay: Number(tenant.due_day || 5),
        moveInDate: tenant.move_in_date
          ? String(tenant.move_in_date).slice(0, 10)
          : "",
        deposit: Number(tenant.deposit || 0),
        status: normalizeStatus(tenant.status),
      }));

      const updatedProperties = propertiesWithRooms.map((property) => ({
        ...property,
        rooms: property.rooms.map((room) => ({
          ...room,
          beds: room.beds.map((bed) => {
            const tenant = normalizedTenants.find(
              (item) =>
                item.propertyId === property.id &&
                item.roomId === room.id &&
                item.bedId === bed.id
            );

            return {
              ...bed,
              tenantId: tenant?.id,
              occupied: tenant ? true : bed.occupied,
            };
          }),
        })),
      }));

      const normalizedPayments: Payment[] = (
        paymentsResponse || []
      ).map((payment) => ({
        id: Number(payment.id),
        tenantId: Number(payment.tenant_id),
        amount: Number(payment.amount || 0),
        date: payment.payment_date
          ? String(payment.payment_date).slice(0, 10)
          : "",
        month: payment.month || "",
        method: payment.method || "",
        note: payment.note || "",
      }));

      const normalizedInvoices: Invoice[] = (
        invoicesResponse || []
      ).map((invoice) => ({
        id: Number(invoice.id),
        tenantId: Number(invoice.tenant_id),
        invoiceNumber: invoice.invoice_number,
        amount: Number(invoice.amount || 0),
        month: invoice.month || "",
        dueDate: invoice.due_date
          ? String(invoice.due_date).slice(0, 10)
          : "",
        status: normalizeInvoiceStatus(invoice.status),
        createdAt: invoice.created_at
          ? String(invoice.created_at).slice(0, 10)
          : "",
      }));

      setProperties(updatedProperties);
      setTenants(normalizedTenants);
      setPayments(normalizedPayments);
      setInvoices(normalizedInvoices);
    } catch (error) {
      console.error("Peacely data loading error:", error);

      setApiError(
        error instanceof Error
          ? error.message
          : "Unable to connect to Peacely database"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAllData();
  }, []);

  /*
   * =========================
   * CALCULATIONS
   * =========================
   */

  const selectedProperty = properties.find(
    (property) => property.id === selectedPropertyId
  );

  const totalRooms = properties.reduce(
    (total, property) => total + property.rooms.length,
    0
  );

  const totalBeds = properties.reduce(
    (total, property) =>
      total +
      property.rooms.reduce(
        (roomTotal, room) => roomTotal + room.beds.length,
        0
      ),
    0
  );

  const occupiedBeds = properties.reduce(
    (total, property) =>
      total +
      property.rooms.reduce(
        (roomTotal, room) =>
          roomTotal + room.beds.filter((bed) => bed.occupied).length,
        0
      ),
    0
  );

  const vacantBeds = totalBeds - occupiedBeds;

  const activeTenants = tenants.filter(
    (tenant) => tenant.status === "Active"
  );

  const monthlyExpectedRent = activeTenants.reduce(
    (total, tenant) => total + tenant.rent,
    0
  );

  const currentMonth = monthName();

  const currentMonthPayments = payments
    .filter((payment) => payment.month === currentMonth)
    .reduce((total, payment) => total + payment.amount, 0);

  const pendingInvoices = invoices.filter(
    (invoice) => invoice.status === "Pending"
  );

  const pendingAmount = pendingInvoices.reduce(
    (total, invoice) => total + invoice.amount,
    0
  );

  const filteredTenants = useMemo(() => {
    const search = tenantSearch.toLowerCase().trim();

    if (!search) return tenants;

    return tenants.filter(
      (tenant) =>
        tenant.name.toLowerCase().includes(search) ||
        tenant.phone.includes(search)
    );
  }, [tenants, tenantSearch]);

  const tenantProperty = properties.find(
    (property) => property.id === Number(tenantPropertyId)
  );

  const availableRooms = tenantProperty?.rooms || [];

  const tenantRoom = tenantProperty?.rooms.find(
    (room) => room.id === Number(tenantRoomId)
  );

  const availableBeds =
    tenantRoom?.beds.filter((bed) => !bed.occupied) || [];

  /*
   * =========================
   * NAVIGATION
   * =========================
   */

  function navigate(nextView: View) {
    setView(nextView);
    setSelectedPropertyId(null);
  }

  /*
   * =========================
   * ADD PROPERTY
   * =========================
   */

  async function addProperty() {
    if (!propertyName.trim() || !propertyLocation.trim()) return;

    try {
      await apiRequest("/properties", {
        method: "POST",
        body: JSON.stringify({
          name: propertyName.trim(),
          location: propertyLocation.trim(),
        }),
      });

      setPropertyName("");
      setPropertyLocation("");
      setShowPropertyForm(false);

      await loadAllData();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to create property"
      );
    }
  }

  /*
   * =========================
   * ADD ROOM + BEDS
   * =========================
   */

  async function addRoom() {
    if (!selectedProperty || !roomNumber.trim()) return;

    try {
      const count = Math.max(
        1,
        Math.min(10, Number(bedCount) || 1)
      );

      await apiRequest(`/properties/${selectedProperty.id}/rooms`, {
        method: "POST",
        body: JSON.stringify({
          roomNumber: roomNumber.trim(),
          bedCount: count,
        }),
      });

      setRoomNumber("");
      setBedCount("2");
      setShowRoomForm(false);

      await loadAllData();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to create room"
      );
    }
  }

  /*
   * =========================
   * BED OCCUPANCY
   * =========================
   */

  async function toggleBed(roomId: number, bedId: number) {
    const room = selectedProperty?.rooms.find(
      (item) => item.id === roomId
    );

    const bed = room?.beds.find((item) => item.id === bedId);

    if (!bed) return;

    try {
      await apiRequest(`/beds/${bedId}`, {
        method: "PATCH",
        body: JSON.stringify({
          occupied: !bed.occupied,
        }),
      });

      await loadAllData();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to update bed"
      );
    }
  }

  /*
   * =========================
   * ADD TENANT
   * =========================
   */

  async function addTenant() {
    if (
      !tenantName.trim() ||
      !tenantPhone.trim() ||
      !tenantPropertyId ||
      !tenantRoomId ||
      !tenantBedId ||
      !tenantRent
    ) {
      alert("Please fill all required tenant details.");
      return;
    }

    try {
      await apiRequest("/tenants", {
        method: "POST",
        body: JSON.stringify({
          name: tenantName.trim(),
          phone: tenantPhone.trim(),
          email: tenantEmail.trim() || null,
          ownerId: null,
          propertyId: Number(tenantPropertyId),
          roomId: Number(tenantRoomId),
          bedId: Number(tenantBedId),
          rent: Number(tenantRent),
          dueDay: Number(tenantDueDay) || 5,
          moveInDate: tenantMoveIn,
          deposit: Number(tenantDeposit) || 0,
          status: "active",
        }),
      });

      setTenantName("");
      setTenantPhone("");
      setTenantEmail("");
      setTenantRent("");
      setTenantDueDay("5");
      setTenantMoveIn(today());
      setTenantDeposit("");
      setTenantPropertyId("");
      setTenantRoomId("");
      setTenantBedId("");
      setShowTenantForm(false);

      await loadAllData();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to create tenant"
      );
    }
  }

  /*
   * =========================
   * RECORD PAYMENT
   * =========================
   */

  async function recordPayment() {
    if (!paymentTenantId || !paymentAmount) {
      alert("Please select a tenant and enter an amount.");
      return;
    }

    const tenantId = Number(paymentTenantId);
    const amount = Number(paymentAmount);

    try {
      await apiRequest("/payments", {
        method: "POST",
        body: JSON.stringify({
          tenantId,
          amount,
          paymentDate: today(),
          month: paymentMonth,
          method: paymentMethod,
          note: paymentNote.trim() || "Monthly rent",
        }),
      });

      const matchingInvoice = invoices.find(
        (invoice) =>
          invoice.tenantId === tenantId &&
          invoice.month === paymentMonth &&
          invoice.status === "Pending"
      );

      if (matchingInvoice) {
        await apiRequest(`/invoices/${matchingInvoice.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "paid",
          }),
        });
      }

      setPaymentTenantId("");
      setPaymentAmount("");
      setPaymentMethod("UPI");
      setPaymentMonth(monthName());
      setPaymentNote("");
      setShowPaymentForm(false);

      await loadAllData();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to record payment"
      );
    }
  }

  /*
   * =========================
   * CREATE INVOICE
   * =========================
   */

  async function createInvoice(tenant: Tenant) {
    const invoiceMonth = monthName();

    const alreadyExists = invoices.some(
      (invoice) =>
        invoice.tenantId === tenant.id &&
        invoice.month === invoiceMonth
    );

    if (alreadyExists) return;

    try {
      const invoiceNumber = `INV-${Date.now()}`;

      const dueDate = `${today().slice(0, 8)}${String(
        tenant.dueDay
      ).padStart(2, "0")}`;

      await apiRequest("/invoices", {
        method: "POST",
        body: JSON.stringify({
          tenantId: tenant.id,
          invoiceNumber,
          amount: tenant.rent,
          month: invoiceMonth,
          dueDate,
          status: "pending",
        }),
      });

      await loadAllData();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to create invoice"
      );
    }
  }

  /*
   * =========================
   * HELPER FUNCTIONS
   * =========================
   */

  function tenantNameById(id: number) {
    return (
      tenants.find((tenant) => tenant.id === id)?.name ||
      "Unknown"
    );
  }

  function propertyNameById(id: number) {
    return (
      properties.find((property) => property.id === id)?.name ||
      "-"
    );
  }

  function roomNameById(propertyId: number, roomId: number) {
    const property = properties.find(
      (item) => item.id === propertyId
    );

    return (
      property?.rooms.find((room) => room.id === roomId)?.number ||
      "-"
    );
  }

  function bedNameById(
    propertyId: number,
    roomId: number,
    bedId: number
  ) {
    const property = properties.find(
      (item) => item.id === propertyId
    );

    const room = property?.rooms.find(
      (item) => item.id === roomId
    );

    return (
      room?.beds.find((bed) => bed.id === bedId)?.number || "-"
    );
  }
