import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdController, isAdContextAllowed, selectBottomSlot, validAdSlot} from '../src/ads.js';

// These unit identifiers exist only in an in-memory SDK double. No requests are sent.
const config = {
  enabled: true, allowedOrigins: ['https://softm.github.io'], pathPrefix: '/gagyebu/',
  storageKey: 'gagyebu.test.collapsed',
  bottom: {
    mobile: {unitId: 'DAN-TESTMOBILE', width: 320, height: 50},
    desktop: {unitId: 'DAN-TESTDESKTOP', width: 728, height: 90},
  },
  analytics: {unitId: 'DAN-TESTANALYTICS', width: 320, height: 100},
};
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({width = 390, sdkReady = true, saved = null, settings = config, lazy = false} = {}) {
  class Element extends EventTarget {
    constructor(tag) {
      super(); this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {};
      this.attributes = {}; this.hidden = false; this.className = ''; this.parentNode = null;
      this.style = {setProperty(name, value) { this[name] = value; }};
      this.classList = {contains: name => this.className.split(/\s+/).includes(name)};
    }
    append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.children.push(node); } }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this); this.parentNode = null; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    get isConnected() { return this === doc.documentElement || Boolean(this.parentNode?.isConnected); }
    get clientWidth() { return this.getBoundingClientRect().width; }
    matches(selector) { return selector.split(',').some(value => value.trim() === this.tagName.toLowerCase()); }
    getBoundingClientRect() {
      if (this.hidden || this.parentNode?.hidden) return {width: 0, height: 0, top: 0, bottom: 0};
      let w = Number.parseInt(this.style.width) || width, h = Number.parseInt(this.style.height) || 0;
      if (this.className === 'sidebar') w = width > 1180 ? 254 : width > 830 ? 210 : 0;
      if (this.id === 'mobileNav') h = width <= 830 ? 64 : 0;
      if (this.id === 'gagyebuBottomAd') {
        const panel = this.children[1];
        h = 49 + (panel.hidden ? 0 : (panel.children[0]?.getBoundingClientRect().height || 0));
      }
      return {width: w, height: h, top: 100, bottom: 100 + h};
    }
  }
  const doc = new EventTarget();
  doc.createElement = tag => new Element(tag);
  doc.documentElement = new Element('html');
  doc.body = new Element('body'); doc.head = new Element('head');
  doc.documentElement.append(doc.head, doc.body);
  const all = (node = doc.documentElement) => [node, ...node.children.flatMap(child => all(child))];
  doc.getElementById = id => all().find(node => node.id === id) || null;
  doc.querySelector = selector => selector.startsWith('.') ? all().find(node => node.classList.contains(selector.slice(1))) : null;
  doc.activeElement = doc.body; doc.hidden = false;
  const sidebar = new Element('aside'); sidebar.className = 'sidebar'; doc.body.append(sidebar);
  const nav = new Element('nav'); nav.id = 'mobileNav'; doc.body.append(nav);
  const storage = new Map(saved == null ? [] : [[settings.storageKey, saved]]);
  const win = Object.assign(new EventTarget(), {
    document: doc, innerWidth: width, innerHeight: 800,
    location: {origin: 'https://softm.github.io', pathname: '/gagyebu/'},
    navigator: {onLine: true},
    localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
    setTimeout, clearTimeout,
    requestAnimationFrame: callback => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
  });
  const rendered = [], released = [], intersections = [];
  const adfit = Object.assign(() => assert.fail('Global scan must not be used'), {
    render(ins) { rendered.push(ins); }, destroy(ins) { released.push(ins); },
  });
  if (sdkReady) win.adfit = adfit;
  if (lazy) win.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; intersections.push(this); }
    observe(node) { this.node = node; }
    disconnect() {}
    show() { this.callback([{target: this.node, isIntersecting: true}]); }
  };
  const controller = createAdController({win, doc, config: settings});
  return {
    win, doc, controller, rendered, released, adfit, intersections, storage,
    zone: () => doc.getElementById('gagyebuBottomAd'),
    toggle: () => doc.querySelector('.gagyebu-ad-toggle').dispatchEvent(new Event('click')),
    sdkScript: () => doc.getElementById('gagyebu-adfit-sdk'),
    insCount: () => all().filter(node => node.tagName === 'INS').length,
    addInline() { const host = new Element('div'); host.id = 'analyticsAdSlot'; doc.body.append(host); return host; },
    focusInput() { const input = new Element('input'); doc.body.append(input); doc.activeElement = input; doc.dispatchEvent(new Event('focusin')); return input; },
    resize(next) { width = next; win.innerWidth = next; controller.update({}); },
  };
}

