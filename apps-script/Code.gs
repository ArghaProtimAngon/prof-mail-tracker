/**
 * ProfMail backend (Google Apps Script)
 * Phase 1: setup, invite links, login, admin user management.
 * Phase 2-4: professors, my progress (contacts), templates, settings, activity feed.
 *
 * Paste this whole file into Extensions > Apps Script in your Google Sheet.
 * Run setup() once. Then deploy as a Web App.
 */

var SCHEMA = {
  Professors: ['id', 'name', 'university', 'field', 'email', 'lab_url', 'scholar_url', 'has_funding', 'deadline', 'notes', 'added_by', 'created_at', 'updated_at', 'deleted'],
  Contacts: ['id', 'professor_id', 'user_id', 'date_sent', 'status', 'response_text', 'updated_at'],
  Users: ['user_id', 'name', 'role', 'invite_code', 'session_token', 'invite_used', 'revoked', 'created_at'],
  Templates: ['id', 'user_id', 'title', 'subject', 'body', 'updated_at'],
  Activity: ['id', 'timestamp', 'user_id', 'action', 'professor_id', 'details'],
  Settings: ['key', 'value']
};

var STATUSES = ['Not sent', 'Sent', 'Seen', 'Replied (positive)', 'Replied (negative)', 'No reply'];
var FUNDING = ['yes', 'no', 'unknown'];

// Professor fields the app may set, with the maximum length of each.
var PROF_FIELDS = {
  name: 200, university: 200, field: 200, email: 200, lab_url: 500, scholar_url: 500,
  has_funding: 10, deadline: 10, notes: 5000
};

// Columns that hold a date (yyyy-mm-dd). If the sheet turns one into a real date, we turn it back.
var DATE_COLS = { deadline: true, date_sent: true };

// How many devices one person can be logged in on. The oldest one is logged out when this is passed.
var MAX_DEVICES = 10;

// Settings the app is allowed to change.
var SETTING_KEYS = ['follow_up_days'];

// ---------- One-time setup ----------

