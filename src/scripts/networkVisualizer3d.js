/**
 * 3D 그래프 시각화 기능
 * 3d-force-graph를 사용하여 3D 렌더링
 */

import ForceGraph3D from '3d-force-graph';
import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import { degreeCentrality } from 'graphology-metrics/centrality/degree';
import eigenvectorCentrality from 'graphology-metrics/centrality/eigenvector';
import Swal from 'sweetalert2';

let graph = null;
let forceGraph3D = null;
let container = null;
let comResolution = 1;
let highlightedNodes = new Set();
let communityNodes = {};
let communityColors = {};
let degreeCen = null;
let eigenCen = null;
let centralityNodes = [];
let graphData3D = null; // 3D 그래프 데이터 저장

/**
 * Handsontable 데이터를 그래프 데이터 형식으로 변환
 * @param {Array} tableData - Handsontable의 2D 배열 데이터
 * @returns {Array} 그래프 데이터 배열 [{Source1, Source2, Weight}, ...]
 */
function convertTableDataToGraphData(tableData) {
  if (!tableData || tableData.length === 0) {
    return [];
  }

  // Handsontable은 colHeaders로 헤더를 별도 관리하므로, 
  // 첫 번째 행이 헤더인지 데이터인지 확인
  let dataStartIndex = 0;
  let source1Index = 0;
  let source2Index = 1;
  let weightIndex = 2;

  // 첫 번째 행이 헤더인지 확인 (문자열이고 헤더 키워드 포함)
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
      // 첫 번째 행이 헤더인 경우
      dataStartIndex = 1;
      const headers = firstRow;
      
      // 안전하게 헤더 인덱스 찾기
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

      // 기본값 설정
      if (source1Index < 0) source1Index = 0;
      if (source2Index < 0) source2Index = source1Index >= 0 ? 1 : 1;
      if (weightIndex < 0) weightIndex = 2;
    }
  }

  const graphData = [];
  
  // 데이터 행 처리
  for (let i = dataStartIndex; i < tableData.length; i++) {
    const row = tableData[i];
    if (!Array.isArray(row) || row.length < 3) continue;
    
    const source1 = row[source1Index];
    const source2 = row[source2Index];
    const weight = row[weightIndex];

    // 빈 행 건너뛰기
    if (!source1 || !source2) continue;

    // Weight가 없으면 1로 설정
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
 * graphology Graph를 3d-force-graph 형식으로 변환
 * @param {Graph} graphologyGraph - graphology Graph 객체
 * @returns {Object} {nodes: Array, links: Array}
 */
function convertGraphTo3DFormat(graphologyGraph) {
  const nodes = [];
  const links = [];
  const nodeMap = new Map();
  
  // 노드 변환
  graphologyGraph.forEachNode((nodeId, attributes) => {
    const node = {
      id: nodeId,
      name: attributes.label || nodeId,
      val: attributes.size || 3,
      color: attributes.color || '#666'
    };
    nodes.push(node);
    nodeMap.set(nodeId, node);
  });
  
  // 링크 변환
  graphologyGraph.forEachEdge((edgeId, attributes, source, target) => {
    links.push({
      source: source,
      target: target,
      value: attributes.weight || 1
    });
  });
  
  return { nodes, links };
}

/**
 * 3D 그래프 그리기
 */
export function drawGraph() {
  const errorDisplay = document.getElementById('error-display');
  const fullScreenButton = document.getElementById('full-screen-button');
  
  if (errorDisplay) {
    errorDisplay.style.display = 'none';
    errorDisplay.style.visibility = 'hidden';
  }
  
  if (fullScreenButton) {
    fullScreenButton.style.display = 'inline-block';
  }

  comResolution = 1;

  // Handsontable에서 데이터 가져오기
  const tableData = window.networkVisualizer?.getData();
  
  if (!tableData || tableData.length < 2) {
    if (errorDisplay) {
      errorDisplay.textContent = '그래프를 그리기 위해 데이터를 먼저 로드해주세요.';
      errorDisplay.style.display = 'block';
      errorDisplay.style.visibility = 'visible';
    }
    return;
  }

  // 테이블 데이터를 그래프 데이터로 변환
  const graphData = convertTableDataToGraphData(tableData);
  
  if (graphData.length === 0) {
    if (errorDisplay) {
      errorDisplay.textContent = '유효한 그래프 데이터가 없습니다. Source1, Source2, Weight 형식의 데이터가 필요합니다.';
      errorDisplay.style.display = 'block';
      errorDisplay.style.visibility = 'visible';
    }
    return;
  }

  // 그래프 생성 (graphology - 분석용)
  graph = new Graph();

  // 최대 가중치 찾기
  let maxWeight = 0;
  graphData.forEach(row => {
    if (row.Weight > maxWeight) {
      maxWeight = row.Weight;
    }
  });

  // 노드와 엣지 추가
  graphData.forEach(row => {
    const { Source1, Source2, Weight } = row;

    if (!graph.hasNode(Source1)) {
      graph.addNode(Source1, { label: Source1 });
    }
    if (!graph.hasNode(Source2)) {
      graph.addNode(Source2, { label: Source2 });
    }
    
    // 중복 엣지 방지
    if (!graph.hasEdge(Source1, Source2)) {
      graph.addEdge(Source1, Source2, { 
        weight: Weight
      });
    }
  });

  // 노드 크기를 degree에 따라 조정
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

  // 3D 형식으로 변환
  graphData3D = convertGraphTo3DFormat(graph);

  // 기존 그래프 제거
  if (forceGraph3D) {
    forceGraph3D._destructor();
    forceGraph3D = null;
  }

  // 컨테이너 설정
  container = document.getElementById('graph-container-3d');
  if (!container) {
    console.error('graph-container-3d를 찾을 수 없습니다.');
    return;
  }

  container.innerHTML = '';
  
  // 컨테이너의 실제 크기 가져오기
  const containerRect = container.getBoundingClientRect();
  const containerWidth = containerRect.width || container.clientWidth || 800;
  const containerHeight = containerRect.height || container.clientHeight || 500;

  // 3D Force Graph 생성
  forceGraph3D = new ForceGraph3D(container)
    .width(containerWidth)
    .height(containerHeight)
    .graphData(graphData3D)
    .nodeLabel(node => node.name)
    .nodeColor(node => node.color)
    .nodeVal(node => node.val)
    .linkWidth(link => Math.max(1, link.value || 1))
    .linkDirectionalArrowLength(3)
    .linkDirectionalArrowRelPos(1)
    .linkDirectionalParticles(0)
    .onNodeHover(node => {
      if (node) {
        // 호버된 노드와 이웃 노드 강조
        const neighbors = new Set(graph.neighbors(node.id));
        neighbors.add(node.id);
        highlightedNodes = neighbors;
        updateGraphColors3D();
      } else {
        highlightedNodes = new Set();
        updateGraphColors3D();
      }
    })
    .onNodeClick(node => {
      // 노드 클릭 시 정보 표시 (선택사항)
      if (node) {
        const degree = graph.degree(node.id);
        Swal.fire({
          title: node.name,
          html: `
            <p><strong>연결 수:</strong> ${degree}</p>
            ${degreeCen ? `<p><strong>연결 중심성:</strong> ${(degreeCen[node.id] || 0).toFixed(3)}</p>` : ''}
            ${eigenCen ? `<p><strong>고유벡터 중심성:</strong> ${(eigenCen[node.id] || 'N/A')}</p>` : ''}
          `,
          icon: 'info',
          confirmButtonColor: '#4A90E2'
        });
      }
    });
  
  // 창 크기 변경 시 그래프 크기 조정
  const resizeHandler = () => {
    if (forceGraph3D && container) {
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width || container.clientWidth || 800;
      const containerHeight = containerRect.height || container.clientHeight || 500;
      forceGraph3D.width(containerWidth).height(containerHeight);
    }
  };
  
  // 기존 리사이즈 핸들러 제거 (중복 방지)
  if (window.graph3DResizeHandler) {
    window.removeEventListener('resize', window.graph3DResizeHandler);
  }
  window.graph3DResizeHandler = resizeHandler;
  window.addEventListener('resize', resizeHandler);

  if (errorDisplay) {
    errorDisplay.style.display = 'none';
    errorDisplay.style.visibility = 'hidden';
  }

  // 그리드 레이아웃을 2행으로 변경
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.classList.add('has-graph');
  }

  // 추가 컨트롤 패널 표시 (2x2 그리드 레이아웃)
  const additionalControl = document.getElementById('additional-contents');
  const bottomLeftGrid = additionalControl?.closest('.bottom-left');
  if (bottomLeftGrid) {
    bottomLeftGrid.style.display = 'flex';
  }
  if (additionalControl) {
    additionalControl.style.display = 'flex';
  }

  const centralityTable = document.getElementById('additional-contents-centrality');
  const bottomRightGrid = centralityTable?.closest('.bottom-right');
  if (bottomRightGrid) {
    bottomRightGrid.style.display = 'flex';
  }
  if (centralityTable) {
    centralityTable.style.display = 'flex';
  }

  // 커뮤니티 및 중심성 테이블 초기화
  const centralityBody = document.getElementById('centrality-body');
  const communityBody = document.getElementById('community-body');
  if (centralityBody) {
    centralityBody.innerHTML = '';
  }
  if (communityBody) {
    communityBody.innerHTML = '';
  }

  // 커뮤니티 감지 관련 버튼 초기화
  const comDetectOn = document.getElementById('com-detect-on');
  const comDetectOff = document.getElementById('com-detect-off');
  const comIncrease = document.getElementById('com-increase');
  const comDecrease = document.getElementById('com-decrease');
  if (comDetectOn) comDetectOn.style.display = 'block';
  if (comDetectOff) comDetectOff.style.display = 'none';
  if (comIncrease) comIncrease.style.display = 'none';
  if (comDecrease) comDecrease.style.display = 'none';

  // 중심성 계산 관련 버튼 초기화
  const sortByDegree = document.getElementById('sort-by-degree');
  const sortByEigen = document.getElementById('sort-by-eigen');
  if (sortByDegree) sortByDegree.style.display = 'none';
  if (sortByEigen) sortByEigen.style.display = 'none';
}

