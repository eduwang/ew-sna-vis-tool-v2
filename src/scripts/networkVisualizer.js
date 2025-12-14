/**
 * 관계망 시각화 도구 메인 로직
 * ref/1_dataViewer.js, ref/4_diyData.js를 참고하여 작성
 */

import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.css';
import Swal from 'sweetalert2';
import { loadCSVFile, convertToCSVArray } from './csvLoader.js';
import { showSampleDataModal } from './uiComponents.js';
import { showStatusMessage, hideStatusMessage } from './uiComponents.js';
import { saveDataToFirebase, getUserDataList, loadDataFromFirebase, deleteDataFromFirebase } from '../firebaseConfig.js';
import { getCurrentAuthUser } from './networkAuth.js';

let hotInstance = null;
let lastSelectedRange = null; // 마지막으로 선택된 범위 저장

/**
 * Handsontable 초기화
 */
function initializeHandsontable() {
  const container = document.getElementById('handsontable-container');
  
  if (!container) {
    console.error('Handsontable 컨테이너를 찾을 수 없습니다.');
    return;
  }
  
  try {
    // 기본 데이터: 빈 1행 (헤더는 colHeaders로 별도 설정)
    const defaultData = [
      ['', '', '']
    ];
    
    hotInstance = new Handsontable(container, {
      data: defaultData,
      rowHeaders: true,
      colHeaders: ['노드 1', '노드 2', '가중치'],
      columnSorting: true,
      contextMenu: true,
      manualColumnResize: true,
      manualRowResize: true,
      licenseKey: 'non-commercial-and-evaluation',
      stretchH: 'all',
      height: 500,
      width: '100%',
      language: 'ko-KR',
      // Storage 접근 비활성화
      persistentState: false,
      // 빈 행 자동 추가
      minSpareRows: 1,
      // 행 선택 활성화
      selectionMode: 'multiple',
      multiSelect: true,
      afterChange: (changes, source) => {
        if (source !== 'loadData') {
          hideStatusMessage();
          updateDataCount();
        }
      },
      afterRemoveRow: (index, amount) => {
        // console.log('afterRemoveRow 이벤트:', index, amount);
        updateDataCount();
      },
      afterSelection: (row, col, row2, col2) => {
        // console.log('셀 선택됨:', row, col, row2, col2);
        // 선택된 범위 저장
        lastSelectedRange = {
          rowStart: Math.min(row, row2),
          colStart: Math.min(col, col2),
          rowEnd: Math.max(row, row2),
          colEnd: Math.max(col, col2)
        };
      },
      afterSelectionEnd: (row, col, row2, col2) => {
        // console.log('셀 선택 종료:', row, col, row2, col2);
        // 최종 선택된 범위 저장
        lastSelectedRange = {
          rowStart: Math.min(row, row2),
          colStart: Math.min(col, col2),
          rowEnd: Math.max(row, row2),
          colEnd: Math.max(col, col2)
        };
      }
    });
  } catch (error) {
    console.error('Handsontable 초기화 오류:', error);
    showStatusMessage('테이블 초기화 중 오류가 발생했습니다. 페이지를 새로고침해주세요.', 'error');
    return;
  }
  
  // 초기 데이터 개수 업데이트
  updateDataCount();
  
  // console.log('Handsontable 초기화 완료');
}

/**
 * 데이터를 Handsontable에 로드
 * @param {Array} data - 로드할 데이터 (2D 배열 또는 객체 배열)
 */
