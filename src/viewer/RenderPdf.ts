import * as THREE from 'three';
import type { BorderCrop, PdfCalibration, PdfNorthArrow, PdfScaleBar, PdfKnownDistance } from '../core/contract';
import type {
  PdfDecodeTileRequest,
  PdfOpenRequest,
  PdfWorkerMessage,
} from '../workers/pdf.worker';
import type { Vec3 } from './geometry';

const TILE_SIZE_PX = 1024;
const DEFAULT_PIXELS_PER_FOOT = 100;
const MAX_CONCURRENT_TILE_DECODES = 4;

interface PdfTileState {
  id: string;
  window: [number, number, number, number];
  needsCropMask: boolean;
  localBounds: THREE.Box3;
  loaded: boolean;
  loading: boolean;
  requestToken: number;
  mesh: THREE.Mesh | null;
  texture: THREE.DataTexture | null;
  bounds: THREE.Box3;
}

export interface PdfRenderableSheet {
  handle: string;
  pageIndex: number;
  label: string;
  visible: boolean;
  calibration: PdfCalibration | null;
  orientation: number | null;
  opacityPct: number;
  whiteThreshold: number;
  widthPx150: number;
  heightPx150: number;
  flatOffsetPx: { x: number; y: number };
  borderCrop: BorderCrop | null;
  northArrow: PdfNorthArrow | null;
  scaleBar: PdfScaleBar | null;
  knownDistance: PdfKnownDistance | null;
}

export class RenderPdf {
  readonly handle: string;
  readonly group = new THREE.Group();

  private sheet: PdfRenderableSheet;
  private file: File;
  private origin: Vec3;
  private worker: Worker;
  private workerReady = false;
  private nextMessageId = 0;
  private pending = new Map<number, (msg: PdfWorkerMessage) => void>();
  private tiles: PdfTileState[] = [];
  private visibleAll = true;
  private opacity = 1;
  private requestRender: () => void;
  private notifyBoundsChanged: () => void;
  private disposedFlag = false;
  private outlineMesh: THREE.LineLoop | null = null;
  private loadingBarMesh: THREE.Mesh | null = null;
  private loadingBarTexture: THREE.DataTexture | null = null;
  private northArrowGroup: THREE.Group | null = null;
  private scaleBarGroup: THREE.Group | null = null;
  private knownDistanceGroup: THREE.Group | null = null;
  private sheetRenderOrder = 30;

