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

function cors(req, res, methods = 'POST, OPTIONS') {
  const allowedOrigins = [
    cfg('APP_ORIGIN', 'https://midiaistudio.web.app'),
    'https://midiaistudio.web.app',
    'https://midiaistudio.firebaseapp.com',
    'https://midiaistudio.com',
    'https://www.midiaistudio.com',
    'https://midiaistudio.github.io'
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
  res.set('Access-Control-Allow-Methods', methods);
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
    amount: cfg('PAYPAL_PRICE_VALUE', '65.00'),
    currency: cfg('PAYPAL_CURRENCY', 'USD')
  };
}

/** KakaoPay / PortOne KR product — server is source of truth (never trust client amounts). */
function serverKrProduct() {
  return {
    plan: cfg('PORTONE_PLAN', cfg('PAYPAL_PLAN', 'lifetime')),
    amount: Number(cfg('PORTONE_KR_AMOUNT', '90000')),
    currency: String(cfg('PORTONE_KR_CURRENCY', 'KRW')).toUpperCase().replace(/^CURRENCY_/, ''),
    productId: cfg('PORTONE_PRODUCT_ID', 'midiai-lifetime'),
    orderName: cfg('PORTONE_ORDER_NAME', 'MidiAI Studio Lifetime License'),
    /** Accept legacy Korean orderName used by older client builds */
    allowedOrderNames: [
      cfg('PORTONE_ORDER_NAME', 'MidiAI Studio Lifetime License'),
      'MidiAI Studio Lifetime 디지털 라이선스'
    ]
  };
}

function normalizeCurrency(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/^CURRENCY_/, '')
    .trim();
}

function parsePortOneCustomData(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

/**
 * Shared lifetime license write — same fields PayPal uses so the desktop app
 * keeps reading licenses/{uid}.licensed + status === 'active'.
 */
function lifetimeLicensePayload({ user, plan, method, memo, extra = {} }) {
  return {
    email: user.email || '',
    displayName: user.name || user.displayName || '',
    licensed: true,
    plan: plan || 'lifetime',
    status: 'active',
    method,
    memo: memo || '',
    ...extra,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

async function fetchPortOnePayment(paymentId) {
  const secret = cfg('PORTONE_API_SECRET');
  if (!secret) {
    throw Object.assign(new Error('PORTONE_API_SECRET 환경변수가 없습니다.'), { status: 500 });
  }
  const storeId = cfg('PORTONE_STORE_ID', '');
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  const res = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}${qs}`, {
    method: 'GET',
    headers: {
      Authorization: `PortOne ${secret}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.type || `PortOne 결제 조회 실패 (${res.status})`;
    throw Object.assign(new Error(msg), { status: res.status === 404 ? 404 : 400, detail: data });
  }
  return data;
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
    batch.set(
      db.collection('licenses').doc(user.uid),
      lifetimeLicensePayload({
        user: { email: user.email || existing.email || '', name: user.name || '' },
        plan: product.plan,
        method: 'paypal',
        memo: `PayPal 자동 지급 · order ${orderId}`,
        extra: {
          paypalOrderId: orderId,
          paypalCaptureId: capture.id || ''
        }
      }),
      { merge: true }
    );
    await batch.commit();

    return res.json({ ok: true, orderId, captureId: capture.id || '', licenseGranted: true });
  } catch (err) {
    console.error('capturePayPalOrder', err);
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'capturePayPalOrder failed' });
  }
});

/**
 * Verify PortOne (KakaoPay test/live) payment server-side and issue licenses/{uid}
 * using the same schema as PayPal. Client must never write licenses.
 *
 * Body: { paymentId, productId? }
 * Auth: Bearer Firebase ID token
 */
