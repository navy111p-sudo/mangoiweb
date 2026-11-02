'use strict';
// Test-only guard for ordinary Node global fetch and net.Socket TCP connects.
// This is not an OS network sandbox: native programs, UDP, captured originals,
// workers without this preload, or deliberately replaced hooks are outside scope.
const net = require('node:net');
const originalConnect = net.Socket.prototype.connect;
function connectionHost(args) {
  let first = args[0], rest = args;
  // net.createConnection forwards net._normalizeArgs as one [options, callback] argument.
  // Reject unknown nesting rather than falling through to a default local host.
  for (let depth = 0; Array.isArray(first); depth++) {
    if (depth >= 4) throw new Error('OFFLINE_TEST: unsupported connect arguments');
    rest = first; first = rest[0];
  }
  if (first && typeof first === 'object') {
    if (typeof first.lookup === 'function') throw new Error('OFFLINE_TEST: custom DNS lookup blocked');
    if (first.host !== undefined && typeof first.host !== 'string') throw new Error('OFFLINE_TEST: invalid host blocked');
    if (first.hostname !== undefined && first.hostname !== first.host) throw new Error('OFFLINE_TEST: ambiguous host blocked');
    return first.host === undefined ? 'localhost' : first.host;
  }
  if (typeof first === 'number' || (typeof first === 'string' && /^\d+$/.test(first))) {
    return typeof rest[1] === 'string' ? rest[1] : 'localhost';
  }
  // A nonnumeric string is Node's local Unix/named-pipe path overload.
  if (typeof first === 'string' && first.length) return 'unix-pipe';
  throw new Error('OFFLINE_TEST: unsupported connect arguments');
}
net.Socket.prototype.connect = function (...args) {
  const host = connectionHost(args);
  if (!['localhost', '127.0.0.1', '::1', 'unix-pipe'].includes(host)) {
    throw new Error('OFFLINE_TEST: external TCP connection blocked');
  }
  return originalConnect.apply(this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    return Promise.reject(new Error('OFFLINE_TEST: external fetch blocked'));
  }
  return originalFetch(input, init);
};
