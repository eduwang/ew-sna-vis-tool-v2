/**
 * 인증 관련 로직
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
  
  // 인증 상태 변경 감지 (구독 시 즉시 현재 상태를 콜백으로 호출)
  const unsubscribe = onAuthStateChange((user) => {
    console.log('인증 상태 변경:', user ? `로그인됨 (${user.email})` : '로그아웃됨');
    updateUI(user);
  });
  
  // 추가 안전장치: 약간의 지연 후 다시 확인 (배포 환경에서 네트워크 지연 대비)
  setTimeout(() => {
    const currentUser = getCurrentUser();
    if (currentUser) {
      console.log('지연 확인: 사용자 로그인 상태 확인됨');
      updateUI(currentUser);
    }
  }, 100);
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
 * 관리자 UID 확인
 * @param {string} userId - 사용자 UID
 * @returns {boolean} 관리자 여부
 */
function isAdmin(userId) {
  if (!userId) return false;
  
  // 환경변수에서 관리자 UID 리스트 가져오기 (쉼표로 구분)
  const adminUids = import.meta.env.VITE_ADMIN_UIDS;
  if (!adminUids) return false;
  
  // 쉼표로 구분된 UID 리스트를 배열로 변환하고 공백 제거
  const adminUidList = adminUids.split(',').map(uid => uid.trim());
  return adminUidList.includes(userId);
}

/**
 * UI 업데이트 (로그인 상태에 따라)
 */
function updateUI(user) {
  // DOM이 준비되지 않았으면 재시도
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => updateUI(user));
    return;
  }

  const userInfo = document.getElementById('user-info');
  const loginBtn = document.getElementById('google-login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userAvatar = userInfo?.querySelector('.user-avatar');
  const userName = userInfo?.querySelector('.user-name');

  // 각 카드 요소 가져오기
  const networkCard = document.querySelector('a[href="network-visualizer.html"]');
  const network3DCard = document.querySelector('a[href="network-visualizer-3d.html"]');
  const reportCard = document.querySelector('a[href="make-a-report.html"]');
  const aiCard = document.querySelector('a[href="analyze-with-ai.html"]');
  const adminCard = document.querySelector('a[href="admin.html"]');
  
  // 디버깅: 요소를 찾지 못한 경우 로그
  if (!reportCard) {
    console.warn('보고서 카드를 찾을 수 없습니다.');
  }
  if (!adminCard) {
    console.warn('관리자 카드를 찾을 수 없습니다.');
  }

  if (user) {
    // 로그인 상태
    const isUserAdmin = isAdmin(user.uid);
    
    // 기본 카드 (항상 표시)
    if (networkCard) networkCard.style.display = 'block';
    if (network3DCard) network3DCard.style.display = 'block';
    
    // 로그인 사용자 카드
    if (reportCard) reportCard.style.display = 'block';
    // AI 분석 카드는 준비 중이므로 항상 숨김
    if (aiCard) aiCard.style.display = 'none';
    
    // 관리자 카드 (관리자만 표시)
    if (adminCard) {
      adminCard.style.display = isUserAdmin ? 'block' : 'none';
    }

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
  } else {
    // 로그아웃 상태 - 기본 카드만 표시
    if (networkCard) networkCard.style.display = 'block';
    if (network3DCard) network3DCard.style.display = 'block';
    if (reportCard) reportCard.style.display = 'none';
    if (aiCard) aiCard.style.display = 'none';
    if (adminCard) adminCard.style.display = 'none';

    if (userInfo) userInfo.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
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

