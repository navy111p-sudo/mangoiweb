// Test-only preload. Prevents real HTTP, TCP, TLS, UDP, DNS and WebSocket traffic.
// Harnesses may replace fetch with in-process fixture responses. This never grants
// access to a provider, live account, remote database, browser or media device.
'use strict';
const fs = require('node:fs');
if (!process.env.MANGOI_OFFLINE_GUARD_ACTIVE) process.env.MANGOI_OFFLINE_GUARD_ACTIVE = '1';
function blocked(kind) {
  const message = 'OFFLINE_NETWORK_BLOCKED:' + kind;
  if (process.env.MANGOI_OFFLINE_NETWORK_LOG) fs.appendFileSync(process.env.MANGOI_OFFLINE_NETWORK_LOG, JSON.stringify({ message, entrypoint: process.argv[1] || '', frames: new Error().stack.split('\n').slice(2,5).map(x=>x.slice(0,240)) }) + '\n');
  throw new Error(message);
}
globalThis.fetch = async () => blocked('fetch');
globalThis.WebSocket = class { constructor() { blocked('websocket'); } };
for (const protocol of ['node:http', 'node:https']) {
  const mod = require(protocol);
  mod.request = () => blocked(protocol + '.request');
  mod.get = () => blocked(protocol + '.get');
}
require('node:net').Socket.prototype.connect = function () { return blocked('net.connect'); };
require('node:tls').connect = () => blocked('tls.connect');
require('node:dgram').createSocket = () => blocked('dgram.createSocket');
const dns = require('node:dns');
for (const key of ['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse']) {
  dns[key] = () => blocked('dns.' + key);
  if (dns.promises[key]) dns.promises[key] = async () => blocked('dns.promises.' + key);
}
require('node:module').syncBuiltinESMExports();
