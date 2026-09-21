import assert from "node:assert/strict";
import test from "node:test";
import { uploadClientFile } from "../lib/public-upload-api.ts";

test("direct storage failure falls back to authorized API and avoids repeated preflights", async () => {
  const originalXHR = globalThis.XMLHttpRequest;
  const originalFetch = globalThis.fetch;
  let directAttempts = 0;
  const requests = [];
  globalThis.XMLHttpRequest = class {
    upload = {};
    open() {}
    setRequestHeader() {}
    send() { directAttempts++; this.onerror(); }
  };
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return new Response(null, { status: 204 });
  };
  try {
    const file = new File(["pdf-content"], "sample.pdf", { type: "application/pdf" });
    const item = { item_id: 12, upload_url: "https://storage.example.test/upload", headers: {}, method: "PUT" };
    const progress = [];
    await uploadClientFile("client-token", 7, item, file, value => progress.push(value));
    await uploadClientFile("client-token", 7, { ...item, item_id: 13 }, file, () => {});
    assert.equal(directAttempts, 1);
    assert.equal(requests.length, 2);
    assert.ok(requests[0].url.endsWith("/public/uploads/client-token/batches/7/items/12/content"));
    assert.equal(requests[0].init.method, "PUT");
    assert.equal(requests[0].init.body, file);
    assert.deepEqual(progress, [1]);
  } finally {
    globalThis.XMLHttpRequest = originalXHR;
    globalThis.fetch = originalFetch;
  }
});

test("relay failures remain visible instead of marking the upload successful", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ detail: "File exceeds the maximum allowed size." }, { status: 413 });
  try {
    await assert.rejects(uploadClientFile("token", 7, { item_id: 14 }, new File(["x"], "x.pdf"), () => {}), /maximum allowed size/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
