/**
 * Google Analytics 초기화
 */
export function initGoogleAnalytics() {
    const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
    
    if (!measurementId) {
      console.warn('Google Analytics Measurement ID가 설정되지 않았습니다.');
      return;
    }
  
    // Google Analytics 스크립트 로드
    const script1 = document.createElement('script');
    script1.async = true;
    script1.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script1);
  
    // Google Analytics 초기화 스크립트
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', measurementId);
  }
  
  // 페이지 로드 시 자동 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGoogleAnalytics);
  } else {
    initGoogleAnalytics();
  }