/**
 * 3D 그래프 색상 업데이트 (호버 효과)
 */
function updateGraphColors3D() {
  if (!graph || !graphData3D || !forceGraph3D) return;

  graphData3D.nodes.forEach(node => {
    if (highlightedNodes.size === 0 || highlightedNodes.has(node.id)) {
      // 원래 색상 유지
      node.color = graph.getNodeAttribute(node.id, 'originalColor') || '#666';
    } else {
      // 흐리게 표시
      node.color = '#EEE';
    }
  });

  // 그래프 데이터 업데이트
  forceGraph3D.graphData(graphData3D);
}

/**
 * 전체화면 모드
 */
export function setupFullScreen() {
  const fullScreenButton = document.getElementById('full-screen-button');
  if (!fullScreenButton) return;

  fullScreenButton.addEventListener('click', () => {
    const graphDisplay = document.getElementById('graph-container-3d');
    if (!graphDisplay) return;

    if (graphDisplay.requestFullscreen) {
      graphDisplay.requestFullscreen();
    } else if (graphDisplay.mozRequestFullScreen) {
      graphDisplay.mozRequestFullScreen();
    } else if (graphDisplay.webkitRequestFullscreen) {
      graphDisplay.webkitRequestFullscreen();
    } else if (graphDisplay.msRequestFullscreen) {
      graphDisplay.msRequestFullscreen();
    }
    graphDisplay.classList.add('fullscreen');
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      const graphDisplay = document.getElementById('graph-container-3d');
      if (graphDisplay) {
        graphDisplay.classList.remove('fullscreen');
      }
    }
  });
}

