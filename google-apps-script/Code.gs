/**
 * GBTT — comprehensive web app endpoint (email + Google Calendar)
 *
 * Setup:
 * 1. Create the Apps Script project (standalone is fine) and paste this file.
 * 2. Project settings → Script properties:
 *    NOTIFY_EMAIL, CALENDAR_ID, FUNCTIONS_WEBHOOK_SECRET
 * 3. Optional: AUDIT_SPREADSHEET_ID — the id of a Sheet to write audit tabs
 *    to. Leave it unset to run without auditing; it never blocks a send.
 * 4. Deploy → New deployment → Web app (Execute as: Me, Anyone).
 * 5. Copy the Web app URL into VITE_FORM_ENDPOINT (site + apps env).
 *
 * POST JSON (Content-Type: text/plain;charset=utf-8):
 *   Public (no webhook secret):
 *     { action: "enquiry", name, email, phone, message, source }
 *   Server (webhookSecret in JSON body — Apps Script web apps cannot read HTTP headers):
 *     { action: "sendInvite", webhookSecret, email, name, inviteLink, planName? }
 *     { action: "sendSubscriberBroadcast", webhookSecret, subject, body, recipients[], testMode? }
 *     { action: "sendPlanChangeNotice", webhookSecret, memberName, memberEmail, currentPlan, requestedPlan, notes? }
 *     { action: "sendTransferNotice", webhookSecret, memberName, memberEmail, fromSession, toSession, notes? }
 *     { action: "sendPaymentReminder", webhookSecret, memberName, memberEmail, amountDue, dueDate?, paymentInstructions?, balanceNote? }
 *     { action: "sendGuestPass", webhookSecret, guestName, guestEmail, passCode, sessionLabel, expiresAt?, notes? }
 *     { action: "sendBookingInvite", webhookSecret, memberEmail, memberName, sessionId, weekStart, dayLabel, time, className, venue?, durationMinutes? }
 *     { action: "sendBookingCancellation", webhookSecret, memberEmail, memberName, sessionId, weekStart, dayLabel, time, className, sequence? }
 *     { action: "calendarUpsertSession", webhookSecret, sessionId, weekStart, dayLabel, time, className, ... }
 *     { action: "calendarDeleteSession", webhookSecret, calendarEventId?, sessionId? }
 *     { action: "calendarGetSubscribeUrl", webhookSecret }
 *     { action: "calendarSyncMemberSlots", webhookSecret, calendarEventId?, sessionId?, memberSlots[] }
 */

const TIMEZONE = 'Pacific/Auckland'

const SHEET_ENQUIRIES = 'Submissions'
const SHEET_INVITES = 'Invites'
const SHEET_BROADCASTS = 'Broadcasts'
const SHEET_PLAN_CHANGES = 'PlanChanges'
const SHEET_TRANSFERS = 'Transfers'
const SHEET_PAYMENT_REMINDERS = 'PaymentReminders'
const SHEET_GUEST_PASSES = 'GuestPasses'
const SHEET_CALENDAR_UPSERTS = 'CalendarUpserts'
const SHEET_CALENDAR_DELETES = 'CalendarDeletes'
const SHEET_CALENDAR_SUBSCRIBE = 'CalendarSubscribe'
const SHEET_CALENDAR_MEMBER_SLOTS = 'CalendarMemberSlots'
const SHEET_BOOKING_INVITES = 'BookingInvites'

// Anything not listed here must present the webhook secret. Keep this list as
// short as the site allows: a public action is an open relay for whatever it
// does, and `enquiry` only mails Tom's own inbox, never an address supplied by
// the caller.
const PUBLIC_ACTIONS = ['enquiry']
const DEFAULT_SESSION_MINUTES = 60
const WEEKDAY_OFFSET = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  )
}

function prop_(key, fallback) {
  const value = PropertiesService.getScriptProperties().getProperty(key)
  if (value && String(value).trim()) return String(value).trim()
  return fallback || ''
}

function notifyEmail_() {
  return prop_('NOTIFY_EMAIL', 'Tom.GBTT@gmail.com')
}

function calendarId_() {
  return prop_('CALENDAR_ID', '')
}

function webhookSecretExpected_() {
  return prop_('FUNCTIONS_WEBHOOK_SECRET', '')
}

function stamp_() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
}

/**
 * The audit spreadsheet, or null when there is none.
 *
 * getActiveSpreadsheet() only returns a spreadsheet for a container-bound
 * script. This project is deployed standalone, so set AUDIT_SPREADSHEET_ID to
 * the id of a Sheet you want the audit tabs written to. Without it, auditing
 * is simply off — it must never be a precondition for sending mail.
 */
function auditSpreadsheet_() {
  const id = prop_('AUDIT_SPREADSHEET_ID', '')
  if (id) return SpreadsheetApp.openById(id)
  return SpreadsheetApp.getActiveSpreadsheet()
}

