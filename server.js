/* ============================================================
 *  Copyright (c) 2026 Антипин Андрей Александрович
 *  All rights reserved. See LICENSE file.
 * ============================================================
 *  HTTP REST API SERVER (server.js)
 * ============================================================
 *  Express.js сервер, предоставляющий REST API поверх тех же
 *  lib/ модулей (users.js, schedule.js, tasks.js, templates.js,
 *  crypto.js), что использует Electron main.js.
 *  Позволяет использовать приложение как PWA из браузера телефона.
 *
 *  Запуск:  node server.js
 *  Порт:   config.port || env PORT || 3000
 * ============================================================ */
'use strict';

const express = require('express');
const compression = require('compression');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const multer = require('multer');

const ScheduleManager = require('./lib/schedule');
const UserManager = require('./lib/users');
const DataCrypto = require('./lib/crypto');
const TaskManager = require('./lib/tasks');
const TemplateManager = require('./lib/templates');

/* --- Базовый каталог для данных --- */
const DATA_ROOT = (process.pkg || (process.argv0 && process.argv0.includes('pkg')))
    ? path.dirname(process.execPath)
    : __dirname;

const CONFIG_PATH = path.join(__dirname, 'config.json');
let config = {};
try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } catch (e) { logError(e.message); console.error(e.message); }

const schedulePath = path.join(DATA_ROOT, config.scheduleFile || 'data/schedule.xlsx');
const usersPath = path.join(DATA_ROOT, config.usersFile || 'data/users.json');
const exportExcelPath = path.join(DATA_ROOT, config.exportExcel || 'data/export.xlsx');
const exportR7Path = path.join(DATA_ROOT, config.exportR7 || 'data/export.ods');

const ATTACH_DIR = path.join(DATA_ROOT, 'data', 'attachments');
if (!fs.existsSync(ATTACH_DIR)) fs.mkdirSync(ATTACH_DIR, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, ATTACH_DIR),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            const id = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
            cb(null, id + ext);
        }
    }),
    limits: { fileSize: 20 * 1024 * 1024 }
});

const ALLOWED_MIME = [
    'image/jpeg','image/png','image/gif','image/webp','image/bmp',
    'video/mp4','video/webm','video/quicktime','video/x-msvideo',
    'audio/mpeg','audio/wav','audio/ogg','audio/webm',
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','application/zip','application/x-rar-compressed'
];

let schedule;
let users;
let dataCrypto;
let tasks;
let templates;

/* --- Логирование ошибок --- */
const ERROR_LOG = path.join(DATA_ROOT, 'error.log');
function logError(msg) {
    try {
        const ts = new Date().toISOString();
        fs.appendFileSync(ERROR_LOG, ts + ' | ' + msg + '\n', 'utf-8');
    } catch (_) {}
}

/* --- Сессии (in-memory, по токену в cookie) --- */
const SESSION_COOKIE = 'narabote_sid';
const sessions = new Map();

function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

function getSession(req) {
    const sid = req.cookies[SESSION_COOKIE];
    if (!sid) return null;
    return sessions.get(sid) || null;
}

function setSession(res, sessionData) {
    const sid = generateSessionId();
    sessions.set(sid, sessionData);
    res.cookie(SESSION_COOKIE, sid, {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax',
        path: '/'
    });
    return sid;
}

function destroySession(req, res) {
    const sid = req.cookies[SESSION_COOKIE];
    if (sid) sessions.delete(sid);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
}

function requireAuth(req) {
    const s = getSession(req);
    if (!s || !s.type) return { success: false, message: 'Требуется авторизация' };
    return null;
}

function allowed(s, targetEmp) {
    if (s.type === 'admin') return true;
    if (s.role === 'manager') return true;
    return s.empId === targetEmp;
}

function isManagerOrAdmin(s) {
    return s.type === 'admin' || s.role === 'manager';
}

/* --- Производственный календарь --- */
const HOLIDAYS_PATH = path.join(DATA_ROOT, 'data', 'holidays.json');
let holidaysCache = null;

function loadHolidays() {
    if (holidaysCache) return holidaysCache;
    try {
        if (fs.existsSync(HOLIDAYS_PATH)) {
            holidaysCache = JSON.parse(fs.readFileSync(HOLIDAYS_PATH, 'utf-8'));
        }
    } catch (e) { logError('holidays load: ' + e.message); }
    return holidaysCache;
}

function pad2(n) { return n.toString().padStart(2, '0'); }

function isH(dt) {
    const hol = loadHolidays();
    const key = pad2(dt.getDate()) + '.' + pad2(dt.getMonth() + 1);
    const year = dt.getFullYear();
    if (hol && hol[year]) {
        return hol[year].holidays.includes(key);
    }
    const FALLBACK = new Set([
        '01.01','02.01','03.01','04.01','05.01','06.01','07.01','08.01',
        '23.02','08.03','09.03','01.05','02.05','03.05',
        '09.05','10.05','11.05','12.06','13.06','14.06','04.11'
    ]);
    return FALLBACK.has(key);
}

function isP(dt) {
    const hol = loadHolidays();
    const key = pad2(dt.getDate()) + '.' + pad2(dt.getMonth() + 1);
    const year = dt.getFullYear();
    if (hol && hol[year] && hol[year].preholidays) {
        return hol[year].preholidays.includes(key);
    }
    return false;
}

/* --- Пути данных --- */
const AUDIT_PATH = path.join(DATA_ROOT, 'data', 'audit.json');
const NOTES_PATH = path.join(DATA_ROOT, 'data', 'notes.json');
const TASKS_PATH = path.join(DATA_ROOT, 'data', 'tasks.json');

function loadNotesFile() {
    try {
        if (fs.existsSync(NOTES_PATH)) {
            const raw = fs.readFileSync(NOTES_PATH, 'utf-8');
            return dataCrypto.decrypt(raw) || {};
        }
    } catch (e) { logError('Notes read: ' + e.message); }
    return {};
}

