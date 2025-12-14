/**
 * Firebase 설정 파일
 * 환경변수에서 Firebase 설정을 불러옵니다.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDoc, doc, query, where, getDocs, orderBy, limit, deleteDoc, updateDoc, setDoc } from 'firebase/firestore';

// 환경변수에서 Firebase 설정 가져오기
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Firebase 초기화
let app = null;
let auth = null;
let db = null;

/**
 * Firebase 초기화
 */
export function initializeFirebase() {
  try {
    // 환경변수 확인
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'your-api-key-here') {
      console.warn('Firebase 환경변수가 설정되지 않았습니다. .env 파일을 확인해주세요.');
      return null;
    }

    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    
    console.log('Firebase 초기화 완료');
    return { app, auth, db };
  } catch (error) {
    console.error('Firebase 초기화 오류:', error);
    return null;
  }
}

/**
 * Google 로그인
 */
export async function signInWithGoogle() {
  if (!auth) {
    throw new Error('Firebase가 초기화되지 않았습니다.');
  }

  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error('Google 로그인 오류:', error);
    throw error;
  }
}

/**
 * 로그아웃
 */
export async function signOutUser() {
  if (!auth) {
    throw new Error('Firebase가 초기화되지 않았습니다.');
  }

  try {
    await signOut(auth);
  } catch (error) {
    console.error('로그아웃 오류:', error);
    throw error;
  }
}

/**
 * 현재 사용자 가져오기
 */
export function getCurrentUser() {
  if (!auth) {
    return null;
  }
  return auth.currentUser;
}

/**
 * 인증 상태 변경 감지
 */
