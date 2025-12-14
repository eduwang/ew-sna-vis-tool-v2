/**
 * 관리자 페이지 기능
 */

import { initializeFirebase, getCurrentUser, onAuthStateChange } from '../firebaseConfig.js';
import { getAllDataList, getAllReportsList, saveUserMemo, getUserMemo, getAllUserMemos, loadDataFromFirebase } from '../firebaseConfig.js';
import { init as initAuth, isAdmin } from './networkAuth.js';
import Papa from 'papaparse';
import FileSaver from 'file-saver';
import Swal from 'sweetalert2';

let allDataList = [];
let allReportsList = [];
let allUsers = new Map(); // userId -> userInfo
let userMemos = {};

/**
 * 관리자 권한 확인
 */
function checkAdminAccess() {
  const user = getCurrentUser();
  const adminCheckMessage = document.getElementById('admin-check-message');
  const adminTabs = document.getElementById('admin-tabs');
  const container = document.querySelector('.container');
  
  if (!user) {
    // 로그인하지 않은 경우 홈으로 리다이렉트
    Swal.fire({
      title: '접근 거부',
      text: '관리자 페이지에 접근하려면 로그인이 필요합니다.',
      icon: 'warning',
      confirmButtonColor: '#4A90E2',
      confirmButtonText: '홈으로 이동'
    }).then(() => {
      window.location.href = 'index.html';
    });
    
    if (container) {
      container.style.display = 'none';
    }
    return false;
  }
  
  if (!isAdmin(user.uid)) {
    // 관리자가 아닌 경우 홈으로 리다이렉트
    Swal.fire({
      title: '접근 거부',
      text: '관리자 권한이 필요합니다.',
      icon: 'error',
      confirmButtonColor: '#4A90E2',
      confirmButtonText: '홈으로 이동'
    }).then(() => {
      window.location.href = 'index.html';
    });
    
    if (container) {
      container.style.display = 'none';
    }
    return false;
  }
  
  if (adminCheckMessage) {
    adminCheckMessage.style.display = 'none';
  }
  if (adminTabs) {
    adminTabs.style.display = 'flex';
  }
  
  return true;
}

/**
 * 사용자 목록 수집 (데이터와 보고서에서)
 */
function collectUsers() {
  allUsers.clear();
  
  // 데이터에서 사용자 수집
  allDataList.forEach(item => {
    if (item.userId) {
      if (!allUsers.has(item.userId)) {
        allUsers.set(item.userId, {
          userId: item.userId,
          displayName: item.displayName || '',
          email: item.email || '',
          dataCount: 0,
          reportCount: 0
        });
      }
      const user = allUsers.get(item.userId);
      user.dataCount++;
    }
  });
  
  // 보고서에서 사용자 수집
  allReportsList.forEach(item => {
    if (item.userId) {
      if (!allUsers.has(item.userId)) {
        allUsers.set(item.userId, {
          userId: item.userId,
          displayName: item.author || '',
          email: '',
          dataCount: 0,
          reportCount: 0
        });
      }
      const user = allUsers.get(item.userId);
      user.reportCount++;
    }
  });
}

/**
 * 사용자 명단 표시
 */
async function displayUsers() {
  const usersList = document.getElementById('users-list');
  if (!usersList) return;
  
  usersList.innerHTML = '<p class="loading-text">로딩 중...</p>';
  
  try {
    // 사용자 메모 불러오기
    userMemos = await getAllUserMemos();
    
    collectUsers();
    
    if (allUsers.size === 0) {
      usersList.innerHTML = '<p class="loading-text">사용자가 없습니다.</p>';
      return;
    }
    
    const usersArray = Array.from(allUsers.values()).sort((a, b) => {
      const nameA = a.displayName || a.email || '';
      const nameB = b.displayName || b.email || '';
      return nameA.localeCompare(nameB);
    });
    
    let html = '';
    usersArray.forEach(user => {
      const memo = userMemos[user.userId] || '';
      html += `
        <div class="user-item" data-user-id="${user.userId}">
          <div class="user-item-header">
            <div class="user-item-info">
              <div class="user-item-name">${user.displayName || user.email || '이름 없음'}</div>
              <div class="user-item-email">${user.email || '이메일 없음'}</div>
              <div class="user-item-uid">UID: ${user.userId}</div>
              <div style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--panton-text-light);">
                데이터: ${user.dataCount}개 | 보고서: ${user.reportCount}개
              </div>
            </div>
          </div>
          <div class="user-memo-section">
            <label for="memo-${user.userId}">메모</label>
            <textarea 
              id="memo-${user.userId}" 
              class="user-memo-textarea" 
              placeholder="사용자에 대한 메모를 입력하세요..."
            >${memo}</textarea>
            <div class="user-memo-actions">
              <button class="btn btn-small" onclick="saveUserMemo('${user.userId}')">저장</button>
            </div>
          </div>
        </div>
      `;
    });
    
    usersList.innerHTML = html;
  } catch (error) {
    console.error('사용자 목록 표시 오류:', error);
    usersList.innerHTML = '<p class="loading-text" style="color: #E74C3C;">사용자 목록을 불러오는 중 오류가 발생했습니다.</p>';
  }
}

