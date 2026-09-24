import express from 'express';
import crypto from 'crypto';
import { query } from './database.js';

const router = express.Router();
const SESSION_COOKIE = 'peacely_session';

const clean = (value) => String(value ?? '').trim();

const hash = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex');

const cookies = (req) => {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
};

async function ownerFromRequest(req) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) return null;

  const result = await query(
    'SELECT o.id,o.name,o.email FROM sessions s INNER JOIN owners o ON o.id=s.owner_id WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1',
    [hash(token)],
  );

  return result.rows[0] || null;
}

const normalize = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/[^\\p{L}\\p{N}]+/gu, ' ')
    .trim();

const numberFromText = (text) => {
  const match = String(text).match(
    /(?:₹|rs\.?|inr\s*)?\s*([0-9][0-9,]*(?:\.\d+)?)\s*(?:rupees?|rs\.?|inr)?/i,
  );
  if (!match) return null;
  const value = Number(String(match[1]).replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
};

function findByName(items, command, field = 'name') {
  const normalizedCommand = normalize(command);
  const sorted = [...(items || [])]
    .filter((item) => clean(item?.[field]))
    .sort((a, b) => clean(b[field]).length - clean(a[field]).length);

  return (
    sorted.find((item) => {
      const name = normalize(item[field]);
      return name && normalizedCommand.includes(name);
    }) || null
  );
}

function fallbackParse(command, context) {
  const text = normalize(command);
  const amount = numberFromText(command);
  const properties = context?.properties || [];
  const rooms = context?.rooms || [];
  const beds = context?.beds || [];
  const tenants = context?.tenants || [];
  const invoices = context?.invoices || [];
  const expenses = context?.expenses || [];

  const tenant = findByName(tenants, command);
  const property = findByName(properties, command);
  const room = rooms.find((item) =>
    text.includes(normalize(String(item.room_number))),
  );
  const bed = beds.find((item) =>
    text.includes(normalize(String(item.bed_number))),
  );

  if (/^(yes|yeah|yep|confirm|confirmed|do it|go ahead|okay|ok)\b/i.test(clean(command))) {
    return {
      action: 'confirm',
      reply: 'Ready to continue.',
      requires_confirmation: false,
      params: {},
    };
  }

  if (/(who|which|show|list).*(hasn't|has not|not).*(paid|pay)/i.test(command) || /outstanding|pending dues|unpaid/i.test(command) || /किसने.*(नहीं|नही).*(दिया|भुगतान|पैसे)|किसका.*(किराया|पैसा).*(बाकी|बकाया)|बकाया|बाकी.*किराया|भुगतान.*बाकी|पैसे.*नहीं.*दिए/i.test(command)) {
    return {
      action: 'show_outstanding',
      reply: 'I will show the tenants with outstanding rent.',
      requires_confirmation: false,
      params: {},
    };
  }

  if (/(how much|total|collection|collected).*(collect|received|paid)/i.test(command) || /(कितना|कितने).*(कलेक्शन|जमा|मिला|पैसे|भुगतान)|कलेक्शन.*(दिखाओ|बताओ)|इस महीने.*(कितना|कितने).*(जमा|मिला|कलेक्शन)/i.test(command)) {
    return {
      action: 'show_collections',
      reply: 'I will calculate the current collection.',
      requires_confirmation: false,
      params: {},
    };
  }

  if (/(show|list).*(expense|expenses)/i.test(command) || /(खर्च|व्यय).*(दिखाओ|बताओ|दिखा)|दिखाओ.*(खर्च|व्यय)/i.test(command)) {
    return {
      action: 'show_expenses',
      reply: 'I will show the expenses.',
      requires_confirmation: false,
      params: {},
    };
  }

  if ((/delete|remove|erase/i.test(command) || /हटाओ|मिटाओ|डिलीट/i.test(command)) && (/expense/i.test(command) || /खर्च|व्यय/i.test(command))) {
    const matching = expenses.find((item) =>
      amount !== null && Math.abs(Number(item.amount || 0) - amount) < 0.01
    );
    return {
      action: 'delete_expense',
      reply: matching
        ? `I found expense #${matching.id} for ₹${Number(matching.amount || 0).toLocaleString('en-IN')}.`
        : 'I need the exact expense to delete.',
      requires_confirmation: Boolean(matching),
      params: {
        expense_id: matching?.id ?? null,
      },
    };
  }

  if ((/add|record|create|log/i.test(command) || /जोड़ो|जोड़ना|डालो|दर्ज|लिखो/i.test(command)) && (/expense/i.test(command) || /खर्च|व्यय/i.test(command))) {
    const category =
      /electric/i.test(command) || /बिजली/i.test(command) ? 'Electricity' :
      /water/i.test(command) || /पानी/i.test(command) ? 'Water' :
      /maintenance|repair/i.test(command) || /मेंटेनेंस|मरम्मत/i.test(command) ? 'Maintenance' :
      /salary|staff/i.test(command) || /सैलरी|वेतन|स्टाफ/i.test(command) ? 'Staff' :
      /clean/i.test(command) || /सफाई/i.test(command) ? 'Cleaning' :
      'Other';

    return {
      action: 'add_expense',
      reply: amount
        ? `I will record a ₹${amount.toLocaleString('en-IN')} ${category.toLowerCase()} expense.`
        : 'I need the expense amount.',
      requires_confirmation: false,
      params: {
        amount,
        category,
        expense_date: null,
        note: clean(command),
        property_id: property?.id ?? null,
      },
    };
  }

  if ((/delete|remove|erase/i.test(command) || /हटाओ|मिटाओ|डिलीट/i.test(command)) && (/property/i.test(command) || /प्रॉपर्टी|संपत्ति/i.test(command))) {
    return {
      action: 'delete_property',
      reply: property
        ? `I found property “${property.name}”.`
        : 'I need the property name.',
      requires_confirmation: Boolean(property),
      params: {
        property_id: property?.id ?? null,
      },
    };
  }

  if ((/add|create|register/i.test(command) || /जोड़ो|बनाओ|जोड़ना|रजिस्टर/i.test(command)) && (/property/i.test(command) || /प्रॉपर्टी|संपत्ति/i.test(command))) {
    const match = command.match(/property(?: called| named)?\s+(.+?)(?:\s+(?:at|address|located)\s+(.+))?$/i);
    const name = clean(match?.[1] || command.replace(/.*property\s+/i, ''));
    const address = clean(match?.[2] || '');

    return {
      action: 'add_property',
      reply: name ? `I will add property “${name}”.` : 'I need the property name.',
      requires_confirmation: false,
      params: {
        name,
        address,
        property_type: /ladies|female|girls/i.test(command) ? 'Ladies' : 'Gents',
        rent_cycle: '1st of every month',
      },
    };
  }

  if ((/add|create/i.test(command) || /जोड़ो|बनाओ|जोड़ना/i.test(command)) && (/room/i.test(command) || /कमरा|रूम/i.test(command))) {
    const roomNumber = clean(
      command.match(/room\s*([a-z0-9-]+)/i)?.[1] || room?.room_number || '',
    );
    return {
      action: 'add_room',
      reply: roomNumber ? `I will add room ${roomNumber}.` : 'I need the room number.',
      requires_confirmation: false,
      params: {
        property_id: property?.id ?? room?.property_id ?? null,
        room_number: roomNumber,
        sharing_type:
          /single/i.test(command) ? 'Single' :
          /double|2 sharing|two sharing/i.test(command) ? 'Double' :
          /triple|3 sharing|three sharing/i.test(command) ? 'Triple' :
          /four|4 sharing/i.test(command) ? 'Four' :
          'Single',
        room_type: /ac/i.test(command) && !/non\s*ac/i.test(command) ? 'AC' : 'Non AC',
        floor_name: clean(command.match(/(?:floor|on)\s+([a-z0-9 -]+)/i)?.[1] || 'Ground Floor'),
        rent_amount: amount,
        per_day_rent: null,
      },
    };
  }

  if ((/add|create/i.test(command) || /जोड़ो|बनाओ|जोड़ना/i.test(command)) && (/bed/i.test(command) || /बेड/i.test(command))) {
    const bedNumber = clean(
      command.match(/bed\s*([a-z0-9-]+)/i)?.[1] || bed?.bed_number || '',
    );
    return {
      action: 'add_bed',
      reply: bedNumber ? `I will add bed ${bedNumber}.` : 'I need the bed number.',
      requires_confirmation: false,
      params: {
        room_id: room?.id ?? null,
        bed_number: bedNumber,
      },
    };
  }

  if ((/whatsapp|what'?s?app|wa/i.test(command) && /(remind|reminder|message|send)/i.test(command)) || /व्हाट्स?ऐप.*(रिमाइंड|याद|मैसेज|संदेश)|रिमाइंड.*व्हाट्स?ऐप/i.test(command) || /(remind|reminder).*tenant/i.test(command)) {
    const reminderTenant = tenant || (tenants.length === 1 ? tenants[0] : null);

    if (!reminderTenant) {
      return {
        action: 'send_reminder',
        reply: 'Which tenant should I send the WhatsApp rent reminder to? Please say the tenant name.',
        requires_confirmation: false,
        params: {
          tenant_id: null,
        },
      };
    }

    return {
      action: 'send_reminder',
      reply: `I will open WhatsApp with a rent reminder for ${reminderTenant.name}.`,
      requires_confirmation: false,
      params: {
        tenant_id: reminderTenant.id,
      },
    };
  }

  if ((/paid|payment|received/i.test(command) || /दिया|भुगतान|जमा|पेमेंट/i.test(command)) && tenant && amount !== null) {
    const invoice = invoices
      .filter((item) => Number(item.tenant_id) === Number(tenant.id))
      .sort((a, b) => Number(b.id) - Number(a.id))
      .find((item) => Number(item.amount || 0) > Number(item.paid_amount || 0));

    return {
      action: 'record_payment',
      reply: `I will record ₹${amount.toLocaleString('en-IN')} from ${tenant.name}.`,
      requires_confirmation: false,
      params: {
        tenant_id: tenant.id,
        invoice_id: invoice?.id ?? null,
        amount,
        payment_method: /cash/i.test(command) || /नकद|कैश/i.test(command) ? 'Cash' : /bank/i.test(command) || /बैंक/i.test(command) ? 'Bank Transfer' : 'UPI',
        payment_date: null,
        payment_month: null,
      },
    };
  }

  if ((/add|create|register/i.test(command) || /जोड़ो|बनाओ|जोड़ना|रजिस्टर/i.test(command)) && (/tenant/i.test(command) || /टेनेंट|किरायेदार/i.test(command))) {
    return {
      action: 'add_tenant',
      reply: tenant ? `I found ${tenant.name}.` : 'I need the tenant name, phone, property and rent.',
      requires_confirmation: false,
      params: {
        name: clean(command.match(/tenant\s+(?:called|named)?\s*([a-z][a-z .'-]+)/i)?.[1] || ''),
        phone: clean(command.match(/(?:phone|mobile|number)\s*(?:is)?\s*([0-9 +()-]{10,})/i)?.[1] || ''),
        property_id: property?.id ?? null,
        room_id: room?.id ?? null,
        bed_id: bed?.id ?? null,
        monthly_rent: amount,
        due_date: 5,
        deposit_amount: 0,
        move_in_date: null,
      },
    };
  }

  if (/dashboard|home/i.test(command) || /डैशबोर्ड|होम/i.test(command)) {
    return { action: 'open_tab', reply: 'Opening the dashboard.', requires_confirmation: false, params: { tab: 'dashboard' } };
  }
  if (/properties/i.test(command) || /प्रॉपर्टी|संपत्ति/i.test(command)) {
    return { action: 'open_tab', reply: 'Opening properties.', requires_confirmation: false, params: { tab: 'properties' } };
  }
  if (/tenants/i.test(command) || /टेनेंट|किरायेदार/i.test(command)) {
    return { action: 'open_tab', reply: 'Opening tenants.', requires_confirmation: false, params: { tab: 'tenants' } };
  }
  if (/payments/i.test(command) || /पेमेंट|भुगतान/i.test(command)) {
    return { action: 'open_tab', reply: 'Opening payments.', requires_confirmation: false, params: { tab: 'payments' } };
  }
  if (/invoices/i.test(command) || /इनवॉइस|बिल/i.test(command)) {
    return { action: 'open_tab', reply: 'Opening invoices.', requires_confirmation: false, params: { tab: 'invoices' } };
  }
  if (/analytics|analysis/i.test(command) || /एनालिटिक्स|विश्लेषण/i.test(command)) {
    return { action: 'open_tab', reply: 'Opening analytics.', requires_confirmation: false, params: { tab: 'analytics' } };
  }

  return {
    action: 'unknown',
    reply: 'I could not safely understand that command yet. Try saying what you want Peacely to do, for example “Rahul paid 8,000 cash” or “show me who has not paid”.',
    requires_confirmation: false,
    params: {},
  };
}

const ACTIONS = [
  'show_outstanding',
  'show_collections',
  'show_expenses',
  'add_property',
  'delete_property',
  'add_room',
  'add_bed',
  'add_tenant',
  'record_payment',
  'add_expense',
  'delete_expense',
  'send_reminder',
  'open_tab',
  'unknown',
];

const schema = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ACTIONS },
    reply: { type: 'string' },
    requires_confirmation: { type: 'boolean' },
    params: {
      type: 'object',
      properties: {
        name: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
        address: { type: ['string', 'null'] },
        property_type: { type: ['string', 'null'] },
        rent_cycle: { type: ['string', 'null'] },
        property_id: { type: ['integer', 'null'] },
        room_id: { type: ['integer', 'null'] },
        room_number: { type: ['string', 'null'] },
        sharing_type: { type: ['string', 'null'] },
        room_type: { type: ['string', 'null'] },
        floor_name: { type: ['string', 'null'] },
        rent_amount: { type: ['number', 'null'] },
        per_day_rent: { type: ['number', 'null'] },
        bed_id: { type: ['integer', 'null'] },
        bed_number: { type: ['string', 'null'] },
        tenant_id: { type: ['integer', 'null'] },
        monthly_rent: { type: ['number', 'null'] },
        due_date: { type: ['integer', 'null'] },
        deposit_amount: { type: ['number', 'null'] },
        move_in_date: { type: ['string', 'null'] },
        invoice_id: { type: ['integer', 'null'] },
        amount: { type: ['number', 'null'] },
        payment_method: { type: ['string', 'null'] },
        payment_date: { type: ['string', 'null'] },
        payment_month: { type: ['string', 'null'] },
        expense_id: { type: ['integer', 'null'] },
        category: { type: ['string', 'null'] },
        expense_date: { type: ['string', 'null'] },
        note: { type: ['string', 'null'] },
        tab: { type: ['string', 'null'] },
      },
      required: [
        'name','phone','address','property_type','rent_cycle','property_id',
        'room_id','room_number','sharing_type','room_type','floor_name',
        'rent_amount','per_day_rent','bed_id','bed_number','tenant_id',
        'monthly_rent','due_date','deposit_amount','move_in_date','invoice_id',
        'amount','payment_method','payment_date','payment_month','expense_id',
        'category','expense_date','note','tab',
      ],
      additionalProperties: false,
    },
  },
  required: ['action','reply','requires_confirmation','params'],
  additionalProperties: false,
};

async function askOpenAI(command, context) {
  const apiKey = clean(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;

  const model = clean(process.env.OPENAI_VOICE_MODEL) || 'gpt-5.6-luna';

  const system = `You are Peacely Voice Agent, an action planner for a PG/property management app.

The owner speaks naturally in English, Hindi, Kannada, Hinglish, or mixed speech. Understand the intent and map it to exactly one safe app action.

Important rules:
- Never invent IDs. Only use IDs from the supplied owner context.
- If the owner asks to create something, extract every value that was actually spoken and leave missing values null.
- For a payment, resolve the tenant and preferably an unpaid invoice from context.
- For an expense deletion or property deletion, set requires_confirmation=true.
- Do not delete tenants, payments, invoices, rooms or beds through voice.
- Do not claim an action was completed. Your output is only a plan that the Peacely UI will execute after validation.
- For read-only requests use show_outstanding, show_collections, show_expenses, or open_tab.
- Treat phrases like “send the tenant WhatsApp reminder”, “send a WhatsApp reminder”, “WhatsApp reminder for Rahul”, “remind Rahul on WhatsApp”, and Hindi/Hinglish equivalents as send_reminder requests.
- For WhatsApp reminders, use send_reminder when a specific tenant is identifiable; if the tenant is ambiguous, ask for the tenant name instead of guessing.
- Keep reply short and conversational.

Available actions: ${ACTIONS.join(', ')}.

Owner data:
${JSON.stringify(context || {}, null, 2)}`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: 'low' },
      input: [
        { role: 'system', content: system },
        { role: 'user', content: clean(command) },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'peacely_voice_action',
          strict: true,
          schema,
        },
      },
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Voice AI request failed.');
  }

  const outputText =
    clean(data?.output_text) ||
    data?.output
      ?.flatMap((item) => item?.content || [])
      ?.find((item) => item?.type === 'output_text')
      ?.text ||
    '';

  if (!outputText) throw new Error('Voice AI returned no action.');

  return JSON.parse(outputText);
}

router.post('/voice-agent/transcribe', async (req, res) => {
  try {
    const owner = await ownerFromRequest(req);

    if (!owner) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    if (String(owner.email || '').toLowerCase().endsWith('@guest.peacely.local')) {
      return res.status(403).json({
        success: false,
        error: 'Please log in or sign up before using the Peacely Voice Agent.',
      });
    }

    const apiKey = clean(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        error: 'AI voice is not configured. Add OPENAI_API_KEY in Railway variables.',
      });
    }

    const audioBase64 = clean(req.body?.audio);
    const mimeType = clean(req.body?.mime_type) || 'audio/webm';

    if (!audioBase64) {
      return res.status(400).json({ success: false, error: 'Audio is empty.' });
    }

    const audio = Buffer.from(audioBase64, 'base64');
    if (!audio.length) {
      return res.status(400).json({ success: false, error: 'Audio is empty.' });
    }

    if (audio.length > 25 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Audio recording is too large.' });
    }

    const extension =
      mimeType.includes('mp4') || mimeType.includes('m4a')
        ? 'm4a'
        : mimeType.includes('ogg')
          ? 'ogg'
          : mimeType.includes('mpeg') || mimeType.includes('mp3')
            ? 'mp3'
            : 'webm';

    const form = new FormData();
    form.append('file', new Blob([audio], { type: mimeType }), `peacely-voice.${extension}`);
    form.append('model', clean(process.env.OPENAI_TRANSCRIBE_MODEL) || 'gpt-transcribe');
    form.append(
      'prompt',
      'Peacely property management voice command. Preserve tenant names, property names, room numbers, bed numbers, Indian English, Hindi, Kannada, Hinglish, code-switching, slang, informal speech, and spoken numbers. Do not translate the command; transcribe what the owner said naturally.',
    );
    form.append('languages[]', 'en');
    form.append('languages[]', 'hi');
    form.append('languages[]', 'kn');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error?.message || 'Voice transcription failed.');
    }

    const text = clean(data?.text);
    if (!text) {
      return res.status(422).json({ success: false, error: 'I could not hear a clear command.' });
    }

    return res.json({
      success: true,
      text,
      languages: Array.isArray(data?.languages) ? data.languages : [],
    });
  } catch (error) {
    console.error('Peacely Voice Agent transcription failed:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unable to transcribe voice.',
    });
  }
});

