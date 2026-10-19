const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const source = fs.readFileSync('lib/google-consultation-docs.ts', 'utf8');
const parser = stripTypeScriptTypes(source.slice(source.indexOf('export type ConsultationReturnItem'), source.indexOf('export type QuickReplyManualReply'))).replace(/\bexport /g, '');
const paragraph = content => ({ paragraph: { elements: [{ textRun: { content } }] } });
async function preview(blocks) {
  const requests = [];
  const context = vm.createContext({ accessToken: async () => 'mock', google: async (...args) => { requests.push(args); return { body: { content: blocks } }; } });
  vm.runInContext(parser, context);
  const items = await context.getConsultationReturnPreview('TEST');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].length, 2, 'preview must only read, never write');
  return items;
}
test('missing item 7 does not block others or shift their identity or expose raw profile data', async () => {
  const blocks = Array.from({ length: 8 }, (_, i) => paragraph(`項目 ${i + 1}（共 8 個項目）\n測試${i + 1}【項目】\n姓名：測試${i + 1}\n居住地址：私人地址\n${i === 6 ? '原本只有資料\n' : `Q1:問題${i + 1}\nA1:回答${i + 1}\n`}`));
  const result = await preview(blocks);
  assert.equal(result.length, 8);
  assert.equal(result[6].index, 7);
  assert.equal(result[6].content, '');
  assert.match(result[6].parseWarning, /項目 7/);
  assert.equal(result[7].index, 8);
  assert.match(result[7].content, /回答8/);
  assert.doesNotMatch(result[7].content, /私人地址|回答6/);
});
test('indented fullwidth Q1, result headings and table content are recognized', async () => {
  const result = await preview([
    paragraph('項目 1（共 3 個項目）\n甲【合盤】\n　Ｑ１：問題\nＡ１：回答甲\n'),
    { table: { tableRows: [{ tableCells: [{ content: [paragraph('項目 2（共 3 個項目）\n乙【健康】\n　《健康建議》\n回答乙\n')] }] }] } },
    paragraph('項目 3（共 3 個項目）\n丙【其他】\n您好，以下是您的諮詢結果\n回答丙\n'),
  ]);
  assert.equal(result.length, 3);
  for (const item of result) assert.equal(item.parseWarning, undefined);
  assert.match(result[1].content, /回答乙/);
  assert.match(result[2].content, /回答丙/);
});
test('all unrecognized items still allow a review page, with no sendable content', async () => {
  const items = await preview([paragraph('項目 1（共 1 個項目）\n測試【資料】\n姓名：測試\n')]);
  assert.equal(items[0].content, '');
  assert.ok(items[0].parseWarning);
});

test('server rejects an unreadable item even when a client supplies replacement content', async () => {
  const delivery = fs.readFileSync('lib/consultation-return-delivery.ts', 'utf8');
  const source = stripTypeScriptTypes(delivery.slice(delivery.indexOf('export async function prepareConsultationReturn'), delivery.indexOf('export async function deliverPreparedConsultationReturn'))).replace(/\bexport /g, '');
  const context = vm.createContext({ bookingForConsultationReturn: async () => ({ booking: { id: 'booking' }, detail: { google_document_id: 'doc' }, customer: { line_user_id: 'test' }, method: { code: 'video' } }), getConsultationReturnPreview: async () => [{ index: 7, content: '', parseWarning: '項目7待確認' }], returnItemBindings: () => { throw Error('should not reach bindings'); } });
  vm.runInContext(source, context);
  await assert.rejects(context.prepareConsultationReturn({ bookingNo: 'TEST', selectedIndexes: [7], editedItems: { 7: '未確認內容' } }), /項目7待確認/);
});

test('actual return-page load excludes unreadable item without failing whole page', async () => {
  const ui = fs.readFileSync('app/staff/consultation-return/page.tsx', 'utf8');
  const start = ui.indexOf('  useEffect(()=>{const params='), end = ui.indexOf('  useEffect(()=>{if(editing)', start);
  let selected, data, error, loading;
  const context = vm.createContext({ URLSearchParams, window: { location: { search: '?bookingNo=TEST&documentId=TEST' } }, useEffect: fn => fn(), normalizeDraft: value => value, setData: value => data = value, setSelected: value => selected = value, setVersions: () => {}, setActiveVersionIds: () => {}, setError: value => error = value, setLoading: value => loading = value, setDraftRevision:()=>{},setDraftSnapshot:()=>{},setDraftReady:()=>{},setDraftWarning:()=>{}, fetch: async () => ({ ok: true, json: async () => ({ items: [{ index: 6, content: '回答6' }, { index: 7, content: '', parseWarning: '待確認' }, { index: 8, content: '回答8' }] }) }) });
  vm.runInContext(stripTypeScriptTypes(ui.slice(start, end)), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Array.from(selected), [6, 8]);
  assert.equal(data.items[1].index, 7);
  assert.equal(error, undefined);
  assert.equal(loading, false);
});