function loadDataToTable(data) {
  if (!hotInstance) {
    console.error('Handsontable 인스턴스가 초기화되지 않았습니다.');
    return;
  }
  
  try {
    // 데이터가 객체 배열인 경우 2D 배열로 변환
    let tableData;
    if (data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0])) {
      // 객체 배열인 경우
      const headers = Object.keys(data[0]);
      // 헤더는 colHeaders로 이미 설정되어 있으므로 데이터만 추가
      tableData = [];
      data.forEach(row => {
        const rowData = headers.map(header => row[header] || '');
        tableData.push(rowData);
      });
    } else {
      // 이미 2D 배열인 경우
      // 첫 번째 행이 헤더인지 확인하고 제거
      tableData = data;
      // 첫 번째 행이 헤더처럼 보이면 제거 (모두 문자열이고 데이터가 아닌 경우)
      if (tableData.length > 0 && Array.isArray(tableData[0])) {
        const firstRow = tableData[0];
        // 헤더로 보이는 경우 제거 (예: 'Source1', 'Source2', 'Weight' 등)
        if (firstRow.some(cell => 
          typeof cell === 'string' && 
          (cell.toLowerCase().includes('source') || 
           cell.toLowerCase().includes('node') || 
           cell.toLowerCase().includes('weight') ||
           cell.toLowerCase().includes('가중치') ||
           cell.toLowerCase().includes('노드'))
        )) {
          tableData = tableData.slice(1);
        }
      }
    }
    
    // 세 칸이 모두 비어있는 행 제거
    tableData = tableData.filter(row => {
      if (!Array.isArray(row)) return false;
      // 세 칸 모두 비어있지 않은 행만 유지
      return row.some(cell => cell !== null && cell !== '' && cell !== undefined);
    });
    
    hotInstance.loadData(tableData);
    updateDataCount();
    showStatusMessage('데이터가 성공적으로 로드되었습니다.', 'success');
  } catch (error) {
    console.error('데이터 로드 오류:', error);
    showStatusMessage(`데이터 로드 중 오류가 발생했습니다: ${error.message}`, 'error');
  }
}

/**
 * 데이터 개수 업데이트
 */
function updateDataCount() {
  if (!hotInstance) return;
  
  const data = hotInstance.getData();
  if (!data || data.length === 0) {
    const countEl = document.getElementById('data-count');
    const toggleBtn = document.getElementById('toggle-data-section');
    if (countEl) {
      countEl.textContent = '';
    }
    if (toggleBtn) {
      toggleBtn.style.display = 'none';
    }
    // 접힌 상태 해제
    const tableContainer = document.querySelector('.table-container');
    const mainContent = document.querySelector('.main-content');
    if (tableContainer) {
      tableContainer.classList.remove('collapsed');
    }
    if (mainContent) {
      mainContent.classList.remove('data-collapsed');
    }
    return;
  }
  
  // 세 칸이 모두 비어있지 않은 행만 카운트
  const validRows = data.filter(row => {
    if (!Array.isArray(row)) return false;
    return row.some(cell => cell !== null && cell !== '' && cell !== undefined);
  });
  
  const countEl = document.getElementById('data-count');
  const toggleBtn = document.getElementById('toggle-data-section');
  if (countEl) {
    countEl.textContent = `총 ${validRows.length}개의 선분 데이터`;
  }
  // 데이터가 있으면 접기/펼치기 버튼 표시
  if (toggleBtn && validRows.length > 0) {
    toggleBtn.style.display = 'flex';
  }
}

/**
 * CSV 파일 업로드 처리
 */
function setupCSVUpload() {
  const fileInput = document.getElementById('csv-upload');
  
  if (!fileInput) {
    console.error('CSV 업로드 입력 요소를 찾을 수 없습니다.');
    return;
  }
  
  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    
    if (!file) {
      return;
    }
    
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showStatusMessage('CSV 파일만 업로드할 수 있습니다.', 'error');
      return;
    }
    
    try {
      showStatusMessage('CSV 파일을 읽는 중...', 'info');
      
      const data = await loadCSVFile(file);
      
      // 객체 배열을 2D 배열로 변환
      const csvArray = convertToCSVArray(data);
      loadDataToTable(csvArray);
      
      // 파일 입력 초기화 (같은 파일을 다시 선택할 수 있도록)
      fileInput.value = '';
    } catch (error) {
      console.error('CSV 로드 오류:', error);
      showStatusMessage(`CSV 파일 로드 중 오류: ${error.message}`, 'error');
    }
  });
}

/**
 * 예시 데이터 불러오기 버튼 설정
 */
function setupSampleDataButton() {
  const loadSampleBtn = document.getElementById('load-sample-btn');
  
  if (!loadSampleBtn) {
    console.error('예시 데이터 버튼을 찾을 수 없습니다.');
    return;
  }
  
  loadSampleBtn.addEventListener('click', () => {
    showSampleDataModal((selectedData) => {
      loadDataToTable(selectedData);
    });
  });
}

/**
 * 행 추가/삭제 버튼 설정
 */
