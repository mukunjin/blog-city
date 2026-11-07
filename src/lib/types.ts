import type { Blog, Catalog } from "../../shared/blogs";

export type { Blog, Catalog };

export interface CityBuilding {
  /** instance index in the instanced mesh */
  i: number;
  blog: Blog;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** fraction of windows that are lit */
  lit: number;
  /** window columns per face */
  cols: number;
  /** deterministic 0..1 seed for window flicker */
  seed: number;
  color: string;
}

export interface CityLayout {
  buildings: CityBuilding[];
  extent: { minX: number; maxX: number; minZ: number; maxZ: number };
}