function getSheet_(name, headerRow) {
  const ss = auditSpreadsheet_()
  if (!ss) return null
  let sheet = ss.getSheetByName(name)
  if (!sheet) {
    sheet = ss.insertSheet(name)
    sheet.appendRow(headerRow)
  }
  return sheet
}

/** Returns whether the row was recorded. Never throws: auditing is optional. */
function auditLog_(sheetName, headerRow, row) {
  try {
    const sheet = getSheet_(sheetName, headerRow)
    if (!sheet) return false
    sheet.appendRow(row)
    return true
  } catch (err) {
    console.warn('auditLog_ failed for ' + sheetName + ': ' + err)
    return false
  }
}

/**
 * Web app deployments do not expose custom HTTP headers to doPost.
 * Accept webhookSecret in JSON body (primary) or query string for curl tests.
 */
function webhookSecretFromRequest_(e, data) {
  if (data && data.webhookSecret) return String(data.webhookSecret).trim()
  if (data && data['X-GBTT-Webhook-Secret']) return String(data['X-GBTT-Webhook-Secret']).trim()
  if (e && e.parameter && e.parameter.webhookSecret) return String(e.parameter.webhookSecret).trim()
  return ''
}

function verifyWebhook_(e, data, action) {
  if (PUBLIC_ACTIONS.indexOf(action) >= 0) return null

  const expected = webhookSecretExpected_()
  if (!expected) return 'FUNCTIONS_WEBHOOK_SECRET not configured'

  const provided = webhookSecretFromRequest_(e, data)
  if (!provided || provided !== expected) return 'Unauthorized'

  return null
}

function requireCalendar_() {
  const id = calendarId_()
  if (!id) return { error: 'CALENDAR_ID script property not configured' }
  const cal = CalendarApp.getCalendarById(id)
  if (!cal) return { error: 'Calendar not found for CALENDAR_ID' }
  return { calendar: cal, calendarId: id }
}

