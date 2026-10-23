import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { chooseCompany, maskValue, stripeKeyMode, toEnvKeys, validateIntegration } from '../../supabase/functions/_shared/integration-rules';

test('detects sandbox vs live from the Stripe key itself', () => {
  assert.equal(stripeKeyMode('sk_test_abc'), 'sandbox');
  assert.equal(stripeKeyMode('pk_live_abc'), 'live');
});

test('rejects mixing a sandbox key with a live key', () => {
  assert.match(validateIntegration('stripe', { publishable_key: 'pk_test_1', secret_key: 'sk_live_1' }) ?? '', /do not match/);
  assert.equal(validateIntegration('stripe', { publishable_key: 'pk_live_1', secret_key: 'sk_live_1' }), null);
});

test('requires every field and checks account formats', () => {
  assert.match(validateIntegration('ups', { client_id: 'a', client_secret: 'b', account_number: '' }) ?? '', /required/);
  assert.match(validateIntegration('ups', { client_id: 'a', client_secret: 'b', account_number: '12345' }) ?? '', /6/);
  assert.match(validateIntegration('fedex', { api_key: 'a', secret_key: 'b', account_number: '12ab' }) ?? '', /digits/);
});

test('only ever shows the last 4 characters', () => {
  assert.equal(maskValue('sk_live_SECRET1234'), '••••1234');
});

test('uses FedEx live names only for live keys', () => {
  assert.equal(toEnvKeys('fedex', { api_key: 'k', secret_key: 's', account_number: '1' }, 'sandbox').FEDEX_SANDBOX_API_KEY, 'k');
  assert.equal(toEnvKeys('fedex', { api_key: 'k', secret_key: 's', account_number: '1' }, 'live').FEDEX_API_KEY, 'k');
});

test('never guesses a company: staff use their own, otherwise exactly one configured company', () => {
  assert.equal(chooseCompany('A', ['B']), 'A');
  assert.equal(chooseCompany(null, ['B', 'B']), 'B');
  assert.equal(chooseCompany(null, ['A', 'B']), null);
  assert.equal(chooseCompany(null, []), null);
});
