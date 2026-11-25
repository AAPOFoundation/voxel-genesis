// Own WebGL programs, buffers and incremental world rendering.
import { pick } from './pick.mjs';
import { buildMesh, buildDynamicMesh, faces } from './geometry.mjs';
import { tapMarks } from './tap.mjs';
export { buildMesh, buildDynamicMesh } from './geometry.mjs';
const STRIDE = 8;
const TILE = 256;
const vertex = `
attribute vec3 position;
attribute vec3 colour;
attribute float face;
attribute float owner;
uniform vec3 focus;
uniform vec4 camera;
uniform vec2 scale;
uniform float depthRange;
uniform vec2 maskSize;
uniform sampler2D mask;
uniform float patched;
varying mediump vec3 tint;
varying mediump float hidden;
void main(){
 vec3 p=position-focus;
 float sn=camera.x, cs=camera.y, sp=camera.z, cp=camera.w;
 float across=p.x*cs-p.z*sn, along=p.x*sn+p.z*cs;
 gl_Position=vec4(across*scale.x,(p.y*cp-along*sp)*scale.y,-(along*cp+p.y*sp)/depthRange,1.0);
 float shade=1.0;
 hidden=0.0;
 if(abs(face)==1.0){shade=.76+.15*(sn>0.0?cs:-cs);if(face*sn<=0.0)hidden=1.0;}
 if(abs(face)==2.0){shade=.76+.15*(cs>0.0?-sn:sn);if(face*cs<=0.0)hidden=1.0;}
 if (patched > 0.5 && owner >= 0.0) {
   vec2 uv = (vec2(mod(owner,maskSize.x),floor(owner/maskSize.x))+.5)/maskSize;
   hidden = max(hidden,texture2D(mask,uv).a);
 }
 tint=colour*shade;
}`;
const fragment = `precision mediump float; varying mediump vec3 tint; varying mediump float hidden;
void main(){if(hidden>.5)discard;gl_FragColor=vec4(tint,1.0);}`;
function shader(gl, type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}
/** Own GL resources and render static, changed and moving geometry. */
export class GLRenderer {
  static create(canvas, world, options = {}) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true });
    if (!gl || gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) < 1) {
      return null;
    }
    const vs = shader(gl, gl.VERTEX_SHADER, vertex);
    const fs = shader(gl, gl.FRAGMENT_SHADER, fragment);
    if (!vs || !fs) {
      if (vs) {
        gl.deleteShader(vs);
      }
      if (fs) {
        gl.deleteShader(fs);
      }
      return null;
    }
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    return new GLRenderer(canvas, world, gl, program, options);
  }
  constructor(canvas, world, gl, program, { reduced = false } = {}) {
    Object.assign(
      this,
      {
        canvas,
        world,
        gl,
        program,
        reduced,
        yaw:.7,
        pitch:.56,
        span: Math.max(world.w, world.d) * 1.5,
        focus: [world.w / 2, 2, world.d / 2],
        extras: [],
        kind: 'webgl'
      }
    );
    this.staticBuffer = gl.createBuffer();
    this.dynamicBuffer = gl.createBuffer();
    this.patchBuffer = gl.createBuffer();
    this.mask = gl.createTexture();
    this.attributes = Object.fromEntries(
      ['position', 'colour', 'face', 'owner'].map(n => [n, gl.getAttribLocation(program, n)])
    );
    this.uniforms = Object.fromEntries(
      ['focus', 'camera', 'scale', 'depthRange', 'maskSize', 'mask', 'patched'].map(
        n => [n, gl.getUniformLocation(program, n)]
      )
    );
    this.cachedWorld = null;
    this.cachedRev = - 1;
    this.changed = new Set();
    this.patchCount = 0;
  }
  pick(px, py) {
    return pick(this.world, this, this.canvas.width, this.canvas.height, px, py);
  }
  detach() {
    if (this.cachedWorld && this.cachedWorld.set === this.watchedSet) {
      this.cachedWorld.set = this.originalSet;
    }
  }
  rebuild() {
    this.detach();
    const gl = this.gl;
    const w = this.world;
    this.cachedWorld = w;
    this.cachedRev = w.rev;
    this.cachedSize = [w.w, w.d, w.h];
    const mesh = buildMesh(w);
    this.staticCount = mesh.length / STRIDE;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.staticBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
    this.changed.clear();
    this.patchCount = 0;
    this.patchDirty = false;
    // Widen large masks to keep their height within a 4096-row texture limit.
    this.maskWidth = TILE * Math.ceil(w.cells.length / (TILE * 4096));
    this.maskHeight = Math.ceil(w.cells.length / this.maskWidth);
    this.maskBytes = new Uint8Array(this.maskWidth * this.maskHeight);
    gl.bindTexture(gl.TEXTURE_2D, this.mask);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.ALPHA,
      this.maskWidth,
      this.maskHeight,
      0,
      gl.ALPHA,
      gl.UNSIGNED_BYTE,
      this.maskBytes
    );
    // During playback, mask changed cells and neighbours in the static mesh.
    // Their current faces go into the delta buffer until the committed rev changes.
    const self = this;
    this.originalSet = w.set;
    this.watchedSet = function (x, y, z, id) {
      const old = this.get(x, y, z);
      const result = self.originalSet.call(this, x, y, z, id);
      if (result && old !== id) {
        for (
          const [dx, dy, dz] of [
            [0, 0, 0],
            ...faces.map(f => f.step),
            [0, - 1, 0],
            [1, - 1, 0],
            [0, - 1, 1]
          ]
        ) {
          const xx = x + dx;
          const yy = y + dy;
          const zz = z + dz;
          if (this.inside(xx, yy, zz)) {
            const i = (yy * this.d + zz) * this.w + xx;
            self.changed.add(i);
            self.maskBytes[i] = 255;
          }
        }
        self.patchDirty = true;
      }
      return result;
    };
    w.set = this.watchedSet;
  }
  draw(buffer, count, patched) {
    if (!count) {
      return;
    }
    const gl = this.gl;
    const a = this.attributes;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (
      const [key, size, offset] of [
        ['position', 3, 0],
        ['colour', 3, 12],
        ['face', 1, 24],
        ['owner', 1, 28]
      ]
    ) {
      gl.enableVertexAttribArray(a[key]);
      gl.vertexAttribPointer(a[key], size, gl.FLOAT, false, STRIDE * 4, offset);
    }
    gl.uniform1f(this.uniforms.patched, patched);
    gl.drawArrays(gl.TRIANGLES, 0, count);
  }
  render() {
    const gl = this.gl;
    const w = this.world;
    if (gl.isContextLost()) {
      return false;
    }
    if (this.cachedWorld !== w || this.cachedRev !== w.rev ||
      this.cachedSize.some((n, i) => n !== [w.w, w.d, w.h][i])) {
      this.rebuild();
    }
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.mask);
    if (this.patchDirty) {
      const patch = buildMesh(w, this.changed);
      this.patchCount = patch.length / STRIDE;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.patchBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, patch, gl.DYNAMIC_DRAW);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        this.maskWidth,
        this.maskHeight,
        gl.ALPHA,
        gl.UNSIGNED_BYTE,
        this.maskBytes
      );
      this.patchDirty = false;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(248 / 255, 244 / 255, 237 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    const u = this.uniforms;
    gl.uniform3fv(u.focus, this.focus);
    gl.uniform4f(
      u.camera,
      Math.sin(this.yaw),
      Math.cos(this.yaw),
      Math.sin(this.pitch),
      Math.cos(this.pitch)
    );
    gl.uniform2f(
      u.scale,
      2 / this.span,
      2 * this.canvas.width / (this.span * this.canvas.height)
    );
    gl.uniform1f(u.depthRange, (w.w + w.d + w.h) * 4);
    gl.uniform2f(u.maskSize, this.maskWidth, this.maskHeight);
    gl.uniform1i(u.mask, 0);
    this.draw(this.staticBuffer, this.staticCount, 1);
    this.draw(this.patchBuffer, this.patchCount, 0);
    const time = this.reduced ? 0 : performance.now() / 1000;
    this.extras = tapMarks(w, { reduced: this.reduced, time });
    const dynamic = buildDynamicMesh(w, { reduced: this.reduced, extras: this.extras });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, dynamic, gl.DYNAMIC_DRAW);
    this.draw(this.dynamicBuffer, dynamic.length / STRIDE, 0);
    return true;
  }
  dispose() {
    this.detach();
    const gl = this.gl;
    for (const b of [this.staticBuffer, this.dynamicBuffer, this.patchBuffer]) {
      gl.deleteBuffer(b);
    }
    gl.deleteTexture(this.mask);
    gl.deleteProgram(this.program);
  }
}
