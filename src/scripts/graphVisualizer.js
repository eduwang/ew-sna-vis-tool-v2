/**
 * 그래프 시각화 기능
 * ref/2_graphVisualizer.js를 참고하여 작성
 */

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
let comResolution = 1;
let highlightedNodes = new Set();
let communityNodes = {};
let communityColors = {};
let degreeCen = null;
let eigenCen = null;
let centralityNodes = [];

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
 * 그래프 그리기
 */
export function drawGraph() {
  const errorDisplay = document.getElementById('error-display');
  const fullScreenButton = document.getElementById('full-screen-button');
  const saveAsPngButton = document.getElementById('save-as-png');
  
  if (errorDisplay) {
    errorDisplay.style.display = 'none';
    errorDisplay.style.visibility = 'hidden';
  }
  
  if (fullScreenButton) {
    fullScreenButton.style.display = 'inline-block';
  }
  
  if (saveAsPngButton) {
    saveAsPngButton.style.display = 'inline-block';
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

  // 그래프 생성
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
    const normalizedWeight = maxWeight > 0 ? Weight / maxWeight : Weight;

    if (!graph.hasNode(Source1)) {
      graph.addNode(Source1, { label: Source1 });
    }
    if (!graph.hasNode(Source2)) {
      graph.addNode(Source2, { label: Source2 });
    }
    
    // 중복 엣지 방지
    if (!graph.hasEdge(Source1, Source2)) {
      graph.addEdge(Source1, Source2, { 
        size: normalizedWeight * 2,
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
  });

  // 레이아웃 설정: 원형 배치 후 Force Atlas 2 적용
  circular.assign(graph);
  forceAtlas2.assign(graph, { iterations: 500 });

  // 기존 그래프 제거
  if (sigmaInstance) {
    sigmaInstance.kill();
    sigmaInstance = null;
  }

  // Sigma.js 렌더러 생성
  container = document.getElementById('sigma-container');
  if (!container) {
    console.error('sigma-container를 찾을 수 없습니다.');
    return;
  }

  container.innerHTML = '';
  
  const settings = {
    labelFont: "Arial",
    labelWeight: "bold",
    defaultNodeLabelSize: 50,
  };

  sigmaInstance = new Sigma(graph, container, { settings });

  // 노드 호버 이벤트
  sigmaInstance.on('enterNode', (event) => {
    const nodeId = event.node;
    const neighbors = new Set(graph.neighbors(nodeId));
    neighbors.add(nodeId);
    highlightedNodes = neighbors;
    updateGraphColors();
  });

  sigmaInstance.on('leaveNode', () => {
    highlightedNodes = new Set();
    updateGraphColors();
  });

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
 * 그래프 색상 업데이트 (호버 효과)
 */
function updateGraphColors() {
  if (!graph || !sigmaInstance) return;

  graph.forEachNode((node, attributes) => {
    if (highlightedNodes.size === 0 || highlightedNodes.has(node)) {
      graph.setNodeAttribute(node, 'color', attributes.originalColor || '#666');
      graph.setNodeAttribute(node, 'hidden', false);
    } else {
      graph.setNodeAttribute(node, 'color', '#EEE');
      graph.setNodeAttribute(node, 'hidden', true);
    }
  });

  graph.forEachEdge((edge, attributes, source, target) => {
    if (highlightedNodes.size === 0 || (highlightedNodes.has(source) && highlightedNodes.has(target))) {
      graph.setEdgeAttribute(edge, 'color', attributes.originalColor || '#999');
      graph.setEdgeAttribute(edge, 'hidden', false);
    } else {
      graph.setEdgeAttribute(edge, 'color', '#EEE');
      graph.setEdgeAttribute(edge, 'hidden', true);
    }
  });

  sigmaInstance.refresh();
}

/**
 * 전체화면 모드
 */
export function setupFullScreen() {
  const fullScreenButton = document.getElementById('full-screen-button');
  if (!fullScreenButton) return;

  fullScreenButton.addEventListener('click', () => {
    const graphDisplay = document.getElementById('sigma-container');
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
      const graphDisplay = document.getElementById('sigma-container');
      if (graphDisplay) {
        graphDisplay.classList.remove('fullscreen');
      }
    }
  });
}

/**
 * PNG로 저장
 */
export function setupSaveAsPNG() {
  const saveAsPngButton = document.getElementById('save-as-png');
  if (!saveAsPngButton) return;

  saveAsPngButton.addEventListener('click', () => {
    if (sigmaInstance) {
      saveAsPNG(sigmaInstance);
    } else {
      Swal.fire({
        title: '알림',
        text: '그래프가 그려지지 않았습니다.',
        icon: 'info',
        confirmButtonColor: '#4A90E2'
      });
    }
  });
}

async function saveAsPNG(renderer) {
  const { width, height } = renderer.getDimensions();
  const pixelRatio = window.devicePixelRatio || 1;

  const tmpRoot = document.createElement("DIV");
  tmpRoot.style.width = `${width}px`;
  tmpRoot.style.height = `${height}px`;
  tmpRoot.style.position = "absolute";
  tmpRoot.style.right = "101%";
  tmpRoot.style.bottom = "101%";
  document.body.appendChild(tmpRoot);

  const tmpRenderer = new Sigma(renderer.getGraph(), tmpRoot, renderer.getSettings());
  tmpRenderer.getCamera().setState(renderer.getCamera().getState());
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

  canvas.toBlob((blob) => {
    if (blob) FileSaver.saveAs(blob, "graph.png");
    tmpRenderer.kill();
    tmpRoot.remove();
  }, "image/png");
}

/**
 * 그래프 초기화 (모든 그래프 관련 상태 제거)
 */
export function resetGraph() {
  // Sigma 인스턴스 제거
  if (sigmaInstance) {
    try {
      sigmaInstance.kill();
      sigmaInstance = null;
    } catch (e) {
      // console.error('Sigma 인스턴스 제거 오류:', e);
    }
  }
  
  // 그래프 변수 초기화
  graph = null;
  comResolution = 1;
  highlightedNodes = new Set();
  communityNodes = {};
  communityColors = {};
  degreeCen = null;
  eigenCen = null;
  centralityNodes = [];
  
  // 그래프 컨테이너 비우기
  container = document.getElementById('sigma-container');
  if (container) {
    container.innerHTML = '';
  }
  
  // 그래프 관련 버튼 숨기기
  const fullScreenButton = document.getElementById('full-screen-button');
  const saveAsPngButton = document.getElementById('save-as-png');
  const errorDisplay = document.getElementById('error-display');
  
  if (fullScreenButton) {
    fullScreenButton.style.display = 'none';
  }
  if (saveAsPngButton) {
    saveAsPngButton.style.display = 'none';
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
  const comLabel = document.getElementById('com-label');
  const comIncrease = document.getElementById('com-increase');
  const comDecrease = document.getElementById('com-decrease');
  if (comDetectOn) comDetectOn.style.display = 'block';
  if (comDetectOff) comDetectOff.style.display = 'none';
  if (comList) comList.style.display = 'none';
  if (comLabel) comLabel.style.display = 'none';
  if (comIncrease) comIncrease.style.display = 'none';
  if (comDecrease) comDecrease.style.display = 'none';

  // 중심성 계산 관련 버튼 초기화
  const sortControls = document.getElementById('sort-controls');
  const centralityTablePanel = document.getElementById('centrality-table-panel');
  if (sortControls) sortControls.style.display = 'none';
  if (centralityTablePanel) centralityTablePanel.style.display = 'none';

  // 테이블 초기화
  const centralityBody = document.getElementById('centrality-body');
  const communityBody = document.getElementById('community-body');
  if (centralityBody) centralityBody.innerHTML = '';
  if (communityBody) communityBody.innerHTML = '';

  // 클러스터 라벨 제거
  const clustersLayer = document.getElementById('clustersLayer');
  if (clustersLayer) clustersLayer.remove();
}

/**
 * 집단 찾기 (커뮤니티 감지)
 */
function communityAssign() {
  if (!graph) return;

  const comDetectOn = document.getElementById('com-detect-on');
  const comDetectOff = document.getElementById('com-detect-off');
  const comLabel = document.getElementById('com-label');
  const comIncrease = document.getElementById('com-increase');
  const comDecrease = document.getElementById('com-decrease');
  const comList = document.getElementById('community-table-panel');

  if (comDetectOn) comDetectOn.style.display = 'none';
  if (comDetectOff) comDetectOff.style.display = 'inline-block';
  if (comLabel) comLabel.style.display = 'inline-block';
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
    graph.setNodeAttribute(node, 'color', communityColors[community]);
    graph.setNodeAttribute(node, 'originalColor', communityColors[community]);
  });

  // 레이아웃 재계산
  circular.assign(graph);
  forceAtlas2.assign(graph, { iterations: 300 });

  // 그래프 다시 렌더링
  if (sigmaInstance) {
    sigmaInstance.kill();
    sigmaInstance = null;
  }

  container = document.getElementById('sigma-container');
  if (!container) return;

  container.innerHTML = '';
  
  const settings = {
    labelFont: "Arial",
    labelWeight: "bold",
    defaultNodeLabelSize: 50,
  };

  sigmaInstance = new Sigma(graph, container, { settings });

  // 노드 호버 이벤트 재설정
  sigmaInstance.on('enterNode', (event) => {
    const nodeId = event.node;
    const neighbors = new Set(graph.neighbors(nodeId));
    neighbors.add(nodeId);
    highlightedNodes = neighbors;
    updateGraphColors();
  });

  sigmaInstance.on('leaveNode', () => {
    highlightedNodes = new Set();
    updateGraphColors();
  });

  updateCommunityNodes(communityNodes);
}

/**
 * 집단 찾기 해제
 */
function singleCommunity() {
  if (!graph) return;

  const comDetectOn = document.getElementById('com-detect-on');
  const comDetectOff = document.getElementById('com-detect-off');
  const comLabel = document.getElementById('com-label');
  const comList = document.getElementById('community-table-panel');
  const comIncrease = document.getElementById('com-increase');
  const comDecrease = document.getElementById('com-decrease');

  if (comDetectOn) comDetectOn.style.display = 'block';
  if (comDetectOff) comDetectOff.style.display = 'none';
  if (comList) comList.style.display = 'none';
  if (comLabel) comLabel.style.display = 'none';
  if (comIncrease) comIncrease.style.display = 'none';
  if (comDecrease) comDecrease.style.display = 'none';

  // 모든 노드를 회색으로 변경
  graph.forEachNode((node) => {
    graph.setNodeAttribute(node, 'color', '#666');
    graph.setNodeAttribute(node, 'originalColor', '#666');
  });

  // 레이아웃 재계산
  circular.assign(graph);
  forceAtlas2.assign(graph, { iterations: 300 });

  // 그래프 다시 렌더링
  if (sigmaInstance) {
    sigmaInstance.kill();
    sigmaInstance = null;
  }

  container = document.getElementById('sigma-container');
  if (!container) return;

  container.innerHTML = '';
  
  const settings = {
    labelFont: "Arial",
    labelWeight: "bold",
    defaultNodeLabelSize: 50,
  };

  sigmaInstance = new Sigma(graph, container, { settings });

  // 노드 호버 이벤트 재설정
  sigmaInstance.on('enterNode', (event) => {
    const nodeId = event.node;
    const neighbors = new Set(graph.neighbors(nodeId));
    neighbors.add(nodeId);
    highlightedNodes = neighbors;
    updateGraphColors();
  });

  sigmaInstance.on('leaveNode', () => {
    highlightedNodes = new Set();
    updateGraphColors();
  });
}

/**
 * 집단 목록 표시
 */
function markComList() {
  const comList = document.getElementById('community-table-panel');
  if (comList) {
    comList.style.display = comList.style.display === 'none' ? 'block' : 'none';
  }
}

/**
 * 집단 라벨 표시
 */
function labelCommunity() {
  if (!graph || !sigmaInstance) return;

  // 클러스터 정의
  const clusters = {};

  graph.forEachNode((node, atts) => {
    if (!clusters[atts.community]) {
      clusters[atts.community] = { label: atts.community, positions: [] };
    }
  });

  // 클러스터별 색상 배정
  Object.keys(clusters).forEach((community) => {
    clusters[community].color = communityColors[community] || '#666';
  });

  // 노드의 x,y 좌표를 clusters에 추가
  graph.forEachNode((node, atts) => {
    const cluster = clusters[atts.community];
    if (atts.x !== undefined && atts.y !== undefined) {
      cluster.positions.push({ x: atts.x, y: atts.y });
    }
  });

  // 클러스터의 중심 계산
  Object.keys(clusters).forEach((community) => {
    const cluster = clusters[community];
    if (cluster.positions.length > 0) {
      cluster.x = cluster.positions.reduce((acc, p) => acc + p.x, 0) / cluster.positions.length;
      cluster.y = cluster.positions.reduce((acc, p) => acc + p.y, 0) / cluster.positions.length;
    }
  });

  // 기존 라벨 레이어 제거
  const existingLayer = document.getElementById('clustersLayer');
  if (existingLayer) {
    existingLayer.remove();
  }

  // Sigma 인스턴스 재생성
  sigmaInstance.kill();
  const renderer = new Sigma(graph, container);

  // 클러스터 라벨 레이어 생성
  const clustersLayer = document.createElement("div");
  clustersLayer.id = "clustersLayer";
  let clusterLabelsDoms = "";
  
  Object.keys(clusters).forEach((community) => {
    const cluster = clusters[community];
    if (cluster.x !== undefined && cluster.y !== undefined) {
      const viewportPos = renderer.graphToViewport({ x: cluster.x, y: cluster.y });
      clusterLabelsDoms += `<div id='cluster-${cluster.label}' class="clusterLabel" style="position:absolute; top:${viewportPos.y}px;left:${viewportPos.x}px;color:${cluster.color}; font-size: 20px; font-weight: bold; opacity: 0.7; pointer-events: none;">집단 ${cluster.label}</div>`;
    }
  });
  
  clustersLayer.innerHTML = clusterLabelsDoms;
  container.appendChild(clustersLayer);

  // 렌더 후 클러스터 라벨 위치 업데이트
  renderer.on("afterRender", () => {
    Object.keys(clusters).forEach((community) => {
      const cluster = clusters[community];
      if (cluster.x !== undefined && cluster.y !== undefined) {
        const clusterLabel = document.getElementById(`cluster-${cluster.label}`);
        if (clusterLabel) {
          const viewportPos = renderer.graphToViewport({ x: cluster.x, y: cluster.y });
          clusterLabel.style.top = `${viewportPos.y}px`;
          clusterLabel.style.left = `${viewportPos.x}px`;
        }
      }
    });
  });

  sigmaInstance = renderer;
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
    labelCommunity();
  } else {
    communityAssign();
    labelCommunity();
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
    labelCommunity();
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
  const comLabel = document.getElementById('com-label');
  const comIncrease = document.getElementById('com-increase');
  const comDecrease = document.getElementById('com-decrease');

  if (comDetectOn) {
    comDetectOn.addEventListener('click', communityAssign);
  }
  if (comDetectOff) {
    comDetectOff.addEventListener('click', singleCommunity);
  }
  if (comLabel) {
    comLabel.addEventListener('click', labelCommunity);
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
  setupSaveAsPNG();
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