function setupRowControls() {
  const addRowBtn = document.getElementById('add-row-btn');
  const removeRowBtn = document.getElementById('remove-row-btn');
  
  if (addRowBtn) {
    addRowBtn.addEventListener('click', () => {
      if (!hotInstance) {
        // console.error('Handsontable 인스턴스가 없습니다.');
        return;
      }
      
      // 데이터 직접 조작 방식 사용 (Handsontable 14.x에서 alter('insert_row')가 작동하지 않음)
      const data = hotInstance.getData();
      data.push(['', '', '']);
      hotInstance.loadData(data);
      updateDataCount();
    });
  }
  
  if (removeRowBtn) {
    removeRowBtn.addEventListener('click', () => {
      if (!hotInstance) {
        console.error('Handsontable 인스턴스가 없습니다.');
        return;
      }
      
      // console.log('=== 행 삭제 버튼 클릭 ===');
      
      try {
        const rowCount = hotInstance.countRows();
        const data = hotInstance.getData();
        
        // console.log('저장된 선택 범위:', lastSelectedRange);
        // console.log('행 개수:', rowCount);
        // console.log('데이터 길이:', data.length);
        
        if (rowCount <= 1) {
          // console.log('최소 1행은 유지해야 함');
          return;
        }
        
        // 데이터 직접 조작 방식
        const newData = data.map(row => [...row]); // 깊은 복사
        let rowsToDelete = new Set();
        
        // 저장된 선택 범위 사용
        if (lastSelectedRange) {
          const { rowStart, rowEnd } = lastSelectedRange;
          // console.log(`선택된 행 범위: ${rowStart} ~ ${rowEnd}`);
          
          // 선택된 범위의 모든 행 추가
          for (let row = rowStart; row <= rowEnd; row++) {
            if (row >= 0 && row < rowCount) {
              rowsToDelete.add(row);
            }
          }
          
          // console.log('삭제할 행 인덱스:', Array.from(rowsToDelete));
        } else {
          // console.log('선택된 셀이 없음 - 마지막 행 삭제');
          // 선택된 행이 없으면 마지막 행 삭제
          if (rowCount > 1) {
            rowsToDelete.add(rowCount - 1);
          }
        }
        
        if (rowsToDelete.size > 0) {
          // 행 인덱스를 배열로 변환하고 역순 정렬 (삭제 시 인덱스 변경 방지)
          const rowsArray = Array.from(rowsToDelete).sort((a, b) => b - a);
          
          // console.log('정렬된 삭제할 행:', rowsArray);
          
          // 최소 1행은 유지하도록 확인
          if (rowsArray.length >= newData.length) {
            // console.log('모든 행 삭제 시도 - 마지막 행만 남김');
            rowsArray.splice(0, rowsArray.length - 1);
          }
          
          // console.log('최종 삭제할 행:', rowsArray);
          // console.log('삭제 전 데이터 길이:', newData.length);
          
          // 역순으로 행 삭제
          rowsArray.forEach(rowIndex => {
            if (newData.length > 1 && rowIndex >= 0 && rowIndex < newData.length) {
              // console.log(`행 ${rowIndex} 삭제 중...`);
              newData.splice(rowIndex, 1);
              // console.log(`삭제 후 데이터 길이: ${newData.length}`);
            } else {
              // console.warn(`행 ${rowIndex} 삭제 실패: 유효하지 않은 인덱스`);
            }
          });
          
          // 빈 행 하나 추가 (minSpareRows 유지)
          if (newData.length === 0) {
            newData.push(['', '', '']);
          }
          
          // console.log('최종 데이터 길이:', newData.length);
          // console.log('데이터 로드 중...');
          
          // 데이터 다시 로드
          hotInstance.loadData(newData);
          
          // console.log('데이터 로드 완료');
          
          // loadData 후 즉시 업데이트 (afterChange에서 loadData는 제외되어 있으므로)
          setTimeout(() => {
            updateDataCount();
            // console.log('데이터 개수 업데이트 완료');
          }, 50);
        } else {
          // console.log('삭제할 행이 없음');
        }
      } catch (error) {
        // console.error('행 삭제 오류:', error);
        // console.error('스택:', error.stack);
        showStatusMessage('행 삭제 중 오류가 발생했습니다.', 'error');
      }
    });
  }
}

/**
 * 초기화 버튼 설정
 */