function parseAucklandDateTime_(dateStr, timeStr) {
  const time = String(timeStr || '00:00').trim()
  const normalized = time.length === 5 ? time + ':00' : time
  return Utilities.parseDate(dateStr + ' ' + normalized, TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
}

function sessionStartDate_(weekStart, dayLabel, time) {
  const offset = WEEKDAY_OFFSET[String(dayLabel || '').trim()] || 0
  const parts = String(weekStart || '').split('-').map(Number)
  if (parts.length < 3 || !parts[0]) throw new Error('weekStart must be YYYY-MM-DD')

  const base = new Date(parts[0], parts[1] - 1, parts[2])
  base.setDate(base.getDate() + offset)
  const dateStr = Utilities.formatDate(base, TIMEZONE, 'yyyy-MM-dd')
  return parseAucklandDateTime_(dateStr, time)
}

function rosterLines_(roster) {
  if (!roster || !roster.length) return []
  return roster.map(function (entry) {
    if (typeof entry === 'string') return entry.trim()
    const name = String(entry.displayName || entry.name || '').trim()
    const kind = String(entry.kind || '').trim()
    const suffix = kind === 'guest' ? ' (guest)' : ''
    return name ? name + suffix : ''
  }).filter(Boolean)
}

function formatSessionEvent_(session) {
  const className = String(session.className || session.classTypeName || 'GBTT class').trim()
  const instructor = String(session.instructor || session.instructorName || 'Tom').trim()
  const venue = String(session.venue || session.venueName || 'Rec Park Centre, Tākaka').trim()
  const cap = session.cap != null ? Number(session.cap) : null
  const booked = session.bookedCount != null ? Number(session.bookedCount) : null
  const fillLabel =
    session.fillLabel ||
    (booked != null && cap != null ? booked + '/' + cap : booked != null ? String(booked) : '')

  const title = fillLabel ? className + ' · ' + fillLabel + ' · GBTT' : className + ' · GBTT'

  const lines = [
    'Class: ' + className,
    'Instructor: ' + instructor,
    'Venue: ' + venue,
  ]

  if (session.dayLabel && session.time) {
    lines.push('When: ' + session.dayLabel + ' ' + session.time)
  }
  if (session.weekStart) lines.push('Week start: ' + session.weekStart)
  if (fillLabel) lines.push('Fill: ' + fillLabel)

  const roster = rosterLines_(session.roster)
  if (roster.length) {
    lines.push('', 'Roster:')
    roster.forEach(function (line) {
      lines.push('• ' + line)
    })
  }

  if (session.memberSlots && session.memberSlots.length) {
    lines.push('', 'Member weekly slots:')
    session.memberSlots.forEach(function (slot) {
      if (typeof slot === 'string') {
        lines.push('• ' + slot)
      } else {
        const label = String(slot.slotLabel || slot.label || '').trim()
        const member = String(slot.memberName || slot.name || '').trim()
        const when = [slot.dayLabel, slot.time].filter(Boolean).join(' ')
        lines.push('• ' + [member, label || when].filter(Boolean).join(' — '))
      }
    })
  }

  if (session.sessionId) lines.push('', 'Session ID: ' + session.sessionId)
  if (session.notes) lines.push('', String(session.notes))

  return {
    title: title,
    description: lines.join('\n'),
    location: venue,
  }
}

function formatMemberSlotsBlock_(memberSlots) {
  if (!memberSlots || !memberSlots.length) return ''
  const lines = ['Member weekly slots:']
  memberSlots.forEach(function (slot) {
    if (typeof slot === 'string') {
      lines.push('• ' + slot)
    } else {
      const member = String(slot.memberName || slot.name || '').trim()
      const label = String(slot.slotLabel || slot.label || '').trim()
      const when = [slot.dayLabel, slot.time].filter(Boolean).join(' ')
      lines.push('• ' + [member, label || when].filter(Boolean).join(' — '))
    }
  })
  return lines.join('\n')
}

function mergeDescriptionWithMemberSlots_(existingDescription, memberSlotsBlock) {
  const existing = String(existingDescription || '')
  const marker = 'Member weekly slots:'
  const idx = existing.indexOf(marker)
  const base = idx >= 0 ? existing.substring(0, idx).trim() : existing.trim()
  if (!memberSlotsBlock) return base
  if (!base) return memberSlotsBlock
  return base + '\n\n' + memberSlotsBlock
}

function findEventBySessionId_(calendar, sessionId, weekStart) {
  if (!sessionId) return null
  const needle = 'Session ID: ' + sessionId
  let start
  let end

  if (weekStart) {
    start = sessionStartDate_(weekStart, 'Mon', '00:00')
    end = new Date(start.getTime())
    end.setDate(end.getDate() + 7)
  } else {
    start = new Date()
    start.setDate(start.getDate() - 14)
    end = new Date()
    end.setDate(end.getDate() + 21)
  }

  const events = calendar.getEvents(start, end)
  for (let i = 0; i < events.length; i++) {
    const desc = events[i].getDescription() || ''
    if (desc.indexOf(needle) >= 0) return events[i]
  }
  return null
}

function calendarSubscribeInfo_(calendarId) {
  const encoded = encodeURIComponent(calendarId)
  return {
    calendarId: calendarId,
    publicUrl: 'https://calendar.google.com/calendar/embed?src=' + encoded,
    icsUrl: 'https://calendar.google.com/calendar/ical/' + encoded + '/public/basic.ics',
    htmlLink: 'https://calendar.google.com/calendar/u/0?cid=' + encoded,
  }
}

function eventHtmlLink_(event, calendarId) {
  const raw = event.getId() + ' ' + calendarId
  const eid = Utilities.base64Encode(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return 'https://www.google.com/calendar/event?eid=' + eid
}

function sendBulkEmail_(recipients, subject, body) {
  const unique = []
  const seen = {}
  recipients.forEach(function (email) {
    const normalized = String(email || '').trim().toLowerCase()
    if (!normalized || seen[normalized]) return
    seen[normalized] = true
    unique.push(normalized)
  })

  if (!unique.length) return 0

  const chunkSize = 50
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    MailApp.sendEmail({
      to: notifyEmail_(),
      bcc: chunk.join(','),
      subject: subject,
      body: body,
    })
  }

  return unique.length
}

function doGet() {
  return jsonResponse({
    ok: true,
    service: 'GBTT web endpoint',
    timezone: TIMEZONE,
    actions: [
      'enquiry',
      'sendInvite',
      'sendSubscriberBroadcast',
      'sendPlanChangeNotice',
      'sendTransferNotice',
      'sendPaymentReminder',
      'sendGuestPass',
      'sendBookingInvite',
      'sendBookingCancellation',
      'calendarUpsertSession',
      'calendarDeleteSession',
      'calendarGetSubscribeUrl',
      'calendarSyncMemberSlots',
    ],
    publicActions: PUBLIC_ACTIONS,
  })
}

function handleEnquiry_(data) {
  const name = String(data.name || '').trim()
  const email = String(data.email || '').trim()
  const phone = String(data.phone || '').trim()
  const message = String(data.message || '').trim()
  const source = String(data.source || 'website').trim()

  if (!name || !email || !message) {
    return jsonResponse({ ok: false, error: 'Missing required fields' })
  }

  MailApp.sendEmail({
    to: notifyEmail_(),
    subject: 'GBTT enquiry — ' + name,
    body:
      'Name: ' +
      name +
      '\nEmail: ' +
      email +
      '\nPhone: ' +
      phone +
      '\nSource: ' +
      source +
      '\n\n' +
      message,
  })

  auditLog_(SHEET_ENQUIRIES, ['Timestamp', 'Name', 'Email', 'Phone', 'Message', 'Source'], [
    stamp_(),
    name,
    email,
    phone,
    message,
    source,
  ])

  return jsonResponse({ ok: true })
}

function handleSendInvite_(data) {
  const name = String(data.name || '').trim()
  const email = String(data.email || '').trim().toLowerCase()
  const inviteLink = String(data.inviteLink || data.resetLink || '').trim()
  const planName = String(data.planName || data.planId || '').trim()

  if (!name || !email || !inviteLink) {
    return jsonResponse({ ok: false, error: 'name, email, and inviteLink required.' })
  }

  const planLine = planName ? '\nPlan: ' + planName + '\n' : ''

  MailApp.sendEmail({
    to: email,
    subject: 'Set your GBTT member password',
    body:
      'Hi ' +
      name +
      ',\n\nTom has set up your Golden Bay Team Training member account.' +
      planLine +
      '\nSet your password here:\n\n' +
      inviteLink +
      '\n\nOnce you are in, book your weekly classes at gbtt.co.nz.\n\nSee you at Rec Park Centre!\n\n— Tom · Golden Bay Team Training',
  })

  auditLog_(SHEET_INVITES, ['Timestamp', 'Name', 'Email', 'Plan', 'InviteLink'], [
    stamp_(),
    name,
    email,
    planName,
    inviteLink,
  ])

  return jsonResponse({ ok: true })
}

function handleSendSubscriberBroadcast_(data) {
  const subject = String(data.subject || '').trim()
  const body = String(data.body || '').trim()
  const recipients = Array.isArray(data.recipients) ? data.recipients : []
  const testMode = Boolean(data.testMode)

  if (!subject || !body) {
    return jsonResponse({ ok: false, error: 'subject and body required.' })
  }

  const targetRecipients = testMode ? [notifyEmail_()] : recipients
  const count = sendBulkEmail_(targetRecipients, subject, body)

  if (!count) {
    return jsonResponse({ ok: false, error: 'No valid recipients.' })
  }

  auditLog_(SHEET_BROADCASTS, ['Timestamp', 'Subject', 'RecipientCount', 'TestMode', 'BodyPreview'], [
    stamp_(),
    subject,
    count,
    testMode ? 'yes' : 'no',
    body.substring(0, 500),
  ])

  return jsonResponse({ ok: true, recipientCount: count, testMode: testMode })
}

function handleSendPlanChangeNotice_(data) {
  const memberName = String(data.memberName || data.name || '').trim()
  const memberEmail = String(data.memberEmail || data.email || '').trim()
  const currentPlan = String(data.currentPlan || '').trim()
  const requestedPlan = String(data.requestedPlan || data.newPlan || '').trim()
  const notes = String(data.notes || '').trim()

  if (!memberName || !memberEmail || !requestedPlan) {
    return jsonResponse({ ok: false, error: 'memberName, memberEmail, and requestedPlan required.' })
  }

  const body =
    'Member: ' +
    memberName +
    ' (' +
    memberEmail +
    ')\nCurrent plan: ' +
    (currentPlan || '—') +
    '\nRequested plan: ' +
    requestedPlan +
    (notes ? '\n\nNotes:\n' + notes : '') +
    '\n\nConfirm payment in Class Board once bank transfer is received.'

  MailApp.sendEmail({
    to: notifyEmail_(),
    subject: 'GBTT plan change request — ' + memberName,
    body: body,
  })

  auditLog_(
    SHEET_PLAN_CHANGES,
    ['Timestamp', 'MemberName', 'MemberEmail', 'CurrentPlan', 'RequestedPlan', 'Notes'],
    [stamp_(), memberName, memberEmail, currentPlan, requestedPlan, notes],
  )

  return jsonResponse({ ok: true })
}

function handleSendTransferNotice_(data) {
  const memberName = String(data.memberName || data.name || '').trim()
  const memberEmail = String(data.memberEmail || data.email || '').trim()
  const fromSession = String(data.fromSession || data.from || '').trim()
  const toSession = String(data.toSession || data.to || '').trim()
  const notes = String(data.notes || '').trim()

  if (!memberName || !memberEmail || !fromSession || !toSession) {
    return jsonResponse({
      ok: false,
      error: 'memberName, memberEmail, fromSession, and toSession required.',
    })
  }

  const body =
    'Hi ' +
    memberName +
    ',\n\nYour GBTT class reschedule is confirmed.\n\nFrom: ' +
    fromSession +
    '\nTo: ' +
    toSession +
    (notes ? '\n\n' + notes : '') +
    '\n\nSee you at Rec Park Centre!\n\n— Tom · GBTT'

  MailApp.sendEmail({
    to: memberEmail,
    subject: 'GBTT class reschedule confirmed',
    body: body,
  })

  auditLog_(
    SHEET_TRANSFERS,
    ['Timestamp', 'MemberName', 'MemberEmail', 'FromSession', 'ToSession', 'Notes'],
    [stamp_(), memberName, memberEmail, fromSession, toSession, notes],
  )

  return jsonResponse({ ok: true })
}

function handleSendPaymentReminder_(data) {
  const memberName = String(data.memberName || data.name || '').trim()
  const memberEmail = String(data.memberEmail || data.email || '').trim()
  const amountDue = String(data.amountDue || '').trim()
  const dueDate = String(data.dueDate || '').trim()
  const paymentInstructions = String(data.paymentInstructions || '').trim()
  const balanceNote = String(data.balanceNote || '').trim()

  if (!memberName || !memberEmail || !amountDue) {
    return jsonResponse({ ok: false, error: 'memberName, memberEmail, and amountDue required.' })
  }

  const dueLine = dueDate ? '\nDue: ' + dueDate : ''
  const balanceLine = balanceNote ? '\n' + balanceNote : ''
  const payLine = paymentInstructions
    ? '\n\nPayment instructions:\n' + paymentInstructions
    : '\n\nPay by bank transfer or cash at Rec Park before class — Tom will mark your account paid once received.'

  MailApp.sendEmail({
    to: memberEmail,
    subject: 'GBTT payment reminder',
    body:
      'Hi ' +
      memberName +
      ',\n\nThis is a friendly reminder about your GBTT membership payment.\n\nAmount due: ' +
      amountDue +
      dueLine +
      balanceLine +
      payLine +
      '\n\nQuestions? Reply to this email or contact Tom.\n\n— Tom · GBTT',
  })

  MailApp.sendEmail({
    to: notifyEmail_(),
    subject: 'GBTT payment reminder sent — ' + memberName,
    body: 'Reminder sent to ' + memberName + ' (' + memberEmail + ') for ' + amountDue,
  })

  auditLog_(
    SHEET_PAYMENT_REMINDERS,
    ['Timestamp', 'MemberName', 'MemberEmail', 'AmountDue', 'DueDate', 'BalanceNote'],
    [stamp_(), memberName, memberEmail, amountDue, dueDate, balanceNote],
  )

  return jsonResponse({ ok: true })
}

function handleSendGuestPass_(data) {
  const guestName = String(data.guestName || data.name || '').trim()
  const guestEmail = String(data.guestEmail || data.email || '').trim().toLowerCase()
  const passCode = String(data.passCode || data.code || '').trim()
  const sessionLabel = String(data.sessionLabel || data.session || '').trim()
  const expiresAt = String(data.expiresAt || '').trim()
  const notes = String(data.notes || '').trim()

  if (!guestName || !guestEmail || !passCode || !sessionLabel) {
    return jsonResponse({
      ok: false,
      error: 'guestName, guestEmail, passCode, and sessionLabel required.',
    })
  }

  const expiryLine = expiresAt ? '\nExpires: ' + expiresAt : ''
  const notesLine = notes ? '\n\n' + notes : ''

  MailApp.sendEmail({
    to: guestEmail,
    subject: 'Your complimentary GBTT session',
    body:
      'Hi ' +
      guestName +
      ',\n\nYou have a complimentary Golden Bay Team Training session.\n\nSession: ' +
      sessionLabel +
      '\nGuest pass code: ' +
      passCode +
      expiryLine +
      '\n\nShow this code to Tom at Rec Park Centre.\n' +
      notesLine +
      '\n\nEnjoy the class!\n\n— Tom · GBTT',
  })

  MailApp.sendEmail({
    to: notifyEmail_(),
    subject: 'GBTT guest pass issued — ' + guestName,
    body:
      'Guest pass ' +
      passCode +
      ' for ' +
      guestName +
      ' (' +
      guestEmail +
      ')\nSession: ' +
      sessionLabel,
  })

  auditLog_(
    SHEET_GUEST_PASSES,
    ['Timestamp', 'GuestName', 'GuestEmail', 'PassCode', 'SessionLabel', 'ExpiresAt', 'Notes'],
    [stamp_(), guestName, guestEmail, passCode, sessionLabel, expiresAt, notes],
  )

  return jsonResponse({ ok: true })
}

/**
 * Per-member calendar invites.
 *
 * Members are deliberately NOT added as guests on the shared class event.
 * Guest lists are visible to every other guest, which would leak the roster
 * and override each member's showNameToClassmates preference, and any edit to
 * a guest-bearing event emails everyone on it. Sending each member their own
 * VEVENT keeps rosters private and means attendance counts can change all day
 * without generating a single email.
 */

function icsEscape_(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** UTC stamps avoid shipping VTIMEZONE blocks for Pacific/Auckland DST. */
function icsStamp_(date) {
  return Utilities.formatDate(date, 'UTC', "yyyyMMdd'T'HHmmss'Z'")
}

/** RFC 5545 caps content lines at 75 octets; continuations start with a space. */
function icsFold_(line) {
  if (line.length <= 73) return line
  let out = line.slice(0, 73)
  let rest = line.slice(73)
  while (rest.length > 72) {
    out += '\r\n ' + rest.slice(0, 72)
    rest = rest.slice(72)
  }
  return out + '\r\n ' + rest
}

/**
 * Stable per (session, member) UID so a later CANCEL updates the same event
 * the REQUEST created rather than adding a duplicate.
 */
function bookingUid_(sessionId, memberEmail) {
  return uidFromKey_(String(sessionId) + '|' + String(memberEmail || '').toLowerCase())
}

/**
 * A weekly lock is one recurring event, not one event per week, so it needs a
 * UID of its own: keyed on the slot rather than any single session, the CANCEL
 * sent when the lock is released clears the whole series.
 */
function slotUid_(slotId, memberEmail) {
  return uidFromKey_('slot|' + String(slotId) + '|' + String(memberEmail || '').toLowerCase())
}

function uidFromKey_(key) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, key)
  const hex = digest
    .map(function (byte) {
      const value = (byte < 0 ? byte + 256 : byte).toString(16)
      return value.length === 1 ? '0' + value : value
    })
    .join('')
  return 'gbtt-' + hex + '@gbtt.co.nz'
}

