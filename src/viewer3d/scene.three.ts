/**
 * The 3D scene of a product model: loading, framing and light. Imports
 * `three`, so it is only reached through the dynamic `import()` of
 * `Viewer3D` (the `bitsnap-react` main and catalog entries never reach it;
 * `test:package` checks that).
 */
import {
  Box3,
  MathUtils,
  PMREMGenerator,
  REVISION,
  Sphere,
  Vector3,
  type Object3D,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";

import { defaultDecoderPath } from "./constants";

const dracoLoaders = new Map<string, DRACOLoader>();

/** The Draco decoder path in effect: the caller's, else three's files on jsDelivr. */
export function resolveDecoderPath(decoderPath?: string): string {
  const path = decoderPath?.trim() || defaultDecoderPath(REVISION);
  return path.endsWith("/") ? path : `${path}/`;
}

/** A GLTF loader that decodes Draco and Meshopt. One Draco loader per decoder path. */
export function createGLTFLoader(decoderPath?: string): GLTFLoader {
  const path = resolveDecoderPath(decoderPath);
  let draco = dracoLoaders.get(path);
  if (draco == null) {
    draco = new DRACOLoader().setDecoderPath(path);
    dracoLoaders.set(path, draco);
  }
  return new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
}

/** Parses a downloaded GLB. */
export function parseGLB(buffer: ArrayBuffer, decoderPath?: string): Promise<GLTF> {
  return createGLTFLoader(decoderPath).parseAsync(buffer, "");
}

export type PreparedModel = {
  object: Object3D;
  /** Radius of the bounding sphere, after centring (model units). */
  radius: number;
  /** Size of the bounding box (x, y, z). */
  size: Vector3;
};

/**
 * Centres the model on the origin in x and z and stands it on y = 0, so the
 * contact shadow sits under it and the camera orbits its middle.
 */
export function prepareModel(object: Object3D): PreparedModel {
  object.position.set(0, 0, 0);
  object.updateMatrixWorld(true);
  const box = new Box3().setFromObject(object);
  if (box.isEmpty()) {
    return { object, radius: 1, size: new Vector3(1, 1, 1) };
  }
  const center = box.getCenter(new Vector3());
  object.position.set(-center.x, -box.min.y, -center.z);
  object.updateMatrixWorld(true);
  const size = box.getSize(new Vector3());
  const sphere = new Box3()
    .setFromObject(object)
    .getBoundingSphere(new Sphere());
  return { object, radius: Math.max(sphere.radius, 1e-3), size };
}

export type Framing = {
  position: Vector3;
  target: Vector3;
  distance: number;
};

/** Camera angles of the start view (and of the main "3q" thumbnail). */
export const START_VIEW = { azimuthDeg: 35, elevationDeg: 18 } as const;

/**
 * Where the camera stands so the whole model fits with a margin, seen from
 * `view` (azimuth around y, elevation above the horizon).
 */
export function frameModel(
  model: PreparedModel,
  fovDeg: number,
  aspect: number,
  view: { azimuthDeg: number; elevationDeg: number } = START_VIEW,
  margin = 1.18,
): Framing {
  const target = new Vector3(0, model.size.y / 2, 0);
  const vertical = MathUtils.degToRad(fovDeg) / 2;
  const horizontal = Math.atan(Math.tan(vertical) * Math.max(aspect, 0.1));
  const halfAngle = Math.min(vertical, horizontal);
  const distance = (model.radius / Math.sin(halfAngle)) * margin;
  const azimuth = MathUtils.degToRad(view.azimuthDeg);
  const elevation = MathUtils.degToRad(view.elevationDeg);
  const position = new Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  )
    .multiplyScalar(distance)
    .add(target);
  return { position, target, distance };
}

/** Points the camera along a framing and sets near/far planes for its size. */
export function applyFraming(
  camera: PerspectiveCamera,
  framing: Framing,
): void {
  camera.position.copy(framing.position);
  camera.near = Math.max(framing.distance / 200, 1e-4);
  camera.far = framing.distance * 50;
  camera.lookAt(framing.target);
  camera.updateProjectionMatrix();
}

/**
 * A neutral studio light for PBR materials, generated on the device (three's
 * `RoomEnvironment`); no HDR download (plan S13).
 */
export function createStudioEnvironment(renderer: WebGLRenderer): {
  texture: Texture;
  dispose: () => void;
} {
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  return { texture: target.texture, dispose: () => target.dispose() };
}