function setupResetButton() {
  const resetBtn = document.getElementById('reset-btn');
  
  if (!resetBtn) {
    // console.error('초기화 버튼을 찾을 수 없습니다.');
    return;
  }
  
  resetBtn.addEventListener('click', () => {
    if (!hotInstance) {
      return;
    }
    
    // 확인 메시지
    Swal.fire({
      title: '초기화 확인',
      text: '모든 데이터와 그래프를 초기화하시겠습니까?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#4A90E2',
      cancelButtonColor: '#7F8C8D',
      confirmButtonText: '초기화',
      cancelButtonText: '취소'
    }).then((result) => {
      if (!result.isConfirmed) {
        return;
      }
      
      // 초기화 실행
      try {
        // Handsontable 데이터 초기화 (빈 1행만 남기기)
        const defaultData = [['', '', '']];
        hotInstance.loadData(defaultData);
        
        // 데이터 개수 초기화
        updateDataCount();
        
        // 그래프 초기화
        if (window.resetGraph) {
          window.resetGraph();
        }
        
        // 상태 메시지 숨기기
        hideStatusMessage();
        
        // 선택된 범위 초기화
        lastSelectedRange = null;
        
        Swal.fire({
          title: '초기화 완료',
          text: '모든 데이터와 그래프가 초기화되었습니다.',
          icon: 'success',
          confirmButtonColor: '#4A90E2',
          timer: 2000,
          timerProgressBar: true
        });
      } catch (error) {
        // console.error('초기화 오류:', error);
        Swal.fire({
          title: '오류',
          text: '초기화 중 오류가 발생했습니다.',
          icon: 'error',
          confirmButtonColor: '#4A90E2'
        });
      }
    });
    
    return; // Swal.fire가 Promise를 반환하므로 여기서 return
    
    try {
      // Handsontable 데이터 초기화 (빈 1행만 남기기)
      const defaultData = [['', '', '']];
      hotInstance.loadData(defaultData);
      
      // 데이터 개수 초기화
      updateDataCount();
      
      // 그래프 초기화
      if (window.resetGraph) {
        window.resetGraph();
      }
      
      // 상태 메시지 숨기기
      hideStatusMessage();
      
      // 선택된 범위 초기화
      lastSelectedRange = null;
      
      showStatusMessage('모든 데이터와 그래프가 초기화되었습니다.', 'success');
    } catch (error) {
      // console.error('초기화 오류:', error);
      showStatusMessage('초기화 중 오류가 발생했습니다.', 'error');
    }
  });
}

/**
 * 데이터 저장 버튼 설정
 */