function saveNotesFile(data) {
    try {
        const dir = path.dirname(NOTES_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = NOTES_PATH + '.tmp';
        fs.writeFileSync(tmp, dataCrypto.encrypt(data), 'utf-8');
        fs.renameSync(tmp, NOTES_PATH);
    } catch (e) { logError('Notes write: ' + e.message); }
}

function canUseNotes(s) {
    if (s.type === 'admin') return true;
    if (s.type === 'user' && s.empId) {
        const u = users.getUser(s.empId);
        return u && !!u.canNotes;
    }
    return false;
}

function auditLog(action, user, details) {
    try {
        const dir = path.dirname(AUDIT_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        let log = [];
        if (fs.existsSync(AUDIT_PATH)) {
            const raw = fs.readFileSync(AUDIT_PATH, 'utf-8');
            log = dataCrypto.decrypt(raw) || [];
        }
        log.push({ ts: new Date().toISOString(), action, user: user || 'system', details });
        if (log.length > 500) log = log.slice(-500);
        const tmpAudit = AUDIT_PATH + '.tmp';
        fs.writeFileSync(tmpAudit, dataCrypto.encrypt(log), 'utf-8');
        fs.renameSync(tmpAudit, AUDIT_PATH);
    } catch (e) { logError('Audit: ' + e.message); }
}

function empWork(emp) {
    const m = new Map();
    schedule.readWork().filter(r => r.emp === emp).forEach(r => {
        m.set(r.date, { start: r.start, end: r.end, lunch: r.lunch, rate: r.rate,
            hourlyWage: r.hourlyWage, allowance: r.allowance, allowanceType: r.allowanceType });
    });
    return m;
}

/* --- Инициализация модулей --- */
function initModules() {
    try {
        const dataDir = path.join(DATA_ROOT, 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        schedule = new ScheduleManager(schedulePath, config.maxPerDate || 2);
        if (!fs.existsSync(schedulePath)) {
            schedule.createEmpty();
            console.log('Создан файл:', schedulePath);
        }
        users = new UserManager(usersPath);
        dataCrypto = new DataCrypto(dataDir);
        dataCrypto.enable();
        tasks = new TaskManager(TASKS_PATH, dataCrypto);
        templates = new TemplateManager(DATA_ROOT);
        templates._ensure();
    } catch (e) { logError('initModules: ' + e.message); }
}

/* ============================================================
 *  Express App
 * ============================================================ */

const app = express();
const server = http.createServer(app);

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

/* --- CORS для ANDROID WEB --- */
app.use((req, res, next) => {
    console.log(req.method, req.url, req.ip);
    const origin = req.headers.origin || '*';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

/* --- PWA: manifest.json и sw.js --- */
app.get('/manifest.json', (req, res) => {
    const mfPath = path.join(__dirname, 'renderer', 'manifest.json');
    if (fs.existsSync(mfPath)) {
        res.sendFile(mfPath);
    } else {
        res.json({
            name: 'НаРаботеLIVE',
            short_name: 'НаРаботе',
            start_url: '/',
            display: 'standalone',
            background_color: '#ffffff',
            theme_color: '#1976d2',
            icons: [
                { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
            ]
        });
    }
});

app.get('/sw.js', (req, res) => {
    const swPath = path.join(__dirname, 'renderer', 'sw.js');
    if (fs.existsSync(swPath)) {
        res.type('application/javascript').sendFile(swPath);
    } else {
        res.type('application/javascript').send(
            "self.addEventListener('install',e=>{self.skipWaiting()});\n" +
            "self.addEventListener('activate',e=>{e.waitUntil(clients.claim())});\n" +
            "self.addEventListener('fetch',e=>{e.respondWith(fetch(e.request))});\n"
        );
    }
});

/* --- Статика из renderer/ --- */
app.use(express.static(path.join(__dirname, 'renderer'), { index: false, maxAge: 0, setHeaders: (res) => { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); res.setHeader('Pragma', 'no-cache'); res.setHeader('Expires', '0'); } }));

/* --- SPA fallback: всё, что не /api/* → index.html --- */
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    const idx = path.join(__dirname, 'renderer', 'index.html');
    if (fs.existsSync(idx)) {
        res.sendFile(idx);
    } else {
        res.status(404).send('index.html not found');
    }
});

/* ============================================================
 *  API ROUTES
 * ============================================================ */

const api = express.Router();
app.use('/api', api);

/* --- Авторизация --- */

api.post('/admin-login', (req, res) => {
    const { login, pass } = req.body;
    const r = users.adminLogin(login, pass);
    if (r.success) {
        const s = { type: 'admin', empId: null, role: null };
        setSession(res, s);
    }
    res.json(r);
});

api.post('/user-login', (req, res) => {
    const { login, pass } = req.body;
    const r = users.userLogin(login, pass);
    if (r.success) {
        const s = { type: 'user', empId: r.empId, role: r.role };
        setSession(res, s);
        const lastLogin = users.getLastLogin(login);
        let notifications = [];
        try {
            if (lastLogin && fs.existsSync(AUDIT_PATH)) {
                const log = dataCrypto.decrypt(fs.readFileSync(AUDIT_PATH, 'utf-8')) || [];
                notifications = log.filter(e => e.ts > lastLogin).slice(-20);
            }
        } catch (e) { logError('user-login notifications: ' + e.message); }
        users.updateLastLogin(login);
        r.notifications = notifications;
        auditLog('login', r.empId, 'Вход в систему');
    }
    res.json(r);
});

api.post('/register', (req, res) => {
    const { login, pass, name, tab } = req.body;
    res.json(users.register(login, pass, name, tab));
});

api.post('/logout', (req, res) => {
    destroySession(req, res);
    res.json({ success: true });
});

api.get('/session', (req, res) => {
    const s = getSession(req);
    if (!s || !s.type) return res.json({ type: null, empId: null, role: null, isAdmin: false, isManager: false, canNotes: false });
    if (s.type === 'user' && s.empId) {
        const u = users.getUser(s.empId);
        if (u) s.role = u.role;
    }
    res.json({
        type: s.type, empId: s.empId, role: s.role,
        isAdmin: s.type === 'admin', isManager: isManagerOrAdmin(s),
        canNotes: canUseNotes(s)
    });
});

/* --- Конфигурация --- */

api.get('/config', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    res.json({ maxPerDate: config.maxPerDate || 2 });
});

/* --- Быстрая проверка изменений (mtime) --- */

api.get('/data-mtime', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    try {
        res.json({
            success: true,
            schedule: schedule.getMtime(),
            users: fs.existsSync(usersPath) ? fs.statSync(usersPath).mtimeMs : 0,
            notes: fs.existsSync(NOTES_PATH) ? fs.statSync(NOTES_PATH).mtimeMs : 0
        });
    } catch (e) { logError('get-data-mtime: ' + e.message); res.json({ success: false }); }
});

/* --- Управление пользователями --- */

api.get('/users', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    res.json({ success: true, data: users.listUsers() });
});

api.post('/set-role', (req, res) => {
    const s = getSession(req);
    if (!s || s.type !== 'admin') return res.json({ success: false, message: 'Только администратор' });
    const { empId, role } = req.body;
    const r = users.setRole(empId, role);
    if (r.success) auditLog('set-role', 'admin', empId + ' → ' + role);
    res.json(r);
});

api.post('/rename-user', (req, res) => {
    const s = getSession(req);
    if (!s || s.type !== 'admin') return res.json({ success: false, message: 'Только администратор' });
    const { empId, newName } = req.body;
    res.json(users.renameUser(empId, newName));
});

api.post('/delete-user', (req, res) => {
    const s = getSession(req);
    if (!s || s.type !== 'admin') return res.json({ success: false, message: 'Только администратор' });
    const { empId } = req.body;
    const r = users.deleteUser(empId);
    if (r.success) auditLog('delete-user', 'admin', empId);
    res.json(r);
});

