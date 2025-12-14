/**
 * 보고서 작성 기능
 */

import { initializeFirebase, getCurrentUser, getUserDataList, loadDataFromFirebase, saveReportToFirebase, updateReportInFirebase, getUserReportsList, loadReportFromFirebase } from '../firebaseConfig.js';
import Graph from 'graphology';
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import circular from "graphology-layout/circular";
import louvain from 'graphology-communities-louvain';
import { degreeCentrality } from 'graphology-metrics/centrality/degree';
import eigenvectorCentrality from 'graphology-metrics/centrality/eigenvector';
import FileSaver from "file-saver";
import Swal from 'sweetalert2';

let graph = null;
let sigmaInstance = null;
let container = null;
let currentData = null;
let currentReportId = null;
let communityDetected = false;
let communityNodes = {};
let communityColors = {};
let degreeCen = null;
let eigenCen = null;
let centralityNodes = [];

/**
 * Handsontable 데이터를 그래프 데이터 형식으로 변환
 */
function convertTableDataToGraphData(tableData) {
  if (!tableData || tableData.length === 0) {
    return [];
  }

  let dataStartIndex = 0;
  let source1Index = 0;
  let source2Index = 1;
  let weightIndex = 2;

  if (tableData.length > 0 && Array.isArray(tableData[0])) {
    const firstRow = tableData[0];
    const isHeader = firstRow.some(cell => {
      if (cell === null || cell === undefined) return false;
      const cellStr = String(cell).toLowerCase();
      return cellStr.includes('source') || 
             cellStr.includes('node') || 
             cellStr.includes('weight') ||
             cellStr.includes('가중치') ||
             cellStr.includes('노드');
    });

    if (isHeader) {
      dataStartIndex = 1;
      const headers = firstRow;
      
      source1Index = headers.findIndex(h => {
        if (!h) return false;
        const hStr = String(h).toLowerCase();
        return hStr.includes('source1') || hStr.includes('source') || hStr.includes('노드1') || hStr.includes('노드');
      });
      
      source2Index = headers.findIndex((h, i) => {
        if (!h || i === source1Index) return false;
        const hStr = String(h).toLowerCase();
        return hStr.includes('source2') || hStr.includes('target') || hStr.includes('노드2');
      });
      
      weightIndex = headers.findIndex(h => {
        if (!h) return false;
        const hStr = String(h).toLowerCase();
        return hStr.includes('weight') || hStr.includes('가중치');
      });

      if (source1Index < 0) source1Index = 0;
      if (source2Index < 0) source2Index = source1Index >= 0 ? 1 : 1;
      if (weightIndex < 0) weightIndex = 2;
    }
  }

  const graphData = [];
  
  for (let i = dataStartIndex; i < tableData.length; i++) {
    const row = tableData[i];
    if (!Array.isArray(row) || row.length < 3) continue;
    
    const source1 = row[source1Index];
    const source2 = row[source2Index];
    const weight = row[weightIndex];

    if (!source1 || !source2) continue;

    const weightValue = weight !== null && weight !== undefined && !isNaN(parseFloat(weight)) ? parseFloat(weight) : 1;

    graphData.push({
      Source1: String(source1).trim(),
      Source2: String(source2).trim(),
      Weight: weightValue
    });
  }

  return graphData;
}

/**
 * 그래프 그리기
 */