function buildBookingIcs_(opts) {
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Golden Bay Team Training//Bookings//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:' + opts.method,
    'BEGIN:VEVENT',
    'UID:' + opts.uid,
    'SEQUENCE:' + opts.sequence,
    'DTSTAMP:' + icsStamp_(new Date()),
    'DTSTART:' + icsStamp_(opts.start),
    'DTEND:' + icsStamp_(opts.end),
  ]

  /*
   * A weekly lock is one recurring event. Sending it as a series is what keeps
   * a season-long lock to a single email instead of one per week.
   */
  const weeklyCount = Number(opts.weeklyCount || 0)
  if (weeklyCount > 1) {
    lines.push('RRULE:FREQ=WEEKLY;COUNT=' + weeklyCount)
  }

  lines.push(
    'SUMMARY:' + icsEscape_(opts.summary),
    'DESCRIPTION:' + icsEscape_(opts.description),
    'LOCATION:' + icsEscape_(opts.location),
    'STATUS:' + (opts.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'),
    'ORGANIZER;CN=Golden Bay Team Training:mailto:' + opts.organizerEmail,
    'ATTENDEE;CN=' +
      icsEscape_(opts.attendeeName) +
      ';RSVP=FALSE;PARTSTAT=ACCEPTED:mailto:' +
      opts.attendeeEmail,
    'END:VEVENT',
    'END:VCALENDAR',
  )

  return lines.map(icsFold_).join('\r\n')
}