api.post('/reset-password', (req, res) => {
    const s = getSession(req);
    if (!s || s.type !== 'admin') return res.json({ success: false, message: 'Только администратор' });
    const { empId, newPass } = req.body;
    res.json(users.resetPassword(empId, newPass));
});

api.post('/change-admin-password', (req, res) => {
    const s = getSession(req);
    if (!s || s.type !== 'admin') return res.json({ success: false, message: 'Только администратор' });
    const { old, newPass } = req.body;
    res.json(users.changeAdminPassword(old, newPass));
});

api.post('/set-user-color', (req, res) => {
    const s = getSession(req);
    if (!s) return res.json({ success: false, message: 'Нет прав' });
    const { empId, color } = req.body;
    if (s.type !== 'admin' && s.empId !== empId) return res.json({ success: false, message: 'Нет прав' });
    try {
        const r = users.setUserColor(empId, color);
        if (r.success) auditLog('set-user-color', s.empId || 'admin', empId);
        res.json(r);
    } catch (e) { logError('set-user-color: ' + e.message); res.json({ success: false, message: e.message }); }
});

/* --- Журнал действий --- */

api.get('/audit', (req, res) => {
    const s = getSession(req);
    if (!s || s.type !== 'admin') return res.json({ success: false, message: 'Только администратор' });
    try {
        if (!fs.existsSync(AUDIT_PATH)) return res.json({ success: true, data: [] });
        res.json({ success: true, data: dataCrypto.decrypt(fs.readFileSync(AUDIT_PATH, 'utf-8')) || [] });
    } catch (e) { logError('load-audit: ' + e.message); res.json({ success: false, message: e.message }); }
});

/* --- Уведомления --- */

api.get('/notifications', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    const s = getSession(req);
    const sinceTs = req.query.since;
    try {
        if (!fs.existsSync(AUDIT_PATH)) return res.json({ success: true, data: [] });
        const log = dataCrypto.decrypt(fs.readFileSync(AUDIT_PATH, 'utf-8')) || [];
        const items = log.filter(e => e.ts > sinceTs && e.user !== (s.empId || ''));
        res.json({ success: true, data: items.slice(-30) });
    } catch (e) { logError('load-notifications: ' + e.message); res.json({ success: true, data: [] }); }
});

/* --- График (бронирование) --- */

api.get('/schedule', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    try { res.json({ success: true, data: schedule.read() }); }
    catch (e) { logError('load-schedule: ' + e.message); res.json({ success: false, message: e.message }); }
});

api.post('/lock-date', (req, res) => {
    const s = getSession(req);
    if (!isManagerOrAdmin(s)) return res.json({ success: false, message: 'Только руководитель/админ' });
    const { date } = req.body;
    try {
        const r = schedule.lockDate(date);
        if (r.success) auditLog('lock-date', s.empId || 'admin', '\u{1F512} ' + date);
        res.json(r);
    } catch (e) { logError('lock-date: ' + e.message); res.json({ success: false, message: e.message }); }
});

api.post('/unlock-date', (req, res) => {
    const s = getSession(req);
    if (!isManagerOrAdmin(s)) return res.json({ success: false, message: 'Только руководитель/админ' });
    const { date } = req.body;
    try {
        const r = schedule.unlockDate(date);
        if (r.success) auditLog('unlock-date', s.empId || 'admin', '\u{1F513} ' + date);
        res.json(r);
    } catch (e) { logError('unlock-date: ' + e.message); res.json({ success: false, message: e.message }); }
});

api.post('/book-date', (req, res) => {
    const s = getSession(req);
    if (!isManagerOrAdmin(s)) return res.json({ success: false, message: 'Бронирование доступно только руководителю/админу' });
    const { date, emp } = req.body;
    try {
        const r = schedule.book(date, String(emp).trim());
        if (r.success) auditLog('book', s.empId || 'admin', emp + ' → ' + date);
        res.json(r);
    } catch (e) { logError('book-date: ' + e.message); res.json({ success: false, message: e.message }); }
});

api.post('/cancel-booking', (req, res) => {
    const s = getSession(req);
    if (!isManagerOrAdmin(s)) return res.json({ success: false, message: 'Отмена брони — только руководитель/админ' });
    const { date, emp } = req.body;
    try {
        const r = schedule.cancel(date, String(emp).trim());
        if (r.success) auditLog('cancel-booking', s.empId || 'admin', emp + ' ← ' + date);
        res.json(r);
    } catch (e) { logError('cancel-booking: ' + e.message); res.json({ success: false, message: e.message }); }
});

api.post('/cancel-bookings-range', (req, res) => {
    const s = getSession(req);
    if (!isManagerOrAdmin(s)) return res.json({ success: false, message: 'Только руководитель/админ' });
    const { from, to } = req.body;
    try {
        const all = schedule.read();
        let count = 0;
        const parse = s2 => { const [d,m,y] = s2.split('.').map(Number); return new Date(y, m-1, d); };
        const dFrom = parse(from), dTo = parse(to);
        for (const r of all) {
            const d = parse(r.date);
            if (d >= dFrom && d <= dTo && (r.emp1 || r.emp2)) {
                if (r.locked) { schedule.unlockDate(r.date); count++; }
                const emps = [r.emp1, r.emp2].filter(e => e && e !== '\u{1F512}');
                for (const emp of emps) { schedule.cancel(r.date, emp); count++; }
            }
        }
        res.json({ success: true, message: 'Снято блокировок: ' + count });
    } catch (e) { logError('cancel-bookings-range: ' + e.message); res.json({ success: false, message: e.message }); }
});

/* --- Рабочие дни --- */

api.get('/work', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    const s = getSession(req);
    try {
        let data = schedule.readWork();
        if (s.type === 'user' && s.role === 'worker') {
            data = data.filter(r => r.emp === s.empId);
        }
        res.json({ success: true, data });
    } catch (e) { logError('load-work: ' + e.message); res.json({ success: false, message: e.message }); }
});

api.post('/set-work', (req, res) => {
    const s = getSession(req);
    if (!s) return res.json({ success: false, message: 'Нет прав' });
    const { emp, date, start, end, lunch, rate, hourlyWage, allowance, allowanceType } = req.body;
    if (!allowed(s, emp)) return res.json({ success: false, message: 'Нет прав' });
    try {
        const r = schedule.setWork(emp, date, start, end, lunch, rate, hourlyWage, allowance, allowanceType);
        if (r.success) auditLog('set-work', s.empId || 'admin', emp + ' ' + date);
        res.json(r);
    } catch (e) { logError('set-work: ' + e.message); res.json({ success: false, message: e.message }); }
});

api.post('/remove-work', (req, res) => {
    const s = getSession(req);
    if (!s) return res.json({ success: false, message: 'Нет прав' });
    const { emp, date } = req.body;
    if (!allowed(s, emp)) return res.json({ success: false, message: 'Нет прав' });
    try {
        const r = schedule.removeWork(emp, date);
        if (r.success) auditLog('remove-work', s.empId || 'admin', emp + ' ' + date);
        res.json(r);
    } catch (e) { logError('remove-work: ' + e.message); res.json({ success: false, message: e.message }); }
});

