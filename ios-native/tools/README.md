# أدوات النشر لـApp Store Connect

بلا اعتماديات: توقيع ES256 بوحدة `crypto` المدمجة في Node (لا pip ولا venv ولا deno).
المفتاح الخاص يبقى خارج المستودع في `~/.asc/AuthKey_R7MPB9GF3A.p8` — لا تضعه هنا أبداً.

> نُقلت إلى المستودع بعد أن ضاعت نسخة `/tmp` مع إعادة تشغيل الجهاز (2026-09-03).

## حالة نسخة

```bash
node -e "import('./ios-native/tools/asc.mjs').then(async({call,APP})=>{
  const d=await call('GET',\`/apps/\${APP}/appStoreVersions?filter[versionString]=1.0.6&fields[appStoreVersions]=versionString,appStoreState\`);
  console.log(d.data?.[0]?.attributes);
})"
```

## رفع نسخة جديدة

```bash
# ١) ارفع الرقمين في project.pbxproj (MARKETING_VERSION و CURRENT_PROJECT_VERSION)
# ٢) أرشِف وتحقق من محتوى الأرشيف بـstrings قبل الرفع (درس 1.0.1)
xcodebuild archive -project ios-native/Redwan.xcodeproj -scheme Redwan \
  -destination "generic/platform=iOS" -archivePath /tmp/Redwan-NNN.xcarchive \
  -allowProvisioningUpdates -authenticationKeyPath ~/.asc/AuthKey_R7MPB9GF3A.p8 \
  -authenticationKeyID R7MPB9GF3A -authenticationKeyIssuerID 8c4bcb1e-fbcb-42f0-860e-ba398aa5865d

# ٣) صدّر وارفع
xcodebuild -exportArchive -archivePath /tmp/Redwan-NNN.xcarchive \
  -exportOptionsPlist ios-native/tools/ExportUpload.plist -exportPath /tmp/export-NNN \
  -allowProvisioningUpdates -authenticationKeyPath ~/.asc/AuthKey_R7MPB9GF3A.p8 \
  -authenticationKeyID R7MPB9GF3A -authenticationKeyIssuerID 8c4bcb1e-fbcb-42f0-860e-ba398aa5865d

# ٤) انتظر المعالجة ثم قدّم للمراجعة
node ios-native/tools/submit.mjs 1.0.7 9 "نص ما الجديد"
```

`submit.mjs` ينفّذ الدورة كاملة: انتظار `processingState=VALID` → إقرار التشفير
(`usesNonExemptEncryption:false` — بدونه يفشل ربط الإرسال) → إنشاء النسخة →
«ما الجديد» لكل توطين → ربط البناء → إرسال المراجعة.
