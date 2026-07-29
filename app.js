// ==================== FIREBASE INIT (UPDATED) ====================
        const firebaseConfig = {
            apiKey: "AIzaSyCEE0I2qeHM6Z3WteznXbgjLF6jwlsXye4",
            authDomain: "korexmessenger.firebaseapp.com",
            databaseURL: "https://korexmessenger-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "korexmessenger",
            storageBucket: "korexmessenger.firebasestorage.app",
            messagingSenderId: "279273011990",
            appId: "1:279273011990:web:cd75fbddfcdf5214fe2e37",
            measurementId: "G-91SL3ZNTTC"
        };
        firebase.initializeApp(firebaseConfig);
        const auth = firebase.auth();
        const db = firebase.firestore();
        db.settings({ ignoreUndefinedProperties: true });

        // ==================== GLOBAL STATE ====================
        let currentUser = null;
        let currentProfile = null;
        let allUsers = {};
        let allGroups = {};
        let activeChats = new Set();
        let currentChat = null;
        let messageCache = {};
        let lastMessagePreviews = {};
        let lastMessageTimes = {};
        let unreadCounts = {};
        let typingTimers = {};
        let darkMode = localStorage.getItem('quark_dark') === '1';
        let fontSize = localStorage.getItem('quark_font') || 'medium';
        let soundEnabled = localStorage.getItem('quark_sound') !== 'false';
        let bubbleStyle = localStorage.getItem('quark_bubble') || 'rounded'; // rounded | square
        let compactList = localStorage.getItem('quark_compact') === '1';
        let enterToSend = localStorage.getItem('quark_enter_send') !== 'false';
        let readReceiptsOn = localStorage.getItem('quark_read_receipts') !== 'false';
        let autoDownloadImages = localStorage.getItem('quark_auto_dl') !== 'false';
        let typingIndicatorOn = localStorage.getItem('quark_typing_ind') !== 'false';
        let notifPreviewOn = localStorage.getItem('quark_notif_preview') !== 'false';
        let unsubscribeMessages = null;
        let replyTo = null;
        let msgToForward = null;
        let groupCreationSelectedUsers = [];
        let savedAccounts = JSON.parse(localStorage.getItem('quark_accounts') || '[]');

        // ==================== QUARKMANAGER BOT ====================
        // A fully client-side "bot" chat — findable via search or from chat
        // settings, no backend needed. Its messages live only in localStorage
        // per-account, never touching Firestore.
        const BOT_ID = 'bot_quarkmanager';
        const BOT_PROFILE = {
            id: BOT_ID, displayName: 'QuarkManager', username: 'quarkmanager',
            bio: 'Официальный бот-помощник KoreXChat. Напишите /help, чтобы увидеть команды.',
            isBot: true
        };
        function botStorageKey() { return 'quark_bot_msgs_' + (currentUser ? currentUser.uid : 'anon'); }
        function loadBotMessages() {
            try { return JSON.parse(localStorage.getItem(botStorageKey()) || '[]'); } catch (e) { return []; }
        }
        function saveBotMessages(msgs) {
            try { localStorage.setItem(botStorageKey(), JSON.stringify(msgs)); } catch (e) {}
        }
        function botAddChat() {
            if (!activeChats.has(BOT_ID)) activeChats.add(BOT_ID);
            const msgs = loadBotMessages();
            if (msgs.length === 0) {
                pushBotMessage('Привет! Я QuarkManager 🤖 — бот-помощник этого мессенджера.\nНапишите /help, чтобы увидеть список команд.', false);
            }
            unhideChat(BOT_ID);
            const last = msgs[msgs.length - 1];
            lastMessagePreviews[BOT_ID] = last ? (last.text || '').substring(0, 30) : BOT_PROFILE.bio.substring(0,30);
            lastMessageTimes[BOT_ID] = last ? last.ts : Date.now();
            renderChatList();
        }
        function pushBotMessage(text, isMine) {
            const msgs = loadBotMessages();
            const m = { id: 'b' + Date.now() + Math.random().toString(36).slice(2), text, userId: isMine ? (currentUser?currentUser.uid:'me') : BOT_ID, ts: Date.now() };
            msgs.push(m); saveBotMessages(msgs);
            lastMessagePreviews[BOT_ID] = text.substring(0, 30);
            lastMessageTimes[BOT_ID] = m.ts;
            return m;
        }
        function renderBotChat() {
            const area = $('#msgArea'); if (!area) return;
            const msgs = loadBotMessages(); area.innerHTML = '';
            if (!msgs.length) { area.innerHTML = '<div class="empty-state"><i class="far fa-comments"></i><p>Здесь пока пусто</p></div>'; return; }
            let lastDate = null;
            msgs.forEach(m => {
                const dt = new Date(m.ts);
                const ds = dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
                if (ds !== lastDate) { const dv = document.createElement('div'); dv.className = 'date-divider'; dv.innerHTML = '<span>' + escapeHtml(ds) + '</span>'; area.appendChild(dv); lastDate = ds; }
                const isMine = m.userId !== BOT_ID;
                const wrapper = document.createElement('div'); wrapper.className = 'msg-wrap ' + (isMine ? 'sent' : 'received');
                const bubble = document.createElement('div'); bubble.className = 'msg-bub';
                const textSpan = document.createElement('span'); textSpan.style.whiteSpace = 'pre-wrap'; textSpan.textContent = m.text;
                bubble.appendChild(textSpan);
                const timeSpan = document.createElement('span'); timeSpan.className = 'msg-time';
                timeSpan.textContent = dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                bubble.appendChild(timeSpan);
                wrapper.appendChild(bubble); area.appendChild(wrapper);
            });
            area.scrollTop = 999999;
        }
        function botReplyTo(userText) {
            const t = userText.trim().toLowerCase();
            const totalChats = activeChats.size;
            const totalUnread = Object.values(unreadCounts).reduce((a,b)=>a+b,0);
            if (t === '/help' || t === 'помощь' || t === 'help') {
                return 'Доступные команды:\n/help — список команд\n/stats — статистика ваших чатов\n/theme — переключить тёмную тему\n/id — ваш ID пользователя\n/ping — проверка связи\n/about — о боте';
            }
            if (t === '/stats' || t === 'статистика') {
                return `📊 Ваша статистика:\nАктивных чатов: ${totalChats}\nНепрочитанных сообщений: ${totalUnread}`;
            }
            if (t === '/theme' || t === 'тема') {
                darkMode = !darkMode; localStorage.setItem('quark_dark', darkMode ? '1' : '0'); applyTheme();
                return darkMode ? '🌙 Включена тёмная тема' : '☀️ Включена светлая тема';
            }
            if (t === '/id') return `Ваш ID: ${currentUser ? currentUser.uid : '—'}`;
            if (t === '/ping') return '🏓 Понг! Всё работает.';
            if (t === '/about' || t === 'о боте') return 'QuarkManager — встроенный бот-помощник KoreXChat. Работает полностью локально, без доступа к вашим сообщениям.';
            if (t.includes('привет')) return 'Привет! 👋 Чем могу помочь? Напишите /help';
            if (t.includes('спасибо')) return 'Пожалуйста! 😊';
            return 'Не понимаю эту команду. Напишите /help, чтобы увидеть список доступных команд.';
        }

        let unsubscribeUserStatus = null;
        let unsubscribeTyping = null;
        let statusTickInterval = null;

        // ==================== STORIES ====================
        // Stored per-account in localStorage, expire after 24h. Kept simple
        // and fully client-side (no backend collection needed).
        const STORY_TTL = 24 * 60 * 60 * 1000;
        let storiesByUser = {}; // uid -> array of story docs, newest last
        function seenStoriesKey() { return 'korex_stories_seen_' + (currentUser ? currentUser.uid : 'anon'); }
        function getSeenStoryIds() {
            try { return JSON.parse(localStorage.getItem(seenStoriesKey()) || '[]'); } catch (e) { return []; }
        }
        function markStorySeen(id) {
            const seen = getSeenStoryIds();
            if (!seen.includes(id)) { seen.push(id); localStorage.setItem(seenStoriesKey(), JSON.stringify(seen)); }
        }

        // Loads active (non-expired) stories from everyone the user can see (contacts + self).
        async function loadAllStories() {
            storiesByUser = {};
            const cutoff = firebase.firestore.Timestamp.fromMillis(Date.now() - STORY_TTL);
            try {
                const snap = await db.collection('stories').where('ts', '>=', cutoff).orderBy('ts', 'asc').get();
                snap.forEach(doc => {
                    const s = { id: doc.id, ...doc.data() };
                    if (!storiesByUser[s.userId]) storiesByUser[s.userId] = [];
                    storiesByUser[s.userId].push(s);
                });
            } catch (e) { console.error('Failed to load stories', e); }
        }

        // Returns whether uid has an unexpired story right now, used to draw the avatar ring anywhere.
        function userHasStory(uid) { return !!(storiesByUser[uid] && storiesByUser[uid].length); }
        function userStoriesAllSeen(uid) {
            const list = storiesByUser[uid]; if (!list || !list.length) return true;
            const seen = getSeenStoryIds();
            return list.every(s => seen.includes(s.id));
        }
        // Wraps an existing avatar's inner HTML with a story ring class if that user has a story.
        function storyRingClass(uid) {
            if (!userHasStory(uid)) return '';
            return 'has-story' + (userStoriesAllSeen(uid) ? ' story-seen' : '');
        }

        function renderStoriesRow() {
            const row = $('#storiesRow'); if (!row || !currentProfile) return;
            row.innerHTML = '';
            const own = storiesByUser[currentUser.uid] || [];

            const ownItem = document.createElement('div'); ownItem.className = 'story-item';
            const ownAvatarInner = currentProfile.avatarUrl ? `<img src="${currentProfile.avatarUrl}">` : `<div class="avatar">${(currentProfile.displayName||'Я')[0].toUpperCase()}</div>`;
            const hasOwn = own.length > 0;
            ownItem.innerHTML = `
                <div class="story-ring ${hasOwn ? (userStoriesAllSeen(currentUser.uid) ? 'seen' : '') : 'own'} story-add-badge">
                    <div class="story-avatar">${ownAvatarInner}</div>
                    <div class="story-add-plus"><i class="fas fa-plus"></i></div>
                </div>
                <div class="story-name">Мои истории</div>`;
            ownItem.onclick = () => {
                if (hasOwn) openStoryViewer(currentUser.uid);
                else $('#storyFileInput').click();
            };
            row.appendChild(ownItem);

            // Other users with active stories, most recent first.
            const others = Object.keys(storiesByUser).filter(uid => uid !== currentUser.uid);
            others.sort((a, b) => {
                const la = storiesByUser[a][storiesByUser[a].length - 1];
                const lb = storiesByUser[b][storiesByUser[b].length - 1];
                return (lb.ts?.toMillis?.() || 0) - (la.ts?.toMillis?.() || 0);
            });
            others.forEach(uid => {
                const u = allUsers[uid]; if (!u) return;
                const item = document.createElement('div'); item.className = 'story-item';
                const avInner = u.avatarUrl ? `<img src="${u.avatarUrl}">` : `<div class="avatar">${(u.displayName||'?')[0].toUpperCase()}</div>`;
                item.innerHTML = `
                    <div class="story-ring ${userStoriesAllSeen(uid) ? 'seen' : ''}">
                        <div class="story-avatar">${avInner}</div>
                    </div>
                    <div class="story-name">${escapeHtml(u.displayName || 'Пользователь')}</div>`;
                item.onclick = () => openStoryViewer(uid);
                row.appendChild(item);
            });
        }

        // Opens the story viewer for a given user's story stack (works for self and others).
        function openStoryViewer(uid) {
            const stories = storiesByUser[uid]; if (!stories || !stories.length) return;
            const isOwn = uid === currentUser.uid;
            const viewer = $('#storyViewer'); if (!viewer) return;
            let idx = 0; let timer = null;
            viewer.classList.remove('hidden');

            function renderProgress() {
                const pr = $('#storyProgressRow'); pr.innerHTML = '';
                stories.forEach((_, i) => {
                    const bar = document.createElement('div'); bar.className = 'story-progress-bar';
                    const fill = document.createElement('div'); fill.className = 'story-progress-fill';
                    fill.style.width = i < idx ? '100%' : '0%';
                    bar.appendChild(fill); pr.appendChild(bar);
                });
            }
            function showStory() {
                clearTimeout(timer);
                if (idx >= stories.length) { closeViewer(); return; }
                if (idx < 0) { idx = 0; }
                const s = stories[idx];
                markStorySeen(s.id);
                renderProgress();
                const fills = $$('#storyProgressRow .story-progress-fill');
                fills.forEach((f, i) => { f.style.transition = 'none'; f.style.width = i < idx ? '100%' : '0%'; });
                void fills[idx]?.offsetWidth;
                if (fills[idx]) { fills[idx].style.transition = 'width 5s linear'; fills[idx].style.width = '100%'; }

                const author = isOwn ? currentProfile : allUsers[uid];
                $('#storyViewerName').textContent = isOwn ? (currentProfile.displayName || 'Я') : (author?.displayName || 'Пользователь');
                $('#storyViewerTime').textContent = formatTime(s.ts?.toDate ? s.ts.toDate().getTime() : Date.now());
                $('#storyViewerAv').innerHTML = author?.avatarUrl ? `<img src="${author.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : '<i class="fas fa-user"></i>';
                $('#storyViewerContent').querySelectorAll('img').forEach(i => i.remove());
                const img = document.createElement('img'); img.src = s.imageUrl;
                $('#storyViewerContent').insertBefore(img, $('#storyPrevZone'));
                renderStoriesRow();
                timer = setTimeout(() => { idx++; showStory(); }, 5000);
            }
            function closeViewer() {
                clearTimeout(timer); viewer.classList.add('hidden');
                $('#storyViewerContent').querySelectorAll('img').forEach(i => i.remove());
                renderStoriesRow();
            }
            $('#storyCloseBtn').onclick = closeViewer;
            $('#storyPrevZone').onclick = () => { idx--; showStory(); };
            $('#storyNextZone').onclick = () => { idx++; showStory(); };
            showStory();
        }

        const $ = (s) => document.querySelector(s);
        const $$ = (s) => document.querySelectorAll(s);

        // ==================== UTILS ====================
        function getChatId(id) {
            if (!id) return '';
            if (id.startsWith('group_') || id.startsWith('channel_')) return id;
            return [currentUser.uid, id].sort().join('_');
        }
        function isGroupOrChannel(id) { return id.startsWith('group_') || id.startsWith('channel_'); }
        function isChannel(id) { return id.startsWith('channel_'); }

        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str == null ? '' : String(str);
            return div.innerHTML;
        }

        function formatTime(ts) {
            if (!ts) return '';
            const d = new Date(ts); const now = new Date();
            if (d.getDate() === now.getDate() && d.getMonth() === now.getMonth()) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const y = new Date(now); y.setDate(y.getDate() - 1);
            if (d.getDate() === y.getDate() && d.getMonth() === y.getMonth()) return 'Вчера';
            return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
        }

        function applyTheme() {
            const app = $('#app');
            if (app) {
                app.classList.toggle('dark-theme', darkMode);
                document.body.classList.toggle('dark-theme', darkMode);
            }
            const dt = $('#darkToggle'); if (dt) dt.classList.toggle('active', darkMode);
        }

        function applyFontSize() {
            const scales = { small: '0.9', medium: '1.0', large: '1.15' };
            document.documentElement.style.zoom = scales[fontSize] || '1.0';
        }

        function playSound() {
            if (!soundEnabled) return;
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type = 'sine'; osc.frequency.setValueAtTime(800, ctx.currentTime);
                osc.frequency.setValueAtTime(1000, ctx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.3, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
            } catch (e) {}
        }

        function showCustomAlert(message) {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999;';
            const modal = document.createElement('div');
            modal.style.cssText = `background:var(--glass);backdrop-filter:blur(30px);border-radius:16px;padding:24px;max-width:300px;text-align:center;border:1px solid var(--glass-border);color:var(--text);`;
            modal.innerHTML = `<p style="margin-bottom:16px;font-size:15px;word-break:break-word;">${message}</p><button style="background:var(--primary);color:white;border:none;padding:10px 24px;border-radius:10px;cursor:pointer;">OK</button>`;
            overlay.appendChild(modal); document.body.appendChild(overlay);
            modal.querySelector('button').onclick = () => overlay.remove();
        }

        // ==================== AUTH ====================
        function showAuthScreen() {
            $('#mainContent').innerHTML = `
                <div class="screen active" id="authScreen" style="z-index: 200; background: var(--bg);">
                    <div class="auth-container">
                        <div class="auth-card" id="loginForm">
                            <h2>Вход в KoreXChat</h2>
                            <input type="email" class="auth-input" id="loginEmail" placeholder="Email">
                            <input type="password" class="auth-input" id="loginPassword" placeholder="Пароль">
                            <button class="btn btn-primary" id="loginBtn">Войти</button>
                            <div class="auth-link" id="showRegister">Нет аккаунта? Регистрация</div>
                        </div>
                        <div class="auth-card hidden" id="registerForm">
                            <h2>Регистрация</h2>
                            <input type="text" class="auth-input" id="regName" placeholder="Имя">
                            <input type="email" class="auth-input" id="regEmail" placeholder="Email">
                            <input type="password" class="auth-input" id="regPassword" placeholder="Пароль">
                            <button class="btn btn-primary" id="registerBtn">Создать</button>
                            <div class="auth-link" id="showLogin">Есть аккаунт? Войти</div>
                        </div>
                    </div>
                </div>`;

            $('#loginBtn').onclick = async () => {
                const e = $('#loginEmail').value, p = $('#loginPassword').value;
                if(e&&p) try { await auth.signInWithEmailAndPassword(e, p); } catch(err){ showCustomAlert(err.message); }
            };
            $('#registerBtn').onclick = async () => {
                const n = $('#regName').value, e = $('#regEmail').value, p = $('#regPassword').value;
                if(n&&e&&p) try {
                    const res = await auth.createUserWithEmailAndPassword(e, p);
                    await db.collection('users').doc(res.user.uid).set({ id: res.user.uid, displayName: n, username: '', bio: '', avatarUrl: '' });
                } catch(err){ showCustomAlert(err.message); }
            };
            $('#showRegister').onclick = () => { $('#loginForm').classList.add('hidden'); $('#registerForm').classList.remove('hidden'); };
            $('#showLogin').onclick = () => { $('#registerForm').classList.add('hidden'); $('#loginForm').classList.remove('hidden'); };
        }

        // ==================== UI BUILDER ====================
        function buildMainUI() {
            $('#mainContent').innerHTML = `
                <!-- Main Screens -->
                <div class="screen active" id="screenChats">
                    <div class="header">
                        <span style="font-weight:700;font-size:20px;color:var(--text);"><i class="fas fa-meteor" style="color:var(--primary); margin-right:6px;"></i>KoreXChat</span>
                        <div style="flex:1;"></div>
                        <button class="icon-button" id="openCreateChatBtn" title="Создать чат"><i class="fas fa-edit"></i></button>
                    </div>
                    <div class="chat-scroll">
                        <div class="stories-row" id="storiesRow"></div>
                        <div class="search-box"><div class="search-wrapper"><i class="fas fa-search"></i><input type="text" class="search-input" id="globalSearch" placeholder="Поиск чатов и людей..."></div></div>
                        <div id="chatList"></div>
                    </div>
                </div>

                <div class="screen" id="screenMessages">
                    <div class="header">
                        <button class="icon-button" id="backBtn"><i class="fas fa-arrow-left"></i></button>
                        <div class="avatar-ring" id="msgAvRing" style="cursor:pointer;" title="Смотреть профиль">
                            <div class="avatar" id="msgAv" style="width:36px;height:36px;font-size:14px; margin-left:4px;"></div>
                        </div>
                        <div style="flex:1;min-width:0;margin-left:10px; cursor:pointer;" id="msgInfo" title="Смотреть профиль">
                            <div style="font-weight:600;font-size:16px;color:var(--text);" id="msgName"></div>
                            <div style="font-size:12px;color:var(--primary);" id="msgTyping"></div>
                        </div>
                        <button class="icon-button" id="groupAddUserBtn" style="display:none;" title="Добавить участника"><i class="fas fa-user-plus"></i></button>
                        <button class="icon-button" id="channelDiscussionBtn" style="display:none; margin-left:5px;" title="Чат канала"><i class="fas fa-comments"></i></button>
                        <button class="icon-button" id="groupSettingsBtn" style="display:none; margin-left:5px;" title="Настройки группы"><i class="fas fa-cog"></i></button>
                        <button class="icon-button" id="chatMenuBtn" style="margin-left:5px;" title="Меню чата"><i class="fas fa-ellipsis-v"></i></button>
                    </div>
                    <div class="msg-area" id="msgArea"><div class="empty-state"><i class="far fa-comments"></i><p>Загрузка...</p></div></div>
                    <div class="input-container" id="inputContainer">
                        <div class="reply-bar hidden" id="replyBar"><div class="reply-preview" id="replyPreview"></div><span class="reply-close" id="replyClose"><i class="fas fa-times"></i></span></div>
                        <div class="input-row" id="inputRow">
                            <button class="icon-button" id="attachBtn"><i class="fas fa-paperclip"></i></button>
                            <textarea class="msg-input" id="msgInput" placeholder="Сообщение..." rows="1" maxlength="2000"></textarea>
                            <button class="send-btn" id="sendBtn"><i class="fas fa-paper-plane"></i></button>
                        </div>
                        <div class="hidden" id="channelReadonlyBar" style="padding:14px;text-align:center;font-size:13px;color:var(--text-secondary);"><i class="fas fa-bullhorn"></i> Только владелец канала может публиковать сообщения</div>
                    </div>
                </div>

                <div class="screen" id="screenSettings">
                    <div class="header"><span style="font-weight:700;font-size:18px;color:var(--text);">Настройки</span></div>
                    <div class="settings-scroll">
                        <div class="settings-group-label">Внешний вид</div>
                        <div class="settings-group">
                            <div class="settings-row" id="darkRow">
                                <div class="settings-left"><div class="settings-icon" style="background:var(--surface);color:var(--text);"><i class="fas fa-moon"></i></div><span class="settings-text">Тёмная тема</span></div>
                                <div class="toggle" id="darkToggle"></div>
                            </div>
                            <div class="settings-row" id="fontRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(59,130,246,0.15);color:#3B82F6;"><i class="fas fa-font"></i></div><span class="settings-text">Размер шрифта</span></div>
                                <span class="settings-value" id="fontValue">Средний</span>
                            </div>
                            <div class="settings-row" id="bubbleStyleRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(139,92,246,0.15);color:var(--primary);"><i class="fas fa-comment-alt"></i></div><span class="settings-text">Стиль пузырей сообщений</span></div>
                                <span class="settings-value" id="bubbleStyleValue">Закруглённые</span>
                            </div>
                            <div class="settings-row" id="compactRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(245,158,11,0.15);color:#F59E0B;"><i class="fas fa-compress-alt"></i></div><span class="settings-text">Компактный список чатов</span></div>
                                <div class="toggle" id="compactToggle"></div>
                            </div>
                        </div>

                        <div class="settings-group-label">Чаты</div>
                        <div class="settings-group">
                            <div class="settings-row" id="enterSendRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(16,185,129,0.15);color:#10B981;"><i class="fas fa-paper-plane"></i></div><span class="settings-text">Enter — отправить сообщение</span></div>
                                <div class="toggle" id="enterSendToggle"></div>
                            </div>
                            <div class="settings-row" id="readReceiptsRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(16,185,129,0.15);color:#10B981;"><i class="fas fa-check-double"></i></div><span class="settings-text">Показывать статус прочтения</span></div>
                                <div class="toggle" id="readReceiptsToggle"></div>
                            </div>
                            <div class="settings-row" id="autoDownloadRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(59,130,246,0.15);color:#3B82F6;"><i class="fas fa-image"></i></div><span class="settings-text">Автозагрузка изображений</span></div>
                                <div class="toggle" id="autoDownloadToggle"></div>
                            </div>
                            <div class="settings-row" id="onlineStatusRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(16,185,129,0.15);color:#10B981;"><i class="fas fa-circle"></i></div><span class="settings-text">Показывать «печатает...»</span></div>
                                <div class="toggle" id="onlineStatusToggle"></div>
                            </div>
                        </div>

                        <div class="settings-group-label">Уведомления</div>
                        <div class="settings-group">
                            <div class="settings-row" id="soundRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(16,185,129,0.15);color:#10B981;"><i class="fas fa-volume-up"></i></div><span class="settings-text">Звук уведомлений</span></div>
                                <div class="toggle" id="soundToggle"></div>
                            </div>
                            <div class="settings-row" id="previewRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(139,92,246,0.15);color:var(--primary);"><i class="fas fa-eye"></i></div><span class="settings-text">Превью текста в уведомлениях</span></div>
                                <div class="toggle" id="previewToggle"></div>
                            </div>
                        </div>

                        <div class="settings-group-label">Бот-помощник</div>
                        <div class="settings-group">
                            <div class="settings-row" id="botOpenRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(139,92,246,0.15);color:var(--primary);"><i class="fas fa-robot"></i></div><span class="settings-text">QuarkManager</span></div>
                                <span class="settings-value">Открыть чат <i class="fas fa-chevron-right" style="margin-left:4px;"></i></span>
                            </div>
                        </div>

                        <div class="settings-group-label">Конфиденциальность</div>
                        <div class="settings-group">
                            <div class="settings-row" id="privacyRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(124,77,255,0.15);color:var(--primary);"><i class="fas fa-user-shield"></i></div><span class="settings-text">Конфиденциальность</span></div>
                                <i class="fas fa-chevron-right" style="color:var(--text-secondary);font-size:13px;"></i>
                            </div>
                        </div>

                        <div class="settings-group-label">Аккаунт</div>
                        <div class="settings-group">
                            <div class="settings-row" id="accountManageRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(124,77,255,0.15);color:var(--primary);"><i class="fas fa-user-cog"></i></div><span class="settings-text">Управление аккаунтом</span></div>
                                <i class="fas fa-chevron-right" style="color:var(--text-secondary);font-size:13px;"></i>
                            </div>
                            <div class="settings-row" id="switchAccountRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(124,77,255,0.15);color:var(--primary);"><i class="fas fa-exchange-alt"></i></div><span class="settings-text">Сменить аккаунт</span></div>
                            </div>
                            <div class="settings-row" id="settLogout">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(239,68,68,0.15);color:var(--danger);"><i class="fas fa-sign-out-alt"></i></div><span class="settings-text" style="color:var(--danger);">Выйти из аккаунта</span></div>
                            </div>
                        </div>

                        <div class="settings-group-label">О приложении</div>
                        <div class="settings-group">
                            <div class="settings-row" style="cursor:default;">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(59,130,246,0.15);color:#3B82F6;"><i class="fas fa-info-circle"></i></div><span class="settings-text">О мессенджере</span></div>
                            </div>
                            <div style="padding:0 15px 14px;font-size:13px;color:var(--text-secondary);line-height:1.5;">KoreXChat — продвинутая модификация к мессенджеру Quark.</div>
                        </div>
                    </div>
                </div>

                <div class="screen" id="screenProfile">
                    <div class="header"><span style="font-weight:700;font-size:18px;color:var(--text);">Мой Профиль</span></div>
                    <div class="profile-scroll">
                        <div class="profile-card">
                            <div class="profile-avatar-wrap">
                                <div class="avatar-ring" id="profAvRing" style="width:92px;height:92px;cursor:pointer;">
                                    <div class="avatar" id="profAv"></div>
                                </div>
                                <div class="profile-avatar-edit" id="avEditBtn"><i class="fas fa-camera"></i></div>
                                <div id="statusEmojiBadge" title="Эмодзи-статус" style="position:absolute; bottom:-2px; left:-2px; width:30px; height:30px; border-radius:50%; background:var(--surface); border:3px solid var(--bg); display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden; font-size:15px;"><i class="fas fa-plus" style="font-size:11px; color:var(--text-secondary);"></i></div>
                            </div>
                            <p style="text-align:center; font-size:11px; color:var(--text-secondary); margin:-6px 0 14px;">Нажмите на значок слева, чтобы задать эмодзи-статус из файла</p>
                            <div class="form-group"><label>Имя</label><input type="text" class="form-input" id="dnInput"></div>
                            <div class="form-group"><label>Username</label><input type="text" class="form-input" id="unInput" placeholder="@username"></div>
                            <div class="form-group"><label>Дата рождения</label><input type="date" class="form-input" id="birthdateInput"></div>
                            <div class="form-group"><label>О себе (поддерживаются отметки @)</label><textarea class="form-input" id="bioInput" rows="2"></textarea></div>
                            <button class="btn btn-primary" id="saveProfBtn">Сохранить</button>
                        </div>
                    </div>
                </div>

                <!-- Floating Bottom Nav -->
                <div class="bottom-nav-wrapper" id="bottomNavWrapper">
                    <div class="bottom-nav" id="bottomNav">
                        <button class="nav-item active" data-sc="screenChats">
                            <i class="fas fa-comment-dots"></i><span>Чаты</span>
                            <div class="nav-badge" id="mainUnreadBadge"></div>
                        </button>
                        <button class="nav-item" data-sc="screenSettings"><i class="fas fa-cog"></i><span>Настройки</span></button>
                        <button class="nav-item" data-sc="screenProfile"><i class="fas fa-user-circle"></i><span>Профиль</span></button>
                    </div>
                </div>

                <!-- Modals -->
                <!-- Create Group Modal -->
                <div class="full-modal" id="createGroupModal">
                    <div class="fm-header">
                        <button class="icon-button" onclick="$('#createGroupModal').classList.remove('show')"><i class="fas fa-arrow-left"></i></button>
                        <div class="fm-title">Новый чат</div>
                        <button class="icon-button" id="confirmCreateGroupBtn" style="color:var(--primary);"><i class="fas fa-check"></i></button>
                    </div>
                    <div class="fm-content">
                        <input type="text" id="newGroupName" class="form-input" placeholder="Название группы (необязательно)" style="margin-bottom:16px; font-size:16px;">
                        <div class="chips-container" id="groupChips"></div>
                        <div class="search-wrapper" style="margin-bottom:12px;"><i class="fas fa-search"></i><input type="text" class="search-input" id="userSearchInput" placeholder="Поиск по @username или имени..."></div>
                        <div id="userSearchResults"></div>
                    </div>
                </div>

                <!-- Forward Modal -->
                <div class="full-modal" id="forwardModal">
                    <div class="fm-header">
                        <button class="icon-button" onclick="$('#forwardModal').classList.remove('show')"><i class="fas fa-arrow-left"></i></button>
                        <div class="fm-title">Переслать сообщение</div>
                    </div>
                    <div class="fm-content">
                        <div class="search-wrapper" style="margin-bottom:12px;"><i class="fas fa-search"></i><input type="text" class="search-input" id="fwdSearchInput" placeholder="Поиск чата..."></div>
                        <div id="fwdChatList"></div>
                    </div>
                </div>

                <!-- View Profile Modal (Other Users) -->
                <div class="full-modal" id="viewProfileModal">
                    <div class="fm-header">
                        <button class="icon-button" onclick="$('#viewProfileModal').classList.remove('show')"><i class="fas fa-arrow-left"></i></button>
                        <div class="fm-title">Профиль</div>
                    </div>
                    <div class="fm-content" style="text-align:center; padding-top:30px;">
                        <div class="avatar-ring" id="vpAvRing" style="width:100px; height:100px; margin:0 auto 16px; cursor:pointer;">
                            <div class="avatar" id="vpAv" style="width:100%; height:100%; font-size:36px;"></div>
                        </div>
                        <h2 id="vpName" style="color:var(--text); margin-bottom:4px;">Имя</h2>
                        <div id="vpUser" style="color:var(--primary); margin-bottom:12px; font-size:14px;">@username</div>
                        <p id="vpBio" style="color:var(--text-secondary); font-size:14px; margin-bottom:20px; padding:0 20px;"></p>

                        <div id="vpActions" style="display:flex; gap:10px; padding:0 20px; margin-bottom:24px;"></div>

                        <div id="userPublicGroups" style="text-align:left; padding:0 10px;"></div>
                        <div id="userSharedGroups" style="text-align:left; padding:0 10px; margin-top:20px;"></div>
                    </div>
                </div>

                <!-- Group Settings Modal -->
                <div class="full-modal" id="groupSettingsModal">
                    <div class="fm-header">
                        <button class="icon-button" onclick="$('#groupSettingsModal').classList.remove('show')"><i class="fas fa-arrow-left"></i></button>
                        <div class="fm-title">Настройки группы</div>
                        <button class="icon-button" id="saveGroupSettingsBtn" style="color:var(--primary);"><i class="fas fa-check"></i></button>
                    </div>
                    <div class="fm-content">
                        <div class="profile-avatar-wrap" style="margin-top:10px;">
                            <div class="avatar" id="gsAv"></div>
                            <div class="profile-avatar-edit" id="gsAvEditBtn"><i class="fas fa-camera"></i></div>
                        </div>
                        <div class="settings-group" style="padding:16px;">
                            <label style="display:block; font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:8px;">Название группы</label>
                            <input type="text" id="gsNameInput" class="form-input" style="margin-bottom:16px;">
                            
                            <label style="display:block; font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:8px;">Публичная ссылка (groupname)</label>
                            <input type="text" id="gsPublicName" class="form-input" placeholder="@mygroup">
                            <p style="font-size:12px; color:var(--text-secondary); margin-top:8px;">Если установить ссылку, группа станет публичной и будет отображаться в вашем профиле.</p>
                        </div>

                        <div class="settings-group" style="margin-top:12px;">
                            <div class="settings-row" id="gsForwardBtn">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(124,77,255,0.15);color:var(--primary);"><i class="fas fa-share"></i></div><span class="settings-text">Переслать</span></div>
                                <i class="fas fa-chevron-right" style="color:var(--text-secondary);font-size:13px;"></i>
                            </div>
                        </div>

                        <div id="gsMembersList" style="padding:0 10px;"></div>
                    </div>
                </div>

                <!-- Join Group Modal (Overlay) -->
                <div class="modal-overlay hidden" id="joinGroupOverlay">
                    <div class="dialog-modal">
                        <div class="avatar" id="jgAvatar" style="width:70px; height:70px; font-size:24px; margin:0 auto 12px;"><i class="fas fa-users"></i></div>
                        <h3 id="jgName" style="margin-bottom:8px;">Название группы</h3>
                        <p style="font-size:14px; color:var(--text-secondary);">Вы хотите войти в этот чат?</p>
                        <div style="display:flex; gap:10px; margin-top:20px;">
                            <button id="jgYesBtn" class="btn btn-primary" style="flex:1;">Да</button>
                            <button id="jgNoBtn" class="btn" style="flex:1; background:rgba(128,128,128,0.2); color:var(--text);">Нет</button>
                        </div>
                    </div>
                </div>

                <!-- Add Member Modal -->
                <div class="full-modal" id="addMemberModal">
                    <div class="fm-header">
                        <button class="icon-button" onclick="$('#addMemberModal').classList.remove('show')"><i class="fas fa-arrow-left"></i></button>
                        <div class="fm-title">Добавить участника</div>
                    </div>
                    <div class="fm-content">
                        <div class="search-wrapper" style="margin-bottom:12px;"><i class="fas fa-search"></i><input type="text" class="search-input" id="addMemberSearch" placeholder="Поиск по @username или имени..."></div>
                        <div id="addMemberResults"></div>
                        <div style="margin-top:20px; text-align:center;">
                            <p style="font-size:13px; color:var(--text-secondary); margin-bottom:10px;">Или отправьте ссылку-приглашение</p>
                            <button class="btn btn-primary" id="copyInviteLinkBtn"><i class="fas fa-link"></i> Копировать ссылку</button>
                        </div>
                    </div>
                </div>

                <!-- Privacy Settings Modal -->
                <div class="full-modal" id="privacyModal">
                    <div class="fm-header">
                        <button class="icon-button" onclick="$('#privacyModal').classList.remove('show')"><i class="fas fa-arrow-left"></i></button>
                        <div class="fm-title">Конфиденциальность</div>
                    </div>
                    <div class="fm-content" id="privacyContent"></div>
                </div>

                <!-- Story Viewer -->
                <div class="story-viewer hidden" id="storyViewer">
                    <div class="story-progress-row" id="storyProgressRow"></div>
                    <div class="story-viewer-header">
                        <div class="avatar" id="storyViewerAv" style="width:34px;height:34px;font-size:13px;"></div>
                        <div>
                            <div class="story-viewer-name" id="storyViewerName"></div>
                            <div class="story-viewer-time" id="storyViewerTime"></div>
                        </div>
                        <button class="story-close-btn" id="storyCloseBtn"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="story-viewer-content" id="storyViewerContent">
                        <div class="story-tap-zone" id="storyPrevZone" style="left:0;"></div>
                        <div class="story-tap-zone" id="storyNextZone" style="right:0;"></div>
                    </div>
                </div>
                <input type="file" id="storyFileInput" class="hidden" accept="image/*">

                <!-- Create Channel Modal -->
                <div class="full-modal" id="createChannelModal">
                    <div class="fm-header">
                        <button class="icon-button" onclick="$('#createChannelModal').classList.remove('show')"><i class="fas fa-arrow-left"></i></button>
                        <div class="fm-title">Новый канал</div>
                        <button class="icon-button" id="confirmCreateChannelBtn" style="color:var(--primary);"><i class="fas fa-check"></i></button>
                    </div>
                    <div class="fm-content">
                        <input type="text" id="newChannelName" class="form-input" placeholder="Название канала" style="margin-bottom:16px; font-size:16px;">
                        <textarea id="newChannelDesc" class="form-input" placeholder="Описание (необязательно)" rows="3" style="margin-bottom:16px;resize:none;"></textarea>
                        <p style="font-size:13px;color:var(--text-secondary);"><i class="fas fa-bullhorn"></i> В канале публиковать сообщения может только владелец. Остальные — подписчики.</p>
                    </div>
                </div>

                <!-- Channel Settings Modal -->
                <div class="full-modal" id="channelSettingsModal">
                    <div class="fm-header">
                        <button class="icon-button" onclick="$('#channelSettingsModal').classList.remove('show')"><i class="fas fa-arrow-left"></i></button>
                        <div class="fm-title">Канал</div>
                        <button class="icon-button hidden" id="saveChannelSettingsBtn" style="color:var(--primary);"><i class="fas fa-check"></i></button>
                    </div>
                    <div class="fm-content">
                        <div class="profile-avatar-wrap" style="margin-top:10px;">
                            <div class="avatar" id="chsAv"><i class="fas fa-bullhorn"></i></div>
                            <div class="profile-avatar-edit hidden" id="chsAvEditBtn"><i class="fas fa-camera"></i></div>
                        </div>
                        <div class="settings-group" style="padding:16px;" id="chsOwnerFields">
                            <label style="display:block; font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:8px;">Название канала</label>
                            <input type="text" id="chsNameInput" class="form-input" style="margin-bottom:16px;">

                            <label style="display:block; font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:8px;">Публичная ссылка (channelname)</label>
                            <input type="text" id="chsPublicName" class="form-input" placeholder="@mychannel">
                            <p style="font-size:12px; color:var(--text-secondary); margin-top:8px;">Если установить ссылку, канал станет публичным и будет отображаться в вашем профиле.</p>
                        </div>
                        <div class="settings-group" style="margin-top:12px;">
                            <div class="settings-row" style="cursor:default;">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(124,77,255,0.15);color:var(--primary);"><i class="fas fa-users"></i></div><span class="settings-text" id="chsSubCount">0 подписчиков</span></div>
                            </div>
                            <div class="settings-row" id="chsLeaveBtn">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(239,68,68,0.15);color:var(--danger);"><i class="fas fa-sign-out-alt"></i></div><span class="settings-text" style="color:var(--danger);" id="chsLeaveLabel">Отписаться</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Account Management Modal -->
                <div class="full-modal" id="accountManageModal">
                    <div class="fm-header">
                        <button class="icon-button" onclick="$('#accountManageModal').classList.remove('show')"><i class="fas fa-arrow-left"></i></button>
                        <div class="fm-title">Управление аккаунтом</div>
                    </div>
                    <div class="fm-content">
                        <div class="settings-group">
                            <div class="settings-row" id="changePasswordRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(59,130,246,0.15);color:#3B82F6;"><i class="fas fa-key"></i></div><span class="settings-text">Сменить пароль</span></div>
                                <i class="fas fa-chevron-right" style="color:var(--text-secondary);font-size:13px;"></i>
                            </div>
                            <div class="settings-row" id="changeEmailRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(16,185,129,0.15);color:#10B981;"><i class="fas fa-envelope"></i></div><span class="settings-text">Привязать другую почту</span></div>
                                <i class="fas fa-chevron-right" style="color:var(--text-secondary);font-size:13px;"></i>
                            </div>
                            <div class="settings-row" id="accLogoutRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(245,158,11,0.15);color:#F59E0B;"><i class="fas fa-sign-out-alt"></i></div><span class="settings-text">Выйти из аккаунта</span></div>
                            </div>
                            <div class="settings-row" id="deleteAccountRow">
                                <div class="settings-left"><div class="settings-icon" style="background:rgba(239,68,68,0.15);color:var(--danger);"><i class="fas fa-user-times"></i></div><span class="settings-text" style="color:var(--danger);">Удалить аккаунт</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            updateProfileUI(); applyFontSize(); applyTheme(); applyBubbleStyle(); applyCompactList(); renderStoriesRow();

            $('#storyFileInput').onchange = async () => {
                const file = $('#storyFileInput').files[0]; if (!file) return;
                try {
                    const comp = await compressFile(file);
                    const ref = await db.collection('stories').add({
                        userId: currentUser.uid, imageUrl: comp.dataUrl,
                        ts: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    $('#storyFileInput').value = '';
                    await loadAllStories();
                    renderStoriesRow();
                    refreshStoryRingsEverywhere();
                    showCustomAlert('История опубликована');
                } catch (e) { showCustomAlert(e.message || 'Не удалось загрузить историю'); }
            };
            const fv = $('#fontValue'); if (fv) fv.textContent = { small: 'Мелкий', medium: 'Средний', large: 'Крупный' }[fontSize] || 'Средний';
            const st = $('#soundToggle'); if (st) st.classList.toggle('active', soundEnabled);
            const bsv = $('#bubbleStyleValue'); if (bsv) bsv.textContent = bubbleStyle === 'square' ? 'Прямоугольные' : 'Закруглённые';
            const compactT = $('#compactToggle'); if (compactT) compactT.classList.toggle('active', compactList);
            const enterT = $('#enterSendToggle'); if (enterT) enterT.classList.toggle('active', enterToSend);
            const readT = $('#readReceiptsToggle'); if (readT) readT.classList.toggle('active', readReceiptsOn);
            const autoT = $('#autoDownloadToggle'); if (autoT) autoT.classList.toggle('active', autoDownloadImages);
            const onlineT = $('#onlineStatusToggle'); if (onlineT) onlineT.classList.toggle('active', typingIndicatorOn);
            const prevT = $('#previewToggle'); if (prevT) prevT.classList.toggle('active', notifPreviewOn);
            
            setupListeners();
            if (statusTickInterval) clearInterval(statusTickInterval);
            statusTickInterval = setInterval(() => { if (currentChat && !isGroupOrChannel(currentChat)) updateStatusDisplay(); }, 15000);
        }

        function applyBubbleStyle() {
            $$('.msg-bub').forEach(b => b.style.borderRadius = '');
            const styleTag = document.getElementById('bubbleStyleTag') || (() => { const s = document.createElement('style'); s.id = 'bubbleStyleTag'; document.head.appendChild(s); return s; })();
            styleTag.textContent = bubbleStyle === 'square' ? '.msg-bub{border-radius:8px !important;}' : '';
        }
        function applyCompactList() {
            document.querySelectorAll('.chat-item').forEach(i => i.style.padding = compactList ? '7px 14px' : '');
            document.querySelectorAll('.avatar').forEach(a => { if (a.closest('.chat-item')) { a.style.width = compactList ? '38px' : ''; a.style.height = compactList ? '38px' : ''; a.style.fontSize = compactList ? '15px' : ''; } });
        }

        function updateProfileUI() {
            const p = currentProfile || {};
            $('#dnInput').value = p.displayName || '';
            $('#unInput').value = p.username || '';
            $('#bioInput').value = p.bio || '';
            $('#birthdateInput').value = p.birthdate || '';
            $('#profAv').innerHTML = p.avatarUrl ? `<img src="${p.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : (p.displayName || 'П')[0].toUpperCase();
            const profRing = $('#profAvRing');
            if (profRing) {
                const hasStory = currentUser && userHasStory(currentUser.uid);
                profRing.classList.toggle('has-story', hasStory);
                profRing.classList.toggle('story-seen', hasStory && userStoriesAllSeen(currentUser.uid));
                profRing.onclick = () => { if (hasStory) openStoryViewer(currentUser.uid); };
            }
            const badge = $('#statusEmojiBadge');
            if (badge) badge.innerHTML = p.statusEmojiUrl ? `<img src="${p.statusEmojiUrl}" style="width:100%;height:100%;object-fit:cover;">` : '<i class="fas fa-plus" style="font-size:11px; color:var(--text-secondary);"></i>';
        }

        // Small inline emoji-status badge shown next to a name wherever it's rendered.
        function statusEmojiHtml(user, size = 14) {
            if (!user || !user.statusEmojiUrl) return '';
            return `<img src="${user.statusEmojiUrl}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-left:4px;">`;
        }

        // ==================== CORE LOGIC ====================
        async function initChats() {
            await loadAllUsers();
            await Promise.all([loadActiveChats(), loadAllStories()]);
            restoreBotChatIfAny();
            renderChatList();
            renderStoriesRow();
            listenForMessages();
        }

        // Re-renders every place an avatar ring might need updating after a story is
        // published or the story list changes (chat list, header, open profile screens).
        function refreshStoryRingsEverywhere() {
            renderChatList();
            renderStoriesRow();
            if (currentProfile) updateProfileUI();
            if (currentChat && !isGroupOrChannel(currentChat)) {
                const ring = $('#msgAvRing'); if (ring) ring.classList.toggle('has-story', userHasStory(currentChat));
            }
        }

        // If the user has chatted with the bot before (localStorage has history),
        // bring the chat back into the list on reload — without touching Firestore.
        function restoreBotChatIfAny() {
            const msgs = loadBotMessages();
            if (msgs.length > 0 && !getHiddenChats().includes(BOT_ID)) {
                activeChats.add(BOT_ID);
                const last = msgs[msgs.length - 1];
                lastMessagePreviews[BOT_ID] = (last.text || '').substring(0, 30);
                lastMessageTimes[BOT_ID] = last.ts;
            }
        }

        async function loadAllUsers() {
            const snap = await db.collection('users').get();
            allUsers = {};
            snap.forEach(doc => { allUsers[doc.id] = { id: doc.id, ...doc.data() }; });
        }

        async function loadActiveChats() {
            const freshChats = new Set();
            const groupSnap = await db.collection('groups').where('members', 'array-contains', currentUser.uid).get();
            groupSnap.forEach(doc => {
                const data = doc.data();
                const prefix = data.type === 'channel' ? 'channel_' : 'group_';
                const fullId = prefix + doc.id;
                allGroups[fullId] = { id: fullId, ...data };
                freshChats.add(fullId);
            });

            let dmQueryFailed = false;
            try {
                const snap = await db.collection('messages').where('participants', 'array-contains', currentUser.uid).get();
                const missingUserIds = new Set();
                snap.forEach(doc => {
                    const cid = doc.data().chatId;
                    if (cid && !isGroupOrChannel(cid)) {
                        const other = cid.split('_').find(p => p !== currentUser.uid);
                        if (other) {
                            freshChats.add(other);
                            if (!allUsers[other]) missingUserIds.add(other);
                        }
                    }
                });
                // Fetch any users referenced by a chat that weren't cached yet,
                // instead of silently dropping the chat because allUsers[other] was missing.
                for (const uid of missingUserIds) {
                    try {
                        const u = await db.collection('users').doc(uid).get();
                        if (u.exists) allUsers[uid] = { id: uid, ...u.data() };
                    } catch (e) {}
                }
            } catch(e) {
                dmQueryFailed = true;
                console.error('Failed to load DM chats, keeping previously known chats:', e);
            }

            if (dmQueryFailed) {
                // Don't wipe out chats we already knew about if the query errored —
                // merge instead of replacing, so a transient failure can't make chats disappear.
                for (const id of activeChats) freshChats.add(id);
            }

            activeChats = freshChats;
            for (const id of activeChats) await loadChatPreview(id);
        }

        async function loadChatPreview(id) {
            const cid = getChatId(id);
            if (messageCache[cid]) return;
            try {
                const snap = await db.collection('messages').where('chatId', '==', cid).orderBy('timestamp', 'asc').limit(50).get();
                const msgs = []; snap.forEach(doc => msgs.push({ id: doc.id, ...doc.data() }));
                messageCache[cid] = msgs;
                if (msgs.length > 0) {
                    const last = msgs[msgs.length - 1];
                    lastMessagePreviews[id] = last.imageUrl ? '📷 Фото' : (last.text || '').substring(0, 30);
                    if (last.timestamp) lastMessageTimes[id] = last.timestamp.toDate().getTime();
                } else if (isGroupOrChannel(id)) {
                    // Empty group persistence timestamp fallback
                    lastMessageTimes[id] = allGroups[id].createdAt?.toDate().getTime() || Date.now();
                }
            } catch (e) {}
        }

        function updateGlobalBadge() {
            let total = 0;
            for(const k in unreadCounts) total += unreadCounts[k];
            const badge = $('#mainUnreadBadge');
            if (badge) {
                badge.textContent = total;
                badge.style.display = total > 0 ? 'block' : 'none';
            }
        }

        function getHiddenChats() { return (currentProfile && currentProfile.hiddenChats) || []; }

        function renderChatList(filter = '') {
            const list = $('#chatList'); if (!list) return;
            list.innerHTML = '';
            const hidden = getHiddenChats();
            let sorted = [...activeChats].filter(uid => !hidden.includes(uid));
            sorted.sort((a, b) => (lastMessageTimes[b] || 0) - (lastMessageTimes[a] || 0));

            if (filter) {
                const rawQuery = filter.toLowerCase();
                const query = rawQuery.replace('@', '');
                sorted = sorted.filter(uid => {
                    if (isGroupOrChannel(uid)) {
                        const g = allGroups[uid];
                        return g && ((g.name||'').toLowerCase().includes(rawQuery) || (g.publicName||'').toLowerCase().includes(query));
                    }
                    const u = allUsers[uid];
                    return u && ((u.displayName||'').toLowerCase().includes(rawQuery) || (u.username||'').toLowerCase().includes(query));
                });

                Object.values(allUsers).forEach(u => {
                    if (u.id !== currentUser.uid && !activeChats.has(u.id) && !isBlockedEitherWay(u.id)) {
                        if ((u.displayName||'').toLowerCase().includes(rawQuery) || (u.username||'').toLowerCase().includes(query)) {
                            sorted.push(u.id);
                        }
                    }
                });

                Object.values(allGroups).forEach(g => {
                    if (!activeChats.has(g.id) && (g.isPublic || g.publicName)) {
                        if ((g.name||'').toLowerCase().includes(rawQuery) || (g.publicName||'').toLowerCase().includes(query)) {
                            sorted.push(g.id);
                        }
                    }
                });

                if (!activeChats.has(BOT_ID) || hidden.includes(BOT_ID)) {
                    const botMatch = 'quarkmanager quark manager бот bot помощник'.includes(rawQuery) || rawQuery.includes('quark') || rawQuery.includes('korex') || rawQuery.includes('бот');
                    if (botMatch && !sorted.includes(BOT_ID)) sorted.unshift(BOT_ID);
                }
            }

            for (const uid of sorted) {
                let name, avatarHtml, isG = isGroupOrChannel(uid), isBot = uid === BOT_ID;
                if (isBot) {
                    name = BOT_PROFILE.displayName; avatarHtml = '<i class="fas fa-robot"></i>';
                } else if (isG) {
                    const grp = allGroups[uid]; if (!grp) continue;
                    const isCh = isChannel(uid);
                    name = grp.name || (isCh ? 'Канал' : 'Группа'); avatarHtml = grp.avatarUrl ? `<img src="${grp.avatarUrl}">` : (isCh ? '<i class="fas fa-bullhorn"></i>' : '<i class="fas fa-users"></i>');
                } else {
                    const user = allUsers[uid];
                    if (!user) {
                        // Profile not cached yet — show a placeholder instead of hiding the chat,
                        // and fetch it in the background so it fills in on the next render.
                        name = 'Пользователь'; avatarHtml = '<i class="fas fa-user"></i>';
                        db.collection('users').doc(uid).get().then(doc => {
                            if (doc.exists) { allUsers[uid] = { id: uid, ...doc.data() }; renderChatList(filter); }
                        }).catch(() => {});
                    } else {
                        name = (user.displayName || 'Пользователь') + statusEmojiHtml(user);
                        avatarHtml = user.avatarUrl ? `<img src="${user.avatarUrl}">` : (user.displayName || 'П')[0].toUpperCase();
                    }
                }

                const unread = unreadCounts[uid] || 0;
                const preview = isBot ? BOT_PROFILE.bio : (lastMessagePreviews[uid] || (filter ? (isG ? (allGroups[uid]?.publicName||'') : '@' + (allUsers[uid]?.username||'')) : 'Нет сообщений'));
                const time = lastMessageTimes[uid] || 0;

                const wrap = document.createElement('div'); wrap.className = 'chat-item-wrap';
                const swipeBg = document.createElement('div'); swipeBg.className = 'chat-item-swipe-bg'; swipeBg.innerHTML = '<i class="fas fa-trash"></i>';
                const div = document.createElement('div'); div.className = 'chat-item';
                const ringCls = (!isG && !isBot) ? storyRingClass(uid) : '';
                div.innerHTML = `
                    <div class="avatar-ring ${ringCls}"><div class="avatar">${avatarHtml}</div></div>
                    <div class="chat-info">
                        <div class="chat-name">${name}${isBot ? ' <span class="bot-tag">БОТ</span>' : ''}${isG && isChannel(uid) ? ' <span class="bot-tag">КАНАЛ</span>' : ''}</div>
                        <div class="chat-preview">${preview}</div>
                    </div>
                    <div class="chat-meta">
                        <div class="chat-time">${time ? formatTime(time) : ''}</div>
                        ${unread > 0 ? `<div style="background:var(--primary);color:white;border-radius:10px;padding:2px 7px;font-size:10px;margin-top:4px;">${unread}</div>` : ''}
                    </div>`;
                div.onclick = () => {
                    if (isG && !allGroups[uid].members.includes(currentUser.uid)) { showJoinGroupModal(uid.replace('group_','').replace('channel_',''), allGroups[uid], isChannel(uid)); return; }
                    unreadCounts[uid] = 0; updateGlobalBadge(); openChat(uid);
                };
                if (ringCls) {
                    const ringEl = div.querySelector('.avatar-ring');
                    ringEl.onclick = (e) => { e.stopPropagation(); openStoryViewer(uid); };
                }

                attachChatItemGestures(div, wrap, swipeBg, uid, isG, name);

                wrap.appendChild(swipeBg); wrap.appendChild(div);
                list.appendChild(wrap);
            }
            applyCompactList();
        }

        // Long-press (or right-click) opens a menu to leave/delete a chat.
        // Left-swipe on the item reveals a delete action, Telegram-style.
        function attachChatItemGestures(div, wrap, swipeBg, uid, isG, name) {
            let pressTimer = null, longPressed = false;
            let startX = 0, startY = 0, dx = 0, dragging = false, swiped = false;

            const openMenu = (clientX, clientY) => showChatItemMenu(uid, isG, name, clientX, clientY);

            div.addEventListener('contextmenu', e => { e.preventDefault(); openMenu(e.clientX, e.clientY); });

            div.addEventListener('touchstart', e => {
                if (e.touches.length !== 1) return;
                longPressed = false; swiped = false; dragging = false;
                startX = e.touches[0].clientX; startY = e.touches[0].clientY; dx = 0;
                pressTimer = setTimeout(() => {
                    longPressed = true;
                    if (navigator.vibrate) navigator.vibrate(15);
                    openMenu(startX, startY);
                }, 480);
            }, { passive: true });

            div.addEventListener('touchmove', e => {
                if (!e.touches.length) return;
                const curX = e.touches[0].clientX, curY = e.touches[0].clientY;
                dx = curX - startX;
                if (Math.abs(dx) > 10 || Math.abs(curY - startY) > 10) { clearTimeout(pressTimer); }
                if (Math.abs(curY - startY) > 24 && !dragging) return; // vertical scroll, ignore
                if (dx < 0) {
                    dragging = true;
                    const shift = Math.max(dx, -84);
                    div.style.transform = `translateX(${shift}px)`;
                    swipeBg.style.opacity = Math.min(1, -shift / 84);
                }
            }, { passive: true });

            div.addEventListener('touchend', () => {
                clearTimeout(pressTimer);
                if (dragging) {
                    if (dx < -60) {
                        swiped = true;
                        div.style.transition = 'transform 0.2s ease';
                        div.style.transform = 'translateX(-84px)';
                        setTimeout(() => confirmDeleteOrLeaveChat(uid, isG, name), 150);
                    } else {
                        div.style.transition = 'transform 0.2s cubic-bezier(0.2,0.8,0.2,1)';
                        div.style.transform = 'translateX(0)';
                        swipeBg.style.opacity = 0;
                    }
                    setTimeout(() => { div.style.transition = ''; }, 250);
                }
                dragging = false;
            });

            // Prevent the click handler from opening the chat right after a long-press or swipe.
            div.addEventListener('click', e => { if (longPressed || swiped) { e.stopPropagation(); e.preventDefault(); } }, true);
        }

        function showChatItemMenu(uid, isG, name, x, y) {
            document.querySelectorAll('.msg-context-menu').forEach(m => m.remove());
            const menu = document.createElement('div'); menu.className = 'msg-context-menu';
            menu.style.left = Math.min(x, window.innerWidth - 170) + 'px';
            menu.style.top = Math.min(y, window.innerHeight - 140) + 'px';

            const openBtn = document.createElement('button'); openBtn.className = 'ctx-item';
            openBtn.innerHTML = '<i class="fas fa-comment-dots"></i> Открыть чат';
            openBtn.onclick = e => { e.stopPropagation(); menu.remove(); openChat(uid); };
            menu.appendChild(openBtn);

            if (!isG && uid !== BOT_ID) {
                const profBtn = document.createElement('button'); profBtn.className = 'ctx-item';
                profBtn.innerHTML = '<i class="fas fa-user"></i> Профиль';
                profBtn.onclick = e => { e.stopPropagation(); menu.remove(); openUserProfile(uid); };
                menu.appendChild(profBtn);
            }

            const delBtn = document.createElement('button'); delBtn.className = 'ctx-item danger';
            delBtn.innerHTML = isG ? '<i class="fas fa-sign-out-alt"></i> Выйти из группы' : '<i class="fas fa-trash"></i> Удалить чат';
            delBtn.onclick = e => { e.stopPropagation(); menu.remove(); confirmDeleteOrLeaveChat(uid, isG, name); };
            menu.appendChild(delBtn);

            document.body.appendChild(menu);
            setTimeout(() => {
                const closeMenu = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeMenu); } };
                document.addEventListener('click', closeMenu);
            }, 50);
        }

        async function confirmDeleteOrLeaveChat(uid, isG, name) {
            document.querySelectorAll('.msg-context-menu').forEach(m => m.remove());
            if (isG) {
                if (!confirm(`Выйти из группы "${name}"?`)) { renderChatList($('#globalSearch') ? $('#globalSearch').value : ''); return; }
                await leaveGroup(uid);
            } else {
                if (!confirm(uid === BOT_ID ? 'Удалить чат с ботом?' : `Удалить чат с ${name}? Сообщения останутся у собеседника.`)) { renderChatList($('#globalSearch') ? $('#globalSearch').value : ''); return; }
                await deleteChatLocally(uid);
            }
        }

        // Deleting a DM (or the bot chat) only hides it for the current user —
        // messages are shared documents, so we can't unilaterally erase the other
        // side's copy. hiddenChats un-hides itself automatically on the next
        // incoming or outgoing message (see listenForMessages / sendMsg).
        async function deleteChatLocally(uid) {
            const hidden = new Set(getHiddenChats()); hidden.add(uid);
            const arr = [...hidden];
            currentProfile.hiddenChats = arr;
            if (uid !== BOT_ID) {
                try { await db.collection('users').doc(currentUser.uid).update({ hiddenChats: arr }); } catch (e) {}
            }
            if (currentChat === uid) { currentChat = null; showScreen('screenChats'); }
            renderChatList();
        }

        async function unhideChat(uid) {
            if (!currentProfile) return;
            const hidden = getHiddenChats();
            if (!hidden.includes(uid)) return;
            const arr = hidden.filter(x => x !== uid);
            currentProfile.hiddenChats = arr;
            if (uid !== BOT_ID) {
                try { await db.collection('users').doc(currentUser.uid).update({ hiddenChats: arr }); } catch (e) {}
            }
        }

        async function leaveGroup(chatId) {
            const rawId = chatId.replace('group_', '');
            const grp = allGroups[chatId];
            if (!grp) return;
            const newMembers = grp.members.filter(m => m !== currentUser.uid);
            try {
                await db.collection('groups').doc(rawId).update({ members: newMembers });
            } catch (e) { showCustomAlert('Не удалось выйти из группы'); return; }
            grp.members = newMembers;
            activeChats.delete(chatId);
            if (currentChat === chatId) { currentChat = null; showScreen('screenChats'); }
            renderChatList();
        }

        function showChatInput(show) {
            const row = $('#inputRow'); const bar = $('#channelReadonlyBar');
            if (row) row.classList.toggle('hidden', !show);
            if (bar) bar.classList.toggle('hidden', show);
        }

        // Opens (and auto-joins, if needed) the discussion group chat linked to a channel.
        async function openChannelDiscussion(channelUid) {
            const grp = allGroups[channelUid]; if (!grp || !grp.discussionGroupId) return;
            const discId = grp.discussionGroupId;
            let disc = allGroups[discId];
            if (!disc) {
                const rawId = discId.replace('group_', '');
                const snap = await db.collection('groups').doc(rawId).get();
                if (!snap.exists) { showCustomAlert('Чат канала недоступен'); return; }
                disc = { id: discId, ...snap.data() };
                allGroups[discId] = disc;
            }
            if (!disc.members.includes(currentUser.uid)) {
                const rawId = discId.replace('group_', '');
                const newMembers = [...disc.members, currentUser.uid];
                await db.collection('groups').doc(rawId).update({ members: newMembers });
                disc.members = newMembers;
            }
            activeChats.add(discId);
            renderChatList();
            openChat(discId);
        }

        function updateChatInputForChannel(uid, grp) {
            if (!isChannel(uid)) { showChatInput(true); return; }
            const canPost = grp && grp.createdBy === currentUser.uid;
            showChatInput(canPost);
        }

        function openChat(uid) {
            if (uid === BOT_ID) {
                if (currentChat && currentChat !== uid) clearTyping(getChatId(currentChat));
                if (unsubscribeUserStatus) { unsubscribeUserStatus(); unsubscribeUserStatus = null; }
                if (unsubscribeTyping) { unsubscribeTyping(); unsubscribeTyping = null; }
                if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
                currentChat = uid; unreadCounts[uid] = 0; updateGlobalBadge();
                botAddChat();
                $('#msgAv').innerHTML = '<i class="fas fa-robot"></i>';
                $('#msgName').innerHTML = escapeHtml(BOT_PROFILE.displayName) + ' <span class="bot-tag">БОТ</span>';
                $('#msgTyping').textContent = 'бот-помощник';
                $('#groupAddUserBtn').style.display = 'none'; $('#groupSettingsBtn').style.display = 'none';
                $('#channelDiscussionBtn').style.display = 'none';
                $('#msgAv').onclick = null; $('#msgInfo').onclick = null;
                renderBotChat(); showScreen('screenMessages'); renderChatList();
                return;
            }
            if (isBlockedEitherWay(uid) && !isGroupOrChannel(uid)) {
                showCustomAlert('Переписка с этим пользователем недоступна');
                return;
            }
            if (currentChat && currentChat !== uid) clearTyping(getChatId(currentChat));
            currentChat = uid; unreadCounts[uid] = 0; updateGlobalBadge();
            
            let chatName, chatNameHtml, chatAvatar, isGroup = isGroupOrChannel(uid);
            const isCh = isChannel(uid);
            if (isGroup) {
                const grp = allGroups[uid]; chatName = grp ? grp.name : (isCh ? 'Канал' : 'Группа');
                chatAvatar = grp && grp.avatarUrl ? `<img src="${grp.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : (isCh ? '<i class="fas fa-bullhorn"></i>' : '<i class="fas fa-users"></i>');
                chatNameHtml = escapeHtml(chatName);
                $('#msgTyping').textContent = grp ? (grp.members.length + (isCh ? ' подписчиков' : ' участников')) : '';
                $('#groupAddUserBtn').style.display = isCh ? 'none' : 'flex';
                $('#groupSettingsBtn').style.display = 'flex';
                $('#groupSettingsBtn').onclick = () => isCh ? openChannelSettings(uid, grp) : openGroupSettings(uid, grp);
                $('#channelDiscussionBtn').style.display = (isCh && grp && grp.discussionGroupId) ? 'flex' : 'none';
                $('#channelDiscussionBtn').onclick = () => openChannelDiscussion(uid);
                if(unsubscribeUserStatus) { unsubscribeUserStatus(); unsubscribeUserStatus = null; }
                updateChatInputForChannel(uid, grp);
            } else {
                const user = allUsers[uid]; if (!user) return;
                chatName = user.displayName || 'Пользователь';
                chatNameHtml = escapeHtml(chatName) + statusEmojiHtml(user, 16);
                chatAvatar = user.avatarUrl ? `<img src="${user.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : chatName[0].toUpperCase();
                watchUserStatus(uid); updateStatusDisplay();
                $('#groupAddUserBtn').style.display = 'none';
                $('#groupSettingsBtn').style.display = 'none';
                $('#channelDiscussionBtn').style.display = 'none';
                showChatInput(true);
            }

            $('#msgAv').innerHTML = chatAvatar; $('#msgName').innerHTML = chatNameHtml;
            const ring = $('#msgAvRing');
            if (ring) ring.classList.toggle('has-story', !isGroup && userHasStory(uid) ? true : false);
            if (ring) ring.classList.toggle('story-seen', !isGroup && userHasStory(uid) && userStoriesAllSeen(uid));

            const openProf = () => { if(!isGroup) openUserProfile(uid); else if(isCh) openChannelSettings(uid, allGroups[uid]); else openGroupSettings(uid, allGroups[uid]); };
            $('#msgAv').onclick = openProf; $('#msgInfo').onclick = openProf;
            if (ring) ring.onclick = () => { if (!isGroup && userHasStory(uid)) openStoryViewer(uid); else openProf(); };
            
            const cid = getChatId(uid);
            if (messageCache[cid]) {
                renderFromCache(cid); setTimeout(() => { const area = $('#msgArea'); if(area) area.scrollTop = 999999; }, 200);
            } else {
                $('#msgArea').innerHTML = '<div class="empty-state"><i class="far fa-comments"></i><p>Загрузка...</p></div>';
            }

            subscribe(cid); showScreen('screenMessages'); markRead(cid); renderChatList();
        }

        function subscribe(cid) {
            if (unsubscribeMessages) unsubscribeMessages();
            watchTyping(cid);
            unsubscribeMessages = db.collection('messages').where('chatId', '==', cid).orderBy('timestamp', 'asc').limit(100).onSnapshot(snap => {
                const msgs = []; snap.forEach(doc => msgs.push({ id: doc.id, ...doc.data() }));
                messageCache[cid] = msgs; renderFromCache(cid);
                
                let chatKey = isGroupOrChannel(cid) ? cid : cid.split('_').find(p => p !== currentUser.uid);
                if (chatKey && msgs.length > 0) {
                    const last = msgs[msgs.length - 1];
                    lastMessagePreviews[chatKey] = last.imageUrl ? '📷 Фото' : (last.text || '').substring(0, 30);
                    if(last.timestamp) lastMessageTimes[chatKey] = last.timestamp.toDate().getTime();
                    renderChatList();
                }
            }, err => {
                unsubscribeMessages = db.collection('messages').orderBy('timestamp', 'asc').limit(200).onSnapshot(s => {
                    const msgs = []; s.forEach(doc => { if(doc.data().chatId === cid) msgs.push({ id: doc.id, ...doc.data() }); });
                    messageCache[cid] = msgs; renderFromCache(cid);
                });
            });
        }

        function renderFromCache(cid) {
            const area = $('#msgArea'); if (!area) return;
            const msgs = messageCache[cid] || []; area.innerHTML = '';
            if (!msgs.length) { area.innerHTML = '<div class="empty-state"><i class="far fa-comments"></i><p>Здесь пока пусто</p></div>'; return; }
            let lastDate = null;
            msgs.forEach(msg => {
                const dt = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp);
                const ds = dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
                if (ds !== lastDate) {
                    const dv = document.createElement('div'); dv.className = 'date-divider'; dv.innerHTML = '<span>' + escapeHtml(ds) + '</span>';
                    area.appendChild(dv); lastDate = ds;
                }
                appendMsg(msg, dt, area, cid);
            });
            area.scrollTop = 999999;
        }

        // Reactions logic
        async function toggleReaction(msg, emoji) {
            if (!currentUser) return;
            const reactions = msg.reactions || {};
            if (!reactions[emoji]) reactions[emoji] = [];

            const userIndex = reactions[emoji].indexOf(currentUser.uid);
            if (userIndex > -1) {
                reactions[emoji].splice(userIndex, 1);
                if (reactions[emoji].length === 0) delete reactions[emoji];
            } else {
                reactions[emoji].push(currentUser.uid);
            }
            await db.collection('messages').doc(msg.id).update({ reactions: reactions });
        }

        function appendMsg(m, dt, area, cid) {
            const isChannelPost = isChannel(cid);
            const isMine = m.userId === currentUser.uid;
            const isGroup = isGroupOrChannel(cid);
            const wrapper = document.createElement('div');
            // Channel posts always render as left-aligned feed items, like Telegram —
            // never "sent" styling even when the current user is the channel author.
            wrapper.className = 'msg-wrap ' + (isChannelPost ? 'received channel-post' : (isMine ? 'sent' : 'received'));
            wrapper.id = 'msg-' + m.id;

            wrapper.addEventListener('click', e => { e.stopPropagation(); showMessageMenu(m, wrapper, cid, isMine); });

            const bubble = document.createElement('div'); bubble.className = 'msg-bub';

            if (isGroup && !isChannel(cid) && !isMine) {
                const senderInfo = document.createElement('div'); 
                senderInfo.style.cssText = 'font-size:12px; color:var(--primary); margin-bottom:4px; font-weight:600; cursor:pointer;';
                const sUser = allUsers[m.userId]; 
                senderInfo.innerHTML = sUser ? (escapeHtml(sUser.displayName) + statusEmojiHtml(sUser, 12)) : 'Участник';
                senderInfo.onclick = (e) => { e.stopPropagation(); openUserProfile(m.userId); };
                bubble.appendChild(senderInfo);
            }

            if (m.forwardedFrom) {
                const fwdBlock = document.createElement('div'); fwdBlock.className = 'msg-fwd-block';
                fwdBlock.innerHTML = `<div class="msg-reply-name"><i class="fas fa-share"></i> Переслано от:</div><div class="msg-reply-text">${m.forwardedFrom}</div>`;
                bubble.appendChild(fwdBlock);
            } else if (m.replyTo) {
                const replyBlock = document.createElement('div'); replyBlock.className = 'msg-reply-block';
                const repMsg = messageCache[cid]?.find(x => x.id === m.replyTo);
                const repUser = repMsg ? allUsers[repMsg.userId] : null;
                replyBlock.innerHTML = `<div class="msg-reply-name">${repUser ? repUser.displayName : 'Сообщение'}</div><div class="msg-reply-text">${repMsg ? (repMsg.text || 'Фото') : 'недоступно'}</div>`;
                replyBlock.onclick = e => { e.stopPropagation(); const el = document.getElementById('msg-'+m.replyTo); if(el) el.scrollIntoView({behavior:'smooth', block:'center'}); };
                bubble.appendChild(replyBlock);
            }

            if (m.imageUrl) {
                if (autoDownloadImages || isMine) {
                    const img = document.createElement('img'); img.src = m.imageUrl; img.className = 'msg-img';
                    img.onclick = e => { e.stopPropagation(); viewFull(m.imageUrl); };
                    if (!m.text && !m.forwardedFrom && !m.replyTo) { bubble.style.padding = '0'; bubble.style.background = 'none'; bubble.style.border = 'none'; bubble.style.backdropFilter = 'none'; }
                    bubble.appendChild(img);
                } else {
                    const placeholder = document.createElement('div');
                    placeholder.style.cssText = 'width:180px;height:100px;border-radius:12px;background:rgba(128,128,128,0.15);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;color:var(--text-secondary);font-size:12px;';
                    placeholder.innerHTML = '<i class="fas fa-image" style="font-size:22px;"></i><span>Нажмите, чтобы загрузить</span>';
                    placeholder.onclick = e => {
                        e.stopPropagation();
                        const img = document.createElement('img'); img.src = m.imageUrl; img.className = 'msg-img';
                        img.onclick = ev => { ev.stopPropagation(); viewFull(m.imageUrl); };
                        placeholder.replaceWith(img);
                    };
                    bubble.appendChild(placeholder);
                }
            }

            const timeSpan = document.createElement('span'); timeSpan.className = 'msg-time';
            timeSpan.textContent = dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            if (isMine && readReceiptsOn) {
                const isRead = m.readBy && m.readBy.length > 0;
                const check = document.createElement('span'); check.style.cssText = `margin-left:4px;color:${isRead?'var(--primary)':'var(--text-secondary)'}; font-size:10px;`;
                check.innerHTML = isRead ? '<i class="fas fa-check-double"></i>' : '<i class="fas fa-check"></i>';
                timeSpan.appendChild(check);
            }

            if (m.text) {
                const textSpan = document.createElement('span'); textSpan.textContent = m.text;
                bubble.appendChild(textSpan);
            }
            bubble.appendChild(timeSpan);
            
            // Render reactions
            if (m.reactions && Object.keys(m.reactions).length > 0) {
                const reactionRow = document.createElement('div');
                reactionRow.style.cssText = 'display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;max-width:180px;';
                for (const [emoji, users] of Object.entries(m.reactions)) {
                    if (!users || !users.length) continue;
                    const chip = document.createElement('span'); chip.className = 'msg-reaction-chip';
                    chip.textContent = emoji + ' ' + users.length;
                    chip.onclick = function (e) { e.stopPropagation(); toggleReaction(m, emoji); };
                    reactionRow.appendChild(chip);
                }
                bubble.appendChild(reactionRow);
            }

            if (isChannelPost) {
                const foot = document.createElement('div'); foot.className = 'channel-post-foot';
                const cAction = document.createElement('div'); cAction.className = 'channel-post-action';
                cAction.innerHTML = `<i class="far fa-comment"></i><span id="cmt-count-${m.id}">${m.commentCount || ''} Обсудить</span>`;
                cAction.onclick = e => { e.stopPropagation(); openComments(m, cid); };
                foot.appendChild(cAction);
                bubble.appendChild(foot);
                watchCommentCount(m.id);
            }

            wrapper.appendChild(bubble); area.appendChild(wrapper);
        }

        // ==================== CHANNEL COMMENTS / DISCUSSION ====================
        let unsubscribeComments = null;
        function watchCommentCount(postId) {
            db.collection('comments').where('postId', '==', postId).onSnapshot(snap => {
                const el = document.getElementById('cmt-count-' + postId);
                if (el) el.textContent = (snap.size || '') + ' Обсудить';
            });
        }
        function openComments(post, cid) {
            document.querySelectorAll('.comments-panel').forEach(p => p.remove());
            const panel = document.createElement('div'); panel.className = 'comments-panel';
            panel.innerHTML = `
                <div class="fm-header">
                    <button class="icon-button" id="cmtCloseBtn"><i class="fas fa-arrow-left"></i></button>
                    <div class="fm-title">Обсуждение</div>
                </div>
                <div class="fm-content" id="cmtList" style="padding:8px 0;"></div>
                <div class="input-container">
                    <div class="input-row">
                        <textarea class="msg-input" id="cmtInput" rows="1" placeholder="Написать комментарий..."></textarea>
                        <button class="send-btn" id="cmtSendBtn"><i class="fas fa-paper-plane"></i></button>
                    </div>
                </div>`;
            $('#screenMessages').appendChild(panel);
            requestAnimationFrame(() => panel.classList.add('show'));

            panel.querySelector('#cmtCloseBtn').onclick = () => { closeComments(panel); };

            const list = panel.querySelector('#cmtList');
            if (unsubscribeComments) unsubscribeComments();
            unsubscribeComments = db.collection('comments').where('postId', '==', post.id).orderBy('timestamp', 'asc').onSnapshot(snap => {
                list.innerHTML = '';
                if (snap.empty) { list.innerHTML = '<div class="empty-state"><i class="far fa-comments"></i><p>Пока нет комментариев</p></div>'; return; }
                snap.forEach(doc => {
                    const c = doc.data();
                    const u = allUsers[c.userId];
                    const item = document.createElement('div'); item.className = 'comment-item';
                    const av = document.createElement('div'); av.className = 'avatar'; av.style.cssText = 'width:32px;height:32px;font-size:13px;flex-shrink:0;';
                    av.innerHTML = u && u.avatarUrl ? `<img src="${u.avatarUrl}">` : (u ? u.displayName[0].toUpperCase() : '?');
                    const dt = c.timestamp?.toDate ? c.timestamp.toDate() : new Date();
                    item.innerHTML = `<div class="comment-bubble"><div class="comment-name">${escapeHtml(u ? u.displayName : 'Пользователь')}</div><div class="comment-text">${escapeHtml(c.text||'')}</div><div class="comment-time">${dt.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</div></div>`;
                    item.prepend(av);
                    list.appendChild(item);
                });
                list.scrollTop = 999999;
            });

            const send = async () => {
                const input = panel.querySelector('#cmtInput');
                const text = input.value.trim(); if (!text) return;
                input.value = '';
                await db.collection('comments').add({ postId: post.id, chatId: cid, userId: currentUser.uid, text, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
            };
            panel.querySelector('#cmtSendBtn').onclick = send;
            panel.querySelector('#cmtInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && enterToSend) { e.preventDefault(); send(); } });
        }
        function closeComments(panel) {
            panel.classList.remove('show');
            if (unsubscribeComments) { unsubscribeComments(); unsubscribeComments = null; }
            setTimeout(() => panel.remove(), 300);
        }

        // Custom Context Menu (Fixed completely)
        function showMessageMenu(msg, wrapper, cid, isMine) {
            document.querySelectorAll('.msg-context-menu').forEach(m => m.remove());
            const menu = document.createElement('div'); menu.className = 'msg-context-menu';

            const rect = wrapper.getBoundingClientRect();
            
            // Ensure menu doesn't go off-screen
            if (isMine) {
                let rPos = window.innerWidth - rect.right;
                if(rPos < 10) rPos = 10;
                menu.style.right = rPos + 'px';
            } else {
                let lPos = rect.left;
                if(lPos < 10) lPos = 10;
                menu.style.left = lPos + 'px';
            }

            if (rect.top < window.innerHeight / 2) {
                menu.style.top = (rect.bottom + 5) + 'px';
            } else {
                menu.style.bottom = (window.innerHeight - rect.top + 5) + 'px';
            }

            const reactionsList = ['👍', '❤️', '😂', '😮', '😡', '🔥', '👏', '🎉', '💯', '😍', '🤔', '🙏'];
            const rRow = document.createElement('div');
            rRow.style.cssText = 'display:flex;gap:4px;padding:8px 14px;flex-wrap:wrap; border-bottom:1px solid var(--glass-border);';
            reactionsList.forEach(emoji => {
                const eBtn = document.createElement('span'); eBtn.className = 'reaction-emoji-btn'; eBtn.textContent = emoji;
                eBtn.onclick = function(e) { e.stopPropagation(); toggleReaction(msg, emoji); menu.remove(); };
                rRow.appendChild(eBtn);
            });
            menu.appendChild(rRow);

            const replyBtn = document.createElement('button'); replyBtn.className = 'ctx-item';
            replyBtn.innerHTML = '<i class="fas fa-reply"></i> Ответить';
            replyBtn.onclick = e => { e.stopPropagation(); setReply(msg.id, msg.text, isMine ? 'Вы' : (allUsers[msg.userId]?.displayName || 'Пользователь')); menu.remove(); };
            menu.appendChild(replyBtn);

            const canFwd = canForwardMessage(msg);
            const fwdBtn = document.createElement('button'); fwdBtn.className = 'ctx-item';
            fwdBtn.innerHTML = '<i class="fas fa-share"></i> Переслать';
            if (!canFwd) { fwdBtn.style.opacity = '0.4'; }
            fwdBtn.onclick = e => {
                e.stopPropagation();
                if (!canFwd) { showCustomAlert('Автор запретил пересылку своих сообщений'); menu.remove(); return; }
                openForwardModal(msg); menu.remove();
            };
            menu.appendChild(fwdBtn);

            if (isMine) {
                const delBtn = document.createElement('button'); delBtn.className = 'ctx-item danger';
                delBtn.innerHTML = '<i class="fas fa-trash"></i> Удалить';
                delBtn.onclick = async e => {
                    e.stopPropagation();
                    if(confirm('Удалить сообщение?')) {
                        await db.collection('messages').doc(msg.id).delete();
                        wrapper.remove();
                    }
                    menu.remove();
                };
                menu.appendChild(delBtn);
            }
            
            document.body.appendChild(menu);

            setTimeout(() => {
                const closeMenu = (e) => {
                    if (!menu.contains(e.target)) {
                        menu.remove();
                        document.removeEventListener('click', closeMenu);
                        $('#msgArea').removeEventListener('scroll', closeMenu);
                    }
                };
                document.addEventListener('click', closeMenu);
                $('#msgArea').addEventListener('scroll', closeMenu);
            }, 100);
        }

        function setReply(id, txt, sender) {
            replyTo = id; $('#replyBar').classList.remove('hidden');
            $('#replyPreview').textContent = sender + ': ' + (txt || 'Фото').substring(0, 50); $('#msgInput').focus();
        }
        function cancelReply() { replyTo = null; $('#replyBar').classList.add('hidden'); }

        async function sendMsg(overrideChatId = null, fwdData = null) {
            const targetChat = overrideChatId || currentChat;
            if (!currentUser || !targetChat) return;

            if (targetChat === BOT_ID) {
                const input = $('#msgInput');
                const text = fwdData ? (fwdData.text || '') : (input ? input.value.trim() : '');
                if (!text) return;
                pushBotMessage(text, true);
                if (!overrideChatId && input) { input.value = ''; input.style.height = 'auto'; }
                renderBotChat(); renderChatList();
                setTimeout(() => {
                    pushBotMessage(botReplyTo(text), false);
                    if (soundEnabled) playSound();
                    if (currentChat === BOT_ID) renderBotChat();
                    renderChatList();
                }, 400 + Math.random() * 300);
                return;
            }

            if (!isGroupOrChannel(targetChat) && isBlockedEitherWay(targetChat)) {
                showCustomAlert('Невозможно отправить сообщение: переписка недоступна');
                return;
            }
            if (isChannel(targetChat) && allGroups[targetChat]?.createdBy !== currentUser.uid) {
                showCustomAlert('Только владелец канала может публиковать сообщения');
                return;
            }

            const input = $('#msgInput');
            let text = input ? input.value.trim() : '';
            let file = $('#fileInput')?.files[0];
            
            if (fwdData) { text = fwdData.text; file = null; }
            if (!text && !file && !fwdData?.imageUrl) return;

            if (text.length > 2000) {
                showCustomAlert('Слишком длинное сообщение (макс. 2000 символов)');
                return;
            }

            if(!overrideChatId && $('#sendBtn')) $('#sendBtn').disabled = true;
            
            const cid = getChatId(targetChat);
            const isGroup = isGroupOrChannel(targetChat);
            let participants = isGroup ? (allGroups[targetChat]?.members || [currentUser.uid]) : [currentUser.uid, targetChat];

            try {
                let imageUrl = fwdData ? fwdData.imageUrl : ''; 
                if (file) {
                    const comp = await compressFile(file); imageUrl = comp.dataUrl; $('#fileInput').value = '';
                }
                const msgData = {
                    text: text, imageUrl: imageUrl, userId: currentUser.uid, chatId: cid, participants: participants,
                    readBy: [], timestamp: firebase.firestore.FieldValue.serverTimestamp(), reactions: {}
                };
                if (!overrideChatId && replyTo) msgData.replyTo = replyTo;
                if (fwdData && fwdData.forwardedFrom) msgData.forwardedFrom = fwdData.forwardedFrom;

                await db.collection('messages').add(msgData);
                if (!overrideChatId) clearTyping(cid);
                
                if (!activeChats.has(targetChat)) { activeChats.add(targetChat); await loadChatPreview(targetChat); }
                await unhideChat(targetChat);
                if (!overrideChatId) { cancelReply(); if(input){ input.value=''; input.style.height='auto'; input.focus(); } }
            } catch(e) { console.error(e); }
            finally { if(!overrideChatId && $('#sendBtn')) $('#sendBtn').disabled = false; }
        }

        function compressFile(file) {
            return new Promise(res => {
                const r = new FileReader(); r.onload = () => {
                    const img = new Image(); img.onload = () => {
                        const canvas = document.createElement('canvas'); let w = img.width, h = img.height; const max = 800;
                        if(w>h && w>max){ h*=max/w; w=max; } else if(h>max){ w*=max/h; h=max; }
                        canvas.width = w; canvas.height = h; canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                        res({ dataUrl: canvas.toDataURL('image/jpeg', 0.6) });
                    }; img.src = r.result;
                }; r.readAsDataURL(file);
            });
        }

        // Reads a file to a data URL with no re-encoding — required for GIFs and any
        // other animated image, since drawing to <canvas> and re-exporting collapses
        // the animation down to a single frame.
        function readFileRaw(file) {
            return new Promise((res, rej) => {
                const r = new FileReader();
                r.onload = () => res({ dataUrl: r.result });
                r.onerror = () => rej(new Error('Read failed'));
                r.readAsDataURL(file);
            });
        }

        const MAX_RAW_FILE_BYTES = 3 * 1024 * 1024; // 3MB safety cap for uncompressed GIF/emoji uploads

        // For avatars specifically: GIFs are kept as-is (to preserve animation),
        // everything else goes through the existing compress/resize pipeline.
        async function processAvatarFile(file) {
            if (file.type === 'image/gif') {
                if (file.size > MAX_RAW_FILE_BYTES) {
                    throw new Error('GIF слишком большой (макс. 3МБ)');
                }
                return await readFileRaw(file);
            }
            return await compressFile(file);
        }

        function viewFull(url) {
            const viewer = document.createElement('div'); viewer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);display:flex;align-items:center;justify-content:center;z-index:9999;';
            viewer.innerHTML = `<span style="position:absolute;top:14px;right:14px;color:white;font-size:28px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,0.12);cursor:pointer;">✕</span><img src="${url}" style="max-width:95%;max-height:95%;border-radius:10px;object-fit:contain;">`;
            viewer.onclick = () => viewer.remove();
            document.body.appendChild(viewer);
        }

        // ==================== PRIVACY HELPERS ====================
        function getMyPrivacy() {
            const p = currentProfile || {};
            return {
                blockGroupAdds: !!p.privBlockGroupAdds,
                showActivity: p.privShowActivity !== false,
                showAvatar: p.privShowAvatar || 'all',           // all | contacts | none
                showBio: p.privShowBio || 'all',                 // all | contacts | none
                allowForward: p.privAllowForward !== false,      // true (all) | false (none)
                showMyGroups: p.privShowMyGroups !== false
            };
        }

        function hasChattedWith(uid) {
            const cid = getChatId(uid);
            const msgs = messageCache[cid];
            if (msgs && msgs.length > 0) return true;
            return activeChats.has(uid);
        }

        function canSeeAvatarOf(targetUser, viewerUid) {
            const setting = targetUser.privShowAvatar || 'all';
            if (setting === 'all') return true;
            if (setting === 'none') return false;
            if (setting === 'contacts') return hasChattedWith(targetUser.id);
            return true;
        }
        function canSeeBioOf(targetUser, viewerUid) {
            const setting = targetUser.privShowBio || 'all';
            if (setting === 'all') return true;
            if (setting === 'none') return false;
            if (setting === 'contacts') return hasChattedWith(targetUser.id);
            return true;
        }
        function canForwardMessage(msg) {
            const author = allUsers[msg.userId];
            if (!author) return true;
            if (msg.userId === currentUser.uid) return true;
            return author.privAllowForward !== false;
        }
        function isBlockedEitherWay(uid) {
            if (!currentProfile || uid === currentUser.uid) return false;
            const myBlocked = currentProfile.blockedUsers || [];
            if (myBlocked.includes(uid)) return true;
            const other = allUsers[uid];
            if (other && (other.blockedUsers || []).includes(currentUser.uid)) return true;
            return false;
        }

        async function toggleBlockUser(uid) {
            const blocked = currentProfile.blockedUsers || [];
            const idx = blocked.indexOf(uid);
            const willBlock = idx === -1;
            if (willBlock) blocked.push(uid); else blocked.splice(idx, 1);
            await db.collection('users').doc(currentUser.uid).update({ blockedUsers: blocked });
            currentProfile.blockedUsers = blocked;
            showCustomAlert(willBlock ? 'Пользователь заблокирован' : 'Пользователь разблокирован');
            activeChats.delete(uid); renderChatList();
        }

        // ==================== NEW FEATURES ====================
        
        async function findAndOpenUser(un) {
            $('#viewProfileModal').classList.remove('show');
            setTimeout(async () => {
                let found = Object.values(allUsers).find(u => u.username === un);
                if (found) return openUserProfile(found.id);
                const snap = await db.collection('users').where('username', '==', un).get();
                if (!snap.empty) {
                    const u = {id: snap.docs[0].id, ...snap.docs[0].data()};
                    allUsers[u.id] = u; openUserProfile(u.id);
                } else {
                    showCustomAlert(`Пользователь @${un} не найден`);
                }
            }, 300);
        }

        // User Profiles & Mentions
        async function openUserProfile(uid) {
            if (uid === currentUser.uid) return showScreen('screenProfile');
            
            let u = allUsers[uid];
            if (!u) {
                const doc = await db.collection('users').doc(uid).get();
                if(doc.exists) u = {id:uid, ...doc.data()}; else return;
            }

            const showAv = canSeeAvatarOf(u, currentUser.uid);
            const showBioFlag = canSeeBioOf(u, currentUser.uid);

            $('#vpAv').innerHTML = (showAv && u.avatarUrl) ? `<img src="${u.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : u.displayName[0].toUpperCase();
            const vpRing = $('#vpAvRing');
            if (vpRing) {
                const hasStory = userHasStory(uid);
                vpRing.classList.toggle('has-story', hasStory);
                vpRing.classList.toggle('story-seen', hasStory && userStoriesAllSeen(uid));
                vpRing.onclick = () => { if (hasStory) openStoryViewer(uid); };
            }
            $('#vpName').innerHTML = escapeHtml(u.displayName) + statusEmojiHtml(u, 18);
            $('#vpUser').textContent = u.username ? '@' + u.username : '';
            if (u.birthdate) {
                const bd = new Date(u.birthdate + 'T00:00:00');
                $('#vpUser').textContent += (u.username ? '  ·  ' : '') + '🎂 ' + bd.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
            }
            
            // Format bio with mentions
            if (showBioFlag) {
                let bioStr = u.bio || '';
                let bioHtml = bioStr.replace(/@([a-zA-Z0-9_.]+)/g, '<span style="color:var(--primary);cursor:pointer;font-weight:600;" onclick="findAndOpenUser(\'$1\')">@$1</span>');
                $('#vpBio').innerHTML = bioHtml;
            } else {
                $('#vpBio').innerHTML = '<span style="opacity:0.6;">Описание скрыто</span>';
            }

            const isBlocked = (currentProfile.blockedUsers || []).includes(uid);
            const actionsWrap = $('#vpActions');
            actionsWrap.innerHTML = `
                <button class="btn btn-primary" id="vpWriteBtn" style="margin-top:0;"><i class="fas fa-comment"></i> Написать</button>
                <button class="btn" id="vpCopyUnBtn" style="margin-top:0; background:rgba(128,128,128,0.2); color:var(--text);" title="Копировать юзернейм"><i class="fas fa-copy"></i></button>
                <button class="btn" id="vpBlockBtn" style="margin-top:0; background:${isBlocked?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)'}; color:${isBlocked?'#10B981':'var(--danger)'};" title="${isBlocked?'Разблокировать':'Заблокировать'}"><i class="fas ${isBlocked?'fa-unlock':'fa-ban'}"></i></button>
            `;
            $('#vpWriteBtn').onclick = () => { $('#viewProfileModal').classList.remove('show'); openChat(uid); };
            $('#vpCopyUnBtn').onclick = () => {
                const un = u.username || '';
                if (!un) { showCustomAlert('У пользователя не установлен username'); return; }
                const ta = document.createElement('textarea'); ta.value = '@' + un; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
                showCustomAlert('Username скопирован!');
            };
            $('#vpBlockBtn').onclick = async () => {
                const msg = isBlocked ? 'Разблокировать пользователя?' : 'Заблокировать пользователя? Вы не сможете писать друг другу, и он исчезнет из поиска.';
                if (confirm(msg)) { await toggleBlockUser(uid); $('#viewProfileModal').classList.remove('show'); }
            };

            const grpList = $('#userPublicGroups');
            grpList.innerHTML = '<h4 style="margin:16px 0 8px;">Публичные чаты и каналы:</h4>';
            try {
                const snap = await db.collection('groups').where('createdBy', '==', uid).get();
                let publicCount = 0;
                snap.forEach(d => {
                    const g = d.data();
                    if(g.isPublic || g.publicName) {
                        publicCount++;
                        const isCh = g.type === 'channel';
                        const div = document.createElement('div'); div.className = 'user-list-item';
                        div.innerHTML = `<div class="avatar" style="width:40px;height:40px;">${g.avatarUrl?`<img src="${g.avatarUrl}">`:(isCh?'<i class="fas fa-bullhorn"></i>':'<i class="fas fa-users"></i>')}</div>
                                         <div style="flex:1;"><div style="font-weight:600;">${g.name}${isCh?' <span class="bot-tag">КАНАЛ</span>':''}</div>
                                         ${g.publicName ? `<div style="font-size:12px;color:var(--primary);">${g.publicName}</div>` : ''}</div>`;
                        div.onclick = () => showJoinGroupModal(d.id, g, isCh);
                        grpList.appendChild(div);
                    }
                });
                if(publicCount === 0) grpList.innerHTML += '<p style="color:var(--text-secondary);font-size:13px;">Нет публичных чатов</p>';
            } catch(e) { grpList.innerHTML += '<p style="color:var(--text-secondary);font-size:13px;">Ошибка загрузки</p>'; }

            // Shared Groups logic
            const sharedList = $('#userSharedGroups');
            if (u.privShowMyGroups === false && uid !== currentUser.uid) {
                sharedList.innerHTML = '';
            } else {
                sharedList.innerHTML = '<h4 style="margin:16px 0 8px;">Общие чаты:</h4>';
                let sharedCount = 0;
                Object.values(allGroups).forEach(g => {
                    if (g.members.includes(currentUser.uid) && g.members.includes(uid)) {
                        sharedCount++;
                        const div = document.createElement('div'); div.className = 'user-list-item';
                        div.innerHTML = `<div class="avatar" style="width:40px;height:40px;">${g.avatarUrl ? `<img src="${g.avatarUrl}">` : '<i class="fas fa-users"></i>'}</div>
                                         <div style="flex:1;"><div style="font-weight:600;">${g.name}</div></div>`;
                        div.onclick = () => { $('#viewProfileModal').classList.remove('show'); openChat(g.id); };
                        sharedList.appendChild(div);
                    }
                });
                if (sharedCount === 0) sharedList.innerHTML += '<p style="color:var(--text-secondary);font-size:13px;">Нет общих чатов</p>';
            }

            $('#viewProfileModal').classList.add('show');
        }

        function showJoinGroupModal(rawId, groupData, forcedIsChannel) {
            const prefix = forcedIsChannel || groupData.type === 'channel' ? 'channel_' : 'group_';
            const fullId = prefix + rawId;
            if (groupData.members.includes(currentUser.uid)) {
                openChat(fullId); $('#viewProfileModal').classList.remove('show'); return;
            }

            const inviter = allUsers[groupData.createdBy];
            if (inviter && inviter.privBlockGroupAdds && groupData.createdBy !== currentUser.uid) {
                showCustomAlert('Владелец ограничил добавление в ' + (prefix === 'channel_' ? 'канал' : 'группы'));
                return;
            }

            $('#jgAvatar').innerHTML = groupData.avatarUrl ? `<img src="${groupData.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : (prefix === 'channel_' ? '<i class="fas fa-bullhorn"></i>' : '<i class="fas fa-users"></i>');
            $('#jgName').textContent = groupData.name || (prefix === 'channel_' ? 'Канал' : 'Группа');
            $('#joinGroupOverlay').querySelector('p').textContent = prefix === 'channel_' ? 'Вы хотите подписаться на этот канал?' : 'Вы хотите войти в этот чат?';
            $('#joinGroupOverlay').classList.remove('hidden');
            
            $('#jgYesBtn').onclick = async () => {
                const newMembers = [...groupData.members, currentUser.uid];
                await db.collection('groups').doc(rawId).update({ members: newMembers });
                $('#joinGroupOverlay').classList.add('hidden');
                $('#viewProfileModal').classList.remove('show');
                allGroups[fullId] = { id: fullId, ...groupData, members: newMembers };
                activeChats.add(fullId); renderChatList(); openChat(fullId);
            };
            $('#jgNoBtn').onclick = () => $('#joinGroupOverlay').classList.add('hidden');
        }

        // Group Settings (Avatar, Name, Link, Members)
        function openGroupSettings(chatId, grp) {
            const rawId = chatId.replace('group_', '');
            const isOwner = grp.createdBy === currentUser.uid;
            
            $('#gsNameInput').value = grp.name || 'Группа';
            $('#gsPublicName').value = grp.publicName || '';
            $('#gsAv').innerHTML = grp.avatarUrl ? `<img src="${grp.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : '<i class="fas fa-users"></i>';
            
            if (isOwner) {
                $('#gsNameInput').disabled = false; $('#gsPublicName').disabled = false;
                $('#gsAvEditBtn').style.display = 'flex'; $('#saveGroupSettingsBtn').style.display = 'flex';
            } else {
                $('#gsNameInput').disabled = true; $('#gsPublicName').disabled = true;
                $('#gsAvEditBtn').style.display = 'none'; $('#saveGroupSettingsBtn').style.display = 'none';
            }

            $('#gsForwardBtn').onclick = () => {
                const msgs = messageCache[chatId] || [];
                const lastMine = [...msgs].reverse().find(m => m.userId === currentUser.uid) || msgs[msgs.length - 1];
                if (!lastMine) { showCustomAlert('Нет сообщений для пересылки'); return; }
                if (!canForwardMessage(lastMine)) { showCustomAlert('Автор запретил пересылку своих сообщений'); return; }
                openForwardModal(lastMine);
            };

            const memList = $('#gsMembersList');
            memList.innerHTML = '<h4 style="margin:16px 0 8px;">Участники ('+grp.members.length+'):</h4>';
            grp.members.forEach(async (muid) => {
                let u = allUsers[muid];
                if (!u) { const snap = await db.collection('users').doc(muid).get(); if(snap.exists) { u = {id:muid, ...snap.data()}; allUsers[muid] = u; } }
                if (u) {
                    const div = document.createElement('div'); div.className = 'user-list-item';
                    div.innerHTML = `<div class="avatar" style="width:40px;height:40px;">${u.avatarUrl ? `<img src="${u.avatarUrl}">` : u.displayName[0].toUpperCase()}</div>
                                     <div style="flex:1;"><div style="font-weight:600;">${u.displayName} ${muid===grp.createdBy?'<i class="fas fa-crown" style="color:#F59E0B; font-size:12px; margin-left:4px;"></i>':''}</div>
                                     <div style="font-size:12px;color:var(--text-secondary);">@${u.username||''}</div></div>`;
                    div.onclick = () => { $('#groupSettingsModal').classList.remove('show'); openUserProfile(u.id); };
                    memList.appendChild(div);
                }
            });

            $('#groupSettingsModal').classList.add('show');
            
            $('#gsAvEditBtn').onclick = () => {
                const avInput = document.createElement('input'); avInput.type = 'file'; avInput.accept = 'image/*';
                avInput.onchange = async () => {
                    const file = avInput.files[0]; if(!file) return;
                    let dataUrl;
                    try { dataUrl = (await processAvatarFile(file)).dataUrl; }
                    catch (e) { showCustomAlert(e.message || 'Не удалось загрузить аватарку'); return; }
                    await db.collection('groups').doc(rawId).update({ avatarUrl: dataUrl });
                    allGroups[chatId].avatarUrl = dataUrl;
                    $('#gsAv').innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
                    renderChatList(); if(currentChat === chatId) $('#msgAv').innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
                };
                avInput.click();
            };

            $('#saveGroupSettingsBtn').onclick = async () => {
                if(!isOwner) return;
                let pName = $('#gsPublicName').value.trim(); let gName = $('#gsNameInput').value.trim() || 'Группа';
                if(pName && !pName.startsWith('@')) pName = '@' + pName;
                
                await db.collection('groups').doc(rawId).update({ name: gName, publicName: pName, isPublic: pName.length > 1 });
                allGroups[chatId].name = gName; allGroups[chatId].publicName = pName; allGroups[chatId].isPublic = pName.length > 1;
                
                $('#groupSettingsModal').classList.remove('show'); renderChatList();
                if(currentChat === chatId) $('#msgName').innerHTML = escapeHtml(gName);
                showCustomAlert('Настройки группы сохранены');
            };
        }

        // Forwarding
        function openForwardModal(msg) {
            msgToForward = msg; $('#forwardModal').classList.add('show'); renderFwdChatList();
        }
        function renderFwdChatList(filter = '') {
            const list = $('#fwdChatList'); list.innerHTML = ''; const query = filter.toLowerCase();
            const sorted = [...activeChats].filter(uid => {
                if(isGroupOrChannel(uid)) return (allGroups[uid]?.name||'').toLowerCase().includes(query);
                const u = allUsers[uid]; return u && ((u.displayName||'').toLowerCase().includes(query) || (u.username||'').toLowerCase().includes(query));
            }).sort((a, b) => (lastMessageTimes[b] || 0) - (lastMessageTimes[a] || 0));

            sorted.forEach(uid => {
                let name, avatar;
                if(isGroupOrChannel(uid)) { name = allGroups[uid]?.name || 'Группа'; avatar = allGroups[uid]?.avatarUrl ? `<img src="${allGroups[uid].avatarUrl}">` : '<i class="fas fa-users"></i>'; }
                else { const u = allUsers[uid]; name = u?.displayName; avatar = u?.avatarUrl ? `<img src="${u.avatarUrl}">` : name[0].toUpperCase(); }
                
                const div = document.createElement('div'); div.className = 'user-list-item';
                div.innerHTML = `<div class="avatar" style="width:40px;height:40px;font-size:16px;">${avatar}</div><div style="font-weight:600;">${name}</div>`;
                div.onclick = async () => {
                    if(confirm(`Переслать в "${name}"?`)) {
                        const origSender = allUsers[msgToForward.userId]?.displayName || 'Пользователь';
                        await sendMsg(uid, { text: msgToForward.text||'', imageUrl: msgToForward.imageUrl||'', forwardedFrom: origSender });
                        $('#forwardModal').classList.remove('show'); showCustomAlert('Сообщение переслано!');
                    }
                };
                list.appendChild(div);
            });
        }

        function showCreateChatMenu() {
            document.querySelectorAll('.msg-context-menu').forEach(m => m.remove());
            const btn = $('#openCreateChatBtn'); const rect = btn.getBoundingClientRect();
            const menu = document.createElement('div'); menu.className = 'msg-context-menu';
            menu.style.right = (window.innerWidth - rect.right) + 'px';
            menu.style.top = (rect.bottom + 8) + 'px';
            menu.style.left = 'auto';

            const chatBtn = document.createElement('button'); chatBtn.className = 'ctx-item';
            chatBtn.innerHTML = '<i class="fas fa-comment"></i> Новый чат / группа';
            chatBtn.onclick = e => { e.stopPropagation(); menu.remove(); openCreateGroupModal(); };
            menu.appendChild(chatBtn);

            const chBtn = document.createElement('button'); chBtn.className = 'ctx-item';
            chBtn.innerHTML = '<i class="fas fa-bullhorn"></i> Новый канал';
            chBtn.onclick = e => { e.stopPropagation(); menu.remove(); openCreateChannelModal(); };
            menu.appendChild(chBtn);

            document.body.appendChild(menu);
            setTimeout(() => {
                const closeMenu = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeMenu); } };
                document.addEventListener('click', closeMenu);
            }, 50);
        }

        // Create Channel
        function openCreateChannelModal() {
            $('#newChannelName').value = ''; $('#newChannelDesc').value = '';
            $('#createChannelModal').classList.add('show');
        }

        function openChannelSettings(chatId, grp) {
            const rawId = chatId.replace('channel_', '');
            const isOwner = grp.createdBy === currentUser.uid;
            $('#chsAv').innerHTML = grp.avatarUrl ? `<img src="${grp.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : '<i class="fas fa-bullhorn"></i>';
            $('#chsNameInput').value = grp.name || '';
            $('#chsPublicName').value = grp.publicName || '';
            $('#chsSubCount').textContent = (grp.members?.length || 1) + ' подписчиков';
            $('#chsOwnerFields').classList.toggle('hidden', !isOwner);
            $('#chsAvEditBtn').classList.toggle('hidden', !isOwner);
            $('#saveChannelSettingsBtn').classList.toggle('hidden', !isOwner);
            $('#chsLeaveLabel').textContent = isOwner ? 'Удалить канал' : 'Отписаться';

            $('#chsAvEditBtn').onclick = () => {
                if (!isOwner) return;
                const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
                input.onchange = async () => {
                    const file = input.files[0]; if (!file) return;
                    try {
                        const comp = await compressFile(file);
                        await db.collection('groups').doc(rawId).update({ avatarUrl: comp.dataUrl });
                        allGroups[chatId].avatarUrl = comp.dataUrl;
                        $('#chsAv').innerHTML = `<img src="${comp.dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                        renderChatList();
                    } catch (e) { showCustomAlert(e.message || 'Не удалось загрузить аватарку'); }
                };
                input.click();
            };

            $('#saveChannelSettingsBtn').onclick = async () => {
                const name = $('#chsNameInput').value.trim(); if (!name) return showCustomAlert('Введите название');
                const pName = $('#chsPublicName').value.trim().replace('@', '');
                await db.collection('groups').doc(rawId).update({ name, publicName: pName, isPublic: pName.length > 1 });
                allGroups[chatId].name = name; allGroups[chatId].publicName = pName; allGroups[chatId].isPublic = pName.length > 1;
                $('#msgName').textContent = name;
                renderChatList(); showCustomAlert('Сохранено');
            };

            $('#chsLeaveBtn').onclick = async () => {
                if (isOwner) {
                    if (!confirm(`Удалить канал "${grp.name}" безвозвратно?`)) return;
                    try { await db.collection('groups').doc(rawId).delete(); } catch (e) {}
                    activeChats.delete(chatId); delete allGroups[chatId];
                    $('#channelSettingsModal').classList.remove('show');
                    currentChat = null; showScreen('screenChats'); renderChatList();
                } else {
                    if (!confirm(`Отписаться от канала "${grp.name}"?`)) return;
                    const newMembers = (grp.members || []).filter(m => m !== currentUser.uid);
                    try { await db.collection('groups').doc(rawId).update({ members: newMembers }); } catch (e) {}
                    activeChats.delete(chatId);
                    $('#channelSettingsModal').classList.remove('show');
                    currentChat = null; showScreen('screenChats'); renderChatList();
                }
            };

            $('#channelSettingsModal').classList.add('show');
        }

        // Create Group / Chat
        function openCreateGroupModal() {
            groupCreationSelectedUsers = [];
            $('#newGroupName').value = ''; $('#userSearchInput').value = '';
            $('#createGroupModal').classList.add('show');
            updateGroupChips(); searchUsersForGroup('');
        }
        function updateGroupChips() {
            const cont = $('#groupChips'); cont.innerHTML = '';
            groupCreationSelectedUsers.forEach(uid => {
                const u = allUsers[uid]; if(!u) return;
                const chip = document.createElement('div'); chip.className = 'user-chip';
                chip.innerHTML = `<span>${u.displayName}</span> <i class="fas fa-times" onclick="toggleUserForGroup('${uid}')"></i>`;
                cont.appendChild(chip);
            });
        }
        function toggleUserForGroup(uid) {
            const idx = groupCreationSelectedUsers.indexOf(uid);
            if(idx > -1) groupCreationSelectedUsers.splice(idx, 1);
            else groupCreationSelectedUsers.push(uid);
            updateGroupChips(); searchUsersForGroup($('#userSearchInput').value);
        }
        function searchUsersForGroup(query) {
            const list = $('#userSearchResults'); list.innerHTML = '';
            const rawQuery = query.toLowerCase();
            const q = rawQuery.replace('@', '');
            const users = Object.values(allUsers).filter(u => u.id !== currentUser.uid && !isBlockedEitherWay(u.id) && ((u.displayName||'').toLowerCase().includes(rawQuery) || (u.username||'').toLowerCase().includes(q)));
            
            users.forEach(u => {
                const isSel = groupCreationSelectedUsers.includes(u.id);
                const div = document.createElement('div'); div.className = 'user-list-item';
                div.innerHTML = `<div class="avatar" style="width:40px;height:40px;font-size:16px;">${u.avatarUrl ? `<img src="${u.avatarUrl}">`:u.displayName[0].toUpperCase()}</div>
                                 <div style="flex:1;"><div style="font-weight:600;">${u.displayName}</div><div style="font-size:12px;color:var(--text-secondary);">@${u.username||''}</div></div>
                                 <i class="${isSel ? 'fas fa-check-circle' : 'far fa-circle'}" style="font-size:20px; color:${isSel ? 'var(--primary)' : 'var(--glass-border)'}"></i>`;
                div.onclick = () => toggleUserForGroup(u.id);
                list.appendChild(div);
            });
        }
        
        // Add member to group
        function openAddMemberModal() { $('#addMemberSearch').value = ''; $('#addMemberModal').classList.add('show'); searchAddMember(''); }
        function searchAddMember(query) {
            const list = $('#addMemberResults'); list.innerHTML = '';
            const rawQuery = query.toLowerCase();
            const q = rawQuery.replace('@', '');
            const grpMembers = allGroups[currentChat]?.members || [];
            const users = Object.values(allUsers).filter(u => u.id !== currentUser.uid && !grpMembers.includes(u.id) && !isBlockedEitherWay(u.id) && ((u.displayName||'').toLowerCase().includes(rawQuery) || (u.username||'').toLowerCase().includes(q)));
            
            if(users.length === 0) list.innerHTML = '<div class="empty-state">Нет пользователей для добавления</div>';
            users.forEach(u => {
                if (u.privBlockGroupAdds) return;
                const div = document.createElement('div'); div.className = 'user-list-item';
                div.innerHTML = `<div class="avatar" style="width:40px;height:40px;">${u.avatarUrl ? `<img src="${u.avatarUrl}">`:u.displayName[0].toUpperCase()}</div>
                                 <div style="flex:1;"><div style="font-weight:600;">${u.displayName}</div><div style="font-size:12px;color:var(--text-secondary);">@${u.username||''}</div></div>
                                 <button class="btn btn-primary" style="width:auto; padding:6px 12px; margin:0;"><i class="fas fa-plus"></i></button>`;
                div.onclick = async () => {
                    if(confirm(`Добавить ${u.displayName} в группу?`)) {
                        const newMembers = [...allGroups[currentChat].members, u.id];
                        await db.collection('groups').doc(currentChat.replace('group_', '')).update({ members: newMembers });
                        $('#addMemberModal').classList.remove('show'); showCustomAlert('Пользователь добавлен');
                    }
                };
                list.appendChild(div);
            });
        }

        // ==================== PRIVACY UI ====================
        function renderPrivacySettings() {
            const priv = getMyPrivacy();
            const content = $('#privacyContent');
            content.innerHTML = `
                <div class="settings-group">
                    <div class="settings-row" id="privBlockGroupAddsRow">
                        <div class="settings-left"><div class="settings-icon" style="background:rgba(239,68,68,0.15);color:var(--danger);"><i class="fas fa-users-slash"></i></div><span class="settings-text">Запретить добавление в группы</span></div>
                        <div class="toggle" id="privBlockGroupAddsToggle"></div>
                    </div>
                    <div class="settings-row" id="privShowActivityRow">
                        <div class="settings-left"><div class="settings-icon" style="background:rgba(16,185,129,0.15);color:#10B981;"><i class="fas fa-clock"></i></div><span class="settings-text">Показывать время активности</span></div>
                        <div class="toggle" id="privShowActivityToggle"></div>
                    </div>
                </div>
                <div class="settings-group">
                    <div class="settings-row" id="privShowAvatarRow">
                        <div class="settings-left"><div class="settings-icon" style="background:rgba(59,130,246,0.15);color:#3B82F6;"><i class="fas fa-image"></i></div><span class="settings-text">Показывать аватарку</span></div>
                        <span class="settings-value" id="privShowAvatarValue"></span>
                    </div>
                    <div class="settings-row" id="privShowBioRow">
                        <div class="settings-left"><div class="settings-icon" style="background:rgba(59,130,246,0.15);color:#3B82F6;"><i class="fas fa-align-left"></i></div><span class="settings-text">Показывать описание</span></div>
                        <span class="settings-value" id="privShowBioValue"></span>
                    </div>
                </div>
                <div class="settings-group">
                    <div class="settings-row" id="privAllowForwardRow">
                        <div class="settings-left"><div class="settings-icon" style="background:rgba(124,77,255,0.15);color:var(--primary);"><i class="fas fa-share"></i></div><span class="settings-text">Разрешить пересылку моих сообщений</span></div>
                        <span class="settings-value" id="privAllowForwardValue"></span>
                    </div>
                    <div class="settings-row" id="privShowMyGroupsRow">
                        <div class="settings-left"><div class="settings-icon" style="background:rgba(124,77,255,0.15);color:var(--primary);"><i class="fas fa-layer-group"></i></div><span class="settings-text">Показывать общие чаты</span></div>
                        <div class="toggle" id="privShowMyGroupsToggle"></div>
                    </div>
                </div>
            `;

            const avLabels = { all: 'Всем', contacts: 'Кто писал в личку', none: 'Никому' };
            const fwdLabels = { true: 'Всем', false: 'Никому' };

            $('#privBlockGroupAddsToggle').classList.toggle('active', priv.blockGroupAdds);
            $('#privShowActivityToggle').classList.toggle('active', priv.showActivity);
            $('#privShowMyGroupsToggle').classList.toggle('active', priv.showMyGroups);
            $('#privShowAvatarValue').textContent = avLabels[priv.showAvatar];
            $('#privShowBioValue').textContent = avLabels[priv.showBio];
            $('#privAllowForwardValue').textContent = fwdLabels[priv.allowForward];

            const savePriv = async (field, value) => {
                await db.collection('users').doc(currentUser.uid).update({ [field]: value });
                currentProfile[field] = value;
                renderPrivacySettings();
            };

            $('#privBlockGroupAddsRow').onclick = () => savePriv('privBlockGroupAdds', !priv.blockGroupAdds);
            $('#privBlockGroupAddsToggle').onclick = e => { e.stopPropagation(); savePriv('privBlockGroupAdds', !priv.blockGroupAdds); };
            $('#privShowActivityRow').onclick = () => savePriv('privShowActivity', !priv.showActivity);
            $('#privShowActivityToggle').onclick = e => { e.stopPropagation(); savePriv('privShowActivity', !priv.showActivity); };
            $('#privShowMyGroupsRow').onclick = () => savePriv('privShowMyGroups', !priv.showMyGroups);
            $('#privShowMyGroupsToggle').onclick = e => { e.stopPropagation(); savePriv('privShowMyGroups', !priv.showMyGroups); };

            const cycle = (val, opts) => opts[(opts.indexOf(val) + 1) % opts.length];
            $('#privShowAvatarRow').onclick = () => savePriv('privShowAvatar', cycle(priv.showAvatar, ['all','contacts','none']));
            $('#privShowBioRow').onclick = () => savePriv('privShowBio', cycle(priv.showBio, ['all','contacts','none']));
            $('#privAllowForwardRow').onclick = () => savePriv('privAllowForward', !priv.allowForward);
        }

        // ==================== EVENT LISTENERS ====================
        function setupListeners() {
            $$('.nav-item').forEach(n => n.onclick = () => { $$('.nav-item').forEach(x => x.classList.remove('active')); n.classList.add('active'); showScreen(n.dataset.sc); });
            $('#backBtn').onclick = () => showScreen('screenChats');
            $('#chatMenuBtn').onclick = e => {
                if (!currentChat) return;
                const isG = isGroupOrChannel(currentChat);
                const name = isG ? (allGroups[currentChat]?.name || 'Группа') : (currentChat === BOT_ID ? BOT_PROFILE.displayName : (allUsers[currentChat]?.displayName || ''));
                const rect = e.currentTarget.getBoundingClientRect();
                showChatItemMenu(currentChat, isG, name, rect.right - 10, rect.bottom + 6);
            };
            
            $('#sendBtn').onclick = () => sendMsg();
            const input = $('#msgInput');
            if (input) {
                input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && enterToSend) { e.preventDefault(); sendMsg(); } };
                input.oninput = function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 100) + 'px'; setTyping(); };
            }
            $('#globalSearch').oninput = e => renderChatList(e.target.value);
            
            $('#openCreateChatBtn').onclick = showCreateChatMenu;
            $('#userSearchInput').oninput = e => searchUsersForGroup(e.target.value);
            $('#confirmCreateGroupBtn').onclick = async () => {
                if(groupCreationSelectedUsers.length === 0) return showCustomAlert('Выберите хотя бы одного собеседника');
                let targetId;
                if(groupCreationSelectedUsers.length === 1 && !$('#newGroupName').value.trim()) {
                    targetId = groupCreationSelectedUsers[0];
                } else {
                    const name = $('#newGroupName').value.trim() || 'Новая группа';
                    const members = [currentUser.uid, ...groupCreationSelectedUsers];
                    const ref = await db.collection('groups').add({ name, members, createdBy: currentUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                    targetId = 'group_' + ref.id;
                    allGroups[targetId] = { id: targetId, name, members, createdBy: currentUser.uid, createdAt: {toDate: ()=>new Date()} };
                }
                activeChats.add(targetId); renderChatList(); $('#createGroupModal').classList.remove('show'); openChat(targetId);
            };

            $('#confirmCreateChannelBtn').onclick = async () => {
                const name = $('#newChannelName').value.trim();
                if (!name) return showCustomAlert('Введите название канала');
                const desc = $('#newChannelDesc').value.trim();
                const members = [currentUser.uid];
                const ref = await db.collection('groups').add({ name, description: desc, members, type: 'channel', createdBy: currentUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                const targetId = 'channel_' + ref.id;

                // Every channel gets a linked discussion group chat automatically —
                // this is the channel's public "chat", separate from per-post comments.
                const discRef = await db.collection('groups').add({
                    name: name + ' — чат', members, createdBy: currentUser.uid,
                    linkedChannelId: targetId, createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                const discGroupId = 'group_' + discRef.id;
                await ref.update({ discussionGroupId: discGroupId });

                allGroups[targetId] = { id: targetId, name, description: desc, members, type: 'channel', createdBy: currentUser.uid, discussionGroupId: discGroupId, createdAt: {toDate: ()=>new Date()} };
                allGroups[discGroupId] = { id: discGroupId, name: name + ' — чат', members, createdBy: currentUser.uid, linkedChannelId: targetId, createdAt: {toDate: ()=>new Date()} };

                activeChats.add(targetId); renderChatList(); $('#createChannelModal').classList.remove('show'); openChat(targetId);
            };

            $('#fwdSearchInput').oninput = e => renderFwdChatList(e.target.value);
            $('#groupAddUserBtn').onclick = openAddMemberModal;
            $('#addMemberSearch').oninput = e => searchAddMember(e.target.value);
            $('#copyInviteLinkBtn').onclick = () => {
                const link = window.location.origin + window.location.pathname + '?join=' + currentChat;
                const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
                showCustomAlert('Ссылка скопирована в буфер обмена!');
            };

            const avatarInput = document.createElement('input'); avatarInput.type = 'file'; avatarInput.accept = 'image/*'; avatarInput.className = 'hidden'; document.body.appendChild(avatarInput);
            $('#avEditBtn').onclick = () => avatarInput.click();
            avatarInput.onchange = async () => {
                const file = avatarInput.files[0]; if (!file) return;
                let avatarUrl;
                try {
                    if (file.type === 'image/gif') {
                        // Keep GIFs untouched — any canvas round-trip would freeze it to one frame.
                        const raw = await readFileRaw(file);
                        avatarUrl = raw.dataUrl;
                    } else {
                        const compressed = await compressFile(file); const img = new Image(); img.src = compressed.dataUrl; await new Promise(r => img.onload = r);
                        const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 200; canvas.getContext('2d').drawImage(img, 0, 0, 200, 200);
                        avatarUrl = canvas.toDataURL('image/jpeg', 0.5);
                    }
                } catch (e) { showCustomAlert(e.message || 'Не удалось загрузить аватарку'); return; }
                currentProfile.avatarUrl = avatarUrl;
                await db.collection('users').doc(currentUser.uid).update({ avatarUrl: avatarUrl, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                updateProfileUI(); await loadAllUsers(); renderChatList();
            };

            $('#statusEmojiBadge').onclick = () => {
                const emInput = document.createElement('input'); emInput.type = 'file'; emInput.accept = 'image/*';
                emInput.onchange = async () => {
                    const file = emInput.files[0]; if (!file) return;
                    let dataUrl;
                    try { dataUrl = (await processAvatarFile(file)).dataUrl; }
                    catch (e) { showCustomAlert(e.message || 'Не удалось загрузить статус'); return; }
                    await db.collection('users').doc(currentUser.uid).update({ statusEmojiUrl: dataUrl });
                    currentProfile.statusEmojiUrl = dataUrl;
                    updateProfileUI(); await loadAllUsers(); renderChatList();
                };
                emInput.click();
            };

            $('#saveProfBtn').onclick = async () => {
                const dn = $('#dnInput').value.trim(), un = $('#unInput').value.trim().replace('@', '');
                if(!dn) return showCustomAlert('Введите имя');
                const birthdate = $('#birthdateInput').value || '';
                await db.collection('users').doc(currentUser.uid).update({ displayName: dn, username: un, bio: $('#bioInput').value.trim(), birthdate: birthdate });
                currentProfile.displayName = dn; currentProfile.username = un; currentProfile.bio = $('#bioInput').value.trim(); currentProfile.birthdate = birthdate;
                showCustomAlert('Сохранено'); renderChatList();
            };

            $('#settLogout').onclick = async () => { if(confirm('Выйти?')) { teardownSession(); auth.signOut(); showAuthScreen(); } };
            $('#darkRow').onclick = () => { darkMode = !darkMode; localStorage.setItem('quark_dark', darkMode ? '1' : '0'); applyTheme(); };
            $('#darkToggle').onclick = e => { e.stopPropagation(); darkMode = !darkMode; localStorage.setItem('quark_dark', darkMode ? '1' : '0'); applyTheme(); };
            $('#fontRow').onclick = () => { const sizes = ['small', 'medium', 'large']; fontSize = sizes[(sizes.indexOf(fontSize) + 1) % 3]; applyFontSize(); const fv = $('#fontValue'); if (fv) fv.textContent = { small: 'Мелкий', medium: 'Средний', large: 'Крупный' }[fontSize]; };
            $('#soundRow').onclick = () => { soundEnabled = !soundEnabled; localStorage.setItem('quark_sound', soundEnabled); const st = $('#soundToggle'); if (st) st.classList.toggle('active', soundEnabled); };
            $('#soundToggle').onclick = e => { e.stopPropagation(); soundEnabled = !soundEnabled; localStorage.setItem('quark_sound', soundEnabled); const st = $('#soundToggle'); if (st) st.classList.toggle('active', soundEnabled); };
            $('#switchAccountRow').onclick = showAccountSwitcher;

            const toggleSetting = (row, toggle, varSetter, storageKey, getVal) => {
                const el = $(row); const tEl = $(toggle);
                const flip = () => { const val = !getVal(); varSetter(val); localStorage.setItem(storageKey, val); if (tEl) tEl.classList.toggle('active', val); };
                if (el) el.onclick = flip;
                if (tEl) tEl.onclick = e => { e.stopPropagation(); flip(); };
            };
            toggleSetting('#compactRow', '#compactToggle', v => { compactList = v; applyCompactList(); }, 'quark_compact', () => compactList);
            toggleSetting('#enterSendRow', '#enterSendToggle', v => enterToSend = v, 'quark_enter_send', () => enterToSend);
            toggleSetting('#readReceiptsRow', '#readReceiptsToggle', v => readReceiptsOn = v, 'quark_read_receipts', () => readReceiptsOn);
            toggleSetting('#autoDownloadRow', '#autoDownloadToggle', v => autoDownloadImages = v, 'quark_auto_dl', () => autoDownloadImages);
            toggleSetting('#onlineStatusRow', '#onlineStatusToggle', v => typingIndicatorOn = v, 'quark_typing_ind', () => typingIndicatorOn);
            toggleSetting('#previewRow', '#previewToggle', v => notifPreviewOn = v, 'quark_notif_preview', () => notifPreviewOn);

            const cycleBubble = () => {
                bubbleStyle = bubbleStyle === 'rounded' ? 'square' : 'rounded';
                localStorage.setItem('quark_bubble', bubbleStyle);
                applyBubbleStyle();
                const bsv = $('#bubbleStyleValue'); if (bsv) bsv.textContent = bubbleStyle === 'square' ? 'Прямоугольные' : 'Закруглённые';
            };
            $('#bubbleStyleRow').onclick = cycleBubble;

            $('#botOpenRow').onclick = () => { $$('.nav-item').forEach(x => x.classList.remove('active')); openChat(BOT_ID); };

            $('#privacyRow').onclick = () => { renderPrivacySettings(); $('#privacyModal').classList.add('show'); };

            $('#accountManageRow').onclick = () => { $('#accountManageModal').classList.add('show'); };

            function askPassword(promptText) {
                return new Promise(resolve => {
                    const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
                    overlay.innerHTML = `<div class="dialog-modal">
                        <h3 style="margin-bottom:14px;">${promptText}</h3>
                        <input type="password" class="auth-input" id="reauthPass" placeholder="Текущий пароль">
                        <button class="btn btn-primary" id="reauthOkBtn">Подтвердить</button>
                        <div class="auth-link" id="reauthCancelBtn">Отмена</div>
                    </div>`;
                    document.body.appendChild(overlay);
                    overlay.querySelector('#reauthOkBtn').onclick = () => { const v = overlay.querySelector('#reauthPass').value; overlay.remove(); resolve(v || null); };
                    overlay.querySelector('#reauthCancelBtn').onclick = () => { overlay.remove(); resolve(null); };
                });
            }

            async function reauth() {
                const pass = await askPassword('Введите текущий пароль для подтверждения');
                if (!pass) return false;
                try {
                    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, pass);
                    await currentUser.reauthenticateWithCredential(cred);
                    return true;
                } catch (e) { showCustomAlert(e.message); return false; }
            }

            $('#changePasswordRow').onclick = async () => {
                if (!(await reauth())) return;
                const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
                overlay.innerHTML = `<div class="dialog-modal">
                    <h3 style="margin-bottom:14px;">Новый пароль</h3>
                    <input type="password" class="auth-input" id="newPass" placeholder="Новый пароль">
                    <button class="btn btn-primary" id="newPassOkBtn">Сохранить</button>
                    <div class="auth-link" id="newPassCancelBtn">Отмена</div>
                </div>`;
                document.body.appendChild(overlay);
                overlay.querySelector('#newPassCancelBtn').onclick = () => overlay.remove();
                overlay.querySelector('#newPassOkBtn').onclick = async () => {
                    const np = overlay.querySelector('#newPass').value;
                    if (!np || np.length < 6) { showCustomAlert('Пароль должен быть не короче 6 символов'); return; }
                    try { await currentUser.updatePassword(np); overlay.remove(); showCustomAlert('Пароль изменён'); }
                    catch (e) { showCustomAlert(e.message); }
                };
            };

            $('#changeEmailRow').onclick = async () => {
                if (!(await reauth())) return;
                const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
                overlay.innerHTML = `<div class="dialog-modal">
                    <h3 style="margin-bottom:14px;">Новая почта</h3>
                    <input type="email" class="auth-input" id="newEmail" placeholder="Новый email">
                    <button class="btn btn-primary" id="newEmailOkBtn">Сохранить</button>
                    <div class="auth-link" id="newEmailCancelBtn">Отмена</div>
                </div>`;
                document.body.appendChild(overlay);
                overlay.querySelector('#newEmailCancelBtn').onclick = () => overlay.remove();
                overlay.querySelector('#newEmailOkBtn').onclick = async () => {
                    const ne = overlay.querySelector('#newEmail').value.trim();
                    if (!ne) { showCustomAlert('Введите email'); return; }
                    try {
                        await currentUser.verifyBeforeUpdateEmail(ne);
                        overlay.remove(); showCustomAlert('Письмо для подтверждения отправлено на ' + ne);
                    } catch (e) { showCustomAlert(e.message); }
                };
            };

            $('#accLogoutRow').onclick = () => { if (confirm('Выйти из аккаунта?')) { teardownSession(); auth.signOut(); showAuthScreen(); } };

            $('#deleteAccountRow').onclick = async () => {
                if (!confirm('Удалить аккаунт безвозвратно? Это действие нельзя отменить.')) return;
                if (!(await reauth())) return;
                try {
                    await db.collection('users').doc(currentUser.uid).delete();
                    await currentUser.delete();
                    teardownSession(); showAuthScreen();
                } catch (e) { showCustomAlert(e.message); }
            };
        }

        function saveCurrentAccount() {
            const exists = savedAccounts.find(a => a.uid === currentUser.uid);
            if (!exists) {
                savedAccounts.push({ uid: currentUser.uid, email: currentUser.email, displayName: currentProfile.displayName, avatarUrl: currentProfile.avatarUrl || '' });
                localStorage.setItem('quark_accounts', JSON.stringify(savedAccounts));
            }
        }
        function showAccountSwitcher() {
            saveCurrentAccount();
            const overlay = document.createElement('div'); overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:200;';
            const modal = document.createElement('div'); modal.style.cssText = `background:var(--glass);backdrop-filter:blur(30px);border-radius:16px;padding:24px;max-width:360px;width:90%;text-align:center;border:1px solid var(--glass-border);color:var(--text);max-height:80vh;overflow-y:auto;`;
            let accountsHtml = '';
            savedAccounts.forEach(account => {
                const isActive = account.uid === currentUser.uid;
                accountsHtml += `<div class="account-item" data-uid="${account.uid}" data-email="${account.email}" style="padding:12px;display:flex;align-items:center;gap:12px;cursor:pointer;border-radius:12px;margin-bottom:8px;${isActive ? 'background:rgba(124,77,255,0.2);' : ''}"><div style="width:44px;height:44px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-size:16px;overflow:hidden;">${account.avatarUrl ? '<img src="' + account.avatarUrl + '" style="width:100%;height:100%;object-fit:cover;">' : (account.displayName || account.email || '?')[0].toUpperCase()}</div><div style="flex:1;text-align:left;"><div style="font-weight:600;">${account.displayName || 'Пользователь'}</div><div style="font-size:12px;color:var(--text-secondary);">${account.email}</div></div>${isActive ? `<i class="fas fa-check" style="color:var(--primary);"></i>` : ''}</div>`;
            });
            modal.innerHTML = `<h3 style="margin-bottom:16px;">Выберите аккаунт</h3>${accountsHtml}<div id="addAccountBtn" style="padding:12px;display:flex;align-items:center;gap:12px;cursor:pointer;border-radius:12px;margin-top:8px;border:1px dashed var(--glass-border);"><div style="width:44px;height:44px;border-radius:50%;background:rgba(128,128,128,0.2);display:flex;align-items:center;justify-content:center;font-size:20px;"><i class="fas fa-plus"></i></div><div style="flex:1;text-align:left;font-weight:600;">Добавить аккаунт</div></div><button id="closeSwitcherBtn" style="margin-top:12px;width:100%;padding:10px;background:rgba(128,128,128,0.2);color:var(--text);border:none;border-radius:10px;cursor:pointer;font-size:14px;">Закрыть</button>`;
            overlay.appendChild(modal); document.body.appendChild(overlay);
            
            modal.querySelectorAll('.account-item[data-uid]').forEach(item => {
                item.onclick = function () {
                    const uid = item.dataset.uid; const email = item.dataset.email; if (uid === currentUser.uid) { overlay.remove(); return; }
                    modal.innerHTML = `<h3 style="margin-bottom:16px;">Введите пароль</h3><p style="margin-bottom:12px;color:var(--text-secondary);">${email}</p><input type="password" id="switchPassword" class="form-input" style="margin-bottom:12px;"><div style="display:flex;gap:10px;"><button id="switchLoginBtn" style="flex:1;background:var(--primary);color:white;border:none;padding:10px;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;">Войти</button><button id="switchBackBtn" style="flex:1;background:rgba(128,128,128,0.2);color:var(--text);border:none;padding:10px;border-radius:10px;cursor:pointer;font-size:14px;">Назад</button></div>`;
                    const passwordInput = modal.querySelector('#switchPassword'); passwordInput.focus();
                    modal.querySelector('#switchBackBtn').onclick = function () { overlay.remove(); showAccountSwitcher(); };
                    modal.querySelector('#switchLoginBtn').onclick = async function () {
                        const password = passwordInput.value; if (!password) return showCustomAlert('Введите пароль');
                        overlay.remove(); const oldUid = currentUser.uid; teardownSession();
                        try { await db.collection('users').doc(oldUid).update({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); } catch (e) {}
                        await auth.signOut();
                        try { const result = await auth.signInWithEmailAndPassword(email, password); currentUser = result.user; await loadProfile(); buildMainUI(); await initChats(); } catch (e) { showCustomAlert('Неверный пароль: ' + e.message); showAuthScreen(); }
                    };
                };
            });
            modal.querySelector('#addAccountBtn').onclick = function () { overlay.remove(); const oldUid = currentUser.uid; teardownSession(); db.collection('users').doc(oldUid).update({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {}); auth.signOut(); showAuthScreen(); };
            modal.querySelector('#closeSwitcherBtn').onclick = function () { overlay.remove(); };
            overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
        }

        // ==================== SYNC ====================
        function listenForMessages() {
            let firstLoad = true;
            db.collection('messages').orderBy('timestamp', 'asc').onSnapshot(async snap => {
                if (firstLoad) { firstLoad = false; return; }
                let needsUpdate = false;
                for (const change of snap.docChanges()) {
                    if (change.type !== 'added') continue;
                    const msg = change.doc.data(); if (!msg.timestamp) continue; 
                    const cid = msg.chatId; if (!cid) continue;
                    
                    let chatKey = ''; let isRelevant = false;
                    if (isGroupOrChannel(cid)) {
                        if (!allGroups[cid]) { const gs = await db.collection('groups').doc(cid.replace('group_','').replace('channel_','')).get(); if(gs.exists) allGroups[cid] = {id:cid, ...gs.data()}; }
                        if (allGroups[cid]?.members.includes(currentUser.uid)) { isRelevant = true; chatKey = cid; }
                    } else if (msg.participants?.includes(currentUser.uid)) {
                        isRelevant = true; chatKey = msg.participants.find(p => p !== currentUser.uid);
                    }

                    if (!isRelevant) continue;
                    lastMessagePreviews[chatKey] = msg.imageUrl ? '📷 Фото' : (msg.text || '').substring(0, 30);
                    lastMessageTimes[chatKey] = msg.timestamp.toDate().getTime();

                    if (!activeChats.has(chatKey)) {
                        activeChats.add(chatKey);
                        if (!isGroupOrChannel(cid) && !allUsers[chatKey]) {
                            const u = await db.collection('users').doc(chatKey).get(); if(u.exists) allUsers[chatKey] = {id:u.id, ...u.data()};
                        }
                    }
                    if (msg.userId !== currentUser.uid) await unhideChat(chatKey);

                    if (getChatId(currentChat) !== cid && msg.userId !== currentUser.uid) { unreadCounts[chatKey] = (unreadCounts[chatKey] || 0) + 1; playSound(); }
                    needsUpdate = true;
                }
                if (needsUpdate) { renderChatList(); updateGlobalBadge(); }
            });
        }
        
        async function markRead(cid) {
            if(!currentUser) return;
            const snap = await db.collection('messages').where('chatId', '==', cid).get();
            const batch = db.batch(); let hasUpdates = false;
            snap.forEach(doc => {
                const data = doc.data();
                if (data.userId !== currentUser.uid && !(data.readBy||[]).includes(currentUser.uid)) {
                    batch.update(doc.ref, { readBy: [...(data.readBy||[]), currentUser.uid] }); hasUpdates = true;
                }
            });
            if(hasUpdates) await batch.commit();
        }

        function showScreen(id) {
            $$('.screen').forEach(s => s.classList.remove('active'));
            const s = $('#'+id); if(s) s.classList.add('active');
            const isMsg = id === 'screenMessages';
            $('#bottomNavWrapper').style.display = isMsg ? 'none' : 'block';
        }
        
        function updateStatusDisplay() {
            if (!currentChat || isGroupOrChannel(currentChat)) return;
            const user = allUsers[currentChat], mt = $('#msgTyping'); if(!user||!mt) return;
            if (user.privShowActivity === false) { mt.textContent = ''; return; }
            if ((Date.now() - (user.lastSeen?.toDate().getTime()||0)) < 45000 && user.online) { mt.textContent = 'В сети'; } 
            else if (user.lastSeen) { mt.textContent = 'Был(а) ' + formatTime(user.lastSeen.toDate().getTime()); } else mt.textContent = '';
        }
        function watchUserStatus(uid) {
            if(unsubscribeUserStatus) unsubscribeUserStatus();
            unsubscribeUserStatus = db.collection('users').doc(uid).onSnapshot(doc => { if(doc.exists){ allUsers[uid] = {id:uid, ...doc.data()}; if(currentChat===uid) updateStatusDisplay(); } });
        }
        function setTyping() {
            if (!typingIndicatorOn) return;
            const cid = getChatId(currentChat); if(!cid) return;
            db.collection('typing').doc(cid).set({ userId: currentUser.uid, timestamp: firebase.firestore.FieldValue.serverTimestamp() }).catch(()=>{});
            if(typingTimers[cid]) clearTimeout(typingTimers[cid]); typingTimers[cid] = setTimeout(()=>clearTyping(cid), 2500);
        }
        function clearTyping(cid) { if(typingTimers[cid]){ clearTimeout(typingTimers[cid]); delete typingTimers[cid]; } db.collection('typing').doc(cid).delete().catch(()=>{}); }
        function watchTyping(cid) {
            if(unsubscribeTyping) unsubscribeTyping();
            unsubscribeTyping = db.collection('typing').doc(cid).onSnapshot(doc => {
                if(getChatId(currentChat) !== cid) return;
                const mt = $('#msgTyping'); if(!mt) return;
                if(doc.exists && doc.data().userId !== currentUser.uid && (Date.now() - (doc.data().timestamp?.toDate().getTime()||0)) < 4000) { mt.textContent = 'печатает...'; }
                else if(!isGroupOrChannel(currentChat)) updateStatusDisplay();
            });
        }
        function teardownSession() {
            if(unsubscribeMessages) unsubscribeMessages(); if(unsubscribeUserStatus) unsubscribeUserStatus(); if(unsubscribeTyping) unsubscribeTyping();
            if(statusTickInterval) clearInterval(statusTickInterval); if(currentChat) clearTyping(getChatId(currentChat));
            currentUser = null; allUsers = {}; activeChats = new Set(); currentChat = null; messageCache = {};
        }

        async function loadProfile() {
            const p = await db.collection('users').doc(currentUser.uid).get();
            currentProfile = { id: currentUser.uid, ...(p.exists ? p.data() : {displayName: currentUser.email.split('@')[0]}) };
        }

        // ==================== STARTUP ====================
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                currentUser = user;
                const p = await db.collection('users').doc(user.uid).get();
                if(!p.exists) await db.collection('users').doc(user.uid).set({id:user.uid, displayName:user.email.split('@')[0], username:'', avatarUrl:''});
                currentProfile = { id:user.uid, ...(p.exists ? p.data() : {displayName:user.email.split('@')[0]}) };
                db.collection('users').doc(user.uid).update({ online:true, lastSeen:firebase.firestore.FieldValue.serverTimestamp() });
                
                buildMainUI(); await initChats();
                
                const joinId = new URLSearchParams(window.location.search).get('join');
                if (joinId && isGroupOrChannel(joinId)) {
                    const docRef = db.collection('groups').doc(joinId.replace('group_', '').replace('channel_', ''));
                    const snap = await docRef.get();
                    if(snap.exists && !snap.data().members.includes(currentUser.uid)) {
                        await docRef.update({ members: [...snap.data().members, currentUser.uid] });
                    }
                    window.history.replaceState({}, document.title, window.location.pathname);
                    await loadActiveChats(); renderChatList(); openChat(joinId);
                }
            } else { showAuthScreen(); }
        });