exports.verifyPortOnePaymentAndIssueLicense = functions.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
  try {
    const user = await requireUser(req);
    if (!user.uid) {
      return res.status(401).json({ ok: false, message: '로그인이 만료되었습니다. 다시 로그인해 주세요.' });
    }

    const { paymentId, productId } = req.body || {};
    if (!paymentId || typeof paymentId !== 'string') {
      return res.status(400).json({ ok: false, message: 'paymentId가 없습니다.' });
    }
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(paymentId)) {
      return res.status(400).json({ ok: false, message: 'paymentId 형식이 올바르지 않습니다.' });
    }

    const product = serverKrProduct();
    if (productId && productId !== product.productId) {
      return res.status(400).json({ ok: false, message: '상품 정보가 일치하지 않습니다.' });
    }

    const environment = cfg('PORTONE_ENVIRONMENT', 'test');
    const orderRef = db.collection('orders').doc(paymentId);

    // Idempotent fast-path before calling PortOne
    const existingSnap = await orderRef.get();
    if (existingSnap.exists) {
      const existing = existingSnap.data() || {};
      if (existing.uid && existing.uid !== user.uid) {
        return res.status(403).json({
          ok: false,
          message: '이미 다른 계정에서 처리된 결제입니다.',
          paymentId
        });
      }
      if (
        existing.status === 'completed' &&
        existing.verificationStatus === 'verified' &&
        existing.licenseIssued === true
      ) {
        return res.json({
          ok: true,
          alreadyCompleted: true,
          paymentId,
          licenseGranted: true,
          email: user.email || existing.email || '',
          amount: existing.amount || product.amount,
          currency: existing.currency || product.currency,
          paymentMethod: existing.paymentMethod || 'kakaopay',
          environment: existing.environment || environment
        });
      }
    }

    const payment = await fetchPortOnePayment(paymentId);
    const status = String(payment.status || '');
    if (status !== 'PAID') {
      return res.status(400).json({
        ok: false,
        message: status === 'CANCELLED' || status === 'PARTIAL_CANCELLED'
          ? '결제가 취소되었습니다.'
          : '결제 확인 중 오류가 발생했습니다.',
        paymentId,
        code: 'PAYMENT_NOT_PAID'
      });
    }

    const paidAmount = Number(payment.amount?.total);
    const paidCurrency = normalizeCurrency(payment.currency);
    if (!Number.isFinite(paidAmount) || paidAmount !== Number(product.amount)) {
      console.warn('PortOne amount mismatch', {
        paymentId,
        paidAmount,
        expected: product.amount,
        uid: String(user.uid).slice(0, 6)
      });
      return res.status(400).json({
        ok: false,
        message: '결제 확인 중 오류가 발생했습니다.',
        paymentId,
        code: 'AMOUNT_MISMATCH'
      });
    }
    if (paidCurrency !== product.currency) {
      return res.status(400).json({
        ok: false,
        message: '결제 확인 중 오류가 발생했습니다.',
        paymentId,
        code: 'CURRENCY_MISMATCH'
      });
    }

    const orderName = String(payment.orderName || '');
    if (!product.allowedOrderNames.includes(orderName)) {
      console.warn('PortOne orderName mismatch', { paymentId, orderName });
      return res.status(400).json({
        ok: false,
        message: '결제 확인 중 오류가 발생했습니다.',
        paymentId,
        code: 'ORDER_NAME_MISMATCH'
      });
    }

    const custom = parsePortOneCustomData(payment.customData);
    if (custom.productId && custom.productId !== product.productId) {
      return res.status(400).json({
        ok: false,
        message: '결제 확인 중 오류가 발생했습니다.',
        paymentId,
        code: 'PRODUCT_MISMATCH'
      });
    }
    // Client may include uid in customData; never trust it for issuance.
    if (custom.uid && custom.uid !== user.uid) {
      console.warn('PortOne customData uid differs from auth uid', {
        paymentId,
        authUid: String(user.uid).slice(0, 6)
      });
    }

    const configuredStoreId = cfg('PORTONE_STORE_ID', '');
    if (configuredStoreId && payment.storeId && payment.storeId !== configuredStoreId) {
      return res.status(400).json({
        ok: false,
        message: '결제 확인 중 오류가 발생했습니다.',
        paymentId,
        code: 'STORE_MISMATCH'
      });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    let issued = false;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (snap.exists) {
        const existing = snap.data() || {};
        if (existing.uid && existing.uid !== user.uid) {
          throw Object.assign(new Error('이미 다른 계정에서 처리된 결제입니다.'), { status: 403 });
        }
        if (
          existing.status === 'completed' &&
          existing.verificationStatus === 'verified' &&
          existing.licenseIssued === true
        ) {
          issued = false;
          return;
        }
      }

      tx.set(orderRef, {
        paymentId,
        uid: user.uid,
        email: user.email || '',
        provider: 'portone',
        paymentMethod: 'kakaopay',
        environment,
        productId: product.productId,
        orderName,
        amount: product.amount,
        currency: product.currency,
        plan: product.plan,
        status: 'completed',
        verificationStatus: 'verified',
        licenseIssued: true,
        portoneTransactionId: payment.transactionId || '',
        rawStatus: status,
        createdAt: snap.exists ? (snap.data().createdAt || now) : now,
        verifiedAt: now,
        issuedAt: now,
        completedAt: now,
        updatedAt: now
      }, { merge: true });

      tx.set(
        db.collection('licenses').doc(user.uid),
        lifetimeLicensePayload({
          user,
          plan: product.plan,
          method: 'kakaopay',
          memo: `KakaoPay 자동 지급 · payment ${paymentId}`,
          extra: {
            portonePaymentId: paymentId,
            portoneTransactionId: payment.transactionId || ''
          }
        }),
        { merge: true }
      );
      issued = true;
    });

    console.log('TEST PAYMENT verified', {
      paymentId,
      uid: String(user.uid).slice(0, 6),
      environment,
      issued
    });

    return res.json({
      ok: true,
      paymentId,
      alreadyCompleted: !issued,
      licenseGranted: true,
      email: user.email || '',
      amount: product.amount,
      currency: product.currency,
      paymentMethod: 'kakaopay',
      environment,
      plan: product.plan
    });
  } catch (err) {
    console.error('verifyPortOnePaymentAndIssueLicense', err);
    const status = err.status || 500;
    const userMessage =
      status === 401
        ? '로그인이 만료되었습니다. 다시 로그인해 주세요.'
        : status === 403
          ? err.message
          : status === 404
            ? '결제 확인 중 오류가 발생했습니다.'
            : '결제는 완료되었으나 라이선스 확인이 필요합니다.';
    return res.status(status).json({
      ok: false,
      message: userMessage,
      paymentId: (req.body && req.body.paymentId) || undefined
    });
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

// Board MIDI/file proxy — browser CORS 우회용 (미리듣기)
exports.boardFileProxy = functions.https.onRequest(async (req, res) => {
  // Public board attachments: allow any browser origin
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  try {
    const path = String(req.query.path || '').trim();
    if (!path || !path.startsWith('board/') || path.includes('..') || path.includes('\\')) {
      res.status(400).send('Invalid path');
      return;
    }
    const bucketName = cfg('STORAGE_BUCKET', '') || admin.app().options.storageBucket || '';
    const bucket = bucketName ? admin.storage().bucket(bucketName) : admin.storage().bucket();
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).send('File not found');
      return;
    }
    const [buf] = await file.download();
    let contentType = 'application/octet-stream';
    try {
      const [meta] = await file.getMetadata();
      contentType = meta.contentType || contentType;
    } catch (_) {}
    if (/\.(mid|midi)$/i.test(path)) contentType = 'audio/midi';
    if (/\.wav$/i.test(path)) contentType = 'audio/wav';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=3600');
    res.status(200).send(buf);
  } catch (err) {
    console.error('boardFileProxy', err);
    res.status(500).send(err.message || 'proxy error');
  }
});
