/**
 * GBTT — enquiry + member activation emails
 *
 * Setup:
 * 1. Create a Google Sheet with tabs "Submissions" and "Activations"
 * 2. Extensions → Apps Script → paste this file → Save
 * 3. Set NOTIFY_EMAIL below
 * 4. Project settings → Script properties → ACTIVATION_KEY = your secret key
 *    (must match VITE_ACTIVATION_KEY in the site / sim-demos env)
 * 5. Deploy → New deployment → Web app (Execute as: Me, Anyone)
 * 6. Copy the Web app URL into VITE_FORM_ENDPOINT
 *
 * POST JSON (Content-Type: text/plain;charset=utf-8):
 *   { action: "enquiry", name, email, phone, message, source }
 *   { action: "activation", name, email, planId, source }
 */

const NOTIFY_EMAIL = 'Tom.GBTT@gmail.com'
const SHEET_ENQUIRIES = 'Submissions'
const SHEET_ACTIVATIONS = 'Activations'
const TIMEZONE = 'Pacific/Auckland'
const CALENDAR_ID = ''

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  )
}

function activationKey_() {
  const fromProps = PropertiesService.getScriptProperties().getProperty('ACTIVATION_KEY')
  return fromProps || 'GBTT-DEMO-ACTIVATE'
}

function getSheet_(name, headerRow) {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName(name)
  if (!sheet) {
    sheet = ss.insertSheet(name)
    sheet.appendRow(headerRow)
  }
  return sheet
}

function doGet() {
  return ContentService.createTextOutput('GBTT web endpoint').setMimeType(
    ContentService.MimeType.TEXT,
  )
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

  const stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
  getSheet_(SHEET_ENQUIRIES, ['Timestamp', 'Name', 'Email', 'Phone', 'Message', 'Source']).appendRow([
    stamp,
    name,
    email,
    phone,
    message,
    source,
  ])

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
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

  return jsonResponse({ ok: true })
}

function handleActivation_(data) {
  const name = String(data.name || '').trim()
  const email = String(data.email || '').trim().toLowerCase()
  const planId = String(data.planId || '').trim()
  const source = String(data.source || 'member-booking').trim()
  const key = activationKey_()

  if (!name || !email) {
    return jsonResponse({ ok: false, error: 'Name and email required.' })
  }

  const stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
  getSheet_(SHEET_ACTIVATIONS, ['Timestamp', 'Name', 'Email', 'Plan', 'Source']).appendRow([
    stamp,
    name,
    email,
    planId,
    source,
  ])

  MailApp.sendEmail({
    to: email,
    subject: 'Activate your GBTT membership',
    body:
      'Hi ' +
      name +
      ',\n\nThanks for joining Golden Bay Team Training.\n\nYour activation key:\n\n' +
      key +
      '\n\nOpen member booking on the GBTT site, choose New subscription, and enter this key to finish creating your account.\n\nSee you at Rec Park Centre!\n\n— Tom · GBTT',
  })

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: 'GBTT activation email sent — ' + name,
    body: 'Activation requested for ' + name + ' (' + email + ')\nPlan: ' + planId,
  })

  return jsonResponse({ ok: true })
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}'
    const data = JSON.parse(raw)
    const action = data.action || 'enquiry'

    if (action === 'enquiry') return handleEnquiry_(data)
    if (action === 'activation') return handleActivation_(data)

    return jsonResponse({ ok: false, error: 'Unsupported action' })
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) })
  }
}