async function drawGraph(tableData) {
  const graphData = convertTableDataToGraphData(tableData);
  
  if (graphData.length === 0) {
    Swal.fire({
      title: '오류',
      text: '유효한 그래프 데이터가 없습니다.',
      icon: 'error',
      confirmButtonColor: '#4A90E2'
    });
    return;
  }

  // 그래프 생성
  graph = new Graph();

  // 노드와 엣지 추가
  graphData.forEach(row => {
    const { Source1, Source2, Weight } = row;

    if (!graph.hasNode(Source1)) {
      graph.addNode(Source1, { label: Source1 });
    }
    if (!graph.hasNode(Source2)) {
      graph.addNode(Source2, { label: Source2 });
    }
    
    if (!graph.hasEdge(Source1, Source2)) {
      graph.addEdge(Source1, Source2, { 
        weight: Weight
      });
    }
  });

  // 노드 크기 조정
  const degrees = graph.nodes().map((node) => graph.degree(node));
  const minDegree = Math.min(...degrees);
  const maxDegree = Math.max(...degrees);
  const minSize = 3;
  const maxSize = 15;
  
  graph.forEachNode((node) => {
    const degree = graph.degree(node);
    const size = minDegree === maxDegree 
      ? (minSize + maxSize) / 2
      : minSize + ((degree - minDegree) / (maxDegree - minDegree)) * (maxSize - minSize);
    graph.setNodeAttribute(node, "size", size);
    graph.setNodeAttribute(node, "color", "#666");
    graph.setNodeAttribute(node, "originalColor", "#666");
  });

  // 레이아웃 설정
  circular.assign(graph);
  forceAtlas2.assign(graph, { iterations: 500 });

  // 기존 그래프 제거
  if (sigmaInstance) {
    sigmaInstance.kill();
    sigmaInstance = null;
  }

  container = document.getElementById('sigma-container');
  if (!container) {
    console.error('sigma-container를 찾을 수 없습니다.');
    return;
  }

  container.innerHTML = '';
  
  // 컨테이너가 표시될 때까지 대기
  const reportEditor = document.getElementById('report-editor');
  if (reportEditor && reportEditor.style.display === 'none') {
    reportEditor.style.display = 'block';
  }
  
  // DOM이 완전히 렌더링될 때까지 대기
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 컨테이너 크기 확인 및 재시도
  let containerRect = container.getBoundingClientRect();
  let retryCount = 0;
  while ((containerRect.width === 0 || containerRect.height === 0) && retryCount < 5) {
    await new Promise(resolve => setTimeout(resolve, 100));
    containerRect = container.getBoundingClientRect();
    retryCount++;
  }
  
  if (containerRect.width === 0 || containerRect.height === 0) {
    console.error('컨테이너 크기를 확인할 수 없습니다.');
    Swal.fire({
      title: '오류',
      text: '그래프 컨테이너를 초기화할 수 없습니다. 페이지를 새로고침해주세요.',
      icon: 'error',
      confirmButtonColor: '#4A90E2'
    });
    return;
  }
  
  const settings = {
    labelFont: "Arial",
    labelWeight: "bold",
    defaultNodeLabelSize: 50,
  };

  sigmaInstance = new Sigma(graph, container, { settings });

  // 중심성 계산
  computeCentrality();
}

/**
 * 중심성 계산
 */
function computeCentrality() {
  if (!graph) return;

  try {
    degreeCen = degreeCentrality(graph);
    Object.keys(degreeCen).forEach(node => {
      graph.setNodeAttribute(node, 'degreeCentrality', parseFloat(degreeCen[node].toFixed(3)));
    });

    try {
      eigenCen = eigenvectorCentrality(graph);
      Object.keys(eigenCen).forEach(node => {
        graph.setNodeAttribute(node, 'eigenvectorCentrality', parseFloat(eigenCen[node].toFixed(3)));
      });
    } catch (error) {
      console.error('Eigenvector Centrality 계산 오류:', error);
      graph.forEachNode(node => {
        graph.setNodeAttribute(node, 'eigenvectorCentrality', 'N/A');
      });
    }

    // 노드 데이터 수집
    centralityNodes = [];
    graph.forEachNode((node, attributes) => {
      centralityNodes.push({
        node: node,
        degreeCentrality: attributes.degreeCentrality || 0,
        eigenvectorCentrality: attributes.eigenvectorCentrality || 'N/A'
      });
    });

    updateCentralityDisplay();
  } catch (error) {
    console.error('중심성 계산 오류:', error);
  }
}

/**
 * 중심성 정보 표시 업데이트
 */
function updateCentralityDisplay(sortBy = 'degree') {
  const centralityInfo = document.getElementById('centrality-info');
  if (!centralityInfo || !centralityNodes.length) return;

  // 고유벡터 중심성이 존재하는지 확인
  const hasEigenvector = centralityNodes.some(n => n.eigenvectorCentrality !== 'N/A' && n.eigenvectorCentrality !== undefined);
  
  // 정렬 버튼 표시/숨김
  const sortButtonsContainer = document.querySelector('.centrality-sort-buttons');
  if (sortButtonsContainer) {
    sortButtonsContainer.style.display = hasEigenvector ? 'flex' : 'none';
  }
  
  const eigenBtn = document.getElementById('sort-by-eigen-btn');
  if (eigenBtn) {
    eigenBtn.style.display = hasEigenvector ? 'inline-block' : 'none';
  }

  // 정렬 기준에 따라 정렬
  let sortedNodes;
  if (sortBy === 'eigen' && hasEigenvector) {
    sortedNodes = [...centralityNodes].sort((a, b) => {
      const aEigen = a.eigenvectorCentrality === 'N/A' ? -1 : a.eigenvectorCentrality;
      const bEigen = b.eigenvectorCentrality === 'N/A' ? -1 : b.eigenvectorCentrality;
      if (bEigen !== aEigen) {
        return bEigen - aEigen;
      } else {
        return b.degreeCentrality - a.degreeCentrality;
      }
    }).slice(0, 10);
  } else {
    sortedNodes = [...centralityNodes].sort((a, b) => {
      if (b.degreeCentrality !== a.degreeCentrality) {
        return b.degreeCentrality - a.degreeCentrality;
      } else {
        if (hasEigenvector) {
          const aEigen = a.eigenvectorCentrality === 'N/A' ? -1 : a.eigenvectorCentrality;
          const bEigen = b.eigenvectorCentrality === 'N/A' ? -1 : b.eigenvectorCentrality;
          return bEigen - aEigen;
        }
        return 0;
      }
    }).slice(0, 10);
  }

  // 테이블 생성
  let html = '<table><thead><tr><th>노드</th><th>연결 중심성</th>';
  if (hasEigenvector) {
    html += '<th>고유벡터 중심성</th>';
  }
  html += '</tr></thead><tbody>';
  
  sortedNodes.forEach(({ node, degreeCentrality, eigenvectorCentrality }) => {
    html += `<tr><td>${node}</td><td>${degreeCentrality.toFixed(3)}</td>`;
    if (hasEigenvector) {
      html += `<td>${eigenvectorCentrality === 'N/A' ? 'N/A' : eigenvectorCentrality.toFixed(3)}</td>`;
    }
    html += '</tr>';
  });
  html += '</tbody></table>';

  centralityInfo.innerHTML = html;
}