router.post('/voice-agent/speak', async (req, res) => {
  try {
    const owner = await ownerFromRequest(req);

    if (!owner) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.',
      });
    }

    if (String(owner.email || '').toLowerCase().endsWith('@guest.peacely.local')) {
      return res.status(403).json({
        success: false,
        error: 'Please log in or sign up before using the Peacely Voice Agent.',
      });
    }

    const text = clean(req.body?.text);
    const language = clean(req.body?.language) || 'en-IN';

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Speech text is empty.',
      });
    }

    if (text.length > 4096) {
      return res.status(400).json({
        success: false,
        error: 'Speech text is too long.',
      });
    }

    const apiKey = clean(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        error: 'AI voice is not configured. Add OPENAI_API_KEY in Railway variables.',
      });
    }

    const languageName =
      language === 'hi-IN'
        ? 'Hindi'
        : language === 'kn-IN'
          ? 'Kannada'
          : 'Indian English';

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: clean(process.env.OPENAI_TTS_MODEL) || 'gpt-4o-mini-tts',
        voice: clean(process.env.OPENAI_TTS_VOICE) || 'marin',
        input: text,
        instructions: `Speak naturally as Peacely, a helpful property-management assistant. Respond in ${languageName}. Keep the delivery concise, clear and conversational. This is an AI-generated voice.`,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error?.message || 'AI voice generation failed.');
    }

    const audio = Buffer.from(await response.arrayBuffer());

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audio.length),
      'Cache-Control': 'no-store',
    });

    return res.send(audio);
  } catch (error) {
    console.error('Peacely Voice Agent speech failed:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unable to generate AI voice.',
    });
  }
});