/**
 * 사용자 메모 저장 (전역 함수로 등록)
 */
window.saveUserMemo = async function(userId) {
  const memoTextarea = document.getElementById(`memo-${userId}`);
  if (!memoTextarea) return;
  
  const memo = memoTextarea.value.trim();
  
  try {
    await saveUserMemo(userId, memo);
    userMemos[userId] = memo;
    
    Swal.fire({
      title: '저장 완료',
      text: '메모가 저장되었습니다.',
      icon: 'success',
      confirmButtonColor: '#4A90E2',
      timer: 1500,
      timerProgressBar: true
    });
  } catch (error) {
    console.error('메모 저장 오류:', error);
    Swal.fire({
      title: '저장 실패',
      text: error.message || '메모 저장 중 오류가 발생했습니다.',
      icon: 'error',
      confirmButtonColor: '#4A90E2'
    });
  }
};

/**
 * 저장된 데이터 목록 표시
 */
function displayDataList() {
  const dataList = document.getElementById('data-list');
  if (!dataList) {
    console.error('data-list 요소를 찾을 수 없습니다.');
    return;
  }
  
  console.log('displayDataList 호출, allDataList 길이:', allDataList.length);
  
  try {
    // 필터 적용
    const dateFilter = document.getElementById('data-date-filter')?.value || '';
    const userFilter = document.getElementById('data-user-filter')?.value || '';
    
    console.log('필터 조건 - 날짜:', dateFilter, '사용자:', userFilter);
    
    let filteredData = [...allDataList];
    
    if (dateFilter) {
      filteredData = filteredData.filter(item => {
        const itemDate = item.date || item.createdAt?.split('T')[0] || '';
        return itemDate === dateFilter;
      });
    }
    
    if (userFilter) {
      filteredData = filteredData.filter(item => item.userId === userFilter);
    }
    
    console.log('필터링 후 데이터 개수:', filteredData.length);
    
    if (filteredData.length === 0) {
      if (allDataList.length === 0) {
        dataList.innerHTML = '<p class="loading-text">저장된 데이터가 없습니다.</p>';
      } else {
        dataList.innerHTML = '<p class="loading-text">조건에 맞는 데이터가 없습니다.</p>';
      }
      return;
    }
    
    let html = '';
    filteredData.forEach(item => {
      const user = allUsers.get(item.userId);
      const userName = user ? (user.displayName || user.email || '알 수 없음') : '알 수 없음';
      const dateTime = item.date && item.time ? `${item.date} ${item.time}` : 
                      item.createdAt ? new Date(item.createdAt).toLocaleString('ko-KR') : '날짜 없음';
      
      html += `
        <div class="data-item" data-id="${item.id}" onclick="showDataDetail('${item.id}')">
          <div class="item-title">${item.title || '제목 없음'}</div>
          <div class="item-meta">
            <div class="item-meta-item">
              <strong>작성자:</strong> ${userName}
            </div>
            <div class="item-meta-item">
              <strong>작성일:</strong> ${dateTime}
            </div>
          </div>
          ${item.description ? `<div class="item-description">${item.description}</div>` : ''}
        </div>
      `;
    });
    
    dataList.innerHTML = html;
  } catch (error) {
    console.error('데이터 목록 표시 오류:', error);
    dataList.innerHTML = '<p class="loading-text" style="color: #E74C3C;">데이터 목록을 불러오는 중 오류가 발생했습니다.</p>';
  }
}

