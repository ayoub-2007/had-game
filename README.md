# الحَد — دليل التشغيل والنشر

## تشغيل محلي
```
npm install
npm start      # http://localhost:3000  (يخدم الواجهة + الأونلاين)
```

## 1) السيرفر مجاناً على Render
1. ارفع مجلد المشروع كاملاً إلى مستودع GitHub.
2. في render.com: New → Web Service → اختر المستودع.
3. Build: `npm install` — Start: `npm start` — Instance: Free.
4. متغير بيئة (اختياري): `CLIENT_ORIGIN` = رابط الواجهة (مثل https://alhad.vercel.app).
5. ستحصل على رابط مثل https://alhad.onrender.com. ملاحظة: الخطة المجانية تنام بعد 15 دقيقة خمول (أول طلب يتأخر ~50 ثانية)، والقرص مؤقت أي أن ملف `players.json` يُمسح عند كل نشر؛ للحفظ الدائم استبدل ملف JSON بقاعدة مجانية (MongoDB Atlas أو Supabase).
   (Railway وFly.io بدائل، لكن حصصهما المجانية محدودة وقد تتغير.)

## 2) الواجهة مجاناً (Vercel / Netlify / GitHub Pages)
1. افتح `public/index.html` وأضف قبل `<script src="game.js">` السطر:
   `<script>window.SERVER_URL="https://alhad.onrender.com";</script>`
2. Vercel: Add New Project → اختر المستودع → Root Directory = `public` → Framework: Other → Deploy.
   Netlify: Publish directory = `public`. GitHub Pages: ضع محتوى `public` في فرع `gh-pages`.
3. (أبسط خيار) تجاهل هذه الخطوة واستعمل رابط Render نفسه لأنه يخدم الواجهة أيضاً.

## 3) دومين مجاني
- فوري: `اسمك.vercel.app` أو `اسمك.netlify.app` (Settings → Domains → غيّر الاسم).
- دومين مخصص بدون دفع: خدمات النطاقات الفرعية المجانية مثل `is-a.dev` (طلب Pull Request على GitHub، للمطورين) أو `eu.org` (طلب يُراجع يدوياً وقد يستغرق أسابيع). Freenom توقفت.
- الربط: في Vercel/Netlify → Domains → Add → انسخ سجل CNAME المعروض إلى لوحة مزوّد النطاق الفرعي → انتظر دقائق حتى يصدر شهادة HTTPS تلقائياً.
- بما أنه لا يوجد دومين مجاني مضمون الدوام، تحقق من شروط كل خدمة قبل الاعتماد عليها.

## 4) PWA
الملفات جاهزة: `manifest.json` و`sw.js` و`icon.svg`. بعد النشر على HTTPS:
- أندرويد/كروم: القائمة ⋮ → «تثبيت التطبيق». آيفون/سفاري: مشاركة → «إضافة إلى الشاشة الرئيسية». ديسكتوب: أيقونة التثبيت في شريط العنوان.
- الأوفلاين: اللعب المحلي وضد الحاسوب يعملان بلا إنترنت؛ الأونلاين يحتاج اتصالاً. عند تعديل الملفات غيّر رقم `alhad-v1` في `sw.js`.
- للأيقونات على iOS يُفضّل إضافة PNG بحجم 192 و512 في المانيفست.

## ملاحظات
- الغرف الخاصة غير مصنّفة (ELO للمطابقة العشوائية فقط). الهوية تعتمد على معرّف محفوظ في المتصفح (لا حسابات).
- الإعلانات: دالة `Ads.maybeShow` في game.js تطبق الشرط (خسارتان + 5 دقائق)؛ ضع كود شبكة الإعلانات داخل `#adSlot`.