test('only browsing contexts and registered size/ID combinations are eligible', () => {
  assert.equal(validAdSlot({...config.analytics, unitId: ''}), false);
  assert.equal(validAdSlot({...config.analytics, width: 319}), false);
  for (const tab of ['accounts', 'settings', null]) assert.equal(isAdContextAllowed({tab}), false);
  assert.equal(isAdContextAllowed({tab: 'transactions', filter: 'pending'}), false);
  assert.equal(isAdContextAllowed({tab: 'home', modalOpen: true}), false);
  assert.equal(isAdContextAllowed({tab: 'calendar'}), true);
  assert.equal(selectBottomSlot(config, 319), null);
  assert.equal(selectBottomSlot(config, 727), config.bottom.mobile);
  assert.equal(selectBottomSlot(config, 728), config.bottom.desktop);
});

test('repeated renders and browsing tab changes keep the current bottom request', async t => {
  const f = fixture(); t.after(() => f.controller.destroy());
  assert.equal(f.rendered.length, 0);
  f.controller.update({tab: 'home'}); await flush();
  for (let i = 0; i < 8; i++) f.controller.update({tab: i % 2 ? 'calendar' : 'home'});
  await flush();
  assert.equal(f.rendered.length, 1);
  assert.equal(f.insCount(), 1);
  f.win.gagyebuBottomAdLoaded(f.rendered[0]);
  assert.equal(f.zone().dataset.state, 'ready');
});

test('collapse persists, destroys SDK resources, and ignores late callbacks from the prior request', async t => {
  const f = fixture(); t.after(() => f.controller.destroy());
  f.controller.update({tab: 'home'}); await flush();
  const old = f.rendered[0];
  f.toggle();
  assert.equal(f.insCount(), 0);
  assert.deepEqual(f.released, [old]);
  assert.equal(f.storage.get(config.storageKey), '1');
  assert.equal(f.zone().hidden, false);
  f.toggle(); await flush();
  f.win.gagyebuBottomAdFailed(old);
  assert.equal(f.zone().hidden, false);
  assert.equal(f.rendered.length, 2);
  assert.equal(f.insCount(), 1);
  assert.equal(f.storage.get(config.storageKey), '0');
});

test('no-fill removes reserved space and does not retry on rerender', async t => {
  const f = fixture(); t.after(() => f.controller.destroy());
  f.controller.update({tab: 'home'}); await flush();
  f.win.gagyebuBottomAdFailed(f.rendered[0]);
  assert.equal(f.zone().hidden, true);
  assert.equal(f.doc.documentElement.style['--gagyebu-ad-height'], '0px');
  f.controller.update({tab: 'calendar'}); await flush();
  assert.equal(f.rendered.length, 1);
  f.resize(1440); await flush();
  assert.equal(f.rendered.length, 2);
  assert.equal(f.rendered[1].dataset.adUnit, config.bottom.desktop.unitId);
});

test('a modal opened during SDK loading cancels insertion and the SDK is loaded once', async t => {
  const f = fixture({sdkReady: false}); t.after(() => f.controller.destroy());
  f.controller.update({tab: 'home'});
  const script = f.sdkScript(); assert.ok(script);
  assert.equal(f.insCount(), 0);
  f.controller.update({modalOpen: true});
  f.win.adfit = f.adfit; script.dispatchEvent(new Event('load')); await flush();
  assert.equal(f.rendered.length, 0);
  assert.equal(f.zone().hidden, true);
  f.controller.update({modalOpen: false}); await flush();
  assert.equal(f.rendered.length, 1);
  assert.equal(f.sdkScript(), script);
});

