// Fit-to-viewport stage. Renders the 1366×1024 iPad Pro artboard scaled
// to fill the available space, letterboxed on velvet-black.

function SbStage({ children, w = 1366, h = 1024 }) {
  const { useState, useEffect } = React;
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const calc = () => {
      const sw = window.innerWidth;
      const sh = window.innerHeight;
      setScale(Math.min(sw / w, sh / h));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [w, h]);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#050406',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <div style={{
        width: w, height: h,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        position: 'relative',
        flexShrink: 0,
      }}>
        {children}
      </div>
    </div>
  );
}

Object.assign(window, { SbStage });
