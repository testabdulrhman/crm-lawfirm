// رفع IPA عبر App Store Connect Build Upload API — بديل مرفوع Xcode.
// (2026-09-13) فشل `xcodebuild -exportArchive` مرتين بـ«No Accounts with App Store Connect
// Access» (‎-1202 lookupGenericSettingsForSubmission) رغم أن المفتاح يعمل مع الواجهة وصفحة
// حالة أبل خالية، وaltool معطوب في Xcode 26 («Defaults.properties couldn't be opened»).
//
// الاستعمال: node ios-native/tools/upload.mjs <path.ipa> <version> <build>
// ثم: node ios-native/tools/submit.mjs <version> <build> "ما الجديد"
import fs from 'node:fs';
import crypto from 'node:crypto';
import { call, APP } from './asc.mjs';

const [ipaPath, version, build] = process.argv.slice(2);
if (!ipaPath || !version || !build) {
  console.error('الاستعمال: node upload.mjs <ipa> <version> <build>');
  process.exit(2);
}
const buf = fs.readFileSync(ipaPath);

// ⓪ منع الرفع المكرر (2026-09-14): إن كان لهذا الإصدار والبناء رفعٌ قائم غير فاشل فلا نُنشئ آخر —
// إعادة التشغيل بعد انقطاع كانت تُنشئ سجلاً مكرراً فترفضه أبل («bundle version must be higher»)
{
  const prev = await call('GET', `/apps/${APP}/buildUploads?limit=10`);
  // سجل عالق في AWAITING_UPLOAD (انقطعت الشبكة قبل رفع الملف) لا يمنع محاولة جديدة بعد ١٠ دقائق
  const stale = (u) => u.attributes?.state?.state === 'AWAITING_UPLOAD' &&
    (process.env.FORCE_UPLOAD === '1' ||
     Date.now() - new Date(u.attributes?.createdDate ?? 0).getTime() > 10 * 60 * 1000);
  const same = (prev.data ?? []).find((u) =>
    u.attributes?.cfBundleVersion === build &&
    u.attributes?.cfBundleShortVersionString === version &&
    u.attributes?.state?.state !== 'FAILED' && !stale(u));
  if (same) {
    console.log(`البناء ${version} (${build}) مرفوع سابقاً — الحالة: ${same.attributes.state?.state} (${same.id})`);
    process.exit(0);
  }
}
const md5 = crypto.createHash('md5').update(buf).digest('hex').toUpperCase();
const fail = (step, r) => { console.error('✗', step, JSON.stringify(r?.errors ?? r, null, 1)); process.exit(1); };

// ١) سجل الرفع
const up = await call('POST', '/buildUploads', {
  data: {
    type: 'buildUploads',
    attributes: { cfBundleShortVersionString: version, cfBundleVersion: build, platform: 'IOS' },
    relationships: { app: { data: { type: 'apps', id: APP } } },
  },
});
if (!up.data) fail('buildUploads', up);
const uploadId = up.data.id;
console.log('buildUpload:', uploadId);

// ٢) ملف الـIPA — بنفس صفات رفعات Xcode السابقة (ASSET / com.apple.ipa)
const f = await call('POST', '/buildUploadFiles', {
  data: {
    type: 'buildUploadFiles',
    attributes: { fileName: 'Redwan.ipa', fileSize: buf.length, uti: 'com.apple.ipa', assetType: 'ASSET' },
    relationships: { buildUpload: { data: { type: 'buildUploads', id: uploadId } } },
  },
});
if (!f.data) fail('buildUploadFiles', f);
const fileId = f.data.id;
const ops = f.data.attributes?.uploadOperations ?? [];
console.log('file:', fileId, '· أجزاء:', ops.length);

// ٣) الأجزاء إلى الروابط الموقّعة
for (const [i, op] of ops.entries()) {
  const headers = Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value]));
  const res = await fetch(op.url, { method: op.method, headers, body: buf.subarray(op.offset, op.offset + op.length) });
  if (!res.ok) { console.error('✗ PUT', i, res.status, (await res.text()).slice(0, 300)); process.exit(1); }
}
console.log('رُفعت الأجزاء');

// ٤) الإقفال بالبصمة
const done = await call('PATCH', `/buildUploadFiles/${fileId}`, {
  data: { type: 'buildUploadFiles', id: fileId,
          attributes: { uploaded: true, sourceFileChecksums: { file: { hash: md5, algorithm: 'MD5' } } } },
});
if (!done.data) fail('commit', done);
console.log('أُقفل الملف');

// ٥) حالة الرفع (معالجة البناء نفسها يتابعها submit.mjs)
// ⚠️ انقطاع الاتصال هنا لا يعني فشل الرفع — الملف أُقفل أعلاه. لا تُعِد تشغيل الأداة بسببه.
for (let i = 0; i < 15; i++) {
  let s;
  try {
    s = await call('GET', `/buildUploads/${uploadId}`);
  } catch (e) {
    console.log('تعثّر الاتصال أثناء المتابعة — الرفع نفسه تمّ:', e.cause?.code ?? e.message);
    await new Promise((r) => setTimeout(r, 20000));
    continue;
  }
  const st = s.data?.attributes?.state;
  const notes = [...(st?.errors ?? []), ...(st?.warnings ?? [])].map((e) => e.description ?? e.code ?? JSON.stringify(e));
  console.log('الحالة:', st?.state ?? JSON.stringify(s.errors ?? s).slice(0, 200), notes.length ? notes.join(' | ') : '');
  if (['COMPLETE', 'FAILED'].includes(st?.state) || st?.errors?.length) break;
  await new Promise((r) => setTimeout(r, 20000));
}