/* --- Отпуск --- */

api.get('/vacation', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    const s = getSession(req);
    try {
        let data = schedule.readVacation();
        if (s.type === 'user' && s.role === 'worker') {
            data = data.filter(r => r.emp === s.empId);
        }
        res.json({ success: true, data });
    } catch (e) { logError('load-vacation: ' + e.message); res.json({ success: false, message: e.message }); }
});

api.post('/add-vacation', (req, res) => {
    const s = getSession(req);
    if (!s) return res.json({ success: false, message: 'Нет прав' });
    const { emp, date } = req.body;
    if (!allowed(s, emp)) return res.json({ success: false, message: 'Нет прав' });
    try {
        const all = schedule.read();
        const rec = all.find(r => r.date === date);
        if (rec && (rec.emp1 || rec.emp2)) {
            return res.json({ success: false, message: 'Дата забронирована — отпуск невозможен' });
        }
        const VACATION_LIMIT = 28;
        const allEmpVac = schedule.readVacation().filter(r => r.emp === emp && r.status !== 'rejected');
        if (allEmpVac.length >= VACATION_LIMIT) {
            return res.json({ success: false, message: 'Лимит отпускных дней исчерпан (' + VACATION_LIMIT + ' дн.)' });
        }
        const MAX_OVERLAP = config.maxPerDate || 2;
        const allVac = schedule.readVacation().filter(r => r.status !== 'rejected');
        const myVac = new Set(allVac.filter(r => r.emp === emp).map(r => r.date));
        myVac.add(date);
        for (const d of myVac) {
            const countOnDate = allVac.filter(r => r.date === d && r.emp !== emp).length;
            if (countOnDate >= MAX_OVERLAP) {
                return res.json({ success: false, message: 'На ' + d + ' уже ' + countOnDate + ' сотрудник(ов) в отпуске (макс. ' + MAX_OVERLAP + ')' });
            }
        }
        const vacStatus = isManagerOrAdmin(s) ? 'approved' : 'pending';
        const r = schedule.addVacation(emp, date, vacStatus);
        if (r.success) auditLog('add-vacation', s.empId || 'admin', emp + ' ' + date);
        res.json(r);
    } catch (e) { logError('add-vacation: ' + e.message); res.json({ success: false, message: e.message }); }
});

api.post('/remove-vacation', (req, res) => {
    const s = getSession(req);
    if (!s) return res.json({ success: false, message: 'Нет прав' });
    const { emp, date } = req.body;
    if (!allowed(s, emp)) return res.json({ success: false, message: 'Нет прав' });
    try {
        const r = schedule.removeVacation(emp, date);
        if (r.success) auditLog('remove-vacation', s.empId || 'admin', emp + ' ' + date);
        res.json(r);
    } catch (e) { logError('remove-vacation: ' + e.message); res.json({ success: false, message: e.message }); }
});

api.post('/approve-vacation', (req, res) => {
    const s = getSession(req);
    if (!isManagerOrAdmin(s)) return res.json({ success: false, message: 'Только руководитель/админ' });
    const { emp, date } = req.body;
    try {
        const r = schedule.approveVacation(emp, date);
        if (r.success) auditLog('approve-vacation', s.empId || 'admin', emp + ' ' + date);
        res.json(r);
    } catch (e) { logError('approve-vacation: ' + e.message); res.json({ success: false, message: e.message }); }
});

api.post('/reject-vacation', (req, res) => {
    const s = getSession(req);
    if (!isManagerOrAdmin(s)) return res.json({ success: false, message: 'Только руководитель/админ' });
    const { emp, date } = req.body;
    try {
        const r = schedule.rejectVacation(emp, date);
        if (r.success) auditLog('reject-vacation', s.empId || 'admin', emp + ' ' + date);
        res.json(r);
    } catch (e) { logError('reject-vacation: ' + e.message); res.json({ success: false, message: e.message }); }
});

/* --- Командировки --- */

api.get('/trips', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    const s = getSession(req);
    try {
        let data = schedule.readTrips();
        if (s.type === 'user' && s.role === 'worker') {
            data = data.filter(r => r.emp === s.empId);
        }
        res.json({ success: true, data });
    } catch (e) { logError('load-trips: ' + e.message); res.json({ success: false, message: e.message }); }
});

api.post('/add-trip', (req, res) => {
    const s = getSession(req);
    if (!s) return res.json({ success: false, message: 'Нет прав' });
    const { emp, date } = req.body;
    if (!allowed(s, emp)) return res.json({ success: false, message: 'Нет прав' });
    try {
        const r = schedule.addTrip(emp, date);
        if (r.success) auditLog('add-trip', s.empId || 'admin', emp + ' ' + date);
        res.json(r);
    } catch (e) { logError('add-trip: ' + e.message); res.json({ success: false, message: e.message }); }
});

api.post('/remove-trip', (req, res) => {
    const s = getSession(req);
    if (!s) return res.json({ success: false, message: 'Нет прав' });
    const { emp, date } = req.body;
    if (!allowed(s, emp)) return res.json({ success: false, message: 'Нет прав' });
    try {
        const r = schedule.removeTrip(emp, date);
        if (r.success) auditLog('remove-trip', s.empId || 'admin', emp + ' ' + date);
        res.json(r);
    } catch (e) { logError('remove-trip: ' + e.message); res.json({ success: false, message: e.message }); }
});

/* --- Сотрудники --- */

api.get('/employees', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    const s = getSession(req);
    try {
        let data = schedule.getEmployees();
        if (s.type === 'user' && s.role === 'worker') {
            data = [s.empId];
        }
        res.json({ success: true, data });
    } catch (e) { logError('get-employees: ' + e.message); res.json({ success: false, message: e.message }); }
});

/* --- Копирование рабочих дней с прошлого месяца --- */