  constructor(
    handle: string,
    sheet: PdfRenderableSheet,
    file: File,
    origin: Vec3,
    requestRender: () => void,
    notifyBoundsChanged: () => void,
  ) {
    this.handle = handle;
    this.sheet = sheet;
    this.file = file;
    this.origin = origin;
    this.requestRender = requestRender;
    this.notifyBoundsChanged = notifyBoundsChanged;
    this.group.name = `pdf:${handle}`;
    this.group.renderOrder = this.sheetRenderOrder;
    this.applyTransform();
    this.tiles = this.buildTileIndex();
    this.buildLoadingOverlay();
    this.buildNorthArrowOverlay();
    this.buildScaleBarOverlay();
    this.buildKnownDistanceOverlay();
    this.worker = new Worker(new URL('../workers/pdf.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<PdfWorkerMessage>) => {
      const resolver = this.pending.get(e.data.id);
      if (!resolver) return;
      resolver(e.data);
    };
    this.worker.onerror = (e) => {
      console.warn(`[PDF] worker error for "${this.sheet.label}":`, e.message);
    };
    this.openWorker();
  }

  get bounds(): THREE.Box3 {
    if (!this.group.visible) return new THREE.Box3().makeEmpty();
    const box = new THREE.Box3();
    for (const tile of this.tiles) box.union(tile.bounds);
    if (box.isEmpty()) {
      const size = this.sheetWorldSize();
      box.set(
        new THREE.Vector3(-size.width / 2, -size.height / 2, 0),
        new THREE.Vector3(size.width / 2, size.height / 2, 0),
      );
    }
    return box.applyMatrix4(this.group.matrixWorld);
  }

  dispose(): void {
    this.disposedFlag = true;
    this.clearLoadedTiles();
    this.pending.clear();
    this.worker.terminate();
    this.disposeLoadingOverlay();
    this.disposeNorthArrowOverlay();
    this.disposeScaleBarOverlay();
    this.disposeKnownDistanceOverlay();
    this.group.removeFromParent();
  }

  setDisplay(visible: boolean, opacityPct: number): void {
    this.visibleAll = visible;
    this.opacity = THREE.MathUtils.clamp(opacityPct / 100, 0, 1);
    this.group.visible = visible;
    for (const tile of this.tiles) {
      const material = tile.mesh?.material as THREE.MeshBasicMaterial | undefined;
      if (!material) continue;
      material.opacity = this.opacity;
      material.transparent = true;
      material.needsUpdate = true;
    }
    this.requestRender();
  }

  updateSheet(sheet: PdfRenderableSheet): void {
    const scaleChanged = this.pixelsPerFoot() !== pixelsPerFootForSheet(sheet);
    const thresholdChanged = this.sheet.whiteThreshold !== sheet.whiteThreshold;
    const cropChanged = JSON.stringify(this.sheet.borderCrop) !== JSON.stringify(sheet.borderCrop);
    // Capture old markup refs before reassignment so vis-only check can compare old vs new
    const oldNorthArrow = this.sheet.northArrow;
    const oldScaleBar = this.sheet.scaleBar;
    const oldKnownDistance = this.sheet.knownDistance;
    const northArrowChanged = JSON.stringify(oldNorthArrow) !== JSON.stringify(sheet.northArrow);
    const scaleBarChanged = JSON.stringify(oldScaleBar) !== JSON.stringify(sheet.scaleBar);
    const knownDistanceChanged = JSON.stringify(oldKnownDistance) !== JSON.stringify(sheet.knownDistance);
    this.sheet = sheet;
    this.applyTransform();
    if (scaleChanged || cropChanged) {
      this.clearLoadedTiles();
      this.tiles = this.buildTileIndex();
      this.notifyBoundsChanged();
    } else if (thresholdChanged) {
      this.clearLoadedTiles();
    }
    if (scaleChanged || northArrowChanged) {
      // Visibility-only: just toggle group.visible, no geometry rebuild
      const naVisOnly = !scaleChanged
        && this.northArrowGroup !== null
        && oldNorthArrow !== null && sheet.northArrow !== null
        && oldNorthArrow.visible !== sheet.northArrow.visible
        && JSON.stringify({ ...oldNorthArrow, visible: sheet.northArrow.visible }) === JSON.stringify(sheet.northArrow);
      if (naVisOnly && this.northArrowGroup) {
        this.northArrowGroup.visible = sheet.northArrow!.visible;
        this.requestRender();
      } else {
        this.buildNorthArrowOverlay();
      }
    }
    if (scaleChanged || scaleBarChanged) {
      const sbVisOnly = !scaleChanged
        && this.scaleBarGroup !== null
        && oldScaleBar !== null && sheet.scaleBar !== null
        && oldScaleBar.visible !== sheet.scaleBar.visible
        && JSON.stringify({ ...oldScaleBar, visible: sheet.scaleBar.visible }) === JSON.stringify(sheet.scaleBar);
      if (sbVisOnly && this.scaleBarGroup) {
        this.scaleBarGroup.visible = sheet.scaleBar!.visible;
        this.requestRender();
      } else {
        this.buildScaleBarOverlay();
      }
    }
    if (scaleChanged || knownDistanceChanged) {
      const kdVisOnly = !scaleChanged
        && this.knownDistanceGroup !== null
        && oldKnownDistance !== null && sheet.knownDistance !== null
        && oldKnownDistance.visible !== sheet.knownDistance.visible
        && JSON.stringify({ ...oldKnownDistance, visible: sheet.knownDistance.visible }) === JSON.stringify(sheet.knownDistance);
      if (kdVisOnly && this.knownDistanceGroup) {
        this.knownDistanceGroup.visible = sheet.knownDistance!.visible;
        this.requestRender();
      } else {
        this.buildKnownDistanceOverlay();
      }
    }
    this.setDisplay(sheet.visible, sheet.opacityPct);
  }

  setRenderOrder(order: number): void {
    this.sheetRenderOrder = 30 + order;
    this.group.renderOrder = this.sheetRenderOrder;
    if (this.outlineMesh) this.outlineMesh.renderOrder = this.sheetRenderOrder + 1;
    if (this.loadingBarMesh) this.loadingBarMesh.renderOrder = this.sheetRenderOrder + 2;
    for (const tile of this.tiles) {
      if (tile.mesh) tile.mesh.renderOrder = this.sheetRenderOrder;
    }
    this.requestRender();
  }

  updateVisible(camera: THREE.Camera): boolean {
    this.group.visible = this.visibleAll;
    if (!this.group.visible || !this.workerReady) {
      let changed = false;
      for (const tile of this.tiles) {
        if (tile.mesh) {
          this.disposeTile(tile);
          changed = true;
        }
      }
      if (changed) this.notifyBoundsChanged();
      return changed;
    }

    const projScreen = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(projScreen);
    this.group.updateMatrixWorld(true);
    let activeDecodes = this.tiles.reduce((count, tile) => count + (tile.loading ? 1 : 0), 0);
    for (const tile of this.tiles) {
      const worldBox = tile.localBounds.clone().applyMatrix4(this.group.matrixWorld);
      const shouldShow = frustum.intersectsBox(worldBox);
      // Only decode tiles newly entering the frustum; loaded tiles are never evicted on pan.
      if (shouldShow && !tile.loaded && !tile.loading && activeDecodes < MAX_CONCURRENT_TILE_DECODES) {
        void this.decodeTile(tile);
        activeDecodes++;
      }
    }

    if (this.outlineMesh !== null || this.loadingBarMesh !== null) {
      // Clear once every tile that intersects the frustum is loaded.
      // Out-of-frustum tiles are never decoded, so we exclude them from the check.
      const frustumTiles = this.tiles.filter((t) => {
        const worldBox = t.localBounds.clone().applyMatrix4(this.group.matrixWorld);
        return frustum.intersectsBox(worldBox);
      });
      const allVisibleLoaded = frustumTiles.length > 0 && frustumTiles.every((t) => t.loaded);
      if (allVisibleLoaded) {
        this.disposeLoadingOverlay();
      } else {
        this.updateLoadingBar(performance.now());
        this.requestRender();
      }
    }

    return false;
  }

  private pixelsPerFoot(): number {
    return pixelsPerFootForSheet(this.sheet);
  }

  private sheetWorldSize(): { width: number; height: number } {
    const ppf = this.pixelsPerFoot();
    return {
      width: this.sheet.widthPx150 / ppf,
      height: this.sheet.heightPx150 / ppf,
    };
  }

  private applyTransform(): void {
    const rotation = THREE.MathUtils.degToRad(this.sheet.orientation ?? 0);
    const ppf = this.pixelsPerFoot();
    this.group.position.set(this.sheet.flatOffsetPx.x / ppf, this.sheet.flatOffsetPx.y / ppf, -this.origin[2]);
    this.group.rotation.set(0, 0, rotation);
    this.group.visible = this.visibleAll;
  }

  private buildLoadingOverlay(): void {
    const size = this.sheetWorldSize();
    const hw = size.width / 2;
    const hh = size.height / 2;

    // Dashed outline
    const outlinePositions = new Float32Array([
      -hw, -hh, 0,
       hw, -hh, 0,
       hw,  hh, 0,
      -hw,  hh, 0,
    ]);
    const outlineGeo = new THREE.BufferGeometry();
    outlineGeo.setAttribute('position', new THREE.BufferAttribute(outlinePositions, 3));
    const outlineMat = new THREE.LineDashedMaterial({
      color: 0x2a2f35,
      dashSize: 1,
      gapSize: 0.5,
      depthWrite: false,
    });
    const outline = new THREE.LineLoop(outlineGeo, outlineMat);
    outline.computeLineDistances();
    outline.name = `pdf-outline:${this.handle}`;
    outline.renderOrder = this.sheetRenderOrder + 1;
    this.group.add(outline);
    this.outlineMesh = outline;

    // Loading bar
    const barWidth = size.width * 0.6;
    const barHeight = size.height * 0.04;
    const texWidth = 256;
    const texHeight = 16;
    const texData = new Uint8Array(texWidth * texHeight * 4);
    // Fill with dark track color (0x1a1d21, alpha 200)
    for (let i = 0; i < texWidth * texHeight; i++) {
      texData[i * 4 + 0] = 0x1a;
      texData[i * 4 + 1] = 0x1d;
      texData[i * 4 + 2] = 0x21;
      texData[i * 4 + 3] = 200;
    }
    const texture = new THREE.DataTexture(texData, texWidth, texHeight, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.needsUpdate = true;
    const barGeo = new THREE.PlaneGeometry(barWidth, barHeight);
    barGeo.translate(0, 0, 0.02);
    const barMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const barMesh = new THREE.Mesh(barGeo, barMat);
    barMesh.name = `pdf-loadingbar:${this.handle}`;
    barMesh.renderOrder = this.sheetRenderOrder + 2;
    this.group.add(barMesh);
    this.loadingBarMesh = barMesh;
    this.loadingBarTexture = texture;
  }

  private updateLoadingBar(timestamp: number): void {
    const texture = this.loadingBarTexture;
    if (!texture) return;
    const data = texture.image.data as Uint8Array;
    const texWidth = 256;
    const texHeight = 16;
    // Reset to track color
    for (let i = 0; i < texWidth * texHeight; i++) {
      data[i * 4 + 0] = 0x1a;
      data[i * 4 + 1] = 0x1d;
      data[i * 4 + 2] = 0x21;
      data[i * 4 + 3] = 200;
    }
    // Indeterminate sliding highlight: period 1400ms, highlight width = 40% of texture
    const period = 1400;
    const t = (timestamp % period) / period; // 0..1
    const highlightW = Math.floor(texWidth * 0.4);
    // Center of highlight travels from -highlightW to texWidth+highlightW
    const travelRange = texWidth + highlightW;
    const centerX = Math.floor(t * travelRange) - Math.floor(highlightW / 2);
    const x0 = Math.max(0, centerX - Math.floor(highlightW / 2));
    const x1 = Math.min(texWidth, centerX + Math.floor(highlightW / 2));
    for (let row = 0; row < texHeight; row++) {
      for (let col = x0; col < x1; col++) {
        const idx = (row * texWidth + col) * 4;
        data[idx + 0] = 0x4a;
        data[idx + 1] = 0x9e;
        data[idx + 2] = 0xd8;
        data[idx + 3] = 220;
      }
    }
    texture.needsUpdate = true;
  }

  private buildNorthArrowOverlay(): void {
    this.disposeNorthArrowOverlay();
    const na = this.sheet.northArrow;
    if (!na) return;

    const ppf = this.pixelsPerFoot();
    const fullW = this.sheet.widthPx150 / ppf;
    const fullH = this.sheet.heightPx150 / ppf;

    // Convert sheet-px origin (top-left) to local 3D coords (center origin, Y-up)
    const cx = (na.x - this.sheet.widthPx150 / 2) / ppf;
    const cy = -((na.y - this.sheet.heightPx150 / 2) / ppf);
    const r = 75 / ppf; // NORTH_ARROW_RADIUS = 75px

    // Parse color hex to THREE.Color
    const color = new THREE.Color(na.color);

    const group = new THREE.Group();
    group.name = `pdf-north-arrow:${this.handle}`;
    group.renderOrder = 100;
    group.visible = na.visible;

    const lineMat = new THREE.LineBasicMaterial({
      color,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      toneMapped: false,
    });

    // Circle (32 segments)
    const circlePoints: THREE.Vector3[] = [];
    const SEG = 32;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      circlePoints.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0));
    }
    const circleGeo = new THREE.BufferGeometry().setFromPoints(circlePoints);
    const circle = new THREE.Line(circleGeo, lineMat);
    circle.renderOrder = 100;
    group.add(circle);

