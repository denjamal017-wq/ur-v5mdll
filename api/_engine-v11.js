// مدللني v11 — طبقة أمان فوق محرك الأعمال القديم.
'use strict'
const legacy = require('./_engine')
const { dal } = require('./_lib')

function fail(status, code) {
  const error = new Error(code)
  error.status = status
  error.code = code
  throw error
}

async function securityEvent(profileId, kind, meta) {
  try {
    await dal.insert('mdllni_security_events', {
      profile_id: profileId || null,
      kind,
      meta: meta || {},
      ip: '',
      created_at: new Date().toISOString(),
    })
  } catch (_) {}
}

async function notify(userId, icon, body, orderId) {
  try {
    await dal.insert('mdllni_notifications', {
      user_id: userId,
      icon,
      body,
      order_id: orderId || null,
      read: false,
      created_at: new Date().toISOString(),
    })
  } catch (_) {}
}

async function runAction(actor, action, payload) {
  payload = payload || {}
  if (['changePassword', 'adjustDebt', 'adminAdjustDebt', 'debtAdjustment'].includes(action)) {
    fail(400, action === 'changePassword' ? 'password_change_requires_otp' : 'financial_adjustment_requires_review')
  }

  if (action === 'providerDrop') {
    const order = await dal.find('mdllni_orders', { id: payload.orderId })
    if (order && order.provider_id === actor.id && order.status === 'started') {
      await securityEvent(actor.id, 'started_order_drop_blocked', { order_id: order.id })
      fail(409, 'started_drop_requires_dispute')
    }
  }

  if (action === 'advanceOrder') {
    const order = await dal.find('mdllni_orders', { id: payload.orderId })
    if (order && order.status === 'started') {
      const result = await dal.rpc('mdllni_complete_order', { p_order: order.id, p_actor: actor.id })
      await notify(order.customer_id, '✅', 'اكتملت الخدمة للطلب ' + order.id + '. إذا عندك اعتراض افتح نزاع فوراً.', order.id)
      await notify(order.provider_id, '🧾', 'تم توثيق إكمال الطلب ' + order.id + ' والعمولة والذمة ذرياً.', order.id)
      return result || {}
    }
  }

  if (action === 'confirmSettlement') {
    const payoutId = String(payload.payoutId || '')
    if (!payoutId) fail(400, 'payout_unavailable')
    const result = await dal.rpc('mdllni_confirm_settlement', { p_payout: payoutId, p_actor: actor.id })
    if (result && result.providerId) await notify(result.providerId, '✅', 'تم تأكيد السداد ' + payoutId + ' وتحديث الذمة ذرياً.', null)
    return result || {}
  }

  return await legacy.runAction(actor, action, payload)
}

module.exports = { snapshot: legacy.snapshot, runAction, provisionAdmin: legacy.provisionAdmin }
