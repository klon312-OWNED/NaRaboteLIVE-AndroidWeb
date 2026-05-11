/* ============================================================
 *  Copyright (c) 2026 Антипин Андрей Александрович
 *  All rights reserved. See LICENSE file.
 * ============================================================
 *  НАРАБОТЕ — Клиентский скрипт (app.js)
 * ============================================================
 *  Роли:
 *    • Администратор — полный доступ, управление пользователями,
 *      сброс паролей, назначение ролей.
 *    • Руководитель — полный доступ ко всем данным, бронирование
 *      дат (забронированные даты блокируют отпуск для всех).
 *    • Сотрудник — только СВОИ данные, нет бронирования,
 *      не видит чужую статистику/пересечения.
 *
 *  Регистрация — логин + пароль + имя (роль worker по умолчанию).
 * ============================================================ */

(function () {
    'use strict';

    /* ==========================================================
     *  WEB API POLYFILL (для PWA/мобильной версии)
     *  Если нет Electron preload (window.api), создаём
     *  обёртку над REST API сервера.
     * ========================================================== */

    if (!window.api) {
        const DEFAULT_SERVER = 'https://narabote-live.onrender.com';
        let API_BASE = localStorage.getItem('narabote-server-url') || '';
        if (!API_BASE) API_BASE = DEFAULT_SERVER;
        if (API_BASE) API_BASE = API_BASE.replace(/\/$/, '');
        let API = API_BASE ? API_BASE + '/api/' : '/api/';
        const _json = r => r.json();
        const GET = p => fetch(API + p).then(_json);
        const POST = (p, body) => fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' }).then(_json);

        window._setServerUrl = function(url) {
            url = url.replace(/\/$/, '');
            API_BASE = url;
            API = url + '/api/';
            localStorage.setItem('narabote-server-url', url);
        };
        window._getServerUrl = function() { return API_BASE; };
        window._isWebMode = true;

        const _listeners = {};
        window.api = {
            adminLogin: (l, p) => POST('admin-login', { login: l, pass: p }),
            userLogin: (l, p) => POST('user-login', { login: l, pass: p }),
            register: (l, p, n, t) => POST('register', { login: l, pass: p, name: n, tab: t }),
            logout: () => POST('logout'),
            getSession: () => GET('session'),
            getConfig: () => GET('config'),
            getDataMtime: () => GET('data-mtime'),
            listUsers: () => GET('users'),
            setRole: (e, r) => POST('set-role', { empId: e, role: r }),
            renameUser: (e, n) => POST('rename-user', { empId: e, newName: n }),
            deleteUser: e => POST('delete-user', { empId: e }),
            resetPassword: (e, p) => POST('reset-password', { empId: e, newPass: p }),
            changeAdminPassword: (o, n) => POST('change-admin-password', { old: o, newPass: n }),
            setUserColor: (e, c) => POST('set-user-color', { empId: e, color: c }),
            loadSchedule: () => GET('schedule'),
            lockDate: d => POST('lock-date', { date: d }),
            unlockDate: d => POST('unlock-date', { date: d }),
            bookDate: (d, e) => POST('book-date', { date: d, emp: e }),
            cancelBooking: (d, e) => POST('cancel-booking', { date: d, emp: e }),
            cancelBookingsRange: (f, t) => POST('cancel-bookings-range', { from: f, to: t }),
            loadWork: () => GET('work'),
            setWork: (e, d, s, en, l, r, hw, al, at) => POST('set-work', { emp: e, date: d, start: s, end: en, lunch: l, rate: r, hourlyWage: hw, allowance: al, allowanceType: at }),
            removeWork: (e, d) => POST('remove-work', { emp: e, date: d }),
            loadVacation: () => GET('vacation'),
            addVacation: (e, d) => POST('add-vacation', { emp: e, date: d }),
            removeVacation: (e, d) => POST('remove-vacation', { emp: e, date: d }),
            approveVacation: (e, d) => POST('approve-vacation', { emp: e, date: d }),
            rejectVacation: (e, d) => POST('reject-vacation', { emp: e, date: d }),
            loadTrips: () => GET('trips'),
            addTrip: (e, d) => POST('add-trip', { emp: e, date: d }),
            removeTrip: (e, d) => POST('remove-trip', { emp: e, date: d }),
            getEmployees: () => GET('employees'),
            loadAudit: () => GET('audit'),
            loadNotifications: s => GET('notifications?sinceTs=' + encodeURIComponent(s)),
            exportExcel: b => fetch(API + 'export-excel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ breakType: b }), credentials: 'include' }).then(r => r.blob()),
            exportR7: b => fetch(API + 'export-r7', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ breakType: b }), credentials: 'include' }).then(r => r.blob()),
            openExportFolder: () => Promise.resolve({ success: true }),
            selectFile: () => Promise.resolve({ success: false, message: 'Недоступно в веб-версии' }),
            loadNotes: d => GET('notes/' + encodeURIComponent(d)),
            addNote: (d, t, r, atts) => POST('add-note', { dateStr: d, text: t, replyTo: r || '', attachments: atts || [] }),
            deleteNote: (d, i) => POST('delete-note', { dateStr: d, id: i }),
            editNote: (d, i, t) => POST('edit-note', { dateStr: d, id: i, text: t }),
            setNotesPerm: (e, a) => POST('set-notes-perm', { empId: e, allowed: a }),
            loadNotesIndex: () => GET('notes-index'),
            loadNotesSince: s => GET('notes-since?sinceTs=' + encodeURIComponent(s)),
            searchNotes: q => GET('search-notes?q=' + encodeURIComponent(q)),
            copyMonthWork: (e, sm, sy, dm, dy) => POST('copy-month-work', { emp: e, srcMonth: sm, srcYear: sy, dstMonth: dm, dstYear: dy }),
            setEmpDefaults: (e, d) => POST('set-emp-defaults', { empId: e, defaults: d }),
            getEmpDefaults: e => GET('emp-defaults/' + encodeURIComponent(e)),
            loadTasks: d => GET('tasks/' + encodeURIComponent(d)),
            loadTasksRange: dates => POST('tasks-range', { dates }),
            loadTasksIndex: () => GET('tasks-index'),
            addTask: (d, t, dur, title, desc, assignee) => POST('add-task', { date: d, time: t, duration: dur, title, desc, assignee }),
            updateTask: (id, ch) => POST('update-task', { taskId: id, changes: ch }),
            removeTask: id => POST('remove-task', { taskId: id }),
            completeTask: (id, n) => POST('complete-task', { taskId: id, note: n }),
            cancelTask: (id, r) => POST('cancel-task', { taskId: id, reason: r }),
            getTaskMtime: () => GET('task-mtime'),
            startTaskNotifier: () => Promise.resolve({ success: true }),
            stopTaskNotifier: () => Promise.resolve({ success: true }),
            loadNoteEventsSince: s => GET('note-events-since?sinceTs=' + encodeURIComponent(s)),
            onTaskNotify: cb => { _listeners['task-notify'] = cb; },
            listTemplates: () => GET('templates'),
            getTemplate: id => GET('template/' + encodeURIComponent(id)),
            saveTemplate: t => POST('save-template', { template: t }),
            deleteTemplate: id => POST('delete-template', { id }),
            applyTemplate: (e, id, m, y) => POST('apply-template', { emp: e, id, month: m, year: y }),
            getMonthlyPay: (m, y) => GET('monthly-pay/' + m + '/' + y),
            checkUpdate: () => Promise.resolve({ success: false, message: 'ANDROID WEB — обновление через сервер' }),
            downloadUpdate: () => Promise.resolve({ success: false }),
            installUpdate: () => Promise.resolve(),
            onUpdateAvailable: cb => {},
            onUpdateReady: cb => {},
            importSchedule: fp => POST('import-schedule', { filePath: fp }),
            addRecurringTask: rule => POST('add-recurring-task', { rule }),
            restoreEncKey: () => POST('restore-enc-key'),
            uploadAttachment: file => {
                const fd = new FormData();
                fd.append('file', file);
                return fetch(API + 'upload-attachment', { method: 'POST', body: fd, credentials: 'include' }).then(r => r.json());
            },
            getAttachmentUrl: id => API_BASE ? API_BASE + '/api/file/' + encodeURIComponent(id) : '/api/file/' + encodeURIComponent(id),
            getAttachmentPath: id => Promise.resolve({ success: true, path: API_BASE ? API_BASE + '/api/file/' + encodeURIComponent(id) : '/api/file/' + encodeURIComponent(id) }),
            setUserColor: (e, c) => POST('set-user-color', { empId: e, color: c })
        };
    }

    /* ==========================================================
     *  УТИЛИТЫ
     * ========================================================== */

    const $ = id => document.getElementById(id);
    function pad(n) { return n.toString().padStart(2, '0'); }
    function fk(d, m, y) { return pad(d) + '.' + pad(m + 1) + '.' + y; }
    function tH(t) { const p = t.split(':').map(Number); return p[0] + (p[1] || 0) / 60; }
    function sk(a) {
        return a.sort((x, y) => {
            const [d1, m1, y1] = x.split('.').map(Number);
            const [d2, m2, y2] = y.split('.').map(Number);
            return (y1 - y2) || (m1 - m2) || (d1 - d2);
        });
    }
    /* Конвертация дат для <input type="date"> */
    function appDateToInput(dt) { /* "dd.mm.yyyy" → "yyyy-mm-dd" */
        if (!dt) return '';
        const [d, m, y] = dt.split('.');
        return y + '-' + m + '-' + d;
    }
    function inputToAppDate(val) { /* "yyyy-mm-dd" → "dd.mm.yyyy" */
        if (!val) return '';
        const [y, m, d] = val.split('-');
        return d + '.' + m + '.' + y;
    }

    const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                     'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

    /* ==========================================================
     *  ПРОИЗВОДСТВЕННЫЙ КАЛЕНДАРЬ 2026
     * ========================================================== */

    const HOL = new Set([
        '01.01','02.01','03.01','04.01','05.01','06.01','07.01','08.01',
        '23.02','08.03','09.03','01.05','02.05','03.05',
        '09.05','10.05','11.05','12.06','13.06','14.06','04.11'
    ]);
    const PRE = new Set(['07.03','30.04','08.05','11.06','03.11','31.12']);

    function isH(dt) { return HOL.has(pad(dt.getDate()) + '.' + pad(dt.getMonth() + 1)); }
    function isW(dt) { const w = dt.getDay(); return w === 0 || w === 6; }
    function isP(dt) {
        const k = pad(dt.getDate()) + '.' + pad(dt.getMonth() + 1);
        return PRE.has(k) && !isW(dt) && !isH(dt);
    }

    window.onerror = (msg, src, line, col, err) => {
        console.error('FATAL:', msg, src, line, col, err);
        toast('JS Error: ' + msg, 'error');
    };

    /* ==========================================================
     *  СОСТОЯНИЕ
     * ========================================================== */

    let config = {};
    let session = { type: null, empId: null, role: null, canNotes: false };

    let employeeId = '';
    let viewingEmp = '';

    let scheduleData = [];
    let workData = [];
    let vacData = [];
    let tripData = [];
    let allEmployees = [];
    let userColorMap = {};
    let templatesList = [];
    let salaryData = [];
    /** Индекс заметок: { "dd.mm.yyyy": count } */
    let notesIndex = {};
    /** Последнее время проверки новых заметок (ISO-строка) */
    let _lastNotesTs = '';
    /** Фильтр заметок по автору: null = все */
    let notesAuthorFilter = null;
    let replyingTo = null;

    let curMonth = 3, curYear = 2026, selectedDate = null;
    /** mtime файлов для оптимизации автообновления */
    let _lastMtime = { schedule: 0, users: 0, notes: 0 };
    /** Режим: 'none' | 'book' | 'work' | 'vacation' | 'trip' */
    let markMode = 'none';
    /** Для Shift+Click выделения диапазона */
    let lastClickedDate = null;
    /** Лимит отпускных дней по ТК РФ */
    const VACATION_LIMIT = 28;
    /** Интервал автообновления (мс) */
    const RELOAD_INTERVAL = 1500;
    let reloadTimer = null;
    /** Автоблокировка при неактивности */
    const INACTIVITY_TIMEOUT = 5 * 60 * 1000;
    let _inactivityTimer = null;
    let _lastActivity = Date.now();
    /** Последняя метка аудита для уведомлений */
    let _lastAuditTs = '';
    /** Фильтр статистики: 'all' | 'month' | 'quarter' | 'year' */
    let statsFilter = 'all';
    /** Словарь действий для уведомлений */
    const NOTIFY_LABELS = {
        'book': '📋 Бронирование',
        'cancel-booking': '🔓 Отмена брони',
        'lock-date': '🔒 Дата заблокирована',
        'unlock-date': '🔓 Блокировка снята',
        'set-role': '👤 Роль изменена',
        'add-vacation': '🏖 Отпуск добавлен',
        'remove-vacation': '🏖 Отпуск удалён',
        'add-trip': '✈ Командировка',
        'remove-trip': '✈ Команд. удалена',
        'set-work': '🔨 Рабочий день',
        'remove-work': '🔨 Раб. день удалён',
        'delete-user': '🗑 Пользователь удалён'
    };

    /* ==========================================================
     *  ВСПОМОГАТЕЛЬНЫЕ: права
     * ========================================================== */

    function isAdmin() { return session.type === 'admin'; }
    function isManagerOrAdmin() {
        return session.type === 'admin' || session.role === 'manager';
    }
    function isWorker() { return session.type === 'user' && session.role === 'worker'; }
    function canEdit() { return isManagerOrAdmin() || viewingEmp === employeeId; }
    function canUseNotes() { return session.type === 'admin' || !!session.canNotes; }

    /* ==========================================================
     *  ИНИЦИАЛИЗАЦИЯ
     * ========================================================== */

    async function init() {
        if (window._isWebMode) {
            const saved = localStorage.getItem('narabote-server-url');
            const serverUrl = (saved || window._getServerUrl() || '').replace(/\/$/, '');
            const currentOrigin = (window.location.origin || '').replace(/\/$/, '');
            const alreadyOnServer = serverUrl && currentOrigin && serverUrl === currentOrigin;

            if (serverUrl) {
                window._setServerUrl(serverUrl);
                try {
                    const ctrl = new AbortController();
                    const timer = setTimeout(() => ctrl.abort(), 15000);
                    const test = await fetch(serverUrl + '/api/config', {credentials:'include', signal:ctrl.signal}).then(r=>r.json());
                    clearTimeout(timer);
                    if (test && test.success !== undefined) {
                        $('serverScreen').classList.remove('active');
                        $('authScreen').classList.add('active');
                    } else {
                        $('serverScreen').classList.add('active');
                        $('authScreen').classList.remove('active');
                    }
                } catch (_) {
                    if (alreadyOnServer) {
                        $('serverScreen').classList.add('active');
                        $('authScreen').classList.remove('active');
                    } else {
                        window.location.href = serverUrl + '/';
                        return;
                    }
                }
            } else if (window.location.protocol !== 'file:' && currentOrigin && currentOrigin !== 'null') {
                window._setServerUrl(currentOrigin);
                try {
                    const ctrl = new AbortController();
                    const timer = setTimeout(() => ctrl.abort(), 15000);
                    const test = await fetch('/api/config', {credentials:'include', signal:ctrl.signal}).then(r=>r.json());
                    clearTimeout(timer);
                    if (test && test.success !== undefined) {
                        $('serverScreen').classList.remove('active');
                        $('authScreen').classList.add('active');
                        localStorage.setItem('narabote-server-url', currentOrigin);
                    } else {
                        $('serverScreen').classList.add('active');
                        $('authScreen').classList.remove('active');
                    }
                } catch (_) {
                    $('serverScreen').classList.add('active');
                    $('authScreen').classList.remove('active');
                }
            } else {
                $('serverScreen').classList.add('active');
                $('authScreen').classList.remove('active');
            }
            $('serverUrl').value = serverUrl || '';
            $('serverConnectBtn').onclick = async () => {
                const url = $('serverUrl').value.trim().replace(/\/$/, '');
                if (!url) { $('serverStatus').style.display=''; $('serverStatus').textContent='Введите адрес'; $('serverStatus').style.color='#e74c3c'; return; }
                $('serverStatus').style.display=''; $('serverStatus').textContent='Подключение...'; $('serverStatus').style.color='#f39c12';
                try {
                    const ctrl = new AbortController();
                    const timer = setTimeout(() => ctrl.abort(), 15000);
                    const r = await fetch(url + '/api/config', {credentials:'include', signal:ctrl.signal}).then(r2=>r2.json());
                    clearTimeout(timer);
                    if (r && r.success !== undefined) {
                        window._setServerUrl(url);
                        localStorage.setItem('narabote-server-url', url);
                        $('serverScreen').classList.remove('active');
                        $('authScreen').classList.add('active');
                        initApp();
                    } else {
                        $('serverStatus').textContent='Сервер не отвечает корректно'; $('serverStatus').style.color='#e74c3c';
                    }
                } catch (e) {
                    $('serverStatus').textContent='Не удалось подключиться (сервер спит?)'; $('serverStatus').style.color='#e74c3c';
                }
            };
            $('serverOfflineBtn').onclick = () => { $('serverScreen').classList.remove('active'); $('authScreen').classList.add('active'); initApp(); };
            if (!$('serverScreen').classList.contains('active')) { initApp(); }
            return;
        }

        initApp();
    }

    async function initApp() {
        config = await window.api.getConfig();

        /* Табы авторизации */
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.auth-tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                $('tab' + capitalize(tab.dataset.tab)).classList.add('active');
            };
        });

        $('loginEmpBtn').onclick = doLoginUser;
        $('loginUser').onkeydown = e => { if (e.key === 'Enter') doLoginUser(); };
        $('loginPass').onkeydown = e => { if (e.key === 'Enter') doLoginUser(); };
        $('registerBtn').onclick = doRegister;
        $('regPass').onkeydown = e => { if (e.key === 'Enter') doRegister(); };
        $('regName').onkeydown = e => { if (e.key === 'Enter') doRegister(); };
        $('regTabNum').onkeydown = e => { if (e.key === 'Enter') doRegister(); };
        $('loginAdminBtn').onclick = doLoginAdmin;
        $('adminPass').onkeydown = e => { if (e.key === 'Enter') doLoginAdmin(); };
        $('logoutBtn').onclick = doLogout;
        $('prevMonth').onclick = () => chMonth(-1);
        $('nextMonth').onclick = () => chMonth(1);
        $('modeSelect').onchange = onModeChange;
        $('modalCancel').onclick = hideModal;
        $('modalOverlay').onclick = e => { if (e.target === $('modalOverlay')) hideModal(); };
        $('expExcelBtn').onclick = expExcel;
        $('expR7Btn').onclick = expR7;
        $('openFolderBtn').onclick = () => window.api.openExportFolder();
        $('empSelector').onchange = onEmpSelectorChange;
        $('changePassBtn').onclick = doChangeAdminPass;
        $('bulkUnblockBtn').onclick = doBulkUnblock;
        $('auditRefreshBtn').onclick = renderAudit;
        /* Заметки — пикер даты и окно */
        $('notesDatePicker').onchange = e => {
            const dt = inputToAppDate(e.target.value);
            if (dt && canUseNotes()) { replyingTo = null; $('notesInputRow').style.display = ''; loadNotesForDate(dt); }
        };
        $('notesOpenBtn').onclick = openNotesModal;
        $('notesSearchBtn').onclick = () => {
            const row = $('notesSearchRow');
            row.style.display = row.style.display === 'none' ? '' : 'none';
            if (row.style.display !== 'none') $('notesSearchInput').focus();
        };
        $('notesSearchCloseBtn').onclick = () => {
            $('notesSearchRow').style.display = 'none';
            $('notesSearchInput').value = '';
            if (selectedDate && canUseNotes()) loadNotesForDate(selectedDate);
        };
        let _searchTimer = null;
        $('notesSearchInput').oninput = () => {
            clearTimeout(_searchTimer);
            _searchTimer = setTimeout(() => doNotesSearch(), 300);
        };
        $('notesSearchInput').onkeydown = e => { if (e.key === 'Escape') { $('notesSearchCloseBtn').click(); } };
        $('copyMonthBtn').onclick = doCopyMonth;
        $('notesOverlayClose').onclick = closeNotesModal;
        $('notesOverlay').onclick = e => { if (e.target === $('notesOverlay')) closeNotesModal(); };
        $('notesModalDate').onchange = e => {
            const dt = inputToAppDate(e.target.value);
            if (dt && canUseNotes()) { replyingTo = null; loadNotesForModal(dt); }
        };
        $('notesModalSendBtn').onclick = sendNoteFromModal;
        $('notesModalInput').onkeydown = e => { if (e.key === 'Enter') sendNoteFromModal(); };
        $('todayBtn').onclick = goToday;
        $('themeBtn').onclick = toggleTheme;
        $('helpBtn').onclick = () => startTour();
        $('monthTitle').onclick = toggleMonthPicker;
        $('applyTemplateBtn').onclick = doApplyTemplate;
        $('editTemplateBtn').onclick = openTemplateEditor;
        $('settingsBtn').onclick = openSettingsModal;

        /* Задачи */
        $('addTaskBtn').onclick = () => {
            if (!selectedDate) { toast('Выберите дату', 'info'); return; }
            $('taskForm').style.display = '';
            delete $('taskForm').dataset.editId;
            $('taskTime').value = '09:00';
            $('taskDuration').value = 30;
            $('taskTitle').value = '';
            $('taskDesc').value = '';
            populateAssigneeSelect($('taskAssignee'));
            $('taskTitle').focus();
        };
        $('taskSaveBtn').onclick = doSaveTask;
        $('taskCancelBtn').onclick = () => {
            $('taskForm').style.display = 'none';
            delete $('taskForm').dataset.editId;
        };
        $('taskTitle').onkeydown = e => { if (e.key === 'Enter') doSaveTask(); };

        /* Автосохранение настроек */
        const SETTINGS_IDS = ['defStart','defEnd','defLunch','defNorm','defRate','defBreak','defHourlyWage'];
        restoreSettings();
        SETTINGS_IDS.forEach(id => {
            $(id).addEventListener('input', () => { saveSettings(); saveEmpDefaults(); });
            $(id).addEventListener('change', () => { saveSettings(); saveEmpDefaults(); });
        });

        /* Тема из localStorage */
        if (localStorage.getItem('narabote-theme') === 'light') document.body.classList.add('light-theme');

        /* Клавиатура: Escape закрывает модалки */
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') { hideModal(); closeNotesModal(); $('templateEditorOverlay').classList.remove('show'); $('settingsModalOverlay').classList.remove('show'); $('recurringOverlay').classList.remove('show'); }
            if (e.ctrlKey && e.key === 'f' && canUseNotes()) {
                e.preventDefault();
                const row = $('notesSearchRow');
                if (row) { row.style.display = ''; $('notesSearchInput').focus(); }
            }
            if (e.key === 'ArrowLeft' && !e.target.matches('input,textarea,select')) chMonth(-1);
            if (e.key === 'ArrowRight' && !e.target.matches('input,textarea,select')) chMonth(1);
            if (e.altKey && e.key === '1') { $('modeSelect').value = 'none'; onModeChange(); }
            if (e.altKey && e.key === '2') { $('modeSelect').value = 'work'; onModeChange(); }
            if (e.altKey && e.key === '3') { $('modeSelect').value = 'vacation'; onModeChange(); }
            if (e.altKey && e.key === '4') { $('modeSelect').value = 'trip'; onModeChange(); }
        });

        /* Закрытие пикера месяца по клику вне */
        document.addEventListener('click', e => {
            const mp = document.querySelector('.month-picker');
            if (mp && !mp.contains(e.target) && e.target !== $('monthTitle')) mp.remove();
        });

        /* Автозаполнение логина */
        const savedUser = localStorage.getItem('narabote-last-user');
        if (savedUser && $('loginUser')) $('loginUser').value = savedUser;

        /* Печать отчёта */
        $('printBtn').onclick = () => window.print();

        /* Импорт расписания */
        $('importBtn').onclick = () => $('importFileInput').click();
        $('importFileInput').onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const res = await window.api.importSchedule(file.path);
            if (res.success) { toast(res.message, 'success'); await reloadAll(); }
            else toast(res.message, 'error');
            e.target.value = '';
        };

        /* Повторяющиеся задачи */
        $('addRecurringBtn').onclick = () => {
            if (!isManagerOrAdmin()) { toast('Только для руководителя/админа', 'error'); return; }
            populateAssigneeSelect($('recurAssignee'));
            const today = new Date();
            $('recurStart').value = today.toISOString().slice(0, 10);
            const end = new Date(today); end.setMonth(end.getMonth() + 1);
            $('recurEnd').value = end.toISOString().slice(0, 10);
            $('recurringOverlay').classList.add('show');
        };
        $('recurCancelBtn').onclick = () => $('recurringOverlay').classList.remove('show');
        $('recurSaveBtn').onclick = async () => {
            const title = $('recurTitle').value.trim();
            if (!title) { toast('Укажите название', 'error'); return; }
            const weekdays = [...document.querySelectorAll('.recur-day:checked')].map(c => parseInt(c.value));
            if (!weekdays.length) { toast('Выберите дни недели', 'error'); return; }
            const startDate = inputToAppDate($('recurStart').value);
            const endDate = inputToAppDate($('recurEnd').value);
            if (!startDate || !endDate) { toast('Укажите период', 'error'); return; }
            const rule = {
                title, desc: $('recurDesc').value.trim(),
                time: $('recurTime').value, duration: $('recurDuration').value,
                assignee: $('recurAssignee').value, weekdays, startDate, endDate
            };
            const res = await window.api.addRecurringTask(rule);
            if (res.success) { toast(res.message, 'success'); $('recurringOverlay').classList.remove('show'); await reloadAll(); }
            else toast(res.message, 'error');
        };

        /* Автообновление */
        window.api.onUpdateAvailable && window.api.onUpdateAvailable(() => {
            $('updateBadge').style.display = '';
        });
        window.api.onUpdateReady && window.api.onUpdateReady(() => {
            $('updateBadge').style.display = '';
            $('updateBadge').textContent = '⬆ Готово';
            $('updateBadge').onclick = async () => {
                toast('Установка обновления...', 'info');
                await window.api.installUpdate();
            };
        });
        if (window.api.checkUpdate) {
            window.api.checkUpdate().then(r => {
                if (r.success && r.hasUpdate) $('updateBadge').style.display = '';
            }).catch(() => {});
        }
    }

    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    /* ==========================================================
     *  АВТОРИЗАЦИЯ
     * ========================================================== */

    async function doLoginUser() {
        const login = $('loginUser').value.trim();
        const pass  = $('loginPass').value;
        if (!login || !pass) { showAuthErr('Введите логин и пароль'); return; }

        if ($('rememberUser') && $('rememberUser').checked) {
            localStorage.setItem('narabote-last-user', login);
        } else {
            localStorage.removeItem('narabote-last-user');
        }

        const res = await window.api.userLogin(login, pass);
        if (!res.success) { showAuthErr(res.message || 'Ошибка входа'); return; }

        /* Синхронизация сессии: берём роль с сервера для надёжности */
        const srv = await window.api.getSession();
        session = { type: srv.type || 'user', empId: srv.empId || res.empId, role: srv.role || res.role, canNotes: !!srv.canNotes };
        employeeId = session.empId;
        viewingEmp = session.empId;
        enterApp();

        /* Уведомления о событиях с прошлого входа */
        if (res.notifications && res.notifications.length) {
            const n = res.notifications.length;
            toast('📢 ' + n + ' событий с последнего входа', 'info');
        }

        /* Инструкция при первом входе */
        const tourKey = 'narabote-tour-done-' + res.empId;
        if (!localStorage.getItem(tourKey)) {
            localStorage.setItem(tourKey, '1');
            setTimeout(() => startTour(), 600);
        }
    }

    async function doRegister() {
        const login  = $('regLogin').value.trim();
        const pass   = $('regPass').value;
        const name   = $('regName').value.trim();
        const tabNum = $('regTabNum').value.trim();
        if (!login || !pass) { showAuthErr('Заполните логин и пароль'); return; }

        const res = await window.api.register(login, pass, name, tabNum);
        if (!res.success) { showAuthErr(res.message || 'Ошибка регистрации'); return; }

        toast('Регистрация успешна! Теперь войдите.', 'success');
        /* Переключаем на вкладку «Вход» */
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('.auth-tab[data-tab="login"]').classList.add('active');
        $('tabLogin').classList.add('active');
        $('loginUser').value = login;
        $('loginPass').value = '';
        $('loginPass').focus();
    }

    async function doLoginAdmin() {
        const login = $('adminLogin').value.trim();
        const pass  = $('adminPass').value;
        if (!login || !pass) { showAuthErr('Введите логин и пароль'); return; }

        const res = await window.api.adminLogin(login, pass);
        if (!res.success) { showAuthErr(res.message || 'Неверный логин или пароль'); return; }

        if (res.mustChange) {
            session = { type: 'admin', empId: 'admin', role: 'admin', canNotes: true };
            employeeId = 'admin';
            viewingEmp = '';
            enterApp();
            toast('Смените пароль администратора! Текущий пароль небезопасен.', 'error');
            doChangeAdminPass();
            return;
        }

        session = { type: 'admin', empId: 'admin', role: 'admin', canNotes: true };
        employeeId = 'admin';
        viewingEmp = '';
        enterApp();
    }

    function enterApp() {
        $('authScreen').classList.remove('active');
        $('mainScreen').classList.add('active');
        $('userInfo').textContent = isAdmin() ? 'Администратор' : employeeId;

        const badge = $('roleBadge');
        if (isAdmin()) {
            badge.textContent = 'Админ'; badge.className = 'role-badge admin';
        } else if (session.role === 'manager') {
            badge.textContent = 'Руководитель'; badge.className = 'role-badge manager';
        } else {
            badge.textContent = 'Сотрудник'; badge.className = 'role-badge employee';
        }

        /* Панели доступа */
        $('managerPanel').style.display = isManagerOrAdmin() ? '' : 'none';
        $('empSelectorWrap').style.display = isManagerOrAdmin() ? '' : 'none';
        $('adminPanel').style.display = isAdmin() ? '' : 'none';
        $('exportBar').style.display = isManagerOrAdmin() ? '' : 'none';
        $('salaryCard').style.display = isManagerOrAdmin() ? '' : 'none';
        $('importBtn').style.display = isManagerOrAdmin() ? '' : 'none';
        $('addRecurringBtn').style.display = isManagerOrAdmin() ? '' : 'none';

        /* Панель заметок */
        if (canUseNotes()) {
            $('notesCard').style.display = '';
            $('notesInputRow').style.display = '';
            $('notesSendBtn').onclick = sendNote;
            $('notesInput').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) sendNote(); };
            $('notesFileInput').onchange = () => handleFileSelect('notesFileInput', _pendingFiles, 'notesPendingFiles');
            $('notesModalFileInput').onchange = () => handleFileSelect('notesModalFileInput', _modalPendingFiles, 'notesModalPendingFiles');
        } else {
            $('notesCard').style.display = 'none';
        }

        const now = new Date();
        curMonth = now.getMonth(); curYear = now.getFullYear();
        markMode = 'none';
        updateModeSelect();
        _lastAuditTs = new Date().toISOString();
        loadAll();

        /* Автообновление — опрос каждые N сек для многопользовательской работы */
        if (reloadTimer) clearInterval(reloadTimer);
        reloadTimer = setInterval(autoReload, RELOAD_INTERVAL);

        /* Уведомитель задач */
        window.api.startTaskNotifier();
        initTaskNotifications();
        _lastNoteEventTs = new Date().toISOString();

        /* Автоблокировка при неактивности */
        startInactivityTimer();

        /* Drag-and-drop + display settings */
        initDragDrop();
        restoreBlockOrder();
        applyDisplaySettings();
    }

    /* ==========================================================
     *  АВТОБЛОКИРОВКА ПРИ НЕАКТИВНОСТИ
     * ========================================================== */

    function startInactivityTimer() {
        stopInactivityTimer();
        _lastActivity = Date.now();
        _inactivityTimer = setInterval(() => {
            if (!session.type) return;
            if (Date.now() - _lastActivity >= INACTIVITY_TIMEOUT) {
                lockScreen();
            }
        }, 10000);
        ['click','keydown','mousemove','scroll','touchstart'].forEach(ev => {
            document.addEventListener(ev, resetInactivity, { passive: true });
        });
    }

    function stopInactivityTimer() {
        if (_inactivityTimer) { clearInterval(_inactivityTimer); _inactivityTimer = null; }
        ['click','keydown','mousemove','scroll','touchstart'].forEach(ev => {
            document.removeEventListener(ev, resetInactivity);
        });
    }

    function resetInactivity() { _lastActivity = Date.now(); }

    function lockScreen() {
        if (!session.type) return;
        stopInactivityTimer();
        if (reloadTimer) { clearInterval(reloadTimer); reloadTimer = null; }
        window.api.stopTaskNotifier();
        session = { type: null, empId: null, role: null };
        employeeId = ''; viewingEmp = ''; selectedDate = null;
        replyingTo = null;
        $('taskForm').style.display = 'none';
        $('mainScreen').classList.remove('active');
        $('authScreen').classList.add('active');
        $('loginPass').value = '';
        $('loginUser').focus();
        toast('🔒 Сессия заблокирована (неактивность)', 'info');
    }

    async function doLogout() {
        if (reloadTimer) { clearInterval(reloadTimer); reloadTimer = null; }
        stopInactivityTimer();
        await window.api.stopTaskNotifier();
        await window.api.logout();
        session = { type: null, empId: null, role: null };
        employeeId = ''; viewingEmp = ''; selectedDate = null;
        $('mainScreen').classList.remove('active');
        $('authScreen').classList.add('active');
        $('updateBadge').style.display = 'none';
        $('loginUser').value = localStorage.getItem('narabote-last-user') || ''; $('loginPass').value = '';
        $('adminLogin').value = ''; $('adminPass').value = '';
        $('regLogin').value = ''; $('regPass').value = ''; $('regName').value = ''; $('regTabNum').value = '';
        $('loginUser').focus();
    }

    function showAuthErr(msg) {
        const el = $('authError'); el.textContent = msg; el.style.display = '';
        setTimeout(() => { el.style.display = 'none'; }, 3000);
    }

    /* ==========================================================
     *  СМЕНА ПАРОЛЯ АДМИНИСТРАТОРА
     * ========================================================== */

    async function doChangeAdminPass() {
        const old = $('oldAdminPass').value;
        const np  = $('newAdminPass').value;
        if (!old || !np) { toast('Заполните оба поля', 'error'); return; }
        const res = await window.api.changeAdminPassword(old, np);
        toast(res.message || (res.success ? 'Пароль изменён' : 'Ошибка'), res.success ? 'success' : 'error');
        if (res.success) { $('oldAdminPass').value = ''; $('newAdminPass').value = ''; }
    }

    function doBulkUnblock() {
        const fromVal = $('bulkUnblockFrom').value;
        const toVal = $('bulkUnblockTo').value;
        if (!fromVal || !toVal) { toast('Выберите обе даты', 'error'); return; }
        /* Конвертируем yyyy-mm-dd → dd.mm.yyyy */
        const from = fromVal.split('-').reverse().join('.');
        const to = toVal.split('-').reverse().join('.');
        $('modalTitle').textContent = 'Снятие блокировок';
        $('modalBody').innerHTML = 'Снять <b>все</b> блокировки с <b>' + escHtml(from) + '</b> по <b>' + escHtml(to) + '</b>?';
        showModal(async () => {
            const res = await window.api.cancelBookingsRange(from, to);
            if (res.success) {
                toast(res.message || 'Готово', 'success');
                await loadAll();
            } else {
                toast(res.message || 'Ошибка', 'error');
            }
        });
    }

    /* ==========================================================
     *  ВЫБОР СОТРУДНИКА (руководитель / админ)
     * ========================================================== */

    function populateEmpSelector() {
        const sel = $('empSelector');
        const prev = sel.value;
        sel.innerHTML = '';
        allEmployees.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp; opt.textContent = emp + (emp === employeeId ? ' (вы)' : '');
            sel.appendChild(opt);
        });
        if (allEmployees.includes(prev)) sel.value = prev;
        else if (allEmployees.includes(viewingEmp)) sel.value = viewingEmp;
        else if (allEmployees.length) { sel.value = allEmployees[0]; viewingEmp = allEmployees[0]; }
    }

    function onEmpSelectorChange() {
        viewingEmp = $('empSelector').value;
        selectedDate = null;
        $('dateContent').innerHTML = '<p class="hint">Кликните на дату в календаре</p>';
        loadEmpDefaults();
        renderAll();
    }

    async function loadEmpDefaults() {
        if (!viewingEmp) return;
        const res = await window.api.getEmpDefaults(viewingEmp);
        if (res.success && res.data) {
            const d = res.data;
            if (d.start) $('defStart').value = d.start;
            if (d.end) $('defEnd').value = d.end;
            if (d.lunch != null) $('defLunch').value = d.lunch;
            if (d.norm != null) $('defNorm').value = d.norm;
            if (d.rate != null) $('defRate').value = d.rate;
            if (d.hourlyWage != null) $('defHourlyWage').value = d.hourlyWage;
        }
    }

    async function saveEmpDefaults() {
        if (!viewingEmp) return;
        const defaults = {
            start: $('defStart').value,
            end: $('defEnd').value,
            lunch: parseFloat($('defLunch').value) || 1,
            norm: parseFloat($('defNorm').value) || 8,
            rate: parseFloat($('defRate').value) || 1,
            hourlyWage: parseFloat($('defHourlyWage').value) || 0
        };
        await window.api.setEmpDefaults(viewingEmp, defaults);
    }

    /* ==========================================================
     *  ЗАГРУЗКА ДАННЫХ
     * ========================================================== */

    async function loadAll() {
        const [sRes, wRes, vRes, tRes, eRes] = await Promise.all([
            window.api.loadSchedule(), window.api.loadWork(),
            window.api.loadVacation(), window.api.loadTrips(), window.api.getEmployees()
        ]);
        scheduleData = sRes.success ? sRes.data : [];
        workData = wRes.success ? wRes.data : [];
        vacData = vRes.success ? vRes.data : [];
        tripData = tRes.success ? tRes.data : [];
        allEmployees = eRes.success ? eRes.data : [];
        if (employeeId && employeeId !== 'admin' && !allEmployees.includes(employeeId))
            allEmployees.push(employeeId);
        allEmployees.sort();

        try {
            const uRes = await window.api.listUsers();
            if (uRes.success) uRes.data.forEach(u => { if (u.color) userColorMap[u.id] = u.color; });
        } catch (_) {}

        if (isManagerOrAdmin()) {
            populateEmpSelector();
            if (!viewingEmp && allEmployees.length) viewingEmp = allEmployees[0];
        }

        /* Синхронизируем mtime для оптимизации автообновления */
        try { const mt = await window.api.getDataMtime(); if (mt.success) _lastMtime = { schedule: mt.schedule, users: mt.users, notes: mt.notes || 0 }; } catch (_) {}

        if (canUseNotes()) {
            const ni = await window.api.loadNotesIndex();
            if (ni.success) notesIndex = ni.data;
            _lastNotesTs = new Date().toISOString();
        }

        await loadTasksIndex();

        await loadTemplates();

        renderAll();
        if (isAdmin()) renderAdminPanel();
        if (isManagerOrAdmin()) loadSalaryData();
    }

    function renderAll() {
        renderCalendar();
        renderDatesPanel();
        renderIntersections();
        renderStats();
        if (selectedDate) {
            renderDateDetails(selectedDate);
            if (isManagerOrAdmin()) renderManagerPanel(selectedDate);
            if (canUseNotes()) loadNotesForDate(selectedDate);
        }
    }

    /* ==========================================================
     *  ПЕРЕКЛЮЧАТЕЛЬ РЕЖИМА
     * ========================================================== */

    function onModeChange() {
        markMode = $('modeSelect').value;
        renderCalendar();
    }

    function updateModeSelect() {
        const sel = $('modeSelect');
        if (!sel) return;
        sel.value = markMode;
        $('modeBookOpt').style.display = isManagerOrAdmin() ? '' : 'none';
        if (markMode === 'book' && !isManagerOrAdmin()) {
            markMode = 'none';
            sel.value = 'none';
        }
    }

    /* ==========================================================
     *  НАВИГАЦИЯ
     * ========================================================== */

    function chMonth(d) {
        curMonth += d;
        if (curMonth < 0) { curMonth = 11; curYear--; }
        else if (curMonth > 11) { curMonth = 0; curYear++; }
        selectedDate = null;
        $('dateContent').innerHTML = '<p class="hint">Кликните на дату в календаре</p>';
        renderCalendar();
    }

    function goToday() {
        const now = new Date();
        curMonth = now.getMonth();
        curYear = now.getFullYear();
        selectedDate = fk(now.getDate(), now.getMonth(), now.getFullYear());
        renderAll();
    }

    /* ==========================================================
     *  АВТОСОХРАНЕНИЕ НАСТРОЕК
     * ========================================================== */

    function saveSettings() {
        const data = {};
        ['defStart','defEnd','defLunch','defNorm','defRate','defBreak'].forEach(id => {
            data[id] = $(id).value;
        });
        localStorage.setItem('narabote-settings', JSON.stringify(data));
    }

    function restoreSettings() {
        try {
            const raw = localStorage.getItem('narabote-settings');
            if (!raw) return;
            const data = JSON.parse(raw);
            Object.entries(data).forEach(([id, val]) => {
                if ($(id)) $(id).value = val;
            });
        } catch (e) {}
    }

    /* ==========================================================
     *  АВТООБНОВЛЕНИЕ (многопользовательский режим)
     * ========================================================== */

    let _reloading = false;
    async function autoReload() {
        if (!session.type || _reloading) return;
        _reloading = true;
        try {
            /* Обновляем роль из серверной сессии (если админ сменил роль пока мы в системе) */
            const srv = await window.api.getSession();
            const roleChanged = srv.role && srv.role !== session.role;
            const notesPermChanged = (!!srv.canNotes) !== (!!session.canNotes);
            if (roleChanged || notesPermChanged) {
                session.role = srv.role;
                session.canNotes = session.type === 'admin' ? true : !!srv.canNotes;
                enterApp();          /* перерисовать интерфейс под новую роль */
                _reloading = false;
                return;
            }

            /* Быстрая проверка: если файлы не изменились — пропускаем перезагрузку */
            const mt = await window.api.getDataMtime();
            const notesChanged = mt.success && (mt.notes || 0) !== (_lastMtime.notes || 0);
            const dataChanged = mt.success && (mt.schedule !== _lastMtime.schedule || mt.users !== _lastMtime.users);
            if (!dataChanged && !notesChanged) {
                _reloading = false;
                return;
            }
            if (mt.success) _lastMtime = { schedule: mt.schedule, users: mt.users, notes: mt.notes || 0 };
            /* Изменились только заметки — перерисовываем только их */
            if (!dataChanged && notesChanged) {
                if (canUseNotes()) {
                    const ni = await window.api.loadNotesIndex();
                    if (ni.success) { notesIndex = ni.data; renderCalendar(); }
                    /* Уведомления о новых чужих заметках */
                    if (_lastNotesTs) {
                        try {
                            const ns = await window.api.loadNotesSince(_lastNotesTs);
                            if (ns.success && ns.data.length) {
                                const byDate = {};
                                ns.data.forEach(n => { byDate[n.date] = (byDate[n.date] || 0) + 1; });
                                Object.entries(byDate).forEach(([d, cnt]) => {
                                    toast('\uD83D\uDCAC ' + (cnt > 1 ? cnt + ' новых заметок' : 'Новая заметка') + ' на ' + d, 'info');
                                });
                            }
                        } catch (_) {}
                    }
                    _lastNotesTs = new Date().toISOString();
                    if (selectedDate && canUseNotes()) loadNotesForDate(selectedDate);
                }
                _reloading = false;
                return;
            }

            const [sRes, wRes, vRes, tRes, eRes] = await Promise.all([
                window.api.loadSchedule(), window.api.loadWork(),
                window.api.loadVacation(), window.api.loadTrips(), window.api.getEmployees()
            ]);
            const newSchedule = sRes.success ? sRes.data : [];
            const newWork = wRes.success ? wRes.data : [];
            const newVac = vRes.success ? vRes.data : [];
            const newTrips = tRes.success ? tRes.data : [];
            const newEmps = eRes.success ? eRes.data : [];

            /* Перерисовываем только если данные изменились */
            const changed = JSON.stringify(newSchedule) !== JSON.stringify(scheduleData) ||
                            JSON.stringify(newWork) !== JSON.stringify(workData) ||
                            JSON.stringify(newVac) !== JSON.stringify(vacData) ||
                            JSON.stringify(newTrips) !== JSON.stringify(tripData) ||
                            JSON.stringify(newEmps) !== JSON.stringify(allEmployees);
            if (changed) {
                scheduleData = newSchedule;
                workData = newWork;
                vacData = newVac;
                tripData = newTrips;
                allEmployees = newEmps;
                if (employeeId && employeeId !== 'admin' && !allEmployees.includes(employeeId))
                    allEmployees.push(employeeId);
                allEmployees.sort();
                if (isManagerOrAdmin()) {
                    populateEmpSelector();
                    if (!viewingEmp && allEmployees.length) viewingEmp = allEmployees[0];
                }
                renderAll();
                if (isAdmin()) renderAdminPanel();

                /* Уведомления: показать тосты о чужих действиях */
                if (_lastAuditTs) {
                    try {
                        const nr = await window.api.loadNotifications(_lastAuditTs);
                        if (nr.success && nr.data.length) {
                            nr.data.forEach(e => {
                                const label = NOTIFY_LABELS[e.action] || e.action;
                                toast(label + ': ' + (e.details || ''), 'info');
                            });
                        }
                    } catch (_) {}
                }
                _lastAuditTs = new Date().toISOString();
            }
        } catch (e) {}
        /* Проверка событий заметок (edit/reply) */
        await checkNoteEvents();
        _reloading = false;
    }

    function toggleTheme() {
        const light = document.body.classList.toggle('light-theme');
        localStorage.setItem('narabote-theme', light ? 'light' : 'dark');
    }

    /* ==========================================================
     *  ВЫБОР МЕСЯЦА ПО КЛИКУ
     * ========================================================== */

    function toggleMonthPicker() {
        let mp = document.querySelector('.month-picker');
        if (mp) { mp.remove(); return; }
        mp = document.createElement('div');
        mp.className = 'month-picker';
        renderMonthPicker(mp, curYear);
        $('monthTitle').parentNode.style.position = 'relative';
        $('monthTitle').parentNode.appendChild(mp);
    }

    function renderMonthPicker(mp, year) {
        const SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
        let html = '<div class="mp-year-row">';
        html += '<button class="nav-btn" style="width:28px;height:28px;font-size:13px" data-mp-y="-1">◀</button>';
        html += '<span class="mp-year">' + year + '</span>';
        html += '<button class="nav-btn" style="width:28px;height:28px;font-size:13px" data-mp-y="1">▶</button>';
        html += '</div><div class="mp-grid">';
        for (let i = 0; i < 12; i++) {
            const act = (i === curMonth && year === curYear) ? ' active' : '';
            html += '<div class="mp-cell' + act + '" data-mp-m="' + i + '" data-mp-yr="' + year + '">' + SHORT[i] + '</div>';
        }
        html += '</div>';
        mp.innerHTML = html;
        mp.querySelectorAll('[data-mp-y]').forEach(b => {
            b.onclick = e => { e.stopPropagation(); renderMonthPicker(mp, year + parseInt(b.dataset.mpY)); };
        });
        mp.querySelectorAll('[data-mp-m]').forEach(c => {
            c.onclick = e => {
                e.stopPropagation();
                curMonth = parseInt(c.dataset.mpM);
                curYear = parseInt(c.dataset.mpYr);
                selectedDate = null;
                mp.remove();
                renderAll();
            };
        });
    }

    /* ==========================================================
     *  ВСПОМОГАТЕЛЬНЫЕ: данные по сотруднику
     * ========================================================== */

    function empWork(emp) {
        const m = new Map();
        workData.filter(r => r.emp === emp).forEach(r => {
            m.set(r.date, { start: r.start, end: r.end, lunch: r.lunch, rate: r.rate,
                hourlyWage: r.hourlyWage || 0, allowance: r.allowance || 0, allowanceType: r.allowanceType || '' });
        });
        return m;
    }

    function empVac(emp) {
        return new Set(vacData.filter(r => r.emp === emp && r.status !== 'rejected').map(r => r.date));
    }
    function empPendingVac(emp) {
        return new Set(vacData.filter(r => r.emp === emp && r.status === 'pending').map(r => r.date));
    }

    function empTrip(emp) {
        return new Set(tripData.filter(r => r.emp === emp).map(r => r.date));
    }

    function vacOverlapCount(empA, empB) {
        const vA = empVac(empA), vB = empVac(empB);
        let cnt = 0;
        vA.forEach(k => { if (vB.has(k)) cnt++; });
        return cnt;
    }

    function vacBlocked(emp, k) {
        const maxOverlap = config.maxPerDate || 2;
        for (const other of allEmployees) {
            if (other === emp) continue;
            const oVac = empVac(other);
            if (!oVac.has(k)) continue;
            if (vacOverlapCount(emp, other) >= maxOverlap) return other;
        }
        return null;
    }

    /** Дата забронирована? (руководителем) */
    function isDateBooked(dateStr) {
        const rec = scheduleData.find(r => r.date === dateStr);
        return rec && (rec.emp1 || rec.emp2);
    }

    /** Дата заблокирована? (🔒) */
    function isDateLocked(dateStr) {
        const rec = scheduleData.find(r => r.date === dateStr);
        return rec && rec.locked;
    }

    function calcFact(i) { return Math.max(0, tH(i.end) - tH(i.start) - i.lunch); }
    function calcNorm(i, k) {
        const dt = pkDate(k);
        const n = parseFloat($('defNorm').value) || 8;
        return isP(dt) ? (n - 1) * i.rate : n * i.rate;
    }
    function pkDate(k) { const [d, m, y] = k.split('.').map(Number); return new Date(y, m - 1, d); }

    /* ==========================================================
     *  РЕНДЕРИНГ: КАЛЕНДАРЬ
     * ========================================================== */

    function renderCalendar() {
        $('monthTitle').textContent = MONTHS[curMonth] + ' ' + curYear;
        const fd = new Date(curYear, curMonth, 1).getDay();
        const empt = fd === 0 ? 6 : fd - 1;
        const dim = new Date(curYear, curMonth + 1, 0).getDate();
        const today = new Date();
        const todayKey = fk(today.getDate(), today.getMonth(), today.getFullYear());

        const bookMap = {};
        scheduleData.forEach(r => { bookMap[r.date] = r; });

        const vWork = empWork(viewingEmp);
        const vVac  = empVac(viewingEmp);
        const vTrip = empTrip(viewingEmp);

        let html = '';
        for (let i = 0; i < empt; i++) html += '<div class="day-cell empty"></div>';

        for (let d = 1; d <= dim; d++) {
            const key = fk(d, curMonth, curYear);
            const dt = new Date(curYear, curMonth, d);
            const wknd = isW(dt), hol = isH(dt), pre = isP(dt);

            let cls = 'day-cell';
            if (hol) cls += ' holiday';
            else if (wknd) cls += ' weekend';
            else if (pre) cls += ' preholiday';
            if (key === todayKey) cls += ' today';
            if (key === selectedDate) cls += ' selected';

            const rec = bookMap[key];
            if (rec) {
                if (rec.locked) cls += ' locked';
                const isMine = rec.emp1 === viewingEmp || rec.emp2 === viewingEmp;
                const filled = (rec.emp1 ? 1 : 0) + (rec.emp2 ? 1 : 0);
                if (isMine) cls += ' mine';
                else if (filled >= (config.maxPerDate || 2)) cls += ' full';
                else if (filled > 0) cls += ' partial';
            }

            if (vWork.has(key)) cls += ' has-work';
            if (vVac.has(key)) cls += ' has-vac';
            if (vTrip.has(key)) cls += ' has-trip';

            const vPending = empPendingVac(viewingEmp);
            if (vPending.has(key)) cls += ' has-vac-pending';

            /* Отпуск заблокирован: забронированная дата или превышен лимит пересечений */
            if (markMode === 'vacation' && !vVac.has(key)) {
                if (isDateBooked(key)) cls += ' vac-blocked';
                else if (vacBlocked(viewingEmp, key)) cls += ' vac-blocked';
            }

            /* Точки других сотрудников — только для руководителя/админа */
            let dots = '';
            let tooltip = key;
            if (isManagerOrAdmin()) {
                const othersWork = allEmployees.filter(e => e !== viewingEmp && workData.some(w => w.emp === e && w.date === key));
                const othersVac  = allEmployees.filter(e => e !== viewingEmp && vacData.some(v => v.emp === e && v.date === key));
                if (othersWork.length || othersVac.length) {
                    dots = '<div class="dots-row">';
                    othersWork.forEach(e => { dots += '<div class="dot-s" style="background:' + (userColorMap[e] || 'var(--success)') + '" title="' + escHtml(e) + '"></div>'; });
                    othersVac.forEach(e => { dots += '<div class="dot-s" style="background:' + (userColorMap[e] || 'var(--primary)') + ';opacity:0.7" title="' + escHtml(e) + '"></div>'; });
                    dots += '</div>';
                }
                /* Тултип */
                const wHere = workData.filter(w => w.date === key).map(w => w.emp);
                const vHere = vacData.filter(v => v.date === key).map(v => v.emp);
                const tHere = tripData.filter(t => t.date === key).map(t => t.emp);
                if (wHere.length) tooltip += '\n🔨 ' + wHere.join(', ');
                if (vHere.length) tooltip += '\n🏖 ' + vHere.join(', ');
                if (tHere.length) tooltip += '\n✈ ' + tHere.join(', ');
                if (rec) {
                    const booked = [rec.emp1, rec.emp2].filter(e => e && e !== '🔒');
                    if (rec.locked) tooltip += '\n🔒 Заблокировано';
                    if (booked.length) tooltip += '\n📋 ' + booked.join(', ');
                }
            } else {
                if (vWork.has(key)) tooltip += '\n🔨 Рабочий день';
                if (vVac.has(key)) tooltip += '\n🏖 Отпуск';
                if (vTrip.has(key)) tooltip += '\n✈ Командировка';
            }

            html += '<div class="' + cls + '" data-date="' + key + '" title="' + tooltip.replace(/"/g, '&quot;') + '">' + d + dots;
            /* Значок заметок */
            if (canUseNotes() && notesIndex[key]) html += '<span class="cal-note-dot" title="' + notesIndex[key] + ' заметок">💬</span>';
            /* Значок задач */
            if (tasksIndex[key] && tasksIndex[key].length) html += '<span class="cal-task-dot" title="' + tasksIndex[key].length + ' задач">📌</span>';
            html += '</div>';
        }

        const tot = Math.ceil((empt + dim) / 7) * 7;
        for (let i = empt + dim; i < tot; i++) html += '<div class="day-cell empty"></div>';
        $('calGrid').innerHTML = html;

        document.querySelectorAll('.day-cell[data-date]').forEach(cell => {
            cell.onclick = (e) => handleDayClick(cell.dataset.date, cell, e);
        });
    }

    /* ==========================================================
     *  ОБРАБОТКА КЛИКА ПО ДНЮ
     * ========================================================== */

    /** Генерация диапазона дат dd.mm.yyyy между a и b (включительно), без выходных/праздников */
    function dateRange(a, b) {
        const pa = pkDate(a), pb = pkDate(b);
        const from = pa < pb ? pa : pb, to = pa < pb ? pb : pa;
        const result = [];
        const cur = new Date(from);
        while (cur <= to) {
            if (!isW(cur) && !isH(cur)) {
                result.push(fk(cur.getDate(), cur.getMonth(), cur.getFullYear()));
            }
            cur.setDate(cur.getDate() + 1);
        }
        return result;
    }

    async function handleDayClick(dateStr, cell, ev) {
        /* --- Shift+Click: выделить диапазон --- */
        if (ev && ev.shiftKey && lastClickedDate && lastClickedDate !== dateStr && markMode !== 'none') {
            if (!canEdit() && markMode !== 'book') { toast('⛔ Нет прав', 'error'); return; }
            if (markMode === 'book' && !isManagerOrAdmin()) { toast('⛔ Нет прав', 'error'); return; }
            const range = dateRange(lastClickedDate, dateStr);
            if (!range.length) { toast('Нет рабочих дней в диапазоне', 'info'); return; }

            let added = 0, errors = 0;
            if (markMode === 'book') {
                for (const k of range) {
                    if (isDateLocked(k)) continue;
                    const res = await window.api.lockDate(k);
                    if (res.success) added++; else errors++;
                }
                toast('Заблокировано дат: ' + added + (errors ? ', пропущено: ' + errors : ''), added ? 'success' : 'info');
            } else if (markMode === 'work') {
                const w = empWork(viewingEmp);
                const d = getDefaults();
                for (const k of range) {
                    if (w.has(k)) continue;
                    const res = await window.api.setWork(viewingEmp, k, d.start, d.end, d.lunch, d.rate, d.hourlyWage, 0, '');
                    if (res.success) added++; else errors++;
                }
                toast('Добавлено рабочих дней: ' + added + (errors ? ', ошибок: ' + errors : ''), added ? 'success' : 'error');
            } else if (markMode === 'vacation') {
                const v = empVac(viewingEmp);
                for (const k of range) {
                    if (v.has(k)) continue;
                    if (isDateBooked(k)) { errors++; continue; }
                    const res = await window.api.addVacation(viewingEmp, k);
                    if (res.success) added++; else errors++;
                }
                toast('Добавлено отпускных дней: ' + added + (errors ? ', пропущено: ' + errors : ''), added ? 'success' : 'error');
            } else if (markMode === 'trip') {
                const t = empTrip(viewingEmp);
                for (const k of range) {
                    if (t.has(k)) continue;
                    const res = await window.api.addTrip(viewingEmp, k);
                    if (res.success) added++; else errors++;
                }
                toast('Добавлено командировок: ' + added + (errors ? ', ошибок: ' + errors : ''), added ? 'success' : 'error');
            }
            lastClickedDate = dateStr;
            await loadAll();
            return;
        }

        lastClickedDate = dateStr;

        if (markMode === 'none') {
            selectedDate = dateStr;
            notesAuthorFilter = null;
            document.querySelectorAll('.day-cell.selected').forEach(c => c.classList.remove('selected'));
            cell.classList.add('selected');
            if (canUseNotes()) {
                $('notesDatePicker').value = appDateToInput(dateStr);
                $('notesInputRow').style.display = '';
            }
            renderDateDetails(dateStr);
            if (isManagerOrAdmin()) renderManagerPanel(dateStr);
            if (canUseNotes()) loadNotesForDate(dateStr);
            return;
        }

        if (markMode === 'work') {
            if (!canEdit()) { toast('⛔ Нет прав на редактирование чужих данных', 'error'); return; }
            const w = empWork(viewingEmp);
            if (w.has(dateStr)) {
                const res = await window.api.removeWork(viewingEmp, dateStr);
                if (!res.success) { toast(res.message, 'error'); return; }
            } else {
                const d = getDefaults();
                const res = await window.api.setWork(viewingEmp, dateStr, d.start, d.end, d.lunch, d.rate, d.hourlyWage, 0, '');
                if (!res.success) { toast(res.message, 'error'); return; }
            }
            await loadAll();
            return;
        }

        if (markMode === 'vacation') {
            if (!canEdit()) { toast('⛔ Нет прав на редактирование чужих данных', 'error'); return; }
            const v = empVac(viewingEmp);
            if (v.has(dateStr)) {
                const res = await window.api.removeVacation(viewingEmp, dateStr);
                if (!res.success) { toast(res.message, 'error'); return; }
            } else {
                if (isDateBooked(dateStr)) {
                    toast('⛔ Дата забронирована — отпуск невозможен', 'error');
                    return;
                }
                const blocker = vacBlocked(viewingEmp, dateStr);
                if (blocker) {
                    toast('⛔ Нельзя: уже ' + (config.maxPerDate || 2) + ' общих отпускных дня с ' + blocker, 'error');
                    return;
                }
                const conflicts = checkVacConflicts(dateStr);
                if (conflicts) {
                    $('modalTitle').textContent = 'Конфликт отпуска';
                    $('modalBody').innerHTML = 'На эту дату уже есть:<br>' + escHtml(conflicts) + '<br><br>Всё равно запросить отпуск?';
                    showModal(async () => {
                        const res = await window.api.addVacation(viewingEmp, dateStr);
                        if (!res.success) { toast(res.message, 'error'); return; }
                        toast('⏳ Запрос на отпуск отправлен (ожидает подтверждения)', 'info');
                        await loadAll();
                    });
                    return;
                }
                const res = await window.api.addVacation(viewingEmp, dateStr);
                if (!res.success) { toast(res.message, 'error'); return; }
                if (isWorker()) toast('⏳ Запрос на отпуск отправлен (ожидает подтверждения)', 'info');
            }
            await loadAll();
            return;
        }

        if (markMode === 'trip') {
            if (!canEdit()) { toast('⛔ Нет прав на редактирование чужих данных', 'error'); return; }
            const t = empTrip(viewingEmp);
            if (t.has(dateStr)) {
                const res = await window.api.removeTrip(viewingEmp, dateStr);
                if (!res.success) { toast(res.message, 'error'); return; }
            } else {
                const res = await window.api.addTrip(viewingEmp, dateStr);
                if (!res.success) { toast(res.message, 'error'); return; }
            }
            await loadAll();
            return;
        }

        /* Режим блокировки (только руководитель/админ) — простой тогл */
        if (markMode === 'book') {
            if (!isManagerOrAdmin()) { toast('⛔ Нет прав', 'error'); return; }
            if (isDateLocked(dateStr)) {
                const res = await window.api.unlockDate(dateStr);
                if (!res.success) { toast(res.message, 'error'); return; }
                toast('🔓 Блокировка снята: ' + dateStr, 'success');
            } else {
                const res = await window.api.lockDate(dateStr);
                if (!res.success) { toast(res.message, 'error'); return; }
                toast('🔒 Дата заблокирована: ' + dateStr, 'success');
            }
            await loadAll();
            return;
        }

        selectedDate = dateStr;
        notesAuthorFilter = null;
        document.querySelectorAll('.day-cell.selected').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');
        if (canUseNotes()) {
            $('notesDatePicker').value = appDateToInput(dateStr);
            $('notesInputRow').style.display = '';
        }
        renderDateDetails(dateStr);
        if (isManagerOrAdmin()) renderManagerPanel(dateStr);
        if (canUseNotes()) loadNotesForDate(dateStr);
        loadTasksForDate(dateStr);
    }

    function getDefaults() {
        return {
            start: $('defStart').value || '09:00',
            end: $('defEnd').value || '18:00',
            lunch: parseFloat($('defLunch').value) || 1,
            rate: parseFloat($('defRate').value) || 1,
            hourlyWage: parseFloat($('defHourlyWage').value) || 0
        };
    }

    function checkVacConflicts(dateStr) {
        const conflicts = [];
        const wHere = workData.filter(w => w.date === dateStr && w.emp !== viewingEmp);
        const vHere = vacData.filter(v => v.date === dateStr && v.emp !== viewingEmp && v.status !== 'rejected');
        const tHere = tripData.filter(t => t.date === dateStr && t.emp !== viewingEmp);
        if (wHere.length) conflicts.push('🔨 Работают: ' + wHere.map(w => w.emp).join(', '));
        if (vHere.length) conflicts.push('🏖 Отпуск: ' + vHere.map(v => v.emp).join(', '));
        if (tHere.length) conflicts.push('✈ Командировка: ' + tHere.map(t => t.emp).join(', '));
        return conflicts.length ? conflicts.join('<br>') : null;
    }

    /* ==========================================================
     *  ДЕТАЛИ ДАТЫ
     * ========================================================== */

    function renderDateDetails(dateStr) {
        const rec = scheduleData.find(r => r.date === dateStr);
        const emp1 = rec ? rec.emp1 : '', emp2 = rec ? rec.emp2 : '';
        const locked = rec && rec.locked;
        const realEmps = [emp1, emp2].filter(e => e && e !== '🔒');
        const filled = (emp1 ? 1 : 0) + (emp2 ? 1 : 0);
        const max = config.maxPerDate || 2;
        let statusLabel, statusCls;
        if (filled === 0) { statusLabel = 'Свободно'; statusCls = 'free'; }
        else if (filled < max) { statusLabel = 'Частично'; statusCls = 'partial'; }
        else { statusLabel = 'Занято'; statusCls = 'full'; }

        const dt = pkDate(dateStr);
        const hol = isH(dt), pre = isP(dt), wknd = isW(dt);
        let dayType = hol ? '🔴 Праздник' : wknd ? '📅 Выходной' : pre ? '🟡 Предпраздничный' : '⬜ Рабочий';

        let html = '<div class="detail-date">📅 ' + dateStr + ' <span style="font-size:11px;color:var(--text2)">' + dayType + '</span></div>';

        if (isManagerOrAdmin()) {
            /* Блокировка */
            if (locked) {
                html += '<div class="detail-status full">🔒 Заблокировано</div>';
                html += '<div class="book-btn-wrap"><button class="btn btn-danger btn-sm" id="unlockBtn">🔓 Снять блокировку</button></div>';
            }
            /* Руководитель/админ видят полную информацию о бронировании */
            if (realEmps.length > 0) {
                html += '<div class="detail-status ' + statusCls + '">📋 Забронировано (' + realEmps.length + '/' + max + ')</div>';
                realEmps.forEach(eid => {
                    html += '<div class="detail-emp"><span class="detail-emp-num">' + eid + '</span>' +
                        ' <button class="btn btn-danger btn-xs" data-cancel-d="' + dateStr + '" data-cancel-e="' + eid + '">Снять</button></div>';
                });
            } else if (!locked) {
                html += '<div class="detail-status ' + statusCls + '">' + statusLabel + '</div>';
            }

            const wHere = workData.filter(w => w.date === dateStr);
            const vHere = vacData.filter(v => v.date === dateStr);
            const tHere = tripData.filter(t => t.date === dateStr);
            if (wHere.length) html += '<div style="margin-top:6px;font-size:11px;color:var(--success)">🔨 Работают: ' + wHere.map(w => w.emp).join(', ') + '</div>';
            if (vHere.length) html += '<div style="font-size:11px;color:var(--primary)">🏖 Отпуск: ' + vHere.map(v => v.emp).join(', ') + '</div>';
            if (tHere.length) html += '<div style="font-size:11px;color:var(--warning)">✈ Командировка: ' + tHere.map(t => t.emp).join(', ') + '</div>';

            /* Кнопка бронирования */
            const alreadyBooked = emp1 === viewingEmp || emp2 === viewingEmp;
            if (filled < max && !alreadyBooked) {
                html += '<div class="book-btn-wrap"><button class="btn btn-primary btn-sm" id="bookBtn">📝 Забронировать ' + viewingEmp + ' на ' + dateStr + '</button></div>';
            } else if (alreadyBooked) {
                html += '<div class="book-btn-wrap"><p class="hint">✅ ' + viewingEmp + ' уже записан(а)</p></div>';
            } else {
                html += '<div class="book-btn-wrap"><p class="hint">⛔ Все слоты заняты</p></div>';
            }
        } else {
            if (locked) {
                html += '<div style="font-size:12px;color:var(--danger);margin:6px 0">🔒 Дата заблокирована руководителем — отпуск недоступен</div>';
            } else if (realEmps.length > 0) {
                html += '<div style="font-size:12px;color:var(--warning);margin:6px 0">📋 Дата забронирована — отпуск недоступен</div>';
            } else {
                html += '<div class="detail-status ' + statusCls + '">' + statusLabel + '</div>';
            }
            const myWork = workData.some(w => w.date === dateStr && w.emp === employeeId);
            const myVac = vacData.some(v => v.date === dateStr && v.emp === employeeId);
            const myTrip = tripData.some(t => t.date === dateStr && t.emp === employeeId);
            html += '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">';
            if (myWork) {
                html += '<button class="btn btn-danger btn-sm" id="remWorkBtn">🔨 Убрать рабочий день</button>';
            } else if (!locked && !wknd && !hol) {
                html += '<button class="btn btn-success btn-sm" id="addWorkBtn">🔨 Рабочий день</button>';
            }
            if (myVac) {
                html += '<button class="btn btn-danger btn-sm" id="remVacBtn">🏖 Убрать отпуск</button>';
            } else if (!locked && !realEmps.length) {
                html += '<button class="btn btn-primary btn-sm" id="addVacBtn">🏖 Отпуск</button>';
            }
            if (myTrip) {
                html += '<button class="btn btn-danger btn-sm" id="remTripBtn">✈ Убрать командировку</button>';
            } else {
                html += '<button class="btn btn-warning btn-sm" id="addTripBtn">✈ Командировка</button>';
            }
            html += '</div>';
        }

        $('dateContent').innerHTML = html;
        const bookBtn = $('bookBtn');
        if (bookBtn) bookBtn.onclick = () => confirmBooking(dateStr);
        const unlockBtn = $('unlockBtn');
        if (unlockBtn) unlockBtn.onclick = async () => {
            const res = await window.api.unlockDate(dateStr);
            if (res.success) { toast('🔓 Блокировка снята: ' + dateStr, 'success'); await loadAll(); }
            else toast(res.message, 'error');
        };
        /* Кнопки «Снять» бронь */
        $('dateContent').querySelectorAll('[data-cancel-d]').forEach(btn => {
            btn.onclick = () => confirmCancel(btn.dataset.cancelD, btn.dataset.cancelE);
        });
        const addWorkBtn = $('addWorkBtn');
        if (addWorkBtn) addWorkBtn.onclick = async () => {
            const d = getDefaults();
            const res = await window.api.setWork(employeeId, dateStr, d.start, d.end, d.lunch, d.rate, d.hourlyWage, 0, '');
            if (res.success) { toast('🔨 Рабочий день добавлен', 'success'); await loadAll(); }
            else toast(res.message, 'error');
        };
        const remWorkBtn = $('remWorkBtn');
        if (remWorkBtn) remWorkBtn.onclick = async () => {
            const res = await window.api.removeWork(employeeId, dateStr);
            if (res.success) { toast('Рабочий день убран', 'success'); await loadAll(); }
            else toast(res.message, 'error');
        };
        const addVacBtn = $('addVacBtn');
        if (addVacBtn) addVacBtn.onclick = async () => {
            const res = await window.api.addVacation(employeeId, dateStr);
            if (res.success) { toast('⏳ Запрос на отпуск отправлен', 'info'); await loadAll(); }
            else toast(res.message, 'error');
        };
        const remVacBtn = $('remVacBtn');
        if (remVacBtn) remVacBtn.onclick = async () => {
            const res = await window.api.removeVacation(employeeId, dateStr);
            if (res.success) { toast('Отпуск убран', 'success'); await loadAll(); }
            else toast(res.message, 'error');
        };
        const addTripBtn = $('addTripBtn');
        if (addTripBtn) addTripBtn.onclick = async () => {
            const res = await window.api.addTrip(employeeId, dateStr);
            if (res.success) { toast('✈ Командировка добавлена', 'success'); await loadAll(); }
            else toast(res.message, 'error');
        };
        const remTripBtn = $('remTripBtn');
        if (remTripBtn) remTripBtn.onclick = async () => {
            const res = await window.api.removeTrip(employeeId, dateStr);
            if (res.success) { toast('Командировка убрана', 'success'); await loadAll(); }
            else toast(res.message, 'error');
        };
    }

     /* ==========================================================
      *  КОПИРОВАНИЕ ГРАФИКА С ПРОШЛОГО МЕСЯЦА
      * ========================================================== */

    async function doCopyMonth() {
        if (!canEdit()) { toast('⛔ Нет прав', 'error'); return; }
        let srcMonth = curMonth - 1, srcYear = curYear;
        if (srcMonth < 0) { srcMonth = 11; srcYear--; }
        $('modalTitle').textContent = 'Копирование графика';
        $('modalBody').innerHTML = 'Скопировать рабочие дни, отпуск и командировки<br><b>' + escHtml(viewingEmp) + '</b> с <b>' + MONTHS[srcMonth] + ' ' + srcYear + '</b> на <b>' + MONTHS[curMonth] + ' ' + curYear + '</b>?<br><span style="font-size:11px;color:var(--text2)">Существующие записи не затираются.</span>';
        showModal(async () => {
            const res = await window.api.copyMonthWork(viewingEmp, srcMonth, srcYear, curMonth, curYear);
            toast(res.message, res.success ? 'success' : 'error');
            if (res.success) await loadAll();
        });
    }

    async function doApplyTemplate() {
        if (!canEdit()) { toast('⛔ Нет прав', 'error'); return; }
        const tmpl = $('templateSelect').value;
        if (!tmpl) { toast('Выберите шаблон', 'info'); return; }
        const tmplObj = templatesList.find(t => t.id === tmpl);
        const label = tmplObj ? tmplObj.name : tmpl;
        $('modalTitle').textContent = 'Применить шаблон';
        $('modalBody').innerHTML = 'Заполнить рабочие дни по шаблону <b>' + escHtml(label) + '</b> для <b>' + MONTHS[curMonth] + ' ' + curYear + '</b>?<br><span style="font-size:11px;color:var(--text2)">Существующие записи не затираются.</span>';
        showModal(async () => {
            const res = await window.api.applyTemplate(viewingEmp, tmpl, curMonth, curYear);
            toast(res.message || 'Готово', res.success ? 'success' : 'error');
            if (res.success) await loadAll();
        });
    }

    /* ==========================================================
      *  ПАНЕЛЬ ДАТ (рабочие + отпуск viewingEmp)
     * ========================================================== */

    function renderDatesPanel() {
        const w = empWork(viewingEmp);
        const v = empVac(viewingEmp);
        const label = isManagerOrAdmin() && viewingEmp !== employeeId
            ? '📋 Дни: ' + viewingEmp
            : '📋 Мои дни';
        $('datesPanel').querySelector('.card-title').textContent = label;
        $('dayCounts').textContent = w.size + ' раб. / ' + v.size + ' отп. / ' + empTrip(viewingEmp).size + ' ком.';

        const editable = canEdit();
        let html = '';

        if (w.size) {
            const keys = sk(Array.from(w.keys()));
            let tN = 0, tF = 0;
            html += '<table class="wt"><thead><tr><th>Дата</th><th>Начало</th><th>Конец</th><th>Обед</th><th>Ставка</th><th>ЗП/час</th><th>Надб.</th><th>Норма</th><th>Факт</th><th>Расчёт</th>';
            if (editable) html += '<th></th>';
            html += '</tr></thead><tbody>';
            keys.forEach(k => {
                const i = w.get(k), n = calcNorm(i, k), f = calcFact(i);
                tN += n; tF += f;
                const pr = isP(pkDate(k)), df = f - n, fc = df >= 0 ? 'fp' : 'fn';
                const hw = i.hourlyWage || 0;
                const al = i.allowance || 0;
                const calc = (f * hw + al).toFixed(2);
                html += '<tr><td>' + k + (pr ? '<span class="pptag">ПП</span>' : '') + '</td>';
                if (editable) {
                    html += '<td><input class="ti" type="time" value="' + i.start + '" data-k="' + k + '" data-f="start"></td>';
                    html += '<td><input class="ti" type="time" value="' + i.end + '" data-k="' + k + '" data-f="end"></td>';
                    html += '<td><input class="ti" type="number" value="' + i.lunch + '" step="0.5" min="0" max="3" data-k="' + k + '" data-f="lunch"></td>';
                    html += '<td><input class="ti" type="number" value="' + i.rate + '" step="0.05" min="0.1" max="2" data-k="' + k + '" data-f="rate"></td>';
                    html += '<td><input class="ti" type="number" value="' + hw + '" step="50" min="0" data-k="' + k + '" data-f="hourlyWage"></td>';
                    html += '<td><input class="ti" type="number" value="' + al + '" step="100" min="0" data-k="' + k + '" data-f="allowance" style="width:52px"></td>';
                } else {
                    html += '<td>' + i.start + '</td><td>' + i.end + '</td><td>' + i.lunch + '</td><td>' + i.rate + '</td>';
                    html += '<td>' + hw + '</td><td>' + al + '</td>';
                }
                html += '<td class="nv">' + n.toFixed(2) + '</td><td class="' + fc + '">' + f.toFixed(2) + '</td>';
                html += '<td style="color:var(--success);font-weight:600">' + (hw > 0 ? calc : '—') + '</td>';
                if (editable) html += '<td><button class="xbtn" data-wk="' + k + '">✕</button></td>';
                html += '</tr>';
            });
            const td2 = tF - tN, tc = td2 >= 0 ? 'fp' : 'fn';
            html += '<tr class="trow"><td colspan="5" style="text-align:right">ИТОГО:</td>';
            html += '<td colspan="2"></td><td>' + tN.toFixed(2) + '</td><td class="' + tc + '">' + tF.toFixed(2) + '</td>';
            html += '<td></td>';
            if (editable) html += '<td></td>';
            html += '</tr></tbody></table>';
        } else {
            html += '<p class="hint">Нет рабочих дней</p>';
        }

        html += '<div class="vac-section"><div class="vac-title">🏖 Отпускные дни (' + v.size + '):</div>';
        if (v.size) {
            sk(Array.from(v)).forEach(k => {
                html += '<span class="vac-item">' + k;
                if (editable) html += ' <button class="vac-del" data-vk="' + k + '">✕</button>';
                html += '</span>';
            });
        } else {
            html += '<p class="hint">нет отпускных дней</p>';
        }
        html += '</div>';

        const tr = empTrip(viewingEmp);
        html += '<div class="vac-section"><div class="vac-title" style="color:var(--warning)">✈ Командировки (' + tr.size + '):</div>';
        if (tr.size) {
            sk(Array.from(tr)).forEach(k => {
                html += '<span class="vac-item">' + k;
                if (editable) html += ' <button class="vac-del" data-tk="' + k + '">✕</button>';
                html += '</span>';
            });
        } else {
            html += '<p class="hint">нет командировок</p>';
        }
        html += '</div>';

        $('datesContent').innerHTML = html;

        if (!editable) return;

        $('datesContent').querySelectorAll('.ti').forEach(inp => {
            inp.onchange = async () => {
                const k = inp.dataset.k;
                const w2 = empWork(viewingEmp);
                const i = w2.get(k);
                if (!i) return;
                const f = inp.dataset.f;
                if (f === 'start' || f === 'end') i[f] = inp.value;
                else i[f] = parseFloat(inp.value) || 0;
                const res = await window.api.setWork(viewingEmp, k, i.start, i.end, i.lunch, i.rate, i.hourlyWage || 0, i.allowance || 0, i.allowanceType || '');
                if (!res.success) toast(res.message, 'error');
                await loadAll();
            };
        });

        $('datesContent').querySelectorAll('.xbtn[data-wk]').forEach(b => {
            b.onclick = async () => {
                const res = await window.api.removeWork(viewingEmp, b.dataset.wk);
                if (!res.success) toast(res.message, 'error');
                await loadAll();
            };
        });

        $('datesContent').querySelectorAll('.vac-del[data-vk]').forEach(b => {
            b.onclick = async () => {
                const res = await window.api.removeVacation(viewingEmp, b.dataset.vk);
                if (!res.success) toast(res.message, 'error');
                await loadAll();
            };
        });

        $('datesContent').querySelectorAll('.vac-del[data-tk]').forEach(b => {
            b.onclick = async () => {
                const res = await window.api.removeTrip(viewingEmp, b.dataset.tk);
                if (!res.success) toast(res.message, 'error');
                await loadAll();
            };
        });
    }

    /* ==========================================================
     *  ПЕРЕСЕЧЕНИЯ — только для руководителя/админа
     * ========================================================== */

    function renderIntersections() {
        if (isWorker()) {
            $('intersections').innerHTML = '<p class="hint">Данные доступны только руководителю</p>';
            return;
        }
        let html = '';
        for (let i = 0; i < allEmployees.length; i++) {
            for (let j = i + 1; j < allEmployees.length; j++) {
                const a = allEmployees[i], b = allEmployees[j];
                const wA = empWork(a), wB = empWork(b);
                const common = [];
                wA.forEach((_, k) => { if (wB.has(k)) common.push(k); });
                if (common.length) {
                    html += '<div style="margin-bottom:3px">' + a + ' ↔ ' + b +
                        ' <span style="color:var(--success)">[🔨' + common.length + ']</span>: ' +
                        sk(common).join(', ') + '</div>';
                }
            }
        }
        for (let i = 0; i < allEmployees.length; i++) {
            for (let j = i + 1; j < allEmployees.length; j++) {
                const a = allEmployees[i], b = allEmployees[j];
                const vA = empVac(a), vB = empVac(b);
                const common = [];
                vA.forEach(k => { if (vB.has(k)) common.push(k); });
                if (common.length) {
                    html += '<div style="margin-bottom:3px">' + a + ' ↔ ' + b +
                        ' <span style="color:var(--primary)">[🏖' + common.length + ']</span>: ' +
                        sk(common).join(', ') + '</div>';
                }
            }
        }
        $('intersections').innerHTML = html || '<p class="hint">нет общих дат</p>';
    }

    /* ==========================================================
     *  СТАТИСТИКА — работник видит только себя
     * ========================================================== */

    /** Фильтрация даты dd.mm.yyyy по текущему statsFilter */
    function dateMatchesFilter(dateStr) {
        if (statsFilter === 'all') return true;
        const [d, m, y] = dateStr.split('.').map(Number);
        const now = new Date();
        const cy = now.getFullYear(), cm = now.getMonth() + 1;
        if (statsFilter === 'month') return y === cy && m === cm;
        if (statsFilter === 'quarter') {
            const cq = Math.ceil(cm / 3);
            const dq = Math.ceil(m / 3);
            return y === cy && dq === cq;
        }
        if (statsFilter === 'year') return y === cy;
        return true;
    }

    function getFilterLabel() {
        const now = new Date();
        if (statsFilter === 'month') return MONTHS[now.getMonth()] + ' ' + now.getFullYear();
        if (statsFilter === 'quarter') return Math.ceil((now.getMonth() + 1) / 3) + '-й кв. ' + now.getFullYear();
        if (statsFilter === 'year') return String(now.getFullYear());
        return 'Всё время';
    }

    function setStatsFilter(f) {
        statsFilter = f;
        renderStats();
    }

    function renderStats() {
        const showEmps = isWorker() ? allEmployees.filter(e => e === employeeId) : allEmployees;

        /* Панель фильтров */
        let filterHtml = '<div class="stats-filter-bar">';
        filterHtml += '<span class="stats-filter-label">Период: </span>';
        ['all', 'month', 'quarter', 'year'].forEach(f => {
            const labels = { all: 'Всё', month: 'Месяц', quarter: 'Квартал', year: 'Год' };
            const act = f === statsFilter ? ' active' : '';
            filterHtml += '<button class="stats-filter-btn' + act + '" data-sf="' + f + '">' + labels[f] + '</button>';
        });
        filterHtml += '<span class="stats-filter-period">' + getFilterLabel() + '</span>';
        filterHtml += '</div>';

        let gD = 0, gN = 0, gF = 0, gV = 0, gT = 0, rows = '';
        showEmps.forEach(emp => {
            const wAll = empWork(emp);
            const vAll = empVac(emp);
            const tAll = empTrip(emp);
            /* Фильтрованные данные */
            const w = new Map(); wAll.forEach((v, k) => { if (dateMatchesFilter(k)) w.set(k, v); });
            const v = new Set(); vAll.forEach(k => { if (dateMatchesFilter(k)) v.add(k); });
            const t = new Set(); tAll.forEach(k => { if (dateMatchesFilter(k)) t.add(k); });

            let tF = 0, tN = 0, rD = 0, pD = 0;
            w.forEach((i, k) => {
                const dt = pkDate(k), pr = isP(dt);
                if (pr) pD++; else rD++;
                tF += calcFact(i); tN += calcNorm(i, k);
            });
            const d = tF - tN, ds = d >= 0 ? '+' + d.toFixed(2) : d.toFixed(2);
            const dc = d >= 0 ? 'fp' : 'fn';
            const isViewing = emp === viewingEmp;
            rows += '<tr' + (isViewing ? ' style="background:rgba(74,124,255,0.08)"' : '') + '>';
            rows += '<td>' + emp + (isViewing ? ' ★' : '') + '</td><td>' + w.size + '</td><td>' + rD + '</td><td>' + pD + '</td>';
            rows += '<td class="nv">' + tN.toFixed(2) + '</td><td class="' + dc + '">' + tF.toFixed(2) + '</td>';
            rows += '<td class="' + dc + '">' + ds + '</td><td>' + v.size + '</td>';
            const vacLeft = VACATION_LIMIT - vAll.size;
            rows += '<td class="' + (vacLeft > 0 ? 'fp' : vacLeft === 0 ? 'nv' : 'fn') + '">' + vacLeft + '</td>';
            rows += '<td>' + t.size + '</td></tr>';
            gD += w.size; gN += tN; gF += tF; gV += v.size; gT += t.size;
        });

        if (!isWorker()) {
            const gd2 = gF - gN, gs = gd2 >= 0 ? '+' + gd2.toFixed(2) : gd2.toFixed(2);
            const gc = gd2 >= 0 ? 'fp' : 'fn';
            rows += '<tr class="trow"><td>ИТОГО</td><td>' + gD + '</td><td colspan="2">—</td>';
            rows += '<td>' + gN.toFixed(2) + '</td><td>' + gF.toFixed(2) + '</td><td class="' + gc + '">' + gs + '</td><td>' + gV + '</td><td>' + (VACATION_LIMIT * showEmps.length - gV) + '</td><td>' + gT + '</td></tr>';
        }

        $('statsContent').innerHTML = filterHtml +
            '<table class="st"><thead><tr><th>Сотрудник</th><th>Дн</th><th>Об</th><th>ПП</th>' +
            '<th>Норма</th><th>Факт</th><th>±</th><th>🏖</th><th>Ост.</th><th>✈</th></tr></thead><tbody>' + rows + '</tbody></table>';

        /* Привязка кнопок фильтра */
        $('statsContent').querySelectorAll('[data-sf]').forEach(btn => {
            btn.onclick = () => setStatsFilter(btn.dataset.sf);
        });
    }

    /* ==========================================================
     *  ПАНЕЛЬ РУКОВОДИТЕЛЯ
     * ========================================================== */

    function renderManagerPanel(dateStr) {
        const rec = scheduleData.find(r => r.date === dateStr);
        let html = '';

        const pendingHere = vacData.filter(r => r.date === dateStr && r.status === 'pending');
        if (pendingHere.length) {
            html += '<div class="vac-pending-section">';
            html += '<div class="vac-pending-title">⏳ Ожидающие подтверждения:</div>';
            pendingHere.forEach(r => {
                html += '<div class="mgr-record"><span>' + escHtml(r.emp) + ' — отпуск</span>';
                html += '<button class="btn btn-primary btn-xs" data-va="' + escHtml(r.emp) + '" data-vd="' + dateStr + '">✓</button>';
                html += '<button class="btn btn-danger btn-xs" data-vr="' + escHtml(r.emp) + '" data-vd="' + dateStr + '">✕</button>';
                html += '</div>';
            });
            html += '</div>';
        }

        const approvedHere = vacData.filter(r => r.date === dateStr && r.status === 'approved');
        if (approvedHere.length) {
            html += '<div class="vac-approved-section">';
            html += '<div class="vac-approved-title">🏖 Подтверждённые отпуска:</div>';
            approvedHere.forEach(r => {
                html += '<div class="mgr-record"><span>' + escHtml(r.emp) + ' — отпуск</span>';
                html += '<button class="btn btn-danger btn-xs" data-rv="' + escHtml(r.emp) + '" data-vd="' + dateStr + '">Удалить</button>';
                html += '</div>';
            });
            html += '</div>';
        }

        const tripsHere = tripData.filter(r => r.date === dateStr);
        if (tripsHere.length) {
            html += '<div class="vac-approved-section">';
            html += '<div class="vac-approved-title">✈ Командировки:</div>';
            tripsHere.forEach(r => {
                html += '<div class="mgr-record"><span>' + escHtml(r.emp) + ' — командировка</span>';
                html += '<button class="btn btn-danger btn-xs" data-rt="' + escHtml(r.emp) + '" data-vd="' + dateStr + '">Удалить</button>';
                html += '</div>';
            });
            html += '</div>';
        }

        if (rec && (rec.emp1 || rec.emp2)) {
            html += '<p style="font-size:12px;margin-bottom:6px">Записи на <b>' + dateStr + '</b>:</p>';
            [rec.emp1, rec.emp2].forEach(eid => {
                if (!eid) return;
                html += '<div class="mgr-record"><span>' + eid + '</span>' +
                    '<button class="btn btn-danger btn-xs" data-cd="' + dateStr + '" data-ce="' + eid + '">Отменить</button></div>';
            });
        } else if (!pendingHere.length && !approvedHere.length && !tripsHere.length) {
            html += '<p class="hint">На ' + dateStr + ' нет записей</p>';
        }
        $('managerContent').innerHTML = html;
        $('managerContent').querySelectorAll('[data-cd]').forEach(btn => {
            btn.onclick = () => confirmCancel(btn.dataset.cd, btn.dataset.ce);
        });
        $('managerContent').querySelectorAll('[data-va]').forEach(btn => {
            btn.onclick = async () => {
                const res = await window.api.approveVacation(btn.dataset.va, btn.dataset.vd);
                toast(res.success ? '✓ Отпуск подтверждён' : res.message, res.success ? 'success' : 'error');
                if (res.success) await loadAll();
            };
        });
        $('managerContent').querySelectorAll('[data-vr]').forEach(btn => {
            btn.onclick = async () => {
                const res = await window.api.rejectVacation(btn.dataset.vr, btn.dataset.vd);
                toast(res.success ? '✕ Отпуск отклонён' : res.message, res.success ? 'info' : 'error');
                if (res.success) await loadAll();
            };
        });
        $('managerContent').querySelectorAll('[data-rv]').forEach(btn => {
            btn.onclick = async () => {
                const res = await window.api.removeVacation(btn.dataset.rv, btn.dataset.vd);
                toast(res.success ? 'Отпуск удалён' : res.message, res.success ? 'success' : 'error');
                if (res.success) await loadAll();
            };
        });
        $('managerContent').querySelectorAll('[data-rt]').forEach(btn => {
            btn.onclick = async () => {
                const res = await window.api.removeTrip(btn.dataset.rt, btn.dataset.vd);
                toast(res.success ? 'Командировка удалена' : res.message, res.success ? 'success' : 'error');
                if (res.success) await loadAll();
            };
        });
    }

    /* ==========================================================
     *  ПАНЕЛЬ АДМИНИСТРАТОРА (со сбросом пароля)
     * ========================================================== */

    async function renderAdminPanel() {
        const res = await window.api.listUsers();
        if (!res.success) { $('adminUserList').innerHTML = '<p class="hint">Ошибка загрузки</p>'; return; }
        const users = res.data;

        if (!users.length) {
            $('adminUserList').innerHTML = '<p class="hint">Нет зарегистрированных сотрудников</p>';
            return;
        }

        let html = '<table class="admin-user-table"><thead><tr><th></th><th>Логин</th><th>Имя</th><th>Таб.№</th><th>Роль</th><th title="Доступ к заметкам">Заметки</th><th>Действия</th></tr></thead><tbody>';
        users.forEach(u => {
            html += '<tr>';
            html += '<td><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:' + escHtml(u.color || '#888') + ';"></span></td>';
            html += '<td>' + escHtml(u.id) + '</td>';
            html += '<td>' + escHtml(u.name) + '</td>';
            html += '<td>' + escHtml(u.tabNum || '') + '</td>';
            html += '<td><select class="role-select" data-uid="' + escHtml(u.id) + '">';
            html += '<option value="worker"' + (u.role === 'worker' ? ' selected' : '') + '>Сотрудник</option>';
            html += '<option value="manager"' + (u.role === 'manager' ? ' selected' : '') + '>Руководитель</option>';
            html += '</select></td>';
            html += '<td style="text-align:center"><input type="checkbox" class="notes-perm-cb" data-uid="' + escHtml(u.id) + '"' + (u.canNotes ? ' checked' : '') + ' title="Разрешить заметки"></td>';
            html += '<td class="admin-actions">';
            html += '<button class="btn btn-outline btn-xs" data-ren="' + escHtml(u.id) + '" title="Переименовать">✏️</button>';
            html += '<button class="btn btn-outline btn-xs" data-rp="' + escHtml(u.id) + '" title="Сбросить пароль">🔑</button>';
            html += '<button class="btn btn-danger btn-xs" data-del="' + escHtml(u.id) + '" title="Удалить">🗑</button>';
            html += '</td></tr>';
        });
        html += '</tbody></table>';
        $('adminUserList').innerHTML = html;

        /* Смена роли */
        $('adminUserList').querySelectorAll('.role-select').forEach(sel => {
            sel.onchange = async () => {
                const res = await window.api.setRole(sel.dataset.uid, sel.value);
                toast(res.message || (res.success ? 'Роль обновлена' : 'Ошибка'), res.success ? 'success' : 'error');
                if (res.success) await renderAdminPanel();
            };
        });

        /* Права на заметки */
        $('adminUserList').querySelectorAll('.notes-perm-cb').forEach(cb => {
            cb.onchange = async () => {
                const res = await window.api.setNotesPerm(cb.dataset.uid, cb.checked);
                toast(res.message || (res.success ? 'Готово' : 'Ошибка'), res.success ? 'success' : 'error');
                if (!res.success) cb.checked = !cb.checked;
            };
        });

        /* Переименование */
        $('adminUserList').querySelectorAll('[data-ren]').forEach(btn => {
            btn.onclick = () => {
                const uid = btn.dataset.ren;
                const cur = users.find(u => u.id === uid);
                $('modalTitle').textContent = 'Переименование';
                $('modalBody').innerHTML = '<p>Новое имя для <b>' + escHtml(uid) + '</b>:</p>' +
                    '<input type="text" id="renameInput" class="si" value="' + escHtml(cur ? cur.name : uid) + '" style="width:100%;margin-top:6px">';
                showModal(async () => {
                    const val = $('renameInput').value.trim();
                    if (!val) return;
                    const res = await window.api.renameUser(uid, val);
                    toast(res.message || (res.success ? 'Переименовано' : 'Ошибка'), res.success ? 'success' : 'error');
                    if (res.success) await renderAdminPanel();
                });
            };
        });

        /* Сброс пароля */
        $('adminUserList').querySelectorAll('[data-rp]').forEach(btn => {
            btn.onclick = () => {
                const uid = btn.dataset.rp;
                $('modalTitle').textContent = 'Сброс пароля';
                $('modalBody').innerHTML = '<p>Новый пароль для <b>' + escHtml(uid) + '</b>:</p>' +
                    '<input type="password" id="resetPassInput" class="si" placeholder="Новый пароль" style="width:100%;margin-top:6px">';
                showModal(async () => {
                    const val = $('resetPassInput').value.trim();
                    if (!val) { toast('Пароль не может быть пустым', 'error'); return; }
                    const res = await window.api.resetPassword(uid, val);
                    toast(res.message || (res.success ? 'Пароль сброшен' : 'Ошибка'), res.success ? 'success' : 'error');
                });
            };
        });

        /* Удаление */
        $('adminUserList').querySelectorAll('[data-del]').forEach(btn => {
            btn.onclick = () => {
                const uid = btn.dataset.del;
                $('modalTitle').textContent = 'Удаление пользователя';
                $('modalBody').innerHTML = 'Удалить учётную запись <b>' + escHtml(uid) + '</b>?<br><span style="color:var(--danger);font-size:12px">Данные в графике сохранятся.</span>';
                showModal(async () => {
                    const res = await window.api.deleteUser(uid);
                    toast(res.message || (res.success ? 'Удалено' : 'Ошибка'), res.success ? 'success' : 'error');
                    if (res.success) await renderAdminPanel();
                });
            };
        });

        /* Журнал действий */
        renderAudit();
    }

    function escHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    /* ==========================================================
     *  ЖУРНАЛ ДЕЙСТВИЙ (АУДИТ) — только админ
     * ========================================================== */

    async function renderAudit() {
        if (!isAdmin()) return;
        const el = $('auditContent');
        if (!el) return;
        el.innerHTML = '<p class="hint" style="text-align:center">⏳ Загрузка...</p>';
        const res = await window.api.loadAudit();
        if (!res.success) { el.innerHTML = '<p class="hint">Ошибка: ' + escHtml(res.message || '') + '</p>'; return; }
        const log = res.data;
        if (!log.length) { el.innerHTML = '<p class="hint">Журнал пуст</p>'; return; }
        const AUDIT_LABELS = Object.assign({}, NOTIFY_LABELS, {
            'login':                  '🔐 Вход в систему',
            'logout':                 '🚭 Выход',
            'rename-user':            '✏️ Переименование',
            'reset-password':         '🔑 Сброс пароля',
            'change-admin-password':  '🔑 Смена пароля адм.',
            'add-note':               '💬 Заметка добавлена',
            'edit-note':              '✏️ Правка заметки',
            'delete-note':            '🗑 Удал. заметки',
            'set-notes-perm':         '💬 Права заметок',
            'cancel-bookings-range':  '🔓 Масс. отмена'
        });
        let html = '';
        for (let i = log.length - 1; i >= Math.max(0, log.length - 100); i--) {
            const e = log[i];
            const ts = e.ts ? e.ts.replace('T', ' ').substring(0, 19) : '';
            const label = AUDIT_LABELS[e.action] || e.action;
            html += '<div class="audit-row"><span class="audit-ts">' + escHtml(ts) + '</span>';
            html += '<span class="audit-action">' + escHtml(label) + '</span>';
            html += '<span class="audit-user">' + escHtml(e.user || '') + '</span>';
            html += '<span class="audit-details">' + escHtml(e.details || '') + '</span></div>';
        }
        el.innerHTML = html;
    }

    /* ==========================================================
     *  ГЛОБАЛЬНЫЙ ПОИСК ПО ЗАМЕТКАМ
     * ========================================================== */

    async function doNotesSearch() {
        const query = $('notesSearchInput').value.trim();
        const list = $('notesList');
        if (!query) {
            if (selectedDate && canUseNotes()) loadNotesForDate(selectedDate);
            else list.innerHTML = '<p class="hint">Введите запрос для поиска</p>';
            return;
        }
        const res = await window.api.searchNotes(query);
        if (!res.success) { list.innerHTML = '<p class="hint">Ошибка поиска</p>'; return; }
        const results = res.data;
        if (!results.length) { list.innerHTML = '<p class="hint">Ничего не найдено</p>'; return; }

        const myAuthor = session.empId || 'admin';
        let html = '<div class="notes-search-header">Найдено: ' + results.length + '</div>';
        results.forEach(n => {
            const color = noteColor(n.author);
            const initials = (n.authorName || n.author).charAt(0).toUpperCase();
            const ts = n.ts ? n.ts.replace('T', ' ').substring(0, 16) : '';
            const snippet = n.text.length > 80 ? n.text.slice(0, 80) + '…' : n.text;
            const hlText = highlightMatch(escHtml(snippet), query);
            html += '<div class="note-msg notes-search-item" data-search-date="' + escHtml(n.date) + '">';
            html += '<div class="note-header">';
            html += '<span class="note-avatar" style="background:' + color + '">' + initials + '</span>';
            html += '<span class="note-name">' + escHtml(n.authorName || n.author) + '</span>';
            html += '<span class="note-search-date">📅 ' + escHtml(n.date) + '</span>';
            html += '<span class="note-ts">' + escHtml(ts) + '</span>';
            html += '</div>';
            html += '<div class="note-text">' + hlText + '</div>';
            html += '</div>';
        });
        list.innerHTML = html;

        list.querySelectorAll('.notes-search-item').forEach(el => {
            el.onclick = async () => {
                const dt = el.dataset.searchDate;
                selectedDate = dt;
                const [d, m, y] = dt.split('.').map(Number);
                curMonth = m - 1;
                curYear = y;
                $('notesSearchRow').style.display = 'none';
                $('notesSearchInput').value = '';
                renderAll();
            };
        });
    }

    function highlightMatch(text, query) {
        const re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        return text.replace(re, '<mark>$1</mark>');
    }

    /* ==========================================================
     *  ЗАМЕТКИ К ДАТАМ (чат)
     * ========================================================== */

    const NOTE_COLORS = ['#4a7cff','#3ecf8e','#f0b429','#ef4444','#a78bfa','#f97316','#06b6d4','#ec4899'];
    function noteColor(author) {
        let h = 0;
        for (let i = 0; i < author.length; i++) h = (h * 31 + author.charCodeAt(i)) & 0xffffffff;
        return NOTE_COLORS[Math.abs(h) % NOTE_COLORS.length];
    }

    async function loadNotesForDate(dateStr) {
        if (!canUseNotes()) return;
        const res = await window.api.loadNotes(dateStr);
        const notes = res.success ? res.data : [];
        /* Обновляем индекс для значков календаря */
        if (notes.length) notesIndex[dateStr] = notes.length;
        else delete notesIndex[dateStr];
        renderNotes(dateStr, notes);
        /* Если окно заметок открыто и показывает ту же дату — обновить */
        const overlay = $('notesOverlay');
        if (overlay && overlay.classList.contains('show') &&
                inputToAppDate($('notesModalDate').value) === dateStr) {
            renderNotesModal(dateStr, notes);
        }
    }

    function renderNotes(dateStr, notes) {
        const list = $('notesList');

        /* Фильтр по автору */
        const filtered = notesAuthorFilter
            ? notes.filter(n => n.author === notesAuthorFilter)
            : notes;

        /* Панель фильтра */
        let filterHtml = '';
        if (notes.length > 0) {
            const authors = [...new Set(notes.map(n => n.author))];
            if (authors.length > 1) {
                filterHtml = '<div class="notes-filter-bar">';
                filterHtml += '<button class="notes-filter-btn' + (notesAuthorFilter === null ? ' active' : '') + '" data-naf="null">Все</button>';
                authors.forEach(a => {
                    const n = notes.find(x => x.author === a);
                    const name = escHtml(n ? (n.authorName || a) : a);
                    const act = notesAuthorFilter === a ? ' active' : '';
                    filterHtml += '<button class="notes-filter-btn' + act + '" data-naf="' + escHtml(a) + '">' + name + '</button>';
                });
                filterHtml += '</div>';
            }
        }

        if (!filtered.length) {
            list.innerHTML = filterHtml + '<p class="hint">Нет заметок' + (notesAuthorFilter ? ' от этого автора' : ' за ' + dateStr) + '</p>';
            if (filterHtml) bindFilterBtns(list, dateStr, notes);
            return;
        }

        const myAuthor = session.empId || 'admin';
        const canDelAny = session.type === 'admin' || session.role === 'manager';
        const notesMap = {};
        notes.forEach(n => { notesMap[n.id] = n; });
        let html = filterHtml;
        filtered.forEach(n => {
            const isMine = n.author === myAuthor;
            const ts = n.ts ? n.ts.replace('T', ' ').substring(0, 16) : '';
            const edited = n.edited ? ' (ред.)' : '';
            const color = noteColor(n.author);
            const initials = (n.authorName || n.author).charAt(0).toUpperCase();
            const canDel = canDelAny || isMine;
            html += '<div class="note-msg' + (isMine ? ' note-mine' : '') + '" data-note-id="' + escHtml(n.id) + '" data-note-date="' + escHtml(dateStr) + '">';
            html += '<div class="note-header">';
            html += '<span class="note-avatar" style="background:' + color + '">' + initials + '</span>';
            html += '<span class="note-name">' + escHtml(n.authorName || n.author) + '</span>';
            html += '<span class="note-ts">' + escHtml(ts + edited) + '</span>';
            html += '<button class="note-reply" title="Ответить">↩</button>';
            if (isMine) html += '<button class="note-edit" title="Редактировать">✏️</button>';
            if (canDel) html += '<button class="note-del" title="Удалить">✕</button>';
            html += '</div>';
            if (n.replyTo && notesMap[n.replyTo]) {
                const parent = notesMap[n.replyTo];
                const parentSnippet = parent.text.length > 60 ? parent.text.slice(0, 60) + '…' : parent.text;
                html += '<div class="note-reply-ctx" data-reply-to="' + escHtml(n.replyTo) + '">';
                html += '<span class="note-reply-arrow">↩</span>';
                html += '<span class="note-reply-ref">' + escHtml(parent.authorName || parent.author) + ':</span> ';
                html += '<span class="note-reply-snippet">' + escHtml(parentSnippet) + '</span>';
                html += '</div>';
            }
            html += '<div class="note-text" data-orig="' + escHtml(n.text) + '">' + escHtml(n.text) + '</div>';
            if (n.attachments && n.attachments.length) {
                html += '<div class="note-attachments">';
                n.attachments.forEach(a => {
                    const fileUrl = window.api.getAttachmentUrl ? window.api.getAttachmentUrl(a.id) : '#';
                    if (isImageType(a.type)) {
                        html += '<a href="' + escHtml(fileUrl) + '" target="_blank"><img src="' + escHtml(fileUrl) + '" class="attach-preview" alt="' + escHtml(a.name) + '" loading="lazy"></a>';
                    } else if (isVideoType(a.type)) {
                        html += '<video src="' + escHtml(fileUrl) + '" class="attach-preview" controls preload="metadata"></video>';
                    } else if (isAudioType(a.type)) {
                        html += '<audio src="' + escHtml(fileUrl) + '" controls preload="metadata" style="width:100%;max-width:300px;"></audio>';
                    } else {
                        html += '<a href="' + escHtml(fileUrl) + '" target="_blank" class="attach-file-link">📎 ' + escHtml(a.name) + ' <span class="attach-size">(' + formatSize(a.size) + ')</span></a>';
                    }
                });
                html += '</div>';
            }
            html += '</div>';
        });
        html += renderReplyingBar();
        list.innerHTML = html;
        list.scrollTop = list.scrollHeight;

        if (filterHtml) bindFilterBtns(list, dateStr, notes);

        list.querySelectorAll('.note-del').forEach(btn => {
            btn.onclick = async () => {
                const msg = btn.closest('.note-msg');
                const res = await window.api.deleteNote(msg.dataset.noteDate, msg.dataset.noteId);
                if (res.success) { await loadNotesForDate(dateStr); renderCalendar(); }
                else toast(res.message, 'error');
            };
        });

        list.querySelectorAll('.note-edit').forEach(btn => {
            btn.onclick = () => {
                const msg = btn.closest('.note-msg');
                const textDiv = msg.querySelector('.note-text');
                if (textDiv.querySelector('textarea')) return; /* уже редактируем */
                const orig = textDiv.dataset.orig;
                textDiv.innerHTML = '<textarea class="notes-edit-area">' + escHtml(orig) + '</textarea>' +
                    '<div class="notes-edit-btns">' +
                    '<button class="btn btn-primary btn-xs note-save">Сохранить</button>' +
                    '<button class="btn btn-outline btn-xs note-cancel">Отмена</button>' +
                    '</div>';
                const ta = textDiv.querySelector('textarea');
                ta.focus(); ta.selectionStart = ta.value.length;

                textDiv.querySelector('.note-cancel').onclick = () => loadNotesForDate(dateStr);
                textDiv.querySelector('.note-save').onclick = async () => {
                    const newText = ta.value.trim();
                    if (!newText) { toast('Пустой текст', 'error'); return; }
                    const res = await window.api.editNote(msg.dataset.noteDate, msg.dataset.noteId, newText);
                    if (res.success) loadNotesForDate(dateStr);
                    else toast(res.message, 'error');
                };
            };
        });

        list.querySelectorAll('.note-reply').forEach(btn => {
            btn.onclick = () => {
                const msg = btn.closest('.note-msg');
                const noteId = msg.dataset.noteId;
                const note = notes.find(n => n.id === noteId);
                if (!note) return;
                replyingTo = { id: note.id, authorName: note.authorName || note.author, text: note.text };
                const inp = $('notesInput');
                inp.value = '@' + (note.authorName || note.author) + ', ';
                inp.focus();
                inp.selectionStart = inp.selectionEnd = inp.value.length;
                renderReplyingBar();
                list.scrollTop = list.scrollHeight;
            };
        });

        list.querySelectorAll('.note-reply-ctx').forEach(el => {
            el.onclick = () => {
                const targetId = el.dataset.replyTo;
                const targetEl = list.querySelector('.note-msg[data-note-id="' + CSS.escape(targetId) + '"]');
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetEl.classList.add('note-highlight');
                    setTimeout(() => targetEl.classList.remove('note-highlight'), 1500);
                }
            };
        });

        const cancelReply = list.querySelector('.reply-bar-cancel');
        if (cancelReply) {
            cancelReply.onclick = () => {
                replyingTo = null;
                $('notesInput').value = '';
                renderReplyingBar();
            };
        }
    }

    function bindFilterBtns(list, dateStr, allNotes) {
        list.querySelectorAll('.notes-filter-btn').forEach(btn => {
            btn.onclick = () => {
                notesAuthorFilter = btn.dataset.naf === 'null' ? null : btn.dataset.naf;
                renderNotes(dateStr, allNotes);
            };
        });
    }

    function renderReplyingBar() {
        const bar = document.querySelector('.replying-bar');
        if (bar) bar.remove();
        if (!replyingTo) return '';
        const snippet = replyingTo.text.length > 40 ? replyingTo.text.slice(0, 40) + '…' : replyingTo.text;
        const html = '<div class="replying-bar">' +
            '<span class="replying-arrow">↩</span>' +
            '<span class="replying-label">Ответ для <b>' + escHtml(replyingTo.authorName) + '</b>:</span> ' +
            '<span class="replying-snippet">' + escHtml(snippet) + '</span>' +
            '<button class="reply-bar-cancel" title="Отменить ответ">✕</button>' +
            '</div>';
        const list = $('notesList');
        if (list) list.insertAdjacentHTML('beforeend', html);
        const cancelBtn = document.querySelector('.reply-bar-cancel');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                replyingTo = null;
                $('notesInput').value = '';
                const existing = document.querySelector('.replying-bar');
                if (existing) existing.remove();
            };
        }
        return html;
    }

    function openNotesModal() {
        const dateVal = $('notesDatePicker').value || appDateToInput(selectedDate);
        $('notesModalDate').value = dateVal;
        $('notesOverlay').classList.add('show');
        $('notesModalFooter').style.display = canUseNotes() ? '' : 'none';
        const dt = inputToAppDate(dateVal);
        if (dt) loadNotesForModal(dt);
    }
    function closeNotesModal() {
        $('notesOverlay').classList.remove('show');
        replyingTo = null;
    }
    async function loadNotesForModal(dateStr) {
        if (!canUseNotes()) return;
        const res = await window.api.loadNotes(dateStr);
        const notes = res.success ? res.data : [];
        if (notes.length) notesIndex[dateStr] = notes.length;
        else delete notesIndex[dateStr];
        renderNotesModal(dateStr, notes);
    }
    function renderNotesModal(dateStr, notes) {
        const list = $('notesModalList');
        if (!notes.length) {
            list.innerHTML = '<p class="hint">Нет заметок за ' + dateStr + '</p>';
            return;
        }
        const myAuthor = session.empId || 'admin';
        const canDelAny = session.type === 'admin' || session.role === 'manager';
        const notesMap = {};
        notes.forEach(n => { notesMap[n.id] = n; });
        let html = '';
        notes.forEach(n => {
            const isMine = n.author === myAuthor;
            const canDel = canDelAny || isMine;
            const ts = n.ts ? n.ts.replace('T', ' ').substring(0, 19) : '';
            const edited = n.edited ? ' (ред.)' : '';
            const color = noteColor(n.author);
            const initials = (n.authorName || n.author).charAt(0).toUpperCase();
            html += '<div class="note-msg-big' + (isMine ? ' note-mine' : '') + '" data-note-id="' + escHtml(n.id) + '" data-note-date="' + escHtml(dateStr) + '">';
            html += '<div class="note-header-big">';
            html += '<div class="note-avatar-big" style="background:' + color + '">' + initials + '</div>';
            html += '<div class="note-author-info">';
            html += '<div class="note-author-name">' + escHtml(n.authorName || n.author) + '</div>';
            html += '<div class="note-author-ts">📅 ' + escHtml(ts + edited) + '</div>';
            html += '</div>';
            html += '<div class="note-actions-big">';
            html += '<button class="note-reply btn-link" title="Ответить">↩</button>';
            if (isMine) html += '<button class="note-edit btn-link" title="Редактировать">✏️</button>';
            if (canDel) html += '<button class="note-del btn-link btn-link-danger" title="Удалить">✕</button>';
            html += '</div></div>';
            if (n.replyTo && notesMap[n.replyTo]) {
                const parent = notesMap[n.replyTo];
                const parentSnippet = parent.text.length > 80 ? parent.text.slice(0, 80) + '…' : parent.text;
                html += '<div class="note-reply-ctx note-reply-ctx-big" data-reply-to="' + escHtml(n.replyTo) + '">';
                html += '<span class="note-reply-arrow">↩</span>';
                html += '<span class="note-reply-ref">' + escHtml(parent.authorName || parent.author) + ':</span> ';
                html += '<span class="note-reply-snippet">' + escHtml(parentSnippet) + '</span>';
                html += '</div>';
            }
            html += '<div class="note-text-big" data-orig="' + escHtml(n.text) + '">' + escHtml(n.text) + '</div>';
            if (n.attachments && n.attachments.length) {
                html += '<div class="note-attachments">';
                n.attachments.forEach(a => {
                    const fileUrl = window.api.getAttachmentUrl ? window.api.getAttachmentUrl(a.id) : '#';
                    if (isImageType(a.type)) {
                        html += '<a href="' + escHtml(fileUrl) + '" target="_blank"><img src="' + escHtml(fileUrl) + '" class="attach-preview" alt="' + escHtml(a.name) + '" loading="lazy"></a>';
                    } else if (isVideoType(a.type)) {
                        html += '<video src="' + escHtml(fileUrl) + '" class="attach-preview" controls preload="metadata"></video>';
                    } else if (isAudioType(a.type)) {
                        html += '<audio src="' + escHtml(fileUrl) + '" controls preload="metadata" style="width:100%;max-width:300px;"></audio>';
                    } else {
                        html += '<a href="' + escHtml(fileUrl) + '" target="_blank" class="attach-file-link">📎 ' + escHtml(a.name) + ' <span class="attach-size">(' + formatSize(a.size) + ')</span></a>';
                    }
                });
                html += '</div>';
            }
            html += '</div>';
        });
        list.innerHTML = html;
        list.scrollTop = list.scrollHeight;
        list.querySelectorAll('.note-del').forEach(btn => {
            btn.onclick = async () => {
                const msg = btn.closest('.note-msg-big');
                const res = await window.api.deleteNote(msg.dataset.noteDate, msg.dataset.noteId);
                if (res.success) { await loadNotesForDate(dateStr); renderCalendar(); }
                else toast(res.message, 'error');
            };
        });
        list.querySelectorAll('.note-edit').forEach(btn => {
            btn.onclick = () => {
                const msg = btn.closest('.note-msg-big');
                const textDiv = msg.querySelector('.note-text-big');
                if (textDiv.querySelector('textarea')) return;
                const orig = textDiv.dataset.orig;
                textDiv.innerHTML = '<textarea class="notes-edit-area" style="min-height:70px;width:100%">' + escHtml(orig) + '</textarea>' +
                    '<div class="notes-edit-btns"><button class="btn btn-primary btn-xs note-save">Сохранить</button> ' +
                    '<button class="btn btn-outline btn-xs note-cancel">Отмена</button></div>';
                const ta = textDiv.querySelector('textarea');
                ta.focus(); ta.selectionStart = ta.value.length;
                textDiv.querySelector('.note-cancel').onclick = () => loadNotesForModal(dateStr);
                textDiv.querySelector('.note-save').onclick = async () => {
                    const newText = ta.value.trim();
                    if (!newText) { toast('Пустой текст', 'error'); return; }
                    const res = await window.api.editNote(msg.dataset.noteDate, msg.dataset.noteId, newText);
                    if (res.success) loadNotesForDate(dateStr);
                    else toast(res.message, 'error');
                };
            };
        });
        list.querySelectorAll('.note-reply').forEach(btn => {
            btn.onclick = () => {
                const msg = btn.closest('.note-msg-big');
                const noteId = msg.dataset.noteId;
                const note = notes.find(n => n.id === noteId);
                if (!note) return;
                replyingTo = { id: note.id, authorName: note.authorName || note.author, text: note.text };
                const inp = $('notesModalInput');
                inp.value = '@' + (note.authorName || note.author) + ', ';
                inp.focus();
                inp.selectionStart = inp.selectionEnd = inp.value.length;
                const footer = $('notesModalFooter');
                let bar = footer.querySelector('.replying-bar');
                if (!bar) {
                    footer.insertAdjacentHTML('afterbegin', buildReplyingBarHtml());
                    bar = footer.querySelector('.replying-bar');
                }
                if (bar) {
                    bar.querySelector('.reply-bar-cancel').onclick = () => {
                        replyingTo = null;
                        $('notesModalInput').value = '';
                        bar.remove();
                    };
                }
                list.scrollTop = list.scrollHeight;
            };
        });
        list.querySelectorAll('.note-reply-ctx').forEach(el => {
            el.onclick = () => {
                const targetId = el.dataset.replyTo;
                const targetEl = list.querySelector('.note-msg-big[data-note-id="' + CSS.escape(targetId) + '"]');
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetEl.classList.add('note-highlight');
                    setTimeout(() => targetEl.classList.remove('note-highlight'), 1500);
                }
            };
        });
    }

    function buildReplyingBarHtml() {
        if (!replyingTo) return '';
        const snippet = replyingTo.text.length > 40 ? replyingTo.text.slice(0, 40) + '…' : replyingTo.text;
        return '<div class="replying-bar">' +
            '<span class="replying-arrow">↩</span>' +
            '<span class="replying-label">Ответ для <b>' + escHtml(replyingTo.authorName) + '</b>:</span> ' +
            '<span class="replying-snippet">' + escHtml(snippet) + '</span>' +
            '<button class="reply-bar-cancel" title="Отменить ответ">✕</button>' +
            '</div>';
    }
    let _pendingFiles = [];
    let _modalPendingFiles = [];

    function renderPendingFiles(containerId, files) {
        const c = $(containerId);
        if (!files.length) { c.style.display = 'none'; c.innerHTML = ''; return; }
        c.style.display = '';
        c.innerHTML = files.map((f, i) => {
            const isImg = f.type.startsWith('image/');
            const preview = isImg ? '<img src="' + (f.dataUrl || '') + '" class="attach-thumb">' : '';
            return '<div class="pending-file">' + preview +
                '<span class="pending-file-name">' + escHtml(f.name) + '</span>' +
                '<span class="pending-file-size">' + formatSize(f.size) + '</span>' +
                '<button class="pending-file-remove" data-idx="' + i + '">✕</button></div>';
        }).join('');
        c.querySelectorAll('.pending-file-remove').forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.idx);
                files.splice(idx, 1);
                renderPendingFiles(containerId, files);
            };
        });
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' Б';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' КБ';
        return (bytes / 1048576).toFixed(1) + ' МБ';
    }

    function isImageType(t) { return t.startsWith('image/'); }
    function isVideoType(t) { return t.startsWith('video/'); }
    function isAudioType(t) { return t.startsWith('audio/'); }

    function readFileAsDataUrl(file) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    }

    async function handleFileSelect(fileInputId, pendingArray, containerId) {
        const input = $(fileInputId);
        const files = Array.from(input.files);
        input.value = '';
        for (const f of files) {
            if (f.size > 20 * 1024 * 1024) { toast(f.name + ' — слишком большой (макс. 20 МБ)', 'error'); continue; }
            const entry = { name: f.name, type: f.type, size: f.size, file: f };
            if (isImageType(f.type)) {
                try { entry.dataUrl = await readFileAsDataUrl(f); } catch (_) {}
            }
            pendingArray.push(entry);
        }
        renderPendingFiles(containerId, pendingArray);
    }

    async function uploadPendingFiles(pendingArray, containerId) {
        const uploaded = [];
        for (const f of pendingArray) {
            if (window._isWebMode || !window.api.uploadAttachment) {
                if (f.file) {
                    const res = await window.api.uploadAttachment(f.file);
                    if (res.success && res.attachment) uploaded.push(res.attachment);
                    else toast(res.message || 'Ошибка загрузки ' + f.name, 'error');
                }
            } else {
                const res = await window.api.uploadAttachment();
                if (res.success && res.attachment) uploaded.push(res.attachment);
                else toast(res.message || 'Ошибка загрузки', 'error');
            }
        }
        pendingArray.length = 0;
        renderPendingFiles(containerId, pendingArray);
        return uploaded;
    }

    async function sendNoteFromModal() {
        const dateVal = $('notesModalDate').value;
        const dateStr = inputToAppDate(dateVal);
        if (!dateStr || !canUseNotes()) return;
        const inp = $('notesModalInput');
        const text = inp.value.trim();
        if (!text && !_modalPendingFiles.length) return;
        inp.value = '';
        const replyId = replyingTo ? replyingTo.id : '';
        replyingTo = null;
        const footerBar = $('notesModalFooter').querySelector('.replying-bar');
        if (footerBar) footerBar.remove();
        const attachments = await uploadPendingFiles(_modalPendingFiles, 'notesModalPendingFiles');
        const res = await window.api.addNote(dateStr, text, replyId, attachments);
        if (res.success) { await loadNotesForDate(dateStr); renderCalendar(); }
        else { toast(res.message || 'Ошибка', 'error'); inp.value = text; }
    }

    async function sendNote() {
        const dateVal = $('notesDatePicker').value;
        const dateStr = dateVal ? inputToAppDate(dateVal) : selectedDate;
        if (!dateStr || !canUseNotes()) return;
        const inp = $('notesInput');
        const text = inp.value.trim();
        if (!text && !_pendingFiles.length) return;
        inp.value = '';
        const replyId = replyingTo ? replyingTo.id : '';
        replyingTo = null;
        const attachments = await uploadPendingFiles(_pendingFiles, 'notesPendingFiles');
        const res = await window.api.addNote(dateStr, text, replyId, attachments);
        if (res.success) loadNotesForDate(dateStr);
        else { toast(res.message || 'Ошибка', 'error'); inp.value = text; }
    }

    /* ==========================================================
     *  БРОНИРОВАНИЕ / ОТМЕНА
     * ========================================================== */

    function confirmBooking(dateStr) {
        $('modalTitle').textContent = 'Подтверждение бронирования';
        $('modalBody').innerHTML = 'Забронировать <b>' + escHtml(viewingEmp) + '</b> на <b>' + escHtml(dateStr) + '</b>?<br><span style="font-size:11px;color:var(--warning)">Отпуск на эту дату будет заблокирован для всех.</span>';
        showModal(async () => {
            const res = await window.api.bookDate(dateStr, viewingEmp);
            toast(res.message, res.success ? 'success' : 'error');
            if (res.success) await loadAll();
        });
    }

    function confirmCancel(dateStr, empId) {
        $('modalTitle').textContent = 'Отмена бронирования';
        $('modalBody').innerHTML = 'Отменить бронирование <b>' + escHtml(empId) + '</b> на <b>' + escHtml(dateStr) + '</b>?';
        showModal(async () => {
            const res = await window.api.cancelBooking(dateStr, empId);
            toast(res.message, res.success ? 'success' : 'error');
            if (res.success) await loadAll();
        });
    }

    /* ==========================================================
     *  ЭКСПОРТ
     * ========================================================== */

    async function expExcel() {
        const brk = $('defBreak').value || 'F130';
        const res = await window.api.exportExcel(brk);
        toast(res.message || 'Ошибка', res.success ? 'success' : 'error');
    }

    async function expR7() {
        const brk = $('defBreak').value || 'F130';
        const res = await window.api.exportR7(brk);
        toast(res.message || 'Ошибка', res.success ? 'success' : 'error');
    }

    /* ==========================================================
     *  МОДАЛКА
     * ========================================================== */

    let modalCb = null;
    function showModal(cb) {
        modalCb = cb;
        $('modalOverlay').classList.add('show');
        $('modalConfirm').onclick = async () => { hideModal(); if (modalCb) await modalCb(); };
    }
    function hideModal() { $('modalOverlay').classList.remove('show'); modalCb = null; }

    /* ==========================================================
     *  ТОСТЫ
     * ========================================================== */

    function toast(msg, type) {
        type = type || 'info';
        const el = document.createElement('div');
        el.className = 'toast ' + type; el.textContent = msg;
        $('toastContainer').appendChild(el);
        setTimeout(() => { el.style.animation = 'toastOut .3s ease-in forwards'; setTimeout(() => el.remove(), 300); }, 3000);
    }

    /* ==========================================================
     *  ИНСТРУКЦИЯ (ONBOARDING TOUR)
     * ========================================================== */

    const TOUR_STEPS = [
        {
            title: '👋 Добро пожаловать в НаРаботе!',
            text: 'Это краткая инструкция по работе с приложением. Вы можете пройти её повторно, нажав кнопку <b>❓</b> в правом верхнем углу.',
            target: null
        },
        {
            title: '📅 Календарь',
            text: 'Здесь отображаются все дни месяца. Цвета показывают рабочие дни, отпуска, праздники и бронирования. Кликните на название месяца — откроется быстрый выбор.',
            target: '#calGrid'
        },
        {
            title: '🔨 Выбор режима',
            text: 'Выберите режим в выпадающем меню:<br>• <b>Просмотр</b> — клик просто открывает детали даты и заметки<br>• <b>Работа</b> — клик ставит/убирает рабочий день<br>• <b>Отпуск</b> — добавляет отпускные дни<br>• <b>Командировка</b> — назначает командировки<br>• <b>Блокировка</b> — руководитель/админ блокирует дату кликом',
            target: '#modeSelect'
        },
        {
            title: '⇧ Выделение диапазона',
            text: 'Кликните на дату, затем <b>Shift+Click</b> на другую — все рабочие дни между ними будут заполнены автоматически (в любом режиме).',
            target: '#calGrid'
        },
        {
            title: '⚙ Настройки',
            text: 'Задайте значения по умолчанию: время начала/конца, обед, ставку. Настройки сохраняются автоматически для каждого компьютера.',
            target: '#settingsBar'
        },
        {
            title: '📋 Мои дни',
            text: 'Сводная таблица ваших рабочих дней, отпусков и командировок. Здесь же можно отредактировать время и удалить записи.',
            target: '#datesPanel'
        },
        {
            title: '📌 Детали даты',
            text: 'Кликните на дату в календаре — здесь появятся подробности: кто работает, бронирования, статус.',
            target: '#dateDetails'
        },
        {
            title: '⏱ Статистика',
            text: 'Общая таблица по всем сотрудникам: рабочие дни, нормо-часы, факт, отпуска, остаток отпуска и командировки.',
            target: '#statsContent'
        },
        {
            title: '📊 Экспорт',
            text: 'Выгрузка данных в <b>Excel (.xlsx)</b> или <b>Р7 (.ods)</b>. Кнопка «Папка» открывает каталог с файлами.',
            target: '.btn-bar'
        },
        {
            title: '🌓 Тема и помощь',
            text: '<b>🌓</b> — переключает тёмную/светлую тему<br><b>❓</b> — открывает эту инструкцию повторно',
            target: '#themeBtn'
        },
        {
            title: '🔄 Совместная работа',
            text: 'Данные обновляются автоматически каждые 1.5 секунды. Несколько человек могут работать одновременно — изменения подтягиваются в реальном времени.',
            target: null
        },
        {
            title: '✅ Готово!',
            text: 'Теперь вы знаете основы. Если что-то забудете — нажмите <b>❓</b> в шапке. Приятной работы!',
            target: null
        }
    ];

    let tourStep = 0;

    function startTour() {
        tourStep = 0;
        $('tourOverlay').classList.add('show');
        renderTourStep();
    }

    function endTour() {
        $('tourOverlay').classList.remove('show');
    }

    function renderTourStep() {
        const step = TOUR_STEPS[tourStep];
        $('tourTitle').innerHTML = step.title;
        $('tourText').innerHTML = step.text;
        $('tourStepNum').textContent = (tourStep + 1) + ' из ' + TOUR_STEPS.length;

        /* Точки */
        let dots = '';
        for (let i = 0; i < TOUR_STEPS.length; i++) {
            dots += '<div class="tour-dot' + (i === tourStep ? ' active' : '') + '"></div>';
        }
        $('tourDots').innerHTML = dots;

        /* Кнопки */
        $('tourPrev').style.display = tourStep === 0 ? 'none' : '';
        const isLast = tourStep === TOUR_STEPS.length - 1;
        $('tourNext').textContent = isLast ? 'Завершить ✓' : 'Далее ▶';
        $('tourSkip').style.display = isLast ? 'none' : '';

        $('tourNext').onclick = () => {
            if (isLast) { endTour(); return; }
            tourStep++;
            renderTourStep();
        };
        $('tourPrev').onclick = () => {
            if (tourStep > 0) { tourStep--; renderTourStep(); }
        };
        $('tourSkip').onclick = endTour;
        $('tourBackdrop').onclick = endTour;

        /* Подсветка целевого элемента */
        const hl = $('tourHighlight');
        const tt = $('tourTooltip');
        if (step.target) {
            const el = document.querySelector(step.target);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                /* Пересчитать позицию после завершения прокрутки */
                setTimeout(() => positionTourHighlight(el, hl, tt), 400);
            } else {
                hl.style.display = 'none';
                centerTooltip(tt);
            }
        } else {
            hl.style.display = 'none';
            centerTooltip(tt);
        }
    }

    function positionTourHighlight(el, hl, tt) {
        const rect = el.getBoundingClientRect();
        const pad = 6;
        hl.style.display = 'block';
        hl.style.left = (rect.left - pad) + 'px';
        hl.style.top = (rect.top - pad) + 'px';
        hl.style.width = (rect.width + pad * 2) + 'px';
        hl.style.height = (rect.height + pad * 2) + 'px';
        tt.style.transform = '';

        /* Позиция тултипа */
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceRight = window.innerWidth - rect.right;
        tt.style.left = '';
        tt.style.right = '';
        tt.style.top = '';
        tt.style.bottom = '';

        if (spaceBelow > 200) {
            tt.style.top = (rect.bottom + 16) + 'px';
            tt.style.left = Math.max(16, Math.min(rect.left, window.innerWidth - 400)) + 'px';
        } else if (rect.top > 200) {
            tt.style.bottom = (window.innerHeight - rect.top + 16) + 'px';
            tt.style.left = Math.max(16, Math.min(rect.left, window.innerWidth - 400)) + 'px';
        } else if (spaceRight > 400) {
            tt.style.top = Math.max(16, rect.top) + 'px';
            tt.style.left = (rect.right + 16) + 'px';
        } else {
            tt.style.top = Math.max(16, rect.top) + 'px';
            tt.style.right = (window.innerWidth - rect.left + 16) + 'px';
        }
    }

    function centerTooltip(tt) {
        tt.style.left = '50%';
        tt.style.top = '50%';
        tt.style.right = '';
        tt.style.bottom = '';
        tt.style.transform = 'translate(-50%, -50%)';
    }

    /* ==========================================================
      *  ЗАДАЧИ ПО ВРЕМЕНИ
      * ========================================================== */

    let tasksData = [];
    let tasksIndex = {};
    let _lastTaskMtime = 0;
    let _lastNoteEventTs = '';

    function populateAssigneeSelect(sel) {
        if (!sel) return;
        sel.innerHTML = '<option value="">— себе —</option>';
        allEmployees.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e;
            opt.textContent = e;
            sel.appendChild(opt);
        });
        if (session.empId) sel.value = session.empId;
    }

    async function loadTasksForDate(dateStr) {
        const res = await window.api.loadTasks(dateStr);
        tasksData = res.success ? res.data : [];
        renderTasksList(dateStr);
        renderDayTimeline(dateStr);
    }

    async function loadTasksIndex() {
        try {
            const res = await window.api.loadTasksIndex();
            if (res.success) tasksIndex = res.data;
        } catch (_) {}
    }

    function renderTasksList(dateStr) {
        const list = $('tasksList');
        if (!dateStr) {
            list.innerHTML = '<p class="hint">Выберите дату для задач</p>';
            return;
        }
        if (!tasksData.length) {
            list.innerHTML = '<p class="hint">Нет задач на ' + dateStr + '</p>';
            return;
        }
        let html = '';
        tasksData.forEach(t => {
            const timeStr = t.time || '??:??';
            const durStr = t.duration ? t.duration + ' мин' : '';
            html += '<div class="task-item" data-task-id="' + escHtml(t.id) + '">';
            html += '<div class="task-item-time">' + escHtml(timeStr) + '</div>';
            html += '<div class="task-item-body">';
            html += '<div class="task-item-title">' + escHtml(t.title) + '</div>';
            if (t.desc) html += '<div class="task-item-desc">' + escHtml(t.desc) + '</div>';
            if (durStr) html += '<div class="task-item-duration">' + escHtml(durStr) + '</div>';
            html += '</div>';
            html += '<div class="task-item-actions">';
            html += '<button class="task-edit-btn" data-tid="' + escHtml(t.id) + '" title="Редактировать">✏️</button>';
            html += '<button class="task-del-btn" data-tid="' + escHtml(t.id) + '" title="Удалить">✕</button>';
            html += '</div>';
            html += '</div>';
        });
        list.innerHTML = html;

        list.querySelectorAll('.task-del-btn').forEach(btn => {
            btn.onclick = async () => {
                const res = await window.api.removeTask(btn.dataset.tid);
                if (res.success) { toast('Задача удалена', 'success'); await loadTasksForDate(dateStr); renderCalendar(); }
                else toast(res.message, 'error');
            };
        });

        list.querySelectorAll('.task-edit-btn').forEach(btn => {
            btn.onclick = () => {
                const task = tasksData.find(t => t.id === btn.dataset.tid);
                if (!task) return;
                $('taskTime').value = task.time || '09:00';
                $('taskDuration').value = task.duration || 30;
                $('taskTitle').value = task.title || '';
                $('taskDesc').value = task.desc || '';
                populateAssigneeSelect($('taskAssignee'));
                if (task.assignee) $('taskAssignee').value = task.assignee;
                $('taskForm').style.display = '';
                $('taskForm').dataset.editId = task.id;
                $('taskTitle').focus();
            };
        });
    }

    async function doSaveTask() {
        const time = $('taskTime').value;
        const duration = parseInt($('taskDuration').value) || 30;
        const title = $('taskTitle').value.trim();
        const desc = $('taskDesc').value.trim();
        if (!title) { toast('Укажите название задачи', 'error'); return; }
        const dateStr = selectedDate;
        if (!dateStr) { toast('Выберите дату', 'error'); return; }

        const editId = $('taskForm').dataset.editId;
        let res;
        if (editId) {
            res = await window.api.updateTask(editId, { time, duration, title, desc, assignee: $('taskAssignee').value });
        } else {
            res = await window.api.addTask(dateStr, time, duration, title, desc, $('taskAssignee').value);
        }
        if (res.success) {
            toast(editId ? 'Задача обновлена' : 'Задача добавлена', 'success');
            $('taskForm').style.display = 'none';
            delete $('taskForm').dataset.editId;
            $('taskTitle').value = '';
            $('taskDesc').value = '';
            await loadTasksForDate(dateStr);
            await loadTasksIndex();
            renderCalendar();
        } else {
            toast(res.message, 'error');
        }
    }

    /* --- Полоска дня (таймлайн) --- */
    function renderDayTimeline(dateStr) {
        const tl = $('dayTimeline');
        const label = $('dayTimelineLabel');
        const bar = $('dayTimelineBar');
        if (!dateStr || !tasksData.length) {
            tl.style.display = 'none';
            return;
        }
        tl.style.display = 'flex';
        label.textContent = 'ДЕНЬ';

        const H_START = 7, H_END = 22;
        const span = H_END - H_START;

        let html = '';
        for (let h = H_START; h <= H_END; h++) {
            const pct = ((h - H_START) / span) * 100;
            html += '<div class="day-timeline-hour" style="left:' + pct + '%"></div>';
            if (h % 2 === 0 || h === H_START) {
                html += '<div class="day-timeline-hour-label" style="left:' + pct + '%">' + pad(h) + '</div>';
            }
        }

        const now = new Date();
        const today = pad(now.getDate()) + '.' + pad(now.getMonth() + 1) + '.' + now.getFullYear();
        if (dateStr === today) {
            const nowMin = now.getHours() + now.getMinutes() / 60;
            if (nowMin >= H_START && nowMin <= H_END) {
                const pct = ((nowMin - H_START) / span) * 100;
                html += '<div class="day-timeline-now" style="left:' + pct + '%" title="Сейчас"></div>';
            }
        }

        tasksData.forEach(t => {
            if (!t.time) return;
            const [h, m] = t.time.split(':').map(Number);
            const startH = (h || 0) + (m || 0) / 60;
            const durH = (t.duration || 30) / 60;
            const endH = startH + durH;
            if (startH > H_END || endH < H_START) return;
            const left = Math.max(0, ((startH - H_START) / span) * 100);
            const right = Math.min(100, ((endH - H_START) / span) * 100);
            const width = Math.max(2, right - left);

            html += '<div class="day-timeline-task" style="left:' + left + '%;width:' + width + '%" data-task-id="' + escHtml(t.id) + '">';
            html += '<span class="task-time-mini">' + escHtml(t.time) + '</span>';
            html += '<span class="task-title-mini">' + escHtml(t.title) + '</span>';
            html += '<div class="task-tl-tooltip">';
            html += '<div class="task-tl-tooltip-title">' + escHtml(t.title) + '</div>';
            html += '<div class="task-tl-tooltip-time">' + escHtml(t.time) + ' — ' + escHtml(t.duration + ' мин') + '</div>';
            if (t.desc) html += '<div class="task-tl-tooltip-desc">' + escHtml(t.desc) + '</div>';
            html += '</div>';
            html += '</div>';
        });

        bar.innerHTML = html;
    }

    /* --- Уведомления о задачах (от main-процесса) --- */
    function initTaskNotifications() {
        window.api.onTaskNotify((data) => {
            showTaskNotifyPopup(data);
        });
    }

    function showTaskNotifyPopup(data) {
        const popup = document.createElement('div');
        popup.className = 'task-notify-popup';
        popup.innerHTML =
            '<button class="task-notify-close">✕</button>' +
            '<div class="task-notify-title">📌 Скоро задача!</div>' +
            '<div class="task-notify-time">⏰ ' + escHtml(data.time || '') + ' — ' + escHtml(data.title || '') + '</div>' +
            (data.desc ? '<div class="task-notify-desc">' + escHtml(data.desc) + '</div>' : '');
        document.body.appendChild(popup);
        popup.querySelector('.task-notify-close').onclick = () => popup.remove();
        setTimeout(() => { if (popup.parentNode) popup.remove(); }, 15000);
        toast('📌 Через 5 мин: ' + (data.title || 'Задача'), 'info');
    }

    /* --- Уведомления о заметках (edit/reply) --- */
    async function checkNoteEvents() {
        if (!session.type || !_lastNoteEventTs) return;
        try {
            const res = await window.api.loadNoteEventsSince(_lastNoteEventTs);
            if (res.success && res.data.length) {
                res.data.forEach(e => {
                    if (e.action === 'edit-note') {
                        toast('✏️ Заметка отредактирована: ' + (e.details || ''), 'info');
                    } else if (e.action === 'add-note') {
                        const snippet = e.details ? e.details.split(':').slice(1).join(':').trim() : '';
                        toast('💬 Новая заметка' + (snippet ? ': ' + snippet.slice(0, 30) : ''), 'info');
                    }
                });
            }
            _lastNoteEventTs = new Date().toISOString();
        } catch (_) {}
    }

    /* ==========================================================
      *  ЗАГРУЗКА ШАБЛОНОВ
      * ========================================================== */

    async function loadTemplates() {
        const res = await window.api.listTemplates();
        if (res.success) templatesList = res.data;
        const sel = $('templateSelect');
        const prev = sel.value;
        sel.innerHTML = '<option value="">—</option>';
        templatesList.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            sel.appendChild(opt);
        });
        if (prev && templatesList.some(t => t.id === prev)) sel.value = prev;
    }

    /* ==========================================================
      *  РЕДАКТОР ШАБЛОНОВ
      * ========================================================== */

    let _editingTemplateId = null;

    async function openTemplateEditor() {
        _editingTemplateId = null;
        await loadTemplates();
        renderTemplateEditorList();
        $('templateEditorOverlay').classList.add('show');
    }

    function renderTemplateEditorList() {
        let html = '<div style="margin-bottom:12px">';
        templatesList.forEach(t => {
            html += '<div class="tmpl-list-item">';
            html += '<span class="tmpl-list-name">' + escHtml(t.name) + '</span>';
            html += '<span class="tmpl-list-info">(' + t.cycleDays + ' дн.)</span>';
            html += '<button class="btn btn-outline btn-xs" data-tmpl-edit="' + escHtml(t.id) + '">✏️</button>';
            html += '<button class="btn btn-danger btn-xs" data-tmpl-del="' + escHtml(t.id) + '">🗑</button>';
            html += '</div>';
        });
        html += '</div>';
        html += '<button class="btn btn-primary btn-sm" id="tmplNewBtn">+ Новый шаблон</button>';
        html += '<div id="tmplEditArea" style="display:none;margin-top:12px;"></div>';
        $('templateEditorBody').innerHTML = html;

        $('tmplNewBtn').onclick = () => {
            _editingTemplateId = null;
            renderTemplateEditForm(null);
        };
        $('templateEditorBody').querySelectorAll('[data-tmpl-edit]').forEach(btn => {
            btn.onclick = async () => {
                const res = await window.api.getTemplate(btn.dataset.tmplEdit);
                if (res.success && res.data) {
                    _editingTemplateId = res.data.id;
                    renderTemplateEditForm(res.data);
                }
            };
        });
        $('templateEditorBody').querySelectorAll('[data-tmpl-del]').forEach(btn => {
            btn.onclick = async () => {
                const res = await window.api.deleteTemplate(btn.dataset.tmplDel);
                if (res.success) {
                    toast('Шаблон удалён', 'success');
                    await loadTemplates();
                    renderTemplateEditorList();
                } else toast(res.message, 'error');
            };
        });
    }

    function renderTemplateEditForm(tmpl) {
        const area = $('tmplEditArea');
        area.style.display = '';
        const name = tmpl ? tmpl.name : '';
        const cycleDays = tmpl ? tmpl.cycleDays : 7;
        const days = tmpl ? tmpl.days : [];

        let html = '<div class="tmpl-form">';
        html += '<div class="tmpl-form-row"><label>Название:</label><input type="text" id="tmplName" class="si" value="' + escHtml(name) + '" style="flex:1"></div>';
        html += '<div class="tmpl-form-row"><label>Цикл (дн.):</label><input type="number" id="tmplCycleDays" class="si" value="' + cycleDays + '" min="1" max="31" style="width:60px"></div>';
        html += '<table class="wt"><thead><tr><th>День</th><th>Раб.</th><th>Начало</th><th>Конец</th><th>Обед</th><th>Ставка</th><th>Перерыв</th></tr></thead><tbody>';
        for (let i = 0; i < cycleDays; i++) {
            const d = days.find(dd => dd.dayOffset === i) || {};
            const isW = d.isWork !== false;
            html += '<tr>';
            html += '<td>' + (i + 1) + '</td>';
            html += '<td><input type="checkbox" class="tmpl-day-work" data-idx="' + i + '"' + (isW ? ' checked' : '') + '></td>';
            html += '<td><input class="ti" type="time" value="' + (d.start || '09:00') + '" data-idx="' + i + '" data-f="start"></td>';
            html += '<td><input class="ti" type="time" value="' + (d.end || '18:00') + '" data-idx="' + i + '" data-f="end"></td>';
            html += '<td><input class="ti" type="number" value="' + (d.lunch || 1) + '" step="0.5" min="0" max="3" data-idx="' + i + '" data-f="lunch"></td>';
            html += '<td><input class="ti" type="number" value="' + (d.rate || 1) + '" step="0.05" min="0.1" max="2" data-idx="' + i + '" data-f="rate"></td>';
            html += '<td><input class="ti" type="text" value="' + (d.breakType || 'F130') + '" data-idx="' + i + '" data-f="breakType" style="width:65px"></td>';
            html += '</tr>';
        }
        html += '</tbody></table>';
        html += '<div style="margin-top:8px;display:flex;gap:8px">';
        html += '<button class="btn btn-primary btn-sm" id="tmplSaveBtn">Сохранить</button>';
        html += '<button class="btn btn-outline btn-sm" id="tmplCancelEditBtn">Отмена</button>';
        html += '</div></div>';
        area.innerHTML = html;

        $('tmplCycleDays').oninput = () => {
            const newCycle = parseInt($('tmplCycleDays').value) || 1;
            const currentDays = [];
            area.querySelectorAll('.tmpl-day-work').forEach(cb => {
                const idx = parseInt(cb.dataset.idx);
                const row = cb.closest('tr');
                currentDays[idx] = {
                    dayOffset: idx, isWork: cb.checked,
                    start: row.querySelector('[data-f="start"]').value,
                    end: row.querySelector('[data-f="end"]').value,
                    lunch: parseFloat(row.querySelector('[data-f="lunch"]').value) || 0,
                    rate: parseFloat(row.querySelector('[data-f="rate"]').value) || 1,
                    breakType: row.querySelector('[data-f="breakType"]').value
                };
            });
            const partialTmpl = { name: $('tmplName').value, cycleDays: newCycle, days: currentDays };
            renderTemplateEditForm(partialTmpl);
        };

        $('tmplCancelEditBtn').onclick = () => { area.style.display = 'none'; _editingTemplateId = null; };
        $('tmplSaveBtn').onclick = async () => {
            const name = $('tmplName').value.trim();
            const cycleDays = parseInt($('tmplCycleDays').value) || 7;
            if (!name) { toast('Укажите название', 'error'); return; }
            const days = [];
            area.querySelectorAll('.tmpl-day-work').forEach(cb => {
                const idx = parseInt(cb.dataset.idx);
                const row = cb.closest('tr');
                days.push({
                    dayOffset: idx, isWork: cb.checked,
                    start: row.querySelector('[data-f="start"]').value,
                    end: row.querySelector('[data-f="end"]').value,
                    lunch: parseFloat(row.querySelector('[data-f="lunch"]').value) || 0,
                    rate: parseFloat(row.querySelector('[data-f="rate"]').value) || 1,
                    breakType: row.querySelector('[data-f="breakType"]').value
                });
            });
            const template = { id: _editingTemplateId, name, cycleDays, days };
            const res = await window.api.saveTemplate(template);
            if (res.success) {
                toast('Шаблон сохранён', 'success');
                _editingTemplateId = res.id || template.id;
                await loadTemplates();
                renderTemplateEditorList();
            } else toast(res.message, 'error');
        };
    }

    $('templateEditorClose').onclick = () => { $('templateEditorOverlay').classList.remove('show'); };
    $('templateEditorOverlay').onclick = e => { if (e.target === $('templateEditorOverlay')) $('templateEditorOverlay').classList.remove('show'); };

    /* ==========================================================
      *  ЗАРПЛАТА ЗА МЕСЯЦ
      * ========================================================== */

    async function loadSalaryData() {
        if (!isManagerOrAdmin()) return;
        $('salaryCard').style.display = '';
        const res = await window.api.getMonthlyPay(curMonth, curYear);
        if (!res.success) { $('salaryContent').innerHTML = '<p class="hint">Ошибка загрузки</p>'; return; }
        salaryData = res.data;
        renderSalary();
    }

    function renderSalary() {
        if (!salaryData.length) { $('salaryContent').innerHTML = '<p class="hint">Нет данных</p>'; return; }
        let gHours = 0, gPay = 0, gAllow = 0, gTotal = 0;
        let html = '<table class="st"><thead><tr><th>Сотрудник</th><th>Часы</th><th>ЗП/час</th><th>Итого ЗП</th><th>Надбавки</th><th>Итого к выплате</th></tr></thead><tbody>';
        salaryData.forEach(r => {
            const def = workData.find(w => w.emp === r.emp);
            const hw = def ? def.hourlyWage || 0 : 0;
            const effectiveWage = r.totalHours > 0 ? (r.totalPay / r.totalHours).toFixed(0) : hw;
            html += '<tr>';
            html += '<td>' + escHtml(r.emp) + '</td>';
            html += '<td>' + r.totalHours.toFixed(2) + '</td>';
            html += '<td>' + effectiveWage + '</td>';
            html += '<td>' + r.totalPay.toFixed(2) + '</td>';
            html += '<td>' + r.totalAllowances.toFixed(2) + '</td>';
            html += '<td style="font-weight:600;color:var(--success)">' + r.grandTotal.toFixed(2) + '</td>';
            html += '</tr>';
            gHours += r.totalHours; gPay += r.totalPay; gAllow += r.totalAllowances; gTotal += r.grandTotal;
        });
        html += '<tr class="trow"><td>ИТОГО за месяц</td><td>' + gHours.toFixed(2) + '</td><td></td><td>' + gPay.toFixed(2) + '</td><td>' + gAllow.toFixed(2) + '</td><td style="font-weight:700">' + gTotal.toFixed(2) + '</td></tr>';
        html += '</tbody></table>';
        $('salaryContent').innerHTML = html;
    }

    /* ==========================================================
      *  DRAG-AND-DROP БЛОКОВ
      * ========================================================== */

    function initDragDrop() {
        document.querySelectorAll('.block-drag-handle').forEach(handle => {
            handle.addEventListener('dragstart', e => {
                const block = handle.closest('.app-block');
                e.dataTransfer.setData('text/plain', block.dataset.block);
                e.dataTransfer.effectAllowed = 'move';
                block.classList.add('dragging');
                setTimeout(() => block.style.opacity = '0.4', 0);
            });
            handle.addEventListener('dragend', e => {
                const block = handle.closest('.app-block');
                block.classList.remove('dragging');
                block.style.opacity = '';
            });
        });

        document.querySelectorAll('.col-left, .col-right').forEach(col => {
            col.addEventListener('dragover', e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const dragging = document.querySelector('.app-block.dragging');
                if (!dragging) return;
                const afterEl = getDragAfterElement(col, e.clientY);
                if (afterEl) col.insertBefore(dragging, afterEl);
                else col.appendChild(dragging);
            });
            col.addEventListener('drop', e => {
                e.preventDefault();
                document.querySelectorAll('.app-block.dragging').forEach(b => b.classList.remove('dragging'));
                saveBlockOrder();
            });
        });
    }

    function getDragAfterElement(container, y) {
        const els = [...container.querySelectorAll('.app-block:not(.dragging)')];
        let closest = null, closestOffset = Number.NEGATIVE_INFINITY;
        els.forEach(el => {
            const box = el.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closestOffset) { closestOffset = offset; closest = el; }
        });
        return closest;
    }

    function saveBlockOrder() {
        const left = [...document.querySelectorAll('.col-left .app-block')].map(b => b.dataset.block);
        const right = [...document.querySelectorAll('.col-right .app-block')].map(b => b.dataset.block);
        localStorage.setItem('narabote-block-order', JSON.stringify({ left, right }));
    }

    function restoreBlockOrder() {
        try {
            const raw = localStorage.getItem('narabote-block-order');
            if (!raw) return;
            const order = JSON.parse(raw);
            const leftCol = document.querySelector('.col-left');
            const rightCol = document.querySelector('.col-right');
            if (order.left) order.left.forEach(id => {
                const el = document.querySelector('.app-block[data-block="' + id + '"]');
                if (el && leftCol) leftCol.appendChild(el);
            });
            if (order.right) order.right.forEach(id => {
                const el = document.querySelector('.app-block[data-block="' + id + '"]');
                if (el && rightCol) rightCol.appendChild(el);
            });
        } catch (_) {}
    }

    function applyDisplaySettings() {
        try {
            const raw = localStorage.getItem('narabote-display-settings');
            if (!raw) return;
            const settings = JSON.parse(raw);
            if (settings.hiddenBlocks) {
                settings.hiddenBlocks.forEach(id => {
                    const el = document.querySelector('.app-block[data-block="' + id + '"]');
                    if (el) el.style.display = 'none';
                });
            }
        } catch (_) {}
    }

    /* ==========================================================
      *  НАСТРОЙКИ ОТОБРАЖЕНИЯ (МОДАЛКА)
      * ========================================================== */

    const ALL_BLOCKS = [
        { id: 'calendar', name: 'Календарь' },
        { id: 'my-days', name: 'Мои дни' },
        { id: 'day-details', name: 'Детали даты' },
        { id: 'notes', name: 'Заметки' },
        { id: 'tasks', name: 'Задачи' },
        { id: 'stats', name: 'Статистика' },
        { id: 'salary', name: 'Зарплата' },
        { id: 'management', name: 'Управление' },
        { id: 'admin', name: 'Администрирование' },
        { id: 'intersections', name: 'Пересечения' },
        { id: 'export', name: 'Экспорт' }
    ];

    function openSettingsModal() {
        const raw = localStorage.getItem('narabote-display-settings');
        const settings = raw ? JSON.parse(raw) : { hiddenBlocks: [], theme: 'dark' };
        let html = '<div class="settings-section"><div class="settings-section-title">Отображение блоков</div>';
        ALL_BLOCKS.forEach(b => {
            const hidden = (settings.hiddenBlocks || []).includes(b.id);
            html += '<div class="settings-block-row">';
            html += '<label><input type="checkbox" data-sb="' + b.id + '"' + (hidden ? '' : ' checked') + '> ' + escHtml(b.name) + '</label>';
            html += '</div>';
        });
        html += '</div>';
        html += '<div class="settings-section"><div class="settings-section-title">Шаблоны</div>';
        html += '<button class="btn btn-outline btn-sm" id="settingsOpenTemplates">Открыть редактор шаблонов</button>';
        html += '</div>';
        html += '<div class="settings-section"><div class="settings-section-title">Данные</div>';
        html += '<button class="btn btn-outline btn-sm" id="settingsResetLayout">Сбросить порядок блоков</button>';
        html += '</div>';
        $('settingsModalBody').innerHTML = html;
        $('settingsModalOverlay').classList.add('show');

        $('settingsOpenTemplates').onclick = () => {
            $('settingsModalOverlay').classList.remove('show');
            openTemplateEditor();
        };
        $('settingsResetLayout').onclick = () => {
            localStorage.removeItem('narabote-block-order');
            localStorage.removeItem('narabote-display-settings');
            toast('Порядок блоков сброшен. Перезагрузите страницу.', 'info');
        };
    }

    $('settingsModalCancel').onclick = () => { $('settingsModalOverlay').classList.remove('show'); };
    $('settingsModalOverlay').onclick = e => { if (e.target === $('settingsModalOverlay')) $('settingsModalOverlay').classList.remove('show'); };
    $('settingsModalSave').onclick = () => {
        const hiddenBlocks = [];
        $('settingsModalBody').querySelectorAll('[data-sb]').forEach(cb => {
            if (!cb.checked) hiddenBlocks.push(cb.dataset.sb);
        });
        const settings = { hiddenBlocks, theme: document.body.classList.contains('light-theme') ? 'light' : 'dark' };
        localStorage.setItem('narabote-display-settings', JSON.stringify(settings));
        applyDisplaySettings();
        $('settingsModalOverlay').classList.remove('show');
        toast('Настройки сохранены', 'success');
    };

    /* ==========================================================
       *  СТАРТ
      * ========================================================== */

    init();
})();
