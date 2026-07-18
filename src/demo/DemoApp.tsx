import {useRef, useState, useEffect} from 'react';
import {TEST_DATA} from "./test-data";
import {MockStandardNotes} from "./mock-notes";

const mock = new MockStandardNotes(TEST_DATA[0], () => {
  const el = document.getElementById('last-saved');
  if (el) {
    el.textContent = `Last Saved: ${new Date().toLocaleTimeString()}`;
  }
});

const DemoApp = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [selected, setSelected] = useState(0);
  const [disabled, setDisabled] = useState(false);
  const [theme, setTheme] = useState('light');

  const changeMenuItem = (i) => {
    setSelected(i);
    mock.changeData(TEST_DATA[i]);
  };

  const renderMenuItem = (_, i) => {
    return <div className={selected === i ? 'menu-item selected' : 'menu-item'}
                onClick={() => changeMenuItem(i)}>{TEST_DATA[i].title}</div>;
  };

  const onToggleDisabled = (e) => {
    setDisabled(e.target.checked);
    mock.toggleLock(e.target.checked);
  };

  const onChangeTheme = (e) => {
    const newTheme = e.target.checked ? 'dark' : 'light';
    setTheme(newTheme);
    mock.toggleTheme(e.target.checked);
    
    // Update document theme attribute
    if (newTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  };

  const onFrameLoad = () => {
    mock.onReady(iframeRef.current.contentWindow);
  };
  
  // Set initial theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, []);

  return (
    <div className="demo">
      <div className="menu">
        {
          TEST_DATA.map(renderMenuItem)
        }
      </div>
      <div className="content">
        <div className="content-header">
          <div><input id="editingDisabled" type="checkbox" checked={disabled} onChange={onToggleDisabled}></input><label
            htmlFor="editingDisabled"> Editing Disabled</label></div>
          <div><input id="isDark" type="checkbox" checked={theme === 'dark'} onChange={onChangeTheme}></input><label
            htmlFor="isDark"> Dark Theme</label></div>
          <div id="last-saved"></div>
        </div>
        <iframe key={selected} ref={iframeRef} src="index.html" onLoad={onFrameLoad}/>
      </div>
    </div>
  );
}

export default DemoApp
