/**
 * network-visualizer.html용 인증 관련 로직
 */

import { initializeFirebase, signInWithGoogle, signOutUser, getCurrentUser, onAuthStateChange } from '../firebaseConfig.js';
import Swal from 'sweetalert2';

let authInitialized = false;

/**
 * Firebase 인증 초기화
 */
export function initAuth() {
  if (authInitialized) return;
  
  const firebase = initializeFirebase();
  if (!firebase) {
    console.warn('Firebase 초기화 실패. 환경변수를 확인해주세요.');
    return;
  }
  
  authInitialized = true;
  
  // 인증 상태 변경 감지
  onAuthStateChange((user) => {
    updateUI(user);
  });
}

/**
 * Google 로그인
 */
export async function handleGoogleLogin() {
  try {
    const firebase = initializeFirebase();
    if (!firebase) {
      Swal.fire({
        title: '오류',
        text: 'Firebase가 초기화되지 않았습니다. 환경변수를 확인해주세요.',
        icon: 'error',
        confirmButtonColor: '#4A90E2'
      });
      return;
    }

    // 로그인 안내 모달 표시
    const result = await Swal.fire({
      title: 'Google로 로그인',
      html: `
        <div style="text-align: left; padding: 1rem 0;">
          <p style="margin-bottom: 1rem; color: #2C3E50; line-height: 1.6;">
            Google로 로그인하면 수집한 데이터를 저장하고 관리할 수 있습니다.
          </p>
          <ul style="margin: 0; padding-left: 1.5rem; color: #7F8C8D; line-height: 1.8;">
            <li>분석 데이터를 클라우드에 안전하게 저장</li>
            <li>언제든지 저장된 데이터에 접근 가능</li>
            <li>여러 기기에서 동일한 데이터 사용</li>
          </ul>
        </div>
      `,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Google로 로그인',
      cancelButtonText: '취소',
      confirmButtonColor: '#4A90E2',
      cancelButtonColor: '#7F8C8D',
      width: '500px'
    });

    if (!result.isConfirmed) {
      return;
    }

    // 로그인 진행
    Swal.fire({
      title: '로그인 중...',
      text: '잠시만 기다려주세요.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const user = await signInWithGoogle();
    
    Swal.fire({
      title: '로그인 성공',
      text: `${user.displayName}님, 환영합니다!`,
      icon: 'success',
      confirmButtonColor: '#4A90E2',
      timer: 2000,
      timerProgressBar: true
    });
  } catch (error) {
    console.error('로그인 오류:', error);
    Swal.fire({
      title: '로그인 실패',
      text: error.message || '로그인 중 오류가 발생했습니다.',
      icon: 'error',
      confirmButtonColor: '#4A90E2'
    });
  }
}

/**
 * 로그아웃
 */
export async function handleLogout() {
  try {
    await signOutUser();
    Swal.fire({
      title: '로그아웃 완료',
      text: '로그아웃되었습니다.',
      icon: 'success',
      confirmButtonColor: '#4A90E2',
      timer: 1500,
      timerProgressBar: true
    });
  } catch (error) {
    console.error('로그아웃 오류:', error);
    Swal.fire({
      title: '로그아웃 실패',
      text: error.message || '로그아웃 중 오류가 발생했습니다.',
      icon: 'error',
      confirmButtonColor: '#4A90E2'
    });
  }
}

/**
 * UI 업데이트 (로그인 상태에 따라)
 */
function updateUI(user) {
  const userInfo = document.getElementById('user-info');
  const loginBtn = document.getElementById('google-login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const saveBtn = document.getElementById('save-data-btn');
  const loadBtn = document.getElementById('load-data-btn');
  const userAvatar = userInfo?.querySelector('.user-avatar');
  const userName = userInfo?.querySelector('.user-name');

  if (user) {
    // 로그인 상태
    // 사용자 정보 표시
    if (userInfo) {
      userInfo.style.display = 'flex';
      if (userAvatar) {
        if (user.photoURL) {
          userAvatar.src = user.photoURL;
          userAvatar.style.display = 'block';
        } else {
          userAvatar.style.display = 'none';
        }
      }
      if (userName) {
        userName.textContent = user.displayName || user.email;
      }
    }

    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'block';
    if (saveBtn) saveBtn.style.display = 'inline-block';
    if (loadBtn) loadBtn.style.display = 'inline-block';
  } else {
    // 로그아웃 상태
    if (userInfo) userInfo.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'none';
    if (loadBtn) loadBtn.style.display = 'none';
  }
}

/**
 * 현재 사용자 가져오기
 */
export function getCurrentAuthUser() {
  return getCurrentUser();
}

/**
 * 관리자 UID 확인
 * @param {string} userId - 사용자 UID
 * @returns {boolean} 관리자 여부
 */
export function isAdmin(userId) {
  if (!userId) return false;
  
  // 환경변수에서 관리자 UID 리스트 가져오기 (쉼표로 구분)
  const adminUids = import.meta.env.VITE_ADMIN_UIDS;
  if (!adminUids) return false;
  
  // 쉼표로 구분된 UID 리스트를 배열로 변환하고 공백 제거
  const adminUidList = adminUids.split(',').map(uid => uid.trim());
  return adminUidList.includes(userId);
}

/**
 * 초기화
 */
export function init() {
  initAuth();
  
  // 로그인 버튼 이벤트
  const loginBtn = document.getElementById('google-login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', handleGoogleLogin);
  }

  // 로그아웃 버튼 이벤트
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
}




