/**
 * UI 컴포넌트 (모달, 툴팁 등)
 */

import Swal from 'sweetalert2';
import { getSampleDataList } from './sampleData.js';
import { loadSampleCSV } from './sampleData.js';

/**
 * 상태 메시지 표시
 * @param {string} message - 메시지 내용
 * @param {string} type - 메시지 타입 ('success', 'error', 'info')
 */
export function showStatusMessage(message, type = 'info') {
  const statusEl = document.getElementById('status-message');
  if (!statusEl) return;
  
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  statusEl.style.display = 'block';
  
  // 5초 후 자동 숨김
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 5000);
}

/**
 * 상태 메시지 숨기기
 */
export function hideStatusMessage() {
  const statusEl = document.getElementById('status-message');
  if (statusEl) {
    statusEl.style.display = 'none';
  }
}

/**
 * 예시 데이터 선택 모달 표시
 * @param {Function} onSelect - 데이터 선택 시 호출될 콜백 함수
 */
export function showSampleDataModal(onSelect) {
  const sampleList = getSampleDataList();
  
  // 모달 오버레이 생성
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });
  
  // 모달 콘텐츠 생성
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';
  modalContent.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  // 모달 헤더
  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `
    <h2>예시 데이터 선택</h2>
    <button class="close-button" aria-label="닫기">&times;</button>
  `;
  
  // 닫기 버튼 이벤트
  header.querySelector('.close-button').addEventListener('click', closeModal);
  
  // 예시 데이터 목록
  const sampleListEl = document.createElement('ul');
  sampleListEl.className = 'sample-list';
  
  sampleList.forEach((sample) => {
    const item = document.createElement('li');
    item.className = 'sample-item';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'sample-item-header';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'sample-item-name';
    nameSpan.textContent = sample.name;
    
    headerDiv.appendChild(nameSpan);
    
    const descDiv = document.createElement('div');
    descDiv.className = 'sample-item-description';
    descDiv.textContent = sample.description;
    
    item.appendChild(headerDiv);
    item.appendChild(descDiv);
    
    // 클릭 이벤트
    item.addEventListener('click', async () => {
      // CSV 파일 로드
      try {
        const data = await loadSampleCSV(sample.filePath);
        onSelect(data);
        closeModal();
      } catch (error) {
        console.error('예시 데이터 로드 오류:', error);
        Swal.fire({
          title: '오류',
          text: `예시 데이터를 불러오는 중 오류가 발생했습니다: ${error.message}`,
          icon: 'error',
          confirmButtonColor: '#4A90E2'
        });
      }
    });
    
    sampleListEl.appendChild(item);
  });
  
  // 모달 조립
  modalContent.appendChild(header);
  modalContent.appendChild(sampleListEl);
  overlay.appendChild(modalContent);
  
  // 모달 표시
  document.body.appendChild(overlay);
  
  // ESC 키로 닫기
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
  
  function closeModal() {
    document.body.removeChild(overlay);
    document.removeEventListener('keydown', escHandler);
  }
}

/**
 * 툴팁 표시 (간단한 버전)
 * @param {HTMLElement} element - 툴팁을 표시할 요소
 * @param {string} text - 툴팁 텍스트
 */
export function showTooltip(element, text) {
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.textContent = text;
  tooltip.style.cssText = `
    position: absolute;
    background: var(--panton-text);
    color: var(--panton-white);
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 0.85rem;
    z-index: 1000;
    pointer-events: none;
    white-space: nowrap;
  `;
  
  document.body.appendChild(tooltip);
  
  const rect = element.getBoundingClientRect();
  tooltip.style.left = `${rect.left + rect.width / 2}px`;
  tooltip.style.top = `${rect.top - 10}px`;
  tooltip.style.transform = 'translate(-50%, -100%)';
  
  const removeTooltip = () => {
    if (tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
    }
    element.removeEventListener('mouseleave', removeTooltip);
  };
  
  element.addEventListener('mouseleave', removeTooltip);
}

