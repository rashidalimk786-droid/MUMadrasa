// --- LOCAL CACHING & FAST LOAD ---
function getCached(key) {
  try { return JSON.parse(localStorage.getItem('mum_c_' + key)); } catch(e) { return null; }
}
function setCached(key, data) {
  try { localStorage.setItem('mum_c_' + key, JSON.stringify(data)); } catch(e) {}
}

let dbStudents = getCached('students') || [];
let dbTeachers = getCached('teachers') || [];
let dbPrayers = getCached('prayers') || [];
let dbVideos = getCached('videos') || [];
let dbPhotos = getCached('photos') || [];
let classLockSettings = getCached('classLocks') || {};

let adminPassword = "mumadminpass";
let sadrPassword = "mum_sadr_pass";
let coAdminConfig = { name: "Co-Admin", pass: "coadmin123", permissions: { locks: true, daily: true, reports: true } };
let activeLeaderboardTab = 'daily';
let selectedStudentForReport = null;
let currentUser = null;
let activeStudentForEntry = null;
let statusProgressChartInstance = null;

const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2394a3b8'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";

function playSelectClickSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.04);
  } catch(e) {}
}

function playCelebrationBell() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    const fundamental = 880;
    const harmonics = [
      { f: fundamental * 0.5, g: 0.35, d: 2.2 },
      { f: fundamental, g: 0.6, d: 1.8 },
      { f: fundamental * 1.5, g: 0.4, d: 1.4 },
      { f: fundamental * 2.0, g: 0.3, d: 1.0 },
      { f: fundamental * 2.76, g: 0.25, d: 0.8 }
    ];
    harmonics.forEach(h => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(h.f, now);
      gain.gain.setValueAtTime(h.g, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + h.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + h.d);
    });
  } catch(e) {}
}

function getOrCreateDeviceId() {
  let devId = localStorage.getItem('mum_device_id');
  if (!devId) {
    devId = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    localStorage.setItem('mum_device_id', devId);
  }
  return devId;
}
const currentDeviceId = getOrCreateDeviceId();

function getLogicalPrayerDate() {
  const now = new Date();
  const hours = now.getHours();
  const logical = new Date(now);
  if (hours < 8) logical.setDate(logical.getDate() - 1);
  return logical.toISOString().split('T')[0];
}
let activeLogicalDate = getLogicalPrayerDate();
const topDateLabel = document.getElementById('todayDateLabel');
if (topDateLabel) topDateLabel.innerText = activeLogicalDate;

// --- എൻട്രി ബട്ടൺ ടെക്സ്റ്റ് വൃത്തിയായി ക്രമീകരിച്ചത് ---
function refreshMainEntryBtnUI() {
  const btn = document.getElementById('mainPrayerEntryBtn');
  const txt = document.getElementById('mainPrayerEntryBtnText');
  if (!btn || !txt) return;

  let openCount = 0;
  for (let i = 1; i <= 10; i++) {
    if (classLockSettings[String(i)] !== true) openCount++;
  }

  if (openCount > 0) {
    btn.className = 'pulse-btn btn-entry-open';
    txt.innerHTML = `
      <div style="font-weight: 700; font-size: 14.5px; line-height: 1.2;">🟢 എൻറെ ഇന്നത്തെ നിസ്കാരം</div>
      <div style="font-size: 11px; opacity: 0.9; margin-top: 3px; font-weight: normal;">Prayer Entry Open</div>
    `;
  } else {
    btn.className = 'pulse-btn btn-entry-closed';
    txt.innerHTML = `
      <div style="font-weight: 700; font-size: 14.5px; line-height: 1.2; letter-spacing: 0.3px;">🔴 Entry Closed</div>
      <div style="font-size: 11px; opacity: 0.85; margin-top: 3px; font-weight: normal;">ഇശാഇന് ശേഷം ഓപ്പൺ ആവുന്നതാണ്</div>
    `;
  }
}

// --- DYNAMIC FULLSCREEN VIDEO PLAYER (DRIVE PREVIEW & MP4) ---
function playVideoFullscreen(urlEncoded) {
  let url = decodeURIComponent(urlEncoded);
  if (url.includes("drive.google.com")) {
    const match = url.match(/[-\w]{25,}/);
    if (match) {
      url = `https://drive.google.com/file/d/${match[0]}/preview`;
    }
  }
  const modal = document.getElementById('fullscreenVideoModal');
  const player = document.getElementById('fsVideoPlayer');
  if (player && modal) {
    player.src = url;
    modal.style.display = 'flex';
    pushNavState();
  }
}

function closeFullscreenVideo(triggerPop = true) {
  const modal = document.getElementById('fullscreenVideoModal');
  const player = document.getElementById('fsVideoPlayer');
  if (player) player.src = '';
  if (modal) modal.style.display = 'none';
}

// --- ALARM REMINDER ---
function openAlarmModal() {
  const modal = document.getElementById('alarmModal');
  if (modal) {
    modal.style.display = 'flex';
    pushNavState();
  }
}

function setDailyPrayerAlarm() {
  const time = document.getElementById('studentAlarmTime').value;
  if (!time) return alert("ദയവായി സമയം തിരഞ്ഞെടുക്കുക!");
  localStorage.setItem('mum_saved_alarm', time);
  if ("Notification" in window) {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        alert(`അലാറം ${time}-ലേക്ക് സെറ്റ് ചെയ്തു. ആ സമയത്ത് നോട്ടിഫിക്കേഷൻ ലഭിക്കും.`);
      } else {
        alert(`അലാറം സമയം ${time} സേവ് ചെയ്തു.`);
      }
    });
  } else {
    alert(`അലാറം സമയം ${time} സേവ് ചെയ്തു.`);
  }
  closeModal('alarmModal');
}

setInterval(() => {
  const saved = localStorage.getItem('mum_saved_alarm');
  if (!saved) return;
  const now = new Date();
  const currentStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  if (currentStr === saved && now.getSeconds() < 2) {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("MUM Prayer Tracker", {
        body: "ഇന്നത്തെ നിസ്കാരം രേഖപ്പെടുത്താൻ സമയമായി. ഉടൻ തന്നെ രേഖപ്പെടുത്തുമല്ലോ.",
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='110' fill='%23047857'/%3E%3C/svg%3E"
      });
    }
  }
}, 1000);

// --- QUICK EDIT STUDENT & DAILY ENTRY (TEACHER & ADMIN) ---
function openStudentQuickEditor(inputId) {
  const adm = document.getElementById(inputId).value.trim();
  if (!adm) return alert("അഡ്മിഷൻ നമ്പർ അടിക്കുക!");
  const student = dbStudents.find(s => s.adm.toLowerCase() === adm.toLowerCase());
  if (!student) return alert("ഈ അഡ്മിഷൻ നമ്പറിൽ വിദ്യാർത്ഥിയെ കണ്ടെത്തിയില്ല!");

  document.getElementById('qeDocId').value = student.id;
  document.getElementById('qeAdm').value = student.adm;
  document.getElementById('qeName').value = student.name || '';
  document.getElementById('qeClass').value = student.class || '';
  document.getElementById('qeRoll').value = student.rollNo || '';
  document.getElementById('qePhone').value = student.phone || '';
  document.getElementById('qePass').value = student.pass || '';

  const todayEntry = dbPrayers.find(p => p.studentId === student.id && p.date === activeLogicalDate);
  document.getElementById('qeSubh').value = todayEntry?.subh || '';
  document.getElementById('qeDhuhr').value = todayEntry?.dhuhr || '';
  document.getElementById('qeAsr').value = todayEntry?.asr || '';
  document.getElementById('qeMaghrib').value = todayEntry?.maghrib || '';
  document.getElementById('qeIsha').value = todayEntry?.isha || '';

  document.getElementById('quickEditModal').style.display = 'flex';
  pushNavState();
}

async function saveStudentQuickEditor() {
  const stuId = document.getElementById('qeDocId').value;
  const name = document.getElementById('qeName').value.trim();
  const sClass = document.getElementById('qeClass').value.trim();
  const roll = document.getElementById('qeRoll').value.trim();
  const phone = document.getElementById('qePhone').value.trim();
  const pass = document.getElementById('qePass').value.trim();

  try {
    await db.collection("students").doc(stuId).update({
      name, class: sClass, rollNo: roll ? parseInt(roll) : null, phone, pass
    });

    const subh = document.getElementById('qeSubh').value;
    const dhuhr = document.getElementById('qeDhuhr').value;
    const asr = document.getElementById('qeAsr').value;
    const maghrib = document.getElementById('qeMaghrib').value;
    const isha = document.getElementById('qeIsha').value;

    if (subh || dhuhr || asr || maghrib || isha) {
      const payload = {
        date: activeLogicalDate,
        studentId: stuId,
        subh: subh || 'നിസ്കരിച്ചില്ല',
        dhuhr: dhuhr || 'നിസ്കരിച്ചില്ല',
        asr: asr || 'നിസ്കരിച്ചില്ല',
        maghrib: maghrib || 'നിസ്കരിച്ചില്ല',
        isha: isha || 'നിസ്കരിച്ചില്ല',
        parentVerified: true,
        lastModifiedBy: currentUser?.role || 'editor',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };
      const customDocId = `${stuId}_${activeLogicalDate}`;
      await db.collection("prayers").doc(customDocId).set(payload, { merge: true });
    }
    alert("വിദ്യാർത്ഥിയുടെ വിവരങ്ങളും നിസ്കാര എൻട്രിയും അപ്ഡേറ്റ് ചെയ്തു!");
    closeModal('quickEditModal');
  } catch(e) {
    alert("അപ്ഡേറ്റ് പരാജയപ്പെട്ടു: " + e.message);
  }
}

function toggleTeacherRegCapBox() {
  const g = document.getElementById('tRegGender').value;
  document.getElementById('tRegCapBox').style.display = g === 'Male' ? 'flex' : 'none';
}

// --- HARDWARE BACK BUTTON ---
history.pushState({ page: 'home' }, '');
window.addEventListener('popstate', function(e) {
  if (document.getElementById('fullscreenVideoModal')?.style.display === 'flex') {
    closeFullscreenVideo(false);
    return;
  }
  if (document.getElementById('drawerOverlay')?.style.display === 'block') {
    closeNavDrawer(false);
    return;
  }
  const modals = [
    'prayerModal', 'helpGuideModal', 'publicPhotoModal', 'publicVideoModal',
    'teachersContactModal', 'updatePhotoModal', 'studentDetailReportModal',
    'editStudentModal', 'editTeacherModal', 'teacherPrayerEditModal',
    'bulkWhatsAppModal', 'loginModal', 'aboutAppModal', 'alarmModal', 'quickEditModal'
  ];
  for (let id of modals) {
    const el = document.getElementById(id);
    if (el && el.style.display === 'flex') {
      el.style.display = 'none';
      return;
    }
  }
  if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'sadr')) {
    logout();
    alert("സുരക്ഷ മുൻനിർത്തി അഡ്മിൻ/സദർ പോർട്ടൽ ലോഗ് ഔട്ട് ചെയ്തിരിക്കുന്നു.");
    return;
  }
  if (document.getElementById('publicView')?.style.display === 'none') {
    navigateHome(false);
    return;
  }
  history.pushState({ page: 'home' }, '');
});

function pushNavState() {
  history.pushState({ page: 'sub' }, '');
}

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyAFsoGr2bUuNuN8HpkV3pjfG6_bHAQzaUY",
  authDomain: "mum-kalloor-koothali.firebaseapp.com",
  projectId: "mum-kalloor-koothali",
  storageBucket: "mum-kalloor-koothali.firebasestorage.app",
  messagingSenderId: "1067273465346",
  appId: "1:1067273465346:web:9699968605c7869f2d011b",
  measurementId: "G-LED49NYSS1"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const currMonth = activeLogicalDate.substring(0, 7);
if (document.getElementById('tRepMonth')) document.getElementById('tRepMonth').value = currMonth;
if (document.getElementById('admRepMonth')) document.getElementById('admRepMonth').value = currMonth;
if (document.getElementById('sadrRepMonth')) document.getElementById('sadrRepMonth').value = currMonth;
if (document.getElementById('tDailyDate')) document.getElementById('tDailyDate').value = activeLogicalDate;
if (document.getElementById('admDailyDate')) document.getElementById('admDailyDate').value = activeLogicalDate;
if (document.getElementById('sadrDailyDate')) document.getElementById('sadrDailyDate').value = activeLogicalDate;

(function initAdminClassBoxes() {
  const cont = document.getElementById('adminClassCheckboxContainer');
  if (!cont) return;
  let html = '';
  for(let i=1; i<=10; i++) {
    html += `<label class="class-checkbox-label"><input type="checkbox" class="adm-cls-chk" value="${i}" id="chkCls_${i}"> Cls ${i}</label>`;
  }
  cont.innerHTML = html;
})();

function toggleAllAdminClassChecks(status) {
  document.querySelectorAll('.adm-cls-chk').forEach(c => c.checked = status);
}

// --- ROTATING NOTICES ---
const baseNotices = [
  "🕌 ഇശാ നിസ്കാരത്തിന് ശേഷം എൻട്രി ചെയ്യുക.",
  "📅 ദിവസത്തിൽ ഒരിക്കൽ മാത്രം എൻട്രി ചെയ്യാം.",
  "✅ വിവരങ്ങൾ സത്യസന്ധമായി രേഖപ്പെടുത്തുക.",
  "👨‍👩‍👦 രക്ഷിതാവ് സാക്ഷ്യപ്പെടുത്തിയ ശേഷം എൻട്രി സേവ് ചെയ്യുക.",
  "🚫 അടുത്ത ദിവസം രാവിലെ 8 മണിക്ക് ശേഷം അവസരം ഉണ്ടായിരിക്കുന്നതല്ല.",
  "📞 കൂടുതൽ വിവരങ്ങൾക്ക് ക്ലാസ് ടീച്ചറെ ബന്ധപ്പെടുക."
];
let currentNoticeIndex = 0;
setInterval(() => {
  const el = document.getElementById('rotatingNoticeText');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => {
    let list = [...baseNotices];
    const openClasses = [];
    for (let i = 1; i <= 10; i++) {
      if (classLockSettings[String(i)] !== true) openClasses.push(i);
    }
    if (openClasses.length > 0) {
      list.unshift(`📢 ക്ലാസ് [${openClasses.join(', ')}] നിസ്കാര എൻട്രി ഇപ്പോൾ ഓപ്പൺ ആണ്.`);
    }
    const onlineTeachers = dbTeachers.filter(t => t.isOnline === true);
    if (onlineTeachers.length > 0) {
      onlineTeachers.forEach(t => {
        list.unshift(`🟢 [Online] ഉസ്താദ് ${t.name} ഇപ്പോൾ ഓൺലൈനിലുണ്ട്.`);
      });
    }
    currentNoticeIndex = (currentNoticeIndex + 1) % list.length;
    el.innerText = list[currentNoticeIndex];
    el.style.opacity = '1';
  }, 250);
}, 3800);

(function restorePersistentSession() {
  try {
    const savedUser = localStorage.getItem('mum_logged_session');
    if (savedUser) {
      currentUser = JSON.parse(savedUser);
      if (currentUser.role === 'admin' || currentUser.role === 'sadr') {
        currentUser = null;
        localStorage.removeItem('mum_logged_session');
      } else {
        updateTopNavBtn();
      }
    }
  } catch (e) {}
})();