router.post('/voice-agent/command', async (req, res) => {
  try {
    const owner = await ownerFromRequest(req);

    if (!owner) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.',
      });
    }

    if (String(owner.email || '').toLowerCase().endsWith('@guest.peacely.local')) {
      return res.status(403).json({
        success: false,
        error: 'Please log in or sign up before using the Peacely Voice Agent.',
      });
    }

    const command = clean(req.body?.command);
    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'Voice command is empty.',
      });
    }

    if (command.length > 1200) {
      return res.status(400).json({
        success: false,
        error: 'Voice command is too long.',
      });
    }

    let context = req.body?.context || {};
    if (JSON.stringify(context).length > 350000) {
      context = {};
    }

    let action;
    let aiEnabled = Boolean(clean(process.env.OPENAI_API_KEY));

    if (aiEnabled) {
      try {
        action = await askOpenAI(command, context);
      } catch (error) {
        console.error('Peacely Voice Agent AI failed:', error);
        action = fallbackParse(command, context);
        action.reply = 'I could not reach the AI service, so I used Peacely’s built-in command parser. ' + action.reply;
      }
    } else {
      action = fallbackParse(command, context);
    }

    return res.json({
      success: true,
      ai_enabled: aiEnabled,
      action,
    });
  } catch (error) {
    console.error('Peacely Voice Agent command failed:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unable to process voice command.',
    });
  }
});

export default router;