test('input protection and offline/hidden state destroy ads without changing the saved preference', async t => {
  const f = fixture(); t.after(() => f.controller.destroy());
  f.controller.update({tab: 'home'}); await flush();
  f.focusInput();
  assert.equal(f.zone().hidden, true);
  assert.equal(f.insCount(), 0);
  assert.equal(f.storage.has(config.storageKey), false);
  f.doc.activeElement = f.doc.body; f.doc.dispatchEvent(new Event('focusin')); await flush();
  assert.equal(f.insCount(), 1);
  f.win.navigator.onLine = false; f.win.dispatchEvent(new Event('offline'));
  assert.equal(f.insCount(), 0);
  f.win.navigator.onLine = true; f.win.dispatchEvent(new Event('online')); await flush();
  f.doc.hidden = true; f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.insCount(), 0);
});

test('analysis footer is lazy, keeps its stable iframe during renders, and restores after modal protection', async t => {
  const f = fixture({lazy: true}); t.after(() => f.controller.destroy());
  const first = f.addInline();
  f.controller.update({tab: 'analytics'}); await flush();
  assert.equal(f.rendered.length, 1);
  f.intersections.at(-1).show(); await flush();
  assert.equal(f.rendered.length, 2);
  assert.equal(f.insCount(), 2);
  const shell = first.children[0];
  f.controller.update({tab: 'analytics'}); await flush();
  assert.equal(f.rendered.length, 2);
  assert.equal(f.insCount(), 2);
  assert.equal(first.children[0], shell);
  f.controller.update({modalOpen: true});
  assert.equal(first.hidden, true);
  assert.equal(f.insCount(), 0);
  f.controller.update({modalOpen: false}); await flush();
  assert.equal(first.hidden, false);
  assert.equal(f.insCount(), 2);
});

test('removing a focused modal input without focusout still restores the allowed browsing ad', async t => {
  const f = fixture(); t.after(() => f.controller.destroy());
  f.controller.update({tab: 'home'}); await flush();
  const input = f.focusInput();
  f.controller.update({modalOpen: true});
  input.remove(); f.doc.activeElement = f.doc.body;
  f.controller.update({modalOpen: false}); await flush();
  assert.equal(f.zone().hidden, false);
  assert.equal(f.insCount(), 1);
});

test('missing units, duplicated units, and unregistered origins cannot generate extra requests', async t => {
  const settings = {...config, analytics: {...config.analytics, unitId: config.bottom.mobile.unitId}};
  const f = fixture({settings}); t.after(() => f.controller.destroy());
  f.addInline(); f.controller.update({tab: 'analytics'}); await flush();
  assert.equal(f.rendered.length, 1);
  f.win.location.origin = 'https://unregistered.example';
  f.controller.update({tab: 'home'});
  assert.equal(f.insCount(), 0);
  const empty = fixture({settings: {...config, bottom: {}, analytics: null}, sdkReady: false});
  t.after(() => empty.controller.destroy()); empty.controller.update({tab: 'home'});
  assert.equal(empty.sdkScript(), null);
  assert.equal(empty.zone().hidden, true);
});

test('SDK failure clears the slot and does not create repeat script requests', async t => {
  const f = fixture({sdkReady: false}); t.after(() => f.controller.destroy());
  f.controller.update({tab: 'home'});
  const script = f.sdkScript(); script.dispatchEvent(new Event('error')); await flush();
  assert.equal(f.zone().hidden, true);
  assert.equal(f.doc.documentElement.style['--gagyebu-ad-height'], '0px');
  f.controller.update({tab: 'calendar'}); await flush();
  assert.equal(f.sdkScript(), script);
  assert.equal(f.insCount(), 0);
});
