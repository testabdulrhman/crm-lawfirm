import { call, APP } from './asc.mjs';

const VERSION = process.argv[2];
const BUILD = process.argv[3];
const WHATS_NEW = process.argv[4];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ١) انتظار معالجة أبل للبناء
let buildId = null;
for (let i = 0; i < 40; i++) {
  const d = await call('GET', `/builds?filter[app]=${APP}&sort=-uploadedDate&limit=1&fields[builds]=version,processingState`);
  const a = d.data?.[0]?.attributes ?? {};
  if (a.version === BUILD && a.processingState === 'VALID') { buildId = d.data[0].id; break; }
  console.log('انتظار…', a.version, a.processingState);
  await sleep(60000);
}
if (!buildId) { console.error('انتهت المهلة قبل أن يصير البناء VALID'); process.exit(1); }
console.log('BUILD_VALID', buildId);

// ٢) إقرار التشفير — بدونه يفشل ربط الإرسال بخطأ مقتضب
const enc = await call('PATCH', `/builds/${buildId}`, {
  data: { type: 'builds', id: buildId, attributes: { usesNonExemptEncryption: false } },
});
console.log('التشفير:', enc.data ? 'ok' : JSON.stringify(enc.errors));

// ٣) النسخة (أو استرجاعها إن أُنشئت سابقاً)
let ver = (await call('POST', '/appStoreVersions', {
  data: {
    type: 'appStoreVersions',
    attributes: { platform: 'IOS', versionString: VERSION, releaseType: 'AFTER_APPROVAL' },
    relationships: { app: { data: { type: 'apps', id: APP } } },
  },
})).data?.id;
if (!ver) {
  const d = await call('GET', `/apps/${APP}/appStoreVersions?filter[versionString]=${VERSION}`);
  ver = d.data?.[0]?.id;
}
console.log('النسخة:', ver);
if (!ver) process.exit(1);

// ٤) «ما الجديد» لكل توطين
const locs = await call('GET', `/appStoreVersions/${ver}/appStoreVersionLocalizations?fields[appStoreVersionLocalizations]=locale`);
for (const l of locs.data ?? []) {
  await call('PATCH', `/appStoreVersionLocalizations/${l.id}`, {
    data: { type: 'appStoreVersionLocalizations', id: l.id, attributes: { whatsNew: WHATS_NEW } },
  });
}
console.log('ما الجديد: ok');

// ٥) ربط البناء ثم التقديم
await call('PATCH', `/appStoreVersions/${ver}/relationships/build`, { data: { type: 'builds', id: buildId } });
console.log('رُبط البناء');

const sub = (await call('POST', '/reviewSubmissions', {
  data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: APP } } } },
})).data?.id;
console.log('الإرسال:', sub);
if (!sub) process.exit(1);

const item = await call('POST', '/reviewSubmissionItems', {
  data: { type: 'reviewSubmissionItems', relationships: {
    reviewSubmission: { data: { type: 'reviewSubmissions', id: sub } },
    appStoreVersion: { data: { type: 'appStoreVersions', id: ver } },
  } },
});
console.log('العنصر:', item.data ? 'ok' : JSON.stringify(item.errors));

const done = await call('PATCH', `/reviewSubmissions/${sub}`, {
  data: { type: 'reviewSubmissions', id: sub, attributes: { submitted: true } },
});
console.log('قُدّم:', done.data ? 'ok ✅' : JSON.stringify(done.errors));
console.log('VERSION_ID:', ver, '| SUBMISSION:', sub);