/**
 * 데이터 상세 보기
 */
window.showDataDetail = async function(dataId) {
  const modal = document.getElementById('data-detail-modal');
  const titleEl = document.getElementById('data-detail-title');
  const infoEl = document.getElementById('data-detail-info');
  const tableContainer = document.getElementById('data-detail-table-container');
  
  if (!modal || !titleEl || !infoEl || !tableContainer) return;
  
  try {
    const dataItem = allDataList.find(item => item.id === dataId);
    if (!dataItem) {
      Swal.fire({
        title: '오류',
        text: '데이터를 찾을 수 없습니다.',
        icon: 'error',
        confirmButtonColor: '#4A90E2'
      });
      return;
    }
    
    const user = allUsers.get(dataItem.userId);
    const userName = user ? (user.displayName || user.email || '알 수 없음') : '알 수 없음';
    const dateTime = dataItem.date && dataItem.time ? `${dataItem.date} ${dataItem.time}` : 
                    dataItem.createdAt ? new Date(dataItem.createdAt).toLocaleString('ko-KR') : '날짜 없음';
    
    titleEl.textContent = dataItem.title || '데이터 상세';
    infoEl.innerHTML = `
      <p><strong>제목:</strong> ${dataItem.title || '제목 없음'}</p>
      <p><strong>작성자:</strong> ${userName}</p>
      <p><strong>작성일:</strong> ${dateTime}</p>
      ${dataItem.description ? `<p><strong>설명:</strong> ${dataItem.description}</p>` : ''}
    `;
    
    // 데이터 불러오기
    const data = await loadDataFromFirebase(dataId);
    
    // 테이블 생성
    if (data && data.length > 0) {
      let tableHtml = '<table class="data-detail-table"><thead><tr>';
      
      // 헤더
      if (Array.isArray(data[0])) {
        data[0].forEach((header, index) => {
          tableHtml += `<th>${header || `열 ${index + 1}`}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';
        
        // 데이터 행
        for (let i = 1; i < data.length; i++) {
          tableHtml += '<tr>';
          data[i].forEach(cell => {
            tableHtml += `<td>${cell !== null && cell !== undefined ? cell : ''}</td>`;
          });
          tableHtml += '</tr>';
        }
      } else {
        // 객체 배열인 경우
        const headers = Object.keys(data[0]);
        headers.forEach(header => {
          tableHtml += `<th>${header}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';
        
        data.forEach(row => {
          tableHtml += '<tr>';
          headers.forEach(header => {
            tableHtml += `<td>${row[header] !== null && row[header] !== undefined ? row[header] : ''}</td>`;
          });
          tableHtml += '</tr>';
        });
      }
      
      tableHtml += '</tbody></table>';
      tableContainer.innerHTML = tableHtml;
      
      // CSV 다운로드 버튼 이벤트
      const downloadBtn = document.getElementById('download-data-csv-btn');
      if (downloadBtn) {
        downloadBtn.onclick = () => downloadDataAsCSV(data, dataItem.title || 'data');
      }
    } else {
      tableContainer.innerHTML = '<p>데이터가 없습니다.</p>';
    }
    
    modal.style.display = 'flex';
  } catch (error) {
    console.error('데이터 상세 보기 오류:', error);
    Swal.fire({
      title: '오류',
      text: error.message || '데이터를 불러오는 중 오류가 발생했습니다.',
      icon: 'error',
      confirmButtonColor: '#4A90E2'
    });
  }
};

/**
 * 데이터를 CSV로 다운로드
 */
function downloadDataAsCSV(data, filename) {
  try {
    let csvData;
    
    if (Array.isArray(data[0])) {
      // 2D 배열인 경우
      csvData = data.map(row => row.map(cell => {
        if (cell === null || cell === undefined) return '';
        if (typeof cell === 'string' && cell.includes(',')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }));
    } else {
      // 객체 배열인 경우
      const headers = Object.keys(data[0]);
      csvData = [headers];
      data.forEach(row => {
        csvData.push(headers.map(header => {
          const cell = row[header];
          if (cell === null || cell === undefined) return '';
          if (typeof cell === 'string' && cell.includes(',')) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        }));
      });
    }
    
    const csv = Papa.unparse(csvData);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    FileSaver.saveAs(blob, `${filename.replace(/[^a-z0-9가-힣]/gi, '_')}.csv`);
    
    Swal.fire({
      title: '다운로드 완료',
      text: 'CSV 파일이 다운로드되었습니다.',
      icon: 'success',
      confirmButtonColor: '#4A90E2',
      timer: 1500,
      timerProgressBar: true
    });
  } catch (error) {
    console.error('CSV 다운로드 오류:', error);
    Swal.fire({
      title: '다운로드 실패',
      text: error.message || 'CSV 파일 다운로드 중 오류가 발생했습니다.',
      icon: 'error',
      confirmButtonColor: '#4A90E2'
    });
  }
}

/**
 * 저장된 보고서 목록 표시
 */
function displayReportsList() {
  const reportsList = document.getElementById('reports-list');
  if (!reportsList) {
    console.error('reports-list 요소를 찾을 수 없습니다.');
    return;
  }
  
  console.log('displayReportsList 호출, allReportsList 길이:', allReportsList.length);
  
  try {
    // 필터 적용
    const dateFilter = document.getElementById('report-date-filter')?.value || '';
    const userFilter = document.getElementById('report-user-filter')?.value || '';
    
    console.log('필터 조건 - 날짜:', dateFilter, '사용자:', userFilter);
    
    let filteredReports = [...allReportsList];
    
    if (dateFilter) {
      filteredReports = filteredReports.filter(item => {
        const itemDate = item.updatedAt?.split('T')[0] || item.createdAt?.split('T')[0] || '';
        return itemDate === dateFilter;
      });
    }
    
    if (userFilter) {
      filteredReports = filteredReports.filter(item => item.userId === userFilter);
    }
    
    console.log('필터링 후 보고서 개수:', filteredReports.length);
    
    if (filteredReports.length === 0) {
      if (allReportsList.length === 0) {
        reportsList.innerHTML = '<p class="loading-text">저장된 보고서가 없습니다.</p>';
      } else {
        reportsList.innerHTML = '<p class="loading-text">조건에 맞는 보고서가 없습니다.</p>';
      }
      return;
    }
    
    let html = '';
    filteredReports.forEach(item => {
      const user = allUsers.get(item.userId);
      const userName = user ? (user.displayName || user.email || item.author || '알 수 없음') : (item.author || '알 수 없음');
      const dateTime = item.updatedAt ? new Date(item.updatedAt).toLocaleString('ko-KR') : 
                      item.createdAt ? new Date(item.createdAt).toLocaleString('ko-KR') : '날짜 없음';
      
      html += `
        <div class="report-item" data-id="${item.id}" onclick="showReportDetail('${item.id}')">
          <div class="item-title">${item.reportTitle || '제목 없음'}</div>
          <div class="item-meta">
            <div class="item-meta-item">
              <strong>작성자:</strong> ${userName}
            </div>
            <div class="item-meta-item">
              <strong>작성일:</strong> ${dateTime}
            </div>
            <div class="item-meta-item">
              <strong>사용한 데이터:</strong> ${item.dataTitle || '제목 없음'}
            </div>
          </div>
        </div>
      `;
    });
    
    reportsList.innerHTML = html;
  } catch (error) {
    console.error('보고서 목록 표시 오류:', error);
    reportsList.innerHTML = '<p class="loading-text" style="color: #E74C3C;">보고서 목록을 불러오는 중 오류가 발생했습니다.</p>';
  }
}

/**
 * 보고서 상세 보기
 */
window.showReportDetail = async function(reportId) {
  const modal = document.getElementById('report-detail-modal');
  const titleEl = document.getElementById('report-detail-title');
  const contentEl = document.getElementById('report-detail-content');
  
  if (!modal || !titleEl || !contentEl) return;
  
  try {
    const report = allReportsList.find(item => item.id === reportId);
    if (!report) {
      Swal.fire({
        title: '오류',
        text: '보고서를 찾을 수 없습니다.',
        icon: 'error',
        confirmButtonColor: '#4A90E2'
      });
      return;
    }
    
    const user = allUsers.get(report.userId);
    const userName = user ? (user.displayName || user.email || report.author || '알 수 없음') : (report.author || '알 수 없음');
    const dateTime = report.updatedAt ? new Date(report.updatedAt).toLocaleString('ko-KR') : 
                    report.createdAt ? new Date(report.createdAt).toLocaleString('ko-KR') : '날짜 없음';
    
    titleEl.textContent = report.reportTitle || '보고서 상세';
    
    let html = `
      <div class="report-detail-meta">
        <div class="report-detail-meta-item">
          <strong>보고서 제목</strong>
          <span>${report.reportTitle || '제목 없음'}</span>
        </div>
        <div class="report-detail-meta-item">
          <strong>작성자</strong>
          <span>${userName}</span>
        </div>
        <div class="report-detail-meta-item">
          <strong>작성일</strong>
          <span>${dateTime}</span>
        </div>
        <div class="report-detail-meta-item">
          <strong>사용한 데이터</strong>
          <span>${report.dataTitle || '제목 없음'}</span>
        </div>
      </div>
    `;
    
    if (report.content) {
      html += `
        <div class="report-detail-section">
          <h4>보고서 내용</h4>
          <p>${report.content}</p>
        </div>
      `;
    }
    
    if (report.conclusion) {
      html += `
        <div class="report-detail-section">
          <h4>종합 해석 / 결론</h4>
          <p>${report.conclusion}</p>
        </div>
      `;
    }
    
    if (report.limitations) {
      html += `
        <div class="report-detail-section">
          <h4>한계점</h4>
          <p>${report.limitations}</p>
        </div>
      `;
    }
    
    if (report.questions) {
      html += `
        <div class="report-detail-section">
          <h4>추가 질문</h4>
          <p>${report.questions}</p>
        </div>
      `;
    }
    
    contentEl.innerHTML = html;
    modal.style.display = 'flex';
  } catch (error) {
    console.error('보고서 상세 보기 오류:', error);
    Swal.fire({
      title: '오류',
      text: error.message || '보고서를 불러오는 중 오류가 발생했습니다.',
      icon: 'error',
      confirmButtonColor: '#4A90E2'
    });
  }
};

/**
 * 필터 초기화
 */
function setupFilters() {
  // 데이터 필터
  const dataDateFilter = document.getElementById('data-date-filter');
  const dataUserFilter = document.getElementById('data-user-filter');
  const clearDataDateFilter = document.getElementById('clear-data-date-filter');
  
  if (dataDateFilter) {
    dataDateFilter.addEventListener('change', displayDataList);
  }
  
  if (dataUserFilter) {
    dataUserFilter.addEventListener('change', displayDataList);
  }
  
  if (clearDataDateFilter) {
    clearDataDateFilter.addEventListener('click', () => {
      if (dataDateFilter) {
        dataDateFilter.value = '';
        displayDataList();
      }
    });
  }
  
  // 보고서 필터
  const reportDateFilter = document.getElementById('report-date-filter');
  const reportUserFilter = document.getElementById('report-user-filter');
  const clearReportDateFilter = document.getElementById('clear-report-date-filter');
  
  if (reportDateFilter) {
    reportDateFilter.addEventListener('change', displayReportsList);
  }
  
  if (reportUserFilter) {
    reportUserFilter.addEventListener('change', displayReportsList);
  }
  
  if (clearReportDateFilter) {
    clearReportDateFilter.addEventListener('click', () => {
      if (reportDateFilter) {
        reportDateFilter.value = '';
        displayReportsList();
      }
    });
  }
}

/**
 * 사용자 필터 옵션 업데이트
 */
function updateUserFilters() {
  const dataUserFilter = document.getElementById('data-user-filter');
  const reportUserFilter = document.getElementById('report-user-filter');
  
  const usersArray = Array.from(allUsers.values()).sort((a, b) => {
    const nameA = a.displayName || a.email || '';
    const nameB = b.displayName || b.email || '';
    return nameA.localeCompare(nameB);
  });
  
  const updateSelect = (select) => {
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = '<option value="">전체</option>';
    
    usersArray.forEach(user => {
      const option = document.createElement('option');
      option.value = user.userId;
      option.textContent = `${user.displayName || user.email || '이름 없음'} (${user.dataCount}개 데이터, ${user.reportCount}개 보고서)`;
      select.appendChild(option);
    });
    
    if (currentValue) {
      select.value = currentValue;
    }
  };
  
  updateSelect(dataUserFilter);
  updateSelect(reportUserFilter);
}

/**
 * 탭 전환
 */
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  // 초기 상태: 첫 번째 탭 활성화
  if (tabButtons.length > 0 && tabContents.length > 0) {
    const firstTab = tabButtons[0];
    const firstTabContent = document.getElementById(`${firstTab.dataset.tab}-tab`);
    if (firstTabContent) {
      firstTabContent.classList.add('active');
    }
  }
  
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      
      // 모든 탭 버튼 비활성화
      tabButtons.forEach(b => b.classList.remove('active'));
      // 모든 탭 콘텐츠 숨기기
      tabContents.forEach(c => c.classList.remove('active'));
      
      // 선택된 탭 활성화
      btn.classList.add('active');
      const targetContent = document.getElementById(`${targetTab}-tab`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

/**
 * 모달 닫기
 */
function setupModals() {
  const closeDataModal = document.getElementById('close-data-modal');
  const closeReportModal = document.getElementById('close-report-modal');
  const dataModal = document.getElementById('data-detail-modal');
  const reportModal = document.getElementById('report-detail-modal');
  
  if (closeDataModal && dataModal) {
    closeDataModal.addEventListener('click', () => {
      dataModal.style.display = 'none';
    });
    
    dataModal.addEventListener('click', (e) => {
      if (e.target === dataModal) {
        dataModal.style.display = 'none';
      }
    });
  }
  
  if (closeReportModal && reportModal) {
    closeReportModal.addEventListener('click', () => {
      reportModal.style.display = 'none';
    });
    
    reportModal.addEventListener('click', (e) => {
      if (e.target === reportModal) {
        reportModal.style.display = 'none';
      }
    });
  }
}

/**
 * 데이터 로드
 */
async function loadAllData() {
  if (!checkAdminAccess()) return;
  
  try {
    Swal.fire({
      title: '로딩 중...',
      text: '데이터를 불러오고 있습니다.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    
    // 모든 데이터와 보고서 불러오기
    [allDataList, allReportsList] = await Promise.all([
      getAllDataList(),
      getAllReportsList()
    ]);
    
    console.log('불러온 데이터 개수:', allDataList.length);
    console.log('불러온 보고서 개수:', allReportsList.length);
    
    // 사용자 목록 수집
    collectUsers();
    
    console.log('수집된 사용자 수:', allUsers.size);
    
    // 사용자 필터 옵션 업데이트
    updateUserFilters();
    
    // 각 탭 콘텐츠 표시
    displayUsers();
    displayDataList();
    displayReportsList();
    
    Swal.close();
  } catch (error) {
    console.error('데이터 로드 오류:', error);
    Swal.fire({
      title: '로드 실패',
      text: error.message || '데이터를 불러오는 중 오류가 발생했습니다.',
      icon: 'error',
      confirmButtonColor: '#4A90E2'
    });
  }
}

let isInitialized = false;

/**
 * 관리자 권한 확인 및 페이지 초기화
 */
function initializeAdminPage(user) {
  if (isInitialized) return;
  
  // 사용자가 없거나 관리자가 아니면 즉시 차단
  if (!user || !isAdmin(user.uid)) {
    checkAdminAccess();
    return;
  }
  
  // 관리자인 경우에만 페이지 표시 및 데이터 로드
  if (checkAdminAccess()) {
    isInitialized = true;
    
    // 탭 설정
    setupTabs();
    
    // 필터 설정
    setupFilters();
    
    // 모달 설정
    setupModals();
    
    // 데이터 로드
    loadAllData();
  }
}

/**
 * 초기화
 */
function init() {
  const firebase = initializeFirebase();
  if (!firebase) {
    Swal.fire({
      title: '오류',
      text: 'Firebase 초기화에 실패했습니다.',
      icon: 'error',
      confirmButtonColor: '#4A90E2',
      confirmButtonText: '홈으로 이동'
    }).then(() => {
      window.location.href = 'index.html';
    });
    return;
  }
  
  // 인증 상태 변경 감지
  onAuthStateChange((user) => {
    initializeAdminPage(user);
  });
  
  // 초기 인증 상태 확인 (인증이 이미 완료된 경우)
  setTimeout(() => {
    const user = getCurrentUser();
    if (user) {
      initializeAdminPage(user);
    } else {
      // 사용자가 없으면 로그인 대기
      checkAdminAccess();
    }
  }, 500);
}

// DOM 로드 후 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