export function onAuthStateChange(callback) {
  if (!auth) {
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

/**
 * Firebase Firestore에 데이터 저장
 * @param {Array} data - 저장할 데이터 (2D 배열)
 * @param {string} userId - 사용자 ID
 * @param {string} displayName - 사용자 표시 이름
 * @param {string} email - 사용자 이메일
 * @param {string} title - 제목
 * @param {string} author - 작성자
 * @param {string} description - 설명
 * @returns {Promise<string>} 저장된 문서 ID
 */
export async function saveDataToFirebase(data, userId, displayName, email, title, author, description) {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  if (!userId) {
    throw new Error('사용자 ID가 필요합니다.');
  }

  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; // HH:MM
    
    // 중첩 배열을 JSON 문자열로 변환 (Firestore는 중첩 배열을 직접 저장할 수 없음)
    const dataString = JSON.stringify(data);
    
    const docRef = await addDoc(collection(db, 'networkData'), {
      data: dataString, // JSON 문자열로 저장
      userId: userId,
      displayName: displayName || '',
      email: email || '',
      title: title || '',
      author: author || '',
      description: description || '',
      date: dateStr,
      time: timeStr,
      timestamp: now,
      createdAt: now.toISOString()
    });
    
    console.log('데이터가 저장되었습니다. 문서 ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Firestore 저장 오류:', error);
    throw error;
  }
}

/**
 * Firebase Firestore에서 데이터 불러오기
 * @param {string} documentId - 문서 ID
 * @returns {Promise<Array>} 불러온 데이터
 */
export async function loadDataFromFirebase(documentId) {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  try {
    const docRef = doc(db, 'networkData', documentId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const docData = docSnap.data();
      // JSON 문자열로 저장된 데이터를 파싱
      if (typeof docData.data === 'string') {
        return JSON.parse(docData.data);
      } else {
        // 기존 형식 (직접 배열) 지원
        return docData.data;
      }
    } else {
      throw new Error('문서를 찾을 수 없습니다.');
    }
  } catch (error) {
    console.error('Firestore 불러오기 오류:', error);
    throw error;
  }
}

/**
 * 사용자의 저장된 데이터 목록 가져오기
 * @param {string} userId - 사용자 ID
 * @param {number} maxResults - 최대 결과 수
 * @returns {Promise<Array>} 데이터 목록
 */
export async function getUserDataList(userId, maxResults = 50) {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  if (!userId) {
    throw new Error('사용자 ID가 필요합니다.');
  }

  try {
    // orderBy를 제거하고 where만 사용 (인덱스 없이도 작동)
    const q = query(
      collection(db, 'networkData'),
      where('userId', '==', userId),
      limit(maxResults)
    );
    
    const querySnapshot = await getDocs(q);
    const dataList = [];
    
    querySnapshot.forEach((doc) => {
      dataList.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // 클라이언트 측에서 timestamp 기준으로 정렬 (최신순)
    dataList.sort((a, b) => {
      const timeA = a.timestamp?.toMillis?.() || new Date(a.createdAt || 0).getTime();
      const timeB = b.timestamp?.toMillis?.() || new Date(b.createdAt || 0).getTime();
      return timeB - timeA; // 내림차순 (최신순)
    });
    
    return dataList;
  } catch (error) {
    console.error('데이터 목록 불러오기 오류:', error);
    throw error;
  }
}

/**
 * Firestore에서 데이터 삭제
 * @param {string} documentId - 문서 ID
 * @returns {Promise<void>}
 */
export async function deleteDataFromFirebase(documentId) {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  if (!documentId) {
    throw new Error('문서 ID가 필요합니다.');
  }

  try {
    await deleteDoc(doc(db, 'networkData', documentId));
    console.log('데이터가 삭제되었습니다. 문서 ID:', documentId);
  } catch (error) {
    console.error('Firestore 삭제 오류:', error);
    throw error;
  }
}

/**
 * 보고서를 Firestore에 저장
 * @param {Object} reportData - 보고서 데이터
 * @param {string} userId - 사용자 ID
 * @returns {Promise<string>} 저장된 문서 ID
 */
export async function saveReportToFirebase(reportData, userId) {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  if (!userId) {
    throw new Error('사용자 ID가 필요합니다.');
  }

  try {
    const now = new Date();
    const docRef = await addDoc(collection(db, 'reports'), {
      ...reportData,
      userId: userId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
    
    console.log('보고서가 저장되었습니다. 문서 ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('보고서 저장 오류:', error);
    throw error;
  }
}

/**
 * 보고서를 Firestore에서 업데이트
 * @param {string} documentId - 문서 ID
 * @param {Object} reportData - 업데이트할 보고서 데이터
 * @returns {Promise<void>}
 */
export async function updateReportInFirebase(documentId, reportData) {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  if (!documentId) {
    throw new Error('문서 ID가 필요합니다.');
  }

  try {
    const docRef = doc(db, 'reports', documentId);
    await updateDoc(docRef, {
      ...reportData,
      updatedAt: new Date().toISOString()
    });
    
    console.log('보고서가 업데이트되었습니다. 문서 ID:', documentId);
  } catch (error) {
    console.error('보고서 업데이트 오류:', error);
    throw error;
  }
}

/**
 * 사용자의 저장된 보고서 목록 가져오기
 * @param {string} userId - 사용자 ID
 * @param {number} maxResults - 최대 결과 수
 * @returns {Promise<Array>} 보고서 목록
 */
export async function getUserReportsList(userId, maxResults = 50) {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  if (!userId) {
    throw new Error('사용자 ID가 필요합니다.');
  }

  try {
    const q = query(
      collection(db, 'reports'),
      where('userId', '==', userId),
      limit(maxResults)
    );
    
    const querySnapshot = await getDocs(q);
    const reportsList = [];
    
    querySnapshot.forEach((doc) => {
      reportsList.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // updatedAt 기준으로 정렬 (최신순)
    reportsList.sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA; // 내림차순 (최신순)
    });
    
    return reportsList;
  } catch (error) {
    console.error('보고서 목록 불러오기 오류:', error);
    throw error;
  }
}

/**
 * Firestore에서 보고서 불러오기
 * @param {string} documentId - 문서 ID
 * @returns {Promise<Object>} 보고서 데이터
 */
export async function loadReportFromFirebase(documentId) {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  try {
    const docRef = doc(db, 'reports', documentId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    } else {
      throw new Error('보고서를 찾을 수 없습니다.');
    }
  } catch (error) {
    console.error('보고서 불러오기 오류:', error);
    throw error;
  }
}

/**
 * 모든 데이터 목록 가져오기 (관리자용)
 * @param {number} maxResults - 최대 결과 수
 * @returns {Promise<Array>} 데이터 목록
 */
export async function getAllDataList(maxResults = 1000) {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  try {
    const q = query(
      collection(db, 'networkData'),
      orderBy('createdAt', 'desc'),
      limit(maxResults)
    );
    
    const querySnapshot = await getDocs(q);
    const dataList = [];
    
    querySnapshot.forEach((doc) => {
      dataList.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return dataList;
  } catch (error) {
    console.error('데이터 목록 불러오기 오류:', error);
    throw error;
  }
}

/**
 * 모든 보고서 목록 가져오기 (관리자용)
 * @param {number} maxResults - 최대 결과 수
 * @returns {Promise<Array>} 보고서 목록
 */
export async function getAllReportsList(maxResults = 1000) {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  try {
    const q = query(
      collection(db, 'reports'),
      orderBy('updatedAt', 'desc'),
      limit(maxResults)
    );
    
    const querySnapshot = await getDocs(q);
    const reportsList = [];
    
    querySnapshot.forEach((doc) => {
      reportsList.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return reportsList;
  } catch (error) {
    console.error('보고서 목록 불러오기 오류:', error);
    throw error;
  }
}

/**
 * 사용자 메모 저장 (관리자용)
 * @param {string} userId - 사용자 ID
 * @param {string} memo - 메모 내용
 * @returns {Promise<void>}
 */
export async function saveUserMemo(userId, memo) {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  try {
    const userMemoRef = doc(db, 'userMemos', userId);
    const docSnap = await getDoc(userMemoRef);
    
    const now = new Date().toISOString();
    
    if (docSnap.exists()) {
      // 문서가 존재하면 업데이트
      await updateDoc(userMemoRef, {
        memo: memo,
        updatedAt: now
      });
    } else {
      // 문서가 없으면 생성
      await setDoc(userMemoRef, {
        userId: userId,
        memo: memo,
        createdAt: now,
        updatedAt: now
      });
    }
    
    console.log('사용자 메모가 저장되었습니다. 사용자 ID:', userId);
  } catch (error) {
    console.error('사용자 메모 저장 오류:', error);
    throw error;
  }
}

/**
 * 사용자 메모 불러오기 (관리자용)
 * @param {string} userId - 사용자 ID
 * @returns {Promise<string>} 메모 내용
 */
export async function getUserMemo(userId) {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  try {
    const userMemoRef = doc(db, 'userMemos', userId);
    const docSnap = await getDoc(userMemoRef);
    
    if (docSnap.exists()) {
      return docSnap.data().memo || '';
    } else {
      return '';
    }
  } catch (error) {
    console.error('사용자 메모 불러오기 오류:', error);
    return '';
  }
}

/**
 * 모든 사용자 메모 가져오기 (관리자용)
 * @returns {Promise<Object>} 사용자 ID를 키로 하는 메모 객체
 */
export async function getAllUserMemos() {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  try {
    const querySnapshot = await getDocs(collection(db, 'userMemos'));
    const memos = {};
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // 문서 ID를 userId로 사용 (userId 필드가 없을 경우)
      const userId = data.userId || doc.id;
      memos[userId] = data.memo || '';
    });
    
    return memos;
  } catch (error) {
    console.error('사용자 메모 목록 불러오기 오류:', error);
    // 권한 오류인 경우 빈 객체 반환 (보안 규칙이 아직 설정되지 않았을 수 있음)
    if (error.code === 'permission-denied' || error.message?.includes('permission')) {
      console.warn('Firestore 보안 규칙이 설정되지 않았습니다. firestore.rules 파일을 확인하고 Firebase 콘솔에서 규칙을 배포해주세요.');
      return {};
    }
    throw error;
  }
}

// 전역으로 내보내기
export { auth, db };

