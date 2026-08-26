import assert from 'node:assert/strict';
import { extractCreditBalance, resolveCreditBalance } from '../../assets/js/credit-balance.js';

assert.equal(extractCreditBalance({ balance: 0, creditBalance: 1 }), 0);
assert.equal(extractCreditBalance({ creditBalance: 1 }), 1);
assert.equal(extractCreditBalance({ balance: 5, creditBalance: 1 }), 5);
assert.equal(extractCreditBalance({}), null);
assert.equal(extractCreditBalance(null, 0), 0);

assert.equal(resolveCreditBalance({ balance: 0 }, 1), 0);
assert.equal(resolveCreditBalance({ creditBalance: 0 }, 1), 0);
assert.equal(resolveCreditBalance({}, 1), 1);
assert.equal(resolveCreditBalance({ balance: null }, 1), 1);

// Classic falsy bug must not win:
const buggy = (data, cached) => Number(data.creditBalance || cached || 0);
assert.equal(buggy({ creditBalance: 0 }, 1), 1, 'documents the historical falsy bug');
assert.notEqual(extractCreditBalance({ balance: 0, creditBalance: 0 }), 1);

console.log('credit-balance.test.mjs OK');