const MANAGE_BOOKINGS_URL = 'https://gbtt.co.nz/app/fitness/studioflow/'

/**
 * The .ics and the few strings the covering email needs.
 *
 * `slotId` switches this from a single class to the recurring series a weekly
 * lock creates; `weeklyCount` is how many of those weeks were taken.
 */
function bookingIcsPayload_(data, method) {
  const memberEmail = String(data.memberEmail || '').trim()
  const memberName = String(data.memberName || '').trim()
  const sessionId = String(data.sessionId || '').trim()
  const slotId = String(data.slotId || '').trim()
  const weekStart = String(data.weekStart || '').trim()
  const dayLabel = String(data.dayLabel || '').trim()
  const time = String(data.time || '').trim()
  const weeklyCount = Number(data.weeklyCount || 0)

  if (!memberEmail || (!sessionId && !slotId) || !weekStart || !dayLabel || !time) {
    return {
      error: 'memberEmail, sessionId or slotId, weekStart, dayLabel and time are required.',
    }
  }

  const className = String(data.className || 'GBTT class').trim()
  const venue = String(data.venue || 'Rec Park Centre, Tākaka').trim()
  const instructor = String(data.instructor || 'Tom').trim()
  const durationMinutes = Number(data.durationMinutes || DEFAULT_SESSION_MINUTES)

  const start = sessionStartDate_(weekStart, dayLabel, time)
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)

  const ics = buildBookingIcs_({
    method: method,
    uid: slotId ? slotUid_(slotId, memberEmail) : bookingUid_(sessionId, memberEmail),
    sequence: Number(data.sequence || (method === 'CANCEL' ? 1 : 0)),
    start: start,
    end: end,
    weeklyCount: slotId ? weeklyCount : 0,
    summary: className + ' · GBTT',
    description:
      'Instructor: ' + instructor + '\nVenue: ' + venue + '\nManage your booking at ' + MANAGE_BOOKINGS_URL,
    location: venue,
    organizerEmail: notifyEmail_(),
    attendeeEmail: memberEmail,
    attendeeName: memberName || memberEmail,
  })

  return {
    ics: ics,
    memberEmail: memberEmail,
    memberName: memberName,
    sessionId: sessionId || slotId,
    className: className,
    venue: venue,
    start: start,
    when: dayLabel + ' ' + time + (slotId && weeklyCount > 1 ? ', weekly' : ''),
  }
}

