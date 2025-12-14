# SNA Visualization Tool v2

소셜 네트워크 분석(Social Network Analysis) 데이터를 시각화하고 분석할 수 있는 웹 기반 도구입니다.

## 📋 목차

- [주요 기능](#주요-기능)
- [기술 스택](#기술-스택)
- [설치 및 실행](#설치-및-실행)
- [사용 방법](#사용-방법)
- [프로젝트 구조](#프로젝트-구조)
- [환경 변수 설정](#환경-변수-설정)
- [주요 페이지](#주요-페이지)

## ✨ 주요 기능

### 1. 네트워크 시각화
- **2D 시각화**: Sigma.js를 사용한 인터랙티브 2D 네트워크 그래프
- **3D 시각화**: 3d-force-graph를 사용한 3D 네트워크 그래프
- 노드 크기는 연결 중심성(Degree Centrality)에 따라 자동 조정
- 엣지 두께는 가중치에 비례하여 표시
- 그래프를 PNG 이미지로 저장 가능

### 2. 데이터 입력 및 관리
- **스프레드시트 인터페이스**: Handsontable을 사용한 직관적인 데이터 입력
- **CSV 파일 업로드**: 표준 CSV 형식의 네트워크 데이터 업로드
- **예시 데이터 제공**: 5가지 예시 데이터셋 제공
- **데이터 편집**: 행 추가/삭제, 초기화 기능
- **데이터 저장/불러오기**: Firebase를 통한 클라우드 저장

### 3. 커뮤니티 감지
- **Louvain 알고리즘**: 네트워크 내 커뮤니티 자동 감지
- **커뮤니티 시각화**: 감지된 커뮤니티를 색상으로 구분하여 표시
- **커뮤니티 조정**: 해상도 조정을 통한 커뮤니티 수 조절
- **커뮤니티 목록**: 각 커뮤니티에 속한 노드 목록 표시

### 4. 중심성 계산
- **연결 중심성 (Degree Centrality)**: 각 노드의 직접 연결 수 계산
- **고유벡터 중심성 (Eigenvector Centrality)**: 영향력 있는 노드와의 연결을 고려한 중심성 계산
- **정렬 기능**: 중심성 값에 따라 노드 정렬 및 표시
- **Top 10 표시**: 중심성이 높은 상위 10개 노드 표시

### 5. 사용자 인증 및 데이터 관리
- **Google 로그인**: Firebase Authentication을 통한 Google 계정 로그인
- **데이터 저장**: 로그인한 사용자의 데이터를 Firebase Firestore에 저장
- **데이터 불러오기**: 저장된 데이터 목록에서 선택하여 불러오기
- **사용자별 데이터 관리**: 각 사용자는 자신의 데이터만 접근 가능

### 6. 보고서 작성
- **보고서 생성**: 저장된 데이터를 기반으로 분석 보고서 작성
- **그래프 포함**: 보고서에 네트워크 그래프 이미지 포함
- **커뮤니티 정보**: 감지된 커뮤니티 정보 표시
- **중심성 분석**: Top 10 중심성 노드 정보 포함
- **HTML 다운로드**: 완성된 보고서를 HTML 파일로 다운로드
- **보고서 저장**: Firebase에 보고서 저장 및 불러오기

## 🛠 기술 스택

### 프론트엔드
- **Vite**: 빌드 도구 및 개발 서버
- **Graphology**: 그래프 데이터 구조 및 분석 라이브러리
- **Sigma.js**: 2D 네트워크 그래프 시각화
- **3d-force-graph**: 3D 네트워크 그래프 시각화
- **Handsontable**: 스프레드시트 데이터 입력 인터페이스
- **PapaParse**: CSV 파일 파싱
- **SweetAlert2**: 사용자 인터페이스 알림

### 백엔드 및 인프라
- **Firebase Authentication**: Google 로그인 인증
- **Firebase Firestore**: 데이터베이스 및 데이터 저장
- **FileSaver.js**: 파일 다운로드 기능

## 🚀 설치 및 실행

### 사전 요구사항
- Node.js (v16 이상)
- npm 또는 yarn
- Firebase 프로젝트 설정

### 설치

1. 저장소 클론
```bash
git clone <repository-url>
cd ew-sna-vis-tool-v2
```

2. 의존성 설치
```bash
npm install
```

3. 환경 변수 설정
프로젝트 루트에 `.env` 파일을 생성하고 다음 변수들을 설정하세요:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_ADMIN_UIDS=admin-uid-1,admin-uid-2
```

### 실행

개발 서버 시작:
```bash
npm run dev
```

프로덕션 빌드:
```bash
npm run build
```

빌드 미리보기:
```bash
npm run preview
```

## 📖 사용 방법

### 1. 데이터 입력

#### 방법 A: CSV 파일 업로드
1. "CSV 파일 업로드" 버튼 클릭
2. Source1, Source2, Weight 형식의 CSV 파일 선택
3. 데이터가 자동으로 테이블에 로드됩니다

#### 방법 B: 예시 데이터 사용
1. "예시 데이터 불러오기" 버튼 클릭
2. 원하는 예시 데이터셋 선택
3. 데이터가 자동으로 테이블에 로드됩니다

#### 방법 C: 직접 입력
1. 테이블에 직접 데이터 입력
2. "행 추가" 버튼으로 새 행 추가
3. Source1, Source2, Weight 열에 데이터 입력

### 2. 그래프 시각화

1. 데이터 입력 후 "그래프 그리기" 버튼 클릭
2. 2D 또는 3D 시각화 도구 선택
3. 그래프가 자동으로 렌더링됩니다
4. 노드 클릭: 노드 정보 표시
5. 노드 드래그: 노드 위치 이동 (2D만)
6. 마우스 휠: 확대/축소
7. "PNG로 저장": 그래프를 이미지로 저장 (2D만)

### 3. 커뮤니티 감지

1. 그래프를 그린 후 "집단 찾기" 버튼 클릭
2. Louvain 알고리즘이 자동으로 커뮤니티를 감지합니다
3. 각 커뮤니티가 다른 색상으로 표시됩니다
4. "집단 수 +" / "집단 수 -" 버튼으로 해상도 조정
5. "집단 목록"에서 각 커뮤니티의 노드 확인

### 4. 중심성 계산

1. 그래프를 그린 후 "중심성 계산" 버튼 클릭
2. 연결 중심성과 고유벡터 중심성이 자동으로 계산됩니다
3. "연결 중심성 정렬" 또는 "고유벡터 중심성 정렬" 버튼으로 정렬
4. 중심성 테이블에서 각 노드의 중심성 값 확인

### 5. 데이터 저장 및 불러오기

#### 저장하기
1. Google 계정으로 로그인
2. "데이터 저장" 버튼 클릭
3. 제목, 작성자, 설명 입력
4. 저장 완료

#### 불러오기
1. Google 계정으로 로그인
2. "데이터 불러오기" 버튼 클릭
3. 저장된 데이터 목록에서 선택
4. 데이터가 자동으로 로드됩니다

### 6. 보고서 작성

1. "보고서 작성하기" 페이지로 이동 (로그인 필요)
2. "데이터 불러오기" 또는 "보고서 불러오기" 선택
3. 그래프가 자동으로 표시됩니다
4. 보고서 제목, 작성자, 내용, 결론 등 작성
5. "보고서 저장" 버튼으로 Firebase에 저장
6. "HTML로 다운로드" 버튼으로 보고서 다운로드

## 📁 프로젝트 구조

```
ew-sna-vis-tool-v2/
├── public/
│   ├── icons/              # 아이콘 이미지
│   ├── main_header.svg     # 메인 헤더 로고
│   └── sample-data/        # 예시 데이터 CSV 파일
├── src/
│   ├── firebaseConfig.js   # Firebase 설정 및 함수
│   ├── scripts/
│   │   ├── auth.js        # 인증 관련 로직 (index.html)
│   │   ├── networkAuth.js # 인증 관련 로직 (네트워크 시각화 페이지)
│   │   ├── networkVisualizer.js    # 2D 네트워크 시각화 메인 로직
│   │   ├── networkVisualizer3d.js  # 3D 네트워크 시각화 메인 로직
│   │   ├── graphVisualizer.js      # 그래프 시각화 및 분석 (2D)
│   │   ├── makeReport.js           # 보고서 작성 로직
│   │   ├── csvLoader.js            # CSV 파일 로더
│   │   ├── sampleData.js           # 예시 데이터 관리
│   │   └── uiComponents.js         # UI 컴포넌트
│   └── styles/
│       ├── main.css                # 메인 스타일
│       ├── network-visualizer.css   # 네트워크 시각화 페이지 스타일
│       └── report.css              # 보고서 페이지 스타일
├── index.html                      # 메인 페이지
├── network-visualizer.html         # 2D 네트워크 시각화 페이지
├── network-visualizer-3d.html     # 3D 네트워크 시각화 페이지
├── make-a-report.html              # 보고서 작성 페이지
├── firestore.rules                 # Firestore 보안 규칙
├── vite.config.js                  # Vite 설정
└── package.json                    # 프로젝트 의존성
```

## ⚙️ 환경 변수 설정

`.env` 파일에 다음 환경 변수를 설정해야 합니다:

| 변수명 | 설명 |
|--------|------|
| `VITE_FIREBASE_API_KEY` | Firebase API 키 |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase 인증 도메인 |
| `VITE_FIREBASE_PROJECT_ID` | Firebase 프로젝트 ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage 버킷 |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase 메시징 발신자 ID |
| `VITE_FIREBASE_APP_ID` | Firebase 앱 ID |
| `VITE_ADMIN_UIDS` | 관리자 UID 목록 (쉼표로 구분) |

## 📄 주요 페이지

### 1. 메인 페이지 (`index.html`)
- 프로젝트 소개 및 네비게이션
- 로그인 상태에 따른 기능 표시
- 각 기능 페이지로 이동

### 2. 관계망 시각화 도구 (`network-visualizer.html`)
- 2D 네트워크 그래프 시각화
- 데이터 입력 및 편집
- 커뮤니티 감지 및 중심성 계산
- 데이터 저장/불러오기

### 3. 관계망 시각화 도구(3D) (`network-visualizer-3d.html`)
- 3D 네트워크 그래프 시각화
- 2D와 동일한 데이터 입력 및 분석 기능
- 3D 인터랙션 (회전, 확대/축소, 이동)

### 4. 보고서 작성하기 (`make-a-report.html`)
- 저장된 데이터 불러오기
- 그래프 시각화 및 분석 결과 표시
- 보고서 작성 및 편집
- HTML 다운로드

## 🔒 보안

- Firebase Authentication을 통한 사용자 인증
- Firestore 보안 규칙으로 사용자별 데이터 접근 제어
- 관리자 권한 기반 접근 제어

## 📝 라이선스

이 프로젝트는 개인 프로젝트입니다.

## 👤 제작자

Made by [Hyowon Wang](https://hyowonwang.netlify.app/)

---

**참고**: 이 도구는 소셜 네트워크 분석을 위한 시각화 및 분석 도구입니다. 데이터의 정확성과 해석은 사용자의 책임입니다.

