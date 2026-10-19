const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { stripTypeScriptTypes } = require('node:module');
const admin = fs.readFileSync('app/admin/page.tsx', 'utf8');
function run(source, bindings) {
  const context = vm.createContext(bindings);
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText, context);
  return context;
}
test('actual admin handler cancels without writing, confirms once, and retains draft on failure', async () => {
  const source = admin.slice(admin.indexOf('  async function confirmLeadDays()'), admin.indexOf('  const selectedDateRef='));
  for (const scenario of ['cancel', 'save', 'failure', 'unchanged', 'invalid', 'busy']) {
    let calls = 0, prompts = 0, saved = 3, draft = '7', message = '';
    const c = run(source, {
      Date, Error, Number, String, JSON,
      leadPrompting: { current: false }, leadSaving: scenario === 'busy', leadValid: scenario !== 'invalid', leadDraft: scenario === 'unchanged' ? '3' : '7', leadDays: 3,
      earliestVideoBookingDate: () => '2026-10-13', videoBookingDateLabel: () => '10/13(二)',
      window: { confirm: text => { prompts++; assert.match(text, /10\/13\(二\)/); return scenario !== 'cancel'; } },
      setLeadDraft: value => draft = value, setLeadDays: value => saved = value, setLeadMessage: value => message = value, setLeadSaving: () => {},
      fetch: async (url, options) => { calls++; assert.equal(JSON.parse(options.body).days, 7); return { ok: scenario !== 'failure', json: async () => scenario === 'failure' ? { error: '儲存失敗' } : { days: 7 } }; },
    });
    await Promise.all([c.confirmLeadDays(), ...(scenario === 'save' ? [c.confirmLeadDays()] : [])]);
    if (['unchanged', 'invalid', 'busy'].includes(scenario)) { assert.equal(prompts, 0); assert.equal(calls, 0); }
    if (scenario === 'cancel') { assert.equal(calls, 0); assert.equal(draft, '3'); }
    if (scenario === 'save') { assert.equal(calls, 1); assert.equal(prompts, 1); assert.equal(saved, 7); assert.match(message, /立即生效/); }
    if (scenario === 'failure') { assert.equal(saved, 3); assert.equal(draft, '7'); assert.equal(message, '儲存失敗'); }
  }
});
test('actual target chooser includes pets only for past-life relationship and prevents duplicate targets', () => {
  const source = fs.readFileSync('app/booking-data/page.tsx', 'utf8');
  const chooser = source.slice(source.indexOf('    chooser = (id:'), source.indexOf('    targetSlot =')).trim().replace(/,$/, ';');
  const profiles = [{ id: 'self', name: '本人', profile_type: 'person' }, { id: 'relative', name: '親人', profile_type: 'deceased' }, { id: 'pet', name: '小白', profile_type: 'pet' }];
  for (const relation of [true, false]) {
    const c = run('var ' + chooser, { profiles, relation, locked: false, primaryId: 'self', ids: ['pet'], React: { createElement: (type, props, ...children) => ({ type, props, children }) } });
    const options = c.chooser('', 0).children.flat().filter(x => x?.props?.value);
    assert.deepEqual(Array.from(options, x => x.props.value), relation ? ['self', 'relative', 'pet'] : ['self']);
    if (relation) { const pet = options.find(x => x.props.value === 'pet'); assert.match(pet.children.join(''), /小白（過世寵物）/); assert.equal(pet.props.disabled, true); }
  }
});

test('settings endpoint requires admin and validates numbers before persisting', async () => {
  const source = stripTypeScriptTypes(fs.readFileSync('app/api/admin/schedule/route.ts', 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '');
  for (const [authorized, days, status] of [[false, 7, 401], [true, '7', 400], [true, -1, 400], [true, 1.5, 400], [true, 0, 200], [true, 7, 200]]) {
    let stored;
    const c = vm.createContext({ Date, cookies: async () => ({ get: () => ({ value: 'test' }) }), isAdminSession: () => authorized, validVideoLeadDays: value => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 36500, adminSupabase: () => ({ from: () => ({ upsert: async value => { stored = value; return {}; } }) }), NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } });
    vm.runInContext(source, c);
    const result = await c.POST({ json: async () => ({ action: 'set_video_booking_lead_days', days }) });
    assert.equal(result.status, status);
    if (status === 200) assert.equal(stored.video_booking_lead_days, days); else assert.equal(stored, undefined);
  }
});
