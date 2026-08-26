/**
 * GBTT — enquiry form handler (scaffold)
 *
 * Setup:
 * 1. Create a Google Sheet with a tab named "Submissions"
 * 2. Extensions → Apps Script → paste this file → Save
 * 3. Set NOTIFY_EMAIL (and optional CALENDAR_ID) below
 * 4. Deploy → New deployment → Web app
 *      Execute as: Me
 *      Who has access: Anyone
 * 5. Copy the Web app URL into VITE_FORM_ENDPOINT (or src/data/formConfig.ts)
 *
 * POST body (Content-Type: text/plain;charset=utf-8):
 *   { action: "enquiry", name, email, phone, message, source }
 *
 * Calendar + Firebase live trees are deferred — this script only relays enquiries.
 */

const NOTIFY_EMAIL = 'Tom.GBTT@gmail.com'
const SHEET_NAME = 'Submissions'
const TIMEZONE = 'Pacific/Auckland'
/** Optional — leave blank until Tom’s class calendar exists. */
const CALENDAR_ID = ''

function jsonResponse(obj, code) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  )
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME)
    sheet.appendRow([
      'Timestamp',
      'Name',
      'Email',
      'Phone',
      'Message',
      'Source',
    ])
  }
  return sheet
}

function doGet() {
  return ContentService.createTextOutput('GBTT enquiry form endpoint').setMimeType(
    ContentService.MimeType.TEXT,
  )
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}'
    const data = JSON.parse(raw)
    const action = data.action || 'enquiry'
    if (action !== 'enquiry') {
      return jsonResponse({ ok: false, error: 'Unsupported action' })
    }

    const name = String(data.name || '').trim()
    const email = String(data.email || '').trim()
    const phone = String(data.phone || '').trim()
    const message = String(data.message || '').trim()
    const source = String(data.source || 'website').trim()

    if (!name || !email || !message) {
      return jsonResponse({ ok: false, error: 'Missing required fields' })
    }

    const stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
    getSheet_().appendRow([stamp, name, email, phone, message, source])

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

    if (CALENDAR_ID) {
      // Placeholder: enquiry does not create a class booking — only a note event if desired later.
    }

    return jsonResponse({ ok: true })
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) })
  }
}