/**
 * One class, one calendar invite.
 *
 * The body stays to the single event the member's booking actually changed —
 * they get their own class, not the studio's whole timetable.
 */
function sendBookingEmail_(data, method, auditAction) {
  const payload = bookingIcsPayload_(data, method)
  if (payload.error) return jsonResponse({ ok: false, error: payload.error })

  const cancelling = method === 'CANCEL'
  const summary = payload.className + ' — ' + payload.when + ' at ' + payload.venue

  MailApp.sendEmail({
    to: payload.memberEmail,
    subject: (cancelling ? 'Cancelled: ' : 'Booked: ') + payload.className + ' — ' + payload.when,
    body:
      'Hi ' +
      (payload.memberName || 'there') +
      ',\n\n' +
      (cancelling ? 'Cancelled: ' : 'Booked: ') +
      summary +
      '.\n\n' +
      (cancelling
        ? 'The attached update removes it from your calendar.'
        : 'The attached invite adds it to your calendar.') +
      '\n\n' +
      MANAGE_BOOKINGS_URL +
      '\n\n— Tom · Golden Bay Team Training',
    attachments: [
      {
        fileName: cancelling ? 'gbtt-cancellation.ics' : 'gbtt-booking.ics',
        mimeType: 'text/calendar; method=' + method,
        content: payload.ics,
      },
    ],
  })

  auditLog_(
    SHEET_BOOKING_INVITES,
    ['Timestamp', 'Action', 'MemberEmail', 'SessionId', 'Class', 'When'],
    [stamp_(), auditAction, payload.memberEmail, payload.sessionId, payload.className, payload.when],
  )

  return jsonResponse({ ok: true, sessionId: payload.sessionId })
}

