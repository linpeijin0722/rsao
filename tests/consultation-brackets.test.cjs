const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const path = require('node:path');
// Run the actual document parser/writers with Google transport mocked; no credentials needed.
const source = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, '../lib/google-consultation-docs.ts'), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '')
  .replace('async function accessToken()', 'async function unusedAccessToken()')
  .replace('async function google(', 'async function unusedGoogle(');
function fixture(initial) {
  let content = initial;
  const context = vm.createContext({ process: { env: {} }, Buffer,
    accessToken: async () => 'test',
    google: async (url, token, init) => {
      if (url.includes('/drive/')) return { mimeType: 'application/vnd.google-apps.document', parents: ['1pihxwGH-FJtWPiCAwBcSvs65L603HVu-'] };
      if (!init) return { body: { content: [{ startIndex: 1, endIndex: content.length + 1, paragraph: { elements: [{ startIndex: 1, textRun: { content } }] } }] } };
      for (const request of JSON.parse(init.body).requests) {
        if (request.deleteContentRange) { const { startIndex, endIndex } = request.deleteContentRange.range; content = content.slice(0, startIndex - 1) + content.slice(endIndex - 1); }
        if (request.insertText) { const { location, text } = request.insertText; content = content.slice(0, location.index - 1) + text + content.slice(location.index - 1); }
      }
      return {};
    }
  });
  vm.runInContext(source, context);
  return { api: context, text: () => content };
}
for (const [open, close] of [['【','】'], ['《','》']]) {
  test(`${open}${close}: detect external item, retain profile and next section when writing`, async () => {
    const form = `${open}過世親人${close}\n小明／男\n農曆生日：民國80年1月1日\n居住地址：台北\n`;
    const initial = `${form}您好，以下是您的諮詢結果\n${open}過世親人${close}\n小明／男\n農曆生日：民國80年1月1日\n居住地址：台北\n舊回答\n《綜觀今生》\n保留內容\n`;
    const f = fixture(initial);
    const detected = await f.api.detectExternalConsultationResults('test');
    assert.equal(detected[0].itemCode, 'deceased-relative');
    assert.equal(detected[0].consultantLines[0], '小明／男');
    await f.api.upsertExternalConsultationSectionReplies('test', { 0: '新回答' });
    assert.ok(f.text().includes('居住地址：台北\n新回答'));
    assert.ok(f.text().includes('《綜觀今生》\n保留內容'));
    assert.ok(!f.text().includes('舊回答'));
  });
  test(`${open}${close}: past life overview and advice preserve neighboring sections`, async () => {
    const f = fixture(`項目 1 前世因果（個人）\n【前世】\n前世保留\n${open}綜觀今生${close}\n舊綜觀\n${open}兩人相處建議${close}\n舊建議\n【其他】\n後段保留\n`);
    await f.api.upsertPastLifeOverviewReplies('test', [{ answer: `${open}綜觀今生${close}\n新綜觀\n${open}兩人相處建議${close}\n新建議`, itemCode: 'past-life-personal', targetName: '', profileName: '' }]);
    assert.ok(f.text().includes(`${open}綜觀今生${close}\n新綜觀`));
    assert.ok(f.text().includes(`${open}兩人相處建議${close}\n新建議`));
    assert.ok(f.text().includes('【前世】\n前世保留'));
    assert.ok(f.text().includes('【其他】\n後段保留'));
    assert.ok(!f.text().includes('舊綜觀'));
  });
}
test('mixed brackets: reader and section writer use the same slot numbers', async () => {
  const f = fixture('您好，以下是您的諮詢結果\n【前世】\n過去\n《綜觀今生》\n舊內容\n【兩人相處建議】\n保留建議\n');
  const slots = await f.api.getQuickReplySectionSlots('test');
  assert.equal(slots[1].label, '綜觀今生');
  assert.equal(slots[1].answer, '舊內容');
  await f.api.upsertQuickConsultationSectionReplies('test', { 1: '新內容' });
  assert.ok(f.text().includes('《綜觀今生》\n新內容'));
  assert.ok(f.text().includes('【兩人相處建議】\n保留建議'));
});
