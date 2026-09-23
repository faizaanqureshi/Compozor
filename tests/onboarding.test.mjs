import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onboardingDestination, mailboxResult, withoutMailboxResult } from '../lib/onboarding.ts';

for (const provider of ['gmail', 'outlook']) {
  test(`${provider} callback errors survive the onboarding redirect`, () => {
    const query = `?${provider}=error&reason=Consent%20declined&keep=1`;
    const destination = onboardingDestination(false, '/clients', query);
    assert.equal(destination, `/onboarding${query}`);
    assert.deepEqual(mailboxResult(new URL(destination, 'https://compozor.com').search), { error: 'Consent declined' });
    assert.equal(withoutMailboxResult(query), '?keep=1');
  });
  test(`${provider} successful callback remains available to the correct page`, () => {
    const query = `?${provider}=connected&email=demo%40example.com`;
    assert.equal(onboardingDestination(false, '/clients', query), `/onboarding${query}`);
    assert.equal(onboardingDestination(true, '/clients', query), null);
    assert.equal(onboardingDestination(true, '/onboarding', query), `/clients${query}`);
    assert.deepEqual(mailboxResult(query), { success: 'Your mailbox is connected.' });
    assert.equal(withoutMailboxResult(query), '');
  });
}

test('persisted completion, not a tour flag, controls access after a reload', () => {
  assert.equal(onboardingDestination(true, '/clients', ''), null);
  assert.equal(onboardingDestination(false, '/clients', ''), '/onboarding');
  assert.equal(onboardingDestination(false, '/onboarding', ''), null);
  assert.equal(onboardingDestination(true, '/onboarding', ''), '/clients');
  assert.equal(mailboxResult('?filter=active'), null);
});