api.post('/copy-month-work', (req, res) => {
    const s = getSession(req);
    if (!s) return res.json({ success: false, message: 'Нет прав' });
    const { emp, srcMonth, srcYear, dstMonth, dstYear } = req.body;
    if (!allowed(s, emp)) return res.json({ success: false, message: 'Нет прав' });
    try {
        const work = schedule.readWork().filter(r => r.emp === emp);
        const vac = schedule.readVacation().filter(r => r.emp === emp);
        const trip = schedule.readTrips().filter(r => r.emp === emp);
        let added = 0, skipped = 0;
        const dstDates = new Set();

        work.forEach(r => {
            const [d, m, y] = r.date.split('.').map(Number);
            if (m - 1 === srcMonth && y === srcYear) {
                const newDate = pad2(d) + '.' + pad2(dstMonth + 1) + '.' + dstYear;
                const dt = new Date(dstYear, dstMonth, d);
                if (dt.getMonth() !== dstMonth) { skipped++; return; }
                const exists = work.some(w => w.emp === emp && w.date === newDate);
                if (!exists) {
                    schedule.setWork(emp, newDate, r.start, r.end, r.lunch, r.rate, r.hourlyWage || 0, r.allowance || 0, r.allowanceType || '');
                    added++;
                } else { skipped++; }
                dstDates.add(newDate);
            }
        });

        vac.forEach(r => {
            const [d, m, y] = r.date.split('.').map(Number);
            if (m - 1 === srcMonth && y === srcYear) {
                const newDate = pad2(d) + '.' + pad2(dstMonth + 1) + '.' + dstYear;
                const dt = new Date(dstYear, dstMonth, d);
                if (dt.getMonth() !== dstMonth) return;
                const exists = vac.some(v => v.emp === emp && v.date === newDate);
                if (!exists) { schedule.addVacation(emp, newDate, isManagerOrAdmin(s) ? 'approved' : 'pending'); added++; }
            }
        });

        trip.forEach(r => {
            const [d, m, y] = r.date.split('.').map(Number);
            if (m - 1 === srcMonth && y === srcYear) {
                const newDate = pad2(d) + '.' + pad2(dstMonth + 1) + '.' + dstYear;
                const dt = new Date(dstYear, dstMonth, d);
                if (dt.getMonth() !== dstMonth) return;
                const exists = trip.some(t => t.emp === emp && t.date === newDate);
                if (!exists) { schedule.addTrip(emp, newDate); added++; }
            }
        });

        if (added) auditLog('copy-month', s.empId || 'admin', emp + ': ' + (srcMonth+1) + '.' + srcYear + ' → ' + (dstMonth+1) + '.' + dstYear + ' (' + added + ')');
        res.json({ success: true, message: 'Скопировано записей: ' + added + (skipped ? ', пропущено: ' + skipped : ''), added, skipped });
    } catch (e) { logError('copy-month-work: ' + e.message); res.json({ success: false, message: e.message }); }
});

/* --- Шаблоны расписания --- */

api.get('/templates', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    res.json({ success: true, data: templates.list() });
});

api.get('/template/:id', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    res.json({ success: true, data: templates.get(req.params.id) });
});

api.post('/save-template', (req, res) => {
    const s = getSession(req);
    if (!isManagerOrAdmin(s)) return res.json({ success: false, message: 'Только руководитель/админ' });
    const template = req.body.template || req.body;
    if (template.id && templates.get(template.id)) {
        const r = templates.update(template.id, template);
        if (r.success) auditLog('save-template', s.empId || 'admin', 'update ' + template.id);
        return res.json(r);
    }
    const r = templates.add(template);
    if (r.success) auditLog('save-template', s.empId || 'admin', 'add ' + (r.id || template.id));
    res.json(r);
});

api.post('/delete-template', (req, res) => {
    const s = getSession(req);
    if (!isManagerOrAdmin(s)) return res.json({ success: false, message: 'Только руководитель/админ' });
    const { id } = req.body;
    const r = templates.remove(id);
    if (r.success) auditLog('delete-template', s.empId || 'admin', id);
    res.json(r);
});

api.post('/apply-template', (req, res) => {
    const s = getSession(req);
    if (!s) return res.json({ success: false, message: 'Нет прав' });
    const { emp, id, month, year } = req.body;
    if (!allowed(s, emp)) return res.json({ success: false, message: 'Нет прав' });
    try {
        const tmpl = templates.get(id);
        if (!tmpl) return res.json({ success: false, message: 'Шаблон не найден' });
        const w = empWork(emp);
        const dim = new Date(year, month + 1, 0).getDate();
        let added = 0;
        const defaults = users.getDefaults(emp) || {};
        let cycleIdx = 0;
        for (let d = 1; d <= dim; d++) {
            const key = pad2(d) + '.' + pad2(month + 1) + '.' + year;
            const dt = new Date(year, month, d);
            if (dt.getDay() === 0 || dt.getDay() === 6) continue;
            if (isH(dt)) continue;
            if (w.has(key)) { cycleIdx++; continue; }
            const dayDef = tmpl.days.find(dd => dd.dayOffset === (cycleIdx % tmpl.cycleDays));
            if (dayDef && dayDef.isWork) {
                const start = dayDef.start || defaults.start || '09:00';
                const end = dayDef.end || defaults.end || '18:00';
                const lunch = dayDef.lunch != null && dayDef.lunch !== 0 ? dayDef.lunch : (defaults.lunch != null ? defaults.lunch : 1);
                const rate = dayDef.rate != null && dayDef.rate !== 0 ? dayDef.rate : (defaults.rate != null ? defaults.rate : 1);
                const hourlyWage = defaults.hourlyWage || 0;
                const r = schedule.setWork(emp, key, start, end, lunch, rate, hourlyWage, 0, '');
                if (r.success) added++;
            }
            cycleIdx++;
        }
        if (added) auditLog('apply-template', s.empId || 'admin', emp + ' ' + id + ' (' + added + ')');
        res.json({ success: true, message: 'Добавлено рабочих дней: ' + added, added });
    } catch (e) { logError('apply-template: ' + e.message); res.json({ success: false, message: e.message }); }
});

/* --- Зарплата за месяц --- */

api.get('/monthly-pay/:month/:year', (req, res) => {
    const s = getSession(req);
    if (!isManagerOrAdmin(s)) return res.json({ success: false, message: 'Только руководитель/админ' });
    const month = parseInt(req.params.month);
    const year = parseInt(req.params.year);
    try {
        const work = schedule.readWork();
        const emps = schedule.getEmployees();
        const result = [];
        for (const emp of emps) {
            const empWorkDays = work.filter(r => r.emp === emp);
            let totalHours = 0, totalPay = 0, totalAllowances = 0;
            empWorkDays.forEach(r => {
                const [d, m, y] = r.date.split('.').map(Number);
                if (m - 1 !== month || y !== year) return;
                const [sh, sm] = (r.start || '09:00').split(':').map(Number);
                const [eh, em] = (r.end || '18:00').split(':').map(Number);
                const factHours = Math.max(0, (eh + em / 60) - (sh + sm / 60) - (r.lunch || 0));
                const wage = r.hourlyWage || 0;
                const allowance = r.allowance || 0;
                totalHours += factHours;
                totalPay += factHours * wage;
                totalAllowances += allowance;
            });
            result.push({ emp, totalHours: +totalHours.toFixed(2), totalPay: +totalPay.toFixed(2),
                totalAllowances: +totalAllowances.toFixed(2),
                grandTotal: +(totalPay + totalAllowances).toFixed(2) });
        }
        res.json({ success: true, data: result });
    } catch (e) { logError('get-monthly-pay: ' + e.message); res.json({ success: false, message: e.message }); }
});

/* --- Экспорт --- */

