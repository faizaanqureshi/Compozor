import assert from "node:assert/strict";
import test from "node:test";
import { finalizeUploadBatch, removeUploadItem, uploadClientFile, uploadFileToR2 } from "../lib/public-upload-api.ts";

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

test("submission sends the exact staged item ids and removal is scoped to the batch", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return new Response(null, { status: 204 });
  };
  try {
    await removeUploadItem("token", 7, 12);
    await finalizeUploadBatch("token", 7, [13, 15]);
    assert.equal(requests[0].init.method, "DELETE");
    assert.ok(requests[0].url.endsWith("/public/uploads/token/batches/7/items/12"));
    assert.equal(requests[1].init.method, "POST");
    assert.deepEqual(JSON.parse(requests[1].init.body), { item_ids: [13, 15] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("browser cancellation aborts an active direct upload", async () => {
  const originalXHR = globalThis.XMLHttpRequest;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("relay should not run after cancellation"); };
  let aborted = false;
  globalThis.XMLHttpRequest = class {
    upload = {};
    open() {}
    setRequestHeader() {}
    send() {}
    abort() { aborted = true; this.onabort(); }
  };
  try {
    const controller = new AbortController();
    const pending = uploadFileToR2("https://storage.example.test/upload", {},
      new File(["x"], "x.pdf"), () => {}, controller.signal);
    controller.abort();
    await assert.rejects(pending, /canceled/i);
    assert.equal(aborted, true);
  } finally {
    globalThis.XMLHttpRequest = originalXHR;
    globalThis.fetch = originalFetch;
  }
});
