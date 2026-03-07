export default function Header() {
  return (
    <header className="header">
      <span className="header-logo">🌾</span>
      <div>
        <div className="header-title">
          PageIndex Demo
          <span className="header-badge">v0.1.0</span>
        </div>
        <div className="header-subtitle">react-native-pageindex · Farmer Dataset</div>
      </div>
      <div className="header-spacer" />
      <a
        className="header-link"
        href="https://github.com/subham11/react-native-pageindex"
        target="_blank"
        rel="noopener noreferrer"
      >
        ⭐ GitHub
      </a>
      <a
        className="header-link"
        href="https://www.npmjs.com/package/react-native-pageindex"
        target="_blank"
        rel="noopener noreferrer"
      >
        📦 npm
      </a>
    </header>
  );
}