/**
 * 그래프 초기화 (모든 그래프 관련 상태 제거)
 */
export function resetGraph() {
  // 리사이즈 핸들러 제거
  if (window.graph3DResizeHandler) {
    window.removeEventListener('resize', window.graph3DResizeHandler);
    window.graph3DResizeHandler = null;
  }
  
  // ForceGraph3D 인스턴스 제거
  if (forceGraph3D) {
    try {
      forceGraph3D._destructor();
      forceGraph3D = null;
    } catch (e) {
      console.error('ForceGraph3D 인스턴스 제거 오류:', e);
    }
  }
  
  // 그래프 변수 초기화
  graph = null;
  graphData3D = null;
  comResolution = 1;
  highlightedNodes = new Set();
  communityNodes = {};
  communityColors = {};
  degreeCen = null;
  eigenCen = null;
  centralityNodes = [];
  
  // 그래프 컨테이너 비우기
  container = document.getElementById('graph-container-3d');
  if (container) {
    container.innerHTML = '';
  }
  
  // 그래프 관련 버튼 숨기기
  const fullScreenButton = document.getElementById('full-screen-button');
  const errorDisplay = document.getElementById('error-display');
  
  if (fullScreenButton) {
    fullScreenButton.style.display = 'none';
  }
  if (errorDisplay) {
    errorDisplay.style.display = 'none';
    errorDisplay.style.visibility = 'hidden';
  }

  // 그리드 레이아웃을 1행으로 변경
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.classList.remove('has-graph');
  }

  // 추가 섹션 숨기기
  const additionalControl = document.getElementById('additional-contents');
  const centralityTable = document.getElementById('additional-contents-centrality');
  const bottomLeftGrid = additionalControl?.closest('.bottom-left');
  const bottomRightGrid = centralityTable?.closest('.bottom-right');
  
  if (bottomLeftGrid) {
    bottomLeftGrid.style.display = 'none';
  }
  if (bottomRightGrid) {
    bottomRightGrid.style.display = 'none';
  }
  if (additionalControl) {
    additionalControl.style.display = 'none';
  }
  if (centralityTable) {
    centralityTable.style.display = 'none';
  }

  // 커뮤니티 감지 관련 버튼 초기화
  const comDetectOn = document.getElementById('com-detect-on');
  const comDetectOff = document.getElementById('com-detect-off');
  const comList = document.getElementById('community-table-panel');
  const comIncrease = document.getElementById('com-increase');
  const comDecrease = document.getElementById('com-decrease');
  if (comDetectOn) comDetectOn.style.display = 'block';
  if (comDetectOff) comDetectOff.style.display = 'none';
  if (comList) comList.style.display = 'none';
  if (comIncrease) comIncrease.style.display = 'none';
  if (comDecrease) comDecrease.style.display = 'none';

  // 중심성 계산 관련 버튼 초기화
  const centralityTablePanel = document.getElementById('centrality-table-panel');
  if (centralityTablePanel) centralityTablePanel.style.display = 'none';

  // 테이블 초기화
  const centralityBody = document.getElementById('centrality-body');
  const communityBody = document.getElementById('community-body');
  if (centralityBody) centralityBody.innerHTML = '';
  if (communityBody) communityBody.innerHTML = '';
}