api.post('/export-excel', (req, res) => {
    const s = getSession(req);
    if (!isManagerOrAdmin(s)) return res.json({ success: false, message: 'Только руководитель/админ' });
    const { breakType } = req.body;
    try {
        const tabMap = {};
        users.listUsers().forEach(u => { tabMap[u.id] = u.tabNum || ''; });
        const r = schedule.exportStructured(exportExcelPath, breakType, tabMap);
        if (r.success && fs.existsSync(exportExcelPath)) {
            res.download(exportExcelPath, path.basename(exportExcelPath));
        } else {
            res.json(r);
        }
    } catch (e) { logError('export-excel: ' + e.message); res.json({ success: false, message: e.message }); }
});

api.post('/export-r7', (req, res) => {
    const s = getSession(req);
    if (!isManagerOrAdmin(s)) return res.json({ success: false, message: 'Только руководитель/админ' });
    const { breakType } = req.body;
    try {
        const tabMap = {};
        users.listUsers().forEach(u => { tabMap[u.id] = u.tabNum || ''; });
        const r = schedule.exportStructured(exportR7Path, breakType, tabMap);
        if (r.success && fs.existsSync(exportR7Path)) {
            res.download(exportR7Path, path.basename(exportR7Path));
        } else {
            res.json(r);
        }
    } catch (e) { logError('export-r7: ' + e.message); res.json({ success: false, message: e.message }); }
});

/* --- Заметки к датам --- */

api.get('/notes/:dateStr', (req, res) => {
    const s = getSession(req);
    if (!s || !canUseNotes(s)) return res.json({ success: false, message: 'Нет прав' });
    const all = loadNotesFile();
    res.json({ success: true, data: all[req.params.dateStr] || [] });
});

api.post('/add-note', (req, res) => {
    const s = getSession(req);
    if (!s || !canUseNotes(s)) return res.json({ success: false, message: 'Нет прав' });
    const { dateStr, text, replyTo, attachments } = req.body;
    const trimmed = String(text || '').trim();
    if (!trimmed && (!attachments || !attachments.length)) return res.json({ success: false, message: 'Пустой текст' });
    if (trimmed.length > 500) return res.json({ success: false, message: 'Текст слишком длинный (макс. 500 символов)' });
    const all = loadNotesFile();
    if (!all[dateStr]) all[dateStr] = [];
    const u = s.type === 'admin' ? null : users.getUser(s.empId);
    const authorName = s.type === 'admin' ? 'Администратор' : (u ? u.name : s.empId);
    const note = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        author: s.empId || 'admin',
        authorName,
        text: trimmed,
        ts: new Date().toISOString()
    };
    if (replyTo) note.replyTo = replyTo;
    if (attachments && attachments.length) note.attachments = attachments;
    all[dateStr].push(note);
    saveNotesFile(all);
    auditLog('add-note', s.empId || 'admin', dateStr + ': ' + trimmed.slice(0, 40) + (attachments && attachments.length ? ' [' + attachments.length + ' файл]' : ''));
    res.json({ success: true });
});

api.post('/delete-note', (req, res) => {
    const s = getSession(req);
    if (!s || !canUseNotes(s)) return res.json({ success: false, message: 'Нет прав' });
    const { dateStr, id } = req.body;
    const all = loadNotesFile();
    if (!all[dateStr]) return res.json({ success: false, message: 'Нет заметок' });
    const isAdmMgr = s.type === 'admin' || s.role === 'manager';
    const before = all[dateStr].length;
    all[dateStr] = all[dateStr].filter(n => {
        if (n.id !== id) return true;
        return !isAdmMgr && n.author !== (s.empId || 'admin');
    });
    if (all[dateStr].length === before) return res.json({ success: false, message: 'Нет прав на удаление этой заметки' });
    saveNotesFile(all);
    res.json({ success: true });
});

api.post('/edit-note', (req, res) => {
    const s = getSession(req);
    if (!s || !canUseNotes(s)) return res.json({ success: false, message: 'Нет прав' });
    const { dateStr, id, text } = req.body;
    const trimmed = String(text || '').trim();
    if (!trimmed) return res.json({ success: false, message: 'Пустой текст' });
    if (trimmed.length > 500) return res.json({ success: false, message: 'Текст слишком длинный (макс. 500)' });
    const all = loadNotesFile();
    if (!all[dateStr]) return res.json({ success: false, message: 'Нет заметок' });
    const note = all[dateStr].find(n => n.id === id);
    if (!note) return res.json({ success: false, message: 'Заметка не найдена' });
    if (s.type !== 'admin' && note.author !== (s.empId || ''))
        return res.json({ success: false, message: 'Нет прав на редактирование' });
    note.text = trimmed;
    note.edited = new Date().toISOString();
    saveNotesFile(all);
    auditLog('edit-note', s.empId || 'admin', dateStr + ': ' + trimmed.slice(0, 40));
    res.json({ success: true });
});

api.post('/set-notes-perm', (req, res) => {
    const s = getSession(req);
    if (!s || s.type !== 'admin') return res.json({ success: false, message: 'Только администратор' });
    const { empId, allowed } = req.body;
    const r = users.setNotesPerm(empId, allowed);
    if (r.success) auditLog('set-notes-perm', 'admin', empId + ' → ' + (allowed ? 'on' : 'off'));
    res.json(r);
});

api.post('/upload-attachment', upload.single('file'), (req, res) => {
    const s = getSession(req);
    if (!s || !canUseNotes(s)) return res.status(403).json({ success: false, message: 'Нет прав' });
    if (!req.file) return res.json({ success: false, message: 'Файл не получен' });
    if (!ALLOWED_MIME.includes(req.file.mimetype)) {
        fs.unlinkSync(req.file.path);
        return res.json({ success: false, message: 'Неподдерживаемый тип файла' });
    }
    const info = {
        id: path.basename(req.file.path),
        name: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size
    };
    auditLog('upload-attachment', s.empId || 'admin', info.name + ' (' + info.size + ')');
    res.json({ success: true, attachment: info });
});

api.get('/file/:id', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.status(401).json(auth);
    const filePath = path.join(ATTACH_DIR, req.params.id);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Файл не найден' });
    res.sendFile(filePath);
});

api.get('/notes-index', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    const s = getSession(req);
    if (!canUseNotes(s)) return res.json({ success: false, message: 'Нет прав' });
    const all = loadNotesFile();
    const idx = {};
    for (const [date, arr] of Object.entries(all)) {
        if (Array.isArray(arr) && arr.length) idx[date] = arr.length;
    }
    res.json({ success: true, data: idx });
});

api.get('/notes-since', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    const s = getSession(req);
    if (!canUseNotes(s)) return res.json({ success: true, data: [] });
    const sinceTs = req.query.sinceTs;
    const all = loadNotesFile();
    const myAuthor = s.empId || 'admin';
    const result = [];
    for (const [date, arr] of Object.entries(all)) {
        if (!Array.isArray(arr)) continue;
        arr.forEach(n => {
            if (n.ts > sinceTs && n.author !== myAuthor) result.push({ date, ...n });
        });
    }
    res.json({ success: true, data: result });
});