/**
 * 집단 감지
 */
function detectCommunities() {
  if (!graph) return;

  louvain.assign(graph, {
    resolution: 1,
    randomWalk: false
  });

  // 커뮤니티별 노드 그룹화
  communityNodes = {};
  graph.forEachNode((node, attributes) => {
    const community = attributes.community;
    if (!communityNodes[community]) {
      communityNodes[community] = [];
    }
    communityNodes[community].push(node);
  });

  // 커뮤니티별 색상 생성
  function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  const communitiesCount = new Set();
  graph.forEachNode((node, attributes) => {
    communitiesCount.add(attributes.community);
  });

  communityColors = {};
  communitiesCount.forEach(community => {
    communityColors[community] = getRandomColor();
  });

  // 집단 정보는 저장하지만 색상은 할당하지 않음 (표시는 하지 않음)
  // 색상 정보만 저장
  graph.forEachNode((node, attributes) => {
    const community = attributes.community;
    const color = communityColors[community];
    // originalColor만 저장하고 실제 color는 변경하지 않음
    graph.setNodeAttribute(node, 'originalColor', color);
  });

  // communityDetected는 false로 유지 (기본적으로 표시하지 않음)
  updateCommunityDisplay();
}

/**
 * 집단 표시 on/off
 */
function toggleCommunityDisplay() {
  if (!graph) return;

  const toggleBtn = document.getElementById('toggle-community-btn');
  
  if (communityDetected) {
    // 집단 표시 해제
    graph.forEachNode((node) => {
      graph.setNodeAttribute(node, 'color', '#666');
      graph.setNodeAttribute(node, 'originalColor', '#666');
    });
    communityDetected = false;
    if (toggleBtn) toggleBtn.textContent = '집단 표시';
    if (toggleBtn) toggleBtn.classList.remove('active');
  } else {
    // 집단 표시
    if (Object.keys(communityNodes).length === 0) {
      detectCommunities();
    } else {
      graph.forEachNode((node, attributes) => {
        const community = attributes.community;
        const color = communityColors[community];
        graph.setNodeAttribute(node, 'color', color);
        graph.setNodeAttribute(node, 'originalColor', color);
      });
    }
    communityDetected = true;
    if (toggleBtn) toggleBtn.textContent = '집단 표시 해제';
    if (toggleBtn) toggleBtn.classList.add('active');
  }

  if (sigmaInstance) {
    sigmaInstance.refresh();
  }
}

/**
 * 집단 정보 표시 업데이트
 */
function updateCommunityDisplay() {
  const communityInfo = document.getElementById('community-info');
  if (!communityInfo) return;

  if (Object.keys(communityNodes).length === 0) {
    communityInfo.innerHTML = '<p style="color: var(--panton-text-light);">집단 정보가 없습니다.</p>';
    return;
  }

  let html = '<table><thead><tr><th>집단 ID</th><th>노드 수</th><th>노드</th></tr></thead><tbody>';
  Object.keys(communityNodes).forEach(community => {
    const nodes = communityNodes[community];
    html += `<tr><td>${community}</td><td>${nodes.length}</td><td>${nodes.slice(0, 5).join(', ')}${nodes.length > 5 ? '...' : ''}</td></tr>`;
  });
  html += '</tbody></table>';

  communityInfo.innerHTML = html;
}

/**
 * 데이터 불러오기
 */
