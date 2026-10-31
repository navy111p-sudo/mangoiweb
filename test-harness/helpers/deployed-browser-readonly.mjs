// Preload only for DOM fixtures: real deployed assets, no production writes/room joins.
// E2E_PATCH_ASSETS=1 substitutes explicitly listed local fixes in these test clients only.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const overrides = new Map([
  ['/js/idx-main.js', new URL('../../cloudflare-deploy/public/js/idx-main.js', import.meta.url)],
  ['/micro-quiz.html', new URL('../../cloudflare-deploy/public/micro-quiz.html', import.meta.url)],
]);
const launch = puppeteer.launch.bind(puppeteer);
puppeteer.launch = async options => {
  const browser = await launch({...options, args: [...(options.args || []), '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--mute-audio']});
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...args) => {
    const page = await newPage(...args);
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', async req => {
      try {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
          await req.respond({status: 403, contentType: 'application/json', body: '{"ok":false,"error":"read_only_e2e"}'});
          return;
        }
        const url = new URL(req.url());
        if (process.env.E2E_PATCH_ASSETS === '1' && url.origin === new URL(process.env.BASE_URL).origin && overrides.has(url.pathname)) {
          await req.respond({status: 200, contentType: url.pathname.endsWith('.js') ? 'application/javascript' : 'text/html', body: readFileSync(overrides.get(url.pathname), 'utf8')});
          return;
        }
        await req.continue();
      } catch (error) { if (!page.isClosed()) console.error('[E2E_INTERCEPTION_ERROR]', error.message); }
    });
    await page.evaluateOnNewDocument(() => {
      class NoRoomSocket {
        static OPEN = 1; static CLOSED = 3;
        constructor() { this.readyState = 0; }
        send() {} close() { this.readyState = 3; }
        addEventListener() {} removeEventListener() {}
      }
      window.WebSocket = NoRoomSocket;
    });
    const goto = page.goto.bind(page);
    page.goto = (url, options) => {
      if (url.startsWith('file:')) url = process.env.BASE_URL.replace(/\/$/, '') + '/' + decodeURIComponent(url).split('/').pop();
      return goto(url, options);
    };
    page.on('pageerror', error => console.error('[E2E_RUNTIME_ERROR]', error.stack || error.message));
    return page;
  };
  process.on('exit', () => { try { browser.process()?.kill(); } catch {} });
  return browser;
};