/** Run this ONCE by hand. It is safe to run again: it never deletes anything. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(SCHEMA).forEach(function (tabName) {
    var headers = SCHEMA[tabName];
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });

  // Default setting
  if (!findRow_('Settings', 'key', 'follow_up_days')) {
    appendRow_('Settings', { key: 'follow_up_days', value: 10 });
  }

  // First admin
  var users = readAll_('Users');
  var admin = users.filter(function (u) { return u.role === 'admin'; })[0];
  if (!admin) {
    var code = randomToken_();
    appendRow_('Users', {
      user_id: newId_('u'),
      name: 'Angon',
      role: 'admin',
      invite_code: code,
      session_token: '',
      invite_used: false,
      revoked: false,
      created_at: now_()
    });
    Logger.log('Admin created. Your invite link is:\nhttps://<your-site>/join?code=' + code +
      '\n(Replace <your-site> with your real website address. For local testing use http://localhost:5173)');
  } else {
    Logger.log('Setup finished. Admin "' + admin.name + '" already exists, so no new invite was made.');
  }
}

// ---------- Web App entry ----------

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var action = req.action;
    var handler = ACTIONS.hasOwnProperty(action) ? ACTIONS[action] : null;
    if (!handler) return json_({ ok: false, error: 'Unknown action.' });

    var user = null;
    if (action !== 'join') {
      user = authenticate_(req.token);
      if (!user) return json_({ ok: false, error: 'AUTH', message: 'Your session is not valid. Please use your invite link again.' });
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      return json_({ ok: true, data: handler(req, user) });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

// A GET just says hello, so you can check the deployment in a browser.
function doGet() {
  return json_({ ok: true, data: 'ProfMail API is running.' });
}

// ---------- Actions ----------

var ACTIONS = {
  join: function (req) {
    var code = String(req.code || '').trim();
    if (!code) throw new Error('Missing invite code.');
    var user = findRow_('Users', 'invite_code', code);
    if (!user || truthy_(user.revoked)) {
      throw new Error('This invite link is not valid. Ask Angon for a new one.');
    }
    // The link can be used on many devices. Every device gets its own token.
    // The session_token cell holds the tokens of all devices, separated by commas.
    var token = randomToken_();
    var tokens = sessionTokens_(user).concat(token).slice(-MAX_DEVICES);
    updateRow_('Users', user._row, { invite_used: true, session_token: tokens.join(',') });
    return { token: token, user: publicUser_(user) };
  },

  me: function (req, user) {
    return { user: publicUser_(user) };
  },

  // Everything the app needs on one call, so it opens fast.
  getAll: function (req, user) {
    var professors = readAll_('Professors')
      .filter(function (p) { return !truthy_(p.deleted); })
      .map(function (p) { var o = strip_(p); delete o.deleted; return o; });
    var ids = {};
    professors.forEach(function (p) { ids[p.id] = true; });

    var settings = {};
    readAll_('Settings').forEach(function (s) { settings[s.key] = s.value; });

    var activity = readAll_('Activity');
    activity = activity.slice(Math.max(0, activity.length - 200)).reverse().map(strip_);

    return {
      professors: professors,
      contacts: readAll_('Contacts').filter(function (c) { return ids[c.professor_id]; }).map(strip_),
      users: readAll_('Users').map(function (u) {
        return { user_id: u.user_id, name: u.name, role: u.role, revoked: truthy_(u.revoked) };
      }),
      templates: readAll_('Templates').filter(function (t) { return t.user_id === user.user_id; }).map(strip_),
      settings: settings,
      activity: activity
    };
  },

  // --- Professors ---
  addProfessor: function (req, user) {
    var p = { id: newId_('p'), added_by: user.user_id, created_at: now_(), updated_at: now_(), deleted: false };
    Object.keys(PROF_FIELDS).forEach(function (k) { p[k] = cleanField_(k, req[k]); });
    if (!p.name) throw new Error('Please enter the professor name.');
    appendRow_('Professors', p);
    logActivity_(user, 'added', p.id, 'added ' + profLabel_(p.name));
    return { id: p.id };
  },

  // Only the fields you send are changed.
  updateProfessor: function (req, user) {
    var prof = getProfessor_(req.id);
    var changes = {};
    Object.keys(PROF_FIELDS).forEach(function (k) {
      if (req[k] === undefined) return;
      var v = cleanField_(k, req[k]);
      if (String(prof[k]) !== v) changes[k] = v;
    });
    var keys = Object.keys(changes);
    if (!keys.length) return { id: prof.id };
    if (changes.name !== undefined && !changes.name) throw new Error('The professor name cannot be empty.');
    changes.updated_at = now_();
    updateRow_('Professors', prof._row, changes);
    var name = changes.name || prof.name;
    logActivity_(user, 'edited', prof.id,
      (keys.length === 1 && keys[0] === 'notes' ? 'edited notes on ' : 'edited ') + profLabel_(name));
    return { id: prof.id };
  },

  // Soft delete: the row stays in the sheet, it is only hidden.
  deleteProfessor: function (req, user) {
    var prof = getProfessor_(req.id);
    updateRow_('Professors', prof._row, { deleted: true, updated_at: now_() });
    logActivity_(user, 'deleted', prof.id, 'deleted ' + profLabel_(prof.name));
    return { id: prof.id };
  },

  // --- My progress on one professor ---
  saveContact: function (req, user) {
    var prof = getProfessor_(req.professor_id);
    var status = String(req.status || '');
    if (STATUSES.indexOf(status) === -1) throw new Error('Unknown status.');
    var date = status === 'Not sent' ? '' : (validDate_(req.date_sent) || todayStr_());
    var reply = String(req.response_text === undefined || req.response_text === null ? '' : req.response_text).trim().slice(0, 5000);

    var existing = readAll_('Contacts').filter(function (c) {
      return c.professor_id === prof.id && c.user_id === user.user_id;
    })[0];

    var oldStatus = existing ? String(existing.status) : 'Not sent';
    var oldReply = existing ? String(existing.response_text) : '';
    var oldDate = existing ? String(existing.date_sent) : '';
    if (existing && oldStatus === status && oldReply === reply && oldDate === date) return { id: existing.id };

    if (existing) {
      updateRow_('Contacts', existing._row, { date_sent: date, status: status, response_text: reply, updated_at: now_() });
    } else {
      appendRow_('Contacts', {
        id: newId_('c'), professor_id: prof.id, user_id: user.user_id,
        date_sent: date, status: status, response_text: reply, updated_at: now_()
      });
    }

    var label = profLabel_(prof.name);
    if (oldStatus !== status) {
      logActivity_(user, 'status', prof.id, 'marked ' + label + ' as ' + status);
    } else if (oldReply !== reply) {
      logActivity_(user, 'reply', prof.id, 'updated the reply notes on ' + label);
    } else {
      logActivity_(user, 'status', prof.id, 'changed the date sent for ' + label);
    }
    return { professor_id: prof.id };
  },

  // --- Templates (each person has their own) ---
  saveTemplate: function (req, user) {
    var title = String(req.title || '').trim().slice(0, 100);
    if (!title) throw new Error('Please give the template a title.');
    var fields = {
      title: title,
      subject: String(req.subject || '').trim().slice(0, 300),
      body: String(req.body || '').slice(0, 10000),
      updated_at: now_()
    };
    if (req.id) {
      var t = findRow_('Templates', 'id', req.id);
      if (!t || t.user_id !== user.user_id) throw new Error('Template not found.');
      updateRow_('Templates', t._row, fields);
      return { id: t.id };
    }
    fields.id = newId_('t');
    fields.user_id = user.user_id;
    appendRow_('Templates', fields);
    return { id: fields.id };
  },

  deleteTemplate: function (req, user) {
    var t = findRow_('Templates', 'id', req.id);
    if (!t || t.user_id !== user.user_id) throw new Error('Template not found.');
    deleteRow_('Templates', t._row);
    return { id: t.id };
  },

  // --- Settings ---
  saveSetting: function (req, user) {
    var key = String(req.key || '');
    if (SETTING_KEYS.indexOf(key) === -1) throw new Error('Unknown setting.');
    var value = req.value;
    if (key === 'follow_up_days') {
      value = Math.round(Number(value));
      if (!(value >= 1 && value <= 365)) throw new Error('Follow-up days must be a number between 1 and 365.');
    }
    var row = findRow_('Settings', 'key', key);
    if (row) updateRow_('Settings', row._row, { value: value });
    else appendRow_('Settings', { key: key, value: value });
    return { key: key, value: value };
  },

  // --- Admin only ---
  createInvite: function (req, user) {
    requireAdmin_(user);
    var name = String(req.name || '').trim();
    if (!name) throw new Error('Please enter a name.');
    var code = randomToken_();
    var id = newId_('u');
    appendRow_('Users', {
      user_id: id, name: name, role: 'member', invite_code: code, session_token: '',
      invite_used: false, revoked: false, created_at: now_()
    });
    return { user_id: id, invite_code: code };
  },

  // Make a fresh link for a person. The old link stops working and every device is logged out.
  // Their data stays theirs.
  regenerateInvite: function (req, user) {
    requireAdmin_(user);
    var target = findRow_('Users', 'user_id', req.user_id);
    if (!target) throw new Error('User not found.');
    var code = randomToken_();
    updateRow_('Users', target._row, { invite_code: code, invite_used: false, session_token: '', revoked: false });
    return { user_id: target.user_id, invite_code: code };
  },

  listUsers: function (req, user) {
    requireAdmin_(user);
    return readAll_('Users').map(function (u) {
      return {
        user_id: u.user_id,
        name: u.name,
        role: u.role,
        invite_used: truthy_(u.invite_used),
        revoked: truthy_(u.revoked),
        created_at: u.created_at,
        // The link works on many devices, so the admin can copy it again any time (unless revoked).
        invite_code: truthy_(u.revoked) ? '' : u.invite_code
      };
    });
  },

  revokeUser: function (req, user) {
    requireAdmin_(user);
    var target = findRow_('Users', 'user_id', req.user_id);
    if (!target) throw new Error('User not found.');
    if (target.user_id === user.user_id) throw new Error('You cannot revoke yourself.');
    updateRow_('Users', target._row, { revoked: true, session_token: '' });
    return { user_id: target.user_id };
  }
};

// ---------- Auth helpers ----------

function authenticate_(token) {
  token = String(token || '');
  if (token.length < 32) return null;
  var users = readAll_('Users');
  for (var i = 0; i < users.length; i++) {
    if (!truthy_(users[i].revoked) && sessionTokens_(users[i]).indexOf(token) !== -1) return users[i];
  }
  return null;
}

/** The login tokens of all of a person's devices. */
function sessionTokens_(u) {
  return String(u.session_token || '').split(',').filter(function (t) { return t; });
}