    // Arrow shaft: center to tip
    // angleDeg: 0=up (north), CW. In 3D: 0=up=+Y, CW from above = negative rotation around Z.
    const rad = (-na.angleDeg + 90) * Math.PI / 180; // convert to standard math angle
    const tipX = cx + Math.cos(rad) * r;
    const tipY = cy + Math.sin(rad) * r;
    const shaftGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cx, cy, 0),
      new THREE.Vector3(tipX, tipY, 0),
    ]);
    const shaft = new THREE.Line(shaftGeo, lineMat);
    shaft.renderOrder = 100;
    group.add(shaft);

    // Arrowhead (small filled triangle at tip)
    const headLen = 8 / ppf;
    const headW = 4 / ppf;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const px = -uy; // perpendicular
    const py = ux;
    const headGeo = new THREE.BufferGeometry();
    const headVerts = new Float32Array([
      tipX, tipY, 0,
      tipX - ux * headLen - px * headW, tipY - uy * headLen - py * headW, 0,
      tipX - ux * headLen + px * headW, tipY - uy * headLen + py * headW, 0,
    ]);
    headGeo.setAttribute('position', new THREE.BufferAttribute(headVerts, 3));
    const headMat = new THREE.MeshBasicMaterial({ color, depthWrite: false, depthTest: false, transparent: true, toneMapped: false, side: THREE.DoubleSide });
    const head = new THREE.Mesh(headGeo, headMat);
    head.renderOrder = 100;
    group.add(head);

    // N label as a small sprite-like plane with canvas texture
    const labelSize = 20 / ppf;
    const texSize = 64;
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = texSize;
    labelCanvas.height = texSize;
    const lctx = labelCanvas.getContext('2d');
    if (lctx) {
      lctx.fillStyle = 'rgba(17,20,23,0.75)';
      lctx.fillRect(0, 0, texSize, texSize);
      lctx.fillStyle = na.color;
      lctx.font = `bold ${Math.floor(texSize * 0.65)}px sans-serif`;
      lctx.textAlign = 'center';
      lctx.textBaseline = 'middle';
      lctx.fillText('N', texSize / 2, texSize / 2);
    }
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelGeo = new THREE.PlaneGeometry(labelSize, labelSize);
    labelGeo.translate(cx, cy, 0);
    const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, alphaTest: 0.1, depthWrite: false, depthTest: false, toneMapped: false, side: THREE.DoubleSide });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.renderOrder = 101;
    group.add(label);

    // Suppress unused variable warnings — fullW/fullH used only as sanity reference
    void fullW; void fullH;

    this.group.add(group);
    this.northArrowGroup = group;
    this.requestRender();
  }

  private disposeNorthArrowOverlay(): void {
    if (!this.northArrowGroup) return;
    this.northArrowGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            if ((m as THREE.MeshBasicMaterial).map) (m as THREE.MeshBasicMaterial).map!.dispose();
            m.dispose();
          });
        } else {
          const mat = obj.material as THREE.MeshBasicMaterial | THREE.LineBasicMaterial;
          if ('map' in mat && mat.map) mat.map.dispose();
          mat.dispose();
        }
      }
    });
    this.northArrowGroup.removeFromParent();
    this.northArrowGroup = null;
  }

  private buildScaleBarOverlay(): void {
    this.disposeScaleBarOverlay();
    const sb = this.sheet.scaleBar;
    if (!sb || !sb.visible || sb.realWorldFt === null) return;
    const ppf = this.pixelsPerFoot();
    const cx = (sb.x - this.sheet.widthPx150 / 2) / ppf;
    const cy = -((sb.y - this.sheet.heightPx150 / 2) / ppf);
    const halfW = (150 / 2) / ppf; // SCALE_BAR_LEN_PX / 2
    const headLen = 8 / ppf;
    const headW = 4 / ppf;
    const color = new THREE.Color(sb.color);
    const lineMat = new THREE.LineBasicMaterial({ color, depthWrite: false, depthTest: false, transparent: true, toneMapped: false });
    const group = new THREE.Group();
    group.name = `pdf-scale-bar:${this.handle}`;
    group.renderOrder = 100;
    // main line
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cx - halfW, cy, 0),
      new THREE.Vector3(cx + halfW, cy, 0),
    ]);
    const line = new THREE.Line(lineGeo, lineMat);
    line.renderOrder = 100;
    group.add(line);
    // left arrowhead
    const lhGeo = new THREE.BufferGeometry();
    lhGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      cx - halfW, cy, 0,
      cx - halfW + headLen, cy - headW, 0,
      cx - halfW + headLen, cy + headW, 0,
    ]), 3));
    const meshMat = new THREE.MeshBasicMaterial({ color, depthWrite: false, depthTest: false, transparent: true, toneMapped: false, side: THREE.DoubleSide });
    const lh = new THREE.Mesh(lhGeo, meshMat);
    lh.renderOrder = 100;
    group.add(lh);
    // right arrowhead
    const rhGeo = new THREE.BufferGeometry();
    rhGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      cx + halfW, cy, 0,
      cx + halfW - headLen, cy - headW, 0,
      cx + halfW - headLen, cy + headW, 0,
    ]), 3));
    const rh = new THREE.Mesh(rhGeo, meshMat.clone());
    rh.renderOrder = 100;
    group.add(rh);
    // label
    const texSize = 128;
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = texSize * 2; labelCanvas.height = texSize;
    const lctx = labelCanvas.getContext('2d');
    if (lctx) {
      lctx.fillStyle = 'rgba(17,20,23,0.75)';
      lctx.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
      lctx.fillStyle = sb.color;
      lctx.font = `bold ${Math.floor(texSize * 0.5)}px sans-serif`;
      lctx.textAlign = 'center';
      lctx.textBaseline = 'middle';
      lctx.fillText(`1"=${sb.realWorldFt}ft`, labelCanvas.width / 2, labelCanvas.height / 2);
    }
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelW = (halfW * 2) * 1.1;
    const labelH = labelW * 0.25;
    const labelGeo = new THREE.PlaneGeometry(labelW, labelH);
    labelGeo.translate(cx, cy - halfW * 0.4, 0);
    const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, alphaTest: 0.1, depthWrite: false, depthTest: false, toneMapped: false, side: THREE.DoubleSide });
    const labelMesh = new THREE.Mesh(labelGeo, labelMat);
    labelMesh.renderOrder = 101;
    group.add(labelMesh);
    this.group.add(group);
    this.scaleBarGroup = group;
    this.requestRender();
  }

  private disposeScaleBarOverlay(): void {
    if (!this.scaleBarGroup) return;
    this.scaleBarGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        const mat = obj.material as THREE.MeshBasicMaterial | THREE.LineBasicMaterial;
        if ('map' in mat && mat.map) mat.map.dispose();
        mat.dispose();
      }
    });
    this.scaleBarGroup.removeFromParent();
    this.scaleBarGroup = null;
  }

  private buildKnownDistanceOverlay(): void {
    this.disposeKnownDistanceOverlay();
    const kd = this.sheet.knownDistance;
    if (!kd || !kd.visible || kd.realWorldFt === null) return;
    const ppf = this.pixelsPerFoot();
    const toWorld = (p: { x: number; y: number }): THREE.Vector3 => new THREE.Vector3(
      (p.x - this.sheet.widthPx150 / 2) / ppf,
      -((p.y - this.sheet.heightPx150 / 2) / ppf),
      0,
    );
    const bv = toWorld(kd.begin);
    const ev = toWorld(kd.end);
    const dir = new THREE.Vector3().subVectors(ev, bv);
    const len = dir.length();
    if (len < 0.001) return;
    const ux = dir.x / len;
    const uy = dir.y / len;
    const headLen = 8 / ppf;
    const headW = 4 / ppf;
    const color = new THREE.Color(kd.color);
    const lineMat = new THREE.LineBasicMaterial({ color, depthWrite: false, depthTest: false, transparent: true, toneMapped: false });
    const group = new THREE.Group();
    group.name = `pdf-known-distance:${this.handle}`;
    group.renderOrder = 100;
    // main line
    const lineGeo = new THREE.BufferGeometry().setFromPoints([bv, ev]);
    const line = new THREE.Line(lineGeo, lineMat);
    line.renderOrder = 100;
    group.add(line);
    const meshMat = new THREE.MeshBasicMaterial({ color, depthWrite: false, depthTest: false, transparent: true, toneMapped: false, side: THREE.DoubleSide });
    // begin arrowhead
    const bhGeo = new THREE.BufferGeometry();
    bhGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      bv.x, bv.y, 0,
      bv.x + ux * headLen - uy * headW, bv.y + uy * headLen + ux * headW, 0,
      bv.x + ux * headLen + uy * headW, bv.y + uy * headLen - ux * headW, 0,
    ]), 3));
    const bh = new THREE.Mesh(bhGeo, meshMat);
    bh.renderOrder = 100;
    group.add(bh);
    // end arrowhead
    const ehGeo = new THREE.BufferGeometry();
    ehGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      ev.x, ev.y, 0,
      ev.x - ux * headLen - uy * headW, ev.y - uy * headLen + ux * headW, 0,
      ev.x - ux * headLen + uy * headW, ev.y - uy * headLen - ux * headW, 0,
    ]), 3));
    const eh = new THREE.Mesh(ehGeo, meshMat.clone());
    eh.renderOrder = 100;
    group.add(eh);
    // label at midpoint
    const mx = (bv.x + ev.x) / 2;
    const my = (bv.y + ev.y) / 2;
    const measuredIn = (len * ppf) / 150;
    const texSize = 128;
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = texSize * 2; labelCanvas.height = texSize;
    const lctx = labelCanvas.getContext('2d');
    if (lctx) {
      lctx.fillStyle = 'rgba(17,20,23,0.75)';
      lctx.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
      lctx.fillStyle = kd.color;
      lctx.font = `bold ${Math.floor(texSize * 0.45)}px sans-serif`;
      lctx.textAlign = 'center';
      lctx.textBaseline = 'middle';
      lctx.fillText(`${measuredIn.toFixed(2)}"=${kd.realWorldFt}ft`, labelCanvas.width / 2, labelCanvas.height / 2);
    }
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelW = len * 1.1;
    const labelH = labelW * 0.2;
    const labelGeo = new THREE.PlaneGeometry(labelW, labelH);
    labelGeo.translate(mx, my + labelH, 0);
    const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, alphaTest: 0.1, depthWrite: false, depthTest: false, toneMapped: false, side: THREE.DoubleSide });
    const labelMesh = new THREE.Mesh(labelGeo, labelMat);
    labelMesh.renderOrder = 101;
    group.add(labelMesh);
    this.group.add(group);
    this.knownDistanceGroup = group;
    this.requestRender();
  }

  private disposeKnownDistanceOverlay(): void {
    if (!this.knownDistanceGroup) return;
    this.knownDistanceGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        const mat = obj.material as THREE.MeshBasicMaterial | THREE.LineBasicMaterial;
        if ('map' in mat && mat.map) mat.map.dispose();
        mat.dispose();
      }
    });
    this.knownDistanceGroup.removeFromParent();
    this.knownDistanceGroup = null;
  }

    private disposeLoadingOverlay(): void {
    if (this.outlineMesh) {
      this.outlineMesh.removeFromParent();
      this.outlineMesh.geometry.dispose();
      (this.outlineMesh.material as THREE.Material).dispose();
      this.outlineMesh = null;
    }
    if (this.loadingBarMesh) {
      this.loadingBarMesh.removeFromParent();
      this.loadingBarMesh.geometry.dispose();
      (this.loadingBarMesh.material as THREE.Material).dispose();
      this.loadingBarMesh = null;
    }
    if (this.loadingBarTexture) {
      this.loadingBarTexture.dispose();
      this.loadingBarTexture = null;
    }
  }

  private openWorker(): void {
    const messageId = ++this.nextMessageId;
    const req: PdfOpenRequest = {
      kind: 'open',
      id: messageId,
      fileName: this.file.name,
      payload: this.file,
    };
    this.pending.set(messageId, (msg) => {
      if (msg.type === 'progress') return;
      this.pending.delete(messageId);
      if (msg.type === 'opened' && msg.ok) {
        this.workerReady = true;
      } else if (msg.type === 'result' && !msg.ok) {
        console.warn(`[PDF] worker open failed for "${this.sheet.label}":`, msg.error);
      }
      this.requestRender();
    });
    this.worker.postMessage(req);
  }

  private buildTileIndex(): PdfTileState[] {
    const tiles: PdfTileState[] = [];
    const ppf = this.pixelsPerFoot();
    const fullWidthFt = this.sheet.widthPx150 / ppf;
    const fullHeightFt = this.sheet.heightPx150 / ppf;
    const crop = borderCropBounds(this.sheet.borderCrop, this.sheet.widthPx150, this.sheet.heightPx150);
    const cropX0 = Math.max(0, Math.min(this.sheet.widthPx150, Math.floor(crop.x)));
    const cropY0 = Math.max(0, Math.min(this.sheet.heightPx150, Math.floor(crop.y)));
    const cropX1 = Math.max(cropX0, Math.min(this.sheet.widthPx150, Math.ceil(crop.x + crop.width)));
    const cropY1 = Math.max(cropY0, Math.min(this.sheet.heightPx150, Math.ceil(crop.y + crop.height)));
    for (let y = cropY0; y < cropY1; y += TILE_SIZE_PX) {
      for (let x = cropX0; x < cropX1; x += TILE_SIZE_PX) {
        const x1 = Math.min(cropX1, x + TILE_SIZE_PX);
        const y1 = Math.min(cropY1, y + TILE_SIZE_PX);
        const minX = x / ppf - fullWidthFt / 2;
        const maxX = x1 / ppf - fullWidthFt / 2;
        const maxY = fullHeightFt / 2 - y / ppf;
        const minY = fullHeightFt / 2 - y1 / ppf;
        const localBounds = new THREE.Box3(
          new THREE.Vector3(minX, minY, -0.01),
          new THREE.Vector3(maxX, maxY, 0.01),
        );
        tiles.push({
          id: `${x}:${y}`,
          window: [x, y, x1, y1],
          needsCropMask: this.sheet.borderCrop?.kind === 'polygon'
            ? tileNeedsCropMask(this.sheet.borderCrop, x, y, x1, y1)
            : false,
          localBounds,
          loaded: false,
          loading: false,
          requestToken: 0,
          mesh: null,
          texture: null,
          bounds: localBounds.clone(),
        });
      }
    }
    return tiles;
  }

  private async decodeTile(tile: PdfTileState): Promise<void> {
    const requestToken = ++tile.requestToken;
    tile.loading = true;
    const messageId = ++this.nextMessageId;
    const req: PdfDecodeTileRequest = {
      kind: 'decodeTile',
      id: messageId,
      pageIndex: this.sheet.pageIndex,
      window: tile.window,
      whiteThreshold: this.sheet.whiteThreshold,
    };
    const response = await new Promise<PdfWorkerMessage>((resolve) => {
      this.pending.set(messageId, (msg) => {
        this.pending.delete(messageId);
        resolve(msg);
      });
      this.worker.postMessage(req);
    });
    if (requestToken !== tile.requestToken || this.disposedFlag) return;
    tile.loading = false;
    if (response.type !== 'tile' || !response.ok || !this.group.visible) {
      if (response.type === 'result' && !response.ok) {
        console.warn(`[PDF] tile decode failed for "${this.sheet.label}":`, response.error);
      }
      return;
    }
    this.buildTileMesh(tile, response.tile.width, response.tile.height, response.tile.rgba);
    tile.loaded = true;
    this.notifyBoundsChanged();
    this.requestRender();
  }

  private buildTileMesh(tile: PdfTileState, width: number, height: number, rgba: Uint8ClampedArray): void {
    const pixels = new Uint8Array(rgba.length);
    pixels.set(rgba);
    const polygonCrop = this.sheet.borderCrop?.kind === 'polygon'
      ? this.sheet.borderCrop
      : null;
    const isMasked = tile.needsCropMask && polygonCrop !== null;
    if (polygonCrop && tile.needsCropMask) {
      maskTileRgba(
        pixels,
        width,
        height,
        tile.window,
        polygonCrop.points,
      );
    }
    const size = tile.localBounds.getSize(new THREE.Vector3());
    const center = tile.localBounds.getCenter(new THREE.Vector3());
    const geometry = new THREE.PlaneGeometry(size.x, size.y, 1, 1);
    geometry.translate(center.x, center.y, 0);
    const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.generateMipmaps = !isMasked;
    texture.minFilter = isMasked
      ? THREE.LinearFilter
      : THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: this.opacity,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `pdf-tile:${this.handle}:${tile.id}`;
    mesh.renderOrder = this.sheetRenderOrder;
    this.disposeTileMesh(tile);
    this.group.add(mesh);
    tile.mesh = mesh;
    tile.texture = texture;
    tile.bounds = tile.localBounds.clone();
  }

  private disposeTile(tile: PdfTileState): void {
    tile.requestToken++;
    tile.loaded = false;
    tile.loading = false;
    this.disposeTileMesh(tile);
  }

  private disposeTileMesh(tile: PdfTileState): void {
    tile.mesh?.removeFromParent();
    tile.mesh?.geometry.dispose();
    (tile.mesh?.material as THREE.Material | undefined)?.dispose();
    tile.texture?.dispose();
    tile.mesh = null;
    tile.texture = null;
  }

  private clearLoadedTiles(): void {
    for (const tile of this.tiles) this.disposeTile(tile);
  }
}