/**
 * 집단 찾기 (커뮤니티 감지)
 */
function communityAssign() {
  if (!graph) return;

  const comDetectOn = document.getElementById('com-detect-on');
  const comDetectOff = document.getElementById('com-detect-off');
  const comIncrease = document.getElementById('com-increase');
  const comDecrease = document.getElementById('com-decrease');
  const comList = document.getElementById('community-table-panel');

  if (comDetectOn) comDetectOn.style.display = 'none';
  if (comDetectOff) comDetectOff.style.display = 'inline-block';
  if (comIncrease) comIncrease.style.display = 'inline-block';
  if (comDecrease) comDecrease.style.display = 'inline-block';
  // 집단 목록 자동 표시
  if (comList) comList.style.display = 'block';

  // Louvain 알고리즘으로 커뮤니티 감지
  louvain.assign(graph, {
    resolution: comResolution,
    randomWalk: false
  });

  // 커뮤니티 ID 수집
  const communitiesCount = new Set();
  graph.forEachNode((node, attributes) => {
    communitiesCount.add(attributes.community);
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

  communityColors = {};
  communitiesCount.forEach(community => {
    communityColors[community] = getRandomColor();
  });

  // 노드에 색상 할당
  graph.forEachNode((node, attributes) => {
    const community = attributes.community;
    const color = communityColors[community];
    graph.setNodeAttribute(node, 'color', color);
    graph.setNodeAttribute(node, 'originalColor', color);
  });

  // 3D 그래프 데이터 업데이트
  if (graphData3D) {
    graphData3D.nodes.forEach(node => {
      const color = graph.getNodeAttribute(node.id, 'color') || '#666';
      node.color = color;
    });
    forceGraph3D.graphData(graphData3D);
  }

  updateCommunityNodes(communityNodes);
}

/**
 * 집단 찾기 해제
 */
function singleCommunity() {
  if (!graph) return;

  const comDetectOn = document.getElementById('com-detect-on');
  const comDetectOff = document.getElementById('com-detect-off');
  const comList = document.getElementById('community-table-panel');
  const comIncrease = document.getElementById('com-increase');
  const comDecrease = document.getElementById('com-decrease');

  if (comDetectOn) comDetectOn.style.display = 'block';
  if (comDetectOff) comDetectOff.style.display = 'none';
  if (comList) comList.style.display = 'none';
  if (comIncrease) comIncrease.style.display = 'none';
  if (comDecrease) comDecrease.style.display = 'none';

  // 모든 노드를 회색으로 변경
  graph.forEachNode((node) => {
    graph.setNodeAttribute(node, 'color', '#666');
    graph.setNodeAttribute(node, 'originalColor', '#666');
  });

  // 3D 그래프 데이터 업데이트
  if (graphData3D) {
    graphData3D.nodes.forEach(node => {
      node.color = '#666';
    });
    forceGraph3D.graphData(graphData3D);
  }
}

/**
 * 집단 라벨 표시 (3D에서는 간단히 알림만 표시)
 */
function labelCommunity() {
  if (!graph) return;
  
  Swal.fire({
    title: '집단 정보',
    html: Object.keys(communityNodes).map(community => {
      const nodes = communityNodes[community];
      return `<p><strong>집단 ${community}:</strong> ${nodes.join(', ')}</p>`;
    }).join(''),
    icon: 'info',
    confirmButtonColor: '#4A90E2'
  });
}

/**
 * 커뮤니티 노드 목록 업데이트
 */
function updateCommunityNodes(communityNodes) {
  const communityBody = document.getElementById('community-body');
  if (!communityBody) return;

  communityBody.innerHTML = '';

  Object.keys(communityNodes).forEach(community => {
    const row = document.createElement('tr');
    const communityCell = document.createElement('td');
    communityCell.textContent = community;
    const nodesCell = document.createElement('td');
    nodesCell.textContent = communityNodes[community].join(', ');
    row.appendChild(communityCell);
    row.appendChild(nodesCell);
    communityBody.appendChild(row);
  });
}

/**
 * 집단 수 증가
 */
function increaseComResolution() {
  comResolution += 0.2;
  if (comResolution > 3) {
    Swal.fire({
      title: '알림',
      text: '집단의 수가 너무 많습니다. 처음으로 돌아갑니다.',
      icon: 'info',
      confirmButtonColor: '#4A90E2',
      timer: 2000,
      timerProgressBar: true
    });
    comResolution = 1;
    communityAssign();
  } else {
    communityAssign();
  }
}

/**
 * 집단 수 감소
 */
function decreaseComResolution() {
  comResolution -= 0.2;
  if (comResolution < 0) {
    Swal.fire({
      title: '알림',
      text: '집단의 수를 더 이상 줄일 수 없습니다.',
      icon: 'info',
      confirmButtonColor: '#4A90E2',
      timer: 2000,
      timerProgressBar: true
    });
    comResolution = 0;
  } else {
    communityAssign();
  }
}

/**
 * 중심성 계산
 */
function computeCentrality() {
  if (!graph) return;

  try {
    // Degree Centrality 계산
    degreeCen = degreeCentrality(graph);
    Object.keys(degreeCen).forEach(node => {
      graph.setNodeAttribute(node, 'degreeCentrality', parseFloat(degreeCen[node].toFixed(3)));
    });

    // Eigenvector Centrality 계산
    let eigenvectorCalculated = false;
    try {
      eigenCen = eigenvectorCentrality(graph);
      Object.keys(eigenCen).forEach(node => {
        graph.setNodeAttribute(node, 'eigenvectorCentrality', parseFloat(eigenCen[node].toFixed(3)));
      });
      eigenvectorCalculated = true;
    } catch (error) {
      console.error('Eigenvector Centrality 계산 오류:', error);
      graph.forEachNode(node => {
        graph.setNodeAttribute(node, 'eigenvectorCentrality', 'N/A');
      });
      eigenvectorCalculated = false;
    }

    // 정렬 컨트롤 표시
    const sortByDegree = document.getElementById('sort-by-degree');
    const sortByEigen = document.getElementById('sort-by-eigen');
    if (sortByDegree) sortByDegree.style.display = 'inline-block';
    // 고유벡터 중심성이 계산된 경우에만 표시
    if (sortByEigen) {
      sortByEigen.style.display = eigenvectorCalculated ? 'inline-block' : 'none';
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

    // Degree Centrality 기준으로 정렬
    sortByDC();

    // 테이블 표시
    const centralityTable = document.getElementById('centrality-table-panel');
    if (centralityTable) {
      centralityTable.style.display = 'block';
    }
  } catch (error) {
    console.error('중심성 계산 오류:', error);
    Swal.fire({
      title: '오류',
      text: '중심성 계산 중 오류가 발생했습니다: ' + error.message,
      icon: 'error',
      confirmButtonColor: '#4A90E2'
    });
  }
}

/**
 * Degree Centrality로 정렬
 */
function sortByDC() {
  const centralityBody = document.getElementById('centrality-body');
  if (!centralityBody || !centralityNodes.length) return;

  centralityBody.innerHTML = '';

  // Degree Centrality 기준으로 정렬
  const sortedNodes = [...centralityNodes].sort((a, b) => {
    if (b.degreeCentrality !== a.degreeCentrality) {
      return b.degreeCentrality - a.degreeCentrality;
    } else {
      if (a.eigenvectorCentrality === 'N/A') return 1;
      if (b.eigenvectorCentrality === 'N/A') return -1;
      return b.eigenvectorCentrality - a.eigenvectorCentrality;
    }
  });

  // 상위 10개 노드 추출
  const top10Nodes = new Set(sortedNodes.slice(0, 10).map(n => n.node));

  // 테이블에 데이터 추가
  sortedNodes.forEach(({ node, degreeCentrality, eigenvectorCentrality }) => {
    const row = document.createElement('tr');

    // 상위 10개 노드 강조
    if (top10Nodes.has(node)) {
      row.style.fontWeight = 'bold';
      row.style.border = '2px solid var(--panton-blue)';
    }

    const nodeCell = document.createElement('td');
    nodeCell.textContent = node;
    const degreeCell = document.createElement('td');
    degreeCell.textContent = degreeCentrality.toFixed(3);
    const eigenCell = document.createElement('td');
    eigenCell.textContent = eigenvectorCentrality === 'N/A' ? 'N/A' : eigenvectorCentrality.toFixed(3);
    
    row.appendChild(nodeCell);
    row.appendChild(degreeCell);
    row.appendChild(eigenCell);
    centralityBody.appendChild(row);
  });
}

/**
 * Eigenvector Centrality로 정렬
 */
function sortByEC() {
  const centralityBody = document.getElementById('centrality-body');
  if (!centralityBody || !centralityNodes.length) return;

  centralityBody.innerHTML = '';

  // Eigenvector Centrality 기준으로 정렬
  const sortedNodes = [...centralityNodes].sort((a, b) => {
    if (a.eigenvectorCentrality === 'N/A') return 1;
    if (b.eigenvectorCentrality === 'N/A') return -1;
    if (b.eigenvectorCentrality !== a.eigenvectorCentrality) {
      return b.eigenvectorCentrality - a.eigenvectorCentrality;
    } else {
      return b.degreeCentrality - a.degreeCentrality;
    }
  });

  // 상위 10개 노드 추출
  const top10Nodes = new Set(sortedNodes.slice(0, 10).map(n => n.node));

  // 테이블에 데이터 추가
  sortedNodes.forEach(({ node, degreeCentrality, eigenvectorCentrality }) => {
    const row = document.createElement('tr');

    // 상위 10개 노드 강조
    if (top10Nodes.has(node)) {
      row.style.fontWeight = 'bold';
      row.style.border = '2px solid var(--panton-blue)';
    }

    const nodeCell = document.createElement('td');
    nodeCell.textContent = node;
    const degreeCell = document.createElement('td');
    degreeCell.textContent = degreeCentrality.toFixed(3);
    const eigenCell = document.createElement('td');
    eigenCell.textContent = eigenvectorCentrality === 'N/A' ? 'N/A' : eigenvectorCentrality.toFixed(3);
    
    row.appendChild(nodeCell);
    row.appendChild(degreeCell);
    row.appendChild(eigenCell);
    centralityBody.appendChild(row);
  });
}

/**
 * 초기화 함수
 */
export function initGraphVisualizer() {
  const drawGraphBtn = document.getElementById('draw-graph-btn');
  if (drawGraphBtn) {
    drawGraphBtn.addEventListener('click', drawGraph);
  }

  // 집단 찾기 버튼 이벤트
  const comDetectOn = document.getElementById('com-detect-on');
  const comDetectOff = document.getElementById('com-detect-off');
  const comIncrease = document.getElementById('com-increase');
  const comDecrease = document.getElementById('com-decrease');

  if (comDetectOn) {
    comDetectOn.addEventListener('click', communityAssign);
  }
  if (comDetectOff) {
    comDetectOff.addEventListener('click', singleCommunity);
  }
  if (comIncrease) {
    comIncrease.addEventListener('click', increaseComResolution);
  }
  if (comDecrease) {
    comDecrease.addEventListener('click', decreaseComResolution);
  }

  // 중심성 계산 버튼 이벤트
  const computeCen = document.getElementById('compute-cen');
  const sortByDegree = document.getElementById('sort-by-degree');
  const sortByEigen = document.getElementById('sort-by-eigen');

  if (computeCen) {
    computeCen.addEventListener('click', computeCentrality);
  }
  if (sortByDegree) {
    sortByDegree.addEventListener('click', sortByDC);
  }
  if (sortByEigen) {
    sortByEigen.addEventListener('click', sortByEC);
  }

  setupFullScreen();
}

// DOM 로드 후 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGraphVisualizer);
} else {
  initGraphVisualizer();
}

// 전역으로 내보내기
window.drawGraph = drawGraph;
window.resetGraph = resetGraph;