function requireAdmin_(user) {
  if (!user || user.role !== 'admin') throw new Error('Only the admin can do this.');
}

function publicUser_(u) {
  return { user_id: u.user_id, name: u.name, role: u.role };
}

// ---------- Data helpers ----------

function getProfessor_(id) {
  var p = findRow_('Professors', 'id', id);
  if (!p || truthy_(p.deleted)) throw new Error('Professor not found.');
  return p;
}

function cleanField_(key, value) {
  var v = String(value === undefined || value === null ? '' : value).trim();
  if (key === 'has_funding') {
    v = v.toLowerCase();
    return FUNDING.indexOf(v) === -1 ? 'unknown' : v;
  }
  if (key === 'deadline') return validDate_(v);
  if (key === 'email') v = v.toLowerCase();
  if ((key === 'lab_url' || key === 'scholar_url') && v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
  return v.slice(0, PROF_FIELDS[key]);
}

function validDate_(value) {
  var v = String(value || '').trim().slice(0, 10);
  if (!v) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Dates must look like 2026-10-31.');
  return v;
}

function todayStr_() {
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

function profLabel_(name) {
  return /^(prof|professor|dr)\.?\s/i.test(name) ? name : 'Prof. ' + name;
}

function logActivity_(user, action, professorId, details) {
  appendRow_('Activity', {
    id: newId_('a'), timestamp: now_(), user_id: user.user_id,
    action: action, professor_id: professorId || '', details: details
  });
}

/** Copy of a row object without the internal _row number. */
function strip_(row) {
  var o = {};
  Object.keys(row).forEach(function (k) { if (k !== '_row') o[k] = row[k]; });
  return o;
}

// ---------- Sheet helpers (read/write rows by header name) ----------

function sheet_(tab) {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tab);
  if (!s) throw new Error('Tab "' + tab + '" is missing. Please run setup() first.');
  return s;
}

function headers_(tab) {
  return SCHEMA[tab];
}

/** Returns an array of objects. Each has _row (the real row number in the sheet). */
function readAll_(tab) {
  var s = sheet_(tab);
  var last = s.getLastRow();
  if (last < 2) return [];
  var h = headers_(tab);
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var values = s.getRange(2, 1, last - 1, h.length).getValues();
  return values.map(function (row, i) {
    var o = { _row: i + 2 };
    h.forEach(function (key, c) {
      var v = row[c];
      // If the sheet turned a text into a real date, turn it back into text.
      if (v instanceof Date) v = DATE_COLS[key] ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v.toISOString();
      o[key] = v;
    });
    return o;
  });
}

function findRow_(tab, key, value) {
  value = String(value === undefined || value === null ? '' : value);
  if (!value) return null;
  var rows = readAll_(tab);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][key]) === value) return rows[i];
  }
  return null;
}

