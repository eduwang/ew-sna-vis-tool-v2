/**
 * CSV 파일 로딩 및 파싱 기능
 * ref/3_sampleDataLoader.js를 참고하여 작성
 */

import Papa from 'papaparse';

/**
 * CSV 파일을 읽고 파싱하여 데이터 반환
 * @param {File} file - CSV 파일 객체
 * @returns {Promise<Array>} 파싱된 데이터 배열
 */
export function loadCSVFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const text = event.target.result;
      
      // 인코딩 감지 및 디코딩 (한글 지원)
      let decodedText = text;
      try {
        // UTF-8 BOM 제거
        if (text.charCodeAt(0) === 0xFEFF) {
          decodedText = text.slice(1);
        }
      } catch (e) {
        console.warn('인코딩 처리 중 오류:', e);
      }
      
      // PapaParse를 사용하여 CSV 파싱
      Papa.parse(decodedText, {
        header: true, // 첫 행을 헤더로 인식
        dynamicTyping: true, // 자동 타입 변환
        skipEmptyLines: true, // 빈 줄 제거
        complete: (results) => {
          if (results.errors.length > 0) {
            console.warn('CSV 파싱 경고:', results.errors);
          }
          
          // 세 칸이 모두 비어있지 않은 행만 필터링 (전체 데이터 유지)
          const filteredData = results.data.filter(row => {
            const values = Object.values(row);
            // 세 칸 모두 비어있지 않은 행만 유지
            return values.some(value => 
              value !== null && value !== '' && value !== undefined
            );
          });
          
          if (filteredData.length === 0) {
            reject(new Error('CSV 파일에 유효한 데이터가 없습니다.'));
            return;
          }
          
          resolve(filteredData);
        },
        error: (error) => {
          reject(new Error(`CSV 파싱 오류: ${error.message}`));
        }
      });
    };
    
    reader.onerror = () => {
      reject(new Error('파일 읽기 오류가 발생했습니다.'));
    };
    
    // 파일을 텍스트로 읽기 (UTF-8 우선, 한글 지원)
    reader.readAsText(file, 'UTF-8');
  });
}

/**
 * 데이터를 CSV 형식의 2D 배열로 변환
 * @param {Array} data - 객체 배열 데이터
 * @returns {Array<Array>} 2D 배열 (첫 행은 헤더)
 */
export function convertToCSVArray(data) {
  if (!data || data.length === 0) {
    return [];
  }
  
  // 헤더 추출
  const headers = Object.keys(data[0]);
  const result = [headers];
  
  // 데이터 행 추가
  data.forEach(row => {
    const rowData = headers.map(header => {
      const value = row[header];
      return value !== null && value !== undefined ? String(value) : '';
    });
    result.push(rowData);
  });
  
  return result;
}

/**
 * 데이터를 CSV 문자열로 변환
 * @param {Array} data - 객체 배열 데이터
 * @returns {string} CSV 문자열
 */
export function convertToCSVString(data) {
  const csvArray = convertToCSVArray(data);
  return csvArray.map(row => row.join(',')).join('\n');
}