/** Member booked a single class — email them a calendar invite for their own diary. */
function handleSendBookingInvite_(data) {
  return sendBookingEmail_(data, 'REQUEST', 'invite')
}

/** Member cancelled a single class — send a CANCEL so it leaves their diary. */
function handleSendBookingCancellation_(data) {
  return sendBookingEmail_(data, 'CANCEL', 'cancel')
}

/**
 * Member locked a recurring weekly slot.
 *
 * One email carrying one repeating event, rather than the one-per-week the
 * roster trigger would otherwise send for the same single action.
 */
function handleSendSlotInvite_(data) {
  return sendBookingEmail_(data, 'REQUEST', 'slot-invite')
}

/** Member released a weekly slot — one CANCEL clears the whole series. */
function handleSendSlotCancellation_(data) {
  return sendBookingEmail_(data, 'CANCEL', 'slot-cancel')
}

function handleCalendarUpsertSession_(data) {
  const calResult = requireCalendar_()
  if (calResult.error) return jsonResponse({ ok: false, error: calResult.error })

  const sessionId = String(data.sessionId || '').trim()
  const weekStart = String(data.weekStart || '').trim()
  const dayLabel = String(data.dayLabel || '').trim()
  const time = String(data.time || '').trim()
  const calendarEventId = String(data.calendarEventId || '').trim()
  const durationMinutes = Number(data.durationMinutes || DEFAULT_SESSION_MINUTES)

  if (!sessionId || !weekStart || !dayLabel || !time) {
    return jsonResponse({
      ok: false,
      error: 'sessionId, weekStart, dayLabel, and time required.',
    })
  }

  const formatted = formatSessionEvent_(data)
  const start = sessionStartDate_(weekStart, dayLabel, time)
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)

  let event = null
  if (calendarEventId) {
    try {
      event = calResult.calendar.getEventById(calendarEventId)
    } catch (err) {
      event = null
    }
  }
  if (!event) {
    event = findEventBySessionId_(calResult.calendar, sessionId, weekStart)
  }

  if (event) {
    event.setTitle(formatted.title)
    event.setDescription(formatted.description)
    event.setLocation(formatted.location)
    event.setTime(start, end)
  } else {
    event = calResult.calendar.createEvent(formatted.title, start, end, {
      description: formatted.description,
      location: formatted.location,
    })
  }

  const eventId = event.getId()
  const htmlLink = eventHtmlLink_(event, calResult.calendarId)

  auditLog_(
    SHEET_CALENDAR_UPSERTS,
    ['Timestamp', 'SessionId', 'CalendarEventId', 'WeekStart', 'Title', 'Start'],
    [stamp_(), sessionId, eventId, weekStart, formatted.title, start.toISOString()],
  )

  return jsonResponse({
    ok: true,
    sessionId: sessionId,
    calendarEventId: eventId,
    htmlLink: htmlLink,
    title: formatted.title,
  })
}