api.get('/search-notes', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    const s = getSession(req);
    if (!canUseNotes(s)) return res.json({ success: false, message: 'Нет прав' });
    const query = String(req.query.q || '').trim().toLowerCase();
    if (!query) return res.json({ success: true, data: [] });
    const all = loadNotesFile();
    const result = [];
    for (const [date, arr] of Object.entries(all)) {
        if (!Array.isArray(arr)) continue;
        arr.forEach(n => {
            if (n.text.toLowerCase().includes(query) ||
                (n.authorName || '').toLowerCase().includes(query)) {
                result.push({ date, id: n.id, author: n.author, authorName: n.authorName || n.author, text: n.text, ts: n.ts, replyTo: n.replyTo || null });
            }
        });
    }
    result.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    res.json({ success: true, data: result.slice(0, 100) });
});

api.get('/note-events-since', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    const s = getSession(req);
    const sinceTs = req.query.sinceTs;
    try {
        if (!fs.existsSync(AUDIT_PATH)) return res.json({ success: true, data: [] });
        const log = dataCrypto.decrypt(fs.readFileSync(AUDIT_PATH, 'utf-8')) || [];
        const myAuthor = s.empId || 'admin';
        const events = log.filter(e =>
            e.ts > sinceTs &&
            e.user !== myAuthor &&
            (e.action === 'edit-note' || e.action === 'add-note')
        );
        res.json({ success: true, data: events.slice(-30) });
    } catch (e) { logError('load-note-events-since: ' + e.message); res.json({ success: true, data: [] }); }
});

/* --- Задачи по времени --- */

api.get('/tasks/:dateStr', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    res.json({ success: true, data: tasks.loadByDate(req.params.dateStr) });
});

api.post('/tasks-range', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    res.json({ success: true, data: tasks.loadByDateRange(req.body.dates) });
});

api.get('/tasks-index', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    res.json({ success: true, data: tasks.loadIndex() });
});

api.post('/add-task', (req, res) => {
    const s = getSession(req);
    if (!s) return res.json({ success: false, message: 'Не авторизован' });
    const { date, time, duration, title, desc, assignee } = req.body;
    const trimmedTitle = String(title || '').trim();
    if (!trimmedTitle) return res.json({ success: false, message: 'Укажите название задачи' });
    const empAssignee = String(assignee || '').trim() || (s.empId || 'admin');
    const r = tasks.add({
        date,
        time: String(time || '').trim(),
        duration: parseInt(duration) || 30,
        title: trimmedTitle,
        desc: String(desc || '').trim(),
        author: s.empId || 'admin',
        assignee: empAssignee
    });
    if (r.success) auditLog('add-task', s.empId || 'admin', date + ' ' + time + ' ' + trimmedTitle.slice(0, 30) + ' → ' + empAssignee);
    res.json(r);
});

api.post('/update-task', (req, res) => {
    const s = getSession(req);
    if (!s) return res.json({ success: false, message: 'Не авторизован' });
    const { taskId, changes } = req.body;
    const taskList = tasks._load();
    const t = taskList.find(x => x.id === taskId);
    if (!t) return res.json({ success: false, message: 'Задача не найдена' });
    if (!isManagerOrAdmin(s) && t.author !== (s.empId || 'admin') && t.assignee !== s.empId) {
        return res.json({ success: false, message: 'Нет прав на редактирование этой задачи' });
    }
    const r = tasks.update(taskId, changes);
    if (r.success) auditLog('update-task', s.empId || 'admin', taskId);
    res.json(r);
});

api.post('/remove-task', (req, res) => {
    const s = getSession(req);
    if (!s) return res.json({ success: false, message: 'Не авторизован' });
    const { taskId } = req.body;
    const taskList = tasks._load();
    const t = taskList.find(x => x.id === taskId);
    if (!t) return res.json({ success: false, message: 'Задача не найдена' });
    if (!isManagerOrAdmin(s) && t.author !== (s.empId || 'admin') && t.assignee !== s.empId) {
        return res.json({ success: false, message: 'Нет прав на удаление этой задачи' });
    }
    const r = tasks.remove(taskId);
    if (r.success) auditLog('remove-task', s.empId || 'admin', taskId);
    res.json(r);
});

api.post('/complete-task', (req, res) => {
    const s = getSession(req);
    if (!s) return res.json({ success: false, message: 'Не авторизован' });
    const { taskId, note } = req.body;
    const all = tasks._load();
    const t = all.find(x => x.id === taskId);
    if (!t) return res.json({ success: false, message: 'Задача не найдена' });
    const isAssignee = s.empId === t.assignee;
    const isAuth = isManagerOrAdmin(s) || isAssignee;
    if (!isAuth) return res.json({ success: false, message: 'Нет прав' });
    const r = tasks.complete(taskId, note);
    if (r.success) auditLog('complete-task', s.empId || 'admin', taskId + ': ' + String(note || '').slice(0, 40));
    res.json(r);
});

api.post('/cancel-task', (req, res) => {
    const s = getSession(req);
    if (!s) return res.json({ success: false, message: 'Не авторизован' });
    const { taskId, reason } = req.body;
    const all = tasks._load();
    const t = all.find(x => x.id === taskId);
    if (!t) return res.json({ success: false, message: 'Задача не найдена' });
    const isAssignee = s.empId === t.assignee;
    const isAuth = isManagerOrAdmin(s) || isAssignee;
    if (!isAuth) return res.json({ success: false, message: 'Нет прав' });
    const r = tasks.cancel(taskId, reason);
    if (r.success) auditLog('cancel-task', s.empId || 'admin', taskId + ': ' + String(reason || '').slice(0, 40));
    res.json(r);
});

api.get('/task-mtime', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    res.json({ success: true, mtime: tasks.getMtime() });
});

/* --- Defaults --- */

api.post('/set-emp-defaults', (req, res) => {
    const s = getSession(req);
    if (!s) return res.json({ success: false, message: 'Нет прав' });
    const { empId, defaults } = req.body;
    if (s.type !== 'admin' && s.empId !== empId) return res.json({ success: false, message: 'Нет прав' });
    res.json(users.setDefaults(empId, defaults));
});

api.get('/emp-defaults/:empId', (req, res) => {
    const auth = requireAuth(req);
    if (auth) return res.json(auth);
    res.json({ success: true, data: users.getDefaults(req.params.empId) });
});

/* --- Восстановление ключа шифрования --- */

api.post('/restore-enc-key', (req, res) => {
    const s = getSession(req);
    if (!s || s.type !== 'admin') return res.json({ success: false, message: 'Только администратор' });
    const backupDir = path.join(DATA_ROOT, 'data', 'backups');
    if (!fs.existsSync(backupDir)) return res.json({ success: false, message: 'Нет бэкапов' });
    const backups = fs.readdirSync(backupDir).filter(d => d.startsWith('backup_')).sort().reverse();
    for (const b of backups) {
        const keyBackup = path.join(backupDir, b, '.enc_key');
        if (fs.existsSync(keyBackup)) {
            const restored = dataCrypto.restoreKey(path.join(backupDir, b));
            if (restored) return res.json({ success: true, message: 'Ключ восстановлен из бэкапа ' + b });
        }
    }
    res.json({ success: false, message: 'Ключ не найден в бэкапах' });
});

