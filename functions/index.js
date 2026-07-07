const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

function cfg(name, fallback = '') {
  return process.env[name] || fallback;
}

function paypalBaseUrl() {
  return cfg('PAYPAL_ENV', 'live') === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

function cors(req, res) {
  const allowedOrigins = [
    cfg('APP_ORIGIN', 'https://midiaistudio.web.app'),
    'https://midiaistudio.web.app',
    'https://midiaistudio.firebaseapp.com',
    'https://midiaistudio.com',
    'https://www.midiaistudio.com'
  ];

  const origin = req.headers.origin || '';

  const allowOrigin =
    allowedOrigins.includes(origin) ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')
      ? origin
      : allowedOrigins[0];

  res.set('Access-Control-Allow-Origin', allowOrigin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }

  return false;
}

async function requireUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw Object.assign(new Error('Google 로그인이 필요합니다.'), { status: 401 });
  return admin.auth().verifyIdToken(token);
}

async function paypalAccessToken() {
  const clientId = cfg('PAYPAL_CLIENT_ID');
  const secret = cfg('PAYPAL_CLIENT_SECRET');
  if (!clientId || !secret) throw new Error('PayPal Client ID/Secret 환경변수가 없습니다.');
  const basic = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || 'PayPal access token failed');
  return data.access_token;
}

function serverProduct() {
  return {
    plan: cfg('PAYPAL_PLAN', 'lifetime'),
    amount: cfg('PAYPAL_PRICE_VALUE', '90000'),
    currency: cfg('PAYPAL_CURRENCY', 'KRW')
  };
}

exports.createPayPalOrder = functions.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
  try {
    const user = await requireUser(req);
    const product = serverProduct();
    const accessToken = await paypalAccessToken();
    const orderRef = db.collection('orders').doc();
    const payload = {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: orderRef.id,
        custom_id: user.uid,
        description: `MidiAI Studio ${product.plan} license`,
        amount: {
          currency_code: product.currency,
          value: product.amount
        }
      }],
      application_context: {
        brand_name: 'MidiAI Studio',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW'
      }
    };
    const pp = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': orderRef.id
      },
      body: JSON.stringify(payload)
    });
    const data = await pp.json().catch(() => ({}));
    if (!pp.ok) return res.status(400).json({ ok: false, message: data.message || data.name || 'PayPal 주문 생성 실패', detail: data });

    await orderRef.set({
      uid: user.uid,
      email: user.email || '',
      paypalOrderId: data.id,
      amount: Number(product.amount),
      currency: product.currency,
      plan: product.plan,
      provider: 'paypal',
      status: 'created',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ ok: true, id: data.id, orderDocId: orderRef.id });
  } catch (err) {
    console.error('createPayPalOrder', err);
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'createPayPalOrder failed' });
  }
});

exports.capturePayPalOrder = functions.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
  try {
    const user = await requireUser(req);
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ ok: false, message: 'orderId가 없습니다.' });
    const product = serverProduct();
    const accessToken = await paypalAccessToken();

    const orderQuery = await db.collection('orders')
      .where('paypalOrderId', '==', orderId)
      .where('uid', '==', user.uid)
      .limit(1)
      .get();
    if (orderQuery.empty) return res.status(404).json({ ok: false, message: '주문 정보를 찾을 수 없습니다.' });
    const orderDoc = orderQuery.docs[0];
    const existing = orderDoc.data();
    if (existing.status === 'completed') {
      return res.json({ ok: true, alreadyCompleted: true });
    }

    const pp = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `capture-${orderId}`
      }
    });
    const data = await pp.json().catch(() => ({}));
    if (!pp.ok) return res.status(400).json({ ok: false, message: data.message || data.name || 'PayPal 캡처 실패', detail: data });
    if (data.status !== 'COMPLETED') return res.status(400).json({ ok: false, message: `결제가 완료 상태가 아닙니다: ${data.status}`, detail: data });

    const capture = data.purchase_units?.[0]?.payments?.captures?.[0] || {};
    const paidValue = capture.amount?.value || data.purchase_units?.[0]?.amount?.value;
    const paidCurrency = capture.amount?.currency_code || data.purchase_units?.[0]?.amount?.currency_code;
    if (String(paidCurrency) !== String(product.currency) || Number(paidValue) < Number(product.amount)) {
      return res.status(400).json({ ok: false, message: '결제 금액 또는 통화가 일치하지 않습니다.', detail: { paidValue, paidCurrency, expected: product } });
    }

    const batch = db.batch();
    batch.set(orderDoc.ref, {
      status: 'completed',
      paypalCaptureId: capture.id || '',
      payerEmail: data.payer?.email_address || '',
      payerName: [data.payer?.name?.surname, data.payer?.name?.given_name].filter(Boolean).join(' '),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      rawStatus: data.status
    }, { merge: true });
    batch.set(db.collection('licenses').doc(user.uid), {
      email: user.email || existing.email || '',
      displayName: user.name || '',
      licensed: true,
      plan: product.plan,
      status: 'active',
      method: 'paypal',
      memo: `PayPal 자동 지급 · order ${orderId}`,
      paypalOrderId: orderId,
      paypalCaptureId: capture.id || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await batch.commit();

    return res.json({ ok: true, orderId, captureId: capture.id || '', licenseGranted: true });
  } catch (err) {
    console.error('capturePayPalOrder', err);
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'capturePayPalOrder failed' });
  }
});

async function verifyPayPalWebhook(req) {
  const webhookId = cfg('PAYPAL_WEBHOOK_ID');
  if (!webhookId) return { ok: false, skipped: true, reason: 'PAYPAL_WEBHOOK_ID not configured' };
  const accessToken = await paypalAccessToken();
  const payload = {
    auth_algo: req.headers['paypal-auth-algo'],
    cert_url: req.headers['paypal-cert-url'],
    transmission_id: req.headers['paypal-transmission-id'],
    transmission_sig: req.headers['paypal-transmission-sig'],
    transmission_time: req.headers['paypal-transmission-time'],
    webhook_id: webhookId,
    webhook_event: req.body
  };
  const pp = await fetch(`${paypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await pp.json().catch(() => ({}));
  return { ok: data.verification_status === 'SUCCESS', detail: data };
}

exports.paypalWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('POST only');
  try {
    const verification = await verifyPayPalWebhook(req);
    if (!verification.ok) {
      console.warn('PayPal webhook verification failed/skipped', verification);
      if (!verification.skipped) return res.status(400).send('invalid webhook signature');
    }
    const event = req.body || {};
    const type = event.event_type || '';
    const resource = event.resource || {};
    const captureId = resource.id || resource.supplementary_data?.related_ids?.capture_id || '';

    if (['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED'].includes(type)) {
      const q = await db.collection('orders').where('paypalCaptureId', '==', captureId).limit(1).get();
      if (!q.empty) {
        const order = q.docs[0];
        const uid = order.data().uid;
        await db.runTransaction(async tx => {
          tx.set(order.ref, { status: 'refunded', refundEventType: type, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          if (uid) tx.set(db.collection('licenses').doc(uid), { status: 'refunded', licensed: false, updatedAt: admin.firestore.FieldValue.serverTimestamp(), memo: `PayPal ${type}` }, { merge: true });
        });
      }
    }
    return res.status(200).send('ok');
  } catch (err) {
    console.error('paypalWebhook', err);
    return res.status(500).send(err.message || 'webhook error');
  }
});