// Text is stored with the "plain text" format, so the sheet never turns it into a date,
// a number or a formula (for example a note that starts with "=" or looks like "3-4").
function fmt_(v) {
  return typeof v === 'string' ? '@' : 'General';
}

function appendRow_(tab, obj) {
  var h = headers_(tab);
  var s = sheet_(tab);
  var values = h.map(function (key) { return obj[key] === undefined ? '' : obj[key]; });
  var range = s.getRange(s.getLastRow() + 1, 1, 1, h.length);
  range.setNumberFormats([values.map(fmt_)]);
  range.setValues([values]);
}

function updateRow_(tab, rowNumber, changes) {
  var h = headers_(tab);
  var range = sheet_(tab).getRange(rowNumber, 1, 1, h.length);
  var values = range.getValues()[0];
  Object.keys(changes).forEach(function (key) {
    var col = h.indexOf(key);
    if (col === -1) throw new Error('Unknown column: ' + key);
    values[col] = changes[key];
  });
  range.setNumberFormats([values.map(fmt_)]);
  range.setValues([values]);
}

function deleteRow_(tab, rowNumber) {
  sheet_(tab).deleteRow(rowNumber);
}

// ---------- Small utilities ----------

function truthy_(v) {
  return v === true || String(v).toLowerCase() === 'true';
}

function randomToken_() {
  // Two random UUIDs joined = 64 random hex characters.
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function newId_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function now_() {
  return new Date().toISOString();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