async function loadData() {
  const user = getCurrentUser();
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

    const listHtml = dataList.map((item, index) => {
      const dateTime = item.date && item.time ? `${item.date} ${item.time}` : 
                      item.createdAt ? new Date(item.createdAt).toLocaleString('ko-KR') : '날짜 없음';
      return `
        <div class="data-item" data-id="${item.id}" style="border: 1px solid #E1E8ED; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; background: #F5F7FA;">
          <div style="font-weight: 600; color: #2C3E50; margin-bottom: 0.5rem;">${item.title || '제목 없음'}</div>
          <div style="font-size: 0.875rem; color: #7F8C8D; margin-bottom: 0.5rem;">${item.description || '설명 없음'}</div>
          <div style="font-size: 0.75rem; color: #7F8C8D; margin-bottom: 0.75rem;">${dateTime}</div>
          <button class="load-data-item-btn" data-id="${item.id}" style="width: 100%; padding: 0.5rem; background: #4A90E2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem; font-weight: 500;">불러오기</button>
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
              const selectedItem = dataList.find(item => item.id === dataId);

              if (loadedData && loadedData.length > 0) {
                currentData = {
                  data: loadedData,
                  dataId: dataId,
                  title: selectedItem.title || '',
                  author: selectedItem.author || '',
                  description: selectedItem.description || ''
                };

                // 데이터 정보 표시
                document.getElementById('data-info').textContent = 
                  `${selectedItem.title || '제목 없음'} (${selectedItem.date || ''} ${selectedItem.time || ''})`;

                // 그래프 그리기
                await drawGraph(loadedData);

                // 집단 자동 감지 (표시는 하지 않음)
                detectCommunities();
                // 기본적으로 집단 표시는 꺼져있음
                communityDetected = false;
                const toggleBtn = document.getElementById('toggle-community-btn');
                if (toggleBtn) {
                  toggleBtn.textContent = '집단 표시';
                  toggleBtn.classList.remove('active');
                }

                // 보고서 에디터 표시
                document.getElementById('report-editor').style.display = 'block';

                // 작성자 자동 입력
                if (selectedItem.author) {
                  document.getElementById('report-author').value = selectedItem.author;
                }

                Swal.close();
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
}

/**
 * 보고서 불러오기
 */
async function loadReport() {
  const user = getCurrentUser();
  if (!user) {
    Swal.fire({
      title: '로그인 필요',
      text: '보고서를 불러오려면 로그인이 필요합니다.',
      icon: 'warning',
      confirmButtonColor: '#4A90E2'
    });
    return;
  }

  try {
    Swal.fire({
      title: '불러오는 중...',
      text: '저장된 보고서 목록을 불러오고 있습니다.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const reportsList = await getUserReportsList(user.uid);

    if (!reportsList || reportsList.length === 0) {
      Swal.fire({
        title: '저장된 보고서 없음',
        text: '저장된 보고서가 없습니다.',
        icon: 'info',
        confirmButtonColor: '#4A90E2'
      });
      return;
    }

    const listHtml = reportsList.map((item) => {
      const dateTime = item.updatedAt ? new Date(item.updatedAt).toLocaleString('ko-KR') : 
                      item.createdAt ? new Date(item.createdAt).toLocaleString('ko-KR') : '날짜 없음';
      return `
        <div class="report-item" data-id="${item.id}" style="border: 1px solid #E1E8ED; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; background: #F5F7FA;">
          <div style="font-weight: 600; color: #2C3E50; margin-bottom: 0.5rem;">${item.reportTitle || '제목 없음'}</div>
          <div style="font-size: 0.875rem; color: #7F8C8D; margin-bottom: 0.5rem;">작성자: ${item.author || '없음'}</div>
          <div style="font-size: 0.75rem; color: #7F8C8D; margin-bottom: 0.75rem;">${dateTime}</div>
          <button class="load-report-item-btn" data-id="${item.id}" style="width: 100%; padding: 0.5rem; background: #4A90E2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem; font-weight: 500;">불러오기</button>
        </div>
      `;
    }).join('');

    await Swal.fire({
      title: '보고서 불러오기',
      html: `
        <div id="report-list-container" style="max-height: 400px; overflow-y: auto; text-align: left;">
          ${listHtml}
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: '닫기',
      cancelButtonColor: '#7F8C8D',
      width: '600px',
      didOpen: () => {
        const loadButtons = document.querySelectorAll('.load-report-item-btn');
        loadButtons.forEach(btn => {
          btn.addEventListener('click', async () => {
            const reportId = btn.dataset.id;
            Swal.close();

            Swal.fire({
              title: '불러오는 중...',
              text: '보고서를 불러오고 있습니다.',
              allowOutsideClick: false,
              didOpen: () => {
                Swal.showLoading();
              }
            });

            try {
              const report = await loadReportFromFirebase(reportId);

              // 보고서 데이터 로드
              currentReportId = report.id;
              
              // data가 JSON 문자열인 경우 파싱
              let reportData = report.data;
              if (typeof report.data === 'string') {
                try {
                  reportData = JSON.parse(report.data);
                } catch (e) {
                  console.warn('데이터 파싱 실패, 원본 사용:', e);
                  reportData = report.data;
                }
              }
              
              currentData = {
                data: reportData,
                dataId: report.dataId,
                title: report.dataTitle || '',
                author: report.author || '',
                description: report.dataDescription || ''
              };

              // 보고서 에디터 먼저 표시
              document.getElementById('report-editor').style.display = 'block';

              // 폼 채우기
              document.getElementById('report-title').value = report.reportTitle || '';
              document.getElementById('report-author').value = report.author || '';
              document.getElementById('report-content').value = report.content || '';
              document.getElementById('report-conclusion').value = report.conclusion || '';
              document.getElementById('report-limitations').value = report.limitations || '';
              document.getElementById('report-questions').value = report.questions || '';

              // 데이터 정보 표시
              document.getElementById('data-info').textContent = 
                `${report.dataTitle || '제목 없음'} (${report.dataDate || ''})`;

              // DOM 렌더링 대기 후 그래프 그리기
              if (reportData && reportData.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
                await drawGraph(reportData);
              }

              // 집단 정보 복원
              if (report.communityNodes) {
                // 저장된 데이터가 문자열인 경우 배열로 변환
                communityNodes = {};
                Object.keys(report.communityNodes).forEach(community => {
                  const nodes = report.communityNodes[community];
                  // 문자열인 경우 split, 이미 배열인 경우 그대로 사용 (하위 호환성)
                  communityNodes[community] = typeof nodes === 'string' ? nodes.split(',') : nodes;
                });
                communityColors = report.communityColors || {};
                // 저장된 상태와 관계없이 기본적으로는 꺼져있음
                communityDetected = false;
                updateCommunityDisplay();
                
                // 집단 정보는 복원했지만 표시는 하지 않음
                const toggleBtn = document.getElementById('toggle-community-btn');
                if (toggleBtn) {
                  toggleBtn.textContent = '집단 표시';
                  toggleBtn.classList.remove('active');
                }
              } else {
                // 집단 정보가 없으면 감지
                detectCommunities();
                communityDetected = false;
                const toggleBtn = document.getElementById('toggle-community-btn');
                if (toggleBtn) {
                  toggleBtn.textContent = '집단 표시';
                  toggleBtn.classList.remove('active');
                }
              }
              
              // 중심성 정보 복원
              if (report.centralityNodes) {
                if (typeof report.centralityNodes === 'string') {
                  try {
                    centralityNodes = JSON.parse(report.centralityNodes);
                  } catch (e) {
                    console.warn('중심성 데이터 파싱 실패:', e);
                    centralityNodes = Array.isArray(report.centralityNodes) ? report.centralityNodes : [];
                  }
                } else {
                  centralityNodes = Array.isArray(report.centralityNodes) ? report.centralityNodes : [];
                }
                updateCentralityDisplay();
              }

              // 보고서 에디터 표시
              document.getElementById('report-editor').style.display = 'block';

              Swal.close();
            } catch (error) {
              console.error('불러오기 오류:', error);
              Swal.fire({
                title: '오류',
                text: error.message || '보고서를 불러오는 중 오류가 발생했습니다.',
                icon: 'error',
                confirmButtonColor: '#4A90E2'
              });
            }
          });
        });
      }
    });
  } catch (error) {
    console.error('불러오기 오류:', error);
    Swal.fire({
      title: '오류',
      text: error.message || '보고서를 불러오는 중 오류가 발생했습니다.',
      icon: 'error',
      confirmButtonColor: '#4A90E2'
    });
  }
}

