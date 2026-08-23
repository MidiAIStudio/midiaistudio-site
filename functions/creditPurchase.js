'use strict';

/**
 * Dynamic Credit pack checkout.
 * Catalog status is the source of truth. Client price/creditAmount are never trusted.
 */

const PAYMENT_ID_RE = /^[a-zA-Z0-9_-]{8,80}$/;

function creditSalesKillSwitchOn() {
  const v = String(process.env.CREDIT_SALES_KILL_SWITCH || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function httpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function createHandlers({
  db,
  admin,
  cors,
  requireUser,
  loadRegionCharge,
  fetchPortOnePayment,
  parsePortOneCustomData,
  normalizeCurrency,
  catalogEngine,
  userNotify
}) {
  const FieldValue = admin.firestore.FieldValue;

  function killPayload() {
    return {
      ok: false,
      code: 'CREDIT_SALES_KILLED',
      message: 'Credit 판매가 긴급 중단되었습니다.'
    };
  }

  async function grantCredits({ uid, paymentId, productId, creditAmount, amount, currency, quoteId, email, orderName }) {
    const purchaseRef = db.collection('creditPurchases').doc(paymentId);
    const walletRef = db.collection('creditWallets').doc(uid);
    const userRef = db.collection('users').doc(uid);
    const quoteRef = quoteId ? db.collection('purchaseQuotes').doc(quoteId) : null;
    const ledgerRef = db.collection('creditLedger').doc();

    return db.runTransaction(async (tx) => {
      const purchaseSnap = await tx.get(purchaseRef);
      if (purchaseSnap.exists) {
        const row = purchaseSnap.data() || {};
        if (row.uid && row.uid !== uid) {
          throw httpError(403, 'UID_MISMATCH', '이미 다른 계정에서 처리된 결제입니다.');
        }
        if (row.status === 'credited' || row.granted === true) {
          return {
            alreadyCompleted: true,
            balance: Number(row.balanceAfter != null ? row.balanceAfter : 0),
            creditAmount: Number(row.creditAmount || creditAmount)
          };
        }
      }
      if (quoteRef) {
        const quoteSnap = await tx.get(quoteRef);
        if (quoteSnap.exists) {
          const q = quoteSnap.data() || {};
          if (q.status === 'used' && String(q.paymentId || '') === String(paymentId)) {
            const walletSnap = await tx.get(walletRef);
            const wd = walletSnap.data() || {};
            const bal = Number(wd.balance != null ? wd.balance : wd.creditBalance || 0);
            return { alreadyCompleted: true, balance: bal, creditAmount };
          }
          if (q.status === 'used' && q.paymentId && String(q.paymentId) !== String(paymentId)) {
            throw httpError(409, 'QUOTE_USED', '이미 사용된 결제 견적입니다.');
          }
        }
      }
      const walletSnap = await tx.get(walletRef);
      const userSnap = await tx.get(userRef);
      const wd = walletSnap.exists ? (walletSnap.data() || {}) : {};
      const ud = userSnap.exists ? (userSnap.data() || {}) : {};
      const prev = Number(
        wd.balance != null ? wd.balance
          : (wd.creditBalance != null ? wd.creditBalance
            : (ud.creditBalance != null ? ud.creditBalance : 0))
      );
      const next = prev + creditAmount;
      tx.set(walletRef, {
        uid,
        balance: next,
        creditBalance: next,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      tx.set(userRef, {
        creditBalance: next,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      tx.set(ledgerRef, {
        uid,
        type: 'purchase',
        amount: creditAmount,
        creditAmount,
        productId,
        paymentId,
        quoteId: quoteId || '',
        displayTitle: `Credit 구매 +${creditAmount}`,
        createdAt: FieldValue.serverTimestamp()
      });
      tx.set(purchaseRef, {
        uid,
        paymentId,
        productId,
        quoteId: quoteId || '',
        creditAmount,
        amount,
        currency,
        email: email || '',
        orderName: orderName || '',
        status: 'credited',
        granted: true,
        balanceAfter: next,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      if (quoteRef) {
        tx.set(quoteRef, {
          status: 'used',
          paymentId,
          usedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }
      return { alreadyCompleted: false, balance: next, creditAmount };
    });
  }

  async function createCreditPurchaseQuote(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      if (creditSalesKillSwitchOn()) return res.status(403).json(killPayload());
      const user = await requireUser(req);
      const productKey = String((req.body || {}).productId || '');
      const pid = catalogEngine.normalizeProductId(productKey);
      if (!catalogEngine.isCreditProductId(pid)) {
        return res.status(400).json({
          ok: false,
          code: 'USE_LICENSE_QUOTE',
          message: 'Credit 상품만 createCreditPurchaseQuote로 견적할 수 있습니다.'
        });
      }
      const docId = catalogEngine.firestoreDocId(pid);
      const product = await loadRegionCharge('KR', docId);
      const creditAmount = Math.round(Number(product.creditAmount || 0));
      const amount = Math.round(Number(product.amount || product.effectivePriceKrw || 0));
      if (!(creditAmount > 0)) {
        return res.status(400).json({
          ok: false,
          code: 'CREDIT_AMOUNT_INVALID',
          message: 'Credit 지급량이 올바르지 않습니다.'
        });
      }
      if (!(amount > 0) || String(product.currency || 'KRW').toUpperCase() !== 'KRW') {
        return res.status(400).json({
          ok: false,
          code: 'PRICE_INVALID',
          message: 'Credit 상품 가격을 계산할 수 없습니다.'
        });
      }
      const now = new Date();
      const expires = catalogEngine.quoteExpiry(now);
      const quoteRef = db.collection('purchaseQuotes').doc();
      const quote = {
        quoteId: quoteRef.id,
        uid: user.uid,
        productId: pid,
        type: 'credit_pack',
        productType: 'credit_pack',
        plan: 'credits',
        productVersion: Number(product.pricingVersion || 1),
        pricingVersion: Number(product.pricingVersion || 1),
        basePrice: Number(product.listPrice || product.listPriceKrw || amount),
        discountType: product.discountPercent ? 'percent' : '',
        discountValue: product.discountPercent || 0,
        finalPrice: amount,
        amount,
        currency: 'KRW',
        listPriceKrw: Number(product.listPriceKrw || product.listPrice || 0),
        effectivePriceKrw: Number(product.effectivePriceKrw || amount),
        creditAmount,
        promotionId: product.promotionId || '',
        orderName: product.orderName || product.productName || pid,
        status: 'open',
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: expires
      };
      await quoteRef.set(quote);
      return res.json({
        ok: true,
        ...quote,
        quoteId: quoteRef.id,
        expiresAt: expires.toISOString()
      });
    } catch (err) {
      return res.status(err.status || 400).json({
        ok: false,
        code: err.code || 'QUOTE_FAILED',
        message: err.message || 'Quote failed.'
      });
    }
  }

  async function creditPortOnePurchase(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      const user = await requireUser(req);
      const body = req.body || {};
      const paymentId = String(body.paymentId || '').trim();
      const quoteId = String(body.quoteId || '').trim();
      if (!PAYMENT_ID_RE.test(paymentId)) {
        return res.status(400).json({ ok: false, code: 'PAYMENT_ID_INVALID', message: 'paymentId 형식이 올바르지 않습니다.' });
      }
      if (!quoteId) {
        return res.status(400).json({
          ok: false,
          code: 'QUOTE_REQUIRED',
          message: '결제 견적이 필요합니다. 구매를 다시 시작해 주세요.'
        });
      }
      const quoteSnap = await db.collection('purchaseQuotes').doc(quoteId).get();
      if (!quoteSnap.exists) {
        return res.status(400).json({ ok: false, code: 'QUOTE_MISSING', message: '결제 견적을 찾을 수 없습니다.' });
      }
      const quote = { quoteId: quoteSnap.id, ...quoteSnap.data() };
      const requestedPid = catalogEngine.normalizeProductId(body.productId || quote.productId || '');
      const quoteCheck = catalogEngine.quoteIsValid(quote, { uid: user.uid, productId: quote.productId });
      const alreadyUsedSamePay = String(quote.status) === 'used' && String(quote.paymentId || '') === paymentId;
      if (!quoteCheck.ok && !alreadyUsedSamePay) {
        return res.status(400).json({
          ok: false,
          code: quoteCheck.code || 'QUOTE_INVALID',
          message: '결제 견적이 만료되었거나 유효하지 않습니다.'
        });
      }
      if (String(quote.uid || '') !== String(user.uid)) {
        return res.status(403).json({ ok: false, code: 'QUOTE_UID_MISMATCH', message: '결제 견적 사용자가 일치하지 않습니다.' });
      }
      const pid = catalogEngine.normalizeProductId(quote.productId || requestedPid);
      if (!catalogEngine.isCreditProductId(pid)) {
        return res.status(400).json({ ok: false, code: 'NOT_CREDIT_PRODUCT', message: 'Credit 상품이 아닙니다.' });
      }
      if (requestedPid && requestedPid !== pid) {
        return res.status(400).json({ ok: false, code: 'PRODUCT_MISMATCH', message: '상품 정보가 일치하지 않습니다.' });
      }
      const creditAmount = Math.round(Number(quote.creditAmount || 0));
      const expectedAmount = Math.round(Number(quote.finalPrice != null ? quote.finalPrice : quote.amount));
      if (!(creditAmount > 0) || !(expectedAmount > 0)) {
        return res.status(400).json({ ok: false, code: 'QUOTE_AMOUNT', message: '견적 금액이 올바르지 않습니다.' });
      }

      const payment = await fetchPortOnePayment(paymentId);
      const status = String(payment.status || '');
      if (status !== 'PAID') {
        return res.status(400).json({
          ok: false,
          code: 'PAYMENT_NOT_PAID',
          message: (status === 'CANCELLED' || status === 'PARTIAL_CANCELLED')
            ? '결제가 취소되었습니다.'
            : '결제 확인 중 오류가 발생했습니다.',
          paymentId
        });
      }
      const paidAmount = Math.round(Number(payment.amount && payment.amount.total));
      const paidCurrency = normalizeCurrency(payment.currency || 'KRW');
      if (!Number.isFinite(paidAmount) || paidAmount !== expectedAmount) {
        return res.status(400).json({
          ok: false,
          code: 'AMOUNT_MISMATCH',
          message: '결제 확인 중 오류가 발생했습니다.',
          paymentId
        });
      }
      if (paidCurrency !== 'KRW') {
        return res.status(400).json({
          ok: false,
          code: 'CURRENCY_MISMATCH',
          message: '결제 확인 중 오류가 발생했습니다.',
          paymentId
        });
      }
      const custom = parsePortOneCustomData(payment.customData);
      if (custom.uid && String(custom.uid) !== String(user.uid)) {
        return res.status(403).json({
          ok: false,
          code: 'UID_MISMATCH',
          message: '결제 계정과 로그인 계정이 일치하지 않습니다.',
          paymentId
        });
      }
      if (custom.productId) {
        const customPid = catalogEngine.normalizeProductId(custom.productId);
        if (customPid && customPid !== pid) {
          return res.status(400).json({
            ok: false,
            code: 'PRODUCT_MISMATCH',
            message: '상품 정보가 일치하지 않습니다.',
            paymentId
          });
        }
      }

      const granted = await grantCredits({
        uid: user.uid,
        paymentId,
        productId: pid,
        creditAmount,
        amount: expectedAmount,
        currency: 'KRW',
        quoteId,
        email: user.email || '',
        orderName: quote.orderName || pid
      });

      if (!granted.alreadyCompleted) {
        try {
          if (typeof userNotify.notifyCreditGranted === 'function') {
            await userNotify.notifyCreditGranted(db, FieldValue, {
              uid: user.uid,
              paymentId,
              productId: pid,
              creditAmount,
              amount: expectedAmount,
              currency: 'KRW'
            });
          } else {
            await userNotify.notifyPaymentComplete(db, FieldValue, {
              uid: user.uid,
              paymentId,
              productId: pid,
              productName: `${creditAmount} Credits`,
              amount: expectedAmount,
              currency: 'KRW',
              plan: 'credits'
            });
          }
        } catch (notifyErr) {
          console.warn('credit grant notify', notifyErr && notifyErr.message);
        }
      }

      return res.json({
        ok: true,
        alreadyCompleted: !!granted.alreadyCompleted,
        paymentId,
        productId: pid,
        credits: creditAmount,
        creditedPoints: creditAmount,
        points: creditAmount,
        creditAmount,
        balance: granted.balance,
        amount: expectedAmount,
        currency: 'KRW',
        email: user.email || ''
      });
    } catch (err) {
      console.error('creditPortOnePurchase', err);
      return res.status(err.status || 500).json({
        ok: false,
        code: err.code || 'CREDIT_PURCHASE_FAILED',
        message: err.message || 'Credit 지급에 실패했습니다.'
      });
    }
  }

  async function getCreditBalance(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      const user = await requireUser(req);
      const snap = await db.collection('creditWallets').doc(user.uid).get();
      const data = snap.exists ? (snap.data() || {}) : {};
      const n = Number(data.creditBalance != null ? data.creditBalance : data.balance);
      const balance = Number.isFinite(n) ? n : 0;
      return res.json({ ok: true, uid: user.uid, balance, creditBalance: balance });
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        message: err.message || '잔액 조회에 실패했습니다.'
      });
    }
  }

  async function listCreditLedger(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      const user = await requireUser(req);
      const limit = Math.max(1, Math.min(Number((req.body || {}).limit) || 5, 50));
      let snap;
      try {
        snap = await db.collection('creditLedger')
          .where('uid', '==', user.uid)
          .orderBy('createdAt', 'desc')
          .limit(limit)
          .get();
      } catch (_) {
        snap = await db.collection('creditLedger').where('uid', '==', user.uid).limit(limit).get();
      }
      const items = snap.docs.map((d) => {
        const row = d.data() || {};
        return {
          id: d.id,
          type: row.type || 'purchase',
          amount: Number(row.amount || row.creditAmount || 0),
          displayTitle: row.displayTitle || '',
          productId: row.productId || '',
          paymentId: row.paymentId || '',
          createdAt: row.createdAt || null
        };
      });
      return res.json({ ok: true, uid: user.uid, items, nextPageToken: '' });
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        message: err.message || '사용내역 조회에 실패했습니다.'
      });
    }
  }

  return {
    createCreditPurchaseQuote,
    creditPortOnePurchase,
    getCreditBalance,
    listCreditLedger
  };
}

module.exports = {
  createHandlers,
  creditSalesKillSwitchOn,
  isCreditSalesKillSwitchOn: creditSalesKillSwitchOn
};
