const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const route = fs.readFileSync('app/api/staff/quick-reply/route.ts', 'utf8');
const ui = fs.readFileSync('app/staff/QuickConsultationReply.tsx', 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;

test('actual question mapping keeps phrase buttons available and does not copy another target answer', () => {
  const start = route.indexOf('  let questionSlots = questionMeta.map('), end = route.indexOf('  if (!questionSlots.length)', start);
  const context = vm.createContext({ clean: value => String(value || '').trim(), questionMeta: [
    { question: '我們還有緣分嗎？', itemCode: 'marriage-bazi', profileName: '甲' },
    { question: '我們還有緣分嗎？', itemCode: 'marriage-bazi', profileName: '乙' },
  ], documentQuestionSlots: [{ question: '我們還有緣分嗎？', answer: '甲的原回答' }] });
  vm.runInContext(compile(route.slice(start, end).replace('let questionSlots', 'var questionSlots')), context);
  assert.equal(context.questionSlots[0].manualOnly, false);
  assert.equal(context.questionSlots[1].manualOnly, false);
  assert.equal(context.questionSlots[0].answer, '甲的原回答');
  assert.equal(context.questionSlots[1].answer, '');
});

function renderReply(topics, sections = []) {
  let stateIndex = 0;
  const data = { questions: [{ slotIndex: 0, questionNumber: 1, question: '我們還有緣分嗎？', itemCode: 'marriage-bazi', itemTitle: '感情運勢與關係合盤', profileName: '測試對象', profileLines: [], requestLines: [], manualOnly: false }], sections, topics, recommendedByQuestion: { 0: ['love'] }, recommendedBySection: {}, previousSummaries: [], questionReplies: {}, sectionReplies: {}, bookingNo: 'TEST', customerName: '測試', documentUrl: '#' };
  const mockReact = { ...React, useState: initial => { const index = stateIndex++; return [index === 0 ? data : index === 3 ? false : index === 4 ? 'question' : typeof initial === 'function' ? initial() : initial, () => {}]; }, useEffect: () => {}, useMemo: fn => fn(), useRef: value => ({ current: value }) };
  const context = vm.createContext({ React, exports: {}, console, require: name => name === 'react' ? mockReact : name.includes('annual-fortune') ? { parseAnnual: () => ({}) } : { default: () => null } });
  vm.runInContext(compile(ui), context);
  return renderToStaticMarkup(React.createElement(context.exports.default, { bookingNo: 'TEST', documentId: 'TEST', standalone: true, onClose: () => {} }));
}
test('actual page renders category and phrase buttons, default expanded, and manual entry', () => {
  const html = renderReply([{ code: 'love', title: '感情', icon: '', options: [{ id: 'one', code: 'status_bond', label: '仍有緣分牽引' }] }]);
  assert.match(html, /快速回覆分類/);
  assert.match(html, /<button[^>]*>仍有緣分牽引<\/button>/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /<textarea/);
});
test('empty phrase library displays explicit message instead of silently hiding buttons', () => {
  assert.match(renderReply([]), /目前沒有可用的快速回覆分類/);
});
test('actual choice composes selected phrases only into its own question draft', async () => {
  const compose = ui.slice(ui.indexOf('  async function compose('), ui.indexOf('  async function composeSection('));
  const choose = ui.slice(ui.indexOf('  function choose('), ui.indexOf('  function toggleOption('));
  let drafts = { 0: { selections: {}, phraseIds: [], answer: '' }, 1: { answer: '其他人的答案' } }, sent;
  const context = vm.createContext({ asCodes: value => Array.isArray(value) ? value : [], question: { slotIndex: 0 }, questionKey: '0', category: { code: 'love' }, draft: drafts[0], setBusy: () => {}, setError: () => {}, setWritten: () => {}, setEditing: () => {}, setDrafts: fn => { drafts = fn(drafts); }, window: { alert: () => {} }, post: async payload => { sent = payload; return { answer: '仍有緣分牽引。', phraseIds: ['p1'] }; } });
  vm.runInContext(compile(compose + choose), context);
  context.choose('status_bond');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.mode, 'compose');
  assert.equal(sent.selections.love[0], 'status_bond');
  assert.equal(drafts[0].answer, '仍有緣分牽引。');
  assert.equal(drafts[1].answer, '其他人的答案');
});
