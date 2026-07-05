// 참고용 예시입니다. 실제 배포 전 PayPal Webhook signature 검증을 반드시 붙이세요.
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.checkLicense = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  const auth = req.headers.authorization || '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!idToken) return res.status(401).json({ active: false });
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const snap = await admin.firestore().collection('licenses').doc(decoded.uid).get();
    const data = snap.exists ? snap.data() : null;
    return res.json({ active: !!(data && data.active), license: data || null });
  } catch (e) {
    return res.status(401).json({ active: false });
  }
});

exports.capturePayment = functions.https.onRequest(async (req, res) => {
  // 프론트에서 받은 결제 완료 알림만 믿고 라이선스를 발급하면 안 됩니다.
  // PayPal 서버 API 또는 Webhook으로 orderID/paymentID를 재검증한 뒤 licenses/{uid}에 active:true를 쓰세요.
  return res.status(501).json({ ok: false, message: 'Implement server-side PayPal verification first.' });
});
