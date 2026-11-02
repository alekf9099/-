// 알림 보낸 앱 → 보기 좋은 이름 / 아이콘 / 색상
const KNOWN = [
  { match: /kakao/i, name: '카카오톡', icon: '💬', color: '#FEE500', ink: '#191919' },
  { match: /slack/i, name: 'Slack', icon: '#', color: '#4A154B', ink: '#fff' },
  { match: /discord/i, name: 'Discord', icon: '🎮', color: '#5865F2', ink: '#fff' },
  { match: /teams/i, name: 'Teams', icon: '👥', color: '#5B5FC7', ink: '#fff' },
  { match: /outlook|mail/i, name: '메일', icon: '✉️', color: '#0F6CBD', ink: '#fff' },
  { match: /gmail/i, name: 'Gmail', icon: '✉️', color: '#EA4335', ink: '#fff' },
  { match: /telegram/i, name: 'Telegram', icon: '✈️', color: '#26A5E4', ink: '#fff' },
  { match: /line/i, name: 'LINE', icon: '💚', color: '#06C755', ink: '#fff' },
  { match: /naver|whale/i, name: '네이버', icon: 'N', color: '#03C75A', ink: '#fff' },
  { match: /chrome/i, name: 'Chrome', icon: '🌐', color: '#1A73E8', ink: '#fff' },
  { match: /edge/i, name: 'Edge', icon: '🌐', color: '#0C59A4', ink: '#fff' },
  { match: /calendar|일정/i, name: '캘린더', icon: '📅', color: '#E8710A', ink: '#fff' },
  { match: /github/i, name: 'GitHub', icon: '🐙', color: '#24292F', ink: '#fff' },
  { match: /windows\.defender|security/i, name: 'Windows 보안', icon: '🛡️', color: '#0078D4', ink: '#fff' },
];

function describeApp(raw) {
  const s = String(raw || '').trim();
  for (const k of KNOWN) if (k.match.test(s)) return { name: k.name, icon: k.icon, color: k.color, ink: k.ink };
  // 예: "C:\\...\\Foo.exe" / "Microsoft.WindowsStore_8wekyb3d8bbwe!App" → "Foo" / "WindowsStore"
  let name = s.split(/[\\/]/).pop() || '알림';
  name = name.replace(/\.exe$/i, '').replace(/_[a-z0-9]{13}!.*$/i, '').replace(/^Microsoft\./, '').replace(/!.*$/, '');
  if (name.length > 24) name = name.slice(0, 24) + '…';
  return { name: name || '알림', icon: '🔔', color: '#FF7A45', ink: '#fff' };
}

module.exports = { describeApp };