function updateTopNavBtn() {
  const btn = document.getElementById('authBtn');
  if (!btn) return;
  if (currentUser) {
    const isPublicVisible = document.getElementById('publicView')?.style.display !== 'none';
    btn.innerText = isPublicVisible ? 'Portal' : 'Public Site';
  } else {
    btn.innerText = 'Login';
  }
}

function sortStudentsBoyFirst(arr) {
  return [...arr].sort((a, b) => {
    const gA = (a.gender || 'Male') === 'Male' ? 1 : 2;
    const gB = (b.gender || 'Male') === 'Male' ? 1 : 2;
    if (gA !== gB) return gA - gB;
    const rollA = parseInt(a.rollNo) || 9999;
    const rollB = parseInt(b.rollNo) || 9999;
    if (rollA !== rollB) return rollA - rollB;
    return (a.adm || '').localeCompare(b.adm || '');
  });
}

// --- REALTIME LISTENERS & OFFLINE CACHING ---
db.collection("students").onSnapshot(snapshot => {
  dbStudents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  setCached('students', dbStudents);
  if (currentUser?.role === 'teacher') {
    renderTeacherStudentList();
    renderDailyTeacherView();
  }
  if (currentUser?.role === 'admin') {
    renderAdminStudentList();
    renderDailyAdminView();
  }
  if (currentUser?.role === 'sadr') {
    renderSadrStudentList();
    renderDailySadrView();
  }
});

db.collection("teachers").onSnapshot(snapshot => {
  dbTeachers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  setCached('teachers', dbTeachers);
  if (currentUser?.role === 'teacher') {
    const updatedTeacher = dbTeachers.find(t => t.id === currentUser.data.id);
    if (updatedTeacher) {
      currentUser.data = updatedTeacher;
      const tStatus = document.getElementById('tOnlineStatusToggle');
      if (tStatus) tStatus.checked = !!updatedTeacher.isOnline;
      if (updatedTeacher.activeSessionDeviceId && updatedTeacher.activeSessionDeviceId !== currentDeviceId) {
        alert("മറ്റൊരു ഡിവൈസിൽ ഈ ടീച്ചർ അക്കൗണ്ട് ലോഗിൻ ചെയ്തിരിക്കുന്നു!");
        logout();
        return;
      }
      renderSessionManagementUI('teacher', updatedTeacher);
    }
  }
  if (currentUser?.role === 'admin') renderAdminTeachers();
});

db.collection("prayers").onSnapshot(snapshot => {
  dbPrayers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  setCached('prayers', dbPrayers);
  renderLeaderboard();
  if (currentUser?.role === 'teacher') renderDailyTeacherView();
  if (currentUser?.role === 'admin') renderDailyAdminView();
  if (currentUser?.role === 'sadr') renderDailySadrView();
});

db.collection("videos").orderBy("createdAt", "desc").onSnapshot(snapshot => {
  dbVideos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  setCached('videos', dbVideos);
  renderPublicVideos();
  if (currentUser?.role === 'admin') renderAdminVideoList();
});

db.collection("photos").orderBy("createdAt", "desc").onSnapshot(snapshot => {
  dbPhotos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  setCached('photos', dbPhotos);
  renderPublicPhotos();
  if (currentUser?.role === 'admin') renderAdminPhotoList();
});

db.collection("settings").doc("classLocks").onSnapshot(doc => {
  classLockSettings = doc.exists ? (doc.data() || {}) : {};
  setCached('classLocks', classLockSettings);
  if (currentUser?.role === 'teacher') updateClassLockUI();
  renderLeaderboard();
  refreshMainEntryBtnUI();
});

db.collection("settings").doc("config").onSnapshot(doc => {
  if (doc.exists) {
    const data = doc.data();
    if (data.adminPass) adminPassword = data.adminPass;
    if (data.sadrPass) {
      sadrPassword = data.sadrPass;
      const input = document.getElementById('admSadrPassInput');
      if (input) input.value = data.sadrPass;
    }
    if (data.coAdmin) {
      coAdminConfig = data.coAdmin;
      loadCoAdminSettingsUI();
    }
    if (data.aboutDesc) {
      const descEl = document.getElementById('displayAboutDesc');
      if (descEl) descEl.innerHTML = data.aboutDesc;
      const inputDesc = document.getElementById('adminAboutDesc');
      if (inputDesc) inputDesc.value = data.aboutDesc;
    }
    if (data.aboutAuth) {
      const authEl = document.getElementById('displayAboutAuth');
      if (authEl) authEl.innerHTML = data.aboutAuth;
      const inputAuth = document.getElementById('adminAboutAuth');
      if (inputAuth) inputAuth.value = data.aboutAuth;
    }
    if (currentUser?.role === 'admin') {
      if (data.adminActiveDeviceId && data.adminActiveDeviceId !== currentDeviceId) {
        alert("മറ്റൊരു ഡിവൈസിൽ അഡ്മിൻ ലോഗിൻ ചെയ്തതിനാൽ ഈ സെഷൻ ലോഗ് ഔട്ട് ആകുന്നു.");
        logout();
        return;
      }
      renderSessionManagementUI('admin', { activeSessionDeviceId: data.adminActiveDeviceId, lastLogin: data.adminLastLogin });
    }
    if (currentUser?.role === 'sadr') {
      if (data.sadrActiveDeviceId && data.sadrActiveDeviceId !== currentDeviceId) {
        alert("മറ്റൊരു ഡിവൈസിൽ സദർ പോർട്ടൽ ലോഗിൻ ചെയ്തതിനാൽ ഈ സെഷൻ ലോഗ് ഔട്ട് ആകുന്നു.");
        logout();
        return;
      }
      renderSessionManagementUI('sadr', { activeSessionDeviceId: data.sadrActiveDeviceId, lastLogin: data.sadrLastLogin });
    }
  }
});

refreshMainEntryBtnUI();
renderLeaderboard();

function renderSessionManagementUI(role, data) {
  let containerId = '';
  if (role === 'teacher') containerId = 'teacherSessionInfo';
  else if (role === 'sadr') containerId = 'sadrSessionInfo';
  else if (role === 'admin') containerId = 'adminSessionInfo';
  
  const el = document.getElementById(containerId);
  if (!el) return;
  const isThisDevice = (!data.activeSessionDeviceId || data.activeSessionDeviceId === currentDeviceId);
  el.innerHTML = `
    <div>ഈ ഡിവൈസ് ഐഡി: <code>${currentDeviceId.substring(0, 10)}...</code> (${isThisDevice ? '<b style="color:#047857;">ഈ ഫോൺ മാത്രം</b>' : '<b style="color:#dc2626;">മറ്റൊരു ഡിവൈസ് കണ്ടെത്തി!</b>'})</div>
    <div>അവസാന ആക്റ്റിവിറ്റി: <b>${data.lastLogin || 'ഇപ്പോൾ'}</b></div>
    <div>സ്റ്റാറ്റസ്: <span class="session-badge ${isThisDevice ? 'session-online' : 'session-offline'}">${isThisDevice ? 'Current Device Active' : 'External Device Active'}</span></div>
  `;
}

async function remoteForceLogout(role) {
  if (!confirm("മറ്റെല്ലാ ഡിവൈസുകളിൽ നിന്നും നിങ്ങളുടെ അക്കൗണ്ട് അടിയന്തിരമായി ലോഗ് ഔട്ട് ചെയ്യണോ?")) return;
  try {
    const newSessionId = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    localStorage.setItem('mum_device_id', newSessionId);
    if (role === 'teacher') {
      await db.collection("teachers").doc(currentUser.data.id).update({
        activeSessionDeviceId: newSessionId,
        lastLogin: new Date().toLocaleString()
      });
    } else if (role === 'admin') {
      await db.collection("settings").doc("config").update({
        adminActiveDeviceId: newSessionId,
        adminLastLogin: new Date().toLocaleString()
      });
    } else if (role === 'sadr') {
      await db.collection("settings").doc("config").update({
        sadrActiveDeviceId: newSessionId,
        sadrLastLogin: new Date().toLocaleString()
      });
    }
    alert("മറ്റെല്ലാ ഡിവൈസുകളും വിജയകരമായി ലോഗ് ഔട്ട് ചെയ്തു! നിലവിലെ ഡിവൈസ് സുരക്ഷിതമാണ്.");
    location.reload();
  } catch(e) {
    alert("ലോഗ് ഔട്ട് പരാജയപ്പെട്ടു: " + e.message);
  }
}

function openNavDrawer() {
  updateDrawerRoleMenu();
  const drawer = document.getElementById('drawerOverlay');
  if (drawer) drawer.style.display = 'block';
  pushNavState();
}

function closeNavDrawer(triggerPop = true) {
  const drawer = document.getElementById('drawerOverlay');
  if (drawer) drawer.style.display = 'none';
}

function navigateHome(triggerPop = true) {
  closeNavDrawer(false);
  document.getElementById('publicView').style.display = 'block';
  document.getElementById('teacherView').style.display = 'none';
  document.getElementById('sadrView').style.display = 'none';
  document.getElementById('adminView').style.display = 'none';
  updateTopNavBtn();
}

function updateDrawerRoleMenu() {
  const sec = document.getElementById('drawerRoleSection');
  const items = document.getElementById('drawerRoleMenuItems');
  if (!sec || !items) return;
  if (!currentUser) {
    sec.style.display = 'none';
    return;
  }
  sec.style.display = 'block';
  if (currentUser.role === 'teacher') {
    document.getElementById('drawerRoleHeading').innerText = 'Teacher Shortcuts';
    items.innerHTML = `
      <li class="drawer-item" onclick="jumpToSection('tSecQuickEdit')"><span>✏️</span> തിരുത്തുക (Student/Entry)</li>
      <li class="drawer-item" onclick="jumpToSection('tSecLock')"><span>🔐</span> Entry Access</li>
      <li class="drawer-item" onclick="jumpToSection('tSecDaily')"><span>📅</span> Daily Monitoring</li>
      <li class="drawer-item" onclick="jumpToSection('tSecAddStu')"><span>➕</span> Add Student</li>
      <li class="drawer-item" onclick="jumpToSection('tSecStudents')"><span>👥</span> Students List</li>
      <li class="drawer-item" onclick="jumpToSection('tSecReports')"><span>📊</span> Class Reports</li>
    `;
  } else if (currentUser.role === 'sadr') {
    document.getElementById('drawerRoleHeading').innerText = 'Sadr Shortcuts';
    items.innerHTML = `
      <li class="drawer-item" onclick="navigateRolePortal('sadr')"><span>👳‍♂️</span> സദർ പോർട്ടൽ</li>
    `;
  } else if (currentUser.role === 'admin' || currentUser.role === 'coadmin') {
    document.getElementById('drawerRoleHeading').innerText = 'Admin Shortcuts';
    items.innerHTML = `
      <li class="drawer-item" onclick="jumpToSection('admSecQuickEdit')"><span>✏️</span> തിരുത്തുക (Student/Entry)</li>
      <li class="drawer-item" onclick="jumpToSection('admSecLock')"><span>🔐</span> Class Locks</li>
      <li class="drawer-item" onclick="jumpToSection('admSecPhotos')"><span>🖼️</span> Manage Gallery</li>
      <li class="drawer-item" onclick="jumpToSection('admSecVideos')"><span>🎥</span> Manage Videos</li>
      <li class="drawer-item" onclick="jumpToSection('admSecDaily')"><span>📅</span> School Daily Inspection</li>
      <li class="drawer-item" onclick="jumpToSection('admSecStudents')"><span>👥</span> All Students</li>
      <li class="drawer-item" onclick="jumpToSection('admSecTeachers')"><span>👨‍🏫</span> Teachers Setup</li>
      <li class="drawer-item" onclick="jumpToSection('admSecReports')"><span>📊</span> School Reports</li>
    `;
  }
}

function navigateRolePortal(role) {
  closeNavDrawer(false);
  if (role === 'admin') loginAsAdmin(false);
  else if (role === 'sadr') loginAsSadr(false);
  else if (role === 'teacher') loginAsTeacher(currentUser.data, false);
}

