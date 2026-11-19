// 用 SVGRenderer 把 3D 场景画成图片（无 GPU 时检查镜头、模型朝向；只画几何，不含贴图/描边/泛光）
// 真实渲染效果请用 test/browser.mjs（无头 Chromium + SwiftShader 软件 WebGL）
import { bundle } from './bundle.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import { execSync } from 'child_process';

const code = await bundle({ stdin: { contents: `import './src/web/main.ts'; import { SVGRenderer } from 'three/examples/jsm/renderers/SVGRenderer.js'; window.__SVGRenderer = SVGRenderer;`, resolveDir: '.', loader: 'ts' } });
const html = readFileSync('src/web/index.html', 'utf8').replace('<script>/*GAME_JS*/</script>', '');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window;
Object.defineProperty(w, 'innerWidth', { value: 960 }); Object.defineProperty(w, 'innerHeight', { value: 540 });
let now = 0, raf = null;
w.performance.now = () => now; w.requestAnimationFrame = cb => { raf = cb; };
w.HTMLCanvasElement.prototype.getContext = () => null;
w.TextDecoder = TextDecoder; w.TextEncoder = TextEncoder;
w.eval(code);
while (!w.__game || w.document.getElementById('start').textContent !== '开始冒险') await new Promise(r => setTimeout(r, 20));
const g = w.__game;
const step = s => { for (let i = 0; i < s * 30; i++) { now += 33.3; const c = raf; raf = null; c(now); } };
w.document.getElementById('start').click();
const shots = JSON.parse(process.argv[2] || '[]');
const R = new w.__SVGRenderer();
R.setSize(960, 540);
R.setQuality('low');
for (const [name, setup] of shots) {
  w.eval(`(${setup})(window.__game)`);
  step(0.5);
  g.camera.aspect = 960 / 540; g.camera.updateProjectionMatrix();
  R.render(g.scene, g.camera);
  const svg = R.domElement.outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  const { Resvg } = await import('@resvg/resvg-js');
  writeFileSync(`/tmp/${name}.png`, new Resvg(svg, { background: '#8fb8e8' }).render().asPng());
  console.log('ok', name);
}