function handleCalendarDeleteSession_(data) {
  const calResult = requireCalendar_()
  if (calResult.error) return jsonResponse({ ok: false, error: calResult.error })

  const calendarEventId = String(data.calendarEventId || '').trim()
  const sessionId = String(data.sessionId || '').trim()
  const weekStart = String(data.weekStart || '').trim()

  let event = null
  if (calendarEventId) {
    try {
      event = calResult.calendar.getEventById(calendarEventId)
    } catch (err) {
      event = null
    }
  }
  if (!event && sessionId) {
    event = findEventBySessionId_(calResult.calendar, sessionId, weekStart)
  }

  if (!event) {
    return jsonResponse({ ok: false, error: 'Calendar event not found.' })
  }

  const deletedId = event.getId()
  const deletedTitle = event.getTitle()
  event.deleteEvent()

  auditLog_(SHEET_CALENDAR_DELETES, ['Timestamp', 'CalendarEventId', 'SessionId', 'Title'], [
    stamp_(),
    deletedId,
    sessionId,
    deletedTitle,
  ])

  return jsonResponse({ ok: true, calendarEventId: deletedId, sessionId: sessionId })
}

function handleCalendarGetSubscribeUrl_(data) {
  const calResult = requireCalendar_()
  if (calResult.error) return jsonResponse({ ok: false, error: calResult.error })

  const info = calendarSubscribeInfo_(calResult.calendarId)

  auditLog_(SHEET_CALENDAR_SUBSCRIBE, ['Timestamp', 'CalendarId', 'IcsUrl'], [
    stamp_(),
    info.calendarId,
    info.icsUrl,
  ])

  return jsonResponse(Object.assign({ ok: true }, info))
}

function handleCalendarSyncMemberSlots_(data) {
  const calResult = requireCalendar_()
  if (calResult.error) return jsonResponse({ ok: false, error: calResult.error })

  const calendarEventId = String(data.calendarEventId || '').trim()
  const sessionId = String(data.sessionId || '').trim()
  const weekStart = String(data.weekStart || '').trim()
  const memberSlots = Array.isArray(data.memberSlots) ? data.memberSlots : []

  if (!memberSlots.length) {
    return jsonResponse({ ok: false, error: 'memberSlots array required.' })
  }

  let event = null
  if (calendarEventId) {
    try {
      event = calResult.calendar.getEventById(calendarEventId)
    } catch (err) {
      event = null
    }
  }
  if (!event && sessionId) {
    event = findEventBySessionId_(calResult.calendar, sessionId, weekStart)
  }

  if (!event) {
    return jsonResponse({ ok: false, error: 'Calendar event not found.' })
  }

  const slotsBlock = formatMemberSlotsBlock_(memberSlots)
  const description = mergeDescriptionWithMemberSlots_(event.getDescription(), slotsBlock)
  event.setDescription(description)

  auditLog_(
    SHEET_CALENDAR_MEMBER_SLOTS,
    ['Timestamp', 'CalendarEventId', 'SessionId', 'SlotCount'],
    [stamp_(), event.getId(), sessionId, memberSlots.length],
  )

  return jsonResponse({
    ok: true,
    calendarEventId: event.getId(),
    sessionId: sessionId,
    slotCount: memberSlots.length,
  })
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}'
    const data = JSON.parse(raw)
    const action = String(data.action || 'enquiry').trim()

    const authError = verifyWebhook_(e, data, action)
    if (authError) return jsonResponse({ ok: false, error: authError })

    if (action === 'enquiry') return handleEnquiry_(data)
    if (action === 'sendInvite') return handleSendInvite_(data)
    if (action === 'sendSubscriberBroadcast') return handleSendSubscriberBroadcast_(data)
    if (action === 'sendPlanChangeNotice') return handleSendPlanChangeNotice_(data)
    if (action === 'sendTransferNotice') return handleSendTransferNotice_(data)
    if (action === 'sendPaymentReminder') return handleSendPaymentReminder_(data)
    if (action === 'sendGuestPass') return handleSendGuestPass_(data)
    if (action === 'sendBookingInvite') return handleSendBookingInvite_(data)
    if (action === 'sendBookingCancellation') return handleSendBookingCancellation_(data)
    if (action === 'sendSlotInvite') return handleSendSlotInvite_(data)
    if (action === 'sendSlotCancellation') return handleSendSlotCancellation_(data)
    if (action === 'calendarUpsertSession') return handleCalendarUpsertSession_(data)
    if (action === 'calendarDeleteSession') return handleCalendarDeleteSession_(data)
    if (action === 'calendarGetSubscribeUrl') return handleCalendarGetSubscribeUrl_(data)
    if (action === 'calendarSyncMemberSlots') return handleCalendarSyncMemberSlots_(data)

    return jsonResponse({ ok: false, error: 'Unsupported action: ' + action })
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) })
  }
}