function setupSaveButton() {
  const saveBtn = document.getElementById('save-data-btn');
  
  if (!saveBtn) {
    console.error('저장 버튼을 찾을 수 없습니다.');
    return;
  }
  
  saveBtn.addEventListener('click', async () => {
    if (!hotInstance) {
      Swal.fire({
        title: '오류',
        text: '테이블이 초기화되지 않았습니다.',
        icon: 'error',
        confirmButtonColor: '#4A90E2'
      });
      return;
    }
    
    const data = hotInstance.getData();
    
    // 유효한 데이터 필터링 (빈 행 제거)
    const validData = data.filter(row => {
      if (!Array.isArray(row)) return false;
      return row.some(cell => cell !== null && cell !== '' && cell !== undefined);
    });
    
    if (!validData || validData.length === 0) {
      Swal.fire({
        title: '저장할 데이터 없음',
        text: '저장할 데이터가 없습니다.',
        icon: 'warning',
        confirmButtonColor: '#4A90E2'
      });
      return;
    }
    
    const user = getCurrentAuthUser();
    if (!user) {
      Swal.fire({
        title: '로그인 필요',
        text: '데이터를 저장하려면 로그인이 필요합니다.',
        icon: 'warning',
        confirmButtonColor: '#4A90E2'
      });
      return;
    }
    
    // 저장 폼 표시
    const { value: formValues } = await Swal.fire({
      title: '데이터 저장',
      html: `
        <div style="text-align: left;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: #2C3E50;">제목</label>
          <input id="swal-title" class="swal2-input" placeholder="제목을 입력하세요" style="margin-bottom: 1rem;">
          
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: #2C3E50;">작성자</label>
          <input id="swal-author" class="swal2-input" placeholder="작성자 이름" style="margin-bottom: 1rem;">
          
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: #2C3E50;">설명</label>
          <textarea id="swal-description" class="swal2-textarea" placeholder="데이터에 대한 설명을 입력하세요" style="margin-bottom: 0;"></textarea>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: '저장',
      cancelButtonText: '취소',
      confirmButtonColor: '#4A90E2',
      cancelButtonColor: '#7F8C8D',
      preConfirm: () => {
        return {
          title: document.getElementById('swal-title').value,
          author: document.getElementById('swal-author').value,
          description: document.getElementById('swal-description').value
        };
      },
      didOpen: () => {
        // 작성자 필드에 기본값 설정
        const authorInput = document.getElementById('swal-author');
        if (authorInput && user.displayName) {
          authorInput.value = user.displayName;
        }
      }
    });
    
    if (!formValues) {
      return;
    }
    
    try {
      Swal.fire({
        title: '저장 중...',
        text: '데이터를 저장하고 있습니다.',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });
      
      await saveDataToFirebase(
        validData,
        user.uid,
        user.displayName || '',
        user.email || '',
        formValues.title || '',
        formValues.author || '',
        formValues.description || ''
      );
      
      Swal.fire({
        title: '저장 완료',
        text: '데이터가 성공적으로 저장되었습니다.',
        icon: 'success',
        confirmButtonColor: '#4A90E2',
        timer: 2000,
        timerProgressBar: true
      });
    } catch (error) {
      console.error('저장 오류:', error);
      Swal.fire({
        title: '저장 실패',
        text: error.message || '데이터 저장 중 오류가 발생했습니다.',
        icon: 'error',
        confirmButtonColor: '#4A90E2'
      });
    }
  });
}

/**
 * 데이터 불러오기 버튼 설정
 */
function setupLoadButton() {
  const loadBtn = document.getElementById('load-data-btn');
  
  if (!loadBtn) {
    console.error('불러오기 버튼을 찾을 수 없습니다.');
    return;
  }
  
  loadBtn.addEventListener('click', async () => {
    const user = getCurrentAuthUser();
    if (!user) {
      Swal.fire({
        title: '로그인 필요',
        text: '데이터를 불러오려면 로그인이 필요합니다.',
        icon: 'warning',
        confirmButtonColor: '#4A90E2'
      });
      return;
    }
    
    try {
      Swal.fire({
        title: '불러오는 중...',
        text: '저장된 데이터 목록을 불러오고 있습니다.',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });
      
      const dataList = await getUserDataList(user.uid);
      
      if (!dataList || dataList.length === 0) {
        Swal.fire({
          title: '저장된 데이터 없음',
          text: '저장된 데이터가 없습니다.',
          icon: 'info',
          confirmButtonColor: '#4A90E2'
        });
        return;
      }
      
      // 데이터 목록을 표시 (각 항목에 불러오기/삭제 버튼 포함)
      const listHtml = dataList.map((item, index) => {
        const dateTime = item.date && item.time ? `${item.date} ${item.time}` : 
                        item.createdAt ? new Date(item.createdAt).toLocaleString('ko-KR') : '날짜 없음';
        return `
          <div class="data-item" data-id="${item.id}" style="border: 1px solid #E1E8ED; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; background: #F5F7FA;">
            <div style="font-weight: 600; color: #2C3E50; margin-bottom: 0.5rem;">${item.title || '제목 없음'}</div>
            <div style="font-size: 0.875rem; color: #7F8C8D; margin-bottom: 0.5rem;">${item.description || '설명 없음'}</div>
            <div style="font-size: 0.75rem; color: #7F8C8D; margin-bottom: 0.75rem;">${dateTime}</div>
            <div style="display: flex; gap: 0.5rem;">
              <button class="load-data-item-btn" data-id="${item.id}" style="flex: 1; padding: 0.5rem; background: #4A90E2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem; font-weight: 500;">불러오기</button>
              <button class="delete-data-item-btn" data-id="${item.id}" style="flex: 1; padding: 0.5rem; background: #F76C6C; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem; font-weight: 500;">삭제</button>
            </div>
          </div>
        `;
      }).join('');
      
      await Swal.fire({
        title: '데이터 불러오기',
        html: `
          <div id="data-list-container" style="max-height: 400px; overflow-y: auto; text-align: left;">
            ${listHtml}
          </div>
        `,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: '닫기',
        cancelButtonColor: '#7F8C8D',
        width: '600px',
        didOpen: () => {
          // 불러오기 버튼 이벤트
          const loadButtons = document.querySelectorAll('.load-data-item-btn');
          loadButtons.forEach(btn => {
            btn.addEventListener('click', async () => {
              const dataId = btn.dataset.id;
              Swal.close();
              
              Swal.fire({
                title: '불러오는 중...',
                text: '데이터를 불러오고 있습니다.',
                allowOutsideClick: false,
                didOpen: () => {
                  Swal.showLoading();
                }
              });
              
              try {
                const loadedData = await loadDataFromFirebase(dataId);
                
                if (loadedData && loadedData.length > 0) {
                  loadDataToTable(loadedData);
                  Swal.fire({
                    title: '불러오기 완료',
                    text: '데이터가 성공적으로 불러와졌습니다.',
                    icon: 'success',
                    confirmButtonColor: '#4A90E2',
                    timer: 2000,
                    timerProgressBar: true
                  });
                } else {
                  Swal.fire({
                    title: '오류',
                    text: '데이터를 불러올 수 없습니다.',
                    icon: 'error',
                    confirmButtonColor: '#4A90E2'
                  });
                }
              } catch (error) {
                console.error('불러오기 오류:', error);
                Swal.fire({
                  title: '오류',
                  text: error.message || '데이터를 불러오는 중 오류가 발생했습니다.',
                  icon: 'error',
                  confirmButtonColor: '#4A90E2'
                });
              }
            });
          });
          
          // 삭제 버튼 이벤트
          const deleteButtons = document.querySelectorAll('.delete-data-item-btn');
          deleteButtons.forEach(btn => {
            btn.addEventListener('click', async () => {
              const dataId = btn.dataset.id;
              
              const { value: confirmDelete } = await Swal.fire({
                title: '삭제 확인',
                text: '이 데이터를 정말 삭제하시겠습니까?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: '삭제',
                cancelButtonText: '취소',
                confirmButtonColor: '#F76C6C',
                cancelButtonColor: '#7F8C8D'
              });
              
              if (confirmDelete) {
                Swal.fire({
                  title: '삭제 중...',
                  text: '데이터를 삭제하고 있습니다.',
                  allowOutsideClick: false,
                  didOpen: () => {
                    Swal.showLoading();
                  }
                });
                
                try {
                  await deleteDataFromFirebase(dataId);
                  
                  Swal.fire({
                    title: '삭제 완료',
                    text: '데이터가 성공적으로 삭제되었습니다.',
                    icon: 'success',
                    confirmButtonColor: '#4A90E2',
                    timer: 2000,
                    timerProgressBar: true
                  }).then(() => {
                    // 목록 새로고침을 위해 다시 불러오기 버튼 클릭
                    loadBtn.click();
                  });
                } catch (error) {
                  console.error('삭제 오류:', error);
                  Swal.fire({
                    title: '삭제 실패',
                    text: error.message || '데이터 삭제 중 오류가 발생했습니다.',
                    icon: 'error',
                    confirmButtonColor: '#4A90E2'
                  });
                }
              }
            });
          });
        }
      });
    } catch (error) {
      console.error('불러오기 오류:', error);
      Swal.fire({
        title: '오류',
        text: error.message || '데이터를 불러오는 중 오류가 발생했습니다.',
        icon: 'error',
        confirmButtonColor: '#4A90E2'
      });
    }
  });
}

/**
 * 초기화 함수
 */
function setupToggleButton() {
  const toggleBtn = document.getElementById('toggle-data-section');
  if (!toggleBtn) return;

  toggleBtn.addEventListener('click', () => {
    const tableContainer = document.querySelector('.table-container');
    const mainContent = document.querySelector('.main-content');
    
    if (!tableContainer || !mainContent) return;

    const isCollapsed = tableContainer.classList.contains('collapsed');
    
    if (isCollapsed) {
      // 펼치기
      tableContainer.classList.remove('collapsed');
      mainContent.classList.remove('data-collapsed');
      toggleBtn.classList.remove('collapsed');
    } else {
      // 접기
      tableContainer.classList.add('collapsed');
      mainContent.classList.add('data-collapsed');
      toggleBtn.classList.add('collapsed');
    }
  });
}

function init() {
  // DOM이 로드된 후 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initializeHandsontable();
      setupCSVUpload();
      setupSampleDataButton();
      setupRowControls();
      setupResetButton();
      setupSaveButton();
      setupLoadButton();
      setupToggleButton();
    });
  } else {
    initializeHandsontable();
    setupCSVUpload();
    setupSampleDataButton();
    setupRowControls();
    setupResetButton();
    setupSaveButton();
    setupLoadButton();
    setupToggleButton();
  }
}

// 초기화 실행
init();

// 전역으로 내보내기 (디버깅용)
window.networkVisualizer = {
  getData: () => hotInstance ? hotInstance.getData() : null,
  loadData: loadDataToTable
};