function pixelsPerFootForSheet(sheet: Pick<PdfRenderableSheet, 'calibration'>): number {
  const calibration: PdfCalibration | null = sheet.calibration;
  return calibration?.unit === 'foot' && calibration.pixelsPerUnit > 0
    ? calibration.pixelsPerUnit
    : DEFAULT_PIXELS_PER_FOOT;
}

function borderCropBounds(crop: BorderCrop | null, widthPx: number, heightPx: number): { x: number; y: number; width: number; height: number } {
  if (!crop) return { x: 0, y: 0, width: widthPx, height: heightPx };
  if (crop.kind === 'rect') return crop;
  if (crop.points.length === 0) return { x: 0, y: 0, width: widthPx, height: heightPx };
  const first = crop.points[0]!;
  let minX = first[0];
  let minY = first[1];
  let maxX = first[0];
  let maxY = first[1];
  for (const [x, y] of crop.points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

function pointInPolygon2D(point: [number, number], polygon: [number, number][]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (pointOnSegment(point, a, b)) return true;
    const intersects = ((a[1] > point[1]) !== (b[1] > point[1]))
      && (point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / ((b[1] - a[1]) || Number.EPSILON) + a[0]);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointOnSegment(point: [number, number], a: [number, number], b: [number, number]): boolean {
  const cross = (point[1] - a[1]) * (b[0] - a[0]) - (point[0] - a[0]) * (b[1] - a[1]);
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1]);
  if (dot < 0) return false;
  const lenSq = (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]);
  return dot <= lenSq;
}