/* --- Импорт графика --- */

api.post('/import-schedule', (req, res) => {
    const s = getSession(req);
    if (!isManagerOrAdmin(s)) return res.json({ success: false, message: 'Только руководитель/админ' });
    const { filePath } = req.body;
    try {
        if (!filePath || !fs.existsSync(filePath)) return res.json({ success: false, message: 'Файл не найден' });
        const tmpPath = schedulePath + '.import';
        fs.copyFileSync(filePath, tmpPath);
        const imported = new ScheduleManager(tmpPath, config.maxPerDate || 2);
        const work = imported.readWork();
        const vac = imported.readVacation();
        const trips = imported.readTrips();
        const emps = imported.getEmployees();
        let added = 0;
        emps.forEach(emp => {
            work.filter(r => r.emp === emp).forEach(r => {
                if (!schedule.readWork().some(w => w.emp === emp && w.date === r.date)) {
                    schedule.setWork(emp, r.date, r.start, r.end, r.lunch, r.rate, r.hourlyWage || 0, r.allowance || 0, r.allowanceType || '');
                    added++;
                }
            });
            vac.filter(r => r.emp === emp).forEach(r => {
                if (!schedule.readVacation().some(v => v.emp === emp && v.date === r.date)) {
                    schedule.addVacation(emp, r.date, r.status || 'approved');
                    added++;
                }
            });
            trips.filter(r => r.emp === emp).forEach(r => {
                if (!schedule.readTrips().some(t => t.emp === emp && t.date === r.date)) {
                    schedule.addTrip(emp, r.date);
                    added++;
                }
            });
        });
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        if (added) auditLog('import-schedule', s.empId || 'admin', filePath + ' (' + added + ' записей)');
        res.json({ success: true, message: 'Импортировано записей: ' + added, added });
    } catch (e) { logError('import-schedule: ' + e.message); res.json({ success: false, message: e.message }); }
});

/* --- Повторяющиеся задачи --- */

api.post('/add-recurring-task', (req, res) => {
    const s = getSession(req);
    if (!s) return res.json({ success: false, message: 'Не авторизован' });
    const rule = req.body.rule || req.body;
    try {
        const { title, desc, time, duration, assignee, weekdays, startDate, endDate } = rule;
        if (!title || !weekdays || !weekdays.length || !startDate || !endDate) {
            return res.json({ success: false, message: 'Заполните все поля' });
        }
        const [sd, sm, sy] = startDate.split('.').map(Number);
        const [ed, em, ey] = endDate.split('.').map(Number);
        const start = new Date(sy, sm - 1, sd);
        const end = new Date(ey, em - 1, ed);
        let added = 0;
        for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
            const dow = dt.getDay();
            if (!weekdays.includes(dow)) continue;
            const dateStr = pad2(dt.getDate()) + '.' + pad2(dt.getMonth() + 1) + '.' + dt.getFullYear();
            const empAssignee = String(assignee || '').trim() || (s.empId || 'admin');
            tasks.add({
                date: dateStr,
                time: String(time || '').trim(),
                duration: parseInt(duration) || 30,
                title,
                desc: String(desc || '').trim(),
                author: s.empId || 'admin',
                assignee: empAssignee,
                recurring: true
            });
            added++;
        }
        if (added) auditLog('add-recurring', s.empId || 'admin', title + ' (' + added + ')');
        res.json({ success: true, message: 'Создано задач: ' + added, added });
    } catch (e) { logError('add-recurring: ' + e.message); res.json({ success: false, message: e.message }); }
});

/* ============================================================
 *  Запуск сервера
 * ============================================================ */

initModules();

const PORT = config.port || process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const nets = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
        }
    }
    console.log('');
    console.log('=== НаРаботеLIVE ANDROID WEB Server ===');
    console.log('  Локально:    http://localhost:' + PORT);
    ips.forEach(ip => console.log('  Сеть:        http://' + ip + ':' + PORT));
    console.log('  Телефон:     Введите адрес выше в приложении');
    console.log('  DATA_ROOT:   ' + DATA_ROOT);
    console.log('');

    /* --- Туннель для доступа из интернета --- */
    if (process.argv.includes('--tunnel') || process.env.NARABOTE_TUNNEL) {
        const { spawn } = require('child_process');
        let tunnelUrl = null;
        let retries = 0;

        function startCloudflared() {
            try {
                const proc = spawn('cloudflared', ['tunnel', '--protocol', 'http2', '--url', 'http://127.0.0.1:' + PORT], { stdio: ['ignore', 'pipe', 'pipe'] });
                let found = false;
                proc.stderr.on('data', d => {
                    const txt = d.toString();
                    const m = txt.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
                    if (m && !found) {
                        found = true;
                        tunnelUrl = m[0];
                        retries = 0;
                        console.log('  Туннель:     ' + tunnelUrl);
                        console.log('  Телефон:     Введите адрес туннеля в приложении');
                        console.log('');
                    }
                    if (txt.includes('Registered tunnel connection')) {
                        console.log('  [cloudflared] Подключено к Cloudflare');
                    }
                    if (txt.includes('Retrying connection') || txt.includes('Connection terminated')) {
                        console.log('  [cloudflared] Переподключение...');
                    }
                });
                proc.stdout.on('data', d => {
                    const m = d.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
                    if (m && !found) { found = true; tunnelUrl = m[0]; console.log('  Туннель:     ' + tunnelUrl); }
                });
                proc.on('close', (code) => {
                    console.log('  [cloudflared] Завершён (код ' + code + ')');
                    retries++;
                    if (retries < 10) {
                        console.log('  [cloudflared] Перезапуск через 3с...');
                        setTimeout(startCloudflared, 3000);
                    }
                });
                proc.on('error', () => {
                    console.log('  Cloudflared не найден, пробуем localtunnel...');
                    startLocaltunnel();
                });
            } catch (_) {
                startLocaltunnel();
            }
        }

        function startLocaltunnel() {
            try {
                const lt = require('localtunnel');
                lt({ port: PORT }).then(tunnel => {
                    tunnelUrl = tunnel.url;
                    console.log('  Туннель:     ' + tunnelUrl);
                    console.log('  Телефон:     Введите адрес туннеля в приложении');
                    console.log('');
                    tunnel.on('close', () => { console.log('  Туннель закрыт, перезапуск...'); startLocaltunnel(); });
                }).catch(e => { console.error('  Ошибка localtunnel:', e.message); });
            } catch (e) { console.error('  Ошибка туннеля:', e.message); }
        }

        startCloudflared();
    }
});

module.exports = { app, server };