// --- അധ്യാപക / അഡ്മിൻ പോർട്ടൽ മോഡുലാർ കാർഡ് സ്വിച്ചിംഗ് ---
function switchPortalTab(portalPrefix, sectionId, btnElement) {
  const container = document.getElementById(portalPrefix + 'View');
  if (!container) return;
  const sections = container.querySelectorAll('.portal-section-card, [id^="' + portalPrefix + 'Sec"]');
  sections.forEach(sec => sec.style.display = 'none');
  
  const target = document.getElementById(sectionId);
  if (target) {
    target.style.display = 'block';
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const buttons = container.querySelectorAll('.portal-tab-pill');
  buttons.forEach(b => b.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
}

function jumpToSection(secId) {
  closeNavDrawer(false);
  if (currentUser.role === 'admin' || currentUser.role === 'coadmin') loginAsAdmin(false);
  else if (currentUser.role === 'teacher') loginAsTeacher(currentUser.data, false);
  else if (currentUser.role === 'sadr') loginAsSadr(false);
  setTimeout(() => {
    const el = document.getElementById(secId);
    if (el) {
      el.style.display = 'block';
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, 150);
}

function openHelpGuideModal() { document.getElementById('helpGuideModal').style.display = 'flex'; pushNavState(); }
function openAboutModal() { document.getElementById('aboutAppModal').style.display = 'flex'; pushNavState(); }
function openPublicVideoModal() { renderPublicVideos(); document.getElementById('publicVideoModal').style.display = 'flex'; pushNavState(); }
function openPublicPhotoModal() { renderPublicPhotos(); document.getElementById('publicPhotoModal').style.display = 'flex'; pushNavState(); }

function openFeedbackWhatsApp() {
  const phone = "916238403492";
  const msg = "അസ്സലാമു അലൈക്കും റാഷിദലി ഫൈസി ഉസ്താദ്,\nMUM Prayer Tracker ആപ്പുമായി ബന്ധപ്പെട്ട എന്റെ സന്ദേശം/നിർദ്ദേശം താഴെ നൽകുന്നു:\n\n";
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

async function toggleTeacherOnlineNotice(isOnline) {
  if (!currentUser || currentUser.role !== 'teacher') return;
  try {
    await db.collection("teachers").doc(currentUser.data.id).update({ isOnline: isOnline });
  } catch(e) {
    alert("Status update failed: " + e.message);
  }
}

async function saveAboutAppAdmin() {
  const desc = document.getElementById('adminAboutDesc').value.trim();
  const auth = document.getElementById('adminAboutAuth').value.trim();
  if (!desc) return alert("ദയവായി വിവരണം നൽകുക!");
  try {
    await db.collection("settings").doc("config").set({ aboutDesc: desc, aboutAuth: auth }, { merge: true });
    alert("About App വിവരങ്ങൾ അപ്ഡേറ്റ് ചെയ്തു!");
  } catch (e) {
    alert("അപ്ഡേറ്റ് പരാജയപ്പെട്ടു: " + e.message);
  }
}

async function saveSadrPasswordAdmin() {
  const pass = document.getElementById('admSadrPassInput').value.trim();
  if (!pass) return alert("പാസ്‌വേഡ് നൽകുക!");
  try {
    await db.collection("settings").doc("config").set({ sadrPass: pass }, { merge: true });
    sadrPassword = pass;
    alert("സദർ മുഅല്ലിമിന്റെ പാസ്‌വേഡ് വിജയകരമായി സേവ് ചെയ്തു!");
  } catch(e) {
    alert("സേവ് ചെയ്യാൻ സാധിച്ചില്ല: " + e.message);
  }
}

function loadCoAdminSettingsUI() {
  if (!coAdminConfig) return;
  document.getElementById('coAdminName').value = coAdminConfig.name || '';
  document.getElementById('coAdminPass').value = coAdminConfig.pass || '';
  const p = coAdminConfig.permissions || {};
  document.getElementById('perm_locks').checked = !!p.locks;
  document.getElementById('perm_students').checked = !!p.students;
  document.getElementById('perm_teachers').checked = !!p.teachers;
  document.getElementById('perm_daily').checked = !!p.daily;
  document.getElementById('perm_reports').checked = !!p.reports;
  document.getElementById('perm_media').checked = !!p.media;
}

async function saveCoAdminConfig() {
  const name = document.getElementById('coAdminName').value.trim();
  const pass = document.getElementById('coAdminPass').value.trim();
  if (!name || !pass) return alert("കോ-അഡ്മിൻ പേരും പാസ്‌വേഡും നൽകുക!");
  const p = {
    locks: document.getElementById('perm_locks').checked,
    students: document.getElementById('perm_students').checked,
    teachers: document.getElementById('perm_teachers').checked,
    daily: document.getElementById('perm_daily').checked,
    reports: document.getElementById('perm_reports').checked,
    media: document.getElementById('perm_media').checked
  };
  try {
    await db.collection("settings").doc("config").set({
      coAdmin: { name, pass, permissions: p }
    }, { merge: true });
    alert("കോ-അഡ്മിൻ പ്രൊഫൈലും അധികാരങ്ങളും വിജയകരമായി അപ്‌ഡേറ്റ് ചെയ്തു!");
  } catch(e) {
    alert("അപ്‌ഡേറ്റ് പരാജയപ്പെട്ടു: " + e.message);
  }
}

async function applyMultiClassStatus(lockStatus) {
  const checkboxes = document.querySelectorAll('.adm-cls-chk:checked');
  if (checkboxes.length === 0) return alert("ദയവായി കുറഞ്ഞത് ഒരു ക്ലാസെങ്കിലും തിരഞ്ഞെടുക്കുക!");
  const updateObj = {};
  checkboxes.forEach(c => { updateObj[c.value] = lockStatus; });
  try {
    await db.collection("settings").doc("classLocks").set(updateObj, { merge: true });
    alert(lockStatus ? "തിരഞ്ഞെടുത്ത ക്ലാസുകൾ ക്ലോസ് ചെയ്തു!" : "തിരഞ്ഞെടുത്ത ക്ലാസുകൾ ഓപ്പൺ ചെയ്തു!");
  } catch (e) {
    alert("പരാജയപ്പെട്ടു: " + e.message);
  }
}

function updateClassLockUI() {
  const cls = document.getElementById('tLockClassSelect')?.value;
  const el = document.getElementById('classEntryStatusDesc');
  const btn = document.getElementById('toggleClassEntryBtn');
  if (!el || !btn || !cls) return;
  const isLocked = classLockSettings[cls] === true;
  if (!isLocked) {
    el.innerHTML = `<span style="color:#047857; font-weight:bold;">Unlocked (Class ${cls} entries open)</span>`;
    btn.innerText = `Lock Class ${cls} Access`;
    btn.style.background = "#dc2626";
  } else {
    el.innerHTML = `<span style="color:#dc2626; font-weight:bold;">Locked (Class ${cls} entries closed)</span>`;
    btn.innerText = `Unlock Class ${cls} Access`;
    btn.style.background = "#047857";
  }
}

async function toggleClassEntryStatus() {
  const cls = document.getElementById('tLockClassSelect').value;
  if (!cls) return;
  const currentState = classLockSettings[cls] === true;
  try {
    await db.collection("settings").doc("classLocks").set({ [cls]: !currentState }, { merge: true });
  } catch (e) {
    alert("Error updating class lock: " + e.message);
  }
}

function compressImage(file, maxWidth = 350, maxHeight = 350, quality = 0.72) {
  return new Promise((resolve) => {
    if (!file) return resolve('');
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width, height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
    };
  });
}

function previewSelectedImage(input, previewId) {
  const preview = document.getElementById(previewId);
  if (!preview) return;
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = e => {
      preview.src = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(input.files[0]);
  } else {
    preview.style.display = 'none';
  }
}

async function saveNewVideoAdmin() {
  const title = document.getElementById('adminVideoTitle').value.trim();
  const url = document.getElementById('adminVideoUrl').value.trim();
  const file = document.getElementById('adminVideoFileInput').files[0];
  if (!title) return alert("വീഡിയോ തലക്കെട്ട് നൽകുക!");
  let finalSrc = url;
  if (file) {
    if (file.size > 2.5 * 1024 * 1024) {
      return alert("ഫയൽ സൈസ് കൂടുതലാണ്! ദയവായി വീഡിയോ ഗൂഗിൾ ഡ്രൈവിലോ യൂട്യൂബിലോ അപ്‌ലോഡ് ചെയ്ത് ഡയറക്ട് ലിങ്ക് നൽകുക.");
    }
    finalSrc = await new Promise(resolve => {
      const r = new FileReader();
      r.onload = ev => resolve(ev.target.result);
      r.readAsDataURL(file);
    });
  }
  if (!finalSrc) return alert("ഡയറക്ട് ലിങ്കോ ഫയലോ തിരഞ്ഞെടുക്കുക!");
  try {
    await db.collection("videos").add({ title, url: finalSrc, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    alert("വീഡിയോ വിജയകരമായി പബ്ലിഷ് ചെയ്തു!");
    document.getElementById('adminVideoTitle').value = '';
    document.getElementById('adminVideoUrl').value = '';
    document.getElementById('adminVideoFileInput').value = '';
  } catch (e) {
    alert("വീഡിയോ അപ്‌ലോഡ് പരാജയപ്പെട്ടു: " + e.message);
  }
}

function renderPublicVideos() {
  const cont = document.getElementById('publicVideoContainer');
  if (!cont) return;
  let html = `
    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:10px; margin-bottom:10px;">
      <div style="font-size:12.5px; font-weight:800; color:var(--primary); margin-bottom:4px;">✨ ആപ്പ് ഉപയോഗം - ഗൈഡ് & നിർദ്ദേശങ്ങൾ</div>
      <p style="font-size:11px; color:#15803d; line-height:1.4; margin-bottom:8px;">
        നിസ്കാരം എങ്ങനെ കൃത്യമായി രേഖപ്പെടുത്താം, അധ്യാപകരുടെ വിവരങ്ങൾ എങ്ങനെ കാണാം, പോർട്ടൽ എങ്ങനെ ഉപയോഗിക്കാം എന്ന് താഴെ കാണാം.
      </p>
    </div>
  `;
  if (dbVideos.length === 0) {
    html += '<p style="font-size:11.5px; color:var(--text-muted); text-align:center; padding:10px 0;">വീഡിയോകൾ ലഭ്യമല്ല</p>';
  } else {
    dbVideos.forEach(v => {
      html += `
        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:10px; margin-bottom:8px;">
          <div style="font-size:12.5px; font-weight:800; color:var(--primary); margin-bottom:6px;">${v.title}</div>
          <button class="btn-main" onclick="playVideoFullscreen('${encodeURIComponent(v.url)}')">▶️ ഫുൾ സ്ക്രീനിൽ കാണുക (Watch Fullscreen)</button>
        </div>
      `;
    });
  }
  cont.innerHTML = html;
}

function renderAdminVideoList() {
  const cont = document.getElementById('adminVideoManageList');
  if (!cont) return;
  let html = '';
  dbVideos.forEach(v => {
    html += `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:6px 8px; border-radius:6px; margin-bottom:4px; font-size:11.5px;">
        <span>${v.title}</span>
        <button class="btn-del" onclick="db.collection('videos').doc('${v.id}').delete()">Delete</button>
      </div>
    `;
  });
  cont.innerHTML = html;
}

async function saveNewPhotoAdmin() {
  const title = document.getElementById('adminPhotoTitle').value.trim();
  const file = document.getElementById('adminPhotoFileInput').files[0];
  if (!file) return alert("ഫോട്ടോ തിരഞ്ഞെടുക്കുക!");
  try {
    const b64 = await compressImage(file, 600, 600, 0.75);
    await db.collection("photos").add({ title: title || 'MUM Photo', src: b64, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    alert("ഫോട്ടോ പബ്ലിഷ് ചെയ്തു!");
    document.getElementById('adminPhotoTitle').value = '';
    document.getElementById('adminPhotoFileInput').value = '';
  } catch(e) {
    alert("Photo upload failed: " + e.message);
  }
}

function renderPublicPhotos() {
  const c = document.getElementById('publicPhotoGrid');
  if (!c) return;
  if (dbPhotos.length === 0) {
    c.innerHTML = '<p style="font-size:11px; color:var(--text-muted); grid-column:span 2; text-align:center;">ഫോട്ടോകൾ ലഭ്യമല്ല</p>';
    return;
  }
  let h = '';
  dbPhotos.forEach(p => {
    h += `
      <div class="photo-grid-item">
        <img src="${p.src}" onclick="window.open('${p.src}')">
        <div class="photo-grid-title">${p.title}</div>
      </div>
    `;
  });
  c.innerHTML = h;
}

function renderAdminPhotoList() {
  const c = document.getElementById('adminPhotoManageList');
  if (!c) return;
  let h = '';
  dbPhotos.forEach(p => {
    h += `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:6px; border-radius:6px; margin-bottom:4px; font-size:11px;">
        <span>${p.title}</span>
        <button class="btn-del" onclick="db.collection('photos').doc('${p.id}').delete()">Delete</button>
      </div>
    `;
  });
  c.innerHTML = h;
}

// --- LEADERBOARD ---
function switchLeaderboard(type, btn) {
  activeLeaderboardTab = type;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const headers = { daily: '🏆 Daily Top Rankers', weekly: '🏆 Weekly Top Rankers', monthly: '🏆 Monthly Top Rankers' };
  document.getElementById('rankTitleHeader').innerText = headers[type];
  renderLeaderboard();
}

function renderLeaderboard() {
  const selectedClass = document.getElementById('leaderboardClassFilter')?.value || 'ALL';
  
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffset);
  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();

  let lbDateObj = new Date(istDate);
  if (hours < 20 || (hours === 20 && minutes < 30)) {
    lbDateObj.setDate(lbDateObj.getDate() - 1);
  }

  const ly = lbDateObj.getFullYear();
  const lm = String(lbDateObj.getMonth() + 1).padStart(2, '0');
  const ld = String(lbDateObj.getDate()).padStart(2, '0');
  let targetDate = `${ly}-${lm}-${ld}`;

  const dateDisplay = document.getElementById('todayDateLabel');
  if (dateDisplay) dateDisplay.innerText = targetDate;

  let filteredPrayers = [];
  if (activeLeaderboardTab === 'daily') {
    filteredPrayers = dbPrayers.filter(e => e.date === targetDate);
    if (filteredPrayers.length === 0) {
      const recordedDates = [...new Set(dbPrayers.map(p => p.date))].filter(d => d <= targetDate).sort().reverse();
      if (recordedDates.length > 0) {
        targetDate = recordedDates[0];
        if (dateDisplay) dateDisplay.innerText = targetDate;
        filteredPrayers = dbPrayers.filter(e => e.date === targetDate);
      }
    }
  } else if (activeLeaderboardTab === 'weekly') {
    const sAgo = new Date(lbDateObj);
    sAgo.setDate(sAgo.getDate() - 7);
    const sAgoStr = sAgo.toISOString().split('T')[0];
    filteredPrayers = dbPrayers.filter(e => e.date >= sAgoStr && e.date <= targetDate);
  } else if (activeLeaderboardTab === 'monthly') {
    const mStr = targetDate.substring(0, 7);
    filteredPrayers = dbPrayers.filter(e => e.date && e.date.startsWith(mStr));
  }

  const map = {};
  filteredPrayers.forEach(e => {
    if (!map[e.studentId]) map[e.studentId] = { jam: 0, ada: 0, qad: 0, totalScore: 0 };
    [e.subh, e.dhuhr, e.asr, e.maghrib, e.isha].forEach(st => {
      if (st === 'ജമാഅത്ത്') { map[e.studentId].jam++; map[e.studentId].totalScore += 5; }
      else if (st === 'അദാഅ്') { map[e.studentId].ada++; map[e.studentId].totalScore += 3; }
      else if (st === 'ഖളാഅ്') { map[e.studentId].qad++; map[e.studentId].totalScore += 1; }
    });
  });

  let allScores = Object.keys(map).map(stuId => {
    const s = dbStudents.find(x => x.id === stuId);
    if (!s) return null;
    if (selectedClass !== 'ALL' && String(s.class) !== String(selectedClass)) return null;
    return { name: s.name, class: s.class, gender: s.gender || 'Male', photo: s.photo, totalScore: map[stuId].totalScore };
  }).filter(Boolean);

  const boys = allScores.filter(s => s.gender === 'Male').sort((a,b) => b.totalScore - a.totalScore);
  const girls = allScores.filter(s => s.gender === 'Female').sort((a,b) => b.totalScore - a.totalScore);
  const container = document.getElementById('leaderboardList');
  if (!container) return;

  if (boys.length === 0 && girls.length === 0) {
    container.innerHTML = `<p style="font-size:11px; color:var(--text-muted); text-align:center; padding:10px 0;">${selectedClass !== 'ALL' ? `ക്ലാസ് ${selectedClass}-ൽ ` : ''}വിവരങ്ങൾ ലഭ്യമല്ല</p>`;
    return;
  }

  let html = '';
  const topBoy = boys[0];
  const topGirl = girls[0];

  if (topBoy) {
    html += `
      <div class="rank-item" style="border-left: 3.5px solid #0284c7;">
        <div style="display:flex; align-items:center;">
          <div class="rank-badge rank-1">1st (Boy)</div>
          <img src="${topBoy.photo || defaultAvatar}" class="avatar-sm">
          <div><b>${topBoy.name}</b> (Class ${topBoy.class})</div>
        </div>
        <span style="font-weight:bold; color:var(--primary); font-size:11.5px;">${topBoy.totalScore} pts</span>
      </div>
    `;
  }
  if (topGirl) {
    html += `
      <div class="rank-item" style="border-left: 3.5px solid #ec4899;">
        <div class="rank-badge rank-1" style="background:#ec4899;">1st (Girl)</div>
        <img src="${topGirl.photo || defaultAvatar}" class="avatar-sm">
        <div><b>${topGirl.name}</b> (Class ${topGirl.class})</div>
        <span style="font-weight:bold; color:var(--primary); font-size:11.5px;">${topGirl.totalScore} pts</span>
      </div>
    `;
  }

  if (activeLeaderboardTab !== 'daily') {
    const renderSubList = (list) => {
      return list.slice(1, 3).map((item, i) => `
        <div class="rank-item">
          <div style="display:flex; align-items:center;">
            <div class="rank-badge rank-${i+2}">${i+2}nd</div>
            <img src="${item.photo || defaultAvatar}" class="avatar-sm">
            <div>${item.name} (Class ${item.class})</div>
          </div>
          <span style="font-weight:bold; color:var(--primary); font-size:11px;">${item.totalScore} pts</span>
        </div>
      `).join('');
    };
    if (boys.length > 1) html += renderSubList(boys);
    if (girls.length > 1) html += renderSubList(girls);
  }
  container.innerHTML = html;
}

function getBadgeHTML(st) {
  if (!st) return `<span class="badge-status st-na">-</span>`;
  if (st === 'ജമാഅത്ത്') return `<span class="badge-status st-jam">ജമാ</span>`;
  if (st === 'അദാഅ്') return `<span class="badge-status st-ada">അദാ</span>`;
  if (st === 'ഖളാഅ്') return `<span class="badge-status st-qad">ഖളാ</span>`;
  if (st === 'ഇളവ്') return `<span class="badge-status st-exc">ഇളവ്</span>`;
  return `<span class="badge-status st-nil">ഇല്ല</span>`;
}

function getWhatsAppActionHTML(student, prayerRecord, targetDate) {
  let phone = (student.phone || '').trim().replace(/[^0-9]/g, '');
  if (!phone) return `<span style="font-size:10px; color:var(--text-muted);">No Ph</span>`;
  if (phone.length === 10) phone = '91' + phone;
  let missed = [];
  if (!prayerRecord) missed.push('ഇന്നത്തെ നിസ്കാരം ഒന്നും രേഖപ്പെടുത്തിയിട്ടില്ല');
  else {
    if (prayerRecord.subh === 'നിസ്കരിച്ചില്ല') missed.push('സുബ്ഹ്');
    if (prayerRecord.dhuhr === 'നിസ്കരിച്ചില്ല') missed.push('ളുഹ്ർ');
    if (prayerRecord.asr === 'നിസ്കരിച്ചില്ല') missed.push('അസ്വർ');
    if (prayerRecord.maghrib === 'നിസ്കരിച്ചില്ല') missed.push('മഗ്‌രിബ്');
    if (prayerRecord.isha === 'നിസ്കരിച്ചില്ല') missed.push('ഇശാ');
  }
  if (missed.length === 0) return `<span style="color:#047857; font-weight:bold; font-size:11px;">✔️ OK</span>`;
  const msg = `അസ്സലാമു അലൈക്കും,\nമള്ഹറുൽ ഉലൂം മദ്റസ കല്ലൂർ- കൂത്താളി - പ്രയർ ട്രാക്കർ അറിയിപ്പ്:\nനിങ്ങളുടെ മകൻ/മകൾ *${student.name}* (Roll: ${student.rollNo || '-'}, Adm: ${student.adm}) തീയതി ${targetDate}-ൽ *[${missed.join(', ')}]* നിസ്കാരം നിർവ്വഹിച്ചിട്ടില്ല / രേഖപ്പെടുത്തിയിട്ടില്ല എന്ന് കാണുന്നു. ശ്രദ്ധ പുലർത്തുമല്ലോ.`;
  return `<a href="https://wa.me/${phone}?text=${encodeURIComponent(msg)}" target="_blank" class="btn-wa">💬 WA</a>`;
}

function renderDailyTeacherView() {
  const cls = document.getElementById('tDailyClass')?.value;
  const date = document.getElementById('tDailyDate')?.value;
  if (!cls || !date) return;
  let students = dbStudents.filter(s => s.class === cls);
  students = sortStudentsBoyFirst(students);
  const dayPrayers = dbPrayers.filter(p => p.date === date);
  const tbody = document.getElementById('tDailyPrayerTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="color:var(--text-muted);">No Students</td></tr>`;
    return;
  }
  students.forEach((s, idx) => {
    const rec = dayPrayers.find(p => p.studentId === s.id);
    const waAction = getWhatsAppActionHTML(s, rec, date);
    tbody.innerHTML += `
      <tr>
        <td>${s.rollNo || (idx + 1)}</td>
        <td><b>${s.adm}</b></td>
        <td style="text-align:left;">${s.name} <span style="font-size:9px; color:#64748b;">(${s.gender === 'Female' ? 'F' : 'M'})</span></td>
        <td>${getBadgeHTML(rec?.subh)}</td>
        <td>${getBadgeHTML(rec?.dhuhr)}</td>
        <td>${getBadgeHTML(rec?.asr)}</td>
        <td>${getBadgeHTML(rec?.maghrib)}</td>
        <td>${getBadgeHTML(rec?.isha)}</td>
        <td style="white-space:nowrap;">
          <button class="btn-action" style="padding:2px 5px; font-size:10px;" onclick="openTeacherPrayerEdit('${s.id}', '${date}')">✏️ Edit</button>
          ${waAction}
        </td>
      </tr>
    `;
  });
}

function renderDailySadrView() {
  const cls = document.getElementById('sadrDailyClass')?.value;
  const date = document.getElementById('sadrDailyDate')?.value;
  if (!date) return;
  let students = dbStudents;
  if (cls !== 'ALL') students = students.filter(s => s.class === cls);
  students = sortStudentsBoyFirst(students);
  const dayPrayers = dbPrayers.filter(p => p.date === date);
  const tbody = document.getElementById('sadrDailyPrayerTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  students.forEach((s, idx) => {
    const rec = dayPrayers.find(p => p.studentId === s.id);
    const waAction = getWhatsAppActionHTML(s, rec, date);
    tbody.innerHTML += `
      <tr>
        <td>${s.class}</td>
        <td>${s.rollNo || (idx + 1)}</td>
        <td><b>${s.adm}</b></td>
        <td style="text-align:left;">${s.name} <span style="font-size:9px; color:#64748b;">(${s.gender === 'Female' ? 'F' : 'M'})</span></td>
        <td>${getBadgeHTML(rec?.subh)}</td>
        <td>${getBadgeHTML(rec?.dhuhr)}</td>
        <td>${getBadgeHTML(rec?.asr)}</td>
        <td>${getBadgeHTML(rec?.maghrib)}</td>
        <td>${getBadgeHTML(rec?.isha)}</td>
        <td style="white-space:nowrap;">
          <button class="btn-action" style="padding:2px 5px; font-size:10px;" onclick="openTeacherPrayerEdit('${s.id}', '${date}')">✏️ Edit</button>
          ${waAction}
        </td>
      </tr>
    `;
  });
}

function renderSadrStudentList() {
  const cls = document.getElementById('sadrFilterClass')?.value;
  let students = dbStudents;
  if (cls !== 'ALL') students = students.filter(s => s.class === cls);
  students = sortStudentsBoyFirst(students);
  const tbody = document.getElementById('sadrStudentTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  students.forEach((s, idx) => {
    tbody.innerHTML += `
      <tr>
        <td>${s.class}</td>
        <td>${s.rollNo || (idx + 1)}</td>
        <td><img src="${s.photo || defaultAvatar}" class="avatar-sm" style="margin:0 auto;"></td>
        <td>${s.adm}</td>
        <td style="text-align:left;">${s.name} <span style="font-size:9px; color:#64748b;">(${s.gender === 'Female' ? 'F' : 'M'})</span></td>
        <td>
          <button class="btn-action" style="background:#059669; padding:2px 5px; font-size:10px;" onclick="viewStudentIndividualReport('${s.id}')">📊 Report</button>
        </td>
      </tr>
    `;
  });
}

let unrecordedBulkList = [];
function openBulkWhatsAppModal() {
  const cls = document.getElementById('tDailyClass').value;
  const date = document.getElementById('tDailyDate').value;
  if (!cls || !date) return alert("Select Class and Date!");
  let students = dbStudents.filter(s => s.class === cls);
  const dayPrayers = dbPrayers.filter(p => p.date === date);
  unrecordedBulkList = students.filter(s => !dayPrayers.some(p => p.studentId === s.id));
  document.getElementById('bulkWAModalDesc').innerText = `Class ${cls} | Date: ${date} - Total Unrecorded: ${unrecordedBulkList.length}`;
  const container = document.getElementById('bulkWAListContainer');
  if (unrecordedBulkList.length === 0) {
    container.innerHTML = `<p style="font-size:13px; color:#047857; text-align:center; padding:10px;">All students have recorded their prayers for this date! 🎉</p>`;
  } else {
    let html = '<div style="display:flex; flex-direction:column; gap:6px;">';
    unrecordedBulkList.forEach((s, idx) => {
      let phone = (s.phone || '').trim().replace(/[^0-9]/g, '');
      if (phone.length === 10) phone = '91' + phone;
      const msg = `അസ്സലാമു അലൈക്കും,\nമള്ഹറുൽ ഉലൂം മദ്റസ കല്ലൂർ- കൂത്താളി - പ്രയർ ട്രാക്കർ അറിയിപ്പ്:\nനിങ്ങളുടെ മകൻ/മകൾ *${s.name}* (Adm: ${s.adm}, Class ${s.class}) ${date}-ലെ നിസ്കാര വിവരങ്ങൾ പോർട്ടലിൽ ഇതുവരെ രേഖപ്പെടുത്തിയിട്ടില്ല എന്ന് കാണുന്നു. ഉടൻ തന്നെ രേഖപ്പെടുത്തുമല്ലോ.`;
      const waLink = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : '#';
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:6px 10px; border-radius:8px; border:1px solid #cbd5e1;">
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" class="bulk-stu-check" data-idx="${idx}" checked>
            <div>
              <b>${s.name}</b> (Adm: ${s.adm})<br>
              <span style="font-size:10px; color:var(--text-muted);">${s.phone || 'No Phone'}</span>
            </div>
          </div>
          ${phone ? `<a href="${waLink}" target="_blank" class="btn-wa">Send WA</a>` : `<span style="font-size:10px; color:#dc2626;">No Number</span>`}
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  }
  document.getElementById('bulkWhatsAppModal').style.display = 'flex';
  pushNavState();
}

function toggleAllBulkStudents(checked) {
  document.querySelectorAll('.bulk-stu-check').forEach(c => c.checked = checked);
}

function sendDirectBroadcastAction() {
  const checkedBoxes = document.querySelectorAll('.bulk-stu-check:checked');
  if (checkedBoxes.length === 0) return alert("ദയവായി വിദ്യാർത്ഥികളെ തിരഞ്ഞെടുക്കുക!");
  const cls = document.getElementById('tDailyClass').value;
  const date = document.getElementById('tDailyDate').value;
  const broadcastMsg = `അസ്സലാമു അലൈക്കും,\nമള്ഹറുൽ ഉലൂം മദ്റസ കല്ലൂർ- കൂത്താളി - പ്രയർ ട്രാക്കർ അറിയിപ്പ്:\nക്ലാസ് ${cls}-ലെ ഇന്നത്തെ (${date}) നിസ്കാര വിവരങ്ങൾ പോർട്ടലിൽ രേഖപ്പെടുത്താത്ത വിദ്യാർത്ഥികൾ എത്രയും വേഗം രേഖപ്പെടുത്തുമല്ലോ. (രാവിലെ 8:00 മണിക്ക് ശേഷം അവസരം ഉണ്ടായിരിക്കുന്നതല്ല).`;
  navigator.clipboard.writeText(broadcastMsg).then(() => {
    alert(`മെസ്സേജ് ക്ലിപ്പ്ബോർഡിലേക്ക് കോപ്പി ചെയ്തു!\nവാട്സാപ്പ് തുറക്കുമ്പോൾ ഇത് ക്ലാസ് ഗ്രൂപ്പിലേക്കോ ബ്രോഡ്കാസ്റ്റിലേക്കോ പേസ്റ്റ് ചെയ്യുക.`);
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(broadcastMsg)}`, '_blank');
  }).catch(() => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(broadcastMsg)}`, '_blank');
  });
}

function renderDailyAdminView() {
  const cls = document.getElementById('admDailyClass')?.value;
  const date = document.getElementById('admDailyDate')?.value;
  if (!date) return;
  let students = dbStudents;
  if (cls !== 'ALL') students = students.filter(s => s.class === cls);
  students = sortStudentsBoyFirst(students);
  const dayPrayers = dbPrayers.filter(p => p.date === date);
  const tbody = document.getElementById('admDailyPrayerTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  students.forEach((s, idx) => {
    const rec = dayPrayers.find(p => p.studentId === s.id);
    const waAction = getWhatsAppActionHTML(s, rec, date);
    tbody.innerHTML += `
      <tr>
        <td>${s.class}</td>
        <td>${s.rollNo || (idx + 1)}</td>
        <td><b>${s.adm}</b></td>
        <td style="text-align:left;">${s.name} <span style="font-size:9px; color:#64748b;">(${s.gender === 'Female' ? 'F' : 'M'})</span></td>
        <td>${getBadgeHTML(rec?.subh)}</td>
        <td>${getBadgeHTML(rec?.dhuhr)}</td>
        <td>${getBadgeHTML(rec?.asr)}</td>
        <td>${getBadgeHTML(rec?.maghrib)}</td>
        <td>${getBadgeHTML(rec?.isha)}</td>
        <td style="white-space:nowrap;">
          <button class="btn-action" style="padding:2px 5px; font-size:10px;" onclick="openTeacherPrayerEdit('${s.id}', '${date}')">✏️ Edit</button>
          ${waAction}
        </td>
      </tr>
    `;
  });
}

function openTeacherPrayerEdit(studentId, date) {
  const student = dbStudents.find(s => s.id === studentId);
  if (!student) return;
  const existing = dbPrayers.find(p => p.studentId === studentId && p.date === date);
  document.getElementById('tEditTargetDate').value = date;
  document.getElementById('tEditTargetStudentId').value = studentId;
  document.getElementById('tEditPrayerStudentInfo').innerHTML = `
    <b>${student.name}</b> (Class ${student.class} | Adm: ${student.adm})<br>Date: <b>${date}</b>
  `;
  const prayers = ['സുബ്ഹ്', 'ളുഹ്ർ', 'അസ്വർ', 'മഗ്‌രിബ്', 'ഇശാ'];
  const pKeys = ['subh', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const isGirl = student.gender === 'Female';
  let html = '';
  prayers.forEach((p, idx) => {
    const currentVal = existing ? existing[pKeys[idx]] : '';
    html += `
      <div class="prayer-box">
        <div class="prayer-name">${p}</div>
        <div class="status-grid ${isGirl ? 'girls' : ''}">
          <label><input type="radio" name="tedit_${pKeys[idx]}" value="ജമാഅത്ത്" ${currentVal === 'ജമാഅത്ത്' ? 'checked' : ''}><span class="status-lbl">ജമാഅത്ത്</span></label>
          <label><input type="radio" name="tedit_${pKeys[idx]}" value="അദാഅ്" ${currentVal === 'അദാഅ്' ? 'checked' : ''}><span class="status-lbl">അദാഅ്</span></label>
          <label><input type="radio" name="tedit_${pKeys[idx]}" value="ഖളാഅ്" ${currentVal === 'ഖളാഅ്' ? 'checked' : ''}><span class="status-lbl">ഖളാഅ്</span></label>
          <label><input type="radio" name="tedit_${pKeys[idx]}" value="നിസ്കരിച്ചില്ല" ${currentVal === 'നിസ്കരിച്ചില്ല' ? 'checked' : ''}><span class="status-lbl">ഇല്ല</span></label>
          ${isGirl ? `<label><input type="radio" name="tedit_${pKeys[idx]}" value="ഇളവ്" ${currentVal === 'ഇളവ്' ? 'checked' : ''}><span class="status-lbl" style="color:#7c3aed;">ഇളവ്</span></label>` : ''}
        </div>
      </div>
    `;
  });
  document.getElementById('tEditPrayerCardsContainer').innerHTML = html;
  document.getElementById('teacherPrayerEditModal').style.display = 'flex';
  pushNavState();
}

async function saveTeacherOverriddenPrayer() {
  const studentId = document.getElementById('tEditTargetStudentId').value;
  const date = document.getElementById('tEditTargetDate').value;
  const pKeys = ['subh', 'dhuhr', 'asr', 'maghrib', 'isha'];
  for (let key of pKeys) {
    const selected = document.querySelector(`input[name="tedit_${key}"]:checked`);
    if (!selected) return alert("ദയവായി എല്ലാ നിസ്കാരങ്ങളുടെയും അവസ്ഥ തിരഞ്ഞെടുക്കുക!");
  }
  const payload = {
    date: date,
    studentId: studentId,
    subh: document.querySelector('input[name="tedit_subh"]:checked').value,
    dhuhr: document.querySelector('input[name="tedit_dhuhr"]:checked').value,
    asr: document.querySelector('input[name="tedit_asr"]:checked').value,
    maghrib: document.querySelector('input[name="tedit_maghrib"]:checked').value,
    isha: document.querySelector('input[name="tedit_isha"]:checked').value,
    lastModifiedBy: currentUser?.role || 'teacher',
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    const customDocId = `${studentId}_${date}`;
    await db.collection("prayers").doc(customDocId).set(payload, { merge: true });
    alert("Attendance record updated successfully!");
    closeModal('teacherPrayerEditModal');
  } catch (e) {
    alert("Update failed: " + e.message);
  }
}

async function clearStudentDailyPrayer() {
  const studentId = document.getElementById('tEditTargetStudentId').value;
  const date = document.getElementById('tEditTargetDate').value;
  if (confirm(`ഈ കുട്ടിയുടെ ${date}-ലെ നിസ്കാര രേഖ പൂർണ്ണമായി ഒഴിവാക്കണോ (Clear)?`)) {
    try {
      const existing = dbPrayers.filter(p => p.studentId === studentId && p.date === date);
      for (let rec of existing) {
        await db.collection("prayers").doc(rec.id).delete();
      }
      const customDocId = `${studentId}_${date}`;
      await db.collection("prayers").doc(customDocId).delete().catch(()=>{});
      alert("നിസ്കാര രേഖ വിജയകരമായി ഒഴിവാക്കി!");
      closeModal('teacherPrayerEditModal');
    } catch (e) {
      alert("ഡിലീറ്റ് ചെയ്യാൻ സാധിച്ചില്ല: " + e.message);
    }
  }
}

async function saveStudentByTeacher() {
  const cls = document.getElementById('tRegClass').value;
  const rollNo = document.getElementById('tRegRoll').value.trim();
  const adm = document.getElementById('tRegAdm').value.trim();
  const name = document.getElementById('tRegName').value.trim();
  const phone = document.getElementById('tRegPhone').value.trim();
  const pass = document.getElementById('tRegPass').value.trim();
  const gender = document.getElementById('tRegGender').value;
  const photoFile = document.getElementById('tRegPhoto').files[0];
  if (!adm || !name) return alert("Admission No and Name required!");
  if (!pass) return alert("Please set a password for the student!");
  if (dbStudents.some(s => s.adm.toLowerCase() === adm.toLowerCase())) return alert("Admission number already exists!");

  if (gender === 'Male' && photoFile) {
    const isCap = document.getElementById('tRegCapConfirm').checked;
    if (!isCap) {
      document.getElementById('tRegCapAlert').style.display = 'block';
      return alert("തൊപ്പിയിട്ട ഫോട്ടോ അപ്‌ലോഡ് ചെയ്യുക!");
    }
  }

  try {
    const photoBase64 = await compressImage(photoFile);
    await db.collection("students").add({
      rollNo: rollNo ? parseInt(rollNo) : null,
      adm, name, phone, pass, class: cls, gender,
      photo: photoBase64,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert("Student added successfully!");
    document.getElementById('tRegRoll').value = '';
    document.getElementById('tRegAdm').value = '';
    document.getElementById('tRegName').value = '';
    document.getElementById('tRegPhone').value = '';
    document.getElementById('tRegPass').value = '';
    document.getElementById('tRegPhoto').value = '';
    document.getElementById('tPhotoPreview').style.display = 'none';
    document.getElementById('tRegCapAlert').style.display = 'none';
  } catch (e) {
    alert("Failed: " + e.message);
  }
}

function renderTeacherStudentList() {
  const cls = document.getElementById('tFilterClass')?.value;
  let students = dbStudents.filter(s => s.class === cls);
  students = sortStudentsBoyFirst(students);
  const tbody = document.getElementById('tStudentTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  students.forEach((s, idx) => {
    tbody.innerHTML += `
      <tr>
        <td>${s.rollNo || (idx + 1)}</td>
        <td><img src="${s.photo || defaultAvatar}" class="avatar-sm" style="margin:0 auto;"></td>
        <td>${s.adm}</td>
        <td style="text-align:left;">${s.name} (${s.gender === 'Female' ? 'F' : 'M'})</td>
        <td><b style="color:var(--primary);">${s.pass || '-'}</b></td>
        <td style="white-space:nowrap;">
          <button class="btn-action" style="background:#059669; padding:2px 5px; font-size:10px;" onclick="viewStudentIndividualReport('${s.id}')">📊 Report</button>
          <button class="btn-action" style="padding:2px 5px; font-size:10px;" onclick="openEditStudentModal('${s.id}')">Edit</button>
          <button class="btn-del" style="padding:2px 5px; font-size:10px;" onclick="deleteStudent('${s.id}')">Delete</button>
        </td>
      </tr>
    `;
  });
}

function renderAdminStudentList() {
  const cls = document.getElementById('admFilterClass')?.value;
  let students = dbStudents;
  if (cls !== 'ALL') students = students.filter(s => s.class === cls);
  students = sortStudentsBoyFirst(students);
  const tbody = document.getElementById('admStudentTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  students.forEach((s, idx) => {
    tbody.innerHTML += `
      <tr>
        <td>${s.class}</td>
        <td>${s.rollNo || (idx + 1)}</td>
        <td><img src="${s.photo || defaultAvatar}" class="avatar-sm" style="margin:0 auto;"></td>
        <td>${s.adm}</td>
        <td style="text-align:left;">${s.name} <span style="font-size:9px; color:#64748b;">(${s.gender === 'Female' ? 'F' : 'M'})</span></td>
        <td><b style="color:var(--primary);">${s.pass || '-'}</b></td>
        <td style="white-space:nowrap;">
          <button class="btn-action" style="background:#059669; padding:2px 5px; font-size:10px;" onclick="viewStudentIndividualReport('${s.id}')">📊 Report</button>
          <button class="btn-action" style="padding:2px 5px; font-size:10px;" onclick="openEditStudentModal('${s.id}')">Edit</button>
          <button class="btn-del" style="padding:2px 5px; font-size:10px;" onclick="deleteStudent('${s.id}')">Delete</button>
        </td>
      </tr>
    `;
  });
}

function viewStudentIndividualReport(studentId) {
  const s = dbStudents.find(x => x.id === studentId);
  if (!s) return;
  selectedStudentForReport = s;
  const sEntries = dbPrayers.filter(e => e.studentId === s.id);
  let totals = { jam: 0, ada: 0, qad: 0, nil: 0, exc: 0 };
  sEntries.forEach(e => {
    [e.subh, e.dhuhr, e.asr, e.maghrib, e.isha].forEach(st => {
      if (st === 'ജമാഅത്ത്') totals.jam++;
      else if (st === 'അദാഅ്') totals.ada++;
      else if (st === 'ഖളാഅ്') totals.qad++;
      else if (st === 'ഇളവ്') totals.exc++;
      else totals.nil++;
    });
  });
  const totalScore = (totals.jam * 5) + (totals.ada * 3) + (totals.qad * 1);
  const container = document.getElementById('studentDetailContent');
  container.innerHTML = `
    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:10px; margin-bottom:10px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <img src="${s.photo || defaultAvatar}" class="avatar-lg">
        <div>
          <h4 style="color:var(--primary); font-size:15px;">${s.name}</h4>
          <div style="font-size:11.5px; color:var(--text-muted);">Adm No: <b>${s.adm}</b> | Roll: <b>${s.rollNo || '-'}</b> | Class: <b>${s.class}</b></div>
          <div style="font-size:11.5px; color:var(--text-muted);">Gender: <b>${s.gender || 'Male'}</b> | Phone: <b>${s.phone || '-'}</b></div>
        </div>
      </div>
    </div>
    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:5px; text-align:center; font-size:10.5px; margin-bottom:10px;">
      <div style="background:#d1fae5; padding:6px; border-radius:6px;">ജമാഅത്ത് (5):<br><b style="font-size:13px;">${totals.jam}</b></div>
      <div style="background:#dcfce7; padding:6px; border-radius:6px;">അദാഅ് (3):<br><b style="font-size:13px;">${totals.ada}</b></div>
      <div style="background:#fef3c7; padding:6px; border-radius:6px;">ഖളാഅ് (1):<br><b style="font-size:13px;">${totals.qad}</b></div>
      <div style="background:#fee2e2; padding:6px; border-radius:6px;">നിസ്കരിക്കാത്തത്:<br><b style="font-size:13px;">${totals.nil}</b></div>
      ${s.gender === 'Female' ? `<div style="background:#ede9fe; padding:6px; border-radius:6px;">ഇളവ്:<br><b style="font-size:13px;">${totals.exc}</b></div>` : ''}
      <div style="background:#e0f2fe; padding:6px; border-radius:6px;">ആകെ സ്കോർ:<br><b style="font-size:13px; color:var(--primary);">${totalScore}</b></div>
    </div>
    <h4 style="font-size:12px; color:var(--primary-dark); margin:8px 0 4px;">Recent Entries (${sEntries.length} Recorded Days)</h4>
    <div style="max-height:160px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px;">
      <table>
        <thead><tr><th>Date</th><th>Subh</th><th>Dhuhr</th><th>Asr</th><th>Maghrib</th><th>Isha</th></tr></thead>
        <tbody>
          ${sEntries.sort((a,b)=>b.date.localeCompare(a.date)).map(e => `
            <tr>
              <td>${e.date}</td>
              <td>${getBadgeHTML(e.subh)}</td>
              <td>${getBadgeHTML(e.dhuhr)}</td>
              <td>${getBadgeHTML(e.asr)}</td>
              <td>${getBadgeHTML(e.maghrib)}</td>
              <td>${getBadgeHTML(e.isha)}</td>
            </tr>
          `).join('') || '<tr><td colspan="6">No Entries found</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('studentDetailReportModal').style.display = 'flex';
  pushNavState();
}

function downloadIndividualStudentPDF() {
  if (!selectedStudentForReport) return;
  const s = selectedStudentForReport;
  const sEntries = dbPrayers.filter(e => e.studentId === s.id).sort((a,b)=>a.date.localeCompare(b.date));
  let jam = 0, ada = 0, qad = 0, nil = 0;
  sEntries.forEach(e => {
    [e.subh, e.dhuhr, e.asr, e.maghrib, e.isha].forEach(st => {
      if (st === 'ജമാഅത്ത്') jam++;
      else if (st === 'അദാഅ്') ada++;
      else if (st === 'ഖളാഅ്') qad++;
      else nil++;
    });
  });
  const totalScore = (jam * 5) + (ada * 3) + (qad * 1);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text("MALHARUL ULOOM MADRASA KALLOOR-KOOTHALI", 14, 15);
  doc.setFontSize(10);
  doc.text(`Individual Prayer Record - ${s.name} (Adm: ${s.adm}, Class: ${s.class})`, 14, 22);
  doc.setFontSize(9);
  doc.text(`Days: ${sEntries.length} | Jam: ${jam} | Ada: ${ada} | Qad: ${qad} | Nil: ${nil} | Total Score: ${totalScore}`, 14, 28);
  const rows = sEntries.map(e => [
    e.date,
    translateStatusToText(e.subh),
    translateStatusToText(e.dhuhr),
    translateStatusToText(e.asr),
    translateStatusToText(e.maghrib),
    translateStatusToText(e.isha)
  ]);
  doc.autoTable({
    startY: 32,
    head: [['Date', 'Subh', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [4, 120, 87] },
    styles: { fontSize: 8, cellPadding: 2, halign: 'center' }
  });
  doc.save(`MUM_Student_${s.adm}_${s.name}.pdf`);
}

function openEditStudentModal(id) {
  const s = dbStudents.find(x => x.id === id);
  if (!s) return;
  document.getElementById('editStuDocId').value = s.id;
  document.getElementById('editStuClass').value = s.class || '1';
  document.getElementById('editStuRoll').value = s.rollNo || '';
  document.getElementById('editStuAdm').value = s.adm || '';
  document.getElementById('editStuName').value = s.name || '';
  document.getElementById('editStuPhone').value = s.phone || '';
  document.getElementById('editStuPass').value = s.pass || '';
  document.getElementById('editStuGender').value = s.gender || 'Male';
  document.getElementById('editStuPhoto').value = '';
  const prev = document.getElementById('editPhotoPreview');
  if (s.photo) {
    prev.src = s.photo;
    prev.style.display = 'block';
  } else {
    prev.style.display = 'none';
  }
  document.getElementById('editStudentModal').style.display = 'flex';
  pushNavState();
}

async function updateStudentData() {
  const id = document.getElementById('editStuDocId').value;
  const cls = document.getElementById('editStuClass').value;
  const rollNo = document.getElementById('editStuRoll').value.trim();
  const adm = document.getElementById('editStuAdm').value.trim();
  const name = document.getElementById('editStuName').value.trim();
  const phone = document.getElementById('editStuPhone').value.trim();
  const pass = document.getElementById('editStuPass').value.trim();
  const gender = document.getElementById('editStuGender').value;
  const photoFile = document.getElementById('editStuPhoto').files[0];
  if (!adm || !name) return alert("Admission No and Name required!");
  if (!pass) return alert("Student password cannot be empty!");
  try {
    const payload = {
      class: cls,
      rollNo: rollNo ? parseInt(rollNo) : null,
      adm, name, phone, pass, gender
    };
    if (photoFile) payload.photo = await compressImage(photoFile);
    await db.collection("students").doc(id).update(payload);
    alert("Student updated!");
    closeModal('editStudentModal');
  } catch (e) {
    alert("Failed: " + e.message);
  }
}

async function deleteStudent(id) {
  if (confirm("Delete this student and associated records?")) {
    try {
      await db.collection("students").doc(id).delete();
      const pDocs = await db.collection("prayers").where("studentId", "==", id).get();
      pDocs.forEach(d => d.ref.delete());
    } catch (e) {
      alert("Delete failed: " + e.message);
    }
  }
}

async function saveTeacherByAdmin() {
  const name = document.getElementById('admTName').value.trim();
  const phone = document.getElementById('admTPhone').value.trim();
  const pass = document.getElementById('admTPass').value.trim();
  const clsInput = document.getElementById('admTClasses').value.trim();
  const photoFile = document.getElementById('admTPhoto').files[0];
  if (!name || !pass || !clsInput) return alert("Please fill all teacher details!");
  const classes = clsInput.split(',').map(c => c.trim()).filter(Boolean);
  try {
    const photoBase64 = await compressImage(photoFile);
    await db.collection("teachers").add({ name, phone, pass, classes, photo: photoBase64 });
    alert("Teacher added!");
    document.getElementById('admTName').value = '';
    document.getElementById('admTPhone').value = '';
    document.getElementById('admTPass').value = '';
    document.getElementById('admTClasses').value = '';
    document.getElementById('admTPhoto').value = '';
    document.getElementById('admPhotoPreview').style.display = 'none';
  } catch (e) {
    alert("Failed: " + e.message);
  }
}

function renderAdminTeachers() {
  const tbody = document.getElementById('admTeacherTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  dbTeachers.forEach(t => {
    const clsList = Array.isArray(t.classes) ? t.classes.join(', ') : (t.class || '');
    tbody.innerHTML += `
      <tr>
        <td><img src="${t.photo || defaultAvatar}" class="avatar-sm" style="margin:0 auto;"></td>
        <td>${t.name}</td>
        <td>${t.phone || '-'}</td>
        <td>${clsList}</td>
        <td style="white-space:nowrap;">
          <button class="btn-action" onclick="openEditTeacherModal('${t.id}')">Edit</button>
          <button class="btn-del" onclick="deleteTeacher('${t.id}')">Delete</button>
        </td>
      </tr>
    `;
  });
}

function openEditTeacherModal(id) {
  const t = dbTeachers.find(x => x.id === id);
  if (!t) return;
  document.getElementById('editTeacherDocId').value = t.id;
  document.getElementById('editTeacherName').value = t.name || '';
  document.getElementById('editTeacherPhone').value = t.phone || '';
  document.getElementById('editTeacherPass').value = t.pass || '';
  document.getElementById('editTeacherClasses').value = Array.isArray(t.classes) ? t.classes.join(',') : (t.class || '');
  const prev = document.getElementById('editTeacherPhotoPrev');
  if (t.photo) {
    prev.src = t.photo;
    prev.style.display = 'block';
  } else {
    prev.style.display = 'none';
  }
  document.getElementById('editTeacherModal').style.display = 'flex';
  pushNavState();
}

async function updateTeacherData() {
  const id = document.getElementById('editTeacherDocId').value;
  const name = document.getElementById('editTeacherName').value.trim();
  const phone = document.getElementById('editTeacherPhone').value.trim();
  const pass = document.getElementById('editTeacherPass').value.trim();
  const clsInput = document.getElementById('editTeacherClasses').value.trim();
  const photoFile = document.getElementById('editTeacherPhoto').files[0];
  if (!name || !pass || !clsInput) return alert("Fill all fields!");
  const classes = clsInput.split(',').map(c => c.trim()).filter(Boolean);
  try {
    const payload = { name, phone, pass, classes };
    if (photoFile) payload.photo = await compressImage(photoFile);
    await db.collection("teachers").doc(id).update(payload);
    alert("Teacher updated!");
    closeModal('editTeacherModal');
  } catch (e) {
    alert("Update failed: " + e.message);
  }
}

async function deleteTeacher(id) {
  if (confirm("Delete this teacher account?")) {
    try {
      await db.collection("teachers").doc(id).delete();
    } catch (e) {
      alert("Failed: " + e.message);
    }
  }
}

async function changeAdminPass() {
  const oldP = document.getElementById('admOldPass').value;
  const newP = document.getElementById('admNewPass').value;
  if (oldP !== adminPassword && oldP !== "mumadminpass") return alert("Old password incorrect!");
  if (!newP) return alert("Enter new password!");
  try {
    await db.collection("settings").doc("config").set({ adminPass: newP }, { merge: true });
    adminPassword = newP;
    alert("Admin password updated!");
    document.getElementById('admOldPass').value = '';
    document.getElementById('admNewPass').value = '';
  } catch (e) {
    alert("Failed: " + e.message);
  }
}

function handleSmartSearch(val, containerId, selectCallback) {
  const query = val.trim().toLowerCase();
  const box = document.getElementById(containerId);
  if (!query) {
    box.style.display = 'none';
    return;
  }
  const matches = dbStudents.filter(s => s.adm.toLowerCase().includes(query) || s.name.toLowerCase().includes(query)).slice(0, 5);
  if (matches.length === 0) {
    box.style.display = 'none';
    return;
  }
  box.innerHTML = matches.map(s => `
    <div class="suggestion-item" onclick='${selectCallback.name}("${s.id}")'>
      <span><b>${s.name}</b> (Class ${s.class})</span>
      <span style="color:var(--text-muted);">Adm: ${s.adm}</span>
    </div>
  `).join('');
  box.style.display = 'block';
}

function selectStatusStudent(studentId) {
  const s = dbStudents.find(x => x.id === studentId);
  if (!s) return;
  document.getElementById('srchAdm').value = s.adm;
  document.getElementById('srchSuggestions').style.display = 'none';
  document.getElementById('srchPass').focus();
}

function selectEntryStudent(studentId) {
  const s = dbStudents.find(x => x.id === studentId);
  if (!s) return;
  document.getElementById('pAdmInput').value = s.adm;
  document.getElementById('pNameInput').value = s.name;
  document.getElementById('pAdmSuggestions').style.display = 'none';
  document.getElementById('pNameSuggestions').style.display = 'none';
}

function openPrayerEntryModal() {
  activeLogicalDate = getLogicalPrayerDate();
  document.getElementById('pAdmInput').value = '';
  document.getElementById('pNameInput').value = '';
  document.getElementById('pPasswordInput').value = '';
  document.getElementById('pAdmSuggestions').style.display = 'none';
  document.getElementById('pNameSuggestions').style.display = 'none';
  document.getElementById('pStudentInfo').style.display = 'none';
  document.getElementById('prayerCardsContainer').style.display = 'none';
  document.getElementById('parentVerificationCheck').checked = false;
  document.getElementById('btnDailySave').classList.remove('btn-save-ready');
  document.getElementById('prayerEntryModalDateBadge').innerText = activeLogicalDate;
  document.getElementById('prayerModal').style.display = 'flex';
  pushNavState();
}

function verifyAndOpenPrayerForm() {
  const adm = document.getElementById('pAdmInput').value.trim();
  const name = document.getElementById('pNameInput').value.trim();
  const password = document.getElementById('pPasswordInput').value.trim();
  const student = dbStudents.find(s => s.adm.toLowerCase() === adm.toLowerCase() || s.name.toLowerCase() === name.toLowerCase());
  if (!student) return alert("വിദ്യാർത്ഥിയുടെ അഡ്മിഷൻ നമ്പറോ പേരോ ശരിയല്ല!");
  if (classLockSettings[student.class] === true) {
    alert(`നിങ്ങളുടെ ക്ലാസിലെ (${student.class}) നിസ്കാരം രേഖപ്പെടുത്താനുള്ള സമയം ഇപ്പോൾ തുറന്നിട്ടില്ല (ഇശാഇന് ശേഷം ഓപ്പൺ ആവും).`);
    return;
  }
  if (!student.pass || student.pass !== password) {
    alert("നൽകിയ പാസ്‌വേഡ് തെറ്റാണ്! അധ്യാപകൻ നൽകിയ ശരിയായ പാസ്‌വേഡ് നൽകുക.");
    return;
  }
  activeLogicalDate = getLogicalPrayerDate();
  const existing = dbPrayers.find(e => e.studentId === student.id && e.date === activeLogicalDate);
  if (existing) {
    alert("ഈ വിദ്യാർത്ഥി ഇന്ന് ഇതിനകം നിസ്കാരം രേഖപ്പെടുത്തിയിട്ടുണ്ട്!");
    closeModal('prayerModal');
    return;
  }
  loadPrayerFormForStudent(student);
}

function loadPrayerFormForStudent(student) {
  activeStudentForEntry = student;
  const pInfo = document.getElementById('pStudentInfo');
  pInfo.style.display = 'flex';
  pInfo.innerHTML = `
    <img src="${student.photo || defaultAvatar}" class="avatar-sm">
    <div><b>${student.name}</b> (Roll: ${student.rollNo || '-'} | Adm: ${student.adm} | ക്ലാസ്: ${student.class})</div>
  `;
  const prayers = ['സുബ്ഹ്', 'ളുഹ്ർ', 'അസ്വർ', 'മഗ്‌രിബ്', 'ഇശാ'];
  const pKeys = ['subh', 'dhuhr', 'asr', 'maghrib', 'isha'];
  let html = '';
  const isGirl = (student.gender === 'Female');
  prayers.forEach((p, idx) => {
    html += `
      <div class="prayer-box">
        <div class="prayer-name">${p}</div>
        <div class="status-grid ${isGirl ? 'girls' : ''}">
          <label><input type="radio" name="${pKeys[idx]}" value="ജമാഅത്ത്" onchange="handlePrayerSelection()"><span class="status-lbl">ജമാഅത്ത്</span></label>
          <label><input type="radio" name="${pKeys[idx]}" value="അദാഅ്" onchange="handlePrayerSelection()"><span class="status-lbl">അദാഅ്</span></label>
          <label><input type="radio" name="${pKeys[idx]}" value="ഖളാഅ്" onchange="handlePrayerSelection()"><span class="status-lbl">ഖളാഅ്</span></label>
          <label><input type="radio" name="${pKeys[idx]}" value="നിസ്കരിച്ചില്ല" onchange="handlePrayerSelection()"><span class="status-lbl">ഇല്ല</span></label>
          ${isGirl ? `<label><input type="radio" name="${pKeys[idx]}" value="ഇളവ്" onchange="handlePrayerSelection()"><span class="status-lbl" style="color:#7c3aed;">ഇളവ്</span></label>` : ''}
        </div>
      </div>
    `;
  });
  document.getElementById('prayersMarkup').innerHTML = html;
  const cont = document.getElementById('prayerCardsContainer');
  cont.style.display = 'block';
  setTimeout(() => { cont.scrollIntoView({ behavior: 'smooth' }); }, 100);
}

function handlePrayerSelection() {
  playSelectClickSound();
  checkAllPrayersFilled();
}

function checkAllPrayersFilled() {
  const pKeys = ['subh', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const allFilled = pKeys.every(k => !!document.querySelector(`input[name="${k}"]:checked`));
  const parentChecked = document.getElementById('parentVerificationCheck').checked;
  const btn = document.getElementById('btnDailySave');
  if (allFilled && parentChecked) {
    btn.classList.add('btn-save-ready');
    btn.innerText = "✨ സേവ് ചെയ്യുക (Save Now)";
  } else {
    btn.classList.remove('btn-save-ready');
    btn.innerText = "സേവ് ചെയ്യുക";
  }
}

// --- DUPLICATE ENTRY RESTRICTION & UNIQUE FIRESTORE DOC ID ---
async function saveDailyPrayer() {
  if (!activeStudentForEntry) return;

  const btn = document.getElementById('btnDailySave');
  if (btn.disabled) return;

  const pKeys = ['subh', 'dhuhr', 'asr', 'maghrib', 'isha'];
  for (let key of pKeys) {
    if (!document.querySelector(`input[name="${key}"]:checked`)) {
      return alert("ദയവായി എല്ലാ നിസ്കാരങ്ങളുടെയും അവസ്ഥ തിരഞ്ഞെടുക്കുക!");
    }
  }

  const parentChecked = document.getElementById('parentVerificationCheck').checked;
  if (!parentChecked) {
    return alert("രക്ഷിതാവ് സാക്ഷ്യപ്പെടുത്തിയ ബോക്സ് ടിക്ക് ചെയ്ത ശേഷം മാത്രമേ സേവ് ചെയ്യാൻ സാധിക്കൂ!");
  }

  activeLogicalDate = getLogicalPrayerDate();

  const duplicateCheck = dbPrayers.find(e => e.studentId === activeStudentForEntry.id && e.date === activeLogicalDate);
  if (duplicateCheck) {
    alert("ഈ വിദ്യാർത്ഥി ഇന്ന് ഇതിനകം നിസ്കാരം രേഖപ്പെടുത്തിയിട്ടുണ്ട്!");
    closeModal('prayerModal');
    return;
  }

  btn.disabled = true;
  btn.innerText = "സേവ് ചെയ്യുന്നു...";

  const entry = {
    date: activeLogicalDate,
    studentId: activeStudentForEntry.id,
    subh: document.querySelector('input[name="subh"]:checked').value,
    dhuhr: document.querySelector('input[name="dhuhr"]:checked').value,
    asr: document.querySelector('input[name="asr"]:checked').value,
    maghrib: document.querySelector('input[name="maghrib"]:checked').value,
    isha: document.querySelector('input[name="isha"]:checked').value,
    parentVerified: true,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    const customDocId = `${activeStudentForEntry.id}_${activeLogicalDate}`;
    await db.collection("prayers").doc(customDocId).set(entry, { merge: true });
    playCelebrationBell();
    alert("വിജയകരമായി രേഖപ്പെടുത്തി! അല്ലാഹു സ്വീകരിക്കട്ടെ.");
    closeModal('prayerModal');
  } catch (e) {
    alert("ഡാറ്റ സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല: " + e.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "സേവ് ചെയ്യുക";
  }
}

// --- STUDENT SEARCH & PROGRESS GRAPH ---
function searchStudentHistory() {
  const term = document.getElementById('srchAdm').value.trim().toLowerCase();
  const pass = document.getElementById('srchPass').value.trim();
  const div = document.getElementById('srchResult');
  if (!term) return alert("അഡ്മിഷൻ നമ്പറോ പേരോ നൽകുക!");
  if (!pass) return alert("പരിശോധിക്കാൻ വിദ്യാർത്ഥിയുടെ പാസ്‌വേഡ് (PIN) നൽകുക!");
  const student = dbStudents.find(s => s.adm.toLowerCase() === term || s.name.toLowerCase() === term);
  if (!student) {
    div.innerHTML = '<p style="font-size:12px; color:red;">വിദ്യാർത്ഥിയെ കണ്ടെത്തിയില്ല.</p>';
    return;
  }
  if (!student.pass || student.pass !== pass) {
    div.innerHTML = '<p style="font-size:12px; color:red;">നൽകിയ പാസ്‌വേഡ് തെറ്റാണ്! ശരിയായ PIN നൽകുക.</p>';
    return;
  }
  const entries = dbPrayers.filter(e => e.studentId === student.id).sort((a,b)=>a.date.localeCompare(b.date));
  let totals = { jam: 0, ada: 0, qad: 0, nil: 0, exc: 0 };
  entries.forEach(e => {
    [e.subh, e.dhuhr, e.asr, e.maghrib, e.isha].forEach(st => {
      if (st === 'ജമാഅത്ത്') totals.jam++;
      else if (st === 'അദാഅ്') totals.ada++;
      else if (st === 'ഖളാഅ്') totals.qad++;
      else if (st === 'ഇളവ്') totals.exc++;
      else totals.nil++;
    });
  });
  const totalScore = (totals.jam * 5) + (totals.ada * 3) + (totals.qad * 1);
  div.innerHTML = `
    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:10px; font-size:11.5px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
        <div style="display:flex; align-items:center;">
          <img src="${student.photo || defaultAvatar}" class="avatar-lg">
          <div>
            <div style="font-weight:bold; font-size:13.5px; color:var(--primary);">${student.name}</div>
            <div style="color:var(--text-muted);">Roll: ${student.rollNo || '-'} | Adm: ${student.adm} | Class: ${student.class}</div>
          </div>
        </div>
        <button class="btn-action" style="padding:4px 8px;" onclick="openUpdatePhotoModal('${student.id}', '${student.gender || 'Male'}')">📷 ഫോട്ടോ മാറ്റുക</button>
      </div>
      <p style="margin:4px 0 6px;">രേഖപ്പെടുത്തിയ ദിവസങ്ങൾ: <b>${entries.length}</b> | ആകെ സ്കോർ: <b style="color:var(--primary);">${totalScore} pts</b></p>
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:5px; text-align:center;">
        <div style="background:#d1fae5; padding:5px; border-radius:6px;">ജമാഅത്ത് (5): <b>${totals.jam}</b></div>
        <div style="background:#dcfce7; padding:5px; border-radius:6px;">അദാഅ് (3): <b>${totals.ada}</b></div>
        <div style="background:#fef3c7; padding:5px; border-radius:6px;">ഖളാഅ് (1): <b>${totals.qad}</b></div>
        <div style="background:#fee2e2; padding:5px; border-radius:6px;">നിസ്കരിക്കാത്തത്: <b>${totals.nil}</b></div>
        ${student.gender === 'Female' ? `<div style="background:#ede9fe; padding:5px; border-radius:6px;">ഇളവ്: <b>${totals.exc}</b></div>` : ''}
      </div>
      <div style="margin-top:12px; background:#fff; padding:8px; border-radius:8px; border:1px solid #e2e8f0;">
        <b style="color:var(--primary);">📈 കഴിഞ്ഞ 7 ദിവസത്തെ നിസ്കാര പുരോഗതി ഗ്രാഫ്:</b>
        <canvas id="studentGraphCanvas" style="max-height:170px; margin-top:6px;"></canvas>
      </div>
    </div>
  `;

  const recentDays = entries.slice(-7);
  const labels = recentDays.map(e => e.date.substring(5));
  const scores = recentDays.map(e => {
    let dayCount = 0;
    [e.subh, e.dhuhr, e.asr, e.maghrib, e.isha].forEach(s => {
      if (s === 'ജമാഅത്ത്' || s === 'അദാഅ്') dayCount++;
    });
    return dayCount;
  });

  const canvas = document.getElementById('studentGraphCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (statusProgressChartInstance) statusProgressChartInstance.destroy();
    statusProgressChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['ഡാറ്റ ലഭ്യമല്ല'],
        datasets: [{
          label: 'നിർവ്വഹിച്ചവ (5 ൽ)',
          data: scores.length ? scores : [0],
          borderColor: '#047857',
          backgroundColor: 'rgba(4, 120, 87, 0.15)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        scales: { y: { min: 0, max: 5, ticks: { stepSize: 1 } } }
      }
    });
  }
}

function openUpdatePhotoModal(stuId, gender) {
  document.getElementById('photoUpdateStuId').value = stuId;
  document.getElementById('photoUpdatePass').value = '';
  document.getElementById('photoUpdateFile').value = '';
  document.getElementById('updateCapAlert').style.display = 'none';
  const capBox = document.getElementById('capUpdateCheckContainer');
  capBox.style.display = (gender === 'Male') ? 'flex' : 'none';
  document.getElementById('updatePhotoModal').style.display = 'flex';
  pushNavState();
}

async function submitStudentPhotoUpdate() {
  const id = document.getElementById('photoUpdateStuId').value;
  const pass = document.getElementById('photoUpdatePass').value.trim();
  const file = document.getElementById('photoUpdateFile').files[0];
  const s = dbStudents.find(x => x.id === id);
  if (!s || s.pass !== pass) return alert("പാസ്‌വേഡ് തെറ്റാണ്!");
  if (!file) return alert("ഫോട്ടോ തിരഞ്ഞെടുക്കുക!");

  if ((s.gender || 'Male') === 'Male') {
    const isCapConfirmed = document.getElementById('photoUpdateCapConfirm').checked;
    if (!isCapConfirmed) {
      document.getElementById('updateCapAlert').style.display = 'block';
      return alert("തൊപ്പിയിട്ട ഫോട്ടോ അപ്‌ലോഡ് ചെയ്യുക!");
    }
  }

  try {
    const b64 = await compressImage(file, 260, 260, 0.7);
    await db.collection("students").doc(id).update({ photo: b64 });
    alert("ഫോട്ടോ വിജയകരമായി അപ്‌ഡേറ്റ് ചെയ്തു!");
    closeModal('updatePhotoModal');
    searchStudentHistory();
  } catch(e) {
    alert("Photo update failed: " + e.message);
  }
}

// --- REPORTS ---
function toggleReportTypeInputs(source) {
  let repType, group;
  if (source === 'teacher') {
    repType = document.getElementById('tRepType').value;
    group = document.getElementById('tRepMonthGroup');
  } else if (source === 'sadr') {
    repType = document.getElementById('sadrRepType').value;
    group = document.getElementById('sadrRepMonthGroup');
  } else {
    repType = document.getElementById('admRepType').value;
    group = document.getElementById('admRepMonthGroup');
  }
  if (group) group.style.display = repType === 'overall' ? 'none' : 'block';
}

function getProcessedReportData(source) {
  let cls, repType, month;
  if (source === 'teacher') {
    cls = document.getElementById('tRepClass').value;
    repType = document.getElementById('tRepType').value;
    month = document.getElementById('tRepMonth').value;
  } else if (source === 'sadr') {
    cls = document.getElementById('sadrRepClass').value;
    repType = document.getElementById('sadrRepType').value;
    month = document.getElementById('sadrRepMonth').value;
  } else {
    cls = document.getElementById('admRepClass').value;
    repType = document.getElementById('admRepType').value;
    month = document.getElementById('admRepMonth').value;
  }

  if (repType === 'monthly' && !month) {
    alert("Select Month!");
    return null;
  }
  let students = dbStudents;
  if (cls !== 'ALL') students = students.filter(s => s.class === cls);
  students = sortStudentsBoyFirst(students);
  let entries = dbPrayers;
  if (repType === 'monthly') {
    entries = entries.filter(e => e.date && e.date.startsWith(month));
  }
  const tableData = [];
  students.forEach((s, idx) => {
    const sEntries = entries.filter(e => e.studentId === s.id);
    let jam = 0, ada = 0, qad = 0, nil = 0, exc = 0;
    sEntries.forEach(e => {
      [e.subh, e.dhuhr, e.asr, e.maghrib, e.isha].forEach(st => {
        if (st === 'ജമാഅത്ത്') jam++;
        else if (st === 'അദാഅ്') ada++;
        else if (st === 'ഖളാഅ്') qad++;
        else if (st === 'ഇളവ്') exc++;
        else nil++;
      });
    });
    const totalScore = (jam * 5) + (totals.ada * 3) + (totals.qad * 1);
    tableData.push({
      roll: s.rollNo || (idx + 1),
      adm: s.adm,
      name: s.name,
      cls: s.class,
      gender: s.gender,
      days: sEntries.length,
      jam, ada, qad, nil, exc,
      totalPrayed: (jam + ada + qad),
      totalScore
    });
  });
  return { cls, repType, month, tableData };
}

function viewReportOnScreen(source) {
  const data = getProcessedReportData(source);
  if (!data) return;
  let boxId = '', tbodyId = '', titleId = '';
  if (source === 'teacher') {
    boxId = 'tMonthlyViewBox'; tbodyId = 'tMonthlyTableBody'; titleId = 'tRepSummaryTitle';
  } else if (source === 'sadr') {
    boxId = 'sadrMonthlyViewBox'; tbodyId = 'sadrMonthlyTableBody'; titleId = 'sadrRepSummaryTitle';
  } else {
    boxId = 'admMonthlyViewBox'; tbodyId = 'admMonthlyTableBody'; titleId = 'admRepSummaryTitle';
  }

  const titleText = data.repType === 'overall' ? `All-Time Cumulative Summary (Class: ${data.cls})` : `Monthly Summary - Month: ${data.month} (Class: ${data.cls})`;
  document.getElementById(titleId).innerText = titleText;
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '';
  data.tableData.forEach(r => {
    tbody.innerHTML += `
      <tr>
        ${source !== 'teacher' ? `<td>Class ${r.cls}</td>` : ''}
        <td>${r.roll}</td>
        <td><b>${r.adm}</b></td>
        <td style="text-align:left;">${r.name}</td>
        <td>${r.days}</td>
        <td>${r.jam}</td>
        <td>${r.ada}</td>
        <td>${r.qad}</td>
        <td>${r.nil}</td>
        <td><b>${r.totalPrayed}</b></td>
        <td style="font-weight:bold; color:var(--primary);">${r.totalScore}</td>
      </tr>
    `;
  });
  document.getElementById(boxId).style.display = 'block';
}

function translateStatusToText(st) {
  if (!st) return 'Illla';
  if (st === 'ജമാഅത്ത്') return 'Jamaath';
  if (st === 'അദാഅ്') return 'Adaa';
  if (st === 'ഖളാഅ്') return 'Qadaa';
  if (st === 'ഇളവ്') return 'Ilav';
  return 'Nill';
}

function downloadReportPDF(source) {
  const data = getProcessedReportData(source);
  if (!data) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(13);
  doc.text("MALHARUL ULOOM MADRASA KALLOOR-KOOTHALI", 14, 15);
  const subTitle = data.repType === 'overall' ? `Prayer Performance Report - Class: ${data.cls} | All-Time Cumulative Total` : `Prayer Performance Report - Class: ${data.cls} | Month: ${data.month}`;
  doc.setFontSize(10);
  doc.text(subTitle, 14, 22);
  const rows = data.tableData.map(r => [
    r.roll, r.adm, r.name, `Cls ${r.cls}`, r.days, r.jam, r.ada, r.qad, r.nil, r.exc, r.totalPrayed, r.totalScore
  ]);
  doc.autoTable({
    startY: 26,
    head: [['Roll', 'Adm', 'Name', 'Class', 'Days', 'Jamaath(5)', 'Adaa(3)', 'Qadaa(1)', 'Nill', 'Ilav', 'Total', 'Score']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [4, 120, 87] },
    styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
    columnStyles: { 2: { halign: 'left' } }
  });
  const fileName = data.repType === 'overall' ? `MUM_Report_AllTime_Class_${data.cls}.pdf` : `MUM_Report_${data.cls}_${data.month}.pdf`;
  doc.save(fileName);
}

function downloadDailyPDF(source) {
  let cls, date;
  if (source === 'teacher') {
    cls = document.getElementById('tDailyClass').value;
    date = document.getElementById('tDailyDate').value;
  } else if (source === 'sadr') {
    cls = document.getElementById('sadrDailyClass').value;
    date = document.getElementById('sadrDailyDate').value;
  } else {
    cls = document.getElementById('admDailyClass').value;
    date = document.getElementById('admDailyDate').value;
  }
  if (!date) return alert("Select Date!");
  let students = dbStudents;
  if (cls !== 'ALL') students = students.filter(s => s.class === cls);
  students = sortStudentsBoyFirst(students);
  const dayPrayers = dbPrayers.filter(p => p.date === date);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(13);
  doc.text("MALHARUL ULOOM MADRASA KALLOOR-KOOTHALI", 14, 15);
  doc.setFontSize(10);
  doc.text(`Daily Prayer Attendance - Class: ${cls} | Date: ${date}`, 14, 22);
  const rows = students.map((s, idx) => {
    const rec = dayPrayers.find(p => p.studentId === s.id);
    return [
      s.rollNo || (idx + 1),
      s.adm,
      `${s.name} (${s.gender === 'Female' ? 'F' : 'M'})`,
      `Class ${s.class}`,
      translateStatusToText(rec?.subh),
      translateStatusToText(rec?.dhuhr),
      translateStatusToText(rec?.asr),
      translateStatusToText(rec?.maghrib),
      translateStatusToText(rec?.isha)
    ];
  });
  doc.autoTable({
    startY: 26,
    head: [['Roll', 'Adm', 'Name', 'Class', 'Subh', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [4, 120, 87] },
    styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
    columnStyles: { 2: { halign: 'left' } }
  });
  doc.save(`MUM_Daily_Report_${cls}_${date}.pdf`);
}

function printReportData(source) {
  const data = getProcessedReportData(source);
  if (!data) return;
  let rowsHtml = '';
  data.tableData.forEach(r => {
    rowsHtml += `
      <tr>
        <td>${r.roll}</td><td><b>${r.adm}</b></td><td style="text-align:left;">${r.name}</td>
        <td>Class ${r.cls}</td><td>${r.days}</td><td>${r.jam}</td><td>${r.ada}</td><td>${r.qad}</td>
        <td>${r.nil}</td><td>${r.exc}</td><td><b>${r.totalPrayed}</b></td>
        <td style="font-weight:bold; color:#047857;">${r.totalScore}</td>
      </tr>
    `;
  });
  const printTitle = data.repType === 'overall' ? 'All-Time Cumulative Report' : `Monthly Report (${data.month})`;
  const printWin = window.open('', '', 'width=900,height=700');
  printWin.document.write(`
    <html><head><title>MUM Report - ${printTitle}</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 20px; color: #111; }
      .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #047857; padding-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
      th, td { border: 1px solid #cbd5e1; padding: 6px 4px; text-align: center; }
      th { background: #f1f5f9; }
      @media print { .no-print { display: none; } }
    </style></head><body>
      <div class="no-print" style="margin-bottom: 16px;"><button onclick="window.print()" style="background:#047857; color:#fff; border:none; padding:10px 18px; border-radius:6px; cursor:pointer;">Print / Save PDF</button></div>
      <div class="header"><h2>MALHARUL ULOOM MADRASA KALLOOR-KOOTHALI</h2><p>${printTitle} | Class: ${data.cls}</p></div>
      <table><thead><tr><th>Roll</th><th>Adm</th><th>Name</th><th>Class</th><th>Days</th><th>Jam(5)</th><th>Ada(3)</th><th>Qad(1)</th><th>Nil</th><th>Exc</th><th>Total</th><th>Score</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    </body></html>
  `);
  printWin.document.close();
}

// --- BIOMETRIC AUTH ---
async function handleBiometricLogin() {
  if (!window.PublicKeyCredential) {
    return alert("Fingerprint/Biometric is not supported on this browser!");
  }
  const role = document.getElementById('loginRole').value;
  let userIdKey = '', userName = '', currentPass = '';
  if (role === 'admin') {
    userIdKey = 'mum_admin_user';
    userName = 'റാഷിദലി ഫൈസി';
    currentPass = adminPassword;
  } else if (role === 'sadr') {
    userIdKey = 'mum_sadr_user';
    userName = 'ശാഫി ദാരിമി';
    currentPass = sadrPassword;
  } else if (role === 'coadmin') {
    userIdKey = 'mum_coadmin_user';
    userName = coAdminConfig.name || 'Co-Admin';
    currentPass = coAdminConfig.pass || 'coadmin123';
  } else {
    const tId = document.getElementById('loginTeacherSelect').value;
    if (!tId) return alert("Please select your Teacher name first!");
    const t = dbTeachers.find(x => x.id === tId);
    if (!t) return alert("Teacher not found!");
    userIdKey = 'mum_bio_cred_' + t.id;
    userName = t.name;
    currentPass = t.pass;
  }
  const storedCredentialId = localStorage.getItem(userIdKey);
  if (!storedCredentialId) {
    const pass = prompt(`ഹലോ ${userName}, ഈ ഫോണിൽ ഫിംഗർപ്രിന്റ് സെറ്റ് ചെയ്യാൻ നിങ്ങളുടെ പാസ്‌വേഡ് നൽകുക:`);
    if (pass !== currentPass && pass !== adminPassword) return alert("പാസ്‌വേഡ് തെറ്റാണ്! ഫിംഗർപ്രിന്റ് രജിസ്റ്റർ ചെയ്യാൻ സാധിച്ചില്ല.");
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const userId = new Uint8Array(16);
      window.crypto.getRandomValues(userId);
      const newCred = await navigator.credentials.create({
        publicKey: {
          challenge: challenge,
          rp: { name: "MUM Tracker" },
          user: { id: userId, name: userName, displayName: userName },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
          timeout: 60000
        }
      });
      if (newCred) {
        localStorage.setItem(userIdKey, btoa(String.fromCharCode(...new Uint8Array(newCred.rawId))));
        alert("ഫിംഗർപ്രിന്റ് രജിസ്റ്റർ ചെയ്തു! ഇനി മുതൽ വിരലടയാളം വെച്ച് ലോഗിൻ ചെയ്യാം.");
        if (role === 'admin') loginAsAdmin();
        else if (role === 'sadr') loginAsSadr();
        else if (role === 'coadmin') loginAsCoAdmin();
        else loginAsTeacher(dbTeachers.find(x => x.id === document.getElementById('loginTeacherSelect').value));
      }
    } catch (err) {
      alert("ഫിംഗർപ്രിന്റ് രജിസ്ട്രേഷൻ റദ്ദാക്കി: " + err.message);
    }
  } else {
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const rawId = Uint8Array.from(atob(storedCredentialId), c => c.charCodeAt(0));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: challenge,
          allowCredentials: [{ type: 'public-key', id: rawId, transports: ['internal'] }],
          userVerification: "required",
          timeout: 60000
        }
      });
      if (assertion) {
        if (role === 'admin') loginAsAdmin();
        else if (role === 'sadr') loginAsSadr();
        else if (role === 'coadmin') loginAsCoAdmin();
        else loginAsTeacher(dbTeachers.find(x => x.id === document.getElementById('loginTeacherSelect').value));
      }
    } catch (err) {
      alert("വിരലടയാളം തിരിച്ചറിഞ്ഞില്ല! പാസ്‌വേഡ് ഉപയോഗിച്ച് ലോഗിൻ ചെയ്യുക.");
    }
  }
}

// --- LOGIN & AUTH ---
function openLoginModal() {
  loadTeacherSelect();
  toggleLoginInputs();
  document.getElementById('loginPass').value = '';
  document.getElementById('loginModal').style.display = 'flex';
  pushNavState();
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function toggleLoginInputs() {
  const role = document.getElementById('loginRole').value;
  document.getElementById('tSelectDiv').style.display = role === 'teacher' ? 'block' : 'none';
}

function loadTeacherSelect() {
  const s = document.getElementById('loginTeacherSelect');
  if (!s) return;
  s.innerHTML = '<option value="">-- Select Teacher --</option>';
  dbTeachers.forEach(t => {
    const clsList = Array.isArray(t.classes) ? t.classes.join(', ') : (t.class || '');
    s.innerHTML += `<option value="${t.id}">${t.name} (Class: ${clsList})</option>`;
  });
}

function toggleAuthAction() {
  if (currentUser) {
    const isPublicVisible = document.getElementById('publicView')?.style.display !== 'none';
    if (isPublicVisible) {
      if (currentUser.role === 'admin') loginAsAdmin(false);
      else if (currentUser.role === 'sadr') loginAsSadr(false);
      else if (currentUser.role === 'coadmin') loginAsCoAdmin(false);
      else loginAsTeacher(currentUser.data, false);
    } else {
      navigateHome();
    }
  } else {
    openLoginModal();
  }
}

async function handleLogin() {
  const role = document.getElementById('loginRole').value;
  const pass = document.getElementById('loginPass').value.trim();
  if (role === 'admin') {
    if (pass === adminPassword || pass === "mumadminpass") {
      await db.collection("settings").doc("config").update({
        adminActiveDeviceId: currentDeviceId,
        adminLastLogin: new Date().toLocaleString()
      });
      loginAsAdmin();
    } else {
      alert("Admin password is wrong!");
    }
  } else if (role === 'sadr') {
    if (pass === sadrPassword || pass === adminPassword) {
      await db.collection("settings").doc("config").update({
        sadrActiveDeviceId: currentDeviceId,
        sadrLastLogin: new Date().toLocaleString()
      });
      loginAsSadr();
    } else {
      alert("സദർ മുഅല്ലിം പാസ്‌വേഡ് തെറ്റാണ്!");
    }
  } else if (role === 'coadmin') {
    if (pass === coAdminConfig.pass || pass === adminPassword) {
      loginAsCoAdmin();
    } else {
      alert("കോ-അഡ്മിൻ പാസ്‌വേഡ് തെറ്റാണ്!");
    }
  } else {
    const tId = document.getElementById('loginTeacherSelect').value;
    if (!tId) return alert("Please select a Teacher!");
    const t = dbTeachers.find(x => x.id === tId);
    if (t && (t.pass === pass || pass === adminPassword)) {
      await db.collection("teachers").doc(t.id).update({
        activeSessionDeviceId: currentDeviceId,
        lastLogin: new Date().toLocaleString()
      });
      loginAsTeacher(t);
    } else {
      alert("Incorrect Password!");
    }
  }
}

function loginAsAdmin(persist = true) {
  currentUser = { role: 'admin' };
  document.getElementById('publicView').style.display = 'none';
  document.getElementById('teacherView').style.display = 'none';
  document.getElementById('sadrView').style.display = 'none';
  document.getElementById('adminView').style.display = 'block';
  document.getElementById('adminPortalTitleDisplay').innerText = "RASHIDALI FAIZY (അഡ്മിൻ)";
  
  // മൊത്തം ഒന്നിച്ചു കാണാതെ ആദ്യ ടാബ് മാത്രം ആക്ടീവ് ആക്കുന്നു
  const defaultTabBtn = document.querySelector('#adminView .portal-tab-pill');
  if (defaultTabBtn) {
    defaultTabBtn.click();
  } else {
    ['admSecLock', 'admSecDaily', 'admSecStudents', 'admSecTeachers', 'admSecReports'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'block';
    });
  }

  updateTopNavBtn();
  renderAdminTeachers();
  renderAdminStudentList();
  renderDailyAdminView();
  renderAdminVideoList();
  loadCoAdminSettingsUI();
  closeModal('loginModal');
}

function loginAsCoAdmin(persist = true) {
  currentUser = { role: 'coadmin' };
  document.getElementById('publicView').style.display = 'none';
  document.getElementById('teacherView').style.display = 'none';
  document.getElementById('sadrView').style.display = 'none';
  document.getElementById('adminView').style.display = 'block';
  document.getElementById('adminPortalTitleDisplay').innerText = `${coAdminConfig.name || 'Co-Admin'} (Portal Access)`;
  const p = coAdminConfig.permissions || {};
  document.getElementById('admSecLock').style.display = p.locks ? 'block' : 'none';
  document.getElementById('admSecDaily').style.display = p.daily ? 'block' : 'none';
  document.getElementById('admSecStudents').style.display = p.students ? 'block' : 'none';
  document.getElementById('admSecTeachers').style.display = p.teachers ? 'block' : 'none';
  document.getElementById('admSecReports').style.display = p.reports ? 'block' : 'none';
  document.getElementById('admSecPhotos').style.display = p.media ? 'block' : 'none';
  document.getElementById('admSecVideos').style.display = p.media ? 'block' : 'none';
  document.getElementById('admSecPass').style.display = 'none';
  document.getElementById('admSecSadrPass').style.display = 'none';
  document.getElementById('admSecCoAdmin').style.display = 'none';
  updateTopNavBtn();
  renderAdminTeachers();
  renderAdminStudentList();
  renderDailyAdminView();
  renderAdminVideoList();
  closeModal('loginModal');
}

function loginAsSadr(persist = true) {
  currentUser = { role: 'sadr' };
  document.getElementById('publicView').style.display = 'none';
  document.getElementById('adminView').style.display = 'none';
  document.getElementById('teacherView').style.display = 'none';
  document.getElementById('sadrView').style.display = 'block';
  updateTopNavBtn();
  renderDailySadrView();
  renderSadrStudentList();
  closeModal('loginModal');
}

function loginAsTeacher(t, persist = true) {
  currentUser = { role: 'teacher', data: t };
  if (persist) localStorage.setItem('mum_logged_session', JSON.stringify(currentUser));
  const classesArr = Array.isArray(t.classes) ? t.classes : (t.class ? [t.class] : ['1']);
  document.getElementById('publicView').style.display = 'none';
  document.getElementById('adminView').style.display = 'none';
  document.getElementById('sadrView').style.display = 'none';
  document.getElementById('teacherView').style.display = 'block';
  document.getElementById('teacherNameDisplay').innerText = t.name;
  document.getElementById('tClassListDisplay').innerText = `Assigned Classes: ${classesArr.join(', ')}`;
  updateTopNavBtn();
  const profileImg = document.getElementById('tProfileImg');
  if (t.photo) {
    profileImg.src = t.photo;
    profileImg.style.display = 'inline-block';
  } else {
    profileImg.style.display = 'none';
  }
  const clsOpts = classesArr.map(c => `<option value="${c}">Class ${c}</option>`).join('');
  document.getElementById('tRegClass').innerHTML = clsOpts;
  document.getElementById('tFilterClass').innerHTML = clsOpts;
  document.getElementById('tRepClass').innerHTML = clsOpts;
  document.getElementById('tDailyClass').innerHTML = clsOpts;
  document.getElementById('tLockClassSelect').innerHTML = clsOpts;
  updateClassLockUI();
  renderTeacherStudentList();
  renderDailyTeacherView();
  renderSessionManagementUI('teacher', t);

  // അധ്യാപകൻ ലോഗിൻ ചെയ്യുമ്പോൾ ആദ്യ സെക്ഷൻ മാത്രം കാണിക്കുക
  const defaultTabBtn = document.querySelector('#teacherView .portal-tab-pill');
  if (defaultTabBtn) defaultTabBtn.click();

  closeModal('loginModal');
}

function logout() {
  currentUser = null;
  localStorage.removeItem('mum_logged_session');
  navigateHome();
}

// --- TEACHER CONTACT MODAL ---
function openTeachersContactModal() {
  const listDiv = document.getElementById('teachersContactList');
  if (!listDiv) return;
  listDiv.innerHTML = `
    <div class="teacher-contact-card" style="border-left: 3.5px solid #d97706; background:#fffbeb;">
      <div class="avatar-lg" style="display:flex; align-items:center; justify-content:center; font-size:22px; background:#fef3c7;">👳‍♂️</div>
      <div style="flex:1;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <b style="font-size:13.5px; color:#92400e;">SHAFI DARIMI</b>
          <span style="background:#d97706; color:#fff; font-size:9.5px; font-weight:800; padding:2px 6px; border-radius:4px;">സദർ മുഅല്ലിം</span>
        </div>
        <div style="font-size:11.5px; font-weight:700; color:#0f172a; margin-top:2px;">9605169230</div>
        <div style="display:flex; gap:6px; margin-top:4px;">
          <a href="tel:9605169230" class="btn-action" style="text-decoration:none; padding:2px 6px; font-size:10px;">📞 Call</a>
          <a href="https://wa.me/919605169230" target="_blank" class="btn-wa" style="padding:2px 6px; font-size:10px;">💬 WhatsApp</a>
        </div>
      </div>
    </div>

    <div class="teacher-contact-card" style="border-left: 3.5px solid #047857; background:#ecfdf5;">
      <div class="avatar-lg" style="display:flex; align-items:center; justify-content:center; font-size:22px; background:#d1fae5;">💻</div>
      <div style="flex:1;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <b style="font-size:13.5px; color:#065f46;">RASHIDALI FAIZY</b>
          <span style="background:#047857; color:#fff; font-size:9.5px; font-weight:800; padding:2px 6px; border-radius:4px;">അഡ്മിൻ</span>
        </div>
        <div style="font-size:11.5px; font-weight:700; color:#0f172a; margin-top:2px;">6238403492</div>
        <div style="display:flex; gap:6px; margin-top:4px;">
          <a href="tel:6238403492" class="btn-action" style="text-decoration:none; padding:2px 6px; font-size:10px;">📞 Call</a>
          <a href="https://wa.me/916238403492" target="_blank" class="btn-wa" style="padding:2px 6px; font-size:10px;">💬 WhatsApp</a>
        </div>
      </div>
    </div>
  `;

  if (dbTeachers.length > 0) {
    dbTeachers.forEach(t => {
      const clsList = Array.isArray(t.classes) ? t.classes.join(', ') : (t.class || '-');
      let phone = (t.phone || '').trim().replace(/[^0-9]/g, '');
      let waPhone = phone.length === 10 ? '91' + phone : phone;
      listDiv.innerHTML += `
        <div class="teacher-contact-card">
          <img src="${t.photo || defaultAvatar}" class="avatar-lg">
          <div style="flex:1;">
            <div style="font-weight:bold; font-size:13px; color:var(--primary);">${t.name}</div>
            <div style="font-size:11px; color:var(--text-muted);">ക്ലാസുകൾ: <b>${clsList}</b></div>
            <div style="font-size:11.5px; font-weight:700;">${t.phone || 'No Phone'}</div>
            <div style="display:flex; gap:6px; margin-top:4px;">
              ${phone ? `<a href="tel:${phone}" class="btn-action" style="text-decoration:none; padding:2px 6px; font-size:10px;">📞 Call</a>` : ''}
              ${phone ? `<a href="https://wa.me/${waPhone}" target="_blank" class="btn-wa" style="padding:2px 6px; font-size:10px;">💬 WhatsApp</a>` : ''}
            </div>
          </div>
        </div>
      `;
    });
  }
  document.getElementById('teachersContactModal').style.display = 'flex';
  pushNavState();
}
