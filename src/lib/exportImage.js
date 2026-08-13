// Export an <svg> DOM node as a standalone SVG file or a rasterized PNG.
// The on-screen chart styles text via CSS classes, which won't travel with a
// serialized SVG — so we inline an equivalent <style> block (with CSS custom
// properties resolved to literal colors) before serializing.

const INLINE_STYLE = `
  text { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  .tick-label { font-size: 10px; fill: #6b7280; }
  .axis-title { font-size: 11px; fill: #6b7280; }
  .unit-header { font-size: 12px; font-weight: 600; fill: #1f2430; }
  .row-label { font-size: 12px; fill: #1f2430; }
  .row-label-sub { font-size: 11px; fill: #6b7280; }
  .seg-label { font-size: 10px; font-weight: 500; }
  .n-label { font-size: 10px; fill: #6b7280; }
  .empty-label { font-size: 11px; fill: #bbb; font-style: italic; }
`;

// Return a serialized, self-contained SVG string with a white background.
function serialize(svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const width = Number(svg.getAttribute('width'));
  const height = Number(svg.getAttribute('height'));
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);

  // White background rect (so PNGs aren't transparent).
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = INLINE_STYLE;
  clone.insertBefore(style, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  return { xml, width, height };
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSVG(svg, filename = 'likert-chart.svg') {
  const { xml } = serialize(svg);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, filename);
}

export function downloadPNG(svg, filename = 'likert-chart.png', scale = 2) {
  const { xml, width, height } = serialize(svg);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (blob) triggerDownload(blob, filename);
    }, 'image/png');
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}