/**
 * 보고서 저장
 */
async function saveReport() {
  const user = getCurrentUser();
  if (!user) {
    Swal.fire({
      title: '로그인 필요',
      text: '보고서를 저장하려면 로그인이 필요합니다.',
      icon: 'warning',
      confirmButtonColor: '#4A90E2'
    });
    return;
  }

  if (!currentData) {
    Swal.fire({
      title: '오류',
      text: '데이터가 로드되지 않았습니다.',
      icon: 'error',
      confirmButtonColor: '#4A90E2'
    });
    return;
  }

  const reportTitle = document.getElementById('report-title').value.trim();
  if (!reportTitle) {
    Swal.fire({
      title: '입력 필요',
      text: '보고서 제목을 입력해주세요.',
      icon: 'warning',
      confirmButtonColor: '#4A90E2'
    });
    return;
  }

  try {
    Swal.fire({
      title: '저장 중...',
      text: '보고서를 저장하고 있습니다.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // Firestore는 중첩 배열을 지원하지 않으므로 데이터 변환
    // communityNodes의 배열을 문자열로 변환
    const communityNodesForSave = {};
    Object.keys(communityNodes).forEach(community => {
      communityNodesForSave[community] = communityNodes[community].join(',');
    });
    
    // data가 2D 배열인 경우 JSON 문자열로 변환
    let dataForSave = currentData.data;
    if (Array.isArray(currentData.data) && currentData.data.length > 0 && Array.isArray(currentData.data[0])) {
      // 2D 배열인 경우 JSON 문자열로 변환
      dataForSave = JSON.stringify(currentData.data);
    }
    
    // centralityNodes는 객체 배열이므로 JSON 문자열로 변환
    const centralityNodesForSave = JSON.stringify(centralityNodes.slice(0, 10));
    
    const reportData = {
      reportTitle: reportTitle,
      author: document.getElementById('report-author').value.trim(),
      content: document.getElementById('report-content').value.trim(),
      conclusion: document.getElementById('report-conclusion').value.trim(),
      limitations: document.getElementById('report-limitations').value.trim(),
      questions: document.getElementById('report-questions').value.trim(),
      data: dataForSave, // 2D 배열인 경우 JSON 문자열로 변환
      dataId: currentData.dataId,
      dataTitle: currentData.title,
      dataDescription: currentData.description,
      dataDate: currentData.date || new Date().toISOString().split('T')[0],
      communityNodes: communityNodesForSave, // 배열을 문자열로 변환
      communityColors: communityColors,
      communityDetected: communityDetected,
      centralityNodes: centralityNodesForSave // JSON 문자열로 변환
    };

    if (currentReportId) {
      // 기존 보고서 업데이트
      await updateReportInFirebase(currentReportId, reportData);
      Swal.fire({
        title: '저장 완료',
        text: '보고서가 업데이트되었습니다.',
        icon: 'success',
        confirmButtonColor: '#4A90E2',
        timer: 2000,
        timerProgressBar: true
      });
    } else {
      // 새 보고서 저장
      const docId = await saveReportToFirebase(reportData, user.uid);
      currentReportId = docId;
      Swal.fire({
        title: '저장 완료',
        text: '보고서가 저장되었습니다.',
        icon: 'success',
        confirmButtonColor: '#4A90E2',
        timer: 2000,
        timerProgressBar: true
      });
    }
  } catch (error) {
    console.error('저장 오류:', error);
    Swal.fire({
      title: '저장 실패',
      text: error.message || '보고서 저장 중 오류가 발생했습니다.',
      icon: 'error',
      confirmButtonColor: '#4A90E2'
    });
  }
}

/**
 * HTML로 다운로드
 */
function downloadHTML() {
  if (!currentData) {
    Swal.fire({
      title: '오류',
      text: '데이터가 로드되지 않았습니다.',
      icon: 'error',
      confirmButtonColor: '#4A90E2'
    });
    return;
  }

  const reportTitle = document.getElementById('report-title').value.trim() || '보고서';
  const author = document.getElementById('report-author').value.trim() || '';
  const content = document.getElementById('report-content').value.trim();
  const conclusion = document.getElementById('report-conclusion').value.trim();
  const limitations = document.getElementById('report-limitations').value.trim();
  const questions = document.getElementById('report-questions').value.trim();

  // 그래프를 이미지로 변환
  let graphImage = '';
  
  if (sigmaInstance && graph) {
    try {
      const { width, height } = sigmaInstance.getDimensions();
      const pixelRatio = window.devicePixelRatio || 1;

      const tmpRoot = document.createElement("DIV");
      tmpRoot.style.width = `${width}px`;
      tmpRoot.style.height = `${height}px`;
      tmpRoot.style.position = "absolute";
      tmpRoot.style.right = "101%";
      tmpRoot.style.bottom = "101%";
      document.body.appendChild(tmpRoot);

      const tmpRenderer = new Sigma(graph, tmpRoot, sigmaInstance.getSettings());
      tmpRenderer.getCamera().setState(sigmaInstance.getCamera().getState());
      tmpRenderer.refresh();

      const canvas = document.createElement("CANVAS");
      canvas.setAttribute("width", width * pixelRatio + "");
      canvas.setAttribute("height", height * pixelRatio + "");
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width * pixelRatio, height * pixelRatio);

      const canvases = tmpRenderer.getCanvases();
      const layers = Object.keys(canvases);
      layers.forEach((id) => {
        ctx.drawImage(
          canvases[id],
          0, 0, width * pixelRatio, height * pixelRatio,
          0, 0, width * pixelRatio, height * pixelRatio
        );
      });

      graphImage = canvas.toDataURL("image/png");
      tmpRenderer.kill();
      tmpRoot.remove();
    } catch (error) {
      console.error('그래프 이미지 생성 오류:', error);
    }
  }

  // 집단 정보 HTML 생성
  let communityHtml = '';
  if (Object.keys(communityNodes).length > 0) {
    communityHtml = '<h3>집단 정보</h3><table><thead><tr><th>집단 ID</th><th>노드 수</th><th>노드</th></tr></thead><tbody>';
    Object.keys(communityNodes).forEach(community => {
      const nodes = communityNodes[community];
      communityHtml += `<tr><td>${community}</td><td>${nodes.length}</td><td>${nodes.join(', ')}</td></tr>`;
    });
    communityHtml += '</tbody></table>';
  }

  // 중심성 정보 HTML 생성
  let centralityHtml = '';
  if (centralityNodes.length > 0) {
    const hasEigenvector = centralityNodes.some(n => n.eigenvectorCentrality !== 'N/A' && n.eigenvectorCentrality !== undefined);
    const sortedNodes = [...centralityNodes].sort((a, b) => b.degreeCentrality - a.degreeCentrality).slice(0, 10);
    centralityHtml = '<h3>중심성 Top 10</h3><table><thead><tr><th>노드</th><th>연결 중심성</th>';
    if (hasEigenvector) {
      centralityHtml += '<th>고유벡터 중심성</th>';
    }
    centralityHtml += '</tr></thead><tbody>';
    sortedNodes.forEach(({ node, degreeCentrality, eigenvectorCentrality }) => {
      centralityHtml += `<tr><td>${node}</td><td>${degreeCentrality.toFixed(3)}</td>`;
      if (hasEigenvector) {
        centralityHtml += `<td>${eigenvectorCentrality === 'N/A' ? 'N/A' : eigenvectorCentrality.toFixed(3)}</td>`;
      }
      centralityHtml += '</tr>';
    });
    centralityHtml += '</tbody></table>';
  }

  const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportTitle}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #2C3E50;
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
      background: #F5F7FA;
    }
    .report-header {
      background: white;
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .report-header h1 {
      font-size: 2.5rem;
      margin-bottom: 1rem;
      color: #2C3E50;
    }
    .report-meta {
      display: flex;
      gap: 2rem;
      margin-top: 1rem;
      font-size: 0.9rem;
      color: #7F8C8D;
    }
    .report-content {
      background: white;
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .report-content h2 {
      font-size: 1.5rem;
      margin-bottom: 1rem;
      color: #2C3E50;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #E1E8ED;
    }
    .report-content p {
      margin-bottom: 1rem;
      white-space: pre-wrap;
    }
    .graph-section {
      background: white;
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .graph-section img {
      max-width: 100%;
      height: auto;
      border: 1px solid #E1E8ED;
      border-radius: 8px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
      margin-top: 2rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }
    table th, table td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #E1E8ED;
    }
    table th {
      background: #F5F7FA;
      font-weight: 600;
      color: #2C3E50;
    }
    @media print {
      body { background: white; }
      .report-header, .report-content, .graph-section {
        box-shadow: none;
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>${reportTitle}</h1>
    <div class="report-meta">
      ${author ? `<div><strong>작성자:</strong> ${author}</div>` : ''}
      <div><strong>작성일:</strong> ${new Date().toLocaleDateString('ko-KR')}</div>
      <div><strong>데이터:</strong> ${currentData.title || '제목 없음'}</div>
    </div>
  </div>

  <div class="graph-section">
    <h2>그래프 시각화</h2>
    ${graphImage ? `<img src="${graphImage}" alt="네트워크 그래프">` : '<p>그래프 이미지를 생성할 수 없습니다.</p>'}
    <div class="stats-grid">
      <div>
        ${communityHtml}
      </div>
      <div>
        ${centralityHtml}
      </div>
    </div>
  </div>

  <div class="report-content">
    <h2>보고서 내용</h2>
    <p>${content || '내용이 없습니다.'}</p>
  </div>

  ${conclusion ? `
  <div class="report-content">
    <h2>종합 해석 / 결론</h2>
    <p>${conclusion}</p>
  </div>
  ` : ''}

  ${limitations ? `
  <div class="report-content">
    <h2>한계점</h2>
    <p>${limitations}</p>
  </div>
  ` : ''}

  ${questions ? `
  <div class="report-content">
    <h2>추가 질문</h2>
    <p>${questions}</p>
  </div>
  ` : ''}
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  FileSaver.saveAs(blob, `${reportTitle.replace(/[^a-z0-9가-힣]/gi, '_')}.html`);
}

/**
 * 보고서 초기화 (새로 작성하기)
 */
function resetReport() {
  Swal.fire({
    title: '새로 작성하기',
    text: '현재 작성 중인 보고서를 초기화하시겠습니까? 모든 내용이 삭제됩니다.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '초기화',
    cancelButtonText: '취소',
    confirmButtonColor: '#4A90E2',
    cancelButtonColor: '#7F8C8D'
  }).then((result) => {
    if (result.isConfirmed) {
      // 보고서 에디터 숨기기
      const reportEditor = document.getElementById('report-editor');
      if (reportEditor) {
        reportEditor.style.display = 'none';
      }

      // 폼 초기화
      document.getElementById('report-title').value = '';
      document.getElementById('report-author').value = '';
      document.getElementById('report-content').value = '';
      document.getElementById('report-conclusion').value = '';
      document.getElementById('report-limitations').value = '';
      document.getElementById('report-questions').value = '';
      document.getElementById('data-info').textContent = '';

      // 그래프 초기화
      if (sigmaInstance) {
        sigmaInstance.kill();
        sigmaInstance = null;
      }
      const container = document.getElementById('sigma-container');
      if (container) {
        container.innerHTML = '';
      }

      // 변수 초기화
      graph = null;
      currentData = null;
      currentReportId = null;
      communityNodes = {};
      communityColors = {};
      communityDetected = false;
      centralityNodes = [];

      // 집단 정보 및 중심성 정보 초기화
      const communityInfo = document.getElementById('community-info');
      if (communityInfo) {
        communityInfo.innerHTML = '';
      }
      const centralityInfo = document.getElementById('centrality-info');
      if (centralityInfo) {
        centralityInfo.innerHTML = '';
      }

      // 집단 표시 버튼 초기화
      const toggleBtn = document.getElementById('toggle-community-btn');
      if (toggleBtn) {
        toggleBtn.textContent = '집단 표시';
        toggleBtn.classList.remove('active');
      }

      // 정렬 버튼 초기화
      const sortByDegreeBtn = document.getElementById('sort-by-degree-btn');
      const sortByEigenBtn = document.getElementById('sort-by-eigen-btn');
      if (sortByDegreeBtn) {
        sortByDegreeBtn.classList.add('active');
      }
      if (sortByEigenBtn) {
        sortByEigenBtn.classList.remove('active');
        sortByEigenBtn.style.display = 'none';
      }

      Swal.fire({
        title: '초기화 완료',
        text: '새로운 보고서를 작성할 수 있습니다.',
        icon: 'success',
        confirmButtonColor: '#4A90E2',
        timer: 2000,
        timerProgressBar: true
      });
    }
  });
}

/**
 * 초기화
 */
function init() {
  initializeFirebase();

  // 데이터 불러오기 버튼
  const loadDataBtn = document.getElementById('load-data-btn');
  if (loadDataBtn) {
    loadDataBtn.addEventListener('click', loadData);
  }

  // 보고서 불러오기 버튼
  const loadReportBtn = document.getElementById('load-report-btn');
  if (loadReportBtn) {
    loadReportBtn.addEventListener('click', loadReport);
  }

  // 새로 작성하기 버튼
  const newReportBtn = document.getElementById('new-report-btn');
  if (newReportBtn) {
    newReportBtn.addEventListener('click', resetReport);
  }

  // 집단 표시 토글 버튼
  const toggleCommunityBtn = document.getElementById('toggle-community-btn');
  if (toggleCommunityBtn) {
    toggleCommunityBtn.addEventListener('click', toggleCommunityDisplay);
  }

  // 중심성 정렬 버튼
  const sortByDegreeBtn = document.getElementById('sort-by-degree-btn');
  const sortByEigenBtn = document.getElementById('sort-by-eigen-btn');
  
  if (sortByDegreeBtn) {
    sortByDegreeBtn.addEventListener('click', () => {
      sortByDegreeBtn.classList.add('active');
      if (sortByEigenBtn) sortByEigenBtn.classList.remove('active');
      updateCentralityDisplay('degree');
    });
  }
  
  if (sortByEigenBtn) {
    sortByEigenBtn.addEventListener('click', () => {
      sortByEigenBtn.classList.add('active');
      if (sortByDegreeBtn) sortByDegreeBtn.classList.remove('active');
      updateCentralityDisplay('eigen');
    });
  }

  // 보고서 저장 버튼
  const saveReportBtn = document.getElementById('save-report-btn');
  if (saveReportBtn) {
    saveReportBtn.addEventListener('click', saveReport);
  }

  // HTML 다운로드 버튼
  const downloadHtmlBtn = document.getElementById('download-html-btn');
  if (downloadHtmlBtn) {
    downloadHtmlBtn.addEventListener('click', downloadHTML);
  }
}

// DOM 로드 후 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

