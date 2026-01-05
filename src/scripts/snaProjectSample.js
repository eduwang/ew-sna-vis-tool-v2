/**
 * 사회 관계망 분석 프로젝트 체험 페이지 메인 로직
 */

import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.css';
import Swal from 'sweetalert2';
import Graph from 'graphology';
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import circular from "graphology-layout/circular";
import louvain from 'graphology-communities-louvain';
import { degreeCentrality } from 'graphology-metrics/centrality/degree';
import eigenvectorCentrality from 'graphology-metrics/centrality/eigenvector';
import FileSaver from "file-saver";

let hotInstance = null;
let networkHotInstance = null; // 관계망 데이터용 Handsontable
let edgeHotInstance = null; // 관계망 그래프 그리기 탭의 선분 데이터용 Handsontable
let lastSelectedRange = null; // 마지막으로 선택된 범위 저장 (설문 데이터용)
let lastSelectedEdgeRange = null; // 마지막으로 선택된 범위 저장 (선분 데이터용)
let currentNetworkData = null;
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
 * Handsontable 초기화
 */
function initializeHandsontable() {
  const container = document.getElementById('handsontable-container');
  
  if (!container) {
    console.error('Handsontable 컨테이너를 찾을 수 없습니다.');
    return;
  }
  
  try {
    // 기본 데이터: 빈 1행
    const defaultData = [
      ['', '']
    ];
    
    hotInstance = new Handsontable(container, {
      data: defaultData,
      rowHeaders: true,
      colHeaders: ['이름', '설문 결과'],
      columnSorting: true,
      contextMenu: true,
      manualColumnResize: true,
      manualRowResize: true,
      licenseKey: 'non-commercial-and-evaluation',
      stretchH: 'all',
      height: 500,
      width: '100%',
      persistentState: false,
      minSpareRows: 1,
      selectionMode: 'multiple',
      multiSelect: true,
      afterChange: (changes, source) => {
        if (source !== 'loadData') {
          updateDataCount();
        }
      },
      afterRemoveRow: () => {
        updateDataCount();
      },
      afterSelection: (row, col, row2, col2) => {
        // 선택된 범위 저장
        lastSelectedRange = {
          rowStart: Math.min(row, row2),
          colStart: Math.min(col, col2),
          rowEnd: Math.max(row, row2),
          colEnd: Math.max(col, col2)
        };
      },
      afterSelectionEnd: (row, col, row2, col2) => {
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
    Swal.fire({
      icon: 'error',
      title: '오류',
      text: '테이블 초기화 중 오류가 발생했습니다. 페이지를 새로고침해주세요.'
    });
    return;
  }
  
  updateDataCount();
}

/**
 * 데이터 개수 업데이트
 */
function updateDataCount() {
  if (!hotInstance) return;
  
  const data = hotInstance.getData();
  const validRows = data.filter(row => {
    return row[0] && row[0].toString().trim() !== '' && 
           row[1] && row[1].toString().trim() !== '';
  }).length;
  
  const countElement = document.getElementById('data-count');
  if (countElement) {
    countElement.textContent = `데이터: ${validRows}개`;
  }
}

/**
 * Handsontable에서 데이터 가져오기
 */
function getTableData() {
  if (!hotInstance) return [];
  
  const data = hotInstance.getData();
  return data
    .map(row => ({
      name: row[0] ? row[0].toString().trim() : '',
      survey: row[1] ? row[1].toString().trim() : ''
    }))
    .filter(row => row.name !== '' && row.survey !== '');
}

/**
 * 자카드 유사도 계산
 * @param {Set} set1 
 * @param {Set} set2 
 * @returns {number}
 */
function jaccardSimilarity(set1, set2) {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * 설문 결과를 집합으로 변환
 * @param {string} surveyResult 
 * @returns {Set}
 */
function parseSurveyResult(surveyResult) {
  if (!surveyResult) return new Set();
  
  return new Set(
    surveyResult
      .split(',')
      .map(item => item.trim())
      .filter(item => item !== '')
  );
}

/**
 * 이름 관계망 데이터 생성 (자카드 유사도 기반)
 */
function generateNameNetwork() {
  const tableData = getTableData();
  
  if (tableData.length < 2) {
    Swal.fire({
      icon: 'warning',
      title: '데이터 부족',
      text: '이름 관계망을 생성하려면 최소 2명의 데이터가 필요합니다.'
    });
    return;
  }
  
  const networkData = [];
  const nameSets = new Map();
  
  // 각 이름의 설문 결과를 집합으로 변환
  tableData.forEach(row => {
    nameSets.set(row.name, parseSurveyResult(row.survey));
  });
  
  // 모든 이름 쌍에 대해 자카드 유사도 계산
  const names = Array.from(nameSets.keys());
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const name1 = names[i];
      const name2 = names[j];
      const set1 = nameSets.get(name1);
      const set2 = nameSets.get(name2);
      
      const similarity = jaccardSimilarity(set1, set2);
      
      // 유사도가 0보다 큰 경우만 추가
      if (similarity > 0) {
        networkData.push({
          source: name1,
          target: name2,
          weight: similarity
        });
      }
    }
  }
  
  if (networkData.length === 0) {
    Swal.fire({
      icon: 'info',
      title: '관계 없음',
      text: '유사한 설문 결과를 가진 사람이 없습니다.'
    });
    return;
  }
  
  currentNetworkData = networkData;
  displayNetworkData(networkData);
  showDrawGraphButton();
  
  // 관계망 그래프 그리기 탭에도 선분 데이터 표시
  displayEdgeData(networkData);
  
  Swal.fire({
    icon: 'success',
    title: '생성 완료',
    text: `${networkData.length}개의 관계가 생성되었습니다.`
  });
}

/**
 * 요소 관계망 데이터 생성 (공출현 기반)
 */
function generateElementNetwork() {
  const tableData = getTableData();
  
  if (tableData.length === 0) {
    Swal.fire({
      icon: 'warning',
      title: '데이터 부족',
      text: '요소 관계망을 생성하려면 데이터가 필요합니다.'
    });
    return;
  }
  
  const cooccurrence = new Map();
  const elementCounts = new Map();
  
  // 각 행에서 요소들의 공출현 계산
  tableData.forEach(row => {
    const elements = parseSurveyResult(row.survey);
    const elementArray = Array.from(elements);
    
    // 각 요소의 출현 횟수 증가
    elementArray.forEach(element => {
      elementCounts.set(element, (elementCounts.get(element) || 0) + 1);
    });
    
    // 모든 요소 쌍의 공출현 계산
    for (let i = 0; i < elementArray.length; i++) {
      for (let j = i + 1; j < elementArray.length; j++) {
        const elem1 = elementArray[i];
        const elem2 = elementArray[j];
        
        // 정렬하여 키 생성 (순서 무관하게)
        const key = elem1 < elem2 ? `${elem1}|${elem2}` : `${elem2}|${elem1}`;
        cooccurrence.set(key, (cooccurrence.get(key) || 0) + 1);
      }
    }
  })
  
  // 공출현 데이터를 네트워크 형식으로 변환
  const networkData = [];
  cooccurrence.forEach((count, key) => {
    const [elem1, elem2] = key.split('|');
    // 가중치는 공출현 횟수로 설정 (정규화는 선택사항)
    networkData.push({
      source: elem1,
      target: elem2,
      weight: count
    });
  });
  
  if (networkData.length === 0) {
    Swal.fire({
      icon: 'info',
      title: '관계 없음',
      text: '공출현하는 요소가 없습니다.'
    });
    return;
  }
  
  currentNetworkData = networkData;
  displayNetworkData(networkData);
  showDrawGraphButton();
  
  // 관계망 그래프 그리기 탭에도 선분 데이터 표시
  displayEdgeData(networkData);
  
  Swal.fire({
    icon: 'success',
    title: '생성 완료',
    text: `${networkData.length}개의 관계가 생성되었습니다.`
  });
}

/**
 * 생성된 관계망 데이터 표시 (Handsontable 사용)
 */
function displayNetworkData(networkData) {
  const displayContainer = document.getElementById('network-data-display');
  const container = document.getElementById('network-handsontable-container');
  
  if (!displayContainer || !container) return;
  
  // 데이터 정렬 (가중치 내림차순)
  const sortedData = [...networkData].sort((a, b) => b.weight - a.weight);
  
  // 2D 배열로 변환
  const tableData = sortedData.map(row => [
    row.source,
    row.target,
    row.weight.toFixed(3)
  ]);
  
  // 기존 인스턴스가 있으면 제거
  if (networkHotInstance) {
    networkHotInstance.destroy();
    networkHotInstance = null;
  }
  
  // Handsontable 초기화
  try {
    networkHotInstance = new Handsontable(container, {
      data: tableData,
      rowHeaders: true,
      colHeaders: ['노드 1', '노드 2', '가중치'],
      columnSorting: true,
      contextMenu: true,
      manualColumnResize: true,
      manualRowResize: true,
      licenseKey: 'non-commercial-and-evaluation',
      stretchH: 'all',
      height: 400,
      width: '100%',
      persistentState: false,
      minSpareRows: 0,
      selectionMode: 'multiple',
      multiSelect: true,
      columns: [
        { type: 'text' },
        { type: 'text' },
        { type: 'numeric', numericFormat: { pattern: '0.000' } }
      ]
    });
  } catch (error) {
    console.error('관계망 데이터 Handsontable 초기화 오류:', error);
    Swal.fire({
      icon: 'error',
      title: '오류',
      text: '데이터 테이블 초기화 중 오류가 발생했습니다.'
    });
    return;
  }
  
  displayContainer.style.display = 'block';
}

/**
 * 관계망 그래프 그리기 탭에 선분 데이터 표시
 */
function displayEdgeData(networkData) {
  const container = document.getElementById('edge-handsontable-container');
  if (!container) return;
  
  // 데이터 정렬 (가중치 내림차순)
  const sortedData = [...networkData].sort((a, b) => b.weight - a.weight);
  
  // 2D 배열로 변환
  const tableData = sortedData.map(row => [
    row.source,
    row.target,
    row.weight.toFixed(3)
  ]);
  
  // 기존 인스턴스가 있으면 제거
  if (edgeHotInstance) {
    edgeHotInstance.destroy();
    edgeHotInstance = null;
  }
  
  // Handsontable 초기화
  try {
    edgeHotInstance = new Handsontable(container, {
      data: tableData,
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
      persistentState: false,
      minSpareRows: 1,
      selectionMode: 'multiple',
      multiSelect: true,
      columns: [
        { type: 'text' },
        { type: 'text' },
        { type: 'numeric', numericFormat: { pattern: '0.000' } }
      ],
      afterChange: () => {
        updateEdgeDataCount();
      },
      afterRemoveRow: () => {
        updateEdgeDataCount();
      },
      afterSelection: (row, col, row2, col2) => {
        // 선택된 범위 저장
        lastSelectedEdgeRange = {
          rowStart: Math.min(row, row2),
          colStart: Math.min(col, col2),
          rowEnd: Math.max(row, row2),
          colEnd: Math.max(col, col2)
        };
      },
      afterSelectionEnd: (row, col, row2, col2) => {
        // 최종 선택된 범위 저장
        lastSelectedEdgeRange = {
          rowStart: Math.min(row, row2),
          colStart: Math.min(col, col2),
          rowEnd: Math.max(row, row2),
          colEnd: Math.max(col, col2)
        };
      }
    });
    
    updateEdgeDataCount();
  } catch (error) {
    console.error('선분 데이터 Handsontable 초기화 오류:', error);
    Swal.fire({
      icon: 'error',
      title: '오류',
      text: '선분 데이터 테이블 초기화 중 오류가 발생했습니다.'
    });
  }
}

/**
 * 선분 데이터 개수 업데이트
 */
function updateEdgeDataCount() {
  if (!edgeHotInstance) return;
  
  const data = edgeHotInstance.getData();
  const validRows = data.filter(row => {
    return row[0] && row[0].toString().trim() !== '' && 
           row[1] && row[1].toString().trim() !== '' &&
           row[2] && !isNaN(parseFloat(row[2])) && parseFloat(row[2]) > 0;
  }).length;
  
  const countElement = document.getElementById('edge-data-count');
  if (countElement) {
    countElement.textContent = `데이터: ${validRows}개`;
  }
}


/**
 * 그래프 그리기 버튼 표시
 */
function showDrawGraphButton() {
  const drawGraphBtn = document.getElementById('draw-graph-btn');
  if (drawGraphBtn) {
    drawGraphBtn.style.display = 'inline-block';
  }
}

/**
 * Handsontable에서 관계망 데이터 가져오기
 */
function getNetworkDataFromTable() {
  if (!networkHotInstance) {
    return null;
  }
  
  const tableData = networkHotInstance.getData();
  const networkData = [];
  
  tableData.forEach(row => {
    const source = row[0] ? row[0].toString().trim() : '';
    const target = row[1] ? row[1].toString().trim() : '';
    const weight = row[2] ? parseFloat(row[2]) : 0;
    
    // 유효한 데이터만 추가
    if (source !== '' && target !== '' && !isNaN(weight) && weight > 0) {
      networkData.push({
        source: source,
        target: target,
        weight: weight
      });
    }
  });
  
  return networkData;
}

/**
 * 선분 데이터 Handsontable에서 데이터 가져오기
 */
function getEdgeDataFromTable() {
  if (!edgeHotInstance) {
    return null;
  }
  
  const tableData = edgeHotInstance.getData();
  const edgeData = [];
  
  tableData.forEach(row => {
    const source = row[0] ? row[0].toString().trim() : '';
    const target = row[1] ? row[1].toString().trim() : '';
    const weight = row[2] ? parseFloat(row[2]) : 0;
    
    // 유효한 데이터만 추가
    if (source !== '' && target !== '' && !isNaN(weight) && weight > 0) {
      edgeData.push({
        source: source,
        target: target,
        weight: weight
      });
    }
  });
  
  return edgeData;
}

/**
 * 그래프 그리기
 */
function drawGraph() {
  // 선분 데이터 Handsontable에서 데이터 가져오기 (우선)
  let networkData = getEdgeDataFromTable();
  
  // 선분 데이터가 없으면 관계망 데이터 Handsontable에서 가져오기
  if (!networkData || networkData.length === 0) {
    networkData = getNetworkDataFromTable();
  }
  
  // 그래도 없으면 기존 데이터 사용
  if (!networkData || networkData.length === 0) {
    if (!currentNetworkData || currentNetworkData.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: '데이터 없음',
        text: '먼저 관계망 데이터를 생성하거나 선분 데이터를 입력해주세요.'
      });
      return;
    }
    networkData = currentNetworkData;
  }
  
  if (networkData.length === 0) {
    Swal.fire({
      icon: 'warning',
      title: '데이터 없음',
      text: '그래프를 그리기 위한 유효한 데이터가 없습니다.'
    });
    return;
  }
  
  const errorDisplay = document.getElementById('error-display');
  const fullScreenButton = document.getElementById('full-screen-button');
  const saveAsPngButton = document.getElementById('save-as-png');
  container = document.getElementById('sigma-container');
  
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
  
  if (!container) {
    console.error('그래프 컨테이너를 찾을 수 없습니다.');
    return;
  }
  
  // 기존 그래프 제거
  if (sigmaInstance) {
    sigmaInstance.kill();
    sigmaInstance = null;
  }
  
  container.innerHTML = '';
  
  // 그래프 생성
  graph = new Graph();
  
  // 최대 가중치 찾기
  let maxWeight = 0;
  networkData.forEach(row => {
    if (row.weight > maxWeight) {
      maxWeight = row.weight;
    }
  });
  
  // 노드와 엣지 추가
  networkData.forEach(row => {
    const { source, target, weight } = row;
    const normalizedWeight = maxWeight > 0 ? weight / maxWeight : weight;
    
    if (!graph.hasNode(source)) {
      graph.addNode(source, { label: source });
    }
    if (!graph.hasNode(target)) {
      graph.addNode(target, { label: target });
    }
    
    // 중복 엣지 방지
    if (!graph.hasEdge(source, target)) {
      graph.addEdge(source, target, { 
        size: normalizedWeight * 2,
        weight: weight
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
    graph.setNodeAttribute(node, 'size', size);
  });
  
  // 레이아웃 설정: 원형 배치 후 Force Atlas 2 적용
  circular.assign(graph);
  forceAtlas2.assign(graph, { iterations: 500 });
  
  // Sigma 렌더러 초기화
  const settings = {
    labelFont: "Arial",
    labelWeight: "bold",
    defaultNodeLabelSize: 50,
  };
  
  sigmaInstance = new Sigma(graph, container, { settings });
  
  // 노드 호버 이벤트
  highlightedNodes = new Set();
  
  function updateGraphColors() {
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
      if (highlightedNodes.size === 0 || 
          (highlightedNodes.has(source) && highlightedNodes.has(target))) {
        graph.setEdgeAttribute(edge, 'color', attributes.originalColor || '#999');
        graph.setEdgeAttribute(edge, 'hidden', false);
      } else {
        graph.setEdgeAttribute(edge, 'color', '#EEE');
        graph.setEdgeAttribute(edge, 'hidden', true);
      }
    });
    
    sigmaInstance.refresh();
  }
  
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
  
  // 원본 색상 저장
  graph.forEachNode((node) => {
    graph.setNodeAttribute(node, 'originalColor', '#666');
  });
  
  graph.forEachEdge((edge) => {
    graph.setEdgeAttribute(edge, 'originalColor', '#999');
  });
  
  // 전체화면 버튼
  if (fullScreenButton) {
    fullScreenButton.onclick = () => {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      } else if (container.mozRequestFullScreen) {
        container.mozRequestFullScreen();
      } else if (container.msRequestFullscreen) {
        container.msRequestFullscreen();
      }
    };
  }
  
  // PNG 저장 버튼
  if (saveAsPngButton) {
    saveAsPngButton.onclick = () => {
      if (sigmaInstance) {
        const dataURL = sigmaInstance.toImage();
        FileSaver.saveAs(dataURL, 'network-graph.png');
      }
    };
  }
  
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
 * 행 추가 버튼 설정
 */
function setupRowControls() {
  const addRowBtn = document.getElementById('add-row-btn');
  const removeRowBtn = document.getElementById('remove-row-btn');
  const resetBtn = document.getElementById('reset-btn');
  
  if (addRowBtn) {
    addRowBtn.addEventListener('click', () => {
      if (!hotInstance) {
        return;
      }
      
      // 데이터 직접 조작 방식 사용 (Handsontable 14.x에서 alter('insert_row')가 작동하지 않음)
      const data = hotInstance.getData();
      data.push(['', '']);
      hotInstance.loadData(data);
      updateDataCount();
    });
  }
  
  if (removeRowBtn) {
    removeRowBtn.addEventListener('click', () => {
      if (!hotInstance) {
        return;
      }
      
      try {
        const rowCount = hotInstance.countRows();
        const data = hotInstance.getData();
        
        if (rowCount <= 1) {
          return;
        }
        
        // 데이터 직접 조작 방식
        const newData = data.map(row => [...row]); // 깊은 복사
        let rowsToDelete = new Set();
        
        // 저장된 선택 범위 사용
        if (lastSelectedRange) {
          const { rowStart, rowEnd } = lastSelectedRange;
          
          // 선택된 범위의 모든 행 추가
          for (let row = rowStart; row <= rowEnd; row++) {
            if (row >= 0 && row < rowCount) {
              rowsToDelete.add(row);
            }
          }
        } else {
          // 선택된 행이 없으면 마지막 행 삭제
          if (rowCount > 1) {
            rowsToDelete.add(rowCount - 1);
          }
        }
        
        if (rowsToDelete.size > 0) {
          // 행 인덱스를 배열로 변환하고 역순 정렬 (삭제 시 인덱스 변경 방지)
          const rowsArray = Array.from(rowsToDelete).sort((a, b) => b - a);
          
          // 최소 1행은 유지하도록 확인
          if (rowsArray.length >= newData.length) {
            rowsArray.splice(0, rowsArray.length - 1);
          }
          
          // 역순으로 행 삭제
          rowsArray.forEach(rowIndex => {
            if (newData.length > 1 && rowIndex >= 0 && rowIndex < newData.length) {
              newData.splice(rowIndex, 1);
            }
          });
          
          // 빈 행 하나 추가 (minSpareRows 유지)
          if (newData.length === 0) {
            newData.push(['', '']);
          }
          
          // 데이터 다시 로드
          hotInstance.loadData(newData);
          
          // loadData 후 즉시 업데이트
          setTimeout(() => {
            updateDataCount();
          }, 50);
        }
      } catch (error) {
        console.error('행 삭제 오류:', error);
      }
    });
  }
  
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      Swal.fire({
        title: '초기화',
        text: '모든 데이터를 삭제하시겠습니까?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '삭제',
        cancelButtonText: '취소'
      }).then((result) => {
        if (result.isConfirmed && hotInstance) {
          hotInstance.loadData([['', '']]);
          updateDataCount();
          currentNetworkData = null;
          if (networkHotInstance) {
            networkHotInstance.destroy();
            networkHotInstance = null;
          }
          const networkDisplay = document.getElementById('network-data-display');
          if (networkDisplay) {
            networkDisplay.style.display = 'none';
          }
          document.getElementById('draw-graph-btn').style.display = 'none';
          if (sigmaInstance) {
            sigmaInstance.kill();
            sigmaInstance = null;
          }
        }
      });
    });
  }
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
  if (comList) comList.style.display = 'block';
  
  // Louvain 알고리즘으로 커뮤니티 감지
  louvain.assign(graph, {
    resolution: comResolution,
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
 * 집단 라벨 표시
 */
function labelCommunity() {
  if (!graph || !sigmaInstance) return;
  
  // 기존 라벨 레이어 제거
  const existingLayer = document.getElementById('clustersLayer');
  if (existingLayer) {
    existingLayer.remove();
  }
  
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
  
  const sortedNodes = [...centralityNodes].sort((a, b) => {
    if (b.degreeCentrality !== a.degreeCentrality) {
      return b.degreeCentrality - a.degreeCentrality;
    } else {
      if (a.eigenvectorCentrality === 'N/A') return 1;
      if (b.eigenvectorCentrality === 'N/A') return -1;
      return b.eigenvectorCentrality - a.eigenvectorCentrality;
    }
  });
  
  const top10Nodes = new Set(sortedNodes.slice(0, 10).map(n => n.node));
  
  sortedNodes.forEach(({ node, degreeCentrality, eigenvectorCentrality }) => {
    const row = document.createElement('tr');
    
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
  
  const sortedNodes = [...centralityNodes].sort((a, b) => {
    if (a.eigenvectorCentrality === 'N/A') return 1;
    if (b.eigenvectorCentrality === 'N/A') return -1;
    if (b.eigenvectorCentrality !== a.eigenvectorCentrality) {
      return b.eigenvectorCentrality - a.eigenvectorCentrality;
    } else {
      return b.degreeCentrality - a.degreeCentrality;
    }
  });
  
  const top10Nodes = new Set(sortedNodes.slice(0, 10).map(n => n.node));
  
  sortedNodes.forEach(({ node, degreeCentrality, eigenvectorCentrality }) => {
    const row = document.createElement('tr');
    
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
 * 이벤트 리스너 설정
 */
function setupEventListeners() {
  const generateNameBtn = document.getElementById('generate-name-network-btn');
  const generateElementBtn = document.getElementById('generate-element-network-btn');
  const drawGraphBtn = document.getElementById('draw-graph-btn');
  
  if (generateNameBtn) {
    generateNameBtn.addEventListener('click', generateNameNetwork);
  }
  
  if (generateElementBtn) {
    generateElementBtn.addEventListener('click', generateElementNetwork);
  }
  
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
  
  // 선분 데이터 행 추가/삭제 버튼
  const addEdgeRowBtn = document.getElementById('add-edge-row-btn');
  const removeEdgeRowBtn = document.getElementById('remove-edge-row-btn');
  
  if (addEdgeRowBtn) {
    addEdgeRowBtn.addEventListener('click', () => {
      if (!edgeHotInstance) {
        Swal.fire({
          icon: 'info',
          title: '데이터 없음',
          text: '먼저 관계망 데이터를 생성해주세요.'
        });
        return;
      }
      const data = edgeHotInstance.getData();
      data.push(['', '', '']);
      edgeHotInstance.loadData(data);
      updateEdgeDataCount();
    });
  }
  
  if (removeEdgeRowBtn) {
    removeEdgeRowBtn.addEventListener('click', () => {
      if (!edgeHotInstance) {
        return;
      }
      
      try {
        const rowCount = edgeHotInstance.countRows();
        const data = edgeHotInstance.getData();
        
        if (rowCount <= 1) {
          return;
        }
        
        // 데이터 직접 조작 방식
        const newData = data.map(row => [...row]); // 깊은 복사
        let rowsToDelete = new Set();
        
        // 저장된 선택 범위 사용
        if (lastSelectedEdgeRange) {
          const { rowStart, rowEnd } = lastSelectedEdgeRange;
          
          // 선택된 범위의 모든 행 추가
          for (let row = rowStart; row <= rowEnd; row++) {
            if (row >= 0 && row < rowCount) {
              rowsToDelete.add(row);
            }
          }
        } else {
          // 선택된 행이 없으면 마지막 행 삭제
          if (rowCount > 1) {
            rowsToDelete.add(rowCount - 1);
          }
        }
        
        if (rowsToDelete.size > 0) {
          // 행 인덱스를 배열로 변환하고 역순 정렬 (삭제 시 인덱스 변경 방지)
          const rowsArray = Array.from(rowsToDelete).sort((a, b) => b - a);
          
          // 최소 1행은 유지하도록 확인
          if (rowsArray.length >= newData.length) {
            rowsArray.splice(0, rowsArray.length - 1);
          }
          
          // 역순으로 행 삭제
          rowsArray.forEach(rowIndex => {
            if (newData.length > 1 && rowIndex >= 0 && rowIndex < newData.length) {
              newData.splice(rowIndex, 1);
            }
          });
          
          // 빈 행 하나 추가 (minSpareRows 유지)
          if (newData.length === 0) {
            newData.push(['', '', '']);
          }
          
          // 데이터 다시 로드
          edgeHotInstance.loadData(newData);
          
          // loadData 후 즉시 업데이트
          setTimeout(() => {
            updateEdgeDataCount();
          }, 50);
        }
      } catch (error) {
        console.error('행 삭제 오류:', error);
      }
    });
  }
}

/**
 * 초기화
 */
function init() {
  initializeHandsontable();
  setupRowControls();
  setupEventListeners();
}

// DOM 로드 완료 시 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

