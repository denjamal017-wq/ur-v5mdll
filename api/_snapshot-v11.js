// مدللني v11 — حد الخصوصية النهائي لمخرجات الـ snapshot.
'use strict'

function sanitizedUser(user, self) {
  const out = Object.assign({}, user)
  delete out.pass
  delete out.passHash
  delete out.pass_hash
  delete out.email
  delete out.emailVerified
  delete out.email_verified
  delete out.authUserId
  delete out.auth_user_id
  delete out.devices
  delete out.lastIp
  delete out.last_ip
  if (!self) out.phone = ''
  if (out.provider) {
    out.provider = Object.assign({}, out.provider)
    if (!self) {
      delete out.provider.balance
      delete out.provider.settled
      delete out.provider.debt
      delete out.provider.rejectReason
      delete out.provider.adminNote
    }
  }
  return out
}

function sanitizeSnapshot(input, viewer) {
  const db = Object.assign({}, input || {})
  if (viewer && viewer.role === 'admin') return db

  const orders = Array.isArray(db.orders) ? db.orders : []
  const visibleOrders = !viewer
    ? []
    : viewer.role === 'customer'
      ? orders.filter((o) => o && o.customerId === viewer.id)
      : orders
  db.orders = visibleOrders

  const relatedCustomers = new Set()
  if (viewer && viewer.role === 'provider') {
    for (const order of visibleOrders) if (order && order.customerId) relatedCustomers.add(order.customerId)
  }
  db.users = (Array.isArray(db.users) ? db.users : [])
    .filter((user) => {
      if (!user) return false
      if (viewer && user.id === viewer.id) return true
      if (user.role === 'provider') {
        const verified = !user.provider || ['verified', 'approved'].includes(user.provider.verified)
        return user.status === 'active' && verified
      }
      return !!(viewer && viewer.role === 'provider' && relatedCustomers.has(user.id))
    })
    .map((user) => sanitizedUser(user, !!(viewer && user.id === viewer.id)))

  const visibleOrderIds = new Set(visibleOrders.map((o) => o && o.id).filter(Boolean))
  if (Array.isArray(db.messages)) db.messages = db.messages.filter((m) => visibleOrderIds.has(m.orderId || m.order_id))
  if (Array.isArray(db.notes)) db.notes = viewer ? db.notes.filter((n) => (n.userId || n.user_id) === viewer.id) : []
  if (Array.isArray(db.tickets)) db.tickets = viewer ? db.tickets.filter((t) => (t.userId || t.user_id) === viewer.id) : []
  if (Array.isArray(db.ticketMessages)) {
    const ticketIds = new Set((db.tickets || []).map((t) => t.id))
    db.ticketMessages = db.ticketMessages.filter((m) => ticketIds.has(m.ticketId || m.ticket_id))
  }
  db.audit = []
  if (Array.isArray(db.ledger)) db.ledger = viewer && viewer.role === 'provider' ? db.ledger.filter((x) => (x.providerId || x.provider_id) === viewer.id) : []
  if (Array.isArray(db.payouts)) db.payouts = viewer && viewer.role === 'provider' ? db.payouts.filter((x) => (x.providerId || x.provider_id) === viewer.id) : []
  if (Array.isArray(db.security)) db.security = viewer ? db.security.filter((x) => (x.profileId || x.profile_id) === viewer.id) : []
  if (Array.isArray(db.devices)) db.devices = viewer ? db.devices.filter((x) => (x.profileId || x.profile_id) === viewer.id) : []
  return db
}

module.exports = { sanitizeSnapshot, sanitizedUser }
