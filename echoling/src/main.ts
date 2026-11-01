import './styles.css';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { app, currentRoute, go } from './ui/app';
import { closeTopSheet, toast } from './ui/dom';
import './ui/screens/meta';
import './ui/screens/map';
import './ui/screens/battle';
import './ui/screens/nodes';

go('title');

// ── 안드로이드 하드웨어 뒤로가기: 시트 닫기 → 하위 화면은 타이틀로 → 타이틀에서 2회 눌러 종료
let lastBack = 0;
function onBack(): void {
  if (closeTopSheet()) return;
  if (currentRoute === 'battle') return toast('전투 중에는 나갈 수 없어요');
  if (['dex', 'lab', 'settings', 'starter', 'runEnd'].includes(currentRoute)) return go('title');
  if (currentRoute !== 'title') return go('title');
  const now = Date.now();
  if (now - lastBack < 1800) {
    void CapApp.exitApp();
    return;
  }
  lastBack = now;
  toast('한 번 더 누르면 종료돼요');
}

if (Capacitor.isNativePlatform()) {
  void CapApp.addListener('backButton', onBack);
  // 백그라운드 전환 시 자동 저장은 이미 노드 단위로 수행됨
} else {
  // 웹(PWA): 브라우저 뒤로가기도 동일 UX
  history.pushState(null, '', location.href);
  window.addEventListener('popstate', () => {
    history.pushState(null, '', location.href);
    onBack();
  });
}

// QA 자동화 훅 (오프라인 싱글 게임 → 노출해도 무해)
(window as unknown as { __echoling: unknown }).__echoling = { app, go };