function orientation2D(a: [number, number], b: [number, number], c: [number, number]): number {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(value) <= 1e-9) return 0;
  return value > 0 ? 1 : 2;
}

function segmentsIntersect(
  a0: [number, number],
  a1: [number, number],
  b0: [number, number],
  b1: [number, number],
): boolean {
  const o1 = orientation2D(a0, a1, b0);
  const o2 = orientation2D(a0, a1, b1);
  const o3 = orientation2D(b0, b1, a0);
  const o4 = orientation2D(b0, b1, a1);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && pointOnSegment(b0, a0, a1)) return true;
  if (o2 === 0 && pointOnSegment(b1, a0, a1)) return true;
  if (o3 === 0 && pointOnSegment(a0, b0, b1)) return true;
  if (o4 === 0 && pointOnSegment(a1, b0, b1)) return true;
  return false;
}

function tileNeedsCropMask(
  crop: BorderCrop,
  tileX0: number,
  tileY0: number,
  tileX1: number,
  tileY1: number,
): boolean {
  if (crop.kind === 'rect' || crop.points.length < 3) return false;
  const corners: [number, number][] = [
    [tileX0, tileY0],
    [tileX1, tileY0],
    [tileX1, tileY1],
    [tileX0, tileY1],
  ];
  if (!corners.every((corner) => pointInPolygon2D(corner, crop.points))) return true;

  const tileEdges: [[number, number], [number, number]][] = [
    [corners[0]!, corners[1]!],
    [corners[1]!, corners[2]!],
    [corners[2]!, corners[3]!],
    [corners[3]!, corners[0]!],
  ];
  for (let i = 0; i < crop.points.length; i++) {
    const a = crop.points[i]!;
    const b = crop.points[(i + 1) % crop.points.length]!;
    for (const [edgeA, edgeB] of tileEdges) {
      if (segmentsIntersect(a, b, edgeA, edgeB)) return true;
    }
  }
  return false;
}

function maskTileRgba(
  rgba: Uint8Array,
  tileWidth: number,
  tileHeight: number,
  tileWindow: [number, number, number, number],
  polygon: [number, number][],
): void {
  for (let py = 0; py < tileHeight; py++) {
    for (let px = 0; px < tileWidth; px++) {
      const sheetX = tileWindow[0] + px;
      const sheetY = tileWindow[1] + py;
      if (pointInPolygon2D([sheetX, sheetY], polygon)) continue;
      const i = (py * tileWidth + px) * 4;
      rgba[i] = 0;
      rgba[i + 1] = 0;
      rgba[i + 2] = 0;
      rgba[i + 3] = 0;
    }
  }
}
