import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
const hooks = registerHooks({ resolve(s, c, n) {
  return n(s === './public-routes' ? './public-routes.ts' : s, c);
}});
const { postAuthRedirect, signInRedirect } = await import('../lib/auth-redirects.ts');
hooks.deregister();

test('old recursively nested sign-in links recover to the dashboard', () => {
  let target = '/sign-in';
  for (let i = 0; i < 20; i++) {
    target = `/sign-in?redirect_url=${encodeURIComponent(target)}`;
    assert.equal(postAuthRedirect(target), '/clients');
  }
});

test('auth redirects preserve legitimate destinations and reject auth/external/malformed targets', () => {
  for (const target of [undefined, '', ['a', 'b'], '/', '/?campaign=test', '/sign-up/verify', '/%73ign-in', '/%2fsign-in', '//evil.test', '/\\evil.test', 'https://evil.test/clients', 'javascript:alert(1)', '/%']) {
    assert.equal(postAuthRedirect(target), '/clients', String(target));
  }
  assert.equal(postAuthRedirect('/clients/27?tab=files#recent'), '/clients/27?tab=files#recent');
  assert.equal(postAuthRedirect('https://compozor.com/settings'), '/settings');
  assert.equal(postAuthRedirect('http://localhost:3000/settings', 'http://localhost:3000'), '/settings');
  assert.equal(postAuthRedirect('https://preview.vercel.app/settings', 'https://preview.vercel.app'), '/settings');
});

test('401 redirect never wraps a public or authentication page', () => {
  for (const path of ['/sign-in', '/sign-in/factor-two', '/sign-up', '/waitlist', '/', '/privacy', '/upload/token']) {
    assert.equal(signInRedirect(path, '?redirect_url=%2Fsign-in'), null);
  }
  assert.equal(signInRedirect('/clients/27', '?tab=files'), '/sign-in?redirect_url=%2Fclients%2F27%3Ftab%3Dfiles');
});
