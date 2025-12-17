/**
 * 예시 데이터 목록 및 설명
 * public/sample-data 폴더의 CSV 파일을 불러옵니다.
 */

import Papa from 'papaparse';

export const sampleDataList = [
  {
    id: 'sample-1',
    name: '반 친구 관계망 네트워크',
    description: '가상의 반을 가정하고, 반에서 친한 친구들 사이를 표현한 네트워크입니다. 우리 반의 소집단은 어떻게 형성되는지, 소외된 친구는 없는지 살펴볼 수 있습니다.',
    filePath: '/sample-data/sample-1.csv'
  },
  {
    id: 'sample-2',
    name: '마블 영화 배우 네트워크',
    description: '마블 영화(~2019년)에 출연한 배우들의 네트워크. Chris Evans를 중심으로 같이 출연한 배우들이 서로 함께 출연한 작품의 수를 기준으로 제작된 네트워크입니다.',
    filePath: '/sample-data/sample-2.csv'
  },
  {
    id: 'sample-3',
    name: '시흥 맛집 네트워크',
    description: '2022년 1년간 \'시흥 맛집\'에 대한 블로그 글을 수집한 다음, 키워드를 추출한 후, 같은 글에 등장한 관계를 표현한 네트워크입니다.',
    filePath: '/sample-data/sample-3.csv'
  },
  {
    id: 'sample-4',
    name: '별 그래프 (Star Graph)',
    description: '기본적인 별 그래프 구조입니다. 중심 노드를 기준으로 여러 노드가 연결된 형태입니다.',
    filePath: '/sample-data/sample-4.csv'
  },
  {
    id: 'sample-5',
    name: '마블 캐릭터 네트워크',
    description: '마블 원작 만화에서 같은 만화책에 두 캐릭터가 함께 등장하는 횟수를 기준으로 계산된 네트워크입니다.',
    filePath: '/sample-data/sample-5.csv'
  },
  {
    id: 'sample-6',
    name: '왕좌의 게임 등장인물 네트워크',
    description: 'George R. R. Martin의 A Storm of Swords 시리즈에 등장하는 인물들 간의 관계를 분석한 네트워크 데이터입니다. 두 캐릭터의 이름이 소설 내에서 15단어 이내에 몇 번 등장하는지를 기준으로 계산되었습니다.',
    filePath: '/sample-data/sample-6.csv'
  }
];

/**
 * 예시 데이터 목록 가져오기
 * @returns {Array} 예시 데이터 목록
 */
export function getSampleDataList() {
  return sampleDataList;
}

/**
 * ID로 예시 데이터 가져오기
 * @param {string} id - 예시 데이터 ID
 * @returns {Object|null} 예시 데이터 객체 또는 null
 */
export function getSampleDataById(id) {
  return sampleDataList.find(item => item.id === id) || null;
}

/**
 * 인코딩 감지
 * @param {ArrayBuffer} buffer - 파일 버퍼
 * @param {string} filePath - 파일 경로
 * @returns {string} 인코딩 이름
 */
function detectEncoding(buffer, filePath) {
  // sample-2.csv는 EUC-KR로 보임
  if (filePath.includes('sample-2.csv')) {
    return 'euc-kr';
  }
  
  // 기본적으로 UTF-8 시도
  // UTF-8 BOM 확인
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return 'utf-8';
  }
  
  // 기본값은 UTF-8
  return 'utf-8';
}

/**
 * 텍스트 디코딩
 * @param {ArrayBuffer} arrayBuffer - 파일 버퍼
 * @param {string} encoding - 인코딩 이름
 * @returns {string} 디코딩된 텍스트
 */
function decodeText(arrayBuffer, encoding) {
  try {
    const decoder = new TextDecoder(encoding);
    return decoder.decode(new Uint8Array(arrayBuffer));
  } catch (error) {
    console.warn(`인코딩 ${encoding} 디코딩 실패, UTF-8 시도:`, error);
    // UTF-8로 재시도
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(new Uint8Array(arrayBuffer));
  }
}

/**
 * CSV 파일을 불러와서 데이터 반환
 * @param {string} filePath - CSV 파일 경로
 * @returns {Promise<Array>} 파싱된 데이터 배열 (2D 배열)
 */
export async function loadSampleCSV(filePath) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`파일을 불러올 수 없습니다: ${response.statusText}`);
    }
    
    // ArrayBuffer로 읽어서 인코딩 처리
    const arrayBuffer = await response.arrayBuffer();
    const encoding = detectEncoding(arrayBuffer, filePath);
    const text = decodeText(arrayBuffer, encoding);
    
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            console.warn('CSV 파싱 경고:', results.errors);
          }
          
          // 객체 배열을 2D 배열로 변환
          if (results.data.length === 0) {
            reject(new Error('CSV 파일에 유효한 데이터가 없습니다.'));
            return;
          }
          
          // 헤더 추출
          const headers = Object.keys(results.data[0]);
          const tableData = [headers];
          
          // 데이터 행 추가 (세 칸이 모두 비어있지 않은 행만)
          results.data.forEach(row => {
            const rowData = headers.map(header => row[header] || '');
            // 세 칸이 모두 비어있지 않은 행만 추가
            if (rowData.some(cell => cell !== null && cell !== '' && cell !== undefined)) {
              tableData.push(rowData);
            }
          });
          
          resolve(tableData);
        },
        error: (error) => {
          reject(new Error(`CSV 파싱 오류: ${error.message}`));
        }
      });
    });
  } catch (error) {
    throw new Error(`파일 로드 오류: ${error.message}`);
  }
}

