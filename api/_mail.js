// =====================================================================
//  مدللني mdllni — البريد: إرسال رموز التحقق عبر HTTPS صرف (بدون أي حزمة
//  إضافية — تعمل على Vercel Node 18+ بـ fetch المدمج).
//  المزودون المدعومون: resend / sendgrid / brevo — يُختار بـ MAIL_PROVIDER.
//  وضع التطوير: MAIL_DEV_ECHO=1 يطبع الرمز بالسجل ويعيده للواجهة (للتجربة
//  قبل ربط البريد الحقيقي — لا يُفعَّل بالإنتاج أبداً).
// =====================================================================
const { ENV } = require('./_lib')

const SUBJECTS = {
  register: 'رمز تأكيد حسابك — مدللني',
  login: 'رمز تسجيل الدخول — مدللني',
  device: 'رمز تأكيد جهاز جديد — مدللني',
}
const TITLES = {
  register: 'أهلاً بك بمدللني — أكّد بريدك',
  login: 'رمز دخولك',
  device: 'جهاز جديد يطلب الوصول لحسابك',
}

function emailHtml(code, purpose) {
  const title = TITLES[purpose] || TITLES.login
  return '<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#f5f4f2;font-family:Arial,sans-serif">'
    + '<div style="max-width:460px;margin:24px auto;background:#fff;border:1px solid #e6e5e3;border-radius:12px;padding:28px;text-align:center">'
    + '<div style="font-size:22px;font-weight:800;color:#2c2c2b;margin-bottom:6px">مدللني</div>'
    + '<div style="font-size:15px;color:#7d7a75;margin-bottom:18px">' + title + '</div>'
    + '<div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#2783de;background:#e5f2fc;border-radius:10px;padding:14px 0;direction:ltr">' + code + '</div>'
    + '<div style="font-size:12.5px;color:#7d7a75;margin-top:18px;line-height:1.9">الرمز صالح 10 دقائق ويُستخدم مرة واحدة.<br>إذا ما طلبت هذا الرمز، تجاهل الرسالة — حسابك بأمان.</div>'
    + '</div></body></html>'
}

// يرجع { ok:true, dev? } أو يرمي Error بكود mail_not_configured / mail_failed
async function sendOtpEmail(email, code, purpose) {
  if (!ENV.MAIL_API_KEY || !ENV.MAIL_FROM) {
    if (ENV.MAIL_DEV_ECHO) { console.log('[DEV OTP]', email, code, purpose); return { ok: true, dev: true } }
    const e = new Error('mail_not_configured'); e.code = 'mail_not_configured'; throw e
  }
  const subject = SUBJECTS[purpose] || SUBJECTS.login
  const html = emailHtml(code, purpose)
  const provider = String(ENV.MAIL_PROVIDER || 'resend').toLowerCase()
  try {
    if (provider === 'resend') {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + ENV.MAIL_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: ENV.MAIL_FROM, to: [email], subject: subject, html: html }),
      })
      if (!r.ok) throw new Error('mail_failed')
    } else if (provider === 'sendgrid') {
      const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + ENV.MAIL_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalizations: [{ to: [{ email: email }] }], from: { email: ENV.MAIL_FROM }, subject: subject, content: [{ type: 'text/html', value: html }] }),
      })
      if (!r.ok) throw new Error('mail_failed')
    } else if (provider === 'brevo') {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': ENV.MAIL_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: { email: ENV.MAIL_FROM }, to: [{ email: email }], subject: subject, htmlContent: html }),
      })
      if (!r.ok) throw new Error('mail_failed')
    } else {
      const e = new Error('mail_not_configured'); e.code = 'mail_not_configured'; throw e
    }
    return { ok: true }
  } catch (err) {
    if (err && err.code) throw err
    const e = new Error('mail_failed'); e.code = 'mail_failed'; throw e
  }
}

module.exports = { sendOtpEmail }
